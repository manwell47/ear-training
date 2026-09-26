# CHECKPOINT — Punto de partida ("start from here")

> **Documento de traspaso.** Captura el estado exacto del proyecto *Ear Training* para
> poder reanudar el trabajo en una sesión nueva sin re-descubrir la arquitectura.
>
> Última actualización: **2026-09-25** · Autor: sesión Code
> Estado global: **WORKSTREAMS WS-G … WS-K COMPLETADOS Y VERIFICADOS** ✅

---

## 0. TL;DR para reanudar

```cmd
:: 1) Servir la app en local (ya suele estar corriendo en la Terminal 1)
node dev-server.js            :: → http://localhost:8080

:: 2) Verificación autónoma (sintaxis + invariantes). Debe decir "ALL PASS"
node tools/verify_modules.mjs
```

- App web **vanilla** (HTML5 + CSS + ES Modules). **Sin paso de build.**
- Deploy en **GitHub Pages** → https://github.com/manwell47/ear-training
- Audio real: **Web Audio API** sobre stems `.ogg` en `Music Ear Training/Oggs/`.
- Todos los WS recientes (multitrack, personalización por instrumento, perceptibilidad,
  diferido del game-over, rotación de objetivo, ampliación de teoría de mezcla) están
  **terminados y validados** con 55 comprobaciones automáticas.

---

## 1. Arranque rápido

| Acción | Comando / dato |
|---|---|
| Servidor local | `node dev-server.js` → **puerto 8080** (Terminal 1 activa) |
| URL | `http://localhost:8080/index.html` |
| Cache | El dev-server envía `Cache-Control: no-store…` → **no hay riesgo de caché local obsoleta** |
| Verificador | `node tools/verify_modules.mjs` |
| Rama/remoto | GitHub `manwell47/ear-training` (Pages) |

> ⚠️ El `dev-server.js` manda `no-store`, pero **GitHub Pages sí cachea**. Al publicar,
> sube **todos** los `?v=N` a la vez (ver §6).

---

## 2. Mapa de ficheros vivos con anclas de línea

Solo estos módulos son "código vivo". El resto de `src/web/App_v4x.js` y todo `legacy/`
es **histórico**, no se cargan.

| Fichero | Símbolo clave | Línea |
|---|---|---|
| **index.html** | `<link … styles_v2.css?v=71>` | 13 |
| | botón `#spotlightToggleBtn` (stem-mixer-header) | ~131 |
| | `<script type="module" src="./src/web/App.js?v=71">` | 692 |
| **styles_v2.css** | `@keyframes ctaTerminalPulse` + `.btn-next-trial.cta-terminal` | ~628–650 |
| | `#spotlightToggleBtn` / `.active` | ~1486 |
| | `@keyframes falseFriendsFadeIn` | 332 |
| **src/web/App.js** | `this.pendingOutcomeModal = null` (constructor) | 37 |
| | handler `bannerNextBtn` | 810 |
| | `setTargetStem()` (fija flags multitrack) | 908 |
| | flags `isMultitrackSession` / `currentTargetStemName` | 926–927 |
| | `randomizeTargetStem()` | 947 |
| | `renderStemMixer()` (incl. wiring Spotlight) | 971 / 1104–1111 |
| | `showPedagogicalReview()` (subtítulo + stem name) | 1462 |
| | diferido del modal (`pendingOutcomeModal = {…}`) | 1600–1603 |
| | `ctaLabels` (etiquetas del CTA terminal) | 1608 |
| | `openPendingOutcomeModal()` | 1701 |
| | `rotateMultitrackTarget()` | 1720 |
| | `advanceToNextTrial()` | 1728 |
| **src/web/TrainingManager.js** | `ACOUSTIC_EQ_SCENARIOS` (24 clases) | 27–299 |
| | `generateAcousticTarget()` (boost multitrack) | 576 (boost ~619–624) |
| | `resolveAcousticClass()` | 464 |
| | `LESSON_ROSTER` | 335 |
| **src/web/AcousticMatrix.js** | `ACOUSTIC_MATRIX` (texto didáctico por clase) | 7–744 |
| | `ACOUSTIC_CLASS_ALIASES` | 751 |
| | `resolveAcousticClassKey()` | 799 |
| **src/web/AudioEngine.js** | `updateStemVolumes()` (aplica Spotlight) | 602 |
| | `setSpotlight(enabled)` | 634 |
| | `spotlightFactor(stemId)` | 644 |
| | `switchMonitor(mode)` | 658 |
| | `play()` (ganancia × spotlightFactor) | 726 |
| **src/web/AudioResourceManager.js** | `MULTITRACK_SESSIONS` | 15 |
| | `AUDIO_SOURCES` (32 fuentes) | 115 |
| | `pickRandomTargetStem(session, excludeId)` | 165 |
| **src/web/GameLoopManager.js** | `evaluateTrialOutcome()` / `nextTrial()` | 150 / 214 |
| **src/web/ScoringEngine.js** | `evaluate()` / `calculateScore()` | 33 / 196 |
| | `analyzeProPractices()` | 372 |
| **src/web/Visualizer_v2.js** | render / drawSpectrum / overlay didáctico | 324 / 546 / 1179 |
| **src/web/VUMeter.js** | clase `VUMeter` | 1 |
| **tools/verify_modules.mjs** | verificador autónomo (55 checks) | — |

---

## 3. Qué se hizo en los últimos workstreams

### WS-K1 — Game-over ya no oculta la revisión didáctica
- Problema: al gastar la última vida, el modal de fin de partida saltaba **encima** de la
  revisión, sin dejar ver *por qué* fallaste.
- Solución: `showPedagogicalReview()` **ya no abre** el modal síncronamente. Guarda la
  intención en `this.pendingOutcomeModal = { kind, outcome }` y cambia la etiqueta del CTA
  (`bannerNextBtn`) a *"Ver Fin de Partida ➔"* / *"Ver Subida de Nivel ➔"* / *"Ver Fin del
  Boss ➔"* con estilo ámbar `.cta-terminal`.
- `openPendingOutcomeModal()` abre el modal correcto cuando el usuario pulsa el CTA.

### WS-K2 — Deja de salir siempre "Main Pair"
- Problema: el objetivo entrenado solo se aleatorizaba al cargar → siempre el mismo stem.
- Solución: `rotateMultitrackTarget()` llama a `randomizeTargetStem()` **en cada ensayo**
  (desde `advanceToNextTrial()` y desde el CTA). `pickRandomTargetStem(session, excludeId)`
  garantiza cambio (200/200 en el test).
- Sesión `orch_session` ahora entrena **4 clases**: orchestra, piano, woodwinds, strings.

### WS-K3 — Perceptibilidad de los EQ en multitrack
- Problema: los EQ orquestales eran poco perceptibles.
- Solución doble:
  1. **Offset de ganancia aditivo** en `generateAcousticTarget()` cuando
     `isMultitrackSession`: `+2.5 dB` (y `weight *= 1.25`), techo elevado a `14 dB`.
     *Se usó offset aditivo porque el multiplicativo quedaba anulado por el suelo de
     audibilidad (`Math.max(bounds.min, …)`, min normal 5 dB).* Resultado medido:
     media |ganancia| 5.00 → ~6.8 dB.
  2. **Target Spotlight**: `setSpotlight()` atenúa los stems NO objetivo (por defecto
     −6 dB) en A/B/C por igual, para comparación justa. Toggle `#spotlightToggleBtn` en
     el Stem Mixer.
- Además, el subtítulo de la revisión muestra el nombre del stem entrenado (🎯).

### WS-K4 — Ampliación de la base de teoría de mezcla
- **+6 clases acústicas nuevas**: `organ`, `epiano`, `acoustic_guitar`, `percussion`,
  `flute`, `trumpet` → **24 clases** en total.
- Cada una con: banco EQ (≥9 escenarios), lección didáctica (≥5 bandas), alias.
- `ACOUSTIC_CLASS_ALIASES`: `flauta/piccolo→flute`, `trompeta→trumpet`,
  `guitarra acustica/nylon→acoustic_guitar`, `congas/djembe→percussion`,
  `hammond/leslie→organ`, `wurlitzer/rhodes→epiano`, `timbales→toms`, `clarinete→woodwinds`.
- `AudioResourceManager`: remapeo de stems (órgano/rhodes/wurli → nuevas clases).

### WS-H / WS-I / WS-J (base previa, ya consolidada)
- **WS-H**: clase acústica derivada del **instrumento** (no del nombre del fichero) + bancos
  ampliados.
- **WS-I**: banda musical útil **80 Hz – 14 kHz** (`TARGET_FREQ_MIN_HZ`/`MAX`) con
  ponderación perceptual (shelves ×1.35, campanas anchas ×1.2; penaliza <100 Hz ×0.35,
  >12 kHz ×0.5, filtros estructurales ×0.8).
- **WS-J1..J6**: personalización completa por instrumento (clases dedicadas + bancos +
  texto de lección para orquesta/Decca, toms, teclados/piano, maderas y metales).

---

## 4. Las 24 clases acústicas

```
kick · snare · vocals · bass · guitars · cymbals · drumbus · generic · room ·
strings · master · synthetic · orchestra · toms · keys · piano · woodwinds · brass ·
organ · epiano · acoustic_guitar · percussion · flute · trumpet
```
(las **6 últimas** son las añadidas en WS-K4)

---

## 5. Invariantes del proyecto (NO romper)

De [`project_rules.txt`](project_rules.txt):

1. La UI **solo** se construye desde `AUDIO_SOURCES` — **nunca** inventar pistas.
2. `AUDIO_BASE_PATH` es la **única** constante de ruta de audio.
3. Llamar a `teardownGraph()` al cambiar de routing.
4. **Sin fallback a ruido** si un `.ogg` falla (fallar explícito, no "sonar raro").
5. Los *tilts* del espectro visual son **puramente cosméticos** (no afectan al audio).
6. STAGE 5 = **Boss Fight** (dos bandas) siempre.
7. `ScoringEngine` penaliza topologías incompatibles hasta un 70%.
8. En multitrack, **solo** el stem objetivo pasa por la cadena de EQ; el resto va directo a
   `masterGain`.

---

## 6. Verificación

### Autónoma (recomendada)
```cmd
node tools/verify_modules.mjs
```
Hace, en un sandbox ESM temporal:
1. **Sintaxis** de cada `src/web/*.js` vía `node --check` (copiando a `.mjs`, porque
   `--check` sobre `.js` lo trata como CommonJS y falla con `import`/`export`).
2. **Invariantes** WS-I/J/K: 24 clases, bancos/lecciones/alias de las 6 nuevas, rotación de
   objetivo, banda 80 Hz–14 kHz, boost multitrack (media sube y techo ≤14 dB), flags del
   trainer.

Salida esperada: **`ALL PASS (55 checks)`** y exit code `0`.

### Live HTTP (con el server arriba)
```cmd
curl -s -o NUL -w "%{http_code}\n" http://localhost:8080/src/web/App.js
```
Comprobar 200 en cada módulo y presencia de marcadores en el HTML/CSS.

### Regla de cache-busting
Los `import` internos usan `?v=70`; `index.html` carga `App.js?v=71` y
`styles_v2.css?v=71`. **Al publicar en Pages, sube todas las cadenas `?v=N` juntas**
(código + HTML) para evitar versiones mixtas. Busca con:
```cmd
findstr /s /r /c:"?v=[0-9][0-9]*" index.html src\web\*.js
```

---

## 7. Trampas conocidas (pitfalls)

- **`?v=N` rompe `node --check`/resolución ESM** → usar el sandbox de `tools/verify_modules.mjs`.
- **`node --check` sobre `.js` = CommonJS** → para forzar ESM hay que copiar a `.mjs`.
- **El boost multiplicativo se anula** si lo clampa el suelo `bounds.min`; usar offset aditivo.
- **`stdio:'pipe'` + `console.error`**: la salida de stderr puede no mostrarse en la consola
  de la tarea; para depurar, usar `console.log`.
- **`read_file` en modo `slice`** ignora `indentation`; no pasar `anchor_line: 0`.
- **`execFileSync(...)` de Node** no tiene el problema, pero recordar pasar el `cond` a
  helpers de test (¡`check(name)` sin `cond` ⇒ `FAIL`!).
- Módulos legacy en `legacy/` y `src/web/App_v4x.js` **no** están vivos: no editarlos por error.

---

## 8. Backlog / próximos pasos

1. **Limpieza legacy**: retirar `src/web/App_v4*.js` y `legacy/` una vez confirmado que nada
   los referencia (búsqueda de imports).
2. **Regresión manual** contra [`plans/REPAIR_PLAN.md`](plans/REPAIR_PLAN.md).
3. **Publicación**: antes del push a Pages, alinear todos los `?v=N`.
4. Opcional: extender `tools/verify_modules.mjs` con comprobaciones del motor de audio
   (routing A/B/C, spotlight), hoy difíciles por depender del DOM/WebAudio.
5. Opcional: más clases acústicas / más escenarios por banco si se pide ampliar la DB.

---

## 9. Mapa mental de los flujos clave

```
Onboarding → modo_juego → campaña/dificultad → GameLoop.startNewTrial()
   └─ TrainingManager.generateAcousticTarget()   ← banda 80–14k + boost multitrack
   └─ AudioEngine.setTargetEQ() / setUserEQ()     (solo stem objetivo en multitrack)
   └─ App.renderQuizInterface()

submitGuess → ScoringEngine.calculateScore() → GameLoop.evaluateTrialOutcome()
   └─ App.showPedagogicalReview(result)
        └─ pendingOutcomeModal = {kind: levelUp|bossDefeat|gameOver}
        └─ CTA bannerNextBtn = "Ver … ➔"  (.cta-terminal)
   └─ (CTA) openPendingOutcomeModal() → modal correspondiente
   └─ (CTA) advanceToNextTrial() → rotateMultitrackTarget() → startNewTrial()
```

---

*Fin del checkpoint. Para reanudar: `node dev-server.js` + `node tools/verify_modules.mjs`.*
