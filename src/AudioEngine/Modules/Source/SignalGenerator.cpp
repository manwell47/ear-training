#include "AudioEngine/Modules/Source/SignalGenerator.h"
#include <cmath>
#include <bit>

namespace EarTraining::AudioEngine {

SignalGenerator::SignalGenerator() {
    std::random_device rd;
    m_rng.seed(rd());
}

void SignalGenerator::prepare(const AudioContext& context) {
    m_context = context;
    m_phaseIncrement = Math::AcousticMath::TWO_PI * m_frequencyHz / context.sampleRate;
    m_impulseIntervalSamples = static_cast<uint32_t>(context.sampleRate * 0.5); // Every 500ms
    reset();
}

void SignalGenerator::reset() noexcept {
    m_phase = 0.0;
    m_pinkRows.fill(0.0f);
    m_pinkRunningSum = 0.0f;
    m_pinkIndex = 0;
    m_impulseSampleCounter = 0;
}

void SignalGenerator::setType(GeneratorType type) noexcept {
    m_type = type;
}

void SignalGenerator::setFrequency(double freqHz) noexcept {
    m_frequencyHz = std::clamp(freqHz, 10.0, m_context.getNyquist() * 0.95);
    if (m_context.sampleRate > 0.0) {
        m_phaseIncrement = Math::AcousticMath::TWO_PI * m_frequencyHz / m_context.sampleRate;
    }
}

void SignalGenerator::setAmplitude(float linearAmplitude) noexcept {
    m_amplitude = std::clamp(linearAmplitude, 0.0f, 1.0f);
}

void SignalGenerator::setAmplitudeDb(float db) noexcept {
    m_amplitude = static_cast<float>(Math::AcousticMath::dbToAmplitude(db));
}

void SignalGenerator::process(Common::AudioBuffer<float>& buffer) noexcept {
    const uint32_t numChannels = buffer.getNumChannels();
    const uint32_t numSamples = buffer.getNumSamples();

    for (uint32_t n = 0; n < numSamples; ++n) {
        float sample = 0.0f;

        switch (m_type) {
            case GeneratorType::SineWave: {
                sample = static_cast<float>(std::sin(m_phase)) * m_amplitude;
                m_phase += m_phaseIncrement;
                if (m_phase >= Math::AcousticMath::TWO_PI) {
                    m_phase -= Math::AcousticMath::TWO_PI;
                }
                break;
            }
            case GeneratorType::WhiteNoise: {
                sample = m_dist(m_rng) * m_amplitude;
                break;
            }
            case GeneratorType::PinkNoise: {
                // Voss-McCartney 1/f Pink Noise algorithm
                m_pinkIndex = (m_pinkIndex + 1) & ((1 << NUM_PINK_ROWS) - 1);
                const int trailingZeros = std::countr_zero(m_pinkIndex);
                if (trailingZeros < static_cast<int>(NUM_PINK_ROWS)) {
                    m_pinkRunningSum -= m_pinkRows[trailingZeros];
                    const float newRand = m_dist(m_rng);
                    m_pinkRows[trailingZeros] = newRand;
                    m_pinkRunningSum += newRand;
                }
                const float white = m_dist(m_rng);
                sample = ((m_pinkRunningSum + white) / static_cast<float>(NUM_PINK_ROWS + 1)) * m_amplitude * 2.5f;
                break;
            }
            case GeneratorType::ImpulseTrain: {
                if (m_impulseSampleCounter == 0) {
                    sample = m_amplitude;
                } else {
                    sample = 0.0f;
                }
                m_impulseSampleCounter = (m_impulseSampleCounter + 1) % m_impulseIntervalSamples;
                break;
            }
        }

        // Copy generated sample to all output channels
        for (uint32_t ch = 0; ch < numChannels; ++ch) {
            buffer.getWritePointer(ch)[n] = sample;
        }
    }
}

} // namespace EarTraining::AudioEngine
