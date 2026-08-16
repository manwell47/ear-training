#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "AudioEngine/Modules/Source/AudioFileReader.h"
#include <functional>
#include <vector>

namespace EarTraining::UI {

/**
 * @brief High-Tech Playlist Management Drawer Component.
 * 
 * Provides multi-track browsing, loading multiple audio files, track selection,
 * duration display, and track deletion.
 */
class PlaylistDrawerComponent : public juce::Component,
                                public juce::ListBoxModel {
public:
    PlaylistDrawerComponent();
    ~PlaylistDrawerComponent() override = default;

    void paint(juce::Graphics& g) override;
    void resized() override;

    // ─── ListBoxModel Callbacks ───────────────────────────────────────────────
    int getNumRows() override;
    void paintListBoxItem(int rowNumber, juce::Graphics& g, int width, int height, bool rowIsSelected) override;
    juce::Component* refreshComponentForRow(int rowNumber, bool isRowSelected, juce::Component* existingComponentToUpdate) override;
    void listBoxItemClicked(int row, const juce::MouseEvent& e) override;
    void listBoxItemDoubleClicked(int row, const juce::MouseEvent& e) override;

    // ─── Control Callbacks ───────────────────────────────────────────────────
    std::function<void(size_t)> onTrackSelected;
    std::function<void(size_t)> onTrackRemoved;
    std::function<void()> onClearPlaylist;
    std::function<void()> onAddFilesClicked;
    std::function<void()> onCloseClicked;

    void updatePlaylist(const std::vector<AudioEngine::AudioFileReader::PlaylistSnapshotItem>& items);

private:
    juce::Label m_lblHeader;
    juce::TextButton m_btnClose{"X"};
    juce::TextButton m_btnAddFiles{"+ Add Audio Files..."};
    juce::TextButton m_btnClear{"Reset List"};

    juce::ListBox m_trackListBox;
    std::vector<AudioEngine::AudioFileReader::PlaylistSnapshotItem> m_items;

    static std::string formatDuration(double seconds);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PlaylistDrawerComponent)
};

} // namespace EarTraining::UI
