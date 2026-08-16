#include "UI/Juce/TechnologicalLookAndFeel.h"
#include <cmath>

namespace EarTraining::UI {

// ─── Color Palette Definitions ────────────────────────────────────────────────
const juce::Colour TechnologicalLookAndFeel::BackgroundDark   = juce::Colour(0xFF0D1117);
const juce::Colour TechnologicalLookAndFeel::SurfacePanel     = juce::Colour(0xFF161B22);
const juce::Colour TechnologicalLookAndFeel::SurfaceElevated  = juce::Colour(0xFF21262D);
const juce::Colour TechnologicalLookAndFeel::BorderSubtle     = juce::Colour(0xFF30363D);
const juce::Colour TechnologicalLookAndFeel::AccentCyan       = juce::Colour(0xFF00F0FF);
const juce::Colour TechnologicalLookAndFeel::AccentAmber      = juce::Colour(0xFFFFB703);
const juce::Colour TechnologicalLookAndFeel::AccentEmerald    = juce::Colour(0xFF06D6A0);
const juce::Colour TechnologicalLookAndFeel::AccentCrimson    = juce::Colour(0xFFEF476F);
const juce::Colour TechnologicalLookAndFeel::TextPrimary      = juce::Colour(0xFFF0F6FC);
const juce::Colour TechnologicalLookAndFeel::TextSecondary    = juce::Colour(0xFF8B949E);
const juce::Colour TechnologicalLookAndFeel::TextBright       = juce::Colour(0xFFFFFFFF);
const juce::Colour TechnologicalLookAndFeel::TextDim          = juce::Colour(0xFF6E7681);
const juce::Colour TechnologicalLookAndFeel::BorderColor      = juce::Colour(0xFF30363D);
const juce::Colour TechnologicalLookAndFeel::SurfaceHighlight = juce::Colour(0xFF2D333B);

// ─── Constructor ──────────────────────────────────────────────────────────────
TechnologicalLookAndFeel::TechnologicalLookAndFeel() {
    // Window & global
    setColour(juce::ResizableWindow::backgroundColourId, BackgroundDark);

    // Labels
    setColour(juce::Label::textColourId, TextPrimary);
    setColour(juce::Label::backgroundColourId, juce::Colours::transparentBlack);

    // Buttons
    setColour(juce::TextButton::buttonColourId,    SurfacePanel);
    setColour(juce::TextButton::buttonOnColourId,  SurfaceElevated);
    setColour(juce::TextButton::textColourOffId,   TextPrimary);
    setColour(juce::TextButton::textColourOnId,    AccentCyan);

    // ComboBox
    setColour(juce::ComboBox::backgroundColourId,  SurfacePanel);
    setColour(juce::ComboBox::textColourId,        TextPrimary);
    setColour(juce::ComboBox::outlineColourId,     BorderSubtle);
    setColour(juce::ComboBox::arrowColourId,       TextSecondary);

    // PopupMenu
    setColour(juce::PopupMenu::backgroundColourId,       SurfacePanel);
    setColour(juce::PopupMenu::textColourId,             TextPrimary);
    setColour(juce::PopupMenu::highlightedBackgroundColourId, AccentCyan.withAlpha(0.2f));
    setColour(juce::PopupMenu::highlightedTextColourId,  AccentCyan);

    // Slider
    setColour(juce::Slider::thumbColourId,          AccentCyan);
    setColour(juce::Slider::trackColourId,          BorderSubtle);
    setColour(juce::Slider::backgroundColourId,     SurfacePanel);
    setColour(juce::Slider::textBoxTextColourId,    TextPrimary);
    setColour(juce::Slider::textBoxBackgroundColourId, SurfaceElevated);
    setColour(juce::Slider::textBoxOutlineColourId, BorderSubtle);
}

// ─── Rotary Slider ─────────────────────────────────────────────────────────────
void TechnologicalLookAndFeel::drawRotarySlider(juce::Graphics& g, int x, int y, int width, int height,
                                                float sliderPosProportional, float rotaryStartAngle,
                                                float rotaryEndAngle, [[maybe_unused]] juce::Slider& slider) {
    const auto bounds = juce::Rectangle<float>(static_cast<float>(x), static_cast<float>(y),
                                               static_cast<float>(width), static_cast<float>(height)).reduced(6.0f);
    const float radius = juce::jmin(bounds.getWidth(), bounds.getHeight()) * 0.5f;
    const auto centre = bounds.getCentre();
    const float toAngle = rotaryStartAngle + sliderPosProportional * (rotaryEndAngle - rotaryStartAngle);
    constexpr float arcThickness = 3.5f;

    // 1. Background Arc
    juce::Path backgroundArc;
    backgroundArc.addCentredArc(centre.x, centre.y, radius - 2.0f, radius - 2.0f,
                                0.0f, rotaryStartAngle, rotaryEndAngle, true);
    g.setColour(BorderSubtle);
    g.strokePath(backgroundArc, juce::PathStrokeType(arcThickness,
        juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

    // 2. Active Value Arc (Neon Cyan with subtle glow)
    if (sliderPosProportional > 0.0f) {
        juce::Path valueArc;
        valueArc.addCentredArc(centre.x, centre.y, radius - 2.0f, radius - 2.0f,
                               0.0f, rotaryStartAngle, toAngle, true);
        g.setColour(AccentCyan.withAlpha(0.25f));
        g.strokePath(valueArc, juce::PathStrokeType(arcThickness + 3.0f,
            juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
        g.setColour(AccentCyan);
        g.strokePath(valueArc, juce::PathStrokeType(arcThickness,
            juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }

    // 3. Rotor Body with subtle gradient
    const float innerRadius = radius - 8.0f;
    juce::ColourGradient rotorGrad(SurfaceElevated.brighter(0.1f),
                                   centre.x, centre.y - innerRadius,
                                   SurfaceElevated.darker(0.3f),
                                   centre.x, centre.y + innerRadius, false);
    g.setGradientFill(rotorGrad);
    g.fillEllipse(centre.x - innerRadius, centre.y - innerRadius,
                  innerRadius * 2.0f, innerRadius * 2.0f);
    g.setColour(BorderSubtle);
    g.drawEllipse(centre.x - innerRadius, centre.y - innerRadius,
                  innerRadius * 2.0f, innerRadius * 2.0f, 1.0f);

    // 4. Indicator Needle
    juce::Path needle;
    const float needleLength = innerRadius * 0.75f;
    needle.startNewSubPath(centre.x + (innerRadius * 0.2f) * std::sin(toAngle),
                           centre.y - (innerRadius * 0.2f) * std::cos(toAngle));
    needle.lineTo(centre.x + needleLength * std::sin(toAngle),
                  centre.y - needleLength * std::cos(toAngle));
    g.setColour(TextPrimary);
    g.strokePath(needle, juce::PathStrokeType(2.0f,
        juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

    // 5. Center dot accent
    g.setColour(AccentCyan.withAlpha(0.6f));
    g.fillEllipse(centre.x - 2.5f, centre.y - 2.5f, 5.0f, 5.0f);
}

// ─── Button Background ────────────────────────────────────────────────────────
void TechnologicalLookAndFeel::drawButtonBackground(juce::Graphics& g, juce::Button& button,
                                                    const juce::Colour& backgroundColour,
                                                    bool shouldDrawButtonAsHighlighted,
                                                    bool shouldDrawButtonAsDown) {
    const auto bounds = button.getLocalBounds().toFloat().reduced(1.0f);
    const juce::String styleId = button.getComponentID();

    // ── CTA Style (glowing Start Trial button) ──────────────────────────────
    if (styleId == ButtonStyleCTA) {
        // Outer glow halo
        if (shouldDrawButtonAsHighlighted || button.isEnabled()) {
            const float glowAlpha = shouldDrawButtonAsDown ? 0.15f :
                                    (shouldDrawButtonAsHighlighted ? 0.30f : 0.18f);
            g.setColour(AccentCyan.withAlpha(glowAlpha));
            g.fillRoundedRectangle(bounds.expanded(6.0f), CornerRadiusCTA + 4.0f);
            g.fillRoundedRectangle(bounds.expanded(3.0f), CornerRadiusCTA + 2.0f);
        }

        // Gradient fill: cyan-to-teal
        const juce::Colour topCol = shouldDrawButtonAsDown
            ? AccentCyan.darker(0.25f)
            : (shouldDrawButtonAsHighlighted ? AccentCyan.brighter(0.1f) : AccentCyan);
        const juce::Colour botCol = topCol.withHue(topCol.getHue() + 0.05f).darker(0.45f);

        juce::ColourGradient grad(topCol, bounds.getCentreX(), bounds.getY(),
                                  botCol, bounds.getCentreX(), bounds.getBottom(), false);
        g.setGradientFill(grad);
        g.fillRoundedRectangle(bounds, CornerRadiusCTA);

        // Bright inner top edge highlight
        g.setColour(juce::Colours::white.withAlpha(0.18f));
        g.fillRoundedRectangle(bounds.withHeight(bounds.getHeight() * 0.45f), CornerRadiusCTA);

        // Border
        g.setColour(AccentCyan.withAlpha(0.8f));
        g.drawRoundedRectangle(bounds, CornerRadiusCTA, 1.5f);
        return;
    }

    // ── Welcome Dashboard CTA (bigger, deeper cyan pool than ButtonStyleCTA) ──
    if (styleId == ButtonStyleWelcome) {
        // Outer glow — prominent, covers full halo
        const float glowAlpha = shouldDrawButtonAsDown ? 0.12f
                              : (shouldDrawButtonAsHighlighted ? 0.35f : 0.22f);
        g.setColour(AccentCyan.withAlpha(glowAlpha));
        g.fillRoundedRectangle(bounds.expanded(8.0f), 20.0f);
        g.fillRoundedRectangle(bounds.expanded(4.0f), 18.0f);

        // Deep cyan-to-teal gradient
        const juce::Colour topCol = shouldDrawButtonAsDown
            ? AccentCyan.darker(0.3f)
            : (shouldDrawButtonAsHighlighted ? AccentCyan.brighter(0.12f) : AccentCyan);
        const juce::Colour botCol = topCol.withHue(topCol.getHue() + 0.06f).darker(0.55f);

        juce::ColourGradient grad(topCol, bounds.getCentreX(), bounds.getY(),
                                  botCol, bounds.getCentreX(), bounds.getBottom(), false);
        g.setGradientFill(grad);
        g.fillRoundedRectangle(bounds, 16.0f);

        // Inner highlight
        g.setColour(juce::Colours::white.withAlpha(0.14f));
        g.fillRoundedRectangle(bounds.withHeight(bounds.getHeight() * 0.42f), 16.0f);

        // Border
        g.setColour(AccentCyan.withAlpha(0.9f));
        g.drawRoundedRectangle(bounds, 16.0f, 1.5f);
        return;
    }

    // ── Card/Pad Style (Easy Mode option buttons) ───────────────────────────
    if (styleId == ButtonStyleCard) {
        const bool toggled = button.getToggleState();
        const bool hovered = shouldDrawButtonAsHighlighted;

        // ── Hover glow: two concentric alpha halos to simulate glowing border
        if (hovered || toggled) {
            const juce::Colour glowCol = toggled
                ? AccentCyan.withAlpha(0.18f)
                : AccentCyan.withAlpha(0.10f);
            g.setColour(glowCol);
            g.fillRoundedRectangle(bounds.expanded(5.0f), CornerRadiusCard + 4.0f);
            g.setColour(glowCol.withAlpha(glowCol.getAlpha() * 0.5f));
            g.fillRoundedRectangle(bounds.expanded(2.5f), CornerRadiusCard + 2.0f);
        }

        // Subtle shadow behind card (painted as darker border)
        g.setColour(BackgroundDark.withAlpha(0.6f));
        g.fillRoundedRectangle(bounds.translated(0, 2.0f), CornerRadiusCard);

        // Card body gradient
        const juce::Colour cardTop = toggled
            ? SurfaceElevated.interpolatedWith(AccentCyan, 0.18f)
            : (hovered ? SurfaceHighlight : SurfaceElevated);
        const juce::Colour cardBot = toggled
            ? SurfaceElevated.interpolatedWith(AccentCyan, 0.06f)
            : (hovered ? SurfaceElevated : SurfacePanel);

        juce::ColourGradient cardGrad(cardTop, bounds.getCentreX(), bounds.getY(),
                                      cardBot, bounds.getCentreX(), bounds.getBottom(), false);
        g.setGradientFill(cardGrad);
        g.fillRoundedRectangle(bounds, CornerRadiusCard);

        // Top inner highlight stripe (glassmorphism)
        g.setColour(juce::Colours::white.withAlpha(hovered ? 0.08f : 0.04f));
        g.fillRoundedRectangle(bounds.withHeight(bounds.getHeight() * 0.4f), CornerRadiusCard);

        // Border
        const juce::Colour borderCol = toggled ? AccentCyan
                                     : (hovered ? AccentCyan.withAlpha(0.70f) : BorderSubtle);
        const float borderW = (toggled || hovered) ? 1.5f : 1.0f;
        g.setColour(borderCol);
        g.drawRoundedRectangle(bounds, CornerRadiusCard, borderW);

        // Auditioned state: amber top-left badge stripe
        if (!button.isEnabled()) {
            g.setColour(AccentAmber.withAlpha(0.35f));
            g.fillRoundedRectangle(bounds.withWidth(4.0f), CornerRadiusCard);
        }
        return;
    }

    // ── ABX Pill Style ──────────────────────────────────────────────────────
    if (styleId == ButtonStylePill) {
        const bool toggled = button.getToggleState();
        const bool hovered = shouldDrawButtonAsHighlighted;

        juce::Colour fill = toggled ? AccentCyan.withAlpha(0.18f)
                          : (hovered ? SurfaceHighlight : SurfacePanel);

        if (shouldDrawButtonAsDown) fill = fill.darker(0.15f);

        g.setColour(fill);
        g.fillRoundedRectangle(bounds, CornerRadius);

        const juce::Colour border = toggled ? AccentCyan
                                 : (hovered ? AccentCyan.withAlpha(0.35f) : BorderSubtle);
        g.setColour(border);
        g.drawRoundedRectangle(bounds, CornerRadius, toggled ? 1.5f : 1.0f);
        return;
    }

    // ── Transport Style (small, minimal) ────────────────────────────────────
    if (styleId == ButtonStyleTransport) {
        const bool toggled = button.getToggleState();
        const bool hovered = shouldDrawButtonAsHighlighted;

        const juce::Colour fill = toggled ? AccentCyan.withAlpha(0.12f)
                                : (hovered ? SurfaceHighlight.withAlpha(0.7f) : juce::Colours::transparentBlack);
        g.setColour(fill);
        g.fillRoundedRectangle(bounds, 5.0f);

        if (toggled) {
            g.setColour(AccentCyan.withAlpha(0.5f));
            g.drawRoundedRectangle(bounds, 5.0f, 1.0f);
        }
        return;
    }

    // ── Welcome Dashboard CTA (bigger, deeper cyan pool than ButtonStyleCTA) ──
    if (styleId == ButtonStyleWelcome) {
        // Outer glow — prominent, covers full halo
        const float glowAlpha = shouldDrawButtonAsDown ? 0.12f
                              : (shouldDrawButtonAsHighlighted ? 0.35f : 0.22f);
        g.setColour(AccentCyan.withAlpha(glowAlpha));
        g.fillRoundedRectangle(bounds.expanded(8.0f), 20.0f);
        g.fillRoundedRectangle(bounds.expanded(4.0f), 18.0f);

        // Deep cyan-to-teal gradient
        const juce::Colour topCol = shouldDrawButtonAsDown
            ? AccentCyan.darker(0.3f)
            : (shouldDrawButtonAsHighlighted ? AccentCyan.brighter(0.12f) : AccentCyan);
        const juce::Colour botCol = topCol.withHue(topCol.getHue() + 0.06f).darker(0.55f);

        juce::ColourGradient grad(topCol, bounds.getCentreX(), bounds.getY(),
                                  botCol, bounds.getCentreX(), bounds.getBottom(), false);
        g.setGradientFill(grad);
        g.fillRoundedRectangle(bounds, 16.0f);

        // Inner highlight
        g.setColour(juce::Colours::white.withAlpha(0.14f));
        g.fillRoundedRectangle(bounds.withHeight(bounds.getHeight() * 0.42f), 16.0f);

        // Border
        g.setColour(AccentCyan.withAlpha(0.9f));
        g.drawRoundedRectangle(bounds, 16.0f, 1.5f);
        return;
    }

    // ── Default Standard Style ──────────────────────────────────────────────
    const bool toggled = button.getToggleState();
    juce::Colour fillColour = backgroundColour.isTransparent() ? SurfacePanel : backgroundColour;

    if (toggled) {
        fillColour = SurfaceElevated.interpolatedWith(AccentCyan, 0.15f);
    } else if (shouldDrawButtonAsDown) {
        fillColour = SurfaceElevated.darker(0.1f);
    } else if (shouldDrawButtonAsHighlighted) {
        fillColour = SurfaceHighlight;
    }

    g.setColour(fillColour);
    g.fillRoundedRectangle(bounds, CornerRadius);

    juce::Colour borderCol = toggled ? AccentCyan
                           : (shouldDrawButtonAsHighlighted ? AccentCyan.withAlpha(0.4f) : BorderSubtle);
    g.setColour(borderCol);
    g.drawRoundedRectangle(bounds, CornerRadius, toggled ? 1.5f : 1.0f);
}

// ─── Button Text ──────────────────────────────────────────────────────────────
void TechnologicalLookAndFeel::drawButtonText(juce::Graphics& g, juce::TextButton& button,
                                              bool shouldDrawButtonAsHighlighted,
                                              [[maybe_unused]] bool shouldDrawButtonAsDown) {
    const juce::String styleId = button.getComponentID();

    if (styleId == ButtonStyleCTA) {
        // Bold white text with shadow for CTA
        g.setFont(juce::Font(juce::FontOptions(15.0f).withStyle("Bold")));
        g.setColour(BackgroundDark.withAlpha(0.4f));
        g.drawFittedText(button.getButtonText(),
                         button.getLocalBounds().reduced(8, 4).translated(0, 1),
                         juce::Justification::centred, 1);
        g.setColour(juce::Colours::white);
        g.drawFittedText(button.getButtonText(),
                         button.getLocalBounds().reduced(8, 4),
                         juce::Justification::centred, 1);
        return;
    }

    if (styleId == ButtonStyleWelcome) {
        // Larger, bolder text for the Welcome CTA
        g.setFont(juce::Font(juce::FontOptions(20.0f).withStyle("Bold")));
        // Shadow pass
        g.setColour(BackgroundDark.withAlpha(0.45f));
        g.drawFittedText(button.getButtonText(),
                         button.getLocalBounds().reduced(12, 6).translated(0, 1),
                         juce::Justification::centred, 1);
        // Main text
        g.setColour(juce::Colours::white);
        g.drawFittedText(button.getButtonText(),
                         button.getLocalBounds().reduced(12, 6),
                         juce::Justification::centred, 1);
        return;
    }

    if (styleId == ButtonStyleCard) {
        // Two-line layout: bold name + dim description below
        const bool toggled = button.getToggleState();
        const bool hovered = shouldDrawButtonAsHighlighted;
        const auto localBounds = button.getLocalBounds();

        // Main text (top 60%)
        g.setFont(juce::Font(juce::FontOptions(13.0f).withStyle("Bold")));
        g.setColour(toggled ? AccentCyan
                  : (hovered ? TextBright : TextPrimary));
        g.drawFittedText(button.getButtonText(),
                         localBounds.withHeight(static_cast<int>(localBounds.getHeight() * 0.58f)).reduced(6, 0),
                         juce::Justification::centredBottom, 1);
        return;
    }

    if (styleId == ButtonStyleTransport) {
        g.setFont(juce::Font(juce::FontOptions(11.0f)));
        g.setColour(button.getToggleState() ? AccentCyan
                  : (shouldDrawButtonAsHighlighted ? TextSecondary : TextDim));
        g.drawFittedText(button.getButtonText(),
                         button.getLocalBounds().reduced(2, 2),
                         juce::Justification::centred, 1);
        return;
    }

    // Default
    g.setFont(getTextButtonFont(button, button.getHeight()));
    g.setColour(button.getToggleState() ? AccentCyan
              : (button.isEnabled() ? TextPrimary : TextDim));

    g.drawFittedText(button.getButtonText(),
                     button.getLocalBounds().reduced(6, 4),
                     juce::Justification::centred, 1);
}

// ─── ComboBox (Pill Style) ────────────────────────────────────────────────────
void TechnologicalLookAndFeel::drawComboBox(juce::Graphics& g, int width, int height,
                                            [[maybe_unused]] bool isButtonDown,
                                            [[maybe_unused]] int buttonX, [[maybe_unused]] int buttonY,
                                            [[maybe_unused]] int buttonW, [[maybe_unused]] int buttonH,
                                            juce::ComboBox& box) {
    const auto bounds = juce::Rectangle<float>(0.0f, 0.0f,
                                               static_cast<float>(width),
                                               static_cast<float>(height)).reduced(1.0f);
    const float corner = CornerRadiusPill;

    // Body
    juce::ColourGradient grad(SurfaceElevated, bounds.getCentreX(), bounds.getY(),
                              SurfacePanel,    bounds.getCentreX(), bounds.getBottom(), false);
    g.setGradientFill(grad);
    g.fillRoundedRectangle(bounds, corner);

    // Border — cyan if open, subtle otherwise
    const bool isOpen = box.isPopupActive();
    g.setColour(isOpen ? AccentCyan.withAlpha(0.8f) : BorderSubtle);
    g.drawRoundedRectangle(bounds, corner, isOpen ? 1.5f : 1.0f);

    // Chevron arrow
    const float arrowX = bounds.getRight() - 20.0f;
    const float arrowY = bounds.getCentreY();
    juce::Path arrow;
    arrow.startNewSubPath(arrowX - 4.0f, arrowY - 2.5f);
    arrow.lineTo(arrowX,        arrowY + 2.5f);
    arrow.lineTo(arrowX + 4.0f, arrowY - 2.5f);
    g.setColour(isOpen ? AccentCyan : TextSecondary);
    g.strokePath(arrow, juce::PathStrokeType(1.5f, juce::PathStrokeType::curved,
                                              juce::PathStrokeType::rounded));
}

void TechnologicalLookAndFeel::positionComboBoxText(juce::ComboBox& box, juce::Label& label) {
    label.setBounds(8, 1, box.getWidth() - 30, box.getHeight() - 2);
    label.setFont(getComboBoxFont(box));
}

// ─── Font Overrides ───────────────────────────────────────────────────────────
juce::Font TechnologicalLookAndFeel::getComboBoxFont([[maybe_unused]] juce::ComboBox& box) {
    return juce::Font(juce::FontOptions(12.0f));
}

juce::Font TechnologicalLookAndFeel::getLabelFont([[maybe_unused]] juce::Label& label) {
    return juce::Font(juce::FontOptions(13.0f));
}

juce::Font TechnologicalLookAndFeel::getTextButtonFont([[maybe_unused]] juce::TextButton& btn,
                                                       [[maybe_unused]] int buttonHeight) {
    const juce::String styleId = btn.getComponentID();
    if (styleId == ButtonStyleCTA)       return juce::Font(juce::FontOptions(14.0f).withStyle("Bold"));
    if (styleId == ButtonStyleWelcome)   return juce::Font(juce::FontOptions(20.0f).withStyle("Bold"));
    if (styleId == ButtonStyleCard)      return juce::Font(juce::FontOptions(13.0f).withStyle("Bold"));
    if (styleId == ButtonStylePill)      return juce::Font(juce::FontOptions(12.0f));
    if (styleId == ButtonStyleTransport) return juce::Font(juce::FontOptions(11.0f));
    return juce::Font(juce::FontOptions(12.5f));
}

} // namespace EarTraining::UI
