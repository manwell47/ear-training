/**
 * @file ScoringEngine.js
 * @description Independent Weighted Scoring Engine for Surgical EQ Ear Training.
 * Evaluates Frequency (70% weight, 700 pts max) and Gain (30% weight, 300 pts max)
 * independently using continuous linear tolerance curves and dynamic feedback messaging.
 */

import { ACOUSTIC_MATRIX, resolveAcousticClassKey } from './AcousticMatrix.js?v=84';

export class ScoringEngine {
  /**
   * Evaluates user guess against target filter using strict weighted scoring.
   * MAX_FREQ_SCORE = 700
   * MAX_GAIN_SCORE = 300
   * FILTER_TYPE_BONUS = 100
   * 
   * @param {{ frequencyHz: number, gainDb: number, type?: string }} target 
   * @param {{ frequencyHz: number, gainDb: number, type?: string }} guess 
   * @returns {{
   *   totalScore: number,
   *   accuracyPercentage: number,
   *   octaveDistance: number,
   *   gainDifference: number,
   *   freqPoints: number,
   *   gainPoints: number,
   *   typeBonusPoints: number,
   *   isPolarityFlipped: boolean,
   *   isCorrect: boolean,
   *   feedbackMessage: string,
   *   ratingLabel: string
   * }}
   */
  static evaluate(target, guess) {
    const targetFreq = target.frequencyHz || target.freqHz || 1000;
    const targetGain = target.gainDb !== undefined ? target.gainDb : (target.gain || 0);
    const guessFreq = guess.frequencyHz || guess.freqHz || 1000;
    const guessGain = guess.gainDb !== undefined ? guess.gainDb : (guess.gain || 0);

    const MAX_FREQ_SCORE = 700;
    const MAX_GAIN_SCORE = 300;
    const FILTER_TYPE_BONUS = 100;

    // 1. Cálculo Estricto de Frecuencia (Octavas - Máximo tolerable 1 octava)
    const distanceOctaves = Math.abs(Math.log2(guessFreq / targetFreq));
    const freqTolerance = 1.0;
    const freqMultiplier = distanceOctaves >= freqTolerance ? 0 : Math.max(0, 1.0 - (distanceOctaves / freqTolerance));
    const freqPoints = Math.round(MAX_FREQ_SCORE * freqMultiplier);

    // 2. Excepción en la Evaluación de Ganancia para Filtros sin Ganancia (Notch, High-Pass, Low-Pass)
    const targetType = (target.type || target.filterType || '').toLowerCase();
    const guessType = (guess.type || guess.filterType || '').toLowerCase();
    const filtersWithoutGain = ['notch', 'highpass', 'lowpass', 'hp', 'lp'];
    const isNoGainFilter = filtersWithoutGain.includes(targetType);

    const gainDiff = Math.abs(guessGain - targetGain);
    let gainPoints = 0;
    let gainMultiplier = 0;
    let isPolarityFlipped = false;

    if (isNoGainFilter) {
      // Si el objetivo es un filtro sin ganancia, regalamos los puntos de ganancia (MAX_GAIN_SCORE = 300)
      // para que la precisión solo dependa de clavar la frecuencia.
      gainPoints = MAX_GAIN_SCORE;
      gainMultiplier = 1.0;
    } else {
      // Lógica habitual con penalización de signos para Bells y Shelves
      gainMultiplier = Math.max(0, 1 - (gainDiff / 12.0));

      // Penalización Crítica: Si el usuario realza cuando debía atenuar (o viceversa)
      if (Math.sign(guessGain) !== Math.sign(targetGain) && Math.abs(targetGain) > 0) {
        gainMultiplier = 0;
        isPolarityFlipped = true;
      }
      gainPoints = Math.round(MAX_GAIN_SCORE * gainMultiplier);
    }

    // Normalizar tipos para comparación estricta
    const normalizeType = (t) => {
      if (t === 'hp') return 'highpass';
      if (t === 'lp') return 'lowpass';
      if (t === 'bell') return 'peaking';
      return t;
    };
    const normTargetType = normalizeType(targetType);
    const normGuessType = normalizeType(guessType);

    // 3. Penalización Topológica Destructiva
    const isCut = (type) => ['highpass', 'lowpass'].includes(type);
    const isShelf = (type) => ['lowshelf', 'highshelf'].includes(type);
    const isBell = (type) => type === 'peaking';

    let topologicalPenalty = 1.0;

    // REGLA: Si el tipo de filtro no coincide, aplicamos penalizaciones topológicas en lugar de cero absoluto.
    if (normTargetType && normGuessType && normTargetType !== normGuessType) {
      if (isCut(normTargetType) && !isCut(normGuessType)) {
        topologicalPenalty = 0.3; // Castigo del 70% de los puntos
      }
      else if (!isCut(normTargetType) && isCut(normGuessType)) {
        topologicalPenalty = 0.3;
      }
      else if (isBell(normTargetType) && isShelf(normGuessType)) {
        topologicalPenalty = 0.4; // Castigo del 60% de los puntos
      }
      else if (isShelf(normTargetType) && isBell(normGuessType)) {
        topologicalPenalty = 0.5; // Castigo del 50% de los puntos
      } else {
        topologicalPenalty = 0.3; // Fallback
      }
    }

    // 4. Bono de Tipo de Filtro
    const isTypeMatch = normTargetType && normGuessType && (normTargetType === normGuessType);
    const typeBonusPoints = isTypeMatch ? FILTER_TYPE_BONUS : 0;

    // 5. Puntuación Base, Puntuación Total y Porcentaje de Precisión (Precisión pura sin bono)
    let basePoints = freqPoints + gainPoints; // Rango [0 - 1000 PTS]
    basePoints = Math.round(basePoints * topologicalPenalty);

    const precisionPercentage = topologicalPenalty === 0.0 ? 0 : Math.round((basePoints / 1000) * 100);

    // Solo damos el bono por acertar el tipo de filtro si la precisión es aceptable (>= 40%)
    const actualTypeBonus = precisionPercentage >= 40 ? typeBonusPoints : 0;
    const totalScore = basePoints + actualTypeBonus; // Rango [0 - 1100 PTS con Bono]

    const isCorrect = precisionPercentage >= 35 && !isPolarityFlipped && topologicalPenalty === 1.0; // Umbral de aprobación

    // 6. Textos de Feedback y Títulos en UI
    let ratingLabel = '';
    let feedbackMessage = '';

    if (isPolarityFlipped && freqMultiplier >= 0.7) {
      ratingLabel = '¡Frecuencia Correcta, Ganancia Opuesta!';
      feedbackMessage = 'Identificaste la zona frecuencial, pero realzaste cuando debías atenuar (o viceversa). La ganancia opuesta invalida el balance de la mezcla.';
    } else if (isPolarityFlipped) {
      ratingLabel = '💔 Fuera de Rango y Ganancia Opuesta';
      feedbackMessage = 'Frecuencia incorrecta y realzaste cuando debías atenuar (o viceversa).';
    } else if (topologicalPenalty < 1.0) {
      ratingLabel = '⚠️ Topología Incompatible';
      if (topologicalPenalty === 0.3) {
        feedbackMessage = 'Identificaste la frecuencia, pero usaste una campana/shelf donde se requería un filtro de corte (High Pass / Low Pass). La penalización por tipo de filtro reduce un 70% tus puntos.';
      } else if (topologicalPenalty === 0.4) {
        feedbackMessage = 'Confundiste un realce puntual (Bell) con uno infinito (Shelf). El Shelf levanta todo el espectro adyacente desequilibrando la mezcla (-60% de puntos).';
      } else {
        feedbackMessage = 'Confundiste un Shelf con una Bell. La campana deja los extremos sin procesar (-50% de puntos).';
      }
    } else if (precisionPercentage >= 90) {
      ratingLabel = '🎯 ¡Precisión Quirúrgica!';
      feedbackMessage = `¡Excelente! Ajuste quirúrgico en frecuencia y ganancia (+${basePoints} PTS).`;
    } else if (freqMultiplier >= 0.7 && gainPoints === 0) {
      ratingLabel = '📐 Frecuencia Cercana, Error en dB';
      feedbackMessage = 'Buena aproximación frecuencial, pero la ganancia está fuera de rango.';
    } else if (gainMultiplier >= 0.7 && freqPoints === 0) {
      ratingLabel = '🎚️ Ganancia Ajustada, Revisa Hz';
      feedbackMessage = 'Nivel de dB correcto, pero la frecuencia está alejada.';
    } else if (precisionPercentage >= 40) {
      ratingLabel = '👍 Buen Intento';
      feedbackMessage = 'Buen intento. Cerca de la zona, afina un poco más la escucha.';
    } else {
      ratingLabel = '💔 Fuera de Rango';
      feedbackMessage = 'Fuera de rango. Compara la diferencia entre EQ Off y EQ On con atención.';
    }

    return {
      totalScore,
      accuracyPercentage: precisionPercentage,
      precisionPercentage,
      octaveDistance: distanceOctaves,
      gainDifference: gainDiff,
      freqPoints,
      gainPoints,
      typeBonusPoints: actualTypeBonus,
      topologicalPenalty,
      isPolarityFlipped,
      isCorrect,
      feedbackMessage,
      ratingLabel
    };
  }

  /**
   * Calculates detailed score breakdown for single or multi-band filter evaluation.
   * @param {Array} targetFilters 
   * @param {Array} userGuesses 
   * @param {string} [difficulty='normal'] 
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
  static calculateScore(targetFilters, userGuesses, difficulty = 'normal') {
    if (!targetFilters || targetFilters.length === 0) {
      return {
        totalScore: 0,
        totalPrecision: 0,
        band1Precision: 0,
        band2Precision: 0,
        band1Octave: 0,
        band2Octave: 0,
        bandResults: []
      };
    }

    let totalPoints = 0;
    let totalPrecisionSum = 0;
    const bandResults = [];

    const numBands = targetFilters.length;

    for (let i = 0; i < numBands; i++) {
      const target = targetFilters[i];

      // Encontrar el mejor nodo del usuario para este objetivo (útil si hay nodos inactivos extra)
      let bestGuess = userGuesses && userGuesses.length > 0 ? userGuesses[0] : { frequencyHz: 1000, gainDb: 0 };
      if (userGuesses && userGuesses.length > 1) {
        let bestScore = -1;
        for (const g of userGuesses) {
          const testEval = ScoringEngine.evaluate(target, g);
          if (testEval.accuracyPercentage > bestScore) {
            bestScore = testEval.accuracyPercentage;
            bestGuess = g;
          }
        }
      }

      const guess = bestGuess;

      const evalResult = ScoringEngine.evaluate(target, guess);
      const isTypeCorrect = (guess.type || '').toLowerCase() === (target.type || '').toLowerCase();
      let bandPoints = evalResult.totalScore;

      totalPoints += bandPoints;
      totalPrecisionSum += evalResult.accuracyPercentage;

      bandResults.push({
        evalResult,
        target,
        guess,
        isTypeCorrect,
        bandPoints
      });
    }

    const totalScore = numBands > 0 ? Math.round(totalPoints / numBands) : 0;
    const totalPrecision = numBands > 0 ? Math.round(totalPrecisionSum / numBands) : 0;

    const band1Precision = bandResults[0] ? bandResults[0].evalResult.accuracyPercentage : 0;
    const band2Precision = bandResults[1] ? bandResults[1].evalResult.accuracyPercentage : 0;
    const band1Octave = bandResults[0] ? bandResults[0].evalResult.octaveDistance : 0;
    const band2Octave = bandResults[1] ? bandResults[1].evalResult.octaveDistance : 0;

    return {
      totalScore,
      totalPrecision,
      band1Precision,
      band2Precision,
      band1Octave,
      band2Octave,
      bandResults
    };
  }

  /**
   * Generates pedagogical feedback based on the user's action and the acoustic context.
   * @param {string} acousticClass - The instrument category (e.g., 'kick', 'vocals').
   * @param {number} guessFreq - The frequency chosen by the user.
   * @param {number} guessGain - The gain chosen by the user.
   * @returns {{ bandName: string, text: string, type: string } | null}
   */
  static getPedagogicalFeedback(acousticClass, guessFreq, guessGain) {
    // Accepts either a canonical class key or a free-form name / track id.
    const resolvedClass = resolveAcousticClassKey(acousticClass);
    if (!ACOUSTIC_MATRIX[resolvedClass]) {
      return null;
    }

    const bands = ACOUSTIC_MATRIX[resolvedClass];
    if (!bands) return null;

    for (const band of bands) {
      if (guessFreq >= band.minHz && guessFreq <= band.maxHz) {
        if (guessGain > 0) return { bandName: band.name, text: band.boostText, type: 'boost' };
        if (guessGain < 0) return { bandName: band.name, text: band.cutText, type: 'cut' };
      }
    }

    return null;
  }

  /**
   * Tarea 2: Lógica de Detección de "Falsos Amigos"
   * Función pura que evalúa si el intento del usuario confunde tipos de filtro con comportamientos similares.
   * @param {{ type?: string, filterType?: string, gain?: number, gainDb?: number, frequency?: number, frequencyHz?: number }} target 
   * @param {{ type?: string, filterType?: string, gain?: number, gainDb?: number, frequency?: number, frequencyHz?: number }} guess 
   * @returns {string|null} Cadena didáctica de ayuda o null si no aplica falso amigo.
   */
  static checkFilterFalseFriends(target, guess) {
    return checkFilterFalseFriends(target, guess);
  }

  /**
   * Tarea 2 (Modo Pro): Lógica Analítica de "Malas Prácticas Pro"
   * Evalúa alterations de fase, Group Delay y enmascaramiento psicoacústico.
   * @param {Object} target 
   * @param {Object} guess 
   * @returns {{ message: string, isWarning: boolean, warnings: string[], hasWarnings: boolean }}
   */
  static analyzeProPractices(target, guess) {
    return analyzeProPractices(target, guess);
  }

  /**
   * Evaluates a dynamic-range (compressor) guess against a target parameter set.
   *
   * Score model (didactic + weighted):
   *   - Each scored key contributes `weight * subScore`, where the sub-score is a
   *     continuous tolerance curve: 1.0 inside the "expert" tolerance, 0 beyond the
   *     "off" tolerance, linearly interpolated in between.
   *   - dB / mix / hold use an absolute tolerance; ratios use a relative tolerance;
   *     attack & release use a log2 (musical) tolerance.
   *   - Categorical keys (style, sidechain) are exact-match and, when wrong, block a
   *     "correct" verdict so a mismatched topology can never silently pass.
   *   - A small synthetic "direction" component rewards agreeing on upward-vs-downward
   *     compression, so a purely downward answer cannot fully pass an upward scenario.
   *
   * @param {object} target sanitized reference params (see DEFAULT_DYNAMICS_PARAMS).
   * @param {object} guess  sanitized user params.
   * @param {{challenge?:object,scenario?:object,mode?:string}} [ctx]
   * @returns {{
   *   totalScore:number,
   *   accuracyPercentage:number,
   *   isCorrect:boolean,
   *   feedbackMessage:string,
   *   ratingLabel:string,
   *   breakdown:Array<{key:string,weight:number,score:number}>
   * }}
   */
  static evaluateDynamics(target, guess, ctx = {}) {
    const MAX_DYNAMICS_SCORE = 1000;

    const TOLERANCE = {
      thresholdDb: { kind: 'abs', good: 1.5, bad: 6 },
      upwardThresholdDb: { kind: 'abs', good: 1.5, bad: 6 },
      kneeDb: { kind: 'abs', good: 2, bad: 8 },
      makeupDb: { kind: 'abs', good: 1.5, bad: 6 },
      holdMs: { kind: 'abs', good: 15, bad: 80 },
      mix: { kind: 'abs', good: 0.05, bad: 0.35 },
      ratio: { kind: 'rel', good: 0.12, bad: 0.6 },
      upwardRatio: { kind: 'rel', good: 0.15, bad: 0.7 },
      attackMs: { kind: 'log', good: 0.25, bad: 1.2 },
      releaseMs: { kind: 'log', good: 0.25, bad: 1.2 }
    };

    // Used when a caller submits without a challenge (e.g. a bare Lab probe).
    const DEFAULT_WEIGHTS = {
      thresholdDb: 0.3,
      ratio: 0.25,
      attackMs: 0.15,
      releaseMs: 0.15,
      style: 0.15
    };

    const LABELS = {
      thresholdDb: 'el umbral de compresión',
      ratio: 'el ratio',
      kneeDb: 'el codo (knee)',
      attackMs: 'el ataque',
      releaseMs: 'el release',
      holdMs: 'el hold',
      makeupDb: 'la ganancia de compensación (makeup)',
      mix: 'la mezcla dry/wet',
      upwardThresholdDb: 'el umbral de compresión al alza',
      upwardRatio: 'el ratio al alza',
      style: 'el tipo de compresor',
      sidechain: 'el disparador de sidechain',
      direction: 'la dirección (arriba vs abajo)'
    };

    const t = target || {};
    const g = guess || {};
    const challenge = ctx && ctx.challenge ? ctx.challenge : null;
    const rawWeights =
      challenge && challenge.weights && Object.keys(challenge.weights).length
        ? challenge.weights
        : DEFAULT_WEIGHTS;

    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    const curve = (distance, good, bad) => {
      const d = Math.abs(distance);
      if (d <= good) return 1;
      if (d >= bad) return 0;
      return clamp01(1 - (d - good) / (bad - good));
    };

    const numericScore = (tv, gv, tol) => {
      if (!tol) return curve(gv - tv, 1, 4);
      if (tol.kind === 'rel') {
        const base = Math.max(Math.abs(tv), 1e-6);
        return curve((gv - tv) / base, tol.good, tol.bad);
      }
      if (tol.kind === 'log') {
        const lv = Math.log2(Math.max(gv, 1e-3) / Math.max(tv, 1e-3));
        return curve(lv, tol.good, tol.bad);
      }
      return curve(gv - tv, tol.good, tol.bad);
    };

    const breakdown = [];
    let weightedSum = 0;
    let weightTotal = 0;
    let categoricalOk = true;

    Object.keys(rawWeights).forEach((key) => {
      const w = Math.max(0, Number(rawWeights[key]) || 0);
      if (w <= 0) return;

      let score = 0;
      if (key === 'style') {
        score = t.style === g.style ? 1 : 0;
        if (score < 1) categoricalOk = false;
      } else if (key === 'sidechain') {
        score = (!!t.sidechain === !!g.sidechain) ? 1 : 0;
        if (score < 1) categoricalOk = false;
      } else if (key === 'detector') {
        score = t.detector === g.detector ? 1 : 0;
      } else if (key === 'feedback') {
        score = (!!t.feedback === !!g.feedback) ? 1 : 0;
      } else if (key === 'upwardEnabled') {
        score = (!!t.upwardEnabled === !!g.upwardEnabled) ? 1 : 0;
      } else {
        score = numericScore(Number(t[key]) || 0, Number(g[key]) || 0, TOLERANCE[key]);
      }

      weightedSum += w * score;
      weightTotal += w;
      breakdown.push({ key, weight: w, score: Math.round(score * 100) / 100 });
    });

    // Direction: reward agreeing on upward-vs-downward compression.
    const hasUpwardWeight =
      Object.prototype.hasOwnProperty.call(rawWeights, 'upwardThresholdDb') ||
      Object.prototype.hasOwnProperty.call(rawWeights, 'upwardRatio') ||
      Object.prototype.hasOwnProperty.call(rawWeights, 'upwardEnabled');
    const dirWeight = hasUpwardWeight ? 0.1 : 0.15;
    const dirScore = (!!t.upwardEnabled === !!g.upwardEnabled) ? 1 : 0;
    weightedSum += dirWeight * dirScore;
    weightTotal += dirWeight;
    breakdown.push({ key: 'direction', weight: dirWeight, score: dirScore });

    const accuracy = weightTotal > 0 ? clamp01(weightedSum / weightTotal) : 0;
    const accuracyPercentage = Math.round(accuracy * 100);
    const totalScore = Math.round(accuracy * MAX_DYNAMICS_SCORE);
    const isCorrect = accuracyPercentage >= 80 && categoricalOk;

    const ratingLabel =
      accuracyPercentage >= 95 ? 'Oído de estudio'
        : accuracyPercentage >= 80 ? 'Sólido'
          : accuracyPercentage >= 60 ? 'En progreso'
            : 'Sigue practicando';

    let feedbackMessage;
    if (isCorrect) {
      feedbackMessage =
        accuracyPercentage >= 95
          ? 'Ajuste casi perfecto: controlas este parámetro.'
          : 'Bien: el ajuste cae dentro de la tolerancia didáctica del objetivo.';
    } else if (!categoricalOk) {
      const missed = breakdown
        .filter((b) => (b.key === 'style' || b.key === 'sidechain') && b.score < 1)
        .map((b) => LABELS[b.key] || b.key);
      feedbackMessage =
        `Casi (${accuracyPercentage}%). Pero revisa ${missed.join(' y ')}: ` +
        'la familia de compresor o el disparador no coinciden con lo que pide el escenario.';
    } else {
      const worst = breakdown
        .slice()
        .sort((a, b) => (a.score - b.score) || (b.weight - a.weight))[0];
      const label = worst && LABELS[worst.key] ? LABELS[worst.key] : 'los parámetros';
      feedbackMessage = `Vas cerca (${accuracyPercentage}%). Afina sobre todo ${label}.`;
    }

    return {
      totalScore,
      accuracyPercentage,
      isCorrect,
      feedbackMessage,
      ratingLabel,
      breakdown
    };
  }
}

/**
 * Tarea 2: Función Pura Exportada checkFilterFalseFriends(target, guess)
 */
export function checkFilterFalseFriends(target, guess) {
  if (!target || !guess) return null;

  // Normalizar propiedades (soporta camelCase, lowercase, gain/gainDb, frequency/frequencyHz)
  const rawTargetType = target.type !== undefined ? target.type : target.filterType;
  const targetGain = target.gain !== undefined ? target.gain : (target.gainDb !== undefined ? target.gainDb : 0);
  const targetFreq = target.frequency !== undefined ? target.frequency : (target.frequencyHz !== undefined ? target.frequencyHz : (target.freqHz !== undefined ? target.freqHz : 0));

  const rawGuessType = guess.type !== undefined ? guess.type : guess.filterType;
  const guessGain = guess.gain !== undefined ? guess.gain : (guess.gainDb !== undefined ? guess.gainDb : 0);
  const guessFreq = guess.frequency !== undefined ? guess.frequency : (guess.frequencyHz !== undefined ? guess.frequencyHz : (guess.freqHz !== undefined ? guess.freqHz : 0));

  const targetType = (rawTargetType || '').toLowerCase();
  const guessType = (rawGuessType || '').toLowerCase();

  // Caso 1 (Target: Low Shelf atenuando / Guess: High Pass)
  if (targetType === 'lowshelf' && targetGain < 0 && guessType === 'highpass') {
    return "¡Ojo con el hacha! Has notado que sobran graves y le has metido un High Pass. El High Pass corta TODO de raíz. El Low Shelf es más como bajarle un poco el volumen a esa zona sin castrar el instrumento. Si escuchabas algo de fondo, era un Shelf.";
  }

  // Caso 2 (Target: High Pass / Guess: Low Shelf atenuando)
  if (targetType === 'highpass' && guessType === 'lowshelf' && guessGain < 0) {
    return "Casi, pero te quedaste corto. El Low Shelf atenúa, pero sigue dejando pasar graves por debajo. Aquí el problema pedía tijera de podar (un High Pass) para limpiar de golpe todo ese ruido de fondo inútil.";
  }

  // Caso 3 (Target: High Shelf realzando / Guess: Bell en agudos)
  if (targetType === 'highshelf' && targetGain > 0 && (guessType === 'peaking' || guessType === 'bell') && guessFreq > 5000) {
    return "Le has metido brillo con una Campana, lo que resalta un punto concreto y vuelve a bajar. Pero esto pedía un High Shelf: levantar desde ahí hacia arriba para abrir el 'aire' de la mezcla. Si notas que subió el siseo hasta el infinito, suele ser un Shelf.";
  }

  // Caso 4: La Trampa del Aire (Bell vs High Shelf)
  if ((targetType === 'peaking' || targetType === 'bell') && targetFreq > 1500 && (guessType === 'highshelf' || guessType === 'high_shelf')) {
    return "Te pasaste de frenada. Acertaste la zona, pero usaste un High Shelf. La Campana (Bell) levanta el ataque de un elemento concreto; el Shelf levanta todo el 'aire' de golpe. Acabas de freírnos los oídos sacando a flote todo el siseo y ruido de fondo de la pista.";
  }

  // Caso 5: El Falso Teléfono (Bandpass vs Doble Shelf / Shelves)
  if (targetType === 'bandpass' && (guessType.includes('shelf'))) {
    return "Intentaste hacer el clásico efecto de 'teléfono' usando Shelves para bajar extremos. Eso no sirve, siempre se cuela sonido. Para un efecto de radio puro, hay que tajar por ambos lados con cortes absolutos (High Pass + Low Pass) o un Bandpass directo.";
  }

  return null;
}

// Contenido didáctico unificado en AcousticMatrix.js (ACOUSTIC_MATRIX).
// Cualquier nombre / id de pista se resuelve con resolveAcousticClassKey().

/**
 * Tarea 3 (Modo Pro): Función Pura Exportada analyzeProPractices(target, guess, acousticClassOrName)
 * Evaluador didáctico de impacto en la mezcla para alumnos de sonido y producción.
 * @param {string} [acousticClassOrName] Clave de clase (ej. 'kick') o nombre/id libre de la pista.
 */
export function analyzeProPractices(target, guess, acousticClassOrName = "") {
  const fallbackMessage = "Buen ajuste. Has dado en la tecla sin hacer salvajadas con la ganancia. Esto es un ajuste estándar de mezcla que no te va a dar problemas técnicos.";
  if (!guess) {
    return {
      message: fallbackMessage,
      isWarning: false,
      warnings: [fallbackMessage],
      hasWarnings: false
    };
  }

  const rawTargetType = target ? (target.type !== undefined ? target.type : target.filterType) : '';
  const targetType = (rawTargetType || '').toLowerCase();

  const rawGuessType = guess.type !== undefined ? guess.type : guess.filterType;
  const guessType = (rawGuessType || '').toLowerCase();

  const guessGain = guess.gain !== undefined ? guess.gain : (guess.gainDb !== undefined ? guess.gainDb : 0);
  const guessFreq = guess.frequency !== undefined ? guess.frequency : (guess.frequencyHz !== undefined ? guess.frequencyHz : (guess.freqHz !== undefined ? guess.freqHz : 0));
  const guessQ = guess.Q !== undefined ? guess.Q : (guess.qFactor !== undefined ? guess.qFactor : (guess.q !== undefined ? guess.q : 2.0));

  let message = "";
  let isWarning = true;

  // NOTE (de-duplication): the band impact text (ACOUSTIC_MATRIX boostText/cutText)
  // is ALREADY surfaced by the "Efecto de TU filtro en la mezcla" card via
  // ScoringEngine.getPedagogicalFeedback(). We intentionally do NOT re-inject it
  // here, otherwise Pro/Hard trials would render the exact same sentence twice.

  // Condición 1 (High Pass vs Low Shelf en graves)
  if ((targetType === 'highpass' && guessType === 'lowshelf') || (targetType === 'lowshelf' && guessType === 'highpass')) {
    message = "⚠️ Corte vs. Atenuación: Ojo con usar un High Pass por inercia si solo sobran un poco de graves. El High Pass es muy agresivo y en graves puede crearte problemas raros si luego comprimes. Usa el Low Shelf si solo quieres bajar el peso un par de decibelios.";
  }
  // Condición 2: Q vs Ganancia (La relación matemática)
  else if ((guessType === 'peaking' || guessType === 'bell') && guessGain > 6 && guessQ < 0.7) {
    message = "⚠️ Mano de hierro: Estás metiendo más de 6 decibelios con una campana anchísima. Has levantado de golpe casi media canción. Esos realces tan gordos se comen el volumen general y ensucian. Realces anchos siempre con muy poca ganancia.";
  }
  // Condición 3: Enmascaramiento vs Realce (La alternativa Pro)
  else if ((guessType === 'peaking' || guessType === 'bell') && guessGain > 8 && guessFreq < 300) {
    message = "⚠️ Sutileza cero: Subir casi 10dB en graves suele ser síntoma de que otra pista te está tapando (un bajo, otro bombo...). En lugar de forzar a lo bestia esta pista, busca quién estorba y bájale a él. Ganarás claridad.";
  }
  // Condición 4 (Campanas muy estrechas - Q > 3.0)
  else if ((guessType === 'peaking' || guessType === 'bell') && guessQ > 3.0 && guessGain > 3) {
    message = "⚠️ Campana demasiado fina: Una Q tan estrecha suena literal como un silbato metálico. Si la usas en un instrumento de golpe rápido (bombo/caja) te cargas la pegada. Resérvalas solo para atenuar resonancias súper concretas que chillen mucho.";
  }
  // Condición 5 (Realces agresivos - Gain > 9dB)
  else if (guessGain > 9.0) {
    message = "⚠️ Estás reventando el medidor: Subir casi 10dB es una animalada. Probablemente estés ahogando al resto de instrumentos en esa frecuencia y reventando el rojo del canal. Casi siempre es más elegante buscar lo que sobra y atenuarlo.";
  }
  // Condición 6 (Filtros en Extremos - High/Low Pass fuera de rango)
  else if ((guessType === 'highpass' && guessFreq > 1000) || (guessType === 'lowpass' && guessFreq < 1000)) {
    message = "⚠️ Mutilación total: Acabas de cortar todo el rango útil de frecuencias. Estás dejando el audio sonando a radio vieja. Salvo que busques ese efecto raro adrede, esto no se usa para mezclar un instrumento en su sitio.";
  }
  // Fallback
  else {
    message = fallbackMessage;
    isWarning = false;
  }

  return {
    message,
    isWarning,
    warnings: [message],
    hasWarnings: isWarning
  };
}

