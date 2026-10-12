/**
 * @file DynamicsEngine.js
 * @description Main-thread engine wrapper around the `dynamics-processor`
 * AudioWorklet for the Dynamic Range module.
 *
 * Responsibilities
 *   - Load the worklet module once, with cache-busting, resolving its URL from
 *     `import.meta.url` so it works under GitHub Pages sub-paths.
 *   - Instantiate the AudioWorkletNode (2 inputs: program + external sidechain,
 *     1 stereo output).
 *   - Expose typed, sanitized setters so no invalid value ever reaches the DSP.
 *   - Subscribe to the worklet's throttled telemetry (GR / in / out levels).
 *   - A/B true-bypass without unwiring the node (dry passes through, metering
 *     stays live so the user sees what *would* be compressed).
 *   - Fail gracefully: if the worklet cannot load, log a clear console error and
 *     stay SILENT. `project_rules §3` forbids any noise/placeholder fallback.
 *
 * The node is wired by AudioEngine (W2b): program source -> input 0,
 * sidechain tap -> input 1, output -> masterGain.
 */

import {
    DEFAULT_DYNAMICS_PARAMS,
    DSP_STYLE,
    computeTransferCurve,
    sanitizeParams
} from './dynamics-math.js?v=83';

/** Cache-busting version; bumped together with the rest of src/web at release. */
export const DYNAMICS_CACHE_VERSION = 83;

/** Processor name registered by `dynamics-processor.js`. */
const PROCESSOR_NAME = 'dynamics-processor';

export class DynamicsEngine {
    /**
     * @param {AudioContext} ctx         the app's AudioContext (from AudioEngine)
     * @param {object} [opts]
     * @param {number} [opts.version]    cache-bust version (default DYNAMICS_CACHE_VERSION)
     * @param {object} [opts.params]     initial parameter overrides
     * @param {string} [opts.basePath]   explicit base path override (rarely needed)
     */
    constructor(ctx, opts = {}) {
        this.ctx = ctx || null;
        this.version = (opts.version !== undefined && opts.version !== null)
            ? opts.version
            : DYNAMICS_CACHE_VERSION;
        this.basePath = opts.basePath || null;

        /** Current sanitized parameter set (single source of truth). */
        this.params = sanitizeParams(opts.params || {}, DEFAULT_DYNAMICS_PARAMS);

        /** @type {AudioWorkletNode|null} */
        this.node = null;
        /** True once the processor is loaded AND the node exists. */
        this.available = false;
        /** True while the module is loading. */
        this.loading = false;

        /** @type {((data:object)=>void)|null} */
        this._telemetryCb = null;

        this._bypass = false;
        this._initPromise = null;
        /** @type {AudioNode|null} currently-wired sidechain source */
        this._sidechainSource = null;
    }

    /** @returns {boolean} node exists and is usable. */
    get isReady() {
        return !!this.node && this.available;
    }

    /** @returns {boolean} bypass state. */
    get isBypassed() {
        return this._bypass;
    }

    /**
     * Resolves the worklet module URL, cache-busted. Using `import.meta.url`
     * keeps the path correct on GitHub Pages project sub-paths.
     * @returns {string}
     */
    _processorUrl() {
        const v = String(this.version);
        let url;
        if (this.basePath) {
            url = new URL(`${this.basePath}dynamics-processor.js`, import.meta.url);
        } else {
            url = new URL('./dynamics-processor.js', import.meta.url);
        }
        url.searchParams.set('v', v);
        return url.href;
    }

    /**
     * Idempotently loads the worklet module and creates the node.
     * @returns {Promise<AudioWorkletNode|null>} the node, or null on failure.
     */
    async init() {
        if (this.node) return this.node;
        if (this._initPromise) return this._initPromise;
        this._initPromise = this._init();
        return this._initPromise;
    }

    async _init() {
        if (!this.ctx) {
            console.error('[DynamicsEngine] No AudioContext supplied.');
            this.available = false;
            return null;
        }
        if (!this.ctx.audioWorklet) {
            console.error('[DynamicsEngine] AudioWorklet API unavailable in this context (needs https:// or localhost).');
            this.available = false;
            return null;
        }

        this.loading = true;
        try {
            await this.ctx.audioWorklet.addModule(this._processorUrl());

            const node = new AudioWorkletNode(this.ctx, PROCESSOR_NAME, {
                numberOfInputs: 2,          // 0: program, 1: external sidechain
                numberOfOutputs: 1,
                outputChannelCount: [2]
            });

            // Telemetry (throttled inside the processor): GR / input / output dBFS.
            node.port.onmessage = (ev) => {
                if (!ev || !ev.data) return;
                if (this._telemetryCb) {
                    try {
                        this._telemetryCb(ev.data);
                    } catch (e) {
                        console.warn('[DynamicsEngine] telemetry handler threw:', e);
                    }
                }
            };
            node.onprocessorerror = (e) => {
                console.error('[DynamicsEngine] processor error:', e);
                this.available = false;
            };

            this.node = node;
            this.available = true;
            this.loading = false;

            // Push the full sanitized param set so the DSP matches the UI.
            this._post({ type: 'params', params: this.params });
            return node;
        } catch (e) {
            // Graceful failure — NO noise fallback (project_rules §3).
            console.error('[DynamicsEngine] Failed to load dynamics-processor worklet:', e);
            this.available = false;
            this.loading = false;
            this.node = null;
            return null;
        }
    }

    /** Safe postMessage to the DSP (no-op if not ready). */
    _post(msg) {
        if (this.node && this.node.port) {
            try {
                this.node.port.postMessage(msg);
            } catch (e) {
                console.warn('[DynamicsEngine] postMessage failed:', e);
            }
        }
    }

    // ───────────────────────── Parameters ─────────────────────────

    /**
     * Merges a partial patch into the params, sanitizes it, and pushes to the DSP.
     * @param {object} partial
     * @returns {object} the new full param set
     */
    setParams(partial) {
        this.params = sanitizeParams({ ...this.params, ...(partial || {}) }, DEFAULT_DYNAMICS_PARAMS);
        this._post({ type: 'params', params: this.params });
        return this.params;
    }

    /** @returns {object} a copy of the current params. */
    getParams() {
        return { ...this.params };
    }

    /** Clears all detector/envelope state in the DSP (call on trial start). */
    reset() {
        this._post({ type: 'reset' });
    }

    /**
     * A/B true-bypass. Dry signal passes through the node unimpeded; the DSP
     * keeps computing gain reduction so the meters stay meaningful.
     * @param {boolean} flag
     * @returns {boolean}
     */
    setBypass(flag) {
        this._bypass = !!flag;
        this._post({ type: 'params', params: { bypass: this._bypass } });
        return this._bypass;
    }

    // ────────────────────── Typed convenience setters ──────────────────────

    /** @param {number} db */
    setThreshold(db) { return this.setParams({ thresholdDb: db }); }
    /** @param {number} r */
    setRatio(r) { return this.setParams({ ratio: r }); }
    /** @param {number} db */
    setKnee(db) { return this.setParams({ kneeDb: db }); }
    /** @param {number} ms */
    setAttack(ms) { return this.setParams({ attackMs: ms }); }
    /** @param {number} ms */
    setRelease(ms) { return this.setParams({ releaseMs: ms }); }
    /** @param {number} ms */
    setHold(ms) { return this.setParams({ holdMs: ms }); }
    /** @param {number} db */
    setMakeup(db) { return this.setParams({ makeupDb: db }); }
    /** @param {boolean} on */
    setAutoGain(on) { return this.setParams({ autoGain: on }); }
    /** @param {number} x 0..1 dry/wet */
    setMix(x) { return this.setParams({ mix: x }); }
    /** @param {'peak'|'rms'} d */
    setDetector(d) { return this.setParams({ detector: d }); }
    /** @param {boolean} on */
    setFeedback(on) { return this.setParams({ feedback: on }); }
    /** @param {'max'|'avg'} mode */
    setStereoLink(mode) { return this.setParams({ stereoLink: mode }); }
    /** @param {boolean} on */
    setColor(on) { return this.setParams({ color: on }); }
    /** @param {boolean} on */
    setUpwardEnabled(on) { return this.setParams({ upwardEnabled: on }); }
    /** @param {number} db */
    setUpwardThreshold(db) { return this.setParams({ upwardThresholdDb: db }); }
    /** @param {number} r */
    setUpwardRatio(r) { return this.setParams({ upwardRatio: r }); }
    /** @param {boolean} on */
    setSidechain(on) { return this.setParams({ sidechain: on }); }
    /** @param {'compress'|'expand'} mode gate/expander preset mapped onto the same knobs */
    setMode(mode) { return this.setParams({ mode: mode === 'expand' ? 'expand' : 'compress' }); }

    /**
     * Selects a compressor type. By default also applies that type's honest
     * engine-side topology (detector / feedback) from DSP_STYLE, which the user
     * can still override afterwards.
     * @param {'vca'|'fet'|'opto'|'varimu'|'bus'} style
     * @param {object} [opts]
     * @param {boolean} [opts.applyTopology=true]
     */
    setStyle(style, opts = {}) {
        const applyTopology = opts.applyTopology !== false;
        if (!DSP_STYLE[style]) {
            return this.setParams({ style: 'vca' });
        }
        const patch = { style };
        if (applyTopology) {
            patch.detector = DSP_STYLE[style].detector;
            patch.feedback = DSP_STYLE[style].feedback;
        }
        return this.setParams(patch);
    }

    // ───────────────────────── Telemetry ─────────────────────────

    /**
     * Registers the telemetry sink. Receives `{ grDb, inDb, outDb, style }`.
     * @param {((data:object)=>void)|null} cb
     */
    onTelemetry(cb) {
        this._telemetryCb = (typeof cb === 'function') ? cb : null;
    }

    // ───────────────────────── Curve helper (UI) ─────────────────────────

    /**
     * Samples the current static transfer function for the Pro-C2 style curve.
     * @param {number} [steps]
     * @returns {Array<{inDb:number,outDb:number,gainDb:number}>}
     */
    computeCurve(steps = 96) {
        return computeTransferCurve(this.params, steps);
    }

    // ───────────────────────── Routing helpers ─────────────────────────

    /** Connects a program source to input 0. */
    connectSource(node) {
        if (this.node && node && typeof node.connect === 'function') {
            try { node.connect(this.node, 0, 0); } catch (e) { console.warn('[DynamicsEngine] connectSource failed:', e); }
        }
    }

    /** Connects an external sidechain source to input 1. */
    connectSidechain(node) {
        this._sidechainSource = node || null;
        if (this.node && node && typeof node.connect === 'function') {
            try { node.connect(this.node, 0, 1); } catch (e) { console.warn('[DynamicsEngine] connectSidechain failed:', e); }
        }
    }

    /** Connects the processor output to a destination (typically masterGain). */
    connectOutput(dest) {
        if (this.node && dest && typeof this.node.connect === 'function') {
            try { this.node.connect(dest); } catch (e) { console.warn('[DynamicsEngine] connectOutput failed:', e); }
        }
    }

    /** Disconnects everything the engine wired, without destroying the node. */
    disconnect() {
        if (this._sidechainSource) {
            try { this._sidechainSource.disconnect(this.node); } catch (_) { /* ignore */ }
            this._sidechainSource = null;
        }
        if (this.node) {
            try { this.node.disconnect(); } catch (_) { /* ignore */ }
        }
    }

    /** Full teardown: unwire, silence port handlers, drop references for GC. */
    dispose() {
        this.disconnect();
        if (this.node) {
            try { this.node.port.onmessage = null; } catch (_) { /* ignore */ }
            try { this.node.onprocessorerror = null; } catch (_) { /* ignore */ }
        }
        this.node = null;
        this.available = false;
        this.loading = false;
        this._initPromise = null;
        this._telemetryCb = null;
    }
}
