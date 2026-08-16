#pragma once

#include "Controller/DifficultyController.h"
#include "AudioEngine/Modules/SurgicalEQ/SurgicalEQModule.h"
#include "AudioEngine/Core/AudioGraphRouter.h"
#include <atomic>
#include <functional>
#include <memory>
#include <random>
#include <vector>
#include <string>

namespace EarTraining::Controller {

// ─── Data Structures ──────────────────────────────────────────────────────────

struct EQQuizTarget {
    AudioEngine::FilterType    type     { AudioEngine::FilterType::Bell };
    double frequencyHz { 1000.0 };
    double gainDb      {    6.0 };
    double qFactor     {    2.0 };
    AudioEngine::EQPhaseMode phaseMode { AudioEngine::EQPhaseMode::MinimumPhase_IIR };
};

struct MultipleChoiceOption {
    EQQuizTarget  target;
    bool          hasBeenAuditioned { false };
    std::string   title;
    std::string   description;
};

struct EvaluationResult {
    bool   isCorrect        { false };
    double scorePercentage  {   0.0 };
    double octaveDistance   {   0.0 };
    double gainErrorDb      {   0.0 };
    double qErrorPercentage {   0.0 };
    bool   phaseMatch       {  true };
    std::string feedbackMessage;
};

// ─── Session State (polled at 60 Hz by UI timer) ───────────────────────────────

struct SessionState {
    int  lives          { 3 };
    int  streak         { 0 };
    bool isGameOver     { false };
    bool isTrialActive  { false };
};

/**
 * @brief Manages interactive Ear Training sessions as a strict state machine.
 *
 * Responsibilities:
 *  - Generates quiz targets / multiple-choice options per difficulty tier
 *  - Implements progressive distractor generation based on current streak
 *  - Tracks lives (Signal Integrity) with risk/reward mechanics
 *  - Thread-safe state readable by the UI timer at 60 Hz
 */
class TrainingSessionManager {
public:
    // ─── Maximum / default lives ──────────────────────────────────────────────
    static constexpr int k_maxLives     = 5;
    static constexpr int k_defaultLives = 3;

    // ─── Streak thresholds ────────────────────────────────────────────────────
    static constexpr int k_highStreakThreshold = 2; ///< streak >= 2 → micro differences

    TrainingSessionManager(std::shared_ptr<AudioEngine::AudioGraphRouter> router,
                           std::shared_ptr<AudioEngine::SurgicalEQModule>  eqModule);
    ~TrainingSessionManager() = default;

    // ─── Session lifecycle ────────────────────────────────────────────────────

    /** Full reset: lives, streak, scores, options, game-over flag. */
    void resetSession();

    /** Generate a new trial according to the active difficulty tier. */
    void startNewTrial();

    // ─── Evaluation ───────────────────────────────────────────────────────────

    /**
     * @brief Easy-mode: evaluate a button press against the hidden target.
     *
     * Implements Risk & Reward:
     *  - Correct → streak++, possible +1 life every 3 in a row.
     *  - Incorrect → streak = 0, lives--, fires onSessionFailed if lives == 0.
     *
     * @return The full EvaluationResult (isCorrect, score, feedbackMessage).
     */
    EvaluationResult evaluateEasyGuess(size_t chosenOptionIndex);

    /** Normal & Hard modes: evaluate manual dial-in guess. */
    EvaluationResult evaluateGuess(double userFreqHz, double userGainDb, double userQ,
                                   AudioEngine::FilterType  userType,
                                   AudioEngine::EQPhaseMode userPhaseMode);

    // ─── Easy mode auditioning ────────────────────────────────────────────────

    /**
     * @brief Route an option into the B-path for listening. Single-audition only.
     * @return true if started, false if already locked.
     */
    bool auditionEasyOption(size_t optionIndex);

    [[nodiscard]] bool canAuditionEasyOption(size_t optionIndex) const noexcept;

    // ─── Accessors (safe at 60 Hz) ────────────────────────────────────────────

    [[nodiscard]] SessionState getSessionState() const noexcept {
        return { m_lives.load(std::memory_order_relaxed),
                 m_streak.load(std::memory_order_relaxed),
                 m_isGameOver.load(std::memory_order_relaxed),
                 m_isTrialActive };
    }

    [[nodiscard]] int  getLives()   const noexcept { return m_lives.load(std::memory_order_relaxed);  }
    [[nodiscard]] int  getStreak()  const noexcept { return m_streak.load(std::memory_order_relaxed); }
    [[nodiscard]] bool isGameOver() const noexcept { return m_isGameOver.load(std::memory_order_relaxed); }

    [[nodiscard]] const std::vector<MultipleChoiceOption>& getEasyOptions()       const noexcept { return m_easyOptions; }
    [[nodiscard]] size_t                                   getCorrectEasyOptionIndex() const noexcept { return m_correctEasyOptionIndex; }
    [[nodiscard]] const EQQuizTarget&                      getCurrentTarget()     const noexcept { return m_currentTarget; }
    [[nodiscard]] DifficultyController&                    getDifficulty()        noexcept       { return m_difficulty; }
    [[nodiscard]] uint32_t getTotalTrials()   const noexcept { return m_totalTrials; }
    [[nodiscard]] uint32_t getCorrectTrials() const noexcept { return m_correctTrials; }
    [[nodiscard]] double   getAverageScore()  const noexcept {
        return m_totalScore / static_cast<double>(m_totalTrials > 0 ? m_totalTrials : 1);
    }
    [[nodiscard]] bool isTrialActive()     const noexcept { return m_isTrialActive; }
    [[nodiscard]] bool hasSubmittedGuess() const noexcept { return m_hasSubmittedGuess; }

    void setTargetEQModule(std::shared_ptr<AudioEngine::SurgicalEQModule> eqModule) noexcept {
        m_eqModule = std::move(eqModule);
    }

    // ─── UI Callbacks (dispatched from the UI thread, never audio thread) ─────

    /** Fired on the message thread when lives reach zero. Wire this in SurgicalEQEditorView. */
    std::function<void()> onSessionFailed;

    /** Fired when a life is gained (streak bonus). */
    std::function<void(int newLives)> onLifeGained;

private:
    // ─── Trial generation ─────────────────────────────────────────────────────
    void generateEasyTrial();
    void generateNormalTrial();
    void generateHardTrial();

    /**
     * @brief Core distractor factory — creates 3 foils tuned to the current streak.
     *
     * Low streak (0-1): macro perceptual differences (octave shifts, gain inversion, type change).
     * High streak (≥2): micro psychoacoustic differences (1/3-octave, Q tweak, ±2 dB gain).
     */
    void generateEasyDistractors(EQQuizTarget distractors[3], const EQQuizTarget& target);

    // ─── Helpers ─────────────────────────────────────────────────────────────
    static std::string formatTargetDescription(const EQQuizTarget& target);

    // ─── Dependencies ────────────────────────────────────────────────────────
    std::shared_ptr<AudioEngine::AudioGraphRouter> m_router;
    std::shared_ptr<AudioEngine::SurgicalEQModule>  m_eqModule;
    DifficultyController                            m_difficulty;

    // ─── Trial state ─────────────────────────────────────────────────────────
    EQQuizTarget                    m_currentTarget;
    std::vector<MultipleChoiceOption> m_easyOptions;
    size_t                          m_correctEasyOptionIndex { 0 };

    bool   m_isTrialActive   { false };
    bool   m_hasSubmittedGuess { false };

    // ─── Session stats ────────────────────────────────────────────────────────
    uint32_t m_totalTrials   { 0 };
    uint32_t m_correctTrials { 0 };
    double   m_totalScore    { 0.0 };

    // ─── Gamification state (atomic for 60-Hz UI polling) ────────────────────
    std::atomic<int>  m_lives    { k_defaultLives };
    std::atomic<int>  m_streak   { 0 };
    std::atomic<bool> m_isGameOver { false };

    // ─── RNG ─────────────────────────────────────────────────────────────────
    std::mt19937 m_rng { 42 };
};

} // namespace EarTraining::Controller
