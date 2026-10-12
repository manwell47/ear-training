#!/usr/bin/env node
/**
 * Verificación autónoma de los módulos VIVOS de `src/web`.
 *
 * Por qué existe: los `import` del proyecto usan sufijos de cache-busting
 * (`./X.js?v=80`), que `node --check` y el resolver ESM de Node NO aceptan tal
 * cual. Este script crea un sandbox ESM temporal, copia los módulos limpiando
 * esos sufijos y entonces:
 *   1. Comprueba la SINTAXIS de cada módulo con `node --check`.
 *   2. IMPORTA los módulos sin DOM (TrainingManager, AcousticMatrix,
 *      AudioResourceManager) y valida invariantes de contenido y de generación
 *      de objetivos (workstreams WS-I, WS-J y WS-K).
 *
 * Uso:   node tools/verify_modules.mjs
 * Salida: lista PASS/FAIL + resumen. Exit code != 0 si hay algún fallo.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC_DIR = path.join(ROOT, 'src', 'web');

if (!fs.existsSync(SRC_DIR)) {
    console.error(`No se encuentra ${SRC_DIR}`);
    process.exit(2);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-training-esm-'));
const syntaxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-training-syn-'));
const stripCacheBuster = (code) => code.replace(/\?v=\d+/g, '');

try {
    // ── Sandbox ESM ────────────────────────────────────────────────────────────
    const jsFiles = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.js'));
    for (const f of jsFiles) {
        const stripped = stripCacheBuster(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
        fs.writeFileSync(path.join(sandbox, f), stripped);
        // `node --check` sobre un .js lo trata como CommonJS aunque el paquete sea
        // "type: module"; copiamos a .mjs para forzar el parse goal ESM (solo
        // sintaxis: los especificadores de import no se resuelven en --check).
        fs.writeFileSync(path.join(syntaxDir, f.replace(/\.js$/, '.mjs')), stripped);
    }
    fs.writeFileSync(path.join(sandbox, 'package.json'), JSON.stringify({ type: 'module' }));

    let failures = 0;
    const results = [];
    const check = (name, cond, detail = '') => {
        const ok = !!cond;
        if (!ok) failures++;
        results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
    };

    // ── 1) Sintaxis ────────────────────────────────────────────────────────────
    for (const f of jsFiles) {
        try {
            execFileSync(process.execPath, ['--check', path.join(syntaxDir, f.replace(/\.js$/, '.mjs'))], { stdio: 'pipe' });
            check(`syntax: ${f}`, true);
        } catch (e) {
            const raw = String(e.stderr || e.message || '');
            const line = raw.split('\n').map((l) => l.trim()).find((l) => l && !/^\^+$/.test(l)) || raw;
            check(`syntax: ${f}`, false, line);
        }
    }

    // ── 2) Invariantes funcionales ─────────────────────────────────────────────
    const imp = (f) => import(url.pathToFileURL(path.join(sandbox, f)).href);
    const { ACOUSTIC_EQ_SCENARIOS, TrainingManager } = await imp('TrainingManager.js');
    const { ACOUSTIC_MATRIX, ACOUSTIC_CLASS_ALIASES, resolveAcousticClassKey } = await imp('AcousticMatrix.js');
    const { MULTITRACK_SESSIONS, AUDIO_SOURCES, pickRandomTargetStem } = await imp('AudioResourceManager.js');

    const BAND_MIN = 80;
    const BAND_MAX = 14000;
    const NEW_CLASSES = ['organ', 'epiano', 'acoustic_guitar', 'percussion', 'flute', 'trumpet'];

    check('ACOUSTIC_EQ_SCENARIOS tiene >= 24 clases', Object.keys(ACOUSTIC_EQ_SCENARIOS).length >= 24,
        `count=${Object.keys(ACOUSTIC_EQ_SCENARIOS).length}`);

    for (const cls of NEW_CLASSES) {
        const bank = ACOUSTIC_EQ_SCENARIOS[cls];
        check(`banco EQ "${cls}" (>=9 escenarios)`, Array.isArray(bank) && bank.length >= 9,
            `len=${Array.isArray(bank) ? bank.length : 'n/a'}`);
        const blocks = ACOUSTIC_MATRIX[cls];
        check(`lección "${cls}" (>=5 bandas)`, Array.isArray(blocks) && blocks.length >= 5,
            `len=${Array.isArray(blocks) ? blocks.length : 'n/a'}`);
        check(`alias "${cls}" resolutivo`, resolveAcousticClassKey(cls, 'generic') === cls);
    }

    const aliasCases = [
        ['flauta', 'flute'], ['piccolo', 'flute'],
        ['trompeta', 'trumpet'],
        ['guitarra acustica', 'acoustic_guitar'], ['nylon', 'acoustic_guitar'],
        ['congas', 'percussion'], ['djembe', 'percussion'],
        ['hammond', 'organ'], ['leslie', 'organ'],
        ['wurlitzer', 'epiano'], ['rhodes', 'epiano'],
        ['timbales', 'toms'], ['clarinete', 'woodwinds']
    ];
    for (const [input, expected] of aliasCases) {
        const got = resolveAcousticClassKey(input, 'generic');
        check(`alias "${input}" -> ${expected}`, got === expected, `got=${got}`);
    }
    check('ACOUSTIC_CLASS_ALIASES exportado', ACOUSTIC_CLASS_ALIASES && Object.keys(ACOUSTIC_CLASS_ALIASES).length > 0);

    // Rotación del stem objetivo del multitrack
    const orch = MULTITRACK_SESSIONS.find((s) => s.id === 'orch_session');
    check('sesión orch_session presente', !!orch);
    if (orch) {
        const classes = new Set(orch.stems.map((s) => s.acousticClass));
        check('orquesta entrena >1 clase (no solo Main Pair)', classes.size >= 3, `classes=${[...classes].join(',')}`);
        let alwaysChanges = true;
        for (let i = 0; i < 200; i++) {
            const cur = orch.stems[i % orch.stems.length].id;
            const next = pickRandomTargetStem(orch, cur);
            if (!next || next.id === cur) { alwaysChanges = false; break; }
        }
        check('pickRandomTargetStem siempre cambia (200 intentos)', alwaysChanges);
    }
    check('AUDIO_SOURCES no vacío', Array.isArray(AUDIO_SOURCES) && AUDIO_SOURCES.length > 0,
        `count=${AUDIO_SOURCES.length}`);

    // Generación de objetivos: banda musical + boost multitrack
    const tm = new TrainingManager();
    for (const cls of NEW_CLASSES) {
        tm.currentAcousticClass = cls;
        tm.sourceAcousticClass = cls;
        let inBand = true;
        let bad = null;
        for (let i = 0; i < 50; i++) {
            const t = tm.generateAcousticTarget('normal');
            if (!t || t.frequencyHz < BAND_MIN || t.frequencyHz > BAND_MAX) { inBand = false; bad = t; break; }
        }
        check(`generateAcousticTarget(${cls}) en ${BAND_MIN}-${BAND_MAX} Hz`, inBand, bad ? `freq=${bad.frequencyHz}` : '');
    }

    const meanAbsGain = (multitrack, n = 400) => {
        tm.isMultitrackSession = multitrack;
        let sum = 0;
        let cnt = 0;
        for (let i = 0; i < n; i++) {
            tm.currentAcousticClass = 'orchestra';
            tm.sourceAcousticClass = 'orchestra';
            const t = tm.generateAcousticTarget('normal');
            if (t && typeof t.gainDb === 'number') { sum += Math.abs(t.gainDb); cnt++; }
        }
        return cnt ? sum / cnt : 0;
    };
    const single = meanAbsGain(false);
    const multi = meanAbsGain(true);
    check('boost multitrack eleva |ganancia| media', multi >= single,
        `single=${single.toFixed(2)}dB multi=${multi.toFixed(2)}dB`);

    tm.isMultitrackSession = true;
    tm.currentAcousticClass = 'strings';
    let maxSeen = 0;
    for (let i = 0; i < 600; i++) {
        const t = tm.generateAcousticTarget('normal');
        if (t && typeof t.gainDb === 'number') maxSeen = Math.max(maxSeen, Math.abs(t.gainDb));
    }
    check('techo multitrack |ganancia| <= 14 dB', maxSeen <= 14.0, `max=${maxSeen.toFixed(2)}dB`);
    check('flags Trainer isMultitrackSession/currentTargetStemName', 'isMultitrackSession' in tm && 'currentTargetStemName' in tm);

    // ── 3) DYNAMIC RANGE — contenido, DSP y scoring ────────────────────────────
    const dynMath = await imp('dynamics-math.js');
    const dynMatrix = await imp('DynamicsMatrix.js');
    const tooltipMod = await imp('TooltipController.js');
    await imp('DynamicsLab.js');            // import-probe: must stay DOM-free under Node
    const { ScoringEngine } = await imp('ScoringEngine.js');

    const {
        DEFAULT_DYNAMICS_PARAMS, sanitizeParams, staticGainDb, upwardGainDb,
        computeGainDb, computeTransferCurve, DSP_STYLE
    } = dynMath;
    const {
        COMPRESSOR_TYPE_ORDER, COMPRESSOR_TYPES, DYNAMICS_HELP, DYNAMICS_BUSES,
        DYNAMICS_SCENARIOS, DYNAMICS_CHALLENGES, listScenarios
    } = dynMatrix;
    const { hitTestHotspots, HOLD_MS } = tooltipMod;

    // 5.1 — Las 5 familias de compresor y su fidelidad al DSP
    const TYPE_ORDER = ['vca', 'fet', 'opto', 'varimu', 'bus'];
    check('5 tipos de compresor en orden canónico',
        Array.isArray(COMPRESSOR_TYPE_ORDER) && COMPRESSOR_TYPE_ORDER.length === 5 &&
        TYPE_ORDER.every((t) => COMPRESSOR_TYPE_ORDER.includes(t)),
        `order=${(COMPRESSOR_TYPE_ORDER || []).join(',')}`);
    check('COMPRESSOR_TYPES cubre las 5 familias',
        TYPE_ORDER.every((t) => COMPRESSOR_TYPES[t] && COMPRESSOR_TYPES[t].id === t));
    let engineDrift = null;
    TYPE_ORDER.forEach((t) => {
        const e = COMPRESSOR_TYPES[t] && COMPRESSOR_TYPES[t].engine;
        const d = DSP_STYLE[t];
        if (!e || !d || e.detector !== d.detector || e.feedback !== d.feedback ||
            e.releaseDepend !== d.releaseDepend || e.kneeScale !== d.kneeScale) engineDrift = t;
    });
    check('COMPRESSOR_TYPES.engine DERIVADO de DSP_STYLE (fuente única)', !engineDrift, engineDrift ? `drift=${engineDrift}` : '');

    // 5.2 — Cobertura de escenarios por bus + referencias de audio reales
    const flat = listScenarios();
    const busIds = DYNAMICS_BUSES.map((b) => b.id);
    check('cada bus tiene >=1 escenario',
        busIds.every((id) => Array.isArray(DYNAMICS_SCENARIOS[id]) && DYNAMICS_SCENARIOS[id].length >= 1),
        `buses=${busIds.length}`);
    const sumByBus = busIds.reduce((n, id) => n + (DYNAMICS_SCENARIOS[id] ? DYNAMICS_SCENARIOS[id].length : 0), 0);
    check('listScenarios() == suma por bus', flat.length === sumByBus, `flat=${flat.length} sum=${sumByBus}`);

    const sourceIds = new Set(AUDIO_SOURCES.map((s) => s.id));
    const badSource = flat.find((s) => s.sourceId && !sourceIds.has(s.sourceId));
    check('todo scenario.sourceId existe en AUDIO_SOURCES', !badSource, badSource ? `missing=${badSource.sourceId}` : '');

    const paramKeys = new Set(Object.keys(DEFAULT_DYNAMICS_PARAMS));
    let badTargetKey = null;
    flat.forEach((s) => Object.keys(s.target || {}).forEach((k) => {
        if (!paramKeys.has(k)) badTargetKey = `${s.id}:${k}`;
    }));
    check('todo scenario.target usa claves de DEFAULT_DYNAMICS_PARAMS', !badTargetKey, badTargetKey || '');

    const stemsById = new Set();
    MULTITRACK_SESSIONS.forEach((sess) => sess.stems.forEach((st) => stemsById.add(`${sess.id}::${st.id}`)));
    const scScenarios = flat.filter((s) => s.sidechain);
    const scOk = scScenarios.length >= 1 && scScenarios.every((s) =>
        stemsById.has(`${s.sidechain.sessionId}::${s.sidechain.sourceStemId}`));
    check('sidechain referencia sesión/stem reales de MULTITRACK_SESSIONS', scOk, `scenarios=${scScenarios.length}`);

    // 5.3 — Curriculum: 10 pasos con scenario/weights válidos
    const scenarioIds = new Set(flat.map((s) => s.id));
    let badChal = null;
    DYNAMICS_CHALLENGES.forEach((c) => {
        if (!scenarioIds.has(c.scenarioId)) badChal = `scenario:${c.scenarioId}`;
        Object.keys(c.weights || {}).forEach((k) => {
            if (!paramKeys.has(k)) badChal = `weight:${k}`;
        });
    });
    check('challenges: scenarioId + weights válidos', !badChal, badChal || '');
    check('curriculum tiene 10 pasos', DYNAMICS_CHALLENGES.length === 10, `len=${DYNAMICS_CHALLENGES.length}`);

    // 5.4 — DSP: puntos conocidos de la transferencia
    const pDn = sanitizeParams({ thresholdDb: -20, ratio: 4, kneeDb: 0, upwardEnabled: false });
    check('transferencia hard-knee sobre umbral (-10 dB, T=-20, R=4) = -7.5 dB',
        Math.abs(computeGainDb(-10, pDn).gainDb - (-7.5)) < 1e-9, `gain=${computeGainDb(-10, pDn).gainDb}`);
    check('transferencia: bajo umbral sin ganancia',
        Math.abs(computeGainDb(-30, pDn).gainDb) < 1e-9);
    check('ratio=1 => sin compresión',
        Math.abs(computeGainDb(-5, sanitizeParams({ ratio: 1, kneeDb: 0 })).gainDb) < 1e-9);

    const curve = computeTransferCurve(pDn, 10, -60, 0);
    check('computeTransferCurve: steps+1 puntos con extremos correctos',
        curve.length === 11 && Math.abs(curve[0].inDb) < 1e-9 && Math.abs(curve[10].inDb + 60) < 1e-9,
        `len=${curve.length}`);

    // 5.5 — Upward: espejo exacto + monotonicidad
    const T = -30, R = 4, W = 6;
    check('upwardGainDb es el espejo exacto de staticGainDb',
        [-60, -45, -30, -20, -5].every((x) => Math.abs(upwardGainDb(x, T, R, W) + staticGainDb(-x, -T, R, W)) < 1e-12));
    const upAt = [-60, -45, -30, -20, -10].map((x) => upwardGainDb(x, T, R, W));
    check('upwardGainDb no creciente (más alza cuanto más bajo el nivel)',
        upAt.every((v, i) => i === 0 || upAt[i - 1] >= v - 1e-9), upAt.map((v) => v.toFixed(2)).join(','));
    check('upwardGainDb >=0 bajo umbral y 0 por encima',
        upAt[0] > 0 && Math.abs(upwardGainDb(0, T, R, W)) < 1e-9);

    // 5.6 — sanitizeParams acota y repara entradas
    check('sanitizeParams: ratio 999 -> 20', sanitizeParams({ ratio: 999 }).ratio === 20);
    check('sanitizeParams: threshold 5 -> 0', sanitizeParams({ thresholdDb: 5 }).thresholdDb === 0);
    check('sanitizeParams: threshold -200 -> -60', sanitizeParams({ thresholdDb: -200 }).thresholdDb === -60);
    check('sanitizeParams: mix 5 -> 1', sanitizeParams({ mix: 5 }).mix === 1);
    check('sanitizeParams: detector inválido -> peak', sanitizeParams({ detector: 'foo' }).detector === 'peak');
    check('sanitizeParams: style inválido -> vca', sanitizeParams({ style: 'foo' }).style === 'vca');

    // 5.7 — Tooltips: hit-test puro + cobertura de ayuda
    const hs = [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', x: 5, y: 5, w: 10, h: 10 }];
    check('hitTestHotspots: gana el último (dibujado encima)', hitTestHotspots(hs, 6, 6)?.id === 'b');
    check('hitTestHotspots: acierta el inferior', hitTestHotspots(hs, 1, 1)?.id === 'a');
    check('hitTestHotspots: fuera -> null', hitTestHotspots(hs, 50, 50) === null);
    check('HOLD_MS por defecto = 1000 ms', HOLD_MS === 1000);

    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const helpKeys = [...new Set([...html.matchAll(/data-help="([^"]+)"/g)].map((m) => m[1]))];
    const missingHelp = helpKeys.filter((k) => !DYNAMICS_HELP[k]);
    check('DYNAMICS_HELP cubre todos los data-help de index.html', missingHelp.length === 0,
        missingHelp.length ? `missing=${missingHelp.join(',')}` : `keys=${helpKeys.length}`);
    check('DYNAMICS_HELP incluye hotspots del canvas',
        ['curve', 'knee', 'threshold', 'ratio', 'meter'].every((k) => DYNAMICS_HELP[k]));

    // 5.8 — ScoringEngine.evaluateDynamics (W8)
    const targetFull = sanitizeParams({
        style: 'fet', thresholdDb: -14, ratio: 4, kneeDb: 3, attackMs: 5, releaseMs: 80, makeupDb: 0
    });
    const perfect = ScoringEngine.evaluateDynamics(targetFull, { ...targetFull }, { challenge: { weights: { thresholdDb: 1, ratio: 1 } } });
    check('evaluateDynamics: acierto perfecto => 100% / 1000 / isCorrect',
        perfect.accuracyPercentage === 100 && perfect.totalScore === 1000 && perfect.isCorrect === true,
        `acc=${perfect.accuracyPercentage} score=${perfect.totalScore}`);

    const offThresh = ScoringEngine.evaluateDynamics(targetFull, { ...targetFull, thresholdDb: -11 }, { challenge: { weights: { thresholdDb: 1 } } });
    check('evaluateDynamics: umbral +3 dB => fallo (<80%)',
        offThresh.isCorrect === false && offThresh.accuracyPercentage < 80, `acc=${offThresh.accuracyPercentage}`);

    const wrongStyle = ScoringEngine.evaluateDynamics(targetFull, { ...targetFull, style: 'vca' }, { challenge: { weights: { style: 0.05, thresholdDb: 1 } } });
    check('evaluateDynamics: estilo erróneo bloquea "correcto" pese a alta precisión',
        wrongStyle.isCorrect === false && wrongStyle.accuracyPercentage >= 80, `acc=${wrongStyle.accuracyPercentage}`);

    const upTarget = sanitizeParams({ upwardEnabled: true, upwardThresholdDb: -50, upwardRatio: 2, thresholdDb: -6, ratio: 1.5 });
    const upDown = ScoringEngine.evaluateDynamics(upTarget, { ...upTarget, upwardEnabled: false }, { challenge: { weights: { upwardThresholdDb: 0.5, upwardRatio: 0.5 } } });
    check('evaluateDynamics: dirección abajo vs arriba NO da 100%',
        upDown.accuracyPercentage < 100, `acc=${upDown.accuracyPercentage}`);
    const upPerfect = ScoringEngine.evaluateDynamics(upTarget, { ...upTarget }, { challenge: { weights: { upwardThresholdDb: 0.5, upwardRatio: 0.5 } } });
    check('evaluateDynamics: upward perfecto => 100%', upPerfect.accuracyPercentage === 100, `acc=${upPerfect.accuracyPercentage}`);

    // ── 5.9) E2 — TheoryPanel: geometría ADSR pura y ruta SVG ─────────────────
    const theoryMod = await imp('TheoryPanel.js');
    const { ADSR_DEFAULTS, adsrVertices, buildAdsrPath } = theoryMod;

    check('ADSR_DEFAULTS: dimensiones y tiempos coherentes',
        ADSR_DEFAULTS.width > 0 && ADSR_DEFAULTS.height > 0 &&
        ADSR_DEFAULTS.pad > 0 && ADSR_DEFAULTS.pad * 2 < ADSR_DEFAULTS.width &&
        ADSR_DEFAULTS.pad * 2 < ADSR_DEFAULTS.height &&
        ADSR_DEFAULTS.attackMs > 0 && ADSR_DEFAULTS.maxAttackMs >= ADSR_DEFAULTS.attackMs &&
        ADSR_DEFAULTS.maxReleaseMs >= ADSR_DEFAULTS.releaseMs);

    const adsrBase = adsrVertices();
    check('adsrVertices: 5 vértices A/D/S/R con x no decreciente',
        adsrBase.points.length === 5 &&
        adsrBase.points.map((p) => p.label).join(',') === ',A,D,S,R' &&
        adsrBase.points.every((p, i) => i === 0 || p.x >= adsrBase.points[i - 1].x),
        `labels=${adsrBase.points.map((p) => p.label).join(',')}`);
    check('adsrVertices: arranca en baseY, pico en topY y cierra en baseY',
        adsrBase.points[0].y === adsrBase.baseY &&
        adsrBase.points[1].y === adsrBase.topY &&
        adsrBase.points[4].y === adsrBase.baseY);

    const adsrFast = adsrVertices({ attackMs: 5 });
    const adsrSlow = adsrVertices({ attackMs: 300 });
    check('adsrVertices: attackMs mayor => A más ancho (fracción y x)',
        adsrSlow.fractions.attack > adsrFast.fractions.attack &&
        adsrSlow.points[1].x > adsrFast.points[1].x,
        `fast=${adsrFast.fractions.attack.toFixed(3)} slow=${adsrSlow.fractions.attack.toFixed(3)}`);
    const adsrShortRel = adsrVertices({ releaseMs: 10 });
    const adsrLongRel = adsrVertices({ releaseMs: 2000 });
    check('adsrVertices: releaseMs mayor => R más ancho (fracción y x)',
        adsrLongRel.fractions.release > adsrShortRel.fractions.release &&
        adsrLongRel.points[4].x > adsrShortRel.points[4].x,
        `short=${adsrShortRel.fractions.release.toFixed(3)} long=${adsrLongRel.fractions.release.toFixed(3)}`);

    const adsrPath = buildAdsrPath(adsrBase);
    check('buildAdsrPath: 1 M + 4 L (polilínea de 5 puntos)',
        adsrPath.startsWith('M ') && (adsrPath.match(/M/g) || []).length === 1 &&
        (adsrPath.match(/L/g) || []).length === 4, adsrPath);
    check('buildAdsrPath: entrada vacía => cadena vacía', buildAdsrPath([]) === '');

    // ── 5.10) E2/E4/E6 — Lab didáctico: casos, sidechain y teoría ────────────
    const labMod = await imp('DynamicsLab.js');
    const { DYNAMICS_CASE_STUDIES, describeSidechainCases, listExploreScenarios, DynamicsLab, describePracticeAchievements } = labMod;
    const { DYNAMICS_LESSONS, DYNAMICS_THEORY, getScenarioById } = dynMatrix;

    check('DYNAMICS_CASE_STUDIES: >= 10 casos guiados',
        Array.isArray(DYNAMICS_CASE_STUDIES) && DYNAMICS_CASE_STUDIES.length >= 10,
        `len=${DYNAMICS_CASE_STUDIES ? DYNAMICS_CASE_STUDIES.length : 'n/a'}`);

    const lessonIds = new Set(DYNAMICS_LESSONS.map((l) => l.id));
    let badCase = null;
    DYNAMICS_CASE_STUDIES.forEach((c) => {
        if (!c.id || !c.title || !c.goal || !Array.isArray(c.tips) || !c.tips.length) badCase = `shape:${c.id}`;
        if (!c.scenarioId || !getScenarioById(c.scenarioId)) badCase = `scenario:${c.id}:${c.scenarioId}`;
        if (!lessonIds.has(c.lessonId)) badCase = `lesson:${c.id}:${c.lessonId}`;
        (c.checks || []).forEach((ck) => { if (!paramKeys.has(ck.param)) badCase = `check:${c.id}:${ck.param}`; });
    });
    check('cada caso guiado: forma + scenario + lesson + checks válidos', !badCase,
        badCase || `cases=${DYNAMICS_CASE_STUDIES.length}`);

    const scAll = describeSidechainCases();
    check('describeSidechainCases(): 3 presets válidos de rock_band_session',
        scAll.length === 3 && scAll.every((p) => p.exists && p.sessionId === 'rock_band_session' &&
            p.targetName && p.keyName), `n=${scAll.length}`);
    check('describeSidechainCases(sessionId) filtra por sesión',
        describeSidechainCases('rock_band_session').length === 3 &&
        describeSidechainCases('__none__').length === 0);

    check('DYNAMICS_THEORY: >= 6 secciones con title/concept y una ADSR',
        DYNAMICS_THEORY.length >= 6 &&
        DYNAMICS_THEORY.every((s) => s.title && s.concept) &&
        DYNAMICS_THEORY.some((s) => s.adsr === true),
        `sections=${DYNAMICS_THEORY.length}`);

    check('DynamicsLab: API didáctica (getTheory/getParams/applyParams/loadCase)',
        typeof DynamicsLab === 'function' &&
        ['getTheory', 'getParams', 'applyParams', 'setMode', 'loadCase'].every((m) =>
            typeof DynamicsLab.prototype[m] === 'function'));

    check('listExploreScenarios(): agrupa por bus y valida origen',
        Array.isArray(listExploreScenarios()) &&
        listExploreScenarios().every((g) => g.bus && Array.isArray(g.scenarios) &&
            g.scenarios.every((s) => s && s.sourceExists)));

    // ── 5.11) E5 — Práctica Guiada: checklist cualitativo (sin puntos) ────────
    check('describePracticeAchievements: exportada y pura',
        typeof describePracticeAchievements === 'function' &&
        Array.isArray(describePracticeAchievements([])) &&
        describePracticeAchievements(null).length === 0);

    const ach = describePracticeAchievements([
        { key: 'thresholdDb', weight: 0.3, score: 1 },
        { key: 'ratio', weight: 0.25, score: 0.6 },
        { key: 'attackMs', weight: 0.15, score: 0 }
    ]);
    check('describePracticeAchievements: mapea ok/close/miss sin números',
        ach.length === 3 &&
        ach[0].state === 'ok' && ach[1].state === 'close' && ach[2].state === 'miss' &&
        ach.every((a) => typeof a.text === 'string' && a.text.length > 0 && !/\d/.test(a.text)),
        ach.map((a) => a.state).join(','));

    // ── 5.12) E7 — DynamicsScopeRenderer: helpers puros + MEDIDOR PRO ────────
    // El readout numérico NO lee el pico crudo por frame: INTEGRA el RMS
    // (SCOPE_RMS_SECONDS) y CONGELA los máximos (maxPeakDb / maxGrDb) sin
    // decaimiento, con balística dt-dependiente y dígitos refrescados a
    // SCOPE_TEXT_HZ. Se blinda esa lógica con un renderer construido sin DOM.
    const scopeMod = await imp('DynamicsScopeRenderer.js');
    const {
        ampToDb, dbToAmp, peakToDb, rmsAmp, rmsToDb,
        levelToY, ampToY, grToY, pushHistory,
        DynamicsScopeRenderer, SCOPE_RMS_SECONDS, SCOPE_GR_SECONDS, SCOPE_TEXT_HZ,
        SCOPE_COLUMNS, SCOPE_COLS_PER_FRAME
    } = scopeMod;

    // 5.12.1 — Helpers puros de nivel (dB ↔ amplitud, RMS/pico)
    check('scope helpers: dB<->amplitud y RMS/pico coherentes',
        Math.abs(ampToDb(0.5) - (-6.0206)) < 1e-3 &&
        ampToDb(0) === -60 &&
        Math.abs(dbToAmp(-6.0206) - 0.5) < 1e-3 &&
        Math.abs(rmsAmp([0.5, -0.5, 0.5, -0.5]) - 0.5) < 1e-9 &&
        Math.abs(rmsToDb([0.5, -0.5, 0.5, -0.5]) - ampToDb(0.5)) < 1e-9 &&
        Math.abs(peakToDb([0.3, -0.8, 0.2]) - ampToDb(0.8)) < 1e-9);

    // 5.12.2 — Proyección a píxeles (nivel / amplitud / reducción)
    check('scope helpers: proyección a píxeles (nivel/amplitud/GR)',
        levelToY(0, 100, 200) === 100 && levelToY(-60, 100, 200) === 300 &&
        ampToY(0, 100, 200) === 200 && ampToY(1, 100, 200, 1) === 100 &&
        grToY(0, 100, 200) === 100 && grToY(24, 100, 200) === 300);

    // 5.12.3 — pushHistory (tira rodante: desplaza y escribe al final)
    const roll = new Float32Array([1, 2, 3, 4]);
    pushHistory(roll, 9);
    check('scope helpers: pushHistory desplaza y escribe el último',
        roll[0] === 2 && roll[1] === 3 && roll[2] === 4 && roll[3] === 9);

    // 5.12.4 — Constantes de balística / resolución
    check('scope: constantes de balística coherentes',
        SCOPE_RMS_SECONDS > 0 && SCOPE_GR_SECONDS > 0 &&
        SCOPE_TEXT_HZ > 0 && SCOPE_TEXT_HZ <= 60 &&
        Number.isInteger(SCOPE_COLUMNS) && SCOPE_COLUMNS >= 64,
        `rms=${SCOPE_RMS_SECONDS}s text=${SCOPE_TEXT_HZ}Hz cols=${SCOPE_COLUMNS}`);

    // 5.12.5 — Construible sin DOM y sin engine (módulo importable en Node)
    const mkScope = () => new DynamicsScopeRenderer({});
    let scopeSafe = true;
    try {
        const s = mkScope();
        if (!s || s.available !== false) scopeSafe = false;
        s.start();       // no-op sin engine (no lanza)
        s.draw();        // ctx nulo -> retorno temprano (no lanza)
        s.stop();
    } catch (_) { scopeSafe = false; }
    check('scope: construible sin DOM/engine y seguro (start/draw/stop)', scopeSafe);

    // 5.12.6 — MEDIDOR PRO: RMS integrado converge al nivel de la señal
    const mRms = mkScope();
    const dB05 = ampToDb(0.5);            // ~ -6.02 dBFS
    let last = 0;
    for (let i = 0; i < 300; i++) last = mRms._updateMeter(0.25, dB05, 1 / 60);
    check('medidor PRO: RMS integrado converge al nivel (~-6.02 dBFS)',
        Math.abs(last - dB05) < 0.05, `ret=${last.toFixed(2)}`);
    check('medidor PRO: _updateMeter devuelve el RMS integrado',
        Math.abs(mRms.meterDb - last) < 1e-9);

    // 5.12.7 — MEDIDOR PRO: máximo CONGELADO (no decae) y se actualiza a un pico mayor
    const mMax = mkScope();
    mMax._updateMeter(0.25, -6.0, 1 / 60);    // bloque fuerte
    for (let i = 0; i < 300; i++) mMax._updateMeter(1e-4, -40.0, 1 / 60);  // bloques suaves
    const frozen = mMax.maxPeakDb;
    mMax._updateMeter(0.25, -3.0, 1 / 60);    // llega un pico aún mayor
    check('medidor PRO: MÁX congela el pico más alto sin decaer',
        Math.abs(frozen - (-6.0)) < 1e-9, `frozen=${frozen}`);
    check('medidor PRO: MÁX se actualiza si llega un pico mayor',
        Math.abs(mMax.maxPeakDb - (-3.0)) < 1e-9, `max=${mMax.maxPeakDb}`);

    // 5.12.8 — MEDIDOR PRO: balística dt-dependiente (idéntica a 60 y 144 fps)
    const mA = mkScope();
    const mB = mkScope();
    for (let i = 0; i < 120; i++) mA._updateMeter(0.25, dB05, 1 / 60);   // 2 s a 60 fps
    for (let i = 0; i < 288; i++) mB._updateMeter(0.25, dB05, 1 / 144);  // 2 s a 144 fps
    check('medidor PRO: balística dt-dependiente (60 vs 144 fps)',
        Math.abs(mA.meterMs - mB.meterMs) < 1e-3,
        `a=${mA.meterMs.toFixed(4)} b=${mB.meterMs.toFixed(4)}`);

    // 5.12.9 — MEDIDOR PRO: reset() limpia los máximos congelados
    const mReset = mkScope();
    mReset._updateMeter(0.25, -3.0, 1 / 60);
    mReset.reset();
    check('medidor PRO: reset() limpia los máximos congelados',
        mReset.maxPeakDb === -Infinity && mReset.meterDb === -Infinity && mReset.maxGrDb === 0);

    // 5.12.10 — Contrato del readout PRO (etiquetas del medidor y su máximo GR)
    const scopeSrc = fs.readFileSync(path.join(SRC_DIR, 'DynamicsScopeRenderer.js'), 'utf8');
    check('readout PRO: muestra ENTRADA RMS + MÁX + MÁX GR',
        /ENTRADA RMS/.test(scopeSrc) && /MÁX/.test(scopeSrc) && /MÁX GR/.test(scopeSrc));

    // 5.12.11 — CINTA DE GR de alta resolución: la tira INTERPOLA el |GR| a través de
    // las columnas añadidas por frame (antes escribía un único valor por frame, lo
    // que producía una escalera de "pocos niveles"). Se comprueba que una tira
    // recién avanzada contiene varios niveles distintos, no un único escalón.
    const grEng = {
        sampleRateHz: 48000,
        timeDomainLength: 800,
        getPreTimeDomainData(arr) {
            for (let i = 0; i < arr.length; i++) arr[i] = Math.sin(i * 0.05);
        }
    };
    const gs = new DynamicsScopeRenderer({ engine: grEng });
    gs.setTelemetry({ grDb: -12 });
    gs._readInput();       // fills inputBuf (the draw loop does this first)
    gs._advanceStrip();
    const grTail = Array.from(gs.grCols.slice(SCOPE_COLUMNS - SCOPE_COLS_PER_FRAME));
    const grDistinct = new Set(grTail.map((v) => v.toFixed(3))).size;
    check('cinta GR: alta resolución (interpola varios niveles por frame)',
        SCOPE_COLUMNS >= 720 && grDistinct >= Math.max(3, Math.floor(SCOPE_COLS_PER_FRAME / 2)),
        `cols=${SCOPE_COLUMNS} perFrame=${SCOPE_COLS_PER_FRAME} distinct=${grDistinct}`);

    // ── 5.13) Cache-buster unificado: `?v=N` == DYNAMICS_CACHE_VERSION ────────
    // `DYNAMICS_CACHE_VERSION` se hornea en la URL del AudioWorklet
    // (`dynamics-processor.js?v=N`), por lo que DEBE seguir el mismo `?v` que el
    // resto de `src/web` + `index.html`; de lo contrario el navegador cachea el
    // worklet antiguo. Es un número pelado (no un especificador de import), así
    // que el stripper `stripCacheBuster` no lo ve: lo blindamos aquí.
    const allSrc = jsFiles.map((f) => fs.readFileSync(path.join(SRC_DIR, f), 'utf8')).join('\n');
    const rawIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const versions = new Set([
        ...[...allSrc.matchAll(/\?v=(\d+)/g)].map((m) => m[1]),
        ...[...rawIndex.matchAll(/\?v=(\d+)/g)].map((m) => m[1])
    ]);
    const onlyVersion = versions.size === 1 ? [...versions][0] : null;
    check('cache-buster unificado a un único `?v=N` en src/web + index.html',
        onlyVersion !== null, [...versions].join(','));
    const dynVerMatch = allSrc.match(/DYNAMICS_CACHE_VERSION\s*=\s*(\d+)/);
    const dynVer = dynVerMatch ? dynVerMatch[1] : null;
    check('DYNAMICS_CACHE_VERSION == ?v=N',
        dynVer !== null && dynVer === onlyVersion, `const=${dynVer} v=${onlyVersion}`);

    console.log(results.join('\n'));
    console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} (${results.length} checks)`);
    process.exitCode = failures === 0 ? 0 : 1;
} finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(syntaxDir, { recursive: true, force: true });
}
