/**
 * @file ScoringEngine.js
 * @description Independent Weighted Scoring Engine for Surgical EQ Ear Training.
 * Evaluates Frequency (70% weight, 700 pts max) and Gain (30% weight, 300 pts max)
 * independently using continuous linear tolerance curves and dynamic feedback messaging.
 */

import { ACOUSTIC_MATRIX } from './AcousticMatrix.js?v=21';

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

    // Only award type bonus if they got at least some points for freq/gain
    const actualTypeBonus = basePoints > 0 ? typeBonusPoints : 0;
    const totalScore = basePoints + actualTypeBonus; // Rango [0 - 1100 PTS con Bono]
    const precisionPercentage = topologicalPenalty === 0.0 ? 0 : Math.round((basePoints / 1000) * 100);

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
      typeBonusPoints,
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
    if (!acousticClass || !ACOUSTIC_MATRIX[acousticClass]) {
      acousticClass = 'generic';
    }
    
    const bands = ACOUSTIC_MATRIX[acousticClass];
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
    return "¡Falso Amigo! Has notado que hay menos graves, pero usaste la herramienta equivocada. Un High Pass es como un muro: elimina todo lo que hay por debajo. El Low Shelf es como un escalón: baja el volumen de los graves, pero los deja seguir sonando de fondo. Si aún escuchas el peso del subgrave, es un Shelf.";
  }

  // Caso 2 (Target: High Pass / Guess: Low Shelf atenuando)
  if (targetType === 'highpass' && guessType === 'lowshelf' && guessGain < 0) {
    return "¡Casi! Identificaste la zona del problema. Sin embargo, el Low Shelf deja un 'suelo' por el que se siguen colando ruidos graves. El objetivo era un High Pass, que actúa como un acantilado y limpia absolutamente todo el retumbe innecesario.";
  }

  // Caso 3 (Target: High Shelf realzando / Guess: Bell en agudos)
  if (targetType === 'highshelf' && targetGain > 0 && (guessType === 'peaking' || guessType === 'bell') && guessFreq > 5000) {
    return "¡Ambos dan brillo, pero cuidado! Una Campana (Bell) sube una zona concreta y luego vuelve a bajar. El High Shelf sube esa frecuencia Y todo lo que haya por encima de ella hasta el límite auditivo. Si notas que el siseo súper agudo ('hiss') también ha subido mucho, suele ser un Shelf.";
  }

  // Caso 4: La Trampa del Aire (Bell vs High Shelf)
  if ((targetType === 'peaking' || targetType === 'bell') && targetFreq > 1500 && (guessType === 'highshelf' || guessType === 'high_shelf')) {
    return "¡Falso Amigo! Acertaste la zona de presencia, pero usaste un High Shelf. La Campana da ataque a un elemento concreto; el Shelf levanta indiscriminadamente todo el ruido de fondo (hiss) y la fatiga auditiva hasta los 20kHz. Acabas de ensordecer la mezcla.";
  }

  // Caso 5: El Falso Teléfono (Bandpass vs Doble Shelf / Shelves)
  if (targetType === 'bandpass' && (guessType.includes('shelf'))) {
    return "¡Falso Amigo! Intentaste aislar los medios atenuando graves y agudos con Shelves (estanterías). Esto deja un 'suelo' por el que se colan los extremos. Para un efecto telefónico o de radio puro, necesitas aislar completamente con cortes (High Pass + Low Pass o un Bandpass).";
  }

  return null;
}

const ContextMatrix = {
  bombo: [
    { range: [0, 55], boost: "Sub-graves: Añade peso y energía en subsistemas grandes, pero resta headroom rápidamente.", cut: "Sub-graves: Limpia el rumble. Útil si el bajo (bassline) debe liderar esta zona." },
    { range: [55, 150], boost: "Cuerpo: Aumenta la pegada en el pecho (punch).", cut: "Cuerpo: Adelgaza el sonido. Sugiere que se intenta hacer hueco para otro instrumento (como el bajo) o eliminar resonancias." },
    { range: [150, 450], boost: "Zona Fangosa / Mud: Ensucia la mezcla, añade sonido a 'caja de cartón'.", cut: "Zona Fangosa / Mud: Práctica muy común. Limpia la mezcla y da claridad al resto de elementos." },
    { range: [450, 2500], boost: "Medios: Realzar aquí ensucia el ataque con un tono nasal a lata.", cut: "Medios: Vacía el centro para hacer espacio a las guitarras y voces." },
    { range: [2500, 6000], boost: "Ataque / Clic: Resalta el impacto de la maza contra el parche. Ayuda a que el bombo corte en mezclas densas.", cut: "Ataque / Clic: Suaviza el bombo, dándole un tono más vintage o apagado." },
    { range: [6000, 24000], boost: "Agudos / Aire: Aumenta el siseo y exacerba drásticamente el sangrado (bleed) de platos.", cut: "Agudos / Aire: Filtra ruido de alta frecuencia irrelevante para un bombo." }
  ],
  caja: [
    { range: [0, 150], boost: "Rumble: Ensucia la mezcla con graves innecesarios.", cut: "Rumble: Excelente práctica (High Pass) para dejar espacio al bajo y bombo." },
    { range: [150, 250], boost: "Cuerpo / Body: Le da grosor y peso a la caja.", cut: "Cuerpo: Adelgaza la caja haciéndola sonar débil o distante." },
    { range: [250, 800], boost: "Ring / Armónico: Aumenta el tono 'boing' o resonancia metálica del casco.", cut: "Ring / Armónico: Limpia las resonancias molestas para que la caja suene más seca y controlada." },
    { range: [800, 3000], boost: "Presencia (Bordón): Acerca la caja en la mezcla, pero puede chocar con las voces.", cut: "Presencia: Aleja la caja en el plano de profundidad." },
    { range: [3000, 7000], boost: "Ataque / Crack: Realza el golpe agudo del baquetazo.", cut: "Ataque / Crack: Suaviza el impacto." },
    { range: [7000, 24000], boost: "Aire / Snappy: Añade brillo extremo al bordón (snares). Cuidado con el sangrado de charles.", cut: "Aire: Quita el brillo moderno, dejándola más vintage." }
  ],
  voces: [
    { range: [0, 100], boost: "Rumble / Plops: Exagera los golpes de aire en el micrófono (plosivas).", cut: "Rumble: Práctica obligatoria (High Pass) para limpiar graves." },
    { range: [100, 300], boost: "Calidez / Mud: Añade cuerpo y proximidad, pero en exceso suena embarrado (muddy).", cut: "Calidez: Elimina el efecto proximidad, aclara la voz pero puede dejarla anémica." },
    { range: [300, 1000], boost: "Caja de cartón / Boxy: Hace que la voz suene nasal o encajonada.", cut: "Boxy: Limpia resonancias nasales molestas." },
    { range: [1000, 3000], boost: "Inteligibilidad / Nasal: Resalta las consonantes, puede sonar áspero o como un teléfono.", cut: "Inteligibilidad: Suaviza voces muy agresivas." },
    { range: [3000, 6000], boost: "Presencia: La voz salta al frente de la mezcla. Exceso causa fatiga auditiva rápida.", cut: "Presencia: Aleja la voz y la entierra en la mezcla." },
    { range: [6000, 9000], boost: "Sibilancia: Exagera las 'S' y 'T', resultando punzante.", cut: "Sibilancia: Actúa como de-esser manual, suavizando eses molestas." },
    { range: [9000, 24000], boost: "Aire: Añade un brillo caro y moderno, sensación de 'aliento'.", cut: "Aire: Oscurece la voz." }
  ],
  bajo: [
    { range: [0, 60], boost: "Sub: Añade cimientos, pero puede comerse todo el headroom.", cut: "Sub: Deja espacio al bombo en sistemas grandes." },
    { range: [60, 200], boost: "Cuerpo principal: Da peso y fundamenta las notas.", cut: "Cuerpo: Adelgaza drásticamente el bajo." },
    { range: [200, 500], boost: "Mud: Suele chocar fuertemente con la calidez de las guitarras y el bombo.", cut: "Mud: Práctica estándar para ganar claridad en el Low-End." },
    { range: [500, 1500], boost: "Ataque de dedos / Púa: Ayuda a que el bajo se entienda en altavoces pequeños.", cut: "Ataque: Deja un sonido más profundo y dubby." },
    { range: [1500, 5000], boost: "Trasteo / Cuerda: Resalta mucho el ruido metálico de los trastes.", cut: "Trasteo: Suaviza la ejecución." },
    { range: [5000, 24000], boost: "Siseo: Aumenta el ruido de amplificador sin aportar tono musical.", cut: "Siseo: Limpieza estándar (Low Pass)." }
  ],
  guitarras: [
    { range: [0, 100], boost: "Rumble: Ensucia los graves sin aportar musicalidad.", cut: "Rumble: Práctica obligatoria (High Pass) para dejar espacio al bajo y bombo." },
    { range: [100, 250], boost: "Grosor (Chug): Da peso a las rítmicas palm-mute.", cut: "Grosor: Evita que choquen con el bajo eléctrico." },
    { range: [250, 800], boost: "Mud / Boxy: Puede sonar a amplificador barato o encajonado.", cut: "Mud: Limpia y abre espacio para otros instrumentos." },
    { range: [800, 2500], boost: "Mordida (Bite): La guitarra avanza en la mezcla, resalta los punteos.", cut: "Mordida: Suaviza el tono, ideal para guitarras rítmicas de fondo." },
    { range: [2500, 5000], boost: "Harshness (Aspereza): Zona muy sensible para el oído humano. Fatiga rápido.", cut: "Harshness: Cortar aquí elimina el tono 'chicharra' de las distorsiones." },
    { range: [5000, 24000], boost: "Fizz / Siseo: Realza el ruido blanco de los amplificadores de alta ganancia.", cut: "Fizz: Práctica estándar (Low Pass) para enfocar las guitarras eléctricas." }
  ],
  platos: [
    { range: [0, 400], boost: "Sangrado de graves: Realza bombo y toms indeseados.", cut: "Sangrado: Limpieza extrema (High Pass) para dejar solo el brillo." },
    { range: [400, 1500], boost: "Gong / Lata: Añade un tono acampanado u oscuro muy feo a los platos.", cut: "Lata: Limpia resonancias de la sala y del propio metal." },
    { range: [1500, 5000], boost: "Aspereza: Los platos suenan hirientes y baratos.", cut: "Aspereza: Suaviza los crashes y el hi-hat fuertemente." },
    { range: [5000, 10000], boost: "Brillo: Aumenta la definición de la baqueta sobre el ride/charles.", cut: "Brillo: Aleja la batería." },
    { range: [10000, 24000], boost: "Aire (Wash): Aumenta el siseo y la 'cola' etérea de los platos.", cut: "Aire: Apaga los platos, oscureciendo toda la mezcla superior." }
  ],
  drumbus: [
    { range: [0, 100], boost: "Glue Subs: Añade peso masivo a toda la batería.", cut: "Subs: Adelgaza el groove general." },
    { range: [100, 400], boost: "Boxy / Mud: Enturbia la batería entera.", cut: "Mud: Aclara todo el kit y mejora la separación de elementos." },
    { range: [400, 3000], boost: "Ataque: Realza el golpe de las baquetas en caja y toms al unísono.", cut: "Ataque: Hundimiento de la batería en la mezcla." },
    { range: [3000, 8000], boost: "Presencia: Aumenta la agresividad general de la batería y platos.", cut: "Presencia: Suaviza un kit demasiado agresivo." },
    { range: [8000, 24000], boost: "Aire: Brillo hiperrealista en los platos y ambiente de sala.", cut: "Aire: Oscurece el bus maestro." }
  ],
  sala: [
    { range: [0, 200], boost: "Boom de sala: Aumenta la sensación de tamaño del cuarto, puede embarrar.", cut: "Boom: Limpia el Low-End de la reverberación natural." },
    { range: [200, 800], boost: "Boxiness: Realza resonancias modales indeseadas de una habitación cuadrada.", cut: "Boxiness: Limpia y hace que la sala suene más cara y difusa." },
    { range: [800, 4000], boost: "Presencia de sala: Hace que el rebote suene más corto y directo.", cut: "Presencia: Aleja la sala, haciéndola sonar más profunda y oscura." },
    { range: [4000, 24000], boost: "Splash: Resalta el rebote brillante de los platos en las paredes.", cut: "Splash: Crea un ambiente más oscuro y vintage tipo 'cinta'." }
  ],
  generic: [
    { range: [0, 150], boost: "Graves/Cuerpo: Añade peso.", cut: "Graves/Cuerpo: Reduce el peso." },
    { range: [150, 600], boost: "Medios graves (Mud): Puede enturbiar.", cut: "Medios graves (Mud): Aclara el sonido." },
    { range: [600, 3000], boost: "Medios/Presencia: Añade ataque.", cut: "Medios/Presencia: Retira agresividad." },
    { range: [3000, 8000], boost: "Agudos (Harshness): Añade brillo y mordida.", cut: "Agudos (Harshness): Suaviza el tono." },
    { range: [8000, 24000], boost: "Aire: Brillo muy agudo.", cut: "Aire: Oscurece ligeramente." }
  ]
};

/**
 * Tarea 3 (Modo Pro): Función Pura Exportada analyzeProPractices(target, guess, audioContext)
 * Evaluador didáctico de impacto en la mezcla para alumnos de sonido y producción.
 * audioContext contiene el nombre de la pista actual (ej. "Bombo Estudio (Seco)") para feedback dinámico.
 */
export function analyzeProPractices(target, guess, audioContext = "") {
  const fallbackMessage = "✅ Práctica Segura: Los parámetros seleccionados mantienen la coherencia de fase y dinámica dentro de márgenes musicales. Ajuste óptimo para ecualización general.";
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

  let contextMatrixFeedback = null;
  const audioCtxLower = audioContext.toLowerCase();
  
  if (audioCtxLower.includes('bombo')) {
    const bands = ContextMatrix.bombo;
    for (const band of bands) {
      if (guessFreq >= band.range[0] && guessFreq < band.range[1]) {
        if (guessGain > 0.5) {
          contextMatrixFeedback = `🎧 Contexto (Bombo - Boost): ${band.boost}`;
        } else if (guessGain < -0.5) {
          contextMatrixFeedback = `🎧 Contexto (Bombo - Cut): ${band.cut}`;
        }
        break;
      }
    }
  }

  // Condición 1 (High Pass vs Low Shelf en graves)
  if ((targetType === 'highpass' && guessType === 'lowshelf') || (targetType === 'lowshelf' && guessType === 'highpass')) {
    message = "⚠️ Corte vs. Atenuación: Visualmente parecidos, pero acústicamente opuestos. Un High Pass altera severamente la fase en la frecuencia de corte, lo que te causará cancelaciones si procesas esta pista en paralelo (ej. compresión paralela de bombo/bajo). Usa el Low Shelf si solo quieres 'vaciar' un poco los graves sin destrozar la relación de fase.";
  }
  // Condición 2: Q vs Ganancia (La relación matemática)
  else if ((guessType === 'peaking' || guessType === 'bell') && guessGain > 6 && guessQ < 0.7) {
    message = "⚠️ Física de Mezcla: Estás aplicando más de 6dB de ganancia con un Q muy ancho (por debajo de 0.7). Estás subiendo la energía de casi media octava a la vez. Esto colapsará tu bus maestro. Realces anchos requieren poca ganancia; realces estrechos toleran más.";
  }
  // Condición 3: Enmascaramiento vs Realce (La alternativa Pro)
  else if ((guessType === 'peaking' || guessType === 'bell') && guessGain > 8 && guessFreq < 300) {
    message = "⚠️ Psicoacústica: Un realce tan agresivo en graves (mud/barro) suele ser síntoma de intentar que un instrumento 'corte' en la mezcla a base de fuerza bruta. Es mejor buscar qué otro instrumento le está tapando en esa misma frecuencia y aplicarle un pequeño corte.";
  }
  // Condición 4 (Campanas muy estrechas - Q > 3.0)
  else if ((guessType === 'peaking' || guessType === 'bell') && guessQ > 3.0) {
    message = "⚠️ Peligro de 'Ringing' (Resonancia temporal): Un filtro tan estrecho se comporta como una campana literal: sigue sonando después de que el sonido original pare. Si usas esto en transitorios rápidos (cajas, bombos, percusión), destruirás su 'pegada' (punch). Úsalo solo para eliminar resonancias estacionarias muy concretas.";
  }
  // Condición 5 (Realces agresivos - Gain > 9dB)
  else if (guessGain > 9.0) {
    message = "⚠️ Enmascaramiento Severo: Estás inyectando más de 9dB de energía pura. En el mundo analógico esto saturaría el previo; en digital, te comes el headroom (techo dinámico). Es casi siempre mejor atenuar las frecuencias molestas que realzar tan brutalmente, ya que este nivel de ganancia ahogará al resto de instrumentos de la mezcla.";
  }
  // Condición 6 (Filtros en Extremos - High/Low Pass fuera de rango)
  else if ((guessType === 'highpass' && guessFreq > 1000) || (guessType === 'lowpass' && guessFreq < 1000)) {
    message = "⚠️ Corte Destructivo: Estás usando un filtro de corte total en el rango medio del espectro. Acabas de amputar la información fundamental de la señal. Esto solo se usa para efectos creativos (sonido de 'teléfono' o 'radio'), no para ecualización correctiva o musical.";
  }
  // Fallback
  else {
    message = fallbackMessage;
    isWarning = false;
  }

  // Inject Context Matrix feedback
  if (contextMatrixFeedback) {
    // If it's the fallback, entirely replace it with our matrix context
    if (message === fallbackMessage) {
      message = contextMatrixFeedback;
      isWarning = false; // It's informative pedagogical feedback, not necessarily a penalty warning
    } else {
      // If there's an active warning (e.g. Ringing, Destructive Cut), append the context for double learning
      message = `${message} | ${contextMatrixFeedback}`;
    }
  }

  return {
    message,
    isWarning,
    warnings: [message],
    hasWarnings: isWarning
  };
}

