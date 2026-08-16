#pragma once

#include "AudioEngine/Core/AudioContext.h"
#include "Common/AudioBuffer.h"
#include "Common/Math/AcousticMath.h"
#include <array>
#include <random>

namespace EarTraining::AudioEngine {

enum class GeneratorType : uint8_t {
    SineWave = 0,
    PinkNoise = 1,
    WhiteNoise = 2,
    ImpulseTrain = 3
};

/**
 * @brief Real-time test signal generator.
 * 
 * Provides calibrated test signals for acoustic training:
 * - Pure Sine with sample-accurate phase accumulator
 * - Voss-McCartney calibrated 1/f Pink Noise (-3 dB/octave)
 * - True White Noise
 * - Band-limited Transient Impulses for pre-ringing evaluation
 */
class SignalGenerator {
public:
    SignalGenerator();
    ~SignalGenerator() = default;

    void prepare(const AudioContext& context);
    void reset() noexcept;

    void setType(GeneratorType type) noexcept;
    void setFrequency(double freqHz) noexcept;
    void setAmplitude(float linearAmplitude) noexcept;
    void setAmplitudeDb(float db) noexcept;

    /**
     * @brief Generates audio samples into the destination buffer. (Real-time audio callback safe).
     */
    void process(Common::AudioBuffer<float>& buffer) noexcept;

private:
    AudioContext m_context;
    GeneratorType m_type{GeneratorType::PinkNoise};
    double m_frequencyHz{1000.0};
    float m_amplitude{0.25f}; // -12 dBFS default
    double m_phase{0.0};
    double m_phaseIncrement{0.0};

    // Voss-McCartney Pink Noise state (16 rows)
    static constexpr size_t NUM_PINK_ROWS = 16;
    std::array<float, NUM_PINK_ROWS> m_pinkRows{};
    float m_pinkRunningSum{0.0f};
    uint32_t m_pinkIndex{0};

    std::mt19937 m_rng{42};
    std::uniform_real_distribution<float> m_dist{-1.0f, 1.0f};
    
    // Impulse train timing
    uint32_t m_impulseSampleCounter{0};
    uint32_t m_impulseIntervalSamples{48000};
};

} // namespace EarTraining::AudioEngine
