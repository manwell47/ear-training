#pragma once

#include <cstdint>

namespace EarTraining::UI {

/**
 * @brief Technological Dark Mode Theme Color Palette Tokens.
 * 
 * Clean, professional technological aesthetic without skeuomorphic clutter.
 */
struct Theme {
    // 32-bit RGBA Colors
    static constexpr uint32_t BackgroundDark   = 0x0D1117FF; // Deep slate void
    static constexpr uint32_t SurfacePanel     = 0x161B22FF; // Subtle dark container
    static constexpr uint32_t SurfaceElevated  = 0x21262DFF; // Interactive card/control
    static constexpr uint32_t BorderSubtle     = 0x30363DFF; // Clean 1px stroke
    
    // Accents
    static constexpr uint32_t AccentCyan       = 0x00F0FFFF; // Primary curve / active focus
    static constexpr uint32_t AccentAmber      = 0xFFB703FF; // Phase / Group delay trace
    static constexpr uint32_t AccentEmerald    = 0x06D6A0FF; // Correct / Success highlight
    static constexpr uint32_t AccentCrimson    = 0xEF476FFF; // True Peak clip / Warning
    
    // Typography
    static constexpr uint32_t TextPrimary      = 0xF0F6FCFF; // High contrast crisp white
    static constexpr uint32_t TextSecondary    = 0x8B949EFF; // Technical muted gray
    static constexpr uint32_t GridLines        = 0x21262D80; // Grid line overlay
};

} // namespace EarTraining::UI
