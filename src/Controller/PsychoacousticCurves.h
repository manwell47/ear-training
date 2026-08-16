#pragma once

#include "Common/Math/AcousticMath.h"
#include <cmath>
#include <algorithm>

namespace EarTraining::Controller {

/**
 * @brief Psychoacoustic Models & Just Noticeable Difference (JND) Calculations.
 * 
 * Implements ISO 226 equal-loudness, critical band masking thresholds, and JND metrics
 * to dynamically assess user perceptual acuity during ear training.
 */
class PsychoacousticCurves {
public:
    /**
     * @brief Computes frequency discrimination JND in Hz for a given center frequency.
     * Based on Zwicker & Fastl perceptual data: ~1-3 Hz below 500 Hz, ~0.7% above 500 Hz.
     */
    [[nodiscard]] static inline double getFrequencyJndHz(double freqHz) noexcept {
        if (freqHz < 500.0) {
            return 2.5; // ~2.5 Hz absolute JND in low register
        }
        return freqHz * 0.007; // 0.7% relative JND in mid/high register
    }

    /**
     * @brief Computes gain discrimination JND in dB (Weber-Fechner fraction).
     * Typically ~0.5 dB to 1.0 dB for broadband / pink noise stimuli.
     */
    [[nodiscard]] static constexpr double getGainJndDb() noexcept {
        return 0.75; // 0.75 dB nominal JND
    }

    /**
     * @brief Computes Q-factor discrimination JND in fractional octaves.
     * Ear training resolution standard: ~0.2 octaves.
     */
    [[nodiscard]] static inline double getBandwidthJndOctaves(double currentQ) noexcept {
        const double currentBw = Math::AcousticMath::qToBandwidthOctaves(currentQ);
        return currentBw * 0.20; // 20% relative bandwidth difference
    }

    /**
     * @brief Computes perceptual audibility score [0.0 - 1.0] for a given group delay spike in ms.
     * Blauert & Laws threshold: ~1.5 - 2.0 ms in the 1 kHz - 4 kHz band is audibly detectable.
     */
    [[nodiscard]] static inline double getGroupDelayAudibility(double groupDelayMs, double freqHz) noexcept {
        double thresholdMs = 3.0;
        if (freqHz >= 1000.0 && freqHz <= 4000.0) {
            thresholdMs = 1.5; // High sensitivity region
        } else if (freqHz < 500.0) {
            thresholdMs = 4.0; // Lower sensitivity at low frequencies
        }

        const double ratio = std::abs(groupDelayMs) / thresholdMs;
        return std::clamp(ratio, 0.0, 1.0);
    }
};

} // namespace EarTraining::Controller
