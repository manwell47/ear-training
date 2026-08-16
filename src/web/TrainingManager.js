/**
 * @file TrainingManager.js
 * @description Core interactive state machine for Ear Training sessions.
 * Integrates ScoringEngine for 70/30 weighted independent frequency/gain evaluation,
 * filter type bonus points (+500 PTS in Hard/Pro mode), streak-based distractors, lives management, and stage progression.
 */

import { ScoringEngine } from './ScoringEngine.js?v=20';

export const RANGOS = ["Tiracables", "Asistente de Estudio", "Técnico de Monitores", "Ingeniero de Mezcla", "Mastering Engineer"];

export const ACOUSTIC_EQ_SCENARIOS = {
  kick: [
    { name: 'Sub-weight', type: 'peaking', frequencyHz: 60, gainDb: 4, qFactor: 1.2 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 300, gainDb: -5, qFactor: 2.0 },
    { name: 'Beater Attack', type: 'peaking', frequencyHz: 4000, gainDb: 5, qFactor: 1.5 },
    { name: 'Rumble Filter', type: 'highpass', frequencyHz: 30, gainDb: 0, qFactor: 0.7 }
  ],
  snare: [
    { name: 'Body Punch', type: 'peaking', frequencyHz: 200, gainDb: 3, qFactor: 1.4 },
    { name: 'Ring Cut', type: 'peaking', frequencyHz: 500, gainDb: -6, qFactor: 3.0 },
    { name: 'Presence/Crack', type: 'peaking', frequencyHz: 5000, gainDb: 4, qFactor: 1.5 },
    { name: 'Bottom Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 }
  ],
  vocals: [
    { name: 'Plosives Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
    { name: 'Mud Cut (Proximity)', type: 'peaking', frequencyHz: 250, gainDb: -3, qFactor: 1.5 },
    { name: 'Presence', type: 'peaking', frequencyHz: 4500, gainDb: 3, qFactor: 1.4 },
    { name: 'Air', type: 'highshelf', frequencyHz: 12000, gainDb: 2.5, qFactor: 1.0 }
  ],
  bass: [
    { name: 'Sub Foundation', type: 'lowshelf', frequencyHz: 80, gainDb: 3, qFactor: 1.0 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 250, gainDb: -4, qFactor: 2.0 },
    { name: 'Pick Attack', type: 'peaking', frequencyHz: 1000, gainDb: 4, qFactor: 2.0 },
    { name: 'Sub Cut', type: 'highpass', frequencyHz: 40, gainDb: 0, qFactor: 0.7 }
  ],
  guitars: [
    { name: 'Rumble Cut', type: 'highpass', frequencyHz: 100, gainDb: 0, qFactor: 0.7 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 250, gainDb: -4, qFactor: 1.5 },
    { name: 'Bite', type: 'peaking', frequencyHz: 3500, gainDb: 3, qFactor: 1.5 },
    { name: 'Fizz Cut', type: 'lowpass', frequencyHz: 8000, gainDb: 0, qFactor: 0.7 }
  ],
  cymbals: [
    { name: 'Low Cut', type: 'highpass', frequencyHz: 400, gainDb: 0, qFactor: 0.7 },
    { name: 'Harshness Cut', type: 'peaking', frequencyHz: 3500, gainDb: -4, qFactor: 2.5 },
    { name: 'Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 },
    { name: 'Room Resonance Cut', type: 'peaking', frequencyHz: 450, gainDb: -3, qFactor: 2.0 }
  ],
  drumbus: [
    { name: 'Glue', type: 'lowshelf', frequencyHz: 80, gainDb: 2, qFactor: 1.0 },
    { name: 'Mud Cleanup', type: 'peaking', frequencyHz: 350, gainDb: -2, qFactor: 1.5 },
    { name: 'Presence Push', type: 'peaking', frequencyHz: 5000, gainDb: 2, qFactor: 1.5 },
    { name: 'Cymbal Lift', type: 'highshelf', frequencyHz: 10000, gainDb: 2, qFactor: 1.0 }
  ],
  generic: [
    { name: 'Warmth', type: 'lowshelf', frequencyHz: 150, gainDb: 2, qFactor: 1.0 },
    { name: 'Boxy Cut', type: 'peaking', frequencyHz: 400, gainDb: -3, qFactor: 2.0 },
    { name: 'Clarity', type: 'peaking', frequencyHz: 3000, gainDb: 2, qFactor: 1.5 },
    { name: 'Air', type: 'highshelf', frequencyHz: 8000, gainDb: 2, qFactor: 1.0 }
  ],
  room: [
    { name: 'Rumble Cut', type: 'highpass', frequencyHz: 60, gainDb: 0, qFactor: 0.7 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 300, gainDb: -3, qFactor: 2.0 },
    { name: 'Harshness Cut', type: 'peaking', frequencyHz: 4000, gainDb: -3, qFactor: 2.0 },
    { name: 'Air Lift', type: 'highshelf', frequencyHz: 10000, gainDb: 2, qFactor: 1.0 }
  ]
};

export class TrainingManager {
  constructor() {
    this.difficulty = 'easy'; // 'easy' | 'normal' | 'hard'
    this.lives = 3;
    this.maxLives = 5;
    this.streak = 0;
    this.scorePoints = 0; // Total SoundGym score points (e.g. 43,042 SCORE)
    this.stage = 1;      // Current stage (e.g. Stage 1/5)
    this.maxStages = 5;
    this.totalTrials = 0;
    this.correctTrials = 0;
    this.totalScoreSum = 0;
    this.isGameOver = false;

    /** @type {EQQuizTarget|null} */
    this.currentTarget = null;
    /** @type {Array<EQQuizTarget>} */
    this.targetFilters = [];

    /** @type {Array<MultipleChoiceOption>} */
    this.easyOptions = [];
    this.correctEasyOptionIndex = 0;

    // ISO & SoundGym Center Frequencies for Ear Training
    this.isoFrequencies = [31, 50, 80, 125, 200, 315, 500, 800, 1250, 2000, 3150, 5000, 8000, 12500, 18000];

    // RPG Progression State
    this.currentLevel = 1;
    this.ranks = RANGOS;
    this.lastTrialResult = null;
    this.lastBossOutcome = null;
  }

  getRankTitle() {
    const idx = Math.min(Math.max(0, this.currentLevel - 1), this.ranks.length - 1);
    return this.ranks[idx];
  }

  advanceStageOrLevel() {
    const lastResult = this.lastTrialResult;
    const lastPrecision = lastResult ? lastResult.scorePercentage : 0;
    this.lastBossOutcome = null;

    if (this.isBossStage) {
      if (lastPrecision >= 75) {
        // ¡Victoria contra el Boss!
        this.currentLevel += 1;
        this.stage = 1; // Reinicia el contador de ronda
        this.lastBossOutcome = {
          victory: true,
          newLevel: this.currentLevel,
          rankTitle: this.getRankTitle()
        };
      } else {
        // Derrota. El jugador debe repetir el Boss o bajar al Stage 4.
        this.stage = 4; // Penalización por fallar el Boss
        this.lastBossOutcome = {
          victory: false,
          message: "Has fallado la mezcla del cliente. Vuelve a afinar tu oído y reinténtalo."
        };
      }
    } else {
      if (this.stage < this.maxStages) {
        this.stage += 1; // Flujo normal
      }
    }

    this.startNewTrial();
    return this.lastBossOutcome;
  }

  /**
   * Sets current difficulty tier ('easy' | 'normal' | 'hard' | 'pro')
   */
  setDifficulty(mode) {
    if (mode === 'pro') mode = 'hard';
    this.difficulty = mode;
    this.startNewTrial();
  }

  /**
   * Fully resets session state.
   */
  resetSession() {
    this.lives = 3;
    this.streak = 0;
    this.scorePoints = 0;
    this.stage = 1;
    this.currentLevel = 1;
    this.totalTrials = 0;
    this.correctTrials = 0;
    this.totalScoreSum = 0;
    this.isGameOver = false;
    this.lastTrialResult = null;
    this.lastBossOutcome = null;
    this.startNewTrial();
  }

  /**
   * Generates a new quiz trial based on active difficulty tier.
   */
  startNewTrial() {
    if (this.lives <= 0) {
      this.isGameOver = true;
      return;
    }

    this.isBossStage = this.stage > 0 && this.stage % 5 === 0;

    if (this.difficulty === 'easy') {
      this.generateEasyTrial();
    } else if (this.difficulty === 'normal') {
      this.generateNormalTrial();
    } else {
      this.generateHardTrial();
    }
  }

  /**
   * Generates an Easy Mode trial with 4 options and streak-tuned distractors.
   */
  _generateRandomTarget(difficulty) {
    const minLog = Math.log2(30);
    const maxLog = Math.log2(16000);
    const targetFreq = Math.round(Math.pow(2, minLog + Math.random() * (maxLog - minLog)));

    if (difficulty === 'easy' || difficulty === 'normal') {
      const gains = [-12, -9, -6, -4, 4, 6, 9, 12];
      const targetGain = gains[Math.floor(Math.random() * gains.length)];
      return { frequencyHz: targetFreq, gainDb: targetGain, qFactor: 2.0, type: 'peaking' };
    } else {
      let gain = Math.round((Math.random() * 20 - 10) * 10) / 10;
      const qFactor = Math.round((0.5 + Math.random() * 7.5) * 10) / 10;
      const types = ['peaking', 'lowpass', 'highpass', 'notch', 'lowshelf', 'highshelf'];
      const type = types[Math.floor(Math.random() * types.length)];
      if (type === 'notch' || type === 'highpass' || type === 'lowpass') gain = 0;
      else if (gain === 0) gain = 6.0;
      return { frequencyHz: targetFreq, gainDb: gain, qFactor: qFactor, type: type };
    }
  }

  generateAcousticTarget(difficulty) {
    let acousticClass = this.currentAcousticClass || 'generic';
    if (this.isSyntheticMode) acousticClass = 'synthetic';
    
    const scenarios = ACOUSTIC_EQ_SCENARIOS[acousticClass];
    
    // Fallback to random if no scenarios found for this class
    if (!scenarios || scenarios.length === 0) {
      return this._generateRandomTarget(difficulty);
    }

    // Pick a scenario
    const baseScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    
    // Jitter Freq (+/- 15%)
    const freqJitter = 1.0 + (Math.random() * 0.3 - 0.15); 
    let finalFreq = Math.round(baseScenario.frequencyHz * freqJitter);
    finalFreq = Math.max(20, Math.min(20000, finalFreq));

    // Jitter Gain (+/- 1.5 dB)
    let finalGain = baseScenario.gainDb;
    if (baseScenario.gainDb !== 0) {
       const gainJitter = (Math.random() * 3.0 - 1.5); 
       finalGain = baseScenario.gainDb + gainJitter;
       
       // Scale gain based on difficulty for training audibility
       let multiplier = 1.0;
       if (difficulty === 'easy') multiplier = 2.5;
       else if (difficulty === 'normal') multiplier = 1.8;
       else if (difficulty === 'hard') multiplier = 1.2;
       
       finalGain = finalGain * multiplier;
       
       // Enforce minimum audibility thresholds depending on difficulty
       const minGain = (difficulty === 'easy') ? 5.0 : (difficulty === 'normal' ? 3.5 : 1.5);
       
       if (baseScenario.gainDb > 0) {
         finalGain = Math.max(minGain, finalGain);
       } else {
         finalGain = Math.min(-minGain, finalGain);
       }
       
       finalGain = Math.round(finalGain * 10) / 10;
    }
    
    // Jitter Q (+/- 20%) in Hard mode, otherwise use baseline Q
    let finalQ = baseScenario.qFactor;
    if (difficulty === 'hard') {
       const qJitter = 1.0 + (Math.random() * 0.4 - 0.2);
       finalQ = Math.round(baseScenario.qFactor * qJitter * 10) / 10;
       finalQ = Math.max(0.5, Math.min(10.0, finalQ));
    }

    return {
      frequencyHz: finalFreq,
      gainDb: finalGain,
      qFactor: finalQ,
      type: baseScenario.type,
      name: baseScenario.name
    };
  }

  generateEasyTrial() {
    this.currentTarget = this.generateAcousticTarget('easy');
    this.targetFilters = [this.currentTarget];

    const distractors = this.generateDistractors(this.currentTarget, this.streak);
    const allTargets = [this.currentTarget, ...distractors];
    this.shuffleArray(allTargets);

    this.correctEasyOptionIndex = allTargets.findIndex(
      t => t.frequencyHz === this.currentTarget.frequencyHz && t.gainDb === this.currentTarget.gainDb
    );

    this.easyOptions = allTargets.map((target, idx) => ({
      index: idx,
      target: target,
      title: `${target.frequencyHz >= 1000 ? (target.frequencyHz/1000).toFixed(1)+' kHz' : target.frequencyHz+' Hz'} (${target.gainDb > 0 ? '+' : ''}${target.gainDb} dB)`,
      description: `Tipo: ${target.type}, Q: ${target.qFactor.toFixed(1)}`
    }));
  }

  /**
   * Generates a Normal Mode trial (Manual Frequency & Gain dial-in).
   */
  generateNormalTrial() {
    if (this.isBossStage) {
      this.generateBossTrial();
    } else {
      this.currentTarget = this.generateAcousticTarget('normal');
      this.targetFilters = [this.currentTarget];
    }
  }

  /**
   * Generates a Hard Mode trial (Manual Freq, Gain, Q factor, Filter Type dial-in).
   */
  generateHardTrial() {
    if (this.isBossStage) {
      this.generateBossTrial();
    } else {
      this.currentTarget = this.generateAcousticTarget('hard');
      this.targetFilters = [this.currentTarget];
    }
  }

  generateBossTrial() {
    const BOSS_SCENARIOS = [
      // Boss 1: "Limpieza y Presencia (Voz/Acústica)"
      [
        { type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
        { type: 'peaking', frequencyHz: 2000, gainDb: 3.0, qFactor: 1.5 }
      ],
      // Boss 2: "Control de Bajo Eléctrico"
      [
        { type: 'lowshelf', frequencyHz: 100, gainDb: -4.0, qFactor: 1.0 },
        { type: 'peaking', frequencyHz: 800, gainDb: 3.0, qFactor: 2.0 }
      ],
      // Boss 3: "Bombo (Kick Drum) Moderno"
      [
        { type: 'peaking', frequencyHz: 60, gainDb: 4.5, qFactor: 2.0 },
        { type: 'peaking', frequencyHz: 400, gainDb: -6.0, qFactor: 2.5 }
      ],
      // Boss 4: "Brillo de Overheads/Platos"
      [
        { type: 'highpass', frequencyHz: 400, gainDb: 0, qFactor: 0.7 },
        { type: 'highshelf', frequencyHz: 8000, gainDb: 2.5, qFactor: 1.0 }
      ]
    ];
    
    const randomBoss = BOSS_SCENARIOS[Math.floor(Math.random() * BOSS_SCENARIOS.length)];
    this.targetFilters = randomBoss.map(b => ({ ...b }));
    this.currentTarget = this.targetFilters[0];
  }

  /**
   * Generates 3 distractors based on streak.
   */
  generateDistractors(target, streak) {
    const distractors = [];

    if (streak < 2) {
      const octaveUp = Math.min(18000, Math.round(target.frequencyHz * 2));
      const octaveDown = Math.max(31, Math.round(target.frequencyHz / 2));
      const invertedGain = -target.gainDb;

      distractors.push({ ...target, frequencyHz: octaveUp });
      distractors.push({ ...target, frequencyHz: octaveDown });
      distractors.push({ ...target, gainDb: invertedGain });
    } else {
      const thirdOctaveUp = Math.min(18000, Math.round(target.frequencyHz * Math.pow(2, 1/3)));
      const thirdOctaveDown = Math.max(31, Math.round(target.frequencyHz / Math.pow(2, -1/3)));
      const tweakGain = target.gainDb > 0 ? target.gainDb - 3 : target.gainDb + 3;

      distractors.push({ ...target, frequencyHz: thirdOctaveUp });
      distractors.push({ ...target, frequencyHz: thirdOctaveDown });
      distractors.push({ ...target, gainDb: tweakGain });
    }

    return distractors;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /**
   * Evaluates Easy Mode option choice.
   */
  evaluateEasyGuess(chosenIndex) {
    const isCorrect = chosenIndex === this.correctEasyOptionIndex;
    const chosenOption = this.easyOptions[chosenIndex];
    const userTarget = chosenOption ? chosenOption.target : this.currentTarget;

    const evalResult = ScoringEngine.evaluate(this.currentTarget, userTarget);
    const score = isCorrect ? 100 : evalResult.accuracyPercentage;
    const pointsAwarded = isCorrect ? 1000 : evalResult.totalScore;

    this.updateGamificationState(isCorrect, score, pointsAwarded);

    return {
      isCorrect,
      userFreqHz: userTarget.frequencyHz,
      userGainDb: userTarget.gainDb,
      userQ: userTarget.qFactor,
      userType: userTarget.type,
      scorePercentage: score,
      pointsAwarded,
      ratingLabel: isCorrect ? '🎉 ¡Opción Correcta! (+1,000 PTS)' : evalResult.ratingLabel,
      octaveDistance: evalResult.octaveDistance,
      gainErrorDb: evalResult.gainDifference,
      feedbackMessage: isCorrect
        ? `¡Impecable! Has identificado correctamente ${this.currentTarget.frequencyHz} Hz (${this.currentTarget.gainDb > 0 ? '+' : ''}${this.currentTarget.gainDb} dB).`
        : evalResult.feedbackMessage
    };
  }

  /**
   * Calculates score breakdown using ScoringEngine.
   * @param {Array} userGuessesArray 
   * @returns {{
   *   totalScore: number,
   *   totalPrecision: number,
   *   band1Precision: number,
   *   band2Precision: number,
   *   band1Octave: number,
   *   band2Octave: number,
   *   bandResults: Array
   * }}
   */
  calculateScore(userGuessesArray) {
    return ScoringEngine.calculateScore(this.targetFilters, userGuessesArray, this.difficulty);
  }

  /**
   * Evaluates Normal / Hard Mode manual dial-in guess via ScoringEngine.
   * In Hard Mode: Awards +100 BONUS POINTS for guessing the exact filter type!
   */
  evaluateManualGuess(userGuessesArray) {
    if (!this.targetFilters || this.targetFilters.length === 0) return null;

    const scoreData = this.calculateScore(userGuessesArray);
    const { totalScore, totalPrecision, band1Precision, band2Precision, band1Octave, band2Octave, bandResults } = scoreData;

    const isCorrect = totalPrecision >= 80;
    let combinedIsPolarityFlipped = bandResults.some(br => br.evalResult.isPolarityFlipped);

    this.updateGamificationState(isCorrect, totalPrecision, totalScore);

    const primaryTarget = this.targetFilters[0];
    const primaryGuess = userGuessesArray[0];
    const primaryResult = bandResults[0];

    const resultObj = {
      isCorrect: isCorrect,
      isPolarityFlipped: combinedIsPolarityFlipped,
      userFreqHz: primaryGuess.frequencyHz,
      userGainDb: primaryGuess.gainDb,
      userQ: primaryGuess.qFactor,
      userType: primaryGuess.type,
      isTypeCorrect: primaryResult ? primaryResult.isTypeCorrect : false,
      scorePercentage: totalPrecision,
      totalScore: totalScore,
      totalPrecision: totalPrecision,
      pointsAwarded: totalScore,
      ratingLabel: (primaryResult && primaryResult.isTypeCorrect) ? `${primaryResult.evalResult.ratingLabel} (+100 PTS Tipo Filtro)` : (primaryResult ? primaryResult.evalResult.ratingLabel : ''),
      octaveDistance: primaryResult ? primaryResult.evalResult.octaveDistance : 0,
      gainErrorDb: primaryResult ? primaryResult.evalResult.gainDifference : 0,
      feedbackMessage: isCorrect
        ? `¡Impecable! Rendimiento promedio: ${totalPrecision}%`
        : (primaryResult ? primaryResult.evalResult.feedbackMessage : ''),
      bandResults: bandResults,
      isBossStage: this.isBossStage,
      band1Precision,
      band2Precision,
      band1Octave,
      band2Octave
    };

    this.lastTrialResult = resultObj;
    return resultObj;
  }

  /**
   * Updates SoundGym Score Points, Signal Integrity (Lives), Streak & Stage progression.
   */
  updateGamificationState(isCorrect, score, pointsAwarded = 0) {
    this.totalTrials++;
    this.totalScoreSum += score;
    this.scorePoints += pointsAwarded;

    if (isCorrect) {
      this.correctTrials++;
      this.streak++;

      if (this.streak > 0 && this.streak % 3 === 0) {
        if (this.stage < this.maxStages) {
          this.stage++;
        }
        if (this.lives < this.maxLives) {
          this.lives++;
        }
      }
    } else {
      this.streak = 0;
      this.lives = Math.max(0, this.lives - 1);

      if (this.lives <= 0) {
        this.isGameOver = true;
      }
    }
  }
}
