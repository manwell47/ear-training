#include "UI/Juce/FrequencyResponseComponent.h"
#include "UI/Juce/TechnologicalLookAndFeel.h"
#include <cmath>
#include <algorithm>

namespace EarTraining::UI {

FrequencyResponseComponent::FrequencyResponseComponent() {
    setRepaintsOnMouseActivity(true);
    m_spectrumScopeData.resize(NUM_PLOT_POINTS, 0.0f);
}

void FrequencyResponseComponent::resized() {
    auto bounds = getLocalBounds().toFloat().reduced(4.0f);
    
    // Top acoustic bands header bar (18px high)
    m_headerBounds = bounds.removeFromTop(18.0f);
    bounds.removeFromTop(2.0f);
    
    // Main plot bounds
    m_plotBounds = bounds;

    // Badges in top-right corner of the plot
    const float badgeW = 54.0f;
    const float badgeH = 16.0f;
    m_badgeRTA = juce::Rectangle<float>(m_plotBounds.getRight() - badgeW - 6.0f, m_plotBounds.getY() + 6.0f, badgeW, badgeH);
    m_badgeGroupDelay = juce::Rectangle<float>(m_badgeRTA.getX() - badgeW - 6.0f, m_plotBounds.getY() + 6.0f, badgeW, badgeH);
}

float FrequencyResponseComponent::freqToX(double freqHz) const noexcept {
    const double clampedFreq = std::clamp(freqHz, MIN_FREQ, MAX_FREQ);
    const double logMin = std::log10(MIN_FREQ);
    const double logMax = std::log10(MAX_FREQ);
    const double norm = (std::log10(clampedFreq) - logMin) / (logMax - logMin);
    return m_plotBounds.getX() + static_cast<float>(norm * m_plotBounds.getWidth());
}

double FrequencyResponseComponent::xToFreq(float x) const noexcept {
    const double norm = std::clamp(static_cast<double>(x - m_plotBounds.getX()) / m_plotBounds.getWidth(), 0.0, 1.0);
    const double logMin = std::log10(MIN_FREQ);
    const double logMax = std::log10(MAX_FREQ);
    return std::pow(10.0, logMin + norm * (logMax - logMin));
}

float FrequencyResponseComponent::gainToY(double gainDb) const noexcept {
    const double clampedGain = std::clamp(gainDb, MIN_DB, MAX_DB);
    const double norm = (clampedGain - MIN_DB) / (MAX_DB - MIN_DB);
    // Invert Y axis: MAX_DB is top (y = 0), MIN_DB is bottom (y = height)
    return m_plotBounds.getBottom() - static_cast<float>(norm * m_plotBounds.getHeight());
}

double FrequencyResponseComponent::yToGain(float y) const noexcept {
    const double norm = std::clamp(static_cast<double>(m_plotBounds.getBottom() - y) / m_plotBounds.getHeight(), 0.0, 1.0);
    return MIN_DB + norm * (MAX_DB - MIN_DB);
}

float FrequencyResponseComponent::groupDelayToY(double gdMs) const noexcept {
    const double clampedGd = std::clamp(gdMs, 0.0, MAX_GROUP_DELAY_MS);
    const double norm = clampedGd / MAX_GROUP_DELAY_MS;
    // Map to bottom 60% of the plot bounds
    const float gdHeight = m_plotBounds.getHeight() * 0.55f;
    return m_plotBounds.getBottom() - static_cast<float>(norm * gdHeight);
}

void FrequencyResponseComponent::setNodeParameters(double freqHz, double gainDb, double qFactor) {
    m_currentFreq = freqHz;
    m_currentGainDb = gainDb;
    m_currentQ = qFactor;
    repaint();
}

void FrequencyResponseComponent::setGhostTarget(double freqHz, double gainDb, double qFactor, bool visible) {
    m_ghostFreq = freqHz;
    m_ghostGainDb = gainDb;
    m_ghostQ = qFactor;
    m_showGhostTarget = visible;
    repaint();
}

void FrequencyResponseComponent::updateCurves(const AudioEngine::SurgicalEQModule& eq) {
    m_currentFreq = eq.getFrequency();
    m_currentGainDb = eq.getGainDb();
    m_currentQ = eq.getQ();
    m_phaseMode = eq.getPhaseMode();

    m_magnitudePath.clear();
    m_groupDelayPath.clear();
    m_ghostTargetPath.clear();

    if (m_plotBounds.getWidth() <= 0.0f || m_plotBounds.getHeight() <= 0.0f) {
        return;
    }

    const double logMin = std::log10(MIN_FREQ);
    const double logMax = std::log10(MAX_FREQ);

    for (int i = 0; i < NUM_PLOT_POINTS; ++i) {
        const double norm = static_cast<double>(i) / (NUM_PLOT_POINTS - 1);
        const double freq = std::pow(10.0, logMin + norm * (logMax - logMin));
        const float x = m_plotBounds.getX() + static_cast<float>(norm * m_plotBounds.getWidth());

        // 1. Magnitude Path
        const double magDb = eq.getMagnitudeDbAt(freq);
        const float magY = gainToY(magDb);

        if (i == 0) {
            m_magnitudePath.startNewSubPath(x, magY);
        } else {
            m_magnitudePath.lineTo(x, magY);
        }

        // 2. Group Delay Path
        const double gdMs = eq.getGroupDelayMsAt(freq);
        const float gdY = groupDelayToY(gdMs);

        if (i == 0) {
            m_groupDelayPath.startNewSubPath(x, gdY);
        } else {
            m_groupDelayPath.lineTo(x, gdY);
        }

        // 3. Ghost Target Curve Path (if active)
        if (m_showGhostTarget) {
            // Compute ideal peaking filter response for ghost target
            const double w0 = 2.0 * 3.141592653589793 * m_ghostFreq / 48000.0;
            const double w = 2.0 * 3.141592653589793 * freq / 48000.0;
            const double A = std::pow(10.0, m_ghostGainDb / 40.0);
            const double alpha = std::sin(w0) / (2.0 * std::max(0.1, m_ghostQ));

            const double b0 = 1.0 + alpha * A;
            const double b1 = -2.0 * std::cos(w0);
            const double b2 = 1.0 - alpha * A;
            const double a0 = 1.0 + alpha / A;
            const double a1 = -2.0 * std::cos(w0);
            const double a2 = 1.0 - alpha / A;

            const double phi = w;
            const double cos1 = std::cos(phi);
            const double cos2 = std::cos(2.0 * phi);
            const double sin1 = std::sin(phi);
            const double sin2 = std::sin(2.0 * phi);

            const double numRe = (b0 / a0) + (b1 / a0) * cos1 + (b2 / a0) * cos2;
            const double numIm = -(b1 / a0) * sin1 - (b2 / a0) * sin2;
            const double denRe = 1.0 + (a1 / a0) * cos1 + (a2 / a0) * cos2;
            const double denIm = -(a1 / a0) * sin1 - (a2 / a0) * sin2;

            const double numMagSq = numRe * numRe + numIm * numIm;
            const double denMagSq = denRe * denRe + denIm * denIm;
            const double ghostMagDb = 10.0 * std::log10(std::max(1e-12, numMagSq / std::max(1e-12, denMagSq)));
            const float ghostY = gainToY(ghostMagDb);

            if (i == 0) {
                m_ghostTargetPath.startNewSubPath(x, ghostY);
            } else {
                m_ghostTargetPath.lineTo(x, ghostY);
            }
        }
    }

    repaint();
}

void FrequencyResponseComponent::processNextSpectrumBlock(double sampleRate) {
    std::copy(m_fifoBuffer.begin(), m_fifoBuffer.end(), m_fftData.begin());
    std::fill(m_fftData.begin() + FFT_SIZE, m_fftData.end(), 0.0f);

    m_window.multiplyWithWindowingTable(m_fftData.data(), FFT_SIZE);
    m_fft.performFrequencyOnlyForwardTransform(m_fftData.data());

    const double logMin = std::log10(MIN_FREQ);
    const double logMax = std::log10(MAX_FREQ);

    for (int i = 0; i < NUM_PLOT_POINTS; ++i) {
        const double norm = static_cast<double>(i) / (NUM_PLOT_POINTS - 1);
        const double freq = std::pow(10.0, logMin + norm * (logMax - logMin));
        
        const auto binIndex = static_cast<size_t>(std::clamp(freq * static_cast<double>(FFT_SIZE) / sampleRate, 0.0, static_cast<double>(FFT_SIZE / 2 - 1)));
        const float magnitude = m_fftData[binIndex] / static_cast<float>(FFT_SIZE);
        
        // Convert to normalized spectrum height (-72 dB floor to 0 dB peak)
        const float db = (magnitude > 1e-5f) ? 20.0f * std::log10(magnitude) : -72.0f;
        const float normHeight = std::clamp((db + 72.0f) / 72.0f, 0.0f, 1.0f);

        // Smooth decay ballistics (fast attack, smooth release)
        if (normHeight > m_spectrumScopeData[static_cast<size_t>(i)]) {
            m_spectrumScopeData[static_cast<size_t>(i)] = normHeight;
        } else {
            m_spectrumScopeData[static_cast<size_t>(i)] = m_spectrumScopeData[static_cast<size_t>(i)] * 0.88f + normHeight * 0.12f;
        }
    }
}

void FrequencyResponseComponent::pushAudioDataForSpectrum(Common::RingBuffer<float>& ringBuffer, double sampleRate) {
    if (!m_showRTA) return;
    
    float sample = 0.0f;
    bool hasProcessed = false;
    while (ringBuffer.pop(sample)) {
        m_fifoBuffer[static_cast<size_t>(m_fifoIndex++)] = sample;
        if (m_fifoIndex >= FFT_SIZE) {
            processNextSpectrumBlock(sampleRate);
            m_fifoIndex = 0;
            hasProcessed = true;
        }
    }

    if (hasProcessed) {
        repaint();
    }
}

void FrequencyResponseComponent::paint(juce::Graphics& g) {
    // 1. Background Surface
    g.setColour(TechnologicalLookAndFeel::SurfacePanel);
    g.fillRoundedRectangle(getLocalBounds().toFloat(), 6.0f);
    g.setColour(TechnologicalLookAndFeel::BorderSubtle);
    g.drawRoundedRectangle(getLocalBounds().toFloat(), 6.0f, 1.0f);

    // ─── 2. Acoustic Frequency Bands Header Bar ──────────────────────────────
    if (!m_headerBounds.isEmpty()) {
        struct BandInfo {
            const char* name;
            double fStart;
            double fEnd;
        };
        static const BandInfo bands[] = {
            { "SUB (20-60)", 20.0, 60.0 },
            { "BASS (60-250)", 60.0, 250.0 },
            { "LOW-MID (250-500)", 250.0, 500.0 },
            { "MID (500-2k)", 500.0, 2000.0 },
            { "HIGH-MID (2k-6k)", 2000.0, 6000.0 },
            { "AIR (6k-20k)", 6000.0, 20000.0 }
        };

        g.setFont(juce::FontOptions(9.5f));

        for (size_t b = 0; b < 6; ++b) {
            const float x1 = freqToX(bands[b].fStart);
            const float x2 = freqToX(bands[b].fEnd);
            const auto bandRect = juce::Rectangle<float>(x1, m_headerBounds.getY(), x2 - x1, m_headerBounds.getHeight());

            // Alternating subtle tint
            g.setColour(b % 2 == 0 ? TechnologicalLookAndFeel::SurfaceElevated.withAlpha(0.6f) 
                                   : TechnologicalLookAndFeel::SurfacePanel.withAlpha(0.8f));
            g.fillRect(bandRect);

            // Divider line
            g.setColour(TechnologicalLookAndFeel::BorderSubtle.withAlpha(0.7f));
            g.drawVerticalLine(static_cast<int>(x2), m_headerBounds.getY(), m_headerBounds.getBottom());

            // Label
            g.setColour(TechnologicalLookAndFeel::TextSecondary);
            g.drawFittedText(bands[b].name, bandRect.toNearestInt(), juce::Justification::centred, 1);
        }

        g.setColour(TechnologicalLookAndFeel::BorderSubtle);
        g.drawHorizontalLine(static_cast<int>(m_headerBounds.getBottom()), m_plotBounds.getX(), m_plotBounds.getRight());
    }

    // ─── 3. Grid Lines & Frequency Axis Labels ───────────────────────────────
    static const double freqLines[] = { 50.0, 100.0, 200.0, 500.0, 1000.0, 2000.0, 5000.0, 10000.0 };
    g.setFont(juce::FontOptions(10.0f));

    for (double f : freqLines) {
        const float x = freqToX(f);
        g.setColour(TechnologicalLookAndFeel::BorderSubtle.withAlpha(0.45f));
        g.drawVerticalLine(static_cast<int>(x), m_plotBounds.getY(), m_plotBounds.getBottom());

        g.setColour(TechnologicalLookAndFeel::TextSecondary);
        juce::String labelStr = (f >= 1000.0) ? juce::String(static_cast<int>(f / 1000.0)) + "k" : juce::String(static_cast<int>(f));
        g.drawText(labelStr, static_cast<int>(x - 15), static_cast<int>(m_plotBounds.getBottom() - 14), 30, 12, juce::Justification::centred);
    }

    // ─── 4. Horizontal dB Grid Lines ─────────────────────────────────────────
    static const double dbLines[] = { 18.0, 12.0, 6.0, 0.0, -6.0, -12.0, -18.0 };
    for (double db : dbLines) {
        const float y = gainToY(db);
        g.setColour(db == 0.0 ? TechnologicalLookAndFeel::BorderSubtle.brighter(0.4f) : TechnologicalLookAndFeel::BorderSubtle.withAlpha(0.35f));
        g.drawHorizontalLine(static_cast<int>(y), m_plotBounds.getX(), m_plotBounds.getRight());

        g.setColour(TechnologicalLookAndFeel::TextSecondary);
        juce::String dbStr = (db > 0 ? "+" : "") + juce::String(static_cast<int>(db)) + " dB";
        g.drawText(dbStr, static_cast<int>(m_plotBounds.getX() + 4), static_cast<int>(y - 12), 45, 12, juce::Justification::left);
    }

    // ─── 5. Secondary Right Axis: Group Delay (ms) Scale ─────────────────────
    if (m_showGroupDelay) {
        static const double gdTicks[] = { 5.0, 2.5, 0.0 };
        for (double gd : gdTicks) {
            const float y = groupDelayToY(gd);
            g.setColour(TechnologicalLookAndFeel::AccentAmber.withAlpha(0.7f));
            juce::String gdStr = juce::String(gd, 1) + " ms";
            g.drawText(gdStr, static_cast<int>(m_plotBounds.getRight() - 50), static_cast<int>(y - 12), 46, 12, juce::Justification::right);
        }
    }

    // ─── 6. Real-Time RTA Spectrum Scope Fill ────────────────────────────────
    if (m_showRTA && !m_spectrumScopeData.empty()) {
        juce::Path rtaPath;
        const float bottomY = m_plotBounds.getBottom();

        for (size_t i = 0; i < m_spectrumScopeData.size(); ++i) {
            const double norm = static_cast<double>(i) / (m_spectrumScopeData.size() - 1);
            const float x = m_plotBounds.getX() + static_cast<float>(norm * m_plotBounds.getWidth());
            const float val = m_spectrumScopeData[i];
            const float y = bottomY - val * (m_plotBounds.getHeight() * 0.75f);

            if (i == 0) {
                rtaPath.startNewSubPath(x, y);
            } else {
                rtaPath.lineTo(x, y);
            }
        }

        if (!rtaPath.isEmpty()) {
            juce::Path rtaFill = rtaPath;
            rtaFill.lineTo(m_plotBounds.getRight(), bottomY);
            rtaFill.lineTo(m_plotBounds.getX(), bottomY);
            rtaFill.closeSubPath();

            juce::ColourGradient rtaGrad(TechnologicalLookAndFeel::AccentCyan.withAlpha(0.18f), m_plotBounds.getX(), m_plotBounds.getY(),
                                         TechnologicalLookAndFeel::SurfaceElevated.withAlpha(0.02f), m_plotBounds.getX(), bottomY, false);
            g.setGradientFill(rtaGrad);
            g.fillPath(rtaFill);

            g.setColour(TechnologicalLookAndFeel::AccentCyan.withAlpha(0.35f));
            g.strokePath(rtaPath, juce::PathStrokeType(1.0f));
        }
    }

    // ─── 7. Bandwidth / Q-Factor Shading ─────────────────────────────────────
    if (std::abs(m_currentGainDb) > 0.2) {
        // Calculate lower and upper -3 dB cutoff frequencies
        const double q = std::max(0.1, m_currentQ);
        const double term = std::sqrt(1.0 + 1.0 / (4.0 * q * q));
        const double fLow = m_currentFreq * (term - 1.0 / (2.0 * q));
        const double fHigh = m_currentFreq * (term + 1.0 / (2.0 * q));

        const float xLow = freqToX(fLow);
        const float xHigh = freqToX(fHigh);

        if (xHigh > xLow) {
            const auto bwRect = juce::Rectangle<float>(xLow, m_plotBounds.getY(), xHigh - xLow, m_plotBounds.getHeight());
            juce::Colour bwCol = (m_currentGainDb > 0.0 ? TechnologicalLookAndFeel::AccentCyan : TechnologicalLookAndFeel::AccentCrimson);
            g.setColour(bwCol.withAlpha(0.06f));
            g.fillRect(bwRect);

            g.setColour(bwCol.withAlpha(0.25f));
            g.drawVerticalLine(static_cast<int>(xLow), m_plotBounds.getY(), m_plotBounds.getBottom());
            g.drawVerticalLine(static_cast<int>(xHigh), m_plotBounds.getY(), m_plotBounds.getBottom());

            // Bandwidth label
            g.setFont(juce::FontOptions(9.0f));
            g.setColour(TechnologicalLookAndFeel::TextSecondary);
            juce::String bwText = "BW: " + juce::String(static_cast<int>(fHigh - fLow)) + " Hz";
            g.drawText(bwText, static_cast<int>(xLow), static_cast<int>(m_plotBounds.getY() + 4), static_cast<int>(xHigh - xLow), 12, juce::Justification::centred);
        }
    }

    // ─── 8. Ghost Target Curve (Ear Training Mode) ───────────────────────────
    if (m_showGhostTarget && !m_ghostTargetPath.isEmpty()) {
        g.setColour(TechnologicalLookAndFeel::AccentAmber.withAlpha(0.9f));
        float dashes[] = { 4.0f, 4.0f };
        juce::Path dashedGhostPath;
        juce::PathStrokeType(2.0f).createDashedStroke(dashedGhostPath, m_ghostTargetPath, dashes, 2);
        g.strokePath(dashedGhostPath, juce::PathStrokeType(2.0f));

        const float ghostNodeX = freqToX(m_ghostFreq);
        const float ghostNodeY = gainToY(m_ghostGainDb);

        g.setColour(TechnologicalLookAndFeel::AccentAmber);
        g.drawEllipse(ghostNodeX - 5.0f, ghostNodeY - 5.0f, 10.0f, 10.0f, 2.0f);

        g.setFont(juce::FontOptions(10.0f));
        g.setColour(TechnologicalLookAndFeel::AccentAmber);
        juce::String gText = "Target: " + juce::String(static_cast<int>(m_ghostFreq)) + " Hz (" 
                           + (m_ghostGainDb >= 0 ? "+" : "") + juce::String(m_ghostGainDb, 1) + " dB)";
        g.drawText(gText, static_cast<int>(ghostNodeX - 60), static_cast<int>(ghostNodeY + 8), 120, 14, juce::Justification::centred);
    }

    // ─── 9. Magnitude Curve Stroke & Glow Fill (Neon Cyan) ───────────────────
    if (!m_magnitudePath.isEmpty()) {
        juce::Path fillPath = m_magnitudePath;
        fillPath.lineTo(m_plotBounds.getRight(), gainToY(0.0));
        fillPath.lineTo(m_plotBounds.getX(), gainToY(0.0));
        fillPath.closeSubPath();

        g.setColour(TechnologicalLookAndFeel::AccentCyan.withAlpha(0.12f));
        g.fillPath(fillPath);

        g.setColour(TechnologicalLookAndFeel::AccentCyan);
        g.strokePath(m_magnitudePath, juce::PathStrokeType(2.5f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }

    // ─── 10. Group Delay Curve (Amber Trace) ─────────────────────────────────
    if (m_showGroupDelay && !m_groupDelayPath.isEmpty()) {
        g.setColour(TechnologicalLookAndFeel::AccentAmber.withAlpha(0.85f));
        g.strokePath(m_groupDelayPath, juce::PathStrokeType(1.8f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }

    // ─── 11. Crosshair Hover Guides ──────────────────────────────────────────
    if (m_isHoveringPlot && m_plotBounds.contains(m_mousePos) && !m_isDraggingNode) {
        g.setColour(TechnologicalLookAndFeel::BorderSubtle.withAlpha(0.6f));
        g.drawVerticalLine(static_cast<int>(m_mousePos.x), m_plotBounds.getY(), m_plotBounds.getBottom());
        g.drawHorizontalLine(static_cast<int>(m_mousePos.y), m_plotBounds.getX(), m_plotBounds.getRight());

        // Hover coordinate tooltip badge
        const double hoverFreq = xToFreq(m_mousePos.x);
        const double hoverGain = yToGain(m_mousePos.y);

        g.setColour(TechnologicalLookAndFeel::SurfaceElevated);
        g.fillRoundedRectangle(m_mousePos.x + 8.0f, m_mousePos.y - 20.0f, 95.0f, 16.0f, 3.0f);
        g.setColour(TechnologicalLookAndFeel::BorderSubtle);
        g.drawRoundedRectangle(m_mousePos.x + 8.0f, m_mousePos.y - 20.0f, 95.0f, 16.0f, 3.0f, 1.0f);

        g.setFont(juce::FontOptions(9.5f));
        g.setColour(TechnologicalLookAndFeel::TextPrimary);
        juce::String tipStr = juce::String(static_cast<int>(hoverFreq)) + " Hz | " 
                            + (hoverGain >= 0 ? "+" : "") + juce::String(hoverGain, 1) + " dB";
        g.drawText(tipStr, static_cast<int>(m_mousePos.x + 8.0f), static_cast<int>(m_mousePos.y - 20.0f), 95, 16, juce::Justification::centred);
    }

    // ─── 12. Interactive Filter Control Node ─────────────────────────────────
    const float nodeX = freqToX(m_currentFreq);
    const float nodeY = gainToY(m_currentGainDb);
    constexpr float nodeRadius = 7.5f;

    // Glowing Halo
    g.setColour(TechnologicalLookAndFeel::AccentCyan.withAlpha(m_isDraggingNode ? 0.45f : 0.2f));
    g.fillEllipse(nodeX - nodeRadius * 2.0f, nodeY - nodeRadius * 2.0f, nodeRadius * 4.0f, nodeRadius * 4.0f);

    // Solid Node Center
    g.setColour(TechnologicalLookAndFeel::TextPrimary);
    g.fillEllipse(nodeX - nodeRadius, nodeY - nodeRadius, nodeRadius * 2.0f, nodeRadius * 2.0f);
    g.setColour(TechnologicalLookAndFeel::AccentCyan);
    g.drawEllipse(nodeX - nodeRadius, nodeY - nodeRadius, nodeRadius * 2.0f, nodeRadius * 2.0f, 2.5f);

    // Readout Badge near Node
    g.setFont(juce::FontOptions(11.0f));
    g.setColour(TechnologicalLookAndFeel::TextPrimary);
    juce::String nodeText = juce::String(static_cast<int>(m_currentFreq)) + " Hz | " 
                          + (m_currentGainDb >= 0 ? "+" : "") + juce::String(m_currentGainDb, 1) + " dB | Q=" 
                          + juce::String(m_currentQ, 2);
    g.drawText(nodeText, static_cast<int>(nodeX - 80), static_cast<int>(nodeY - 26), 160, 16, juce::Justification::centred);

    // ─── 13. Interactive Badges in Top Right ─────────────────────────────────
    auto drawBadge = [&](const juce::Rectangle<float>& r, const char* label, bool active, const juce::Colour& activeCol) {
        g.setColour(active ? activeCol.withAlpha(0.2f) : TechnologicalLookAndFeel::SurfaceElevated);
        g.fillRoundedRectangle(r, 3.0f);
        g.setColour(active ? activeCol : TechnologicalLookAndFeel::BorderSubtle);
        g.drawRoundedRectangle(r, 3.0f, 1.0f);

        g.setFont(juce::Font(juce::FontOptions(9.5f)).boldened());
        g.setColour(active ? activeCol : TechnologicalLookAndFeel::TextSecondary);
        g.drawFittedText(label, r.toNearestInt(), juce::Justification::centred, 1);
    };

    drawBadge(m_badgeGroupDelay, m_showGroupDelay ? "GD: ON" : "GD: OFF", m_showGroupDelay, TechnologicalLookAndFeel::AccentAmber);
    drawBadge(m_badgeRTA, m_showRTA ? "RTA: ON" : "RTA: OFF", m_showRTA, TechnologicalLookAndFeel::AccentCyan);
}

void FrequencyResponseComponent::mouseDown(const juce::MouseEvent& e) {
    const auto pos = e.position;

    // Check click on Badges
    if (m_badgeGroupDelay.contains(pos)) {
        m_showGroupDelay = !m_showGroupDelay;
        repaint();
        return;
    }

    if (m_badgeRTA.contains(pos)) {
        m_showRTA = !m_showRTA;
        repaint();
        return;
    }

    // Check click on Node or Plot
    const float nodeX = freqToX(m_currentFreq);
    const float nodeY = gainToY(m_currentGainDb);
    const float dist = std::hypot(pos.x - nodeX, pos.y - nodeY);

    if (dist <= 25.0f || m_plotBounds.contains(pos)) {
        m_isDraggingNode = true;
        mouseDrag(e);
    }
}

void FrequencyResponseComponent::mouseDrag(const juce::MouseEvent& e) {
    if (!m_isDraggingNode) return;

    m_mousePos = e.position;
    const double newFreq = xToFreq(e.position.x);
    const double newGain = yToGain(e.position.y);

    m_currentFreq = newFreq;
    m_currentGainDb = newGain;

    if (onNodeMoved) {
        onNodeMoved(m_currentFreq, m_currentGainDb);
    }

    repaint();
}

void FrequencyResponseComponent::mouseUp([[maybe_unused]] const juce::MouseEvent& e) {
    m_isDraggingNode = false;
    repaint();
}

void FrequencyResponseComponent::mouseMove(const juce::MouseEvent& e) {
    m_mousePos = e.position;
    m_isHoveringPlot = m_plotBounds.contains(e.position);
    repaint();
}

void FrequencyResponseComponent::mouseExit([[maybe_unused]] const juce::MouseEvent& e) {
    m_isHoveringPlot = false;
    repaint();
}

void FrequencyResponseComponent::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) {
    const float nodeX = freqToX(m_currentFreq);
    const float nodeY = gainToY(m_currentGainDb);
    const float dist = std::hypot(e.position.x - nodeX, e.position.y - nodeY);

    if (dist <= 40.0f || m_plotBounds.contains(e.position)) {
        // Smooth logarithmic Q scaling
        const double factor = 1.0 - static_cast<double>(wheel.deltaY) * 0.35;
        m_currentQ = std::clamp(m_currentQ * factor, 0.1, 10.0);

        if (onQChanged) {
            onQChanged(m_currentQ);
        }

        repaint();
    }
}

void FrequencyResponseComponent::mouseDoubleClick(const juce::MouseEvent& e) {
    const float nodeX = freqToX(m_currentFreq);
    const float nodeY = gainToY(m_currentGainDb);
    const float dist = std::hypot(e.position.x - nodeX, e.position.y - nodeY);

    if (dist <= 30.0f || m_plotBounds.contains(e.position)) {
        m_currentGainDb = 0.0;
        if (onNodeMoved) {
            onNodeMoved(m_currentFreq, 0.0);
        }
        repaint();
    }
}

} // namespace EarTraining::UI
