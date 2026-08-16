#include "JuceBridge/EarTrainingAudioProcessor.h"
#include "UI/Juce/SurgicalEQEditorView.h"

namespace EarTraining::JuceBridge {

EarTrainingAudioProcessor::EarTrainingAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
    
    m_router = std::make_shared<AudioEngine::AudioGraphRouter>();
    m_eqModule = std::make_shared<AudioEngine::SurgicalEQModule>();
    m_targetEQModule = std::make_shared<AudioEngine::SurgicalEQModule>();
    m_session = std::make_shared<Controller::TrainingSessionManager>(m_router, m_targetEQModule);

    m_router->setActiveModule(m_eqModule);
    m_router->setTargetModule(m_targetEQModule);
    m_router->setAudioSource(AudioEngine::AudioSourceType::ExternalFileStream);
    m_router->getAudioFileReader().stop();
}

void EarTrainingAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    const uint32_t numOutChannels = static_cast<uint32_t>(getTotalNumOutputChannels());
    const AudioEngine::AudioContext ctx{
        sampleRate,
        static_cast<uint32_t>(samplesPerBlock),
        numOutChannels > 0 ? numOutChannels : 2
    };

    m_router->prepare(ctx);
    m_eqModule->prepare(ctx);
    m_targetEQModule->prepare(ctx);
    m_router->reset();
    m_spectrumFifo.reset();
}

void EarTrainingAudioProcessor::releaseResources() {
    m_router->reset();
}

bool EarTrainingAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    if (!layouts.getMainInputChannelSet().isDisabled()
        && layouts.getMainInputChannelSet() != layouts.getMainOutputChannelSet()) {
        return false;
    }

    return true;
}

void EarTrainingAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, 
                                            [[maybe_unused]] juce::MidiBuffer& midiMessages) {
    juce::ScopedNoDenormals noDenormals;

    const uint32_t numChannels = static_cast<uint32_t>(buffer.getNumChannels());
    const uint32_t numSamples = static_cast<uint32_t>(buffer.getNumSamples());

    if (numChannels == 0 || numSamples == 0) {
        return;
    }

    // Direct pointer extraction - 0 allocations, 0 locks
    float* const* channelData = buffer.getArrayOfWritePointers();
    const float* const* readData = buffer.getArrayOfReadPointers();
    m_router->processCallback(const_cast<float**>(channelData), numChannels, numSamples, readData);

    // Push output audio into lock-free spectrum FIFO for real-time RTA visualization
    const float* left = buffer.getReadPointer(0);
    const float* right = (numChannels > 1) ? buffer.getReadPointer(1) : left;
    for (uint32_t s = 0; s < numSamples; ++s) {
        m_spectrumFifo.push(0.5f * (left[s] + right[s]));
    }
}

juce::AudioProcessorEditor* EarTrainingAudioProcessor::createEditor() {
    return new UI::SurgicalEQEditorView(*this);
}

void EarTrainingAudioProcessor::getStateInformation([[maybe_unused]] juce::MemoryBlock& destData) {
    // State persistence can be added if needed
}

void EarTrainingAudioProcessor::setStateInformation([[maybe_unused]] const void* data, 
                                                   [[maybe_unused]] int sizeInBytes) {
    // State restoration can be added if needed
}

} // namespace EarTraining::JuceBridge

// ─── JUCE Plugin Entry Point ─────────────────────────────────────────────────
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
    return new EarTraining::JuceBridge::EarTrainingAudioProcessor();
}
