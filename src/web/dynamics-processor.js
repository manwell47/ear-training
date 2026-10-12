/**
 * @file dynamics-processor.js
 * @description AudioWorklet processor for the Dynamic Range module.
 *
 * A real, honest dynamics engine (project_rules §1) — NOT the native
 * DynamicsCompressorNode, which cannot do upward compression, sidechain,
 * program-dependent release or type character.
 *
 * Capabilities
 *   - Downward compression (threshold / ratio / quadratic soft knee).
 *   - Upward compression (mirror curve below an upward threshold).
 *   - Peak or RMS detector, feed-forward or feedback topology.
 *   - Program-dependent release for Opto / Vari-Mu (release time grows with
 *     accumulated gain reduction).
 *   - Manual + auto makeup, dry/wet parallel mix.
 *   - External sidechain input (inputs[1]) for kick-to-bass ducking.
 *   - Type colouration (FET / Opto / Vari-Mu / Bus) gated by the `Color` switch.
 *   - Stereo link (max / average).
 *
 * Lookahead is intentionally NOT implemented in v1 (deferred to a later tier),
 * so the processor adds zero latency.
 *
 * Telemetry: a throttled port.postMessage (no SharedArrayBuffer — GitHub Pages
 * sends no COOP/COEP, so SAB is unavailable). The audio thread never blocks.
 *
 * NOTE: this file is loaded via `audioWorklet.addModule()`, i.e. as an ES
 * module (Chrome/Edge support static imports in worklets).
 */

import {
    DEFAULT_DYNAMICS_PARAMS,
    resolveStyle,
    sanitizeParams,
    linToDb,
    dbToLin,
    computeGainDb,
    colorShape,
    clamp
} from './dynamics-math.js?v=82';

/** Emit telemetry roughly every ~47 Hz (375 blocks/s at 48 kHz). */
const TELEMETRY_BLOCKS = 8;
/** Level below which the envelope is considered silent. */
const SILENCE_DB = -120;

class DynamicsProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sr = (typeof sampleRate === 'number') ? sampleRate : 48000;
        this.p = { ...DEFAULT_DYNAMICS_PARAMS };
        this.style = resolveStyle(this.p.style);

        // Detector envelope (dB).
        this.envDb = -100;
        // Instantaneous gain reduction (dB, <= 0 for downward compression).
        this.grDb = 0;
        // Smoothed |gain reduction| -> drives program-dependent release + auto-gain.
        this.grAvg = 0;
        // Hold counter in samples (release hold).
        this.holdSamples = 0;
        this.lastGainDb = 0;

        // Telemetry accumulators.
        this.blockCount = 0;
        this.inPeakDb = -100;
        this.outPeakDb = -100;

        this.port.onmessage = (event) => this._onMessage(event.data);
    }

    _onMessage(msg) {
        if (!msg || !msg.type) return;

        if (msg.type === 'params') {
            const prevStyle = this.p.style;
            const prevMode = this.p.mode;
            this.p = sanitizeParams({ ...this.p, ...(msg.params || {}) }, DEFAULT_DYNAMICS_PARAMS);
            this.style = resolveStyle(this.p.style);
            if (prevStyle !== this.p.style || prevMode !== this.p.mode) {
                // Reset detector state on a type/mode change to avoid a stale envelope tail.
                this.envDb = -100;
                this.grAvg = 0;
                this.lastGainDb = 0;
            }
        } else if (msg.type === 'reset') {
            this.envDb = -100;
            this.grDb = 0;
            this.grAvg = 0;
            this.holdSamples = 0;
            this.lastGainDb = 0;
            this.inPeakDb = -100;
            this.outPeakDb = -100;
        }
    }

    process(inputs, outputs) {
        const out = outputs[0];
        if (!out || out.length === 0) return true;

        const n = out[0].length;
        const inp = inputs[0];
        const scIn = inputs[1];
        const p = this.p;
        const style = this.style;
        const sr = this.sr;

        // No source connected -> emit silence and keep the node alive.
        if (!inp || inp.length === 0) {
            for (let c = 0; c < out.length; c++) out[c].fill(0);
            this.inPeakDb = SILENCE_DB;
            this.outPeakDb = SILENCE_DB;
            this._maybeTelemetry();
            return true;
        }

        const nCh = Math.min(out.length, inp.length);
        const useSC = p.sidechain && scIn && scIn.length > 0;
        const useAvg = p.stereoLink === 'avg';

        // Ballistics coefficients for this block.
        const atkCoeff = Math.exp(-1 / (Math.max(0.00005, p.attackMs / 1000) * sr));
        const releaseBase = Math.max(0.001, p.releaseMs / 1000);
        const relSec = releaseBase * (1 + style.releaseDepend * clamp(this.grAvg / 12, 0, 1));
        const relCoeff = Math.exp(-1 / (relSec * sr));
        const holdSamplesTotal = Math.round((p.holdMs / 1000) * sr);

        const mix = p.mix;
        const dryGain = 1 - mix;
        const bypass = p.bypass;

        let inPeakLin = 0;
        let outPeakLin = 0;

        for (let i = 0; i < n; i++) {
            // ── 1. Detector level (sidechain if engaged) ──────────────────────────
            let detPeak = 0;
            let detSum = 0;
            let detCount = 0;
            for (let c = 0; c < nCh; c++) {
                const sArr = (useSC && scIn[c]) ? scIn[c] : inp[c];
                const a = sArr ? Math.abs(sArr[i]) : 0;
                if (a > detPeak) detPeak = a;
                detSum += a;
                detCount++;
            }
            const detLin = (useAvg && detCount > 0) ? detSum / detCount : detPeak;
            let detDb = linToDb(detLin);

            // Raw input peak (main input only) for the UI level readout.
            let inLin = 0;
            for (let c = 0; c < nCh; c++) {
                const a = Math.abs(inp[c][i]);
                if (a > inLin) inLin = a;
            }
            if (inLin > inPeakLin) inPeakLin = inLin;

            if (detDb < SILENCE_DB) detDb = SILENCE_DB;

            // ── 2. Envelope follower ──────────────────────────────────────────────
            const prev = this.envDb;
            const coeff = detDb > prev ? atkCoeff : relCoeff;
            this.envDb = coeff * prev + (1 - coeff) * detDb;

            // ── 3. Static curve (feed-forward, or feedback on the estimated output) ─
            const detectLevel = p.feedback ? (this.envDb + this.lastGainDb) : this.envDb;
            const requestedGainDb = computeGainDb(detectLevel, p).gainDb;

            // ── 4. Release hold ───────────────────────────────────────────────────
            let gainDb = requestedGainDb;
            if (holdSamplesTotal > 0) {
                if (gainDb < this.lastGainDb) {
                    this.holdSamples = holdSamplesTotal;          // new peak -> restart hold
                } else if (this.holdSamples > 0) {
                    gainDb = Math.min(gainDb, this.lastGainDb);   // frozen release
                    this.holdSamples--;
                }
            }
            this.lastGainDb = gainDb;
            this.grDb = gainDb;
            this.grAvg = 0.995 * this.grAvg + 0.005 * Math.abs(gainDb);

            // ── 5. Makeup (manual + auto) ─────────────────────────────────────────
            const makeupDb = p.makeupDb + (p.autoGain ? this.grAvg : 0);
            const wetGain = dbToLin(gainDb + makeupDb);

            // ── 6. Apply gain, mix, colour ────────────────────────────────────────
            const colorAmt = p.color ? clamp(Math.abs(gainDb) / 12, 0, 1) * 0.85 : 0;
            for (let c = 0; c < nCh; c++) {
                const dry = inp[c][i];
                if (bypass) {              // A/B true-bypass: pass the dry signal through
                    out[c][i] = dry;       // but keep GR/in/out metering live above.
                    continue;
                }
                let wet = dry * wetGain;
                if (colorAmt > 0) wet = colorShape(wet, style.color, colorAmt);
                out[c][i] = dry * dryGain + wet * mix;
            }
            for (let c = nCh; c < out.length; c++) out[c][i] = 0;

            const o = Math.abs(out[0][i]);
            if (o > outPeakLin) outPeakLin = o;
        }

        this.inPeakDb = inPeakLin > 0 ? linToDb(inPeakLin) : SILENCE_DB;
        this.outPeakDb = outPeakLin > 0 ? linToDb(outPeakLin) : SILENCE_DB;
        this._maybeTelemetry();
        return true;
    }

    _maybeTelemetry() {
        this.blockCount++;
        if (this.blockCount >= TELEMETRY_BLOCKS) {
            this.blockCount = 0;
            this.port.postMessage({
                grDb: this.grDb,
                inDb: this.inPeakDb,
                outDb: this.outPeakDb,
                style: this.p.style,
                mode: this.p.mode
            });
        }
    }
}

registerProcessor('dynamics-processor', DynamicsProcessor);
