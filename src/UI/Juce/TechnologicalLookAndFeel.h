#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace EarTraining::UI {

/**
 * @brief Premium JUCE LookAndFeel — FabFilter-inspired dark aesthetic.
 *
 * Features:
 *  - Rounded, gradient-filled buttons with luminous hover borders
 *  - Glowing CTA "START TRIAL" variant style
 *  - Card-style Easy Mode option pads with depth effect
 *  - Slim pill-shaped ComboBoxes
 *  - Typography: Bold labels / Light values
 */
class TechnologicalLookAndFeel : public juce::LookAndFeel_V4 {
public:
    TechnologicalLookAndFeel();
    ~TechnologicalLookAndFeel() override = default;

    // ─── Color Palette ────────────────────────────────────────────────────────
    static const juce::Colour BackgroundDark;
    static const juce::Colour SurfacePanel;
    static const juce::Colour SurfaceElevated;
    static const juce::Colour BorderSubtle;
    static const juce::Colour AccentCyan;
    static const juce::Colour AccentAmber;
    static const juce::Colour AccentEmerald;
    static const juce::Colour AccentCrimson;
    static const juce::Colour TextPrimary;
    static const juce::Colour TextSecondary;
    static const juce::Colour TextBright;
    static const juce::Colour TextDim;
    static const juce::Colour BorderColor;
    static const juce::Colour SurfaceHighlight;

    // ─── Component Properties ─────────────────────────────────────────────────

    /** Corner radius for standard interactive controls. */
    static constexpr float CornerRadius        = 8.0f;
    /** Corner radius for large CTA-style buttons. */
    static constexpr float CornerRadiusCTA     = 12.0f;
    /** Corner radius for card/pad option buttons. */
    static constexpr float CornerRadiusCard    = 10.0f;
    /** Corner radius for pill-shaped ComboBoxes. */
    static constexpr float CornerRadiusPill    = 14.0f;

    // ─── Component Overrides ─────────────────────────────────────────────────

    void drawRotarySlider(juce::Graphics& g, int x, int y, int width, int height,
                          float sliderPosProportional, float rotaryStartAngle,
                          float rotaryEndAngle, juce::Slider& slider) override;

    void drawButtonBackground(juce::Graphics& g, juce::Button& button,
                              const juce::Colour& backgroundColour,
                              bool shouldDrawButtonAsHighlighted,
                              bool shouldDrawButtonAsDown) override;

    void drawButtonText(juce::Graphics& g, juce::TextButton& button,
                        bool shouldDrawButtonAsHighlighted,
                        bool shouldDrawButtonAsDown) override;

    void drawComboBox(juce::Graphics& g, int width, int height, bool isButtonDown,
                      int buttonX, int buttonY, int buttonW, int buttonH,
                      juce::ComboBox& box) override;

    void positionComboBoxText(juce::ComboBox& box, juce::Label& label) override;

    juce::Font getComboBoxFont(juce::ComboBox& box) override;
    juce::Font getLabelFont(juce::Label& label) override;
    juce::Font getTextButtonFont(juce::TextButton& btn, int buttonHeight) override;

    // ─── Custom Component ID Tags ─────────────────────────────────────────────
    /** Assign this ComponentID to activate the glowing CTA button style. */
    static constexpr const char* ButtonStyleCTA    = "cta";
    /** Assign this ComponentID to activate the interactive card/pad style. */
    static constexpr const char* ButtonStyleCard   = "card";
    /** Assign this ComponentID to activate ABX pill style. */
    static constexpr const char* ButtonStylePill   = "pill";
    /** Assign this ComponentID to activate the minimal transport style. */
    static constexpr const char* ButtonStyleTransport = "transport";
    /** Assign this ComponentID to activate the large Welcome Dashboard CTA style. */
    static constexpr const char* ButtonStyleWelcome   = "welcome";
};

} // namespace EarTraining::UI
