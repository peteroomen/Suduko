// Original, locally synthesized sounds. Nothing is downloaded or played before a gesture.
const settings = { sound: false, ambience: 'off', sfxVolume: 0.45, ambienceVolume: 0.3 };
let context;
let effectsGain;
let ambienceGain;
let ambienceSource;
let ambienceKind = 'off';
let unlocked = false;
let manuallySuspended = false;
const buffers = new Map();
const hidden = () => typeof document !== 'undefined' && document.hidden;
const clamp = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;

function createContext() {
  if (context || typeof window === 'undefined') return context;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return undefined;
  context = new AudioContext();
  effectsGain = context.createGain();
  ambienceGain = context.createGain();
  effectsGain.connect(context.destination);
  ambienceGain.connect(context.destination);
  effectsGain.gain.value = settings.sound ? settings.sfxVolume : 0;
  ambienceGain.gain.value = settings.ambienceVolume;
  return context;
}

function noiseBuffer(seconds, kind = 'white') {
  const key = `${seconds}:${kind}`;
  if (buffers.has(key)) return buffers.get(key);
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    brown = (brown + white * 0.025) / 1.025;
    // Room tone is warm, with quiet rustles that swell organically through the loop.
    const rustle = kind === 'room' ? Math.pow(Math.max(0, Math.sin(i / context.sampleRate * 0.63)), 12) : 0;
    data[i] = kind === 'room' ? brown * 3 + white * rustle * 0.025 : white;
  }
  buffers.set(key, buffer);
  return buffer;
}

function stopAmbience() {
  if (ambienceSource) {
    try { ambienceSource.stop(); } catch { /* Already stopped. */ }
    ambienceSource.disconnect();
    ambienceSource = undefined;
  }
  ambienceKind = 'off';
}

function updateAmbience() {
  if (!context || !unlocked) return;
  if (settings.ambience === ambienceKind) return;
  stopAmbience();
  if (settings.ambience === 'off') return;
  const source = context.createBufferSource();
  const lowpass = context.createBiquadFilter();
  const highpass = context.createBiquadFilter();
  const level = context.createGain();
  const rain = settings.ambience === 'rain';
  source.buffer = noiseBuffer(rain ? 13 : 17, rain ? 'white' : 'room');
  source.loop = true;
  lowpass.type = 'lowpass';
  lowpass.frequency.value = rain ? 3800 : 750;
  highpass.type = 'highpass';
  highpass.frequency.value = rain ? 180 : 65;
  level.gain.value = rain ? 0.16 : 0.26;
  source.connect(highpass).connect(lowpass).connect(level).connect(ambienceGain);
  source.onended = () => { highpass.disconnect(); lowpass.disconnect(); level.disconnect(); };
  source.start();
  ambienceSource = source;
  ambienceKind = settings.ambience;
}

function tone(frequency, start, duration, level = 0.13, type = 'sine') {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(level, start + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope).connect(effectsGain);
  oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

function scratch(kind, start) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  const erase = kind === 'erase';
  const duration = erase ? 0.18 : 0.065;
  source.buffer = noiseBuffer(0.3);
  filter.type = 'bandpass';
  filter.frequency.value = erase ? 850 : 2900;
  filter.Q.value = erase ? 0.5 : 0.8;
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(erase ? 0.22 : 0.18, start + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(envelope).connect(effectsGain);
  source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
  source.start(start, Math.random() * 0.08);
  source.stop(start + duration + 0.01);
}

export const audio = {
  setSettings(next = {}) {
    if (typeof next.sound === 'boolean') settings.sound = next.sound;
    if (['off', 'rain', 'library'].includes(next.ambience)) settings.ambience = next.ambience;
    if (next.sfxVolume !== undefined) settings.sfxVolume = clamp(next.sfxVolume, settings.sfxVolume);
    if (next.ambienceVolume !== undefined) settings.ambienceVolume = clamp(next.ambienceVolume, settings.ambienceVolume);
    if (context) {
      effectsGain.gain.setTargetAtTime(settings.sound ? settings.sfxVolume : 0, context.currentTime, 0.03);
      ambienceGain.gain.setTargetAtTime(settings.ambienceVolume, context.currentTime, 0.1);
      updateAmbience();
    }
  },
  async unlock() {
    try {
      const instance = createContext();
      if (!instance || hidden()) return false;
      manuallySuspended = false;
      await instance.resume();
      unlocked = instance.state === 'running';
      if (unlocked) updateAmbience();
      return unlocked;
    } catch { return false; }
  },
  play(kind) {
    if (!context || !unlocked || !settings.sound || hidden() || manuallySuspended || context.state !== 'running') return;
    const now = context.currentTime;
    if (kind === 'write' || kind === 'erase') scratch(kind, now);
    else if (kind === 'tap') tone(470, now, 0.055, 0.08);
    else if (kind === 'error') {
      tone(220, now, 0.1, 0.06);
      tone(196, now + 0.08, 0.16, 0.05);
    } else if (kind === 'complete') {
      [392, 493.88, 587.33, 783.99].forEach((note, index) => {
        tone(note, now + index * 0.13, 0.7, 0.11);
        tone(note * 2, now + index * 0.13, 0.23, 0.025);
      });
    }
  },
  suspend() {
    manuallySuspended = true;
    return context?.suspend().catch(() => {});
  },
  resume() {
    manuallySuspended = false;
    if (unlocked && !hidden()) return context?.resume().catch(() => {});
  },
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!context) return;
    if (hidden()) context.suspend().catch(() => {});
    else if (unlocked && !manuallySuspended) context.resume().catch(() => {});
  });
}
