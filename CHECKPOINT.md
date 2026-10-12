# CHECKPOINT — Punto de partida ("start from here")

> **Documento de traspaso.** Captura el estado exacto del proyecto *Ear Training* para
> poder reanudar el trabajo en una sesión nueva sin re-descubrir la arquitectura.
>
> Última actualización: **2026-10-12** · Autor: sesión Code (WS-M: Lab didáctico de dinámica · E5 Práctica Guiada sin score · M9 readout PRO, casos *pineados* y cabecera sin Fácil/Normal/Pro)
> Estado global: **WORKSTREAMS WS-G … WS-M COMPLETADOS Y VERIFICADOS** ✅

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
  diferido del game-over, rotación de objetivo, ampliación de teoría de mezcla, el nuevo
  **modo Dynamic Range** y su **Lab didáctico** —Teoría/ADSR, scope temporal, casos guiados,
  sidechain, *Pro Tips* y **Práctica Guiada sin score**—) están **terminados y validados** con
  **129 comprobaciones automáticas**.

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
| **index.html** | `<link … styles_v2.css?v=80>` | 13 |
| | botón `#spotlightToggleBtn` (stem-mixer-header) | ~131 |
| | `#dynamicsPanel` / `#compressorCanvas` / `#dynScopeCanvas` / `#dynamicsKnobRow` / `#dynamicsDockSection` | 141 / 157 / 171 / 255 / 371 |
| | `#theoryPanel` / `#dynCaseVerdict` / `#dynTipsPanel` | 301 / 387 / 388 |
| | `<script type="module" src="./src/web/App.js?v=80">` | 954 |
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
| **src/web/dynamics-processor.js** | `class DynamicsProcessor` (DSP del modo) | 46 |
| **src/web/dynamics-math.js** | `staticGainDb()` / `upwardGainDb()` / `DEFAULT_DYNAMICS_PARAMS` / `DSP_STYLE` | 43 / 71 / 160 / 146 |
| **src/web/DynamicsEngine.js** | `DYNAMICS_CACHE_VERSION` / `_processorUrl()` | 30 / 84 |
| **src/web/DynamicsMatrix.js** | `COMPRESSOR_TYPES` / `DYNAMICS_SCENARIOS` / `DYNAMICS_CHALLENGES` | 32 / 317 / 749 |
| | `DYNAMICS_SIDECHAIN_CASES` / `DYNAMICS_MASTER_TIPS` / `DYNAMICS_THEORY` | 475 / 513 / 651 |
| **src/web/CompressorUI.js** | `class CompressorUI` (Canvas Pro-C2; solo curva de transferencia) | 45 |
| **src/web/TooltipController.js** | `hitTestHotspots()` / `HOLD_MS` / `class TooltipController` | 35 / 45 |
| **src/web/DynamicsLab.js** | `class DynamicsLab` (Explore/Práctica/Case) | 383 |
| | `describePracticeAchievements()` (checklist cualitativo E5) | 344 |
| | `DYNAMICS_CASE_STUDIES` / `describeSidechainCases()` / `listExploreScenarios()` | 111 / 329 / 313 |
| **src/web/TheoryPanel.js** | `ADSR_DEFAULTS` / `adsrVertices()` / `buildAdsrPath()` / `class TheoryPanel` | 18 / 49 / 100 / 109 |
| **src/web/DynamicsScopeRenderer.js** | `class DynamicsScopeRenderer` (osciloscopio temporal complementario; waveform min/max de entrada con **auto-normalización** + **cinta de GR de alta resolución** (`SCOPE_COLUMNS`=2880, `SCOPE_COLS_PER_FRAME`=16, interpolación del |GR| por frame); lectura **PRO** por **RMS integrado** (`SCOPE_RMS_SECONDS`) + **máximos congelados** (`maxPeakDb` de nivel y `maxGrDb` de reducción, sin decaimiento) y **dígitos refrescados** solo a `SCOPE_TEXT_HZ`; rejilla de nivel en **fracciones de pantalla fijas** vía `_updateMeter()`/`dispInDb`; helpers `ampToDb`/`dbToAmp`/`peakToDb`/`rmsAmp`/`rmsToDb`/`levelToY`/`ampToY`/`grToY`/`pushHistory`) | 220 |
| **tools/verify_modules.mjs** | verificador autónomo (129 checks) | — |

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

### WS-L — Modo Dynamic Range (nuevo módulo completo)
Híbrido **Lab de exploración + retos puntuables** sobre la app web viva, con DSP propio
(el `DynamicsCompressorNode` nativo no hace upward compression, sidechain externo, release
dependiente de programa ni carácter por tipo).
- **W1/W1b — DSP** ([`src/web/dynamics-processor.js`](src/web/dynamics-processor.js:46) +
  [`src/web/dynamics-math.js`](src/web/dynamics-math.js:1)): downward + upward, knee
  cuadrático suave, attack/release/hold, release program-dependent, makeup/auto-gain, mix
  dry/wet, detector peak/RMS, feed-forward/feedback, stereo-link, sidechain externo y
  **coloración armónica gated por el switch Color**. Telemetría por `port.postMessage`
  (~47-48 Hz). 5 tipos de carácter (`vca`/`fet`/`opto`/`varimu`/`bus`) centralizados en `DSP_STYLE`.
- **W2/W2b — Motor y enrutado** ([`src/web/DynamicsEngine.js`](src/web/DynamicsEngine.js:35),
  [`src/web/AudioEngine.js`](src/web/AudioEngine.js:679)): `buildDynamicsGraph()` /
  `setDynamicsConfig()` / `teardownDynamics()`, compresor insertado **solo** en la ruta
  auditada (`processedDest = dynNode || masterGain`) y tap de sidechain (`_wireDynamicsSidechain`,
  se omite si el sidechain coincide con el stem objetivo).
- **W3/W3b — UI y markup** ([`src/web/CompressorUI.js`](src/web/CompressorUI.js:45),
  `index.html`): renderer Canvas 2D estilo FabFilter Pro-C2 (grid, unidad, knee, curva,
  handles `threshold`/`ratio`/`knee`, operating dot, medidor de reducción); panel
  `#dynamicsPanel` + `#compressorCanvas` + `#dynamicsKnobRow` + `#dynamicsDockSection`.
- **W4 — Ayuda** ([`src/web/TooltipController.js`](src/web/TooltipController.js:45)): mantener
  el ratón quieto **1 s** (`HOLD_MS=1000`, tolerancia `6 px`) muestra la explicación del
  control (`DYNAMICS_HELP`, 20 claves, cubriendo los 14 `data-help` del HTML + hotspots del canvas).
- **W5 — Contenido** ([`src/web/DynamicsMatrix.js`](src/web/DynamicsMatrix.js:1)): 5 tipos de
  compresor, 6 buses, 10 escenarios (incl. sidechain kick→bajo `bass_duck_kick`), lecciones y
  10 retos con `weights`.
- **W6 — Orquestación** ([`src/web/DynamicsLab.js`](src/web/DynamicsLab.js:253)): Explore /
  Challenge / Case, con desbloqueo curricular de controles; módulo **sin DOM** (importable).
- **W7 — Integración** ([`src/web/App.js`](src/web/App.js:465)): tarjeta Dynamic Range
  desbloqueada, estados `DYNAMICS_MODE_SELECT` + `DYNAMICS_LAB`, swap dock/canvas,
  `activeGameMode='dynamics'`.
- **W8 — Puntuación** ([`src/web/ScoringEngine.js`](src/web/ScoringEngine.js:343)):
  `evaluateDynamics()` con tolerancias continuas (abs dB/mix/hold, rel ratios, log2
  attack/release), puertas categóricas exactas (`style`, `sidechain`) que impiden un veredicto
  "correcto", y componente sintético `direction` (un ajuste solo-down nunca puntúa 100 % en un
  escenario upward).
- **W9 — Verificación**: `tools/verify_modules.mjs` gana la sección "3) DYNAMIC RANGE"
  (tipos, escenarios, sidechain, función de transferencia, sanitizeParams, hotspots y scoring
  funcional) → hoy **129 checks ALL PASS** tras ampliarla en WS-M (E3 −14, E5 +2, los 2 invariantes de
  cache-buster, los **12 checks del medidor PRO del scope** y el check de la **cinta de GR de alta
  resolución**, §6/§4).
- **Diferido**: *lookahead* (a un tier posterior, por decisión de diseño). El color por tipo es
  un **switch `Color` independiente** para estudiar primero la curva limpia.

### WS-M — Lab didáctico de dinámica (Teoría · Scope · Casos · Sidechain · Pro Tips)
Ampliación del modo Dynamic Range hacia un laboratorio didáctico completo, **sin romper** la curva
limpia ni la puntuación de WS-L.
- **M1 — Teoría + ADSR** ([`src/web/TheoryPanel.js`](src/web/TheoryPanel.js:109) y `DYNAMICS_THEORY`
  en [`src/web/DynamicsMatrix.js`](src/web/DynamicsMatrix.js:651)): 6 bloques teóricos; el bloque 2
  pinta una **envolvente ADSR interactiva** (ataque/release) con geometría pura exportada
  (`ADSR_DEFAULTS`, `adsrVertices()`, `buildAdsrPath()`) verificable sin DOM. Panel `#theoryPanel`.
- **M2 — Gráfica temporal complementaria** (dedicada en
  [`src/web/DynamicsScopeRenderer.js`](src/web/DynamicsScopeRenderer.js:123), montada por
  [`App._mountDynamicsScope()`](src/web/App.js:589) sobre `#dynScopeCanvas`): gráfica estilo FabFilter C2
  **separada** de la curva de transferencia —dibuja la **evolución de la envolvente de la señal de
  entrada** en dBFS sobre un eje temporal y superpone la **reducción de ganancia** como cinta
  diferenciada, ambas **sincronizadas** sobre el mismo eje de tiempo. El renderer lee el *waveform*
  de los analizadores del `AudioEngine` (`getPreTimeDomainData`→`getTimeDomainData`) y recibe la
  telemetría (`grDb`) por `setTelemetry()`; la curva de transferencia de `CompressorUI` queda
  **intacta**. Sustituye a la vieja tira `#dynScopeWrap`.
- **M3 — Espectro dry/wet** (*retirado*): [`src/web/DynamicsSpectrumRenderer.js`](src/web/DynamicsSpectrumRenderer.js)
  se creó y verificó (ejes puros `SPECTRUM_RANGE`/`frequencyToX()`/`sampleEnvelope()`), pero el
  pivote a dominio temporal (M2) lo dejó sin uso; se **movió a `legacy/DynamicsSpectrumRenderer.js`**
  y su sección de verificación del espectro se retiró. No queda código muerto en `src/web`.
- **M4 — Casos guiados** ([`src/web/DynamicsLab.js`](src/web/DynamicsLab.js:111),
  `DYNAMICS_CASE_STUDIES`): 10 casos con `scenarioId`, `lessonId`, `checks` y `tips`, con
  autocorrección (`checkCase`) y revelado de referencia (`revealCaseTarget`).
- **M5 — Sidechain** (`DYNAMICS_SIDECHAIN_CASES`, validados por `describeSidechainCases()`): 3 rutas
  reales de `rock_band_session` (bajo←bombo, guitarras←voz, teclados←voz) como
  `sessionId`+`targetStemId`+`keyStemId`.
- **M6 — Pro Tips** (`DYNAMICS_MASTER_TIPS`, panel `#dynTipsPanel`): 12 consejos de mezcla (método,
  envolvente, umbral/ratio, codo, tipos, ganancia, paralelo, sidechain y errores).
- **M7 — Integración y verificación** ([`src/web/App.js`](src/web/App.js:15)): imports y hashes
  `?v=80`; la sección de verificación se amplía a **129 checks ALL PASS** (helpers puros del scope
  + medidor PRO, geometría ADSR, casos, sidechain, `DYNAMICS_THEORY` y el checklist cualitativo de E5).
- **M8 — Práctica Guiada sin score (E5)** ([`src/web/App.js`](src/web/App.js:1049),
  [`src/web/DynamicsLab.js`](src/web/DynamicsLab.js:344)): el sub-modo de retos puntuables pasa a
  **práctica guiada sin score ni vidas**. `_setGameHudVisible(false)` oculta score/rango/stage, vidas
  y lifeline durante todo el lab; `submitChallenge()` emite `achievements` (helper puro
  `describePracticeAchievements()`, mapea `breakdown` → `ok/close/miss`) y la UI muestra un **checklist
  cualitativo** («Logros de este paso» ✓/≈/✗) en vez de puntos, con el `(NN%)` eliminado del texto.
  Etiquetas de-gamificadas: "Reto" → "Paso" y tarjeta "Práctica Guiada".
- **M9 — Readout PRO · práctica guiada *pineada* · limpieza de cabecera** (WS-M cont.,
  [`src/web/DynamicsScopeRenderer.js`](src/web/DynamicsScopeRenderer.js:470) y
  [`src/web/App.js`](src/web/App.js:962)):
  (a) **Meter PRO (RMS + máximo congelado + refresco limitado)**: el readout ya no lee el pico crudo por frame.
  `_updateMeter(blockMs, blockPeakDb, dt)` **integra el RMS** de la señal (media cuadrática con constante
  de tiempo `SCOPE_RMS_SECONDS` ≈ 300 ms —la lectura "media" de un medidor comercial—) y **congela el pico máximo alcanzado**
  (`maxPeakDb`, **enganchado y sin decaimiento**, como referencia didáctica estable);
  toda la balística es **dt-dependiente** (idéntica a 30/60/144 fps) y los **dígitos se refrescan a
  `SCOPE_TEXT_HZ`** (6 Hz, no 60) para que el número se quede quieto mientras la onda anima fluida.
  `_drawReadout()` pinta `ENTRADA RMS` y, **justo debajo**, el `MÁX` congelado; en la **columna derecha**, `GR` y su propio **máximo congelado** `MÁX GR` (`maxGrDb`, sin decaimiento) para fijar el *make-up*, más la etiqueta `auto ×N`. La rejilla de niveles se ancla a **fracciones de pantalla fijas** (`amp` 1/0.5/0.25): antes se dividía por el auto-gain `g`, de modo que las líneas y sus números se aplastaban y solapaban al subir la normalización.
  (b) **Casos de estudio *pineados***: `_dynCaseUnlockedKeys()` deriva el set editable de los `checks`
  del caso activo (mismo contrato que `unlocked` en los retos) y `_applyDynamicsUnlockState()` **desactiva**
  los controles no relevantes; al cargar el caso, `CASE_LOADED` nombra la pista asignada, sincroniza la
  cabecera (`_syncHeaderSource`) y **fija la Fuente** (`_lockDynamicsSource(true)` →
  `.custom-select-wrapper.source-locked` + `#sourceSelect.disabled`); `exitDynamicsLab()` la libera.
  (c) **Cabecera en modo Dynamics**: el selector **Fácil/Normal/Pro** (`#difficultyGroup`) se **oculta**
  al entrar (`startDynamicsMode`) y se restaura al salir.
- **M10 — Alta resolución de la cinta de reducción de ganancia (amarilla)** (WS-M cont.,
  [`src/web/DynamicsScopeRenderer.js`](src/web/DynamicsScopeRenderer.js:407)): la cinta de «Reducción»
  ya no se dibuja como una **escalera de pocos niveles**. La causa era que `_advanceStrip()` escribía
  el **mismo** `grDb` una vez por cada columna añadida (`SCOPE_COLS_PER_FRAME`=4 → plateaus de 4
  columnas = peldaños visibles). Ahora la resolución horizontal sube **4×** (`SCOPE_COLUMNS` 720 →
  **2880**) con las columnas por frame escaladas en la misma proporción (`SCOPE_COLS_PER_FRAME` 4 →
  **16**, preservando la ventana temporal ~3 s) y `_advanceStrip()` **interpola el |GR|** a lo largo de
  las columnas añadidas (estado `_lastGrCol`: valor previo → actual), produciendo un borde continuo en
  lugar de escalones. `reset()` reinicia `_lastGrCol`. Verificación: check **«cinta GR: alta
  resolución (interpola varios niveles por frame)»** (una tira recién avanzada contiene ≥ perFrame/2
  niveles distintos, no un único escalón).

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
3. **Invariantes DYNAMIC RANGE (WS-L)**: 5 tipos con `engine == DSP_STYLE[x]` (sin drift),
   cobertura de escenarios por bus, referencias `sourceId`/`target`/`sidechain`
   (`{sessionId, sourceStemId}`) válidas contra `AUDIO_SOURCES`/`MULTITRACK_SESSIONS`, puntos
   conocidos de la función de transferencia (hard-knee `-10 dB @ T=-20, R=4` → `-7.5 dB`;
   `upwardGainDb` espejo exacto), clamps de `sanitizeParams`, `hitTestHotspots`, `HOLD_MS=1000`,
   cobertura de `DYNAMICS_HELP` sobre los 15 `data-help`, y scoring funcional de `evaluateDynamics`.
4. **Invariantes del Lab didáctico (WS-M)**: geometría ADSR (`adsrVertices` abre en `baseY`, pico
   en `topY` y cierra en `baseY`; más ataque/release ⇒ más ancho; `buildAdsrPath` = 1 `M` + 4 `L`),
   10 `DYNAMICS_CASE_STUDIES` con `scenarioId`/`lessonId`/`checks` válidos, 3 presets de sidechain
   de `rock_band_session`, `DYNAMICS_THEORY` con ≥6 secciones y una ADSR, y `describePracticeAchievements`
   (E5: checklist cualitativo que traduce el `breakdown` a `ok/close/miss` sin mostrar números).
   Y el **medidor PRO del scope** (`DynamicsScopeRenderer.js`): helpers puros
   (`ampToDb`/`dbToAmp`/`peakToDb`/`rmsAmp`/`rmsToDb`/`levelToY`/`ampToY`/`grToY`/`pushHistory`),
   constantes de balística, construcción sin DOM/engine, **convergencia del RMS integrado**
   (`SCOPE_RMS_SECONDS`), **máximo congelado** (`maxPeakDb`, no decae) y **balística dt-dependiente**
   (idéntica a 60 vs 144 fps) + contrato del readout (`ENTRADA RMS`/`MÁX`/`MÁX GR`). Y la **cinta GR de
   alta resolución**: `SCOPE_COLUMNS`=2880 / `SCOPE_COLS_PER_FRAME`=16 y la **interpolación del |GR|**
   entre columnas (una tira recién avanzada contiene varios niveles, no un único escalón).

Salida esperada: **`ALL PASS (129 checks)`** y exit code `0`.

4. **Invariante de UX (consistencia cabecera/fuente)**: el selector de fuente de la cabecera (`#sourceSelect` + `.custom-select-header` dentro de `#sourceDropdownWrapper`) **debe nombrar la fuente que el lab acaba de cargar**. Cada carga de escenario (`_onDynamicsScenario`) y cada `_loadDynamicsForMode` (Explore/Challenge/Case) llaman a `App._syncHeaderSource(sourceId, sourceName)`, que añade la opción si falta, fija `select.value`, actualiza `store.activeTrackId`, el texto del header y marca la `.custom-option` activa. Nota: fijar `select.value` por código **no** dispara el listener `change` (que recarga el EQ), por lo que la sincronización es puramente visual/estado.

### Live HTTP (con el server arriba)
```cmd
curl -s -o NUL -w "%{http_code}\n" http://localhost:8080/src/web/App.js
```
Comprobar 200 en cada módulo y presencia de marcadores en el HTML/CSS.

### Regla de cache-busting
Los `import` internos y `index.html` comparten **el mismo `?v=80`** (`App.js?v=80`,
`styles_v2.css?v=80`). **Al publicar en Pages, sube todas las cadenas `?v=N` juntas**
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

1. ~~**Limpieza legacy**~~ ✅ hecho: `src/web/App_v4*.js` y los scratch (`tmp_verify/`,
   `replacement.txt`) ya no están en el árbol activo; los históricos viven en `legacy/`.
2. **Regresión manual** contra [`plans/REPAIR_PLAN.md`](plans/REPAIR_PLAN.md).
3. ~~**Publicación — alinear `?v=N`**~~ ✅ hecho: todo unificado a **`?v=80`**.
4. ~~**Destino de `DynamicsSpectrumRenderer.js`**~~ ✅ hecho: **retirado** (el *scope* temporal M2
   lo sustituye). El módulo vive ahora en `legacy/DynamicsSpectrumRenderer.js` y su sección de
   verificación del espectro se eliminó. Con E5 (que añade 2 checks del checklist cualitativo), los
   2 invariantes de cache-buster, los 12 del medidor PRO del scope y el check de la **cinta de GR de
   alta resolución**, el total queda en **129 checks**.
5. Opcional: extender `tools/verify_modules.mjs` con comprobaciones del motor de audio
   (routing A/B/C, spotlight), hoy difíciles por depender del DOM/WebAudio.
6. Opcional: más clases acústicas / más escenarios por banco si se pide ampliar la DB.
7. Dynamic Range: *lookahead* sigue diferido (tier posterior por decisión de diseño).

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
