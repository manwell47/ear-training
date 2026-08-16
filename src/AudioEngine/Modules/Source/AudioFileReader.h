#pragma once

#include "AudioEngine/Core/AudioContext.h"
#include "Common/AudioBuffer.h"
#include <string>
#include <atomic>
#include <vector>
#include <memory>
#include <mutex>

namespace EarTraining::AudioEngine {

/**
 * @brief Represents an individual audio track in the playlist.
 */
struct AudioTrackInfo {
    std::string id;
    std::string title;
    std::string filePath;
    double durationSeconds{0.0};
    uint32_t sampleRate{48000};
    uint32_t numChannels{2};
    uint32_t totalSamples{0};
    Common::AudioBuffer<float> audioData;
};

/**
 * @brief Bring-Your-Own-Audio (BYOA) Multi-Track Audio Player & Playlist Engine.
 * 
 * Supports streaming user audio files (WAV, MP3, AIFF, FLAC) and internal reference tracks.
 * Features lock-free real-time audio playback, seeking, looping, and multi-track playlist management.
 */
class AudioFileReader {
public:
    AudioFileReader();
    ~AudioFileReader() = default;

    void prepare(const AudioContext& context);
    void reset() noexcept;

    // ─── Single-Buffer Legacy / Quick Load Helper ────────────────────────────
    bool loadAudioData(const float* const* channelData, uint32_t numChannels, uint32_t numSamples);
    bool loadWavFile(const std::string& filePath);

    // ─── Multi-Track Playlist Operations ────────────────────────────────────
    /**
     * @brief Adds an audio track to the playlist.
     * @return The index of the added track.
     */
    size_t addTrack(const std::string& title, 
                    const std::string& filePath, 
                    const float* const* channelData, 
                    uint32_t numChannels, 
                    uint32_t numSamples, 
                    uint32_t sampleRate);

    void removeTrack(size_t index);
    void clearPlaylist(); // Resets back to default reference track
    void selectTrack(size_t index);
    void nextTrack();
    void prevTrack();

    [[nodiscard]] size_t getTrackCount() const;
    [[nodiscard]] size_t getCurrentTrackIndex() const;
    [[nodiscard]] std::string getCurrentTrackTitle() const;
    [[nodiscard]] double getCurrentTrackDurationSeconds() const;

    struct PlaylistSnapshotItem {
        size_t index;
        std::string title;
        std::string filePath;
        double durationSeconds;
        bool isCurrent;
    };
    [[nodiscard]] std::vector<PlaylistSnapshotItem> getPlaylistSnapshot() const;

    // ─── Playback Transport Controls ─────────────────────────────────────────
    void setPlaying(bool isPlaying) noexcept;
    [[nodiscard]] bool isPlaying() const noexcept;
    void togglePlay() noexcept;

    void stop() noexcept;
    void play() noexcept;
    void pause() noexcept;

    void setLooping(bool isLooping) noexcept;
    [[nodiscard]] bool isLooping() const noexcept;
    void toggleLooping() noexcept;

    void setPlaybackPosition(uint32_t samplePosition) noexcept;
    void seekNormalized(float normalized0To1) noexcept;
    [[nodiscard]] uint32_t getPlaybackPosition() const noexcept;
    [[nodiscard]] uint32_t getTotalSamples() const noexcept;

    [[nodiscard]] double getPlaybackProgressNormalized() const;
    [[nodiscard]] double getCurrentTimeSeconds() const;

    // ─── Audio Real-Time Processing Callback ─────────────────────────────────
    void process(Common::AudioBuffer<float>& buffer) noexcept;

private:
    AudioContext m_context;

    mutable std::mutex m_playlistMutex;
    std::vector<std::shared_ptr<AudioTrackInfo>> m_playlist;
    
    std::atomic<size_t> m_currentTrackIndex{0};
    std::atomic<bool> m_isPlaying{false};
    std::atomic<bool> m_isLooping{true};
    std::atomic<uint32_t> m_playheadPosition{0};
};

} // namespace EarTraining::AudioEngine
