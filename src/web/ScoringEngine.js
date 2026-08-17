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

const ContextMatrix = {
  bombo: [
    { range: [0, 55], boost: "Sub-graves: Da muchísimo peso y hace temblar las paredes, pero te vas a quedar sin volumen en la mezcla enseguida.", cut: "Sub-graves: Limpia el retumbe inútil. Perfecto si quieres que el bajo mande ahí abajo." },
    { range: [55, 150], boost: "Cuerpo: La hostia en el pecho (punch). Aquí vive el bombo.", cut: "Cuerpo: Estás dejando el bombo en los huesos. Solo tiene sentido si intentas meter un bajo enorme." },
    { range: [150, 450], boost: "Zona a cartón (Mud): Suena a caja de zapatos. Rara vez se sube esto.", cut: "Zona a cartón: Vaciar aquí es el truco más viejo del manual para que el bombo suene moderno y limpio." },
    { range: [450, 2500], boost: "Medios: Ensucia y suena a lata barata.", cut: "Medios: Rebajar esto deja un agujero perfecto para que las guitarras y las voces respiren." },
    { range: [2500, 6000], boost: "Ataque / Clic: El chasquido de la maza. Clave para que el bombo se oiga en los móviles y no solo se sienta.", cut: "Ataque: Deja el bombo muy redondo y antiguo (vintage), pero se va a perder si la mezcla está llena de cosas." },
    { range: [6000, 24000], boost: "Aire: Aquí no hay bombo, solo ruido. Estás subiendo el sangrado del charles y los platos.", cut: "Aire: Perfecto para aislar el bombo y quitar ruido de arriba." }
  ],
  caja: [
    { range: [0, 150], boost: "Rumble: Estás subiendo ruido de pisadas y graves sucios.", cut: "Rumble: Práctica de primero de sonido: High Pass aquí para no ensuciarle el terreno al bajo." },
    { range: [150, 250], boost: "Cuerpo (Body): Le da la 'gordura' a la caja.", cut: "Cuerpo: Dejas la caja sonando a juguete o muy lejos." },
    { range: [250, 800], boost: "Armónico de parche (Ring): Resalta el tono 'boing' metálico del tambor. Cansa muy rápido.", cut: "Armónico: Cortar esto de forma quirúrgica es vital para que la caja suene seca y controlada." },
    { range: [800, 3000], boost: "Presencia: Tira la caja a la cara del oyente, pero va a pegarse de hostias con la voz principal.", cut: "Presencia: Aleja la caja y la entierra detrás del cantante." },
    { range: [3000, 7000], boost: "Ataque (Crack): El latigazo puro del golpe de baqueta.", cut: "Ataque: Ablanda mucho el impacto de la batería." },
    { range: [7000, 24000], boost: "Bordón / Snappy: Levanta el chisporroteo de abajo de la caja, pero cuidado que te traes todos los platos con él.", cut: "Bordón: Apaga la caja, quitándole ese filo moderno." }
  ],
  voces: [
    { range: [0, 100], boost: "Golpes de micro (Plops): Estás subiendo los golpetazos de viento del cantante en el micro.", cut: "Golpes: High Pass obligatorio. Hay que limpiar siempre esta zona de ruidos sordos." },
    { range: [100, 300], boost: "Calidez / Efecto Proximidad: Da cuerpo y hace la voz íntima, pero si te pasas suena a que canta debajo de una manta.", cut: "Calidez: Adelgaza la voz. Útil para coros, peligroso para la voz principal." },
    { range: [300, 1000], boost: "Boxy: Estás exagerando el sonido nasal, como si cantara dentro de un tubo.", cut: "Boxy: Cortar por aquí suele quitar la congestión nasal y abrir el tono." },
    { range: [1000, 3000], boost: "Ataque / Teléfono: La voz corta la mezcla como un cuchillo, pero puede volverse súper agresiva.", cut: "Ataque: Retrasa la voz en la mezcla y le quita agresividad." },
    { range: [3000, 6000], boost: "Presencia: La zona donde el oído humano es más sensible. Tira la voz al frente, pero agota escucharla mucho rato.", cut: "Presencia: Esconde la voz en la música." },
    { range: [6000, 9000], boost: "Sibilancia: Has convertido al cantante en una serpiente (Ssss). Cuidado con esta zona.", cut: "Sibilancia: Funciona como un De-Esser manual. Suaviza esas eses que taladran." },
    { range: [9000, 24000], boost: "Aire: Le da ese aliento y brillo caro de producción pop top.", cut: "Aire: Hace que la voz suene vieja o encerrada." }
  ],
  bajo: [
    { range: [0, 60], boost: "Sub: Añade peso masivo, pero revienta los altavoces pequeños y te chupa toda la energía de la mezcla.", cut: "Sub: Muy útil para dejar que el bombo gane la guerra de los graves." },
    { range: [60, 200], boost: "Cuerpo: Aquí viven las notas del bajo, le da fundamentación.", cut: "Cuerpo: Estás aniquilando el bajo de la canción." },
    { range: [200, 500], boost: "Barro (Mud): Hace que la mezcla suene turbia y choca con todo.", cut: "Barro: Vaciar aquí un poco es el secreto para un bajo definido que se entienda bien." },
    { range: [500, 1500], boost: "Ataque de púa / dedos: Fundamental para que el bajo se escuche en el móvil o en auriculares pequeños.", cut: "Ataque: Deja el bajo sonando súper redondo y de fondo (tipo Reggae/Dub)." },
    { range: [1500, 5000], boost: "Trasteo: Realza el ruido puramente metálico de las cuerdas golpeando el mástil.", cut: "Trasteo: Limpia una ejecución muy sucia." },
    { range: [5000, 24000], boost: "Siseo: Estás subiendo ruido del ampli, cero notas musicales.", cut: "Siseo: Low Pass de manual para limpiar ruido inútil." }
  ],
  guitarras: [
    { range: [0, 100], boost: "Graves sucios: Nadie quiere esto en unas guitarras.", cut: "Graves sucios: El corte más famoso de la historia (High Pass). Hay que dejar sitio al bajo." },
    { range: [100, 250], boost: "Grosor (Chug): Da peso a las rítmicas de palm-mute metaleras.", cut: "Grosor: Afina demasiado la guitarra." },
    { range: [250, 800], boost: "Cartón: Suena a ampli tapado con una manta.", cut: "Cartón: Limpieza estándar para ganar claridad y abrir hueco a la caja." },
    { range: [800, 2500], boost: "Mordida (Bite): Saca el punteado hacia adelante en la cara del oyente.", cut: "Mordida: Suaviza la guitarra para hundirla y que no pelee con la voz." },
    { range: [2500, 5000], boost: "Chicharra (Harshness): Sube ese sonido punzante y digital de distorsión mala.", cut: "Chicharra: Clásico corte quirúrgico para que las guitarras eléctricas no duelan al oírlas." },
    { range: [5000, 24000], boost: "Siseo (Fizz): Levanta puro ruido blanco de la distorsión.", cut: "Siseo: Low Pass habitual para enfocar el tono de guitarras muy saturadas." }
  ],
  platos: [
    { range: [0, 400], boost: "Sangrado: Realzas graves colados en los micros de los platos (bombo, caja, toms).", cut: "Sangrado: Limpieza súper bestia con High Pass. Dejas solo los agudos puros de los metales." },
    { range: [400, 1500], boost: "Lata: Añade un sonido a chapa fea o campana.", cut: "Lata: Limpia armónicos que chocan con el resto de instrumentos musicales." },
    { range: [1500, 5000], boost: "Aspereza: Hace que los platos te taladren el cerebro de lo hirientes que suenan.", cut: "Aspereza: Un buen recorte aquí hace que los platos suenen grandes pero sedosos y agradables." },
    { range: [5000, 10000], boost: "Definición: Realza el toque duro de la baqueta de madera contra el ride.", cut: "Definición: Aleja la batería en el espacio." },
    { range: [10000, 24000], boost: "Aire: Ensancha esa cola brillante y etérea que queda flotando (el 'Wash').", cut: "Aire: Oscurece toda la batería, dejándola muy sorda y oscura." }
  ],
  drumbus: [
    { range: [0, 100], boost: "Peso total: Ensancha toda la batería de golpe, le da un tamaño gigante.", cut: "Peso: Le quitas la energía visceral al kit." },
    { range: [100, 400], boost: "Grosor / Cartón: Suele empantanar toda la base rítmica.", cut: "Grosor: Bajar aquí un par de decibelios a toda la batería le da una claridad inmediata." },
    { range: [400, 3000], boost: "Ataque general: Subes el impacto duro de cada tambor.", cut: "Ataque: Haces que la batería suene menos agresiva y más acompañante." },
    { range: [3000, 8000], boost: "Presencia: Toda la batería gana brillo, pero los platos pueden descontrolarse rápido.", cut: "Presencia: Útil si los micros overhead están muy estridentes." },
    { range: [8000, 24000], boost: "Aire global: Abre la zona de arriba y saca la reverberación de la sala.", cut: "Aire global: Deja una batería seca y oscura." }
  ],
  sala: [
    { range: [0, 200], boost: "Boom: Hace que la sala parezca enorme, pero ensucia lo más grande.", cut: "Boom: Quitas graves del rebote para tener una reverb limpia y controlable." },
    { range: [200, 800], boost: "Cajón: Realza resonancias raras del cuarto de grabación.", cut: "Cajón: Bajas eso y de repente la habitación suena carísima." },
    { range: [800, 4000], boost: "Claridad: Acercas el eco y la bofetada corta de la pared.", cut: "Claridad: Oscureces la sala, dándole mucha más profundidad." },
    { range: [4000, 24000], boost: "Splash: Subes el rebote estridente de los platos.", cut: "Splash: Reverb muy oscura y sedosa, onda vintage." }
  ],
  generic: [
    { range: [0, 150], boost: "Cuerpo/Graves: Estás engordando el sonido por abajo.", cut: "Graves: Estás quitando peso y limpiando." },
    { range: [150, 600], boost: "Zona media-baja (Mud): Estás añadiendo congestión.", cut: "Zona media-baja: Estás limpiando barro para dar claridad." },
    { range: [600, 3000], boost: "Medios (Ataque): Estás sacando el sonido a la cara.", cut: "Medios: Estás hundiendo el sonido hacia atrás." },
    { range: [3000, 8000], boost: "Presencia (Harshness): Estás dándole filo y agresividad.", cut: "Presencia: Estás suavizando el tono." },
    { range: [8000, 24000], boost: "Aire: Estás abriendo los extremos agudos.", cut: "Aire: Estás apagando u oscureciendo el brillo final." }
  ]
};

/**
 * Tarea 3 (Modo Pro): Función Pura Exportada analyzeProPractices(target, guess, audioContext)
 * Evaluador didáctico de impacto en la mezcla para alumnos de sonido y producción.
 * audioContext contiene el nombre de la pista actual (ej. "Bombo Estudio (Seco)") para feedback dinámico.
 */
export function analyzeProPractices(target, guess, audioContext = "") {
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

  let contextMatrixFeedback = null;
  const audioCtxLower = audioContext.toLowerCase();
  
  // Buscar en la matriz de contexto para el feedback constructivo
  let matchedBands = ContextMatrix.generic;
  for (const key of Object.keys(ContextMatrix)) {
    if (audioCtxLower.includes(key)) {
      matchedBands = ContextMatrix[key];
      break;
    }
  }

  for (const band of matchedBands) {
    if (guessFreq >= band.range[0] && guessFreq < band.range[1]) {
      if (guessGain > 0.5) {
        contextMatrixFeedback = `🎧 Impacto en Mezcla: ${band.boost}`;
      } else if (guessGain < -0.5) {
        contextMatrixFeedback = `🎧 Impacto en Mezcla: ${band.cut}`;
      }
      break;
    }
  }

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

  // Inject Context Matrix feedback
  if (contextMatrixFeedback) {
    if (message === fallbackMessage) {
      message = contextMatrixFeedback;
      isWarning = false;
    } else {
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

