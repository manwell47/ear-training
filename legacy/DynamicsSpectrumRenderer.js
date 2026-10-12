/**
 * @file DynamicsSpectrumRenderer.js
 * @description Real-time "dry vs compressed" spectrum overlay for the Dynamic
 * Range didactic lab (WS-L / E3).
 *
 * The engine already taps the signal twice: `preAnalyser` sits BEFORE the
 * dynamics insert (dry) and `analyser` sits AFTER it (compressed). This module
 * turns those two byte spectra into a single, honest picture:
 *   1. the DRY envelope (before the compressor) as a translucent filled area,
 *   2. the COMPRESSED envelope (after) as a bright line on top,
 *   3. a red "attenuation" highlight for every band the compressor pulled down,
 * which is exactly the "envolvente del espectro siendo atenuado en tiempo real"
 * the pivot asked for.
 *
 * The module is import-safe under Node: it never touches the DOM at module
 * scope. The canvas and the engine (any object exposing `getFFTData` /
 * `getPreFFTData` plus AnalyserNodes) are injected by the caller, and the pure
 * mapping helpers below are unit-testable without a browser.
 */

/** Palette shared with the rest of the lab chrome. */
export const SPECTRUM_COLORS = Object.freeze({
    dry: 'rgba(56, 189, 248, 0.22)',   // signal BEFORE the compressor
    dryLine: 'rgba(125, 211, 252, 0.85)',
    wet: '#f59e0b',                    // signal AFTER the compressor
    attenuation: 'rgba(239, 68, 68, 0.85)',
    grid: 'rgba(148, 163, 184, 0.16)',
    axis: 'rgba(226, 232, 240, 0.55)',
    text: 'rgba(226, 232, 240, 0.72)'
});

/** Default axes: musical range, clipped well above the analyser's -140 floor. */
export const SPECTRUM_RANGE = Object.freeze({
    minF: 30,
    maxF: 18000,
    minDb: -96,
    maxDb: 0
});

/** Log-spaced frequency ticks drawn as vertical gridlines. */
export const SPECTRUM_GRID_HZ = Object.freeze([100, 1000, 10000]);

/** Analyser byte range (matches AudioEngine.minDecibels/maxDecibels). */
const ANALYSER_MIN_DB = -140;
const ANALYSER_MAX_DB = 0;

/**
 * Maps a frequency to an x pixel using a log (octave-linear) scale.
 * @param {number} freq
 * @param {number} width
 * @param {number} [minF]
 * @param {number} [maxF]
 * @returns {number}
 */
export function frequencyToX(freq, width, minF = SPECTRUM_RANGE.minF, maxF = SPECTRUM_RANGE.maxF) {
    const f = Math.max(minF, Math.min(maxF, freq));
    const a = Math.log10(minF);
    const b = Math.log10(maxF);
    return ((Math.log10(f) - a) / (b - a)) * width;
}

/**
 * Converts an AnalyserNode byte (0..255) to dB SPL-relative.
 * @param {number} byte
 * @param {number} [minDb]
 * @param {number} [maxDb]
 * @returns {number}
 */
export function byteToDb(byte, minDb = ANALYSER_MIN_DB, maxDb = ANALYSER_MAX_DB) {
    const b = Math.max(0, Math.min(255, byte));
    return minDb + (b / 255) * (maxDb - minDb);
}

/**
 * Maps a dB value to a y pixel (0 = top, `height` = bottom).
 * @param {number} db
 * @param {number} height
 * @param {number} [minDb]
 * @param {number} [maxDb]
 * @returns {number}
 */
export function dbToY(db, height, minDb = SPECTRUM_RANGE.minDb, maxDb = SPECTRUM_RANGE.maxDb) {
    const d = Math.max(minDb, Math.min(maxDb, db));
    return height - ((d - minDb) / (maxDb - minDb)) * height;
}

/**
 * Resamples a raw analyser byte array into `points` log-spaced envelope points.
 * Pure and deterministic, which makes it directly unit-testable.
 * @param {Uint8Array|number[]} data
 * @param {object} [opts]
 * @param {number} [opts.sampleRate]
 * @param {number} [opts.fftSize]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {number} [opts.points]
 * @param {number} [opts.minF]
 * @param {number} [opts.maxF]
 * @param {number} [opts.minDb]
 * @param {number} [opts.maxDb]
 * @returns {Array<{x:number,y:number,freq:number,db:number}>}
 */
export function sampleEnvelope(data, opts = {}) {
    const width = opts.width ?? 400;
    const height = opts.height ?? 120;
    const sampleRate = opts.sampleRate ?? 48000;
    const minF = opts.minF ?? SPECTRUM_RANGE.minF;
    const maxF = opts.maxF ?? SPECTRUM_RANGE.maxF;
    const minDb = opts.minDb ?? SPECTRUM_RANGE.minDb;
    const maxDb = opts.maxDb ?? SPECTRUM_RANGE.maxDb;
    const points = Math.max(2, opts.points ?? 96);
    const len = (data && data.length) || 0;
    if (!len) return [];

    // The engine's taps (getFFTData / getPreFFTData) fill a Float32Array with dB
    // values (AnalyserNode.getFloatFrequencyData), while the unit tests exercise
    // the byte path with a Uint8Array. Support both transparently.
    const isFloat = (typeof Float32Array !== 'undefined') && (data instanceof Float32Array);

    const fftSize = opts.fftSize ?? len * 2;
    const binHz = sampleRate / fftSize;
    const ratio = maxF / minF;
    const out = [];

    for (let i = 0; i < points; i++) {
        const t = i / (points - 1);
        const freq = minF * Math.pow(ratio, t);
        let bin = Math.round(freq / binHz);
        bin = Math.max(0, Math.min(len - 1, bin));
        const raw = data[bin];
        const db = isFloat
            ? (Number.isFinite(raw) ? raw : minDb) // -Infinity/NaN => floor
            : byteToDb(raw);
        out.push({ x: t * width, y: dbToY(db, height, minDb, maxDb), freq, db });
    }
    return out;
}

/**
 * Renders the two envelopes (and their difference) onto a canvas at 60 FPS.
 * Construct with the canvas + the AudioEngine instance; call start()/stop().
 */
export class DynamicsSpectrumRenderer {
    /**
     * @param {object} opts
     * @param {HTMLCanvasElement} opts.canvas
     * @param {object} opts.engine AudioEngine (needs analyser/preAnalyser + getFFTData/getPreFFTData)
     */
    constructor({ canvas, engine } = {}) {
        this.canvas = canvas || null;
        this.engine = engine || null;
        this.ctx = null;
        this.running = false;
        this._raf = null;
        this._dry = null;
        this._wet = null;
        this.width = (canvas && canvas.width) || 480;
        this.height = (canvas && canvas.height) || 132;
    }

    /** @returns {boolean} whether the engine exposes both analysers + taps. */
    get available() {
        const e = this.engine;
        return !!(this.canvas && e && e.analyser && e.preAnalyser &&
            typeof e.getFFTData === 'function' && typeof e.getPreFFTData === 'function');
    }

    resize() {
        if (!this.canvas) return;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }

    start() {
        if (this.running || !this.available) return;
        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) return;
        this.running = true;
        this.resize();
        const loop = () => {
            if (!this.running) return;
            this._read();
            this.draw();
            this._raf = requestAnimationFrame(loop);
        };
        this._raf = requestAnimationFrame(loop);
    }

    stop() {
        this.running = false;
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    }

    destroy() {
        this.stop();
        this.ctx = null;
    }

    /** Pulls a fresh dry + wet spectrum from the engine (float dB spectra). */
    _read() {
        const e = this.engine;
        if (!e || !e.analyser || !e.preAnalyser) return false;
        const nWet = e.analyser.frequencyBinCount;
        const nDry = e.preAnalyser.frequencyBinCount;
        if (!this._wet || this._wet.length !== nWet) this._wet = new Float32Array(nWet);
        if (!this._dry || this._dry.length !== nDry) this._dry = new Float32Array(nDry);
        e.getFFTData(this._wet);
        e.getPreFFTData(this._dry);
        return true;
    }

    /** Draws one frame: grid, dry fill, wet line and the attenuation markers. */
    draw() {
        const ctx = this.ctx;
        if (!ctx || !this._dry || !this._wet) return;
        const w = this.width;
        const h = this.height;
        const sampleRate = (this.engine && this.engine.ctx && this.engine.ctx.sampleRate) || 48000;
        const fftSize = (this.engine && this.engine.analyser && this.engine.analyser.fftSize) || this._dry.length * 2;
        const opts = { width: w, height: h, sampleRate, fftSize, minF: SPECTRUM_RANGE.minF, maxF: SPECTRUM_RANGE.maxF };

        ctx.clearRect(0, 0, w, h);

        // Grid + labels.
        ctx.strokeStyle = SPECTRUM_COLORS.grid;
        ctx.fillStyle = SPECTRUM_COLORS.text;
        ctx.font = '10px system-ui, sans-serif';
        ctx.lineWidth = 1;
        SPECTRUM_GRID_HZ.forEach((hz) => {
            const x = frequencyToX(hz, w, opts.minF, opts.maxF);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
            const label = hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
            ctx.fillText(label, x + 2, h - 3);
        });

        const dry = sampleEnvelope(this._dry, opts);
        const wet = sampleEnvelope(this._wet, opts);
        if (!dry.length || !wet.length) return;

        // 1) Dry (pre-insert) envelope as a filled area.
        ctx.beginPath();
        ctx.moveTo(dry[0].x, h);
        dry.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(dry[dry.length - 1].x, h);
        ctx.closePath();
        ctx.fillStyle = SPECTRUM_COLORS.dry;
        ctx.fill();
        ctx.strokeStyle = SPECTRUM_COLORS.dryLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        dry.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();

        // 2) Attenuation highlight: every band the compressor pulled down.
        ctx.strokeStyle = SPECTRUM_COLORS.attenuation;
        ctx.lineWidth = 2;
        const pairs = Math.min(dry.length, wet.length);
        for (let i = 0; i < pairs; i++) {
            const att = dry[i].db - wet[i].db;
            if (att > 1.5) {
                ctx.beginPath();
                ctx.moveTo(wet[i].x, dry[i].y);
                ctx.lineTo(wet[i].x, wet[i].y);
                ctx.stroke();
            }
        }

        // 3) Wet (post-insert) envelope as the bright top line.
        ctx.strokeStyle = SPECTRUM_COLORS.wet;
        ctx.lineWidth = 2;
        ctx.beginPath();
        wet.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
    }
}
