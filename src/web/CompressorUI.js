/**
 * @file CompressorUI.js
 * @description FabFilter Pro-C2 style transfer-curve UI for the Dynamic Range
 * module, drawn on a single Canvas at 60 FPS.
 *
 * Design goals (per the approved plan)
 *   - Show the CLEAN static transfer curve first. Type COLOUR is a separate,
 *     opt-in switch (`Color`) so the student studies the shape before the
 *     flavour — the curve is neutral cyan while Color is off.
 *   - Input dBFS on X, output dBFS on Y, unity diagonal for reference, with the
 *     soft-knee region shaded and an upward-compression lobe when enabled.
 *   - Draggable handles: threshold (horizontal) and ratio (vertical), plus full
 *     keyboard control (arrows; Shift = fine).
 *   - Live "operating dot" from DSP telemetry (in -> out), and a signed gain
 *     meter (downward GR in amber, upward lift in emerald) with peak-hold.
 *   - exposeHotspots() publishes canvas-space regions so TooltipController (W4)
 *     can attach hover-and-hold explanations.
 *
 * This module owns NO DSP and reads its curve from the shared pure helper
 * `dynamics-math.js`, so the drawn curve always equals the processed curve.
 */

import {
    DEFAULT_DYNAMICS_PARAMS,
    sanitizeParams,
    computeTransferCurve,
    clamp
} from './dynamics-math.js?v=84';

/** UI colour per compressor type (used only when the Color switch is ON). */
export const TYPE_COLORS = {
    vca: '#38bdf8',
    fet: '#fbbf24',
    opto: '#4ade80',
    varimu: '#e05263',
    bus: '#9333ea'
};

const NEUTRAL = '#38bdf8';
const GRID = 'rgba(255,255,255,0.07)';
const GRID_STRONG = 'rgba(255,255,255,0.14)';
const TEXT = '#9ca3af';
const TEXT_STRONG = '#e2e8f0';

export class CompressorUI {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} [opts]
     * @param {(partial:object)=>void} [opts.onChange] fired when the user edits a handle
     * @param {number} [opts.minDb=-60]
     * @param {number} [opts.maxDb=0]
     * @param {number} [opts.grRangeDb=24] full-scale of the gain meter
     */
    constructor(canvas, opts = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.onChange = typeof opts.onChange === 'function' ? opts.onChange : null;

        this.minDb = opts.minDb !== undefined ? opts.minDb : -60;
        this.maxDb = opts.maxDb !== undefined ? opts.maxDb : 0;
        this.grRangeDb = opts.grRangeDb !== undefined ? opts.grRangeDb : 24;

        // Paddings (CSS px). Right padding hosts the gain meter.
        this.padL = 46;
        this.padR = 70;
        this.padT = 20;
        this.padB = 30;

        // Model -------------------------------------------------------------
        this.params = { ...DEFAULT_DYNAMICS_PARAMS };
        this.telemetry = { grDb: 0, inDb: -120, outDb: -120 };
        this.style = this.params.style;
        this.mode = this.params.mode || 'compress';
        this.colorOn = false;
        this.bypassed = false;
        this.interactive = true;
        // Per-handle gate: progressive disclosure unlocks the threshold before the
        // ratio, so the transfer curve must never let a locked handle be dragged.
        this.allowedHandles = new Set(['threshold', 'ratio']);
        this.showOperatingDot = true;

        // Interaction state -------------------------------------------------
        this.selected = null;             // 'threshold' | 'ratio' | null
        this.drag = null;                 // { handle, pointerId }
        this.hover = null;                // handle under the pointer
        this._handles = {};               // screen-space handle positions
        this._hotspots = [];              // published for tooltips

        // GR meter history (rolling) ----------------------------------------
        this.grHistory = new Float32Array(160);
        this.grPeak = 0;
        this.grPeakHold = 0;

        this.width = 100;
        this.height = 100;
        this.dpr = 1;

        this._running = false;
        this._raf = 0;
        this._frame = this._frame.bind(this);

        this.canvas.tabIndex = 0;         // focusable for keyboard control
        this._bindEvents();

        this.resize = this.resize.bind(this);
        this._resizeObserver = new ResizeObserver(() => this.resize());
        this._resizeObserver.observe(this.canvas);
        this.resize();

        this.start();
    }

    // ───────────────────────────── Public API ─────────────────────────────

    /** Applies a partial parameter update (external; does NOT fire onChange). */
    setParams(partial) {
        this.params = sanitizeParams({ ...this.params, ...(partial || {}) }, DEFAULT_DYNAMICS_PARAMS);
        if (partial && partial.style) this.style = this.params.style;
        if (partial && partial.mode) this.mode = this.params.mode;
        return this.params;
    }

    /** @returns {object} copy of the current params. */
    getParams() {
        return { ...this.params };
    }

    /** DSP telemetry sink: `{ grDb, inDb, outDb }`. */
    setTelemetry(data) {
        if (!data) return;
        if (typeof data.grDb === 'number') this.telemetry.grDb = data.grDb;
        if (typeof data.inDb === 'number') this.telemetry.inDb = data.inDb;
        if (typeof data.outDb === 'number') this.telemetry.outDb = data.outDb;
    }

    /** @param {'vca'|'fet'|'opto'|'varimu'|'bus'} style */
    setStyle(style) {
        this.style = style || 'vca';
        this.setParams({ style: this.style });
    }

    /** @param {'compress'|'expand'} mode gate/expander preset (same knobs, different curve) */
    setMode(mode) {
        this.mode = mode === 'expand' ? 'expand' : 'compress';
        this.setParams({ mode: this.mode });
    }

    /** Type colouring switch. OFF => neutral curve (study the shape first). */
    setColor(on) {
        this.colorOn = !!on;
        this.params.color = this.colorOn;
    }

    /** Visual + logical bypass state. */
    setBypass(on) {
        this.bypassed = !!on;
    }

    /**
     * Enable/disable user editing (locked during Challenge/verdict).
     * Accepts a boolean (all handles) OR a per-handle map, e.g.
     * `{ threshold: true, ratio: false }`, so the curve honours the same
     * progressive disclosure as the DOM knobs instead of leaking the locked one.
     * @param {boolean|object|Array<string>} flag
     */
    setInteractive(flag) {
        if (flag && typeof flag === 'object') {
            const list = Array.isArray(flag) ? flag : Object.keys(flag).filter((k) => flag[k]);
            this.allowedHandles = new Set(list);
        } else {
            this.allowedHandles = new Set(flag ? ['threshold', 'ratio'] : []);
        }
        this.interactive = this.allowedHandles.size > 0;
        if (!this.interactive) {
            this.selected = null;
            this.drag = null;
            return;
        }
        if (this.selected && !this.allowedHandles.has(this.selected)) this.selected = null;
        if (this.drag && !this.allowedHandles.has(this.drag.handle)) this.drag = null;
    }

    /** @returns {Array<{id:string,x:number,y:number,w:number,h:number,label:string}>} */
    getHotspots() {
        return this._hotspots.map((h) => ({ ...h }));
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._raf = requestAnimationFrame(this._frame);
    }

    stop() {
        this._running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;
    }

    destroy() {
        this.stop();
        if (this._resizeObserver) this._resizeObserver.disconnect();
        this._resizeObserver = null;
        this._unbindEvents();
    }

    // ───────────────────────────── Geometry ─────────────────────────────

    resize() {
        const w = this.canvas.clientWidth || 320;
        const h = this.canvas.clientHeight || 200;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = w;
        this.height = h;
        this.dpr = dpr;
    }

    get _plotW() { return Math.max(10, this.width - this.padL - this.padR); }
    get _plotH() { return Math.max(10, this.height - this.padT - this.padB); }

    _x(inDb) {
        const t = (inDb - this.minDb) / (this.maxDb - this.minDb);
        return this.padL + clamp(t, 0, 1) * this._plotW;
    }
    _y(db) {
        const t = (this.maxDb - db) / (this.maxDb - this.minDb);
        return this.padT + clamp(t, 0, 1) * this._plotH;
    }
    _invX(px) {
        const t = (px - this.padL) / this._plotW;
        return this.minDb + clamp(t, 0, 1) * (this.maxDb - this.minDb);
    }
    _invY(py) {
        const t = (py - this.padT) / this._plotH;
        return this.maxDb - clamp(t, 0, 1) * (this.maxDb - this.minDb);
    }

    _activeColor() {
        return this.colorOn ? (TYPE_COLORS[this.style] || NEUTRAL) : NEUTRAL;
    }

    // ───────────────────────────── Events ─────────────────────────────

    _getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    _hitHandle(pos) {
        const h = this._handles;
        const allow = this.allowedHandles || new Set(['threshold', 'ratio']);
        const r = 12;
        if (allow.has('ratio') && h.ratio && Math.hypot(h.ratio.x - pos.x, h.ratio.y - pos.y) <= r) return 'ratio';
        if (allow.has('threshold') && h.threshold && Math.hypot(h.threshold.x - pos.x, h.threshold.y - pos.y) <= r) return 'threshold';
        return null;
    }

    _bindEvents() {
        this._onDown = (e) => {
            if (!this.interactive) return;
            const pos = this._getPos(e);
            const hit = this._hitHandle(pos);
            if (hit) {
                this.selected = hit;
                this.drag = { handle: hit, pointerId: e.pointerId };
                this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId);
                this.canvas.focus && this.canvas.focus();
                e.preventDefault();
            }
        };
        this._onMove = (e) => {
            const pos = this._getPos(e);
            if (this.drag) {
                if (this.drag.handle === 'threshold') {
                    const db = clamp(this._invX(pos.x), this.minDb, 0);
                    this._emit({ thresholdDb: db });
                } else if (this.drag.handle === 'ratio') {
                    this._applyRatioFromY(pos.y);
                }
                e.preventDefault();
            } else if (this.interactive) {
                this.hover = this._hitHandle(pos);
                this.canvas.style.cursor = this.hover ? 'ns-resize' : 'default';
            }
        };
        this._onUp = (e) => {
            if (this.drag) {
                if (this.canvas.releasePointerCapture && this.drag.pointerId !== undefined) {
                    try { this.canvas.releasePointerCapture(this.drag.pointerId); } catch (_) { /* ignore */ }
                }
                this.drag = null;
                e.preventDefault();
            }
        };
        this._onLeave = () => { if (!this.drag) this.hover = null; };
        this._onKey = (e) => {
            if (!this.interactive || !this.selected) return;
            const fine = e.shiftKey;
            let handled = true;
            if (this.selected === 'threshold') {
                const step = fine ? 0.1 : 0.5;
                if (e.key === 'ArrowLeft') this._emit({ thresholdDb: this.params.thresholdDb - step });
                else if (e.key === 'ArrowRight') this._emit({ thresholdDb: this.params.thresholdDb + step });
                else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') handled = false;
                else handled = false;
            } else if (this.selected === 'ratio') {
                const step = fine ? 0.02 : 0.2;
                if (e.key === 'ArrowUp') this._emit({ ratio: this.params.ratio + step });
                else if (e.key === 'ArrowDown') this._emit({ ratio: this.params.ratio - step });
                else handled = false;
            }
            if (handled) e.preventDefault();
        };

        this.canvas.addEventListener('pointerdown', this._onDown);
        this.canvas.addEventListener('pointermove', this._onMove);
        this.canvas.addEventListener('pointerup', this._onUp);
        this.canvas.addEventListener('pointercancel', this._onUp);
        this.canvas.addEventListener('pointerleave', this._onLeave);
        this.canvas.addEventListener('keydown', this._onKey);
    }

    _unbindEvents() {
        this.canvas.removeEventListener('pointerdown', this._onDown);
        this.canvas.removeEventListener('pointermove', this._onMove);
        this.canvas.removeEventListener('pointerup', this._onUp);
        this.canvas.removeEventListener('pointercancel', this._onUp);
        this.canvas.removeEventListener('pointerleave', this._onLeave);
        this.canvas.removeEventListener('keydown', this._onKey);
    }

    /** Applies a user edit locally and notifies the host. */
    _emit(partial) {
        this.setParams(partial);
        if (this.onChange) this.onChange({ ...partial });
    }

    /** Converts a vertical pointer position into a ratio (compressed or expanded segment). */
    _applyRatioFromY(py) {
        const T = this.params.thresholdDb;

        // Expander/gate: the ratio lives on the segment BELOW the threshold.
        if (this.mode === 'expand') {
            const span = T - this.minDb;
            if (span <= 0.001) return;
            const outAtMin = this._invY(py);
            const R = clamp((outAtMin - T) / (this.minDb - T), 1, 20);
            this._emit({ ratio: R });
            return;
        }

        const d = this.maxDb - T;
        if (d <= 0.001) return;
        const outAtMax = this._invY(py);
        const denom = outAtMax - T;
        if (denom <= 0.001) {
            this._emit({ ratio: 20 });
            return;
        }
        const R = clamp(d / denom, 1, 20);
        this._emit({ ratio: R });
    }

    // ───────────────────────────── Render loop ─────────────────────────────

    _frame() {
        if (!this._running) return;
        this._draw();
        this._raf = requestAnimationFrame(this._frame);
    }

    _draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Background
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, w, h);

        // Advance the rolling meter state exactly once per frame.
        this._updateMeterState();

        this._drawGrid(ctx);
        this._drawUnity(ctx);
        this._drawKnee(ctx);
        this._drawCurve(ctx);
        this._drawHandles(ctx);
        this._drawOperatingDot(ctx);
        this._drawMeter(ctx);
        this._publishHotspots();
    }

    _drawGrid(ctx) {
        ctx.save();
        ctx.strokeStyle = GRID;
        ctx.fillStyle = TEXT;
        ctx.font = '9px system-ui, sans-serif';
        ctx.lineWidth = 1;
        for (let db = this.minDb; db <= this.maxDb; db += 6) {
            const x = this._x(db);
            const y = this._y(db);
            ctx.globalAlpha = (db % 12 === 0) ? 1 : 0.5;
            ctx.beginPath();
            ctx.moveTo(x, this.padT);
            ctx.lineTo(x, this.padT + this._plotH);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(this.padL, y);
            ctx.lineTo(this.padL + this._plotW, y);
            ctx.stroke();
        }
        // Axis labels every 12 dB
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let db = this.minDb; db <= this.maxDb; db += 12) {
            ctx.fillText(`${db}`, this._x(db), this.padT + this._plotH + 4);
        }
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let db = this.minDb; db <= this.maxDb; db += 12) {
            ctx.fillText(`${db}`, this.padL - 6, this._y(db));
        }
        // Strong frame
        ctx.strokeStyle = GRID_STRONG;
        ctx.strokeRect(this.padL, this.padT, this._plotW, this._plotH);
        ctx.restore();
    }

    _drawUnity(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this._x(this.minDb), this._y(this.minDb));
        ctx.lineTo(this._x(this.maxDb), this._y(this.maxDb));
        ctx.stroke();
        ctx.restore();
    }

    _drawKnee(ctx) {
        const T = this.params.thresholdDb;
        const W = this.params.kneeDb;
        if (!(W > 0)) return;
        const half = W / 2;
        const x0 = this._x(clamp(T - half, this.minDb, this.maxDb));
        const x1 = this._x(clamp(T + half, this.minDb, this.maxDb));
        ctx.save();
        ctx.fillStyle = this._colorWithAlpha(this._activeColor(), 0.10);
        ctx.fillRect(x0, this.padT, Math.max(1, x1 - x0), this._plotH);
        ctx.strokeStyle = this._colorWithAlpha(this._activeColor(), 0.35);
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, this.padT);
        ctx.lineTo(x1, this.padT + this._plotH);
        ctx.stroke();
        ctx.restore();
    }

    _drawCurve(ctx) {
        const pts = computeTransferCurve(this.params, 160, this.minDb, this.maxDb);
        const color = this._activeColor();

        // Upward lobe (drawn first, dimmer)
        if (this.params.upwardEnabled) {
            ctx.save();
            ctx.strokeStyle = this._colorWithAlpha('#4ade80', this.bypassed ? 0.35 : 0.9);
            ctx.lineWidth = 2;
            ctx.beginPath();
            pts.forEach((p, i) => {
                const x = this._x(p.inDb);
                const y = this._y(p.outDb);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.strokeStyle = this.bypassed ? this._colorWithAlpha(color, 0.4) : color;
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.shadowColor = this._colorWithAlpha(color, 0.5);
        ctx.shadowBlur = this.bypassed ? 0 : 6;
        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = this._x(p.inDb);
            const y = this._y(p.outDb);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
    }

    _drawHandles(ctx) {
        const T = this.params.thresholdDb;
        const isExpand = this.mode === 'expand';

        let ra;
        if (isExpand) {
            // Expander: the ratio handle rides the segment below the threshold.
            const outAtMin = T + (this.minDb - T) * this.params.ratio;
            ra = { x: this._x(this.minDb), y: this._y(clamp(outAtMin, this.minDb, this.maxDb)) };
        } else {
            const d = this.maxDb - T;
            const outAtMax = (d > 0.001) ? (T + d / this.params.ratio) : this.maxDb;
            ra = { x: this._x(this.maxDb), y: this._y(outAtMax) };
        }

        const th = { x: this._x(T), y: this._y(T) };
        this._handles = { threshold: th, ratio: ra };

        const color = this._activeColor();
        const drawDot = (p, isSel, isHover, label) => {
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x, p.y, (isSel || isHover) ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = '#111111';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = (isSel || isHover) ? '#ffffff' : color;
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
            ctx.fill();
            if (label) {
                ctx.fillStyle = TEXT_STRONG;
                ctx.font = '10px system-ui, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText(label, p.x + 10, p.y - 4);
            }
            ctx.restore();
        };

        drawDot(th, this.selected === 'threshold', this.hover === 'threshold',
            `Th ${T.toFixed(1)} dB`);
        drawDot(ra, this.selected === 'ratio', this.hover === 'ratio',
            `R ${this.params.ratio.toFixed(2)}:1${isExpand ? ' ↓' : ''}`);
    }

    _drawOperatingDot(ctx) {
        if (!this.showOperatingDot) return;
        const inDb = this.telemetry.inDb;
        const outDb = this.telemetry.outDb;
        if (!isFinite(inDb) || inDb <= this.minDb) return;

        const color = this._activeColor();
        const x = this._x(clamp(inDb, this.minDb, this.maxDb));
        const y = this._y(clamp(outDb, this.minDb, this.maxDb));

        ctx.save();
        ctx.strokeStyle = this._colorWithAlpha(color, 0.25);
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(x, this.padT + this._plotH);
        ctx.lineTo(x, y);
        ctx.lineTo(this.padL, y);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.95;
        ctx.fill();
        ctx.restore();
    }

    _drawMeter(ctx) {
        // History + peak-hold are advanced once per frame in _updateMeterState().
        const gr = this.telemetry.grDb || 0;
        const mag = Math.abs(gr);

        const x = this.width - this.padR + 14;
        const w = 12;
        const top = this.padT;
        const hgt = this._plotH;
        const mid = top + hgt / 2;               // 0 dB gain reference
        const half = hgt / 2;
        const scale = half / this.grRangeDb;     // px per dB

        ctx.save();
        // Track
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, top, w, hgt);
        ctx.strokeStyle = GRID_STRONG;
        ctx.strokeRect(x, top, w, hgt);
        // Zero line
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.moveTo(x - 3, mid);
        ctx.lineTo(x + w + 3, mid);
        ctx.stroke();

        if (gr < 0) {
            // Downward gain reduction (amber), grows downward from 0 dB
            const h = clamp(mag * scale, 0, half);
            const grad = ctx.createLinearGradient(0, mid, 0, mid + h);
            grad.addColorStop(0, '#fbbf24');
            grad.addColorStop(1, '#e05263');
            ctx.fillStyle = grad;
            ctx.fillRect(x, mid, w, h);
        } else if (gr > 0) {
            // Upward lift (emerald), grows upward from 0 dB
            const h = clamp(mag * scale, 0, half);
            ctx.fillStyle = '#4ade80';
            ctx.fillRect(x, mid - h, w, h);
        }

        // Peak hold marker
        if (this.grPeakHold > 0.05) {
            const ph = clamp(this.grPeakHold * scale, 0, half);
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.fillRect(x, mid + ph, w, 1.5);
        }

        // Numeric readout
        ctx.fillStyle = TEXT_STRONG;
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${gr.toFixed(1)}`, x + w / 2, top + hgt + 4);
        ctx.fillStyle = TEXT;
        ctx.font = '8px system-ui, sans-serif';
        ctx.fillText('dB', x + w / 2, top + hgt + 16);

        if (this.bypassed) {
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.save();
            ctx.translate(x + w / 2, mid);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '8px system-ui, sans-serif';
            ctx.fillText('BYPASS', 0, 0);
            ctx.restore();
        }
        ctx.restore();
    }

    /** Advances the rolling gain history + peak-hold once per animation frame. */
    _updateMeterState() {
        const gr = this.telemetry.grDb || 0;
        this.grHistory.copyWithin(0, 1);
        this.grHistory[this.grHistory.length - 1] = gr;
        const mag = Math.abs(gr);
        if (mag > this.grPeak) this.grPeak = mag;
        if (mag > this.grPeakHold) { this.grPeakHold = mag; this.grPeakHoldTime = 45; }
        else if (this.grPeakHoldTime > 0) this.grPeakHoldTime--;
        else this.grPeakHold = Math.max(0, this.grPeakHold - 0.3);
        this.grPeak = Math.max(0, this.grPeak - 0.15);
    }

    _publishHotspots() {
        const T = this.params.thresholdDb;
        const d = this.maxDb - T;
        const outAtMax = (d > 0.001) ? (T + d / this.params.ratio) : this.maxDb;
        const th = { x: this._x(T), y: this._y(T) };
        const ra = { x: this._x(this.maxDb), y: this._y(outAtMax) };

        this._hotspots = [
            { id: 'curve', x: this.padL, y: this.padT, w: this._plotW, h: this._plotH, label: 'Transfer curve' },
            { id: 'knee', x: this._x(clamp(T - this.params.kneeDb / 2, this.minDb, this.maxDb)), y: this.padT, w: Math.max(6, (this.params.kneeDb / (this.maxDb - this.minDb)) * this._plotW), h: this._plotH, label: 'Knee' },
            { id: 'threshold', x: th.x - 10, y: th.y - 10, w: 20, h: 20, label: 'Threshold' },
            { id: 'ratio', x: ra.x - 10, y: ra.y - 10, w: 20, h: 20, label: 'Ratio' },
            { id: 'meter', x: this.width - this.padR + 8, y: this.padT, w: 26, h: this._plotH + 24, label: 'Gain meter' }
        ];
    }

    _colorWithAlpha(hex, alpha) {
        const c = hex.replace('#', '');
        const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return `rgba(${r},${g},${b},${alpha})`;
    }
}
