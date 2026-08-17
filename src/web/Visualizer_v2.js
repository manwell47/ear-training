/**
 * @file Visualizer.js
 * @description FabFilter / Pro-Q style Real-Time 60 FPS Canvas Spectral Visualizer (RTA).
 * Features:
 * 1. Interactive EQ Filter Response Block (getFrequencyResponse) drawn underneath the spectrum line,
 *    providing FabFilter Pro-Q style glassmorphism feedback for Gain, Frequency, and Q factor.
 * 2. Strict Y-axis calibration (CALIBRATION_OFFSET = 55, MAX_DB = 18, MIN_DB = -18, RANGE_DB = 36).
 * 3. Sub-Bin Linear Interpolation (Graves) + Average Binning (Agudos) + Visual Ballistics (Inertia = 0.85).
 * 4. RTA Tilt (+3.0 dB/octave) visual compensation for flat pink noise centered at 0 dB.
 */

export class Visualizer {
  /**
   * @param {HTMLCanvasElement} canvas 
   * @param {import('./AudioEngine.js').AudioEngine} audioEngine 
   */
  constructor(canvas, audioEngine) {
    this.canvas = canvas;
    this.audioEngine = audioEngine;
    this.ctx = canvas.getContext('2d', { alpha: false }); // Opaque optimization
    
    // Default to 4096 since AudioEngine uses fftSize 8192 (frequencyBinCount = 4096)
    this.fftBuffer = new Float32Array(4096).fill(-140.0);

    // Canvas Dimensions & Scaling relative to parent #workspace grid cell
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Variable Global de Inercia Visual (Frame a Frame)
    this.previousY = new Float32Array(3000);
    this.peakHoldY = new Float32Array(3000);
    this.peakHoldTime = new Float32Array(3000);

    // Visualization Visibility Control Flags
    this.showTargetCurve = false; // Revealed upon guess completion for didactic comparison
    this.showUserCurve = false;   // Shown in Normal mode or when user guess differs from target
    this.showNodeHandle = false;  // Shown in Normal mode
    this.showPhaseCurve = false;  // Tarea 1: Rotación de Fase en Modo Pro
    this.isProMode = false;       // Modo Pro Activo
    this.rtaMode = 'smooth';      // 'smooth' o 'raw'

    // SoundGym Target & User Guess Display Data for Didactic Overlay
    this.targetFreqHz = null;
    this.targetGainDb = null;
    this.userFreqHz = null;
    this.userGainDb = null;

    // Hover Cursor Frequency Readout
    this.hoverPos = { x: -1, y: -1, active: false };

    // Interactive Drag Handle State (Multi-band support)
    this.interactiveNodes = [
      { frequencyHz: 200, gainDb: 0, qFactor: 2.0, type: 'peaking', isDragging: false },
      { frequencyHz: 2000, gainDb: 0, qFactor: 2.0, type: 'peaking', isDragging: false }
    ];
    this.activeNodeIndex = 0; // The node currently being hovered/dragged/controlled

    this.onNodeChange = null;
    this.onBandSelected = null; // Callback when a different band is clicked/dragged

    // High-Resolution FFT Data Buffer (16384 FFT = 8192 Bins)
    this.fftBuffer = new Float32Array(8192).fill(-140.0);

    // 1/3 Octave ISO Frequencies bounded strictly between 20 Hz and 20000 Hz
    this.soundgymFrequencies = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];

    // Bind mouse / touch handlers for interactive drag & hover
    this.setupInteractivity();

    // Resize listener tracking exact canvas size
    this.resize = this.resize.bind(this);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.resize();

    // Start 60 FPS render loop
    this.render = this.render.bind(this);
    requestAnimationFrame(this.render);
  }

  /**
   * Actualiza el estado de los nodos interactivos (las pastillas que se arrastran).
   * @param {Array} nodesArray - Array de objetos { frequencyHz, gainDb, qFactor, type }
   */
  setNodes(nodesArray) {
    if (!Array.isArray(nodesArray)) return;
    
    // Clonamos para mantener el estado local y reactividad de UI segura
    this.interactiveNodes = nodesArray.map(n => ({
      frequencyHz: n.frequencyHz || 1000,
      gainDb: n.gainDb || 0,
      qFactor: n.qFactor || 2.0,
      type: n.type || 'peaking',
      isDragging: false
    }));

    if (this.activeNodeIndex >= this.interactiveNodes.length) {
      this.activeNodeIndex = 0;
    }
  }

  resize() {
    // If the canvas isn't visible or lacks size, fallback to 100x100 to avoid crash
    const w = this.canvas.clientWidth || 100;
    const h = this.canvas.clientHeight || 100;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.width = w;
    this.height = h;
    this.ctx.scale(dpr, dpr);

    if (!this.previousY || this.previousY.length < w) {
      this.previousY = new Float32Array(Math.max(3000, Math.ceil(w))).fill(h);
      this.peakHoldY = new Float32Array(Math.max(3000, Math.ceil(w))).fill(h);
      this.peakHoldTime = new Float32Array(Math.max(3000, Math.ceil(w)));
    } else {
      this.previousY.fill(h);
      this.peakHoldY.fill(h);
      this.peakHoldTime.fill(0);
    }
  }

  setupInteractivity() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    const startDrag = (e) => {
      const pos = getPos(e);
      this.hoverPos.x = pos.x;
      this.hoverPos.y = pos.y;
      this.hoverPos.active = true;

      if (!this.showNodeHandle) return;

      // Hit Detection (Detección de Clic)
      let minDistance = Infinity;
      let nearestIndex = 0;
      
      this.interactiveNodes.forEach((node, idx) => {
          const nodeX = this.freqToX(node.frequencyHz);
          const nodeY = this.gainToY(node.gainDb);
          const dist = Math.hypot(nodeX - pos.x, nodeY - pos.y);
          if (dist < minDistance) {
              minDistance = dist;
              nearestIndex = idx;
          }
      });

      // Si la distancia es menor a 15px, iniciar el arrastre
      if (minDistance <= 20) { // Un poco más permisivo (20px) para pantallas táctiles/ratón
        this.activeNodeIndex = nearestIndex;
        const activeNode = this.interactiveNodes[this.activeNodeIndex];
        activeNode.isDragging = true;
        
        if (this.onBandSelected) {
            this.onBandSelected(this.activeNodeIndex);
        }
        e.preventDefault();
      }
    };

    const moveDrag = (e) => {
      const pos = getPos(e);
      this.hoverPos.x = pos.x;
      this.hoverPos.y = pos.y;
      this.hoverPos.active = true;

      if (!this.showNodeHandle) return;
      
      const activeNode = this.interactiveNodes[this.activeNodeIndex];
      if (!activeNode || !activeNode.isDragging) return;

      const { freq, gain } = this.pixelToFreqGain(pos.x, pos.y);
      const filtersWithoutGain = ['notch', 'highpass', 'lowpass', 'hp', 'lp'];
      const nodeTypeLower = (activeNode && activeNode.type) ? activeNode.type.toLowerCase() : 'peaking';
      const isNoGain = filtersWithoutGain.includes(nodeTypeLower);

      activeNode.frequencyHz = Math.max(20, Math.min(20000, freq));
      activeNode.gainDb = isNoGain ? 0 : Math.max(-18, Math.min(18, gain));

      if (this.onNodeChange) {
        this.onNodeChange(this.interactiveNodes);
      }
      e.preventDefault();
    };

    const stopDrag = () => {
      this.interactiveNodes.forEach(n => n.isDragging = false);
    };

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverPos.active = false;
      this.interactiveNodes.forEach(n => n.isDragging = false);
    });

    this.canvas.addEventListener('wheel', (e) => {
      if (!this.showNodeHandle) return;
      e.preventDefault();
      
      // Determine nearest node to mouse cursor to change its Q
      const pos = getPos(e);
      let minDistance = Infinity;
      let nearestIndex = 0;
      this.interactiveNodes.forEach((node, idx) => {
          const nodeX = this.freqToX(node.frequencyHz);
          const nodeY = this.gainToY(node.gainDb);
          const dist = Math.hypot(nodeX - pos.x, nodeY - pos.y);
          if (dist < minDistance) {
              minDistance = dist;
              nearestIndex = idx;
          }
      });
      
      this.activeNodeIndex = nearestIndex;
      if (this.onBandSelected) this.onBandSelected(this.activeNodeIndex);

      const activeNode = this.interactiveNodes[this.activeNodeIndex];
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      activeNode.qFactor = Math.max(0.2, Math.min(20.0, activeNode.qFactor + delta));

      if (this.onNodeChange) {
        this.onNodeChange(this.interactiveNodes);
      }
    }, { passive: false });

    // Doble clic para resetear ganancia a 0dB (Comportamiento Pro DAW)
    this.canvas.addEventListener('dblclick', (e) => {
      if (!this.showNodeHandle || !this.interactiveNodes) return;
      const pos = getPos(e);
      let minDistance = Infinity;
      let nearestIndex = -1;
      this.interactiveNodes.forEach((node, idx) => {
        const nodeX = this.freqToX(node.frequencyHz);
        const nodeY = this.gainToY(node.gainDb);
        const dist = Math.hypot(nodeX - pos.x, nodeY - pos.y);
        if (dist < minDistance) {
          minDistance = dist;
          nearestIndex = idx;
        }
      });

      if (minDistance <= 20 && nearestIndex !== -1) {
        const activeNode = this.interactiveNodes[nearestIndex];
        activeNode.gainDb = 0;
        this.activeNodeIndex = nearestIndex;
        if (this.onNodeChange) this.onNodeChange(this.interactiveNodes);
        if (this.onBandSelected) this.onBandSelected(this.activeNodeIndex);
      }
    });

    this.canvas.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', stopDrag);

    this.canvas.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('touchend', stopDrag);
  }

  // ─── Logarithmic Frequency Scale (20 Hz to 20000 Hz) ─────────────────────
  
  freqToX(freq) {
    const f = Math.max(20, Math.min(20000, freq));
    return (Math.log10(f / 20) / Math.log10(1000)) * this.width;
  }

  xToFreq(x) {
    let normX = x / this.width;
    return 20 * Math.pow(1000, normX);
  }

  gainToY(gainDb) {
    const RTA_TOP_DBFS = 0.0;
    const RTA_BOTTOM_DBFS = -60.0;
    const RTA_RANGE = RTA_TOP_DBFS - RTA_BOTTOM_DBFS;
    const pixelsPerDb = this.height / RTA_RANGE;
    
    const eqZeroDbFS = -18.0;
    const normEqZero = (eqZeroDbFS - RTA_BOTTOM_DBFS) / RTA_RANGE;
    const eqZeroY = this.height - normEqZero * this.height;

    return eqZeroY - (gainDb * pixelsPerDb);
  }

  yToGain(y) {
    const RTA_TOP_DBFS = 0.0;
    const RTA_BOTTOM_DBFS = -60.0;
    const RTA_RANGE = RTA_TOP_DBFS - RTA_BOTTOM_DBFS;
    const pixelsPerDb = this.height / RTA_RANGE;
    
    const eqZeroDbFS = -18.0;
    const normEqZero = (eqZeroDbFS - RTA_BOTTOM_DBFS) / RTA_RANGE;
    const eqZeroY = this.height - normEqZero * this.height;

    return (eqZeroY - y) / pixelsPerDb;
  }

  freqGainToPixel(freq, gain) {
    return { x: this.freqToX(freq), y: this.gainToY(gain) };
  }

  pixelToFreqGain(x, y) {
    return { freq: this.xToFreq(x), gain: this.yToGain(y) };
  }

  // ─── Main 60 FPS Render Loop ──────────────────────────────────────────────────

  render() {
    try {
      this.ctx.clearRect(0, 0, this.width, this.height);

      // Actualizar Barra de Transporte (Scrub)
      const transportScrub = document.getElementById('transportScrub');
      if (transportScrub && this.audioEngine && this.audioEngine.isPlaying && !this.isScrubbing) {
        if (this.audioEngine.ctx) {
          const currentTime = this.audioEngine.ctx.currentTime - (this.audioEngine.playbackStartTime || 0);
          const duration = parseFloat(transportScrub.max) || 0;
          transportScrub.value = duration > 0 ? (currentTime % duration) : currentTime;
        }
      }

      // 1. Draw SoundGym Background Frequency Grid & Band Divisions
      this.drawGrid();

      // 2. Draw Interactive EQ Filter Response Block (BEFORE drawing RTA spectrum)
      if (this.showUserCurve && this.interactiveNodes && this.interactiveNodes.length > 0) {
        const isEqOff = this.audioEngine && this.audioEngine.activeRoute === 'A';
        
        this.interactiveNodes.forEach((node, idx) => {
          const strokeColor = isEqOff 
              ? "rgba(150, 150, 150, 0.5)" // Gray in Bypass
              : (idx === this.activeNodeIndex ? "rgba(0, 242, 254, 0.9)" : "rgba(0, 242, 254, 0.5)");
          const fillColor = isEqOff
              ? "rgba(150, 150, 150, 0.1)"
              : (idx === this.activeNodeIndex ? "rgba(0, 242, 254, 0.15)" : "rgba(0, 242, 254, 0.05)");

          this.drawFilterCurveFromConfig(node, strokeColor, fillColor);
        });
      }

      if (this.showTargetCurve && this.audioEngine.targetGraphNodes) {
        this.drawToleranceZone(); 
        
        for (let i = 0; i < this.audioEngine.targetGraphNodes.length; i++) {
            const filter = this.audioEngine.targetGraphNodes[i];
            if (filter && typeof filter.getFrequencyResponse === 'function') {
                // High contrast orange for target curve
                this.drawFilterCurve(filter, 'rgba(245, 158, 11, 0.9)', 'rgba(245, 158, 11, 0.15)');
            }
        }
        
        if (this.showUserCurve && this.interactiveNodes) {
            for (let i = 0; i < this.interactiveNodes.length; i++) {
                this.drawFilterCurveFromConfig(this.interactiveNodes[i], 'rgba(192, 132, 252, 0.8)', 'rgba(192, 132, 252, 0.15)');
            }
        }
        
        if (this.showPhaseCurve || this.isProMode) {
          if (this.audioEngine.targetGraphNodes && this.audioEngine.targetGraphNodes.length > 0) {
            this.drawPhaseCurve(this.audioEngine.targetGraphNodes, '#ec4899');
          }
          if (this.showUserCurve && this.audioEngine.userGraphNodes && this.audioEngine.userGraphNodes.length > 0) {
            this.drawPhaseCurve(this.audioEngine.userGraphNodes, '#f59e0b');
          }
        }

        this.drawDidacticComparisonOverlay();
      }

      this.drawSpectrum();

      if (this.showNodeHandle && !this.showTargetCurve) {
        this.drawNodeHandles();
      }

      if (this.hoverPos.active) {
        let anyDragging = false;
        if (this.interactiveNodes) {
           anyDragging = this.interactiveNodes.some(node => node.isDragging);
        }
        if (!anyDragging) {
          this.drawHoverReadout();
        }
      }


    } catch (e) {
      this.ctx.fillStyle = 'red';
      this.ctx.font = '20px monospace';
      this.ctx.fillText('CRASH: ' + e.message, 10, 80);
      this.ctx.fillText(e.stack.substring(0, 100), 10, 110);
      console.error('Render Loop Crash:', e);
      return; // Stop loop
    }

    requestAnimationFrame(this.render);
  }

  drawGrid() {
    const ctx = this.ctx;
    const topY = 0;
    const bottomY = this.height;

    // 1. Frequency Grid Lines & Text Labels
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillStyle = '#00f2fe';
    ctx.font = 'bold 11px "Fira Code", monospace';

    const textY = this.height - 10;

    this.soundgymFrequencies.forEach(freq => {
      const x = this.freqToX(freq);
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.stroke();

      let label;
    if (freq >= 1000) {
      if (freq === 20000) label = '20k';
      else if (freq === 3150) label = '3.15k';
      else if (freq === 1250) label = '1.25k';
      else label = `${freq / 1000}k`;
    } else {
      label = `${freq}`;
    }

      // Draw background pill for text
      ctx.fillStyle = 'rgba(11, 12, 16, 0.8)';
      let textWidth = ctx.measureText(label).width;
      
      if (freq === 20) {
        ctx.textAlign = 'left';
        ctx.fillRect(10, textY - 10, textWidth + 4, 14);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillText('20', 10, textY);
      } else if (freq === 20000) {
        ctx.textAlign = 'right';
        ctx.fillRect(this.width - 30 - textWidth, textY - 10, textWidth + 8, 14);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillText('20k', this.width - 25, textY);
      } else if (label === '20') {
        ctx.textAlign = 'left';
        ctx.fillRect(45, textY - 10, textWidth + 4, 14);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillText('20', 45, textY); // Shifted right to avoid dBFS overlap
      } else {
        ctx.textAlign = 'center';
        ctx.fillRect(x - textWidth/2 - 2, textY - 10, textWidth + 4, 14);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillText(label, x, textY);
      }
    });

    // 2. Escala global del RTA recortada a 0 .. -60 dBFS (Maximizando resolución visual)
    const RTA_TOP_DBFS = 0.0;
    const RTA_BOTTOM_DBFS = -60.0;
    const RTA_RANGE = RTA_TOP_DBFS - RTA_BOTTOM_DBFS;
    
    // Coordenada Y exacta para la línea nominal de 0dB del ecualizador (anclada a -18 dBFS)
    const eqZeroDbFS = -18.0;
    const normEqZero = (eqZeroDbFS - RTA_BOTTOM_DBFS) / RTA_RANGE;
    this.eqZeroY = this.height - normEqZero * this.height;

    // 3. Cuadrícula Horizontal Sincronizada (Grid EQ / RTA)
    const eqSteps = [18, 12, 6, 0, -6, -12, -18, -24, -30, -36, -42];
    ctx.textAlign = 'left';

    eqSteps.forEach(eqGain => {
      // Correspondencia matemática absoluta: 1 dB EQ = 1 dB RTA
      const rtaDb = eqZeroDbFS + eqGain;
      if (rtaDb < RTA_BOTTOM_DBFS || rtaDb > RTA_TOP_DBFS) return;

      const norm = (rtaDb - RTA_BOTTOM_DBFS) / RTA_RANGE;
      const y = this.height - norm * this.height;
      
      // Dibujar línea horizontal maestra
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      if (eqGain === 0) {
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
      }
      ctx.stroke();

      // Ajuste de colisión vertical para textos
      let textY = y - 5;
      if (textY > this.height - 15) textY = this.height - 15;
      if (textY < 15) textY = 15;

      // Etiquetas RTA (Izquierda)
      let rtaLabel = rtaDb === 0 ? `0 dBFS` : `${rtaDb} dBFS`;
      ctx.fillStyle = 'rgba(11, 12, 16, 0.85)';
      let rtaTextWidth = ctx.measureText(rtaLabel).width;
      ctx.fillRect(28, textY - 10, rtaTextWidth + 4, 14);
      ctx.fillStyle = eqGain === 0 ? 'rgba(0, 242, 254, 0.8)' : 'rgba(255, 255, 255, 0.35)';
      ctx.fillText(rtaLabel, 30, textY);

      // Etiquetas EQ (Derecha)
      let eqLabel = eqGain > 0 ? `+${eqGain} dB` : (eqGain === 0 ? `0 dB (EQ)` : `${eqGain} dB`);
      ctx.textAlign = 'right';
      let eqTextWidth = ctx.measureText(eqLabel).width;
      ctx.fillStyle = 'rgba(11, 12, 16, 0.85)';
      ctx.fillRect(this.width - 32 - eqTextWidth, textY - 10, eqTextWidth + 4, 14);
      ctx.fillStyle = eqGain === 0 ? 'rgba(0, 242, 254, 0.8)' : 'rgba(168, 85, 247, 0.8)';
      ctx.fillText(eqLabel, this.width - 30, textY);
      ctx.textAlign = 'left'; // Reset
    });
  }

  /**
   * Hybrid RTA Spectrum Renderer with RTA Tilt (+3.0 dB/oct) and Visual Ballistics.
   */
  drawSpectrum() {
    if (!this.audioEngine || !this.audioEngine.analyser) return;

    // Congelar la gráfica exactamente donde estaba al pausar
    if (this.audioEngine.analyser.frequencyBinCount !== this.fftBuffer.length) {
      this.fftBuffer = new Float32Array(this.audioEngine.analyser.frequencyBinCount).fill(-140.0);
    }
    
    if (this.audioEngine.isPlaying) {
      this.audioEngine.analyser.getFloatFrequencyData(this.fftBuffer);
    }

    const ctx = this.ctx;
    const sampleRate = this.audioEngine.ctx ? this.audioEngine.ctx.sampleRate : 44100;
    const frequencyData = this.fftBuffer;

    const MAX_DB = 18;
    const MIN_DB = -18;
    const RANGE_DB = MAX_DB - MIN_DB;
    const CALIBRATION_OFFSET = 45;

    const currentAudioSource = this.audioEngine ? (this.audioEngine.currentTrackId || this.audioEngine.currentBufferName || '') : '';
    
    // Leer de forma robusta desde AudioEngine si es ruido (ignora el ID del track)
    const isSynthetic = this.audioEngine ? !!this.audioEngine.isSyntheticMode : false;
    ctx.beginPath();
    let nyquist = sampleRate / 2;

    const width = this.width;
    const height = this.canvas.height;
    
    // Fast check for silence to prevent diagonal tilt glitch
    let maxEnergy = -Infinity;
    for (let i = 0; i < frequencyData.length; i++) {
        if (frequencyData[i] > maxEnergy) maxEnergy = frequencyData[i];
    }
    if (maxEnergy <= -135.0) {
        return; // It's pure silence (or paused), do not render chaotic tilted noise.
    }

    // 1. Calcular el valor pivote (Ancla 0dB)
    if (isSynthetic) {
      // Para ruidos de laboratorio: forzar que cruce EXACTAMENTE por 0dB en 1kHz
      let index1kHz = Math.floor((1000 / nyquist) * frequencyData.length);
      let currentVal1kHz = isFinite(frequencyData[index1kHz]) ? frequencyData[index1kHz] : -60.0;
      
      if (this.pivot1kHz === undefined || isNaN(this.pivot1kHz)) this.pivot1kHz = -60.0;
      this.pivot1kHz = (this.pivot1kHz * 0.98) + (currentVal1kHz * 0.02);
    } else {
      // Para música/stems reales: referencia absoluta fija.
      // Evita el efecto AGC masivo donde el silencio o un bombo sin 1kHz dispare la gráfica al techo.
      // -65 dBFS en el analizador será la línea central de 0dB de la cuadrícula, ideal para audios dinámicos.
      this.pivot1kHz = -65.0; 
    }

    // Referencias de la Rejilla
    const tiltDbPerOctave = 0.0; 

    // Pre-calculate Y path to draw fill, trace and peak hold separatedly
    const pathY = new Float32Array(width);
    const now = performance.now();

    const rawY = new Float32Array(width);
    
    // 1. Extraer RAW FFT mapping (alineado con la rejilla visual)
    
    for (let x = 0; x < width; x++) {
      // Usar la misma función de mapeo que la rejilla para alineación perfecta
      let freqCenter = this.xToFreq(x);
      
      // Calculate bin indices
      let freqLeft = this.xToFreq(x - 0.5);
      let freqRight = this.xToFreq(x + 0.5);
      
      let idxLeft = Math.floor((freqLeft / nyquist) * frequencyData.length);
      let idxRight = Math.ceil((freqRight / nyquist) * frequencyData.length);
      idxLeft = Math.max(0, Math.min(idxLeft, frequencyData.length - 1));
      idxRight = Math.max(0, Math.min(idxRight, frequencyData.length - 1));

      let val_dB = -100;

      // --- 1. DENSIDAD ESPECTRAL ESTÁNDAR (Para Música y Ruido) ---
      if (idxRight <= idxLeft + 1) {
          // Sub-graves: Ancho de banda de píxel < 1 bin. Interpolación lineal de energía
          let exactIndex = (freqCenter / nyquist) * frequencyData.length;
          let idx1 = Math.floor(exactIndex);
          let idx2 = Math.min(idx1 + 1, frequencyData.length - 1);
          let fraction = exactIndex - idx1;
          let v1 = isFinite(frequencyData[idx1]) ? frequencyData[idx1] : -120;
          let v2 = isFinite(frequencyData[idx2]) ? frequencyData[idx2] : -120;
          val_dB = v1 + fraction * (v2 - v1);
      } else {
          // Graves a Agudos: Promedio de densidad espectral por píxel
          let sum = 0;
          let count = 0;
          for (let i = idxLeft; i <= idxRight; i++) {
              let v = frequencyData[i];
              if (isFinite(v) && v > -120) {
                  sum += Math.pow(10, v / 10);
                  count++;
              }
          }
          val_dB = (count > 0) ? 10 * Math.log10(sum / count) : -120;
      }
      
      // --- 2. OFFSET DE CALIBRACIÓN FFT BIFURCADO ---
      // El usuario solicitó separar la lógica matemática para ruidos y audios reales.
      // - Ruido Blanco Sintético: 61.3 dB exactos para promediar en la línea de -18 dBFS.
      // - Audios (Multitrack): ~40.0 dB (o 43.3) para que los transitorios se ubiquen en rango dinámico utilizable.
      const calOffset = isSynthetic ? 61.3 : 40.0;
      val_dB += calOffset;

      if (val_dB === -Infinity || Number.isNaN(val_dB)) val_dB = -120.0;

      // Escala global del RTA fija a 0 .. -85 dBFS
      const RTA_TOP_DBFS = 0.0;
      const RTA_BOTTOM_DBFS = -60.0;
      const RTA_RANGE = RTA_TOP_DBFS - RTA_BOTTOM_DBFS;

      // Aplicar Tilt opcional (0.0 para White Noise plano, +3.0 para Pink plano)
      if (tiltDbPerOctave !== 0.0) {
        let octavesFrom1kHz = Math.log2(freqCenter / 1000.0);
        val_dB += octavesFrom1kHz * tiltDbPerOctave;
      }
      
      let percentage = (RTA_TOP_DBFS - val_dB) / RTA_RANGE;
      let y = height * percentage;
      
      rawY[x] = Math.max(0, Math.min(height, y));
    }

    // 2. Spatial Smoothing (Filtro IIR Bidireccional de Fase Cero) para modo 'smooth'
    // Logra un suavizado fraccional de octava perfecto porque el eje X es logarítmico
    const smoothY = new Float32Array(width);
    if (this.rtaMode === 'raw') {
      for (let x = 0; x < width; x++) smoothY[x] = rawY[x];
    } else {
      // Usar un suavizado espacial ligero para no destruir la forma de la curva EQ.
      let alpha = isSynthetic ? 0.25 : 0.35;
      let s = rawY[0];
      for (let x = 0; x < width; x++) {
         s = (alpha * rawY[x]) + ((1 - alpha) * s);
         smoothY[x] = s;
      }
      s = smoothY[width - 1];
      for (let x = width - 1; x >= 0; x--) {
         s = (alpha * smoothY[x]) + ((1 - alpha) * s);
         smoothY[x] = s;
      }
    }

    // 3. Time Ballistics (Inercia Temporal Premium)
    for (let x = 0; x < width; x++) {
      let y = smoothY[x];

      if (isNaN(this.previousY[x]) || this.previousY[x] === 0 || this.previousY[x] >= this.height - 5) {
        this.previousY[x] = y;
      }

      // --- BALÍSTICA Y SUAVIZADO TEMPORAL ---
      if (this.audioEngine && this.audioEngine.isPlaying) {
        if (isSynthetic) {
          // Para ruido estocástico (blanco/rosa), usar Media Móvil Exponencial (EMA) muy lenta
          // para simular la integración a largo plazo de un RTA profesional.
          let emaAlpha = 0.03;
          this.previousY[x] = (y * emaAlpha) + (this.previousY[x] * (1 - emaAlpha));
        } else {
          // Attack (señal sube = Y baja) vs Release (señal baja = Y sube) para música
          if (y < this.previousY[x]) {
            // Ataque instantáneo para capturar transitorios rápidos (bombo) a su máxima amplitud real
            let attackAlpha = 1.0;
            this.previousY[x] = y * attackAlpha + this.previousY[x] * (1 - attackAlpha);
          } else {
            // Release Premium (Caída lineal constante en dB/sec)
            let releaseDbPerFrame = 1.3; 
            let releasePixels = (height / RTA_RANGE) * releaseDbPerFrame;
            this.previousY[x] = Math.min(y, this.previousY[x] + releasePixels);
          }
        }
      }

      y = this.previousY[x];
      pathY[x] = y;

      // Peak Hold Logic
      if (this.audioEngine && this.audioEngine.isPlaying) {
        if (y < this.peakHoldY[x] || this.peakHoldY[x] === 0 || isNaN(this.peakHoldY[x])) {
          this.peakHoldY[x] = y;
          this.peakHoldTime[x] = now;
        } else {
          // Decay delay 1.2s
          if (now - this.peakHoldTime[x] > 1200) {
             this.peakHoldY[x] += 1.5; // Smooth decay
             if (this.peakHoldY[x] > height) this.peakHoldY[x] = height;
          }
        }
      }
    }

    // --- SUAVIZADO ESPACIAL (ANTI-ALIASING FFT EN GRAVES) ---
    // Elimina la apariencia "serrada" en bajas frecuencias donde la resolución lineal de píxeles
    // excede la resolución logarítmica de bins del FFT (8192 no basta para sub-graves).
    // Aplicamos una media móvil (Moving Average) en el eje X, solo en bajas frecuencias.
    let spatialSmoothY = new Float32Array(width);
    // Ventana de suavizado espacial dinámica (más grande cuanto más a la izquierda)
    let windowSize = Math.max(2, Math.floor(width * 0.0075)); 
    for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let w = -windowSize; w <= windowSize; w++) {
            let idx = x + w;
            if (idx >= 0 && idx < width) {
                sum += pathY[idx];
                count++;
            }
        }
        spatialSmoothY[x] = sum / count;
    }

    // Crossfade: Aplicar 100% smoothing por debajo de 100Hz, 0% por encima de 400Hz.
    for (let x = 0; x < width; x++) {
        let freq = this.xToFreq(x);
        let blend = 1.0;
        if (freq > 100) {
            blend = 1.0 - Math.min(1.0, (freq - 100) / 300); // 100Hz a 400Hz ramp
        }
        pathY[x] = (spatialSmoothY[x] * blend) + (pathY[x] * (1.0 - blend));
    }

    // 1. Draw Peak Hold Trace (Back Layer) - Only for acoustic material to avoid clutter
    if (!isSynthetic) {
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        if (x === 0) ctx.moveTo(x, this.peakHoldY[x]);
        else ctx.lineTo(x, this.peakHoldY[x]);
      }
      ctx.strokeStyle = "rgba(16, 185, 129, 0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 2. Draw Fill Envelope
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x < width; x++) {
      ctx.lineTo(x, pathY[x]);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    
    let gradFill = ctx.createLinearGradient(0, 0, 0, height);
    if (isSynthetic) {
        gradFill.addColorStop(0, "rgba(0, 210, 255, 0.7)");
        gradFill.addColorStop(0.5, "rgba(0, 210, 255, 0.25)");
        gradFill.addColorStop(1, "rgba(0, 210, 255, 0.05)");
    } else {
        gradFill.addColorStop(0, "rgba(16, 185, 129, 0.4)");
        gradFill.addColorStop(0.5, "rgba(16, 185, 129, 0.1)");
        gradFill.addColorStop(1, "rgba(16, 185, 129, 0.0)");
    }
    ctx.fillStyle = gradFill;
    ctx.fill();

    // 3. Draw Main Active Stroke (Front Layer)
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      if (x === 0) ctx.moveTo(x, pathY[x]);
      else ctx.lineTo(x, pathY[x]);
    }
    let strokeGrad = ctx.createLinearGradient(0, 0, width, 0);
    if (isSynthetic) {
        strokeGrad.addColorStop(0, "rgba(0, 210, 255, 1.0)");
        strokeGrad.addColorStop(1, "rgba(100, 255, 255, 1.0)");
    } else {
        strokeGrad.addColorStop(0, "rgba(16, 185, 129, 1.0)");
        strokeGrad.addColorStop(0.5, "rgba(52, 211, 153, 1.0)");
        strokeGrad.addColorStop(1, "rgba(6, 182, 212, 1.0)");
    }
    
    ctx.shadowBlur = 18;
    ctx.shadowColor = isSynthetic ? "rgba(0, 210, 255, 0.9)" : "rgba(16, 185, 129, 0.9)";
    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /**
   * Render a Cubase 15 Pro style Master Meter on the left axis
   */
  drawMasterMeter() {
    if (this.masterPeakDb === undefined) {
       this.masterPeakDb = -100;
       this.masterCurrentDb = -100;
       this.masterLastPeakTime = 0;
    }

    const currentRms = this.lastRmsDb !== undefined ? this.lastRmsDb : -100;
    
    // Ballistics
    if (currentRms > this.masterCurrentDb) {
        this.masterCurrentDb += (currentRms - this.masterCurrentDb) * 0.4;
    } else {
        this.masterCurrentDb += (currentRms - this.masterCurrentDb) * 0.08;
    }
    
    const now = performance.now();
    if (this.masterCurrentDb > this.masterPeakDb) {
        this.masterPeakDb = this.masterCurrentDb;
        this.masterLastPeakTime = now;
    } else if (now - this.masterLastPeakTime > 1000) {
        this.masterPeakDb -= 0.6;
    }

    const ctx = this.ctx;
    const meterWidth = 8;
    const meterX = 12;
    
    // Scale 0 to -85 dBFS to match RTA scale exactly
    const RTA_TOP = 0.0;
    const RTA_BOTTOM = -85.0;
    const RTA_RANGE = RTA_TOP - RTA_BOTTOM;
    
    // Draw background track
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(meterX, 0, meterWidth, this.height);
    
    // Draw RMS solid bar
    const normRMS = Math.max(0, (this.masterCurrentDb - RTA_BOTTOM) / RTA_RANGE);
    const rmsY = this.height - (normRMS * this.height);
    
    const grad = ctx.createLinearGradient(0, this.height, 0, 0);
    grad.addColorStop(0, '#10b981'); // Green at -85
    grad.addColorStop(0.7, '#10b981'); // Green up to -25
    grad.addColorStop(0.85, '#f59e0b'); // Yellow up to -12
    grad.addColorStop(1, '#f43f5e'); // Red at 0
    
    ctx.fillStyle = grad;
    if (this.height - rmsY > 0 && rmsY <= this.height) {
       ctx.fillRect(meterX, rmsY, meterWidth, this.height - rmsY);
    }
    
    // Draw Peak line
    const normPeak = Math.max(0, (this.masterPeakDb - RTA_BOTTOM) / RTA_RANGE);
    const peakY = this.height - (normPeak * this.height);
    if (peakY >= 0 && peakY <= this.height) {
        ctx.fillStyle = this.masterPeakDb > -1.0 ? '#f43f5e' : '#ffffff';
        ctx.fillRect(meterX - 2, Math.floor(peakY) - 1, meterWidth + 4, 2);
    }
    
    // Draw Peak Hold Text
    ctx.fillStyle = 'rgba(11, 12, 16, 0.9)';
    ctx.fillRect(6, 6, 42, 16);
    ctx.fillStyle = this.masterPeakDb > -1.0 ? '#f43f5e' : '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    const peakText = this.masterPeakDb > -90 ? (this.masterPeakDb > 0 ? '+' : '') + this.masterPeakDb.toFixed(1) : '-INF';
    ctx.fillText(peakText, 27, 18);
    ctx.textAlign = 'left';
  }

  /**
   * Tarea 1: Feedback Visual Premium (Canvas Frequency Response)
   * Renders FabFilter Pro-Q style glassmorphism frequency response curve and translucency footprint underneath the spectrum.
   * 1. Logarithmic frequency array corresponding to X pixels: 20 * Math.pow(1000, x / canvas.width).
   * 2. Native filterNode.getFrequencyResponse(freqArray, magResponse, phaseResponse).
   * 3. dB conversion: 20 * Math.log10(mag) + Y-axis calibration formula:
   *    y = canvas.height - ((dB + CALIBRATION_OFFSET - MIN_DB) / RANGE_DB) * canvas.height
   * 4. Glassmorphism polygon starting at 0dB Y line, tracing response, returning to 0dB Y line.
   *    ctx.fillStyle = "rgba(0, 210, 255, 0.15)", ctx.strokeStyle = "rgba(0, 210, 255, 0.8)", ctx.lineWidth = 2.
   */
  drawFilterCurveFromConfig(config, strokeColor, fillColor) {
    if (!config || !this.audioEngine.ctx) return;
    if (!this.dummyFilterNode) {
      this.dummyFilterNode = this.audioEngine.ctx.createBiquadFilter();
    }
    
    // Asignación directa e inmediata sin programar rampas de automatización
    this.dummyFilterNode.type = config.type || 'peaking';
    this.dummyFilterNode.frequency.value = config.frequencyHz || 1000;
    this.dummyFilterNode.gain.value = config.gainDb || 0;
    this.dummyFilterNode.Q.value = config.qFactor !== undefined ? config.qFactor : 2.0;

    this.drawFilterCurve(this.dummyFilterNode, strokeColor, fillColor);
  }

  drawFilterCurve(filterNode, strokeColor, fillColor) {
    if (!filterNode || !this.audioEngine.ctx) return;

    const ctx = this.ctx;
    const MAX_DB = 18;
    const MIN_DB = -18;
    const RANGE_DB = MAX_DB - MIN_DB;
    const CALIBRATION_OFFSET = 0; // Direct relative dB offset to 0dB center line

    const numPixels = Math.ceil(this.width);
    const freqArray = new Float32Array(numPixels);
    const magResponse = new Float32Array(numPixels);
    const phaseResponse = new Float32Array(numPixels);

    // 1. Array de frecuencias logarítmicas correspondiente a los píxeles del eje X (20 Hz a 20 kHz)
    for (let x = 0; x < this.width; x++) {
      freqArray[x] = 20 * Math.pow(1000, x / this.width);
    }

    // 2. Método nativo getFrequencyResponse del BiquadFilterNode
    try {
      filterNode.getFrequencyResponse(freqArray, magResponse, phaseResponse);
    } catch {
      return;
    }

    // Relación de píxeles por dB en la escala global del RTA
    const RTA_TOP_DBFS = 0.0;
    const RTA_BOTTOM_DBFS = -60.0;
    const RTA_RANGE = RTA_TOP_DBFS - RTA_BOTTOM_DBFS;
    const pixelsPerDb = this.height / RTA_RANGE;

    // 3. Coordenada Y de la línea nominal de 0dB (calculada para -18 dBFS)
    const eqZeroDbFS = -18.0;
    const normEqZero = (eqZeroDbFS - RTA_BOTTOM_DBFS) / RTA_RANGE;
    const zeroDbY = this.height - normEqZero * this.height;

    // 4. Polígono que nace de la línea de 0dB, sigue los puntos calculados y vuelve a 0dB
    ctx.beginPath();
    ctx.moveTo(0, zeroDbY);

    for (let x = 0; x < numPixels; x++) {
      const mag = Math.max(1e-5, magResponse[x]);
      const dB = 20 * Math.log10(mag);
      
      // La coordenada Y final se desplaza desde eqZeroY según la ganancia del filtro y los pixels por dB
      let y = zeroDbY - (dB * pixelsPerDb);
      y = Math.max(0, Math.min(this.height, y));
      ctx.lineTo(x, y);
    }

    ctx.lineTo(this.width, zeroDbY);
    ctx.closePath();

    // Relleno Glassmorphism
    ctx.fillStyle = fillColor || "rgba(0, 210, 255, 0.15)";
    ctx.fill();

    // 5. Contorno superior con strokeStyle y lineWidth = 2
    ctx.beginPath();
    let started = false;

    for (let x = 0; x < numPixels; x++) {
      const mag = Math.max(1e-5, magResponse[x]);
      const dB = 20 * Math.log10(mag);
      let y = this.height - ((dB + CALIBRATION_OFFSET - MIN_DB) / RANGE_DB) * this.height;
      y = Math.max(0, Math.min(this.height, y));

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.strokeStyle = strokeColor || "rgba(0, 210, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /**
   * Tarea 1: Extracción y Renderizado de Fase (Canvas - Modo Pro)
   * Acepta un array de filtros y extrae su cumulative phaseResponse.
   */
  drawPhaseCurve(filters, strokeColor = '#ec4899') {
    if (!filters || !Array.isArray(filters) || filters.length === 0 || !this.audioEngine.ctx) return;

    const ctx = this.ctx;
    const numPixels = Math.ceil(this.width);
    const freqArray = new Float32Array(numPixels);
    const cumulativePhase = new Float32Array(numPixels);
    
    // Arrays temporales para cada iteración
    const magResponse = new Float32Array(numPixels);
    const phaseResponse = new Float32Array(numPixels);
    
    // Array de frecuencias para el eje X
    for (let x = 0; x < this.width; x++) {
      freqArray[x] = 20 * Math.pow(1000, x / this.width);
    }

    try {
      for (let i = 0; i < filters.length; i++) {
        const filter = filters[i];
        if (filter && typeof filter.getFrequencyResponse === 'function') {
            // Solo sumar fase si está haciendo algo (gain != 0 o no peaking)
            if (filter.gain.value !== 0 || filter.type !== 'peaking') {
                filter.getFrequencyResponse(freqArray, magResponse, phaseResponse);
                for (let x = 0; x < numPixels; x++) {
                    cumulativePhase[x] += phaseResponse[x];
                }
            }
        }
      }
    } catch {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([5, 5]);

    let started = false;
    for (let x = 0; x < numPixels; x++) {
      // cumulativePhase[x] is in radians.
      // We must wrap it between -PI and +PI so it stays within the canvas!
      let phaseRad = cumulativePhase[x] % (2 * Math.PI);
      if (phaseRad > Math.PI) phaseRad -= 2 * Math.PI;
      else if (phaseRad < -Math.PI) phaseRad += 2 * Math.PI;

      const normPhase = phaseRad / Math.PI; // -1.0 to +1.0

      const RTA_TOP_DBFS = 0.0;
      const RTA_BOTTOM_DBFS = -60.0;
      const RTA_RANGE = RTA_TOP_DBFS - RTA_BOTTOM_DBFS;
      const eqZeroDbFS = -18.0;
      const normEqZero = (eqZeroDbFS - RTA_BOTTOM_DBFS) / RTA_RANGE;
      const zeroDbY = this.height - normEqZero * this.height;

      let y = zeroDbY - normPhase * (this.height * 0.38);
      y = Math.max(0, Math.min(this.height, y));

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Referencias secundarias de la escala de fase en la esquina derecha del Canvas
    ctx.setLineDash([]);
    ctx.fillStyle = strokeColor;
    ctx.font = 'bold 10px "Fira Code", monospace';
    ctx.textAlign = 'right';

    const topY = (this.height / 2) - (this.height * 0.38);
    const midY = this.height / 2;
    const botY = (this.height / 2) + (this.height * 0.38);

    ctx.fillText('+π (+180°)', this.width - 12, topY + 12);
    ctx.fillText('0 rad (0°)', this.width - 12, midY - 4);
    ctx.fillText('-π (-180°)', this.width - 12, botY - 4);

    ctx.restore();
  }

  drawToleranceZone() {
    if (this.targetFreqHz === null || this.targetFreqHz === undefined) return;

    const ctx = this.ctx;
    const topY = 0;
    const bottomY = this.height;

    // SoundGym 1/3 Octave Tolerance Zone Range
    const freqLow = this.targetFreqHz * Math.pow(2, -1/6);
    const freqHigh = this.targetFreqHz * Math.pow(2, 1/6);

    const xLow = this.freqToX(freqLow);
    const xHigh = this.freqToX(freqHigh);

    const grad = ctx.createLinearGradient(xLow, 0, xHigh, 0);
    grad.addColorStop(0, 'rgba(16, 185, 129, 0.00)');
    grad.addColorStop(0.5, 'rgba(16, 185, 129, 0.18)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0.00)');

    ctx.fillStyle = grad;
    ctx.fillRect(xLow, topY, xHigh - xLow, bottomY - topY);

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(xLow, topY); ctx.lineTo(xLow, bottomY);
    ctx.moveTo(xHigh, topY); ctx.lineTo(xHigh, bottomY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Tarea 3: Pastillas de Fondo Translucidas para Etiquetas en Canvas
   * Dibuja un rectángulo oscuro translúcido (ctx.fillRect) midiendo el texto (ctx.measureText)
   * antes de renderizar ctx.fillText() para garantizar máxima legibilidad sobre la traza RTA.
   */
  drawTextWithBackground(text, textX, textY, textColor, align = 'left', bgColor = 'rgba(11, 12, 16, 0.85)') {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = 'bold 12px "Fira Code", monospace';
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const paddingX = 7;
    const paddingY = 4;
    const fontHeight = 14;

    let rectX = textX - paddingX;
    if (align === 'right') {
      rectX = textX - textWidth - paddingX;
    } else if (align === 'center') {
      rectX = textX - textWidth / 2 - paddingX;
    }

    let rectY = textY - fontHeight + 2;

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(rectX, rectY, textWidth + paddingX * 2, fontHeight + paddingY, 4);
      ctx.fill();
    } else {
      ctx.fillRect(rectX, rectY, textWidth + paddingX * 2, fontHeight + paddingY);
    }

    ctx.fillStyle = textColor;
    ctx.textAlign = align;
    ctx.fillText(text, textX, textY);
    ctx.restore();
  }

  drawDidacticComparisonOverlay() {
    const ctx = this.ctx;
    
    // We expect this.didacticTargets and this.didacticUsers to be arrays of filter parameters populated by App.js
    const targets = this.didacticTargets || [];
    const users = this.showUserCurve ? (this.didacticUsers || []) : [];

    if (targets.length === 0) return;

    const topY = 0;
    const bottomY = this.height;
    const baseTargetY = 35;
    const filtersWithoutGain = ['notch', 'highpass', 'lowpass', 'hp', 'lp'];

    // Draw Targets
    targets.forEach((target, idx) => {
        const targetX = this.freqToX(target.frequencyHz);
        
        // Target Vertical Line
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(targetX, topY);
        ctx.lineTo(targetX, bottomY);
        ctx.stroke();

        // Target Label
        const targetTypeLower = (target.type || 'peaking').toLowerCase();
        const isTargetNoGain = filtersWithoutGain.includes(targetTypeLower);
        const targetGainStr = (!isTargetNoGain && target.gainDb !== undefined)
          ? ` (${target.gainDb > 0 ? '+' : ''}${target.gainDb.toFixed(1)}dB)`
          : '';
        const targetLabel = `Target: ${Math.round(target.frequencyHz)} Hz${targetGainStr}`;

        if (targetX > this.width - 100) {
          this.drawTextWithBackground(targetLabel, targetX - 8, baseTargetY, '#10b981', 'right');
        } else {
          this.drawTextWithBackground(targetLabel, targetX + 8, baseTargetY, '#10b981', 'left');
        }
    });

    // Draw Users
    users.forEach((user, idx) => {
        const guessX = this.freqToX(user.frequencyHz);

        // User Vertical Line
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(guessX, topY);
        ctx.lineTo(guessX, bottomY);
        ctx.stroke();
        ctx.setLineDash([]);

        // User Label
        const userTypeLower = (user.type || 'peaking').toLowerCase();
        const isUserNoGain = filtersWithoutGain.includes(userTypeLower);
        const userGainStr = (!isUserNoGain && user.gainDb !== undefined)
          ? ` (${user.gainDb > 0 ? '+' : ''}${user.gainDb.toFixed(1)}dB)`
          : '';
        const userLabel = `Tu Intento: ${Math.round(user.frequencyHz)} Hz${userGainStr}`;

        // Find nearest target to calculate label dodge
        let nearestTargetX = guessX;
        let minDx = Infinity;
        targets.forEach(t => {
            const dx = Math.abs(this.freqToX(t.frequencyHz) - guessX);
            if (dx < minDx) {
                minDx = dx;
                nearestTargetX = this.freqToX(t.frequencyHz);
            }
        });

        let userY = baseTargetY;
        if (minDx < 140) {
          userY = baseTargetY + 22 + (idx * 22); // Dodge downwards if close to target or other users
        }

        if (guessX > this.width - 100) {
          this.drawTextWithBackground(userLabel, guessX - 8, userY, '#c084fc', 'right');
        } else {
          this.drawTextWithBackground(userLabel, guessX + 8, userY, '#c084fc', 'left');
        }
    });
  }

  drawHoverReadout() {
    const ctx = this.ctx;
    const x = this.hoverPos.x;
    const freq = this.xToFreq(x);
    const topY = 0;
    const bottomY = this.height;

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x, bottomY);
    ctx.stroke();

    const label = `${Math.round(freq)} Hz`;
    
    if (x > this.width - 100) {
      this.drawTextWithBackground(label, x - 10, 15, '#f59e0b', 'right');
    } else {
      this.drawTextWithBackground(label, x + 10, 15, '#f59e0b', 'left');
    }
  }

  drawNodeHandles() {
    const isActiveRouteC = this.audioEngine && this.audioEngine.activeRoute === 'C';
    const baseColorRGB = isActiveRouteC ? '0, 242, 254' : '150, 150, 150';
    const baseHex = isActiveRouteC ? '#00f2fe' : '#969696';
    const darkHex = isActiveRouteC ? '#008b96' : '#646464';

    this.interactiveNodes.forEach((node, idx) => {
      const pos = this.freqGainToPixel(node.frequencyHz, node.gainDb);
      const ctx = this.ctx;
      const isActive = idx === this.activeNodeIndex;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = node.isDragging ? `rgba(${baseColorRGB}, 0.45)` : (isActive ? `rgba(${baseColorRGB}, 0.25)` : `rgba(${baseColorRGB}, 0.10)`);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? baseHex : darkHex;
      ctx.shadowColor = isActive ? baseHex : 'transparent';
      ctx.shadowBlur = isActive ? 12 : 0;
      ctx.fill();

      ctx.shadowBlur = 0;

      // Display readout next to node handle
      const filtersWithoutGain = ['notch', 'highpass', 'lowpass', 'hp', 'lp'];
      const nodeTypeLower = (node && node.type) ? node.type.toLowerCase() : 'peaking';
      const isNodeNoGain = filtersWithoutGain.includes(nodeTypeLower);

      const label = isNodeNoGain
        ? `${Math.round(node.frequencyHz)} Hz`
        : `${Math.round(node.frequencyHz)} Hz | ${node.gainDb.toFixed(1)} dB`;

      const labelY = Math.max(40, pos.y - 18);
      if (pos.x > this.width - 140) {
        this.drawTextWithBackground(label, pos.x - 14, labelY, isActive ? '#ffffff' : '#b0b0b0', 'right');
      } else {
        this.drawTextWithBackground(label, pos.x + 14, labelY, isActive ? '#ffffff' : '#b0b0b0', 'left');
      }
    });
  }
}
