#pragma once

#include "AudioEngine/Core/AudioContext.h"
#include "Common/AudioBuffer.h"
#include "Common/Math/AcousticMath.h"
#include "AudioEngine/Modules/SurgicalEQ/BiquadFilter.h"
#include <vector>
#include <complex>

namespace EarTraining::AudioEngine {

/**
 * @brief Symmetrical Linear-Phase FIR Filter.
 * 
 * Provides strict zero phase distortion and uniform group delay across the full spectrum.
 * Exhibits symmetrical pre-ringing / post-ringing around transients for ear training comparison.
 */
class LinearPhaseFIR {
public:
    static constexpr uint32_t NUM_TAPS = 257; // Symmetrical odd-order FIR kernel

    LinearPhaseFIR();
    ~LinearPhaseFIR() = default;

    void prepare(const AudioContext& context);
    void reset() noexcept;

    void setParameters(FilterType type, double frequencyHz, double gainDb, double qFactor) noexcept;

    /**
     * @brief In-place real-time FIR convolution processing. (Audio thread safe).
     */
    void process(Common::AudioBuffer<float>& buffer) noexcept;

    /**
     * @brief Fixed latency introduced by linear phase convolution in samples: (NUM_TAPS - 1) / 2
     */
    [[nodiscard]] constexpr uint32_t getLatencySamples() const noexcept {
        return (NUM_TAPS - 1) / 2;
    }

    [[nodiscard]] double getMagnitudeDbAt(double freqHz) const noexcept;
    [[nodiscard]] double getPhaseResponseAt(double freqHz) const noexcept;
    [[nodiscard]] double getGroupDelayMsAt(double freqHz) const noexcept;

    [[nodiscard]] const std::vector<float>& getImpulseResponse() const noexcept {
        return m_kernel;
    }

private:
    void designLinearPhaseKernel() noexcept;

    AudioContext m_context;
    FilterType m_type{FilterType::Bell};
    double m_frequencyHz{1000.0};
    double m_gainDb{0.0};
    double m_qFactor{1.414};

    // Symmetrical impulse response kernel
    std::vector<float> m_kernel;

    // Direct convolution history buffer per channel
    std::vector<std::vector<float>> m_history;
    std::vector<uint32_t> m_historyIndex;
};

} // namespace EarTraining::AudioEngine
