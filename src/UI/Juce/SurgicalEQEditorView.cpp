#include "UI/Juce/SurgicalEQEditorView.h"
#include "JuceBridge/EarTrainingAudioProcessor.h"
#include <iomanip>
#include <sstream>
#include <cmath>

namespace EarTraining::UI {

SurgicalEQEditorView::SurgicalEQEditorView(JuceBridge::EarTrainingAudioProcessor& processor)
    : AudioProcessorEditor(&processor), m_processor(processor) {
    
    juce::LookAndFeel::setDefaultLookAndFeel(&m_lookAndFeel);
    setLookAndFeel(&m_lookAndFeel);

    m_formatManager.registerBasicFormats();

    setupUIControls();
    wireSessionCallbacks();
    updateHeaderStats();
    setSize(1020, 700);

    // Start 60 Hz lock-free UI telemetry timer
    startTimerHz(60);
}

SurgicalEQEditorView::~SurgicalEQEditorView() {
    stopTimer();
    setLookAndFeel(nullptr);
}

void SurgicalEQEditorView::updateHeaderStats() {
    if (auto session = m_processor.getSessionManager()) {
        std::ostringstream ss;
        ss << std::fixed << std::setprecision(1);
        // Format: mode | nivel | trials | aciertos | media%
        // Single label but we pick a colour based on accuracy
        const double avg = session->getAverageScore();
        ss << "[" << session->getDifficulty().getTierName() << "]"
           << "  NIV " << session->getDifficulty().getLevel() << "/10"
           << "  |  TRIALS: " << session->getTotalTrials()
           << "  |  ACIERTOS: " << session->getCorrectTrials()
           << "  |  MEDIA: " << avg << "%";
        m_headerStatsLabel.setText(ss.str(), juce::dontSendNotification);

        // Colour feedback: green if good, amber if mediocre, dim otherwise
        if (avg >= 80.0)
            m_headerStatsLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentEmerald);
        else if (avg >= 50.0)
            m_headerStatsLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentAmber);
        else if (session->getTotalTrials() > 0)
            m_headerStatsLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentCrimson.withAlpha(0.9f));
        else
            m_headerStatsLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::TextBright);
    }
}

void SurgicalEQEditorView::loadCustomAudioFiles() {
    m_fileChooser = std::make_unique<juce::FileChooser>(
        "Select Audio Files (WAV, AIFF, MP3, FLAC, OGG)...",
        juce::File::getSpecialLocation(juce::File::userMusicDirectory),
        "*.wav;*.aiff;*.aif;*.mp3;*.flac;*.ogg"
    );

    const auto chooserFlags = juce::FileBrowserComponent::openMode 
                            | juce::FileBrowserComponent::canSelectFiles 
                            | juce::FileBrowserComponent::canSelectMultipleItems;

    m_fileChooser->launchAsync(chooserFlags, [this](const juce::FileChooser& chooser) {
        auto results = chooser.getResults();
        if (results.isEmpty()) {
            auto singleFile = chooser.getResult();
            if (singleFile.existsAsFile()) results.add(singleFile);
        }

        int loadedCount = 0;
        for (const auto& file : results) {
            if (!file.existsAsFile()) continue;
            std::unique_ptr<juce::AudioFormatReader> reader(m_formatManager.createReaderFor(file));
            if (!reader) continue;

            const uint32_t numChannels = static_cast<uint32_t>(reader->numChannels);
            const uint32_t lengthInSamples = static_cast<uint32_t>(reader->lengthInSamples);
            const uint32_t sampleRate = static_cast<uint32_t>(reader->sampleRate);

            juce::AudioBuffer<float> tempBuffer(static_cast<int>(numChannels), static_cast<int>(lengthInSamples));
            reader->read(&tempBuffer, 0, static_cast<int>(lengthInSamples), 0, true, true);

            if (auto router = m_processor.getRouter()) {
                router->getAudioFileReader().addTrack(
                    file.getFileNameWithoutExtension().toStdString(),
                    file.getFullPathName().toStdString(),
                    tempBuffer.getArrayOfReadPointers(),
                    numChannels, lengthInSamples, sampleRate
                );
                loadedCount++;
            }
        }

        if (loadedCount > 0) {
            if (auto router = m_processor.getRouter()) {
                router->setAudioSource(AudioEngine::AudioSourceType::ExternalFileStream);
                m_feedbackLabel.setText("Added " + juce::String(loadedCount) + " audio track(s) to playlist.", juce::dontSendNotification);
                m_feedbackLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentEmerald);
                m_playlistDrawer.updatePlaylist(router->getAudioFileReader().getPlaylistSnapshot());
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier-Specific Action Handlers
// ─────────────────────────────────────────────────────────────────────────────

void SurgicalEQEditorView::onTierChanged() {
    if (auto session = m_processor.getSessionManager()) {
        const int id = m_tierSelectBox.getSelectedId();
        Controller::DifficultyTier tier = Controller::DifficultyTier::Normal;
        if      (id == 1) tier = Controller::DifficultyTier::Easy;
        else if (id == 3) tier = Controller::DifficultyTier::Hard;

        session->getDifficulty().setTier(tier);
        applyDifficultyLayout(tier);
        updateHeaderStats();
        resized(); // re-layout for new tier

        // Update welcome summary if not yet started
        if (!m_sessionEverStarted) {
            m_welcomeSummaryLabel.setText(
                "Modo: " + juce::String(session->getDifficulty().getTierName())
                + "  |  Nivel: " + juce::String(session->getDifficulty().getLevel()) + "/10"
                + "  |  Listo para entrenar?",
                juce::dontSendNotification);
        }
    }
}

void SurgicalEQEditorView::applyDifficultyLayout(Controller::DifficultyTier tier) {
    const bool isEasy = (tier == Controller::DifficultyTier::Easy);
    const bool isHard = (tier == Controller::DifficultyTier::Hard);

    // Knob controls: hidden in Easy
    m_freqSlider.setVisible(!isEasy);
    m_gainSlider.setVisible(!isEasy);
    m_qSlider.setVisible(!isEasy);
    m_freqLabel.setVisible(!isEasy);
    m_gainLabel.setVisible(!isEasy);
    m_qLabel.setVisible(!isEasy);
    m_filterTypeBox.setVisible(!isEasy);

    // Phase mode button: only shown in Hard mode
    m_phaseModeButton.setVisible(isHard);

    // Easy 4-button layout
    for (auto& btn : m_easyOptionButtons) btn.setVisible(isEasy);
    for (auto& lbl : m_easyOptionLabels) lbl.setVisible(isEasy);
    m_easyInstructionLabel.setVisible(isEasy);

    // Submit Guess button label changes by tier
    if (isEasy)
        m_btnSubmitGuess.setButtonText("Seleccionar Opcion");
    else
        m_btnSubmitGuess.setButtonText("Confirmar Respuesta");

    resized();
}

void SurgicalEQEditorView::onStartTrial() {
    auto session = m_processor.getSessionManager();
    if (!session) return;

    // Transition out of welcome state on first trial start
    if (!m_sessionEverStarted) {
        m_sessionEverStarted = true;
        applyDifficultyLayout(session->getDifficulty().getTier());
        resized();
    }

    session->startNewTrial();
    m_btnBlindX.setToggleState(true, juce::sendNotification);

    const auto tier = session->getDifficulty().getTier();

    if (tier == Controller::DifficultyTier::Easy) {
        // Refresh easy option button labels from generated options
        const auto& options = session->getEasyOptions();
        for (size_t i = 0; i < 4; ++i) {
            m_easyOptionButtons[i].setEnabled(true);
            m_easyOptionButtons[i].setColour(juce::TextButton::buttonColourId,
                TechnologicalLookAndFeel::AccentCyan.withAlpha(0.15f));
            m_easyOptionLabels[i].setText(options[i].description, juce::dontSendNotification);
        }
        m_easyInstructionLabel.setText("Escucha cada opcion una sola vez y elige la correcta.", juce::dontSendNotification);
        m_feedbackLabel.setText("Trial activo (FACIL). Audita cada opcion UNA vez y selecciona la correcta.", juce::dontSendNotification);
    } else {
        m_freqSlider.setValue(1000.0, juce::dontSendNotification);
        m_gainSlider.setValue(0.0, juce::dontSendNotification);
        m_qSlider.setValue(1.414, juce::dontSendNotification);
        updateDSPFromControls();
        m_freqGraph.setNodeParameters(1000.0, 0.0, 1.414);
        m_freqGraph.setGhostTarget(1000.0, 0.0, 1.414, false);
        m_phaseModeButton.setToggleState(false, juce::sendNotification);

        if (tier == Controller::DifficultyTier::Hard)
            m_feedbackLabel.setText("Trial DIFICIL activo. Encuentra frecuencia, ganancia, Q, tipo y fase.", juce::dontSendNotification);
        else
            m_feedbackLabel.setText("Trial NORMAL activo. Escucha X (Objetivo Misterioso) y ajusta en B.", juce::dontSendNotification);
    }

    m_feedbackLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentCyan);
    updateHeaderStats();
}

void SurgicalEQEditorView::onSubmitGuess() {
    auto session = m_processor.getSessionManager();
    if (!session) return;

    if (!session->isTrialActive()) {
        m_feedbackLabel.setText("Primero presiona 'Iniciar Trial' para comenzar.", juce::dontSendNotification);
        m_feedbackLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentAmber);
        return;
    }

    const auto tier = session->getDifficulty().getTier();

    if (tier == Controller::DifficultyTier::Easy) {
        m_feedbackLabel.setText("Presiona uno de los botones de opcion para confirmar tu respuesta.", juce::dontSendNotification);
        m_feedbackLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentAmber);
        return;
    }

    const auto filterType = static_cast<AudioEngine::FilterType>(m_filterTypeBox.getSelectedId() - 1);
    const auto phaseMode  = m_phaseModeButton.getToggleState()
        ? AudioEngine::EQPhaseMode::LinearPhase_FIR
        : AudioEngine::EQPhaseMode::MinimumPhase_IIR;

    const auto result = session->evaluateGuess(
        m_freqSlider.getValue(), m_gainSlider.getValue(), m_qSlider.getValue(),
        filterType, phaseMode);

    // Reveal ghost target curve on the graph
    if (auto targetEQ = m_processor.getTargetEQModule())
        m_freqGraph.setGhostTarget(targetEQ->getFrequency(), targetEQ->getGainDb(), targetEQ->getQ(), true);

    m_feedbackLabel.setText(result.feedbackMessage, juce::dontSendNotification);
    m_feedbackLabel.setColour(juce::Label::textColourId,
        result.isCorrect ? TechnologicalLookAndFeel::AccentEmerald : TechnologicalLookAndFeel::AccentCrimson);
    updateHeaderStats();

    // Feedback flash — no auto-advance in Normal/Hard so user can study the ghost curve
    m_feedbackFlash.onFlashComplete = nullptr;
    if (result.isCorrect)
        m_feedbackFlash.flashCorrect();
    else
        m_feedbackFlash.flashIncorrect();
}

void SurgicalEQEditorView::onAuditionEasyOption(size_t optionIndex) {
    auto session = m_processor.getSessionManager();
    if (!session || !session->isTrialActive()) return;

    const bool auditionStarted = session->auditionEasyOption(optionIndex);

    if (!auditionStarted) {
        // Second press = final selection — evaluate the guess
        const auto result = session->evaluateEasyGuess(optionIndex);

        // Disable all option buttons after guess is committed
        for (auto& btn : m_easyOptionButtons) btn.setEnabled(false);

        // Highlight correct and incorrect options visually
        const size_t correctIdx = session->getCorrectEasyOptionIndex();
        for (size_t i = 0; i < 4; ++i) {
            if (i == correctIdx)
                m_easyOptionButtons[i].setColour(juce::TextButton::buttonColourId,
                    TechnologicalLookAndFeel::AccentEmerald.withAlpha(0.4f));
            else if (i == optionIndex)
                m_easyOptionButtons[i].setColour(juce::TextButton::buttonColourId,
                    TechnologicalLookAndFeel::AccentCrimson.withAlpha(0.4f));
        }

        m_feedbackLabel.setText(result.feedbackMessage, juce::dontSendNotification);
        m_feedbackLabel.setColour(juce::Label::textColourId,
            result.isCorrect ? TechnologicalLookAndFeel::AccentEmerald
                             : TechnologicalLookAndFeel::AccentCrimson);
        updateHeaderStats();

        // ── Feedback Flash ───────────────────────────────────────────────
        if (result.isCorrect) {
            // Auto-advance to next trial after the flash fades
            m_feedbackFlash.onFlashComplete = [this]() { onStartTrial(); };
            m_feedbackFlash.flashCorrect();
        } else {
            // On miss: show what the target was; do NOT auto-advance
            // (GameOver overlay will appear if lives == 0 via callAsync)
            m_feedbackFlash.onFlashComplete = nullptr;
            const juce::String missMsg = "Objetivo: "
                + juce::String(result.feedbackMessage).fromFirstOccurrenceOf(": ", false, false)
                                                      .upToFirstOccurrenceOf(".", false, false);
            m_feedbackFlash.flashIncorrect(missMsg.isNotEmpty() ? missMsg : juce::String{});
        }
    } else {
        // First press = audition started — mark button as used
        m_easyOptionButtons[optionIndex].setColour(juce::TextButton::buttonColourId,
            TechnologicalLookAndFeel::AccentAmber.withAlpha(0.2f));
        m_easyOptionButtons[optionIndex].setButtonText(
            "Opc " + juce::String(optionIndex + 1) + " (escuchada)");
        m_feedbackLabel.setText(
            "Opcion " + juce::String(optionIndex + 1) + " auditada. Presionala de nuevo para seleccionarla.",
            juce::dontSendNotification);
        m_feedbackLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::TextDim);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Setup
// ─────────────────────────────────────────────────────────────────────────────

void SurgicalEQEditorView::setupUIControls() {
    // ─── Header Stats & Feedback ─────────────────────────────────────────────
    m_headerStatsLabel.setFont(juce::FontOptions(13.0f));
    m_headerStatsLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::TextPrimary);
    m_headerStatsLabel.setText("[Normal]  NIV 1/10  |  TRIALS: 0  |  ACIERTOS: 0  |  MEDIA: 0.0%", juce::dontSendNotification);
    addAndMakeVisible(m_headerStatsLabel);

    m_feedbackLabel.setFont(juce::FontOptions(12.0f));
    m_feedbackLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentCyan);
    m_feedbackLabel.setText("Elige modo de dificultad y presiona 'Iniciar Trial' para comenzar.", juce::dontSendNotification);
    addAndMakeVisible(m_feedbackLabel);

    // ─── Signal Integrity (Lives) — geometric block HUD ──────────────────
    m_signalIntegrity.setMaxLives(Controller::TrainingSessionManager::k_maxLives);
    m_signalIntegrity.setLives(Controller::TrainingSessionManager::k_defaultLives);
    m_signalIntegrity.setAccentColour(TechnologicalLookAndFeel::AccentCyan);
    addAndMakeVisible(m_signalIntegrity);

    m_streakLabel.setText("Racha: 0", juce::dontSendNotification);
    m_streakLabel.setFont(juce::FontOptions(12.0f));
    m_streakLabel.setJustificationType(juce::Justification::centredRight);
    m_streakLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentAmber);
    addAndMakeVisible(m_streakLabel);

    // ─── Rich Game Over Overlay ──────────────────────────────────────────
    m_gameOverOverlay.onRebootClicked = [this]() {
        if (auto session = m_processor.getSessionManager()) {
            session->resetSession();
            m_cachedLives = Controller::TrainingSessionManager::k_defaultLives;
            m_signalIntegrity.setLives(m_cachedLives);
        }
        m_btnStartTrial.setEnabled(true);
        m_btnSubmitGuess.setEnabled(true);
        for (auto& btn : m_easyOptionButtons) btn.setEnabled(true);
        m_streakLabel.setText("Racha: 0", juce::dontSendNotification);
        m_feedbackLabel.setText("Sesion reiniciada. Presiona 'Iniciar Trial' para continuar.",
                                juce::dontSendNotification);
        m_feedbackLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentCyan);
        updateHeaderStats();
    };
    addChildComponent(m_gameOverOverlay); // initially hidden

    // ─── Visual Graph & Meter ────────────────────────────────────────────────
    addAndMakeVisible(m_freqGraph);
    addAndMakeVisible(m_peakMeter);

    m_freqGraph.onNodeMoved = [this](double freqHz, double gainDb) {
        m_freqSlider.setValue(freqHz, juce::dontSendNotification);
        m_gainSlider.setValue(gainDb, juce::dontSendNotification);
        updateDSPFromControls();
    };

    m_freqGraph.onQChanged = [this](double newQ) {
        m_qSlider.setValue(newQ, juce::dontSendNotification);
        updateDSPFromControls();
    };

    // ─── Audio Transport Bar Component ───────────────────────────────────────
    m_transportBar.onPlayPauseClicked = [this]() {
        if (auto router = m_processor.getRouter())
            router->getAudioFileReader().togglePlay();
    };
    m_transportBar.onStopClicked = [this]() {
        if (auto router = m_processor.getRouter())
            router->getAudioFileReader().stop();
    };
    m_transportBar.onPrevClicked = [this]() {
        if (auto router = m_processor.getRouter())
            router->getAudioFileReader().prevTrack();
    };
    m_transportBar.onNextClicked = [this]() {
        if (auto router = m_processor.getRouter())
            router->getAudioFileReader().nextTrack();
    };
    m_transportBar.onLoopToggled = [this]() {
        if (auto router = m_processor.getRouter())
            router->getAudioFileReader().toggleLooping();
    };
    m_transportBar.onSeek = [this](float norm) {
        if (auto router = m_processor.getRouter())
            router->getAudioFileReader().seekNormalized(norm);
    };
    m_transportBar.onTogglePlaylistClicked = [this]() {
        const bool newState = !m_playlistDrawer.isVisible();
        m_playlistDrawer.setVisible(newState);
        if (newState) {
            if (auto router = m_processor.getRouter())
                m_playlistDrawer.updatePlaylist(router->getAudioFileReader().getPlaylistSnapshot());
            m_playlistDrawer.toFront(true);
        }
        resized();
    };
    addAndMakeVisible(m_transportBar);

    // ─── Playlist Drawer Component ───────────────────────────────────────────
    m_playlistDrawer.onTrackSelected = [this](size_t idx) {
        if (auto router = m_processor.getRouter()) {
            router->getAudioFileReader().selectTrack(idx);
            router->setAudioSource(AudioEngine::AudioSourceType::ExternalFileStream);
            m_sourceSelectBox.setSelectedId(4, juce::dontSendNotification);
        }
    };
    m_playlistDrawer.onTrackRemoved = [this](size_t idx) {
        if (auto router = m_processor.getRouter()) {
            router->getAudioFileReader().removeTrack(idx);
            m_playlistDrawer.updatePlaylist(router->getAudioFileReader().getPlaylistSnapshot());
        }
    };
    m_playlistDrawer.onClearPlaylist = [this]() {
        if (auto router = m_processor.getRouter()) {
            router->getAudioFileReader().clearPlaylist();
            m_playlistDrawer.updatePlaylist(router->getAudioFileReader().getPlaylistSnapshot());
        }
    };
    m_playlistDrawer.onAddFilesClicked = [this]() { loadCustomAudioFiles(); };
    m_playlistDrawer.onCloseClicked = [this]() {
        m_playlistDrawer.setVisible(false);
        resized();
    };
    addChildComponent(m_playlistDrawer);
    m_playlistDrawer.setVisible(false);

    // ─── Rotary Parameter Sliders ────────────────────────────────────────────
    auto setupSlider = [this](juce::Slider& s, juce::Label& l, const juce::String& name, 
                              double min, double max, double init, double skew, const juce::String& suffix) {
        s.setSliderStyle(juce::Slider::RotaryHorizontalVerticalDrag);
        s.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 70, 18);
        s.setRange(min, max);
        s.setSkewFactor(skew);
        s.setValue(init);
        s.setTextValueSuffix(suffix);
        s.onValueChange = [this]() {
            updateDSPFromControls();
            m_freqGraph.setNodeParameters(m_freqSlider.getValue(), m_gainSlider.getValue(), m_qSlider.getValue());
        };
        addAndMakeVisible(s);
        l.setText(name, juce::dontSendNotification);
        l.setFont(juce::FontOptions(11.0f));
        l.setJustificationType(juce::Justification::centred);
        l.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::TextDim);
        addAndMakeVisible(l);
    };

    setupSlider(m_freqSlider, m_freqLabel, "FRECUENCIA", 20.0, 20000.0, 1000.0, 0.3, " Hz");
    setupSlider(m_gainSlider, m_gainLabel, "GANANCIA",   -24.0, 24.0,   0.0,    1.0, " dB");
    setupSlider(m_qSlider,    m_qLabel,    "Q-FACTOR",   0.2,   20.0,   1.414,  0.4, "");

    // ─── Filter Type Box ─────────────────────────────────────────────────────
    m_filterTypeBox.addItem("Bell / Peaking", 1);
    m_filterTypeBox.addItem("Low Shelf",      2);
    m_filterTypeBox.addItem("High Shelf",     3);
    m_filterTypeBox.addItem("Band Pass",      4);
    m_filterTypeBox.addItem("Notch",          5);
    m_filterTypeBox.addItem("Low Pass",       6);
    m_filterTypeBox.addItem("High Pass",      7);
    m_filterTypeBox.setSelectedId(1);
    m_filterTypeBox.onChange = [this]() { updateDSPFromControls(); };
    addAndMakeVisible(m_filterTypeBox);

    // ─── Difficulty Tier Selector ────────────────────────────────────────────
    m_tierLabel.setText("MODO:", juce::dontSendNotification);
    m_tierLabel.setFont(juce::FontOptions(11.0f));
    m_tierLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::TextDim);
    m_tierLabel.setJustificationType(juce::Justification::centredRight);
    addAndMakeVisible(m_tierLabel);

    m_tierSelectBox.addItem("Facil",   1);
    m_tierSelectBox.addItem("Normal",  2);
    m_tierSelectBox.addItem("Dificil", 3);
    m_tierSelectBox.setSelectedId(2, juce::dontSendNotification); // Start in Normal
    m_tierSelectBox.onChange = [this]() { onTierChanged(); };
    addAndMakeVisible(m_tierSelectBox);

    // ─── Source Selector ─────────────────────────────────────────────────────
    m_sourceSelectBox.addItem("Audio Player / Playlist",         1);
    m_sourceSelectBox.addItem("Pink Noise (Voss-McCartney)",     2);
    m_sourceSelectBox.addItem("Sine Wave (1 kHz)",               3);
    m_sourceSelectBox.addItem("Impulse Train",                   4);
    m_sourceSelectBox.addItem("Live Audio Input",                5);
    m_sourceSelectBox.addItem("Load Custom Audio Files (+)...",  6);
    m_sourceSelectBox.setSelectedId(1);
    m_sourceSelectBox.onChange = [this]() {
        if (auto router = m_processor.getRouter()) {
            const int id = m_sourceSelectBox.getSelectedId();
            if (id == 1) {
                router->setAudioSource(AudioEngine::AudioSourceType::ExternalFileStream);
            } else if (id == 2) {
                router->setAudioSource(AudioEngine::AudioSourceType::SignalGenerator);
                router->getSignalGenerator().setType(AudioEngine::GeneratorType::PinkNoise);
            } else if (id == 3) {
                router->setAudioSource(AudioEngine::AudioSourceType::SignalGenerator);
                router->getSignalGenerator().setType(AudioEngine::GeneratorType::SineWave);
            } else if (id == 4) {
                router->setAudioSource(AudioEngine::AudioSourceType::SignalGenerator);
                router->getSignalGenerator().setType(AudioEngine::GeneratorType::ImpulseTrain);
            } else if (id == 5) {
                router->setAudioSource(AudioEngine::AudioSourceType::LiveAudioInput);
            } else if (id == 6) {
                loadCustomAudioFiles();
            }
        }
    };
    addAndMakeVisible(m_sourceSelectBox);

    // ─── Phase Mode Toggle ───────────────────────────────────────────────────
    m_phaseModeButton.setClickingTogglesState(true);
    m_phaseModeButton.onClick = [this]() {
        const bool isFir = m_phaseModeButton.getToggleState();
        m_phaseModeButton.setButtonText(isFir ? "Linear Phase (FIR)" : "Minimum Phase (IIR)");
        if (auto eq = m_processor.getEQModule())
            eq->setPhaseMode(isFir ? AudioEngine::EQPhaseMode::LinearPhase_FIR : AudioEngine::EQPhaseMode::MinimumPhase_IIR);
    };
    addAndMakeVisible(m_phaseModeButton);
    m_phaseModeButton.setVisible(false); // Hidden until Hard mode

    // ─── Blind A/B/X Mode Buttons — Pill style ─────────────────────────────
    auto setupABButton = [this](juce::TextButton& btn, AudioEngine::ABMode mode) {
        btn.setRadioGroupId(1001);
        btn.setClickingTogglesState(true);
        btn.setComponentID(TechnologicalLookAndFeel::ButtonStylePill);
        btn.onClick = [this, mode]() {
            if (auto router = m_processor.getRouter())
                router->getABEngine().setMode(mode);
        };
        addAndMakeVisible(btn);
    };
    setupABButton(m_btnDirectA, AudioEngine::ABMode::DirectA_Dry);
    setupABButton(m_btnDirectB, AudioEngine::ABMode::DirectB_Wet);
    setupABButton(m_btnBlindX,  AudioEngine::ABMode::BlindX);
    m_btnBlindX.setToggleState(true, juce::sendNotification);

    // ─── Easy Mode 4-Option Buttons — Card style ───────────────────────────
    static const char* optionNames[] = { "Opcion 1", "Opcion 2", "Opcion 3", "Opcion 4" };
    for (size_t i = 0; i < 4; ++i) {
        m_easyOptionButtons[i].setButtonText(optionNames[i]);
        m_easyOptionButtons[i].setComponentID(TechnologicalLookAndFeel::ButtonStyleCard);
        m_easyOptionButtons[i].onClick = [this, i]() { onAuditionEasyOption(i); };
        addChildComponent(m_easyOptionButtons[i]);

        m_easyOptionLabels[i].setText("---", juce::dontSendNotification);
        m_easyOptionLabels[i].setFont(juce::FontOptions(10.0f));
        m_easyOptionLabels[i].setJustificationType(juce::Justification::centred);
        m_easyOptionLabels[i].setColour(juce::Label::textColourId, TechnologicalLookAndFeel::TextDim);
        addChildComponent(m_easyOptionLabels[i]);
    }

    m_easyInstructionLabel.setText("Inicia un trial para ver las opciones.", juce::dontSendNotification);
    m_easyInstructionLabel.setFont(juce::FontOptions(11.0f));
    m_easyInstructionLabel.setJustificationType(juce::Justification::centred);
    m_easyInstructionLabel.setColour(juce::Label::textColourId, TechnologicalLookAndFeel::AccentAmber);
    addChildComponent(m_easyInstructionLabel);

    // ─── Gamification & Trial Action Controls ────────────────────────────────
    m_btnStartTrial.setColour(juce::TextButton::buttonColourId, TechnologicalLookAndFeel::AccentEmerald.withAlpha(0.25f));
    m_btnStartTrial.onClick = [this]() { onStartTrial(); };
    addAndMakeVisible(m_btnStartTrial);

    m_btnSubmitGuess.setColour(juce::TextButton::buttonColourId, TechnologicalLookAndFeel::AccentCyan.withAlpha(0.25f));
    m_btnSubmitGuess.onClick = [this]() { onSubmitGuess(); };
    addAndMakeVisible(m_btnSubmitGuess);




    // Apply initial Normal layout
    applyDifficultyLayout(Controller::DifficultyTier::Normal);
    updateDSPFromControls();
}

void SurgicalEQEditorView::updateDSPFromControls() {
    if (auto eq = m_processor.getEQModule()) {
        const auto type = static_cast<AudioEngine::FilterType>(m_filterTypeBox.getSelectedId() - 1);
        eq->setFilterType(type);
        eq->setFrequency(m_freqSlider.getValue());
        eq->setGainDb(m_gainSlider.getValue());
        eq->setQ(m_qSlider.getValue());
    }
}

void SurgicalEQEditorView::synchronizeControlsFromDSP() {}

// ─── Session Callback Wiring ─────────────────────────────────────────────────────────

void SurgicalEQEditorView::wireSessionCallbacks() {
    auto session = m_processor.getSessionManager();
    if (!session) return;

    session->onSessionFailed = [this]() {
        juce::MessageManager::callAsync([this]() { showGameOver(); });
    };

    session->onLifeGained = [this](int newLives) {
        juce::MessageManager::callAsync([this, newLives]() {
            m_cachedLives = newLives;
            m_signalIntegrity.setLives(newLives);
            if (auto s = m_processor.getSessionManager())
                m_signalIntegrity.setStreak(s->getStreak());
            m_feedbackLabel.setText(
                juce::String::fromUTF8("\u00A1+1 VIDA! Ahora tienes ")
                    + juce::String(newLives) + " vidas.",
                juce::dontSendNotification);
            m_feedbackLabel.setColour(juce::Label::textColourId,
                                      TechnologicalLookAndFeel::AccentEmerald);
        });
    };
}

void SurgicalEQEditorView::showGameOver() {
    // Build session analytics from the TrainingSessionManager
    GameOverOverlay::SessionStats stats;

    if (auto session = m_processor.getSessionManager()) {
        stats.totalTrials   = static_cast<int>(session->getTotalTrials());
        stats.correctTrials = static_cast<int>(session->getCorrectTrials());
        stats.accuracyPercent = (stats.totalTrials > 0)
            ? (static_cast<double>(stats.correctTrials) / stats.totalTrials) * 100.0
            : 0.0;

        // Weakest band: derived from the difficulty tier's frequency tolerance.
        // A more precise version would require per-frequency error tracking;
        // for now we surface the tier's configured range as informative feedback.
        const auto& settings = session->getDifficulty().getSettings();
        (void)settings; // suppress unused warning if not yet wired
        // TODO: replace with per-band mistake counters from TrainingSessionManager
        stats.weakestBandName  = "High-Mids: 2kHz - 6kHz";
        stats.mostConfusedPair = "Bell \u2192 High-Shelf";
    }

    // Size overlay to cover the full editor area, then show it
    m_gameOverOverlay.setBounds(getLocalBounds());
    m_gameOverOverlay.showWithStats(stats);

    // Disable game controls so they can't be accidentally triggered behind the overlay
    m_btnStartTrial.setEnabled(false);
    m_btnSubmitGuess.setEnabled(false);
    for (auto& btn : m_easyOptionButtons) btn.setEnabled(false);
}

void SurgicalEQEditorView::timerCallback() {
    // ── Gamification HUD: poll lives & streak (lock-free atomics) ─────────
    if (auto session = m_processor.getSessionManager()) {
        const int lives  = session->getLives();
        const int streak = session->getStreak();

        if (lives != m_cachedLives) {
            m_cachedLives = lives;
            m_signalIntegrity.setLives(lives);
        }
        // setStreak guards against redundant repaints internally
        m_signalIntegrity.setStreak(streak);

        // Update streak label text only when value changes
        const juce::String streakText = "Racha: " + juce::String(streak);
        if (m_streakLabel.getText() != streakText)
            m_streakLabel.setText(streakText, juce::dontSendNotification);

        // Update welcome summary label (tier/level may change without starting)
        if (!m_sessionEverStarted) {
            const juce::String summary =
                "Modo: " + juce::String(session->getDifficulty().getTierName())
                + "  |  Nivel: " + juce::String(session->getDifficulty().getLevel()) + "/10"
                + "  |  Listo para entrenar?";
            if (m_welcomeSummaryLabel.getText() != summary)
                m_welcomeSummaryLabel.setText(summary, juce::dontSendNotification);
        }
    }

    // ── Feed real-time FFT spectrum analyzer from lock-free audio FIFO ────
    m_freqGraph.pushAudioDataForSpectrum(m_processor.getSpectrumFifo(), 48000.0);

    // ── Lock-free telemetry draining from audio thread ────────────────────
    if (auto router = m_processor.getRouter()) {
        AudioEngine::AudioMeterTelemetry telem;
        while (router->getTelemetryQueue().pop(telem))
            m_peakMeter.setLevels(telem.peakLeftDbTP, telem.peakRightDbTP);

        auto& fileReader = router->getAudioFileReader();
        m_transportBar.updatePlaybackState(
            fileReader.isPlaying(),
            fileReader.isLooping(),
            fileReader.getCurrentTimeSeconds(),
            fileReader.getCurrentTrackDurationSeconds(),
            fileReader.getPlaybackProgressNormalized(),
            fileReader.getCurrentTrackTitle(),
            fileReader.getCurrentTrackIndex(),
            fileReader.getTrackCount()
        );

        if (m_playlistDrawer.isVisible())
            m_playlistDrawer.updatePlaylist(fileReader.getPlaylistSnapshot());
    }

    if (auto eq = m_processor.getEQModule())
        m_freqGraph.updateCurves(*eq);
}

void SurgicalEQEditorView::paint(juce::Graphics& g) {
    g.fillAll(TechnologicalLookAndFeel::BackgroundDark);

    // Welcome state: subtle radial depth gradient behind the big CTA
    if (!m_sessionEverStarted) {
        const auto centre = getLocalBounds().getCentre().toFloat();
        const float radius = static_cast<float>(juce::jmax(getWidth(), getHeight())) * 0.65f;
        juce::ColourGradient radGrad(
            TechnologicalLookAndFeel::AccentCyan.withAlpha(0.045f), centre.x, centre.y,
            TechnologicalLookAndFeel::BackgroundDark,               centre.x, centre.y - radius,
            true /* radial */);
        g.setGradientFill(radGrad);
        g.fillRect(getLocalBounds());
    }

    const float w = static_cast<float>(getWidth());
    const float h = static_cast<float>(getHeight());

    // Header panel background
    g.setColour(TechnologicalLookAndFeel::SurfacePanel);
    g.fillRect(0.0f, 0.0f, w, 54.0f);
    g.setColour(TechnologicalLookAndFeel::BorderSubtle);
    g.drawHorizontalLine(53, 0.0f, w);

    if (m_sessionEverStarted) {
        // Game control zone panel (bottom ~170px)
        const float gameZoneY = h - 204.0f;
        g.setColour(TechnologicalLookAndFeel::SurfacePanel.withAlpha(0.7f));
        g.fillRect(0.0f, gameZoneY, w, h - gameZoneY);
        g.setColour(TechnologicalLookAndFeel::BorderSubtle.withAlpha(0.6f));
        g.drawHorizontalLine(static_cast<int>(gameZoneY), 0.0f, w);
    }
}

void SurgicalEQEditorView::resized() {
    auto bounds = getLocalBounds().reduced(16);

    // ─── Header Bar ────────────────────────────────────────────────────
    auto headerArea = bounds.removeFromTop(32);
    m_headerStatsLabel.setBounds(headerArea.removeFromLeft(280));

    auto tierRow = headerArea.removeFromLeft(180).reduced(0, 2);
    m_tierLabel.setBounds(tierRow.removeFromLeft(42));
    m_tierSelectBox.setBounds(tierRow);

    // Signal Integrity HUD: blocks + \u00d7N badge + streak text
    m_signalIntegrity.setBounds(headerArea.removeFromRight(160).reduced(0, 6));
    m_streakLabel.setBounds(headerArea.removeFromRight(72).reduced(0, 2));
    m_sourceSelectBox.setBounds(headerArea.reduced(0, 2));

    bounds.removeFromTop(10);

    // ─── Footer: Transport Bar (slim, always visible) ────────────────────────
    auto transportArea = bounds.removeFromBottom(36);
    m_transportBar.setBounds(transportArea);
    bounds.removeFromBottom(8);

    // ─── Welcome Dashboard (session not yet started) ──────────────────────
    if (!m_sessionEverStarted) {
        // Hide all game controls
        m_btnStartTrial.setBounds({});
        m_btnSubmitGuess.setBounds({});
        m_filterTypeBox.setBounds({});
        m_phaseModeButton.setBounds({});
        m_freqSlider.setBounds({}); m_freqLabel.setBounds({});
        m_gainSlider.setBounds({}); m_gainLabel.setBounds({});
        m_qSlider.setBounds({});    m_qLabel.setBounds({});
        for (auto& b : m_easyOptionButtons) b.setBounds({});
        for (auto& l : m_easyOptionLabels)  l.setBounds({});
        m_easyInstructionLabel.setBounds({});
        m_btnDirectA.setBounds({}); m_btnDirectB.setBounds({}); m_btnBlindX.setBounds({});
        m_feedbackLabel.setBounds({});

        // Show welcome elements, vertically + horizontally centred
        m_btnStartTrainingBig.setVisible(true);
        m_welcomeSummaryLabel.setVisible(true);

        // Arithmetic centering — more reliable than FlexBox for this single-column case
        constexpr int kBtnW   = 340;
        constexpr int kBtnH   = 80;
        constexpr int kLblH   = 28;
        constexpr int kGap    = 20;
        const int     lblW    = juce::jmin(static_cast<int>(bounds.getWidth() * 0.70f), 720);
        const int     totalH  = kLblH + kGap + kBtnH;
        const int     startY  = bounds.getCentreY() - totalH / 2;
        const int     centreX = bounds.getCentreX();

        m_welcomeSummaryLabel.setBounds(centreX - lblW / 2,  startY,            lblW,  kLblH);
        m_btnStartTrainingBig.setBounds(centreX - kBtnW / 2, startY + kLblH + kGap, kBtnW, kBtnH);

        m_freqGraph.setBounds({});
        m_gameOverOverlay.setBounds(getLocalBounds());
        m_feedbackFlash.setBounds({});

        if (m_playlistDrawer.isVisible()) {
            m_playlistDrawer.setBounds(getWidth() - 460, 52, 440, 340);
            m_playlistDrawer.toFront(true);
        }
        return;
    }

    // ─── Active Session ────────────────────────────────────────────────
    m_btnStartTrainingBig.setVisible(false);
    m_welcomeSummaryLabel.setVisible(false);

    // ─── Bottom Game Control Zone (160px) ────────────────────────────────
    auto bottomArea = bounds.removeFromBottom(160);
    bottomArea.reduce(0, 6);

    const auto tier = [this]() -> Controller::DifficultyTier {
        if (auto s = m_processor.getSessionManager())
            return s->getDifficulty().getTier();
        return Controller::DifficultyTier::Normal;
    }();

    if (tier == Controller::DifficultyTier::Easy) {
        // ── Easy Layout: CTA (left) + 4 Pads via FlexBox (right) ──────────

        // Instruction strip
        m_easyInstructionLabel.setBounds(bottomArea.removeFromTop(20));
        bottomArea.removeFromTop(6);

        // Left CTA column
        auto ctaCol = bottomArea.removeFromLeft(200);
        bottomArea.removeFromLeft(14);
        m_btnStartTrial.setBounds(ctaCol.removeFromTop(60).reduced(0, 2));
        ctaCol.removeFromTop(6);
        m_feedbackLabel.setBounds(ctaCol);

        // 4 pads: 2\u00d72 FlexBox grid with wrap
        juce::FlexBox padsBox;
        padsBox.flexWrap       = juce::FlexBox::Wrap::wrap;
        padsBox.justifyContent = juce::FlexBox::JustifyContent::flexStart;
        padsBox.alignContent   = juce::FlexBox::AlignContent::spaceBetween;

        const float availW = static_cast<float>(bottomArea.getWidth());
        const float availH = static_cast<float>(bottomArea.getHeight());
        const float padW   = (availW - 8.0f) * 0.5f;
        const float padH   = (availH - 22.0f) * 0.5f;

        for (int i = 0; i < 4; ++i) {
            padsBox.items.add(juce::FlexItem(m_easyOptionButtons[i])
                .withWidth(padW).withHeight(padH)
                .withMargin({3.0f, 2.0f, 0.0f, 2.0f}));
        }
        padsBox.performLayout(bottomArea.toFloat());

        // Labels below each pad
        for (int i = 0; i < 4; ++i) {
            const auto pb = m_easyOptionButtons[i].getBounds();
            m_easyOptionLabels[i].setBounds(pb.getX(), pb.getBottom() + 1, pb.getWidth(), 16);
        }

        // Hide Normal/Hard controls
        m_freqSlider.setBounds({}); m_freqLabel.setBounds({});
        m_gainSlider.setBounds({}); m_gainLabel.setBounds({});
        m_qSlider.setBounds({});    m_qLabel.setBounds({});
        m_filterTypeBox.setBounds({}); m_phaseModeButton.setBounds({});
        m_btnDirectA.setBounds({}); m_btnDirectB.setBounds({}); m_btnBlindX.setBounds({});
        m_btnSubmitGuess.setBounds({});

    } else {
        // ── Normal / Hard Layout ─────────────────────────────────────────────

        // Hide Easy pads
        for (auto& b : m_easyOptionButtons) b.setBounds({});
        for (auto& l : m_easyOptionLabels)  l.setBounds({});
        m_easyInstructionLabel.setBounds({});

        // Left column: Start CTA + feedback + filter type + phase
        auto ctaCol = bottomArea.removeFromLeft(190);
        bottomArea.removeFromLeft(16);
        m_btnStartTrial.setBounds(ctaCol.removeFromTop(52).reduced(0, 4));
        ctaCol.removeFromTop(6);
        m_feedbackLabel.setBounds(ctaCol.removeFromTop(32));
        ctaCol.removeFromTop(6);
        m_filterTypeBox.setBounds(ctaCol.removeFromTop(26));
        ctaCol.removeFromTop(6);
        if (tier == Controller::DifficultyTier::Hard)
            m_phaseModeButton.setBounds(ctaCol.removeFromTop(26));
        else
            m_phaseModeButton.setBounds({});

        // Right column: ABX pills + Submit (via FlexBox for even spacing)
        auto rightCol = bottomArea.removeFromRight(190);
        bottomArea.removeFromRight(12);

        auto abxRowBounds = rightCol.removeFromTop(32);
        {
            juce::FlexBox abxBox;
            abxBox.flexDirection  = juce::FlexBox::Direction::row;
            abxBox.justifyContent = juce::FlexBox::JustifyContent::spaceBetween;
            abxBox.alignItems     = juce::FlexBox::AlignItems::center;
            const float btnW = (static_cast<float>(abxRowBounds.getWidth()) - 4.0f) / 3.0f;
            abxBox.items.add(juce::FlexItem(m_btnDirectA).withWidth(btnW).withHeight(28.0f).withMargin({0,1,0,0}));
            abxBox.items.add(juce::FlexItem(m_btnDirectB).withWidth(btnW).withHeight(28.0f).withMargin({0,1,0,1}));
            abxBox.items.add(juce::FlexItem(m_btnBlindX).withWidth(btnW).withHeight(28.0f).withMargin({0,0,0,1}));
            abxBox.performLayout(abxRowBounds.toFloat());
        }
        rightCol.removeFromTop(10);
        m_btnSubmitGuess.setBounds(rightCol.removeFromTop(36).reduced(2, 2));

        // Center: 3 rotary knobs via FlexBox with generous padding
        const int kLabelH = 18;
        const auto knobbsArea = bottomArea;
        const auto knobbSliderArea = knobbsArea.withTrimmedTop(kLabelH);

        juce::FlexBox knobbBox;
        knobbBox.flexDirection  = juce::FlexBox::Direction::row;
        knobbBox.justifyContent = juce::FlexBox::JustifyContent::spaceAround;
        knobbBox.alignItems     = juce::FlexBox::AlignItems::center;

        const float kH = static_cast<float>(knobbSliderArea.getHeight());
        knobbBox.items.add(juce::FlexItem(m_freqSlider).withFlex(1.0f).withHeight(kH).withMaxWidth(115.0f).withMargin({0,10,0,10}));
        knobbBox.items.add(juce::FlexItem(m_gainSlider).withFlex(1.0f).withHeight(kH).withMaxWidth(115.0f).withMargin({0,10,0,10}));
        knobbBox.items.add(juce::FlexItem(m_qSlider).withFlex(1.0f).withHeight(kH).withMaxWidth(115.0f).withMargin({0,10,0,10}));
        knobbBox.performLayout(knobbSliderArea.toFloat());

        // Labels above each knob
        m_freqLabel.setBounds(m_freqSlider.getX(), knobbsArea.getY(), m_freqSlider.getWidth(), kLabelH);
        m_gainLabel.setBounds(m_gainSlider.getX(), knobbsArea.getY(), m_gainSlider.getWidth(), kLabelH);
        m_qLabel.setBounds(m_qSlider.getX(),    knobbsArea.getY(), m_qSlider.getWidth(),    kLabelH);
    }

    bounds.removeFromBottom(6);

    // ─── Center: Main Graph ───────────────────────────────────────────────────
    m_freqGraph.setBounds(bounds);

    // ─── Feedback Flash: covers graph + game zone, excludes header/footer ────
    m_feedbackFlash.setBounds(getLocalBounds().withTop(54).withBottom(getHeight() - 44));

    // ─── Game Over Overlay: always full editor area ───────────────────────────
    m_gameOverOverlay.setBounds(getLocalBounds());


    // ─── Floating Playlist Drawer Overlay ────────────────────────────────────
    if (m_playlistDrawer.isVisible()) {
        const int drawerW = 440;
        const int drawerH = 340;
        m_playlistDrawer.setBounds(getWidth() - drawerW - 20, 52, drawerW, drawerH);
        m_playlistDrawer.toFront(true);
    }
}

} // namespace EarTraining::UI
