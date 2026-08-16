#pragma once

#include "AudioEngine/Core/AudioContext.h"
#include "AudioEngine/Core/AudioProcessorNode.h"
#include "AudioEngine/Core/TruePeakMeter.h"
#include "AudioEngine/Core/ABComparisonEngine.h"
#include "AudioEngine/Modules/Source/SignalGenerator.h"
#include "AudioEngine/Modules/Source/AudioFileReader.h"
#include "Common/AudioBuffer.h"
#include "Common/RingBuffer.h"
#include "Common/Parameter.h"
#include <memory>
#include <atomic>

namespace EarTraining::AudioEngine {

enum class AudioSourceType : uint8_t {
    ExternalFileStream = 0,
    SignalGenerator = 1,
    LiveAudioInput = 2
};

struct AudioMeterTelemetry {
    float peakLeftDbTP{-144.0f};
    float peakRightDbTP{-144.0f};
    float maxHoldLeftDbTP{-144.0f};
    float maxHoldRightDbTP{-144.0f};
    ABMode currentABMode{ABMode::DirectA_Dry};
    bool isBlindTargetWet{false};
};

/**
 * @brief Master Real-Time Audio Callback Graph Router.
 * 
 * Coordinates input source routing, active DSP modules, delay-compensated A/B/X comparison,
 * True Peak metering, and thread-safe lock-free telemetry to the UI/Controller.
 */
class AudioGraphRouter {
public:
    AudioGraphRouter();
    ~AudioGraphRouter() = default;

    /**
     * @brief Allocates all internal buffers. Must be called on audio hardware initialization. (Non-audio thread).
     */
    void prepare(const AudioContext& context);

    /**
     * @brief Resets all internal DSP states and meters to silence.
     */
    void reset() noexcept;

    /**
     * @brief Sets the active user DSP processing module (e.g. Surgical EQ for guess/auditioning).
     */
    void setActiveModule(std::shared_ptr<AudioProcessorNode> module) noexcept;

    /**
     * @brief Sets the target mystery DSP processing module (e.g. Surgical EQ for blind quiz target).
     */
    void setTargetModule(std::shared_ptr<AudioProcessorNode> targetModule) noexcept;

    [[nodiscard]] std::shared_ptr<AudioProcessorNode> getActiveModule() const noexcept { return m_activeModule; }
    [[nodiscard]] std::shared_ptr<AudioProcessorNode> getTargetModule() const noexcept { return m_targetModule; }

    /**
     * @brief Sets the active audio input source type.
     */
    void setAudioSource(AudioSourceType sourceType) noexcept;

    /**
     * @brief Master real-time audio callback. (Zero heap allocation, lock-free).
     * @param outputChannels Array of channel pointers (float* per channel).
     * @param numChannels Number of output channels (e.g. 2 for stereo).
     * @param numSamples Number of samples in this audio buffer block.
     * @param inputChannels Optional input channel pointers for live DAW/hardware monitoring.
     */
    void processCallback(float** outputChannels, 
                         uint32_t numChannels, 
                         uint32_t numSamples,
                         const float* const* inputChannels = nullptr) noexcept;

    // Subsystem Accessors
    [[nodiscard]] ABComparisonEngine& getABEngine() noexcept { return m_abEngine; }
    [[nodiscard]] TruePeakMeter& getTruePeakMeter() noexcept { return m_truePeakMeter; }
    [[nodiscard]] SignalGenerator& getSignalGenerator() noexcept { return m_signalGenerator; }
    [[nodiscard]] AudioFileReader& getAudioFileReader() noexcept { return m_fileReader; }
    [[nodiscard]] Common::RingBuffer<AudioMeterTelemetry>& getTelemetryQueue() noexcept { return m_telemetryQueue; }

    void setMasterGainDb(float gainDb) noexcept;
    [[nodiscard]] float getMasterGainDb() const noexcept;

private:
    AudioContext m_context;

    // Internal pre-allocated working audio buffers
    Common::AudioBuffer<float> m_sourceBuffer;
    Common::AudioBuffer<float> m_dryBuffer;
    Common::AudioBuffer<float> m_wetBuffer;
    Common::AudioBuffer<float> m_targetWetBuffer;
    Common::AudioBuffer<float> m_comparisonOutputBuffer;
    
    // Latency compensation delay line for Dry path (when wet module introduces FIR latency)
    Common::AudioBuffer<float> m_dryDelayLine;
    uint32_t m_dryDelayWriteIndex{0};

    // Subsystems
    SignalGenerator m_signalGenerator;
    AudioFileReader m_fileReader;
    ABComparisonEngine m_abEngine;
    TruePeakMeter m_truePeakMeter;
    
    std::shared_ptr<AudioProcessorNode> m_activeModule;
    std::shared_ptr<AudioProcessorNode> m_targetModule;
    std::atomic<AudioSourceType> m_sourceType{AudioSourceType::ExternalFileStream};

    Common::SmoothedParameter<float> m_masterGainLinear{1.0f, 15.0f};
    Common::RingBuffer<AudioMeterTelemetry> m_telemetryQueue{256};
};

} // namespace EarTraining::AudioEngine
