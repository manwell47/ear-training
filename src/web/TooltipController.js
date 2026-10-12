/**
 * @file TooltipController.js
 * @description Hover-and-hold teaching tooltips for the DYNAMIC RANGE module.
 *
 * Behaviour (per the approved didactic plan)
 *   - DOM controls carrying a `data-help="<key>"` attribute show a quick popover
 *     after the pointer rests in place for HOLD_MS (default 1000 ms).
 *   - Canvas hotspot regions (published by CompressorUI.getHotspots()) show the
 *     same popovers while the pointer rests over them.
 *   - A pinned "teaching mode" (the "?" button) removes the hold delay so every
 *     control explains itself on hover, and adds a highlight outline to controls.
 *
 * The controller owns NO content: strings come from DynamicsMatrix.DYNAMICS_HELP
 * (resolved through `getHelpText`), which can be overridden via `opts.resolve`.
 *
 * `hitTestHotspots` is exported as a pure function so it can be unit-tested
 * without a DOM.
 */

import { getHelpText } from './DynamicsMatrix.js?v=82';

/** Default dwell time before a popover appears (ms). */
export const HOLD_MS = 1000;

/** Pointer travel (px) that cancels a pending popover. */
export const MOVE_TOLERANCE_PX = 6;

/**
 * Pure hotspot hit-test. Later entries (drawn on top) win, matching draw order.
 * @param {Array<{id:string,x:number,y:number,w:number,h:number}>} hotspots
 * @param {number} x canvas-space x
 * @param {number} y canvas-space y
 * @returns {object|null}
 */
export function hitTestHotspots(hotspots, x, y) {
    if (!Array.isArray(hotspots)) return null;
    for (let i = hotspots.length - 1; i >= 0; i--) {
        const h = hotspots[i];
        if (!h) continue;
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
}

export class TooltipController {
    /**
     * @param {object} [opts]
     * @param {HTMLElement} [opts.root=document.body] element that receives the teach-mode class
     * @param {HTMLElement} [opts.container=document.body] element the popover is appended to
     * @param {number} [opts.holdMs=1000]
     * @param {(key:string)=>({title:string,short:string,long:string}|null)} [opts.resolve]
     * @param {HTMLCanvasElement} [opts.canvas] canvas whose hotspots should be honoured
     * @param {()=>Array} [opts.getHotspots] returns the canvas hotspot regions
     */
    constructor(opts = {}) {
        this.root = opts.root || document.body;
        this.container = opts.container || document.body;
        this.holdMs = opts.holdMs !== undefined ? opts.holdMs : HOLD_MS;
        this.moveTolerancePx = opts.moveTolerancePx !== undefined ? opts.moveTolerancePx : MOVE_TOLERANCE_PX;
        this.resolve = typeof opts.resolve === 'function' ? opts.resolve : getHelpText;
        this.canvas = opts.canvas || null;
        this.getHotspots = typeof opts.getHotspots === 'function' ? opts.getHotspots : null;

        this.teaching = false;
        this.enabled = true;

        // State
        this._pending = null;       // { key, el }
        this._sourceEl = null;      // DOM element currently tracked
        this._canvasKey = null;     // hotspot id currently under the canvas pointer
        this._timer = 0;
        this._sx = 0; this._sy = 0; // anchor position (cancellation origin)
        this._px = 0; this._py = 0; // latest pointer position

        this._build();
        this._bind();
    }

    // ───────────────────────────── Public API ─────────────────────────────

    /** Pinned teaching mode: no hold delay + highlight outlines. */
    setTeaching(on) {
        this.teaching = !!on;
        if (this.root && this.root.classList) {
            this.root.classList.toggle('teach-mode', this.teaching);
        }
        if (!this.teaching) this.hide();
    }

    /** Enables/disables the whole controller (e.g. outside DYNAMICS mode). */
    setEnabled(on) {
        this.enabled = !!on;
        if (!this.enabled) this.hide();
    }

    /** @returns {boolean} whether a popover is currently visible. */
    isVisible() {
        return !!(this._el && this._el.classList.contains('is-visible'));
    }

    /** Force-show a popover for `key` at viewport coords. */
    show(key, x, y) {
        const info = this.resolve ? this.resolve(key) : null;
        if (!info) return false;
        this._fill(info);
        this._el.classList.add('is-visible');
        this._position(x, y);
        return true;
    }

    /** Hide the popover and cancel any pending hold. */
    hide() {
        this._cancelHold();
        if (this._el) this._el.classList.remove('is-visible');
    }

    destroy() {
        this._cancelHold();
        this._unbind();
        if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
        this._el = null;
    }

    // ───────────────────────────── DOM build ─────────────────────────────

    _build() {
        const el = document.createElement('div');
        el.className = 'dyn-tooltip';
        el.setAttribute('role', 'tooltip');
        el.innerHTML =
            '<div class="dyn-tooltip-title"></div>' +
            '<div class="dyn-tooltip-short"></div>' +
            '<div class="dyn-tooltip-long"></div>';
        this.container.appendChild(el);
        this._el = el;
        this._titleEl = el.querySelector('.dyn-tooltip-title');
        this._shortEl = el.querySelector('.dyn-tooltip-short');
        this._longEl = el.querySelector('.dyn-tooltip-long');
    }

    _fill(info) {
        this._titleEl.textContent = info.title || '';
        this._shortEl.textContent = info.short || '';
        this._longEl.textContent = info.long || '';
    }

    _position(x, y) {
        const pad = 12;
        const gap = 16;
        // Make measurable without a flash: element keeps its size while hidden.
        const w = this._el.offsetWidth || 260;
        const h = this._el.offsetHeight || 120;
        let left = x + gap;
        let top = y + gap;
        if (left + w + pad > window.innerWidth) left = Math.max(pad, x - w - gap);
        if (top + h + pad > window.innerHeight) top = Math.max(pad, y - h - gap);
        this._el.style.left = `${Math.round(left)}px`;
        this._el.style.top = `${Math.round(top)}px`;
    }

    // ───────────────────────────── Hold logic ─────────────────────────────

    _startHold(key, x, y, el) {
        this._cancelHold();
        this._sx = x; this._sy = y; this._px = x; this._py = y;
        this._pending = { key, el };
        if (this.teaching || this.holdMs <= 0) {
            this.show(key, x, y);
            return;
        }
        this._timer = setTimeout(() => {
            this._timer = 0;
            if (this._pending && this._pending.key === key) {
                this.show(key, this._px, this._py);
            }
        }, this.holdMs);
    }

    _cancelHold() {
        if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
        this._pending = null;
    }

    // ───────────────────────────── Event wiring ─────────────────────────────

    _bind() {
        this._onOver = (e) => {
            if (!this.enabled) return;
            const t = e.target;
            if (!t || !t.closest || t === this._el) return;
            const el = t.closest('[data-help]');
            if (!el || el === this._el) return;
            if (this._sourceEl === el) return;
            this._sourceEl = el;
            this._startHold(el.getAttribute('data-help'), e.clientX, e.clientY, el);
        };

        this._onOut = (e) => {
            const t = e.target;
            if (!t || !t.closest) return;
            const el = t.closest('[data-help]');
            if (!el) return;
            if (this._sourceEl === el) {
                this._sourceEl = null;
                this.hide();
            }
        };

        this._onMove = (e) => {
            this._px = e.clientX; this._py = e.clientY;
            if (e.buttons) { this._sourceEl = null; this.hide(); return; }
            if (this.teaching) return;
            if (this._pending && Math.hypot(e.clientX - this._sx, e.clientY - this._sy) > this.moveTolerancePx) {
                this._sourceEl = null;
                this.hide();
            }
        };

        this._onFocusIn = (e) => {
            if (!this.enabled) return;
            const t = e.target;
            if (!t || !t.closest) return;
            const el = t.closest('[data-help]');
            if (!el) return;
            const r = el.getBoundingClientRect();
            this.show(el.getAttribute('data-help'), r.left + r.width / 2, r.bottom);
        };

        this._onFocusOut = () => this.hide();

        this._onScroll = () => this.hide();

        document.addEventListener('pointerover', this._onOver, true);
        document.addEventListener('pointerout', this._onOut, true);
        document.addEventListener('pointermove', this._onMove, true);
        document.addEventListener('focusin', this._onFocusIn, true);
        document.addEventListener('focusout', this._onFocusOut, true);
        window.addEventListener('scroll', this._onScroll, true);

        if (this.canvas && this.getHotspots) {
            this._onCanvasMove = (e) => {
                if (!this.enabled) return;
                if (e.buttons) { this._canvasKey = null; this.hide(); return; }
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const hit = hitTestHotspots(this.getHotspots() || [], x, y);
                const key = hit ? hit.id : null;
                if (key === this._canvasKey) return;
                this._canvasKey = key;
                this.hide();
                if (key) this._startHold(key, e.clientX, e.clientY, this.canvas);
            };
            this._onCanvasLeave = () => {
                this._canvasKey = null;
                this.hide();
            };
            this.canvas.addEventListener('pointermove', this._onCanvasMove);
            this.canvas.addEventListener('pointerleave', this._onCanvasLeave);
        }
    }

    _unbind() {
        document.removeEventListener('pointerover', this._onOver, true);
        document.removeEventListener('pointerout', this._onOut, true);
        document.removeEventListener('pointermove', this._onMove, true);
        document.removeEventListener('focusin', this._onFocusIn, true);
        document.removeEventListener('focusout', this._onFocusOut, true);
        window.removeEventListener('scroll', this._onScroll, true);
        if (this.canvas) {
            if (this._onCanvasMove) this.canvas.removeEventListener('pointermove', this._onCanvasMove);
            if (this._onCanvasLeave) this.canvas.removeEventListener('pointerleave', this._onCanvasLeave);
        }
    }
}
