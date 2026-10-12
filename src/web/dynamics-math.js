/**
 * @file dynamics-math.js
 * @description Pure, dependency-free DSP math for the Dynamic Range module.
 *
 * This module is intentionally free of Web Audio / DOM references so that:
 *   1. the AudioWorklet processor can import it (single source of truth), and
 *   2. `tools/verify_modules.mjs` can import it under Node to unit-test the
 *      transfer function against hand-computed known points.
 *
 * Rigour note (project_rules §1): the static gain computer implements the
 * standard quadratic soft-knee model (Reiss & McPherson, "Audio Effects"),
 * and upward compression is the exact mirror of the downward curve about the
 * upward threshold. No psychoacoustic shortcuts are used.
 */

/** Floor used across the module so `-Infinity` dB never leaks into math/UI. */
export const DYNAMICS_MIN_DB = -120;

/** @returns {number} x clamped to [lo, hi] */
export function clamp(x, lo, hi) {
    return x < lo ? lo : (x > hi ? hi : x);
}

/** Linear amplitude -> decibels (0 -> DYNAMICS_MIN_DB). */
export function dbToLin(db) {
    return Math.pow(10, db / 20);
}

/** Linear amplitude -> decibels, floored at DYNAMICS_MIN_DB. */
export function linToDb(lin) {
    if (!(lin > 0)) return DYNAMICS_MIN_DB;
    return 20 * Math.log10(lin);
}

/**
 * Downward static gain computer with quadratic soft knee.
 * @param {number} x input level in dB
 * @param {number} T threshold in dB
 * @param {number} R ratio (>1). R=1 => no compression.
 * @param {number} W knee width in dB (0 => hard knee)
 * @returns {number} applied gain in dB (<= 0 above threshold, 0 below)
 */
export function staticGainDb(x, T, R, W) {
    if (!(R > 1)) return 0;

    // Hard knee fast-path (also guards the 2*W division below).
    if (!(W > 1e-6)) {
        if (x <= T) return 0;
        return (T - x) * (1 - 1 / R);
    }

    const halfW = W / 2;
    let y;
    if (x < T - halfW) {
        y = x;                                   // below knee: untouched
    } else if (x > T + halfW) {
        y = T + (x - T) / R;                     // above knee: linear ratio
    } else {
        y = x + (1 / R - 1) * Math.pow(x - T + halfW, 2) / (2 * W); // soft-knee curve
    }
    return y - x;
}

/**
 * Upward static gain computer. Quiet material BELOW `T` is raised so the
 * dynamic range beneath the threshold is compressed by `R`.
 * Implemented as the exact mirror of `staticGainDb` about the threshold, which
 * guarantees continuity at the knee and a mathematically tidy formulation.
 * @returns {number} applied gain in dB (>= 0 below threshold, 0 above)
 */
export function upwardGainDb(x, T, R, W) {
    if (!(R > 1)) return 0;
    return -staticGainDb(-x, -T, R, W);
}

/**
 * Downward static gain computer (gate / expander) with quadratic soft knee.
 *
 * Below the threshold the signal is attenuated: y = T + (x - T)*R with R > 1
 * (slope R < ... > the classic "downward expansion" transfer). Quiet material
 * is pushed further down, widening the dynamic range; with a high ratio it
 * behaves as a noise gate. Implemented as the honest mirror of `staticGainDb`
 * (same soft-knee quadratic, slopes matched at both knee edges) so a RATIO of 1
 * is a perfect null and the curve stays continuous and slope-continuous with
 * the unity region above the knee.
 *
 * @param {number} x input level in dB
 * @param {number} T threshold in dB
 * @param {number} R expansion ratio (>1). R=1 => no expansion.
 * @param {number} W knee width in dB (0 => hard knee)
 * @returns {number} applied gain in dB (<= 0 below threshold, 0 above)
 */
export function expansionGainDb(x, T, R, W) {
    if (!(R > 1)) return 0;

    const u = x - T;

    // Hard knee fast-path.
    if (!(W > 1e-6)) {
        return u >= 0 ? 0 : u * (R - 1);
    }

    const halfW = W / 2;
    if (u >= halfW) return 0;                    // above knee: untouched

    let y;
    if (u <= -halfW) {
        y = T + u * R;                           // below knee: expansion line (slope R)
    } else {
        // Quadratic blend between the identity line (slope 1) and the expansion
        // line (slope R); coefficients solved for value + slope continuity.
        const a = (1 - R) / (2 * W);
        const b = (1 + R) / 2;
        const c = T + (1 - R) * W / 8;
        y = a * u * u + b * u + c;
    }
    return y - x;
}

/**
 * Total dB gain. `p.mode === 'expand'` swaps the downward stage for the
 * gate/expander curve (floored at `p.gateRangeDb` — the gate's max attenuation);
 * otherwise the standard downward compressor curve is used. The upward stage is
 * identical in both modes.
 * @param {number} inputDb
 * @param {object} p sanitized params
 * @returns {{gainDb:number, downDb:number, upDb:number}}
 */
export function computeGainDb(inputDb, p) {
    let downDb;
    if (p.mode === 'expand') {
        downDb = expansionGainDb(inputDb, p.thresholdDb, p.ratio, p.kneeDb);
        const floor = (typeof p.gateRangeDb === 'number') ? p.gateRangeDb : -60;
        if (downDb < floor) downDb = floor;      // gate floor: never below this
    } else {
        downDb = staticGainDb(inputDb, p.thresholdDb, p.ratio, p.kneeDb);
    }
    const upDb = p.upwardEnabled
        ? upwardGainDb(inputDb, p.upwardThresholdDb, p.upwardRatio, p.kneeDb)
        : 0;
    return { gainDb: downDb + upDb, downDb, upDb };
}

/** Static-curve operating modes exposed to the UI (mapped onto the same knobs). */
export const DYNAMICS_MODES = Object.freeze({ COMPRESS: 'compress', EXPAND: 'expand' });

/**
 * Samples the static transfer function for the UI curve.
 * @returns {Array<{inDb:number, outDb:number, gainDb:number}>} from 0 dB to -60 dB
 */
export function computeTransferCurve(p, steps = 96, minDb = -60, maxDb = 0) {
    const pts = [];
    const span = maxDb - minDb;
    for (let i = 0; i <= steps; i++) {
        const inDb = maxDb - (span * i) / steps;
        const { gainDb } = computeGainDb(inDb, p);
        pts.push({ inDb, outDb: inDb + gainDb, gainDb });
    }
    return pts;
}

/** Unity-slope soft saturation: small-signal gain = 1, peaks squashed. */
export function softSat(x, drive) {
    const d = drive > 0 ? drive : 1;
    return Math.tanh(d * x) / d;
}

/** Asymmetric soft saturation -> adds a controlled 2nd harmonic. */
export function asymSat(x, drive, asym) {
    const s = softSat(x, drive);
    const a = asym || 0;
    return s * (1 + a * (x >= 0 ? 1 : -1));
}

/**
 * Type character colouration, gated by the UI `Color` switch. `amount` scales
 * with the instantaneous gain reduction so the colour is present only while the
 * device is actually working (honest, GR-proportional colouring).
 * @param {number} x
 * @param {'none'|'fet'|'tube'|'tube2'|'glue'} color
 * @param {number} amount 0..1
 */
export function colorShape(x, color, amount) {
    const amt = clamp(amount || 0, 0, 1);
    if (amt <= 0 || !color || color === 'none') return x;
    switch (color) {
        case 'fet': return softSat(x, 1 + 2.5 * amt);          // fast, odd-harmonic edge
        case 'tube': return asymSat(x, 1 + 2.0 * amt, 0.16 * amt); // Vari-Mu: 2nd harmonic
        case 'tube2': return asymSat(x, 1 + 1.5 * amt, 0.24 * amt); // Opto: gentle 2nd harmonic
        case 'glue': return softSat(x, 1 + 1.0 * amt);         // Bus: very gentle
        default: return x;
    }
}

/**
 * DSP-only character model per compressor type. Musical ranges / prose live in
 * DynamicsMatrix.js; this table holds ONLY the engine-side behaviour.
 *  - releaseDepend: multiplies release time as gain reduction accumulates
 *    (program-dependent release; the Opto/Vari-Mu signature).
 *  - kneeScale: extra knee softness factor.
 *  - detector / feedback: topology defaults for the flavour.
 */
export const DSP_STYLE = {
    vca: { color: 'none', releaseDepend: 1.0, kneeScale: 1.0, detector: 'peak', feedback: false },
    fet: { color: 'fet', releaseDepend: 1.7, kneeScale: 0.8, detector: 'peak', feedback: false },
    opto: { color: 'tube2', releaseDepend: 2.4, kneeScale: 1.6, detector: 'rms', feedback: true },
    varimu: { color: 'tube', releaseDepend: 1.4, kneeScale: 1.8, detector: 'rms', feedback: true },
    bus: { color: 'glue', releaseDepend: 1.2, kneeScale: 1.2, detector: 'rms', feedback: false }
};

/** @returns {object} the DSP style record (falls back to VCA). */
export function resolveStyle(style) {
    return DSP_STYLE[style] || DSP_STYLE.vca;
}

/** Neutral, safe defaults. Lookahead is intentionally absent (deferred to a later tier). */
export const DEFAULT_DYNAMICS_PARAMS = {
    style: 'vca',
    color: false,
    thresholdDb: -18,
    ratio: 4,
    kneeDb: 6,
    attackMs: 10,
    releaseMs: 120,
    holdMs: 0,
    makeupDb: 0,
    autoGain: false,
    mix: 1.0,
    bypass: false,          // A/B true-bypass (dry output, metering stays live)
    detector: 'peak',       // 'peak' | 'rms'
    feedback: false,
    stereoLink: 'max',      // 'max' | 'avg'
    upwardEnabled: false,
    upwardThresholdDb: -50,
    upwardRatio: 2,
    mode: 'compress',       // 'compress' | 'expand' (gate/expander preset)
    gateRangeDb: -60,       // expand-mode floor: maximum attenuation (no extra knob)
    sidechain: false
};

/**
 * Coerces an arbitrary/partial params object into a valid, in-range set.
 * Guarantees no NaN/undefined ever reaches the DSP or the UI.
 */
export function sanitizeParams(raw, base = DEFAULT_DYNAMICS_PARAMS) {
    const p = { ...base, ...(raw || {}) };

    const num = (v, fb) => (isFinite(Number(v)) ? Number(v) : fb);

    p.thresholdDb = clamp(num(p.thresholdDb, -18), -60, 0);
    p.ratio = clamp(num(p.ratio, 4), 1, 20);
    p.kneeDb = clamp(num(p.kneeDb, 6), 0, 24);
    p.attackMs = clamp(num(p.attackMs, 10), 0.02, 200);
    p.releaseMs = clamp(num(p.releaseMs, 120), 1, 2000);
    p.holdMs = clamp(num(p.holdMs, 0), 0, 500);
    p.makeupDb = clamp(num(p.makeupDb, 0), -24, 24);
    p.mix = clamp(num(p.mix, 1), 0, 1);
    p.upwardThresholdDb = clamp(num(p.upwardThresholdDb, -50), -80, 0);
    p.upwardRatio = clamp(num(p.upwardRatio, 2), 1, 10);
    p.gateRangeDb = clamp(num(p.gateRangeDb, -60), -80, 0);

    if (p.detector !== 'rms') p.detector = 'peak';
    if (p.stereoLink !== 'avg') p.stereoLink = 'max';
    if (p.mode !== 'expand') p.mode = 'compress';

    p.style = DSP_STYLE[p.style] ? p.style : 'vca';

    p.bypass = !!p.bypass;
    p.color = !!p.color;
    p.autoGain = !!p.autoGain;
    p.feedback = !!p.feedback;
    p.upwardEnabled = !!p.upwardEnabled;
    p.sidechain = !!p.sidechain;

    return p;
}
