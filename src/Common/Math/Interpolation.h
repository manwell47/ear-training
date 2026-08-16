#pragma once

#include <cmath>
#include <cstdint>
#include <concepts>

namespace EarTraining::Math {

/**
 * @brief High-precision interpolation algorithms for fractional delay lines and oversamplers.
 */
class Interpolation {
public:
    /**
     * @brief Linear interpolation between y0 and y1.
     * @param frac Fractional distance [0.0, 1.0].
     */
    [[nodiscard]] static constexpr float linear(float y0, float y1, float frac) noexcept {
        return y0 + frac * (y1 - y0);
    }

    /**
     * @brief 4-Point, 3rd-Order Hermite interpolation (C1 continuous, smooth derivative).
     * @param y_1 Sample at index -1
     * @param y0  Sample at index 0
     * @param y1  Sample at index 1
     * @param y2  Sample at index 2
     * @param frac Fractional distance between y0 and y1 [0.0, 1.0].
     */
    [[nodiscard]] static constexpr float hermite4p3o(float y_1, float y0, float y1, float y2, float frac) noexcept {
        const float c0 = y0;
        const float c1 = 0.5f * (y1 - y_1);
        const float c2 = y_1 - 2.5f * y0 + 2.0f * y1 - 0.5f * y2;
        const float c3 = 0.5f * (y2 - y_1) + 1.5f * (y0 - y1);
        return ((c3 * frac + c2) * frac + c1) * frac + c0;
    }

    /**
     * @brief 4-Point Lagrange polynomial interpolation (exact polynomial fit through 4 points).
     * @param y_1 Sample at index -1
     * @param y0  Sample at index 0
     * @param y1  Sample at index 1
     * @param y2  Sample at index 2
     * @param frac Fractional distance between y0 and y1 [0.0, 1.0].
     */
    [[nodiscard]] static constexpr float lagrange4p(float y_1, float y0, float y1, float y2, float frac) noexcept {
        const float d_1 = frac + 1.0f;
        const float d0 = frac;
        const float d1 = frac - 1.0f;
        const float d2 = frac - 2.0f;

        const float c_1 = (-1.0f / 6.0f) * d0 * d1 * d2;
        const float c0  = (0.5f) * d_1 * d1 * d2;
        const float c1  = (-0.5f) * d_1 * d0 * d2;
        const float c2  = (1.0f / 6.0f) * d_1 * d0 * d1;

        return c_1 * y_1 + c0 * y0 + c1 * y1 + c2 * y2;
    }
};

} // namespace EarTraining::Math
