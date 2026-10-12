/**
 * @file AudioEngine.js
 * @description Production-grade Web Audio Engine with deterministic DSP Graph management,
 * recursive teardownGraph() cleanup, isolated A/B/C routing, high-resolution FFT analysis,
 * Paul Kellet 7-stage Pink Noise procedural generation, and AudioResourceManager integration.
 */

import { AudioResourceManager, AUDIO_SOURCES, MULTITRACK_SESSIONS, AUDIO_BASE_PATH } from './AudioResourceManager.js?v=82';
import { DynamicsEngine, DYNAMICS_CACHE_VERSION } from './DynamicsEngine.js?v=82';

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
    // Fired when a session's mixer state was reset to a clean full mix
    // (e.g. by the silence-guard). Lets the UI re-sync its M/S buttons/faders.
    this.onStemStateReset = null;

    // Target Spotlight: when a multitrack session is active, duck the non-target
    // stems a little so the EQ'd instrument sits forward and its filter is
    // clearly audible instead of masked by the rest of the ensemble. Applied
    // identically to every monitor route (A/B/C) so the A/B comparison stays fair
    // (you always compare the same ducked bed, only the target EQ changes).
    this.spotlightEnabled = true;
    this.spotlightDuckDb = -6.0;

    // ── Dynamic Range module (module 2) ──────────────────────────────────────
    // The compressor is inserted on the *auditioned* (target / single) path so
    // it processes the instrument under study; non-target stems bypass it and
    // sum straight into the master. An optional external sidechain key is tapped
    // from another stem's gain node (e.g. kick -> bass ducking). The insert is
    // inactive (clean pass-through) whenever dynamicsActive is false.
    /** @type {DynamicsEngine|null} */
    this.dynamicsEngine = null;
    this.dynamicsActive = false;
    /** @type {string|null} stem id feeding the external sidechain key */
    this.dynamicsSidechainStemId = null;
    /** @type {AudioNode|null} last-connected sidechain tap node */
    this._dynamicsSidechainTap = null;
    /** optional telemetry sink: (data) => void */
    this.onDynamicsTelemetry = null;

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
   * Establece la referencia de calibración de entrada para la fuente activa.
   * Todas las fuentes (ruido sintético y sesiones OGG reales) se referencian a
   * ganancia unitaria; la compensación de sonoridad visual vive en el Visualizer.
   * El parámetro `sourceId` se mantiene para futuras curvas de calibración por fuente.
   */
  setSourceCalibration(sourceId) { // eslint-disable-line no-unused-vars
    if (!this.inputGainNode || !this.ctx) return;
    this.inputGainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
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
          } catch (_) { }
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
      } catch (e) { }
      this.currentNoiseNode = null;
    }

    // 2. Detener buffers de OGG si existen
    if (this.currentBufferSource) {
      try {
        this.currentBufferSource.stop();
        this.currentBufferSource.disconnect();
      } catch (e) { }
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

  /**
   * Shows/hides the global audio loading spinner overlay.
   * The element (#audioLoadingSpinner) already exists in index.html; this is the
   * only place that toggles it so users get feedback while sessions load.
   * @param {boolean} visible
   * @param {string} [message]
   */
  setLoadingSpinner(visible, message) {
    if (typeof document === 'undefined') return;
    const spinner = document.getElementById('audioLoadingSpinner');
    if (!spinner) return;
    if (message) {
      const textEl = spinner.querySelector('.spinner-text');
      if (textEl) textEl.textContent = message;
    }
    spinner.classList.toggle('hidden-overlay', !visible);
  }

  /**
   * Loads an array of stems using a bounded concurrency pool.
   * A modest pool (default 3) dramatically cuts session load time versus a
   * strictly sequential loop while still respecting GitHub Pages HTTP 503
   * rate-limiting (never hammer the CDN with dozens of parallel fetches).
   * @param {Array<{id:string, filename:string}>} stems
   * @param {number} [concurrency=3]
   * @returns {Promise<Array<{id:string, error:(Error|null)}>>} results indexed by input order
   */
  async loadStemsWithConcurrency(stems, concurrency = 3) {
    const results = new Array(stems.length);
    let cursor = 0;
    const limit = Math.max(1, Math.min(concurrency, stems.length));
    const worker = async () => {
      while (cursor < stems.length) {
        const index = cursor++;
        const stem = stems[index];
        try {
          await this.resourceManager.loadAudio(stem.id, `${AUDIO_BASE_PATH}/${stem.filename}`);
          results[index] = { id: stem.id, error: null };
        } catch (error) {
          results[index] = { id: stem.id, error };
        }
      }
    };
    await Promise.all(Array.from({ length: limit }, () => worker()));
    return results;
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

      // Always start every session from a clean, fully audible full mix.
      // Prevents stale solo/mute from a previously used session from silencing
      // this one (the "no sound until I solo a stem" bug).
      this.resetStemStates(mtSession);

      // Load all stems with a bounded concurrency pool (modest to avoid HTTP 503 rate limiting)
      this.setLoadingSpinner(true, 'Cargando Sesión...');
      try {
        const loadResults = await this.loadStemsWithConcurrency(mtSession.stems, 3);
        const failed = loadResults.filter(r => r && r.error);
        if (failed.length > 0) {
          console.warn(`No se pudieron cargar ${failed.length} stem(s):`, failed.map(f => f.id));
        }
        if (this.isPlaying) this.play();
        // Emit event to UI so App.js knows to show the Stem Mixer
        if (this.onMultitrackLoaded) this.onMultitrackLoaded(mtSession);
      } catch (error) {
        console.error("Fallo al cargar stems del multitrack:", error);
      } finally {
        this.setLoadingSpinner(false);
      }
      return;
    }

    if (config.isSynthetic) {
      if (config.id === 'pink_noise') this.playPinkNoise();
      if (config.id === 'white_noise') this.playWhiteNoise(); // DEBE ser un buffer de ruido blanco real, no rosa
    } else {
      const audioPath = `${AUDIO_BASE_PATH}/${config.filename}`;
      console.log("Intentando cargar:", audioPath);
      // Descomenta la siguiente línea SOLO si sigues sin saber dónde busca el archivo:
      // alert("El código busca el audio en: " + window.location.origin + "/" + audioPath);

      this.setLoadingSpinner(true, 'Cargando Audio...');
      try {
        const response = await fetch(audioPath);
        if (!response.ok) throw new Error("HTTP 404 - Ruta incorrecta");
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.playBuffer(audioBuffer);
      } catch (error) {
        console.error("Fallo de carga OGG. Verifica que la carpeta 'Oggs' está junto al index.html", error);
      } finally {
        this.setLoadingSpinner(false);
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

  /**
   * Resets mute/solo/volume for every stem of the given session to a clean
   * full mix, so a freshly loaded session is always fully audible.
   * @param {object} mtSession
   */
  resetStemStates(mtSession) {
    this.stemStates = {};
    if (!mtSession || !Array.isArray(mtSession.stems)) return;
    mtSession.stems.forEach(stem => {
      this.stemStates[stem.id] = { muted: false, solo: false, volume: 1.0 };
    });
  }

  /**
   * Computes the effective gain for every stem of the given session, scoping
   * solo/mute evaluation to that session only. Includes a silence-guard so any
   * combination that would zero every stem falls back to a clean full mix.
   * @param {object} mtSession
   * @returns {Object<string, number>}
   */
  resolveSessionStemGains(mtSession) {
    const gains = {};
    if (!mtSession || !Array.isArray(mtSession.stems)) return gains;
    if (!this.stemStates) this.stemStates = {};

    const stateOf = (id) =>
      this.stemStates[id] || { muted: false, solo: false, volume: 1.0 };

    const anySolo = mtSession.stems.some(stem => !!stateOf(stem.id).solo);

    let anyAudible = false;
    mtSession.stems.forEach(stem => {
      const state = stateOf(stem.id);
      const baseVol = state.volume !== undefined ? state.volume : 1.0;
      let vol = baseVol;
      if (state.muted) vol = 0.0;
      if (anySolo && !state.solo) vol = 0.0;
      gains[stem.id] = vol;
      if (vol > 0) anyAudible = true;
    });

    // Silence-guard: never leave the session fully silenced.
    if (!anyAudible) {
      mtSession.stems.forEach(stem => {
        this.stemStates[stem.id] = { muted: false, solo: false, volume: 1.0 };
        gains[stem.id] = 1.0;
      });
      if (this.onStemStateReset) this.onStemStateReset(mtSession);
    }

    return gains;
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
    // Scope solo/mute evaluation to the ACTIVE session only, so a stale solo
    // left behind by another session can never silence the current one.
    const mtSession = this.currentMultitrackSession;
    const sessionGains = mtSession ? this.resolveSessionStemGains(mtSession) : null;

    for (const stemId in this.stemGainNodes) {
      const gainNode = this.stemGainNodes[stemId];
      if (!gainNode) continue;

      let effectiveVol = 1.0;
      if (sessionGains && sessionGains[stemId] !== undefined) {
        effectiveVol = sessionGains[stemId];
      } else {
        const state = this.stemStates && this.stemStates[stemId] ? this.stemStates[stemId] : { muted: false, solo: false, volume: 1.0 };
        effectiveVol = state.volume !== undefined ? state.volume : 1.0;
        if (state.muted) effectiveVol = 0.0;
      }

      // Target Spotlight: duck non-target stems so the EQ'd instrument is
      // clearly audible. Never resurrects a muted/soloed-out stem (0 stays 0).
      effectiveVol *= this.spotlightFactor(stemId);

      gainNode.gain.setTargetAtTime(effectiveVol, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Enables/disables the multitrack Target Spotlight (ducks non-target stems).
   * @param {boolean} enabled
   */
  setSpotlight(enabled) {
    this.spotlightEnabled = !!enabled;
    this.updateStemVolumes();
  }

  /**
   * Linear gain factor applied to a stem by the Target Spotlight.
   * @param {string} stemId
   * @returns {number} 1.0 for the target stem (or when disabled), duck factor otherwise
   */
  spotlightFactor(stemId) {
    if (!this.spotlightEnabled || !this.currentMultitrackSession) return 1.0;
    const tgt = this.currentMultitrackSession.targetStem;
    if (!tgt || stemId === tgt) return 1.0;
    return Math.pow(10, this.spotlightDuckDb / 20);
  }

  // ───────────────────── Dynamic Range insert (module 2) ─────────────────────

  /**
   * Lazily builds and activates the Dynamic Range compressor on the auditioned
   * (target / single) monitor path. Idempotent: re-calling reuses the engine.
   * @param {object} [config]
   * @param {object} [config.params]               initial / updated DSP parameters
   * @param {string|null} [config.sidechainStemId] stem id feeding the sidechain key
   * @param {boolean} [config.active=true]         whether the insert should process
   * @returns {Promise<DynamicsEngine|null>}
   */
  async buildDynamicsGraph(config = {}) {
    if (!this.ctx) this.initNodes();
    if (!this.ctx) return null;

    if (!this.dynamicsEngine) {
      this.dynamicsEngine = new DynamicsEngine(this.ctx, { version: DYNAMICS_CACHE_VERSION });
      this._bindDynamicsTelemetry();
    }

    await this.dynamicsEngine.init();
    if (!this.dynamicsEngine.isReady) {
      // No noise fallback (project_rules §3): surface the failure, keep clean path.
      console.error('[AudioEngine] Dynamics module unavailable; keeping the clean monitor path.');
      this.dynamicsActive = false;
      return null;
    }

    if (config.params) this.dynamicsEngine.setParams(config.params);
    if (config.sidechainStemId !== undefined) this.dynamicsSidechainStemId = config.sidechainStemId;
    this.dynamicsActive = config.active === false ? false : true;

    // Node output sums into the master bus (connect() is idempotent).
    this.dynamicsEngine.connectOutput(this.masterGain);
    this.switchMonitor(this.activeRoute);
    return this.dynamicsEngine;
  }

  /**
   * Pushes a partial parameter patch to the active insert (no-op if absent).
   * `sidechainStemId` re-taps the external key; the remaining keys go to the DSP.
   * @param {object} partial
   * @returns {object|null} the new full param set
   */
  setDynamicsConfig(partial) {
    if (!this.dynamicsEngine) return null;
    const patch = { ...(partial || {}) };
    let retap = false;
    if ('sidechainStemId' in patch) {
      this.dynamicsSidechainStemId = patch.sidechainStemId;
      delete patch.sidechainStemId;
      retap = true;
    }
    const params = Object.keys(patch).length
      ? this.dynamicsEngine.setParams(patch)
      : this.dynamicsEngine.getParams();
    if (retap) this.switchMonitor(this.activeRoute);
    return params;
  }

  /**
   * Removes the Dynamic Range insert entirely and restores the clean monitor path.
   */
  teardownDynamics() {
    this.dynamicsActive = false;
    this._dynamicsSidechainTap = null;
    if (this.dynamicsEngine) {
      this.dynamicsEngine.dispose();
      this.dynamicsEngine = null;
    }
    this.switchMonitor(this.activeRoute);
  }

  /**
   * Registers the telemetry sink for the dynamics insert (GR / in / out dBFS).
   * @param {((data:object)=>void)|null} cb
   */
  setDynamicsTelemetryHandler(cb) {
    this.onDynamicsTelemetry = (typeof cb === 'function') ? cb : null;
    this._bindDynamicsTelemetry();
  }

  _bindDynamicsTelemetry() {
    if (this.dynamicsEngine) {
      this.dynamicsEngine.onTelemetry(this.onDynamicsTelemetry || null);
    }
  }

  /**
   * Re-taps the external sidechain key. MUST run after switchMonitor() has
   * reconnected the stem gain nodes (its first step disconnects every output).
   */
  _wireDynamicsSidechain() {
    if (!this.dynamicsEngine || !this.dynamicsEngine.isReady) return;
    const stemId = this.dynamicsSidechainStemId;
    const tap = (stemId && this.stemGainNodes) ? this.stemGainNodes[stemId] : null;
    if (!tap) return;

    // Never key a compressor with the very stem it processes.
    const tgt = this.currentMultitrackSession ? this.currentMultitrackSession.targetStem : null;
    if (stemId === tgt) return;

    try {
      tap.connect(this.dynamicsEngine.node, 0, 1);
      this._dynamicsSidechainTap = tap;
    } catch (e) {
      console.warn('[AudioEngine] sidechain tap failed:', e);
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

    // Dynamic Range insert: when active, the auditioned (target/single) path is
    // routed through the compressor; non-target stems go straight to the master.
    const dynNode = (this.dynamicsActive && this.dynamicsEngine && this.dynamicsEngine.isReady)
      ? this.dynamicsEngine.node
      : null;
    const processedDest = dynNode || this.masterGain;

    // 1. Disconnect filter endpoints
    if (this.targetGraphNodes.length > 0) {
      this.targetGraphNodes.forEach(f => { try { f.disconnect(); } catch (_) { } });
      for (let i = 0; i < this.targetGraphNodes.length - 1; i++) {
        this.targetGraphNodes[i].connect(this.targetGraphNodes[i + 1]);
      }
    }
    if (this.userGraphNodes.length > 0) {
      this.userGraphNodes.forEach(f => { try { f.disconnect(); } catch (_) { } });
      for (let i = 0; i < this.userGraphNodes.length - 1; i++) {
        this.userGraphNodes[i].connect(this.userGraphNodes[i + 1]);
      }
    }

    // 2. Route active source nodes
    this.activeSourceNodes.forEach(source => {
      // Determinar el nodo de salida base (puede ser el stemGainNode si es multitrack)
      const outNode = source.stemGainNode || source;
      try { outNode.disconnect(); } catch (_) { }

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
        if (processedDest) lastFilter.connect(processedDest);
      } else if (norm === 'C' && this.userGraphNodes.length > 0) {
        const firstFilter = this.userGraphNodes[0];
        const lastFilter = this.userGraphNodes[this.userGraphNodes.length - 1];
        outNode.connect(firstFilter);
        if (processedDest) lastFilter.connect(processedDest);
      } else {
        if (processedDest) outNode.connect(processedDest);
      }
    });

    // Re-tap the external sidechain key AFTER stem nodes were (re)connected.
    this._wireDynamicsSidechain();
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
        if (!buffer) buffer = await this.resourceManager.loadAudio(stem.id, `${AUDIO_BASE_PATH}/${stem.filename}`);
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

      // Resolve per-session gains (solo/mute scoped to this session + silence guard)
      const sessionGains = this.resolveSessionStemGains(mtSession);

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


        const volume = (sessionGains[stem.id] !== undefined ? sessionGains[stem.id] : 1.0) * this.spotlightFactor(stem.id);
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
      } catch (_) { }
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

  /**
   * Time-domain snapshot of the post-compression (wet) signal.
   * Requires a Float32Array sized to `analyser.fftSize`.
   * @param {Float32Array} outputArray
   * @returns {Float32Array}
   */
  getTimeDomainData(outputArray) {
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(outputArray);
    }
    return outputArray;
  }

  /**
   * Time-domain snapshot of the pre-compression (dry) signal.
   * Requires a Float32Array sized to `preAnalyser.fftSize`.
   * @param {Float32Array} outputArray
   * @returns {Float32Array}
   */
  getPreTimeDomainData(outputArray) {
    if (this.preAnalyser) {
      this.preAnalyser.getFloatTimeDomainData(outputArray);
    }
    return outputArray;
  }

  /** Number of samples available per time-domain read (post analyser). */
  get timeDomainLength() {
    return this.analyser ? this.analyser.fftSize : 2048;
  }

  /** Sample rate of the running context (defaults to 48 kHz). */
  get sampleRateHz() {
    return (this.ctx && this.ctx.sampleRate) || 48000;
  }

  setMasterVolume(vol) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime, 0.02);
    }
  }
}
