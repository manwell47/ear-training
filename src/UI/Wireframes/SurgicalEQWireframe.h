#pragma once

#include "AudioEngine/Modules/SurgicalEQ/SurgicalEQModule.h"
#include "AudioEngine/Core/AudioGraphRouter.h"
#include "Controller/TrainingSessionManager.h"
#include <string>

namespace EarTraining::UI {

/**
 * @brief Surgical EQ Module UI Wireframe & Layout Architecture.
 * 
 * Provides a structured technological wireframe interface for training on
 * surgical frequency cuts/boosts, Q-factor sharpness, and Minimum Phase vs. Linear Phase artifacts.
 */
class SurgicalEQWireframe {
public:
    SurgicalEQWireframe(std::shared_ptr<AudioEngine::AudioGraphRouter> router,
                        std::shared_ptr<AudioEngine::SurgicalEQModule> eqModule,
                        std::shared_ptr<Controller::TrainingSessionManager> session);
    ~SurgicalEQWireframe() = default;

    /**
     * @brief Renders the visual wireframe console layout with real-time transfer curves and meters.
     */
    [[nodiscard]] std::string renderWireframeToString(double userGuessFreq, 
                                                      double userGuessGain, 
                                                      double userGuessQ,
                                                      AudioEngine::FilterType userGuessType,
                                                      AudioEngine::EQPhaseMode userGuessPhase) const;

private:
    std::shared_ptr<AudioEngine::AudioGraphRouter> m_router;
    std::shared_ptr<AudioEngine::SurgicalEQModule> m_eqModule;
    std::shared_ptr<Controller::TrainingSessionManager> m_session;
};

} // namespace EarTraining::UI
