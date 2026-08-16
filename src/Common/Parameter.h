#pragma once

#include <atomic>
#include <cmath>
#include <concepts>
#include <algorithm>

namespace EarTraining::Common {

enum class SmoothingType {
    Linear,
    Exponential,
    Direct
};

/**
 * @brief Thread-safe Audio Parameter with real-time smoothing to eliminate parameter zipper noise.
 */
template <typename FloatType = float>
class SmoothedParameter {
public:
    SmoothedParameter(FloatType initialValue = FloatType{0}, FloatType rampTimeMs = FloatType{10})
        : m_targetValue(initialValue), m_currentValue(initialValue), m_rampTimeMs(rampTimeMs) {}

    void reset(FloatType sampleRate, FloatType initialValue) noexcept {
        m_sampleRate = sampleRate;
        m_targetValue.store(initialValue, std::memory_order_relaxed);
        m_currentValue = initialValue;
        updateSmoothingCoefficients();
    }

    void setTargetValue(FloatType target) noexcept {
        m_targetValue.store(target, std::memory_order_relaxed);
    }

    void setRampTime(FloatType rampTimeMs) noexcept {
        m_rampTimeMs = rampTimeMs;
        updateSmoothingCoefficients();
    }

    void setSmoothingType(SmoothingType type) noexcept {
        m_smoothingType = type;
        updateSmoothingCoefficients();
    }

    [[nodiscard]] FloatType getTargetValue() const noexcept {
        return m_targetValue.load(std::memory_order_relaxed);
    }

    [[nodiscard]] FloatType getCurrentValue() const noexcept {
        return m_currentValue;
    }

    [[nodiscard]] bool isSmoothing() const noexcept {
        return std::abs(m_currentValue - m_targetValue.load(std::memory_order_relaxed)) > FloatType{1e-5};
    }

    /**
     * @brief Computes and returns the next smoothed sample value. (Real-time safe)
     */
    [[nodiscard]] inline FloatType getNextValue() noexcept {
        const FloatType target = m_targetValue.load(std::memory_order_relaxed);

        switch (m_smoothingType) {
            case SmoothingType::Linear: {
                if (m_currentValue < target) {
                    m_currentValue = std::min(m_currentValue + m_linearStep, target);
                } else if (m_currentValue > target) {
                    m_currentValue = std::max(m_currentValue - m_linearStep, target);
                }
                break;
            }
            case SmoothingType::Exponential: {
                m_currentValue += m_expCoeff * (target - m_currentValue);
                break;
            }
            case SmoothingType::Direct: {
                m_currentValue = target;
                break;
            }
        }
        return m_currentValue;
    }

    /**
     * @brief Instantly snaps current value to target value (bypasses smoothing).
     */
    void snapToTarget() noexcept {
        m_currentValue = m_targetValue.load(std::memory_order_relaxed);
    }

private:
    void updateSmoothingCoefficients() noexcept {
        if (m_sampleRate <= FloatType{0}) return;

        const FloatType numSamples = (m_rampTimeMs * FloatType{0.001}) * m_sampleRate;
        if (numSamples <= FloatType{1}) {
            m_linearStep = FloatType{1};
            m_expCoeff = FloatType{1};
            return;
        }

        m_linearStep = FloatType{1} / numSamples;
        // Exponential coefficient: 1 - exp(-1 / (tau * fs))
        m_expCoeff = FloatType{1} - std::exp(-FloatType{1} / (numSamples * FloatType{0.368}));
    }

    std::atomic<FloatType> m_targetValue{FloatType{0}};
    FloatType m_currentValue{FloatType{0}};
    FloatType m_sampleRate{44100.0f};
    FloatType m_rampTimeMs{10.0f};
    FloatType m_linearStep{0.001f};
    FloatType m_expCoeff{0.05f};
    SmoothingType m_smoothingType{SmoothingType::Exponential};
};

} // namespace EarTraining::Common
