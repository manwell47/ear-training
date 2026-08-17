/**
 * @file App.js
 * @description Main application controller integrating AudioEngine, Visualizer, and TrainingManager.
 * Manages CSS Grid workspace layout, onboarding overlay, mode switching, draggable Canvas node handle in Pro mode, and Fila 3 integrated pedagogical results.
 */

import { AudioEngine } from './AudioEngine.js';
import { Visualizer } from './Visualizer_v2.js?v=45';
import { GameLoopManager, GAME_STATES } from './GameLoopManager.js';
import { AUDIO_SOURCES, MULTITRACK_SESSIONS } from './AudioResourceManager.js';
import { TrainingManager } from './TrainingManager.js';
import { ScoringEngine, checkFilterFalseFriends, analyzeProPractices } from './ScoringEngine.js';
import { VUMeter } from './VUMeter.js';

export class App {
  constructor() {
    this.audio = new AudioEngine();
    this.trainer = new TrainingManager();
    this.visualizer = null;
    this.vuMeter = null;

    // Track state for user interaction validation
    this.hasListenedA = false;
    this.hasListenedB = false;
    this.hasInteracted = false;
    this.activeAuditionIndex = -1;

    // Target Swap Lifelines
    this.targetSwapsRemaining = 3;

    // Local track catalog removed in favor of AUDIO_SOURCES from AudioResourceManager
  }

  /**
   * Initializes the application ecosystem.
   */
  async init() {
    const canvas = document.getElementById('visualizerCanvas');
    if (canvas) {
      this.visualizer = new Visualizer(canvas, this.audio);
    }

    this.scoringEngine = new ScoringEngine();
    this.gameLoop = new GameLoopManager(this.scoringEngine);
    this.gameLoop.subscribe((state, store) => {
        if (typeof this.renderHUD === 'function') this.renderHUD(store);
    });

    this.bindOnboardingEvents();
    this.bindEvents();
    this.populateSourceDropdown();

    // Visualizer Node Change Handler (Normal & Pro Mode dragging)
    if (this.visualizer) {
      this.visualizer.onNodeChange = (nodesArray) => {
        const activeIndex = this.visualizer.activeNodeIndex;
        const activeNode = nodesArray[activeIndex];

        this.updateManualInputs(activeNode.frequencyHz, activeNode.gainDb, activeNode.qFactor);
        this.audio.setUserEQ(nodesArray);
        this.hasInteracted = true;
        this.updateValidationState();
      };

      this.visualizer.onBandSelected = (index) => {
        this.setActiveBand(index);
      };
    }

    if (this.audio.analyser) {
        this.vuMeter = new VUMeter('vuMeter', this.audio.analyser);
    }

    // Audio Engine State Change Handler
    this.audio.onStateChange = (state) => {
      if (state.isPlaying !== undefined) {
        this.updatePlayButton();
        if (this.vuMeter) {
            if (state.isPlaying) this.vuMeter.start();
            else this.vuMeter.stop();
        }
      }
    };

    // Start with onboarding welcome screen
    this.setAppState('WELCOME');
  }

  /**
   * Controls onboarding overlay workflow visibility.
   * @param {'WELCOME'|'MODULE_SELECT'|'DIFFICULTY_SELECT'|'PLAYING'} newState 
   */
  setAppState(newState) {
    const overlay = document.getElementById('onboardingOverlay');
    const screenWelcome = document.getElementById('screenWelcome');
    const screenModuleSelect = document.getElementById('screenModuleSelect');
    const screenGameModeSelect = document.getElementById('screenGameModeSelect');
    const screenCampaignSelect = document.getElementById('screenCampaignSelect');
    const screenDifficultySelect = document.getElementById('screenDifficultySelect');

    [screenWelcome, screenModuleSelect, screenGameModeSelect, screenCampaignSelect, screenDifficultySelect].forEach(s => {
      if (s) {
        s.classList.remove('active-step');
        s.classList.add('hidden');
      }
    });

    if (newState === 'WELCOME') {
      if (overlay) overlay.classList.remove('hidden-overlay');
      if (screenWelcome) {
        screenWelcome.classList.remove('hidden');
        setTimeout(() => screenWelcome.classList.add('active-step'), 20);
      }
    } else if (newState === 'MODULE_SELECT') {
      if (overlay) overlay.classList.remove('hidden-overlay');
      if (screenModuleSelect) {
        screenModuleSelect.classList.remove('hidden');
        setTimeout(() => screenModuleSelect.classList.add('active-step'), 20);
      }
    } else if (newState === 'GAME_MODE_SELECT') {
      if (overlay) overlay.classList.remove('hidden-overlay');
      if (screenGameModeSelect) {
        screenGameModeSelect.classList.remove('hidden');
        setTimeout(() => screenGameModeSelect.classList.add('active-step'), 20);
      }
    } else if (newState === 'CAMPAIGN_SELECT') {
      if (overlay) overlay.classList.remove('hidden-overlay');
      if (screenCampaignSelect) {
        screenCampaignSelect.classList.remove('hidden');
        setTimeout(() => screenCampaignSelect.classList.add('active-step'), 20);
      }
    } else if (newState === 'DIFFICULTY_SELECT') {
      if (overlay) overlay.classList.remove('hidden-overlay');
      if (screenDifficultySelect) {
        screenDifficultySelect.classList.remove('hidden');
        setTimeout(() => screenDifficultySelect.classList.add('active-step'), 20);
      }
    } else if (newState === 'PLAYING') {
      if (overlay) overlay.classList.add('hidden-overlay');
    }
  }

  setActiveBand(index) {
    if (!this.visualizer || !this.visualizer.interactiveNodes) return;
    
    this.visualizer.activeNodeIndex = index;
    
    // Update active class on DOM tabs
    document.querySelectorAll('.btn-band').forEach(btn => {
        if (parseInt(btn.getAttribute('data-band')) === index) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Update DOM inputs to match this node
    const node = this.visualizer.interactiveNodes[index];
    if (node) {
        this.updateManualInputs(node.frequencyHz, node.gainDb, node.qFactor);
        const typeSelect = document.getElementById('typeSelect');
        if (typeSelect) typeSelect.value = node.type || 'peaking';
    }
  }

  bindOnboardingEvents() {
    const btnStartWelcome = document.getElementById('btnStartWelcome');
    if (btnStartWelcome) {
      btnStartWelcome.addEventListener('click', () => {
        this.setAppState('MODULE_SELECT');
      });
    }

    const btnSelectSurgicalEQ = document.getElementById('btnSelectSurgicalEQ');
    if (btnSelectSurgicalEQ) {
      btnSelectSurgicalEQ.addEventListener('click', () => {
        this.setAppState('GAME_MODE_SELECT');
      });
    }

    const btnBackToModulesFromMode = document.getElementById('btnBackToModulesFromMode');
    if (btnBackToModulesFromMode) {
      btnBackToModulesFromMode.addEventListener('click', () => {
        this.setAppState('MODULE_SELECT');
      });
    }

    const btnModeLibre = document.getElementById('btnModeLibre');
    if (btnModeLibre) {
      btnModeLibre.addEventListener('click', () => {
        this.gameLoop.setGameMode('arcade');
        this.setAppState('DIFFICULTY_SELECT');
      });
    }

    const btnModeArcade = document.getElementById('btnModeArcade');
    if (btnModeArcade) {
      btnModeArcade.addEventListener('click', () => {
        this.gameLoop.setGameMode('arcade');
        this.setAppState('DIFFICULTY_SELECT');
      });
    }

    const btnModeCampaign = document.getElementById('btnModeCampaign');
    if (btnModeCampaign) {
      btnModeCampaign.addEventListener('click', () => {
        this.gameLoop.setGameMode('campaign');
        this.setAppState('CAMPAIGN_SELECT');
      });
    }

    const btnBackToModeFromCampaign = document.getElementById('btnBackToModeFromCampaign');
    if (btnBackToModeFromCampaign) {
      btnBackToModeFromCampaign.addEventListener('click', () => {
        this.setAppState('GAME_MODE_SELECT');
      });
    }

    document.querySelectorAll('.btn-select-campaign').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const campaign = btn.getAttribute('data-campaign');
        const sourceSelect = document.getElementById('sourceSelect');
        if (sourceSelect && campaign) {
           sourceSelect.value = campaign;
           if (typeof this.buildCustomDropdown === 'function') this.buildCustomDropdown();
        }
        this.setAppState('DIFFICULTY_SELECT');
      });
    });

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

    this.trainer.setDifficulty(mode);
    this.updateHeaderModeButtons(mode);

    // Reinicio estricto del estado de los filtros al cambiar a modo Fácil o Normal
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

      // Restablecer controles de la interfaz DOM (Gain = 0, Q = 2.0, Type = 'peaking')
      this.updateManualInputs(1000, 0, 2.0);
      const typeSelect = document.getElementById('typeSelect');
      if (typeSelect) typeSelect.value = 'peaking';
    }

    this.renderHUD();
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

  populateSourceDropdown() {
    const select = document.getElementById('sourceSelect');
    if (!select) return;
    select.innerHTML = '';

    const optgroups = {};

    AUDIO_SOURCES.forEach(track => {
      const category = track.category || 'Otros';
      if (!optgroups[category]) {
         optgroups[category] = document.createElement('optgroup');
         optgroups[category].label = category;
         select.appendChild(optgroups[category]);
      }
      const opt = document.createElement('option');
      opt.value = track.id;
      opt.textContent = track.displayName;
      optgroups[category].appendChild(opt);
    });

    const uploadOpt = document.createElement('option');
    uploadOpt.value = 'upload-custom';
    uploadOpt.textContent = '🎶 Cargar Archivo...';
    select.appendChild(uploadOpt);
    
    this.buildCustomDropdown();
  }

  buildCustomDropdown() {
    const select = document.getElementById('sourceSelect');
    const wrapper = document.getElementById('sourceDropdownWrapper');
    if (!select || !wrapper) return;

    // Clean up old custom dropdown if exists
    const oldHeader = wrapper.querySelector('.custom-select-header');
    const oldList = wrapper.querySelector('.custom-select-list');
    if (oldHeader) oldHeader.remove();
    if (oldList) oldList.remove();

    const header = document.createElement('div');
    header.className = 'custom-select-header';
    header.textContent = select.options[select.selectedIndex]?.textContent || 'Seleccionar...';
    
    const list = document.createElement('ul');
    list.className = 'custom-select-list';

    // Build the list from select's children
    Array.from(select.children).forEach(child => {
      if (child.tagName.toLowerCase() === 'optgroup') {
        const groupLabel = document.createElement('li');
        groupLabel.className = 'custom-optgroup';
        groupLabel.textContent = child.label;
        list.appendChild(groupLabel);
        
        Array.from(child.children).forEach(opt => {
          const li = document.createElement('li');
          li.className = 'custom-option';
          if (opt.selected) li.classList.add('selected');
          li.textContent = opt.textContent;
          li.dataset.value = opt.value;
          
          li.addEventListener('click', (e) => {
            e.stopPropagation();
            select.value = li.dataset.value;
            header.textContent = li.textContent;
            
            // Update selected class
            list.querySelectorAll('.custom-option').forEach(el => el.classList.remove('selected'));
            li.classList.add('selected');
            
            list.classList.remove('open');
            
            // Trigger change event on native select
            const event = new Event('change');
            select.dispatchEvent(event);
          });
          list.appendChild(li);
        });
      } else if (child.tagName.toLowerCase() === 'option') {
        const li = document.createElement('li');
        li.className = 'custom-option';
        if (child.selected) li.classList.add('selected');
        li.textContent = child.textContent;
        li.dataset.value = child.value;
        
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          select.value = li.dataset.value;
          header.textContent = li.textContent;
          
          list.querySelectorAll('.custom-option').forEach(el => el.classList.remove('selected'));
          li.classList.add('selected');
          
          list.classList.remove('open');
          
          const event = new Event('change');
          select.dispatchEvent(event);
        });
        list.appendChild(li);
      }
    });

    // Toggle dropdown
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      list.classList.toggle('open');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        list.classList.remove('open');
      }
    });

    wrapper.appendChild(header);
    wrapper.appendChild(list);
    
    // Listen for external changes to native select
    select.addEventListener('change', () => {
      header.textContent = select.options[select.selectedIndex]?.textContent || 'Seleccionar...';
      list.querySelectorAll('.custom-option').forEach(el => {
        if (el.dataset.value === select.value) {
          el.classList.add('selected');
        } else {
          el.classList.remove('selected');
        }
      });
    });
  }

  bindEvents() {
    // Audio Context Unlock / Play Button
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

    // Master Volume Slider
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        if (this.audio) {
          this.audio.setMasterVolume(parseFloat(e.target.value));
        }
      });
    }

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
            swapTargetBtn.disabled = true;
            swapTargetBtn.classList.add('disabled');
          }
        }
      });
    }

    // Phase 4 Reactive Sliders
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
      const isNoGain = filtersWithoutGain.includes((type || '').toLowerCase());
      if (gainInput) gainInput.disabled = isNoGain;
      const effectiveGain = isNoGain ? 0 : gain;

      const freqVal = document.getElementById('freqValue');
      const gainVal = document.getElementById('gainValue');
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
        // Note: visualizer renders continuously via requestAnimationFrame, no need to manually draw
        this.audio.setUserEQ(this.visualizer.interactiveNodes);
        this.hasInteracted = true;
        this.updateValidationState();
      }
    };

    if (freqInput) freqInput.addEventListener('input', updateFromManualInputs);
    if (gainInput) gainInput.addEventListener('input', updateFromManualInputs);
    if (qInput) qInput.addEventListener('input', updateFromManualInputs);
    if (typeSelect) typeSelect.addEventListener('change', updateFromManualInputs);

    const btnToggleRta = document.getElementById('btnToggleRta');
    const rtaModeLabel = document.getElementById('rtaModeLabel');
    if (btnToggleRta && rtaModeLabel) {
      btnToggleRta.addEventListener('click', () => {
        if (!this.visualizer) return;
        if (this.visualizer.rtaMode === 'smooth') {
           this.visualizer.rtaMode = 'raw';
           rtaModeLabel.textContent = 'RAW';
           rtaModeLabel.style.color = '#f43f5e';
        } else {
           this.visualizer.rtaMode = 'smooth';
           rtaModeLabel.textContent = 'SMOOTH';
           rtaModeLabel.style.color = '#38bdf8';
        }
      });
    }

    const btnToggleZoom = document.getElementById('btnToggleZoom');
    const zoomModeLabel = document.getElementById('zoomModeLabel');
    if (btnToggleZoom && zoomModeLabel) {
      btnToggleZoom.addEventListener('click', () => {
        if (!this.visualizer) return;
        
        // Cycle between 60 dB, 30 dB, and 18 dB
        if (!this.visualizer.rtaRange || this.visualizer.rtaRange === 60) {
          this.visualizer.rtaRange = 30;
          zoomModeLabel.textContent = '30 dB';
          zoomModeLabel.style.color = '#a855f7'; // Purple
        } else if (this.visualizer.rtaRange === 30) {
          this.visualizer.rtaRange = 18;
          zoomModeLabel.textContent = '18 dB';
          zoomModeLabel.style.color = '#f59e0b'; // Amber / Surgical
        } else {
          this.visualizer.rtaRange = 60;
          zoomModeLabel.textContent = '60 dB';
          zoomModeLabel.style.color = '#c084fc'; // Default
        }
      });
    }

    // SoundGym Style EQ Off / EQ On / Mi Respuesta Toggle Buttons
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

    if (btnC) {
      btnC.addEventListener('click', () => {
        this.audio.setRoute('C');
        this.updateABButtons('C');
      });
    }

    // Submit Guess Button (Normal / Hard Mode)
    const submitBtn = document.getElementById('submitGuessBtn');
      if (submitBtn) {
        submitBtn.addEventListener('click', () => {
          try {
            const isModeEasy = this.trainer.difficulty === 'easy';
            if (!isModeEasy && !this.hasInteracted) {
              console.warn("Submit aborted: Missing interaction.");
              return;
            }
          
            // Pausar el sonido al proponer la respuesta
            if (this.audio && this.audio.isPlaying) {
              this.audio.stopSource();
              this.updatePlayButton();
            }

          const userGuessesArray = this.visualizer.interactiveNodes.map(node => ({
              frequencyHz: node.frequencyHz,
              gainDb: node.gainDb,
              qFactor: node.qFactor,
              type: node.type
          }));

          const result = this.trainer.evaluateManualGuess(userGuessesArray);
          if (!result) throw new Error("evaluateManualGuess returned null/undefined!");
          this.showPedagogicalReview(result);
        } catch (e) {
          console.error(e);
          alert('CRASH EN SUBMIT: ' + e.message);
        }
      });
    }

    const transportScrub = document.getElementById('transportScrub');
    if (transportScrub) {
      transportScrub.addEventListener('mousedown', () => {
        if (this.visualizer) this.visualizer.isScrubbing = true;
      });
      transportScrub.addEventListener('mouseup', () => {
        if (this.visualizer) this.visualizer.isScrubbing = false;
      });
      transportScrub.addEventListener('input', (e) => {
          const pct = parseFloat(e.target.value);
          if (this.audio) this.audio.scrubTo(pct);
      });
    }

    const fileInput = document.getElementById('fileInput');
    const sourceSelect = document.getElementById('sourceSelect');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const url = URL.createObjectURL(file);
          if (sourceSelect) {
             const opt = document.createElement('option');
             opt.value = url;
             opt.text = file.name;
             sourceSelect.add(opt);
             sourceSelect.value = url;
          }
          if (this.gameLoop && this.gameLoop.store) {
             this.gameLoop.store.activeTrackId = url;
             this.updateTrainerAcousticClass(url);
          }
          this.audio.loadTrack(url, url).then(() => {
            this.checkAndRenderMixer(url);
          });
        }
      });
    }

    if (sourceSelect) {
      sourceSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom' || e.target.value === 'upload-custom') {
          if (fileInput) fileInput.click();
        } else if (e.target.value) {
          if (this.gameLoop && this.gameLoop.store) {
             this.gameLoop.store.activeTrackId = e.target.value;
             this.updateTrainerAcousticClass(e.target.value);
          }
          this.audio.loadTrack(e.target.value).then(() => {
            this.checkAndRenderMixer(e.target.value);
          });
        }
      });
    }

    const pBtnListenTarget = document.getElementById('pBtnListenTarget');
    const pBtnListenGuess = document.getElementById('pBtnListenGuess');
    const pBtnListenFlat = document.getElementById('pBtnListenFlat');
    
    if (pBtnListenTarget) {
      pBtnListenTarget.addEventListener('click', () => {
        this.audio.setRoute('B'); // B = Target EQ
        this.updateABButtons('B');
        this.hasListenedA = true;
      });
    }
    if (pBtnListenGuess) {
      pBtnListenGuess.addEventListener('click', () => {
        this.audio.setRoute('C'); // C = User Guess
        this.updateABButtons('C');
        this.hasListenedB = true;
      });
    }
    if (pBtnListenFlat) {
      pBtnListenFlat.addEventListener('click', () => {
         this.audio.setRoute('A'); // A = Clean / Flat
         this.updateABButtons('A');
      });
    }

    const bannerNextBtn = document.getElementById('bannerNextBtn');
    if (bannerNextBtn) {
      bannerNextBtn.addEventListener('click', () => {
        const resultsSection = document.getElementById('resultsDockSection');
        if (resultsSection) resultsSection.classList.add('hidden');
        if (this.visualizer) {
          this.visualizer.showTargetCurve = false;
          this.visualizer.showUserCurve = false;
        }

        this.gameLoop.nextTrial();
        this.trainer.stage = this.gameLoop.store.currentStage;
        this.trainer.startNewTrial();
        this.renderQuizInterface();
      });
    }

    const restartGameBtn = document.getElementById('restartGameBtn');
    if (restartGameBtn) {
      restartGameBtn.addEventListener('click', () => {
        this.gameLoop.reset();
      });
    }
  }

  updateTrainerAcousticClass(trackId) {
    if (!this.trainer) return;
    this.trainer.currentAcousticClass = 'generic';
    this.trainer.isSyntheticMode = false;
    
    const source = AUDIO_SOURCES.find(s => s.id === trackId);
    if (source) {
      if (source.acousticClass) this.trainer.currentAcousticClass = source.acousticClass;
      if (source.isSynthetic) this.trainer.isSyntheticMode = true;
      return;
    }
    
    const session = MULTITRACK_SESSIONS.find(s => s.id === trackId);
    if (session) {
      const targetStemId = session.targetStem;
      if (targetStemId) {
        const stem = session.stems.find(st => st.id === targetStemId);
        if (stem && stem.acousticClass) {
           this.trainer.currentAcousticClass = stem.acousticClass;
        }
      }
      return;
    }
  }

  hideStemMixer() {
    const panel = document.getElementById('stemMixerPanel');
    if (panel) panel.classList.add('hidden');
  }

  checkAndRenderMixer(trackId) {
    const mtSession = MULTITRACK_SESSIONS.find(s => s.id === trackId);
    if (mtSession) {
      this.renderStemMixer(mtSession);
    } else {
      this.hideStemMixer();
    }
  }

  renderStemMixer(mtSession) {
    const panel = document.getElementById('stemMixerPanel');
    const tracksContainer = document.getElementById('stemMixerTracks');
    const title = document.getElementById('stemMixerTitle');
      
    if (!panel || !tracksContainer || !title) return;
    
    panel.classList.remove('hidden');
    title.textContent = mtSession.name || 'Multitrack Session';
    tracksContainer.innerHTML = '';

    mtSession.stems.forEach((stem) => {
      const trackDiv = document.createElement('div');
      trackDiv.className = 'stem-track flex flex-col gap-2 p-2 bg-slate-800 rounded';

      const label = document.createElement('span');
      label.className = 'text-xs text-slate-400 font-bold';
      label.textContent = stem.displayName || stem.name;
      trackDiv.appendChild(label);

      const controlsRow = document.createElement('div');
      controlsRow.className = 'flex items-center gap-2';
      
      const muteBtn = document.createElement('button');
      const isInitiallyMuted = this.audio.stemStates && this.audio.stemStates[stem.id] ? this.audio.stemStates[stem.id].muted : false;
      muteBtn.className = `btn btn-sm btn-mute ${isInitiallyMuted ? 'active' : ''}`;
      muteBtn.textContent = 'M';
      
      const soloBtn = document.createElement('button');
      const isInitiallySolo = this.audio.stemStates && this.audio.stemStates[stem.id] ? this.audio.stemStates[stem.id].solo : false;
      soloBtn.className = `btn btn-sm btn-solo ${isInitiallySolo ? 'active' : ''}`;
      soloBtn.textContent = 'S';

      muteBtn.addEventListener('click', () => {
        this.audio.setStemState(stem.id, 'mute');
        const isMuted = this.audio.stemStates[stem.id].muted;
        muteBtn.className = `btn btn-sm btn-mute ${isMuted ? 'active' : ''}`;
        const isSolo = this.audio.stemStates[stem.id].solo;
        soloBtn.className = `btn btn-sm btn-solo ${isSolo ? 'active' : ''}`;
      });
      controlsRow.appendChild(muteBtn);

      soloBtn.addEventListener('click', () => {
        this.audio.setStemState(stem.id, 'solo');
        const isSolo = this.audio.stemStates[stem.id].solo;
        soloBtn.className = `btn btn-sm btn-solo ${isSolo ? 'active' : ''}`;
        const isMuted = this.audio.stemStates[stem.id].muted;
        muteBtn.className = `btn btn-sm btn-mute ${isMuted ? 'active' : ''}`;
      });
      controlsRow.appendChild(soloBtn);

      const volSlider = document.createElement('input');
      volSlider.type = 'range';
      volSlider.min = '0';
      volSlider.max = '1';
      volSlider.step = '0.01';
      volSlider.value = (this.audio.stemStates && this.audio.stemStates[stem.id] && this.audio.stemStates[stem.id].volume !== undefined) ? this.audio.stemStates[stem.id].volume : '1';
      volSlider.className = 'flex-1';
      volSlider.addEventListener('input', (e) => {
        const vol = parseFloat(e.target.value);
        this.audio.setStemVolume(stem.id, vol);
      });
      controlsRow.appendChild(volSlider);

      trackDiv.appendChild(controlsRow);
      tracksContainer.appendChild(trackDiv);
    });
  }

  updateValidationState() {
    const hintText = document.getElementById('auditionHintText');
    const hintBar = document.getElementById('auditionStatusHint');
    const submitBtn = document.getElementById('submitGuessBtn');

    const isModeEasy = this.trainer.difficulty === 'easy';
    const isValid = isModeEasy ? true : this.hasInteracted;

    if (hintBar && hintText) {
      if (!isModeEasy && !this.hasInteracted) {
        hintText.textContent = 'Ajusta los controles o arrastra el punto para proponer tu respuesta.';
        hintBar.classList.remove('ready');
      } else {
        hintText.textContent = '¡Listo! Puedes enviar tu respuesta.';
        hintBar.classList.add('ready');
      }
    }

    if (submitBtn) {
      submitBtn.disabled = !isValid;
      if (isValid) {
        submitBtn.classList.remove('btn-disabled');
      } else {
        submitBtn.classList.add('btn-disabled');
      }
    }

    if (isModeEasy) {
      document.querySelectorAll('.btn-select-guess').forEach(btn => {
          btn.disabled = false;
          btn.classList.remove('btn-disabled');
      });
    }
  }

  updateABButtons(activeRoute) {
    const btnA = document.getElementById('btnRouteA');
    const btnB = document.getElementById('btnRouteB');
    const btnC = document.getElementById('btnRouteC');
    const pTarget = document.getElementById('pBtnListenTarget');
    const pGuess = document.getElementById('pBtnListenGuess');
    const pFlat = document.getElementById('pBtnListenFlat');

    [btnA, btnB, btnC].forEach(btn => {
      if (btn) btn.classList.remove('active-off', 'active-on', 'active-guess', 'active-audition');
    });

    [pTarget, pGuess, pFlat].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (activeRoute === 'A') {
      if (btnA) btnA.classList.add('active-off');
      if (pFlat) pFlat.classList.add('active');
    } else if (activeRoute === 'B') {
      if (btnB) btnB.classList.add('active-on');
      if (pTarget) pTarget.classList.add('active');
    } else if (activeRoute === 'C') {
      if (btnC) btnC.classList.add('active-guess');
      if (pGuess) pGuess.classList.add('active');
    } else if (activeRoute === 'AUDITION' && btnB) {
      if (btnB) btnB.classList.add('active-on');
    }
  }


  renderHUD(store = this.gameLoop ? this.gameLoop.store : null) {
    if (!store) return;
    const scoreEl = document.getElementById('soundgymScore');
    const stageEl = document.getElementById('soundgymStage');
    const rankEl = document.getElementById('soundgymRank');
    if (scoreEl) scoreEl.textContent = store.score;
    if (stageEl) stageEl.textContent = (store.currentStage || 1) + '/' + (store.maxStages || 5);
    if (rankEl) {
      if (store.score >= 4000) { rankEl.textContent = 'Pro'; rankEl.style.color = '#e11d48'; }
      else if (store.score >= 2000) { rankEl.textContent = 'Ingeniero'; rankEl.style.color = '#a855f7'; }
      else { rankEl.textContent = 'Tiracables'; rankEl.style.color = '#38bdf8'; }
    }
  }
  renderQuizInterface() {
    const targets = this.trainer.targetFilters;
    if (!targets || targets.length === 0) return;

    this.activeAuditionIndex = -1;

    this.hasListenedA = this.audio.isPlaying;
    this.hasListenedB = false;
    this.hasInteracted = false;

    // Always hide results section, false friends card & pro analysis card when starting a new quiz trial
    const resultsSection = document.getElementById('resultsDockSection');
    if (resultsSection) {
      resultsSection.classList.add('hidden');
      resultsSection.classList.remove('pro-mode-active');
    }
    const falseFriendsCard = document.getElementById('falseFriendsCard');
    if (falseFriendsCard) falseFriendsCard.classList.add('hidden');
    const proAnalysisCard = document.getElementById('proAnalysisCard');
    if (proAnalysisCard) proAnalysisCard.classList.add('hidden');
    
    // Show top bar EQ toggles
    const eqToggleGroup = document.querySelector('.eq-toggle-group');
    if (eqToggleGroup) eqToggleGroup.classList.remove('hidden');

    this.audio.setTargetEQ(targets);
    this.audio.setRoute('A');
    this.updateABButtons('A');

    const isBoss = this.trainer.isBossStage;
    
    // Boss Mode UI Update
    const stageValEl = document.getElementById('soundgymStage');
    if (stageValEl) {
        if (isBoss) {
            stageValEl.innerHTML = `⚠️ <span class="text-danger" style="animation: pulse 1s infinite">BOSS FIGHT</span>`;
        } else {
            stageValEl.innerHTML = `${this.trainer.stage}/${this.trainer.maxStages}`;
        }
    }

    if (this.visualizer) {
      this.visualizer.didacticTargets = targets.map(t => ({ ...t }));
      this.visualizer.showTargetCurve = false;
      this.visualizer.showUserCurve = false;
      this.visualizer.didacticUsers = [];
      
      // Setup interactive nodes based on target length (Boss mode: 500Hz & 2000Hz to avoid overlapping; Normal mode: 1000Hz)
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

      if (hardControlsGroup) hardControlsGroup.style.display = 'flex';
      if (isBoss) this.setActiveBand(0);
    } else {
      // PRO / HARD Mode: Show interactive node handle + sliders + live filter curve response
      if (easyContainer) easyContainer.classList.add('hidden');
      if (manualContainer) manualContainer.classList.remove('hidden');
      if (btnRouteC) btnRouteC.classList.remove('hidden');
      if (bandSelector) bandSelector.classList.toggle('hidden', !isBoss);

      if (this.visualizer) {
        this.visualizer.showUserCurve = true;
        this.visualizer.showNodeHandle = true;
      }

      if (hardControlsGroup) hardControlsGroup.style.display = 'flex';
      if (isBoss) this.setActiveBand(0);
    }

    this.updateValidationState();
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
          <button class="btn btn-primary btn-select-guess" data-idx="${idx}">
            ✨ Elegir
          </button>
        </div>
      `;

      card.querySelector('.btn-audition').addEventListener('click', () => {
        this.activeAuditionIndex = idx;
        const optTarget = option.target;
        this.audio.setUserEQ(optTarget.frequencyHz, optTarget.gainDb, optTarget.qFactor, optTarget.type);
        this.audio.setRoute('AUDITION');
        this.updateABButtons('AUDITION');
        this.renderEasyOptions();
      });

      card.querySelector('.btn-select-guess').addEventListener('click', () => {
        const result = this.trainer.evaluateEasyGuess(idx);
        this.showPedagogicalReview(result);
      });

      grid.appendChild(card);
    });
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
   * Renders pedagogical results inside Fila 3 Bottom Dock while KEEPING live audio RTA spectrum running!
   */
  showPedagogicalReview(result) {
    this.updatePlayButton();

    this.audio.setRoute('B');
    this.updateABButtons('B');

    const easyContainer = document.getElementById('easyModeSection');
    const manualContainer = document.getElementById('manualModeSection');
    if (easyContainer) easyContainer.classList.add('hidden');
    if (manualContainer) manualContainer.classList.add('hidden');

    const resultsSection = document.getElementById('resultsDockSection');
    if (resultsSection) resultsSection.classList.remove('hidden');

    // Hide top bar EQ toggles to avoid confusion with result listen buttons
    const eqToggleGroup = document.querySelector('.eq-toggle-group');
    if (eqToggleGroup) eqToggleGroup.classList.add('hidden');

    const targets = this.trainer.targetFilters || [];

    // Set Target EQ Filter parameters with exact target type!
    this.audio.setTargetEQ(targets);

    if (this.visualizer) {
      this.visualizer.showTargetCurve = true;
      this.visualizer.didacticTargets = targets.map(t => ({ ...t }));
    }

    if (result.bandResults && result.bandResults.length > 0) {
        // Collect user guesses from band results
        const userGuesses = result.bandResults.map(br => br.guess);
        this.audio.setUserEQ(userGuesses);

        if (this.visualizer) {
            this.visualizer.didacticUsers = userGuesses.map(g => ({ ...g }));
            // Only show user curve if not perfectly exact
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
        const targetTypeLower = (target.type || '').toLowerCase();
        const isTargetNoGain = filtersWithoutGain.includes(targetTypeLower);
        const targetGainStr = isTargetNoGain ? '' : ` (${target.gainDb > 0 ? '+' : ''}${target.gainDb.toFixed(1)} dB)`;

        const targetTypeStr = this.formatFilterTypeName(target.type);
        subtitleText = `Objetivo: ${targetTypeStr} ${Math.round(target.frequencyHz)} Hz${targetGainStr}`;

        if (this.trainer.difficulty === 'hard') {
          if (result.isTypeCorrect) {
            subtitleText += ` <span style="color:#10b981; font-weight:bold; margin-left:8px;">\u2728 Filtro Acertado! (+100 PTS)</span>`;
          } else if (result.userType) {
            subtitleText += ` <span style="color:#f43f5e; font-weight:bold; margin-left:8px;">\u274C Filtro Incorrecto (${this.formatFilterTypeName(result.userType)})</span>`;
          }
        }
    }

    if (subtitle) subtitle.innerHTML = subtitleText;

    if (icon && title) {
        if (result.isPolarityFlipped) {
          icon.textContent = '\u26A0\uFE0F';
          title.textContent = cleanLabel || 'Ganancia Opuesta';
          title.className = 'results-title warning';
        } else if (result.isCorrect) {
          icon.textContent = '\u2728';
          title.textContent = cleanLabel || 'Excelente!';
          title.className = 'results-title success';
        } else {
          icon.textContent = '\u274C';
          title.textContent = cleanLabel || 'Revisión Didáctica';
          title.className = 'results-title failure';
        }
      }

      // Update UI Stats Elements
      const statPoints = document.getElementById('pStatPoints');
      const statScore = document.getElementById('pStatScore');
      const statFreqErr = document.getElementById('pStatFreqError');
      const statGainErr = document.getElementById('pStatGainError');

      if (statPoints) {
          statPoints.textContent = `+${(result.pointsAwarded || 0).toLocaleString()}`;
          statPoints.className = (result.pointsAwarded > 0) ? 'stat-value text-amber' : 'stat-value text-gray';
      }
      if (statScore) {
          statScore.textContent = `${result.scorePercentage || 0}%`;
          statScore.className = (result.scorePercentage >= 80) ? 'stat-value text-cyan' : ((result.scorePercentage >= 40) ? 'stat-value text-amber' : 'stat-value text-danger');
      }
      if (statFreqErr) {
          statFreqErr.textContent = `${(result.octaveDistance || 0).toFixed(2)} oct`;
      }
      if (statGainErr) {
          statGainErr.textContent = `${(result.gainErrorDb || 0).toFixed(1)} dB`;
      }

    // Evaluate game loop trial outcome
    this.lastGameOutcome = this.gameLoop ? this.gameLoop.evaluateTrialOutcome(result.scorePercentage, result.pointsAwarded || 0) : null;
    const gameOutcome = this.lastGameOutcome;

    // Show Level Up / Game Over modals
    if (gameOutcome) {
      if (gameOutcome.isLevelUp) {
        this.showLevelUpModal(gameOutcome);
      } else if (gameOutcome.isGameOver) {
        if (gameOutcome.isBossDefeated) {
          this.showBossDefeatModal(gameOutcome);
        } else {
          this.showGameOverModal(gameOutcome);
        }
      }
    }

    const guess = result.bandResults ? result.bandResults[0]?.guess : null;
    const audioContextStr = this.audio ? (this.audio.currentTrackId || this.audio.currentBufferName || "") : "";

    // False Friends Analysis
    const falseFriendsCard = document.getElementById('falseFriendsCard');
    const falseFriendsMsg = document.getElementById('falseFriendsMessage');
    const falseFriendsFeedback = checkFilterFalseFriends(target, guess);
    
    if (falseFriendsCard && falseFriendsMsg) {
      if (falseFriendsFeedback) {
        falseFriendsMsg.textContent = falseFriendsFeedback;
        falseFriendsCard.classList.remove('hidden');
      } else {
        falseFriendsCard.classList.add('hidden');
      }
    }

    // Acoustic Context / General Feedback
    const acousticContextCard = document.getElementById('acousticContextCard');
    const acousticContextMsg = document.getElementById('acousticContextMessage');
    let pedagogicalContext = guess ? ScoringEngine.getPedagogicalFeedback(audioContextStr, guess.frequencyHz, guess.gainDb) : null;
    
    if (acousticContextCard && acousticContextMsg) {
       if (pedagogicalContext && pedagogicalContext.text) {
           acousticContextMsg.textContent = pedagogicalContext.text;
           acousticContextCard.classList.remove('hidden');
       } else if (result.feedbackMessage) {
           acousticContextMsg.textContent = result.feedbackMessage;
           acousticContextCard.classList.remove('hidden');
       } else {
           acousticContextCard.classList.add('hidden');
       }
    }

    // Pro Mode Analysis
    const proCard = document.getElementById('proAnalysisCard');
    const proTerminal = document.getElementById('proAnalysisTerminal');
    const isProMode = this.trainer.difficulty === 'pro' || this.trainer.difficulty === 'hard';

    if (isProMode && proCard && proTerminal) {
      if (resultsSection) resultsSection.classList.add('pro-mode-active');
      const proAnalysis = analyzeProPractices(target, guess, audioContextStr);
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

    const ctx = canvas.getContext('2d');
    const particles = [];
    const colors = ['#f59e0b', '#38bdf8', '#10b981', '#ec4899', '#8b5cf6'];

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.7) * 18,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1.0,
        gravity: 0.25,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.2
      });
    }

    let startTime = null;
    function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let activeParticles = 0;
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.alpha -= 0.012;
        p.rotation += p.vRot;

        if (p.alpha > 0) {
          activeParticles++;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
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
    console.log(`[RPG Progression] Level ${currentLevel} features unlocked.`);
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
    toast.innerHTML = `<strong>🔓 ¡Nivel ${currentLevel} Desbloqueado!</strong><br><span style="color:#38bdf8">${this.trainer.getRankTitle()}</span>`;
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
    const modal = document.getElementById('levelUpModal') ? document.getElementById('bossDefeatModal') : null;
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

    if (finalScorePoints) finalScorePoints.textContent = this.trainer.scorePoints.toLocaleString();
    if (finalStreak) finalStreak.textContent = this.trainer.streak;
    if (finalScore) {
      const avg = this.trainer.totalTrials > 0 ? Math.round(this.trainer.totalScoreSum / this.trainer.totalTrials) : 0;
      finalScore.textContent = `${avg}%`;
    }
    modal.classList.add('active');
  }


  async loadSelectedSource() {
    const select = document.getElementById('sourceSelect');
    if (select) {
      if (this.gameLoop && this.gameLoop.store) {
          this.gameLoop.store.activeTrackId = select.value;
          this.updateTrainerAcousticClass(select.value);
      }
      await this.audio.loadTrack(select.value);
      this.checkAndRenderMixer(select.value);
    }
  }

  updatePlayButton() {
    const btn = document.getElementById('playBtn');
    if (!btn) return;
    if (this.audio.isPlaying) {
      btn.innerHTML = '<span>\u23F8</span> Pausar';
      btn.classList.add('pulse-glow');
    } else {
      btn.innerHTML = '<span>\u25B6</span> Play';
      btn.classList.remove('pulse-glow');
    }
  }
}


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
