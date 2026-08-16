#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <functional>
#include <string>

namespace EarTraining::UI {

/**
 * @brief High-Tech Audio Transport Bar Component.
 * 
 * Provides Play, Pause, Stop, Seek, Looping, Track Navigation, Timestamps,
 * and a Playlist drawer toggle button.
 */
class AudioTransportBarComponent : public juce::Component {
public:
    AudioTransportBarComponent();
    ~AudioTransportBarComponent() override = default;

    void paint(juce::Graphics& g) override;
    void resized() override;

    // ─── Callback Hooks ───────────────────────────────────────────────────────
    std::function<void()> onPlayPauseClicked;
    std::function<void()> onStopClicked;
    std::function<void()> onPrevClicked;
    std::function<void()> onNextClicked;
    std::function<void()> onLoopToggled;
    std::function<void(float)> onSeek;
    std::function<void()> onTogglePlaylistClicked;

    /**
     * @brief Refreshes real-time transport telemetry from the audio engine.
     */
    void updatePlaybackState(bool isPlaying, 
                             bool isLooping, 
                             double currentTimeSec, 
                             double totalTimeSec, 
                             double progressNormalized, 
                             const std::string& trackTitle, 
                             size_t trackIndex, 
                             size_t totalTracks);

private:
    juce::TextButton m_btnPrev{"|<<"};
    juce::TextButton m_btnPlayPause{"PLAY"};
    juce::TextButton m_btnStop{"STOP"};
    juce::TextButton m_btnNext{">>|"};
    juce::TextButton m_btnLoop{"LOOP"};
    
    juce::Slider m_seekBar;
    juce::Label m_lblTime;
    juce::Label m_lblTrackTitle;
    juce::TextButton m_btnTogglePlaylist{"PLAYLIST (1)"};

    bool m_isUserDraggingSeek{false};
    bool m_currentlyPlaying{true};
    bool m_currentlyLooping{true};

    static std::string formatTime(double seconds);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AudioTransportBarComponent)
};

} // namespace EarTraining::UI
