#pragma once

#include "AudioEngine/Modules/SurgicalEQ/SurgicalEQModule.h"
#include <vector>
#include <cmath>

namespace EarTraining::UI {

struct GraphPoint {
    double freqHz{1000.0};
    double normalizedX{0.5}; // [0.0 - 1.0] log-scaled
    double magnitudeDb{0.0};
    double phaseDegrees{0.0};
    double groupDelayMs{0.0};
};

/**
 * @brief Computes high-density log-spaced frequency response curves for UI rendering.
 */
class FrequencyGraphCalculator {
public:
    static constexpr double MIN_FREQ = 20.0;
    static constexpr double MAX_FREQ = 20000.0;
    static constexpr size_t NUM_POINTS = 256;

    static inline double freqToNormalizedX(double freqHz) noexcept {
        const double logMin = std::log10(MIN_FREQ);
        const double logMax = std::log10(MAX_FREQ);
        return (std::log10(freqHz) - logMin) / (logMax - logMin);
    }

    static inline double normalizedXToFreq(double normX) noexcept {
        const double logMin = std::log10(MIN_FREQ);
        const double logMax = std::log10(MAX_FREQ);
        return std::pow(10.0, logMin + normX * (logMax - logMin));
    }

    static inline std::vector<GraphPoint> calculateResponse(const AudioEngine::SurgicalEQModule& eq) {
        std::vector<GraphPoint> points(NUM_POINTS);
        for (size_t i = 0; i < NUM_POINTS; ++i) {
            const double normX = static_cast<double>(i) / static_cast<double>(NUM_POINTS - 1);
            const double freq = normalizedXToFreq(normX);

            GraphPoint& p = points[i];
            p.freqHz = freq;
            p.normalizedX = normX;
            p.magnitudeDb = eq.getMagnitudeDbAt(freq);
            p.phaseDegrees = eq.getPhaseResponseAt(freq) * (180.0 / Math::AcousticMath::PI);
            p.groupDelayMs = eq.getGroupDelayMsAt(freq);
        }
        return points;
    }
};

} // namespace EarTraining::UI
