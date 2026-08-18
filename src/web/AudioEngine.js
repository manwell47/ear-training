/**
 * @file AudioEngine.js
 * @description Production-grade Web Audio Engine with deterministic DSP Graph management,
 * recursive teardownGraph() cleanup, isolated A/B/C routing, high-resolution FFT analysis,
 * Paul Kellet 7-stage Pink Noise procedural generation, and AudioResourceManager integration.
 */

import { AudioResourceManager, AUDIO_SOURCES, MULTITRACK_SESSIONS } from './AudioResourceManager.js';

export class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;

    // Master Gain & Analyser
    this.masterGain = null;
    this.inputGainNode = null;
    this.analyser = null;

    // Resource Manager for Lazy Loading & LRU AudioBuffer memory pool
    /** @type {AudioResourceManager|null} */
    this.resourceManager = null;

    // Signal Sources
    /** @type {AudioBufferSourceNode[]} */
    this.activeSourceNodes = [];
    this.currentTrackId = null;
    this.isPlaying = false;
    this.isLooping = true;
    this.playbackStartTime = 0;
    this.pauseOffset = 0;
    this.playRequestId = 0;

    // Phase 3 Deterministic DSP Filter Graphs (Target Track B & User Track C)
    /** @type {BiquadFilterNode[]} */
    this.targetGraphNodes = [];

    /** @type {BiquadFilterNode[]} */
    this.userGraphNodes = [];

    // Active Monitor Route: 'A' (Clean/Flat), 'B' (Target EQ), 'C' (User Guess EQ)
    this.activeRoute = 'A';

    // Callbacks
    this.onStateChange = null;

    // Initialize synchronously for canvas frequency rendering readiness
    this.initNodes();
  }

  /**
   * Synchronously creates AudioContext, master gain, analyser, and resource manager.
   */
  initNodes() {
    if (typeof window === 'undefined') return;
    try {
      if (this.ctx) return;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      this.ctx = new AudioContextClass({ latencyHint: 'interactive' });

      // Master Output, Input Gain & Analyser Node
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);

      this.inputGainNode = this.ctx.createGain();
      this.inputGainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 32768; // Max resolution for smooth low-end response (1.3Hz per bin)
      this.analyser.smoothingTimeConstant = 0.0; // Zero smoothing! We handle ballistics in Visualizer
      this.analyser.minDecibels = -140;
      this.analyser.maxDecibels = 0;

      this.preAnalyser = this.ctx.createAnalyser();
      this.preAnalyser.fftSize = 32768;
      this.preAnalyser.smoothingTimeConstant = 0.0;
      this.preAnalyser.minDecibels = -140;
      this.preAnalyser.maxDecibels = 0;

      // Master -> InputGain -> Analyser -> Destination
      this.masterGain.connect(this.inputGainNode);
      this.inputGainNode.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      // Phase 1 AudioResourceManager Instantiation
      this.resourceManager = new AudioResourceManager(() => this.ctx, 20);

      // Register procedural generators (Pink Noise, White Noise, Sine Sweep)
      this.registerProceduralGenerators();

      // Build initial default graphs (1 peak filter neutral 0 dB)
      this.buildGraph('target', [{ frequencyHz: 1000, gainDb: 0, qFactor: 2.0, type: 'peaking' }]);
      this.buildGraph('user', [{ frequencyHz: 1000, gainDb: 0, qFactor: 2.0, type: 'peaking' }]);

      this.switchMonitor('A');
    } catch (e) {
      console.warn('Sync AudioContext creation deferred:', e);
    }
  }

  async init() {
    if (!this.ctx) {
      this.initNodes();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Método para establecer la referencia según la fuente activa
   */
  setSourceCalibration(sourceId) {
    if (!this.inputGainNode) return;

    if (sourceId === 'white_noise' || sourceId === 'pink_noise' || sourceId === 'white-noise' || sourceId === 'pink-noise' || sourceId === 'WHITE_NOISE' || sourceId === 'PINK_NOISE') {
        this.inputGainNode.gain.setValueAtTime(1.0, this.ctx.currentTime); // Referencia base para ruidos sintéticos
    } else {
        // Los audios reales de sesión (OGGs) se miden a su nivel nominal absoluto
        this.inputGainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
    }
  }

  /**
   * Registers procedural noise/sweep generators in AudioResourceManager.
   */
  registerProceduralGenerators() {
    if (!this.resourceManager) return;

    const createWhiteNoise = (ctx) => {
      const sampleRate = ctx.sampleRate;
      const duration = 5.0;
      const bufferSize = sampleRate * duration;
      const whiteBuffer = ctx.createBuffer(2, bufferSize, sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = whiteBuffer.getChannelData(channel);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.15; // Blanco puro a volumen reducido
        }
      }
      return whiteBuffer;
    };

    const createPinkNoise = (ctx) => {
      const sampleRate = ctx.sampleRate;
      const duration = 5.0;
      const bufferSize = sampleRate * duration;
      const pinkBuffer = ctx.createBuffer(2, bufferSize, sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const data = pinkBuffer.getChannelData(channel);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        let maxPeak = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
          b6 = white * 0.115926;
          data[i] = pink;
          if (Math.abs(pink) > maxPeak) maxPeak = Math.abs(pink);
        }
        if (maxPeak > 0) {
          const normFactor = 0.15 / maxPeak; // Normalizado a un volumen razonable
          for (let i = 0; i < bufferSize; i++) {
            data[i] *= normFactor;
          }
        }
      }
      return pinkBuffer;
    };

    // Register both pink_noise and pink-noise
    this.resourceManager.registerProceduralGenerator('pink_noise', createPinkNoise);
    this.resourceManager.registerProceduralGenerator('pink-noise', createPinkNoise);

    // Register both white_noise and white-noise
    this.resourceManager.registerProceduralGenerator('white_noise', createWhiteNoise);
    this.resourceManager.registerProceduralGenerator('white-noise', createWhiteNoise);
  }

  /**
   * Phase 3: Recursive Teardown of active BiquadFilterNodes.
   * Disconnects all nodes recursively and removes array references to guarantee JS Garbage Collection.
   * @param {'target'|'user'} [graphType='target'] 
   */
  teardownGraph(graphType = 'target') {
    const nodes = graphType === 'target' ? this.targetGraphNodes : this.userGraphNodes;
    if (nodes && nodes.length > 0) {
      nodes.forEach(filter => {
        if (filter) {
          try {
            filter.disconnect();
          } catch (_) {}
        }
      });
    }

    if (graphType === 'target') {
      this.targetGraphNodes = [];
    } else {
      this.userGraphNodes = [];
    }
  }

  /**
   * Phase 3: Build Graph deterministically.
   * Calls teardownGraph() first, instantiates new BiquadFilterNodes, connects them in a closed series loop.
   * @param {'target'|'user'} graphType 
   * @param {Array<{frequencyHz: number, gainDb: number, qFactor?: number, type?: string}>} filterArray 
   * @returns {BiquadFilterNode[]} Newly constructed filter node chain
   */
  buildGraph(graphType, filterArray) {
    if (!this.ctx) this.initNodes();

    // 1. Teardown existing graph for clean GC
    this.teardownGraph(graphType);

    if (!filterArray || !Array.isArray(filterArray) || filterArray.length === 0) {
      return [];
    }

    const newNodes = [];
    for (let i = 0; i < filterArray.length; i++) {
      const cfg = filterArray[i];
      const filter = this.ctx.createBiquadFilter();
      filter.type = this.mapFilterType(cfg.type || 'peaking');
      
      const freq = cfg.frequencyHz !== undefined ? cfg.frequencyHz : (cfg.freqHz || 1000);
      const gain = cfg.gainDb !== undefined ? cfg.gainDb : (cfg.gain || 0);
      const q = cfg.qFactor !== undefined ? cfg.qFactor : (cfg.Q || 2.0);

      filter.frequency.value = freq;
      filter.Q.value = q;
      filter.gain.value = gain;
      filter.frequency.setValueAtTime(freq, this.ctx.currentTime);
      filter.Q.setValueAtTime(q, this.ctx.currentTime);
      filter.gain.setValueAtTime(gain, this.ctx.currentTime);

      newNodes.push(filter);
    }

    // 2. Chain nodes in series
    for (let i = 0; i < newNodes.length - 1; i++) {
      newNodes[i].connect(newNodes[i + 1]);
    }

    if (graphType === 'target') {
      this.targetGraphNodes = newNodes;
    } else {
      this.userGraphNodes = newNodes;
    }

    // 3. Re-apply current routing
    this.switchMonitor(this.activeRoute);

    return newNodes;
  }

  /**
   * Sets Target EQ graph configuration (Track B).
   */
  setTargetEQ(filterArray) {
    if (!Array.isArray(filterArray)) {
      if (arguments.length > 1) {
        filterArray = [{
          frequencyHz: arguments[0],
          gainDb: arguments[1],
          qFactor: arguments[2] !== undefined ? arguments[2] : 2.0,
          type: arguments[3] || 'peaking'
        }];
      } else {
        return;
      }
    }
    this.buildGraph('target', filterArray);
  }

  /**
   * Sets User Guess EQ graph configuration (Track C).
   */
  setUserEQ(filterArray) {
    if (!Array.isArray(filterArray)) {
      if (arguments.length > 1) {
        filterArray = [{
          frequencyHz: arguments[0],
          gainDb: arguments[1],
          qFactor: arguments[2] !== undefined ? arguments[2] : 2.0,
          type: arguments[3] || 'peaking'
        }];
      } else {
        return;
      }
    }
    this.buildGraph('user', filterArray);
  }

  /**
   * Updates the parameters of the existing User Guess EQ nodes without rebuilding the graph.
   * Useful for real-time dragging interactions.
   */
  updateUserEQ(filterArray) {
    if (!this.userGraphNodes || this.userGraphNodes.length === 0 || !Array.isArray(filterArray)) {
      return;
    }
    const t = this.ctx.currentTime;
    for (let i = 0; i < Math.min(this.userGraphNodes.length, filterArray.length); i++) {
      const node = this.userGraphNodes[i];
      const cfg = filterArray[i];
      
      const freq = cfg.frequencyHz !== undefined ? cfg.frequencyHz : (cfg.freqHz || 1000);
      const gain = cfg.gainDb !== undefined ? cfg.gainDb : (cfg.gain || 0);
      const q = cfg.qFactor !== undefined ? cfg.qFactor : (cfg.Q || 2.0);
      
      if (cfg.type) {
        node.type = this.mapFilterType(cfg.type);
      }
      
      node.frequency.value = freq;
      node.gain.value = gain;
      node.Q.value = q;
      node.frequency.setTargetAtTime(freq, t, 0.015);
      node.gain.setTargetAtTime(gain, t, 0.015);
      node.Q.setTargetAtTime(q, t, 0.015);
    }
  }

  stopAllAudio() {
    // 1. Detener osciladores/nodos de ruido si existen
    if (this.currentNoiseNode) {
        try {
            this.currentNoiseNode.stop();
            this.currentNoiseNode.disconnect();
        } catch(e) {}
        this.currentNoiseNode = null;
    }
    
    // 2. Detener buffers de OGG si existen
    if (this.currentBufferSource) {
        try {
            this.currentBufferSource.stop();
            this.currentBufferSource.disconnect();
        } catch(e) {}
        this.currentBufferSource = null;
    }
    
    // Limpieza de compatibilidad con la arquitectura anterior
    this.stopSource();
  }

  get audioContext() {
    return this.ctx;
  }

  async playPinkNoise() {
    this.currentTrackId = 'pink_noise';
    if (!this.resourceManager.cache.has('pink_noise')) {
      await this.resourceManager.loadAudio('pink_noise');
    }
    if (this.isPlaying) this.play();
  }

  async playWhiteNoise() {
    this.currentTrackId = 'white_noise';
    if (!this.resourceManager.cache.has('white_noise')) {
      await this.resourceManager.loadAudio('white_noise');
    }
    if (this.isPlaying) this.play();
  }

  playBuffer(audioBuffer, trackId = 'current_ogg') {
    this.resourceManager.cache.set(trackId, audioBuffer);
    this.currentTrackId = trackId;
    this.currentMultitrackSession = null;
    if (this.isPlaying) this.play();
  }

  async loadAudioSource(sourceId) {
    const config = AUDIO_SOURCES.find(s => s.id === sourceId);
    let mtSession = null;

    if (!config) {
      mtSession = MULTITRACK_SESSIONS.find(s => s.id === sourceId);
      if (!mtSession) return;
    }

    this.stopAllAudio(); // Exijo que esto detenga los nodos inmediatamente
    this.currentTrackId = null; // Evitar el fallback fantasma a ruido rosa
    this.currentMultitrackSession = null;
    this.pauseOffset = 0;
    
    // Bandera explícita y robusta para informar al Visualizador si la fuente es ruido de laboratorio
    this.isSyntheticMode = config ? !!config.isSynthetic : false;

    this.setSourceCalibration(sourceId);

    if (mtSession || (config && config.isMultitrack)) {
      if (!mtSession) mtSession = MULTITRACK_SESSIONS.find(s => s.id === sourceId);
      this.currentMultitrackSession = mtSession;
      this.currentTrackId = sourceId;

      // Initialize mute/solo states if not present
      if (!this.stemStates) this.stemStates = {};
      mtSession.stems.forEach(stem => {
        if (!this.stemStates[stem.id]) {
          this.stemStates[stem.id] = { muted: false, solo: false };
        }
      });

      // Load all stems asynchronously
      const loadPromises = mtSession.stems.map(stem => 
        this.resourceManager.loadAudio(stem.id, `Music Ear Training/Oggs/${stem.filename}`)
      );
      
      try {
        await Promise.all(loadPromises);
        if (this.isPlaying) this.play();
        // Emit event to UI so App.js knows to show the Stem Mixer
        if (this.onMultitrackLoaded) this.onMultitrackLoaded(mtSession);
      } catch (error) {
        console.error("Fallo al cargar stems del multitrack:", error);
      }
      return;
    }

    if (config.isSynthetic) {
        if (config.id === 'pink_noise') this.playPinkNoise();
        if (config.id === 'white_noise') this.playWhiteNoise(); // DEBE ser un buffer de ruido blanco real, no rosa
    } else {
        const audioPath = `Music Ear Training/Oggs/${config.filename}`;
        console.log("Intentando cargar:", audioPath);
        // Descomenta la siguiente línea SOLO si sigues sin saber dónde busca el archivo:
        // alert("El código busca el audio en: " + window.location.origin + "/" + audioPath);
        
        try {
            const response = await fetch(audioPath);
            if (!response.ok) throw new Error("HTTP 404 - Ruta incorrecta");
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.playBuffer(audioBuffer);
        } catch (error) {
            console.error("Fallo de carga OGG. Verifica que la carpeta 'Oggs' está junto al index.html", error);
        }
    }
  }

  /**
   * Loads an audio track by ID or URL lazily using AudioResourceManager.
   * @param {string} trackId 
   * @param {string|null} [url=null] 
   */
  async loadTrack(trackId, url = null) {
    if (!this.ctx) await this.init();
    if (url) {
      this.stopAllAudio();
      const buffer = await this.resourceManager.loadAudio(trackId, url);
      this.currentTrackId = trackId;
      if (this.isPlaying) this.play();
      return buffer;
    }
    return this.loadAudioSource(trackId);
  }

  setStemState(stemId, type) {
    if (!this.stemStates) this.stemStates = {};
    if (!this.stemStates[stemId]) this.stemStates[stemId] = { muted: false, solo: false, volume: 1.0 };
    if (type === 'mute') {
      this.stemStates[stemId].muted = !this.stemStates[stemId].muted;
      if (this.stemStates[stemId].muted) this.stemStates[stemId].solo = false;
    } else if (type === 'solo') {
      this.stemStates[stemId].solo = !this.stemStates[stemId].solo;
      if (this.stemStates[stemId].solo) this.stemStates[stemId].muted = false;
    }
    this.updateStemVolumes();
  }

  setStemVolume(stemId, volume) {
    if (!this.stemStates) this.stemStates = {};
    if (!this.stemStates[stemId]) this.stemStates[stemId] = { muted: false, solo: false, volume: 1.0 };
    this.stemStates[stemId].volume = volume;
    this.updateStemVolumes();
  }

  updateStemVolumes() {
    if (!this.stemGainNodes) return;
    let anySolo = false;
    if (this.stemStates) {
      anySolo = Object.values(this.stemStates).some(state => state.solo);
    }
    for (const stemId in this.stemGainNodes) {
      const state = this.stemStates && this.stemStates[stemId] ? this.stemStates[stemId] : { muted: false, solo: false, volume: 1.0 };
      const baseVol = state.volume !== undefined ? state.volume : 1.0;
      let effectiveVol = baseVol;
      if (state.muted) effectiveVol = 0.0;
      if (anySolo && !state.solo) effectiveVol = 0.0;
      
      const gainNode = this.stemGainNodes[stemId];
      if (gainNode) {
        gainNode.gain.setTargetAtTime(effectiveVol, this.ctx.currentTime, 0.05);
      }
    }
  }

  /**
   * Exclusive A/B/C Monitor Multiplexing.
   * Route A: Clean / Flat -> Source -> masterGain -> Analyser -> Destination
   * Route B: Target EQ   -> Source -> TargetFilters (Series Chain) -> masterGain -> Analyser -> Destination
   * Route C: User Guess  -> Source -> UserFilters (Series Chain) -> masterGain -> Analyser -> Destination
   * @param {'A'|'B'|'C'|'PLANO'|'TARGET'|'GUESS'|'AUDITION'} mode 
   */
  switchMonitor(mode) {
    let norm = 'A';
    if (!mode) norm = 'A';
    else {
      const upper = String(mode).toUpperCase();
      if (upper === 'B' || upper === 'TARGET' || upper === 'OBJETIVO') norm = 'B';
      else if (upper === 'C' || upper === 'GUESS' || upper === 'INTENTO' || upper === 'AUDITION') norm = 'C';
      else norm = 'A';
    }

    this.activeRoute = norm;
    if (!this.ctx) return;

    // 1. Disconnect filter endpoints
    if (this.targetGraphNodes.length > 0) {
      this.targetGraphNodes.forEach(f => { try { f.disconnect(); } catch (_) {} });
      for (let i = 0; i < this.targetGraphNodes.length - 1; i++) {
        this.targetGraphNodes[i].connect(this.targetGraphNodes[i + 1]);
      }
    }
    if (this.userGraphNodes.length > 0) {
      this.userGraphNodes.forEach(f => { try { f.disconnect(); } catch (_) {} });
      for (let i = 0; i < this.userGraphNodes.length - 1; i++) {
        this.userGraphNodes[i].connect(this.userGraphNodes[i + 1]);
      }
    }

    // 2. Route active source nodes
    this.activeSourceNodes.forEach(source => {
      // Determinar el nodo de salida base (puede ser el stemGainNode si es multitrack)
      const outNode = source.stemGainNode || source;
      try { outNode.disconnect(); } catch (_) {}

      // Reconnect to its VU meter analyser if multitrack
      if (source.stemId && this.stemAnalysers && this.stemAnalysers[source.stemId]) {
        outNode.connect(this.stemAnalysers[source.stemId]);
      }

      if (this.preAnalyser) {
        outNode.connect(this.preAnalyser);
      }

      // Si es multitrack y esta pista no es el target, mandarla directa al master (bypass EQ)
      if (this.currentMultitrackSession && !source.isTarget) {
        if (this.masterGain) outNode.connect(this.masterGain);
        return; // Skip filter routing
      }

      // Ruteo de Filtros (Solo para Target track o Single tracks)
      if (norm === 'B' && this.targetGraphNodes.length > 0) {
        const firstFilter = this.targetGraphNodes[0];
        const lastFilter = this.targetGraphNodes[this.targetGraphNodes.length - 1];
        outNode.connect(firstFilter);
        if (this.masterGain) lastFilter.connect(this.masterGain);
      } else if (norm === 'C' && this.userGraphNodes.length > 0) {
        const firstFilter = this.userGraphNodes[0];
        const lastFilter = this.userGraphNodes[this.userGraphNodes.length - 1];
        outNode.connect(firstFilter);
        if (this.masterGain) lastFilter.connect(this.masterGain);
      } else {
        if (this.masterGain) outNode.connect(this.masterGain);
      }
    });
  }

  /**
   * Starts playback of the active audio buffer.
   */
  async play(offset = 0, muted = false) {
    const reqId = ++this.playRequestId;
    
    if (!this.ctx) await this.init();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.playRequestId !== reqId) return;

    this.stopSource();

    if (this.currentMultitrackSession) {
      if (!this.stemGainNodes) this.stemGainNodes = {};
      const mtSession = this.currentMultitrackSession;
      
      const buffers = [];
      for (const stem of mtSession.stems) {
        let buffer = this.resourceManager.getBuffer(stem.id);
        if (!buffer) buffer = await this.resourceManager.loadAudio(stem.id, `Music Ear Training/Oggs/${stem.filename}`);
        if (this.playRequestId !== reqId) return;
        if (buffer) buffers.push({ stem, buffer });
      }
      
      if (buffers.length === 0) return;

      const transportScrub = document.getElementById('transportScrub');
      this.currentDuration = Math.max(...buffers.map(b => b.buffer.duration));
      if (transportScrub) {
        transportScrub.max = this.currentDuration;
      }

      if (this.masterGain) {
        this.masterGain.gain.setValueAtTime(muted ? 0.0 : 0.8, this.ctx.currentTime);
      }

      const syncTime = this.ctx.currentTime + 0.05; // 50ms lookahead
      this.playbackStartTime = syncTime - offset;

      let anySolo = false;
      if (this.stemStates) {
        anySolo = Object.values(this.stemStates).some(state => state.solo);
      }

      buffers.forEach(({ stem, buffer }) => {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        
        const gainNode = this.ctx.createGain();
        this.stemGainNodes[stem.id] = gainNode;
        if (!this.stemAnalysers) this.stemAnalysers = {};
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        this.stemAnalysers[stem.id] = analyser;
        gainNode.connect(analyser);

        // Dummy connection to destination to prevent Chrome from optimizing out the analyser
        const dummyGain = this.ctx.createGain();
        dummyGain.gain.value = 0;
        analyser.connect(dummyGain);
        dummyGain.connect(this.ctx.destination);

        
        const state = this.stemStates ? this.stemStates[stem.id] : { muted: false, solo: false };
        let volume = 1.0;
        if (state && state.muted) volume = 0.0;
        if (anySolo && state && !state.solo) volume = 0.0;
        gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
        
        source.connect(gainNode);
        
        source.isTarget = (stem.id === mtSession.targetStem);
        source.stemGainNode = gainNode; 
        source.stemId = stem.id;
        
        source.onended = () => {
          if (!this.isLooping && source.isTarget) {
            this.isPlaying = false;
            if (this.onStateChange) this.onStateChange({ isPlaying: false });
          }
        };

        this.activeSourceNodes.push(source);
        source.start(syncTime, offset);
      });
      
      this.switchMonitor(this.activeRoute);
      this.isPlaying = true;
      if (this.onStateChange) this.onStateChange({ isPlaying: true });
      return;
    }

    // Lazy load buffer from AudioResourceManager if not loaded
    let buffer = this.resourceManager.getBuffer(this.currentTrackId);
    if (!buffer) {
      buffer = await this.resourceManager.loadAudio(this.currentTrackId);
      if (this.playRequestId !== reqId) return;
    }
    if (!buffer) return;

    // Actualizar max del transportScrub con la duración del audioBuffer
    const transportScrub = document.getElementById('transportScrub');
    this.currentDuration = buffer.duration;
    if (transportScrub) {
      transportScrub.max = this.currentDuration;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true; // Forzado a true según instrucciones del usuario

    source.onended = () => {
      if (!this.isLooping) {
        this.isPlaying = false;
        if (this.onStateChange) this.onStateChange({ isPlaying: false });
      }
    };

    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(muted ? 0.0 : 0.8, this.ctx.currentTime);
    }

    this.activeSourceNodes.push(source);
    this.switchMonitor(this.activeRoute);

    this.playbackStartTime = this.ctx.currentTime - offset;
    source.start(0, offset);
    this.isPlaying = true;

    if (this.onStateChange) this.onStateChange({ isPlaying: true });
  }

  scrubTo(offsetSeconds) {
    if (!this.isPlaying) {
      // Truco de DAW: Reproducir 50ms en silencio para que el Analizador se actualice al arrastrar en pausa
      this.play(offsetSeconds, true); 
      setTimeout(() => {
        this.stopSource();
        this.isPlaying = false; // Mantener estado de pausa
        if (this.onStateChange) this.onStateChange({ isPlaying: false });
      }, 50);
      return;
    }
    
    // Detiene el audio actual de forma agresiva
    this.stopSource(); 
    
    // Inicia un nuevo Buffer en el nuevo tiempo offset
    this.play(offsetSeconds);
  }

  /**
   * Stops active playback and mutes output.
   */
  stopSource() {
    if (this.isPlaying && this.ctx && this.playbackStartTime !== undefined) {
      const duration = this.currentDuration || 1;
      this.pauseOffset = (this.ctx.currentTime - this.playbackStartTime) % duration;
    }

    while (this.activeSourceNodes.length > 0) {
      const src = this.activeSourceNodes.pop();
      try {
        src.onended = null;
        src.stop(0);
        if (src.stemGainNode) {
            src.stemGainNode.disconnect();
        }
        src.disconnect();
      } catch (_) {}
    }

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    }

    this.isPlaying = false;
    if (this.onStateChange) this.onStateChange({ isPlaying: false });
  }

  togglePlay() {
    if (this.isPlaying) {
      this.playRequestId++; // Cancel any pending play promises
      this.stopSource();
    } else {
      this.play(this.pauseOffset || 0);
    }
  }

  setRoute(route) {
    this.switchMonitor(route);
  }

  mapFilterType(typeStr) {
    if (!typeStr) return 'peaking';
    const lower = typeStr.toLowerCase();
    switch (lower) {
      case 'peaking':
      case 'bell':
        return 'peaking';
      case 'lowpass':
      case 'paso bajo':
        return 'lowpass';
      case 'highpass':
      case 'hp':
      case 'paso alto':
        return 'highpass';
      case 'lowshelf':
        return 'lowshelf';
      case 'highshelf':
        return 'highshelf';
      case 'notch':
      case 'muesca':
        return 'notch';
      default:
        return 'peaking';
    }
  }

  getMagnitudeResponse(filterNode, frequencyArray) {
    if (!this.ctx || !filterNode) {
      return new Float32Array(frequencyArray.length).fill(1.0);
    }
    const magResponse = new Float32Array(frequencyArray.length);
    const phaseResponse = new Float32Array(frequencyArray.length);
    filterNode.getFrequencyResponse(frequencyArray, magResponse, phaseResponse);
    return magResponse;
  }

  getFFTData(outputArray) {
    if (this.analyser) {
      this.analyser.getFloatFrequencyData(outputArray);
    }
  }

  getPreFFTData(outputArray) {
    if (this.preAnalyser) {
      this.preAnalyser.getFloatFrequencyData(outputArray);
    }
  }

  setMasterVolume(vol) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime, 0.02);
    }
  }
}
