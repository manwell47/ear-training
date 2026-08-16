#pragma once

#include "AudioEngine/Core/AudioContext.h"
#include "Common/AudioBuffer.h"
#include "Common/Math/AcousticMath.h"
#include <complex>
#include <vector>
#include <array>

namespace EarTraining::AudioEngine {

enum class FilterType : uint8_t {
    Bell = 0,
    LowShelf = 1,
    HighShelf = 2,
    BandPass = 3,
    Notch = 4,
    HighPass = 5,
    LowPass = 6
};

/**
 * @brief Minimum-Phase Direct Form II Transposed Biquad Filter.
 * 
 * Provides superior numerical stability and low quantization noise compared to Direct Form I.
 * Computes exact analytical magnitude, phase response, and group delay.
 */
class BiquadFilter {
public:
    BiquadFilter();
    ~BiquadFilter() = default;

    void prepare(const AudioContext& context);
    void reset() noexcept;

    void setParameters(FilterType type, double frequencyHz, double gainDb, double qFactor) noexcept;

    /**
     * @brief In-place real-time filter processing. (Audio thread safe).
     */
    void process(Common::AudioBuffer<float>& buffer) noexcept;

    // =========================================================================
    // Analytical Response Analysis (for Frequency Graph & Phase Training)
    // =========================================================================

    /**
     * @brief Evaluates the complex transfer function H(z) at a specific frequency.
     */
    [[nodiscard]] std::complex<double> getTransferFunctionAt(double freqHz) const noexcept;

    /**
     * @brief Computes magnitude response in decibels (20*log10(|H(z)|)) at freqHz.
     */
    [[nodiscard]] double getMagnitudeDbAt(double freqHz) const noexcept;

    /**
     * @brief Computes phase response in radians at freqHz.
     */
    [[nodiscard]] double getPhaseResponseAt(double freqHz) const noexcept;

    /**
     * @brief Computes exact analytical group delay in milliseconds at freqHz:
     * tau_g = - d(theta) / d(omega)
     */
    [[nodiscard]] double getGroupDelayMsAt(double freqHz) const noexcept;

    [[nodiscard]] FilterType getType() const noexcept { return m_type; }
    [[nodiscard]] double getFrequency() const noexcept { return m_frequencyHz; }
    [[nodiscard]] double getGainDb() const noexcept { return m_gainDb; }
    [[nodiscard]] double getQ() const noexcept { return m_qFactor; }

private:
    void calculateCoefficients() noexcept;

    AudioContext m_context;
    FilterType m_type{FilterType::Bell};
    double m_frequencyHz{1000.0};
    double m_gainDb{0.0};
    double m_qFactor{1.414};

    // Normalized biquad coefficients (a0 = 1.0)
    double m_b0{1.0}, m_b1{0.0}, m_b2{0.0};
    double m_a1{0.0}, m_a2{0.0};

    // Per-channel DF2T state variables (s1, s2)
    struct DF2TState {
        double s1{0.0};
        double s2{0.0};
    };
    std::vector<DF2TState> m_channelStates;
};

} // namespace EarTraining::AudioEngine
