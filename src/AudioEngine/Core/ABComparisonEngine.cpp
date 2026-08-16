#include "AudioEngine/Core/ABComparisonEngine.h"
#include <algorithm>
#include <cmath>
#include <random>

namespace EarTraining::AudioEngine {

ABComparisonEngine::ABComparisonEngine() {
    std::random_device rd;
    m_rng.seed(rd());
}

void ABComparisonEngine::prepare(const AudioContext& context) {
    m_context = context;
    const float fadeSamples = (m_fadeDurationMs * 0.001f) * static_cast<float>(context.sampleRate);
    m_fadeStepPerSample = (fadeSamples > 1.0f) ? (1.0f / fadeSamples) : 1.0f;
    reset();
}

void ABComparisonEngine::reset() noexcept {
    m_gainA = 1.0f;
    m_gainB = 0.0f;
    m_gainX = 0.0f;
    m_targetMode.store(ABMode::DirectA_Dry, std::memory_order_relaxed);
}

void ABComparisonEngine::setMode(ABMode mode) noexcept {
    m_targetMode.store(mode, std::memory_order_relaxed);
}

bool ABComparisonEngine::randomizeBlindAssignment() noexcept {
    std::uniform_int_distribution<int> dist(0, 1);
    const bool isWet = (dist(m_rng) == 1);
    m_blindTargetIsWet.store(isWet, std::memory_order_relaxed);
    return isWet;
}

void ABComparisonEngine::process(const Common::AudioBuffer<float>& dryBuffer,
                                const Common::AudioBuffer<float>& userWetBuffer,
                                const Common::AudioBuffer<float>& targetWetBuffer,
                                Common::AudioBuffer<float>& outputBuffer) noexcept {
    const uint32_t numChannels = outputBuffer.getNumChannels();
    const uint32_t numSamples = outputBuffer.getNumSamples();

    const ABMode mode = m_targetMode.load(std::memory_order_relaxed);
    
    float targetA = 0.0f;
    float targetB = 0.0f;
    float targetX = 0.0f;

    switch (mode) {
        case ABMode::DirectA_Dry:
        case ABMode::Bypass:
            targetA = 1.0f;
            break;
        case ABMode::DirectB_Wet:
            targetB = 1.0f;
            break;
        case ABMode::BlindX:
            targetX = 1.0f;
            break;
    }

    for (uint32_t n = 0; n < numSamples; ++n) {
        m_gainA += std::clamp(targetA - m_gainA, -m_fadeStepPerSample, m_fadeStepPerSample);
        m_gainB += std::clamp(targetB - m_gainB, -m_fadeStepPerSample, m_fadeStepPerSample);
        m_gainX += std::clamp(targetX - m_gainX, -m_fadeStepPerSample, m_fadeStepPerSample);

        const float sumSq = (m_gainA * m_gainA) + (m_gainB * m_gainB) + (m_gainX * m_gainX);
        const float invNorm = (sumSq > 1e-6f) ? (1.0f / std::sqrt(sumSq)) : 1.0f;
        const float gA = m_gainA * invNorm;
        const float gB = m_gainB * invNorm;
        const float gX = m_gainX * invNorm;

        for (uint32_t ch = 0; ch < numChannels; ++ch) {
            const float sampleDry = dryBuffer.getReadPointer(ch)[n];
            const float sampleUser = userWetBuffer.getReadPointer(ch)[n];
            const float sampleTarget = targetWetBuffer.getReadPointer(ch)[n];
            outputBuffer.getWritePointer(ch)[n] = (sampleDry * gA) + (sampleUser * gB) + (sampleTarget * gX);
        }
    }
}

void ABComparisonEngine::process(const Common::AudioBuffer<float>& dryBuffer,
                                const Common::AudioBuffer<float>& wetBuffer,
                                Common::AudioBuffer<float>& outputBuffer) noexcept {
    process(dryBuffer, wetBuffer, wetBuffer, outputBuffer);
}

} // namespace EarTraining::AudioEngine
