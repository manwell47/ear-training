#include "UI/Juce/PlaylistDrawerComponent.h"
#include "UI/Juce/TechnologicalLookAndFeel.h"
#include <iomanip>
#include <sstream>
#include <cmath>

namespace EarTraining::UI {

namespace {

class TrackRowComponent : public juce::Component {
public:
    TrackRowComponent(std::function<void(size_t)> onSelect, std::function<void(size_t)> onRemove)
        : m_onSelect(std::move(onSelect)), m_onRemove(std::move(onRemove)) {
        
        m_lblStatus.setFont(juce::FontOptions(12.0f, juce::Font::bold));
        m_lblStatus.setJustificationType(juce::Justification::centred);
        addAndMakeVisible(m_lblStatus);

        m_lblTitle.setFont(juce::FontOptions(13.0f, juce::Font::plain));
        m_lblTitle.setJustificationType(juce::Justification::centredLeft);
        addAndMakeVisible(m_lblTitle);

        m_lblDuration.setFont(juce::FontOptions(12.0f, juce::Font::plain));
        m_lblDuration.setJustificationType(juce::Justification::centredRight);
        m_lblDuration.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::TextDim);
        addAndMakeVisible(m_lblDuration);

        m_btnRemove.setButtonText("x");
        m_btnRemove.setColour(juce::TextButton::buttonColourId, juce::Colours::transparentBlack);
        m_btnRemove.setColour(juce::TextButton::textColourOffId, TechnologicalLookAndFeel::AccentCrimson);
        m_btnRemove.onClick = [this]() {
            if (m_onRemove) m_onRemove(m_rowIndex);
        };
        addAndMakeVisible(m_btnRemove);
    }

    void update(size_t rowIndex, const AudioEngine::AudioFileReader::PlaylistSnapshotItem& item) {
        m_rowIndex = rowIndex;
        m_isCurrent = item.isCurrent;

        if (item.isCurrent) {
            m_lblStatus.setText(">", juce::dontSendNotification);
            m_lblStatus.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentEmerald);
            m_lblTitle.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentEmerald);
        } else {
            std::ostringstream ss;
            ss << (rowIndex + 1);
            m_lblStatus.setText(ss.str(), juce::dontSendNotification);
            m_lblStatus.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::TextDim);
            m_lblTitle.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::TextBright);
        }

        m_lblTitle.setText(item.title, juce::dontSendNotification);
        
        const int totalSec = static_cast<int>(std::max(0.0, item.durationSeconds));
        std::ostringstream timeSs;
        timeSs << std::setw(2) << std::setfill('0') << (totalSec / 60) << ":"
               << std::setw(2) << std::setfill('0') << (totalSec % 60);
        m_lblDuration.setText(timeSs.str(), juce::dontSendNotification);

        // Hide remove button for item 0 if only 1 item exists
        m_btnRemove.setVisible(true);
        repaint();
    }

    void paint(juce::Graphics& g) override {
        const auto bounds = getLocalBounds().toFloat();
        if (m_isCurrent) {
            g.setColour(TechnologicalLookAndFeel::AccentEmerald.withAlpha(0.12f));
            g.fillRoundedRectangle(bounds.reduced(2.0f, 1.0f), 3.0f);
            g.setColour(TechnologicalLookAndFeel::AccentEmerald.withAlpha(0.4f));
            g.drawRoundedRectangle(bounds.reduced(2.0f, 1.0f), 3.0f, 1.0f);
        } else if (isMouseOver(true)) {
            g.setColour(TechnologicalLookAndFeel::SurfaceHighlight.withAlpha(0.5f));
            g.fillRoundedRectangle(bounds.reduced(2.0f, 1.0f), 3.0f);
        }
    }

    void mouseDown(const juce::MouseEvent&) override {
        if (m_onSelect) {
            m_onSelect(m_rowIndex);
        }
    }

    void resized() override {
        auto bounds = getLocalBounds().reduced(4, 2);
        m_lblStatus.setBounds(bounds.removeFromLeft(28));
        bounds.removeFromLeft(4);

        m_btnRemove.setBounds(bounds.removeFromRight(22).reduced(1));
        bounds.removeFromRight(6);

        m_lblDuration.setBounds(bounds.removeFromRight(50));
        bounds.removeFromRight(8);

        m_lblTitle.setBounds(bounds);
    }

private:
    size_t m_rowIndex{0};
    bool m_isCurrent{false};
    std::function<void(size_t)> m_onSelect;
    std::function<void(size_t)> m_onRemove;

    juce::Label m_lblStatus;
    juce::Label m_lblTitle;
    juce::Label m_lblDuration;
    juce::TextButton m_btnRemove;
};

} // namespace

PlaylistDrawerComponent::PlaylistDrawerComponent() {
    // ─── Header ──────────────────────────────────────────────────────────────
    m_lblHeader.setText("AUDIO PLAYLIST MANAGER", juce::dontSendNotification);
    m_lblHeader.setFont(juce::FontOptions(14.0f, juce::Font::bold));
    m_lblHeader.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentCyan);
    addAndMakeVisible(m_lblHeader);

    m_btnClose.setButtonText("X");
    m_btnClose.setColour(juce::TextButton::buttonColourId, TechnologicalLookAndFeel::SurfaceHighlight);
    m_btnClose.onClick = [this]() {
        if (onCloseClicked) onCloseClicked();
    };
    addAndMakeVisible(m_btnClose);

    // ─── Actions ─────────────────────────────────────────────────────────────
    m_btnAddFiles.onClick = [this]() {
        if (onAddFilesClicked) onAddFilesClicked();
    };
    m_btnAddFiles.setColour(juce::TextButton::buttonColourId, TechnologicalLookAndFeel::AccentEmerald.withAlpha(0.25f));
    addAndMakeVisible(m_btnAddFiles);

    m_btnClear.onClick = [this]() {
        if (onClearPlaylist) onClearPlaylist();
    };
    m_btnClear.setColour(juce::TextButton::buttonColourId, TechnologicalLookAndFeel::SurfaceHighlight);
    addAndMakeVisible(m_btnClear);

    // ─── ListBox ─────────────────────────────────────────────────────────────
    m_trackListBox.setModel(this);
    m_trackListBox.setRowHeight(32);
    m_trackListBox.setColour(juce::ListBox::backgroundColourId, juce::Colour(0xff0e131a));
    m_trackListBox.setColour(juce::ListBox::outlineColourId, TechnologicalLookAndFeel::BorderColor);
    addAndMakeVisible(m_trackListBox);
}

void PlaylistDrawerComponent::paint(juce::Graphics& g) {
    const auto bounds = getLocalBounds().toFloat();

    // Dark glass background panel with glowing cyan outline
    g.setColour(juce::Colour(0xf0111620));
    g.fillRoundedRectangle(bounds, 6.0f);

    g.setColour(TechnologicalLookAndFeel::BorderColor);
    g.drawRoundedRectangle(bounds.reduced(0.5f), 6.0f, 1.5f);
}

void PlaylistDrawerComponent::resized() {
    auto bounds = getLocalBounds().reduced(10, 8);

    // Top Header row
    auto headerRow = bounds.removeFromTop(26);
    m_btnClose.setBounds(headerRow.removeFromRight(26));
    m_lblHeader.setBounds(headerRow);
    bounds.removeFromTop(8);

    // Action buttons row
    auto actionRow = bounds.removeFromTop(28);
    m_btnAddFiles.setBounds(actionRow.removeFromLeft(160));
    actionRow.removeFromLeft(8);
    m_btnClear.setBounds(actionRow.removeFromLeft(90));
    bounds.removeFromTop(8);

    // Main ListBox
    m_trackListBox.setBounds(bounds);
}

int PlaylistDrawerComponent::getNumRows() {
    return static_cast<int>(m_items.size());
}

void PlaylistDrawerComponent::paintListBoxItem(int /*rowNumber*/, juce::Graphics& /*g*/, int /*width*/, int /*height*/, bool /*rowIsSelected*/) {
    // Custom component handles drawing
}

juce::Component* PlaylistDrawerComponent::refreshComponentForRow(int rowNumber, bool /*isRowSelected*/, juce::Component* existingComponentToUpdate) {
    auto* rowComp = dynamic_cast<TrackRowComponent*>(existingComponentToUpdate);
    if (rowComp == nullptr) {
        rowComp = new TrackRowComponent(
            [this](size_t idx) { if (onTrackSelected) onTrackSelected(idx); },
            [this](size_t idx) { if (onTrackRemoved) onTrackRemoved(idx); }
        );
    }

    if (rowNumber >= 0 && rowNumber < static_cast<int>(m_items.size())) {
        rowComp->update(static_cast<size_t>(rowNumber), m_items[static_cast<size_t>(rowNumber)]);
    }

    return rowComp;
}

void PlaylistDrawerComponent::listBoxItemClicked(int row, const juce::MouseEvent&) {
    if (row >= 0 && row < static_cast<int>(m_items.size())) {
        if (onTrackSelected) {
            onTrackSelected(static_cast<size_t>(row));
        }
    }
}

void PlaylistDrawerComponent::listBoxItemDoubleClicked(int row, const juce::MouseEvent&) {
    if (row >= 0 && row < static_cast<int>(m_items.size())) {
        if (onTrackSelected) {
            onTrackSelected(static_cast<size_t>(row));
        }
    }
}

void PlaylistDrawerComponent::updatePlaylist(const std::vector<AudioEngine::AudioFileReader::PlaylistSnapshotItem>& items) {
    m_items = items;
    m_trackListBox.updateContent();
    m_trackListBox.repaint();
}

std::string PlaylistDrawerComponent::formatDuration(double seconds) {
    if (seconds < 0.0 || std::isnan(seconds)) seconds = 0.0;
    const int totalSec = static_cast<int>(seconds);
    const int mins = totalSec / 60;
    const int secs = totalSec % 60;
    std::ostringstream ss;
    ss << std::setw(2) << std::setfill('0') << mins << ":"
       << std::setw(2) << std::setfill('0') << secs;
    return ss.str();
}

} // namespace EarTraining::UI
