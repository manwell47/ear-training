#include "UI/Juce/AudioTransportBarComponent.h"
#include "UI/Juce/TechnologicalLookAndFeel.h"
#include <iomanip>
#include <sstream>
#include <cmath>

namespace EarTraining::UI {

AudioTransportBarComponent::AudioTransportBarComponent() {
    // Apply minimal "transport" style to all buttons
    for (auto* btn : { &m_btnPrev, &m_btnPlayPause, &m_btnStop, &m_btnNext, &m_btnLoop, &m_btnTogglePlaylist })
        btn->setComponentID(TechnologicalLookAndFeel::ButtonStyleTransport);

    // ─── Transport Buttons ───────────────────────────────────────────────────
    m_btnPrev.onClick = [this]() { if (onPrevClicked) onPrevClicked(); };
    addAndMakeVisible(m_btnPrev);

    m_btnPlayPause.onClick = [this]() { if (onPlayPauseClicked) onPlayPauseClicked(); };
    addAndMakeVisible(m_btnPlayPause);

    m_btnStop.onClick = [this]() { if (onStopClicked) onStopClicked(); };
    addAndMakeVisible(m_btnStop);

    m_btnNext.onClick = [this]() { if (onNextClicked) onNextClicked(); };
    addAndMakeVisible(m_btnNext);

    m_btnLoop.setClickingTogglesState(true);
    m_btnLoop.setToggleState(true, juce::dontSendNotification);
    m_btnLoop.onClick = [this]() { if (onLoopToggled) onLoopToggled(); };
    addAndMakeVisible(m_btnLoop);

    // ─── Seek Bar ────────────────────────────────────────────────────────────
    m_seekBar.setSliderStyle(juce::Slider::LinearHorizontal);
    m_seekBar.setTextBoxStyle(juce::Slider::NoTextBox, false, 0, 0);
    m_seekBar.setRange(0.0, 1.0, 0.0001);
    m_seekBar.setValue(0.0, juce::dontSendNotification);
    m_seekBar.setColour(juce::Slider::trackColourId,      TechnologicalLookAndFeel::BorderSubtle);
    m_seekBar.setColour(juce::Slider::backgroundColourId, TechnologicalLookAndFeel::BackgroundDark);
    m_seekBar.setColour(juce::Slider::thumbColourId,      TechnologicalLookAndFeel::AccentCyan.withAlpha(0.7f));
    m_seekBar.onDragStart = [this]()   { m_isUserDraggingSeek = true; };
    m_seekBar.onDragEnd   = [this]()   { m_isUserDraggingSeek = false; if (onSeek) onSeek(static_cast<float>(m_seekBar.getValue())); };
    m_seekBar.onValueChange = [this]() { if (m_isUserDraggingSeek && onSeek) onSeek(static_cast<float>(m_seekBar.getValue())); };
    addAndMakeVisible(m_seekBar);

    // ─── Timestamp & Track Title (dim, minimal) ──────────────────────────────
    m_lblTime.setText("00:00 / 00:00", juce::dontSendNotification);
    m_lblTime.setFont(juce::FontOptions(11.0f));
    m_lblTime.setJustificationType(juce::Justification::centredRight);
    m_lblTime.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::TextDim);
    addAndMakeVisible(m_lblTime);

    m_lblTrackTitle.setText("[0/0] No Audio Loaded", juce::dontSendNotification);
    m_lblTrackTitle.setFont(juce::FontOptions(11.0f));
    m_lblTrackTitle.setJustificationType(juce::Justification::centredLeft);
    m_lblTrackTitle.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::TextDim);
    addAndMakeVisible(m_lblTrackTitle);

    // ─── Playlist Button ─────────────────────────────────────────────────────
    m_btnTogglePlaylist.onClick = [this]() { if (onTogglePlaylistClicked) onTogglePlaylistClicked(); };
    addAndMakeVisible(m_btnTogglePlaylist);
}

void AudioTransportBarComponent::paint(juce::Graphics& g) {
    const auto bounds = getLocalBounds().toFloat();
    
    // Background Dark Panel with subtle border
    g.setColour(TechnologicalLookAndFeel::SurfacePanel);
    g.fillRoundedRectangle(bounds, 4.0f);

    g.setColour(TechnologicalLookAndFeel::BorderColor);
    g.drawRoundedRectangle(bounds.reduced(0.5f), 4.0f, 1.0f);
}

void AudioTransportBarComponent::resized() {
    auto bounds = getLocalBounds().reduced(6, 4);

    // Left transport controls
    m_btnPrev.setBounds(bounds.removeFromLeft(42));
    bounds.removeFromLeft(4);
    
    m_btnPlayPause.setBounds(bounds.removeFromLeft(64));
    bounds.removeFromLeft(4);

    m_btnStop.setBounds(bounds.removeFromLeft(48));
    bounds.removeFromLeft(4);

    m_btnNext.setBounds(bounds.removeFromLeft(42));
    bounds.removeFromLeft(4);

    m_btnLoop.setBounds(bounds.removeFromLeft(50));
    bounds.removeFromLeft(12);

    // Right-most controls: Playlist button and Timestamp
    m_btnTogglePlaylist.setBounds(bounds.removeFromRight(110));
    bounds.removeFromRight(10);

    m_lblTime.setBounds(bounds.removeFromRight(95));
    bounds.removeFromRight(10);

    // Center area: Track title and Seek bar stacked vertically
    const int halfH = bounds.getHeight() / 2;
    auto topArea = bounds.removeFromTop(halfH);
    m_lblTrackTitle.setBounds(topArea);
    m_seekBar.setBounds(bounds);
}

void AudioTransportBarComponent::updatePlaybackState(bool isPlaying, 
                                                     bool isLooping, 
                                                     double currentTimeSec, 
                                                     double totalTimeSec, 
                                                     double progressNormalized, 
                                                     const std::string& trackTitle, 
                                                     size_t trackIndex, 
                                                     size_t totalTracks) {
    if (m_currentlyPlaying != isPlaying) {
        m_currentlyPlaying = isPlaying;
        m_btnPlayPause.setButtonText(isPlaying ? "PAUSE" : "PLAY");
        m_btnPlayPause.setColour(juce::TextButton::buttonColourId, 
            isPlaying ? TechnologicalLookAndFeel::AccentEmerald.withAlpha(0.25f) : TechnologicalLookAndFeel::SurfaceHighlight);
    }

    if (m_currentlyLooping != isLooping) {
        m_currentlyLooping = isLooping;
        m_btnLoop.setToggleState(isLooping, juce::dontSendNotification);
        m_btnLoop.setColour(juce::TextButton::buttonColourId, 
            isLooping ? TechnologicalLookAndFeel::AccentAmber.withAlpha(0.3f) : TechnologicalLookAndFeel::SurfaceHighlight);
    }

    if (!m_isUserDraggingSeek) {
        m_seekBar.setValue(progressNormalized, juce::dontSendNotification);
    }

    const std::string timeStr = formatTime(currentTimeSec) + " / " + formatTime(totalTimeSec);
    m_lblTime.setText(timeStr, juce::dontSendNotification);

    std::ostringstream ss;
    ss << "[" << (totalTracks > 0 ? (trackIndex + 1) : 0) << "/" << totalTracks << "] " << trackTitle;
    m_lblTrackTitle.setText(ss.str(), juce::dontSendNotification);

    std::ostringstream plBtnText;
    plBtnText << "PLAYLIST (" << totalTracks << ")";
    m_btnTogglePlaylist.setButtonText(plBtnText.str());
}

std::string AudioTransportBarComponent::formatTime(double seconds) {
    if (seconds < 0.0 || std::isnan(seconds)) {
        seconds = 0.0;
    }
    const int totalSec = static_cast<int>(seconds);
    const int mins = totalSec / 60;
    const int secs = totalSec % 60;

    std::ostringstream ss;
    ss << std::setw(2) << std::setfill('0') << mins << ":"
       << std::setw(2) << std::setfill('0') << secs;
    return ss.str();
}

} // namespace EarTraining::UI
