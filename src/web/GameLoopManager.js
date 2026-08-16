/**
 * @file GameLoopManager.js
 * @description Centralized Finite State Machine (FSM) and global store for Ear Training gamification,
 * state flow control (IDLE -> LOADING_AUDIO -> PLAYING_TARGET -> PLAYING_GUESS -> EVALUATING -> SHOWING_RESULTS -> LEVEL_TRANSITION),
 * lives management, level/stage progression, and Boss Fight mechanics.
 */

export const GAME_STATES = Object.freeze({
  IDLE: 'IDLE',
  LOADING_AUDIO: 'LOADING_AUDIO',
  PLAYING_TARGET: 'PLAYING_TARGET',
  PLAYING_GUESS: 'PLAYING_GUESS',
  EVALUATING: 'EVALUATING',
  SHOWING_RESULTS: 'SHOWING_RESULTS',
  LEVEL_TRANSITION: 'LEVEL_TRANSITION'
});

export const RANKS = [
  "Tiracables",
  "Asistente de Estudio",
  "Técnico de Monitores",
  "Ingeniero de Mezcla",
  "Mastering Engineer"
];

export class GameLoopManager {
  constructor() {
    /** @type {string} */
    this.currentState = GAME_STATES.IDLE;

    /**
     * Centralized global user state store
     */
    this.store = {
      currentLevel: 1,
      currentStage: 1,
      maxStages: 5,
      totalScore: 0,
      currentMultiplier: 1.0,
      isBossFight: false,
      lives: 3,
      maxLives: 5,
      streak: 0,
      activeDifficulty: 'easy', // 'easy' | 'normal' | 'hard'
      activeTrackId: 'pink-noise',
      currentFilterNodes: [],
      userGuessNodes: []
    };

    /** @type {Array<Function>} Store & State Listeners */
    this.listeners = [];
  }

  /**
   * Subscribes a listener to state & store changes.
   * @param {(state: string, store: Object) => void} listener 
   * @returns {() => void} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.push(listener);
    // Execute immediately with current snapshot
    listener(this.currentState, this.getSnapshot());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Returns a clean immutable copy of current global store snapshot.
   */
  getSnapshot() {
    return { ...this.store };
  }

  /**
   * Emits state & store updates to all subscribers.
   */
  notify() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach(l => {
      try {
        l(this.currentState, snapshot);
      } catch (err) {
        console.error("Error in GameLoopManager subscriber notification:", err);
      }
    });
  }

  /**
   * Transition FSM to a target state strictly.
   * @param {string} newState 
   */
  transitionTo(newState) {
    if (!GAME_STATES[newState]) {
      console.warn(`[FSM] Invalid state transition requested: ${newState}`);
      return;
    }
    this.currentState = newState;
    this.notify();
  }

  /**
   * Get professional rank title based on current level.
   */
  getRankTitle() {
    const idx = Math.min(Math.max(0, this.store.currentLevel - 1), RANKS.length - 1);
    return RANKS[idx];
  }

  /**
   * Sets active difficulty mode ('easy' | 'normal' | 'hard').
   */
  setDifficulty(mode) {
    if (mode === 'pro') mode = 'hard';
    this.store.activeDifficulty = mode;
    this.notify();
  }

  /**
   * Updates user guess filter array in store.
   */
  setUserGuess(nodesArray) {
    this.store.userGuessNodes = nodesArray;
    this.notify();
  }

  /**
   * Checks stage progression, Boss Fight trigger (Stage 5), and level promotion.
   * @param {number} precisionPercentage 
   * @param {number} trialPoints 
   * @returns {{ victory: boolean, isBoss: boolean, newLevel?: number, rankTitle?: string, message?: string }}
   */
  evaluateTrialOutcome(precisionPercentage, trialPoints = 0) {
    const isBoss = this.store.currentStage >= this.store.maxStages || this.store.isBossFight;
    let outcome = { victory: false, isBoss };

    // Update Score
    const earned = Math.round(trialPoints * this.store.currentMultiplier);
    this.store.totalScore += earned;

    if (isBoss) {
      if (precisionPercentage >= 75) {
        // Boss Defeated!
        this.store.currentLevel += 1;
        this.store.currentStage = 1;
        this.store.isBossFight = false;
        this.store.currentMultiplier = parseFloat((this.store.currentMultiplier + 0.25).toFixed(2));
        this.store.streak += 1;
        outcome = {
          victory: true,
          isBoss: true,
          newLevel: this.store.currentLevel,
          rankTitle: this.getRankTitle()
        };
        this.transitionTo(GAME_STATES.LEVEL_TRANSITION);
      } else {
        // Boss Defeat
        this.store.currentStage = 4; // Penalty: drop back to Stage 4
        this.store.isBossFight = false;
        this.store.streak = 0;
        this.store.lives = Math.max(0, this.store.lives - 1);
        outcome = {
          victory: false,
          isBoss: true,
          message: "Has fallado la mezcla del cliente. Penalización: Has vuelto al Stage 4/5."
        };
        this.transitionTo(GAME_STATES.SHOWING_RESULTS);
      }
    } else {
      if (precisionPercentage >= 35) {
        this.store.streak += 1;
        this.store.currentStage += 1;
        if (this.store.currentStage >= 5) {
          this.store.isBossFight = true;
        }
        outcome = { victory: true, isBoss: false };
      } else {
        this.store.streak = 0;
        this.store.lives = Math.max(0, this.store.lives - 1);
        outcome = { victory: false, isBoss: false };
      }
      this.transitionTo(GAME_STATES.SHOWING_RESULTS);
    }

    return outcome;
  }

  /**
   * Advances to next trial in queue, enforcing stage 5 boss fight checks.
   */
  nextTrial() {
    if (this.store.lives <= 0) {
      this.resetSession();
      return;
    }

    if (this.store.currentStage >= 5) {
      this.store.isBossFight = true;
    } else {
      this.store.isBossFight = false;
    }

    this.transitionTo(GAME_STATES.IDLE);
  }

  /**
   * Full session reset.
   */
  resetSession() {
    this.store.currentLevel = 1;
    this.store.currentStage = 1;
    this.store.totalScore = 0;
    this.store.currentMultiplier = 1.0;
    this.store.isBossFight = false;
    this.store.lives = 3;
    this.store.streak = 0;
    this.transitionTo(GAME_STATES.IDLE);
  }
}
