# Ear Training App - Project State & Architecture

Este documento sirve como "punto de guardado" (checkpoint) del estado actual de la aplicación, su arquitectura, y los últimos avances. Si necesitas retomar el proyecto con un nuevo agente o en otra sesión, proporcionarle este archivo le dará el contexto exacto de dónde estamos.

> **Nota de mantenimiento:** este archivo describe el código VIVO. El controlador es `src/web/App.js` y la hoja de estilos viva es `styles_v2.css`. Cualquier referencia a `App_v4x.js`, `App_temp*.js` o `styles.css` es legacy y no forma parte de la aplicación activa.

## 1. Visión General
Se trata de una aplicación web de entrenamiento auditivo (Ear Training) orientada a ingenieros de mezcla y productores. El objetivo es emular un entorno VST profesional (estilo FabFilter Pro-Q / Cubase 15 Pro) donde el usuario debe identificar modificaciones de ecualización en A/B/X usando pistas de audio reales o ruidos sintetizados.

## 2. Tecnologías y Stack
- **Frontend / UI**: HTML5, CSS Vanilla (diseño Dark/Glassmorphism premium, sin librerías externas).
- **Audio / DSP**: Web Audio API pura (`BiquadFilterNode`, `AnalyserNode`, `AudioBufferSourceNode`).
- **Gráficos**: Canvas 2D API (`Visualizer_v2.js`) para representación espectral y funciones de transferencia.
- **Módulos JS**: Arquitectura ES6 basada en clases, sin build step (se sirve directamente).
- **Cache-busting**: los `import` usan sufijos `?v=N` y `index.html` carga `./src/web/App.js?v=N`.

## 3. Arquitectura del Código (Módulos Principales)

- **`index.html` & `styles_v2.css`**: Contienen la interfaz principal. `styles_v2.css` es la hoja viva (referenciada en el `<head>`). Destaca la barra superior con el fader de volumen maestro fusionado con un vúmetro estilo hardware, el selector de dificultad (que se bloquea visualmente durante la partida), el dock inferior con el panel Surgical EQ y las tarjetas de resultados.
- **`src/web/App.js`**: El controlador principal (Main Controller). Orquesta la inicialización, enlaza los eventos del DOM (botones, canvas drag) con los managers lógicos, gestiona los estados de pantalla (`setAppState`), el enrutado A/B/C, el Stem Mixer multitrack y los modales (Game Over, Level Up, Boss Defeat, Campaign Complete).
- **`src/web/AudioEngine.js`**: El corazón del DSP. Gestiona el ruteo de la señal (`switchMonitor` A/B/C), construye los grafos de ecualización (`buildGraph`) y carga las fuentes de audio. La carga de sesiones multitrack usa un pool de concurrencia acotada (`loadStemsWithConcurrency`, máx. 3 para no disparar el rate-limiting de GitHub Pages) y muestra el spinner global (`setLoadingSpinner`).
  - *Dato técnico vital*: Los parámetros de los filtros se ajustan estableciendo `.value` directamente además de `.setValueAtTime()` para garantizar la sincronización inmediata con las funciones matemáticas del Visualizador.
- **`src/web/AudioResourceManager.js`**: Gestor de recursos. Implementa Lazy Loading, una caché LRU acotada, eventos de carga (`onLoadStart` / `onLoadComplete` / `onLoadError`) y la lista maestra `AUDIO_SOURCES`. Exporta `AUDIO_BASE_PATH` (ruta ÚNICA de los OGG) y `pickRandomTargetStem()` (selección aleatoria de stem objetivo).
- **`src/web/AcousticMatrix.js`**: **Fuente única de verdad** del contenido didáctico de ecualización por clase acústica (`vocals`, `guitars`, `acoustic_guitar`, `bass`, `snare`, `kick`, `toms`, `drumbus`, `cymbals`, `room`, `strings`, `orchestra`, `woodwinds`, `flute`, `brass`, `trumpet`, `keys`, `piano`, `organ`, `epiano`, `percussion`, `master`, `synthetic`, `generic`). Expone `resolveAcousticClassKey()` y `ACOUSTIC_CLASS_ALIASES` para normalizar cualquier nombre de pista a una clave de clase.
- **`src/web/Visualizer_v2.js`**: Motor gráfico 60FPS. Dibuja el Analizador de Espectro RTA (azul cyan), la curva objetivo (naranja brillante) y la curva del usuario interactiva (púrpura). Calcula las curvas de filtro interrogando la respuesta en frecuencia de los nodos WebAudio reales.
- **`src/web/ScoringEngine.js`**: Motor de puntuación algorítmica. Puntúa Frecuencia (70%) y Ganancia (30%) de forma independiente. El feedback pedagógico (`getPedagogicalFeedback`, `analyzeProPractices`) se alimenta de `AcousticMatrix` a través de `resolveAcousticClassKey()`; la antigua `ContextMatrix` fue eliminada por duplicada.
- **`src/web/TrainingManager.js`**: La máquina de estados del juego (vidas, rachas, stages, combates con "Jefes"). Selecciona los objetivos (`generateAcousticTarget`) con criterio *audibility-first*.
  - *Dato técnico vital*: `resolveAcousticClass()` honra la clase del instrumento cargado y, si la fuente es genérica, rota por `LESSON_ROSTER` para variar el repertorio. La ganancia se acota por dificultad con `_audibilityBounds()` (Fácil 6–12 dB, Normal 5–12 dB, Hard 3–9 dB) y se pondera al alza en shelves/bells anchos. En sesiones multitrack (`isMultitrackSession`) se suma un desplazamiento fijo de +2.5 dB y el techo sube a 14 dB, para que el filtro no quede enmascarado por el conjunto.
- **`src/web/GameLoopManager.js`**: Store observable de progresión (`currentLevel`, `currentStage`, `totalScore`, `lives`, `streak`, `activeDifficulty`, `activeGameMode`, etc.). `TrainingManager` lo expone como `trainer.gameLoopStore` para mantener una única fuente de verdad de la progresión.
- **`src/web/VUMeter.js`**: Vúmetros por stem del Stem Mixer.

## 4. Hitos Recientes Completados
1. **WS-A (Usabilidad):** HUD con puntuación/rango/stage y vidas visibles; modales de Game Over enriquecidos, Level Up y Boss Defeat cableados, y pantalla de agradecimiento al completar la campaña con retorno al menú.
2. **WS-B (Audibilidad):** Generación de objetivos *audibility-first* (hasta ±12 dB, con peso compensatorio), escenarios nuevos (`synthetic`, `master`, `strings`) y rotación de repertorio desacoplada de la fuente.
3. **WS-C (Multitrack):** Selección aleatoria del stem objetivo (`pickRandomTargetStem`), sincronización del badge y eliminación de la duplicación `AUDIO_SOURCES`/`MULTITRACK_SESSIONS`.
4. **WS-D (Pedagogía):** Consolidación de toda la matriz didáctica en `AcousticMatrix` y corrección del resolver de clase (el feedback ya no cae siempre en `generic`).
5. **WS-E (UX/Rendimiento):** Selector de dificultad no interactivo durante la partida y carga de sesiones con concurrencia acotada + spinner.
6. **WS-F (Housekeeping):** Constante única `AUDIO_BASE_PATH` para la ruta de audio y reconciliación de `project_rules.txt` (§3 y §4) con la realidad del código.
7. **WS-G (Multitrack):** Silencio hasta solo/mute y estado coherente del Stem Mixer al recargar la sesión.
8. **WS-H (Instrumento autoritativo):** La clase del instrumento cargado manda sobre el currículum de campaña, con bancos de EQ ampliados por instrumento.
9. **WS-I (Banda musical):** Ventana de entrenamiento 80 Hz–14 kHz (`TARGET_FREQ_MIN_HZ` / `TARGET_FREQ_MAX_HZ`) y ponderación perceptual (shelves ×1.35, bells anchos ×1.2; penalización de <100 Hz y >12 kHz).
10. **WS-J (Personalización total):** Clases y lecciones propias para `orchestra`, `toms`, `keys`, `piano`, `woodwinds` y `brass`, con remapeo de los stems del multitrack.
11. **WS-K (Feedback + variedad + audibilidad + contenido):** (a) el modal de Fin de Partida / Boss Derrotado se difiere al CTA de resultados (`pendingOutcomeModal`, botón ámbar «Ver Fin de Partida / Boss / Subida de Nivel») para que SIEMPRE se vea y escuche la revisión didáctica antes del cierre; (b) el stem objetivo del multitrack rota en cada ensayo (`rotateMultitrackTarget`), evitando que la orquesta entrene siempre el "Main Pair"; (c) *Target Spotlight* (`setSpotlight()` / `spotlightFactor()`, −6 dB a los stems no objetivo + toggle 🎯 Focus en el Stem Mixer) y boost de ganancia multitrack para que los EQ se perciban dentro de la mezcla; (d) 6 clases nuevas (`organ`, `epiano`, `acoustic_guitar`, `percussion`, `flute`, `trumpet`) con 9 escenarios de EQ, 5 bloques de lección y alias propios.

## 5. Trabajo en Curso / Próximos Pasos
1. Limpieza de módulos legacy (`App_v40..v45`, `App_temp*`, `App_recon_temp`, `App.js.part*`, `App.js.reconstructed.js`, etc.) y corrección de código muerto menor: `drawPhaseCurve()` early return, `setSourceCalibration()` no-op, `fftBuffer` duplicado en `Visualizer_v2.js` y unificación del tamaño de FFT entre motor y visualizador.
2. Pasada de regresión manual contra la matriz de pruebas de `plans/REPAIR_PLAN.md`.
