#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace EarTraining::UI {

/**
 * @brief Dual Stereo ITU-R BS.1770-4 True Peak Meter Component.
 * 
 * Displays instantaneous 4x oversampled true peak levels and peak-hold indicators
 * with color zones: Teal (nominal), Amber (hot > -1 dBTP), Crimson (clipped > 0 dBTP).
 */
class TruePeakMeterComponent : public juce::Component {
public:
    TruePeakMeterComponent();
    ~TruePeakMeterComponent() override = default;

    void paint(juce::Graphics& g) override;
    void resized() override;

    void setLevels(float leftDbTP, float rightDbTP);

private:
    float m_leftDbTP{-60.0f};
    float m_rightDbTP{-60.0f};
    float m_leftPeakHoldDbTP{-60.0f};
    float m_rightPeakHoldDbTP{-60.0f};

    static constexpr float MIN_DB = -60.0f;
    static constexpr float MAX_DB = 6.0f;

    [[nodiscard]] float dbToY(float db, const juce::Rectangle<float>& barBounds) const noexcept;
};

} // namespace EarTraining::UI
