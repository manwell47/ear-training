/**
 * @file TheoryPanel.js
 * @description Didactic theory surface for the Dynamic Range lab (WS-L / E2).
 *
 * Two responsibilities:
 *   1. Render the `DYNAMICS_THEORY` sections as readable cards (concept + "prueba
 *      esto").
 *   2. For the ADSR section, draw the attack/decay/sustain/release envelope as an
 *      inline SVG and wire a LIVE attack/release demo to the lab's real
 *      parameters, so the shape (and the sound) react as the user drags.
 *
 * The pure geometry helpers (`adsrVertices`, `buildAdsrPath`) are exported and
 * unit-testable; the class only touches the DOM when instantiated with a
 * container, keeping the module import-safe under Node.
 */

/** Illustrative constants for the parts of the envelope the lab does not expose. */
export const ADSR_DEFAULTS = Object.freeze({
    width: 320,
    height: 150,
    pad: 22,
    attackMs: 10,
    decayMs: 90,
    holdMs: 0,
    sustainLevel: 0.6,
    releaseMs: 120,
    maxAttackMs: 300,
    maxReleaseMs: 2000,
    maxDecayMs: 400,
    maxHoldMs: 500
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Perceptual (square-root) normalisation so short times still read on screen. */
function sqrtScale(value, min, max) {
    const lo = Math.sqrt(Math.max(0, min));
    const hi = Math.sqrt(Math.max(lo + 1e-9, max));
    return clamp01((Math.sqrt(Math.max(0, value)) - lo) / (hi - lo));
}

/**
 * Computes the 5 ADSR corner points (px) for a given parameter set. Attack and
 * release shrink/grow with the real knobs; decay/hold/sustain are schematic.
 * @param {object} [opts] attackMs/decayMs/holdMs/releaseMs/sustainLevel/max*
 * @param {object} [dims] width/height/pad overrides
 * @returns {{points:Array<{x:number,y:number,label:string}>, baseY:number, topY:number, sustainY:number, fractions:object}}
 */
export function adsrVertices(opts = {}, dims = {}) {
    const width = dims.width ?? ADSR_DEFAULTS.width;
    const height = dims.height ?? ADSR_DEFAULTS.height;
    const pad = dims.pad ?? ADSR_DEFAULTS.pad;

    const attackMs = opts.attackMs ?? ADSR_DEFAULTS.attackMs;
    const releaseMs = opts.releaseMs ?? ADSR_DEFAULTS.releaseMs;
    const decayMs = opts.decayMs ?? ADSR_DEFAULTS.decayMs;
    const holdMs = opts.holdMs ?? ADSR_DEFAULTS.holdMs;
    const sustainLevel = clamp01(opts.sustainLevel ?? ADSR_DEFAULTS.sustainLevel);

    const maxAttack = opts.maxAttackMs ?? ADSR_DEFAULTS.maxAttackMs;
    const maxRelease = opts.maxReleaseMs ?? ADSR_DEFAULTS.maxReleaseMs;
    const maxDecay = opts.maxDecayMs ?? ADSR_DEFAULTS.maxDecayMs;
    const maxHold = opts.maxHoldMs ?? ADSR_DEFAULTS.maxHoldMs;

    const innerW = width - 2 * pad;
    const innerH = height - 2 * pad;
    const baseY = height - pad;
    const topY = pad;
    const sustainY = baseY - sustainLevel * innerH;

    let aW = 0.08 + 0.30 * sqrtScale(attackMs, 0.1, maxAttack);
    let dW = 0.10 + 0.14 * sqrtScale(decayMs, 0, maxDecay);
    let sW = 0.16 + 0.10 * sqrtScale(holdMs, 0, maxHold);
    let rW = 0.08 + 0.30 * sqrtScale(releaseMs, 10, maxRelease);

    const total = aW + dW + sW + rW;
    if (total > 1) { const k = 1 / total; aW *= k; dW *= k; sW *= k; rW *= k; }

    const x0 = pad;
    const x1 = x0 + aW * innerW;
    const x2 = x1 + dW * innerW;
    const x3 = x2 + sW * innerW;
    const x4 = x3 + rW * innerW;

    const points = [
        { x: x0, y: baseY, label: '' },
        { x: x1, y: topY, label: 'A' },
        { x: x2, y: sustainY, label: 'D' },
        { x: x3, y: sustainY, label: 'S' },
        { x: x4, y: baseY, label: 'R' }
    ];
    return { points, baseY, topY, sustainY, sustainLevel, fractions: { attack: aW, decay: dW, sustain: sW, release: rW } };
}

/**
 * Builds an SVG path `d` string from ADSR vertices (polyline).
 * @param {{points:Array<{x:number,y:number}>}|Array<{x:number,y:number}>} vertices
 * @returns {string}
 */
export function buildAdsrPath(vertices) {
    const pts = (vertices && vertices.points) || vertices || [];
    if (!pts.length) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Renders the theory cards (and the interactive ADSR block) into a container. */
export class TheoryPanel {
    /**
     * @param {object} opts
     * @param {HTMLElement} opts.container
     * @param {Array<object>} opts.sections  DYNAMICS_THEORY entries
     * @param {() => object} [opts.getParams]
     * @param {(partial: object) => void} [opts.onParamChange]
     */
    constructor({ container, sections, getParams, onParamChange } = {}) {
        this.container = container || null;
        this.sections = Array.isArray(sections) ? sections : [];
        this.getParams = typeof getParams === 'function' ? getParams : () => ({});
        this.onParamChange = typeof onParamChange === 'function' ? onParamChange : () => { };
        this._adsr = null;   // live SVG handles
        this._sliders = null;
        this._rendered = false;
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';
        this._rendered = true;

        const header = document.createElement('div');
        header.className = 'theory-header';
        header.innerHTML = '<span class="theory-kicker">Teoría</span>'
            + '<h3>Fundamentos del rango dinámico</h3>'
            + '<p>Lee cada bloque y escucha: la fuente sigue sonando, así que puedes probar los cambios en el acto.</p>';
        this.container.appendChild(header);

        const list = document.createElement('div');
        list.className = 'theory-list';
        this.sections.forEach((sec) => list.appendChild(this._renderSection(sec)));
        this.container.appendChild(list);

        this.setParams(this.getParams());
    }

    _renderSection(sec) {
        const card = document.createElement('article');
        card.className = 'theory-card';
        card.dataset.theoryId = sec.id;

        const h = document.createElement('h4');
        h.className = 'theory-title';
        h.textContent = sec.title || '';
        card.appendChild(h);

        const concept = document.createElement('p');
        concept.className = 'theory-concept';
        concept.textContent = sec.concept || '';
        card.appendChild(concept);

        if (Array.isArray(sec.bullets) && sec.bullets.length) {
            const ul = document.createElement('ul');
            ul.className = 'theory-bullets';
            sec.bullets.forEach((b) => {
                const li = document.createElement('li');
                li.textContent = b;
                ul.appendChild(li);
            });
            card.appendChild(ul);
        }

        if (sec.adsr) card.appendChild(this._buildAdsrDemo());

        if (sec.tryThis) {
            const t = document.createElement('p');
            t.className = 'theory-try';
            t.textContent = `Prueba esto: ${sec.tryThis}`;
            card.appendChild(t);
        }
        return card;
    }

    /** Builds the SVG envelope + attack/release sliders (wired to the lab). */
    _buildAdsrDemo() {
        const wrap = document.createElement('div');
        wrap.className = 'adsr-demo';

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'adsr-svg');
        svg.setAttribute('viewBox', `0 0 ${ADSR_DEFAULTS.width} ${ADSR_DEFAULTS.height}`);
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Curva de envolvente ADSR (ataque, decaimiento, sostenido, relajación)');

        // Baseline (silencio).
        const base = document.createElementNS(SVG_NS, 'line');
        base.setAttribute('x1', String(ADSR_DEFAULTS.pad));
        base.setAttribute('x2', String(ADSR_DEFAULTS.width - ADSR_DEFAULTS.pad));
        base.setAttribute('y1', String(ADSR_DEFAULTS.height - ADSR_DEFAULTS.pad));
        base.setAttribute('y2', String(ADSR_DEFAULTS.height - ADSR_DEFAULTS.pad));
        base.setAttribute('class', 'adsr-baseline');
        svg.appendChild(base);

        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('class', 'adsr-path');
        svg.appendChild(path);

        // One label + one dot per stage anchor (A/D/S/R).
        const dots = [];
        const labels = [];
        ['A', 'D', 'S', 'R'].forEach((name) => {
            const dot = document.createElementNS(SVG_NS, 'circle');
            dot.setAttribute('class', `adsr-dot adsr-dot-${name.toLowerCase()}`);
            dot.setAttribute('r', '4');
            svg.appendChild(dot);

            const text = document.createElementNS(SVG_NS, 'text');
            text.setAttribute('class', `adsr-label adsr-label-${name.toLowerCase()}`);
            text.textContent = name;
            svg.appendChild(text);

            dots.push(dot);
            labels.push(text);
        });
        wrap.appendChild(svg);

        const legend = document.createElement('div');
        legend.className = 'adsr-legend';
        legend.innerHTML = '<span><b>A</b> Attack · <b>D</b> Decay · <b>S</b> Sustain · <b>R</b> Release</span>';
        wrap.appendChild(legend);

        const sliderRow = document.createElement('div');
        sliderRow.className = 'adsr-sliders';

        const mkSlider = (key, label, min, max, step) => {
            const field = document.createElement('label');
            field.className = 'adsr-field';
            const span = document.createElement('span');
            span.textContent = label;
            const val = document.createElement('span');
            val.className = 'adsr-value';
            const input = document.createElement('input');
            input.type = 'range';
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.dataset.adsrKey = key;
            input.addEventListener('input', () => {
                this.onParamChange({ [key]: parseFloat(input.value) });
            });
            field.appendChild(span);
            field.appendChild(val);
            field.appendChild(input);
            sliderRow.appendChild(field);
            return { input, val };
        };

        const attack = mkSlider('attackMs', 'Attack (ms)', 0.1, 300, 0.1);
        const release = mkSlider('releaseMs', 'Release (ms)', 10, 2000, 1);
        wrap.appendChild(sliderRow);

        this._adsr = { path, dots, labels };
        this._sliders = { attackMs: attack, releaseMs: release };
        return wrap;
    }

    /** Pushes the current lab params into the sliders + redraws the envelope. */
    setParams(params = {}) {
        const p = params || {};
        if (this._sliders) {
            if (typeof p.attackMs === 'number') this._sliders.attackMs.input.value = String(p.attackMs);
            if (typeof p.releaseMs === 'number') this._sliders.releaseMs.input.value = String(p.releaseMs);
            this._sliders.attackMs.val.textContent = `${Number(this._sliders.attackMs.input.value).toFixed(1)} ms`;
            this._sliders.releaseMs.val.textContent = `${Math.round(Number(this._sliders.releaseMs.input.value))} ms`;
        }
        if (this._adsr) {
            const v = adsrVertices({
                attackMs: p.attackMs,
                releaseMs: p.releaseMs,
                decayMs: p.decayMs,
                holdMs: p.holdMs,
                sustainLevel: p.sustainLevel
            });
            this._adsr.path.setAttribute('d', buildAdsrPath(v));
            const anchors = v.points.slice(1); // skip the origin
            this._adsr.dots.forEach((dot, i) => {
                const pt = anchors[i];
                if (!pt) return;
                dot.setAttribute('cx', pt.x.toFixed(2));
                dot.setAttribute('cy', pt.y.toFixed(2));
            });
            this._adsr.labels.forEach((text, i) => {
                const pt = anchors[i];
                if (!pt) return;
                text.setAttribute('x', (pt.x + 6).toFixed(2));
                text.setAttribute('y', (pt.y - 6).toFixed(2));
            });
        }
    }

    /** Removes the rendered content (leaves the container element itself). */
    destroy() {
        if (this.container) this.container.innerHTML = '';
        this._adsr = null;
        this._sliders = null;
        this._rendered = false;
    }
}
