#include "AudioEngine/Modules/SurgicalEQ/SurgicalEQModule.h"

namespace EarTraining::AudioEngine {

SurgicalEQModule::SurgicalEQModule() {
    updateEngineParameters();
}

void SurgicalEQModule::prepare(const AudioContext& context) {
    m_context = context;
    m_iirFilter.prepare(context);
    m_firFilter.prepare(context);
    updateEngineParameters();
}

void SurgicalEQModule::reset() noexcept {
    m_iirFilter.reset();
    m_firFilter.reset();
}

uint32_t SurgicalEQModule::getLatencySamples() const noexcept {
    if (m_phaseMode.load(std::memory_order_relaxed) == EQPhaseMode::LinearPhase_FIR) {
        return m_firFilter.getLatencySamples();
    }
    return 0;
}

void SurgicalEQModule::setFilterType(FilterType type) noexcept {
    m_filterType.store(type, std::memory_order_relaxed);
    updateEngineParameters();
}

void SurgicalEQModule::setFrequency(double freqHz) noexcept {
    m_frequencyHz.store(freqHz, std::memory_order_relaxed);
    updateEngineParameters();
}

void SurgicalEQModule::setGainDb(double gainDb) noexcept {
    m_gainDb.store(gainDb, std::memory_order_relaxed);
    updateEngineParameters();
}

void SurgicalEQModule::setQ(double qFactor) noexcept {
    m_qFactor.store(qFactor, std::memory_order_relaxed);
    updateEngineParameters();
}

void SurgicalEQModule::setPhaseMode(EQPhaseMode mode) noexcept {
    m_phaseMode.store(mode, std::memory_order_relaxed);
}

void SurgicalEQModule::updateEngineParameters() noexcept {
    const auto type = m_filterType.load(std::memory_order_relaxed);
    const auto freq = m_frequencyHz.load(std::memory_order_relaxed);
    const auto gain = m_gainDb.load(std::memory_order_relaxed);
    const auto q = m_qFactor.load(std::memory_order_relaxed);

    m_iirFilter.setParameters(type, freq, gain, q);
    m_firFilter.setParameters(type, freq, gain, q);
}

void SurgicalEQModule::process(Common::AudioBuffer<float>& buffer) {
    const auto mode = m_phaseMode.load(std::memory_order_relaxed);
    if (mode == EQPhaseMode::LinearPhase_FIR) {
        m_firFilter.process(buffer);
    } else {
        m_iirFilter.process(buffer);
    }
}

double SurgicalEQModule::getMagnitudeDbAt(double freqHz) const noexcept {
    if (m_phaseMode.load(std::memory_order_relaxed) == EQPhaseMode::LinearPhase_FIR) {
        return m_firFilter.getMagnitudeDbAt(freqHz);
    }
    return m_iirFilter.getMagnitudeDbAt(freqHz);
}

double SurgicalEQModule::getPhaseResponseAt(double freqHz) const noexcept {
    if (m_phaseMode.load(std::memory_order_relaxed) == EQPhaseMode::LinearPhase_FIR) {
        return m_firFilter.getPhaseResponseAt(freqHz);
    }
    return m_iirFilter.getPhaseResponseAt(freqHz);
}

double SurgicalEQModule::getGroupDelayMsAt(double freqHz) const noexcept {
    if (m_phaseMode.load(std::memory_order_relaxed) == EQPhaseMode::LinearPhase_FIR) {
        return m_firFilter.getGroupDelayMsAt(freqHz);
    }
    return m_iirFilter.getGroupDelayMsAt(freqHz);
}

} // namespace EarTraining::AudioEngine
