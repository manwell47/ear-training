#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "UI/Juce/TechnologicalLookAndFeel.h"

namespace EarTraining::UI {

/**
 * @brief "Signal Integrity" HUD component — renders the player's remaining lives
 *        as a row of clean geometric rectangular blocks.
 *
 * Design contract (strictly professional / non-skeuomorphic):
 *  - Active blocks   : primary accent colour (Cyan or Amber, configurable).
 *  - Depleted blocks : muted dark-slate #21262D.
 *  - No glow effects, no rounded LEDs, no retro arcade tropes.
 *  - Only repaints itself when the live count actually changes.
 *
 * Usage:
 * @code
 *   m_signalIntegrity.setMaxLives(5);
 *   m_signalIntegrity.setLives(3);       // 3 active, 2 depleted
 * @endcode
 */
class SignalIntegrityComponent : public juce::Component {
public:
    SignalIntegrityComponent() = default;
    ~SignalIntegrityComponent() override = default;

    // ─── Configuration ────────────────────────────────────────────────────────

    /** Set the maximum number of life-blocks drawn. Default: 5. */
    void setMaxLives(int maxLives) noexcept {
        if (m_maxLives == maxLives) return;
        m_maxLives = maxLives;
        repaint();
    }

    /**
     * @brief Update the active life count.
     *
     * Only triggers repaint() if the value has changed, so calling this
     * from a 60 Hz timer is safe and will not cause unnecessary redraws.
     *
     * @param newLives  Clamped to [0, maxLives] internally.
     */
    void setLives(int newLives) noexcept {
        const int clamped = juce::jlimit(0, m_maxLives, newLives);
        if (m_currentLives == clamped) return;
        m_currentLives = clamped;
        repaint();
    }

    /**
     * @brief Update the current streak for the multiplier badge.
     *
     * Repaint is only triggered when the value changes — safe to call at 60 Hz.
     * Badge shows \u00d71 / \u00d72 / \u00d73\u2026, glowing Amber at streak \u2265 3, Cyan at streak \u2265 6.
     */
    void setStreak(int streak) noexcept {
        const int clamped = juce::jmax(0, streak);
        if (m_currentStreak == clamped) return;
        m_currentStreak = clamped;
        repaint();
    }

    [[nodiscard]] int getLives()    const noexcept { return m_currentLives; }
    [[nodiscard]] int getMaxLives() const noexcept { return m_maxLives; }
    [[nodiscard]] int getStreak()   const noexcept { return m_currentStreak; }

    /**
     * @brief Override the active-block accent colour (default: AccentCyan).
     * Repaint is triggered automatically.
     */
    void setAccentColour(juce::Colour colour) noexcept {
        if (m_activeColour == colour) return;
        m_activeColour = colour;
        repaint();
    }

    // ─── Rendering ────────────────────────────────────────────────────────────

    void paint(juce::Graphics& g) override {
        if (m_maxLives <= 0) return;

        const auto bounds = getLocalBounds().toFloat();

        // ── Reserve right portion for the streak multiplier badge ──────────
        // Badge width: ~40px; leave the rest for the life blocks.
        constexpr float kBadgeW = 42.0f;
        const float blocksW = juce::jmax(4.0f, bounds.getWidth() - kBadgeW - 6.0f);
        const juce::Rectangle<float> blocksBounds(bounds.getX(), bounds.getY(), blocksW, bounds.getHeight());
        const juce::Rectangle<float> badgeBounds(bounds.getX() + blocksW + 6.0f,
                                                  bounds.getY(), kBadgeW, bounds.getHeight());

        // ── Life blocks ────────────────────────────────────────────────────
        const float blockGap  = 3.0f;
        const float totalGaps = blockGap * static_cast<float>(m_maxLives - 1);
        const float blockW    = (blocksBounds.getWidth() - totalGaps) / static_cast<float>(m_maxLives);
        const float blockH    = blocksBounds.getHeight();

        for (int i = 0; i < m_maxLives; ++i) {
            const float x = blocksBounds.getX() + static_cast<float>(i) * (blockW + blockGap);
            const juce::Rectangle<float> block(x, blocksBounds.getY(), blockW, blockH);
            const bool active = (i < m_currentLives);

            if (active) {
                g.setColour(m_activeColour.withAlpha(0.85f));
                g.fillRect(block);
                // Sheen on top edge
                g.setColour(m_activeColour.brighter(0.35f).withAlpha(0.55f));
                g.fillRect(block.withHeight(2.0f));
                // Crisp border
                g.setColour(m_activeColour.brighter(0.2f).withAlpha(0.6f));
                g.drawRect(block, 1.0f);
            } else {
                constexpr uint32_t kDepletedArgb = 0xFF21262D;
                g.setColour(juce::Colour(kDepletedArgb));
                g.fillRect(block);
                g.setColour(juce::Colour(0xFF303840));
                g.drawRect(block, 1.0f);
            }
        }

        // ── Streak Multiplier Badge ────────────────────────────────────────
        //   \u00d7N displayed in a small pill shape.
        //   Colour: Dim (streak 0-2), Amber (3-5), Cyan (6+).
        {
            const juce::Colour badgeColour =
                (m_currentStreak >= 6) ? TechnologicalLookAndFeel::AccentCyan
              : (m_currentStreak >= 3) ? TechnologicalLookAndFeel::AccentAmber
              :                          TechnologicalLookAndFeel::TextDim;

            // Pill background
            g.setColour(badgeColour.withAlpha(0.12f));
            g.fillRoundedRectangle(badgeBounds, 4.0f);

            // Pill border (only if streak > 0)
            if (m_currentStreak > 0) {
                g.setColour(badgeColour.withAlpha(0.45f));
                g.drawRoundedRectangle(badgeBounds, 4.0f, 1.0f);
            }

            // Multiplier text
            g.setFont(juce::FontOptions(11.5f).withStyle("Bold"));
            g.setColour(badgeColour.withAlpha(m_currentStreak > 0 ? 0.95f : 0.35f));
            g.drawText("\u00d7" + juce::String(juce::jmax(1, m_currentStreak)),
                       badgeBounds, juce::Justification::centred);
        }
    }

private:
    int          m_maxLives     { 5 };
    int          m_currentLives { 3 };
    int          m_currentStreak{ 0 };
    juce::Colour m_activeColour { TechnologicalLookAndFeel::AccentCyan };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SignalIntegrityComponent)
};

} // namespace EarTraining::UI
