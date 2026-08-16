cmake_minimum_required(VERSION 3.22)
project(AdvancedEarTrainingPlatform VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Enable compiler warnings & optimizations
if (MSVC)
    add_compile_options(/W4 /permissive- /utf-8 /fp:fast /O2 /wd4324 /FS)
    add_definitions(-D_USE_MATH_DEFINES -DNOMINMAX)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -O3 -ffast-math)
endif()

# Locate local JUCE installation (No FetchContent download)
find_package(JUCE CONFIG QUIET)

if (NOT JUCE_FOUND)
    if (EXISTS "C:/APPs/Khaen/build/_deps/juce-src/CMakeLists.txt")
        set(JUCE_PATH "C:/APPs/Khaen/build/_deps/juce-src" CACHE PATH "Path to JUCE")
        add_subdirectory(${JUCE_PATH} juce_local)
    elseif (EXISTS "C:/JUCE/CMakeLists.txt")
        set(JUCE_PATH "C:/JUCE" CACHE PATH "Path to JUCE")
        add_subdirectory(${JUCE_PATH} juce_local)
    else()
        find_package(JUCE CONFIG REQUIRED)
    endif()
endif()

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# Core Audio Engine Library (Pure C++ / Zero Framework Dependencies)
file(GLOB_RECURSE ENGINE_COMMON_SOURCES "src/Common/*.h")
file(GLOB_RECURSE ENGINE_CORE_SOURCES "src/AudioEngine/*.h" "src/AudioEngine/*.cpp")
file(GLOB_RECURSE ENGINE_CONTROLLER_SOURCES "src/Controller/*.h" "src/Controller/*.cpp")
file(GLOB_RECURSE ENGINE_UI_WIREFRAME_SOURCES "src/UI/Common/*.h" "src/UI/Wireframes/*.h" "src/UI/Wireframes/*.cpp")

add_library(EarTrainingEngine STATIC
    ${ENGINE_COMMON_SOURCES}
    ${ENGINE_CORE_SOURCES}
    ${ENGINE_CONTROLLER_SOURCES}
    ${ENGINE_UI_WIREFRAME_SOURCES}
)

target_include_directories(EarTrainingEngine PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)

# Native Verification Suite Executable
add_executable(EarTrainingVerification
    src/Main.cpp
)
target_link_libraries(EarTrainingVerification PRIVATE EarTrainingEngine)

# ─── JUCE GUI & AudioProcessor Standalone Target ─────────────────────────────
file(GLOB_RECURSE JUCE_BRIDGE_SOURCES "src/JuceBridge/*.h" "src/JuceBridge/*.cpp")
file(GLOB_RECURSE JUCE_UI_SOURCES "src/UI/Juce/*.h" "src/UI/Juce/*.cpp")

juce_add_plugin(EarTrainingDSP
    COMPANY_NAME                "AcousticDSP"
    COMPANY_WEBSITE             "https://acousticdsp.com"
    COMPANY_EMAIL               "dev@acousticdsp.com"
    BUNDLE_ID                   "com.acousticdsp.eartraining"
    PLUGIN_MANUFACTURER_CODE    "AcDS"
    PLUGIN_CODE                 "ETds"
    FORMATS                     Standalone
    PRODUCT_NAME                "EarTrainingDSP"
    IS_SYNTH                    FALSE
    NEEDS_MIDI_INPUT            FALSE
    NEEDS_MIDI_OUTPUT           FALSE
    IS_MIDI_EFFECT              FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD     FALSE
    DESCRIPTION                 "Advanced Ear Training & Surgical EQ DSP Simulator"
)

target_sources(EarTrainingDSP PRIVATE
    ${JUCE_BRIDGE_SOURCES}
    ${JUCE_UI_SOURCES}
)

target_include_directories(EarTrainingDSP PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(EarTrainingDSP PRIVATE
    EarTrainingEngine
    juce::juce_audio_utils
    juce::juce_audio_processors
    juce::juce_audio_formats
    juce::juce_gui_extra
    juce::juce_gui_basics
    juce::juce_graphics
    juce::juce_events
    juce::juce_core
    juce::juce_data_structures
    juce::juce_dsp
)

juce_generate_juce_header(EarTrainingDSP)

# Enable CTest
enable_testing()
add_test(NAME ComprehensiveDSPVerification COMMAND EarTrainingVerification --test)
