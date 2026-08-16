#pragma once

#include <cmath>
#include <numbers>
#include <concepts>
#include <algorithm>
#include <cstdint>

namespace EarTraining::Math {

/**
 * @brief Acoustic & DSP Mathematical Utilities.
 * 
 * Enforces strict scientific rigor:
 * - Power calculations MUST strictly use 10*log10
 * - Sound pressure (SPL) / voltage / amplitude MUST strictly use 20*log10
 */
class AcousticMath {
public:
    static constexpr double PI = std::numbers::pi_v<double>;
    static constexpr double TWO_PI = 2.0 * std::numbers::pi_v<double>;
    static constexpr double LN2 = std::numbers::ln2_v<double>;
    static constexpr double MIN_DB = -144.0;
    static constexpr double EPSILON = 1e-12;

    // =========================================================================
    // Decibel Conversions (Strict 10*log10 vs 20*log10)
    // =========================================================================

    /**
     * @brief Converts voltage, sound pressure, or linear amplitude to decibels (20*log10).
     * @param linear Linear amplitude (e.g. 1.0 = 0 dBFS).
     * @return Decibels (dB).
     */
    [[nodiscard]] static constexpr double amplitudeToDb(double linear) noexcept {
        if (linear <= EPSILON) return MIN_DB;
        return 20.0 * std::log10(linear);
    }

    /**
     * @brief Converts decibels to linear voltage, sound pressure, or amplitude.
     * @param db Decibels.
     * @return Linear amplitude factor.
     */
    [[nodiscard]] static inline double dbToAmplitude(double db) noexcept {
        if (db <= MIN_DB) return 0.0;
        return std::pow(10.0, db / 20.0);
    }

    /**
     * @brief Converts acoustic/electrical power ratio to decibels (10*log10).
     * @param power Linear power (e.g. Watts, Energy).
     * @return Decibels (dB).
     */
    [[nodiscard]] static constexpr double powerToDb(double power) noexcept {
        if (power <= EPSILON) return MIN_DB;
        return 10.0 * std::log10(power);
    }

    /**
     * @brief Converts decibels to power ratio.
     * @param db Decibels.
     * @return Linear power ratio.
     */
    [[nodiscard]] static inline double dbToPower(double db) noexcept {
        if (db <= MIN_DB) return 0.0;
        return std::pow(10.0, db / 10.0);
    }

    // =========================================================================
    // Filter & Resonator Formulas (Q Factor <-> Bandwidth in Octaves)
    // =========================================================================

    /**
     * @brief Converts Bandwidth (in octaves) to Quality Factor (Q).
     * Formula: Q = sqrt(2^N) / (2^N - 1) where N is bandwidth in octaves.
     * @param octaves Bandwidth in octaves (e.g. 0.33, 1.0, 2.0).
     * @return Quality factor Q.
     */
    [[nodiscard]] static inline double bandwidthOctavesToQ(double octaves) noexcept {
        if (octaves <= EPSILON) return 100.0;
        const double twoPowN = std::pow(2.0, octaves);
        return std::sqrt(twoPowN) / (twoPowN - 1.0);
    }

    /**
     * @brief Converts Quality Factor (Q) to Bandwidth (in octaves).
     * Formula: N = (2 / ln(2)) * asinh(1 / (2 * Q))
     * @param q Quality factor (must be > 0).
     * @return Bandwidth in octaves.
     */
    [[nodiscard]] static inline double qToBandwidthOctaves(double q) noexcept {
        if (q <= EPSILON) return 10.0;
        return (2.0 / LN2) * std::asinh(1.0 / (2.0 * q));
    }

    /**
     * @brief Computes lower and upper cutoff frequencies from center frequency and Q.
     */
    static inline void getCutoffFrequencies(double centerFreq, double q, double& fLow, double& fHigh) noexcept {
        const double bwOctaves = qToBandwidthOctaves(q);
        const double factor = std::pow(2.0, bwOctaves / 2.0);
        fLow = centerFreq / factor;
        fHigh = centerFreq * factor;
    }

    // =========================================================================
    // Psychoacoustic Scales (Bark & ERB Scales)
    // =========================================================================

    /**
     * @brief Converts frequency in Hz to Bark scale (Zwicker & Terhardt).
     * z = 13 * atan(0.00076 * f) + 3.5 * atan((f / 7500)^2)
     */
    [[nodiscard]] static inline double hzToBark(double freqHz) noexcept {
        const double f7500 = freqHz / 7500.0;
        return 13.0 * std::atan(0.00076 * freqHz) + 3.5 * std::atan(f7500 * f7500);
    }

    /**
     * @brief Converts Bark scale value to frequency in Hz (Traunmüller inversion).
     */
    [[nodiscard]] static inline double barkToHz(double bark) noexcept {
        if (bark <= 2.0) return bark * 100.0;
        if (bark >= 20.1) return (bark + 4.422) / 0.06;
        return 1960.0 * (bark + 0.53) / (26.28 - bark);
    }

    /**
     * @brief Calculates Equivalent Rectangular Bandwidth (ERB) in Hz for a given center frequency (Glasberg & Moore).
     * ERB(f) = 24.7 * (4.37 * 10^-3 * f + 1.0)
     */
    [[nodiscard]] static constexpr double hzToErb(double freqHz) noexcept {
        return 24.7 * (4.37e-3 * freqHz + 1.0);
    }

    /**
     * @brief Converts frequency in Hz to ERB number (Cam scale).
     * Number = 21.4 * log10(4.37e-3 * f + 1.0)
     */
    [[nodiscard]] static inline double hzToErbNumber(double freqHz) noexcept {
        return 21.4 * std::log10(4.37e-3 * freqHz + 1.0);
    }

    // =========================================================================
    // Acoustic Interference & Phase Calculations
    // =========================================================================

    /**
     * @brief Calculates destructive interference (notch) frequencies for a given time delay (seconds).
     * For in-phase signals: f_notch(k) = (2k + 1) / (2 * delaySeconds)
     * For inverted signals: f_notch(k) = k / delaySeconds
     */
    [[nodiscard]] static constexpr double getCombNotchFrequency(double delaySeconds, int32_t k, bool invertedPhase) noexcept {
        if (delaySeconds <= EPSILON) return 0.0;
        if (invertedPhase) {
            return static_cast<double>(k) / delaySeconds;
        } else {
            return (2.0 * static_cast<double>(k) + 1.0) / (2.0 * delaySeconds);
        }
    }

    /**
     * @brief Calculates group delay in seconds for a 1st/2nd order system given phase derivative.
     * tau_g(omega) = - d(theta) / d(omega)
     */
    [[nodiscard]] static constexpr double phaseDerivativeToGroupDelay(double dTheta_dOmega) noexcept {
        return -dTheta_dOmega;
    }

    // =========================================================================
    // Mathematical Sinc and Windowing Functions
    // =========================================================================

    /**
     * @brief Normalized Sinc function: sinc(x) = sin(pi * x) / (pi * x), with sinc(0) = 1.
     */
    [[nodiscard]] static inline double normalizedSinc(double x) noexcept {
        if (std::abs(x) < EPSILON) return 1.0;
        const double pix = PI * x;
        return std::sin(pix) / pix;
    }

    /**
     * @brief Blackman window coefficient.
     */
    [[nodiscard]] static inline double blackmanWindow(int32_t n, int32_t N) noexcept {
        if (N <= 1) return 1.0;
        const double a0 = 0.42;
        const double a1 = 0.5;
        const double a2 = 0.08;
        const double factor = TWO_PI * static_cast<double>(n) / static_cast<double>(N - 1);
        return a0 - a1 * std::cos(factor) + a2 * std::cos(2.0 * factor);
    }

    /**
     * @brief Hann window coefficient.
     */
    [[nodiscard]] static inline double hannWindow(int32_t n, int32_t N) noexcept {
        if (N <= 1) return 1.0;
        return 0.5 * (1.0 - std::cos(TWO_PI * static_cast<double>(n) / static_cast<double>(N - 1)));
    }
};

} // namespace EarTraining::Math
