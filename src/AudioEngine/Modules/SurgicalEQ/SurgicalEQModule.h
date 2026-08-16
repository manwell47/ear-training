#pragma once

#include "AudioEngine/Core/AudioProcessorNode.h"
#include "AudioEngine/Modules/SurgicalEQ/BiquadFilter.h"
#include "AudioEngine/Modules/SurgicalEQ/LinearPhaseFIR.h"
#include <atomic>
#include <string_view>

namespace EarTraining::AudioEngine {

enum class EQPhaseMode : uint8_t {
    MinimumPhase_IIR = 0,
    LinearPhase_FIR = 1
};

/**
 * @brief Surgical EQ DSP Module.
 * 
 * Provides ultra-precise parametric equalization with real-time switching between
 * Minimum Phase (IIR) and Linear Phase (FIR) topologies to train acoustic perception
 * of group delay smearing versus pre-ringing artifacts.
 */
class SurgicalEQModule : public AudioProcessorNode {
public:
    SurgicalEQModule();
    ~SurgicalEQModule() override = default;

    void prepare(const AudioContext& context) override;
    void process(Common::AudioBuffer<float>& buffer) override;
    void reset() noexcept override;
    [[nodiscard]] uint32_t getLatencySamples() const noexcept override;
    [[nodiscard]] std::string_view getNodeName() const noexcept override { return "SurgicalEQ"; }

    // Parameter Controls
    void setFilterType(FilterType type) noexcept;
    void setFrequency(double freqHz) noexcept;
    void setGainDb(double gainDb) noexcept;
    void setQ(double qFactor) noexcept;
    void setPhaseMode(EQPhaseMode mode) noexcept;

    [[nodiscard]] FilterType getFilterType() const noexcept { return m_filterType.load(std::memory_order_relaxed); }
    [[nodiscard]] double getFrequency() const noexcept { return m_frequencyHz.load(std::memory_order_relaxed); }
    [[nodiscard]] double getGainDb() const noexcept { return m_gainDb.load(std::memory_order_relaxed); }
    [[nodiscard]] double getQ() const noexcept { return m_qFactor.load(std::memory_order_relaxed); }
    [[nodiscard]] EQPhaseMode getPhaseMode() const noexcept { return m_phaseMode.load(std::memory_order_relaxed); }

    // Analytical curves for UI rendering
    [[nodiscard]] double getMagnitudeDbAt(double freqHz) const noexcept;
    [[nodiscard]] double getPhaseResponseAt(double freqHz) const noexcept;
    [[nodiscard]] double getGroupDelayMsAt(double freqHz) const noexcept;

private:
    void updateEngineParameters() noexcept;

    AudioContext m_context;
    BiquadFilter m_iirFilter;
    LinearPhaseFIR m_firFilter;

    std::atomic<FilterType> m_filterType{FilterType::Bell};
    std::atomic<double> m_frequencyHz{1000.0};
    std::atomic<double> m_gainDb{0.0};
    std::atomic<double> m_qFactor{1.414};
    std::atomic<EQPhaseMode> m_phaseMode{EQPhaseMode::MinimumPhase_IIR};
};

} // namespace EarTraining::AudioEngine
