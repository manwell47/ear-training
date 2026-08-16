#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include "UI/Juce/TechnologicalLookAndFeel.h"
#include "UI/Juce/FrequencyResponseComponent.h"
#include "UI/Juce/TruePeakMeterComponent.h"
#include "UI/Juce/AudioTransportBarComponent.h"
#include "UI/Juce/PlaylistDrawerComponent.h"
#include "UI/Juce/SignalIntegrityComponent.h"
#include "UI/Juce/GameOverOverlay.h"
#include "UI/Juce/FeedbackFlashComponent.h"
#include "Controller/DifficultyController.h"
#include <memory>
#include <array>

namespace EarTraining::JuceBridge {
    class EarTrainingAudioProcessor;
}

namespace EarTraining::UI {

/**
 * @brief Main Surgical EQ Module GUI & AudioProcessorEditor.
 * 
 * Assembles the interactive frequency response spectrum, rotary parameter controls,
 * blind A/B/X trial bar, Bring-Your-Own-Audio file loader, audio transport bar,
 * playlist manager drawer, and True Peak meter with 60 Hz lock-free telemetry polling.
 * 
 * Dynamic Layout: switches between 4-Button (Fácil) and Knob (Normal/Difícil) modes
 * based on the active DifficultyTier.
 */
class SurgicalEQEditorView : public juce::AudioProcessorEditor,
                             public juce::Timer {
public:
    explicit SurgicalEQEditorView(JuceBridge::EarTrainingAudioProcessor& processor);
    ~SurgicalEQEditorView() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    // 60 Hz UI Telemetry Poller (Lock-Free)
    void timerCallback() override;

private:
    void setupUIControls();
    void updateDSPFromControls();
    void synchronizeControlsFromDSP();
    void loadCustomAudioFiles();
    void updateHeaderStats();

    /** Applies visibility rules for the active DifficultyTier layout. */
    void applyDifficultyLayout(Controller::DifficultyTier tier);

    /** Called when a tier combo box item is selected. */
    void onTierChanged();

    /** Handles Start Trial with tier-appropriate reset state. */
    void onStartTrial();

    /** Handles Submit Guess for the active tier (Easy vs Normal/Hard). */
    void onSubmitGuess();

    /** Handles Easy Option audition + single-listen lockout. */
    void onAuditionEasyOption(size_t optionIndex);

    /** Shows the game-over overlay and disables controls. */
    void showGameOver();

    /** Wires TrainingSessionManager callbacks to UI (called once in constructor). */
    void wireSessionCallbacks();

    JuceBridge::EarTrainingAudioProcessor& m_processor;
    TechnologicalLookAndFeel m_lookAndFeel;

    // Audio Format Management for Bring-Your-Own-Audio (BYOA)
    juce::AudioFormatManager m_formatManager;
    std::unique_ptr<juce::FileChooser> m_fileChooser;

    // Visual Graph & Meter Components
    FrequencyResponseComponent m_freqGraph;
    TruePeakMeterComponent m_peakMeter;

    // Audio Player Transport & Playlist Management
    AudioTransportBarComponent m_transportBar;
    PlaylistDrawerComponent m_playlistDrawer;

    // Rotary Parameter Sliders (Normal & Hard modes)
    juce::Slider m_freqSlider;
    juce::Slider m_gainSlider;
    juce::Slider m_qSlider;
    juce::Label m_freqLabel;
    juce::Label m_gainLabel;
    juce::Label m_qLabel;

    // Selectors & Mode Toggles
    juce::ComboBox m_filterTypeBox;
    juce::ComboBox m_sourceSelectBox;
    juce::TextButton m_phaseModeButton{"Minimum Phase (IIR)"};

    // Difficulty Tier Selector
    juce::ComboBox m_tierSelectBox;
    juce::Label m_tierLabel;

    // Easy Mode: 4 Multiple-Choice Option Buttons
    std::array<juce::TextButton, 4> m_easyOptionButtons;
    std::array<juce::Label, 4> m_easyOptionLabels;
    juce::Label m_easyInstructionLabel;

    // Blind A/B/X & Gamification Controls
    juce::TextButton m_btnDirectA{"A (Dry)"};
    juce::TextButton m_btnDirectB{"B (Wet Guess)"};
    juce::TextButton m_btnBlindX{"X (Mystery Target)"};
    juce::TextButton m_btnStartTrial{"Iniciar Trial"};
    juce::TextButton m_btnSubmitGuess{"Confirmar Respuesta"};

    // Status Badges & Feedback Labels
    juce::Label m_headerStatsLabel;
    juce::Label m_feedbackLabel;

    // Signal Integrity (Lives) display — polled at 60 Hz (geometric block HUD)
    SignalIntegrityComponent m_signalIntegrity;
    juce::Label              m_streakLabel;   ///< Shows e.g. "Racha: 5"

    // Rich Game Over overlay (analytics + reboot CTA)
    GameOverOverlay m_gameOverOverlay;

    // Transient feedback flash ("CORRECT" / "MISS" overlay)
    FeedbackFlashComponent m_feedbackFlash;

    // Welcome Dashboard (empty state before first trial)
    juce::TextButton m_btnStartTrainingBig;
    juce::Label      m_welcomeSummaryLabel;

    // Cached values — avoid redundant 60 Hz repaints
    int  m_cachedLives  { 3 };
    bool m_sessionEverStarted { false }; ///< True once the user starts the first trial

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SurgicalEQEditorView)
};

} // namespace EarTraining::UI
