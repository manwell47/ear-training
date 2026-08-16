#pragma once

#include "AudioEngine/Core/AudioContext.h"
#include "Common/AudioBuffer.h"
#include <string_view>

namespace EarTraining::AudioEngine {

/**
 * @brief Abstract Base Class for all real-time DSP Modules.
 * 
 * Strict Real-Time Requirements:
 * - process() MUST NOT allocate heap memory.
 * - process() MUST NOT lock mutexes or perform blocking I/O.
 * - process() MUST execute in deterministic $O(N)$ sample-accurate time.
 */
class AudioProcessorNode {
public:
    virtual ~AudioProcessorNode() = default;

    /**
     * @brief Allocates buffers and sets up coefficients according to the audio format.
     * Called on audio setup or sample-rate change (Non-audio thread).
     */
    virtual void prepare(const AudioContext& context) = 0;

    /**
     * @brief Real-time audio processing callback. (Audio thread).
     * @param buffer In-place audio buffer to be processed.
     */
    virtual void process(Common::AudioBuffer<float>& buffer) = 0;

    /**
     * @brief Resets filter states, delay lines, and internal history to silence.
     */
    virtual void reset() noexcept = 0;

    /**
     * @brief Returns the processing latency in samples (e.g. for FIR linear phase filtering).
     */
    [[nodiscard]] virtual uint32_t getLatencySamples() const noexcept {
        return 0;
    }

    /**
     * @brief Module name descriptor for UI and routing identification.
     */
    [[nodiscard]] virtual std::string_view getNodeName() const noexcept = 0;
};

} // namespace EarTraining::AudioEngine
