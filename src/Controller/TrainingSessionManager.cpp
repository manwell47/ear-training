#include "Controller/TrainingSessionManager.h"
#include "Common/Math/AcousticMath.h"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <set>
#include <sstream>

namespace EarTraining::Controller {

// ─── Helpers ──────────────────────────────────────────────────────────────────

static const char* filterTypeName(AudioEngine::FilterType t) {
    switch (t) {
        case AudioEngine::FilterType::Bell:      return "Bell";
        case AudioEngine::FilterType::LowShelf:  return "LowShelf";
        case AudioEngine::FilterType::HighShelf: return "HighShelf";
        case AudioEngine::FilterType::LowPass:   return "LPF";
        case AudioEngine::FilterType::HighPass:  return "HPF";
        case AudioEngine::FilterType::BandPass:  return "BandPass";
        case AudioEngine::FilterType::Notch:     return "Notch";
    }
    return "?";
}

/*static*/ std::string TrainingSessionManager::formatTargetDescription(const EQQuizTarget& target) {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(0);
    ss << target.frequencyHz << " Hz | "
       << (target.gainDb >= 0.0 ? "+" : "") << std::setprecision(1) << target.gainDb << " dB | "
       << filterTypeName(target.type);
    return ss.str();
}

// ─── Constructor ──────────────────────────────────────────────────────────────

TrainingSessionManager::TrainingSessionManager(
        std::shared_ptr<AudioEngine::AudioGraphRouter> router,
        std::shared_ptr<AudioEngine::SurgicalEQModule>  eqModule)
    : m_router(std::move(router)), m_eqModule(std::move(eqModule))
{
    std::random_device rd;
    m_rng.seed(rd());
}

// ─── Session Lifecycle ────────────────────────────────────────────────────────

void TrainingSessionManager::resetSession() {
    m_lives.store(k_defaultLives, std::memory_order_relaxed);
    m_streak.store(0,             std::memory_order_relaxed);
    m_isGameOver.store(false,     std::memory_order_relaxed);

    m_totalTrials      = 0;
    m_correctTrials    = 0;
    m_totalScore       = 0.0;
    m_isTrialActive    = false;
    m_hasSubmittedGuess = false;
    m_easyOptions.clear();

    // Reset EQ DSP to neutral
    if (m_eqModule) {
        m_eqModule->setGainDb(0.0);
        m_eqModule->setFrequency(1000.0);
        m_eqModule->setQ(1.414);
        m_eqModule->setFilterType(AudioEngine::FilterType::Bell);
    }
}

void TrainingSessionManager::startNewTrial() {
    if (m_isGameOver.load(std::memory_order_relaxed)) return;

    switch (m_difficulty.getTier()) {
        case DifficultyTier::Easy:   generateEasyTrial();   break;
        case DifficultyTier::Normal: generateNormalTrial(); break;
        case DifficultyTier::Hard:   generateHardTrial();   break;
    }

    // Route the mystery target into the hidden DSP path
    if (m_eqModule) {
        m_eqModule->setFilterType(m_currentTarget.type);
        m_eqModule->setFrequency(m_currentTarget.frequencyHz);
        m_eqModule->setGainDb(m_currentTarget.gainDb);
        m_eqModule->setQ(m_currentTarget.qFactor);
        m_eqModule->setPhaseMode(m_currentTarget.phaseMode);
    }

    m_isTrialActive     = true;
    m_hasSubmittedGuess = false;

    if (m_router) {
        m_router->getABEngine().randomizeBlindAssignment();
        m_router->getABEngine().setMode(AudioEngine::ABMode::BlindX);
    }
}

// ─── Trial Generation ─────────────────────────────────────────────────────────

void TrainingSessionManager::generateEasyTrial() {
    static const double easyFrequencies[] = {
        250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0
    };
    constexpr size_t numEasyFreqs = sizeof(easyFrequencies) / sizeof(easyFrequencies[0]);

    std::uniform_int_distribution<size_t> freqDist(0, numEasyFreqs - 1);
    std::uniform_int_distribution<int>    signDist(0, 1);
    std::uniform_int_distribution<size_t> slotDist(0, 3);

    // 1. Generate the winning (correct) target
    m_currentTarget.frequencyHz = easyFrequencies[freqDist(m_rng)];
    m_currentTarget.gainDb      = (signDist(m_rng) == 1) ? 6.0 : -6.0;
    m_currentTarget.qFactor     = 1.414;
    m_currentTarget.type        = AudioEngine::FilterType::Bell;
    m_currentTarget.phaseMode   = AudioEngine::EQPhaseMode::MinimumPhase_IIR;

    // 2. Generate 3 distractors (streak-aware)
    EQQuizTarget distractors[3];
    generateEasyDistractors(distractors, m_currentTarget);

    // 3. Place correct answer at a random slot; fill the rest with distractors
    m_correctEasyOptionIndex = slotDist(m_rng);
    m_easyOptions.clear();
    m_easyOptions.resize(4);

    int distractorIdx = 0;
    for (size_t i = 0; i < 4; ++i) {
        const bool isCorrect = (i == m_correctEasyOptionIndex);
        const EQQuizTarget& tgt = isCorrect ? m_currentTarget : distractors[distractorIdx++];

        m_easyOptions[i] = {
            tgt,
            false,
            "Opcion " + std::to_string(i + 1),
            formatTargetDescription(tgt)
        };
    }
}

// ─── Distractor Engine ────────────────────────────────────────────────────────
/**
 * Progressive difficulty via streak-based distractor tightening.
 *
 * LOW STREAK (0-1) — Macro perceptual differences:
 *   Distractor A: frequency shifted by ±1 full octave
 *   Distractor B: gain polarity inverted
 *   Distractor C: filter type completely changed
 *
 * HIGH STREAK (≥2) — Micro psychoacoustic differences (masking territory):
 *   Distractor A: frequency shifted by ±1/3 octave (≈ 26% up or down)
 *   Distractor B: same freq + gain, but Q widened/narrowed dramatically
 *   Distractor C: same freq + type, gain offset by ±2 dB only
 */
void TrainingSessionManager::generateEasyDistractors(
        EQQuizTarget distractors[3],
        const EQQuizTarget& target)
{
    std::uniform_int_distribution<int> signDist(0, 1);

    const int streak = m_streak.load(std::memory_order_relaxed);
    const bool highStreak = (streak >= k_highStreakThreshold);

    if (!highStreak) {
        // ── Macro differences ──────────────────────────────────────────────

        // A: ±1 octave frequency shift
        distractors[0] = target;
        distractors[0].frequencyHz = (signDist(m_rng) == 1)
            ? std::min(target.frequencyHz * 2.0, 20000.0)   // +1 octave
            : std::max(target.frequencyHz * 0.5,    20.0);  // -1 octave

        // B: Gain polarity inverted (+6 dB → -6 dB and vice versa)
        distractors[1] = target;
        distractors[1].gainDb = -target.gainDb;

        // C: Completely different filter type
        distractors[2] = target;
        // Choose a type that is NOT the same as the target
        static const AudioEngine::FilterType altTypes[] = {
            AudioEngine::FilterType::LowShelf,
            AudioEngine::FilterType::HighShelf,
            AudioEngine::FilterType::LowPass,
            AudioEngine::FilterType::HighPass,
            AudioEngine::FilterType::Notch
        };
        AudioEngine::FilterType chosen = altTypes[0];
        for (auto t : altTypes) {
            if (t != target.type) { chosen = t; break; }
        }
        distractors[2].type = chosen;

    } else {
        // ── Micro psychoacoustic differences ─────────────────────────────

        // A: ±1/3 octave frequency shift (2^(1/3) ≈ 1.2599)
        distractors[0] = target;
        const double thirdOctaveUp = target.frequencyHz * std::pow(2.0, 1.0 / 3.0);
        const double thirdOctaveDn = target.frequencyHz / std::pow(2.0, 1.0 / 3.0);
        distractors[0].frequencyHz = (signDist(m_rng) == 1)
            ? std::min(thirdOctaveUp, 20000.0)
            : std::max(thirdOctaveDn,    20.0);

        // B: Same freq + gain, but Q dramatically widened or narrowed
        distractors[1] = target;
        if (target.qFactor > 1.5) {
            distractors[1].qFactor = 0.5;   // widen bandwidth
        } else {
            distractors[1].qFactor = std::min(target.qFactor * 4.0, 15.0); // narrow
        }

        // C: Same freq + type, gain offset by ±2 dB
        distractors[2] = target;
        distractors[2].gainDb = (signDist(m_rng) == 1)
            ? target.gainDb + 2.0
            : target.gainDb - 2.0;
        // Clamp so it doesn't accidentally hit 0 or flip polarity
        if (std::abs(distractors[2].gainDb) < 0.5)
            distractors[2].gainDb = target.gainDb + 2.0;
    }
}

// ─── Normal Trial ─────────────────────────────────────────────────────────────

void TrainingSessionManager::generateNormalTrial() {
    static const double standardFrequencies[] = {
        63.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 12000.0, 16000.0
    };
    static const double discreteGains[] = { -10.0, -6.0, -3.0, 3.0, 6.0, 10.0 };
    static const AudioEngine::FilterType normalTypes[] = {
        AudioEngine::FilterType::Bell,
        AudioEngine::FilterType::HighPass,
        AudioEngine::FilterType::LowPass
    };
    static const double normalQs[] = { 0.707, 1.414, 2.0, 3.0 };

    std::uniform_int_distribution<size_t> freqDist(0, std::size(standardFrequencies) - 1);
    std::uniform_int_distribution<size_t> gainDist(0, std::size(discreteGains) - 1);
    std::uniform_int_distribution<size_t> typeDist(0, std::size(normalTypes) - 1);
    std::uniform_int_distribution<size_t> qDist(0, std::size(normalQs) - 1);

    m_currentTarget.frequencyHz = standardFrequencies[freqDist(m_rng)];
    m_currentTarget.gainDb      = discreteGains[gainDist(m_rng)];
    m_currentTarget.type        = normalTypes[typeDist(m_rng)];
    m_currentTarget.qFactor     = normalQs[qDist(m_rng)];
    m_currentTarget.phaseMode   = AudioEngine::EQPhaseMode::MinimumPhase_IIR;
}

// ─── Hard Trial ───────────────────────────────────────────────────────────────

void TrainingSessionManager::generateHardTrial() {
    const double minLog = std::log(20.0);
    const double maxLog = std::log(20000.0);
    std::uniform_real_distribution<double> logFreqDist(minLog, maxLog);
    std::uniform_real_distribution<double> gainMagnitudeDist(2.5, 24.0);
    std::uniform_real_distribution<double> qDist(0.2, 15.0);
    std::uniform_int_distribution<int>     signDist(0, 1);
    std::uniform_int_distribution<int>     typeDist(0, 6);
    std::uniform_int_distribution<int>     phaseDist(0, 1);

    m_currentTarget.frequencyHz = std::exp(logFreqDist(m_rng));
    m_currentTarget.gainDb      = (signDist(m_rng) == 1) ? gainMagnitudeDist(m_rng) : -gainMagnitudeDist(m_rng);
    m_currentTarget.qFactor     = qDist(m_rng);
    m_currentTarget.type        = static_cast<AudioEngine::FilterType>(typeDist(m_rng));
    m_currentTarget.phaseMode   = (phaseDist(m_rng) == 1)
        ? AudioEngine::EQPhaseMode::LinearPhase_FIR
        : AudioEngine::EQPhaseMode::MinimumPhase_IIR;
}

// ─── Easy Mode Auditioning ────────────────────────────────────────────────────

bool TrainingSessionManager::auditionEasyOption(size_t optionIndex) {
    if (optionIndex >= m_easyOptions.size() || m_easyOptions[optionIndex].hasBeenAuditioned)
        return false; // Single-audition lock

    m_easyOptions[optionIndex].hasBeenAuditioned = true;

    // Route this option into the B-path (user-audible)
    if (m_eqModule) {
        const auto& tgt = m_easyOptions[optionIndex].target;
        m_eqModule->setFilterType(tgt.type);
        m_eqModule->setFrequency(tgt.frequencyHz);
        m_eqModule->setGainDb(tgt.gainDb);
        m_eqModule->setQ(tgt.qFactor);
        m_eqModule->setPhaseMode(tgt.phaseMode);
    }
    if (m_router)
        m_router->getABEngine().setMode(AudioEngine::ABMode::DirectB_Wet);

    return true;
}

bool TrainingSessionManager::canAuditionEasyOption(size_t optionIndex) const noexcept {
    if (optionIndex >= m_easyOptions.size()) return false;
    return !m_easyOptions[optionIndex].hasBeenAuditioned;
}

// ─── Evaluation: Easy Mode (Risk & Reward State Machine) ─────────────────────

EvaluationResult TrainingSessionManager::evaluateEasyGuess(size_t chosenOptionIndex) {
    EvaluationResult result{};
    m_hasSubmittedGuess = true;
    m_totalTrials++;

    result.isCorrect       = (chosenOptionIndex == m_correctEasyOptionIndex);
    result.scorePercentage = result.isCorrect ? 100.0 : 0.0;
    result.phaseMatch      = true;

    // ── Risk & Reward ─────────────────────────────────────────────────────────
    if (result.isCorrect) {
        m_correctTrials++;

        const int newStreak = m_streak.fetch_add(1, std::memory_order_relaxed) + 1;

        // Every 3 consecutive correct answers → gain 1 life (if below max)
        if ((newStreak % 3 == 0) && (m_lives.load(std::memory_order_relaxed) < k_maxLives)) {
            const int newLives = m_lives.fetch_add(1, std::memory_order_relaxed) + 1;
            if (onLifeGained)
                onLifeGained(newLives);
        }
    } else {
        // Wrong answer: reset streak and lose a life
        m_streak.store(0, std::memory_order_relaxed);
        const int remainingLives = m_lives.fetch_sub(1, std::memory_order_relaxed) - 1;

        if (remainingLives <= 0) {
            m_lives.store(0, std::memory_order_relaxed); // clamp to 0
            m_isGameOver.store(true, std::memory_order_relaxed);
            // Fire on the calling thread (which must be the UI/message thread)
            if (onSessionFailed)
                onSessionFailed();
        }
    }

    m_totalScore += result.scorePercentage;
    m_difficulty.recordResult(result.isCorrect);

    // ── Feedback message ──────────────────────────────────────────────────────
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(1);
    if (result.isCorrect) {
        const int streak = m_streak.load(std::memory_order_relaxed);
        ss << "CORRECTO! Opcion " << (m_correctEasyOptionIndex + 1)
           << ": " << formatTargetDescription(m_currentTarget)
           << ". Racha: " << streak;
        if (streak > 0 && (streak % 3 == 0))
            ss << " (+1 VIDA!)";
    } else {
        ss << "INCORRECTO. Tu eleccion: Opcion " << (chosenOptionIndex + 1)
           << ". Correcta era la Opcion " << (m_correctEasyOptionIndex + 1)
           << ": " << formatTargetDescription(m_currentTarget)
           << ". Vidas: " << m_lives.load(std::memory_order_relaxed);
    }
    result.feedbackMessage = ss.str();
    return result;
}

// ─── Evaluation: Normal & Hard Modes ─────────────────────────────────────────

EvaluationResult TrainingSessionManager::evaluateGuess(double userFreqHz, double userGainDb,
                                                        double userQ,
                                                        AudioEngine::FilterType  userType,
                                                        AudioEngine::EQPhaseMode userPhaseMode) {
    EvaluationResult result{};
    m_hasSubmittedGuess = true;
    m_totalTrials++;

    result.octaveDistance   = std::abs(std::log2(userFreqHz / m_currentTarget.frequencyHz));
    result.gainErrorDb      = std::abs(userGainDb - m_currentTarget.gainDb);
    result.qErrorPercentage = std::abs(userQ - m_currentTarget.qFactor) / m_currentTarget.qFactor * 100.0;

    const auto& settings = m_difficulty.getSettings();
    const bool freqMatch = (result.octaveDistance <= settings.freqToleranceOctaves);
    const bool gainMatch = ((userGainDb > 0.0) == (m_currentTarget.gainDb > 0.0)); // same polarity
    const bool typeMatch = (userType == m_currentTarget.type);

    result.phaseMatch = (!settings.enablePhaseScoring || userPhaseMode == m_currentTarget.phaseMode);
    result.isCorrect  = freqMatch && gainMatch && typeMatch && result.phaseMatch;

    // Scoring
    if (settings.tier == DifficultyTier::Hard) {
        const double freqScore  = std::max(0.0, 1.0 - result.octaveDistance / settings.freqToleranceOctaves) * 50.0;
        const double gainScore  = gainMatch ? std::max(0.0, 1.0 - result.gainErrorDb / 6.0) * 20.0 : 0.0;
        const double qScore     = std::max(0.0, 1.0 - result.qErrorPercentage / 100.0) * 10.0;
        const double phaseScore = result.phaseMatch ? 20.0 : 0.0;
        result.scorePercentage  = freqScore + gainScore + qScore + phaseScore;
    } else {
        const double freqScore  = std::max(0.0, 1.0 - result.octaveDistance / settings.freqToleranceOctaves) * 60.0;
        const double gainScore  = gainMatch ? 25.0 : 0.0;
        const double qScore     = std::max(0.0, 1.0 - result.qErrorPercentage / 100.0) * 15.0;
        result.scorePercentage  = freqScore + gainScore + qScore;
    }

    m_totalScore += result.scorePercentage;
    if (result.isCorrect) m_correctTrials++;
    m_difficulty.recordResult(result.isCorrect);

    // Streak & life logic for Normal/Hard
    if (result.isCorrect) {
        m_streak.fetch_add(1, std::memory_order_relaxed);
    } else {
        m_streak.store(0, std::memory_order_relaxed);
        const int rem = m_lives.fetch_sub(1, std::memory_order_relaxed) - 1;
        if (rem <= 0) {
            m_lives.store(0, std::memory_order_relaxed);
            m_isGameOver.store(true, std::memory_order_relaxed);
            if (onSessionFailed) onSessionFailed();
        }
    }

    // Feedback
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(1);
    if (result.isCorrect) {
        ss << "EXCELENTE (" << m_difficulty.getTierName() << ")! Objetivo: "
           << formatTargetDescription(m_currentTarget);
        if (settings.enablePhaseScoring)
            ss << " [" << (m_currentTarget.phaseMode == AudioEngine::EQPhaseMode::MinimumPhase_IIR
                          ? "IIR" : "FIR") << "]";
        ss << ". Error: " << result.octaveDistance << " oct. Puntuacion: " << result.scorePercentage << "%";
    } else {
        ss << "FALLO (" << m_difficulty.getTierName() << "). Objetivo era "
           << formatTargetDescription(m_currentTarget);
        if (settings.enablePhaseScoring && !result.phaseMatch)
            ss << " (Fase incorrecta)";
        ss << ". Tu Hz: " << userFreqHz << ". Vidas: " << m_lives.load(std::memory_order_relaxed);
    }
    result.feedbackMessage = ss.str();
    return result;
}

} // namespace EarTraining::Controller
