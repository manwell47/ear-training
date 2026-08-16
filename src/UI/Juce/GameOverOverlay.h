#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "UI/Juce/TechnologicalLookAndFeel.h"
#include <functional>
#include <string>

namespace EarTraining::UI {

/**
 * @brief Rich "Game Over" overlay displayed when Signal Integrity reaches zero.
 *
 * Design contract:
 *  - Semi-transparent dark layer covers the entire active area.
 *  - Intercepts ALL mouse input so controls behind it are unreachable.
 *  - Header: "SESSION TERMINATED" in clean sans-serif — no retro tropes.
 *  - Analytics block: Accuracy, Weakest Band, Most Confused Filter.
 *  - "Reboot System" CTA button invokes `onRebootClicked`.
 *
 * Usage:
 * @code
 *   GameOverOverlay::SessionStats stats;
 *   stats.accuracyPercent   = 66.6;
 *   stats.weakestBandName   = "High-Mids: 2kHz - 6kHz";
 *   stats.mostConfusedPair  = "Bell confused with High-Shelf";
 *   m_gameOverOverlay.showWithStats(stats);
 * @endcode
 */
class GameOverOverlay : public juce::Component {
public:
    // ─── Analytics Payload ────────────────────────────────────────────────────

    struct SessionStats {
        double      accuracyPercent  { 0.0 };   ///< e.g. 66.6 → "66.6%"
        int         totalTrials      { 0 };
        int         correctTrials    { 0 };
        std::string weakestBandName;             ///< e.g. "High-Mids: 2kHz - 6kHz"
        std::string mostConfusedPair;            ///< e.g. "Bell → High-Shelf"
    };

    // ─── Callbacks ────────────────────────────────────────────────────────────

    /** Invoked on the message thread when "Reboot System" is clicked. */
    std::function<void()> onRebootClicked;

    // ─── Construction ─────────────────────────────────────────────────────────

    GameOverOverlay() {
        setInterceptsMouseClicks(true, true); // swallow all mouse events
        setVisible(false);

        // ── "Reboot System" button ─────────────────────────────────────────
        m_btnReboot.setButtonText("REBOOT SYSTEM");
        m_btnReboot.setComponentID(TechnologicalLookAndFeel::ButtonStyleCTA);
        m_btnReboot.onClick = [this]() {
            setVisible(false);
            if (onRebootClicked) onRebootClicked();
        };
        addAndMakeVisible(m_btnReboot);
    }

    ~GameOverOverlay() override = default;

    // ─── Public API ───────────────────────────────────────────────────────────

    void showWithStats(const SessionStats& stats) {
        m_stats = stats;
        setVisible(true);
        toFront(true);
        repaint();
    }

    void hide() {
        setVisible(false);
    }

    // ─── juce::Component overrides ────────────────────────────────────────────

    void paint(juce::Graphics& g) override {
        const auto bounds = getLocalBounds().toFloat();

        // ── 1. Semi-transparent dark backdrop ──────────────────────────────
        g.setColour(juce::Colour(0xEE0D1117)); // ~93% opaque near-black
        g.fillRect(bounds);

        // ── 2. Thin top-edge accent line ───────────────────────────────────
        g.setColour(TechnologicalLookAndFeel::AccentCrimson.withAlpha(0.7f));
        g.fillRect(bounds.withHeight(2.0f));

        // ── 3. Central content card ─────────────────────────────────────────
        const float cardW = juce::jmin(560.0f, bounds.getWidth() - 64.0f);
        const float cardH = 280.0f;
        const float cardX = (bounds.getWidth()  - cardW) * 0.5f;
        const float cardY = (bounds.getHeight() - cardH) * 0.5f - 20.0f;
        const juce::Rectangle<float> card(cardX, cardY, cardW, cardH);

        // Card background — dark surface elevated
        g.setColour(juce::Colour(0xFF161B22));
        g.fillRoundedRectangle(card, 12.0f);

        // Card border
        g.setColour(TechnologicalLookAndFeel::AccentCrimson.withAlpha(0.35f));
        g.drawRoundedRectangle(card, 12.0f, 1.0f);

        // ── 4. Header ───────────────────────────────────────────────────────
        {
            const juce::Rectangle<float> headerArea(cardX, cardY + 24.0f, cardW, 36.0f);
            g.setFont(juce::FontOptions(26.0f).withStyle("Bold"));
            g.setColour(TechnologicalLookAndFeel::AccentCrimson.brighter(0.1f));
            g.drawText("SESSION TERMINATED", headerArea, juce::Justification::centred);
        }

        // ── 5. Thin separator ───────────────────────────────────────────────
        g.setColour(TechnologicalLookAndFeel::BorderSubtle.withAlpha(0.5f));
        g.drawHorizontalLine(static_cast<int>(cardY + 70.0f),
                             cardX + 24.0f, cardX + cardW - 24.0f);

        // ── 6. Analytics grid ───────────────────────────────────────────────
        const float rowStartY = cardY + 84.0f;
        const float labelX    = cardX + 28.0f;
        const float valueX    = cardX + cardW * 0.5f;
        const float rowH      = 34.0f;
        const float labelW    = cardW * 0.47f;
        const float valueW    = cardW * 0.48f;

        auto drawRow = [&](float rowY, const juce::String& label, const juce::String& value,
                           juce::Colour valueColour) {
            // Label
            g.setFont(juce::FontOptions(11.5f).withStyle("Bold"));
            g.setColour(TechnologicalLookAndFeel::TextDim);
            g.drawText(label.toUpperCase(),
                       juce::Rectangle<float>(labelX, rowY, labelW, rowH),
                       juce::Justification::centredLeft);

            // Value
            g.setFont(juce::FontOptions(13.0f));
            g.setColour(valueColour);
            g.drawText(value,
                       juce::Rectangle<float>(valueX, rowY, valueW, rowH),
                       juce::Justification::centredLeft);
        };

        // Accuracy rate
        const juce::Colour accuracyColour =
            (m_stats.accuracyPercent >= 70.0) ? TechnologicalLookAndFeel::AccentEmerald
          : (m_stats.accuracyPercent >= 40.0) ? TechnologicalLookAndFeel::AccentAmber
          :                                      TechnologicalLookAndFeel::AccentCrimson;

        std::ostringstream accStream;
        accStream << std::fixed << std::setprecision(1)
                  << m_stats.accuracyPercent << "%"
                  << "  (" << m_stats.correctTrials << "/" << m_stats.totalTrials << ")";

        drawRow(rowStartY,
                "Accuracy Rate",
                juce::String(accStream.str()),
                accuracyColour);

        // Weakest band
        const juce::String weakest = m_stats.weakestBandName.empty()
            ? "N/A" : juce::String(m_stats.weakestBandName);
        drawRow(rowStartY + rowH,
                "Weakest Band",
                weakest,
                TechnologicalLookAndFeel::AccentAmber);

        // Most confused filter
        const juce::String confused = m_stats.mostConfusedPair.empty()
            ? "N/A" : juce::String(m_stats.mostConfusedPair);
        drawRow(rowStartY + rowH * 2.0f,
                "Most Confused Filter",
                confused,
                TechnologicalLookAndFeel::TextSecondary);
    }

    void resized() override {
        const auto bounds = getLocalBounds();
        const int  btnW   = 220;
        const int  btnH   = 44;
        const int  centerX = (bounds.getWidth()  - btnW) / 2;

        // Place "Reboot System" button just below the card
        const float cardY = (static_cast<float>(bounds.getHeight()) - 280.0f) * 0.5f - 20.0f;
        const int   btnY  = static_cast<int>(cardY + 280.0f + 20.0f);
        m_btnReboot.setBounds(centerX, btnY, btnW, btnH);
    }

private:
    SessionStats    m_stats;
    juce::TextButton m_btnReboot;

    // GameOverOverlay must include <sstream> and <iomanip> in the .cpp if out-of-line,
    // but since the paint() is inline here, we need them here.
    // (They are included transitively via juce_gui_basics in practice.)
    // For portability, include them explicitly:
    // #include <sstream>  #include <iomanip>  — add to the including .cpp

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GameOverOverlay)
};

} // namespace EarTraining::UI
