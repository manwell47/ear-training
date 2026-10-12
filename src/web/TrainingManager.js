/**
 * @file TrainingManager.js
 * @description Core interactive state machine for Ear Training sessions.
 * Integrates ScoringEngine for 70/30 weighted independent frequency/gain evaluation,
 * filter type bonus points (+500 PTS in Hard/Pro mode), streak-based distractors, lives management, and stage progression.
 */

import { ScoringEngine } from './ScoringEngine.js?v=80';

export const RANGOS = ["Tiracables", "Asistente de Estudio", "Técnico de Monitores", "Ingeniero de Mezcla", "Mastering Engineer"];

/**
 * Musical training band. Targets are clamped here because the 60 Hz/sub-bass
 * region and anything beyond ~14 kHz are barely audible on typical playback
 * systems and made the game feel unfair. Rare extremes are still reachable via
 * the weighted scenario pick (see _pickWeightedScenario).
 */
export const TARGET_FREQ_MIN_HZ = 80;
export const TARGET_FREQ_MAX_HZ = 14000;

/**
 * Instrument-driven EQ scenario banks. Each class holds ≥6 idiomatic moves so
 * the proposed EQ is (a) typical for the target instrument and (b) varied
 * between trials. Frequencies stay inside the musical band; sub-bass (<100 Hz)
 * and ultra-high (>12 kHz) entries are intentionally rare and down-weighted.
 */
export const ACOUSTIC_EQ_SCENARIOS = {
  kick: [
    { name: 'Sub Thump', type: 'peaking', frequencyHz: 90, gainDb: 4, qFactor: 1.2 },
    { name: 'Boom Tame', type: 'peaking', frequencyHz: 150, gainDb: -4, qFactor: 1.5 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 250, gainDb: -4, qFactor: 1.6 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 350, gainDb: -5, qFactor: 2.0 },
    { name: 'Cardboard Cut', type: 'peaking', frequencyHz: 500, gainDb: -4, qFactor: 1.8 },
    { name: 'Beater Attack', type: 'peaking', frequencyHz: 3500, gainDb: 5, qFactor: 1.5 },
    { name: 'Click Definition', type: 'peaking', frequencyHz: 6000, gainDb: 4, qFactor: 1.6 },
    { name: 'Rumble Filter', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 }
  ],
  snare: [
    { name: 'Body Thump', type: 'peaking', frequencyHz: 180, gainDb: 4, qFactor: 1.2 },
    { name: 'Body Punch', type: 'peaking', frequencyHz: 220, gainDb: 3, qFactor: 1.4 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 400, gainDb: -5, qFactor: 2.0 },
    { name: 'Ring Cut', type: 'peaking', frequencyHz: 500, gainDb: -6, qFactor: 3.0 },
    { name: 'Honk Cut', type: 'peaking', frequencyHz: 900, gainDb: -5, qFactor: 2.5 },
    { name: 'Snap', type: 'peaking', frequencyHz: 3500, gainDb: 5, qFactor: 1.6 },
    { name: 'Presence/Crack', type: 'peaking', frequencyHz: 5000, gainDb: 4, qFactor: 1.5 },
    { name: 'Rattle Tame', type: 'peaking', frequencyHz: 7000, gainDb: -4, qFactor: 2.0 },
    { name: 'Bottom Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 }
  ],
  vocals: [
    { name: 'Mud Cut (Proximity)', type: 'peaking', frequencyHz: 250, gainDb: -3, qFactor: 1.5 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 500, gainDb: -4, qFactor: 1.8 },
    { name: 'Honk Cut', type: 'peaking', frequencyHz: 800, gainDb: -4, qFactor: 2.0 },
    { name: 'Nasal Cut', type: 'peaking', frequencyHz: 1200, gainDb: -4, qFactor: 2.0 },
    { name: 'Intelligibility', type: 'peaking', frequencyHz: 3000, gainDb: 4, qFactor: 1.5 },
    { name: 'Presence', type: 'peaking', frequencyHz: 4500, gainDb: 3, qFactor: 1.4 },
    { name: 'Harshness Cut', type: 'peaking', frequencyHz: 6500, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Air', type: 'highshelf', frequencyHz: 12000, gainDb: 3, qFactor: 1.0 },
    { name: 'Plosives Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 }
  ],
  bass: [
    { name: 'Sub Weight', type: 'peaking', frequencyHz: 90, gainDb: 4, qFactor: 1.2 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 250, gainDb: -4, qFactor: 2.0 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 400, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Growl', type: 'peaking', frequencyHz: 700, gainDb: 4, qFactor: 2.0 },
    { name: 'String Definition', type: 'peaking', frequencyHz: 1000, gainDb: 4, qFactor: 2.2 },
    { name: 'Pick Attack', type: 'peaking', frequencyHz: 1800, gainDb: 4, qFactor: 1.8 },
    { name: 'Click', type: 'peaking', frequencyHz: 3000, gainDb: 3, qFactor: 1.8 },
    { name: 'Sub Foundation', type: 'lowshelf', frequencyHz: 100, gainDb: 3, qFactor: 1.0 }
  ],
  guitars: [
    { name: 'Body Warmth', type: 'lowshelf', frequencyHz: 180, gainDb: 3, qFactor: 1.0 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 250, gainDb: -4, qFactor: 1.5 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 450, gainDb: -4, qFactor: 1.8 },
    { name: 'Honk Cut', type: 'peaking', frequencyHz: 900, gainDb: -4, qFactor: 2.0 },
    { name: 'Presence', type: 'peaking', frequencyHz: 2500, gainDb: 4, qFactor: 1.4 },
    { name: 'Bite', type: 'peaking', frequencyHz: 3500, gainDb: 3, qFactor: 1.5 },
    { name: 'Scratch', type: 'peaking', frequencyHz: 5000, gainDb: 3, qFactor: 1.6 },
    { name: 'Harshness Cut', type: 'peaking', frequencyHz: 6000, gainDb: -4, qFactor: 2.0 },
    { name: 'Fizz Cut', type: 'lowpass', frequencyHz: 9000, gainDb: 0, qFactor: 0.7 }
  ],
  cymbals: [
    { name: 'Room Resonance Cut', type: 'peaking', frequencyHz: 450, gainDb: -3, qFactor: 2.0 },
    { name: 'Body', type: 'peaking', frequencyHz: 800, gainDb: 3, qFactor: 1.5 },
    { name: 'Harshness Cut', type: 'peaking', frequencyHz: 3500, gainDb: -4, qFactor: 2.5 },
    { name: 'Sizzle', type: 'peaking', frequencyHz: 6000, gainDb: 3, qFactor: 1.6 },
    { name: 'Ice Pick Cut', type: 'peaking', frequencyHz: 8000, gainDb: -4, qFactor: 2.2 },
    { name: 'Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 },
    { name: 'Bell Shimmer', type: 'highshelf', frequencyHz: 12000, gainDb: 3, qFactor: 1.0 },
    { name: 'Low Cut', type: 'highpass', frequencyHz: 400, gainDb: 0, qFactor: 0.7 }
  ],
  drumbus: [
    { name: 'Kick Weight', type: 'peaking', frequencyHz: 120, gainDb: 3, qFactor: 1.2 },
    { name: 'Mud Cleanup', type: 'peaking', frequencyHz: 350, gainDb: -3, qFactor: 1.5 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 500, gainDb: -3, qFactor: 2.0 },
    { name: 'Snare Crack', type: 'peaking', frequencyHz: 4000, gainDb: 2.5, qFactor: 1.4 },
    { name: 'Presence Push', type: 'peaking', frequencyHz: 5000, gainDb: 2.5, qFactor: 1.5 },
    { name: 'Cymbal Lift', type: 'highshelf', frequencyHz: 10000, gainDb: 2, qFactor: 1.0 },
    { name: 'Air Lift', type: 'highshelf', frequencyHz: 12000, gainDb: 2, qFactor: 1.0 },
    { name: 'Glue', type: 'lowshelf', frequencyHz: 100, gainDb: 2, qFactor: 1.0 }
  ],
  generic: [
    { name: 'Warmth', type: 'lowshelf', frequencyHz: 150, gainDb: 2, qFactor: 1.0 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 250, gainDb: -3, qFactor: 1.8 },
    { name: 'Boxy Cut', type: 'peaking', frequencyHz: 400, gainDb: -3, qFactor: 2.0 },
    { name: 'Honk Cut', type: 'peaking', frequencyHz: 800, gainDb: -3, qFactor: 2.0 },
    { name: 'Clarity', type: 'peaking', frequencyHz: 3000, gainDb: 2, qFactor: 1.5 },
    { name: 'Presence', type: 'peaking', frequencyHz: 5000, gainDb: 2.5, qFactor: 1.5 },
    { name: 'Air', type: 'highshelf', frequencyHz: 8000, gainDb: 2, qFactor: 1.0 },
    { name: 'Hiss Cut', type: 'lowpass', frequencyHz: 12000, gainDb: 0, qFactor: 0.7 }
  ],
  room: [
    { name: 'Boom', type: 'peaking', frequencyHz: 150, gainDb: -3.5, qFactor: 1.5 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 300, gainDb: -3, qFactor: 2.0 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 500, gainDb: -3, qFactor: 1.8 },
    { name: 'Honk Cut', type: 'peaking', frequencyHz: 900, gainDb: -3, qFactor: 2.0 },
    { name: 'Harshness Cut', type: 'peaking', frequencyHz: 4000, gainDb: -3, qFactor: 2.0 },
    { name: 'Brightness', type: 'highshelf', frequencyHz: 6000, gainDb: 2.5, qFactor: 1.0 },
    { name: 'Air Lift', type: 'highshelf', frequencyHz: 10000, gainDb: 2, qFactor: 1.0 },
    { name: 'Rumble Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 }
  ],
  strings: [
    { name: 'Body Warmth', type: 'lowshelf', frequencyHz: 200, gainDb: 3, qFactor: 1.0 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 400, gainDb: -4, qFactor: 1.8 },
    { name: 'Honk Cut', type: 'peaking', frequencyHz: 800, gainDb: -4, qFactor: 2.0 },
    { name: 'Nasal Cut', type: 'peaking', frequencyHz: 1200, gainDb: -4, qFactor: 1.8 },
    { name: 'Harshness Cut', type: 'peaking', frequencyHz: 3000, gainDb: -4, qFactor: 2.0 },
    { name: 'Rosin Presence', type: 'peaking', frequencyHz: 4000, gainDb: 3, qFactor: 1.5 },
    { name: 'String Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 },
    { name: 'Silk', type: 'highshelf', frequencyHz: 12000, gainDb: 2.5, qFactor: 1.0 }
  ],
  master: [
    { name: 'Lowshelf Glue', type: 'lowshelf', frequencyHz: 100, gainDb: 3, qFactor: 1.0 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 250, gainDb: -3, qFactor: 1.8 },
    { name: 'Low-Mid Tame', type: 'peaking', frequencyHz: 350, gainDb: -3, qFactor: 1.5 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 550, gainDb: -3, qFactor: 1.5 },
    { name: 'High-Mid Polish', type: 'peaking', frequencyHz: 3000, gainDb: 3, qFactor: 1.2 },
    { name: 'Presence', type: 'peaking', frequencyHz: 5000, gainDb: 3, qFactor: 1.3 },
    { name: 'Harshness Tame', type: 'peaking', frequencyHz: 7000, gainDb: -3, qFactor: 2.0 },
    { name: 'Air Lift', type: 'highshelf', frequencyHz: 12000, gainDb: 4, qFactor: 1.0 }
  ],
  synthetic: [
    { name: 'Noise Weight', type: 'lowshelf', frequencyHz: 150, gainDb: 4, qFactor: 1.0 },
    { name: 'Noise Body', type: 'peaking', frequencyHz: 250, gainDb: 4, qFactor: 1.4 },
    { name: 'Noise Mid Cut', type: 'peaking', frequencyHz: 500, gainDb: -4, qFactor: 1.8 },
    { name: 'Noise Bell', type: 'peaking', frequencyHz: 1000, gainDb: 5, qFactor: 2.0 },
    { name: 'Noise Presence', type: 'peaking', frequencyHz: 3000, gainDb: 4, qFactor: 1.5 },
    { name: 'Noise Tame', type: 'peaking', frequencyHz: 6000, gainDb: -4, qFactor: 2.0 },
    { name: 'Noise Air', type: 'highshelf', frequencyHz: 8000, gainDb: 4, qFactor: 1.0 },
    { name: 'Noise Hiss Cut', type: 'lowpass', frequencyHz: 12000, gainDb: 0, qFactor: 0.7 }
  ],
  // Orchestral / ensemble capture (Decca tree, main pair, outriggers, hall).
  // Gentle, wide moves: the goal is depth, bloom and natural timbre, never
  // surgical aggression.
  orchestra: [
    { name: 'Hall Rumble Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
    { name: 'Body Bloom', type: 'lowshelf', frequencyHz: 150, gainDb: 3, qFactor: 1.0 },
    { name: 'Low-Mid Woodiness', type: 'peaking', frequencyHz: 250, gainDb: -3, qFactor: 1.5 },
    { name: 'Hall Resonance Cut', type: 'peaking', frequencyHz: 400, gainDb: -3.5, qFactor: 1.8 },
    { name: 'String Sheen', type: 'peaking', frequencyHz: 3000, gainDb: 3, qFactor: 1.3 },
    { name: 'Rosin Presence', type: 'peaking', frequencyHz: 5000, gainDb: 2.5, qFactor: 1.4 },
    { name: 'Hall Harshness Cut', type: 'peaking', frequencyHz: 6500, gainDb: -3, qFactor: 2.0 },
    { name: 'Decca Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 },
    { name: 'Silk', type: 'highshelf', frequencyHz: 12000, gainDb: 2.5, qFactor: 1.0 }
  ],
  // Rack / floor toms: shell tone down low, stick attack up high.
  toms: [
    { name: 'Shell Thump', type: 'peaking', frequencyHz: 100, gainDb: 4, qFactor: 1.3 },
    { name: 'Boom Tame', type: 'peaking', frequencyHz: 200, gainDb: -4, qFactor: 1.6 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 400, gainDb: -4, qFactor: 2.0 },
    { name: 'Cardboard Cut', type: 'peaking', frequencyHz: 600, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Stick Attack', type: 'peaking', frequencyHz: 3000, gainDb: 4, qFactor: 1.5 },
    { name: 'Skin Snap', type: 'peaking', frequencyHz: 5000, gainDb: 3.5, qFactor: 1.6 },
    { name: 'Rattle Tame', type: 'peaking', frequencyHz: 7000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 }
  ],
  // Electric piano / organ / DI keys.
  keys: [
    { name: 'Body Warmth', type: 'lowshelf', frequencyHz: 150, gainDb: 3, qFactor: 1.0 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 250, gainDb: -3.5, qFactor: 1.6 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 500, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Honk Cut', type: 'peaking', frequencyHz: 900, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Bell Definition', type: 'peaking', frequencyHz: 2500, gainDb: 3.5, qFactor: 1.4 },
    { name: 'Key Click', type: 'peaking', frequencyHz: 4000, gainDb: 3, qFactor: 1.5 },
    { name: 'Bark Tame', type: 'peaking', frequencyHz: 6000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Shimmer', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 },
    { name: 'Hiss Cut', type: 'lowpass', frequencyHz: 13000, gainDb: 0, qFactor: 0.7 }
  ],
  // Acoustic piano (spot mic).
  piano: [
    { name: 'Pedal Rumble Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
    { name: 'Low Body', type: 'peaking', frequencyHz: 120, gainDb: 3.5, qFactor: 1.2 },
    { name: 'Woodiness Cut', type: 'peaking', frequencyHz: 250, gainDb: -3.5, qFactor: 1.6 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 500, gainDb: -4, qFactor: 1.8 },
    { name: 'Honky-Tonk Cut', type: 'peaking', frequencyHz: 1000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Hammer Attack', type: 'peaking', frequencyHz: 3000, gainDb: 3.5, qFactor: 1.5 },
    { name: 'Presence', type: 'peaking', frequencyHz: 5000, gainDb: 3, qFactor: 1.4 },
    { name: 'Harshness Cut', type: 'peaking', frequencyHz: 7000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Lid Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 }
  ],
  // Orchestral woodwinds (flute, oboe, clarinet, bassoon).
  woodwinds: [
    { name: 'Key Noise Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
    { name: 'Hollow Body', type: 'peaking', frequencyHz: 300, gainDb: -3.5, qFactor: 1.6 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 600, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Woody Cut', type: 'peaking', frequencyHz: 1000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Nasal Cut', type: 'peaking', frequencyHz: 1500, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Presence', type: 'peaking', frequencyHz: 3500, gainDb: 3, qFactor: 1.5 },
    { name: 'Breath Detail', type: 'peaking', frequencyHz: 5000, gainDb: 3.5, qFactor: 1.4 },
    { name: 'Shrill Tame', type: 'peaking', frequencyHz: 7000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 }
  ],
  // Brass (trumpet, trombone, horn, tuba) — body, blat and brilliance.
  brass: [
    { name: 'Rumble Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
    { name: 'Body / Weight', type: 'lowshelf', frequencyHz: 150, gainDb: 3, qFactor: 1.0 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 400, gainDb: -4, qFactor: 1.8 },
    { name: 'Honk Cut', type: 'peaking', frequencyHz: 800, gainDb: -4, qFactor: 2.0 },
    { name: 'Blat / Bite', type: 'peaking', frequencyHz: 1500, gainDb: 3.5, qFactor: 1.6 },
    { name: 'Brilliance', type: 'peaking', frequencyHz: 3000, gainDb: 3.5, qFactor: 1.4 },
    { name: 'Rasp Cut', type: 'peaking', frequencyHz: 4500, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Harshness Cut', type: 'peaking', frequencyHz: 6000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 }
  ],
  // Rotary / drawbar organ (Leslie cabinet). Key click, drawbar bite and the
  // famous spinning top-end are the signature moves.
  organ: [
    { name: 'Rumble Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
    { name: 'Body / Growl', type: 'lowshelf', frequencyHz: 120, gainDb: 3, qFactor: 1.0 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 250, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 500, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Honk Cut', type: 'peaking', frequencyHz: 900, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Key Click', type: 'peaking', frequencyHz: 2000, gainDb: 3, qFactor: 1.4 },
    { name: 'Drawbar Bite', type: 'peaking', frequencyHz: 3500, gainDb: 3.5, qFactor: 1.5 },
    { name: 'Leslie Sizzle', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 },
    { name: 'Rotary Air', type: 'highshelf', frequencyHz: 12000, gainDb: 2.5, qFactor: 1.0 }
  ],
  // Electric piano (Wurlitzer / Rhodes). Warm body, tine bell and the Wurli bark.
  epiano: [
    { name: 'Rumble Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
    { name: 'Body / Warmth', type: 'lowshelf', frequencyHz: 150, gainDb: 3, qFactor: 1.0 },
    { name: 'Mud Cut', type: 'peaking', frequencyHz: 250, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Bark Cut', type: 'peaking', frequencyHz: 800, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Bell / Tine', type: 'peaking', frequencyHz: 2500, gainDb: 3.5, qFactor: 1.4 },
    { name: 'Attack Click', type: 'peaking', frequencyHz: 4000, gainDb: 3, qFactor: 1.4 },
    { name: 'Harshness Cut', type: 'peaking', frequencyHz: 6500, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Sparkle', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 },
    { name: 'Air', type: 'highshelf', frequencyHz: 12000, gainDb: 2.5, qFactor: 1.0 }
  ],
  // Acoustic guitar (steel or nylon). Body, pick attack and string squeak.
  acoustic_guitar: [
    { name: 'Rumble Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
    { name: 'Body / Warmth', type: 'lowshelf', frequencyHz: 150, gainDb: 3, qFactor: 1.0 },
    { name: 'Boom Cut', type: 'peaking', frequencyHz: 120, gainDb: -3.5, qFactor: 1.6 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 300, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Cardboard Cut', type: 'peaking', frequencyHz: 600, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Pick Attack', type: 'peaking', frequencyHz: 2500, gainDb: 3.5, qFactor: 1.4 },
    { name: 'String Definition', type: 'peaking', frequencyHz: 4000, gainDb: 3, qFactor: 1.4 },
    { name: 'Squeak Cut', type: 'peaking', frequencyHz: 6000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 }
  ],
  // Hand percussion (congas, bongos, shakers, cajón, timbales).
  percussion: [
    { name: 'Rumble Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
    { name: 'Hand Drum Body', type: 'peaking', frequencyHz: 150, gainDb: 3.5, qFactor: 1.5 },
    { name: 'Boom Cut', type: 'peaking', frequencyHz: 250, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 500, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Slap / Attack', type: 'peaking', frequencyHz: 3000, gainDb: 4, qFactor: 1.3 },
    { name: 'Stick Definition', type: 'peaking', frequencyHz: 5000, gainDb: 3.5, qFactor: 1.4 },
    { name: 'Rattle Cut', type: 'peaking', frequencyHz: 7000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Shaker Air', type: 'highshelf', frequencyHz: 10000, gainDb: 3, qFactor: 1.0 },
    { name: 'Sparkle', type: 'highshelf', frequencyHz: 12000, gainDb: 2.5, qFactor: 1.0 }
  ],
  // Solo flute — a dedicated case (breathy, hollow, thin) distinct from the
  // whole woodwind section, so single-instrument lessons are idiomatic.
  flute: [
    { name: 'Key Noise Cut', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
    { name: 'Body / Breath', type: 'lowshelf', frequencyHz: 200, gainDb: 3, qFactor: 1.0 },
    { name: 'Hollow Cut', type: 'peaking', frequencyHz: 500, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Wooly Cut', type: 'peaking', frequencyHz: 1000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Nasal Cut', type: 'peaking', frequencyHz: 1800, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Presence', type: 'peaking', frequencyHz: 3500, gainDb: 3, qFactor: 1.5 },
    { name: 'Breath Detail', type: 'peaking', frequencyHz: 6000, gainDb: 3.5, qFactor: 1.4 },
    { name: 'Shrill Cut', type: 'peaking', frequencyHz: 8000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Air', type: 'highshelf', frequencyHz: 11000, gainDb: 3, qFactor: 1.0 }
  ],
  // Solo trumpet — a dedicated case (blat, bite, rasp) distinct from the whole
  // brass section.
  trumpet: [
    { name: 'Rumble Cut', type: 'highpass', frequencyHz: 90, gainDb: 0, qFactor: 0.7 },
    { name: 'Body / Weight', type: 'lowshelf', frequencyHz: 200, gainDb: 3, qFactor: 1.0 },
    { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 500, gainDb: -3.5, qFactor: 1.8 },
    { name: 'Honk Cut', type: 'peaking', frequencyHz: 1000, gainDb: -4, qFactor: 2.0 },
    { name: 'Bite', type: 'peaking', frequencyHz: 2500, gainDb: 3.5, qFactor: 1.5 },
    { name: 'Brilliance', type: 'peaking', frequencyHz: 4000, gainDb: 3.5, qFactor: 1.4 },
    { name: 'Rasp Cut', type: 'peaking', frequencyHz: 5500, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Harshness Cut', type: 'peaking', frequencyHz: 7000, gainDb: -3.5, qFactor: 2.0 },
    { name: 'Air', type: 'highshelf', frequencyHz: 11000, gainDb: 3, qFactor: 1.0 }
  ]
};

export class TrainingManager {
  constructor() {
    this.difficulty = 'easy'; // 'easy' | 'normal' | 'hard'
    this.lives = 3;
    this.maxLives = 5;
    this.streak = 0;
    this.scorePoints = 0; // Total SoundGym score points (e.g. 43,042 SCORE)
    this.stage = 1;      // Current stage (e.g. Stage 1/5)
    this.maxStages = 5;
    this.totalTrials = 0;
    this.correctTrials = 0;
    this.totalScoreSum = 0;
    this.isGameOver = false;

    /** @type {EQQuizTarget|null} */
    this.currentTarget = null;
    /** @type {Array<EQQuizTarget>} */
    this.targetFilters = [];

    /** @type {Array<MultipleChoiceOption>} */
    this.easyOptions = [];
    this.correctEasyOptionIndex = 0;

    // ISO & SoundGym Center Frequencies for Ear Training
    this.isoFrequencies = [31, 50, 80, 125, 200, 315, 500, 800, 1250, 2000, 3150, 5000, 8000, 12500, 18000];

    // RPG Progression State
    this.currentLevel = 1;
    this.ranks = RANGOS;
    this.lastTrialResult = null;
    this.lastBossOutcome = null;

    // Full instrument repertoire used for arcade/quick-play lesson rotation.
    // Decoupled from the loaded audio source so players meet every instrument.
    this.LESSON_ROSTER = [
      'kick', 'snare', 'cymbals', 'toms', 'vocals', 'bass', 'guitars', 'acoustic_guitar',
      'strings', 'orchestra', 'woodwinds', 'flute', 'brass', 'trumpet', 'piano', 'keys',
      'organ', 'epiano', 'percussion', 'drumbus', 'room', 'master', 'generic'
    ];
    this.lessonRotationIndex = 0;

    // Acoustic class implied by the currently loaded SOURCE (set by the App).
    // Distinct from `currentAcousticClass`, which is the class of the trial in flight.
    this.sourceAcousticClass = 'generic';
    this.isSyntheticMode = false;

    // True when the loaded source is a multitrack session. Multitrack mixes mask
    // a single stem's EQ, so targets get a small gain boost for perceptibility.
    this.isMultitrackSession = false;
    // Friendly name of the stem the current trial is EQ-ing (for the results UI).
    this.currentTargetStemName = null;
  }

  getRankTitle() {
    const idx = Math.min(Math.max(0, this.currentLevel - 1), this.ranks.length - 1);
    return this.ranks[idx];
  }

  advanceStageOrLevel() {
    const lastResult = this.lastTrialResult;
    const lastPrecision = lastResult ? lastResult.scorePercentage : 0;
    this.lastBossOutcome = null;

    if (this.isBossStage) {
      if (lastPrecision >= 75) {
        // ¡Victoria contra el Boss!
        this.currentLevel += 1;
        this.stage = 1; // Reinicia el contador de ronda
        this.lastBossOutcome = {
          victory: true,
          newLevel: this.currentLevel,
          rankTitle: this.getRankTitle()
        };
      } else {
        // Derrota. El jugador debe repetir el Boss o bajar al Stage 4.
        this.stage = 4; // Penalización por fallar el Boss
        this.lastBossOutcome = {
          victory: false,
          message: "Has fallado la mezcla del cliente. Vuelve a afinar tu oído y reinténtalo."
        };
      }
    } else {
      if (this.stage < this.maxStages) {
        this.stage += 1; // Flujo normal
      }
    }

    this.startNewTrial();
    return this.lastBossOutcome;
  }

  /**
   * Sets current difficulty tier ('easy' | 'normal' | 'hard' | 'pro')
   */
  setDifficulty(mode) {
    if (mode === 'pro') mode = 'hard';
    this.difficulty = mode;
    this.startNewTrial();
  }

  /**
   * Fully resets session state.
   */
  resetSession() {
    this.lives = 3;
    this.streak = 0;
    this.scorePoints = 0;
    this.stage = 1;
    this.currentLevel = 1;
    this.totalTrials = 0;
    this.correctTrials = 0;
    this.totalScoreSum = 0;
    this.isGameOver = false;
    this.lastTrialResult = null;
    this.lastBossOutcome = null;
    this.lessonRotationIndex = 0;
    this.startNewTrial();
  }

  /**
   * Generates a new quiz trial based on active difficulty tier.
   */
  startNewTrial() {
    // Fallbacks if not connected
    const lives = this.gameLoopStore ? this.gameLoopStore.lives : 3;
    const stage = this.gameLoopStore ? this.gameLoopStore.currentStage : 1;
    const isCampaign = this.gameLoopStore ? this.gameLoopStore.activeGameMode === 'campaign' : false;

    if (lives <= 0) {
      return;
    }

    this.isBossStage = (stage > 0 && stage % 5 === 0);

    // Resolve the acoustic class ONCE per trial. In arcade/quick-play this rotates
    // through the full instrument repertoire (decoupled from the loaded source).
    this.currentAcousticClass = this.resolveAcousticClass(stage, isCampaign);

    if (isCampaign) {
      if (this.isBossStage) {
        this.generateBossTrial();
      } else {
        this.currentTarget = this.generateAcousticTarget('normal'); // campaign teaches one instrument per level
        this.targetFilters = [this.currentTarget];
      }
    } else {
      if (this.difficulty === 'easy') {
        this.generateEasyTrial();
      } else if (this.difficulty === 'normal') {
        this.generateNormalTrial();
      } else {
        this.generateHardTrial();
      }
    }
  }

  /**
   * Decides which instrument/acoustic class the next lesson targets.
   * Campaign: fixed per-level curriculum. Arcade/quick-play: rotates the full roster.
   * @param {number} [stage] Current stage (campaign curriculum step)
   * @param {boolean} [isCampaign] Whether campaign mode is active
   * @returns {string} Acoustic class key present in ACOUSTIC_EQ_SCENARIOS
   */
  resolveAcousticClass(stage, isCampaign) {
    if (typeof stage !== 'number') {
      stage = this.gameLoopStore ? this.gameLoopStore.currentStage : 1;
    }
    if (typeof isCampaign !== 'boolean') {
      isCampaign = this.gameLoopStore ? this.gameLoopStore.activeGameMode === 'campaign' : false;
    }

    // Noise / lab sources collapse to a single synthetic curriculum.
    if (this.isSyntheticMode) return 'synthetic';

    // A specific instrument loaded by the player (a multitrack session target
    // stem, or an isolated instrument source) is authoritative in BOTH modes, so
    // e.g. the orchestral Main Pair teaches an orchestral lesson instead of a
    // generic campaign curriculum instrument. "generic" and synthetic sources
    // are not specific enough to override the curriculum.
    const loaded = this.sourceAcousticClass;
    const hasSpecificLoaded = !!(loaded && loaded !== 'generic' && ACOUSTIC_EQ_SCENARIOS[loaded]);

    if (isCampaign) {
      // Campaign: follow the loaded instrument when there is one; only fall back
      // to the fixed per-level curriculum for abstract sources (noise/generic).
      if (hasSpecificLoaded) return loaded;
      const map = { 1: 'kick', 2: 'snare', 3: 'bass', 4: 'guitars', 5: 'master' };
      return map[stage] || 'kick';
    }

    // Arcade / quick-play: honor a specific loaded instrument, otherwise rotate
    // across the full repertoire so generic / pink-noise sources stay varied.
    // The loaded instrument is authoritative so the proposed EQ is idiomatic for
    // the instrument the player actually hears. Only fall back to the rotating
    // repertoire when the source carries no usable class.
    if (hasSpecificLoaded) {
      return loaded;
    }

    const roster = this.LESSON_ROSTER;
    const cls = roster[this.lessonRotationIndex % roster.length];
    this.lessonRotationIndex = (this.lessonRotationIndex + 1) % roster.length;
    return cls;
  }

  /**
   * Generates an Easy Mode trial with 4 options and streak-tuned distractors.
   */
  _generateRandomTarget(difficulty) {
    const minLog = Math.log2(90);
    const maxLog = Math.log2(13000);
    const targetFreq = Math.round(Math.pow(2, minLog + Math.random() * (maxLog - minLog)));

    if (difficulty === 'easy' || difficulty === 'normal') {
      const gains = [-12, -9, -6, -4, 4, 6, 9, 12];
      const targetGain = gains[Math.floor(Math.random() * gains.length)];
      // Gain-bearing shapes only (keeps multiple-choice options distinct & audible)
      const shapes = ['peaking', 'lowshelf', 'highshelf'];
      const type = shapes[Math.floor(Math.random() * shapes.length)];
      const qFactor = (type === 'peaking') ? 2.0 : 1.0;
      return { frequencyHz: targetFreq, gainDb: targetGain, qFactor, type, name: 'Freeform' };
    } else {
      let gain = Math.round((Math.random() * 20 - 10) * 10) / 10;
      const qFactor = Math.round((0.5 + Math.random() * 7.5) * 10) / 10;
      const types = ['peaking', 'lowpass', 'highpass', 'notch', 'lowshelf', 'highshelf'];
      const type = types[Math.floor(Math.random() * types.length)];
      if (type === 'notch' || type === 'highpass' || type === 'lowpass') gain = 0;
      else if (gain === 0) gain = 6.0;
      return { frequencyHz: targetFreq, gainDb: gain, qFactor: qFactor, type: type, name: 'Freeform' };
    }
  }

  /**
   * Returns the audible gain magnitude window (in dB) for a difficulty tier.
   * Audibility-first: Easy is generous, Pro stays subtle but still audible.
   * @param {string} difficulty
   * @returns {{min: number, max: number}}
   */
  _audibilityBounds(difficulty) {
    // Audibility-first, but wide enough for "exaggerated yet motivated" targets.
    if (difficulty === 'easy') return { min: 6.0, max: 12.0 };
    if (difficulty === 'hard') return { min: 3.0, max: 9.0 };
    return { min: 5.0, max: 12.0 }; // normal
  }

  /**
   * Weighted random scenario pick. Down-weights sub-bass (<100 Hz) and
   * ultra-high (>12 kHz) scenarios, and structural filters, so they appear as
   * rare spice rather than dominating the trials.
   * @param {Array<object>} pool
   * @returns {object}
   */
  _pickWeightedScenario(pool) {
    const weightOf = (s) => {
      let w = 1.0;
      if (s.frequencyHz < 100) w *= 0.35;
      else if (s.frequencyHz > 12000) w *= 0.5;
      if (s.type === 'highpass' || s.type === 'lowpass' || s.type === 'notch') w *= 0.8;
      return w;
    };
    const total = pool.reduce((sum, s) => sum + weightOf(s), 0);
    let r = Math.random() * total;
    for (const s of pool) {
      r -= weightOf(s);
      if (r <= 0) return s;
    }
    return pool[pool.length - 1];
  }

  /**
   * Builds one EQ target from the acoustic scenario bank.
   * Audibility-first: guarantees a perceptible gain magnitude (up to ±12 dB)
   * and compensates shelves / broad bells, which need more dB to be heard.
   * @param {'easy'|'normal'|'hard'|'pro'} difficulty
   */
  generateAcousticTarget(difficulty) {
    const diff = (difficulty === 'hard' || difficulty === 'pro') ? 'hard' : (difficulty === 'easy' ? 'easy' : 'normal');
    let acousticClass = this.currentAcousticClass || 'generic';
    if (this.isSyntheticMode) acousticClass = 'synthetic';

    const scenarios = ACOUSTIC_EQ_SCENARIOS[acousticClass];

    // Fallback to random if no scenarios found for this class
    if (!scenarios || scenarios.length === 0) {
      return this._generateRandomTarget(diff);
    }

    const isStructural = (t) => (t === 'highpass' || t === 'lowpass' || t === 'notch');

    // Easy / Normal use gain-bearing shapes only: keeps options distinct and audible.
    let pool = scenarios;
    if (diff !== 'hard') {
      const filtered = scenarios.filter(s => !isStructural(s.type) && s.gainDb !== 0);
      if (filtered.length > 0) pool = filtered;
    }

    const baseScenario = this._pickWeightedScenario(pool);

    // Frequency jitter (±10%) and clamp to the musical training band so targets
    // land where they are actually audible. Rare extremes are penalized by the
    // weighted pick above rather than hard-excluded.
    const freqJitter = 1.0 + (Math.random() * 0.2 - 0.1);
    let finalFreq = Math.round(baseScenario.frequencyHz * freqJitter);
    finalFreq = Math.max(TARGET_FREQ_MIN_HZ, Math.min(TARGET_FREQ_MAX_HZ, finalFreq));

    // Gain: audibility-first with perceptual weighting
    let finalGain = 0;
    if (!isStructural(baseScenario.type) && baseScenario.gainDb !== 0) {
      const bounds = this._audibilityBounds(diff);
      const sign = baseScenario.gainDb > 0 ? 1 : -1;

      let weight = 1.0;
      if (baseScenario.type === 'lowshelf' || baseScenario.type === 'highshelf') weight *= 1.35;
      if (baseScenario.type === 'peaking' && baseScenario.qFactor < 1.0) weight *= 1.2;

      // Multitrack mixes mask a single stem, so the filter needs more dB to be
      // clearly perceptible against the rest of the ensemble. Raise the ceiling
      // AND add a fixed dB offset: a multiplier alone is neutralised by the
      // audibility floor (bounds.min), which is why subtle scenarios stayed
      // inaudible. The offset lifts even those above the masking bed, while the
      // sign (boost/cut) is preserved.
      const maxDb = this.isMultitrackSession ? Math.max(bounds.max, 14.0) : bounds.max;
      const multitrackOffsetDb = this.isMultitrackSession ? 2.5 : 0.0;
      if (this.isMultitrackSession) weight *= 1.25;

      const magnitude = Math.abs(baseScenario.gainDb) * weight * (0.9 + Math.random() * 0.3) + multitrackOffsetDb;
      const clamped = Math.max(bounds.min, Math.min(maxDb, magnitude));
      finalGain = Math.round(sign * clamped * 10) / 10;
    }

    // Q: keep Easy consistent, add texture in Normal/Hard
    let finalQ = baseScenario.qFactor;
    if (diff !== 'easy') {
      const qJitter = 1.0 + (Math.random() * 0.4 - 0.2);
      finalQ = Math.round(baseScenario.qFactor * qJitter * 10) / 10;
      finalQ = Math.max(0.5, Math.min(10.0, finalQ));
    }

    return {
      frequencyHz: finalFreq,
      gainDb: finalGain,
      qFactor: finalQ,
      type: baseScenario.type,
      name: baseScenario.name,
      acousticClass
    };
  }

  generateEasyTrial() {
    this.currentTarget = this.generateAcousticTarget('easy');
    this.targetFilters = [this.currentTarget];

    const distractors = this.generateDistractors(this.currentTarget, this.streak);
    const allTargets = [this.currentTarget, ...distractors];
    this.shuffleArray(allTargets);

    this.correctEasyOptionIndex = allTargets.findIndex(
      t => t.frequencyHz === this.currentTarget.frequencyHz && t.gainDb === this.currentTarget.gainDb
    );

    this.easyOptions = allTargets.map((target, idx) => ({
      index: idx,
      target: target,
      title: `${target.frequencyHz >= 1000 ? (target.frequencyHz / 1000).toFixed(1) + ' kHz' : target.frequencyHz + ' Hz'} (${target.gainDb > 0 ? '+' : ''}${target.gainDb} dB)`,
      description: `Tipo: ${target.type}, Q: ${target.qFactor.toFixed(1)}`
    }));
  }

  /**
   * Generates a Normal Mode trial (Manual Frequency & Gain dial-in).
   */
  generateNormalTrial() {
    if (this.isBossStage) {
      this.generateBossTrial();
    } else {
      this.currentTarget = this.generateAcousticTarget('normal');
      this.targetFilters = [this.currentTarget];
    }
  }

  /**
   * Generates a Hard Mode trial (Manual Freq, Gain, Q factor, Filter Type dial-in).
   */
  generateHardTrial() {
    if (this.isBossStage) {
      this.generateBossTrial();
    } else {
      this.currentTarget = this.generateAcousticTarget('hard');
      this.targetFilters = [this.currentTarget];
    }
  }

  generateBossTrial() {
    // Each boss is a multi-band "client mix" challenge. Gains are deliberately
    // audible (≥3.5 dB) so the fight is motivating rather than a guessing game.
    const BOSS_SCENARIOS = [
      // Boss: "Limpieza y Presencia (Voz / Acústica)"
      [
        { name: 'Plosive Control', type: 'highpass', frequencyHz: 80, gainDb: 0, qFactor: 0.7 },
        { name: 'Vocal Presence', type: 'peaking', frequencyHz: 2000, gainDb: 4.0, qFactor: 1.5 }
      ],
      // Boss: "Control de Bajo Eléctrico"
      [
        { name: 'Sub Glue', type: 'lowshelf', frequencyHz: 100, gainDb: 5.0, qFactor: 1.0 },
        { name: 'Pick Definition', type: 'peaking', frequencyHz: 800, gainDb: 4.0, qFactor: 2.0 }
      ],
      // Boss: "Bombo (Kick Drum) Moderno"
      [
        { name: 'Sub Weight', type: 'peaking', frequencyHz: 60, gainDb: 6.0, qFactor: 2.0 },
        { name: 'Boxiness Cut', type: 'peaking', frequencyHz: 400, gainDb: -7.0, qFactor: 2.5 }
      ],
      // Boss: "Brillo de Overheads / Platos"
      [
        { name: 'Low Cut', type: 'highpass', frequencyHz: 400, gainDb: 0, qFactor: 0.7 },
        { name: 'Cymbal Air', type: 'highshelf', frequencyHz: 8000, gainDb: 5.0, qFactor: 1.0 }
      ],
      // Boss: "Caja (Snare) con Cuerpo y Ataque"
      [
        { name: 'Snare Body', type: 'peaking', frequencyHz: 200, gainDb: 4.5, qFactor: 1.4 },
        { name: 'Presence Crack', type: 'peaking', frequencyHz: 5000, gainDb: 4.0, qFactor: 1.5 }
      ],
      // Boss: "Guitarra Eléctrica con Mordida"
      [
        { name: 'Rumble Cut', type: 'highpass', frequencyHz: 100, gainDb: 0, qFactor: 0.7 },
        { name: 'Mud Cut', type: 'peaking', frequencyHz: 250, gainDb: -5.0, qFactor: 1.5 },
        { name: 'Amp Bite', type: 'peaking', frequencyHz: 3500, gainDb: 4.0, qFactor: 1.5 }
      ],
      // Boss: "Sección de Cuerdas (Strings)"
      [
        { name: 'Warmth', type: 'lowshelf', frequencyHz: 200, gainDb: 4.0, qFactor: 1.0 },
        { name: 'Harshness Cut', type: 'peaking', frequencyHz: 3000, gainDb: -4.5, qFactor: 2.0 }
      ],
      // Boss: "Máster de Mezcla (Bus Final)"
      [
        { name: 'Glue Low', type: 'lowshelf', frequencyHz: 100, gainDb: 3.5, qFactor: 1.0 },
        { name: 'Air Lift', type: 'highshelf', frequencyHz: 12000, gainDb: 4.5, qFactor: 1.0 }
      ]
    ];

    const randomBoss = BOSS_SCENARIOS[Math.floor(Math.random() * BOSS_SCENARIOS.length)];
    this.targetFilters = randomBoss.map(b => ({ ...b }));
    this.currentTarget = this.targetFilters[0];
  }

  /**
   * Generates 3 distractors based on streak.
   */
  generateDistractors(target, streak) {
    const distractors = [];

    if (streak < 2) {
      const octaveUp = Math.min(18000, Math.round(target.frequencyHz * 2));
      const octaveDown = Math.max(31, Math.round(target.frequencyHz / 2));
      const invertedGain = -target.gainDb;

      distractors.push({ ...target, frequencyHz: octaveUp });
      distractors.push({ ...target, frequencyHz: octaveDown });
      distractors.push({ ...target, gainDb: invertedGain });
    } else {
      const thirdOctaveUp = Math.min(18000, Math.round(target.frequencyHz * Math.pow(2, 1 / 3)));
      const thirdOctaveDown = Math.max(31, Math.round(target.frequencyHz * Math.pow(2, -1 / 3)));
      const tweakGain = target.gainDb > 0 ? target.gainDb - 3 : target.gainDb + 3;

      distractors.push({ ...target, frequencyHz: thirdOctaveUp });
      distractors.push({ ...target, frequencyHz: thirdOctaveDown });
      distractors.push({ ...target, gainDb: tweakGain });
    }

    return distractors;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /**
   * Evaluates Easy Mode option choice.
   */
  evaluateEasyGuess(chosenIndex) {
    const isCorrect = chosenIndex === this.correctEasyOptionIndex;
    const chosenOption = this.easyOptions[chosenIndex];
    const userTarget = chosenOption ? chosenOption.target : this.currentTarget;

    const evalResult = ScoringEngine.evaluate(this.currentTarget, userTarget);
    const score = isCorrect ? 100 : evalResult.accuracyPercentage;
    const pointsAwarded = isCorrect ? 1000 : evalResult.totalScore;

    return {
      isCorrect,
      userFreqHz: userTarget.frequencyHz,
      userGainDb: userTarget.gainDb,
      userQ: userTarget.qFactor,
      userType: userTarget.type,
      scorePercentage: score,
      pointsAwarded,
      ratingLabel: isCorrect ? '🎉 ¡Opción Correcta! (+1,000 PTS)' : evalResult.ratingLabel,
      octaveDistance: evalResult.octaveDistance,
      gainErrorDb: evalResult.gainDifference,
      feedbackMessage: isCorrect
        ? `¡Impecable! Has identificado correctamente ${this.currentTarget.frequencyHz} Hz (${this.currentTarget.gainDb > 0 ? '+' : ''}${this.currentTarget.gainDb} dB).`
        : evalResult.feedbackMessage
    };
  }

  /**
   * Calculates score breakdown using ScoringEngine.
   * @param {Array} userGuessesArray 
   * @returns {{
   *   totalScore: number,
   *   totalPrecision: number,
   *   band1Precision: number,
   *   band2Precision: number,
   *   band1Octave: number,
   *   band2Octave: number,
   *   bandResults: Array
   * }}
   */
  calculateScore(userGuessesArray) {
    return ScoringEngine.calculateScore(this.targetFilters, userGuessesArray, this.difficulty);
  }

  /**
   * Evaluates Normal / Hard Mode manual dial-in guess via ScoringEngine.
   * In Hard Mode: Awards +100 BONUS POINTS for guessing the exact filter type!
   */
  evaluateManualGuess(userGuessesArray) {
    if (!this.targetFilters || this.targetFilters.length === 0) return null;

    const scoreData = this.calculateScore(userGuessesArray);
    const { totalScore, totalPrecision, band1Precision, band2Precision, band1Octave, band2Octave, bandResults } = scoreData;

    const isCorrect = totalPrecision >= 80;
    let combinedIsPolarityFlipped = bandResults.some(br => br.evalResult.isPolarityFlipped);

    const primaryTarget = this.targetFilters[0];
    const primaryGuess = userGuessesArray[0];
    const primaryResult = bandResults[0];

    const resultObj = {
      isCorrect: isCorrect,
      isPolarityFlipped: combinedIsPolarityFlipped,
      userFreqHz: primaryGuess.frequencyHz,
      userGainDb: primaryGuess.gainDb,
      userQ: primaryGuess.qFactor,
      userType: primaryGuess.type,
      isTypeCorrect: primaryResult ? primaryResult.isTypeCorrect : false,
      scorePercentage: totalPrecision,
      totalScore: totalScore,
      totalPrecision: totalPrecision,
      pointsAwarded: totalScore,
      ratingLabel: (primaryResult && primaryResult.isTypeCorrect) ? `${primaryResult.evalResult.ratingLabel} (+100 PTS Tipo Filtro)` : (primaryResult ? primaryResult.evalResult.ratingLabel : ''),
      octaveDistance: primaryResult ? primaryResult.evalResult.octaveDistance : 0,
      gainErrorDb: primaryResult ? primaryResult.evalResult.gainDifference : 0,
      feedbackMessage: isCorrect
        ? `¡Impecable! Rendimiento promedio: ${totalPrecision}%`
        : (primaryResult ? primaryResult.evalResult.feedbackMessage : ''),
      bandResults: bandResults,
      isBossStage: this.isBossStage,
      band1Precision,
      band2Precision,
      band1Octave,
      band2Octave
    };

    this.lastTrialResult = resultObj;
    return resultObj;
  }
}
