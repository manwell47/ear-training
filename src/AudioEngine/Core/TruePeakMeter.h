#pragma once

#include "AudioEngine/Core/AudioContext.h"
#include "Common/AudioBuffer.h"
#include "Common/Math/AcousticMath.h"
#include <vector>
#include <array>
#include <atomic>

namespace EarTraining::AudioEngine {

/**
 * @brief ITU-R BS.1770-4 Compliant 4x Oversampled True Peak Meter.
 * 
 * Accurately detects inter-sample peaks (ISPs) that exceed 0 dBFS before D/A reconstruction.
 * Uses a 4-phase polyphase FIR interpolation filter.
 */
class TruePeakMeter {
public:
    static constexpr uint32_t OVERSAMPLE_FACTOR = 4;
    static constexpr uint32_t TAPS_PER_PHASE = 12; // 48-tap composite FIR filter
    static constexpr uint32_t MAX_CHANNELS = 8;

    TruePeakMeter();
    ~TruePeakMeter() = default;

    void prepare(const AudioContext& context);
    void reset() noexcept;

    /**
     * @brief Analyzes the audio block for True Peaks. (Real-time audio thread safe).
     */
    void process(const Common::AudioBuffer<float>& buffer) noexcept;

    /**
     * @brief Gets current peak value in dBTP (Decibels relative to Full Scale True Peak).
     * @param channel Channel index.
     */
    [[nodiscard]] float getTruePeakDbTP(uint32_t channel) const noexcept;

    /**
     * @brief Gets maximum hold peak value in dBTP.
     */
    [[nodiscard]] float getMaxHoldPeakDbTP(uint32_t channel) const noexcept;

    /**
     * @brief Resets max peak hold counters.
     */
    void resetMaxHold() noexcept;

private:
    void calculateFilterCoefficients();

    AudioContext m_context;
    // 4 phases, each with 12 taps
    std::array<std::array<float, TAPS_PER_PHASE>, OVERSAMPLE_FACTOR> m_polyphaseCoeffs{};
    
    // Circular history buffers for polyphase convolution per channel
    std::vector<std::array<float, TAPS_PER_PHASE>> m_historyBuffers;
    std::vector<uint32_t> m_historyIndices;

    // Peak levels per channel (Linear amplitude)
    std::array<std::atomic<float>, MAX_CHANNELS> m_currentPeaksLinear{};
    std::array<std::atomic<float>, MAX_CHANNELS> m_maxHoldPeaksLinear{};
    
    float m_decayCoeff{0.999f};
};

} // namespace EarTraining::AudioEngine
