#pragma once

#include <cstdint>

namespace EarTraining::AudioEngine {

/**
 * @brief Context configuration passed to all DSP modules during preparation.
 */
struct AudioContext {
    double sampleRate{48000.0};
    uint32_t maxBlockSize{512};
    uint32_t numChannels{2};

    [[nodiscard]] constexpr double getNyquist() const noexcept {
        return sampleRate * 0.5;
    }
};

} // namespace EarTraining::AudioEngine
