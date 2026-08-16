#include "AudioEngine/Modules/Source/AudioFileReader.h"
#include "Common/Math/AcousticMath.h"
#include <fstream>
#include <iostream>
#include <algorithm>
#include <cmath>
#include <cstring>

namespace EarTraining::AudioEngine {

#pragma pack(push, 1)
struct WavHeader {
    char riff[4];
    uint32_t fileSize;
    char wave[4];
    char fmt[4];
    uint32_t fmtSize;
    uint16_t audioFormat;
    uint16_t numChannels;
    uint32_t sampleRate;
    uint32_t byteRate;
    uint16_t blockAlign;
    uint16_t bitsPerSample;
};
#pragma pack(pop)

AudioFileReader::AudioFileReader() {
}

void AudioFileReader::prepare(const AudioContext& context) {
    m_context = context;
}

void AudioFileReader::reset() noexcept {
    m_playheadPosition.store(0, std::memory_order_relaxed);
}

void AudioFileReader::setPlaying(bool isPlaying) noexcept {
    m_isPlaying.store(isPlaying, std::memory_order_relaxed);
}

bool AudioFileReader::isPlaying() const noexcept {
    return m_isPlaying.load(std::memory_order_relaxed);
}

void AudioFileReader::togglePlay() noexcept {
    m_isPlaying.store(!m_isPlaying.load(std::memory_order_relaxed), std::memory_order_relaxed);
}

void AudioFileReader::play() noexcept {
    m_isPlaying.store(true, std::memory_order_relaxed);
}

void AudioFileReader::pause() noexcept {
    m_isPlaying.store(false, std::memory_order_relaxed);
}

void AudioFileReader::stop() noexcept {
    m_isPlaying.store(false, std::memory_order_relaxed);
    m_playheadPosition.store(0, std::memory_order_relaxed);
}

void AudioFileReader::setLooping(bool isLooping) noexcept {
    m_isLooping.store(isLooping, std::memory_order_relaxed);
}

bool AudioFileReader::isLooping() const noexcept {
    return m_isLooping.load(std::memory_order_relaxed);
}

void AudioFileReader::toggleLooping() noexcept {
    m_isLooping.store(!m_isLooping.load(std::memory_order_relaxed), std::memory_order_relaxed);
}

void AudioFileReader::setPlaybackPosition(uint32_t samplePosition) noexcept {
    std::shared_ptr<AudioTrackInfo> currentTrack;
    {
        std::lock_guard<std::mutex> lock(m_playlistMutex);
        const size_t idx = m_currentTrackIndex.load(std::memory_order_relaxed);
        if (idx < m_playlist.size()) {
            currentTrack = m_playlist[idx];
        }
    }

    if (currentTrack && currentTrack->totalSamples > 0) {
        m_playheadPosition.store(samplePosition % currentTrack->totalSamples, std::memory_order_relaxed);
    }
}

void AudioFileReader::seekNormalized(float normalized0To1) noexcept {
    const float clamped = std::clamp(normalized0To1, 0.0f, 1.0f);
    std::shared_ptr<AudioTrackInfo> currentTrack;
    {
        std::lock_guard<std::mutex> lock(m_playlistMutex);
        const size_t idx = m_currentTrackIndex.load(std::memory_order_relaxed);
        if (idx < m_playlist.size()) {
            currentTrack = m_playlist[idx];
        }
    }

    if (currentTrack && currentTrack->totalSamples > 0) {
        const auto targetSample = static_cast<uint32_t>(clamped * static_cast<float>(currentTrack->totalSamples - 1));
        m_playheadPosition.store(targetSample, std::memory_order_relaxed);
    }
}

uint32_t AudioFileReader::getPlaybackPosition() const noexcept {
    return m_playheadPosition.load(std::memory_order_relaxed);
}

uint32_t AudioFileReader::getTotalSamples() const noexcept {
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    const size_t idx = m_currentTrackIndex.load(std::memory_order_relaxed);
    if (idx < m_playlist.size() && m_playlist[idx]) {
        return m_playlist[idx]->totalSamples;
    }
    return 0;
}

double AudioFileReader::getPlaybackProgressNormalized() const {
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    const size_t idx = m_currentTrackIndex.load(std::memory_order_relaxed);
    if (idx < m_playlist.size() && m_playlist[idx] && m_playlist[idx]->totalSamples > 0) {
        const double pos = static_cast<double>(m_playheadPosition.load(std::memory_order_relaxed));
        return std::clamp(pos / static_cast<double>(m_playlist[idx]->totalSamples), 0.0, 1.0);
    }
    return 0.0;
}

double AudioFileReader::getCurrentTimeSeconds() const {
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    const size_t idx = m_currentTrackIndex.load(std::memory_order_relaxed);
    if (idx < m_playlist.size() && m_playlist[idx] && m_playlist[idx]->sampleRate > 0) {
        return static_cast<double>(m_playheadPosition.load(std::memory_order_relaxed)) / static_cast<double>(m_playlist[idx]->sampleRate);
    }
    return 0.0;
}

double AudioFileReader::getCurrentTrackDurationSeconds() const {
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    const size_t idx = m_currentTrackIndex.load(std::memory_order_relaxed);
    if (idx < m_playlist.size() && m_playlist[idx]) {
        return m_playlist[idx]->durationSeconds;
    }
    return 0.0;
}

std::string AudioFileReader::getCurrentTrackTitle() const {
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    const size_t idx = m_currentTrackIndex.load(std::memory_order_relaxed);
    if (idx < m_playlist.size() && m_playlist[idx]) {
        return m_playlist[idx]->title;
    }
    return "No Track Loaded";
}

size_t AudioFileReader::getTrackCount() const {
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    return m_playlist.size();
}

size_t AudioFileReader::getCurrentTrackIndex() const {
    return m_currentTrackIndex.load(std::memory_order_relaxed);
}

std::vector<AudioFileReader::PlaylistSnapshotItem> AudioFileReader::getPlaylistSnapshot() const {
    std::vector<PlaylistSnapshotItem> items;
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    const size_t currentIdx = m_currentTrackIndex.load(std::memory_order_relaxed);
    
    items.reserve(m_playlist.size());
    for (size_t i = 0; i < m_playlist.size(); ++i) {
        if (m_playlist[i]) {
            items.push_back({
                i,
                m_playlist[i]->title,
                m_playlist[i]->filePath,
                m_playlist[i]->durationSeconds,
                i == currentIdx
            });
        }
    }
    return items;
}

size_t AudioFileReader::addTrack(const std::string& title, 
                                 const std::string& filePath, 
                                 const float* const* channelData, 
                                 uint32_t numChannels, 
                                 uint32_t numSamples, 
                                 uint32_t sampleRate) {
    if (channelData == nullptr || numChannels == 0 || numSamples == 0) {
        return 0;
    }

    auto track = std::make_shared<AudioTrackInfo>();
    track->title = title.empty() ? "Custom Track" : title;
    track->filePath = filePath;
    track->numChannels = numChannels;
    track->totalSamples = numSamples;
    track->sampleRate = sampleRate > 0 ? sampleRate : 48000;
    track->durationSeconds = static_cast<double>(numSamples) / static_cast<double>(track->sampleRate);
    
    track->audioData.resize(numChannels, numSamples);
    for (uint32_t ch = 0; ch < numChannels; ++ch) {
        if (channelData[ch] != nullptr) {
            std::memcpy(track->audioData.getWritePointer(ch), channelData[ch], numSamples * sizeof(float));
        } else {
            track->audioData.clearChannel(ch);
        }
    }

    size_t newIndex = 0;
    {
        std::lock_guard<std::mutex> lock(m_playlistMutex);
        m_playlist.push_back(track);
        newIndex = m_playlist.size() - 1;
    }

    selectTrack(newIndex);
    return newIndex;
}

void AudioFileReader::removeTrack(size_t index) {
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    if (index >= m_playlist.size()) {
        return;
    }

    m_playlist.erase(m_playlist.begin() + static_cast<ptrdiff_t>(index));
    
    if (m_playlist.empty()) {
        m_currentTrackIndex.store(0, std::memory_order_relaxed);
        m_playheadPosition.store(0, std::memory_order_relaxed);
        m_isPlaying.store(false, std::memory_order_relaxed);
        return;
    }

    size_t current = m_currentTrackIndex.load(std::memory_order_relaxed);
    if (current >= m_playlist.size()) {
        current = m_playlist.size() - 1;
    }
    m_currentTrackIndex.store(current, std::memory_order_relaxed);
    m_playheadPosition.store(0, std::memory_order_relaxed);
}

void AudioFileReader::clearPlaylist() {
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    m_playlist.clear();
    m_currentTrackIndex.store(0, std::memory_order_relaxed);
    m_playheadPosition.store(0, std::memory_order_relaxed);
    m_isPlaying.store(false, std::memory_order_relaxed);
}

void AudioFileReader::selectTrack(size_t index) {
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    if (index < m_playlist.size()) {
        m_currentTrackIndex.store(index, std::memory_order_release);
        m_playheadPosition.store(0, std::memory_order_release);
        m_isPlaying.store(true, std::memory_order_relaxed);
    }
}

void AudioFileReader::nextTrack() {
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    if (!m_playlist.empty()) {
        const size_t next = (m_currentTrackIndex.load(std::memory_order_relaxed) + 1) % m_playlist.size();
        m_currentTrackIndex.store(next, std::memory_order_release);
        m_playheadPosition.store(0, std::memory_order_release);
    }
}

void AudioFileReader::prevTrack() {
    std::lock_guard<std::mutex> lock(m_playlistMutex);
    if (!m_playlist.empty()) {
        const size_t current = m_currentTrackIndex.load(std::memory_order_relaxed);
        const size_t prev = (current + m_playlist.size() - 1) % m_playlist.size();
        m_currentTrackIndex.store(prev, std::memory_order_release);
        m_playheadPosition.store(0, std::memory_order_release);
    }
}

bool AudioFileReader::loadAudioData(const float* const* channelData, uint32_t numChannels, uint32_t numSamples) {
    if (channelData == nullptr || numChannels == 0 || numSamples == 0) {
        return false;
    }
    addTrack("Custom Audio Track", "", channelData, numChannels, numSamples, 48000);
    return true;
}

bool AudioFileReader::loadWavFile(const std::string& filePath) {
    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        return false;
    }

    WavHeader header{};
    file.read(reinterpret_cast<char*>(&header), sizeof(WavHeader));

    if (std::strncmp(header.riff, "RIFF", 4) != 0 || std::strncmp(header.wave, "WAVE", 4) != 0) {
        return false;
    }

    // Locate "data" chunk
    char chunkId[4];
    uint32_t chunkSize = 0;
    while (file.read(chunkId, 4) && file.read(reinterpret_cast<char*>(&chunkSize), 4)) {
        if (std::strncmp(chunkId, "data", 4) == 0) {
            break;
        }
        file.seekg(chunkSize, std::ios::cur);
    }

    if (file.eof() || chunkSize == 0) {
        return false;
    }

    const uint32_t bytesPerSample = header.bitsPerSample / 8;
    const uint32_t numSamplesPerChannel = chunkSize / (header.numChannels * bytesPerSample);

    Common::AudioBuffer<float> tempBuffer(header.numChannels, numSamplesPerChannel);

    std::vector<uint8_t> rawBuffer(chunkSize);
    file.read(reinterpret_cast<char*>(rawBuffer.data()), chunkSize);

    if (header.bitsPerSample == 16) {
        const auto* pcm16 = reinterpret_cast<const int16_t*>(rawBuffer.data());
        for (uint32_t s = 0; s < numSamplesPerChannel; ++s) {
            for (uint32_t ch = 0; ch < header.numChannels; ++ch) {
                tempBuffer.getWritePointer(ch)[s] = static_cast<float>(pcm16[s * header.numChannels + ch]) / 32768.0f;
            }
        }
    } else if (header.bitsPerSample == 32 && header.audioFormat == 3) {
        const auto* float32 = reinterpret_cast<const float*>(rawBuffer.data());
        for (uint32_t s = 0; s < numSamplesPerChannel; ++s) {
            for (uint32_t ch = 0; ch < header.numChannels; ++ch) {
                tempBuffer.getWritePointer(ch)[s] = float32[s * header.numChannels + ch];
            }
        }
    } else {
        return false;
    }

    std::vector<const float*> channelPtrs(header.numChannels);
    for (uint32_t ch = 0; ch < header.numChannels; ++ch) {
        channelPtrs[ch] = tempBuffer.getReadPointer(ch);
    }

    addTrack("WAV File", filePath, channelPtrs.data(), header.numChannels, numSamplesPerChannel, header.sampleRate);
    return true;
}

void AudioFileReader::process(Common::AudioBuffer<float>& buffer) noexcept {
    if (!m_isPlaying.load(std::memory_order_relaxed)) {
        buffer.clear();
        return;
    }

    std::shared_ptr<AudioTrackInfo> currentTrack;
    {
        std::unique_lock<std::mutex> lock(m_playlistMutex, std::try_to_lock);
        if (lock.owns_lock()) {
            const size_t idx = m_currentTrackIndex.load(std::memory_order_relaxed);
            if (idx < m_playlist.size()) {
                currentTrack = m_playlist[idx];
            }
        }
    }

    if (!currentTrack || currentTrack->totalSamples == 0) {
        buffer.clear();
        return;
    }

    const uint32_t numChannels = buffer.getNumChannels();
    const uint32_t numSamples = buffer.getNumSamples();
    const uint32_t trackTotal = currentTrack->totalSamples;
    uint32_t pos = m_playheadPosition.load(std::memory_order_relaxed);

    for (uint32_t n = 0; n < numSamples; ++n) {
        for (uint32_t ch = 0; ch < numChannels; ++ch) {
            const uint32_t srcCh = std::min(ch, currentTrack->numChannels - 1);
            buffer.getWritePointer(ch)[n] = currentTrack->audioData.getReadPointer(srcCh)[pos];
        }

        pos++;
        if (pos >= trackTotal) {
            if (m_isLooping.load(std::memory_order_relaxed)) {
                pos = 0;
            } else {
                pos = 0;
                // Auto-advance to next track or stop if single
                nextTrack();
                break;
            }
        }
    }

    m_playheadPosition.store(pos, std::memory_order_relaxed);
}

} // namespace EarTraining::AudioEngine
