#pragma once

#include "AudioEngine/Core/AudioContext.h"
#include "Common/AudioBuffer.h"
#include "Common/Math/AcousticMath.h"
#include <atomic>
#include <random>

namespace EarTraining::AudioEngine {

enum class ABMode : uint8_t {
    DirectA_Dry = 0,   // Unprocessed reference
    DirectB_Wet = 1,   // Processed signal
    BlindX = 2,        // Blind mystery signal (randomly assigned to A or B)
    Bypass = 3         // Direct hardware bypass
};

/**
 * @brief Sample-accurate, Glitch-Free Blind A/B/X Comparison Engine.
 * 
 * Employs constant-power equal-energy sinusoidal crossfading to prevent clicks, pops,
 * or transient dropouts when toggling between processed and unprocessed signals.
 */
class ABComparisonEngine {
public:
    ABComparisonEngine();
    ~ABComparisonEngine() = default;

    void prepare(const AudioContext& context);
    void reset() noexcept;

    /**
     * @brief Requests switching to a new comparison mode. (Called from UI / Controller thread).
     */
    void setMode(ABMode mode) noexcept;

    /**
     * @brief Generates a new randomized blind assignment for BlindX.
     * @return True if BlindX is currently pointing to Wet (B), False if pointing to Dry (A).
     */
    bool randomizeBlindAssignment() noexcept;

    /**
     * @brief Reveals the underlying assignment of BlindX.
     */
    [[nodiscard]] bool isBlindTargetWet() const noexcept {
        return m_blindTargetIsWet.load(std::memory_order_relaxed);
    }

    [[nodiscard]] ABMode getCurrentMode() const noexcept {
        return m_targetMode.load(std::memory_order_relaxed);
    }

    /**
     * @brief Mixes Dry, User Wet (B), and Target Wet (X) buffers into destination buffer with constant-power crossfading.
     * (Audio callback thread safe).
     */
    void process(const Common::AudioBuffer<float>& dryBuffer,
                 const Common::AudioBuffer<float>& userWetBuffer,
                 const Common::AudioBuffer<float>& targetWetBuffer,
                 Common::AudioBuffer<float>& outputBuffer) noexcept;

    /**
     * @brief 2-buffer compatibility overload.
     */
    void process(const Common::AudioBuffer<float>& dryBuffer,
                 const Common::AudioBuffer<float>& wetBuffer,
                 Common::AudioBuffer<float>& outputBuffer) noexcept;

private:
    AudioContext m_context;
    std::atomic<ABMode> m_targetMode{ABMode::DirectA_Dry};
    std::atomic<bool> m_blindTargetIsWet{false};

    // Crossfade state
    float m_gainA{1.0f};
    float m_gainB{0.0f};
    float m_gainX{0.0f};
    float m_fadeStepPerSample{0.001f};
    float m_fadeDurationMs{5.0f}; // 5ms constant power crossfade
    
    std::mt19937 m_rng{1337};
};

} // namespace EarTraining::AudioEngine
