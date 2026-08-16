#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "AudioEngine/Core/AudioGraphRouter.h"
#include "AudioEngine/Modules/SurgicalEQ/SurgicalEQModule.h"
#include "Controller/TrainingSessionManager.h"

#include "Common/RingBuffer.h"

namespace EarTraining::JuceBridge {

/**
 * @brief JUCE AudioProcessor wrapper bridging JUCE host audio callbacks to our pure C++ DSP engine.
 * 
 * Strict Real-Time Safety:
 * - 0 heap allocations during processBlock.
 * - 0 mutex locks in the audio path.
 * - Lock-free SPSC telemetry queue communication to the UI thread.
 */
class EarTrainingAudioProcessor : public juce::AudioProcessor {
public:
    EarTrainingAudioProcessor();
    ~EarTrainingAudioProcessor() override = default;

    // ─── JUCE Lifecycle ──────────────────────────────────────────────────────
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) override;

    // ─── JUCE Plugin Capabilities ────────────────────────────────────────────
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "EarTrainingDSP"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram([[maybe_unused]] int index) override {}
    const juce::String getProgramName([[maybe_unused]] int index) override { return {}; }
    void changeProgramName([[maybe_unused]] int index, [[maybe_unused]] const juce::String& newName) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    // ─── Engine Accessors for UI Layer ───────────────────────────────────────
    [[nodiscard]] std::shared_ptr<AudioEngine::AudioGraphRouter> getRouter() const noexcept { return m_router; }
    [[nodiscard]] std::shared_ptr<AudioEngine::SurgicalEQModule> getEQModule() const noexcept { return m_eqModule; }
    [[nodiscard]] std::shared_ptr<AudioEngine::SurgicalEQModule> getTargetEQModule() const noexcept { return m_targetEQModule; }
    [[nodiscard]] std::shared_ptr<Controller::TrainingSessionManager> getSessionManager() const noexcept { return m_session; }
    [[nodiscard]] Common::RingBuffer<float>& getSpectrumFifo() noexcept { return m_spectrumFifo; }

private:
    std::shared_ptr<AudioEngine::AudioGraphRouter> m_router;
    std::shared_ptr<AudioEngine::SurgicalEQModule> m_eqModule;
    std::shared_ptr<AudioEngine::SurgicalEQModule> m_targetEQModule;
    std::shared_ptr<Controller::TrainingSessionManager> m_session;

    Common::RingBuffer<float> m_spectrumFifo{8192};

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(EarTrainingAudioProcessor)
};

} // namespace EarTraining::JuceBridge
