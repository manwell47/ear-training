#!/usr/bin/env node
/**
 * Verificación autónoma de los módulos VIVOS de `src/web`.
 *
 * Por qué existe: los `import` del proyecto usan sufijos de cache-busting
 * (`./X.js?v=70`), que `node --check` y el resolver ESM de Node NO aceptan tal
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

    console.log(results.join('\n'));
    console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} (${results.length} checks)`);
    process.exitCode = failures === 0 ? 0 : 1;
} finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(syntaxDir, { recursive: true, force: true });
}
