<div align="center">
  <img src="https://raw.githubusercontent.com/manwell47/ear-training/main/public/logo.png" alt="Ear Training Logo" width="150"/>
  <h1>🎵 Ear Training Pro: Advanced Audio Engineering Simulator</h1>
  <p><strong>A Gamified Parametric Equalization and Mixing Training Platform</strong></p>
  <a href="https://manwell47.github.io/ear-training/"><strong>🔥 PLAY THE DEMO NOW 🔥</strong></a>
</div>

---

## 🎛️ Overview

**Ear Training Pro** is an open-source, web-based training platform designed to help audio engineers, producers, and students master frequency recognition and parametric equalization. By blending a hyper-realistic UI with robust audio signal processing, the app offers a dynamic, gamified learning experience directly in your browser.

Say goodbye to boring technical drills. With real-time spectrum analysis, immersive multitrack mixing, and an RPG-style progression system, Ear Training Pro trains your ears using realistic mixing scenarios.

---

## 🚀 Key Features

* **🎚️ Surgical EQ Simulator**: A hyper-realistic parametric EQ interface that mirrors professional DAWs and VST plugins.
* **🎧 Multitrack Campaigns (NEW!)**: Work with multitrack stems (e.g., Orchestral sections, Drum kits). Solo, mute, and adjust faders just like on a real mixing console.
* **🎓 Pedagogical Director**: Evaluates your choices using real-world mixing logic. Instead of just right/wrong, it tells you *why* a frequency change matters (e.g., "You boosted 200Hz on the snare, introducing muddiness").
* **📈 VST-Fidelity Rendering**: Fluid, high-performance RTA (Real-Time Analyzer) spectrograms with precise temporal ballistics (RMS/EMA) for accurate visual feedback.
* **🏆 RPG Progression System**: Climb the ranks from a beginner "Cable Puller" to a master "Senior Mixing Engineer." Unlock new modes, tighter difficulty tolerances, and "Boss Battles" as you level up.
* **🧠 AB Comparison Engine**: Instantly toggle between the unprocessed signal and your EQ adjustments to train your comparative listening skills.

---

## 🎮 Game Modes

### 1. Arcade Mode (Randomized)
Jump straight into the action. The engine serves up random stems or tracks, applying secret EQ boosts or cuts. Your job: use your ears (and the spectrum analyzer) to identify the altered frequency, estimate the gain change, and dial in the Q-factor.

### 2. Campaign Mode (Multitrack Mixing)
Take on complex, real-world mixing challenges. Load up an entire multitrack session (e.g., an Orchestra with Main Pairs, Outriggers, and Spot Mics). The client has requested specific tonal changes, or a track is suffering from masking. You have a limited number of "strikes" to identify and fix the problematic stems.

### 3. Free Mode (Practice)
No pressure, no scores. Load any track, play with the EQ, analyze the RTA, and learn how different frequencies affect the timbre of various instruments.

---

## 🛠️ Technical Architecture

Ear Training Pro is built entirely with vanilla web technologies, requiring **no build steps or bundlers**.

* **Frontend**: Vanilla HTML5, CSS3, and JavaScript (ES6 Modules).
* **Audio Processing**: Web Audio API (BiquadFilterNode, AnalyserNode, GainNode).
* **Visualizer**: HTML5 `<canvas>` with optimized `requestAnimationFrame` rendering.
* **Deployment**: GitHub Pages (Static hosting).

---

## 💻 Local Development

Getting the project running locally is incredibly simple. There are no `npm install` requirements.

1. Clone the repository:
   ```bash
   git clone https://github.com/manwell47/ear-training.git
   ```
2. Navigate to the directory:
   ```bash
   cd ear-training
   ```
3. Serve the directory using any local web server. For example, with Python:
   ```bash
   python -m http.server 5500
   ```
4. Open your browser and navigate to `http://localhost:5500`.

---

## 🚧 Roadmap & Development Status

*This project is currently in active development.*

- [x] Core Web Audio routing and EQ processing
- [x] High-fidelity Canvas RTA visualizer
- [x] Scoring engine with RPG rank progression
- [x] Multitrack stem loading and mixing faders
- [ ] Advanced dynamic range compression training
- [ ] User account saving and cloud progress sync
- [ ] Mobile/Tablet responsive layout optimizations

---

## 🌍 Translations

*(More translations coming soon)*

- 🇪🇸 **Español:** [Ver README en Español](README.md) - Plataforma avanzada de entrenamiento auditivo y ecualización paramétrica diseñada para ingenieros de sonido, productores y estudiantes.
- 🇫🇷 **Français:** Plateforme avancée d'entraînement auditif.
- 🇩🇪 **Deutsch:** Fortschrittliche Plattform für Gehörbildung.

---

## 🤝 Contributing

Contributions are welcome! Whether it's adding new audio stems, improving the pedagogical feedback strings, or fixing CSS bugs, feel free to open a Pull Request or issue.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

<p align="center">Made with ❤️ for audio engineers everywhere.</p>
