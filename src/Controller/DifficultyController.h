#pragma once

#include "Controller/PsychoacousticCurves.h"
#include <algorithm>
#include <cstdint>
#include <string>

namespace EarTraining::Controller {

enum class DifficultyTier : uint8_t {
    Easy = 0,    // "Fácil" - 4 Multiple-Choice Buttons, 1 Audition per option, Phase ignored
    Normal = 1,  // "Normal" - Knobs, Discrete Gains (+/-3, +/-6, +/-10 dB), Bell/HPF/LPF, Phase ignored
    Hard = 2     // "Difícil" - Knobs, Full Continuous ranges, all filter types, Phase mode scored
};

struct DifficultySettings {
    DifficultyTier tier{DifficultyTier::Normal};
    uint32_t level{1}; // Sub-level 1-10 for progression within tier
    double freqToleranceOctaves{0.66};
    double gainDeltaDb{6.0};
    double minQ{0.7};
    double maxQ{3.0};
    bool enablePhaseScoring{false};
};

/**
 * @brief Dynamic Difficulty & Pedagogical Progression Controller.
 */
class DifficultyController {
public:
    explicit DifficultyController(DifficultyTier tier = DifficultyTier::Normal, uint32_t startingLevel = 1)
        : m_tier(tier), m_level(startingLevel) {
        updateSettings();
    }

    void setTier(DifficultyTier tier) noexcept {
        m_tier = tier;
        updateSettings();
    }

    [[nodiscard]] DifficultyTier getTier() const noexcept { return m_tier; }

    [[nodiscard]] std::string getTierName() const noexcept {
        switch (m_tier) {
            case DifficultyTier::Easy: return "Facil";
            case DifficultyTier::Normal: return "Normal";
            case DifficultyTier::Hard: return "Dificil";
        }
        return "Normal";
    }

    void setLevel(uint32_t level) noexcept {
        m_level = std::clamp(level, 1u, 10u);
        updateSettings();
    }

    [[nodiscard]] uint32_t getLevel() const noexcept { return m_level; }
    [[nodiscard]] const DifficultySettings& getSettings() const noexcept { return m_settings; }

    void recordResult(bool correct) noexcept {
        if (correct) {
            m_consecutiveSuccesses++;
            m_consecutiveFailures = 0;
            if (m_consecutiveSuccesses >= 3 && m_level < 10) {
                m_level++;
                m_consecutiveSuccesses = 0;
                updateSettings();
            }
        } else {
            m_consecutiveFailures++;
            m_consecutiveSuccesses = 0;
            if (m_consecutiveFailures >= 2 && m_level > 1) {
                m_level--;
                m_consecutiveFailures = 0;
                updateSettings();
            }
        }
    }

private:
    void updateSettings() noexcept {
        m_settings.tier = m_tier;
        m_settings.level = m_level;

        const double progress = static_cast<double>(m_level - 1) / 9.0;

        switch (m_tier) {
            case DifficultyTier::Easy:
                m_settings.freqToleranceOctaves = 0.66;
                m_settings.gainDeltaDb = 6.0;
                m_settings.minQ = 1.0;
                m_settings.maxQ = 2.0;
                m_settings.enablePhaseScoring = false;
                break;

            case DifficultyTier::Normal:
                m_settings.freqToleranceOctaves = 0.50 - progress * (0.50 - 0.15);
                m_settings.gainDeltaDb = 6.0;
                m_settings.minQ = 0.7;
                m_settings.maxQ = 3.0;
                m_settings.enablePhaseScoring = false;
                break;

            case DifficultyTier::Hard:
                m_settings.freqToleranceOctaves = 0.33 - progress * (0.33 - 0.05);
                m_settings.gainDeltaDb = 3.0;
                m_settings.minQ = 0.2;
                m_settings.maxQ = 15.0;
                m_settings.enablePhaseScoring = true;
                break;
        }
    }

    DifficultyTier m_tier{DifficultyTier::Normal};
    uint32_t m_level{1};
    uint32_t m_consecutiveSuccesses{0};
    uint32_t m_consecutiveFailures{0};
    DifficultySettings m_settings;
};

} // namespace EarTraining::Controller
