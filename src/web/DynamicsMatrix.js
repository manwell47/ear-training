/**
 * @file DynamicsMatrix.js
 * @description Didactic content source for the DYNAMIC RANGE module.
 *
 * This module is PURE CONTENT (no DOM, no audio). It provides:
 *   - COMPRESSOR_TYPES : the 5 classic flavours (VCA / FET / Opto / Vari-Mu / Bus)
 *                        whose engine-side behaviour is DERIVED from DSP_STYLE so
 *                        the description can never drift from the DSP.
 *   - DYNAMICS_HELP    : the hover-and-hold dictionary consumed by TooltipController
 *                        (keys match the `data-help` attributes in index.html and the
 *                        hotspot ids published by CompressorUI).
 *   - DYNAMICS_SCENARIOS : per-bus teaching scenarios with objective parameter sets.
 *                        `sourceId` values reference AUDIO_SOURCES ids ONLY, and
 *                        `sidechain.sessionId`/`sourceStemId` reference MULTITRACK_SESSIONS.
 *   - DYNAMICS_LESSONS : ordered didactic blocks (concept + "try this").
 *   - DYNAMICS_CHALLENGES : the 10-step Challenge curriculum with per-step control unlocks.
 *
 * Rule §1 (no psychoacoustic shortcuts): every scenario target is expressed in real
 * DSP parameters, never in subjective "sounds better" heuristics.
 */

import { DSP_STYLE } from './dynamics-math.js?v=83';

/** Canonical display order of the compressor families. */
export const COMPRESSOR_TYPE_ORDER = ['vca', 'fet', 'opto', 'varimu', 'bus'];

/**
 * The 5 compressor families.
 * `engine` is copied verbatim from DSP_STYLE so topology (detector/feedback) and
 * time constants (releaseDepend/kneeScale) are the single source of truth.
 */
export const COMPRESSOR_TYPES = {
    vca: {
        id: 'vca',
        label: 'VCA',
        color: '#38bdf8',
        family: 'Voltage Controlled Amplifier',
        tagline: 'Rápido, limpio y predecible. El estándar de bus y mastering.',
        character:
            'Un chip VCA controla la ganancia con una precisión casi matemática. ' +
            'El ataque es muy rápido, el release ajustable y el color armónico mínimo: ' +
            'comprime sin que se note apenas la "firma". Es el compresor de referencia ' +
            'para pegar un mix entero o domar un bajo de forma transparente.',
        famousModels: ['SSL G-Series Bus Compressor', 'dbx 160', 'API 2500 (modo VCA)'],
        useCase: 'Bus de mezcla, mastering, bajo y batería cuando primas la transparencia.',
        engine: DSP_STYLE.vca
    },
    fet: {
        id: 'fet',
        label: 'FET',
        color: '#fbbf24',
        family: 'Field Effect Transistor',
        tagline: 'Ataque ultrarrápido y carácter agresivo. Domina los picos.',
        character:
            'Los transistores FET conmutan casi instantáneamente, por lo que el ataque ' +
            'puede ser extremadamente rápido. Añaden una coloración armónica notable ' +
            'cuando trabajan duro, aportando "mordiente" y pegada. Ideales para ' +
            'controlar la maza del bombo, la caja o una voz que debe cortar.',
        famousModels: ['UREI 1176LN', 'Universal Audio 1176'],
        useCase: 'Bombo, caja, guitarra eléctrica y voces que necesitan presencia y control.',
        engine: DSP_STYLE.fet
    },
    opto: {
        id: 'opto',
        label: 'Opto',
        color: '#4ade80',
        family: 'Opto-eléctrico (célula fotoeléctrica)',
        tagline: 'Suave y musical. Release dependiente del programa.',
        character:
            'Una célula fotoeléctrica reacciona con cierta inercia, lo que produce un ' +
            'ataque y release naturalmente suaves. El release es "program-dependent": ' +
            'cuanto más comprime, más tarda en soltar. El resultado es una compresión ' +
            'sedosa que casi nunca suena a bombeo. El favorito para voces.',
        famousModels: ['Teletronix LA-2A', 'TLA-100A'],
        useCase: 'Voces, bajo y material acústico donde se busca una compresión casi invisible.',
        engine: DSP_STYLE.opto
    },
    varimu: {
        id: 'varimu',
        label: 'Vari-Mu',
        color: '#e05263',
        family: 'Compresión por válvulas (variable-mu)',
        tagline: 'Cálida y con "glue". Une la mezcla sin esfuerzo.',
        character:
            'En los compresores a válvulas la propia válvula cambia su ganancia al ' +
            'recibir más señal, con un codo muy suave y un ratio que crece de forma ' +
            'progresiva. Aportan calor, redondez y una sensación de cohesión (' +
            '"glue"). Se usan con reducciones pequeñas y constantes.',
        famousModels: ['Fairchild 670', 'Manley Vari-Mu', 'Chandler RS124'],
        useCase: 'Bus de mezcla, batería completa y material vintage donde se busca cohesión.',
        engine: DSP_STYLE.varimu
    },
    bus: {
        id: 'bus',
        label: 'Bus',
        color: '#9333ea',
        family: 'Bus Compressor (diseño para glue)',
        tagline: 'Ratio fijo suave y detector RMS. Pensado para el mix completo.',
        character:
            'Un compresor de bus está diseñado para trabajar sobre una suma de señales ' +
            'con un ratio bajo y fijo (habitualmente 2:1), un detector RMS y un release ' +
            'lento. No pretende domar transitorios aislados, sino unir los elementos ' +
            'en una sola imagen: la clásica técnica de "pegar" el mix.',
        famousModels: ['SSL Bus Compressor', 'API 2500 (modo Bus)'],
        useCase: 'Bus de mezcla o drum-bus, con 2-4 dB de reducción para dar cohesión.',
        engine: DSP_STYLE.bus
    }
};

/** @returns {object} the compressor type record (falls back to VCA). */
export function resolveCompressorType(id) {
    return COMPRESSOR_TYPES[id] || COMPRESSOR_TYPES.vca;
}

/**
 * Hover-and-hold help dictionary.
 * KEYS must match: (a) the `data-help` attributes in index.html, and
 * (b) the hotspot ids published by CompressorUI.getHotspots().
 */
export const DYNAMICS_HELP = {
    threshold: {
        title: 'Umbral (Threshold)',
        short: 'El nivel a partir del cual el compresor empieza a actuar.',
        long:
            'Todo lo que quede por debajo del umbral pasa intacto; lo que lo supera se ' +
            'comprime. Un umbral alto comprime solo los picos; un umbral bajo mete casi ' +
            'toda la señal en la zona de compresión. Es el control que define CUÁNTO ' +
            'material se ve afectado.'
    },
    mode: {
        title: 'Modo: Compresor vs. Puerta/Expansor',
        short: 'Elige si el procesador baja lo que supera el umbral o lo que queda por debajo.',
        long:
            'UN compresor hacia abajo reduce lo que SUPERA el umbral (controla picos, pega ' +
            'todo). Un EXPANSOR/PUERTA hace lo contrario: atenúa lo que queda POR DEBAJO del ' +
            'umbral, ensanchando la dinámica y limpiando colas, respiraciones, ruido de fondo ' +
            'o sangrado entre golpes. Con un ratio alto (10:1-20:1) el expansor se comporta ' +
            'como una PUERTA de ruido. Se sirve como preset sobre los MISMOS controles: el ' +
            'umbral marca dónde empieza a actuar y el ratio su dureza.'
    },
    ratio: {
        title: 'Ratio (Proporción)',
        short: 'Cuánto se reduce la señal que sobrepasa el umbral (p. ej. 4:1).',
        long:
            'Con un ratio de 4:1, por cada 4 dB que la señal supera el umbral solo salen ' +
            '1 dB. 2:1 es suave (bus, glue); 4:1 es un control firme; 8:1-20:1 se acerca al ' +
            'limitado. Define la DUREZA de la compresión.'
    },
    knee: {
        title: 'Knee (Codo)',
        short: 'Suavidad de la transición hacia la compresión.',
        long:
            'Un codo duro (0 dB) dobla la curva de golpe en el umbral: útil para control ' +
            'preciso. Un codo suave (6-24 dB) redondea la entrada en la compresión y suena ' +
            'más natural, típico de válvulas y opto. Míralo sombreado sobre la curva.'
    },
    attack: {
        title: 'Ataque (Attack)',
        short: 'Cuánto tarda el compresor en reaccionar tras superar el umbral.',
        long:
            'Un ataque rápido "atrapa" el transitorio y aplana el golpe; un ataque lento lo ' +
            'deja pasar para luego comprimir el cuerpo. En bombo y caja el ataque define si ' +
            'conservas la pegada o la recortas.'
    },
    release: {
        title: 'Release',
        short: 'Cuánto tarda en dejar de comprimir al bajar la señal.',
        long:
            'Un release rápido recobra el volumen enseguida (puede bombear); uno lento ' +
            'mantiene la compresión más tiempo (más "pegajoso"). Los compresores opto y ' +
            'vari-mu lo alargan automáticamente según el material (program-dependent).'
    },
    hold: {
        title: 'Hold',
        short: 'Tiempo que se mantiene la reducción antes de empezar a soltar.',
        long:
            'Enlaza el ataque con el release: mantiene la ganancia reducida durante un ' +
            'tiempo fijo tras bajar del umbral. Ayuda a evitar que el compresor "respire" ' +
            'en material con fluctuaciones rápidas alrededor del umbral.'
    },
    makeup: {
        title: 'Makeup Gain',
        short: 'Ganancia de compensación para recuperar el volumen perdido.',
        long:
            'Comprimir reduce el nivel medio. El makeup lo devuelve para comparar A/B a ' +
            'igualdad de volumen. Sube el makeup manualmente o activa Auto-Gain para que ' +
            'el propio motor lo calcule.'
    },
    autoGain: {
        title: 'Auto-Gain',
        short: 'Calcula y aplica la compensación de ganancia automáticamente.',
        long:
            'Estima la reducción media y añade la ganancia equivalente para que la señal ' +
            'comprimida tenga el mismo volumen percibido que la original. Imprescindible ' +
            'para no confundir "más fuerte" con "mejor".'
    },
    mix: {
        title: 'Dry/Wet (Mix)',
        short: 'Mezcla entre la señal sin procesar y la comprimida.',
        long:
            'Al 100% escuchas solo la señal comprimida; valores intermedios acercan el ' +
            'procesado a la famosa técnica de compresión en paralelo, conservando el ' +
            'transitorio original bajo una capa comprimida.'
    },
    detector: {
        title: 'Detector: Peak vs RMS',
        short: 'Qué mide el circuito: picos instantáneos o energía media.',
        long:
            'El detector de pico (Peak) reacciona a los transitorios y controla los ' +
            'picos con precisión. El detector RMS responde a la energía media y produce ' +
            'una compresión más suave y perceptiva, propia de buses y válvulas.'
    },
    feedback: {
        title: 'Topología: Feed-forward vs Feedback',
        short: 'Dónde se toma la señal de control respecto al amplificador.',
        long:
            'En Feed-forward el detector lee la señal de ENTRADA: respuesta rápida y ' +
            'predecible. En Feedback lee la salida ya comprimida: respuesta más suave y ' +
            'musical, el comportamiento clásico de los opto y vari-mu.'
    },
    stereoLink: {
        title: 'Enlace Estéreo (Stereo Link)',
        short: 'Cómo se combinan los dos canales para calcular la reducción.',
        long:
            'En "máx" la reducción se aplica por igual a ambos canales usando el más ' +
            'fuerte (protege la imagen estéreo). En "medio" se usa el promedio, útil ' +
            'cuando un canal tiene mucha más energía que el otro.'
    },
    color: {
        title: 'Color (carácter del tipo)',
        short: 'Colorea la curva y activa la saturación propia del tipo elegido.',
        long:
            'Desactívalo para estudiar la curva limpia y entender su forma. Al activarlo, ' +
            'la curva adopta el color de la familia (VCA/FET/Opto/Vari-Mu/Bus) y el motor ' +
            'añade la coloración armónica característica de ese tipo.'
    },
    // ── Compressor families (the "Tipo de compresor" title + the 5 chips) ──
    compressorTypes: {
        title: 'Tipos de compresor (familias)',
        short: 'VCA, FET, Opto, Vari-Mu y Bus: cinco formas distintas de comprimir.',
        long:
            'Cada familia cambia el circuito que controla la ganancia y, con él, su ' +
            'carácter: la velocidad del ataque, la forma del codo, cuánto depende el ' +
            'release del material y cuánto color armónico añade. Elige un chip para oír y ' +
            'ver esa firma concreta sobre la MISMA señal; el resto de parámetros (umbral, ' +
            'ratio, ataque…) siguen siendo tuyos.'
    },
    typeVca: {
        title: 'VCA — Voltage Controlled Amplifier',
        short: 'Rápido, limpio y predecible; el estándar de bus y mastering.',
        long:
            'Un chip VCA controla la ganancia con precisión casi matemática: ataque muy ' +
            'rápido, release ajustable y color armónico mínimo, así que comprime sin que ' +
            'se note la "firma". Es la referencia para pegar un mix entero o domar un bajo ' +
            'de forma transparente. Modelos típicos: SSL G-Series Bus, dbx 160, API 2500.'
    },
    typeFet: {
        title: 'FET — Field Effect Transistor',
        short: 'Ataque ultrarrápido y carácter agresivo; domina los picos.',
        long:
            'Los transistores FET conmutan casi al instante, por lo que el ataque puede ' +
            'ser extremadamente rápido. Añaden una coloración armónica notable cuando ' +
            'trabajan duro, con "mordiente" y pegada. Ideales para la maza del bombo, la ' +
            'caja o una voz que debe cortar. Modelo típico: UREI/Universal Audio 1176.'
    },
    typeOpto: {
        title: 'Opto — Optoeléctrico (célula fotoeléctrica)',
        short: 'Suave y musical; release dependiente del programa.',
        long:
            'Una célula fotoeléctrica reacciona con cierta inercia: ataque y release ' +
            'naturalmente suaves y un release "program-dependent" (cuanto más comprime, ' +
            'más tarda en soltar). El resultado es una compresión sedosa que casi nunca ' +
            'bombea. El favorito para voces. Modelo típico: Teletronix LA-2A.'
    },
    typeVarimu: {
        title: 'Vari-Mu — Compresión por válvulas',
        short: 'Cálida y con "glue"; une la mezcla sin esfuerzo.',
        long:
            'La propia válvula cambia su ganancia al recibir más señal, con un codo muy ' +
            'suave y un ratio que crece de forma progresiva. Aportan calor, redondez y una ' +
            'sensación de cohesión ("glue") con reducciones pequeñas y constantes. Modelos ' +
            'típicos: Fairchild 670, Manley Vari-Mu, Chandler RS124.'
    },
    typeBus: {
        title: 'Bus — Bus Compressor (diseño para "glue")',
        short: 'Ratio bajo y fijo, detector RMS y release lento; para el mix completo.',
        long:
            'Diseñado para trabajar sobre una suma de señales con un ratio bajo ' +
            '(habitualmente 2:1), detector RMS y release lento. No pretende domar ' +
            'transitorios aislados, sino unir los elementos en una sola imagen: la clásica ' +
            'técnica de "pegar" el mix, con 2-4 dB de reducción. Modelos típicos: SSL Bus ' +
            'Compressor, API 2500 (modo Bus).'
    },
    upwardEnabled: {
        title: 'Compresión al alza (Upward)',
        short: 'Sube lo que queda por DEBAJO del umbral (lo contrario de lo habitual).',
        long:
            'La compresión tradicional baja los picos; la compresión al alza sube las ' +
            'partes débiles para acercarlas a las fuertes. Sirve para hacer más ' +
            'consistente material muy dinámico en vez de aplastar los picos.'
    },
    upwardThreshold: {
        title: 'Umbral al alza',
        short: 'Todo lo que quede por debajo de este nivel se realza.',
        long:
            'Define el techo de la zona "débil". Las señales por debajo de este umbral se ' +
            'ganan hacia arriba; las que están por encima no se tocan. Fíjalo donde vive ' +
            'la parte discreta del material.'
    },
    upwardRatio: {
        title: 'Ratio al alza',
        short: 'Cuánto se elevan las partes débiles hacia el umbral.',
        long:
            'Funciona en espejo respecto al ratio normal: cuanto mayor sea, más se ' +
            'acercan las partes débiles al umbral de realce. Valores de 2:1 a 4:1 son ' +
            'habituales para evitar un sonido antinatural.'
    },
    sidechain: {
        title: 'Sidechain (disparador externo)',
        short: 'Comprime esta pista usando OTRA pista como disparador.',
        long:
            'En lugar de reaccionar a su propia señal, el compresor escucha la fuente ' +
            'seleccionada (por ejemplo el bombo) y reduce la pista actual (por ejemplo el ' +
            'bajo) cada vez que el bombo golpea. Es la técnica estándar para que el bajo ' +
            'deje hueco al bombo.'
    },
    bypass: {
        title: 'A/B Bypass',
        short: 'Compara la señal sin comprimir con la comprimida.',
        long:
            'El bypass es una comparación real: mientras está activo escuchas la señal ' +
            'seca, pero el medidor y la curva siguen vivos para que veas lo que el ' +
            'compresor haría. Úsalo constantemente para no engañarte.'
    },
    curve: {
        title: 'Curva de transferencia',
        short: 'Entrada (X) vs salida (Y). La diagonal es "sin comprimir".',
        long:
            'La diagonal discontinua es la señal intacta. Cuando la curva se separa por ' +
            'debajo de la diagonal es compresión (bajada); cuando se separa por encima, ' +
            'compresión al alza (subida). La forma del codo muestra dónde empieza a actuar.'
    },
    meter: {
        title: 'Medidor de ganancia',
        short: 'Reducción de ganancia (GR) hacia abajo y realce hacia arriba.',
        long:
            'La barra baja en ámbar/carmesí cuando el compresor reduce (GR negativo) y ' +
            'sube en esmeralda cuando actúa la compresión al alza. El marcador blanco es ' +
            'el pico retenido. Vigila que la reducción media sea musical, no constante.'
    }
};

/** @returns {{title:string,short:string,long:string}|null} */
export function getHelpText(key) {
    return DYNAMICS_HELP[key] || null;
}

/** Human-facing bus list used to group scenarios in the UI. */
export const DYNAMICS_BUSES = [
    { id: 'kick', label: 'Bombo' },
    { id: 'bass', label: 'Bajo' },
    { id: 'drumBus', label: 'Drum Bus' },
    { id: 'vocals', label: 'Voces' },
    { id: 'guitar', label: 'Guitarra' },
    { id: 'master', label: 'Master' }
];

/**
 * Per-bus teaching scenarios.
 * `target` uses the SAME field names as DEFAULT_DYNAMICS_PARAMS (sanitised by the engine).
 * `sourceId` MUST exist in AUDIO_SOURCES.
 * `sidechain` (optional) references a real MULTITRACK session for kick->bass ducking.
 */
export const DYNAMICS_SCENARIOS = {
    kick: [
        {
            id: 'kick_tight',
            label: 'Bombo definido y con cuerpo',
            bus: 'kick',
            brief: 'Controla los picos de la maza sin perder el golpe. Busca una pegada firme.',
            sourceId: 'a_kick_in',
            target: {
                style: 'fet', thresholdDb: -14, ratio: 4, kneeDb: 3,
                attackMs: 3, releaseMs: 80, makeupDb: 3, detector: 'peak'
            }
        },
        {
            id: 'kick_soft',
            label: 'Bombo natural y redondo',
            bus: 'kick',
            brief: 'Domina el bombo con una compresión suave que respete el transitorio.',
            sourceId: 'v_kick',
            target: {
                style: 'opto', thresholdDb: -20, ratio: 2, kneeDb: 12,
                attackMs: 25, releaseMs: 300, makeupDb: 2
            }
        }
    ],
    bass: [
        {
            id: 'bass_solid',
            label: 'Bajo sólido y sin picos',
            bus: 'bass',
            brief: 'Iguala el nivel del bajo para que cada nota tenga el mismo peso.',
            sourceId: 'di_bass',
            target: {
                style: 'vca', thresholdDb: -22, ratio: 4, kneeDb: 6,
                attackMs: 10, releaseMs: 150, makeupDb: 4
            }
        },
        {
            id: 'bass_duck_kick',
            label: 'Bajo que cede ante el bombo (Sidechain)',
            bus: 'bass',
            brief:
                'Haz que el bajo se aparte cada vez que golpea el bombo usando el bombo ' +
                'como disparador externo (sidechain).',
            sourceId: 'di_bass',
            sidechain: { sessionId: 'rock_band_session', sourceStemId: 'rb_kick' },
            target: {
                style: 'vca', thresholdDb: -24, ratio: 4, kneeDb: 6,
                attackMs: 8, releaseMs: 160, makeupDb: 2, sidechain: true
            }
        }
    ],
    drumBus: [
        {
            id: 'drumbus_glue',
            label: 'Drum bus cohesionado',
            bus: 'drumBus',
            brief: 'Pega la batería en una sola imagen con un ratio bajo y release lento.',
            sourceId: 'mix_beat1',
            target: {
                style: 'bus', thresholdDb: -16, ratio: 2, kneeDb: 10,
                attackMs: 30, releaseMs: 300, makeupDb: 3, detector: 'rms'
            }
        }
    ],
    vocals: [
        {
            id: 'vox_even',
            label: 'Voz consistente (opto)',
            bus: 'vocals',
            brief: 'Mantén el nivel de la voz sin que se note el compresor.',
            sourceId: 'vox_valve',
            target: {
                style: 'opto', thresholdDb: -20, ratio: 3, kneeDb: 14,
                attackMs: 20, releaseMs: 400, makeupDb: 4
            }
        },
        {
            id: 'vox_upward',
            label: 'Voz con compresión al alza',
            bus: 'vocals',
            brief:
                'En lugar de aplastar los picos, sube las partes susurradas para igualar ' +
                'la voz.',
            sourceId: 'vox_dyn',
            target: {
                style: 'opto', thresholdDb: -8, ratio: 2, kneeDb: 10,
                attackMs: 15, releaseMs: 250, makeupDb: 0,
                upwardEnabled: true, upwardThresholdDb: -38, upwardRatio: 2
            }
        }
    ],
    guitar: [
        {
            id: 'gtr_hold',
            label: 'Guitarra rítmica con sustain',
            bus: 'guitar',
            brief: 'Controla la guitarra y súbele el cuerpo para ganar sustain.',
            sourceId: 'amp_gtr',
            target: {
                style: 'fet', thresholdDb: -18, ratio: 4, kneeDb: 6,
                attackMs: 5, releaseMs: 120, makeupDb: 5
            }
        }
    ],
    master: [
        {
            id: 'master_glue',
            label: 'Master con pegada (glue)',
            bus: 'master',
            brief: 'Une la mezcla completa con una compresión suave y transparente.',
            sourceId: 'mix_ref',
            target: {
                style: 'vca', thresholdDb: -12, ratio: 2, kneeDb: 8,
                attackMs: 30, releaseMs: 250, makeupDb: 2, detector: 'rms'
            }
        },
        {
            id: 'master_varimu',
            label: 'Master cálido (Vari-Mu)',
            bus: 'master',
            brief: 'Aporta calor y cohesión con poca reducción, estilo a válvulas.',
            sourceId: 'mix_beat3',
            target: {
                style: 'varimu', thresholdDb: -14, ratio: 2, kneeDb: 16,
                attackMs: 40, releaseMs: 400, makeupDb: 3, detector: 'rms'
            }
        }
    ]
};

/** Flattens every scenario into a single array (stable order). */
export function listScenarios() {
    const out = [];
    DYNAMICS_BUSES.forEach((bus) => {
        (DYNAMICS_SCENARIOS[bus.id] || []).forEach((s) => out.push(s));
    });
    return out;
}

/** @returns {object|null} */
export function getScenarioById(id) {
    return listScenarios().find((s) => s.id === id) || null;
}

/**
 * Didactic sidechain presets — the ONLY places the sidechain picker is offered.
 *
 * Constraint (see AudioEngine._wireDynamicsSidechain): the compressor target
 * AND the sidechain key must BOTH be stems of the SAME MULTITRACK session, so
 * every preset is expressed as sessionId + targetStemId + keyStemId. The key is
 * always a "trigger" element (a kick or a lead vocal) that opens space for the
 * target. Presets are validated against MULTITRACK_SESSIONS before the UI
 * exposes them (see DynamicsLab.describeSidechainCases), so a preset can never
 * point at a missing stem.
 *
 * Shape: { id, label, sessionId, targetStemId, keyStemId, teaches }
 */
export const DYNAMICS_SIDECHAIN_CASES = [
    {
        id: 'sc_bass_from_kick',
        label: 'Bajo ← Bombo',
        sessionId: 'rock_band_session',
        targetStemId: 'rb_bass_di',
        keyStemId: 'rb_kick',
        teaches: 'El bajo cede ante cada golpe de bombo para dejarle sitio en los graves.'
    },
    {
        id: 'sc_guitars_from_vox',
        label: 'Guitarras ← Voz',
        sessionId: 'rock_band_session',
        targetStemId: 'rb_gtr1',
        keyStemId: 'vox_lead_m80',
        teaches: 'Las guitarras bajan cuando entra la voz para que la letra se entienda.'
    },
    {
        id: 'sc_keys_from_vox',
        label: 'Teclados ← Voz',
        sessionId: 'rock_band_session',
        targetStemId: 'rb_keys_l',
        keyStemId: 'vox_lead_m80',
        teaches: 'Los teclados dejan hueco a la voz cada vez que canta.'
    }
];

/** Ordered didactic blocks: concept first, then a hands-on "try this". */
/**
 * "Pro Tips" — curated master tips for the Dynamic Range didactic lab.
 *
 * These are NOT scored and NOT psychoacoustic shortcuts (rule §1): each tip
 * states an actionable, real-world practice used by working mixers, framed as
 * teaching guidance (not as a competitive game). Consumed by
 * App._renderDynamicsTips() into #dynTipsPanel.
 *
 * Shape: { tag: string, title: string, body: string }
 */
export const DYNAMICS_MASTER_TIPS = [
    {
        tag: 'Método',
        title: 'Primero escucha, luego decide',
        body: 'Reproduce la pista en bucle (2–4 compases) antes de tocar nada. Pregúntate qué te molesta de verdad: ¿picos que saltan, falta de pegada, algo que no se asienta? Comprimir sin un problema concreto solo resta vida.'
    },
    {
        tag: 'Envolvente',
        title: 'Ataque = pegada · Release = respiración',
        body: 'Un ataque lento deja pasar el transitorio (más pegada en bombo y caja). Un ataque rápido controla el golpe pero aplana. Release rápido se siente enérgico/bombeante; release lento aporta glue y sostenido.'
    },
    {
        tag: 'Umbral/Ratio',
        title: 'Primero el umbral, después el ratio',
        body: 'El umbral decide QUÉ comprimes; el ratio decide CUÁNTO. Empieza con ratios suaves (2:1–4:1) y súbelos solo si de verdad hace falta. Si necesitas más de 8:1 en material suave, probablemente estás atacando el problema equivocado.'
    },
    {
        tag: 'Codo',
        title: 'Knee suave para glue, duro para control',
        body: 'Un codo suave (6–12 dB) suena natural en buses y voces. Un codo duro (0–3 dB) controla mejor los picos en bombo y percusión, donde quieres acción firme por encima del umbral.'
    },
    {
        tag: 'Tipos',
        title: 'Elige el compresor por carácter, no por moda',
        body: 'VCA: preciso y transparente (bus, mastering). FET: rápido y agresivo (batería, rock). Opto: musical y suave (voces). Vari-Mu: glue y densidad (bus/master). Bus: pegajoso, ideal para agrupar y "pegar" secciones.'
    },
    {
        tag: 'Ganancia',
        title: 'Make-up vs Auto-Gain: compara a igual volumen',
        body: 'Recupera nivel con make-up, pero al comparar A/B iguala siempre el volumen percibido. Si algo "suena mejor" solo porque está más fuerte, no has mejorado nada: es el truco clásico de la prueba ciega.'
    },
    {
        tag: 'Paralelo',
        title: 'Compresión paralela (Mix)',
        body: 'Baja el mix al 50–70 % para controlar sin perder transitorios. Es el truco estrella en batería y voces: mantienes la pegada y aun así domas la dinámica.'
    },
    {
        tag: 'Sidechain',
        title: 'Sidechain kick↔bajo',
        body: 'Usa el bombo como clave para hundir el bajo en cada golpe. Ataque corto (1–5 ms), release sincronizado con el tempo (≈ 1/16–1/8) y umbral justo para que solo actúe en los golpes.'
    },
    {
        tag: 'Enfoque',
        title: 'Prueba ciega A/B',
        body: 'Compara "sin comprimir" y "con compresión". No te fíes del volumen: escucha la PÉRDIDA de dinámica (más sostenido, golpes recortados) y el cambio de color. Identifica el parámetro que más ha cambiado, no la cantidad de cambio.'
    },
    {
        tag: 'Enfoque',
        title: 'Método de trabajo por pasos',
        body: 'Fíjate un ajuste de referencia y trázalo. Trabaja siempre en el mismo orden: umbral → ratio → ataque → release → codo, y deja el tipo de compresor para el final. Mueve un solo parámetro por pasada.'
    },
    {
        tag: 'Errores',
        title: 'Errores más frecuentes',
        body: 'Comprimir sin necesidad, umbral demasiado bajo (todo comprimido), ratio exagerado en material suave (>8:1) y olvidar el make-up. Evita tanto el exceso como la falta.'
    },
    {
        tag: 'Buenas prácticas',
        title: 'Menos es más (y escucha en contexto)',
        body: 'Suelen bastar 2–4 dB de reducción. No comprimas dos veces lo mismo sin motivo. Comprueba en mono y a bajo volumen: si sigue funcionando ahí, funciona en cualquier sitio.'
    }
];

export const DYNAMICS_LESSONS = [
    {
        id: 'what_is',
        title: '1. ¿Qué hace un compresor?',
        concept:
            'Comprimir es reducir el rango dinámico: las partes fuertes se acercan a las ' +
            'débiles. No las hace mejores por sí solo; controla la energía para que todo ' +
            'se entienda.',
        tryThis: 'Activa A/B y desplaza el umbral hasta ver 2-3 dB de reducción en el medidor.'
    },
    {
        id: 'threshold_ratio',
        title: '2. Umbral y Ratio',
        concept:
            'El umbral decide DÓNDE empieza a actuar; el ratio decide CON QUÉ FUERZA. ' +
            'Juntos definen la forma de la curva por encima del umbral.',
        tryThis: 'Con umbral fijo, sube el ratio de 2:1 a 8:1 y observa cómo cae la curva.'
    },
    {
        id: 'time',
        title: '3. Ataque y Release',
        concept:
            'El ataque gobierna el transitorio; el release, la recuperación. Un ataque ' +
            'lento conserva el golpe; un release lento suena más "pegajoso".',
        tryThis: 'En el bombo, compara ataque 1 ms vs 30 ms a igualdad de reducción.'
    },
    {
        id: 'knee',
        title: '4. El codo (Knee)',
        concept:
            'Un codo duro dobla la curva de golpe; un codo suave la redondea. Válvulas y ' +
            'opto viven de codos suaves; los FET suelen preferir codos duros.',
        tryThis: 'Pasa el knee de 0 a 24 dB y mira cómo se suaviza la entrada en la compresión.'
    },
    {
        id: 'topology',
        title: '5. Detector y topología',
        concept:
            'Peak vs RMS decide qué se mide; Feed-forward vs Feedback decide de dónde se ' +
            'toma la señal de control. Cambia por completo el "tacto" del compresor.',
        tryThis: 'Cambia Peak->RMS en la voz y escucha cómo se vuelve más suave.'
    },
    {
        id: 'upward',
        title: '6. Compresión al alza',
        concept:
            'En vez de bajar picos, sube las partes débiles. Es la herramienta para ' +
            'material muy dinámico que no quieres aplastar.',
        tryThis: 'Con upward activo, sube el umbral al alza hasta que las notas flojas despierten.'
    },
    {
        id: 'sidechain',
        title: '7. Sidechain (bombo vs bajo)',
        concept:
            'Un disparador externo hace que una pista ceda ante otra. El caso clásico: el ' +
            'bombo dispara la reducción del bajo para dejarle sitio.',
        tryThis: 'En el bajo, activa sidechain con el bombo como fuente y ajusta el release.'
    },
    {
        id: 'families',
        title: '8. Los cinco sabores',
        concept:
            'VCA (limpio), FET (rápido y agresivo), Opto (suave y musical), Vari-Mu ' +
            '(cálido y glue) y Bus (diseñado para pegar el mix). Misma curva, distinto ' +
            'tacto.',
        tryThis: 'Carga el mismo escenario en cada tipo y compara el color y el release.'
    }
];

/**
 * Theoretical blocks for the "Teoría" sub-mode (a didactic dynamics lab).
 * Each block is { id, title, concept, bullets?, tryThis?, adsr? }.
 * `adsr: true` tells the UI to render the interactive ADSR envelope illustration
 * and the attack/release demo inside that block.
 */
export const DYNAMICS_THEORY = [
    {
        id: 'range',
        title: '1. ¿Qué es el rango dinámico?',
        concept:
            'El rango dinámico es la distancia entre el pasaje más flojo y el más fuerte ' +
            'de una señal. Un compresor reduce esa distancia acercando los fuertes a los ' +
            'flojos: no "mejora" nada por sí solo, controla la energía para que todo se ' +
            'entienda en la mezcla.',
        bullets: [
            'Amplitud = volumen. En dB, cada 6 dB es aproximadamente el doble de presión sonora.',
            'Comprimir hacia abajo doma los picos; comprimir al alza despierta lo flojo.',
            'Mide siempre "cuánto" (reducción de ganancia), no "si suena mejor" (eso lo decide el contexto).'
        ],
        tryThis: 'Mueve el umbral y observa el medidor de reducción (GR) mientras la curva se dobla.'
    },
    {
        id: 'adsr',
        title: '2. La envolvente de amplitud (ADSR)',
        concept:
            'La envolvente describe cómo cambia el volumen de un sonido en el tiempo: ' +
            'Ataque (Attack), Decaimiento (Decay), Sostenido (Sustain) y Release. Cada ' +
            'golpe de bombo, cada nota de bajo o cada palabra cantada tienen su propia ' +
            'forma. El compresor reescribe esa forma: el Ataque del compresor decide ' +
            'cuánto del ataque del sonido deja pasar, y el Release decide cómo vuelve.',
        adsr: true,
        bullets: [
            'A (Attack): tiempo que tarda el compresor en actuar. Largo = deja pasar el transitorio (más pegada).',
            'R (Release): tiempo que tarda en soltar. Corto = enérgico/bombeante; largo = glue y sostenido.',
            'Decay y Sustain del sonido son los que el compresor "aplana" cuando trabaja de continuo.'
        ],
        tryThis: 'Arrastra los deslizadores de la demo: la curva cambia Y el compresor real se ajusta.'
    },
    {
        id: 'transfer',
        title: '3. Umbral, Ratio y Codo',
        concept:
            'La curva de transferencia relaciona lo que entra con lo que sale. El umbral ' +
            'marca DÓNDE empieza a actuar el compresor; el ratio marca CUÁNTO comprime ' +
            'por encima de ese umbral; el codo (knee) redondea o endurece ese punto de ' +
            'entrada.',
        bullets: [
            'Umbral bajo = comprime casi todo (cuidado, resta vida).',
            'Ratio 2:1 suave; 4:1 firme; >8:1 en material suave suele ser un error.',
            'Codo suave (6–12 dB) para glue y voces; codo duro (0–3 dB) para controlar picos.'
        ],
        tryThis: 'Fija el umbral y sube el ratio de 2:1 a 8:1: mira cómo cae la curva por encima del umbral.'
    },
    {
        id: 'types',
        title: '4. Los cinco tipos de compresor',
        concept:
            'Misma idea (reducir el rango dinámico), pero cinco "tactos" distintos según ' +
            'el circuito. VCA (limpio y preciso), FET (rápido y agresivo), Opto (suave y ' +
            'musical), Vari-Mu (cálido y glue) y Bus (diseñado para pegar el mix).',
        bullets: [
            'Elige por carácter y por material, no por moda.',
            'La misma curva se siente distinta según el tipo de detector y release.'
        ],
        tryThis: 'Carga el mismo escenario en cada tipo y compara color y release (panel Explorar).'
    },
    {
        id: 'detect',
        title: '5. Detección y topología',
        concept:
            'El detector mira la señal para decidir cuándo comprimir. Peak responde al ' +
            'pico instantáneo (más agresivo); RMS responde a la energía media (más ' +
            'musical). La topología Feed-forward / Feedback determina de dónde se toma ' +
            'esa señal de control y cambia por completo el tacto.',
        bullets: [
            'Peak: ideal para controlar transitorios (batería).',
            'RMS: ideal para material sostenido (voz, bus).',
            'Feedback "respira" más; Feed-forward es más preciso y predecible.'
        ],
        tryThis: 'Cambia Peak → RMS en una voz y escucha cómo se suaviza.'
    },
    {
        id: 'sidechain',
        title: '6. Sidechain: abrir hueco',
        concept:
            'Un disparador externo hace que una pista ceda ante otra. El caso clásico: el ' +
            'bombo dispara la reducción del bajo para que ambos convivan. El mismo truco ' +
            'sirve para que las guitarras o los teclados dejen sitio a la voz.',
        bullets: [
            'La clave (key) es el elemento que manda; el target es el que cede.',
            'Ataque corto (1–5 ms) para que reaccione al golpe; release sincronizado con el tempo.',
            'Solo tiene sentido en casos concretos: por eso el selector se ofrece únicamente cuando el material lo permite.'
        ],
        tryThis: 'En el sub-modo Casos, elige "Bajo que cede ante el bombo" y ajusta el release.'
    }
];

/**
 * The 10-step Challenge curriculum.
 * `unlocked` lists the control ids revealed at each step (progressive disclosure);
 * empty/undefined means all controls are available (final exams).
 * `scenarioId` references DYNAMICS_SCENARIOS.
 */
export const DYNAMICS_CHALLENGES = [
    {
        id: 'c1_threshold',
        title: '1. Encuentra el umbral',
        brief: 'Consigue ~3 dB de reducción de ganancia moviendo solo el umbral.',
        scenarioId: 'kick_soft',
        unlocked: ['threshold'],
        weights: { thresholdDb: 1 }
    },
    {
        id: 'c2_ratio',
        title: '2. Fija el ratio',
        brief: 'Con el umbral correcto, ajusta el ratio hasta la fuerza pedida.',
        scenarioId: 'bass_solid',
        unlocked: ['threshold', 'ratio'],
        weights: { thresholdDb: 0.5, ratio: 0.5 }
    },
    {
        id: 'c3_knee',
        title: '3. Suaviza el codo',
        brief: 'Encuentra el codo que hace la transición natural para esta voz.',
        scenarioId: 'vox_even',
        unlocked: ['threshold', 'ratio', 'knee'],
        weights: { thresholdDb: 0.4, ratio: 0.3, kneeDb: 0.3 }
    },
    {
        id: 'c4_attack',
        title: '4. Conserva el transitorio',
        brief: 'Ajusta el ataque para que el golpe viva sin aplastarse.',
        scenarioId: 'kick_tight',
        unlocked: ['threshold', 'ratio', 'attack'],
        weights: { thresholdDb: 0.3, ratio: 0.3, attackMs: 0.4 }
    },
    {
        id: 'c5_release',
        title: '5. Evita el bombeo',
        brief: 'Ajusta el release para una recuperación musical.',
        scenarioId: 'bass_solid',
        unlocked: ['threshold', 'ratio', 'attack', 'release'],
        weights: { thresholdDb: 0.3, ratio: 0.2, attackMs: 0.2, releaseMs: 0.3 }
    },
    {
        id: 'c6_makeup',
        title: '6. Iguala el volumen',
        brief: 'Con Auto-Gain desactivado, recupera el nivel con el makeup.',
        scenarioId: 'vox_even',
        unlocked: ['threshold', 'ratio', 'attack', 'release', 'makeupDb'],
        weights: { thresholdDb: 0.3, ratio: 0.2, makeupDb: 0.5 }
    },
    {
        id: 'c7_upward',
        title: '7. Compresión al alza',
        brief: 'Iguala la voz subiendo las partes débiles en lugar de bajando los picos.',
        scenarioId: 'vox_upward',
        unlocked: ['upwardEnabled', 'upwardThresholdDb', 'upwardRatio'],
        weights: { upwardThresholdDb: 0.5, upwardRatio: 0.5 }
    },
    {
        id: 'c8_family',
        title: '8. Elige el carácter',
        brief: 'Escoge el tipo de compresor correcto para el drum bus cohesionado.',
        scenarioId: 'drumbus_glue',
        unlocked: ['style', 'threshold', 'ratio', 'attack', 'release'],
        weights: { style: 0.5, thresholdDb: 0.2, ratio: 0.15, releaseMs: 0.15 }
    },
    {
        id: 'c9_sidechain',
        title: '9. Sidechain: bombo contra bajo',
        brief: 'Haz que el bajo ceda ante el bombo con el disparador externo correcto.',
        scenarioId: 'bass_duck_kick',
        unlocked: ['sidechain', 'threshold', 'ratio', 'attack', 'release'],
        weights: { sidechain: 0.5, thresholdDb: 0.2, releaseMs: 0.15, ratio: 0.15 }
    },
    {
        id: 'c10_final',
        title: '10. Examen final: pega el mix',
        brief: 'Une la mezcla completa con una compresión de bus transparente.',
        scenarioId: 'master_glue',
        unlocked: null,
        weights: { style: 0.2, thresholdDb: 0.25, ratio: 0.2, attackMs: 0.15, releaseMs: 0.2 }
    }
];

/** Short, high-level intro used on the module landing card. */
export const DYNAMICS_INTRO =
    'Explora la compresión hacia abajo (picos) y hacia arriba (partes débiles), sus ' +
    'parámetros, los cinco tipos clásicos de compresor y el sidechain bombo->bajo. ' +
    'Mantén pulsado sobre cualquier control para una explicación rápida.';
