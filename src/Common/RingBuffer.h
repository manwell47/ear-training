#pragma once

#include <vector>
#include <atomic>
#include <cstdint>
#include <concepts>
#include <algorithm>

namespace EarTraining::Common {

/**
 * @brief Lock-free Single-Producer Single-Consumer (SPSC) FIFO Ring Buffer.
 * 
 * Specifically designed for thread-safe audio-thread to UI-thread data streaming.
 * Capacity is automatically rounded up to the next power of two for fast bitmask indexing.
 */
template <typename T>
class RingBuffer {
public:
    explicit RingBuffer(uint32_t capacity = 1024) {
        // Round up to nearest power of 2
        m_capacity = 1;
        while (m_capacity < capacity) {
            m_capacity <<= 1;
        }
        m_mask = m_capacity - 1;
        m_buffer.resize(m_capacity);
        reset();
    }

    void reset() noexcept {
        m_writeIndex.store(0, std::memory_order_relaxed);
        m_readIndex.store(0, std::memory_order_relaxed);
    }

    [[nodiscard]] uint32_t getCapacity() const noexcept {
        return m_capacity;
    }

    [[nodiscard]] uint32_t getAvailableForRead() const noexcept {
        const uint32_t write = m_writeIndex.load(std::memory_order_acquire);
        const uint32_t read = m_readIndex.load(std::memory_order_relaxed);
        return (write >= read) ? (write - read) : (m_capacity - (read - write));
    }

    [[nodiscard]] uint32_t getAvailableForWrite() const noexcept {
        return m_capacity - 1 - getAvailableForRead();
    }

    /**
     * @brief Writes a single item into the FIFO. (Real-time safe, called from Producer/Audio thread).
     */
    bool push(const T& item) noexcept {
        const uint32_t currentWrite = m_writeIndex.load(std::memory_order_relaxed);
        const uint32_t currentRead = m_readIndex.load(std::memory_order_acquire);

        if (((currentWrite + 1) & m_mask) == currentRead) {
            return false; // Buffer full
        }

        m_buffer[currentWrite] = item;
        m_writeIndex.store((currentWrite + 1) & m_mask, std::memory_order_release);
        return true;
    }

    /**
     * @brief Reads a single item from the FIFO. (Called from Consumer/UI thread).
     */
    bool pop(T& item) noexcept {
        const uint32_t currentRead = m_readIndex.load(std::memory_order_relaxed);
        const uint32_t currentWrite = m_writeIndex.load(std::memory_order_acquire);

        if (currentRead == currentWrite) {
            return false; // Buffer empty
        }

        item = m_buffer[currentRead];
        m_readIndex.store((currentRead + 1) & m_mask, std::memory_order_release);
        return true;
    }

private:
    std::vector<T> m_buffer;
    uint32_t m_capacity{1024};
    uint32_t m_mask{1023};
    alignas(64) std::atomic<uint32_t> m_writeIndex{0};
    alignas(64) std::atomic<uint32_t> m_readIndex{0};
};

} // namespace EarTraining::Common
