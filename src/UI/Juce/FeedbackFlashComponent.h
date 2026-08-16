#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "UI/Juce/TechnologicalLookAndFeel.h"
#include <functional>

namespace EarTraining::UI {

/**
 * @brief Transient "CORRECT / MISS" feedback flash overlay.
 *
 * Design contract:
 *  - Mouse pass-through (setInterceptsMouseClicks false) — controls behind remain live.
 *  - Self-managing juce::Timer: ~540 ms hold at full alpha, then ~360 ms fade-out.
 *  - Fires onFlashComplete when invisible again so callers can auto-advance.
 *  - Correct state: Emerald tint + large "CORRECT" text.
 *  - Incorrect state: Crimson tint + large "MISS" text + sub-message (target info).
 *
 * Usage:
 * @code
 *   m_feedbackFlash.onFlashComplete = [this]() { onStartTrial(); };
 *   m_feedbackFlash.flashCorrect();
 *   // or:
 *   m_feedbackFlash.flashIncorrect("Target: 1000 Hz  +6 dB  Bell");
 * @endcode
 */
class FeedbackFlashComponent : public juce::Component,
                               private juce::Timer {
public:
    /** Fired on the message thread when the fade completes. Set before calling flash*(). */
    std::function<void()> onFlashComplete;

    FeedbackFlashComponent() {
        setInterceptsMouseClicks(false, false); // fully transparent to mouse
        setVisible(false);
    }
    ~FeedbackFlashComponent() override { stopTimer(); }

    // ─── Public API ───────────────────────────────────────────────────────────

    /** Flash a green "CORRECT" overlay, then call onFlashComplete. */
    void flashCorrect(const juce::String& subMessage = {}) {
        m_isCorrect  = true;
        m_subMessage = subMessage;
        beginFlash();
    }

    /** Flash a red "MISS" overlay with an optional target description, then call onFlashComplete. */
    void flashIncorrect(const juce::String& subMessage = {}) {
        m_isCorrect  = false;
        m_subMessage = subMessage;
        beginFlash();
    }

    // ─── Rendering ────────────────────────────────────────────────────────────

    void paint(juce::Graphics& g) override {
        const auto bounds = getLocalBounds().toFloat();

        const juce::Colour accent = m_isCorrect
            ? TechnologicalLookAndFeel::AccentEmerald
            : TechnologicalLookAndFeel::AccentCrimson;

        // ── Background tint (very subtle) ─────────────────────────────────
        g.setColour(accent.withAlpha(m_alpha * (m_isCorrect ? 0.13f : 0.18f)));
        g.fillRect(bounds);

        // ── Top + bottom accent bars ───────────────────────────────────────
        g.setColour(accent.withAlpha(m_alpha * 0.80f));
        g.fillRect(bounds.withHeight(3.0f));
        g.fillRect(bounds.withTop(bounds.getBottom() - 3.0f));

        // ── Main word ─────────────────────────────────────────────────────
        const juce::String mainWord = m_isCorrect ? "CORRECT" : "MISS";
        g.setFont(juce::FontOptions(54.0f).withStyle("Bold"));
        g.setColour(accent.withAlpha(m_alpha));
        g.drawText(mainWord,
                   bounds.withSizeKeepingCentre(bounds.getWidth(), 68.0f)
                         .translated(0.0f, -16.0f),
                   juce::Justification::centred);

        // ── Sub-message ───────────────────────────────────────────────────
        if (m_subMessage.isNotEmpty()) {
            g.setFont(juce::FontOptions(13.5f));
            g.setColour(TechnologicalLookAndFeel::TextSecondary.withAlpha(m_alpha * 0.88f));
            g.drawText(m_subMessage,
                       bounds.withSizeKeepingCentre(bounds.getWidth() - 48.0f, 38.0f)
                             .translated(0.0f, 26.0f),
                       juce::Justification::centred);
        }
    }

private:
    // ─── Timer ────────────────────────────────────────────────────────────────

    void beginFlash() {
        m_alpha     = 1.0f;
        m_tickCount = 0;
        setVisible(true);
        toFront(false);
        repaint();
        startTimer(30); // 30 ms per tick
    }

    void timerCallback() override {
        // Phase 1: hold at full alpha for ~540 ms (18 ticks × 30 ms)
        // Phase 2: linear fade to zero over ~360 ms (12 ticks × 30 ms)
        constexpr int kHoldTicks = 18;
        constexpr int kFadeTicks = 12;

        ++m_tickCount;
        if (m_tickCount <= kHoldTicks)
            return;

        const int   fadeTick = m_tickCount - kHoldTicks;
        m_alpha = 1.0f - (static_cast<float>(fadeTick) / static_cast<float>(kFadeTicks));

        if (m_alpha <= 0.0f) {
            m_alpha = 0.0f;
            stopTimer();
            setVisible(false);
            if (onFlashComplete) onFlashComplete();
            return;
        }
        repaint();
    }

    // ─── State ────────────────────────────────────────────────────────────────

    bool         m_isCorrect  { true };
    juce::String m_subMessage;
    float        m_alpha      { 1.0f };
    int          m_tickCount  { 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(FeedbackFlashComponent)
};

} // namespace EarTraining::UI
