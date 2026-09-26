/**
 * @file App.js
 * @description Main application controller integrating AudioEngine, Visualizer, and TrainingManager.
 * Manages CSS Grid workspace layout, onboarding overlay, mode switching, draggable Canvas node handle in Pro mode, and Fila 3 integrated pedagogical results.
 */

import { AudioEngine } from './AudioEngine.js?v=18';
import { Visualizer } from './Visualizer.js?v=18';
import { Visualizer } from './Visualizer.js?v=20';
import { GameLoopManager, GAME_STATES } from './GameLoopManager.js?v=18';
import { AUDIO_SOURCES, MULTITRACK_SESSIONS } from './AudioResourceManager.js?v=21';
import { TrainingManager } from './TrainingManager.js?v=21';
import { ScoringEngine, checkFilterFalseFriends, analyzeProPractices } from './ScoringEngine.js?v=21';

export class App {
    this.visualizer = null;

    // Track state for user interaction validation
    this.hasListenedA = false;
    this.hasListenedB = false;
    this.hasInteracted = false;
    this.activeAuditionIndex = -1;

    // Target Swap Lifelines
    this.targetSwapsRemaining = 3;

    // Local track catalog for built-in audio selection
    this.trackCatalog = [
      { id: 'pink-noise', name: 'Pink Noise (Sintetizado)', path: null },
      { id: 'white-noise', name: 'White Noise (Sintetizado)', path: null },
      { id: 'sine-sweep', name: 'Sine Sweep (20Hz - 20kHz)', path: null },
      { id: 'acoustic-guitar', name: 'Acoustic Guitar Strum', path: './Audio Tracks/Acoustic Guitar Strum.mp3' },
      { id: 'electric-bass', name: 'Electric Bass Groove', path: './Audio Tracks/Electric Bass Groove.mp3' },
      { id: 'full-mix-rock', name: 'Full Mix Rock Track', path: './Audio Tracks/Full Mix Rock Track.mp3' },
      { id: 'vocal-stem', name: 'Vocal Stem Lead', path: './Audio Tracks/Vocal Stem Lead.mp3' },
      { id: 'pop-drums-loop', name: 'Pop Drums Loop', path: './Audio Tracks/Pop Drums Loop.mp3' }
    ];
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
        // Phase 4: Dispatch state update & update AudioEngine smoothly
        this.gameLoop.setUserGuess(nodesArray);
        this.audio.updateUserEQ(nodesArray);
        this.hasInteracted = true;
        this.updateValidationState();
      };
    };

    // Start with onboarding welcome screen
    this.setAppState('WELCOME');
  }

  /**
    // Audio Engine State Change Handler
    this.audio.onStateChange = (state) => {
      if (state.isPlaying !== undefined) {
        this.updatePlayButton();
      }
    };

    // Multitrack Session Loaded Handler
    this.audio.onMultitrackLoaded = (mtSession) => {
      this.renderStemMixer(mtSession);
    };

    // Start with onboarding welcome screen
    const screenDifficultySelect = document.getElementById('screenDifficultySelect');

    [screenWelcome, screenModuleSelect, screenDifficultySelect].forEach(s => {
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
  /**
   * Phase 4: Dynamically generates track selector dropdown mapping AUDIO_SOURCES with <optgroup>.
   */
    const allCategories = Array.from(new Set(AUDIO_SOURCES.map(t => t.category)));
    const mtIndex = allCategories.indexOf('Sesiones Multitrack');
    if (mtIndex !== -1) {
      allCategories.splice(mtIndex, 1);
      allCategories.unshift('Sesiones Multitrack');
    }
    const categories = allCategories;

    categories.forEach(catName => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = catName;

      const tracks = AUDIO_SOURCES.filter(t => t.category === catName);
      tracks.forEach(track => {
        const opt = document.createElement('option');
        opt.value = track.id;
        opt.textContent = track.displayName.replace(/^[^\w\s]+/, '').trim(); // Remove emojis from display name if any
        optgroup.appendChild(opt);
        const opt = document.createElement('option');
        opt.value = track.id;
        opt.textContent = track.displayName;
        optgroup.appendChild(opt);
      });

      select.appendChild(optgroup);
    });

    const uploadGroup = document.createElement('optgroup');
    uploadGroup.label = "Archivos del Usuario";
    const uploadOpt = document.createElement('option');
    uploadOpt.value = 'upload-custom';
    uploadOpt.textContent = '📁 Cargar Archivo OGG / MP3...';
    uploadGroup.appendChild(uploadOpt);
  /**
   * Hide the Stem Mixer Panel
   */
  hideStemMixer() {
    const panel = document.getElementById('stemMixerPanel');
    if (panel) panel.classList.add('hidden');
  }

  /**
   * Render the Stem Mixer Panel for a loaded Multitrack Session
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
      
      trackDiv.innerHTML = `
        <div class="stem-header">
          <div class="stem-name">
            ${stem.id === mtSession.targetStem ? '<span class="target-badge" style="background:transparent; padding:0; font-size:1.1rem; margin-right:4px;">🎯</span>' : ''}
            <span class="stem-title">${stem.displayName.replace(/^[^\w\s]+/, '').trim().split(' ')[0]}</span>
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
        if (state.volume !== undefined) {
           volSlider.value = state.volume;
           volSlider.style.setProperty('--val', `${state.volume * 100}%`);
        }
      } else {
        volSlider.style.setProperty('--val', `100%`);
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
        e.target.style.setProperty('--val', `${val * 100}%`);
        this.audio.setStemVolume(stem.id, val);
      });
      
      tracksContainer.appendChild(trackDiv);
    });
    
    panel.classList.remove('hidden');
  }
    
    panel.classList.remove('hidden');
  }

  /**
   * Controls onboarding overlay workflow visibility.
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

    this.updateHUD();
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

    this.trackCatalog.forEach(track => {
      const opt = document.createElement('option');
      opt.value = track.id;
      opt.textContent = track.name;
      select.appendChild(opt);
    });

    const uploadOpt = document.createElement('option');
    uploadOpt.value = 'upload-custom';
    uploadOpt.textContent = '📁 Cargar Archivo...';
    select.appendChild(uploadOpt);
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
  async loadSelectedSource() {
    const select = document.getElementById('sourceSelect');
    if (select) {
      this.gameLoop.store.activeTrackId = select.value;
      await this.audio.loadTrack(select.value);
    }
  }

  bindEvents() {
    // Play Button

    // Play Button
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
            swapTargetBtn.classList.add('btn-disabled');
          }

          this.trainer.startNewTrial();
          this.updateHUD();
          this.renderQuizInterface();
        }
      });
    }

    // Source Selector Change
    const sourceSelect = document.getElementById('sourceSelect');
    if (sourceSelect) {
      sourceSelect.addEventListener('change', async (e) => {
        if (e.target.value === 'upload-custom') {
          const fileInput = document.getElementById('fileInput');
          if (fileInput) fileInput.click();
        } else {
          this.audio.currentBufferName = e.target.value;
          const track = this.trackCatalog.find(t => t.id === e.target.value);
          if (track && track.path && !this.audio.audioBufferMap.has(track.id)) {
            await this.audio.loadTrackFromUrl(track.path, track.id);
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
        }
      });
    }
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = `🎵 ${file.name}`;
          if (sourceSelect) {
            sourceSelect.insertBefore(opt, sourceSelect.firstChild);
            sourceSelect.value = key;
          }
        }
      });
    }

    // Master Volume Slider
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        this.audio.setMasterVolume(parseFloat(e.target.value));
      });
    }

    // Single unified delegate event listener for Mode Buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mode = btn.getAttribute('data-mode') || btn.dataset.mode;
        if (mode) {
          this.setMode(mode);
        }
      });
    });

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

    // Manual Slider Inputs (Normal & Hard Mode)
    const freqInput = document.getElementById('freqInput');
    const gainInput = document.getElementById('gainInput');
    const qInput = document.getElementById('qInput');
    const typeSelect = document.getElementById('typeSelect');
    if (btnC) {
      btnC.addEventListener('click', () => {
        this.audio.setRoute('C');
        this.updateABButtons('C');
      });
    }
    // RTA Mode Toggles
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
    }
      const type = typeSelect.value;

      const filtersWithoutGain = ['notch', 'highpass', 'lowpass', 'hp', 'lp'];
      const isNoGain = filtersWithoutGain.includes((type || '').toLowerCase());
      gainInput.disabled = isNoGain;
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
      }

      if (e && e.isTrusted) {
        this.hasInteracted = true;
        this.updateValidationState();
      }

      if (this.trainer.difficulty !== 'easy') {
        this.audio.setUserEQ(this.visualizer.interactiveNodes);
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
      if (this.trainer.difficulty !== 'easy') {
        this.gameLoop.setUserGuess(this.visualizer.interactiveNodes);
        this.audio.updateUserEQ(this.visualizer.interactiveNodes);
        if (this.trainer.difficulty === 'normal' && this.visualizer) {
            if (this.visualizer && this.visualizer.onBandSelected) {
                this.visualizer.onBandSelected(index);
            }
        });
    });

    // [DEV BACKDOOR] Press 'B' to jump to Boss Mode
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyB' && e.target.tagName !== 'INPUT') {
        if (this.trainer) {
          this.trainer.stage = this.trainer.maxStages;
          this.trainer.startNewTrial();
          this.updateHUD();
          this.renderQuizInterface();
          console.log("🔥 DEV CHEAT: Saltando al Boss Mode (Stage 5) 🔥");
        }
      }
    });

    // Submit Guess Button (Normal / Hard Mode)
    const submitBtn = document.getElementById('submitGuessBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        try {
          if (!this.hasListenedA || !this.hasListenedB || !this.hasInteracted) {
            console.warn("Submit aborted: Missing interaction.", { listenedA: this.hasListenedA, listenedB: this.hasListenedB, interacted: this.hasInteracted });
            return;
          }
          
          // Pass the entire array of user guesses
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
          alert('CRASH EN SUBMIT: ' + e.message + '\n\n' + e.stack.substring(0, 300));
        }
      });
    }

    // Componente de Resultados: Botón Siguiente Ensayo en Fila 3
    const bannerNextBtn = document.getElementById('bannerNextBtn');
    if (bannerNextBtn) {
      bannerNextBtn.addEventListener('click', () => {
        const resultsSection = document.getElementById('resultsDockSection');
        if (resultsSection) resultsSection.classList.add('hidden');
        if (this.visualizer) {
          this.visualizer.showTargetCurve = false;
          this.visualizer.showUserCurve = false;
        }

        if (this.trainer.isGameOver) {
          this.audio.stopSource();
          this.updatePlayButton();
          this.showGameOverModal();
        } else {
        if (this.gameLoop.store.lives <= 0) {
          this.audio.stopSource();
          this.updatePlayButton();
          this.showGameOverModal();
        } else {
          const bossOutcome = (this.lastGameOutcome && this.lastGameOutcome.isBoss) ? this.lastGameOutcome : null;
          if (bossOutcome) {
            if (bossOutcome.victory) {
              this.triggerLevelUpAnimation();
              this.unlockLevelFeatures(this.gameLoop.store.currentLevel);
              this.showLevelUpModal(bossOutcome);
            } else {
              this.showDefeatMessage(bossOutcome.message || "Has fallado la mezcla del cliente. Vuelve a afinar tu oído y reinténtalo.");
            }
          }
          this.gameLoop.nextTrial();
          this.trainer.stage = this.gameLoop.store.currentStage;
          this.trainer.startNewTrial();
          this.renderQuizInterface();
        }

    // Modal Action Buttons
    const btnContinueLevelUp = document.getElementById('btnContinueLevelUp');
    if (btnContinueLevelUp) {
      btnContinueLevelUp.addEventListener('click', () => {
        const modal = document.getElementById('levelUpModal');
        if (modal) modal.classList.remove('active');
      });
    }

    const btnRetryBoss = document.getElementById('btnRetryBoss');
    if (btnRetryBoss) {
      btnRetryBoss.addEventListener('click', () => {
        const modal = document.getElementById('bossDefeatModal');
        if (modal) modal.classList.remove('active');
      });
    }

    // Componente de Resultados: Botones de Audición Hardware
    const pBtnListenTarget = document.getElementById('pBtnListenTarget');
    if (pBtnListenTarget) {
      pBtnListenTarget.addEventListener('click', async () => {
        if (!this.audio.ctx) await this.audio.init();
        this.audio.setRoute('B');
        this.updateABButtons('B');
        if (!this.audio.isPlaying) this.audio.play();
        this.updatePlayButton();
      });
    }

    const pBtnListenGuess = document.getElementById('pBtnListenGuess');
    if (pBtnListenGuess) {
      pBtnListenGuess.addEventListener('click', async () => {
        if (!this.audio.ctx) await this.audio.init();
        this.audio.setRoute('C');
        this.updateABButtons('C');
        if (!this.audio.isPlaying) this.audio.play();
        this.updatePlayButton();
      });
    }

    const pBtnListenFlat = document.getElementById('pBtnListenFlat');
    if (pBtnListenFlat) {
      pBtnListenFlat.addEventListener('click', async () => {
        if (!this.audio.ctx) await this.audio.init();
        this.audio.setRoute('A');
        this.updateABButtons('A');
        if (!this.audio.isPlaying) this.audio.play();
        this.updatePlayButton();
      });
    }

    // Game Over Restart Button
    const restartGameBtn = document.getElementById('restartGameBtn');
    if (restartGameBtn) {
      restartGameBtn.addEventListener('click', () => {
        const modal = document.getElementById('gameOverModal');
        if (modal) modal.classList.remove('active');
        this.targetSwapsRemaining = 3;
        const badge = document.getElementById('swapCountBadge');
        if (badge) badge.textContent = '3/3';
        const swapBtn = document.getElementById('swapTargetBtn');
        if (swapBtn) { swapBtn.disabled = false; swapBtn.classList.remove('btn-disabled'); }

        this.trainer.resetSession();
        this.updateHUD();
        this.renderQuizInterface();
      });
    }
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
    const track = this.trackCatalog.find(t => t.id === val);
    if (track && track.path && !this.audio.audioBufferMap.has(val)) {
      await this.audio.loadTrackFromUrl(track.path, val);
    }
  }

  updatePlayButton() {
    const btn = document.getElementById('playBtn');
    if (!btn) return;
    if (this.audio.isPlaying) {
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
      btnB.classList.add('active-on');
    } else if (activeRoute === 'C' && btnC) {
      btnC.classList.add('active-guess');
    } else if (activeRoute === 'AUDITION' && btnB) {
      btnB.classList.add('active-on');
    }
  }

  updateHUD() {
    const scoreEl = document.getElementById('soundgymScore');
    if (scoreEl) scoreEl.textContent = this.trainer.scorePoints.toLocaleString();

    const rankEl = document.getElementById('soundgymRank');
    if (rankEl) rankEl.textContent = this.trainer.getRankTitle();

    const stageEl = document.getElementById('soundgymStage');
    if (stageEl) {
      if (this.trainer.isBossStage) {
        stageEl.innerHTML = `⚠️ <span class="text-danger" style="animation: pulse 1s infinite">BOSS FIGHT</span>`;
      } else {
        stageEl.textContent = `${this.trainer.stage}/${this.trainer.maxStages}`;
      }
    }

    const livesContainer = document.getElementById('livesContainer');
    if (livesContainer) {
      livesContainer.innerHTML = '';
      for (let i = 0; i < this.trainer.maxLives; i++) {
        const heart = document.createElement('div');
        heart.className = `heart-icon ${i < this.trainer.lives ? '' : 'lost'}`;
        heart.innerHTML = '❤️';
        livesContainer.appendChild(heart);
      }
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

      if (hardControlsGroup) hardControlsGroup.style.display = 'none';
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
          <button class="btn btn-primary btn-select-guess ${(!this.hasListenedA || !this.hasListenedB) ? 'btn-disabled' : ''}" data-idx="${idx}" ${(!this.hasListenedA || !this.hasListenedB) ? 'disabled' : ''}>
            ✓ Elegir
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
        if (!this.hasListenedA || !this.hasListenedB) return;
        const result = this.trainer.evaluateEasyGuess(idx);
        this.showPedagogicalReview(result);
      });

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
   * Renders pedagogical results inside Fila 3 Bottom Dock while KEEPING live audio RTA spectrum running!
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
            subtitleText += ` <span style="color:#10b981; font-weight:bold; margin-left:8px;">🎯 ¡Filtro Acertado! (+100 PTS)</span>`;
          } else if (result.userType) {
    if (icon && title) {
      if (result.isPolarityFlipped) {
        icon.textContent = '⚠️';
        title.textContent = cleanLabel || 'Ganancia Opuesta';
        title.className = 'results-title warning';
      } else if (result.isCorrect) {
    if (subtitle) subtitle.innerHTML = subtitleText;

    if (icon && title) {
      if (result.isPolarityFlipped) {
        icon.textContent = '⚠️';
        title.textContent = '¡Frecuencia Correcta, Ganancia Opuesta!';
        title.className = 'results-title warning';
    // Evaluate game loop trial outcome
    this.lastGameOutcome = this.gameLoop.evaluateTrialOutcome(result.scorePercentage, result.pointsAwarded || 0);
    const gameOutcome = this.lastGameOutcome;
        title.className = 'results-title success';
      } else {
        icon.textContent = '🎯';
        title.textContent = cleanLabel || 'Revisión Didáctica';
        title.className = 'results-title failure';
      }
    }

    const statPoints = document.getElementById('pStatPoints');
    const statScore = document.getElementById('pStatScore');
    const statFreqError = document.getElementById('pStatFreqError');
    const statGainError = document.getElementById('pStatGainError');

    if (statPoints) statPoints.textContent = `+${result.pointsAwarded.toLocaleString()}`;

    const isBossBreakdown = (this.trainer.isBossStage || result.isBossStage) && result.bandResults && result.bandResults.length > 1;

    if (isBossBreakdown) {
      if (statScore) {
        const totalP = result.totalPrecision !== undefined ? result.totalPrecision : result.scorePercentage;
        statScore.textContent = `${Math.round(totalP)}% (Banda 1: ${Math.round(result.band1Precision)}% | Banda 2: ${Math.round(result.band2Precision)}%)`;
      }
      if (statFreqError) {
        statFreqError.textContent = `B1: ${result.band1Octave.toFixed(2)} oct | B2: ${result.band2Octave.toFixed(2)} oct`;
      }
    } else {
      if (statScore) statScore.textContent = `${Math.round(result.scorePercentage)}%`;
      if (statFreqError) statFreqError.textContent = `${result.octaveDistance !== undefined ? result.octaveDistance.toFixed(2) : '0.00'} oct`;
    }

    if (statGainError) statGainError.textContent = `${result.gainErrorDb !== undefined ? (result.gainErrorDb > 0 ? '+' : '') + result.gainErrorDb.toFixed(1) : '0.0'} dB`;

    // Tarea 2 y 3: Evaluar "Falsos Amigos" y Renderizar el Bocadillo Didáctico
    const userGuess = {
      frequencyHz: result.userFreqHz,
      gainDb: result.userGainDb,
      qFactor: result.userQ,
      type: result.userType || 'peaking'
    };

    if (falseFriendsCard && falseFriendsMsgEl) {
      if (falseFriendsText) {
        falseFriendsMsgEl.textContent = falseFriendsText;
        falseFriendsCard.classList.remove('hidden');
      } else {
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
        falseFriendsCard.classList.add('hidden');
      }
    }
    if (isProMode && proCard && proTerminal) {
      const hasAcousticContext = !acousticContextCard.classList.contains('hidden');
      
      if (!hasAcousticContext) {
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
        proCard.classList.add('hidden');
      }
    } else {
      if (resultsSection) resultsSection.classList.remove('pro-mode-active');
      if (proCard) proCard.classList.add('hidden');
    }

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
}

// Safe Browser Auto-Boot Entry Point
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
