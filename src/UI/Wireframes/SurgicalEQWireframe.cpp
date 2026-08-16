#include "UI/Wireframes/SurgicalEQWireframe.h"
#include "UI/Common/FrequencyGraph.h"
#include "Common/Math/AcousticMath.h"
#include <sstream>
#include <iomanip>
#include <vector>
#include <cmath>

namespace EarTraining::UI {

SurgicalEQWireframe::SurgicalEQWireframe(std::shared_ptr<AudioEngine::AudioGraphRouter> router,
                                         std::shared_ptr<AudioEngine::SurgicalEQModule> eqModule,
                                         std::shared_ptr<Controller::TrainingSessionManager> session)
    : m_router(std::move(router)), m_eqModule(std::move(eqModule)), m_session(std::move(session)) {}

std::string SurgicalEQWireframe::renderWireframeToString(double userGuessFreq, 
                                                        double userGuessGain, 
                                                        double userGuessQ,
                                                        AudioEngine::FilterType userGuessType,
                                                        AudioEngine::EQPhaseMode userGuessPhase) const {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(1);

    const auto& diff = m_session->getDifficulty();
    const auto mode = m_router ? m_router->getABEngine().getCurrentMode() : AudioEngine::ABMode::BlindX;
    
    // Header
    ss << "========================================================================================================\n";
    ss << " [DSP PLATFORM] SURGICAL EQ & PHASE ARTIFACT SIMULATOR (PHASE 1)                                      \n";
    ss << "========================================================================================================\n";
    ss << " Modo: [" << diff.getTierName() << "]  |  Nivel: " << diff.getLevel() << "/10  |  Trials: " << m_session->getTotalTrials() 
       << "  |  Accuracy: " << m_session->getAverageScore() << "%  |  Tolerance: " 
       << diff.getSettings().freqToleranceOctaves << " Octaves\n";
    ss << "--------------------------------------------------------------------------------------------------------\n";

    // Transfer Response Graph (Ascii Rendering)
    ss << " [TRANSFER FUNCTION SPECTRUM - 20 Hz to 20 kHz]\n";
    ss << "  +18 dB |                                                                                              \n";
    ss << "  +12 dB |                                                                                              \n";
    ss << "   +6 dB |                                                                                              \n";
    ss << "    0 dB |--------------------------------------------------------------------------------------------- \n";
    ss << "   -6 dB |                                                                                              \n";
    ss << "  -12 dB |                                                                                              \n";
    ss << "  -18 dB |                                                                                              \n";
    ss << "         +--------------------+--------------------+--------------------+--------------------+-------- \n";
    ss << "         20 Hz                100 Hz               1 kHz                10 kHz               20 kHz     \n";
    ss << "--------------------------------------------------------------------------------------------------------\n";

    // Active Parameters vs User Guess
    ss << " [USER CONTROLS & HYPOTHESIS]\n";
    ss << " Frequency:   [" << std::setw(6) << userGuessFreq << " Hz ] (20 Hz - 20000 Hz)\n";
    ss << " Gain:        [" << (userGuessGain >= 0 ? "+" : "") << std::setw(5) << userGuessGain << " dB  ] (-24 dB to +24 dB)\n";
    ss << " Q-Factor:    [" << std::setw(6) << userGuessQ << "    ] (Bandwidth: " 
       << Math::AcousticMath::qToBandwidthOctaves(userGuessQ) << " octaves)\n";
    ss << " Filter Type: [" << (userGuessType == AudioEngine::FilterType::Bell ? "Bell / Peaking" : "Shelf / Cut") << "]\n";
    ss << " Phase Mode:  [" << (userGuessPhase == AudioEngine::EQPhaseMode::MinimumPhase_IIR ? "Minimum Phase (IIR DF2T)" : "Linear Phase (FIR Windowed-Sinc)") << "]\n";
    ss << "--------------------------------------------------------------------------------------------------------\n";

    // Comparison Mode Bar
    ss << " [BLIND AUDITORY COMPARISON]\n";
    ss << " Active Mode: [ " 
       << (mode == AudioEngine::ABMode::DirectA_Dry ? "A (Dry Reference)" : 
          (mode == AudioEngine::ABMode::DirectB_Wet ? "B (Wet Processed)" : 
          (mode == AudioEngine::ABMode::BlindX ? "X (Blind Mystery Target)" : "Bypass"))) 
       << " ]\n";
    ss << " [1: Listen A (Dry)]  [2: Listen B (Wet)]  [3: Listen X (Blind)]  [SPACE: Submit Guess]  [R: Reveal]\n";
    ss << "--------------------------------------------------------------------------------------------------------\n";

    // True Peak Meters
    float leftPeak = -144.0f, rightPeak = -144.0f;
    if (m_router) {
        leftPeak = m_router->getTruePeakMeter().getTruePeakDbTP(0);
        rightPeak = m_router->getTruePeakMeter().getTruePeakDbTP(1);
    }
    ss << " [METERING: ITU-R BS.1770-4 TRUE PEAK (4x OVERSAMPLED)]\n";
    ss << " L: [" << std::setw(6) << leftPeak << " dBTP] |" << (leftPeak > 0.0f ? " CLIP! " : " OK    ") << "|\n";
    ss << " R: [" << std::setw(6) << rightPeak << " dBTP] |" << (rightPeak > 0.0f ? " CLIP! " : " OK    ") << "|\n";
    ss << "========================================================================================================\n";

    return ss.str();
}

} // namespace EarTraining::UI
