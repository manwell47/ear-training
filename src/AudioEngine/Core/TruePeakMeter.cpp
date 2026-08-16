#include "AudioEngine/Core/TruePeakMeter.h"
#include <cmath>
#include <cstring>
#include <algorithm>

namespace EarTraining::AudioEngine {

TruePeakMeter::TruePeakMeter() {
    calculateFilterCoefficients();
}

void TruePeakMeter::calculateFilterCoefficients() {
    // 48-tap prototype sinc lowpass filter split into 4 phases of 12 taps each
    constexpr int32_t totalTaps = OVERSAMPLE_FACTOR * TAPS_PER_PHASE; // 48
    constexpr double centerIndex = (totalTaps - 1.0) / 2.0;           // 23.5

    for (uint32_t phase = 0; phase < OVERSAMPLE_FACTOR; ++phase) {
        for (uint32_t tap = 0; tap < TAPS_PER_PHASE; ++tap) {
            // Continuous index in the composite 48-tap filter
            const int32_t compositeIndex = static_cast<int32_t>(tap * OVERSAMPLE_FACTOR + phase);
            const double t = (compositeIndex - centerIndex) / static_cast<double>(OVERSAMPLE_FACTOR);
            
            // Normalized windowed sinc
            const double sincVal = Math::AcousticMath::normalizedSinc(t);
            const double winVal = Math::AcousticMath::blackmanWindow(compositeIndex, totalTaps);
            m_polyphaseCoeffs[phase][tap] = static_cast<float>(sincVal * winVal);
        }
    }
}

void TruePeakMeter::prepare(const AudioContext& context) {
    m_context = context;
    const uint32_t numChannels = std::min(context.numChannels, MAX_CHANNELS);

    m_historyBuffers.resize(numChannels);
    m_historyIndices.assign(numChannels, 0);

    for (uint32_t ch = 0; ch < MAX_CHANNELS; ++ch) {
        if (ch < numChannels) {
            m_historyBuffers[ch].fill(0.0f);
        }
        m_currentPeaksLinear[ch].store(0.0f, std::memory_order_relaxed);
        m_maxHoldPeaksLinear[ch].store(0.0f, std::memory_order_relaxed);
    }

    // Standard 1.7 second decay ballistics
    const double decayTimeSec = 1.7;
    m_decayCoeff = static_cast<float>(std::exp(-1.0 / (decayTimeSec * context.sampleRate)));
}

void TruePeakMeter::reset() noexcept {
    for (auto& hist : m_historyBuffers) {
        hist.fill(0.0f);
    }
    std::fill(m_historyIndices.begin(), m_historyIndices.end(), 0);
    for (auto& peak : m_currentPeaksLinear) {
        peak.store(0.0f, std::memory_order_relaxed);
    }
    for (auto& maxHold : m_maxHoldPeaksLinear) {
        maxHold.store(0.0f, std::memory_order_relaxed);
    }
}

void TruePeakMeter::process(const Common::AudioBuffer<float>& buffer) noexcept {
    const uint32_t numChannels = std::min(buffer.getNumChannels(), static_cast<uint32_t>(m_historyBuffers.size()));
    const uint32_t numSamples = buffer.getNumSamples();

    for (uint32_t ch = 0; ch < numChannels; ++ch) {
        const float* src = buffer.getReadPointer(ch);
        auto& hist = m_historyBuffers[ch];
        uint32_t histIdx = m_historyIndices[ch];

        float currentPeak = m_currentPeaksLinear[ch].load(std::memory_order_relaxed);
        float maxHold = m_maxHoldPeaksLinear[ch].load(std::memory_order_relaxed);

        for (uint32_t n = 0; n < numSamples; ++n) {
            const float sample = src[n];
            
            // Insert sample into circular history buffer
            hist[histIdx] = sample;
            histIdx = (histIdx + 1) % TAPS_PER_PHASE;

            // Evaluate all 4 oversampled polyphase sub-filter outputs
            for (uint32_t phase = 0; phase < OVERSAMPLE_FACTOR; ++phase) {
                float interpolatedSample = 0.0f;
                const auto& coeffs = m_polyphaseCoeffs[phase];

                for (uint32_t k = 0; k < TAPS_PER_PHASE; ++k) {
                    const uint32_t tapIndex = (histIdx + TAPS_PER_PHASE - 1 - k) % TAPS_PER_PHASE;
                    interpolatedSample += hist[tapIndex] * coeffs[k];
                }

                const float absVal = std::abs(interpolatedSample);
                if (absVal > currentPeak) {
                    currentPeak = absVal;
                }
            }

            // Apply ballistics decay
            currentPeak *= m_decayCoeff;
            if (currentPeak > maxHold) {
                maxHold = currentPeak;
            }
        }

        m_historyIndices[ch] = histIdx;
        m_currentPeaksLinear[ch].store(currentPeak, std::memory_order_relaxed);
        m_maxHoldPeaksLinear[ch].store(maxHold, std::memory_order_relaxed);
    }
}

float TruePeakMeter::getTruePeakDbTP(uint32_t channel) const noexcept {
    if (channel >= m_currentPeaksLinear.size()) return static_cast<float>(Math::AcousticMath::MIN_DB);
    const float linearPeak = m_currentPeaksLinear[channel].load(std::memory_order_relaxed);
    return static_cast<float>(Math::AcousticMath::amplitudeToDb(linearPeak));
}

float TruePeakMeter::getMaxHoldPeakDbTP(uint32_t channel) const noexcept {
    if (channel >= m_maxHoldPeaksLinear.size()) return static_cast<float>(Math::AcousticMath::MIN_DB);
    const float maxHold = m_maxHoldPeaksLinear[channel].load(std::memory_order_relaxed);
    return static_cast<float>(Math::AcousticMath::amplitudeToDb(maxHold));
}

void TruePeakMeter::resetMaxHold() noexcept {
    for (auto& maxHold : m_maxHoldPeaksLinear) {
        maxHold.store(0.0f, std::memory_order_relaxed);
    }
}

} // namespace EarTraining::AudioEngine
