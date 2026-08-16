# Ear Training App - Project State & Architecture

Este documento sirve como "punto de guardado" (checkpoint) del estado actual de la aplicación, su arquitectura, y los últimos avances. Si necesitas retomar el proyecto con un nuevo agente o en otra sesión, proporcionarle este archivo le dará el contexto exacto de dónde estamos.

## 1. Visión General
Se trata de una aplicación web de entrenamiento auditivo (Ear Training) orientada a ingenieros de mezcla y productores. El objetivo es emular un entorno VST profesional (estilo FabFilter Pro-Q / Cubase 15 Pro) donde el usuario debe identificar modificaciones de ecualización en A/B/X usando pistas de audio reales o ruidos sintetizados.

## 2. Tecnologías y Stack
- **Frontend / UI**: HTML5, CSS Vanilla (diseño Dark/Glassmorphism premium, sin librerías externas).
- **Audio / DSP**: Web Audio API pura (`BiquadFilterNode`, `AnalyserNode`, `AudioBufferSourceNode`).
- **Gráficos**: Canvas 2D API (`Visualizer_v2.js`) para representación espectral y funciones de transferencia.
- **Módulos JS**: Arquitectura ES6 basada en clases.

## 3. Arquitectura del Código (Módulos Principales)

- **`index.html` & `styles.css`**: Contienen la interfaz principal. Destaca la barra superior con el fader de volumen maestro fusionado con un vúmetro estilo hardware (`fader-fused`), y el área central reservada para el visualizador interactivo.
- **`src/web/App_v43.js`**: El controlador principal (Main Controller). Orquesta la inicialización, enlaza los eventos del DOM (botones, canvas drag) con los managers lógicos.
- **`src/web/AudioEngine.js`**: El corazón del DSP. Gestiona el enrutamiento de la señal (`switchMonitor` A/B/X) y construye los grafos de ecualización (`buildGraph`). 
  - *Dato técnico vital*: Los parámetros de los filtros se ajustan estableciendo `.value` directamente además de `.setValueAtTime()` para garantizar la sincronización inmediata con las funciones matemáticas del Visualizador.
- **`src/web/AudioResourceManager.js`**: Gestor de recursos. Implementa Lazy Loading, una caché LRU de tamaño 2 para no saturar la RAM, y la lista maestra `AUDIO_SOURCES` categorizada por dificultad/tipo (ruidos sintéticos, aislamientos, micrófonos cercanos, acústica/sala, multitracks y boss fights).
- **`src/web/Visualizer_v2.js`**: Motor gráfico 60FPS. Dibuja el Analizador de Espectro RTA (azul cyan), la curva objetivo (naranja brillante) y la curva del usuario interactiva (púrpura). Calcula las curvas de filtro interrogando la respuesta en frecuencia de los nodos WebAudio reales. El obsoleto medidor maestro vertical y textos de depuración fueron erradicados en favor de un diseño limpio.
- **`src/web/ScoringEngine.js`**: Motor de puntuación algorítmica. Puntúa Frecuencia (70%) y Ganancia (30%) de forma independiente. Contiene la `ContextMatrix` que provee feedback pedagógico de alto nivel ("Impacto en la mezcla Pro").
- **`src/web/TrainingManager.js`**: La máquina de estados del juego (vidas, rachas, stages, combates con "Jefes"). Selecciona los objetivos (`generateAcousticTarget`) inyectando ruido "Jitter" a configuraciones de ecualización de mezcla del mundo real. 
  - *Dato técnico vital*: La ganancia de los escenarios se escala por dificultad multiplicándola (x2.5 en Fácil, x1.8 en Normal) para hacer los cambios audibles con propósitos educativos.

## 4. Hitos Recientes Completados
1. Integración de fader de volumen estilo Cubase con vúmetro horizontal en la barra superior (`index.html`).
2. Limpieza del canvas: Eliminación del medidor vertical estático izquierdo y textos de debug superpuestos (`Visualizer_v2.js`).
3. Sincronización matemática del Target EQ: Bug resuelto en `AudioEngine.js` que impedía ver la curva naranja objetivo, forzando la inyección al `.value` del parámetro.
4. Curva de Dificultad Dinámica: Los movimientos de EQ ahora son audibles y exagerados en modos Fácil/Normal, y sutiles/quirúrgicos en Hard/Pro (`TrainingManager.js`).
5. Pedagogía Activa: Implementación del núcleo lógico "Impacto en la mezcla Pro" (`ContextMatrix` en `ScoringEngine.js`).

## 5. Trabajo en Curso / Próximos Pasos (El Plan Actual)
Estamos a punto de implementar el módulo **Surgical EQ**, que transformará la UI de un simple "arrastrar en el canvas" a un panel VST avanzado:
1. **Panel Surgical EQ**: Insertar debajo del visualizador los controles numéricos para Frecuencia (Hz), Ganancia (dB), Factor Q y Tipo de Filtro (Bell, Shelf, Pass). 
2. **Sincronización Bidireccional**: Al arrastrar en el canvas, los controles numéricos se actualizarán; al escribir en los controles, el canvas y WebAudio se actualizarán (en `App_v43.js` y `Visualizer_v2.js`).
3. **Expansión de la Matriz Semántica**: Extender `ContextMatrix` (`ScoringEngine.js`) a todos los instrumentos (Voces, Guitarras, Bajos, Platos, etc.) para proveer feedback técnico preciso sin importar la pista elegida.
4. *(En discusión)*: Posible botón cosmético de `Phase Mode` (Linear vs Minimum) propuesto en los wireframes de C++.
