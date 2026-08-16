#pragma once

#include <vector>
#include <span>
#include <algorithm>
#include <cstring>
#include <cassert>
#include <concepts>

namespace EarTraining::Common {

/**
 * @brief High-performance Planar Multi-Channel Audio Buffer.
 * 
 * Guarantees zero heap allocation once sized. Provides SIMD-friendly contiguous memory
 * per channel and flexible channel referencing.
 */
template <typename SampleType = float>
class AudioBuffer {
public:
    AudioBuffer() = default;

    /**
     * @brief Allocates buffer storage for the given channel count and sample capacity.
     */
    AudioBuffer(uint32_t numChannels, uint32_t numSamples) {
        resize(numChannels, numSamples);
    }

    /**
     * @brief Re-allocates internal storage. Must be called only in prepare / setup phase (non-audio thread).
     */
    void resize(uint32_t numChannels, uint32_t numSamples) {
        m_numChannels = numChannels;
        m_numSamples = numSamples;
        m_data.resize(numChannels * numSamples, SampleType{0});
        m_channelPointers.resize(numChannels);
        for (uint32_t ch = 0; ch < numChannels; ++ch) {
            m_channelPointers[ch] = m_data.data() + (ch * numSamples);
        }
    }

    /**
     * @brief Clears all channel samples to zero. (Real-time safe)
     */
    void clear() noexcept {
        if (!m_data.empty()) {
            std::memset(m_data.data(), 0, m_data.size() * sizeof(SampleType));
        }
    }

    /**
     * @brief Clears a specific channel to zero. (Real-time safe)
     */
    void clearChannel(uint32_t channel) noexcept {
        assert(channel < m_numChannels);
        std::memset(getWritePointer(channel), 0, m_numSamples * sizeof(SampleType));
    }

    [[nodiscard]] inline uint32_t getNumChannels() const noexcept { return m_numChannels; }
    [[nodiscard]] inline uint32_t getNumSamples() const noexcept { return m_numSamples; }

    [[nodiscard]] inline const SampleType* getReadPointer(uint32_t channel) const noexcept {
        assert(channel < m_numChannels);
        return m_channelPointers[channel];
    }

    [[nodiscard]] inline SampleType* getWritePointer(uint32_t channel) noexcept {
        assert(channel < m_numChannels);
        return m_channelPointers[channel];
    }

    [[nodiscard]] inline std::span<const SampleType> getChannelSpan(uint32_t channel) const noexcept {
        assert(channel < m_numChannels);
        return std::span<const SampleType>(m_channelPointers[channel], m_numSamples);
    }

    [[nodiscard]] inline std::span<SampleType> getChannelSpan(uint32_t channel) noexcept {
        assert(channel < m_numChannels);
        return std::span<SampleType>(m_channelPointers[channel], m_numSamples);
    }

    /**
     * @brief Copies data from a source buffer into this buffer. (Real-time safe)
     */
    void copyFrom(const AudioBuffer<SampleType>& source, uint32_t numSamplesToCopy = 0) noexcept {
        const uint32_t samples = (numSamplesToCopy == 0 || numSamplesToCopy > m_numSamples) 
                                 ? std::min(m_numSamples, source.getNumSamples()) 
                                 : numSamplesToCopy;
        const uint32_t channels = std::min(m_numChannels, source.getNumChannels());

        for (uint32_t ch = 0; ch < channels; ++ch) {
            std::memcpy(getWritePointer(ch), source.getReadPointer(ch), samples * sizeof(SampleType));
        }
    }

    /**
     * @brief Adds samples from a source buffer with gain scaling. (Real-time safe)
     */
    void addFrom(const AudioBuffer<SampleType>& source, SampleType gain = SampleType{1}, uint32_t numSamplesToAdd = 0) noexcept {
        const uint32_t samples = (numSamplesToAdd == 0 || numSamplesToAdd > m_numSamples) 
                                 ? std::min(m_numSamples, source.getNumSamples()) 
                                 : numSamplesToAdd;
        const uint32_t channels = std::min(m_numChannels, source.getNumChannels());

        for (uint32_t ch = 0; ch < channels; ++ch) {
            SampleType* dst = getWritePointer(ch);
            const SampleType* src = source.getReadPointer(ch);
            for (uint32_t i = 0; i < samples; ++i) {
                dst[i] += src[i] * gain;
            }
        }
    }

    /**
     * @brief Applies a linear gain scale to all channels. (Real-time safe)
     */
    void applyGain(SampleType gain) noexcept {
        for (uint32_t ch = 0; ch < m_numChannels; ++ch) {
            SampleType* dst = getWritePointer(ch);
            for (uint32_t i = 0; i < m_numSamples; ++i) {
                dst[i] *= gain;
            }
        }
    }

    /**
     * @brief Applies a linear gain ramp to smooth parameter transitions. (Real-time safe)
     */
    void applyGainRamp(SampleType startGain, SampleType endGain) noexcept {
        if (m_numSamples == 0) return;
        const SampleType step = (endGain - startGain) / static_cast<SampleType>(m_numSamples);

        for (uint32_t ch = 0; ch < m_numChannels; ++ch) {
            SampleType* dst = getWritePointer(ch);
            SampleType currentGain = startGain;
            for (uint32_t i = 0; i < m_numSamples; ++i) {
                dst[i] *= currentGain;
                currentGain += step;
            }
        }
    }

private:
    uint32_t m_numChannels{0};
    uint32_t m_numSamples{0};
    std::vector<SampleType> m_data;
    std::vector<SampleType*> m_channelPointers;
};

} // namespace EarTraining::Common
