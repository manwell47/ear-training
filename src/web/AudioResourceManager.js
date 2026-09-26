/**
 * @file AudioResourceManager.js
 * @description Production-grade Audio Resource Manager implementing Lazy Loading,
 * bounded LRU AudioBuffer memory pool (max 2 buffers), manual Garbage Collection (channel data zeroing),
 * and event-driven load status reporting for real UI Spinners.
 */

/**
 * Single source of truth for the on-disk audio folder.
 * All module code must build OGG URLs from this constant instead of
 * hardcoding the path, so relocating assets becomes a one-line change.
 */
export const AUDIO_BASE_PATH = 'Music Ear Training/Oggs';

export const MULTITRACK_SESSIONS = [
  {
    id: 'beat1_session',
    displayName: 'Beat 1 (Sesión Multitrack)',
    category: 'Multitrack Sessions',
    targetStem: 'beat1_kick',
    stems: [
      { id: 'beat1_kick', displayName: 'Bombo', filename: 'Sin título1 - 0002 - Instrumento - beat 1 - KICK.ogg', acousticClass: 'kick' },
      { id: 'beat1_snare', displayName: 'Caja', filename: 'Sin título1 - 0004 - Instrumento - beat 1 - SNARE.ogg', acousticClass: 'snare' },
      { id: 'beat1_hh', displayName: 'Hi-Hat', filename: 'Sin título1 - 0003 - Instrumento - beat 1 - HI HAT.ogg', acousticClass: 'cymbals' }
    ]
  },
  {
    id: 'beat2_session',
    displayName: 'Beat 2 (Sesión Multitrack)',
    category: 'Multitrack Sessions',
    targetStem: 'beat2_kick',
    stems: [
      { id: 'beat2_kick', displayName: 'Bombo', filename: 'Sin título1 - 0006 - Instrumento - beat 2 - KICK.ogg', acousticClass: 'kick' },
      { id: 'beat2_snare', displayName: 'Caja', filename: 'Sin título1 - 0009 - Instrumento - beat 2 - SNARE.ogg', acousticClass: 'snare' },
      { id: 'beat2_hh', displayName: 'Hi-Hat', filename: 'Sin título1 - 0008 - Instrumento - beat 2 - HH.ogg', acousticClass: 'cymbals' },
      { id: 'beat2_crash', displayName: 'Crash', filename: 'Sin título1 - 0007 - Instrumento - beat 2 - CRASH.ogg', acousticClass: 'cymbals' },
      { id: 'beat2_ride', displayName: 'Ride', filename: 'Sin título1 - 0010 - Instrumento - beat 2 - RIDE 2.ogg', acousticClass: 'cymbals' }
    ]
  },
  {
    id: 'orch_session',
    displayName: 'Orquesta Sinfónica Clásica',
    category: 'Multitrack Sessions',
    targetStem: 'orch_main',
    stems: [
      { id: 'orch_main', displayName: 'Main Pair', filename: '01_MainPair.ogg', acousticClass: 'orchestra' },
      { id: 'orch_out', displayName: 'Outrigger Pair', filename: '02_OutriggerPair.ogg', acousticClass: 'orchestra' },
      { id: 'orch_hall', displayName: 'Hall Pair', filename: '03_HallPair.ogg', acousticClass: 'orchestra' },
      { id: 'orch_pno', displayName: 'Spot Piano', filename: '04_SpotPair_Piano.ogg', acousticClass: 'piano' },
      { id: 'orch_ww', displayName: 'Spot Woodwind', filename: '05_SpotPair_Woodwind.ogg', acousticClass: 'woodwinds' },
      { id: 'orch_vln1', displayName: 'Spot Violin 1', filename: '06_Spot_Violin1.ogg', acousticClass: 'strings' },
      { id: 'orch_vln2', displayName: 'Spot Violin 2', filename: '07_Spot_Violin2.ogg', acousticClass: 'strings' },
      { id: 'orch_vla', displayName: 'Spot Viola', filename: '08_Spot_Viola.ogg', acousticClass: 'strings' },
      { id: 'orch_vlc', displayName: 'Spot Cello', filename: '09_Spot_Cello.ogg', acousticClass: 'strings' },
      { id: 'orch_cb', displayName: 'Spot Bass', filename: '10_Spot_Bass.ogg', acousticClass: 'strings' }
    ]
  },
  {
    id: 'rb_session',
    displayName: 'Banda R&B (Multitrack)',
    category: 'Multitrack Sessions',
    targetStem: 'rb_kick_in',
    stems: [
      { id: 'rb_kick_in', displayName: 'Kick In', filename: 'Drums-Kick In-M82.ogg', acousticClass: 'kick' },
      { id: 'rb_kick_out', displayName: 'Kick Out', filename: 'Drums-Kick Out-Proto 647.ogg', acousticClass: 'kick' },
      { id: 'rb_snare_top', displayName: 'Snare Top', filename: 'Drums-Snare Top-M80.ogg', acousticClass: 'snare' },
      { id: 'rb_snare_bot', displayName: 'Snare Bottom', filename: 'Drums-Snare Bottom-M81.ogg', acousticClass: 'snare' },
      { id: 'rb_rack', displayName: 'Rack Tom', filename: 'Drums-Rack-M81.ogg', acousticClass: 'toms' },
      { id: 'rb_floor', displayName: 'Floor Tom', filename: 'Drums-Floor-M81.ogg', acousticClass: 'toms' },
      { id: 'rb_oh', displayName: 'Overheads', filename: 'Drums-Overhead-Ela M 260.ogg', acousticClass: 'cymbals' },
      { id: 'rb_room', displayName: 'Drum Room', filename: 'Drums-Room-M60.ogg', acousticClass: 'room' },
      { id: 'rb_gtr_cu29', displayName: 'Guitar Amp (CU29)', filename: 'Ele Guitar-Amp-CU29.ogg', acousticClass: 'guitars' },
      { id: 'rb_gtr_m80', displayName: 'Guitar Amp (M80)', filename: 'Ele Guitar-Amp-M80.ogg', acousticClass: 'guitars' },
      { id: 'rb_keys_org', displayName: 'Keys Organ (DI)', filename: 'Keys-Organ-Active DI.ogg', acousticClass: 'organ' },
      { id: 'rb_keys_wurli', displayName: 'Keys Wurli (DI)', filename: 'Keys-Wurli-Active DI.ogg', acousticClass: 'epiano' },
      { id: 'rb_vox_lead', displayName: 'Vocals Lead (U47)', filename: 'Vocals-Lead-U47.ogg', acousticClass: 'vocals' },
      { id: 'rb_vox_bv1', displayName: 'Vocals BV 1 (M81)', filename: 'Vocals-BV1-M81.ogg', acousticClass: 'vocals' },
      { id: 'rb_vox_bv2', displayName: 'Vocals BV 2 (M81)', filename: 'Vocals-BV2-M81.ogg', acousticClass: 'vocals' },
      { id: 'rb_chamber', displayName: 'Chamber Room', filename: 'Chamber-M60.ogg', acousticClass: 'room' }
    ]
  },
  {
    id: 'rock_band_session',
    displayName: 'Rock Band',
    category: 'Multitrack Sessions',
    targetStem: 'rb_kick',
    stems: [
      { id: 'rb_kick', displayName: 'Kick', filename: 'KICK_M82.ogg', acousticClass: 'kick' },
      { id: 'rb_sn_top', displayName: 'Snare Top', filename: 'SNARE TOP_M80-SH.ogg', acousticClass: 'snare' },
      { id: 'rb_sn_bot', displayName: 'Snare Bottom', filename: 'SNARE BOTTOM_M81.ogg', acousticClass: 'snare' },
      { id: 'rb_hh', displayName: 'Hi-Hat', filename: 'HI HAT_M60 FET.ogg', acousticClass: 'cymbals' },
      { id: 'rb_tom1', displayName: 'Tom 1', filename: 'TOM 1_M81-SH.ogg', acousticClass: 'toms' },
      { id: 'rb_tom2', displayName: 'Tom 2', filename: 'TOM 2_M81-SH.ogg', acousticClass: 'toms' },
      { id: 'rb_tom3', displayName: 'Tom 3', filename: 'TOM 3_M81-SH.ogg', acousticClass: 'toms' },
      { id: 'rb_oh_l', displayName: 'Overheads L', filename: 'OVERHEADS_M60 FET.L.ogg', acousticClass: 'cymbals' },
      { id: 'rb_oh_r', displayName: 'Overheads R', filename: 'OVERHEADS_M60 FET.R.ogg', acousticClass: 'cymbals' },
      { id: 'rb_room', displayName: 'Room', filename: 'ROOM_AR-51 (CARDIOID).ogg', acousticClass: 'room' },
      { id: 'rb_bass_di', displayName: 'Bass DI', filename: 'BASS_DI.ogg', acousticClass: 'bass' },
      { id: 'rb_gtr1', displayName: 'Guitar 1', filename: 'ELECTRIC GUITAR 1_M81-SH.ogg', acousticClass: 'guitars' },
      { id: 'rb_gtr2', displayName: 'Guitar 2', filename: 'ELECTRIC GUITAR 2_M81-SH.ogg', acousticClass: 'guitars' },
      { id: 'rb_org_topl', displayName: 'Organ Top L', filename: 'ORGAN LESLIE TOP_M80-SH.L.ogg', acousticClass: 'organ' },
      { id: 'rb_org_topr', displayName: 'Organ Top R', filename: 'ORGAN LESLIE TOP_M80-SH.R.ogg', acousticClass: 'organ' },
      { id: 'rb_org_bot', displayName: 'Organ Bottom', filename: 'ORGAN LESLIE BOTTOM_M82.ogg', acousticClass: 'organ' },
      { id: 'rb_keys_l', displayName: 'Keys DI L', filename: 'KEYS_DI.L.ogg', acousticClass: 'keys' },
      { id: 'rb_keys_r', displayName: 'Keys DI R', filename: 'KEYS_DI.R.ogg', acousticClass: 'keys' },
      { id: 'vox_bass_m80', displayName: 'Vox Bass', filename: 'VOX BASS_M80.ogg', acousticClass: 'vocals' },
      { id: 'vox_drums_m80', displayName: 'Vox Drums', filename: 'VOX DRUMS_M80.ogg', acousticClass: 'vocals' },
      { id: 'vox_gtr2_m80', displayName: 'Vox Guitar 2', filename: 'VOX GUITAR 2_M80.ogg', acousticClass: 'vocals' },
      { id: 'vox_keys_m80', displayName: 'Vox Keys', filename: 'VOX KEYS_M80.ogg', acousticClass: 'vocals' },
      { id: 'vox_lead_m80', displayName: 'Vox Lead', filename: 'VOX LEAD_M80.ogg', acousticClass: 'vocals' }
    ]
  }
];

export const AUDIO_SOURCES = [
  // --- RUIDOS SINTÉTICOS (Generadores) ---
  { id: 'pink_noise', displayName: 'Ruido Rosa (Sintetizado)', filename: null, category: 'Generadores', isSynthetic: true, acousticClass: 'generic' },
  { id: 'white_noise', displayName: 'Ruido Blanco (Sintetizado)', filename: null, category: 'Generadores', isSynthetic: true, acousticClass: 'generic' },

  // --- NIVEL 1: LABORATORIO (Tímbrica aislada) ---
  { id: 'v_kick', displayName: 'Bombo Estudio (Seco)', filename: 'Sin título1 - 0002 - Instrumento - beat 1 - KICK.ogg', category: 'Nivel 1: Aislamiento', isSynthetic: false, acousticClass: 'kick' },
  { id: 'v_snare', displayName: 'Caja Virtual (Seca)', filename: 'Sin título1 - 0004 - Instrumento - beat 1 - SNARE.ogg', category: 'Nivel 1: Aislamiento', isSynthetic: false, acousticClass: 'snare' },
  { id: 'v_hh1', displayName: 'Hi-Hat (Beat 1)', filename: 'Sin título1 - 0003 - Instrumento - beat 1 - HI HAT.ogg', category: 'Nivel 1: Aislamiento', isSynthetic: false, acousticClass: 'cymbals' },
  { id: 'v_kick2', displayName: 'Bombo 2 (Beat 2)', filename: 'Sin título1 - 0006 - Instrumento - beat 2 - KICK.ogg', category: 'Nivel 1: Aislamiento', isSynthetic: false, acousticClass: 'kick' },
  { id: 'v_snare2', displayName: 'Caja 2 (Beat 2)', filename: 'Sin título1 - 0009 - Instrumento - beat 2 - SNARE.ogg', category: 'Nivel 1: Aislamiento', isSynthetic: false, acousticClass: 'snare' },
  { id: 'v_hh2', displayName: 'Hi-Hat 2 (Beat 2)', filename: 'Sin título1 - 0008 - Instrumento - beat 2 - HH.ogg', category: 'Nivel 1: Aislamiento', isSynthetic: false, acousticClass: 'cymbals' },
  { id: 'v_crash', displayName: 'Crash (Beat 2)', filename: 'Sin título1 - 0007 - Instrumento - beat 2 - CRASH.ogg', category: 'Nivel 1: Aislamiento', isSynthetic: false, acousticClass: 'cymbals' },
  { id: 'v_ride', displayName: 'Ride (Beat 2)', filename: 'Sin título1 - 0010 - Instrumento - beat 2 - RIDE 2.ogg', category: 'Nivel 1: Aislamiento', isSynthetic: false, acousticClass: 'cymbals' },
  { id: 'di_bass', displayName: 'Bajo Eléctrico (DI)', filename: 'BASS_DI.ogg', category: 'Nivel 1: Aislamiento', isSynthetic: false, acousticClass: 'bass' },
  { id: 'di_keys', displayName: 'Teclado Wurlitzer (DI)', filename: 'Keys-Wurli-Active DI.ogg', category: 'Nivel 1: Aislamiento', isSynthetic: false, acousticClass: 'epiano' },

  // --- NIVEL 2: MUNDO REAL (Micrófonos cercanos) ---
  { id: 'a_kick_in', displayName: 'Bombo Acústico (Maza/In)', filename: 'Drums-Kick In-M82.ogg', category: 'Nivel 2: Micrófonos Cercanos', isSynthetic: false, acousticClass: 'kick' },
  { id: 'a_snare_top', displayName: 'Caja Acústica (Parche/Top)', filename: 'SNARE TOP_M80-SH.ogg', category: 'Nivel 2: Micrófonos Cercanos', isSynthetic: false, acousticClass: 'snare' },
  { id: 'a_tom', displayName: 'Tom (Ataque y Cuerpo)', filename: 'TOM 1_M81-SH.ogg', category: 'Nivel 2: Micrófonos Cercanos', isSynthetic: false, acousticClass: 'toms' },
  { id: 'amp_gtr', displayName: 'Guitarra Eléctrica (Amp)', filename: 'Ele Guitar-Amp-CU29.ogg', category: 'Nivel 2: Micrófonos Cercanos', isSynthetic: false, acousticClass: 'guitars' },
  { id: 'amp_organ', displayName: 'Órgano Leslie (Agudos)', filename: 'ORGAN LESLIE TOP_M80-SH.L.ogg', category: 'Nivel 2: Micrófonos Cercanos', isSynthetic: false, acousticClass: 'organ' },

  // --- NIVEL 3: ACÚSTICA Y SALA (Fase y rebotes) ---
  { id: 'room_oh', displayName: 'Overheads (Platos y Sangrado)', filename: 'OVERHEADS_M60 FET.L.ogg', category: 'Nivel 3: Acústica y Sala', isSynthetic: false, acousticClass: 'cymbals' },
  { id: 'room_mic', displayName: 'Room Mic (Control de Reverb)', filename: 'ROOM_AR-51 (CARDIOID).ogg', category: 'Nivel 3: Acústica y Sala', isSynthetic: false, acousticClass: 'room' },
  { id: 'orch_main', displayName: 'Orquesta Clásica (Par Principal)', filename: '01_MainPair.ogg', category: 'Nivel 3: Acústica y Sala', isSynthetic: false, acousticClass: 'orchestra' },
  { id: 'orch_spot', displayName: 'Sección Cuerdas (Spot Violín)', filename: '06_Spot_Violin1.ogg', category: 'Nivel 3: Acústica y Sala', isSynthetic: false, acousticClass: 'strings' },

  // --- NIVEL 4: BOSS FIGHTS Y MEZCLA ---
  { id: 'vox_valve', displayName: 'Voz Principal (Mic: Válvulas)', filename: 'Vocals-Lead-U47.ogg', category: 'Nivel 4: Mezcla y Voces', isSynthetic: false, acousticClass: 'vocals' },
  { id: 'vox_dyn', displayName: 'Voz Principal (Mic: Dinámico)', filename: 'VOX LEAD_M80.ogg', category: 'Nivel 4: Mezcla y Voces', isSynthetic: false, acousticClass: 'vocals' },
  { id: 'mix_ref', displayName: 'Mezcla Completa (Referencia)', filename: 'HEY DELILAH- reference mix.ogg', category: 'Nivel 4: Mezcla y Voces', isSynthetic: false, acousticClass: 'drumbus' },
  { id: 'mix_beat1', displayName: 'Beat 1 (Stereo Mix)', filename: 'Sin título1 - 0001 - Instrumento - beat 1.ogg', category: 'Nivel 4: Mezcla y Voces', isSynthetic: false, acousticClass: 'drumbus' },
  { id: 'mix_beat2', displayName: 'Beat 2 (Stereo Mix)', filename: 'Sin título1 - 0005 - Instrumento - beat 2 - 120 BPM.ogg', category: 'Nivel 4: Mezcla y Voces', isSynthetic: false, acousticClass: 'drumbus' },
  { id: 'mix_beat3', displayName: 'Beat 3 (Stereo Mix, 190 BPM)', filename: 'beat 3 - 190 BPM - 0011 - Instrumento - Superior Drummer 3 01.ogg', category: 'Nivel 4: Mezcla y Voces', isSynthetic: false, acousticClass: 'drumbus' },

  // --- SESIONES MULTITRACK ---
  // Deliberately NOT duplicated here. They are appended below from MULTITRACK_SESSIONS
  // so stems and targets live in exactly one place (single source of truth).
];

/**
 * Picks a random target stem for a multitrack session.
 * Avoids `excludeId` when possible so a "swap" always changes the target.
 * @param {Object} session Entry from MULTITRACK_SESSIONS
 * @param {string|null} [excludeId] Stem id to avoid (usually the current target)
 * @returns {Object|null} A stem object, or null if the session has no stems
 */
export function pickRandomTargetStem(session, excludeId = null) {
  if (!session || !Array.isArray(session.stems) || session.stems.length === 0) return null;
  const candidates = session.stems.filter(s => s.id !== excludeId);
  const pool = candidates.length > 0 ? candidates : session.stems;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Surface every multitrack session in the flat source catalog without copying
// stem definitions. displayName / acousticClass are derived from the session.
MULTITRACK_SESSIONS.forEach(session => {
  const targetStem = session.stems.find(st => st.id === session.targetStem) || session.stems[0] || null;
  AUDIO_SOURCES.push({
    id: session.id,
    displayName: session.displayName,
    filename: null,
    category: 'Sesiones Multitrack',
    isSynthetic: false,
    isMultitrack: true,
    acousticClass: (targetStem && targetStem.acousticClass) || session.defaultAcousticClass || 'generic'
  });
});

export class AudioResourceManager {
  /**
   * @param {() => AudioContext} getAudioContextFn Function returning active AudioContext
   * @param {number} [maxCacheSize=10] Max AudioBuffer instances in RAM simultaneously
   */
  constructor(getAudioContextFn, maxCacheSize = 10) {
    this.getAudioContext = getAudioContextFn;
    this.maxCacheSize = maxCacheSize;

    /** @type {Map<string, AudioBuffer>} */
    this.cache = new Map();

    /** @type {Array<string>} LRU tracker */
    this.keyOrder = [];

    /** @type {Map<string, (ctx: AudioContext) => AudioBuffer>} */
    this.proceduralGenerators = new Map();

    this.listeners = {
      onLoadStart: [],
      onLoadComplete: [],
      onLoadError: []
    };
  }

  /**
   * Subscribe to loading events.
   * @param {'onLoadStart'|'onLoadComplete'|'onLoadError'} event 
   * @param {Function} cb 
   */
  on(event, cb) {
    if (this.listeners[event]) {
      this.listeners[event].push(cb);
    }
  }

  /**
   * Unsubscribe from loading events.
   */
  off(event, cb) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(fn => fn !== cb);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(fn => {
        try { fn(data); } catch (e) { console.error(`Error in event ${event} listener:`, e); }
      });
    }
  }

  /**
   * Register a procedural buffer generator (e.g. Pink Noise, White Noise).
   */
  registerProceduralGenerator(id, generatorFn) {
    this.proceduralGenerators.set(id, generatorFn);
  }

  /**
   * Explicitly destroys an AudioBuffer from RAM to hint JS Garbage Collection.
   * Zeroes out channel Float32Arrays before unsetting references.
   * @param {string} key 
   */
  destroyBuffer(key) {
    if (!this.cache.has(key)) return;
    const buffer = this.cache.get(key);
    if (buffer) {
      try {
        const numChannels = buffer.numberOfChannels;
        for (let channel = 0; channel < numChannels; channel++) {
          const data = buffer.getChannelData(channel);
          if (data && data.fill) {
            data.fill(0); // Zero-fill memory array
          }
        }
      } catch (_) {
        // Handle read-only or detached array edge cases
      }
    }
    this.cache.delete(key);
    this.keyOrder = this.keyOrder.filter(k => k !== key);
  }

  /**
   * Enforces strict memory bound (max 2 AudioBuffers in memory simultaneously).
   */
  evictExcessBuffers() {
    while (this.keyOrder.length > this.maxCacheSize) {
      const oldestKey = this.keyOrder.shift();
      if (oldestKey) {
        this.destroyBuffer(oldestKey);
      }
    }
  }

  /**
   * Lazy loads audio buffer on demand.
   * @param {string} trackId 
   * @param {string|null} [url=null] 
   * @returns {Promise<AudioBuffer>}
   */
  async loadAudio(trackId, url = null) {
    // 1. Cache hit check (Move to end of LRU)
    if (this.cache.has(trackId)) {
      this.keyOrder = this.keyOrder.filter(k => k !== trackId);
      this.keyOrder.push(trackId);
      const cached = this.cache.get(trackId);
      this.emit('onLoadStart', { trackId, cached: true });
      this.emit('onLoadComplete', { trackId, buffer: cached, cached: true });
      return cached;
    }

    // 2. Emit load start for Spinner UI
    this.emit('onLoadStart', { trackId, cached: false });

    try {
      const ctx = this.getAudioContext();
      if (!ctx) throw new Error("AudioContext is not available.");

      let audioBuffer = null;

      // Procedural generation check
      if (this.proceduralGenerators.has(trackId)) {
        audioBuffer = this.proceduralGenerators.get(trackId)(ctx);
      } else {
        // Resolve URL if not provided directly
        let fetchUrl = url;
        if (!fetchUrl) {
          const found = AUDIO_SOURCES.find(t => t.id === trackId);
          if (found) {
            if (found.blobUrl) {
              fetchUrl = found.blobUrl;
            } else if (found.filename) {
              fetchUrl = `${AUDIO_BASE_PATH}/${found.filename}`;
            }
          }
          if (!fetchUrl) {
            // Search in multitrack sessions
            for (const session of MULTITRACK_SESSIONS) {
              const stem = session.stems.find(s => s.id === trackId);
              if (stem && stem.filename) {
                fetchUrl = `${AUDIO_BASE_PATH}/${stem.filename}`;
                break;
              }
            }
          }
        }

        if (!fetchUrl) {
          throw new Error(`Audio file not found for ID: ${trackId}`);
        }

        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} failed fetching ${fetchUrl}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      }

      // Evict oldest buffer if cache size exceeds maxCacheSize (2)
      this.cache.set(trackId, audioBuffer);
      this.keyOrder.push(trackId);
      this.evictExcessBuffers();

      this.emit('onLoadComplete', { trackId, buffer: audioBuffer, cached: false });
      return audioBuffer;
    } catch (err) {
      console.error(`AudioResourceManager failed loading track '${trackId}':`, err);
      this.emit('onLoadError', { trackId, error: err });
      throw err;
    }
  }

  /**
   * Retrieves buffer if currently present in cache.
   * @param {string} trackId 
   * @returns {AudioBuffer|null}
   */
  getBuffer(trackId) {
    return this.cache.get(trackId) || null;
  }

  /**
   * Flushes all cached buffers and frees RAM.
   */
  clearAll() {
    const keys = Array.from(this.cache.keys());
    keys.forEach(k => this.destroyBuffer(k));
  }
}
