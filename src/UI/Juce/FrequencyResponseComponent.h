#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_dsp/juce_dsp.h>
#include "AudioEngine/Modules/SurgicalEQ/SurgicalEQModule.h"
#include "Common/RingBuffer.h"
#include <functional>
#include <vector>
#include <array>

namespace EarTraining::UI {

/**
 * @brief Professional Interactive Frequency Response Spectrum Component.
 * 
 * Features:
 * - Real-time 2048-point FFT Spectrum Analyzer (RTA) with Hann windowing and ballistics decay.
 * - Minimum Phase (IIR) vs Linear Phase (FIR) Magnitude Response with neon cyan glow.
 * - Group Delay $\tau_g(\omega)$ curve with toggleable badge & secondary amber right axis.
 * - Filter $Q$ Bandwidth illuminated shading (-3 dB lower/upper cutoff region).
 * - Draggable Filter Node (Drag = Freq/Gain, Mouse Wheel = Q, Double Click = 0 dB Reset).
 * - Interactive Crosshair Cursor with live Hz/dB measurement badge.
 * - Acoustic Frequency Bands Header (Sub, Bass, Low-Mid, Mid, High-Mid, Air).
 * - Ear Training Ghost Target comparison curve overlay.
 */
class FrequencyResponseComponent : public juce::Component {
public:
    FrequencyResponseComponent();
    ~FrequencyResponseComponent() override = default;

    void paint(juce::Graphics& g) override;
    void resized() override;

    // ─── Mouse Interaction ───────────────────────────────────────────────────
    void mouseDown(const juce::MouseEvent& e) override;
    void mouseDrag(const juce::MouseEvent& e) override;
    void mouseUp(const juce::MouseEvent& e) override;
    void mouseMove(const juce::MouseEvent& e) override;
    void mouseExit(const juce::MouseEvent& e) override;
    void mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) override;
    void mouseDoubleClick(const juce::MouseEvent& e) override;

    // ─── DSP Curve Synchronization ───────────────────────────────────────────
    void updateCurves(const AudioEngine::SurgicalEQModule& eq);
    void setNodeParameters(double freqHz, double gainDb, double qFactor);

    // ─── Real-Time FFT Spectrum Analyzer Ingestion ───────────────────────────
    void pushAudioDataForSpectrum(Common::RingBuffer<float>& ringBuffer, double sampleRate = 48000.0);

    // ─── Ear Training Ghost Target Curve ─────────────────────────────────────
    void setGhostTarget(double freqHz, double gainDb, double qFactor, bool visible);

    // ─── Callbacks ───────────────────────────────────────────────────────────
    std::function<void(double freqHz, double gainDb)> onNodeMoved;
    std::function<void(double newQ)> onQChanged;

private:
    [[nodiscard]] float freqToX(double freqHz) const noexcept;
    [[nodiscard]] double xToFreq(float x) const noexcept;
    [[nodiscard]] float gainToY(double gainDb) const noexcept;
    [[nodiscard]] double yToGain(float y) const noexcept;
    [[nodiscard]] float groupDelayToY(double gdMs) const noexcept;

    void processNextSpectrumBlock(double sampleRate);

    static constexpr double MIN_FREQ = 20.0;
    static constexpr double MAX_FREQ = 20000.0;
    static constexpr double MIN_DB = -24.0;
    static constexpr double MAX_DB = 24.0;
    static constexpr double MAX_GROUP_DELAY_MS = 5.0;
    static constexpr int NUM_PLOT_POINTS = 300;

    // Filter Node State
    double m_currentFreq{1000.0};
    double m_currentGainDb{0.0};
    double m_currentQ{1.414};
    AudioEngine::EQPhaseMode m_phaseMode{AudioEngine::EQPhaseMode::MinimumPhase_IIR};

    // Ghost Target State (for Ear Training evaluation)
    bool m_showGhostTarget{false};
    double m_ghostFreq{1000.0};
    double m_ghostGainDb{0.0};
    double m_ghostQ{1.414};
    juce::Path m_ghostTargetPath;

    // DSP Curves
    juce::Path m_magnitudePath;
    juce::Path m_groupDelayPath;

    // Viewport Bounds
    juce::Rectangle<float> m_headerBounds;
    juce::Rectangle<float> m_plotBounds;

    // Interactive Badges / Buttons (in top-right)
    juce::Rectangle<float> m_badgeGroupDelay;
    juce::Rectangle<float> m_badgeRTA;
    bool m_showGroupDelay{true};
    bool m_showRTA{true};

    // Mouse Tracking & Crosshair
    bool m_isDraggingNode{false};
    bool m_isHoveringPlot{false};
    juce::Point<float> m_mousePos;

    // ─── Real-Time FFT Analyzer Engine ───────────────────────────────────────
    static constexpr int FFT_ORDER = 11; // 2048 points
    static constexpr int FFT_SIZE = 1 << FFT_ORDER;

    juce::dsp::FFT m_fft{FFT_ORDER};
    juce::dsp::WindowingFunction<float> m_window{FFT_SIZE, juce::dsp::WindowingFunction<float>::hann};

    std::array<float, FFT_SIZE> m_fifoBuffer{};
    int m_fifoIndex{0};

    std::array<float, FFT_SIZE * 2> m_fftData{};
    std::vector<float> m_spectrumScopeData; // smoothed magnitudes for rendering
};

} // namespace EarTraining::UI
