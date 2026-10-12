/**
 * @file DynamicsLab.js
 * @description Orchestration layer for the DYNAMIC RANGE module.
 *
 * The Lab is the "brain" that sits between the didactic content
 * (`DynamicsMatrix`), the DSP engine (`DynamicsEngine` via an injected adapter),
 * the Pro-C2 canvas (`CompressorUI`) and the scoring engine (`ScoringEngine`).
 * It intentionally owns NO DOM and NO AudioContext: everything is reached
 * through a small, optional adapter so the module stays unit-testable in Node
 * and can never leak audio nodes on its own.
 *
 * Three sub-modes behind one panel (see plans/DYNAMIC_RANGE_PLAN.md §3):
 *   - EXPLORE   : free sandbox. Load any scenario stem + compressor type, dial
 *                 every control, A/B bypass, hear sidechain. Unscored.
 *   - CHALLENGE : the 10-step curriculum. Scored through ScoringEngine.
 *   - CASE      : guided recipes with a goal sentence and a light self-check.
 *
 * Contracts honoured here:
 *   - Rule §2: every loaded track comes from AUDIO_SOURCES / MULTITRACK_SESSIONS.
 *   - Rule §1: challenge targets are real DSP parameter sets, never heuristics.
 *   - The Color switch defaults OFF so the neutral transfer curve is studied first.
 *
 * The `audio` adapter may implement (all optional):
 *   applyParams(params)         push a full sanitized parameter set to the DSP
 *   setStyle(style, opts)       select a compressor family (engine applies topology)
 *   setColor(on)                gate the type's harmonic colouration
 *   setBypass(on)               A/B true-bypass
 *   reset()                     clear detector/envelope state
 *   loadSource(sourceId)        -> Promise, load a single stem/source
 *   loadSessionStem(sessionId, stemId) -> Promise, load a multitrack stem (sidechain key)
 */

import {
    COMPRESSOR_TYPES,
    DYNAMICS_BUSES,
    DYNAMICS_CHALLENGES,
    DYNAMICS_LESSONS,
    DYNAMICS_SIDECHAIN_CASES,
    DYNAMICS_SOURCE_FAMILY_LABELS,
    DYNAMICS_SOURCE_RECIPES,
    DYNAMICS_THEORY,
    getScenarioById,
    listScenarios,
    resolveCompressorType
} from './DynamicsMatrix.js?v=84';

import {
    DEFAULT_DYNAMICS_PARAMS,
    sanitizeParams
} from './dynamics-math.js?v=84';

import {
    AUDIO_SOURCES,
    MULTITRACK_SESSIONS
} from './AudioResourceManager.js?v=84';

import { ScoringEngine } from './ScoringEngine.js?v=84';

/** The four didactic sub-modes. */
export const DYNAMICS_LAB_MODES = Object.freeze({
    EXPLORE: 'explore',
    THEORY: 'theory',
    CHALLENGE: 'challenge',
    CASE: 'case'
});

/** Events emitted by the Lab (subscribe with `lab.on(event, cb)`). */
export const DYNAMICS_LAB_EVENTS = Object.freeze({
    MODE_CHANGED: 'modeChanged',
    SCENARIO_LOADED: 'scenarioLoaded',
    CHALLENGE_STARTED: 'challengeStarted',
    RESULT: 'result',
    TYPE_CHANGED: 'typeChanged',
    COLOR_CHANGED: 'colorChanged',
    BYPASS_CHANGED: 'bypassChanged',
    CASE_LOADED: 'caseLoaded',
    CASE_CHECKED: 'caseChecked',
    CHANGED: 'changed'
});

/**
 * Maps a curriculum control key (as used in `DYNAMICS_CHALLENGES[].unlocked`
 * and `weights`) to the DOM element id that should be revealed/enabled for it.
 * Consumed by W7 integration for progressive disclosure.
 */
export const DYNAMICS_CONTROL_DOM_IDS = Object.freeze({
    threshold: 'dynThreshold',
    ratio: 'dynRatio',
    knee: 'dynKnee',
    attack: 'dynAttack',
    release: 'dynRelease',
    hold: 'dynHold',
    makeupDb: 'dynMakeup',
    mix: 'dynMix',
    style: 'dynTypeChips',
    sidechain: 'dynSidechainSelect',
    mode: 'dynModeSelect',
    detector: 'dynDetectorSelect',
    feedback: 'dynFeedbackSelect',
    upwardEnabled: 'dynUpwardEnable',
    upwardThresholdDb: 'dynUpwardThreshold',
    upwardRatio: 'dynUpwardRatio'
});

/** Every controllable key, in a stable order. */
export const DYNAMICS_ALL_CONTROL_KEYS = Object.freeze(Object.keys(DYNAMICS_CONTROL_DOM_IDS));

/**
 * Guided Case Studies. Each recipe points at a real scenario (single source of
 * truth), states a goal in plain language and lists the parameter bounds that
 * count as "correct enough" for the light self-check (Explore/Case are unscored).
 */
export const DYNAMICS_CASE_STUDIES = [
    {
        id: 'case_kick_soft_control',
        title: 'Domar un bombo de cola larga',
        lessonId: 'time',
        scenarioId: 'kick_soft',
        goal: 'Controla un bombo blando y con cola sin que pierda cuerpo ni se vuelva un churro.',
        tips: [
            'Con una cola larga el release corto "bombea"; dale tiempo a recuperar.',
            'Deja que el ataque conserve la maza y trabaja solo la cola.'
        ],
        checks: [
            { param: 'attackMs', min: 5, note: 'Ataque que respeta el transitorio del parche.' },
            { param: 'ratio', min: 1.5, max: 4, note: 'Ratio moderado: doma la cola sin aplastar.' },
            { param: 'releaseMs', min: 120, note: 'Release largo: evita el bombeo entre golpes.' }
        ]
    },
    {
        id: 'case_kick_transient',
        title: 'Conservar la pegada del bombo',
        lessonId: 'time',
        scenarioId: 'kick_tight',
        goal: 'Comprime la maza del bombo sin aplastar el transitorio: el golpe debe seguir "vivo".',
        tips: [
            'Un ataque muy rápido se come la maza; deja pasar unos milisegundos.',
            'No busques más de 4-6 dB de reducción en los picos.'
        ],
        checks: [
            { param: 'attackMs', min: 2, max: 6, note: 'Ataque en la ventana que conserva el transitorio.' },
            { param: 'thresholdDb', min: -18, max: -10, note: 'Umbral que solo toca los picos.' },
            { param: 'ratio', min: 3, max: 6, note: 'Control firme sin llegar a limitar.' }
        ]
    },
    {
        id: 'case_drumbus_glue',
        title: 'Pegar el drum bus (glue)',
        lessonId: 'families',
        scenarioId: 'drumbus_glue',
        goal: 'Une toda la batería en una sola imagen sin destruir los transitorios.',
        tips: [
            'Ratio bajo y release lento: la receta clásica del gluing.',
            'El tipo Bus está diseñado exactamente para esto.'
        ],
        checks: [
            { param: 'style', equals: 'bus', note: 'Un compresor de bus para la suma.' },
            { param: 'ratio', max: 3, note: 'Ratio bajo (≈2:1) para unir, no domar.' },
            { param: 'attackMs', min: 20, note: 'Ataque lento: deja pasar los transitorios.' },
            { param: 'releaseMs', min: 200, note: 'Release lento para una recuperación "pegajosa".' }
        ]
    },
    {
        id: 'case_bass_duck',
        title: 'Bajo que cede ante el bombo',
        lessonId: 'sidechain',
        scenarioId: 'bass_duck_kick',
        goal: 'Haz que el bajo se aparte cada vez que golpea el bombo usando sidechain.',
        tips: [
            'El disparador debe ser el bombo, nunca el propio bajo.',
            'Un release demasiado largo deja el bajo "respirando" entre golpes.'
        ],
        checks: [
            { param: 'sidechain', equals: true, note: 'Disparador externo activado.' },
            { param: 'releaseMs', min: 80, max: 260, note: 'Release que recupera antes del siguiente golpe.' }
        ]
    },
    {
        id: 'case_vox_even',
        title: 'Voz consistente e invisible',
        lessonId: 'topology',
        scenarioId: 'vox_even',
        goal: 'Iguala el nivel de la voz sin que se note el compresor.',
        tips: [
            'El opto con codo suave es el favorito para voces.',
            'Codo amplio = transición sedosa hacia la compresión.'
        ],
        checks: [
            { param: 'style', equals: 'opto', note: 'Carácter óptico, suave y musical.' },
            { param: 'kneeDb', min: 10, note: 'Codo suave para una entrada natural.' }
        ]
    },
    {
        id: 'case_vox_upward',
        title: 'Despertar la voz susurrada',
        lessonId: 'upward',
        scenarioId: 'vox_upward',
        goal: 'En lugar de aplastar los picos, sube las partes débiles para igualar la voz.',
        tips: [
            'El umbral al alza define el techo de la zona "débil".',
            'Ratios de 2:1 a 4:1 evitan un sonido antinatural.'
        ],
        checks: [
            { param: 'upwardEnabled', equals: true, note: 'Compresión al alza activada.' },
            { param: 'upwardThresholdDb', min: -48, max: -30, note: 'Umbral que abraza la parte discreta.' }
        ]
    },
    {
        id: 'case_master_glue',
        title: 'Master transparente',
        lessonId: 'families',
        scenarioId: 'master_glue',
        goal: 'Une la mezcla completa con una compresión de bus transparente.',
        tips: [
            'Detector RMS + ratio bajo = cohesión sin bombeo.',
            'Busca solo 2-3 dB de reducción media.'
        ],
        checks: [
            { param: 'style', equals: 'vca', note: 'VCA limpio para el mix completo.' },
            { param: 'detector', equals: 'rms', note: 'Detector de energía media.' },
            { param: 'ratio', max: 3, note: 'Ratio bajo tipo 2:1.' }
        ]
    },
    {
        id: 'case_gtr_hold',
        title: 'Sostener la guitarra rítmica',
        lessonId: 'time',
        scenarioId: 'gtr_hold',
        goal: 'Mantén la guitarra rítmica constante sin que el compresor se oiga "bombear".',
        tips: [
            'Release lento = sostén; release corto = bombeo audible.',
            'Evita ratios altos: la guitarra pierde cuerpo rápido.'
        ],
        checks: [
            { param: 'releaseMs', min: 100, note: 'Release largo para un sostén natural.' },
            { param: 'attackMs', min: 3, max: 60, note: 'Ataque que no aplasta el ataque de la púa.' },
            { param: 'ratio', max: 5, note: 'Compresión moderada, sin exprimir.' }
        ]
    },
    {
        id: 'case_master_varimu',
        title: 'Pegamento cálido en el master',
        lessonId: 'families',
        scenarioId: 'master_varimu',
        goal: 'Usa el carácter Vari-Mu para unir la mezcla con calidez, no con fuerza.',
        tips: [
            'Vari-Mu comprime más cuanto más señal: piensa "codo natural".',
            'Codo suave + ratio bajo = cohesión sin ensuciar.'
        ],
        checks: [
            { param: 'style', equals: 'varimu', note: 'Carácter Vari-Mu para el pegado cálido.' },
            { param: 'ratio', max: 2.5, note: 'Ratio bajo: la suma solo se acaricia.' },
            { param: 'kneeDb', min: 8, note: 'Codo suave para una transición sedosa.' }
        ]
    },
    {
        id: 'case_bass_pocket',
        title: 'Bajo en el bolsillo del bombo',
        lessonId: 'sidechain',
        scenarioId: 'bass_duck_kick',
        goal: 'Ajusta la ruta sidechain para que el bajo ceda justo en el golpe y vuelva antes del siguiente.',
        tips: [
            'Ataque corto (5-15 ms) para reaccionar al golpe; nada de dejarlo tardar.',
            'Si el release se pasa, el bajo llega tarde al siguiente tiempo.'
        ],
        checks: [
            { param: 'sidechain', equals: true, note: 'Ruta externa activada: el bombo manda.' },
            { param: 'attackMs', max: 15, note: 'Ataque rápido ante el transitorio del bombo.' },
            { param: 'releaseMs', min: 80, max: 260, note: 'Recupera dentro del pulso, sin "respirar" de más.' }
        ]
    }
];

/** Neutral parameter set used when the Explore sandbox or a Challenge opens. */
export const DEFAULT_EXPLORE_PARAMS = Object.freeze(
    sanitizeParams({}, DEFAULT_DYNAMICS_PARAMS)
);

/**
 * Resolves a scenario id to an enriched, UI-ready descriptor.
 * Verifies the source and (optional) sidechain references against the real
 * asset catalogues so nothing can point at a missing track.
 * @param {string} id
 * @returns {object|null}
 */
export function describeScenario(id) {
    const scenario = getScenarioById(id);
    if (!scenario) return null;
    const src = AUDIO_SOURCES.find((s) => s.id === scenario.sourceId) || null;

    let sidechain = null;
    if (scenario.sidechain) {
        const sess = MULTITRACK_SESSIONS.find((s) => s.id === scenario.sidechain.sessionId) || null;
        const stem = sess
            ? sess.stems.find((st) => st.id === scenario.sidechain.sourceStemId) || null
            : null;
        sidechain = {
            sessionId: scenario.sidechain.sessionId,
            sessionName: sess ? sess.displayName : null,
            stemId: scenario.sidechain.sourceStemId,
            stemName: stem ? stem.displayName : null,
            exists: !!(sess && stem)
        };
    }

    return {
        ...scenario,
        sourceName: src ? src.displayName : null,
        sourceExists: !!src,
        sidechain
    };
}

/** @returns {Array<object>} every scenario grouped by bus, resolved & validated. */
export function listExploreScenarios() {
    return DYNAMICS_BUSES.map((bus) => ({
        bus: bus.id,
        label: bus.label,
        scenarios: (listScenarios().filter((s) => s.bus === bus.id)).map((s) => describeScenario(s.id))
    }));
}

/**
 * Resolves the didactic sidechain presets against the real asset catalogue.
 * Returns only the presets whose session, target stem AND key stem all exist, so
 * the UI can never offer a sidechain route that cannot actually be wired (the
 * engine requires target + key to be stems of the SAME session).
 * @param {string} [sessionId] when given, only presets of that session are returned
 * @returns {Array<object>}
 */
export function describeSidechainCases(sessionId = null) {
    return DYNAMICS_SIDECHAIN_CASES.map((preset) => {
        const sess = MULTITRACK_SESSIONS.find((s) => s.id === preset.sessionId) || null;
        const target = sess ? sess.stems.find((st) => st.id === preset.targetStemId) || null : null;
        const key = sess ? sess.stems.find((st) => st.id === preset.keyStemId) || null : null;
        return {
            ...preset,
            sessionName: sess ? sess.displayName : null,
            targetName: target ? target.displayName : null,
            keyName: key ? key.displayName : null,
            exists: !!(sess && target && key)
        };
    }).filter((p) => p.exists && (!sessionId || p.sessionId === sessionId));
}

/**
 * Resolves the CONTEXTUAL compression recipes for a selected Fuente track.
 *
 * Maps the source's `acousticClass` (family) to its recipe bank. A source that
 * is NOT in AUDIO_SOURCES is a USER-LOADED (custom) track, so it falls back to
 * the 'mastering' bank: compressing a full song is a 2-bus / mastering intent,
 * not an instrument intent. Unknown-but-catalogued classes fall back to
 * 'generic'.
 *
 * Pure and DOM-free (safe under Node). Every returned recipe carries a
 * sanitized `params` set so it can be pushed straight to the Lab/DSP.
 *
 * @param {string} sourceId
 * @returns {{sourceId:string, sourceName:(string|null), acousticClass:(string|null),
 *            family:string, familyLabel:string, isCustom:boolean,
 *            recipes:Array<{id:string,label:string,context:string,params:object}>}}
 */
export function suggestDynamicsForSource(sourceId) {
    const src = AUDIO_SOURCES.find((s) => s.id === sourceId) || null;
    const acousticClass = src ? (src.acousticClass || 'generic') : null;

    let family;
    if (!src) family = 'mastering';
    else if (DYNAMICS_SOURCE_RECIPES[acousticClass]) family = acousticClass;
    else family = 'generic';

    const recipes = (DYNAMICS_SOURCE_RECIPES[family] || []).map((recipe) => ({
        ...recipe,
        params: sanitizeParams(recipe.params || {}, DEFAULT_DYNAMICS_PARAMS)
    }));

    return {
        sourceId,
        sourceName: src ? src.displayName : null,
        acousticClass,
        family,
        familyLabel: DYNAMICS_SOURCE_FAMILY_LABELS[family] || family,
        isCustom: !src,
        recipes
    };
}

/**
 * Traduce el `breakdown` de `ScoringEngine.evaluateDynamics()` en un checklist
 * CUALITATIVO (sin puntos ni porcentajes) para el sub-modo "Práctica Guiada".
 * Pura y DOM-free: apta para verificación autónoma en Node.
 *
 * @param {Array<{key:string, weight:number, score:number}>} breakdown
 * @returns {Array<{key:string, state:'ok'|'close'|'miss', text:string}>}
 */
export function describePracticeAchievements(breakdown) {
    const PHRASES = {
        thresholdDb: { ok: 'Umbral en rango', close: 'Acercaste el umbral' },
        upwardThresholdDb: { ok: 'Umbral al alza en rango', close: 'Acercaste el umbral al alza' },
        ratio: { ok: 'Ratio en rango', close: 'Ratio casi correcto' },
        upwardRatio: { ok: 'Ratio al alza en rango', close: 'Ratio al alza casi correcto' },
        kneeDb: { ok: 'Codo (knee) bien colocado', close: 'Acercaste el codo' },
        attackMs: { ok: 'Attack adecuado para el transiente', close: 'Attack casi a punto' },
        releaseMs: { ok: 'Release natural', close: 'Release casi natural' },
        holdMs: { ok: 'Hold en su punto', close: 'Acercaste el hold' },
        makeupDb: { ok: 'Makeup compensado', close: 'Acercaste el makeup' },
        mix: { ok: 'Mezcla dry/wet equilibrada', close: 'Mezcla casi equilibrada' },
        style: { ok: 'Familia de compresor correcta', close: 'Familia de compresor casi a punto' },
        sidechain: { ok: 'Disparador de sidechain correcto', close: 'Sidechain casi correcto' },
        detector: { ok: 'Detector correcto', close: 'Detector casi correcto' },
        feedback: { ok: 'Topología (feedback) correcta', close: 'Topología casi correcta' },
        upwardEnabled: { ok: 'Dirección al alza correcta', close: 'Dirección al alza casi correcta' },
        direction: { ok: 'Dirección correcta (arriba/abajo)', close: 'Dirección casi correcta' }
    };
    if (!Array.isArray(breakdown)) return [];
    return breakdown.map((b) => {
        const key = b && b.key ? b.key : 'param';
        const score = b ? Number(b.score) : 0;
        const p = PHRASES[key] || { ok: key, close: key };
        if (score >= 0.99) return { key, state: 'ok', text: p.ok };
        if (score >= 0.5) return { key, state: 'close', text: p.close };
        return { key, state: 'miss', text: `Revisa: ${p.ok}` };
    });
}

export class DynamicsLab {
    /**
     * @param {object} [opts]
     * @param {object} [opts.audio]     engine adapter (see file header). All methods optional.
     * @param {(target:object,guess:object,ctx:object)=>object} [opts.evaluate]
     *        scoring override; defaults to `ScoringEngine.evaluateDynamics`.
     * @param {'explore'|'challenge'|'case'} [opts.mode='explore']
     * @param {string} [opts.scenarioId] initial scenario to load (Explore)
     */
    constructor(opts = {}) {
        this.audio = opts.audio || null;
        this.evaluate = typeof opts.evaluate === 'function' ? opts.evaluate : null;

        this.mode = opts.mode || DYNAMICS_LAB_MODES.EXPLORE;

        // Core state (single source of truth for the UI).
        this.params = sanitizeParams({}, DEFAULT_DYNAMICS_PARAMS);
        this.style = this.params.style;
        this.colorOn = false; // Decision: the clean curve is studied first.
        this.bypass = false;

        // Scenario / curriculum pointers.
        this.activeScenarioId = opts.scenarioId || null;
        this.target = null;           // gold reference for the current scenario
        this.referenceParams = null;  // same as target, kept for A/B reference
        this.challengeIndex = -1;
        this.activeChallengeId = null;
        this.activeCaseId = null;

        /** @type {Map<string, Array<Function>>} */
        this._listeners = new Map();
    }

    // ───────────────────────────── Event bus ─────────────────────────────

    /** @param {string} event @param {Function} cb */
    on(event, cb) {
        if (typeof cb !== 'function') return () => { };
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event).push(cb);
        return () => this.off(event, cb);
    }

    /** @param {string} event @param {Function} cb */
    off(event, cb) {
        const arr = this._listeners.get(event);
        if (!arr) return;
        const i = arr.indexOf(cb);
        if (i >= 0) arr.splice(i, 1);
    }

    /** @param {string} event @param {*} payload */
    emit(event, payload) {
        const arr = this._listeners.get(event);
        if (!arr) return;
        arr.slice().forEach((fn) => {
            try { fn(payload); } catch (e) { console.warn(`[DynamicsLab] listener for "${event}" threw:`, e); }
        });
    }

    // ───────────────────────────── State ─────────────────────────────

    /** @returns {object} a plain, UI-safe snapshot. */
    getState() {
        return {
            mode: this.mode,
            params: this.getParams(),
            style: this.style,
            type: resolveCompressorType(this.style),
            colorOn: this.colorOn,
            bypass: this.bypass,
            activeScenarioId: this.activeScenarioId,
            challengeIndex: this.challengeIndex,
            activeChallengeId: this.activeChallengeId,
            activeCaseId: this.activeCaseId,
            hasTarget: !!this.target
        };
    }

    /** @returns {object} copy of the current parameters. */
    getParams() {
        return { ...this.params };
    }

    /** @param {'explore'|'challenge'|'case'} mode */
    setMode(mode) {
        if (!Object.values(DYNAMICS_LAB_MODES).includes(mode)) return this.mode;
        this.mode = mode;
        this.emit(DYNAMICS_LAB_EVENTS.MODE_CHANGED, mode);
        return this.mode;
    }

    // ───────────────────────── Engine adapter glue ─────────────────────────

    /** Safely invokes an optional adapter method; never throws into the Lab. */
    _call(name, ...args) {
        const fn = this.audio && this.audio[name];
        if (typeof fn !== 'function') return undefined;
        try {
            return fn.apply(this.audio, args);
        } catch (e) {
            console.warn(`[DynamicsLab] audio.${name} failed:`, e);
            return undefined;
        }
    }

    /** Applies a full sanitized set locally and (optionally) on the DSP. */
    _commit(partial, { push = true } = {}) {
        this.params = sanitizeParams({ ...this.params, ...(partial || {}) }, DEFAULT_DYNAMICS_PARAMS);
        this.style = this.params.style;
        if (push) this._call('applyParams', this.params);
        this.emit(DYNAMICS_LAB_EVENTS.CHANGED, this.getState());
        return this.params;
    }

    // ───────────────────────── Parameter setters ─────────────────────────

    /**
     * Merges a partial patch into the parameters, sanitizes it and pushes it.
     * @param {object} [partial]
     * @returns {object} the new full param set
     */
    applyParams(partial = {}) {
        return this._commit(partial, { push: true });
    }

    /**
     * Selects a compressor family and mirrors its honest topology locally.
     * @param {'vca'|'fet'|'opto'|'varimu'|'bus'} style
     * @returns {object} the resolved type record
     */
    setType(style) {
        const id = COMPRESSOR_TYPES[style] ? style : 'vca';
        const rec = resolveCompressorType(id);
        this._call('setStyle', id);
        const engine = rec.engine || {};
        this.params = sanitizeParams(
            {
                ...this.params,
                style: id,
                detector: engine.detector !== undefined ? engine.detector : this.params.detector,
                feedback: engine.feedback !== undefined ? engine.feedback : this.params.feedback
            },
            DEFAULT_DYNAMICS_PARAMS
        );
        this.style = id;
        this.emit(DYNAMICS_LAB_EVENTS.TYPE_CHANGED, rec);
        this.emit(DYNAMICS_LAB_EVENTS.CHANGED, this.getState());
        return rec;
    }

    /** @param {boolean} on enables the type's harmonic colouration. */
    setColor(on) {
        this.colorOn = !!on;
        this._call('setColor', this.colorOn);
        this.params = sanitizeParams({ ...this.params, color: this.colorOn }, DEFAULT_DYNAMICS_PARAMS);
        this.emit(DYNAMICS_LAB_EVENTS.COLOR_CHANGED, this.colorOn);
        return this.colorOn;
    }

    /** @param {boolean} on A/B true-bypass. */
    setBypass(on) {
        this.bypass = !!on;
        // Keep the canonical param set in lock-step. `_commit()`/`applyParams()`
        // push the FULL param object to the DSP, so a stale `bypass:false` here
        // would silently re-enable compression on the very next knob move — the
        // root cause of the reported "el bypass NO FUNCIONA" bug.
        this.params = sanitizeParams({ ...this.params, bypass: this.bypass }, DEFAULT_DYNAMICS_PARAMS);
        this._call('setBypass', this.bypass);
        this.emit(DYNAMICS_LAB_EVENTS.BYPASS_CHANGED, this.bypass);
        return this.bypass;
    }

    /** Resets parameters to the neutral sandbox defaults. */
    resetParams() {
        this.params = sanitizeParams({}, DEFAULT_DYNAMICS_PARAMS);
        this.style = this.params.style;
        this._call('reset');
        this._call('applyParams', this.params);
        this.emit(DYNAMICS_LAB_EVENTS.CHANGED, this.getState());
        return this.getParams();
    }

    // ───────────────────────────── Explore ─────────────────────────────

    /**
     * Loads a scenario's source into the sandbox (unscored). Keeps the current
     * parameters untouched so the user keeps dialling freely.
     * @param {string} scenarioId
     * @returns {Promise<object|null>} the resolved scenario descriptor
     */
    async loadExploreScenario(scenarioId) {
        const info = describeScenario(scenarioId);
        if (!info || !info.sourceExists) return null;
        this.setMode(DYNAMICS_LAB_MODES.EXPLORE);
        this.activeScenarioId = scenarioId;
        this.target = sanitizeParams(info.target || {}, DEFAULT_DYNAMICS_PARAMS);
        this.referenceParams = { ...this.target };
        const p = this._call('loadSource', info.sourceId);
        if (p && typeof p.then === 'function') { try { await p; } catch (e) { console.warn('[DynamicsLab] loadSource failed:', e); } }
        this.emit(DYNAMICS_LAB_EVENTS.SCENARIO_LOADED, info);
        return info;
    }

    /**
     * Loads the external sidechain key for a scenario (e.g. the kick for the
     * bass-duck scenario) and enables the sidechain parameter.
     * @param {string} scenarioId
     * @returns {Promise<object|null>} the sidechain descriptor, or null
     */
    async loadScenarioSidechain(scenarioId = this.activeScenarioId) {
        const info = describeScenario(scenarioId);
        if (!info || !info.sidechain || !info.sidechain.exists) return null;
        const p = this._call(
            'loadSessionStem',
            info.sidechain.sessionId,
            info.sidechain.stemId
        );
        if (p && typeof p.then === 'function') { try { await p; } catch (e) { console.warn('[DynamicsLab] loadSessionStem failed:', e); } }
        this._commit({ sidechain: true }, { push: true });
        return info.sidechain;
    }

    // ───────────────────────────── Challenge ─────────────────────────────

    /** @returns {Array<object>} the ordered 10-step curriculum. */
    getCurriculum() {
        return DYNAMICS_CHALLENGES;
    }

    /**
     * Starts (or restarts) a curriculum step.
     * @param {number} index
     * @returns {Promise<object|null>} `{ challenge, scenario, target, unlocked }`
     */
    async startChallenge(index = 0) {
        const ch = DYNAMICS_CHALLENGES[index];
        if (!ch) return null;
        this.setMode(DYNAMICS_LAB_MODES.CHALLENGE);
        this.challengeIndex = index;
        this.activeChallengeId = ch.id;
        this.activeCaseId = null;

        const scenario = describeScenario(ch.scenarioId);
        this.activeScenarioId = ch.scenarioId;
        this.target = scenario ? sanitizeParams(scenario.target || {}, DEFAULT_DYNAMICS_PARAMS) : null;
        this.referenceParams = this.target ? { ...this.target } : null;

        // Start the user from neutral defaults (they dial in the answer).
        this.params = sanitizeParams({}, DEFAULT_DYNAMICS_PARAMS);
        this.style = this.params.style;
        this._call('reset');
        this._call('applyParams', this.params);

        if (scenario && scenario.sourceExists) {
            const p = this._call('loadSource', scenario.sourceId);
            if (p && typeof p.then === 'function') { try { await p; } catch (e) { console.warn('[DynamicsLab] loadSource failed:', e); } }
            if (scenario.sidechain && scenario.sidechain.exists) {
                // The key is loaded so the user can enable sidechain themselves.
                const sp = this._call('loadSessionStem', scenario.sidechain.sessionId, scenario.sidechain.stemId);
                if (sp && typeof sp.then === 'function') { try { await sp; } catch (e) { console.warn('[DynamicsLab] sidechain load failed:', e); } }
            }
        }

        const payload = {
            index,
            total: DYNAMICS_CHALLENGES.length,
            challenge: ch,
            scenario,
            target: this.target,
            unlocked: this.getUnlockedControls()
        };
        this.emit(DYNAMICS_LAB_EVENTS.CHALLENGE_STARTED, payload);
        this.emit(DYNAMICS_LAB_EVENTS.CHANGED, this.getState());
        return payload;
    }

    /** @returns {object|null} the active challenge record. */
    getChallenge() {
        return DYNAMICS_CHALLENGES[this.challengeIndex] || null;
    }

    /** @returns {Array<string>} control keys revealed for the current step. */
    getUnlockedControls() {
        const ch = this.getChallenge();
        if (!ch || !Array.isArray(ch.unlocked)) return DYNAMICS_ALL_CONTROL_KEYS.slice();
        return ch.unlocked.slice();
    }

    /** @returns {boolean} whether a control key may be edited right now. */
    isControlUnlocked(key) {
        const ch = this.getChallenge();
        if (!ch || !Array.isArray(ch.unlocked)) return true;
        return ch.unlocked.includes(key);
    }

    /** @returns {Array<string>} DOM ids to reveal for the current step. */
    getUnlockedDomIds() {
        return this.getUnlockedControls()
            .map((k) => DYNAMICS_CONTROL_DOM_IDS[k])
            .filter(Boolean);
    }

    /**
     * Scores the user's current (or supplied) parameters against the step target
     * and emits a purely CUALITATIVO achievements checklist (Práctica Guiada:
     * no points, no lives). The numeric score is deliberately not surfaced.
     * @param {object} [guess]
     * @returns {object|null} the scoring result
     */
    submitChallenge(guess) {
        const ch = this.getChallenge();
        if (!ch || !this.target) return null;
        const guessParams = sanitizeParams({ ...this.params, ...(guess || {}) }, DEFAULT_DYNAMICS_PARAMS);
        const result = this._evaluate(this.target, guessParams, {
            mode: DYNAMICS_LAB_MODES.CHALLENGE,
            challenge: ch,
            scenario: describeScenario(ch.scenarioId)
        });
        const achievements = describePracticeAchievements(result && result.breakdown);
        this.emit(DYNAMICS_LAB_EVENTS.RESULT, { challenge: ch, guess: guessParams, target: this.target, result, achievements });
        return result;
    }

    /** Advances to the next curriculum step (no-op past the end). */
    async nextChallenge() {
        const next = this.challengeIndex + 1;
        if (next >= DYNAMICS_CHALLENGES.length) return null;
        return this.startChallenge(next);
    }

    /** @returns {{index:number,total:number,id:string|null}} */
    getProgress() {
        return {
            index: this.challengeIndex,
            total: DYNAMICS_CHALLENGES.length,
            id: this.activeChallengeId
        };
    }

    // ───────────────────────────── Case Studies ─────────────────────────────

    /** @returns {Array<object>} the guided recipes. */
    getCaseStudies() {
        return DYNAMICS_CASE_STUDIES;
    }

    /** @returns {Array<object>} the didactic lesson blocks. */
    getLessons() {
        return DYNAMICS_LESSONS;
    }

    /** @returns {Array<object>} the theoretical blocks (Teoría sub-mode). */
    getTheory() {
        return DYNAMICS_THEORY;
    }

    /**
     * Loads a Case Study's scenario and frames it as a guided recipe.
     * @param {string} caseId
     * @returns {Promise<object|null>} the enriched case descriptor
     */
    async loadCase(caseId) {
        const cs = DYNAMICS_CASE_STUDIES.find((c) => c.id === caseId);
        if (!cs) return null;
        this.setMode(DYNAMICS_LAB_MODES.CASE);
        this.activeCaseId = cs.id;
        this.challengeIndex = -1;
        this.activeChallengeId = null;

        const scenario = describeScenario(cs.scenarioId);
        this.activeScenarioId = cs.scenarioId;
        this.target = scenario ? sanitizeParams(scenario.target || {}, DEFAULT_DYNAMICS_PARAMS) : null;
        this.referenceParams = this.target ? { ...this.target } : null;

        this.params = sanitizeParams({}, DEFAULT_DYNAMICS_PARAMS);
        this.style = this.params.style;
        this._call('reset');
        this._call('applyParams', this.params);

        if (scenario && scenario.sourceExists) {
            const p = this._call('loadSource', scenario.sourceId);
            if (p && typeof p.then === 'function') { try { await p; } catch (e) { console.warn('[DynamicsLab] loadSource failed:', e); } }
            if (scenario.sidechain && scenario.sidechain.exists) {
                const sp = this._call('loadSessionStem', scenario.sidechain.sessionId, scenario.sidechain.stemId);
                if (sp && typeof sp.then === 'function') { try { await sp; } catch (e) { console.warn('[DynamicsLab] sidechain load failed:', e); } }
            }
        }

        const payload = {
            case: cs,
            scenario,
            target: this.target,
            lesson: DYNAMICS_LESSONS.find((l) => l.id === cs.lessonId) || null
        };
        this.emit(DYNAMICS_LAB_EVENTS.CASE_LOADED, payload);
        this.emit(DYNAMICS_LAB_EVENTS.CHANGED, this.getState());
        return payload;
    }

    /**
     * Light, unscored self-check for a Case Study.
     * @param {string} [caseId=activeCaseId]
     * @param {object} [params=current]
     * @returns {{caseId:string,passed:boolean,notes:Array,target:object|null}|null}
     */
    checkCase(caseId = this.activeCaseId, params = this.params) {
        const cs = DYNAMICS_CASE_STUDIES.find((c) => c.id === caseId);
        if (!cs) return null;
        const p = sanitizeParams(params, DEFAULT_DYNAMICS_PARAMS);
        const checks = Array.isArray(cs.checks) ? cs.checks : [];
        const notes = [];
        let passed = true;

        checks.forEach((c) => {
            const value = p[c.param];
            let ok = true;
            if ('equals' in c) {
                ok = value === c.equals;
            } else {
                if (typeof c.min === 'number') ok = ok && value >= c.min;
                if (typeof c.max === 'number') ok = ok && value <= c.max;
            }
            if (!ok) passed = false;
            notes.push({ param: c.param, value, ok, note: c.note || '' });
        });

        const result = {
            caseId: cs.id,
            passed,
            notes,
            target: this._caseTarget(cs.scenarioId)
        };
        this.emit(DYNAMICS_LAB_EVENTS.CASE_CHECKED, result);
        return result;
    }

    /**
     * Reveals a Case Study's reference target (for self-review).
     * @param {string} [caseId=activeCaseId]
     * @returns {object|null}
     */
    revealCaseTarget(caseId = this.activeCaseId) {
        const cs = DYNAMICS_CASE_STUDIES.find((c) => c.id === caseId);
        if (!cs) return null;
        return this._caseTarget(cs.scenarioId);
    }

    _caseTarget(scenarioId) {
        const scenario = describeScenario(scenarioId);
        return scenario ? sanitizeParams(scenario.target || {}, DEFAULT_DYNAMICS_PARAMS) : null;
    }

    // ───────────────────────────── Scoring glue ─────────────────────────────

    /** Runs the injected/static scorer defensively. */
    _evaluate(target, guess, ctx) {
        let fn = this.evaluate;
        if (!fn && ScoringEngine && typeof ScoringEngine.evaluateDynamics === 'function') {
            fn = (t, g, c) => ScoringEngine.evaluateDynamics(t, g, c);
        }
        if (typeof fn !== 'function') {
            // Pre-W8 fallback: never throw; the UI shows a "scoring pending" note.
            return {
                pending: true,
                totalScore: 0,
                accuracyPercentage: 0,
                isCorrect: false,
                feedbackMessage: 'La evaluación dinámica todavía no está disponible.'
            };
        }
        try {
            return fn(target, guess, ctx);
        } catch (e) {
            console.error('[DynamicsLab] evaluate() threw:', e);
            return {
                error: true,
                totalScore: 0,
                accuracyPercentage: 0,
                isCorrect: false,
                feedbackMessage: 'No se pudo evaluar la respuesta.'
            };
        }
    }
}
