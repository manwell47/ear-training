#include "AudioEngine/Modules/SurgicalEQ/LinearPhaseFIR.h"
#include <cmath>
#include <algorithm>

namespace EarTraining::AudioEngine {

LinearPhaseFIR::LinearPhaseFIR() {
    m_kernel.resize(NUM_TAPS, 0.0f);
    m_kernel[getLatencySamples()] = 1.0f; // Default delta impulse (passthrough)
}

void LinearPhaseFIR::prepare(const AudioContext& context) {
    m_context = context;
    m_history.resize(context.numChannels, std::vector<float>(NUM_TAPS, 0.0f));
    m_historyIndex.assign(context.numChannels, 0);
    reset();
    designLinearPhaseKernel();
}

void LinearPhaseFIR::reset() noexcept {
    for (auto& hist : m_history) {
        std::fill(hist.begin(), hist.end(), 0.0f);
    }
    std::fill(m_historyIndex.begin(), m_historyIndex.end(), 0);
}

void LinearPhaseFIR::setParameters(FilterType type, double frequencyHz, double gainDb, double qFactor) noexcept {
    m_type = type;
    m_frequencyHz = std::clamp(frequencyHz, 20.0, m_context.getNyquist() * 0.95);
    m_gainDb = std::clamp(gainDb, -36.0, 36.0);
    m_qFactor = std::clamp(qFactor, 0.1, 30.0);
    designLinearPhaseKernel();
}

void LinearPhaseFIR::designLinearPhaseKernel() noexcept {
    const double fs = (m_context.sampleRate > 0.0) ? m_context.sampleRate : 48000.0;
    const int32_t M = static_cast<int32_t>(getLatencySamples()); // Center symmetry point = 128
    const double fc = m_frequencyHz / fs;
    const double bwOct = Math::AcousticMath::qToBandwidthOctaves(m_qFactor);
    const double fLow = (m_frequencyHz / std::pow(2.0, bwOct * 0.5)) / fs;
    const double fHigh = (m_frequencyHz * std::pow(2.0, bwOct * 0.5)) / fs;
    const double linearGain = Math::AcousticMath::dbToAmplitude(m_gainDb);
    const double gainDelta = linearGain - 1.0;

    m_kernel.assign(NUM_TAPS, 0.0f);

    for (int32_t n = 0; n < static_cast<int32_t>(NUM_TAPS); ++n) {
        const double k = static_cast<double>(n - M);
        double h = 0.0;

        switch (m_type) {
            case FilterType::Bell: {
                // Symmetrical bandpass sinc kernel scaled by gain difference + delta impulse
                const double bpSinc = (2.0 * fHigh * Math::AcousticMath::normalizedSinc(2.0 * fHigh * k)) -
                                      (2.0 * fLow  * Math::AcousticMath::normalizedSinc(2.0 * fLow  * k));
                const double delta = (n == M) ? 1.0 : 0.0;
                h = delta + bpSinc * gainDelta;
                break;
            }
            case FilterType::LowPass: {
                h = 2.0 * fc * Math::AcousticMath::normalizedSinc(2.0 * fc * k);
                break;
            }
            case FilterType::HighPass: {
                const double lp = 2.0 * fc * Math::AcousticMath::normalizedSinc(2.0 * fc * k);
                const double delta = (n == M) ? 1.0 : 0.0;
                h = delta - lp;
                break;
            }
            case FilterType::BandPass: {
                h = (2.0 * fHigh * Math::AcousticMath::normalizedSinc(2.0 * fHigh * k)) -
                    (2.0 * fLow  * Math::AcousticMath::normalizedSinc(2.0 * fLow  * k));
                break;
            }
            case FilterType::Notch: {
                const double bp = (2.0 * fHigh * Math::AcousticMath::normalizedSinc(2.0 * fHigh * k)) -
                                  (2.0 * fLow  * Math::AcousticMath::normalizedSinc(2.0 * fLow  * k));
                const double delta = (n == M) ? 1.0 : 0.0;
                h = delta - bp;
                break;
            }
            case FilterType::LowShelf: {
                const double lp = 2.0 * fc * Math::AcousticMath::normalizedSinc(2.0 * fc * k);
                const double delta = (n == M) ? 1.0 : 0.0;
                h = delta + lp * gainDelta;
                break;
            }
            case FilterType::HighShelf: {
                const double lp = 2.0 * fc * Math::AcousticMath::normalizedSinc(2.0 * fc * k);
                const double hp = ((n == M) ? 1.0 : 0.0) - lp;
                const double delta = (n == M) ? 1.0 : 0.0;
                h = delta + hp * gainDelta;
                break;
            }
        }

        // Apply Blackman window to guarantee steep stopband rejection and smooth taper
        const double win = Math::AcousticMath::blackmanWindow(n, NUM_TAPS);
        m_kernel[n] = static_cast<float>(h * win);
    }
}

void LinearPhaseFIR::process(Common::AudioBuffer<float>& buffer) noexcept {
    const uint32_t numChannels = std::min(buffer.getNumChannels(), static_cast<uint32_t>(m_history.size()));
    const uint32_t numSamples = buffer.getNumSamples();

    for (uint32_t ch = 0; ch < numChannels; ++ch) {
        float* channelData = buffer.getWritePointer(ch);
        auto& hist = m_history[ch];
        uint32_t histIdx = m_historyIndex[ch];

        for (uint32_t n = 0; n < numSamples; ++n) {
            const float x = channelData[n];

            // Store sample in circular history
            hist[histIdx] = x;
            histIdx = (histIdx + 1) % NUM_TAPS;

            // Direct convolution with symmetrical FIR kernel
            float y = 0.0f;
            for (uint32_t k = 0; k < NUM_TAPS; ++k) {
                const uint32_t tapIdx = (histIdx + NUM_TAPS - 1 - k) % NUM_TAPS;
                y += hist[tapIdx] * m_kernel[k];
            }

            channelData[n] = y;
        }

        m_historyIndex[ch] = histIdx;
    }
}

double LinearPhaseFIR::getMagnitudeDbAt(double freqHz) const noexcept {
    const double fs = (m_context.sampleRate > 0.0) ? m_context.sampleRate : 48000.0;
    const double omega = Math::AcousticMath::TWO_PI * freqHz / fs;

    std::complex<double> H(0.0, 0.0);
    for (uint32_t n = 0; n < NUM_TAPS; ++n) {
        const std::complex<double> ejwn = std::polar(static_cast<double>(m_kernel[n]), -omega * static_cast<double>(n));
        H += ejwn;
    }

    const double mag = std::abs(H);
    return Math::AcousticMath::amplitudeToDb(mag);
}

double LinearPhaseFIR::getPhaseResponseAt(double freqHz) const noexcept {
    const double fs = (m_context.sampleRate > 0.0) ? m_context.sampleRate : 48000.0;
    const double omega = Math::AcousticMath::TWO_PI * freqHz / fs;
    // Strictly linear phase: Phase(omega) = - tau * omega
    const double tau = static_cast<double>(getLatencySamples());
    return -tau * omega;
}

double LinearPhaseFIR::getGroupDelayMsAt([[maybe_unused]] double freqHz) const noexcept {
    const double fs = (m_context.sampleRate > 0.0) ? m_context.sampleRate : 48000.0;
    // Exactly constant group delay: (Latency / fs) * 1000 ms
    return (static_cast<double>(getLatencySamples()) / fs) * 1000.0;
}

} // namespace EarTraining::AudioEngine
