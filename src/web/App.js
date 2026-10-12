/**
 * @file App.js
 * @description Main application controller integrating AudioEngine, Visualizer, and TrainingManager.
 * Manages CSS Grid workspace layout, onboarding overlay, mode switching, draggable Canvas node handle in Pro mode, and Fila 3 integrated pedagogical results.
 */

import { AudioEngine } from './AudioEngine.js?v=84';
import { Visualizer } from './Visualizer_v2.js?v=84';
import { GameLoopManager, GAME_STATES } from './GameLoopManager.js?v=84';
import { AUDIO_SOURCES, MULTITRACK_SESSIONS, pickRandomTargetStem } from './AudioResourceManager.js?v=84';
import { TrainingManager } from './TrainingManager.js?v=84';
import { ScoringEngine, checkFilterFalseFriends, analyzeProPractices } from './ScoringEngine.js?v=84';
import { resolveAcousticClassKey } from './AcousticMatrix.js?v=84';
import { VUMeter } from './VUMeter.js?v=84';
import { DynamicsLab, DYNAMICS_LAB_MODES, DYNAMICS_LAB_EVENTS, listExploreScenarios, describeSidechainCases, suggestDynamicsForSource } from './DynamicsLab.js?v=84';
import { DYNAMICS_MASTER_TIPS } from './DynamicsMatrix.js?v=84';
import { CompressorUI } from './CompressorUI.js?v=84';
import { TooltipController } from './TooltipController.js?v=84';
import { TheoryPanel } from './TheoryPanel.js?v=84';
import { DynamicsScopeRenderer } from './DynamicsScopeRenderer.js?v=84';

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

    // Progression ceiling for the campaign end-state (matches GameLoopManager RANKS length)
    this.maxLevels = 5;

    // Terminal / level-up modal deferred by showPedagogicalReview so the didactic
    // review is seen (and audible) before the game-over screen covers it.
    this.pendingOutcomeModal = null;

    // DYNAMIC RANGE module (module 2). Everything here is created lazily by
    // startDynamicsMode() and torn down by exitDynamicsLab() so the EQ workspace
    // and the compressor lab never coexist in the frame budget.
    this.dynamicsLab = null;
    this.compressorUI = null;
    this.tooltipController = null;
    this.dynamicsActive = false;
    this.dynamicsMode = DYNAMICS_LAB_MODES.EXPLORE;
    this._dynControlsBound = false;
    this._dynAwaitingNext = false;
    this._dynSidechainValue = '';
    // Which view the shared dock verdict panel currently shows (toggle target):
    // 'verdict' (Comprobar) | 'reference' (Revelar) | null (hidden).
    this._dynVerdictView = null;
    // Params signature captured at the last "Comprobar" so a second press with
    // unchanged params MINIMISES the panel instead of pointlessly re-scoring.
    this._dynLastCheckSig = null;
    // Source id the suggestions panel was last rendered for (per-track recipes).
    this._dynLastSourceId = null;
    // Didactic surface (theory cards) + the complementary temporal graph
    // (input envelope + gain reduction), created by _applyDynamicsSurface /
    // _mountDynamicsScope. It does NOT replace the transfer curve.
    this.theoryPanel = null;
    this.scopeRenderer = null;

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

    // Single source of truth: TrainingManager reads progression (lives/stage) from the global store
    this.trainer.gameLoopStore = this.gameLoop.store;

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

        if (state.isPlaying && this.audio.currentMultitrackSession) {
          this.rebindVuMeters();
        }

        if (this.vuMeter) {
          if (state.isPlaying) this.vuMeter.start();
          else this.vuMeter.stop();
        }
        if (this.stemVuMeters) {
          this.stemVuMeters.forEach(vu => {
            if (state.isPlaying) vu.start();
            else vu.stop();
          });
        }
      }
    };

    // Mixer state was reset to a clean full mix (silence-guard). Re-render the
    // stem mixer so its M/S buttons and faders reflect the new state.
    this.audio.onStemStateReset = (session) => {
      if (
        this.audio.currentMultitrackSession &&
        session &&
        this.audio.currentMultitrackSession.id === session.id
      ) {
        this.renderStemMixer(session);
      }
    };

    // Start with onboarding welcome screen
    this.setAppState('WELCOME');
  }

  /**
   * Controls onboarding overlay workflow visibility.
   * @param {'WELCOME'|'MODULE_SELECT'|'GAME_MODE_SELECT'|'CAMPAIGN_SELECT'|'DIFFICULTY_SELECT'|'DYNAMICS_MODE_SELECT'|'DYNAMICS_LAB'|'PLAYING'} newState
   */
  setAppState(newState) {
    const overlay = document.getElementById('onboardingOverlay');
    const screenWelcome = document.getElementById('screenWelcome');
    const screenModuleSelect = document.getElementById('screenModuleSelect');
    const screenGameModeSelect = document.getElementById('screenGameModeSelect');
    const screenCampaignSelect = document.getElementById('screenCampaignSelect');
    const screenDifficultySelect = document.getElementById('screenDifficultySelect');
    const screenDynamicsModeSelect = document.getElementById('screenDynamicsModeSelect');

    [screenWelcome, screenModuleSelect, screenGameModeSelect, screenCampaignSelect, screenDifficultySelect, screenDynamicsModeSelect].forEach(s => {
      if (s) {
        s.classList.remove('active-step');
        s.classList.add('hidden');
      }
    });

    // The difficulty selector is only interactive in the menus; during play it
    // becomes a static chip showing the active tier (tester comment #7).
    this.setDifficultyChipsLocked(newState === 'PLAYING');

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
    } else if (newState === 'DYNAMICS_MODE_SELECT') {
      if (overlay) overlay.classList.remove('hidden-overlay');
      if (screenDynamicsModeSelect) {
        screenDynamicsModeSelect.classList.remove('hidden');
        setTimeout(() => screenDynamicsModeSelect.classList.add('active-step'), 20);
      }
    } else if (newState === 'DYNAMICS_LAB') {
      // The compressor panel lives in the workspace, not the overlay.
      if (overlay) overlay.classList.add('hidden-overlay');
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
        // Leaving from inside the Dynamic Range lab must restore the EQ workspace.
        if (this.dynamicsActive) { this.exitDynamicsLab(); return; }
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

    // ── DYNAMIC RANGE module (module 2) ──────────────────────────────────────
    const btnSelectDynamicRange = document.getElementById('btnSelectDynamicRange');
    if (btnSelectDynamicRange) {
      btnSelectDynamicRange.addEventListener('click', () => this.setAppState('DYNAMICS_MODE_SELECT'));
    }

    const btnBackToModulesFromDyn = document.getElementById('btnBackToModulesFromDyn');
    if (btnBackToModulesFromDyn) {
      btnBackToModulesFromDyn.addEventListener('click', () => this.setAppState('MODULE_SELECT'));
    }

    document.querySelectorAll('.dyn-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-dyn-mode') || DYNAMICS_LAB_MODES.EXPLORE;
        this.startDynamicsMode(mode).catch(err => console.warn('[Dynamics] start failed:', err));
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
          this.loadSelectedSource().catch(() => { });
        }).catch(err => console.warn('Audio init warning:', err));
      } else {
        this.loadSelectedSource().catch(() => { });
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  DYNAMIC RANGE module (module 2) — Explore / Challenge / Case integration
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Builds the small audio adapter the DynamicsLab expects. Every method is
   * optional and defensive: the Lab never throws into the app (DynamicsLab._call).
   * @returns {object}
   */
  _createDynamicsAdapter() {
    const audio = this.audio;
    return {
      applyParams: (params) => { if (audio.dynamicsEngine) audio.setDynamicsConfig(params); },
      setStyle: (style) => { if (audio.dynamicsEngine) audio.dynamicsEngine.setStyle(style); },
      setColor: (on) => { if (audio.dynamicsEngine) audio.dynamicsEngine.setColor(on); },
      setBypass: (on) => { if (audio.dynamicsEngine) audio.dynamicsEngine.setBypass(on); },
      reset: () => { if (audio.dynamicsEngine) audio.dynamicsEngine.reset(); },
      loadSource: (sourceId) => audio.loadAudioSource(sourceId),
      loadSessionStem: (sessionId, stemId) => this._loadSidechainSession(sessionId, stemId)
    };
  }

  /**
   * Loads a multitrack session and points the auditioned (compressed) path at a
   * stem OTHER than the sidechain key, then re-taps the key. This honours the
   * AudioEngine guard that refuses to key a compressor with the stem it processes.
   * @param {string} sessionId
   * @param {string} stemId sidechain key stem (e.g. the kick)
   * @returns {Promise<object|null>}
   */
  async _loadSidechainSession(sessionId, stemId) {
    const audio = this.audio;
    if (!audio) return null;
    await audio.loadAudioSource(sessionId);
    const session = audio.currentMultitrackSession;
    if (!session) return null;

    let targetId = session.targetStem;
    if (!targetId || targetId === stemId) {
      const bass = session.stems.find(s => s.acousticClass === 'bass' && s.id !== stemId);
      const alt = session.stems.find(s => s.id !== stemId);
      targetId = (bass || alt || {}).id || null;
    }
    if (targetId) this.setTargetStem(session, targetId);

    audio.setDynamicsConfig({ sidechainStemId: stemId });
    return { sessionId, stemId, targetStemId: targetId };
  }

  /**
   * Loads a didactic sidechain preset: both the target and the key are explicit
   * stems of the same session (see DYNAMICS_SIDECHAIN_CASES), which is exactly
   * what AudioEngine._wireDynamicsSidechain requires.
   * @param {string} sessionId
   * @param {string} keyStemId sidechain trigger (e.g. the kick or the lead vox)
   * @param {string} targetStemId stem that must duck (e.g. the bass)
   * @returns {Promise<object|null>}
   */
  async _loadSidechainCase(sessionId, keyStemId, targetStemId) {
    const audio = this.audio;
    if (!audio) return null;
    await audio.loadAudioSource(sessionId);
    const session = audio.currentMultitrackSession;
    if (!session) return null;
    if (targetStemId) this.setTargetStem(session, targetStemId);
    audio.setDynamicsConfig({ sidechainStemId: keyStemId });
    return { sessionId, keyStemId, targetStemId };
  }

  /**
   * Boots the Dynamic Range lab: pauses the EQ loop, swaps the workspace chrome,
   * builds the DSP insert and creates the orchestration layer.
   * @param {'explore'|'challenge'|'case'} mode
   */
  async startDynamicsMode(mode = DYNAMICS_LAB_MODES.EXPLORE) {
    this.dynamicsMode = mode;
    this._dynControlsBound = false;
    this._dynAwaitingNext = false;
    this._dynSidechainValue = '';
    this._dynVerdictView = null;
    this._dynLastCheckSig = null;
    this._dynLastSourceId = null;
    // Suggestions are (re)filled per source by _loadDynamicsForMode(); start closed.
    const suggestPanel = document.getElementById('dynSuggestPanel');
    if (suggestPanel) { suggestPanel.classList.add('hidden'); suggestPanel.setAttribute('aria-hidden', 'true'); }
    const suggestBtn = document.getElementById('dynSuggestBtn');
    if (suggestBtn) { suggestBtn.setAttribute('aria-pressed', 'false'); suggestBtn.classList.remove('active'); }

    // 1. Single 60 FPS loop: the EQ visualiser must yield to the compressor canvas.
    if (this.visualizer && typeof this.visualizer.stop === 'function') this.visualizer.stop();
    if (this.vuMeter && typeof this.vuMeter.stop === 'function') this.vuMeter.stop();

    // 2. Detach the EQ graph and stop the transport.
    if (this.audio) {
      try { this.audio.stopAllAudio(); } catch (_) { /* ignore */ }
      try { this.audio.teardownGraph('target'); } catch (_) { /* ignore */ }
      if (!this.audio.ctx) {
        try { await this.audio.init(); } catch (e) { console.warn('Audio init warning:', e); }
      }
    }

    // 3. Swap the workspace chrome: hide EQ visuals + dock, reveal the compressor.
    this._setEqChromeVisible(false);
    // The Fácil/Normal/Pro selector belongs to the EQ game, not to this lab.
    const diffGroup = document.getElementById('difficultyGroup');
    if (diffGroup) diffGroup.classList.add('hidden');
    const panel = document.getElementById('dynamicsPanel');
    if (panel) panel.classList.remove('hidden');
    const dock = document.getElementById('dynamicsDockSection');
    if (dock) dock.classList.remove('hidden');
    const results = document.getElementById('resultsDockSection');
    if (results) results.classList.add('hidden');

    // 4. Build the DSP insert and wire telemetry -> transfer curve meter + the
    //    complementary temporal graph (input envelope + gain reduction).
    if (this.audio) {
      this.audio.setDynamicsTelemetryHandler((data) => {
        if (this.compressorUI) this.compressorUI.setTelemetry(data);
        if (this.scopeRenderer) this.scopeRenderer.setTelemetry(data);
      });
      try { await this.audio.buildDynamicsGraph({ active: true }); } catch (e) { console.warn('buildDynamicsGraph failed:', e); }
    }

    // 5. Mount the Pro-C2 transfer curve, the complementary temporal graph and
    //    the 1-second help tooltips.
    this._mountCompressorUI();
    this._mountDynamicsScope();
    this._mountDynamicsTooltips();

    // 6. Create the DOM-free orchestration layer and bind it.
    this.dynamicsLab = new DynamicsLab({ audio: this._createDynamicsAdapter(), mode });
    this.dynamicsLab.setMode(mode);
    this._bindDynamicsLabEvents();
    this._bindDynamicsPanelControls();

    // 6b. Select the didactic surface for this sub-mode: Theory hands the panel
    // over to the concept cards; the rest keep the transfer curve panel plus the
    // complementary temporal graph below it (input envelope + gain reduction).
    this._applyDynamicsSurface(mode);

    // 7. Reset the shared store so nothing inherited from the EQ session leaks.
    if (this.gameLoop) this.gameLoop.setGameMode('dynamics');

    this.dynamicsActive = true;
    // Item 3: the header A/B toggle becomes a true DYN OFF/DYN ON bypass pair
    // inside the lab, mirrored from the lab's live bypass state.
    this._setHeaderABLabels(true);
    this._reflectDynamicsBypass(this.dynamicsLab ? this.dynamicsLab.bypass : false);
    this.setAppState('DYNAMICS_LAB');

    await this._loadDynamicsForMode(mode);
  }

  /** Creates (or restarts) the CompressorUI bound to #compressorCanvas. */
  _mountCompressorUI() {
    const canvas = document.getElementById('compressorCanvas');
    if (!canvas) return;
    if (this.compressorUI && this.compressorUI.canvas === canvas) {
      this.compressorUI.start();
      return;
    }
    if (this.compressorUI) { try { this.compressorUI.destroy(); } catch (_) { /* ignore */ } }
    this.compressorUI = new CompressorUI(canvas, {
      onChange: (partial) => { if (this.dynamicsLab) this.dynamicsLab.applyParams(partial); },
      minDb: -60,
      maxDb: 0,
      grRangeDb: 24
    });
    if (this.dynamicsLab) {
      this.compressorUI.setParams(this.dynamicsLab.getParams());
      this.compressorUI.setStyle(this.dynamicsLab.params.style);
      this.compressorUI.setColor(this.dynamicsLab.colorOn);
    }
  }

  /**
   * Creates (or restarts) the complementary TEMPORAL graph bound to
   * #dynScopeCanvas. It plots the input envelope over time + the live gain
   * reduction on a shared time axis — a SEPARATE canvas from the transfer
   * curve, which is left untouched.
   */
  _mountDynamicsScope() {
    const canvas = document.getElementById('dynScopeCanvas');
    if (!canvas) return;
    if (this.scopeRenderer && this.scopeRenderer.canvas === canvas) {
      this.scopeRenderer.engine = this.audio;
      this.scopeRenderer.start();
      return;
    }
    if (this.scopeRenderer) { try { this.scopeRenderer.destroy(); } catch (_) { /* ignore */ } }
    this.scopeRenderer = new DynamicsScopeRenderer({
      canvas,
      engine: this.audio,
      getParams: () => (this.dynamicsLab ? this.dynamicsLab.getParams() : (this.compressorUI ? this.compressorUI.getParams() : null))
    });
  }

  /** Creates the TooltipController that powers the "hold 1s" help popovers. */
  _mountDynamicsTooltips() {
    if (!this.tooltipController) {
      this.tooltipController = new TooltipController({
        root: document.body,
        container: document.body,
        holdMs: 1000,
        canvas: this.compressorUI ? this.compressorUI.canvas : document.getElementById('compressorCanvas'),
        getHotspots: () => (this.compressorUI ? this.compressorUI.getHotspots() : [])
      });
    }
    this.tooltipController.setEnabled(true);
  }

  /**
   * Chooses the didactic surface for a sub-mode and de-gamifies the chrome.
   * THEORY replaces the compressor panel with the concept/ADSR cards; every
   * other sub-mode keeps the transfer curve panel plus the complementary
   * temporal graph (input envelope + gain reduction) below it.
   * @param {string} mode
   */
  _applyDynamicsSurface(mode) {
    const panel = document.getElementById('dynamicsPanel');
    const theoryHost = document.getElementById('theoryPanel');
    const submit = document.getElementById('dynSubmitBtn');

    // The score/lives/lifeline HUD belongs to the EQ game, never to this lab.
    this._setGameHudVisible(false);

    if (mode === DYNAMICS_LAB_MODES.THEORY) {
      if (this.compressorUI) { try { this.compressorUI.stop(); } catch (_) { /* ignore */ } }
      if (this.scopeRenderer) { try { this.scopeRenderer.stop(); } catch (_) { /* ignore */ } }
      if (panel) panel.classList.add('hidden');
      if (theoryHost) theoryHost.classList.remove('hidden');
      if (submit) submit.classList.add('hidden');
      this._mountDynamicsTheory();
      return;
    }

    if (theoryHost) theoryHost.classList.add('hidden');
    if (panel) panel.classList.remove('hidden');
    if (submit) submit.classList.remove('hidden');
    // The transfer curve and the temporal graph share the panel row.
    if (this.compressorUI) { try { this.compressorUI.start(); } catch (_) { /* ignore */ } }
    if (this.scopeRenderer) { try { this.scopeRenderer.resize(); this.scopeRenderer.start(); } catch (_) { /* ignore */ } }
  }

  /** Mounts the theory cards + interactive ADSR demo (E2). */
  _mountDynamicsTheory() {
    const host = document.getElementById('theoryPanel');
    const lab = this.dynamicsLab;
    if (!host || !lab) return;
    if (!this.theoryPanel || this.theoryPanel.container !== host) {
      if (this.theoryPanel) { try { this.theoryPanel.destroy(); } catch (_) { /* ignore */ } }
      this.theoryPanel = new TheoryPanel({
        container: host,
        sections: lab.getTheory(),
        getParams: () => (this.dynamicsLab ? this.dynamicsLab.getParams() : {}),
        onParamChange: (partial) => { if (this.dynamicsLab) this.dynamicsLab.applyParams(partial); }
      });
    }
    this.theoryPanel.render();
    this.theoryPanel.setParams(lab.getParams());
  }

  /**
   * Hides/restores the gamified chrome (score, lives, lifeline) so the Dynamic
   * Range lab reads as a practice tool rather than as a scored game.
   * @param {boolean} visible
   */
  _setGameHudVisible(visible) {
    document.querySelectorAll('#topBar .soundgym-stat').forEach(el => {
      el.style.display = visible ? '' : 'none';
    });
    const lives = document.getElementById('livesContainer');
    if (lives) lives.style.display = visible ? '' : 'none';
    const swap = document.getElementById('swapTargetBtn');
    if (swap) swap.style.display = visible ? '' : 'none';
  }

  /** Subscribes the app to the Lab's event bus. */
  _bindDynamicsLabEvents() {
    const lab = this.dynamicsLab;
    if (!lab) return;

    lab.on(DYNAMICS_LAB_EVENTS.CHANGED, () => {
      this._syncDynamicsControls();
      if (this.theoryPanel) this.theoryPanel.setParams(lab.getParams());
      if (this.compressorUI) {
        this.compressorUI.setParams(lab.getParams());
        this.compressorUI.setStyle(lab.params.style);
        this.compressorUI.setColor(lab.colorOn);
        this.compressorUI.setBypass(lab.bypass);
      }
    });

    lab.on(DYNAMICS_LAB_EVENTS.SCENARIO_LOADED, (info) => this._onDynamicsScenario(info));

    lab.on(DYNAMICS_LAB_EVENTS.CHALLENGE_STARTED, (payload) => {
      this._dynAwaitingNext = false;
      this._clearCaseVerdict();
      const ch = payload.challenge || {};
      // A gated step must SAY which controls it opens, otherwise the dimmed knobs
      // read as a broken panel rather than as progressive disclosure.
      const hint = Array.isArray(ch.unlocked) ? this._dynLockHint(payload.unlocked) : '';
      this._setDynamicsPrompt(`Paso ${payload.index + 1}/${payload.total}: ${ch.title || ''} — ${ch.brief || ''}${hint}`);
      const submit = document.getElementById('dynSubmitBtn');
      if (submit) {
        submit.textContent = '🎯 Enviar Ajuste';
        submit.disabled = false;
        submit.classList.remove('btn-submit-disabled');
      }
      this._syncDynamicsControls();
      this._populateDynamicsSidechain(payload.scenario);
      // Challenges use real material too: refresh the per-track suggestions.
      const chSuggestBtn = document.getElementById('dynSuggestBtn');
      if (chSuggestBtn) chSuggestBtn.classList.remove('hidden');
      if (payload.scenario && payload.scenario.sourceId) {
        this._renderDynamicsSuggestions(payload.scenario.sourceId);
      }
    });

    lab.on(DYNAMICS_LAB_EVENTS.RESULT, (payload) => this._onDynamicsResult(payload));

    lab.on(DYNAMICS_LAB_EVENTS.CASE_LOADED, (payload) => {
      this._dynAwaitingNext = false;
      const cs = payload.case || {};
      const scen = payload.scenario || {};
      const srcName = scen.sourceName || scen.sourceId || '';
      // Perceptible gating: name the designated track and pin the Fuente picker to
      // it, so the guided recipe can only be solved with THAT source.
      const caseKeys = this._dynCaseUnlockedKeys(lab);
      const hint = caseKeys ? this._dynLockHint(Array.from(caseKeys)) : '';
      this._setDynamicsPrompt(
        `Caso: ${cs.title || ''} — ${cs.goal || ''}`
        + (srcName ? ` Pista asignada: ${srcName} (fija para este ejercicio).` : '')
        + ' Ajusta solo los controles activos y pulsa "Comprobar".'
        + hint
      );
      this._syncHeaderSource(scen.sourceId, scen.sourceName);
      this._lockDynamicsSource(true);
      const submit = document.getElementById('dynSubmitBtn');
      if (submit) {
        submit.textContent = '✅ Comprobar';
        submit.disabled = false;
        submit.classList.remove('btn-submit-disabled');
        submit.setAttribute('aria-pressed', 'false');
      }
      this._syncDynamicsControls();
      this._populateDynamicsSidechain(payload.scenario);
      this._clearCaseVerdict();
      const reveal = document.getElementById('dynRevealBtn');
      if (reveal) reveal.classList.remove('hidden');
      // Case mode pins the source to the recipe: per-track suggestions do not apply.
      const caseSuggestBtn = document.getElementById('dynSuggestBtn');
      if (caseSuggestBtn) {
        caseSuggestBtn.classList.add('hidden');
        caseSuggestBtn.setAttribute('aria-pressed', 'false');
        caseSuggestBtn.classList.remove('active');
      }
      const caseSuggestPanel = document.getElementById('dynSuggestPanel');
      if (caseSuggestPanel) {
        caseSuggestPanel.classList.add('hidden');
        caseSuggestPanel.setAttribute('aria-hidden', 'true');
      }
    });

    lab.on(DYNAMICS_LAB_EVENTS.CASE_CHECKED, (result) => this._onCaseChecked(result));

    // Item 3: keep the header A/B buttons + dock button in sync with the DSP's
    // real bypass state, whatever flipped it (header button, dock button, code).
    lab.on(DYNAMICS_LAB_EVENTS.BYPASS_CHANGED, (on) => this._reflectDynamicsBypass(on));
  }

  /** Wires the DOM controls of the dynamics panel/rail/dock to the Lab. */
  _bindDynamicsPanelControls() {
    const lab = this.dynamicsLab;
    if (!lab || this._dynControlsBound) return;
    this._dynControlsBound = true;

    // Idempotent binding. Re-entering the lab (or switching sub-mode) re-runs
    // this method, and the panel DOM is reused: a plain addEventListener would
    // stack a SECOND listener on every element, so a stale listener could push
    // the OLD lab's full parameter set back on each drag (the knobs then read
    // as "frozen"). We keep exactly one handler per element+event and replace
    // it on every bind.
    const bindEvt = (el, type, handler) => {
      if (!el) return;
      const key = `_dynOn${type}`;
      if (el[key]) el.removeEventListener(type, el[key]);
      el[key] = handler;
      el.addEventListener(type, handler);
    };

    // Belt-and-suspenders for the recurring "los potenciómetros están congelados"
    // report. The root cause was a 4px-tall `input[type=range]` whose grab area was
    // almost impossible to hit with a pointer, while the big canvas threshold handle
    // still worked. The stylesheet now paints a 20px-tall input (thin track via the
    // vendor pseudo-elements), but a browser holding a CACHED older stylesheet would
    // still get the 4px box. Enforcing a grabbable hit area from JS here makes the
    // fix independent of the stylesheet version, so the knobs stay draggable no
    // matter which CSS the client actually loaded.
    const ensureGrabbable = (el) => {
      if (!el || el.tagName !== 'INPUT' || el.type !== 'range') return;
      el.style.height = '20px';
      el.style.cursor = 'pointer';
      el.style.touchAction = 'none';
    };

    this._dynControlDefs().forEach(def => {
      const input = document.getElementById(def.id);
      ensureGrabbable(input);
      bindEvt(input, 'input', () => {
        const raw = parseFloat(input.value);
        const val = def.uiScale ? raw / def.uiScale : raw;
        lab.applyParams({ [def.key]: val });
      });
    });

    document.querySelectorAll('#dynTypeChips .dyn-chip').forEach(chip => {
      bindEvt(chip, 'click', () => {
        if (chip.disabled) return;
        lab.setType(chip.getAttribute('data-dyn-style'));
      });
    });

    const det = document.getElementById('dynDetectorSelect');
    bindEvt(det, 'change', () => lab.applyParams({ detector: det.value }));

    const fb = document.getElementById('dynFeedbackSelect');
    bindEvt(fb, 'change', () => lab.applyParams({ feedback: fb.value === 'feedback' }));

    const modeSel = document.getElementById('dynModeSelect');
    bindEvt(modeSel, 'change', () => {
      const next = modeSel.value === 'expand' ? 'expand' : 'compress';
      lab.applyParams({ mode: next });
      if (this.compressorUI) this.compressorUI.setMode(next);
    });

    const upEn = document.getElementById('dynUpwardEnable');
    bindEvt(upEn, 'change', () => lab.applyParams({ upwardEnabled: upEn.checked }));

    const color = document.getElementById('dynColorSwitch');
    bindEvt(color, 'click', () => lab.setColor(!lab.colorOn));

    const auto = document.getElementById('dynAutoGainBtn');
    bindEvt(auto, 'click', () => lab.applyParams({ autoGain: !lab.getParams().autoGain }));

    const help = document.getElementById('btnDynHelp');
    if (help && this.tooltipController) {
      bindEvt(help, 'click', () => {
        const on = !this.tooltipController.teaching;
        this.tooltipController.setTeaching(on);
        help.setAttribute('aria-pressed', String(on));
      });
    }

    const bypass = document.getElementById('dynBypassBtn');
    bindEvt(bypass, 'click', () => {
      // Toggle only; BYPASS_CHANGED reflects the chrome (dock + header DYN OFF/ON).
      lab.setBypass(!lab.bypass);
    });

    // Item 4: "Pro Tips" panel (best practices + didactic usages).
    const tipsBtn = document.getElementById('dynTipsBtn');
    const tipsPanel = document.getElementById('dynTipsPanel');
    if (tipsBtn && tipsPanel) {
      this._renderDynamicsTips();
      bindEvt(tipsBtn, 'click', () => {
        const willOpen = tipsPanel.classList.contains('hidden');
        tipsPanel.classList.toggle('hidden', !willOpen);
        tipsPanel.setAttribute('aria-hidden', String(!willOpen));
        tipsBtn.setAttribute('aria-pressed', String(willOpen));
        tipsBtn.classList.toggle('active', willOpen);
      });
    }

    // Contextual per-source recipes: a toggle panel auto-refreshed when the
    // Fuente picker changes, so the user always gets >=3 compression ideas for
    // the track they are actually auditioning.
    const suggestBtn = document.getElementById('dynSuggestBtn');
    const suggestPanel = document.getElementById('dynSuggestPanel');
    if (suggestBtn && suggestPanel) {
      bindEvt(suggestBtn, 'click', () => {
        const willOpen = suggestPanel.classList.contains('hidden');
        if (willOpen) this._renderDynamicsSuggestions(this._dynCurrentSourceId());
        suggestPanel.classList.toggle('hidden', !willOpen);
        suggestPanel.setAttribute('aria-hidden', String(!willOpen));
        suggestBtn.setAttribute('aria-pressed', String(willOpen));
        suggestBtn.classList.toggle('active', willOpen);
      });
    }

    const sidechain = document.getElementById('dynSidechainSelect');
    bindEvt(sidechain, 'change', () => {
      const val = sidechain.value;
      this._dynSidechainValue = val;
      if (!val) {
        lab.applyParams({ sidechain: false });
        if (this.audio) this.audio.setDynamicsConfig({ sidechainStemId: null });
        return;
      }
      // Values are either "sessionId::keyStemId" (a scenario's own key) or the
      // didactic preset "sessionId::keyStemId::targetStemId".
      const parts = val.split('::');
      const sessionId = parts[0];
      const keyStemId = parts[1];
      const targetStemId = parts[2] || null;
      const load = targetStemId
        ? this._loadSidechainCase(sessionId, keyStemId, targetStemId)
        : this._loadSidechainSession(sessionId, keyStemId);
      load
        .then(() => {
          lab.applyParams({ sidechain: true });
          this._syncHeaderSource(sessionId, sessionId);
          this._setDynamicsPrompt(
            targetStemId
              ? `Sidechain: ${keyStemId} abre hueco a ${targetStemId}. Escucha cómo el target cede en cada golpe.`
              : `Sidechain activo desde ${keyStemId}.`
          );
        })
        .catch(err => console.warn('[Dynamics] sidechain load failed:', err));
    });

    const revealBtn = document.getElementById('dynRevealBtn');
    bindEvt(revealBtn, 'click', () => {
      const host = document.getElementById('dynCaseVerdict');
      // Toggle: a second press on "Revelar referencia" MINIMISES the panel.
      if (this._dynVerdictView === 'reference' && host && !host.classList.contains('hidden')) {
        this._hideCaseVerdictPanel();
        revealBtn.setAttribute('aria-pressed', 'false');
        return;
      }
      const target = lab.revealCaseTarget();
      if (target) {
        this._renderCaseReference(target);
        revealBtn.setAttribute('aria-pressed', 'true');
      }
    });

    const submit = document.getElementById('dynSubmitBtn');
    bindEvt(submit, 'click', () => {
      if (this._dynAwaitingNext) {
        this._dynAwaitingNext = false;
        submit.textContent = '🎯 Enviar Ajuste';
        lab.nextChallenge().then(payload => {
          if (!payload) this._setDynamicsPrompt('¡Práctica completada! Repite un paso o vuelve al menú.');
        });
        return;
      }
      if (lab.mode === DYNAMICS_LAB_MODES.CASE) {
        const host = document.getElementById('dynCaseVerdict');
        const params = lab.getParams();
        const sig = JSON.stringify(params);
        const showingVerdict = this._dynVerdictView === 'verdict'
          && host && !host.classList.contains('hidden');
        // Toggle: a second press with UNCHANGED params minimises the verdict
        // instead of pointlessly re-scoring. Any knob move resets the signature,
        // so the next press re-checks with the new values.
        if (showingVerdict && sig === this._dynLastCheckSig) {
          this._hideCaseVerdictPanel();
          submit.setAttribute('aria-pressed', 'false');
          return;
        }
        this._dynLastCheckSig = sig;
        submit.setAttribute('aria-pressed', 'true');
        // Snapshot the live parameter state explicitly so the verdict always
        // matches the sound the user just heard.
        this._onCaseChecked(lab.checkCase(lab.activeCaseId, params));
      } else if (lab.mode === DYNAMICS_LAB_MODES.CHALLENGE) {
        lab.submitChallenge();
      }
    });
  }

  /** Ordered DOM-slider <-> param-key map (mix is 0..1 in state, 0..100 in the UI). */
  _dynControlDefs() {
    return [
      { id: 'dynThreshold', key: 'thresholdDb', fmt: v => `${v.toFixed(1)} dB` },
      { id: 'dynRatio', key: 'ratio', fmt: v => `${v.toFixed(2)}:1` },
      { id: 'dynKnee', key: 'kneeDb', fmt: v => `${v.toFixed(1)} dB` },
      { id: 'dynAttack', key: 'attackMs', fmt: v => `${v.toFixed(1)} ms` },
      { id: 'dynRelease', key: 'releaseMs', fmt: v => `${Math.round(v)} ms` },
      { id: 'dynHold', key: 'holdMs', fmt: v => `${v.toFixed(1)} ms` },
      { id: 'dynMakeup', key: 'makeupDb', fmt: v => `${v.toFixed(1)} dB` },
      { id: 'dynMix', key: 'mix', uiScale: 100, fmt: v => `${Math.round(v * 100)} %` },
      { id: 'dynUpwardThreshold', key: 'upwardThresholdDb', fmt: v => `${v.toFixed(1)} dB` },
      { id: 'dynUpwardRatio', key: 'upwardRatio', fmt: v => `${v.toFixed(2)}:1` }
    ];
  }

  /** Maps a DSP parameter key to its curriculum control key. */
  _dynCurriculumKey(key) {
    const map = {
      thresholdDb: 'threshold',
      kneeDb: 'knee',
      attackMs: 'attack',
      releaseMs: 'release',
      holdMs: 'hold',
      upwardThresholdDb: 'upwardThreshold'
    };
    return map[key] || key;
  }

  /** Human (Spanish) label for a curriculum control key; used by the lock hints. */
  _dynControlLabel(key) {
    const labels = {
      threshold: 'umbral',
      ratio: 'ratio',
      knee: 'codo',
      attack: 'ataque',
      release: 'release',
      hold: 'hold',
      makeupDb: 'makeup',
      mix: 'mix',
      style: 'tipo',
      sidechain: 'sidechain',
      mode: 'modo',
      detector: 'detector',
      feedback: 'topología',
      upwardEnabled: 'upward',
      upwardThresholdDb: 'umbral ↑',
      upwardRatio: 'ratio ↑'
    };
    return labels[key] || key;
  }

  /**
   * Explains — in the dock — WHICH controls the current guided step unlocked, so
   * the dimmed/locked ones are understood as progressive disclosure, not a bug.
   * @param {Array<string>} keys unlocked curriculum control keys
   * @returns {string} an appended sentence, or '' when there is nothing to say
   */
  _dynLockHint(keys) {
    if (!Array.isArray(keys) || !keys.length) return '';
    const list = keys.map(k => this._dynControlLabel(k)).join(', ');
    return ` 🔓 Controles activos: ${list}. Los bloqueados (🔒) se abren al avanzar.`;
  }

  /** Pushes the Lab's parameter state into the DOM controls. */
  _syncDynamicsControls() {
    const lab = this.dynamicsLab;
    if (!lab) return;
    const params = lab.getParams();

    this._dynControlDefs().forEach(def => {
      const input = document.getElementById(def.id);
      if (input) input.value = String(params[def.key] * (def.uiScale || 1));
      const out = document.getElementById(def.id + 'Value');
      if (out) out.textContent = def.fmt(params[def.key]);
    });

    const det = document.getElementById('dynDetectorSelect');
    if (det) det.value = params.detector || 'peak';
    const fb = document.getElementById('dynFeedbackSelect');
    if (fb) fb.value = params.feedback ? 'feedback' : 'feedforward';
    const modeSel = document.getElementById('dynModeSelect');
    if (modeSel) modeSel.value = params.mode === 'expand' ? 'expand' : 'compress';
    const upEn = document.getElementById('dynUpwardEnable');
    if (upEn) upEn.checked = !!params.upwardEnabled;

    document.querySelectorAll('#dynTypeChips .dyn-chip').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-dyn-style') === params.style);
    });

    const color = document.getElementById('dynColorSwitch');
    if (color) color.setAttribute('aria-pressed', String(!!lab.colorOn));
    const auto = document.getElementById('dynAutoGainBtn');
    if (auto) auto.setAttribute('aria-pressed', String(!!params.autoGain));

    const sc = document.getElementById('dynSidechainSelect');
    if (sc) sc.value = this._dynSidechainValue || '';

    this._applyDynamicsUnlockState();
  }

  /**
   * Derives the editable control-key set for the active Case Study. A guided
   * practice must be solvable ONLY with the parameters its recipe grades, so the
   * editable set is sourced from the case's `checks` (mirroring the Challenge
   * `unlocked` contract exposed by DynamicsLab.isControlUnlocked).
   * @param {object} lab
   * @returns {Set<string>|null} curriculum control keys, or null when not a case
   */
  _dynCaseUnlockedKeys(lab) {
    if (!lab || lab.mode !== DYNAMICS_LAB_MODES.CASE) return null;
    const cases = typeof lab.getCaseStudies === 'function' ? lab.getCaseStudies() : null;
    const cs = Array.isArray(cases) ? cases.find(c => c.id === lab.activeCaseId) : null;
    if (!cs || !Array.isArray(cs.checks)) return null;
    const keys = new Set();
    cs.checks.forEach(c => { if (c && c.param) keys.add(this._dynCurriculumKey(c.param)); });
    return keys;
  }

  /** Progressive disclosure: locks every control not unlocked by the current step. */
  _applyDynamicsUnlockState() {
    const lab = this.dynamicsLab;
    if (!lab) return;
    const challengeMode = lab.mode === DYNAMICS_LAB_MODES.CHALLENGE;
    const caseKeys = this._dynCaseUnlockedKeys(lab);
    const unlocked = (key) => {
      if (challengeMode) return lab.isControlUnlocked(key);
      if (caseKeys) return caseKeys.has(key);
      return true;
    };
    const upOn = !!lab.getParams().upwardEnabled;
    const LOCKED = 'Bloqueado en este paso: se activa más adelante.';

    /**
     * Applies the gate to one control AND marks it visually locked. A locked
     * control must look locked (dimmed + 🔒 + tooltip); otherwise the panel
     * appears "frozen" instead of didactically gated.
     */
    const gate = (el, ok, hostSelector) => {
      if (!el) return;
      el.disabled = !ok;
      el.title = ok ? '' : LOCKED;
      el.setAttribute('aria-disabled', String(!ok));
      const host = hostSelector
        ? el.closest(hostSelector)
        : (el.closest('.surgical-knob-group') || el.closest('.dyn-field') || el.closest('.dyn-switch'));
      if (host) host.classList.toggle('is-locked', !ok);
    };

    this._dynControlDefs().forEach(def => {
      const input = document.getElementById(def.id);
      if (!input) return;
      let ok = unlocked(this._dynCurriculumKey(def.key));
      if (def.key === 'upwardThresholdDb' || def.key === 'upwardRatio') ok = ok && upOn;
      gate(input, ok, '.surgical-knob-group');
    });

    const styleOk = unlocked('style');
    document.querySelectorAll('#dynTypeChips .dyn-chip').forEach(c => {
      c.disabled = !styleOk;
      c.title = styleOk ? '' : LOCKED;
    });
    const chips = document.getElementById('dynTypeChips');
    if (chips) chips.classList.toggle('is-locked', !styleOk);

    gate(document.getElementById('dynDetectorSelect'), unlocked('detector'));
    gate(document.getElementById('dynFeedbackSelect'), unlocked('feedback'));
    gate(document.getElementById('dynModeSelect'), unlocked('mode'));
    gate(document.getElementById('dynSidechainSelect'), unlocked('sidechain'));
    gate(document.getElementById('dynUpwardEnable'), unlocked('upwardEnabled'));

    if (this.compressorUI) {
      // The canvas only ever edits threshold + ratio, and it must honour the SAME
      // gate as the knobs: a locked ratio could otherwise still be dragged.
      this.compressorUI.setInteractive({
        threshold: unlocked('threshold'),
        ratio: unlocked('ratio')
      });
    }
  }

  /** Reacts to a freshly loaded scenario: refresh the sidechain picker + prompt. */
  _onDynamicsScenario(info) {
    if (!info) return;
    this._populateDynamicsSidechain(info);
    this._syncHeaderSource(info.sourceId, info.sourceName);
    const srcName = info.sourceName || info.sourceId || '';
    const hasKey = !!(info.sidechain && info.sidechain.exists);
    this._setDynamicsPrompt(`Fuente: ${srcName}${hasKey ? ' · sidechain disponible' : ''}`);
    // A single-source scenario cannot keep a stale sidechain tap.
    if (!hasKey && this.audio) {
      this._dynSidechainValue = '';
      this.audio.setDynamicsConfig({ sidechainStemId: null });
    }
  }

  /**
   * Rebuilds the sidechain dropdown. It only ever offers routes that can
   * actually be wired (the target and the key must be stems of the SAME
   * session), so it is driven by the validated DYNAMICS_SIDECHAIN_CASES presets
   * rather than by every stem of the loaded session. The whole rail block stays
   * hidden while no usable route exists.
   * @param {object} [info] scenario descriptor (SCENARIO_LOADED / CASE / CHALLENGE)
   */
  _populateDynamicsSidechain(info) {
    const select = document.getElementById('dynSidechainSelect');
    const block = document.getElementById('dynSidechainBlock');
    if (!select) return;
    select.innerHTML = '<option value="">— (auto / ninguno) —</option>';

    const addOption = (value, label) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    };

    const session = this.audio ? this.audio.currentMultitrackSession : null;
    const sessionId = (info && info.sidechain && info.sidechain.sessionId)
      || (session && session.id)
      || null;

    let offered = 0;
    const seen = new Set();

    // 1. Didactic presets of the session in play (validated against the catalogue).
    describeSidechainCases(sessionId).forEach((preset) => {
      const value = `${preset.sessionId}::${preset.keyStemId}::${preset.targetStemId}`;
      if (seen.has(value)) return;
      seen.add(value);
      addOption(value, `${preset.label} · ${preset.keyName} → ${preset.targetName}`);
      offered += 1;
    });

    // 2. The scenario's own declared key, when it has one.
    if (info && info.sidechain && info.sidechain.exists) {
      const value = `${info.sidechain.sessionId}::${info.sidechain.stemId}`;
      if (!seen.has(value)) {
        seen.add(value);
        addOption(value, `${info.sidechain.stemName || info.sidechain.stemId} (${info.sidechain.sessionName || info.sidechain.sessionId})`);
        offered += 1;
      }
    }

    // 3. Free stems, only while a routed scenario is open (never in the sandbox).
    const routed = !!(info && info.sidechain && info.sidechain.exists);
    if (routed && session && Array.isArray(session.stems)) {
      session.stems.forEach(st => {
        if (st.id === session.targetStem) return;
        const value = `${session.id}::${st.id}`;
        if (seen.has(value)) return;
        seen.add(value);
        addOption(value, `${st.displayName || st.id} (${session.displayName || session.id})`);
        offered += 1;
      });
    }

    if (block) block.hidden = offered === 0;
    select.disabled = offered === 0;
    this._dynSidechainValue = '';
    select.value = '';
  }

  /** Shows the qualitative verdict after a guided-practice submission (no score). */
  _onDynamicsResult(payload) {
    const r = (payload && payload.result) || {};
    // De-gamified: never surface the numeric score; strip any "(NN%)" left in the
    // engine's message so the step reads as coaching, not grading.
    const raw = r.feedbackMessage || (r.isCorrect ? '¡Buen ajuste!' : 'Sigue afinando el carácter.');
    const msg = String(raw).replace(/\s*\(\s*\d+\s*%\s*\)/g, '');
    this._setDynamicsPrompt(`Práctica: ${msg}`);
    this._renderPracticeChecklist(payload && payload.achievements);
    const submit = document.getElementById('dynSubmitBtn');
    if (submit) {
      submit.textContent = 'Siguiente ➔';
      submit.disabled = false;
      submit.classList.remove('btn-submit-disabled');
    }
    this._dynAwaitingNext = true;
  }

  /**
   * Renders the qualitative achievements checklist for a guided-practice step
   * (replaces the scored "puntos" readout; reuses the verdict-list styling).
   * @param {Array<{key:string,state:string,text:string}>} [achievements]
   */
  _renderPracticeChecklist(achievements) {
    const host = document.getElementById('dynCaseVerdict');
    if (!host) return;
    host.innerHTML = '';
    if (!Array.isArray(achievements) || !achievements.length) { host.classList.add('hidden'); return; }

    const title = document.createElement('div');
    title.className = 'dyn-verdict-title';
    title.textContent = 'Logros de este paso';
    host.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'dyn-verdict-list';
    achievements.forEach((a) => {
      const state = a && a.state === 'ok' ? 'ok' : a && a.state === 'close' ? 'close' : 'bad';
      const li = document.createElement('li');
      li.className = `dyn-verdict-row ${state}`;

      const mark = document.createElement('span');
      mark.className = 'dyn-verdict-mark';
      mark.textContent = state === 'ok' ? '✓' : state === 'close' ? '≈' : '✗';

      const label = document.createElement('span');
      label.className = 'dyn-verdict-label';
      label.textContent = (a && a.text) || '';

      li.appendChild(mark);
      li.appendChild(label);
      list.appendChild(li);
    });
    host.appendChild(list);
    host.classList.remove('hidden');
  }

  /** Shows the light self-check verdict for a Case Study (per-control verdicts). */
  _onCaseChecked(result) {
    if (!result) return;
    const passed = !!result.passed;
    const wrong = (result.notes || []).filter((n) => !n.ok).length;
    this._setDynamicsPrompt(
      passed
        ? '✅ ¡Objetivo cumplido! Receta conseguida.'
        : `Aún no: ${wrong} control(es) fuera de rango (marcados ✗). Corrígelos y vuelve a comprobar.`
    );
    this._renderCaseVerdict(result.notes);
  }

  /** Label + value formatter for a DSP / curriculum parameter key. */
  _dynParamMeta(key) {
    const meta = {
      thresholdDb: { label: 'Threshold', fmt: v => `${(+v).toFixed(1)} dB` },
      ratio: { label: 'Ratio', fmt: v => `${(+v).toFixed(2)}:1` },
      kneeDb: { label: 'Knee', fmt: v => `${(+v).toFixed(1)} dB` },
      attackMs: { label: 'Attack', fmt: v => `${(+v).toFixed(1)} ms` },
      releaseMs: { label: 'Release', fmt: v => `${Math.round(+v)} ms` },
      holdMs: { label: 'Hold', fmt: v => `${(+v).toFixed(1)} ms` },
      makeupDb: { label: 'Makeup', fmt: v => `${(+v).toFixed(1)} dB` },
      mix: { label: 'Mix', fmt: v => `${Math.round(+v * 100)} %` },
      upwardEnabled: { label: 'Compresión al alza', fmt: v => (v ? 'Activada' : 'Desactivada') },
      upwardThresholdDb: { label: 'Umbral ↑', fmt: v => `${(+v).toFixed(1)} dB` },
      upwardRatio: { label: 'Ratio ↑', fmt: v => `${(+v).toFixed(2)}:1` },
      style: { label: 'Tipo', fmt: v => String(v || '').toUpperCase() },
      detector: { label: 'Detector', fmt: v => String(v || '').toUpperCase() },
      feedback: { label: 'Topología', fmt: v => (v ? 'Feedback' : 'Feed-forward') },
      sidechain: { label: 'Sidechain', fmt: v => (v ? 'Activado' : 'Desactivado') }
    };
    return meta[key] || { label: key, fmt: v => String(v) };
  }

  /** Renders the per-control ✓/✗ verdict list for a Case self-check. */
  _renderCaseVerdict(notes) {
    const host = document.getElementById('dynCaseVerdict');
    if (!host) return;
    host.innerHTML = '';
    if (!notes || !notes.length) { host.classList.add('hidden'); this._dynVerdictView = null; return; }
    // Remember which view the panel shows so the "Comprobar" button can toggle
    // itself off (minimise) when pressed a second time without changing values.
    this._dynVerdictView = 'verdict';

    const title = document.createElement('div');
    title.className = 'dyn-verdict-title';
    title.textContent = 'Comprobación de la receta';
    host.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'dyn-verdict-list';
    notes.forEach((n) => {
      const meta = this._dynParamMeta(n.param);
      const li = document.createElement('li');
      li.className = 'dyn-verdict-row' + (n.ok ? ' ok' : ' bad');

      const mark = document.createElement('span');
      mark.className = 'dyn-verdict-mark';
      mark.textContent = n.ok ? '✓' : '✗';

      const label = document.createElement('span');
      label.className = 'dyn-verdict-label';
      label.textContent = meta.label;

      const value = document.createElement('span');
      value.className = 'dyn-verdict-value';
      value.textContent = meta.fmt(n.value);

      const note = document.createElement('span');
      note.className = 'dyn-verdict-note';
      note.textContent = n.note || '';

      li.appendChild(mark);
      li.appendChild(label);
      li.appendChild(value);
      li.appendChild(note);
      list.appendChild(li);
    });
    host.appendChild(list);

    const reveal = document.getElementById('dynRevealBtn');
    if (reveal) reveal.classList.remove('hidden');
    host.classList.remove('hidden');
  }

  /** Renders the case's reference recipe (self-review after a check). */
  _renderCaseReference(target) {
    const host = document.getElementById('dynCaseVerdict');
    if (!host || !target) return;
    host.innerHTML = '';
    // The panel now shows the reference recipe (not the live verdict).
    this._dynVerdictView = 'reference';
    const title = document.createElement('div');
    title.className = 'dyn-verdict-title';
    title.textContent = 'Receta de referencia';
    host.appendChild(title);

    const order = [
      'style', 'thresholdDb', 'ratio', 'kneeDb', 'attackMs', 'releaseMs',
      'makeupDb', 'detector', 'feedback', 'upwardEnabled', 'upwardThresholdDb',
      'upwardRatio', 'sidechain'
    ];
    const list = document.createElement('ul');
    list.className = 'dyn-verdict-list';
    order.forEach((k) => {
      if (!(k in target)) return;
      const meta = this._dynParamMeta(k);
      const li = document.createElement('li');
      li.className = 'dyn-verdict-row ref';
      const label = document.createElement('span');
      label.className = 'dyn-verdict-label';
      label.textContent = meta.label;
      const value = document.createElement('span');
      value.className = 'dyn-verdict-value';
      value.textContent = meta.fmt(target[k]);
      li.appendChild(label);
      li.appendChild(value);
      list.appendChild(li);
    });
    host.appendChild(list);
    host.classList.remove('hidden');
  }

  /** Clears the case verdict panel and hides the reveal action. */
  _clearCaseVerdict() {
    const host = document.getElementById('dynCaseVerdict');
    if (host) { host.innerHTML = ''; host.classList.add('hidden'); }
    const reveal = document.getElementById('dynRevealBtn');
    if (reveal) {
      reveal.classList.add('hidden');
      reveal.setAttribute('aria-pressed', 'false');
    }
    const submit = document.getElementById('dynSubmitBtn');
    if (submit) submit.setAttribute('aria-pressed', 'false');
    this._dynVerdictView = null;
    this._dynLastCheckSig = null;
  }

  /**
   * Minimises (toggles off) the case verdict/reference panel only, without
   * tearing down the Case Study itself: the "Revelar referencia" and "Comprobar"
   * buttons stay available so the learner can re-open either view at will.
   */
  _hideCaseVerdictPanel() {
    const host = document.getElementById('dynCaseVerdict');
    if (host) { host.innerHTML = ''; host.classList.add('hidden'); }
    this._dynVerdictView = null;
  }

  /** Sets the dock prompt text (shared by every sub-mode). */
  _setDynamicsPrompt(text) {
    const el = document.getElementById('dynChallengePrompt');
    if (el) el.textContent = text;
  }

  /**
   * Mirrors the source the Dynamic Range lab just loaded into the header source
   * picker (native <select> + its custom dropdown header). This keeps the visible
   * source name consistent with the audio that is actually playing. Setting
   * `select.value` programmatically does NOT fire 'change', so it never triggers
   * an unintended EQ source reload.
   * @param {string} sourceId
   * @param {string} [sourceName]
   */
  _syncHeaderSource(sourceId, sourceName) {
    const select = document.getElementById('sourceSelect');
    if (!select || !sourceId) return;

    let exists = false;
    for (const opt of select.options) {
      if (opt.value === sourceId) { exists = true; break; }
    }
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = sourceId;
      opt.textContent = sourceName || sourceId;
      select.appendChild(opt);
    }

    select.value = sourceId;
    if (this.gameLoop && this.gameLoop.store) this.gameLoop.store.activeTrackId = sourceId;

    const header = document.querySelector('#sourceDropdownWrapper .custom-select-header');
    if (header) {
      header.textContent = sourceName
        || (select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent : sourceId);
    }
    document.querySelectorAll('#sourceDropdownWrapper .custom-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.value === sourceId);
    });
  }

  /**
   * Pins the header Fuente picker for the guided practices: while a Case Study is
   * open the audible source must stay the one the recipe was written for, so
   * switching it is blocked (and made obvious) instead of silently changing the
   * exercise. Restored by exitDynamicsLab().
   * @param {boolean} locked
   */
  _lockDynamicsSource(locked) {
    const wrapper = document.getElementById('sourceDropdownWrapper');
    if (wrapper) wrapper.classList.toggle('source-locked', !!locked);
    const select = document.getElementById('sourceSelect');
    if (select) select.disabled = !!locked;
  }

  /** Loads the initial content for the chosen sub-mode. */
  async _loadDynamicsForMode(mode) {
    const lab = this.dynamicsLab;
    if (!lab) return;

    // The per-track suggestions are meaningful for the sandbox/training modes;
    // in Case mode the Fuente is pinned to the recipe, so the button is hidden.
    const suggestBtnEl = document.getElementById('dynSuggestBtn');
    if (suggestBtnEl) suggestBtnEl.classList.toggle('hidden', mode === DYNAMICS_LAB_MODES.CASE);

    // Descriptor of the scenario we actually load, so the header source picker
    // can be kept truthful (its label must name the source we play).
    let descriptor = null;

    // Resolve the sandbox / theory source: the highest-quality capture available
    // is the dry studio kick ("Bombo Estudio (Seco)" -> sourceId 'v_kick').
    const exploreScenario = () => {
      const buses = listExploreScenarios();
      const allScenarios = buses.flatMap(b => (b.scenarios || []));
      const preferred = allScenarios.find(s => s && s.sourceExists && s.sourceId === 'v_kick');
      const firstBus = buses.find(b => b.scenarios && b.scenarios.length);
      const fallback = firstBus ? firstBus.scenarios.find(s => s && s.sourceExists) : null;
      return preferred || fallback || null;
    };

    if (mode === DYNAMICS_LAB_MODES.CHALLENGE) {
      const payload = await lab.startChallenge(0);
      descriptor = (payload && payload.scenario) || null;
    } else if (mode === DYNAMICS_LAB_MODES.CASE) {
      const cases = lab.getCaseStudies();
      if (cases && cases.length) {
        const payload = await lab.loadCase(cases[0].id);
        descriptor = (payload && payload.scenario) || null;
      }
    } else if (mode === DYNAMICS_LAB_MODES.THEORY) {
      // Theory still needs an audible stem for the live Attack/Release demo, and
      // loadExploreScenario() forces EXPLORE, so re-assert THEORY afterwards.
      const scen = exploreScenario();
      if (scen) descriptor = await lab.loadExploreScenario(scen.id);
      lab.setMode(DYNAMICS_LAB_MODES.THEORY);
    } else {
      const scen = exploreScenario();
      if (scen) descriptor = await lab.loadExploreScenario(scen.id);
    }

    // Keep the header source selector in sync with what is playing, then announce
    // the loaded material in the dock (without clobbering the Case/Challenge line).
    if (descriptor) this._syncHeaderSource(descriptor.sourceId, descriptor.sourceName);
    if (mode === DYNAMICS_LAB_MODES.THEORY) {
      this._setDynamicsPrompt(
        'Teoría de la dinámica: repasa cada concepto y arrastra los deslizadores de Attack/Release de la demo para escuchar su efecto sobre la fuente cargada.'
      );
      if (descriptor) this._renderDynamicsSuggestions(descriptor.sourceId);
    } else if (mode === DYNAMICS_LAB_MODES.EXPLORE && descriptor) {
      const srcName = descriptor.sourceName || descriptor.sourceId || '';
      const hasKey = !!(descriptor.sidechain && descriptor.sidechain.exists);
      this._setDynamicsPrompt(
        `Fuente: ${srcName}${hasKey ? ' · sidechain disponible' : ''} — mueve los controles y observa la curva, la forma de onda y la línea de ganancia (fader ultrarrápido) en vivo.`
      );
      // Surface the per-track compression recipes for the loaded source.
      this._renderDynamicsSuggestions(descriptor.sourceId);
    }

    this._syncDynamicsControls();

    // Audition immediately: the click that opened the mode is a valid gesture.
    try { if (this.audio && typeof this.audio.play === 'function') this.audio.play(0); } catch (_) { /* ignore */ }
    this.updatePlayButton();
  }

  /** Tears the Dynamic Range lab down and restores the EQ workspace. */
  exitDynamicsLab() {
    this.dynamicsActive = false;
    // Item 3: restore the EQ workspace labels + a sane A/B default.
    this._setHeaderABLabels(false);
    this.updateABButtons('A');

    if (this.compressorUI) { try { this.compressorUI.stop(); } catch (_) { /* ignore */ } }
    if (this.scopeRenderer) {
      try { this.scopeRenderer.destroy(); } catch (_) { /* ignore */ }
      this.scopeRenderer = null;
    }
    if (this.tooltipController) {
      try { this.tooltipController.setEnabled(false); this.tooltipController.setTeaching(false); this.tooltipController.hide(); } catch (_) { /* ignore */ }
    }

    if (this.audio) {
      try { this.audio.setDynamicsTelemetryHandler(null); } catch (_) { /* ignore */ }
      try { this.audio.teardownDynamics(); } catch (_) { /* ignore */ }
    }

    if (this.theoryPanel) {
      try { this.theoryPanel.destroy(); } catch (_) { /* ignore */ }
      this.theoryPanel = null;
    }
    // Restore the gamified chrome for the EQ module.
    this._setGameHudVisible(true);

    this.dynamicsLab = null;
    this._dynControlsBound = false;
    this._dynAwaitingNext = false;
    this._dynSidechainValue = '';

    const panel = document.getElementById('dynamicsPanel');
    if (panel) panel.classList.add('hidden');
    const theoryHost = document.getElementById('theoryPanel');
    if (theoryHost) theoryHost.classList.add('hidden');
    const dock = document.getElementById('dynamicsDockSection');
    if (dock) dock.classList.add('hidden');

    this._setEqChromeVisible(true);
    this._lockDynamicsSource(false);
    const diffGroup = document.getElementById('difficultyGroup');
    if (diffGroup) diffGroup.classList.remove('hidden');
    if (this.visualizer && typeof this.visualizer.start === 'function') this.visualizer.start();

    this.setAppState('MODULE_SELECT');
  }

  /** Shows/hides the EQ workspace chrome so it never fights the compressor panel. */
  _setEqChromeVisible(visible) {
    const analyzer = document.getElementById('analyzerControls');
    if (analyzer) analyzer.style.display = visible ? 'flex' : 'none';

    const canvas = document.getElementById('visualizerCanvas');
    if (canvas) canvas.style.visibility = visible ? '' : 'hidden';

    const manual = document.getElementById('manualModeSection');
    if (manual) manual.classList.toggle('hidden', !visible);

    const stem = document.getElementById('stemMixerPanel');
    if (stem && !visible) stem.classList.add('hidden');

    if (!visible) {
      const workspaceEl = document.getElementById('workspace');
      if (workspaceEl) workspaceEl.classList.remove('mixer-open');
    }
  }

  /**
   * Locks/unlocks the header difficulty selector. During play it behaves as a
   * non-interactive chip so it no longer invites mid-session taps.
   * @param {boolean} locked
   */
  setDifficultyChipsLocked(locked) {
    const group = document.querySelector('.mode-group');
    if (group) group.classList.toggle('locked', locked);
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.disabled = !!locked;
    });
  }

  populateSourceDropdown() {
    const select = document.getElementById('sourceSelect');
    if (!select) return;
    const prev = select.value;
    select.innerHTML = '';

    // Item 2: lead with the headline action — work on YOUR OWN track.
    const uploadOpt = document.createElement('option');
    uploadOpt.value = 'upload-custom';
    uploadOpt.textContent = '🎶 Cargar tu propia pista...';
    select.appendChild(uploadOpt);

    // Group tracks by category, then render in a curated, purposeful order.
    const byCategory = new Map();
    AUDIO_SOURCES.forEach(track => {
      const category = track.category || 'Otros';
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(track);
    });

    const PREFERRED_ORDER = [
      'Nivel 1: Aislamiento',
      'Nivel 4: Mezcla y Voces',
      'Sesiones Multitrack',
      'Nivel 2: Micrófonos Cercanos',
      'Nivel 3: Acústica y Sala',
      'Generadores'
    ];
    const orderedCategories = [
      ...PREFERRED_ORDER.filter(c => byCategory.has(c)),
      ...[...byCategory.keys()].filter(c => !PREFERRED_ORDER.includes(c))
    ];

    orderedCategories.forEach(category => {
      const group = document.createElement('optgroup');
      group.label = category;
      byCategory.get(category).forEach(track => {
        const opt = document.createElement('option');
        opt.value = track.id;
        opt.textContent = track.displayName;
        group.appendChild(opt);
      });
      select.appendChild(group);
    });

    // Keep a valid, real source selected (never leave the upload action active).
    const realIds = AUDIO_SOURCES.map(t => t.id);
    const fallbackId = (AUDIO_SOURCES[0] && AUDIO_SOURCES[0].id) || null;
    if (prev && prev !== 'upload-custom' && realIds.includes(prev)) select.value = prev;
    else if (fallbackId) select.value = fallbackId;

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

    // Target EQ Swap Button — rerolls the active target (lifeline)
    const swapTargetBtn = document.getElementById('swapTargetBtn');
    if (swapTargetBtn) {
      swapTargetBtn.addEventListener('click', () => {
        if (this.targetSwapsRemaining <= 0) return;

        // For a multitrack session, also move the trained instrument so the
        // lifeline is not merely a cosmetic counter.
        const mtSession = this.audio.currentMultitrackSession;
        if (mtSession) {
          this.randomizeTargetStem(mtSession);
        }

        if (this.trainer) {
          this.trainer.startNewTrial();
          this.renderQuizInterface();
        }

        this.targetSwapsRemaining--;
        const badge = document.getElementById('swapCountBadge');
        if (badge) badge.textContent = `${this.targetSwapsRemaining}/3`;

        if (this.targetSwapsRemaining === 0) {
          swapTargetBtn.disabled = true;
          swapTargetBtn.classList.add('disabled');
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
        this.audio.updateUserEQ(this.visualizer.interactiveNodes);
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
        // Item 3: inside the lab, A = DYN OFF → true-bypass (dry output).
        if (this.dynamicsActive && this.dynamicsLab) {
          this.dynamicsLab.setBypass(true);
          return;
        }
        this.audio.setRoute('A');
        this.updateABButtons('A');
        this.hasListenedA = true;
        this.updateValidationState();
      });
    }

    if (btnB) {
      btnB.addEventListener('click', () => {
        // Item 3: inside the lab, B = DYN ON → compression engaged.
        if (this.dynamicsActive && this.dynamicsLab) {
          this.dynamicsLab.setBypass(false);
          return;
        }
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
          // While the Dynamic Range lab is open, keep the contextual compression
          // suggestions in step with the newly picked source (skipped in Case
          // mode, where the audible source is pinned to the recipe on screen).
          if (this.dynamicsActive && this.dynamicsLab
            && this.dynamicsLab.mode !== DYNAMICS_LAB_MODES.CASE) {
            this._onDynamicsSourcePicked(e.target.value);
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
        if (this.audio && !this.audio.isPlaying) {
          this.audio.play();
          this.updatePlayButton();
        }
      });
    }
    if (pBtnListenGuess) {
      pBtnListenGuess.addEventListener('click', () => {
        this.audio.setRoute('C'); // C = User Guess
        this.updateABButtons('C');
        this.hasListenedB = true;
        if (this.audio && !this.audio.isPlaying) {
          this.audio.play();
          this.updatePlayButton();
        }
      });
    }
    if (pBtnListenFlat) {
      pBtnListenFlat.addEventListener('click', () => {
        this.audio.setRoute('A'); // A = Clean / Flat
        this.updateABButtons('A');
        if (this.audio && !this.audio.isPlaying) {
          this.audio.play();
          this.updatePlayButton();
        }
      });
    }

    const bannerNextBtn = document.getElementById('bannerNextBtn');
    if (bannerNextBtn) {
      bannerNextBtn.addEventListener('click', () => {
        // If showPedagogicalReview deferred a terminal / level-up modal, open it
        // now: the player has already read and heard the didactic review, and the
        // modal's own buttons drive the next step (retry / restart / continue).
        if (this.openPendingOutcomeModal()) return;

        const resultsSection = document.getElementById('resultsDockSection');
        if (resultsSection) resultsSection.classList.add('hidden');
        if (this.visualizer) {
          this.visualizer.showTargetCurve = false;
          this.visualizer.showUserCurve = false;
        }

        this.pendingOutcomeModal = null;
        this.gameLoop.nextTrial();
        // Vary the trained instrument every trial so a session never always asks
        // about the same stem (e.g. the symphonic "Main Pair").
        this.rotateMultitrackTarget();
        this.trainer.stage = this.gameLoop.store.currentStage;
        this.trainer.startNewTrial();
        this.renderQuizInterface();
      });
    }

    // ---- Workstream A: Boss / level-up / campaign-complete modal exit actions ----
    const btnContinueLevelUp = document.getElementById('btnContinueLevelUp');
    if (btnContinueLevelUp) {
      btnContinueLevelUp.addEventListener('click', () => {
        const modal = document.getElementById('levelUpModal');
        if (modal) modal.classList.remove('active');
        this.advanceToNextTrial();
      });
    }

    const btnRetryBoss = document.getElementById('btnRetryBoss');
    if (btnRetryBoss) {
      btnRetryBoss.addEventListener('click', () => {
        const modal = document.getElementById('bossDefeatModal');
        if (modal) modal.classList.remove('active');
        if (this.gameLoop) this.gameLoop.store.currentStage = 4;
        this.advanceToNextTrial();
      });
    }

    const btnCampaignCompleteMenu = document.getElementById('btnCampaignCompleteMenu');
    if (btnCampaignCompleteMenu) {
      btnCampaignCompleteMenu.addEventListener('click', () => this.returnToMainMenu());
    }
    // ---- end Workstream A ----

    const restartGameBtn = document.getElementById('restartGameBtn');
    if (restartGameBtn) {
      restartGameBtn.addEventListener('click', () => {
        if (this.gameLoop && this.gameLoop.resetSession) this.gameLoop.resetSession();
        if (this.trainer && this.trainer.resetSession) this.trainer.resetSession();

        const gameOverModal = document.getElementById('gameOverModal');
        if (gameOverModal) gameOverModal.classList.remove('active');

        this.setAppState('MODULE_SELECT');
      });
    }
  }

  updateTrainerAcousticClass(trackId) {
    if (!this.trainer) return;
    this.trainer.currentAcousticClass = 'generic';
    this.trainer.sourceAcousticClass = 'generic';
    this.trainer.isSyntheticMode = false;
    this.trainer.isMultitrackSession = false;
    this.trainer.currentTargetStemName = null;

    const source = AUDIO_SOURCES.find(s => s.id === trackId);
    if (source) {
      if (source.acousticClass) {
        this.trainer.currentAcousticClass = source.acousticClass;
        this.trainer.sourceAcousticClass = source.acousticClass;
      }
      if (source.isSynthetic) this.trainer.isSyntheticMode = true;
      return;
    }

    const session = MULTITRACK_SESSIONS.find(s => s.id === trackId);
    if (session) {
      // Randomize which stem the filter targets so a session never always
      // trains the same instrument (e.g. always the main pair / kick).
      this.randomizeTargetStem(session);
    }
  }

  /**
   * Points a multitrack session's target at a specific stem and syncs the
   * trainer's lesson class. Re-renders the mixer when that session is on screen.
   * @param {Object|string} sessionOrId Session object or session id
   * @param {string} stemId Stem id to become the new target
   */
  setTargetStem(sessionOrId, stemId) {
    const session = typeof sessionOrId === 'string'
      ? MULTITRACK_SESSIONS.find(s => s.id === sessionOrId)
      : sessionOrId;
    if (!session || !Array.isArray(session.stems)) return;

    const stem = session.stems.find(st => st.id === stemId);
    if (!stem) return;

    session.targetStem = stem.id;

    if (this.trainer) {
      const cls = stem.acousticClass || 'generic';
      this.trainer.currentAcousticClass = cls;
      this.trainer.sourceAcousticClass = cls;
      this.trainer.isSyntheticMode = false;
      // Tell the trainer we are inside a multitrack mix and which instrument is
      // being trained, so target generation/review can adapt accordingly.
      this.trainer.isMultitrackSession = true;
      this.trainer.currentTargetStemName = stem.displayName || stem.name || stem.id;
    }

    // Keep the mixer badge in sync if this session is the one being displayed,
    // and re-apply the Target Spotlight ducking (it keys off session.targetStem,
    // so it must be refreshed whenever the trained instrument changes).
    const active = this.audio.currentMultitrackSession;
    if (active && active.id === session.id) {
      this.renderStemMixer(session);
      if (this.audio && typeof this.audio.updateStemVolumes === 'function') {
        this.audio.updateStemVolumes();
      }
    }
  }

  /**
   * Rerolls the target stem of a multitrack session (used on load and by the
   * Target Swap lifeline) so the trained instrument varies between trials.
   * @param {Object|string} sessionOrId Session object or session id
   */
  randomizeTargetStem(sessionOrId) {
    const session = typeof sessionOrId === 'string'
      ? MULTITRACK_SESSIONS.find(s => s.id === sessionOrId)
      : sessionOrId;
    if (!session) return;

    const next = pickRandomTargetStem(session, session.targetStem);
    if (next) this.setTargetStem(session, next.id);
  }

  hideStemMixer() {
    const panel = document.getElementById('stemMixerPanel');
    if (panel) panel.classList.add('hidden');
    const workspaceEl = document.getElementById('workspace');
    if (workspaceEl) workspaceEl.classList.remove('mixer-open');
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
    const workspaceEl = document.getElementById('workspace');
    if (workspaceEl) workspaceEl.classList.add('mixer-open');
    title.textContent = mtSession.displayName || mtSession.name || 'Multitrack Session';
    tracksContainer.innerHTML = '';

    if (this.stemVuMeters) {
      this.stemVuMeters.forEach(m => m.stop());
    }
    this.stemVuMeters = [];

    mtSession.stems.forEach((stem) => {
      const trackDiv = document.createElement('div');
      trackDiv.className = 'stem-track flex flex-col gap-2 p-2 bg-slate-800 rounded';

      const label = document.createElement('span');
      label.className = 'text-xs text-slate-400 font-bold flex items-center gap-2';
      label.textContent = stem.displayName || stem.name;

      if (mtSession.targetStem && stem.id === mtSession.targetStem) {
        const targetBadge = document.createElement('span');
        targetBadge.className = 'badge bg-primary text-white text-[10px] px-1 py-0.5 rounded';
        targetBadge.textContent = '🎯 TARGET';
        targetBadge.title = 'Este es el instrumento afectado por el filtro';
        label.appendChild(targetBadge);

        // Also highlight the track container lightly
        trackDiv.style.border = '1px solid rgba(56, 189, 248, 0.3)';
        trackDiv.style.backgroundColor = 'rgba(15, 23, 42, 0.6)';
      }

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

      muteBtn.onclick = () => {
        this.audio.setStemState(stem.id, 'mute');
        muteBtn.classList.toggle('active', this.audio.stemStates[stem.id].muted);
        if (this.audio.stemStates[stem.id].muted) soloBtn.classList.remove('active');
        this.hasInteracted = true;
        this.updateValidationState();
      };

      soloBtn.onclick = () => {
        this.audio.setStemState(stem.id, 'solo');
        soloBtn.classList.toggle('active', this.audio.stemStates[stem.id].solo);
        if (this.audio.stemStates[stem.id].solo) muteBtn.classList.remove('active');
        this.hasInteracted = true;
        this.updateValidationState();
      };

      const stemControls = document.createElement('div');
      stemControls.className = 'stem-controls';
      stemControls.appendChild(muteBtn);
      stemControls.appendChild(soloBtn);

      controlsRow.appendChild(stemControls);

      const faderContainer = document.createElement('div');
      faderContainer.className = 'stem-fader-container';
      faderContainer.style.position = 'relative';
      faderContainer.style.height = '14px';
      faderContainer.style.display = 'flex';
      faderContainer.style.alignItems = 'center';
      faderContainer.style.borderRadius = '3px';
      faderContainer.style.overflow = 'visible';
      faderContainer.style.background = '#0b0c10';
      faderContainer.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.8)';
      faderContainer.style.padding = '0';
      faderContainer.style.width = '100%';

      const canvas = document.createElement('canvas');
      canvas.id = 'vuMeter-' + stem.id;
      canvas.width = 150;
      canvas.height = 14;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.pointerEvents = 'none';
      faderContainer.appendChild(canvas);

      const volSlider = document.createElement('input');
      volSlider.type = 'range';
      volSlider.className = 'fader-fused';
      volSlider.min = '0';
      volSlider.max = '1';
      volSlider.step = '0.01';
      const initialVol = this.audio.stemStates && this.audio.stemStates[stem.id] && this.audio.stemStates[stem.id].volume !== undefined ? this.audio.stemStates[stem.id].volume : '1.0';
      volSlider.value = initialVol;
      volSlider.style.width = '100%';
      volSlider.style.height = '100%';
      volSlider.style.margin = '0';
      volSlider.style.position = 'relative';
      volSlider.style.zIndex = '10';
      volSlider.style.opacity = '1';

      volSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        if (typeof this.audio.setStemVolume === 'function') {
          this.audio.setStemVolume(stem.id, val);
        }
        this.hasInteracted = true;
        this.updateValidationState();
      };

      faderContainer.appendChild(volSlider);
      controlsRow.appendChild(faderContainer);
      trackDiv.appendChild(controlsRow);
      tracksContainer.appendChild(trackDiv);
    });

    // Target Spotlight: duck the non-target stems so the EQ'd instrument sits
    // forward and its filter is clearly audible inside the dense mix. Applied
    // equally to routes A/B/C, so the A/B comparison stays fair.
    const spotlightBtn = document.getElementById('spotlightToggleBtn');
    if (spotlightBtn) {
      const syncSpotlightBtn = () => {
        const on = !!this.audio.spotlightEnabled;
        spotlightBtn.textContent = on ? '\uD83C\uDFAF Focus ON' : '\uD83C\uDFAF Focus OFF';
        spotlightBtn.classList.toggle('active', on);
        spotlightBtn.title = on
          ? 'Enfoque activo: los demás stems bajan 6 dB para oír mejor el objetivo'
          : 'Enfoque desactivado: mezcla completa sin atenuar';
      };
      spotlightBtn.onclick = () => {
        if (typeof this.audio.setSpotlight === 'function') {
          this.audio.setSpotlight(!this.audio.spotlightEnabled);
        }
        syncSpotlightBtn();
      };
      syncSpotlightBtn();
    }

    // Ensure VU meters bind correctly if already playing when opened
    this.rebindVuMeters();
  }

  rebindVuMeters() {
    if (!this.audio.currentMultitrackSession || !this.audio.stemAnalysers) return;
    if (this.stemVuMeters) {
      this.stemVuMeters.forEach(m => m.stop());
    }
    this.stemVuMeters = [];
    this.audio.currentMultitrackSession.stems.forEach(stem => {
      if (this.audio.stemAnalysers[stem.id]) {
        const canvasEl = document.getElementById(`vuMeter-${stem.id}`);
        if (canvasEl) {
          const vu = new VUMeter(`vuMeter-${stem.id}`, this.audio.stemAnalysers[stem.id]);
          this.stemVuMeters.push(vu);
          if (this.audio.isPlaying) vu.start();
        }
      }
    });
  }

  updateValidationState() {
    const hintText = document.getElementById('auditionHintText');
    const hintBar = document.getElementById('auditionStatusHint');
    const submitBtn = document.getElementById('submitGuessBtn');

    const isModeEasy = this.trainer.difficulty === 'easy';
    const isValid = isModeEasy ? (this.hasListenedA && this.hasListenedB) : this.hasInteracted;

    if (hintBar && hintText) {
      if (!isModeEasy && !this.hasInteracted) {
        hintText.textContent = 'Ajusta los controles o arrastra el punto para proponer tu respuesta.';
        hintBar.classList.remove('ready');
      } else if (isModeEasy && (!this.hasListenedA || !this.hasListenedB)) {
        if (!this.hasListenedA && !this.hasListenedB) {
          hintText.textContent = 'Escucha "EQ Off" y "EQ On" para responder.';
        } else if (!this.hasListenedA) {
          hintText.textContent = 'Falta escuchar "EQ Off".';
        } else {
          hintText.textContent = 'Falta escuchar "EQ On".';
        }
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

    const pBtnTarget = document.getElementById('pBtnListenTarget');
    const pBtnGuess = document.getElementById('pBtnListenGuess');
    const pBtnFlat = document.getElementById('pBtnListenFlat');

    [pBtnTarget, pBtnGuess, pBtnFlat].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (activeRoute === 'A' && pBtnFlat) pBtnFlat.classList.add('active');
    else if (activeRoute === 'B' && pBtnTarget) pBtnTarget.classList.add('active');
    else if (activeRoute === 'C' && pBtnGuess) pBtnGuess.classList.add('active');
    else if (activeRoute === 'AUDITION' && pBtnTarget) pBtnTarget.classList.add('active');
  }

  /**
   * Swaps the header A/B toggle labels between the EQ workspace (EQ Off/On) and
   * the Dynamic Range lab (DYN OFF/DYN ON). Only the text changes — the ids and
   * classes stay intact so the existing click wiring keeps working.
   * @param {boolean} isDynamics
   */
  _setHeaderABLabels(isDynamics) {
    const btnA = document.getElementById('btnRouteA');
    const btnB = document.getElementById('btnRouteB');
    if (btnA) btnA.textContent = isDynamics ? 'DYN OFF' : 'EQ Off';
    if (btnB) btnB.textContent = isDynamics ? 'DYN ON' : 'EQ On';
  }

  /**
   * Mirrors the lab's true-bypass state onto the header A/B buttons and the dock
   * button. DYN OFF (bypassed = dry) lights the "A" side; DYN ON (compression
   * engaged) lights the "B" side.
   * @param {boolean} bypassed
   */
  _reflectDynamicsBypass(bypassed) {
    const on = !!bypassed;
    this.updateABButtons(on ? 'A' : 'B');
    const dockBtn = document.getElementById('dynBypassBtn');
    if (dockBtn) {
      dockBtn.setAttribute('aria-pressed', String(on));
      dockBtn.classList.toggle('active', on);
    }
  }

  /** Renders the cached "Pro Tips" tips into #dynTipsPanel (once). */
  _renderDynamicsTips() {
    const panel = document.getElementById('dynTipsPanel');
    if (!panel || panel.dataset.rendered === '1') return;
    panel.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'dyn-tips-header';
    header.textContent = '💡 Pro Tips — Rango Dinámico';
    panel.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'dyn-tips-grid';
    DYNAMICS_MASTER_TIPS.forEach(tip => {
      const card = document.createElement('article');
      card.className = 'dyn-tip-card';

      const tag = document.createElement('span');
      tag.className = 'dyn-tip-tag';
      tag.textContent = tip.tag || '';

      const title = document.createElement('h4');
      title.className = 'dyn-tip-title';
      title.textContent = tip.title || '';

      const body = document.createElement('p');
      body.className = 'dyn-tip-body';
      body.textContent = tip.body || '';

      card.appendChild(tag);
      card.appendChild(title);
      card.appendChild(body);
      grid.appendChild(card);
    });
    panel.appendChild(grid);
    panel.dataset.rendered = '1';
  }

  /** Returns the sourceId currently selected in the header Fuente picker. */
  _dynCurrentSourceId() {
    const select = document.getElementById('sourceSelect');
    if (select && select.value) return select.value;
    if (this.gameLoop && this.gameLoop.store && this.gameLoop.store.activeTrackId) {
      return this.gameLoop.store.activeTrackId;
    }
    return null;
  }

  /**
   * Renders the contextual compression suggestions into #dynSuggestPanel for the
   * selected Fuente: at least three recipes per instrument family, or the
   * mastering-oriented recipes when the track is a user-loaded (custom) file.
   * @param {string} [sourceId]
   */
  _renderDynamicsSuggestions(sourceId) {
    const panel = document.getElementById('dynSuggestPanel');
    if (!panel) return;
    const id = sourceId || this._dynCurrentSourceId();
    this._dynLastSourceId = id;

    const info = suggestDynamicsForSource(id);
    panel.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'dyn-suggest-header';
    const title = document.createElement('span');
    title.className = 'dyn-suggest-title';
    title.textContent = `🎚 Sugerencias de compresión — ${info.sourceName || info.familyLabel}`;
    const sub = document.createElement('span');
    sub.className = 'dyn-suggest-sub';
    sub.textContent = info.isCustom
      ? 'Pista cargada · parámetros propios de mastering'
      : `${info.familyLabel} · ${info.recipes.length} recetas`;
    header.appendChild(title);
    header.appendChild(sub);
    panel.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'dyn-suggest-grid';
    const ORDER = ['style', 'thresholdDb', 'ratio', 'kneeDb', 'attackMs', 'releaseMs', 'makeupDb', 'mix', 'detector'];
    info.recipes.forEach((recipe) => {
      const card = document.createElement('article');
      card.className = 'dyn-suggest-card';

      const label = document.createElement('h4');
      label.className = 'dyn-suggest-card-title';
      label.textContent = recipe.label || recipe.id;

      const ctx = document.createElement('p');
      ctx.className = 'dyn-suggest-context';
      ctx.textContent = recipe.context || '';

      const values = document.createElement('ul');
      values.className = 'dyn-suggest-values';
      ORDER.forEach((k) => {
        if (!(k in recipe.params)) return;
        const meta = this._dynParamMeta(k);
        const li = document.createElement('li');
        const keyEl = document.createElement('span');
        keyEl.className = 'dyn-suggest-k';
        keyEl.textContent = meta.label;
        const valEl = document.createElement('span');
        valEl.className = 'dyn-suggest-v';
        valEl.textContent = meta.fmt(recipe.params[k]);
        li.appendChild(keyEl);
        li.appendChild(valEl);
        values.appendChild(li);
      });

      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'btn btn-secondary dyn-suggest-apply';
      apply.textContent = 'Aplicar';
      apply.addEventListener('click', () => this._applyDynamicsSuggestion(recipe.params));

      card.appendChild(label);
      card.appendChild(ctx);
      card.appendChild(values);
      card.appendChild(apply);
      grid.appendChild(card);
    });
    panel.appendChild(grid);
  }

  /** Applies a suggested recipe to the live lab (Explorar / Teoría only). */
  _applyDynamicsSuggestion(params) {
    const lab = this.dynamicsLab;
    if (!lab || !params) return;
    if (lab.mode !== DYNAMICS_LAB_MODES.EXPLORE && lab.mode !== DYNAMICS_LAB_MODES.THEORY) {
      this._setDynamicsPrompt('Abre el modo Explorar para aplicar y escuchar las recetas sugeridas.');
      return;
    }
    try { lab.applyParams(params); } catch (_) { /* ignore */ }
    this._syncDynamicsControls();
    const styleName = params.style ? String(params.style).toUpperCase() : '';
    this._setDynamicsPrompt(
      `Receta aplicada${styleName ? ` (${styleName})` : ''}. Afina los controles y escucha el resultado en la curva y la onda.`
    );
  }

  /**
   * Reacts to a Fuente change while the Dynamic Range lab is open: refreshes the
   * suggestions panel and (in the Explorar sandbox) announces the new material.
   * @param {string} sourceId
   */
  _onDynamicsSourcePicked(sourceId) {
    if (!sourceId) return;
    this._renderDynamicsSuggestions(sourceId);
    const lab = this.dynamicsLab;
    if (!lab) return;
    if (lab.mode === DYNAMICS_LAB_MODES.EXPLORE) {
      const info = suggestDynamicsForSource(sourceId);
      this._setDynamicsPrompt(
        `Fuente: ${info.sourceName || sourceId} — ${info.familyLabel} · ${info.recipes.length} recetas sugeridas. Mueve los controles y observa la curva en vivo.`
      );
    }
  }

  renderHUD(store = this.gameLoop ? this.gameLoop.store : null) {
    if (!store) return;
    const scoreEl = document.getElementById('soundgymScore');
    const stageEl = document.getElementById('soundgymStage');
    const rankEl = document.getElementById('soundgymRank');

    // Authoritative score field is `totalScore` (was incorrectly read as `store.score`)
    const totalScore = (typeof store.totalScore === 'number') ? store.totalScore : 0;

    if (scoreEl) scoreEl.textContent = totalScore.toLocaleString();

    // Do NOT clobber the BOSS FIGHT label rendered by renderQuizInterface()
    if (stageEl && !store.isBossFight) {
      stageEl.textContent = (store.currentStage || 1) + '/' + (store.maxStages || 5);
    }

    if (rankEl) {
      if (totalScore >= 4000) { rankEl.textContent = 'Pro'; rankEl.style.color = '#e11d48'; }
      else if (totalScore >= 2000) { rankEl.textContent = 'Ingeniero'; rankEl.style.color = '#a855f7'; }
      else { rankEl.textContent = 'Tiracables'; rankEl.style.color = '#38bdf8'; }
    }

    this.renderLives(store);
  }

  /**
   * Renders remaining lives as hearts into the header lives container.
   * @param {Object} store GameLoopManager store snapshot
   */
  renderLives(store = this.gameLoop ? this.gameLoop.store : null) {
    const container = document.getElementById('livesContainer');
    if (!container || !store) return;
    const maxLives = store.maxLives || 5;
    const lives = Math.max(0, Math.min(maxLives, typeof store.lives === 'number' ? store.lives : 0));
    let html = '';
    for (let i = 0; i < maxLives; i++) {
      const filled = i < lives;
      html += `<span class="heart-icon${filled ? '' : ' lost'}" aria-hidden="true">${filled ? '♥' : '♡'}</span>`;
    }
    container.innerHTML = html;
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

    const isBoss = (this.gameLoop && this.gameLoop.store) ? !!this.gameLoop.store.isBossFight : this.trainer.isBossStage;

    // Boss Mode UI Update
    const stageValEl = document.getElementById('soundgymStage');
    if (stageValEl) {
      if (isBoss) {
        stageValEl.innerHTML = `⚠️ <span class="text-danger" style="animation: pulse 1s infinite">BOSS FIGHT</span>`;
      } else {
        const curStage = (this.gameLoop && this.gameLoop.store) ? (this.gameLoop.store.currentStage || 1) : (this.trainer.stage || 1);
        const maxStage = (this.gameLoop && this.gameLoop.store) ? (this.gameLoop.store.maxStages || 5) : (this.trainer.maxStages || 5);
        stageValEl.textContent = `${curStage}/${maxStage}`;
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

    // In a multitrack session, name the instrument being trained so the player
    // immediately knows which stem the filter is applied to (not always the same).
    const mtReviewSession = this.audio ? this.audio.currentMultitrackSession : null;
    if (mtReviewSession && Array.isArray(mtReviewSession.stems)) {
      const tgtStem = mtReviewSession.stems.find(s => s.id === mtReviewSession.targetStem);
      if (tgtStem) {
        const stemName = tgtStem.displayName || tgtStem.name || 'Stem';
        subtitleText += ` <span style="color:#38bdf8; font-weight:bold; margin-left:8px;">\uD83C\uDFAF ${stemName}</span>`;
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

    // Defer the terminal / level-up modal instead of showing it immediately.
    // Opening it here covered the didactic review the instant the last life was
    // lost, so the player never saw WHY or HOW they failed. We stash it and
    // surface it from the results CTA (#bannerNextBtn) after the review is read.
    this.pendingOutcomeModal = null;
    if (gameOutcome && gameOutcome.isLevelUp) {
      this.pendingOutcomeModal = { kind: 'levelUp', outcome: gameOutcome };
    } else if (gameOutcome && gameOutcome.isGameOver) {
      this.pendingOutcomeModal = {
        kind: gameOutcome.isBossDefeated ? 'bossDefeat' : 'gameOver',
        outcome: gameOutcome
      };
    }

    const bannerCta = document.getElementById('bannerNextBtn');
    if (bannerCta) {
      const ctaLabels = {
        levelUp: 'Ver Subida de Nivel ➔',
        bossDefeat: 'Ver Fin del Boss ➔',
        gameOver: 'Ver Fin de Partida ➔'
      };
      bannerCta.textContent = (this.pendingOutcomeModal && ctaLabels[this.pendingOutcomeModal.kind]) || 'Siguiente Ensayo ➔';
      bannerCta.classList.toggle('cta-terminal', !!this.pendingOutcomeModal);
    }

    const guess = result.bandResults ? result.bandResults[0]?.guess : null;
    const audioContextStr = this.audio ? (this.audio.currentTrackId || this.audio.currentBufferName || "") : "";

    // Resolve the pedagogical class once — prefer the class embedded in the
    // evaluated target (guaranteed to match the trial actually played), then the
    // trainer's in-flight class, then the raw track id/name hint. This keeps the
    // didactic teaching curve aligned with the quiz's instrument.
    const acousticClass = (target && target.acousticClass)
      || (this.trainer && this.trainer.currentAcousticClass)
      || resolveAcousticClassKey(audioContextStr);

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
    let pedagogicalContext = guess ? ScoringEngine.getPedagogicalFeedback(acousticClass, guess.frequencyHz, guess.gainDb) : null;

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
      const proAnalysis = analyzeProPractices(target, guess, acousticClass);
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
    // Campaign end-state: the final rank was reached -> show the farewell screen instead
    const isCampaign = !!(this.gameLoop && this.gameLoop.store && this.gameLoop.store.activeGameMode === 'campaign');
    const reachedMax = !!(outcome && typeof outcome.newLevel === 'number' && outcome.newLevel > this.maxLevels);
    if (isCampaign && reachedMax) {
      this.showCampaignCompleteModal();
      return;
    }

    const modal = document.getElementById('levelUpModal');
    if (!modal) return;
    const rankTitleEl = document.getElementById('modalNewRankTitle');
    if (rankTitleEl) rankTitleEl.textContent = (outcome && outcome.rankTitle) || 'Técnico de Sonido';
    modal.classList.add('active');
  }

  /**
   * Opens the modal deferred by showPedagogicalReview (game over / boss defeat /
   * level up) so the didactic review is seen first. The modal's own buttons then
   * drive the next step. Returns true when a modal was actually opened.
   * @returns {boolean}
   */
  openPendingOutcomeModal() {
    const pending = this.pendingOutcomeModal;
    if (!pending) return false;
    this.pendingOutcomeModal = null;
    if (pending.kind === 'levelUp') {
      this.showLevelUpModal(pending.outcome);
    } else if (pending.kind === 'bossDefeat') {
      this.showBossDefeatModal(pending.outcome);
    } else {
      this.showGameOverModal(pending.outcome);
    }
    return true;
  }

  /**
   * Rerolls the trained stem of the active multitrack session (if any) so every
   * trial trains a different instrument rather than always the first stem
   * (e.g. the symphonic "Main Pair"). No-op for single-file sources.
   */
  rotateMultitrackTarget() {
    const mtSession = this.audio ? this.audio.currentMultitrackSession : null;
    if (mtSession) this.randomizeTargetStem(mtSession);
  }

  /**
   * Advances to the next trial from any results/modal context (shared by Continue and Retry).
   */
  advanceToNextTrial() {
    const resultsSection = document.getElementById('resultsDockSection');
    if (resultsSection) resultsSection.classList.add('hidden');
    if (this.visualizer) {
      this.visualizer.showTargetCurve = false;
      this.visualizer.showUserCurve = false;
    }

    this.pendingOutcomeModal = null;

    if (this.gameLoop) this.gameLoop.nextTrial();
    // Vary the trained instrument before generating the new target so the quiz
    // never keeps asking about the same stem all session long.
    this.rotateMultitrackTarget();
    if (this.trainer) {
      if (this.gameLoop) this.trainer.stage = this.gameLoop.store.currentStage;
      this.trainer.startNewTrial();
    }

    this.renderHUD();
    this.renderQuizInterface();
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
    const finalRank = document.getElementById('finalRank');
    const finalLevel = document.getElementById('finalLevel');
    const finalStage = document.getElementById('finalStage');

    const store = this.gameLoop ? this.gameLoop.store : null;

    if (finalScorePoints) {
      finalScorePoints.textContent = (this.trainer.scorePoints || 0).toLocaleString();
    }
    if (finalStreak) finalStreak.textContent = this.trainer.streak;
    if (finalScore) {
      const avg = this.trainer.totalTrials > 0 ? Math.round(this.trainer.totalScoreSum / this.trainer.totalTrials) : 0;
      finalScore.textContent = `${avg}%`;
    }
    if (finalRank) {
      finalRank.textContent = (this.trainer && this.trainer.getRankTitle) ? this.trainer.getRankTitle() : 'Tiracables';
    }
    if (finalLevel) {
      finalLevel.textContent = store ? `${store.currentLevel}` : '1';
    }
    if (finalStage) {
      finalStage.textContent = store ? `${store.currentStage}/${store.maxStages}` : '1/5';
    }

    // Stop audio so Game Over never "hangs with background sound"
    if (this.audio && this.audio.stopAllAudio) this.audio.stopAllAudio();

    modal.classList.add('active');
  }

  /**
   * Campaign completed: farewell screen (thank-you + return to menu).
   */
  showCampaignCompleteModal() {
    const modal = document.getElementById('campaignCompleteModal');
    if (this.audio && this.audio.stopAllAudio) this.audio.stopAllAudio();
    if (!modal) return;
    modal.classList.add('active');
  }

  /**
   * Returns to the main menu, silencing audio and resetting session state.
   */
  returnToMainMenu() {
    ['campaignCompleteModal', 'levelUpModal', 'bossDefeatModal', 'gameOverModal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });

    if (this.audio && this.audio.stopAllAudio) this.audio.stopAllAudio();
    if (this.gameLoop && this.gameLoop.resetSession) this.gameLoop.resetSession();
    if (this.trainer && this.trainer.resetSession) this.trainer.resetSession();

    this.renderHUD();
    this.setAppState('MODULE_SELECT');
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

  toggleStemMixer() {
    this.audio.isStemMixerActive = !this.audio.isStemMixerActive;
    const btn = document.getElementById('btnStemMixer');
    if (btn) btn.classList.toggle('active', this.audio.isStemMixerActive);

    // Inject unbreakable CSS for faders to bypass any cache
    let faderStyle = document.getElementById('fader-override-style');
    if (!faderStyle) {
      faderStyle = document.createElement('style');
      faderStyle.id = 'fader-override-style';
      faderStyle.textContent = `
        .fader-fused {
          -webkit-appearance: none !important;
          appearance: none !important;
          background: transparent !important;
          width: 100% !important;
          height: 6px !important;
          margin: 12px 0 !important;
          border-radius: 3px !important;
          outline: none !important;
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1) !important;
        }
        .fader-fused::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          appearance: none !important;
          width: 16px !important;
          height: 32px !important;
          background: linear-gradient(180deg, #94a3b8 0%, #cbd5e1 45%, #f1f5f9 50%, #94a3b8 55%, #64748b 100%) !important;
          border: 1px solid #0f172a !important;
          border-radius: 4px !important;
          cursor: ns-resize !important;
          box-shadow: 0 4px 6px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(0,0,0,0.5) !important;
        }
        .fader-fused::-moz-range-thumb {
          width: 16px !important;
          height: 32px !important;
          background: linear-gradient(180deg, #94a3b8 0%, #cbd5e1 45%, #f1f5f9 50%, #94a3b8 55%, #64748b 100%) !important;
          border: 1px solid #0f172a !important;
          border-radius: 4px !important;
          cursor: ns-resize !important;
          box-shadow: 0 4px 6px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(0,0,0,0.5) !important;
        }
      `;
      document.head.appendChild(faderStyle);
    }

    if (this.audio.isStemMixerActive) {
      if (!this.audio.currentMultitrackSession) {
        const defaultSession = MULTITRACK_SESSIONS[0];
        if (defaultSession) {
          this.audio.loadAudioSource(defaultSession.id);
        }
      }
      this.renderStemMixer(this.audio.currentMultitrackSession || { stems: [], displayName: 'No Session' });

      // Force Layout Hard
      const workspace = document.getElementById('workspace');
      if (workspace) {
        workspace.style.display = 'flex';
        workspace.style.flexDirection = 'row';
      }
      const canvas = document.getElementById('visualizerCanvas');
      if (canvas) {
        canvas.style.flex = '1 1 0%';
        canvas.style.minWidth = '0px';
        canvas.style.width = '0px';
      }
      const panel = document.getElementById('stemMixerPanel');
      if (panel) {
        panel.style.position = 'relative';
        panel.style.width = '320px';
        panel.style.flex = '0 0 320px';
      }

      if (this.visualizer) setTimeout(() => this.visualizer.resize(), 50);
    } else {
      this.hideStemMixer();
      if (this.visualizer) setTimeout(() => this.visualizer.resize(), 50);
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
