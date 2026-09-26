/**
 * @file App.js
 * @description Main application controller integrating AudioEngine, Visualizer, GameLoopManager (FSM),
 * and AudioResourceManager. Implements fully reactive (data-driven) UI reflection of global state,
 * dynamic <optgroup> track selector, real-time loading spinner, and multi-band pedagogical results.
 */

import { AudioEngine } from './AudioEngine.js?v=18';
import { Visualizer } from './Visualizer.js?v=20';
import { GameLoopManager, GAME_STATES } from './GameLoopManager.js?v=18';
import { AUDIO_SOURCES, MULTITRACK_SESSIONS } from './AudioResourceManager.js?v=21';
import { TrainingManager } from './TrainingManager.js?v=21';
import { ScoringEngine, checkFilterFalseFriends, analyzeProPractices } from './ScoringEngine.js?v=21';

export class App {
  constructor() {
    this.audio = new AudioEngine();
    this.gameLoop = new GameLoopManager();
    this.trainer = new TrainingManager();
    this.visualizer = null;

    // Validation Flags
    this.hasListenedA = false;
    this.hasListenedB = false;
    this.hasInteracted = false;
    this.activeAuditionIndex = -1;

    // Target Swap Lifelines
    this.targetSwapsRemaining = 3;

    // Audio Resource Manager Listener Setup (Phase 1)
    if (this.audio.resourceManager) {
      this.audio.resourceManager.on('onLoadStart', () => this.showAudioSpinner(true));
      this.audio.resourceManager.on('onLoadComplete', () => this.showAudioSpinner(false));
      this.audio.resourceManager.on('onLoadError', () => this.showAudioSpinner(false));
    }
  }

  /**
   * Initializes the application ecosystem.
   */
  async init() {
    const canvas = document.getElementById('visualizerCanvas');
    if (canvas) {
      this.visualizer = new Visualizer(canvas, this.audio);
    }

    this.bindOnboardingEvents();
    this.bindEvents();
    this.populateSourceDropdown();

    // Subscribe to GameLoopManager FSM & Store changes (Phase 2 & 4)
    this.gameLoop.subscribe((state, store) => {
      this.renderHUD(store);
      this.onFSMStateChange(state, store);
    });

    // Visualizer Node Change Handler (Normal & Pro Mode dragging)
    if (this.visualizer) {
      this.visualizer.onNodeChange = (nodesArray) => {
        const activeIndex = this.visualizer.activeNodeIndex || 0;
        const activeNode = nodesArray[activeIndex];

        if (activeNode) {
          this.updateManualInputs(activeNode.frequencyHz, activeNode.gainDb, activeNode.qFactor, activeNode.type);
        }
        
        // Phase 4: Dispatch state update & update AudioEngine smoothly
        this.gameLoop.setUserGuess(nodesArray);
        this.audio.updateUserEQ(nodesArray);
        this.hasInteracted = true;
        this.updateValidationState();
      };

      this.visualizer.onBandSelected = (index) => {
        this.setActiveBand(index);
      };
    }

          </div>

          <div class="soundgym-stat">
            <span class="soundgym-stat-label">STAGE</span>
            <span id="soundgymStage" class="soundgym-stat-val text-cyan">1/5</span>
          </div>

          <div id="livesContainer" class="lives-container"></div>

          <button id="swapTargetBtn" class="btn btn-secondary btn-compact">
            🔀 Cambiar <span id="swapCountBadge" class="badge-easy">3/3</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Fila 2: Workspace / Canvas (1fr, Ocupa 100% Ancho y Alto de la Celda Central, Sin Popups Flotantes) -->
    <main id="workspace" class="workspace" style="position: relative;">
      <canvas id="visualizerCanvas"></canvas>

      <!-- Stem Mixer Panel (Hidden by default) -->
      <div id="stemMixerPanel" class="stem-mixer-panel hidden">
        <div class="stem-mixer-header">
          <h3>🎛️ Stem Mixer</h3>
          <span id="stemMixerTitle">Beat</span>
        </div>
        <div id="stemMixerTracks" class="stem-mixer-tracks">
          <!-- Tracks dynamically injected here by App.js -->
        </div>
      </div>
    </main>

    <!-- Fila 3: Bottom Dock (100% Ancho Inferior, De Lado a Lado) -->
    <footer id="bottomDock" class="bottom-dock">
      
      <!-- Modo Fácil: Cuadrícula Horizontal de Opciones A, B, C, D -->
      <div id="easyModeSection" style="width: 100%;">
        <div id="easyOptionsGrid" class="easy-options-grid-horizontal"></div>
      </div>

      <!-- Modo Normal / Pro: Controles Manuales Horizontal -->
      <div id="manualModeSection" class="hidden" style="width: 100%;">
        <!-- Selector Multi-banda (Oculto por defecto, visible en Boss Mode) -->
        <div id="bandSelector" class="band-selector hidden" style="display: flex; gap: 8px; justify-content: center; margin-bottom: 8px;">
          <button class="btn btn-band active" data-band="0">🟢 Banda 1</button>
          <button class="btn btn-band" data-band="1">🟡 Banda 2</button>
        </div>
        <div class="manual-controls-horizontal">

          <div class="control-card-compact">
            <div class="control-label">
              <span>Frecuencia</span>
              <span id="freqValue" class="control-value">1000 Hz</span>
            </div>
            <input type="range" id="freqInput" min="20" max="20000" step="1" value="1000">
          </div>

          <div class="control-card-compact">
            <div class="control-label">
              <span>Ganancia</span>
              <span id="gainValue" class="control-value">0.0 dB</span>
    const uploadGroup = document.createElement('optgroup');
    uploadGroup.label = "Archivos del Usuario";
    const uploadOpt = document.createElement('option');
    uploadOpt.value = 'upload-custom';
    uploadOpt.textContent = '📁 Cargar Archivo OGG / MP3...';
    uploadGroup.appendChild(uploadOpt);
    select.appendChild(uploadGroup);
  }

  /**
   * Hide the Stem Mixer Panel
   */
  hideStemMixer() {
    const panel = document.getElementById('stemMixerPanel');
    if (panel) panel.classList.add('hidden');
  }

  /**
   * Render the Stem Mixer Panel for a loaded Multitrack Session
   */
  renderStemMixer(mtSession) {
    const panel = document.getElementById('stemMixerPanel');
    const tracksContainer = document.getElementById('stemMixerTracks');
    const title = document.getElementById('stemMixerTitle');
    
    if (!panel || !tracksContainer || !title) return;
    
    title.textContent = mtSession.displayName;
    tracksContainer.innerHTML = '';
    
    mtSession.stems.forEach(stem => {
      const trackDiv = document.createElement('div');
      trackDiv.className = `stem-track ${stem.id === mtSession.targetStem ? 'is-target' : ''}`;
      
      let badgeText = stem.acousticClass ? stem.acousticClass.toUpperCase() : 'STEM';
      
      trackDiv.innerHTML = `
        <div class="stem-header">
          <div class="stem-name">
            <span class="target-badge">TARGET</span>
            <span class="acoustic-badge acoustic-${stem.acousticClass || 'generic'}">${badgeText}</span>
            <span class="stem-title">${stem.displayName.replace(/^[^\w\s]+/, '').trim()}</span>
          </div>
          <div class="stem-controls">
            <button class="btn-mute" data-stem="${stem.id}">M</button>
            <button class="btn-solo" data-stem="${stem.id}">S</button>
          </div>
        </div>
        <div class="stem-fader-container">
          <input type="range" class="stem-vol-slider" min="0" max="1" step="0.01" value="1" data-stem="${stem.id}">
        </div>
      `;
      
      const btnMute = trackDiv.querySelector('.btn-mute');
      const btnSolo = trackDiv.querySelector('.btn-solo');
      const volSlider = trackDiv.querySelector('.stem-vol-slider');
      
      // Initialize states from AudioEngine if they exist
      const state = this.audio.stemStates[stem.id];
      if (state) {
        if (state.muted) btnMute.classList.add('active');
        if (state.solo) btnSolo.classList.add('active');
        if (state.volume !== undefined) volSlider.value = state.volume;
      }
      
      btnMute.addEventListener('click', () => {
        this.audio.setStemState(stem.id, 'mute');
        btnMute.classList.toggle('active', this.audio.stemStates[stem.id].muted);
        if (this.audio.stemStates[stem.id].muted) btnSolo.classList.remove('active');
      });
      
      btnSolo.addEventListener('click', () => {
        this.audio.setStemState(stem.id, 'solo');
        btnSolo.classList.toggle('active', this.audio.stemStates[stem.id].solo);
        if (this.audio.stemStates[stem.id].solo) btnMute.classList.remove('active');
        
        // Sincronizar visualmente otros botones solo si cambian
        Array.from(tracksContainer.querySelectorAll('.btn-solo')).forEach(btn => {
           const id = btn.getAttribute('data-stem');
           btn.classList.toggle('active', this.audio.stemStates[id].solo);
           if (this.audio.stemStates[id].solo) {
              tracksContainer.querySelector(`.btn-mute[data-stem="${id}"]`).classList.remove('active');
           }
        });
      });
      
      volSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.audio.setStemVolume(stem.id, val);
      });
      
      tracksContainer.appendChild(trackDiv);
    });
    
    panel.classList.remove('hidden');
  }

  /**
   * Controls onboarding overlay workflow visibility.
   * @param {'WELCOME'|'MODULE_SELECT'|'DIFFICULTY_SELECT'|'PLAYING'} newState 
   */
  setAppState(newState) {
    const overlay = document.getElementById('onboardingOverlay');
    const screenWelcome = document.getElementById('screenWelcome');
    const screenModuleSelect = document.getElementById('screenModuleSelect');
    const screenDifficultySelect = document.getElementById('screenDifficultySelect');

    [screenWelcome, screenModuleSelect, screenDifficultySelect].forEach(s => {
      if (s) {
        s.classList.remove('active-step');
    const btnStartWelcome = document.getElementById('btnStartWelcome');
    if (btnStartWelcome) {
      btnStartWelcome.addEventListener('click', () => {
        this.setAppState('MODULE_SELECT');
      });
    }

    const btnSelectSurgicalEQ = document.getElementById('btnSelectSurgicalEQ');
    if (btnSelectSurgicalEQ) {
      btnSelectSurgicalEQ.addEventListener('click', () => {
        this.setAppState('DIFFICULTY_SELECT');
      });
    }

    const btnBackToWelcome = document.getElementById('btnBackToWelcome');
    if (btnBackToWelcome) {
      btnBackToWelcome.addEventListener('click', () => {
        this.setAppState('WELCOME');
      });
    }

    const btnBackToModules = document.getElementById('btnBackToModules');
    if (btnBackToModules) {
      btnBackToModules.addEventListener('click', () => {
        this.setAppState('MODULE_SELECT');
      });
    }

    const btnLobbyMenu = document.getElementById('btnLobbyMenu');
    if (btnLobbyMenu) {
      btnLobbyMenu.addEventListener('click', () => {
        this.setAppState('DIFFICULTY_SELECT');
      });
    }

    document.querySelectorAll('.btn-select-level').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const level = btn.getAttribute('data-level') || btn.dataset.level;
        this.setMode(level);
      });
    });

    document.querySelectorAll('.difficulty-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const level = card.getAttribute('data-level') || card.dataset.level;
        this.setMode(level);
      });
    });
  }

  setMode(mode) {
    if (!mode) return;

    this.gameLoop.setDifficulty(mode);
    this.trainer.setDifficulty(mode);
    this.updateHeaderModeButtons(mode);

    if (mode === 'easy' || mode === 'normal') {
      if (this.audio) {
        this.audio.setUserEQ([{ frequencyHz: 1000, gainDb: 0, qFactor: 2.0, type: 'peaking' }]);
      }

      if (this.visualizer) {
        this.visualizer.interactiveNodes = [{
          frequencyHz: 1000,
          gainDb: 0,
          qFactor: 2.0,
          type: 'peaking',
          isDragging: false
        }];
        this.visualizer.activeNodeIndex = 0;
        if (this.visualizer.onBandSelected) this.visualizer.onBandSelected(0);
      }

      this.updateManualInputs(1000, 0, 2.0, 'peaking');
    }

    this.renderQuizInterface();
    this.setAppState('PLAYING');

    if (this.audio) {
      if (!this.audio.ctx) {
        this.audio.init().then(() => {
          this.loadSelectedSource().catch(() => {});
        }).catch(err => console.warn('Audio init warning:', err));
      } else {
        this.loadSelectedSource().catch(() => {});
      }
    }
  }

  updateHeaderModeButtons(activeMode) {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      const mode = btn.getAttribute('data-mode') || btn.dataset.mode;
      if (mode === activeMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  async loadSelectedSource() {
    const select = document.getElementById('sourceSelect');
    if (select) {
      this.gameLoop.store.activeTrackId = select.value;
      await this.audio.loadTrack(select.value);
    }
  }

  bindEvents() {
    // Play Button
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
      playBtn.addEventListener('click', async () => {
        if (!this.audio.ctx) {
          await this.audio.init();
          await this.loadSelectedSource();
        }
        this.audio.togglePlay();
        this.updatePlayButton();

        if (this.audio.isPlaying) {
          this.hasListenedA = true;
          this.updateValidationState();
        }
      });
    });
  }

  async loadSelectedSource() {
    const select = document.getElementById('sourceSelect');
    if (select) {
      this.gameLoop.store.activeTrackId = select.value;
      await this.audio.loadTrack(select.value);
    }
  }

  bindEvents() {
    // Play Button
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
      playBtn.addEventListener('click', async () => {
        if (!this.audio.ctx) {
          await this.audio.init();
          await this.loadSelectedSource();
        }
        this.audio.togglePlay();
        this.updatePlayButton();

        if (this.audio.isPlaying) {
          this.hasListenedA = true;
          this.updateValidationState();
        }
      });
    }

    // Transport Scrub Bar
    const transportScrub = document.getElementById('transportScrub');
    if (transportScrub) {
      transportScrub.addEventListener('mousedown', () => {
        if (this.visualizer) this.visualizer.isScrubbing = true;
      });
      transportScrub.addEventListener('mouseup', () => {
        if (this.visualizer) this.visualizer.isScrubbing = false;
      });
      transportScrub.addEventListener('change', (e) => {
        if (this.audio) {
          const newTimeOffset = parseFloat(e.target.value);
          this.audio.scrubTo(newTimeOffset);
        }
      });
    }

    // Target EQ Swap Button
    const swapTargetBtn = document.getElementById('swapTargetBtn');
    if (swapTargetBtn) {
    // Target EQ Swap Button
    const swapTargetBtn = document.getElementById('swapTargetBtn');
    if (swapTargetBtn) {
      swapTargetBtn.addEventListener('click', () => {
        if (this.targetSwapsRemaining > 0) {
          this.targetSwapsRemaining--;
          const badge = document.getElementById('swapCountBadge');
          if (badge) badge.textContent = `${this.targetSwapsRemaining}/3`;

          if (this.targetSwapsRemaining === 0) {
            swapTargetBtn.disabled = true;
            swapTargetBtn.classList.add('btn-disabled');
          }

          this.trainer.startNewTrial();
          this.renderQuizInterface();
        }
      });
    }

    // Track Selector Change
    const sourceSelect = document.getElementById('sourceSelect');
    if (sourceSelect) {
      sourceSelect.addEventListener('change', async (e) => {
        this.hideStemMixer();
        if (e.target.value === 'upload-custom') {
          const fileInput = document.getElementById('fileInput');
          if (fileInput) fileInput.click();
        } else {
          this.gameLoop.store.activeTrackId = e.target.value;
          await this.audio.loadTrack(e.target.value);
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

      if (this.preAnalyser) {
        outNode.connect(this.preAnalyser);
      }
        e.preventDefault();
        e.stopPropagation();
        const mode = btn.getAttribute('data-mode') || btn.dataset.mode;
        if (mode) this.setMode(mode);
      });
    });

    // A/B/C Routing Toggles
    const btnA = document.getElementById('btnRouteA');
    const btnB = document.getElementById('btnRouteB');
    const btnC = document.getElementById('btnRouteC');

    if (btnA) {
      btnA.addEventListener('click', () => {
        this.audio.setRoute('A');
        this.updateABButtons('A');
        this.hasListenedA = true;
        this.updateValidationState();
      });
    }

    if (btnB) {
      btnB.addEventListener('click', () => {
        this.audio.setRoute('B');
        this.updateABButtons('B');
        this.hasListenedB = true;
        this.updateValidationState();
      });
    }

      });
    }

    if (btnC) {
      btnC.addEventListener('click', () => {
        this.audio.setRoute('C');
        this.updateABButtons('C');
      });
    }

    // RTA Mode Toggles
    const btnRtaSmooth = document.getElementById('btnRtaSmooth');
    const btnRtaRaw = document.getElementById('btnRtaRaw');
    
    if (btnRtaSmooth && btnRtaRaw) {
      btnRtaSmooth.addEventListener('click', () => {
        if (this.visualizer) this.visualizer.rtaMode = 'smooth';
        btnRtaSmooth.classList.add('active-off');
        btnRtaRaw.classList.remove('active-off');
      });
      btnRtaRaw.addEventListener('click', () => {
        if (this.visualizer) this.visualizer.rtaMode = 'raw';
        btnRtaRaw.classList.add('active-off');
        btnRtaSmooth.classList.remove('active-off');
      });
    }

    // Phase 4 Reactive Sliders: Sliders dispatch state actions, updating AudioEngine
    const freqInput = document.getElementById('freqInput');
    const gainInput = document.getElementById('gainInput');
    const qInput = document.getElementById('qInput');
    const typeSelect = document.getElementById('typeSelect');

    const updateFromManualInputs = (e) => {
      if (!freqInput || !gainInput || !qInput || !typeSelect || !this.visualizer || !this.visualizer.interactiveNodes) return;
      const freq = parseFloat(freqInput.value);
      const gain = parseFloat(gainInput.value);
      const q = parseFloat(qInput.value);
      const type = typeSelect.value;

      const filtersWithoutGain = ['notch', 'highpass', 'lowpass', 'hp', 'lp'];
          this.visualizer.onBandSelected(index);
        }
      });
    });

    // DEV Backdoor Key 'B' -> Jump to Boss Fight
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyB' && e.target.tagName !== 'INPUT') {
        if (this.trainer) {
      const qVal = document.getElementById('qValue');

      if (freqVal) freqVal.textContent = `${Math.round(freq)} Hz`;
      if (gainVal) gainVal.textContent = `${effectiveGain > 0 ? '+' : ''}${effectiveGain.toFixed(1)} dB`;
      if (qVal) qVal.textContent = q.toFixed(1);

      const activeIndex = this.visualizer.activeNodeIndex || 0;
      const activeNode = this.visualizer.interactiveNodes[activeIndex];
      
      if (activeNode) {
        activeNode.frequencyHz = freq;
        activeNode.gainDb = effectiveGain;
        activeNode.qFactor = q;
        activeNode.type = type;
      }

      if (e && e.isTrusted) {
        this.hasInteracted = true;
        this.updateValidationState();
      }

      if (this.trainer.difficulty !== 'easy') {
        this.gameLoop.setUserGuess(this.visualizer.interactiveNodes);
        this.audio.updateUserEQ(this.visualizer.interactiveNodes);
        if (this.trainer.difficulty === 'normal' && this.visualizer) {
          this.visualizer.showUserCurve = true;
        }
      }
    };

    [freqInput, gainInput, qInput, typeSelect].forEach(el => {
      if (el) {
        el.addEventListener('input', updateFromManualInputs);
        el.addEventListener('change', updateFromManualInputs);
      }
    });

    // Band Selector (Boss Mode)
    document.querySelectorAll('.btn-band').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.getAttribute('data-band'));
        if (this.visualizer && this.visualizer.onBandSelected) {
          this.visualizer.onBandSelected(index);
        }
      });
    });

    // DEV Backdoor Key 'B' -> Jump to Boss Fight
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyB' && e.target.tagName !== 'INPUT') {
        if (this.trainer) {
          this.trainer.stage = this.trainer.maxStages;
          this.gameLoop.store.currentStage = 5;
          this.gameLoop.store.isBossFight = true;
          this.trainer.startNewTrial();
          this.renderQuizInterface();
          console.log("🔥 DEV CHEAT: Saltando a Boss Fight (Stage 5) 🔥");
        }
      }
    });

    // Submit Guess Button
    const submitBtn = document.getElementById('submitGuessBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        if (!this.hasListenedA || !this.hasListenedB || !this.hasInteracted) return;

        const userGuessesArray = this.visualizer.interactiveNodes.map(node => ({
          frequencyHz: node.frequencyHz,
          gainDb: node.gainDb,
          qFactor: node.qFactor,
          type: node.type
        }));

        const result = this.trainer.evaluateManualGuess(userGuessesArray);
        this.showPedagogicalReview(result);
      });
    }

    // Results Dock Next Trial Button
    const bannerNextBtn = document.getElementById('bannerNextBtn');
    if (bannerNextBtn) {
      bannerNextBtn.addEventListener('click', () => {
        const resultsSection = document.getElementById('resultsDockSection');
        if (resultsSection) resultsSection.classList.add('hidden');
        if (this.visualizer) {
          this.visualizer.showTargetCurve = false;
          this.visualizer.showUserCurve = false;
        }

        if (this.trainer.isGameOver || this.gameLoop.store.lives <= 0) {
          this.audio.stopSource();
          this.updatePlayButton();
          this.showGameOverModal();
        } else {
          const bossOutcome = this.trainer.advanceStageOrLevel();
          if (bossOutcome) {
            if (bossOutcome.victory) {
              this.triggerLevelUpAnimation();
              this.unlockLevelFeatures(this.trainer.currentLevel);
              this.showLevelUpModal(bossOutcome);
            } else {
              this.showDefeatMessage(bossOutcome.message || "Has fallado la mezcla del cliente. Vuelve a afinar tu oído y reinténtalo.");
            }
          }
          this.renderQuizInterface();
        }
      });
    }

    // Modals
        if (swapBtn) { swapBtn.disabled = false; swapBtn.classList.remove('btn-disabled'); }

        this.gameLoop.resetSession();
        this.trainer.resetSession();
        this.renderQuizInterface();
      });
    }
  }

  /**
   * Reactively renders top HUD stats based on centralized GameLoopManager store snapshot.
   */
  renderHUD(store) {
    const scoreEl = document.getElementById('soundgymScore');
    if (scoreEl) scoreEl.textContent = store.totalScore.toLocaleString();

    const rankEl = document.getElementById('soundgymRank');
    if (rankEl) rankEl.textContent = this.gameLoop.getRankTitle();

    const stageEl = document.getElementById('soundgymStage');
    if (stageEl) {
      if (store.isBossFight || store.currentStage >= 5) {
        stageEl.innerHTML = `⚠️ <span class="text-danger" style="animation: pulse 1s infinite">BOSS FIGHT</span>`;
      } else {
        stageEl.textContent = `${store.currentStage}/${store.maxStages}`;
      }
    }

    const livesContainer = document.getElementById('livesContainer');
    if (livesContainer) {
      livesContainer.innerHTML = '';
      for (let i = 0; i < store.maxLives; i++) {
        const heart = document.createElement('div');
        heart.className = `heart-icon ${i < store.lives ? '' : 'lost'}`;
        heart.innerHTML = '❤️';
        livesContainer.appendChild(heart);
      }
    }
  }

  onFSMStateChange(state, store) {
    // Handle FSM transitions if required
  }

  updateValidationState() {
    const hintText = document.getElementById('auditionHintText');
    const hintBar = document.getElementById('auditionStatusHint');
    const submitBtn = document.getElementById('submitGuessBtn');

    const isModeEasy = this.trainer.difficulty === 'easy';
    const isValid = this.hasListenedA && this.hasListenedB && (isModeEasy || this.hasInteracted);

    if (hintBar && hintText) {
      if (!this.hasListenedA && !this.hasListenedB) {
        hintText.textContent = 'Escucha "EQ Off" y "EQ On" para responder.';
        hintBar.classList.remove('ready');
      } else if (!this.hasListenedA) {
        hintText.textContent = 'Falta escuchar "EQ Off".';
        hintBar.classList.remove('ready');
        if (swapBtn) { swapBtn.disabled = false; swapBtn.classList.remove('btn-disabled'); }

        this.gameLoop.resetSession();
        this.trainer.resetSession();
        this.renderQuizInterface();
      });
    }
  }

  /**
   * Reactively renders top HUD stats based on centralized GameLoopManager store snapshot.
   */
  renderHUD(store) {
    const scoreEl = document.getElementById('soundgymScore');
    if (scoreEl) scoreEl.textContent = store.totalScore.toLocaleString();

    const rankEl = document.getElementById('soundgymRank');
    if (rankEl) rankEl.textContent = this.gameLoop.getRankTitle();

    const stageEl = document.getElementById('soundgymStage');
    if (stageEl) {
      if (store.isBossFight || store.currentStage >= 5) {
        stageEl.innerHTML = `⚠️ <span class="text-danger" style="animation: pulse 1s infinite">BOSS FIGHT</span>`;
      } else {
        stageEl.textContent = `${store.currentStage}/${store.maxStages}`;
      }
    }

    const livesContainer = document.getElementById('livesContainer');
    if (livesContainer) {
      livesContainer.innerHTML = '';
      for (let i = 0; i < store.maxLives; i++) {
        const heart = document.createElement('div');
        heart.className = `heart-icon ${i < store.lives ? '' : 'lost'}`;
        heart.innerHTML = '❤️';
        livesContainer.appendChild(heart);
      }
    }
  }

  onFSMStateChange(state, store) {
    // Handle FSM transitions if required
  }

  updateValidationState() {
    const hintText = document.getElementById('auditionHintText');
    const hintBar = document.getElementById('auditionStatusHint');
    const submitBtn = document.getElementById('submitGuessBtn');

    const isModeEasy = this.trainer.difficulty === 'easy';
    const isValid = this.hasListenedA && this.hasListenedB && (isModeEasy || this.hasInteracted);

    if (hintBar && hintText) {
      if (!this.hasListenedA && !this.hasListenedB) {
        hintText.textContent = 'Escucha "EQ Off" y "EQ On" para responder.';
        hintBar.classList.remove('ready');
      } else if (!this.hasListenedA) {
        hintText.textContent = 'Falta escuchar "EQ Off".';
        hintBar.classList.remove('ready');
      } else if (!this.hasListenedB) {
        hintText.textContent = 'Falta escuchar "EQ On".';
        hintBar.classList.remove('ready');
      } else if (!isModeEasy && !this.hasInteracted) {
        hintText.textContent = 'Ajusta los controles o arrastra el punto para proponer tu respuesta.';
        hintBar.classList.remove('ready');
      } else {
        hintText.textContent = '¡Listo! Puedes enviar tu respuesta.';
        hintBar.classList.add('ready');
      }
    }

    if (submitBtn) {
      if (isValid) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-submit-disabled');
        submitBtn.classList.add('btn-submit-ready');
      } else {
        submitBtn.disabled = true;
        submitBtn.classList.add('btn-submit-disabled');
        submitBtn.classList.remove('btn-submit-ready');
      }
    }

    if (isModeEasy) {
      document.querySelectorAll('.btn-select-guess').forEach(btn => {
        if (this.hasListenedA && this.hasListenedB) {
          btn.disabled = false;
          btn.classList.remove('btn-disabled');
        } else {
          btn.disabled = true;
          btn.classList.add('btn-disabled');
        }
      });
    }
  }

  async loadSelectedSource() {
    const select = document.getElementById('sourceSelect');
    if (!select) return;
    const val = select.value;
    await this.audio.loadTrack(val);
      btn.innerHTML = '<span>⏸</span> Pausar';
      btn.classList.add('pulse-glow');
    } else {
      btn.innerHTML = '<span>▶</span> Play';
      btn.classList.remove('pulse-glow');
    }
  }

  updateABButtons(activeRoute) {
    const btnA = document.getElementById('btnRouteA');
    const btnB = document.getElementById('btnRouteB');
    const btnC = document.getElementById('btnRouteC');

    [btnA, btnB, btnC].forEach(btn => {
      if (btn) btn.classList.remove('active-off', 'active-on', 'active-guess', 'active-audition');
    });

    if (activeRoute === 'A' && btnA) {
      btnA.classList.add('active-off');
    } else if (activeRoute === 'B' && btnB) {
    const manualContainer = document.getElementById('manualModeSection');
    const btnRouteC = document.getElementById('btnRouteC');
    const hardControlsGroup = document.getElementById('hardControlsGroup');
    const bandSelector = document.getElementById('bandSelector');

    if (this.trainer.difficulty === 'easy') {
      if (easyContainer) easyContainer.classList.remove('hidden');
      if (manualContainer) manualContainer.classList.add('hidden');
      if (btnRouteC) btnRouteC.classList.add('hidden');
    } else if (activeRoute === 'AUDITION' && btnB) {
      btnB.classList.add('active-on');
    }
  }

  renderQuizInterface() {
    const targets = this.trainer.targetFilters;
    if (!targets || targets.length === 0) return;

    this.activeAuditionIndex = -1;
    this.hasListenedA = this.audio.isPlaying;
    this.hasListenedB = false;
    this.hasInteracted = false;

    const resultsSection = document.getElementById('resultsDockSection');
    if (resultsSection) {
      resultsSection.classList.add('hidden');
      resultsSection.classList.remove('pro-mode-active');
    }
    const falseFriendsCard = document.getElementById('falseFriendsCard');
    if (falseFriendsCard) falseFriendsCard.classList.add('hidden');
    const proAnalysisCard = document.getElementById('proAnalysisCard');
    if (proAnalysisCard) proAnalysisCard.classList.add('hidden');

    this.audio.setTargetEQ(targets);
    this.audio.setRoute('A');
    this.updateABButtons('A');

    const isBoss = this.trainer.isBossStage || this.gameLoop.store.isBossFight;

    if (this.visualizer) {
      this.visualizer.didacticTargets = targets.map(t => ({ ...t }));
      this.visualizer.showTargetCurve = false;
      this.visualizer.showUserCurve = false;
      this.visualizer.didacticUsers = [];
      
      this.visualizer.interactiveNodes = targets.map((_, i) => ({
        frequencyHz: isBoss ? (i === 0 ? 500 : 2000) : 1000,
        gainDb: 0,
        qFactor: 2.0,
        type: 'peaking',
        isDragging: false
      }));
      this.visualizer.activeNodeIndex = 0;
    }

    this.updateManualInputs(isBoss ? 500 : 1000, 0, 2.0, 'peaking');
    this.audio.setUserEQ(this.visualizer ? this.visualizer.interactiveNodes : []);

    const easyContainer = document.getElementById('easyModeSection');
    const manualContainer = document.getElementById('manualModeSection');
    const btnRouteC = document.getElementById('btnRouteC');
    const hardControlsGroup = document.getElementById('hardControlsGroup');
    const bandSelector = document.getElementById('bandSelector');

    if (this.trainer.difficulty === 'easy') {
      if (easyContainer) easyContainer.classList.remove('hidden');
      if (manualContainer) manualContainer.classList.add('hidden');
      if (btnRouteC) btnRouteC.classList.add('hidden');
      if (this.visualizer) this.visualizer.showNodeHandle = false;
      this.renderEasyOptions();
    } else if (this.trainer.difficulty === 'normal') {
      if (easyContainer) easyContainer.classList.add('hidden');
      if (manualContainer) manualContainer.classList.remove('hidden');
      if (btnRouteC) btnRouteC.classList.remove('hidden');
      if (bandSelector) bandSelector.classList.toggle('hidden', !isBoss);

      if (this.visualizer) {
        this.visualizer.showUserCurve = true;
        this.visualizer.showNodeHandle = true;
      }

      grid.appendChild(card);
    });
  }

  setActiveBand(index) {
    if (!this.visualizer || !this.visualizer.interactiveNodes) return;
    const nodes = this.visualizer.interactiveNodes;
    if (index < 0 || index >= nodes.length) return;

    this.visualizer.activeNodeIndex = index;

    document.querySelectorAll('.btn-band').forEach((btn, idx) => {
      if (idx === index) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  renderEasyOptions() {
    const grid = document.getElementById('easyOptionsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    this.trainer.easyOptions.forEach((option, idx) => {
      const card = document.createElement('div');
      card.className = `option-card ${this.activeAuditionIndex === idx ? 'auditioning' : ''}`;

      card.innerHTML = `
        <div class="option-header">
          <span class="option-badge">Opción ${String.fromCharCode(65 + idx)}</span>
        </div>
        <div class="option-title">${option.title}</div>
        <div class="option-actions">
          <button class="btn btn-secondary btn-audition" data-idx="${idx}">
            🎧 Audicionar
          </button>
          <button class="btn btn-primary btn-select-guess ${(!this.hasListenedA || !this.hasListenedB) ? 'btn-disabled' : ''}" data-idx="${idx}" ${(!this.hasListenedA || !this.hasListenedB) ? 'disabled' : ''}>
            ✓ Elegir
          </button>
        </div>
      `;

      card.querySelector('.btn-audition').addEventListener('click', () => {
        this.activeAuditionIndex = idx;
        const optTarget = option.target;
        this.audio.setUserEQ([optTarget]);
        this.audio.setRoute('AUDITION');
        this.updateABButtons('AUDITION');
        this.renderEasyOptions();
      });

      card.querySelector('.btn-select-guess').addEventListener('click', () => {
        if (!this.hasListenedA || !this.hasListenedB) return;
        const result = this.trainer.evaluateEasyGuess(idx);
        this.showPedagogicalReview(result);
      });

    const nodes = this.visualizer.interactiveNodes;
    if (index < 0 || index >= nodes.length) return;

    this.visualizer.activeNodeIndex = index;

    document.querySelectorAll('.btn-band').forEach((btn, idx) => {
      if (idx === index) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const activeNode = nodes[index];
    if (activeNode) {
      this.updateManualInputs(activeNode.frequencyHz, activeNode.gainDb, activeNode.qFactor, activeNode.type);
    }
  }

  updateManualInputs(freq, gain, q, type) {
    const freqInput = document.getElementById('freqInput');
    const gainInput = document.getElementById('gainInput');
    const qInput = document.getElementById('qInput');
    const typeSelect = document.getElementById('typeSelect');

    const filtersWithoutGain = ['notch', 'highpass', 'lowpass', 'hp', 'lp'];
    const filterType = type || (typeSelect ? typeSelect.value : 'peaking');
    const isNoGain = filtersWithoutGain.includes((filterType || '').toLowerCase());
    const effectiveGain = isNoGain ? 0 : gain;

    if (freqInput) freqInput.value = freq;
    if (gainInput) {
      gainInput.value = effectiveGain;
      gainInput.disabled = isNoGain;
    }
    if (qInput) qInput.value = q;
    if (typeSelect && type) typeSelect.value = type;

    const freqVal = document.getElementById('freqValue');
    const gainVal = document.getElementById('gainValue');
    const qVal = document.getElementById('qValue');

    if (freqVal) freqVal.textContent = `${Math.round(freq)} Hz`;
    if (gainVal) gainVal.textContent = `${effectiveGain > 0 ? '+' : ''}${effectiveGain.toFixed(1)} dB`;
    if (qVal) qVal.textContent = q.toFixed(1);
  }

  formatFilterTypeName(typeStr) {
    if (!typeStr) return 'Bell';
    switch (typeStr.toLowerCase()) {
      case 'peaking': return 'Bell';
      case 'lowpass': return 'Low Pass';
      case 'highpass': return 'High Pass';
      case 'lowshelf': return 'Low Shelf';
      case 'highshelf': return 'High Shelf';
      case 'notch': return 'Notch';
      default: return typeStr;
    }
  }

  /**
   * Phase 4: Renders pedagogical results dock including multi-band breakdown,
   * false friends cards, and pro practices cards.
   */
  showPedagogicalReview(result) {
    if (!this.audio.isPlaying && this.audio.ctx) {
      this.audio.play();
    }
    this.updatePlayButton();

    this.audio.setRoute('B');
    this.updateABButtons('B');

    const easyContainer = document.getElementById('easyModeSection');
    const manualContainer = document.getElementById('manualModeSection');
    if (easyContainer) easyContainer.classList.add('hidden');
    if (manualContainer) manualContainer.classList.add('hidden');
    
    const resultsSection = document.getElementById('resultsDockSection');
    if (resultsSection) resultsSection.classList.remove('hidden');

    const targets = this.trainer.targetFilters || [];

    this.audio.setTargetEQ(targets);

    if (this.visualizer) {
      this.visualizer.showTargetCurve = true;
      this.visualizer.didacticTargets = targets.map(t => ({ ...t }));
    }

    if (result.bandResults && result.bandResults.length > 0) {
      const userGuesses = result.bandResults.map(br => br.guess);
      this.audio.setUserEQ(userGuesses);
      
      if (this.visualizer) {
        this.visualizer.didacticUsers = userGuesses.map(g => ({ ...g }));
        const isExactHit = (result.scorePercentage === 100);
        this.visualizer.showUserCurve = !isExactHit;
      }
    } else {
      if (this.visualizer) {
        this.visualizer.didacticUsers = [];
        this.visualizer.showUserCurve = false;
      }
    }

    const icon = document.getElementById('resultsIcon');
    const title = document.getElementById('resultsTitle');
    const subtitle = document.getElementById('resultsSubtitle');

    const rawLabel = result.ratingLabel || '';
    const cleanLabel = rawLabel.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();

    const target = this.trainer.currentTarget;
    let subtitleText = '';
    
    if (this.trainer.isBossStage) {
      subtitleText = `Objetivo: Boss Fight Multi-Banda (${targets.length} Filtros)`;
    } else {
      const filtersWithoutGain = ['notch', 'highpass', 'lowpass', 'hp', 'lp'];
      const targetTypeLower = (target ? target.type || '' : '').toLowerCase();
      const isTargetNoGain = filtersWithoutGain.includes(targetTypeLower);
      const targetGainStr = isTargetNoGain ? '' : ` (${target.gainDb > 0 ? '+' : ''}${target.gainDb.toFixed(1)} dB)`;

      const targetTypeStr = this.formatFilterTypeName(target ? target.type : 'peaking');
      subtitleText = `Objetivo: ${targetTypeStr} ${Math.round(target ? target.frequencyHz : 1000)} Hz${targetGainStr}`;

      if (this.trainer.difficulty === 'hard') {
        if (result.isTypeCorrect) {
          subtitleText += ` <span style="color:#10b981; font-weight:bold; margin-left:8px;">🎯 ¡Filtro Acertado! (+100 PTS)</span>`;
        } else if (result.userType) {
          const userTypeStr = this.formatFilterTypeName(result.userType);
          subtitleText += ` <span style="color:#f43f5e; margin-left:8px;">(Tu tipo: ${userTypeStr})</span>`;
        }
      }
    }

    if (subtitle) subtitle.innerHTML = subtitleText;

        }
      }
    }

    if (subtitle) subtitle.innerHTML = subtitleText;

    if (icon && title) {
      if (result.isPolarityFlipped) {
        icon.textContent = '⚠️';
        title.textContent = cleanLabel || 'Ganancia Opuesta';
        title.className = 'results-title warning';
      } else if (result.isCorrect) {
        icon.textContent = '🎉';
        title.textContent = cleanLabel || '¡Opción Correcta!';
        title.className = 'results-title success';
      } else {
        icon.textContent = '🎯';
        title.textContent = cleanLabel || 'Revisión Didáctica';
        title.className = 'results-title failure';
      }
    }

    // Evaluate game loop trial outcome
    const gameOutcome = this.gameLoop.evaluateTrialOutcome(result.scorePercentage, result.pointsAwarded || 0);

    const statPoints = document.getElementById('pStatPoints');
    const statScore = document.getElementById('pStatScore');
    const statFreqError = document.getElementById('pStatFreqError');
    const statGainError = document.getElementById('pStatGainError');

    if (statPoints) statPoints.textContent = `+${(result.pointsAwarded || 0).toLocaleString()}`;

    const isBossBreakdown = (this.trainer.isBossStage || result.isBossStage) && result.bandResults && result.bandResults.length > 1;

    if (isBossBreakdown) {
      if (statScore) {
        const totalP = result.totalPrecision !== undefined ? result.totalPrecision : result.scorePercentage;
        statScore.textContent = `${Math.round(totalP)}% (B1: ${Math.round(result.band1Precision)}% | B2: ${Math.round(result.band2Precision)}%)`;
      }
      if (statFreqError) {
        statFreqError.textContent = `B1: ${result.band1Octave.toFixed(2)} oct | B2: ${result.band2Octave.toFixed(2)} oct`;
    const modal = document.getElementById('levelUpModal');
    if (!modal) return;
    const rankTitleEl = document.getElementById('modalNewRankTitle');
    if (rankTitleEl) rankTitleEl.textContent = outcome.rankTitle || 'Técnico de Sonido';
    modal.classList.add('active');
  }

  triggerLevelUpAnimation() {
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '99999';
    document.body.appendChild(canvas);
        falseFriendsMsgEl.textContent = '';
        falseFriendsCard.classList.add('hidden');
      }
    }

    // Acoustic Context Logic
    const acousticContextCard = document.getElementById('acousticContextCard');
    const acousticContextMsgEl = document.getElementById('acousticContextMessage');
    
    if (acousticContextCard && acousticContextMsgEl) {
      const activeId = this.gameLoop.store.activeTrackId;
      let trackMetadata = AUDIO_SOURCES.find(s => s.id === activeId);
      
      if (!trackMetadata) {
         const mtSession = MULTITRACK_SESSIONS.find(s => s.id === activeId);
         if (mtSession) {
            trackMetadata = mtSession.stems.find(st => st.id === mtSession.targetStem);
         }
      }
      
      const acousticClass = trackMetadata ? trackMetadata.acousticClass : 'generic';
      const pFeedback = ScoringEngine.getPedagogicalFeedback(acousticClass, userGuess.frequencyHz, userGuess.gainDb);
      
      if (pFeedback && Math.abs(userGuess.gainDb) > 0) {
        const titleStr = `<strong>${pFeedback.bandName} (${Math.abs(userGuess.gainDb).toFixed(1)} dB ${pFeedback.type === 'boost' ? 'Boost' : 'Cut'}):</strong> `;
        const actionStr = `El intento en ${Math.round(userGuess.frequencyHz)} Hz resultó en lo siguiente: ${pFeedback.text}`;
        acousticContextMsgEl.innerHTML = titleStr + actionStr;
        acousticContextCard.classList.remove('hidden');
      } else {
        acousticContextMsgEl.innerHTML = '';
        acousticContextCard.classList.add('hidden');
      }
    }

    const isProMode = (this.trainer.difficulty === 'hard');
    const proCard = document.getElementById('proAnalysisCard');
    const proTerminal = document.getElementById('proAnalysisTerminal');

    if (this.visualizer) {
      this.visualizer.isProMode = isProMode;
      this.visualizer.showPhaseCurve = isProMode;
    }

    if (isProMode && proCard && proTerminal) {
      if (resultsSection) resultsSection.classList.add('pro-mode-active');

      const audioContextStr = this.audio ? (this.audio.currentTrackId || this.audio.currentBufferName || "") : "";
      const proAnalysis = analyzeProPractices(target, userGuess, audioContextStr);
      proTerminal.innerHTML = '';

      const item = document.createElement('div');
      item.className = proAnalysis.isWarning ? 'pro-terminal-item' : 'pro-terminal-item pro-terminal-ok';
      item.textContent = proAnalysis.message;
      proTerminal.appendChild(item);

      proCard.classList.remove('hidden');
    } else {
      if (resultsSection) resultsSection.classList.remove('pro-mode-active');
      if (proCard) proCard.classList.add('hidden');
    }
  }

  showLevelUpModal(outcome) {
    const modal = document.getElementById('levelUpModal');
    if (!modal) return;
    const rankTitleEl = document.getElementById('modalNewRankTitle');
    if (rankTitleEl) rankTitleEl.textContent = outcome.rankTitle || 'Técnico de Sonido';
    modal.classList.add('active');
  }

  triggerLevelUpAnimation() {
          ctx.restore();
        }
      });

      if (activeParticles > 0 && progress < 3500) {
        requestAnimationFrame(animate);
      } else {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    }

    requestAnimationFrame(animate);
  }

  unlockLevelFeatures(currentLevel) {
    const existing = document.getElementById('levelUnlockToast');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const toast = document.createElement('div');
    toast.id = 'levelUnlockToast';
    toast.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid #f59e0b;
      box-shadow: 0 0 25px rgba(245, 158, 11, 0.4);
      color: #f8fafc;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 9999;
      font-size: 0.9rem;
      pointer-events: none;
      transition: opacity 0.5s ease;
    `;
    toast.innerHTML = `<strong>🔓 ¡Nivel ${currentLevel} Desbloqueado!</strong><br><span style="color:#38bdf8">${this.gameLoop.getRankTitle()}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 500);
    }, 3500);
  }

  showDefeatMessage(message) {
    this.showBossDefeatModal({ message });
  }

  showBossDefeatModal(outcome) {
    const modal = document.getElementById('bossDefeatModal');
    if (!modal) return;
    const msgEl = document.getElementById('modalDefeatMessage');
    const msgText = (typeof outcome === 'string') ? outcome : (outcome ? outcome.message : null);
    if (msgEl) msgEl.textContent = msgText || 'Has fallado la mezcla del cliente. Vuelve a afinar tu oído y reinténtalo.';
    modal.classList.add('active');
  }

  showGameOverModal() {
    const modal = document.getElementById('gameOverModal');
    if (!modal) return;
    const finalScorePoints = document.getElementById('finalScorePoints');
    const finalStreak = document.getElementById('finalStreak');
    const finalScore = document.getElementById('finalScore');

    if (finalScorePoints) finalScorePoints.textContent = this.gameLoop.store.totalScore.toLocaleString();
    if (finalStreak) finalStreak.textContent = this.gameLoop.store.streak;
    if (finalScore) {
      const avg = this.trainer.totalTrials > 0 ? Math.round(this.trainer.totalScoreSum / this.trainer.totalTrials) : 0;
      finalScore.textContent = `${avg}%`;
    }
    modal.classList.add('active');
  }
}

// Auto-boot entry point
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const startApp = () => {
    const app = new App();
    app.init().catch(err => console.error('App init error:', err));
    window.app = app;
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    startApp();
  } else {
    window.addEventListener('DOMContentLoaded', startApp);
  }
}

