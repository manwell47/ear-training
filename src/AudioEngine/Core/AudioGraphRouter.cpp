#include "AudioEngine/Core/AudioGraphRouter.h"
#include "Common/Math/AcousticMath.h"
#include <algorithm>
#include <cstring>

namespace EarTraining::AudioEngine {

AudioGraphRouter::AudioGraphRouter() {
    m_masterGainLinear.setTargetValue(1.0f);
}

void AudioGraphRouter::prepare(const AudioContext& context) {
    m_context = context;

    m_sourceBuffer.resize(context.numChannels, context.maxBlockSize);
    m_dryBuffer.resize(context.numChannels, context.maxBlockSize);
    m_wetBuffer.resize(context.numChannels, context.maxBlockSize);
    m_targetWetBuffer.resize(context.numChannels, context.maxBlockSize);
    m_comparisonOutputBuffer.resize(context.numChannels, context.maxBlockSize);

    // Max 16384 samples of latency compensation buffer (sufficient for large linear-phase FIR kernels)
    m_dryDelayLine.resize(context.numChannels, 16384);
    m_dryDelayLine.clear();
    m_dryDelayWriteIndex = 0;

    m_signalGenerator.prepare(context);
    m_fileReader.prepare(context);
    m_abEngine.prepare(context);
    m_truePeakMeter.prepare(context);
    m_masterGainLinear.reset(static_cast<float>(context.sampleRate), 1.0f);

    if (m_activeModule) {
        m_activeModule->prepare(context);
    }
    if (m_targetModule) {
        m_targetModule->prepare(context);
    }
}

void AudioGraphRouter::reset() noexcept {
    m_sourceBuffer.clear();
    m_dryBuffer.clear();
    m_wetBuffer.clear();
    m_targetWetBuffer.clear();
    m_comparisonOutputBuffer.clear();
    m_dryDelayLine.clear();
    m_dryDelayWriteIndex = 0;

    m_signalGenerator.reset();
    m_fileReader.reset();
    m_abEngine.reset();
    m_truePeakMeter.reset();
    m_telemetryQueue.reset();

    if (m_activeModule) {
        m_activeModule->reset();
    }
    if (m_targetModule) {
        m_targetModule->reset();
    }
}

void AudioGraphRouter::setActiveModule(std::shared_ptr<AudioProcessorNode> module) noexcept {
    m_activeModule = std::move(module);
    if (m_activeModule && m_context.sampleRate > 0.0) {
        m_activeModule->prepare(m_context);
    }
}

void AudioGraphRouter::setTargetModule(std::shared_ptr<AudioProcessorNode> targetModule) noexcept {
    m_targetModule = std::move(targetModule);
    if (m_targetModule && m_context.sampleRate > 0.0) {
        m_targetModule->prepare(m_context);
    }
}

void AudioGraphRouter::setAudioSource(AudioSourceType sourceType) noexcept {
    m_sourceType.store(sourceType, std::memory_order_relaxed);
}

void AudioGraphRouter::setMasterGainDb(float gainDb) noexcept {
    const float linear = static_cast<float>(Math::AcousticMath::dbToAmplitude(gainDb));
    m_masterGainLinear.setTargetValue(linear);
}

float AudioGraphRouter::getMasterGainDb() const noexcept {
    const float linear = m_masterGainLinear.getTargetValue();
    return static_cast<float>(Math::AcousticMath::amplitudeToDb(linear));
}

void AudioGraphRouter::processCallback(float** outputChannels, 
                                     uint32_t numChannels, 
                                     uint32_t numSamples,
                                     const float* const* inputChannels) noexcept {
    // 1. Ensure working buffers match the incoming block size
    const uint32_t channels = std::min(numChannels, m_context.numChannels);
    const uint32_t samples = std::min(numSamples, m_context.maxBlockSize);

    // 2. Fetch input signal based on active source (Gated by Transport State)
    const bool isTransportPlaying = m_fileReader.isPlaying();
    if (!isTransportPlaying) {
        m_sourceBuffer.clear();
    } else {
        const AudioSourceType srcType = m_sourceType.load(std::memory_order_relaxed);
        switch (srcType) {
            case AudioSourceType::ExternalFileStream: {
                m_fileReader.process(m_sourceBuffer);
                break;
            }
            case AudioSourceType::SignalGenerator: {
                m_signalGenerator.process(m_sourceBuffer);
                break;
            }
            case AudioSourceType::LiveAudioInput: {
                if (inputChannels != nullptr) {
                    for (uint32_t ch = 0; ch < channels; ++ch) {
                        if (inputChannels[ch] != nullptr) {
                            std::memcpy(m_sourceBuffer.getWritePointer(ch), inputChannels[ch], samples * sizeof(float));
                        } else {
                            m_sourceBuffer.clearChannel(ch);
                        }
                    }
                } else {
                    m_sourceBuffer.clear();
                }
                break;
            }
        }
    }

    // 3. Prepare User Wet and Target Wet buffers
    m_wetBuffer.copyFrom(m_sourceBuffer, samples);
    m_targetWetBuffer.copyFrom(m_sourceBuffer, samples);

    // 4. Process through active User DSP module (Auditioning / Guess)
    uint32_t userLatency = 0;
    if (m_activeModule) {
        m_activeModule->process(m_wetBuffer);
        userLatency = m_activeModule->getLatencySamples();
    }

    // 5. Process through Target DSP module (Blind X Target)
    uint32_t targetLatency = 0;
    if (m_targetModule) {
        m_targetModule->process(m_targetWetBuffer);
        targetLatency = m_targetModule->getLatencySamples();
    } else {
        m_targetWetBuffer.copyFrom(m_wetBuffer, samples);
    }

    // 6. Compensate Dry buffer latency if modules introduce delay (e.g. Linear Phase FIR)
    const uint32_t moduleLatency = std::max(userLatency, targetLatency);
    const uint32_t delayLineCapacity = m_dryDelayLine.getNumSamples();
    if (moduleLatency > 0 && moduleLatency < delayLineCapacity) {
        for (uint32_t n = 0; n < samples; ++n) {
            for (uint32_t ch = 0; ch < channels; ++ch) {
                // Write new dry sample into circular delay line
                m_dryDelayLine.getWritePointer(ch)[m_dryDelayWriteIndex] = m_sourceBuffer.getReadPointer(ch)[n];

                // Read latency-compensated dry sample
                const uint32_t readIdx = (m_dryDelayWriteIndex + delayLineCapacity - moduleLatency) % delayLineCapacity;
                m_dryBuffer.getWritePointer(ch)[n] = m_dryDelayLine.getReadPointer(ch)[readIdx];
            }
            m_dryDelayWriteIndex = (m_dryDelayWriteIndex + 1) % delayLineCapacity;
        }
    } else {
        m_dryBuffer.copyFrom(m_sourceBuffer, samples);
    }

    // 7. Blind A/B/X Comparison engine (A = Dry, B = User Guess, X = Mystery Target)
    m_abEngine.process(m_dryBuffer, m_wetBuffer, m_targetWetBuffer, m_comparisonOutputBuffer);

    // 7. Apply Master Output Volume
    for (uint32_t n = 0; n < samples; ++n) {
        const float currentGain = m_masterGainLinear.getNextValue();
        for (uint32_t ch = 0; ch < channels; ++ch) {
            m_comparisonOutputBuffer.getWritePointer(ch)[n] *= currentGain;
        }
    }

    // 8. Feed True Peak Meter
    m_truePeakMeter.process(m_comparisonOutputBuffer);

    // 9. Copy to hardware/driver output buffers
    for (uint32_t ch = 0; ch < channels; ++ch) {
        if (outputChannels[ch] != nullptr) {
            std::memcpy(outputChannels[ch], m_comparisonOutputBuffer.getReadPointer(ch), samples * sizeof(float));
        }
    }

    // 10. Push snapshot to lock-free telemetry ring buffer for UI display
    AudioMeterTelemetry telemetry;
    telemetry.peakLeftDbTP = m_truePeakMeter.getTruePeakDbTP(0);
    telemetry.peakRightDbTP = m_truePeakMeter.getTruePeakDbTP(channels > 1 ? 1 : 0);
    telemetry.maxHoldLeftDbTP = m_truePeakMeter.getMaxHoldPeakDbTP(0);
    telemetry.maxHoldRightDbTP = m_truePeakMeter.getMaxHoldPeakDbTP(channels > 1 ? 1 : 0);
    telemetry.currentABMode = m_abEngine.getCurrentMode();
    telemetry.isBlindTargetWet = m_abEngine.isBlindTargetWet();

    m_telemetryQueue.push(telemetry);
}

} // namespace EarTraining::AudioEngine
