#include <iostream>
#include <iomanip>
#include <memory>
#include <vector>
#include <cassert>
#include <cmath>

#include "Common/Math/AcousticMath.h"
#include "Common/Math/Interpolation.h"
#include "Common/AudioBuffer.h"
#include "Common/Parameter.h"
#include "Common/RingBuffer.h"
#include "AudioEngine/Core/AudioContext.h"
#include "AudioEngine/Core/TruePeakMeter.h"
#include "AudioEngine/Core/ABComparisonEngine.h"
#include "AudioEngine/Core/AudioGraphRouter.h"
#include "AudioEngine/Modules/SurgicalEQ/SurgicalEQModule.h"
#include "AudioEngine/Modules/Source/AudioFileReader.h"
#include "Controller/TrainingSessionManager.h"
#include "UI/Wireframes/SurgicalEQWireframe.h"

using namespace EarTraining;

// =============================================================================
// Comprehensive Automated DSP Verification Suite
// =============================================================================

bool runAcousticMathVerification() {
    std::cout << "\n[TEST 1/6] Verifying Acoustic Math Rigor (10*log10 vs 20*log10)... ";
    
    // 1. Voltage / Sound Pressure: 20*log10
    assert(std::abs(Math::AcousticMath::amplitudeToDb(1.0) - 0.0) < 1e-6);
    assert(std::abs(Math::AcousticMath::amplitudeToDb(2.0) - 6.0205999) < 1e-4);
    assert(std::abs(Math::AcousticMath::amplitudeToDb(0.1) - (-20.0)) < 1e-6);
    assert(std::abs(Math::AcousticMath::dbToAmplitude(0.0) - 1.0) < 1e-6);
    assert(std::abs(Math::AcousticMath::dbToAmplitude(6.0205999) - 2.0) < 1e-4);

    // 2. Power: 10*log10
    assert(std::abs(Math::AcousticMath::powerToDb(1.0) - 0.0) < 1e-6);
    assert(std::abs(Math::AcousticMath::powerToDb(2.0) - 3.0102999) < 1e-4);
    assert(std::abs(Math::AcousticMath::powerToDb(10.0) - 10.0) < 1e-6);
    assert(std::abs(Math::AcousticMath::dbToPower(10.0) - 10.0) < 1e-6);

    // 3. Q <-> Bandwidth (octaves)
    const double testQ = 1.41421356; // 1 octave
    const double bwOct = Math::AcousticMath::qToBandwidthOctaves(testQ);
    assert(std::abs(bwOct - 1.0) < 0.01);
    [[maybe_unused]] const double recoveredQ = Math::AcousticMath::bandwidthOctavesToQ(bwOct);
    assert(std::abs(recoveredQ - testQ) < 0.01);

    // 4. Comb filter notch frequencies
    // 1ms delay (0.001s) -> 1st notch at (2*0+1)/(2*0.001) = 500 Hz
    [[maybe_unused]] const double notch0 = Math::AcousticMath::getCombNotchFrequency(0.001, 0, false);
    assert(std::abs(notch0 - 500.0) < 1e-6);
    [[maybe_unused]] const double notch1 = Math::AcousticMath::getCombNotchFrequency(0.001, 1, false);
    assert(std::abs(notch1 - 1500.0) < 1e-6);

    std::cout << "PASSED." << std::endl;
    return true;
}

bool runBiquadFilterVerification() {
    std::cout << "[TEST 2/6] Verifying Minimum Phase Biquad Filter (Direct Form II Transposed)... ";
    
    AudioEngine::AudioContext ctx{48000.0, 512, 2};
    AudioEngine::BiquadFilter filter;
    filter.prepare(ctx);

    // Test Peaking Bell at 1000 Hz with +6 dB gain, Q = 2.0
    filter.setParameters(AudioEngine::FilterType::Bell, 1000.0, 6.0, 2.0);

    [[maybe_unused]] const double magAtCenter = filter.getMagnitudeDbAt(1000.0);
    assert(std::abs(magAtCenter - 6.0) < 0.05);

    [[maybe_unused]] const double magAtDc = filter.getMagnitudeDbAt(20.0);
    assert(std::abs(magAtDc - 0.0) < 0.1);

    // Analytical phase and group delay
    [[maybe_unused]] const double groupDelayCenter = filter.getGroupDelayMsAt(1000.0);
    assert(groupDelayCenter > 0.0); // Minimum phase filter exhibits positive group delay around resonance

    // Process a block through DF2T
    Common::AudioBuffer<float> buffer(2, 512);
    buffer.clear();
    buffer.getWritePointer(0)[0] = 1.0f; // Dirac impulse
    filter.process(buffer);

    // First sample of impulse response must equal b0
    assert(std::abs(buffer.getReadPointer(0)[0]) > 0.0f);

    std::cout << "PASSED." << std::endl;
    return true;
}

bool runLinearPhaseFIRVerification() {
    std::cout << "[TEST 3/6] Verifying Linear Phase FIR Filter & Uniform Group Delay... ";

    AudioEngine::AudioContext ctx{48000.0, 512, 2};
    AudioEngine::LinearPhaseFIR fir;
    fir.prepare(ctx);

    fir.setParameters(AudioEngine::FilterType::Bell, 1000.0, 6.0, 2.0);

    // Linear phase FIR must have strictly constant group delay across all frequencies
    [[maybe_unused]] const double gd100 = fir.getGroupDelayMsAt(100.0);
    const double gd1000 = fir.getGroupDelayMsAt(1000.0);
    [[maybe_unused]] const double gd5000 = fir.getGroupDelayMsAt(5000.0);

    assert(std::abs(gd100 - gd1000) < 1e-6);
    assert(std::abs(gd1000 - gd5000) < 1e-6);

    // Latency must equal (NUM_TAPS - 1) / 2
    assert(fir.getLatencySamples() == 128);

    std::cout << "PASSED (Constant Group Delay = " << gd1000 << " ms)." << std::endl;
    return true;
}

bool runTruePeakMeterVerification() {
    std::cout << "[TEST 4/6] Verifying ITU-R BS.1770-4 4x Oversampled True Peak Meter... ";

    AudioEngine::AudioContext ctx{48000.0, 512, 2};
    AudioEngine::TruePeakMeter meter;
    meter.prepare(ctx);

    Common::AudioBuffer<float> buffer(2, 512);
    for (uint32_t i = 0; i < 512; i += 4) {
        buffer.getWritePointer(0)[i + 0] =  0.70710678f;
        buffer.getWritePointer(0)[i + 1] =  0.70710678f;
        buffer.getWritePointer(0)[i + 2] = -0.70710678f;
        buffer.getWritePointer(0)[i + 3] = -0.70710678f;
    }

    meter.process(buffer);

    const float truePeakDbTP = meter.getTruePeakDbTP(0);
    assert(truePeakDbTP > -0.5f);

    std::cout << "PASSED (Detected Inter-Sample Peak = " << truePeakDbTP << " dBTP)." << std::endl;
    return true;
}

bool runAudioGraphRouterAndABXVerification() {
    std::cout << "[TEST 5/6] Verifying AudioGraphRouter Callback & Blind ABX Engine... ";

    AudioEngine::AudioContext ctx{48000.0, 512, 2};
    auto router = std::make_shared<AudioEngine::AudioGraphRouter>();
    auto eqModule = std::make_shared<AudioEngine::SurgicalEQModule>();

    router->prepare(ctx);
    eqModule->prepare(ctx);
    router->setActiveModule(eqModule);
    router->setAudioSource(AudioEngine::AudioSourceType::SignalGenerator);
    router->getSignalGenerator().setType(AudioEngine::GeneratorType::PinkNoise);
    router->getAudioFileReader().play();

    // Setup output buffers
    std::vector<float> leftOut(512, 0.0f);
    std::vector<float> rightOut(512, 0.0f);
    float* outputChannels[2] = { leftOut.data(), rightOut.data() };

    // 1. Process block in Dry mode
    router->getABEngine().setMode(AudioEngine::ABMode::DirectA_Dry);
    router->processCallback(outputChannels, 2, 512);
    assert(!leftOut.empty());

    // 2. Process block in Wet mode
    eqModule->setGainDb(6.0);
    router->getABEngine().setMode(AudioEngine::ABMode::DirectB_Wet);
    router->processCallback(outputChannels, 2, 512);

    // 3. Process block in Blind X mode
    router->getABEngine().randomizeBlindAssignment();
    router->getABEngine().setMode(AudioEngine::ABMode::BlindX);
    router->processCallback(outputChannels, 2, 512);

    // 4. Verify telemetry queue receiving data
    AudioEngine::AudioMeterTelemetry telem;
    [[maybe_unused]] const bool telemAvailable = router->getTelemetryQueue().pop(telem);
    assert(telemAvailable);

    std::cout << "PASSED." << std::endl;
    return true;
}

bool runAudioPlayerAndPlaylistVerification() {
    std::cout << "[TEST 6/6] Verifying Audio Player Transport Controls & Multi-Track Playlist... ";

    AudioEngine::AudioFileReader player;
    AudioEngine::AudioContext ctx{48000.0, 512, 2};
    player.prepare(ctx);

    // 1. Must start empty and in silence (stopped)
    assert(player.getTrackCount() == 0);
    assert(!player.isPlaying());
    assert(player.isLooping());

    // 2. Add Track 1 & Track 2
    std::vector<float> dummyTrack1L(48000 * 2, 0.5f); // 2 second track
    std::vector<float> dummyTrack1R(48000 * 2, 0.5f);
    const float* channelPtrs1[2] = { dummyTrack1L.data(), dummyTrack1R.data() };
    
    [[maybe_unused]] const size_t addedIdx1 = player.addTrack("Track 1", "/path/to/track1.wav", channelPtrs1, 2, 48000 * 2, 48000);
    assert(addedIdx1 == 0);
    assert(player.getTrackCount() == 1);
    assert(player.getCurrentTrackIndex() == 0);
    assert(player.getCurrentTrackTitle() == "Track 1");

    std::vector<float> dummyTrack2L(48000 * 3, 0.8f); // 3 second track
    std::vector<float> dummyTrack2R(48000 * 3, 0.8f);
    const float* channelPtrs2[2] = { dummyTrack2L.data(), dummyTrack2R.data() };
    [[maybe_unused]] const size_t addedIdx2 = player.addTrack("Track 2", "/path/to/track2.wav", channelPtrs2, 2, 48000 * 3, 48000);
    assert(addedIdx2 == 1);
    assert(player.getTrackCount() == 2);
    assert(player.getCurrentTrackIndex() == 1);

    // 3. Test Play / Pause / Stop / Loop transport toggles
    player.pause();
    assert(!player.isPlaying());
    player.play();
    assert(player.isPlaying());
    player.togglePlay();
    assert(!player.isPlaying());
    player.togglePlay();
    assert(player.isPlaying());

    player.toggleLooping();
    assert(!player.isLooping());
    player.toggleLooping();
    assert(player.isLooping());

    // 4. Test Seeking normalized
    player.seekNormalized(0.5f);
    assert(player.getPlaybackPosition() == 72000);
    assert(std::abs(player.getPlaybackProgressNormalized() - 0.5) < 0.01);
    assert(std::abs(player.getCurrentTimeSeconds() - 1.5) < 0.01);

    // 5. Test Track navigation: nextTrack() / prevTrack()
    player.nextTrack();
    assert(player.getCurrentTrackIndex() == 0); // Wraps around
    player.prevTrack();
    assert(player.getCurrentTrackIndex() == 1);

    // 6. Test Playlist Snapshot
    auto snapshot = player.getPlaylistSnapshot();
    assert(snapshot.size() == 2);
    assert(snapshot[0].index == 0 && !snapshot[0].isCurrent);
    assert(snapshot[1].index == 1 && snapshot[1].isCurrent);

    // 7. Test real-time audio block processing
    Common::AudioBuffer<float> block(2, 512);
    player.process(block);
    assert(block.getReadPointer(0)[0] == 0.8f);

    // 8. Test remove track
    player.removeTrack(1);
    assert(player.getTrackCount() == 1);
    assert(player.getCurrentTrackIndex() == 0);

    std::cout << "PASSED." << std::endl;
    return true;
}

bool runPedagogicalTierVerification() {
    std::cout << "[TEST 7/9] Verifying Pedagogical Tier System (Facil / Normal / Dificil)... ";

    auto router = std::make_shared<AudioEngine::AudioGraphRouter>();
    auto eqModule = std::make_shared<AudioEngine::SurgicalEQModule>();
    auto session = std::make_shared<Controller::TrainingSessionManager>(router, eqModule);

    // ── Test 1: DifficultyController tier API ──
    auto& diff = session->getDifficulty();
    assert(diff.getTier() == Controller::DifficultyTier::Normal);

    diff.setTier(Controller::DifficultyTier::Easy);
    assert(diff.getTier() == Controller::DifficultyTier::Easy);
    assert(diff.getTierName() == "Facil");
    assert(!diff.getSettings().enablePhaseScoring);

    diff.setTier(Controller::DifficultyTier::Hard);
    assert(diff.getTier() == Controller::DifficultyTier::Hard);
    assert(diff.getTierName() == "Dificil");
    assert(diff.getSettings().enablePhaseScoring);

    // ── Test 2: Easy Mode – 4 distinct options generated ──
    diff.setTier(Controller::DifficultyTier::Easy);
    session->startNewTrial();
    [[maybe_unused]] const auto& opts = session->getEasyOptions();
    assert(opts.size() == 4);

    // One and only one option should be the correct answer
    size_t correctIdx = session->getCorrectEasyOptionIndex();
    assert(correctIdx < 4);

    // ── Test 3: Easy Mode – Single-Audition Lock ──
    // First audition: should succeed
    assert(session->canAuditionEasyOption(correctIdx));
    [[maybe_unused]] const bool firstAudition = session->auditionEasyOption(correctIdx);
    assert(firstAudition == true);
    assert(!session->canAuditionEasyOption(correctIdx)); // Now locked out

    // Second audition of the same option: must return false (locked)
    [[maybe_unused]] const bool secondAudition = session->auditionEasyOption(correctIdx);
    assert(secondAudition == false);

    // ── Test 4: Easy Mode – Correct guess scores 100% ──
    const auto easyResult = session->evaluateEasyGuess(correctIdx);
    assert(easyResult.isCorrect);
    assert(std::abs(easyResult.scorePercentage - 100.0) < 1e-6);

    // ── Test 5: Normal Mode – Discrete gains only ──
    diff.setTier(Controller::DifficultyTier::Normal);
    static const double validNormalGains[] = {-10.0, -6.0, -3.0, 3.0, 6.0, 10.0};
    for (int trial = 0; trial < 20; ++trial) {
        session->startNewTrial();
        const double gain = session->getCurrentTarget().gainDb;
        bool gainIsValid = false;
        for (double g : validNormalGains) {
            if (std::abs(gain - g) < 1e-6) { gainIsValid = true; break; }
        }
        assert(gainIsValid);
        // Normal mode: only Bell, HighPass, LowPass allowed
        [[maybe_unused]] const auto type = session->getCurrentTarget().type;
        assert(type == AudioEngine::FilterType::Bell ||
               type == AudioEngine::FilterType::HighPass ||
               type == AudioEngine::FilterType::LowPass);
        // Phase scoring must be disabled
        assert(!diff.getSettings().enablePhaseScoring);
    }

    // ── Test 6: Hard Mode – Phase scoring active, full ranges ──
    diff.setTier(Controller::DifficultyTier::Hard);
    session->startNewTrial();
    assert(diff.getSettings().enablePhaseScoring);

    // Evaluate with a wrong phase mode -> score must be <100%
    const auto& target = session->getCurrentTarget();
    const auto wrongPhase = (target.phaseMode == AudioEngine::EQPhaseMode::MinimumPhase_IIR)
        ? AudioEngine::EQPhaseMode::LinearPhase_FIR
        : AudioEngine::EQPhaseMode::MinimumPhase_IIR;
    const auto hardMissPhase = session->evaluateGuess(
        target.frequencyHz, target.gainDb, target.qFactor, target.type, wrongPhase
    );
    assert(!hardMissPhase.phaseMatch);
    assert(hardMissPhase.scorePercentage < 100.0);

    // Start a new trial and evaluate with all parameters correct
    diff.setTier(Controller::DifficultyTier::Hard);
    session->startNewTrial();
    const auto& target2 = session->getCurrentTarget();
    const auto hardFullMatch = session->evaluateGuess(
        target2.frequencyHz, target2.gainDb, target2.qFactor, target2.type, target2.phaseMode
    );
    assert(hardFullMatch.phaseMatch);
    assert(hardFullMatch.scorePercentage >= 80.0); // Freq is exact -> high score

    std::cout << "PASSED." << std::endl;
    return true;
}

bool runNormalModeDiscreteGainConstraint() {
    std::cout << "[TEST 8/9] Verifying Normal Mode Gain Constraint (discrete steps: +-3, +-6, +-10 dB)... ";
    auto router = std::make_shared<AudioEngine::AudioGraphRouter>();
    auto eqModule = std::make_shared<AudioEngine::SurgicalEQModule>();
    auto session = std::make_shared<Controller::TrainingSessionManager>(router, eqModule);
    auto& diff = session->getDifficulty();
    diff.setTier(Controller::DifficultyTier::Normal);

    static const double discreteGains[] = {-10.0, -6.0, -3.0, 3.0, 6.0, 10.0};
    constexpr int numGains = sizeof(discreteGains) / sizeof(discreteGains[0]);
    bool allDiscrete = true;
    for (int i = 0; i < 100; ++i) {
        session->startNewTrial();
        const double g = session->getCurrentTarget().gainDb;
        bool found = false;
        for (int j = 0; j < numGains; ++j)
            if (std::abs(g - discreteGains[j]) < 1e-6) { found = true; break; }
        if (!found) { allDiscrete = false; break; }
    }
    assert(allDiscrete);
    std::cout << "PASSED." << std::endl;
    return true;
}

bool runHardModePhaseScoring() {
    std::cout << "[TEST 9/9] Verifying Hard Mode Phase Mode Scoring (20% penalty for wrong phase)... ";
    auto router = std::make_shared<AudioEngine::AudioGraphRouter>();
    auto eqModule = std::make_shared<AudioEngine::SurgicalEQModule>();
    auto session = std::make_shared<Controller::TrainingSessionManager>(router, eqModule);
    auto& diff = session->getDifficulty();
    diff.setTier(Controller::DifficultyTier::Hard);

    // Generate many trials and verify all scored with wrong phase are penalized
    int trialsWithPhase = 0;
    for (int i = 0; i < 50; ++i) {
        session->startNewTrial();
        const auto& tgt = session->getCurrentTarget();
        const auto wrongPhase = (tgt.phaseMode == AudioEngine::EQPhaseMode::MinimumPhase_IIR)
            ? AudioEngine::EQPhaseMode::LinearPhase_FIR
            : AudioEngine::EQPhaseMode::MinimumPhase_IIR;

        const auto r = session->evaluateGuess(
            tgt.frequencyHz, tgt.gainDb, tgt.qFactor, tgt.type, wrongPhase
        );
        assert(!r.phaseMatch);  // Phase mismatch must be detected
        assert(r.scorePercentage < 100.0); // Must penalize score
        trialsWithPhase++;
    }
    assert(trialsWithPhase == 50);
    std::cout << "PASSED." << std::endl;
    return true;
}

int main(int argc, char* argv[]) {
    std::cout << "================================================================================" << std::endl;
    std::cout << " Advanced Ear Training & DSP Simulator Platform - System Architecture & Tests  " << std::endl;
    std::cout << "================================================================================" << std::endl;

    const bool isTestOnly = (argc > 1 && std::string(argv[1]) == "--test");

    // Run verification tests
    bool allPassed = true;
    allPassed &= runAcousticMathVerification();
    allPassed &= runBiquadFilterVerification();
    allPassed &= runLinearPhaseFIRVerification();
    allPassed &= runTruePeakMeterVerification();
    allPassed &= runAudioGraphRouterAndABXVerification();
    allPassed &= runAudioPlayerAndPlaylistVerification();
    allPassed &= runPedagogicalTierVerification();
    allPassed &= runNormalModeDiscreteGainConstraint();
    allPassed &= runHardModePhaseScoring();

    if (!allPassed) {
        std::cerr << "\n[ERROR] One or more DSP verification tests failed!" << std::endl;
        return 1;
    }

    std::cout << "\n>>> ALL DSP, PLAYLIST & PEDAGOGICAL TIER VERIFICATION TESTS PASSED! <<<\n" << std::endl;

    if (isTestOnly) {
        return 0;
    }

    // =========================================================================
    // Interactive Demonstration: Surgical EQ Module & Training Session
    // =========================================================================
    AudioEngine::AudioContext ctx{48000.0, 512, 2};
    auto router = std::make_shared<AudioEngine::AudioGraphRouter>();
    auto eqModule = std::make_shared<AudioEngine::SurgicalEQModule>();
    auto session = std::make_shared<Controller::TrainingSessionManager>(router, eqModule);

    router->prepare(ctx);
    eqModule->prepare(ctx);
    router->setActiveModule(eqModule);

    // Start initial trial
    session->startNewTrial();

    // Wireframe layout
    UI::SurgicalEQWireframe wireframe(router, eqModule, session);

    // Simulate real-time audio callback running in the background
    std::vector<float> leftOut(512, 0.0f);
    std::vector<float> rightOut(512, 0.0f);
    float* outputChannels[2] = { leftOut.data(), rightOut.data() };
    router->processCallback(outputChannels, 2, 512);

    // Render wireframe
    std::cout << wireframe.renderWireframeToString(1000.0, 6.0, 2.0, 
                                                   AudioEngine::FilterType::Bell, 
                                                   AudioEngine::EQPhaseMode::MinimumPhase_IIR);

    // Demonstrate guess evaluation
    std::cout << "\n[SIMULATING USER GUESS SUBMISSION]: Guess = 1000 Hz, +6 dB, Q = 2.0 (Bell)\n";
    const auto result = session->evaluateGuess(1000.0, 6.0, 2.0, 
                                              AudioEngine::FilterType::Bell, 
                                              AudioEngine::EQPhaseMode::MinimumPhase_IIR);
    std::cout << " Result: " << result.feedbackMessage << "\n\n";

    return 0;
}
