#include "AudioEngine/Modules/SurgicalEQ/BiquadFilter.h"
#include <cmath>
#include <algorithm>

namespace EarTraining::AudioEngine {

BiquadFilter::BiquadFilter() {
    calculateCoefficients();
}

void BiquadFilter::prepare(const AudioContext& context) {
    m_context = context;
    m_channelStates.resize(context.numChannels, DF2TState{0.0, 0.0});
    reset();
    calculateCoefficients();
}

void BiquadFilter::reset() noexcept {
    for (auto& state : m_channelStates) {
        state.s1 = 0.0;
        state.s2 = 0.0;
    }
}

void BiquadFilter::setParameters(FilterType type, double frequencyHz, double gainDb, double qFactor) noexcept {
    m_type = type;
    m_frequencyHz = std::clamp(frequencyHz, 20.0, m_context.getNyquist() * 0.95);
    m_gainDb = std::clamp(gainDb, -36.0, 36.0);
    m_qFactor = std::clamp(qFactor, 0.1, 30.0);
    calculateCoefficients();
}

void BiquadFilter::calculateCoefficients() noexcept {
    const double fs = (m_context.sampleRate > 0.0) ? m_context.sampleRate : 48000.0;
    const double w0 = Math::AcousticMath::TWO_PI * m_frequencyHz / fs;
    const double cosW0 = std::cos(w0);
    const double sinW0 = std::sin(w0);
    const double alpha = sinW0 / (2.0 * m_qFactor);
    // A = 10^(gainDb / 40) = sqrt(10^(gainDb / 20))
    const double A = std::pow(10.0, m_gainDb / 40.0);

    double b0 = 1.0, b1 = 0.0, b2 = 0.0;
    double a0 = 1.0, a1 = 0.0, a2 = 0.0;

    switch (m_type) {
        case FilterType::Bell: {
            b0 = 1.0 + alpha * A;
            b1 = -2.0 * cosW0;
            b2 = 1.0 - alpha * A;
            a0 = 1.0 + alpha / A;
            a1 = -2.0 * cosW0;
            a2 = 1.0 - alpha / A;
            break;
        }
        case FilterType::LowShelf: {
            const double sqrtA = std::sqrt(A);
            const double twoSqrtAAlpha = 2.0 * sqrtA * alpha;
            b0 = A * ((A + 1.0) - (A - 1.0) * cosW0 + twoSqrtAAlpha);
            b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cosW0);
            b2 = A * ((A + 1.0) - (A - 1.0) * cosW0 - twoSqrtAAlpha);
            a0 = (A + 1.0) + (A - 1.0) * cosW0 + twoSqrtAAlpha;
            a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cosW0);
            a2 = (A + 1.0) + (A - 1.0) * cosW0 - twoSqrtAAlpha;
            break;
        }
        case FilterType::HighShelf: {
            const double sqrtA = std::sqrt(A);
            const double twoSqrtAAlpha = 2.0 * sqrtA * alpha;
            b0 = A * ((A + 1.0) + (A - 1.0) * cosW0 + twoSqrtAAlpha);
            b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosW0);
            b2 = A * ((A + 1.0) + (A - 1.0) * cosW0 - twoSqrtAAlpha);
            a0 = (A + 1.0) - (A - 1.0) * cosW0 + twoSqrtAAlpha;
            a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cosW0);
            a2 = (A + 1.0) - (A - 1.0) * cosW0 - twoSqrtAAlpha;
            break;
        }
        case FilterType::BandPass: {
            // Constant 0 dB peak gain
            b0 = alpha;
            b1 = 0.0;
            b2 = -alpha;
            a0 = 1.0 + alpha;
            a1 = -2.0 * cosW0;
            a2 = 1.0 - alpha;
            break;
        }
        case FilterType::Notch: {
            b0 = 1.0;
            b1 = -2.0 * cosW0;
            b2 = 1.0;
            a0 = 1.0 + alpha;
            a1 = -2.0 * cosW0;
            a2 = 1.0 - alpha;
            break;
        }
        case FilterType::HighPass: {
            b0 = (1.0 + cosW0) * 0.5;
            b1 = -(1.0 + cosW0);
            b2 = (1.0 + cosW0) * 0.5;
            a0 = 1.0 + alpha;
            a1 = -2.0 * cosW0;
            a2 = 1.0 - alpha;
            break;
        }
        case FilterType::LowPass: {
            b0 = (1.0 - cosW0) * 0.5;
            b1 = 1.0 - cosW0;
            b2 = (1.0 - cosW0) * 0.5;
            a0 = 1.0 + alpha;
            a1 = -2.0 * cosW0;
            a2 = 1.0 - alpha;
            break;
        }
    }

    // Normalize coefficients by 1/a0
    const double invA0 = 1.0 / a0;
    m_b0 = b0 * invA0;
    m_b1 = b1 * invA0;
    m_b2 = b2 * invA0;
    m_a1 = a1 * invA0;
    m_a2 = a2 * invA0;
}

void BiquadFilter::process(Common::AudioBuffer<float>& buffer) noexcept {
    const uint32_t numChannels = std::min(buffer.getNumChannels(), static_cast<uint32_t>(m_channelStates.size()));
    const uint32_t numSamples = buffer.getNumSamples();

    for (uint32_t ch = 0; ch < numChannels; ++ch) {
        float* channelData = buffer.getWritePointer(ch);
        auto& state = m_channelStates[ch];

        for (uint32_t n = 0; n < numSamples; ++n) {
            const double x = static_cast<double>(channelData[n]);
            
            // Direct Form II Transposed difference equations:
            // y[n] = b0 * x[n] + s1[n-1]
            // s1[n] = b1 * x[n] - a1 * y[n] + s2[n-1]
            // s2[n] = b2 * x[n] - a2 * y[n]
            const double y = m_b0 * x + state.s1;
            state.s1 = m_b1 * x - m_a1 * y + state.s2;
            state.s2 = m_b2 * x - m_a2 * y;

            channelData[n] = static_cast<float>(y);
        }
    }
}

std::complex<double> BiquadFilter::getTransferFunctionAt(double freqHz) const noexcept {
    const double fs = (m_context.sampleRate > 0.0) ? m_context.sampleRate : 48000.0;
    const double omega = Math::AcousticMath::TWO_PI * freqHz / fs;
    const std::complex<double> ejw = std::polar(1.0, -omega);
    const std::complex<double> ej2w = std::polar(1.0, -2.0 * omega);

    const std::complex<double> num = m_b0 + m_b1 * ejw + m_b2 * ej2w;
    const std::complex<double> den = 1.0 + m_a1 * ejw + m_a2 * ej2w;

    return num / den;
}

double BiquadFilter::getMagnitudeDbAt(double freqHz) const noexcept {
    const std::complex<double> h = getTransferFunctionAt(freqHz);
    const double magLinear = std::abs(h);
    return Math::AcousticMath::amplitudeToDb(magLinear);
}

double BiquadFilter::getPhaseResponseAt(double freqHz) const noexcept {
    const std::complex<double> h = getTransferFunctionAt(freqHz);
    return std::arg(h);
}

double BiquadFilter::getGroupDelayMsAt(double freqHz) const noexcept {
    const double fs = (m_context.sampleRate > 0.0) ? m_context.sampleRate : 48000.0;
    // Numerical differentiation of unwrapped phase: tau_g = - d(theta)/d(omega)
    const double dFreq = 0.5; // 0.5 Hz delta
    const double f1 = std::max(1.0, freqHz - dFreq);
    const double f2 = std::min(m_context.getNyquist() - 1.0, freqHz + dFreq);

    const double phase1 = getPhaseResponseAt(f1);
    const double phase2 = getPhaseResponseAt(f2);

    double dPhase = phase2 - phase1;
    // Handle phase wrap-around
    while (dPhase > Math::AcousticMath::PI) dPhase -= Math::AcousticMath::TWO_PI;
    while (dPhase < -Math::AcousticMath::PI) dPhase += Math::AcousticMath::TWO_PI;

    const double dOmega = Math::AcousticMath::TWO_PI * (f2 - f1) / fs;
    const double groupDelaySamples = -dPhase / dOmega;

    // Convert samples to milliseconds: (samples / fs) * 1000
    return (groupDelaySamples / fs) * 1000.0;
}

} // namespace EarTraining::AudioEngine
