/**
 * @file DynamicsScopeRenderer.js
 * @description FabFilter Pro-C 2-style TIME series for the DYNAMIC RANGE lab.
 *
 * This graph is COMPLEMENTARY to the static transfer curve (CompressorUI) —
 * it does NOT replace it. The transfer curve answers "where does a given input
 * level land?"; this answers "what is the signal doing right now, moment to
 * moment?". Both live side by side in the Dynamics panel.
 *
 * It behaves like a rolling OSCILLOSCOPE, so a drum hit reads as the actual
 * transient shape instead of a flat peak plateau:
 *   1. INPUT waveform — a scrolling min/max column graph of the pre-compressor
 *      (detector) signal. Each animation frame appends a few columns, each
 *      column storing the min and max of the newest samples, so the filled body
 *      between those two edges draws the true wave shape of a kick/snare/etc.
 *      An AUTO-NORMALISATION stage tracks the visible peak and lifts the trace
 *      to fill the plot, so quiet stems still read clearly; the amplitude axis
 *      labels follow that current reference level.
 *   2. A GAIN-REDUCTION ribbon — the amount of gain the compressor is currently
 *      pulling, hung from the top as an amber ribbon, so the clamp starting on a
 *      transient (attack) and letting go afterwards (release) becomes visible.
 *   3. A dashed THRESHOLD reference (when params are supplied), mapped to its
 *      linear amplitude so it brackets the waveform symmetrically.
 *
 * The module owns NO AudioContext. It reads samples through the injected
 * `engine` (`getPreTimeDomainData`, falling back to `getTimeDomainData`) and
 * receives DSP gain-reduction telemetry through `setTelemetry()`, which keeps
 * it safe to import and unit-test in Node (no window / canvas required for the
 * pure helpers).
 */

export const SCOPE_COLORS = Object.freeze({
    bg: '#0b0c10',
    grid: 'rgba(148, 163, 184, 0.12)',
    gridStrong: 'rgba(148, 163, 184, 0.30)',
    env: '#38bdf8',                        // input waveform (blue)
    envFill: 'rgba(56, 189, 248, 0.20)',
    envPeak: 'rgba(125, 211, 252, 0.55)',
    gr: '#fbbf24',                         // gain reduction (amber)
    grFill: 'rgba(251, 191, 36, 0.22)',
    grEdge: 'rgba(251, 191, 36, 0.85)',
    threshold: 'rgba(226, 232, 240, 0.55)',
    text: 'rgba(226, 232, 240, 0.78)',
    textDim: 'rgba(148, 163, 184, 0.85)'
});

/** Level axis: 0 dBFS (top) down to -SCOPE_LEVEL_RANGE_DB (bottom). */
export const SCOPE_LEVEL_RANGE_DB = 60;

/**
 * Horizontal resolution of the scrolling waveform (one column per sample span).
 * Raised from 720 to 2880 so the amber gain-reduction ribbon is drawn with 4×
 * finer columns — the old value made the ribbon read as a coarse staircase.
 */
export const SCOPE_COLUMNS = 2880;

/**
 * Columns appended per animation frame. Scaled together with SCOPE_COLUMNS
 * (16 ≈ 60 fps → ~3 s of history) to keep the same time window while sharpening
 * the horizontal resolution of the trace.
 */
export const SCOPE_COLS_PER_FRAME = 16;

/** Gain-reduction ribbon full-scale in dB (0 at the top → this at the bottom). */
export const SCOPE_GR_RANGE_DB = 24;

/** Auto-normalisation: maximum display boost (linear), +26 dB. */
export const SCOPE_MAX_GAIN = 20;

/** Auto-normalisation: how much of the half plot the visible peak should fill. */
export const SCOPE_HEADROOM = 0.92;

/** Auto-normalisation: fast when the signal grows louder… */
export const SCOPE_GAIN_ATTACK = 0.25;

/** Auto-normalisation: …slow when it falls back down (avoids pumping). */
export const SCOPE_GAIN_RELEASE = 0.05;

/** Auto-normalisation: below this peak (≈ -34 dBFS) the gain is left untouched. */
export const SCOPE_MIN_PEAK = 0.02;

/**
 * Meter ballistics for the numeric readout. A raw per-frame peak swings with
 * every sample ("los números avanzan a la velocidad de las muestras") and is
 * unreadable. Commercial meters (FabFilter Pro-C 2, iZotope, etc.) instead
 * INTEGRATE the signal and LATCH the peak, so we do the same:
 *   • ENTRADA = RMS of the input window, integrated with a ~300 ms time constant
 *     (the classic VU / Leq average) — steady and perceptual, not sample-accurate.
 *   • MÁX     = loudest true peak reached since the scope started, kept FROZEN
 *     (it never decays): a stable didactic reference for how hard the signal hit,
 *     read as a pair with the live meter right above it.
 *   • GR      = gain reduction averaged over the same window, with its own FROZEN
 *     maximum (MÁX GR, never decays) so the deepest clamp stays readable long
 *     enough to set make-up gain against.
 * The numeric LABELS additionally refresh at SCOPE_TEXT_HZ (not 60 fps) so the
 * digits stop flickering even while the waveform animates smoothly.
 * Every time constant is in real seconds (dt-based) → identical at 30/60/144 fps.
 */
export const SCOPE_RMS_SECONDS = 0.3;        // RMS integration window (~300 ms)
export const SCOPE_GR_SECONDS = 0.25;        // GR averaging window
export const SCOPE_TEXT_HZ = 6;              // numeric-label refresh rate (anti-flicker)

/** Readout floor: below this the meter shows a dash instead of a noisy number. */
export const SCOPE_METER_FLOOR_DB = -SCOPE_LEVEL_RANGE_DB;

/**
 * Linear amplitude -> dBFS, clamped to `floorDb` (silence-safe).
 * @param {number} amp
 * @param {number} [floorDb]
 * @returns {number}
 */
export function ampToDb(amp, floorDb = -SCOPE_LEVEL_RANGE_DB) {
    const a = Math.abs(Number(amp));
    if (!Number.isFinite(a) || a <= 1e-6) return floorDb;
    const db = 20 * Math.log10(a);
    return db < floorDb ? floorDb : db;
}

/**
 * dBFS -> linear amplitude (silence-safe, non-finite -> 0).
 * @param {number} db
 * @returns {number}
 */
export function dbToAmp(db) {
    const d = Number(db);
    if (!Number.isFinite(d)) return 0;
    return Math.pow(10, d / 20);
}

/**
 * Peak (max |sample|) of a time-domain window -> dBFS.
 * @param {Float32Array|number[]} data
 * @param {number} [floorDb]
 * @returns {number}
 */
export function peakToDb(data, floorDb = -SCOPE_LEVEL_RANGE_DB) {
    if (!data || !data.length) return floorDb;
    let peak = 0;
    for (let i = 0; i < data.length; i += 1) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
    }
    return ampToDb(peak, floorDb);
}

/**
 * RMS amplitude (√mean(x²)) of a time-domain window. This is the "average"
 * reading commercial level meters show — far steadier than the peak.
 * @param {Float32Array|number[]} data
 * @returns {number} RMS in linear amplitude
 */
export function rmsAmp(data) {
    if (!data || !data.length) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
        const v = data[i];
        sum += v * v;
    }
    return Math.sqrt(sum / data.length);
}

/**
 * RMS (√mean(x²)) of a time-domain window -> dBFS (silence-safe).
 * @param {Float32Array|number[]} data
 * @param {number} [floorDb]
 * @returns {number}
 */
export function rmsToDb(data, floorDb = -SCOPE_LEVEL_RANGE_DB) {
    return ampToDb(rmsAmp(data), floorDb);
}

/**
 * Maps a level in dBFS (0 .. -rangeDb) to a Y pixel inside the plot.
 * 0 dBFS sits at `top`, -rangeDb at `top + height`.
 * @param {number} db
 * @param {number} top
 * @param {number} height
 * @param {number} [rangeDb]
 * @returns {number}
 */
export function levelToY(db, top, height, rangeDb = SCOPE_LEVEL_RANGE_DB) {
    const d = Number(db);
    const clamped = Math.max(-rangeDb, Math.min(0, Number.isFinite(d) ? d : -rangeDb));
    return top + (-clamped / rangeDb) * height;
}

/**
 * Maps a signed waveform amplitude (-1 .. 1) to a Y pixel, centred on the plot
 * so the waveform is drawn symmetrically around the zero line.
 * @param {number} amp
 * @param {number} top
 * @param {number} height
 * @param {number} [zoom] 1 = full-scale spans the whole plot height
 * @returns {number}
 */
export function ampToY(amp, top, height, zoom = 1) {
    const mid = top + height / 2;
    const a = Number.isFinite(amp) ? Math.max(-1, Math.min(1, Number(amp))) : 0;
    return mid - a * (height / 2) * zoom;
}

/**
 * Maps a gain-reduction amount in dB (0 .. rangeDb, positive = reduction) to Y.
 * 0 dB reduction sits at `top`, `rangeDb` at `top + height`.
 * @param {number} grDb
 * @param {number} top
 * @param {number} height
 * @param {number} [rangeDb]
 * @returns {number}
 */
export function grToY(grDb, top, height, rangeDb = SCOPE_GR_RANGE_DB) {
    const g = Math.abs(Number(grDb));
    const clamped = Math.max(0, Math.min(rangeDb, Number.isFinite(g) ? g : 0));
    return top + (clamped / rangeDb) * height;
}

/**
 * Pushes a value into a Float32Array used as a rolling strip (shift left, newest
 * at the last index). Non-finite values are stored as 0.
 * @param {Float32Array} arr
 * @param {number} value
 */
export function pushHistory(arr, value) {
    if (!arr || !arr.length) return;
    arr.copyWithin(0, 1);
    arr[arr.length - 1] = Number.isFinite(value) ? value : 0;
}

export class DynamicsScopeRenderer {
    /**
     * @param {object} opts
     * @param {HTMLCanvasElement} opts.canvas
     * @param {object} opts.engine  AudioEngine (needs getPreTimeDomainData / getTimeDomainData)
     * @param {() => object} [opts.getTelemetry] optional pull accessor
     * @param {() => object} [opts.getParams] optional params accessor (thresholdDb)
     */
    constructor({ canvas = null, engine = null, getTelemetry = null, getParams = null } = {}) {
        this.canvas = canvas;
        this.engine = engine;
        this.getTelemetry = (typeof getTelemetry === 'function') ? getTelemetry : null;
        this.getParams = (typeof getParams === 'function') ? getParams : null;

        this.running = false;
        this.rafId = null;

        this.telemetry = { grDb: 0, inDb: -Infinity, outDb: -Infinity, style: 'vca' };

        // Scrolling oscilloscope strips: per-column min/max of the input wave and
        // the gain reduction active when that column was captured.
        this.waveMin = new Float32Array(SCOPE_COLUMNS);
        this.waveMax = new Float32Array(SCOPE_COLUMNS);
        this.grCols = new Float32Array(SCOPE_COLUMNS);
        this.historyLen = 0;
        this._lastGrCol = 0;           // previous frame's |GR| (ribbon interpolation)

        // Auto-normalisation gain applied to the waveform (>= 1).
        this.displayGain = 1;

        this.inputBuf = null;

        // Meter ballistics state for the numeric readout (time-based, so it is
        // frame-rate independent: 30 / 60 / 144 fps behave identically).
        this.meterMs = 0;              // running mean square power for the RMS readout
        this.meterDb = -Infinity;      // integrated RMS level shown as ENTRADA
        this.maxPeakDb = -Infinity;    // FROZEN max true peak reached (never decays)
        this.grSmoothDb = 0;           // averaged gain-reduction readout
        this.maxGrDb = 0;              // FROZEN max gain reduction reached (never decays)
        this._lastFrameMs = 0;         // rAF timestamp of the previous frame (dt)

        // Throttled numeric labels (anti-flicker): the digits refresh at
        // SCOPE_TEXT_HZ while the graph keeps animating at display rate.
        this._textAccumMs = 0;
        this.dispInDb = -Infinity;
        this.dispMaxDb = -Infinity;
        this.dispGrDb = 0;
        this.dispMaxGrDb = 0;

        this.cssW = 960;
        this.cssH = 168;

        this._loop = this._loop.bind(this);
        this._resizeObserver = null;
        if (typeof ResizeObserver !== 'undefined' && this.canvas) {
            this._resizeObserver = new ResizeObserver(() => this.resize());
            this._resizeObserver.observe(this.canvas);
        }
        this.resize();
    }

    get available() {
        if (!this.canvas || !this.canvas.getContext || !this.engine) return false;
        return typeof this.engine.getPreTimeDomainData === 'function'
            || typeof this.engine.getTimeDomainData === 'function';
    }

    _ctx() {
        if (!this.canvas || typeof this.canvas.getContext !== 'function') return null;
        try { return this.canvas.getContext('2d'); } catch (_) { return null; }
    }

    resize() {
        if (!this.canvas || typeof window === 'undefined') return;
        const dpr = window.devicePixelRatio || 1;
        let w = this.cssW;
        let h = this.cssH;
        if (typeof this.canvas.getBoundingClientRect === 'function') {
            const rect = this.canvas.getBoundingClientRect();
            if (rect && rect.width > 1) w = rect.width;
            if (rect && rect.height > 1) h = rect.height;
        }
        this.cssW = w;
        this.cssH = h;
        this.canvas.width = Math.max(1, Math.round(w * dpr));
        this.canvas.height = Math.max(1, Math.round(h * dpr));
        const ctx = this._ctx();
        if (ctx && typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** Clears the rolling strip so a fresh surface does not show stale traces. */
    reset() {
        this.waveMin.fill(0);
        this.waveMax.fill(0);
        this.grCols.fill(0);
        this.historyLen = 0;
        this._lastGrCol = 0;
        this.displayGain = 1;
        this.meterMs = 0;
        this.meterDb = -Infinity;
        this.maxPeakDb = -Infinity;
        this.grSmoothDb = 0;
        this.maxGrDb = 0;
        this._lastFrameMs = 0;
        this._textAccumMs = 0;
        this.dispInDb = -Infinity;
        this.dispMaxDb = -Infinity;
        this.dispGrDb = 0;
        this.dispMaxGrDb = 0;
        this.telemetry = { grDb: 0, inDb: -Infinity, outDb: -Infinity, style: 'vca' };
    }

    start() {
        if (!this.available) return;
        this.reset();
        if (this.running || typeof requestAnimationFrame !== 'function') return;
        this.running = true;
        this.rafId = requestAnimationFrame(this._loop);
    }

    stop() {
        this.running = false;
        if (this.rafId != null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.rafId);
        }
        this.rafId = null;
    }

    destroy() {
        this.stop();
        if (this._resizeObserver) this._resizeObserver.disconnect();
        this._resizeObserver = null;
        this.engine = null;
        this.canvas = null;
        this.inputBuf = null;
    }

    /** Receives the DSP telemetry {grDb,inDb,outDb,style}. */
    setTelemetry(data) {
        if (!data) return;
        if (typeof data.grDb === 'number' && Number.isFinite(data.grDb)) this.telemetry.grDb = data.grDb;
        if (typeof data.inDb === 'number') this.telemetry.inDb = data.inDb;
        if (typeof data.outDb === 'number') this.telemetry.outDb = data.outDb;
        if (data.style) this.telemetry.style = data.style;
    }

    _loop() {
        if (!this.running) return;
        try { this.draw(); } catch (_) { /* never break the rAF loop */ }
        if (this.running) this.rafId = requestAnimationFrame(this._loop);
    }

    /**
     * Reads the pre-compressor time-domain window into `this.inputBuf`.
     * Falls back to the post (wet) buffer when no pre analyser is wired.
     * @returns {boolean} true when a buffer was filled
     */
    _readInput() {
        const engine = this.engine;
        if (!engine) return false;
        const len = (typeof engine.timeDomainLength === 'number' && engine.timeDomainLength > 0)
            ? engine.timeDomainLength : 2048;
        if (!this.inputBuf || this.inputBuf.length !== len) this.inputBuf = new Float32Array(len);

        let ok = false;
        if (typeof engine.getPreTimeDomainData === 'function') {
            try { engine.getPreTimeDomainData(this.inputBuf); ok = true; } catch (_) { /* ignore */ }
        }
        if (!ok && typeof engine.getTimeDomainData === 'function') {
            try { engine.getTimeDomainData(this.inputBuf); ok = true; } catch (_) { /* ignore */ }
        }
        return ok;
    }

    /**
     * Appends the newest slice of samples as min/max columns, so the surface
     * scrolls roughly 1:1 with real time instead of smearing overlapping windows.
     */
    _advanceStrip() {
        const buf = this.inputBuf;
        if (!buf || !buf.length) return;
        const engine = this.engine;
        const sr = (engine && typeof engine.sampleRateHz === 'number' && engine.sampleRateHz > 0)
            ? engine.sampleRateHz : 48000;

        const perFrame = Math.max(SCOPE_COLS_PER_FRAME, Math.round(sr / 60));
        const use = Math.min(buf.length, perFrame);
        const base = buf.length - use;   // newest `use` samples
        const cols = SCOPE_COLS_PER_FRAME;
        const span = Math.max(1, Math.floor(use / cols));

        // Interpolate the gain-reduction ribbon ACROSS the columns appended this
        // frame (previous |GR| -> current |GR|) instead of writing a single value
        // `cols` times. The old per-frame constant made the amber curve read as a
        // coarse staircase; ramping it yields a continuous, high-resolution edge.
        const grNow = Math.abs(Number(this.telemetry.grDb) || 0);
        const grPrev = Number.isFinite(this._lastGrCol) ? this._lastGrCol : grNow;

        for (let c = 0; c < cols; c += 1) {
            const from = base + c * span;
            const to = (c === cols - 1) ? buf.length : Math.min(buf.length, from + span);
            let mn = 0;
            let mx = 0;
            for (let i = from; i < to; i += 1) {
                const v = buf[i];
                if (v < mn) mn = v;
                if (v > mx) mx = v;
            }
            pushHistory(this.waveMin, mn);
            pushHistory(this.waveMax, mx);
            const t = (c + 1) / cols;
            pushHistory(this.grCols, grPrev + (grNow - grPrev) * t);
        }
        this._lastGrCol = grNow;
        this.historyLen = Math.min(SCOPE_COLUMNS, this.historyLen + cols);
    }

    /** Largest |sample| among the columns currently visible. */
    _visiblePeak() {
        const n = Math.max(2, this.historyLen);
        const start = SCOPE_COLUMNS - n;
        let peak = 0;
        for (let i = 0; i < n; i += 1) {
            const gi = start + i;
            const a = Math.abs(this.waveMin[gi]);
            const b = Math.abs(this.waveMax[gi]);
            if (a > peak) peak = a;
            if (b > peak) peak = b;
        }
        return peak;
    }

    /**
     * Tracks the auto-normalisation gain so the visible peak fills the plot.
     * Fast to come up (transient), slow to fall away (no pumping), and it holds
     * steady through near-silence so noise is never blown up.
     * @returns {number} gain >= 1
     */
    _updateDisplayGain() {
        const peak = this._visiblePeak();
        let target = this.displayGain;
        if (peak >= SCOPE_MIN_PEAK) {
            target = Math.min(SCOPE_MAX_GAIN, Math.max(1, SCOPE_HEADROOM / peak));
        }
        const k = target > this.displayGain ? SCOPE_GAIN_ATTACK : SCOPE_GAIN_RELEASE;
        this.displayGain += (target - this.displayGain) * k;
        if (!Number.isFinite(this.displayGain) || this.displayGain < 1) this.displayGain = 1;
        return this.displayGain;
    }

    /**
     * Advances the numeric-meter ballistics from the newest input block, in a
     * frame-rate-independent way (dt in seconds):
     *   • ENTRADA = RMS of the block, integrated with SCOPE_RMS_SECONDS — the
     *     steady "average" a commercial meter shows, immune to per-sample flicker.
     *   • MÁX     = the loudest true peak seen so far, LATCHED and FROZEN (no
     *     decay): a fixed reference of how hard the signal ever hit, so the
     *     student can judge threshold/headroom against a stable number.
     * @param {number} blockMs mean square (power) of the input block
     * @param {number} blockPeakDb instantaneous peak of the block (dBFS)
     * @param {number} dt seconds since the previous frame
     * @returns {number} the integrated RMS level in dBFS
     */
    _updateMeter(blockMs, blockPeakDb, dt) {
        const step = (Number.isFinite(dt) && dt > 0) ? Math.min(0.25, dt) : (1 / 60);

        // 1) Exponential RMS integration: mean square -> RMS -> dBFS.
        const aRms = 1 - Math.exp(-step / SCOPE_RMS_SECONDS);
        const power = (Number.isFinite(blockMs) && blockMs > 0) ? blockMs : 0;
        this.meterMs += (power - this.meterMs) * aRms;
        this.meterDb = ampToDb(this.meterMs > 1e-12 ? Math.sqrt(this.meterMs) : 0, SCOPE_METER_FLOOR_DB);

        // 2) Frozen max: latch the loudest true peak, never release it.
        const pk = Number.isFinite(blockPeakDb) ? blockPeakDb : SCOPE_METER_FLOOR_DB;
        if (pk > this.maxPeakDb) this.maxPeakDb = pk;
        return this.meterDb;
    }

    draw() {
        const ctx = this._ctx();
        if (!ctx) return;

        // Frame delta (seconds) so every ballistic is frame-rate independent.
        const nowMs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now() : Date.now();
        let dt = this._lastFrameMs ? (nowMs - this._lastFrameMs) / 1000 : (1 / 60);
        this._lastFrameMs = nowMs;
        if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
        if (dt > 0.25) dt = 0.25;   // tab was backgrounded — don't lurch on return

        if (this._readInput()) {
            this._advanceStrip();
            const buf = this.inputBuf;
            let sum = 0;
            for (let i = 0; i < buf.length; i += 1) {
                const v = buf[i];
                sum += v * v;
            }
            const blockMs = buf.length ? sum / buf.length : 0;
            this._updateMeter(blockMs, peakToDb(buf, SCOPE_METER_FLOOR_DB), dt);
        }

        const g = this._updateDisplayGain();

        // GR averaging: exponential, fast to show a clamp, slow to release it.
        const grRaw = Math.abs(Number(this.telemetry.grDb) || 0);
        const aGr = 1 - Math.exp(-dt / SCOPE_GR_SECONDS);
        this.grSmoothDb += (grRaw - this.grSmoothDb) * aGr;

        // Frozen max gain reduction: latch the deepest clamp seen and never
        // release it — a stable number to set make-up gain against (the GR
        // counterpart of the frozen input MÁX). Latched from the smoothed value so
        // a one-sample telemetry spike cannot peg it.
        if (this.grSmoothDb > this.maxGrDb) this.maxGrDb = this.grSmoothDb;

        // Anti-flicker: the digits refresh at SCOPE_TEXT_HZ, not at 60 fps, so the
        // number is readable while the waveform keeps animating smoothly.
        this._textAccumMs += dt * 1000;
        if (this._textAccumMs >= (1000 / SCOPE_TEXT_HZ)) {
            this._textAccumMs = 0;
            this.dispInDb = this.meterDb;
            this.dispMaxDb = this.maxPeakDb;
            this.dispGrDb = this.grSmoothDb;
            this.dispMaxGrDb = this.maxGrDb;
        }

        const W = this.cssW || 960;
        const H = this.cssH || 168;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = SCOPE_COLORS.bg;
        ctx.fillRect(0, 0, W, H);

        const padL = 34;
        const padR = 12;
        const padT = 10;
        const padB = 14;
        const plotW = Math.max(10, W - padL - padR);
        const plotH = Math.max(10, H - padT - padB);

        this._drawGrid(ctx, padL, padT, plotW, plotH, g);
        this._drawWaveform(ctx, padL, padT, plotW, plotH, g);
        this._drawGainReduction(ctx, padL, padT, plotW, plotH);
        this._drawThreshold(ctx, padL, padT, plotW, plotH, g);
        this._drawReadout(ctx, W, H, padL, padT, plotW, plotH, g);
    }

    /** X for a strip slot: oldest at the left edge, newest at the right. */
    _xFor(i, padL, plotW) {
        return padL + (i / (SCOPE_COLUMNS - 1)) * plotW;
    }

    /**
     * Amplitude grid. Lines sit at fixed screen fractions (±1 / ±0.5 / ±0.25 of
     * the half-plot) but their dBFS labels follow the current auto-gain, so the
     * top of the plot always reads as the reference level it currently shows.
     */
    _drawGrid(ctx, padL, padT, plotW, plotH, g) {
        const refDb = 20 * Math.log10(1 / g);   // dBFS of the plot's top edge
        // Fixed SCREEN fractions (amp 1 / 0.5 / 0.25 of the half-plot) so the lines
        // NEVER move or bunch together; only their dBFS labels track the auto-gain.
        // (Dividing by `g` here collapsed the lines toward the centre as the gain
        // rose, overlapping their numbers into an unreadable smear.)
        const marks = [
            [refDb, 1],
            [refDb - 6, 0.5],
            [refDb - 12, 0.25]
        ];

        ctx.save();
        ctx.strokeStyle = SCOPE_COLORS.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const [, amp] of marks) {
            for (const s of [1, -1]) {
                const y = ampToY(s * amp, padT, plotH) + 0.5;
                ctx.moveTo(padL, y);
                ctx.lineTo(padL + plotW, y);
            }
        }
        for (let k = 1; k < 4; k += 1) {
            const x = padL + (plotW / 4) * k + 0.5;
            ctx.moveTo(x, padT);
            ctx.lineTo(x, padT + plotH);
        }
        ctx.stroke();

        // Strong zero line = the waveform's rest position.
        const cy = ampToY(0, padT, plotH) + 0.5;
        ctx.strokeStyle = SCOPE_COLORS.gridStrong;
        ctx.beginPath();
        ctx.moveTo(padL, cy);
        ctx.lineTo(padL + plotW, cy);
        ctx.stroke();

        // dBFS labels mapped onto the current (auto-normalised) amplitude axis.
        ctx.fillStyle = SCOPE_COLORS.textDim;
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (const [db, amp] of marks) {
            ctx.fillText(String(Math.round(db)), padL - 4, ampToY(amp, padT, plotH));
        }

        ctx.strokeStyle = SCOPE_COLORS.gridStrong;
        ctx.strokeRect(padL, padT, plotW, plotH);
        ctx.restore();
    }

    /** Filled min/max body + bright edges = a recognisable waveform shape. */
    _drawWaveform(ctx, padL, padT, plotW, plotH, g) {
        const n = Math.max(2, this.historyLen);
        const start = SCOPE_COLUMNS - n;
        const mn = this.waveMin;
        const mx = this.waveMax;

        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < n; i += 1) {
            const gi = start + i;
            const x = this._xFor(gi, padL, plotW);
            const y = ampToY(mx[gi] * g, padT, plotH);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        for (let i = n - 1; i >= 0; i -= 1) {
            const gi = start + i;
            const x = this._xFor(gi, padL, plotW);
            ctx.lineTo(x, ampToY(mn[gi] * g, padT, plotH));
        }
        ctx.closePath();
        ctx.fillStyle = SCOPE_COLORS.envFill;
        ctx.fill();

        ctx.strokeStyle = SCOPE_COLORS.env;
        ctx.lineWidth = 1.2;
        ctx.lineJoin = 'round';

        ctx.beginPath();
        for (let i = 0; i < n; i += 1) {
            const gi = start + i;
            const x = this._xFor(gi, padL, plotW);
            const y = ampToY(mx[gi] * g, padT, plotH);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i < n; i += 1) {
            const gi = start + i;
            const x = this._xFor(gi, padL, plotW);
            const y = ampToY(mn[gi] * g, padT, plotH);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Gain-reduction overlay: an amber ribbon hanging from the top, its depth =
     * how much gain the compressor is currently removing.
     */
    _drawGainReduction(ctx, padL, padT, plotW, plotH) {
        const n = Math.max(2, this.historyLen);
        const start = SCOPE_COLUMNS - n;
        const h = this.grCols;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(this._xFor(start, padL, plotW), padT);
        for (let i = 0; i < n; i += 1) {
            const gi = start + i;
            ctx.lineTo(this._xFor(gi, padL, plotW), grToY(h[gi], padT, plotH));
        }
        ctx.lineTo(this._xFor(start + n - 1, padL, plotW), padT);
        ctx.closePath();
        ctx.fillStyle = SCOPE_COLORS.grFill;
        ctx.fill();

        // Bright lower edge so the "depth of reduction" reads even over the fill.
        ctx.beginPath();
        for (let i = 0; i < n; i += 1) {
            const gi = start + i;
            const x = this._xFor(gi, padL, plotW);
            const y = grToY(h[gi], padT, plotH);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = SCOPE_COLORS.grEdge;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Dashed threshold reference. The threshold is a dBFS level, mapped to its
     * linear amplitude and drawn with the same auto-gain as the waveform, so the
     * two symmetric lines bracket it correctly.
     */
    _drawThreshold(ctx, padL, padT, plotW, plotH, g) {
        let params = null;
        try { params = this.getParams ? this.getParams() : null; } catch (_) { params = null; }
        const t = params ? Number(params.thresholdDb) : NaN;
        if (!Number.isFinite(t)) return;
        const amp = dbToAmp(t);
        if (amp <= 0) return;

        ctx.save();
        ctx.strokeStyle = SCOPE_COLORS.threshold;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const s of [1, -1]) {
            const y = ampToY(s * amp * g, padT, plotH) + 0.5;
            ctx.moveTo(padL, y);
            ctx.lineTo(padL + plotW, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = SCOPE_COLORS.textDim;
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`umbral ${t.toFixed(0)} dB`, padL + plotW - 4, ampToY(amp * g, padT, plotH) - 2);
        ctx.restore();
    }

    /**
     * Numeric readout with PRO ballistics. Renders the THROTTLED display values so
     * the digits hold still: ENTRADA is the integrated RMS (the "average" a
     * commercial meter shows) and MÁX its FROZEN loudest true peak; GR is the
     * averaged reduction and MÁX GR its FROZEN deepest clamp. Each live value sits
     * directly above its frozen maximum, so the level column (left) and the
     * reduction column (right) each read as a readable "now vs. peak" pair.
     */
    _drawReadout(ctx, W, H, padL, padT, plotW, plotH, g) {
        const gr = this.dispGrDb;
        const maxGr = this.dispMaxGrDb;
        const inDb = this.dispInDb;
        const maxDb = this.dispMaxDb;
        ctx.save();
        ctx.font = '9px monospace';

        // Live instantaneous meter (integrated RMS) — top-left.
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = SCOPE_COLORS.env;
        const inTxt = (Number.isFinite(inDb) && inDb > SCOPE_METER_FLOOR_DB + 0.05)
            ? `ENTRADA RMS ${inDb.toFixed(1)} dBFS`
            : 'ENTRADA RMS −∞';
        ctx.fillText(inTxt, padL + 4, padT + 3);

        // FROZEN maximum level reached — pinned right under the live meter.
        const maxTxt = (Number.isFinite(maxDb) && maxDb > SCOPE_METER_FLOOR_DB + 0.05)
            ? `MÁX ${maxDb.toFixed(1)} dBFS`
            : 'MÁX −∞';
        ctx.fillStyle = SCOPE_COLORS.envPeak;
        ctx.fillText(maxTxt, padL + 4, padT + 14);

        // Live gain reduction (averaged) + its FROZEN maximum — top-right column,
        // mirroring the level readout so the deepest clamp is always legible.
        ctx.textAlign = 'right';
        ctx.fillStyle = SCOPE_COLORS.gr;
        ctx.fillText((gr > 0.05 ? 'GR −' : 'GR ') + gr.toFixed(1) + ' dB', padL + plotW - 4, padT + 3);
        const maxGrTxt = (Number.isFinite(maxGr) && maxGr > 0.05)
            ? `MÁX GR −${maxGr.toFixed(1)} dB`
            : 'MÁX GR 0.0 dB';
        ctx.fillStyle = SCOPE_COLORS.grEdge;
        ctx.fillText(maxGrTxt, padL + plotW - 4, padT + 14);

        if (g > 1.05) {
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = SCOPE_COLORS.textDim;
            ctx.fillText(`auto ×${g.toFixed(1)}`, padL + plotW - 4, padT + plotH - 3);
        }
        ctx.restore();
    }
}
