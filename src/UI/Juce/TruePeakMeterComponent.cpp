#include "UI/Juce/TruePeakMeterComponent.h"
#include "UI/Juce/TechnologicalLookAndFeel.h"
#include <algorithm>

namespace EarTraining::UI {

TruePeakMeterComponent::TruePeakMeterComponent() {}

void TruePeakMeterComponent::resized() {}

float TruePeakMeterComponent::dbToY(float db, const juce::Rectangle<float>& barBounds) const noexcept {
    const float clamped = std::clamp(db, MIN_DB, MAX_DB);
    const float norm = (clamped - MIN_DB) / (MAX_DB - MIN_DB);
    return barBounds.getBottom() - norm * barBounds.getHeight();
}

void TruePeakMeterComponent::setLevels(float leftDbTP, float rightDbTP) {
    m_leftDbTP = leftDbTP;
    m_rightDbTP = rightDbTP;

    // Decay peak hold
    m_leftPeakHoldDbTP = std::max(leftDbTP, m_leftPeakHoldDbTP - 0.25f);
    m_rightPeakHoldDbTP = std::max(rightDbTP, m_rightPeakHoldDbTP - 0.25f);

    repaint();
}

void TruePeakMeterComponent::paint(juce::Graphics& g) {
    auto bounds = getLocalBounds().toFloat();

    // Background container
    g.setColour(TechnologicalLookAndFeel::SurfacePanel);
    g.fillRoundedRectangle(bounds, 4.0f);
    g.setColour(TechnologicalLookAndFeel::BorderSubtle);
    g.drawRoundedRectangle(bounds, 4.0f, 1.0f);

    // Title label
    g.setFont(juce::FontOptions(10.0f));
    g.setColour(TechnologicalLookAndFeel::TextSecondary);
    g.drawText("TRUE PEAK (4x)", bounds.removeFromTop(16.0f), juce::Justification::centred);

    auto meterArea = bounds.removeFromTop(bounds.getHeight() - 20.0f).reduced(8.0f, 2.0f);
    const float barWidth = (meterArea.getWidth() - 6.0f) * 0.5f;

    const auto leftBarBounds = juce::Rectangle<float>(meterArea.getX(), meterArea.getY(), barWidth, meterArea.getHeight());
    const auto rightBarBounds = juce::Rectangle<float>(meterArea.getX() + barWidth + 6.0f, meterArea.getY(), barWidth, meterArea.getHeight());

    // Draw Bar Backgrounds
    g.setColour(TechnologicalLookAndFeel::BackgroundDark);
    g.fillRoundedRectangle(leftBarBounds, 2.0f);
    g.fillRoundedRectangle(rightBarBounds, 2.0f);

    // Helper lambda to draw vertical meter fill
    auto drawChannelFill = [&](const juce::Rectangle<float>& bar, float levelDb, float holdDb) {
        const float fillY = dbToY(levelDb, bar);
        const float fillHeight = bar.getBottom() - fillY;

        if (fillHeight > 0.0f) {
            juce::ColourGradient grad(TechnologicalLookAndFeel::AccentCyan, bar.getX(), bar.getBottom(),
                                      TechnologicalLookAndFeel::AccentAmber, bar.getX(), dbToY(-1.0f, bar), false);
            grad.addColour(0.9f, TechnologicalLookAndFeel::AccentCrimson);

            g.setGradientFill(grad);
            g.fillRoundedRectangle(bar.getX(), fillY, bar.getWidth(), fillHeight, 2.0f);
        }

        // Peak Hold Line
        const float holdY = dbToY(holdDb, bar);
        g.setColour(holdDb > 0.0f ? TechnologicalLookAndFeel::AccentCrimson : TechnologicalLookAndFeel::TextPrimary);
        g.drawHorizontalLine(static_cast<int>(holdY), bar.getX(), bar.getRight());
    };

    drawChannelFill(leftBarBounds, m_leftDbTP, m_leftPeakHoldDbTP);
    drawChannelFill(rightBarBounds, m_rightDbTP, m_rightPeakHoldDbTP);

    // 0 dBTP threshold line
    const float zeroY = dbToY(0.0f, leftBarBounds);
    g.setColour(TechnologicalLookAndFeel::AccentCrimson.withAlpha(0.6f));
    g.drawHorizontalLine(static_cast<int>(zeroY), leftBarBounds.getX() - 2.0f, rightBarBounds.getRight() + 2.0f);

    // Bottom Numerical Readouts
    auto readoutArea = getLocalBounds().removeFromBottom(20);
    g.setFont(juce::FontOptions(10.0f));
    g.setColour(m_leftDbTP > 0.0f ? TechnologicalLookAndFeel::AccentCrimson : TechnologicalLookAndFeel::TextPrimary);
    g.drawText("L: " + juce::String(m_leftDbTP, 1), readoutArea.removeFromLeft(readoutArea.getWidth() / 2), juce::Justification::centred);
    g.setColour(m_rightDbTP > 0.0f ? TechnologicalLookAndFeel::AccentCrimson : TechnologicalLookAndFeel::TextPrimary);
    g.drawText("R: " + juce::String(m_rightDbTP, 1), readoutArea, juce::Justification::centred);
}

} // namespace EarTraining::UI
