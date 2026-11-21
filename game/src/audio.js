// audio.js — every sound in Neon Harbor is synthesised with WebAudio at the
// moment it is needed: engine hum, tyres, sirens, gunfire, impacts, pickups
// and a small procedural synthwave loop for the menu. No audio files exist.

let ctx = null;
let master = null;
let engineNodes = null;
let sirenNodes = null;
let musicTimer = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  ctx = new AudioCtor();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
}

function tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, vol = 0.2, when = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.12, vol = 0.25, freq = 1200, q = 0.8, when = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

export const sfx = {
  click() { tone({ freq: 660, freqEnd: 520, type: 'triangle', dur: 0.07, vol: 0.15 }); },
  pickup() {
    tone({ freq: 880, type: 'triangle', dur: 0.09, vol: 0.18 });
    tone({ freq: 1320, type: 'triangle', dur: 0.14, vol: 0.18, when: 0.07 });
  },
  cash() {
    tone({ freq: 1180, type: 'square', dur: 0.06, vol: 0.1 });
    tone({ freq: 1560, type: 'square', dur: 0.1, vol: 0.1, when: 0.05 });
  },
  gunshot() {
    noise({ dur: 0.14, vol: 0.5, freq: 900, q: 0.4 });
    tone({ freq: 160, freqEnd: 45, type: 'sawtooth', dur: 0.12, vol: 0.35 });
  },
  punch() { noise({ dur: 0.08, vol: 0.3, freq: 500, q: 1 }); },
  hit() { noise({ dur: 0.1, vol: 0.35, freq: 700, q: 0.7 }); },
  crash(intensity = 1) {
    noise({ dur: 0.28, vol: 0.4 * intensity, freq: 320, q: 0.5 });
    tone({ freq: 110, freqEnd: 40, type: 'sawtooth', dur: 0.25, vol: 0.25 * intensity });
  },
  skid() { noise({ dur: 0.16, vol: 0.1, freq: 2400, q: 2 }); },
  horn() {
    tone({ freq: 370, type: 'square', dur: 0.22, vol: 0.12 });
    tone({ freq: 466, type: 'square', dur: 0.22, vol: 0.12 });
  },
  door() { tone({ freq: 190, freqEnd: 90, type: 'triangle', dur: 0.12, vol: 0.2 }); },
  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((freq, i) => tone({ freq, type: 'triangle', dur: 0.22, vol: 0.16, when: i * 0.09 }));
  },
  missionFail() {
    tone({ freq: 330, freqEnd: 196, type: 'triangle', dur: 0.4, vol: 0.18 });
    tone({ freq: 262, freqEnd: 147, type: 'triangle', dur: 0.5, vol: 0.18, when: 0.18 });
  },
  wantedUp() {
    tone({ freq: 392, type: 'square', dur: 0.1, vol: 0.12 });
    tone({ freq: 392, type: 'square', dur: 0.1, vol: 0.12, when: 0.16 });
  },
  busted() {
    tone({ freq: 220, freqEnd: 110, type: 'sawtooth', dur: 0.7, vol: 0.2 });
  },
  wasted() {
    tone({ freq: 196, freqEnd: 49, type: 'sawtooth', dur: 1.1, vol: 0.22 });
  },
};

// The engine is a pair of detuned oscillators whose pitch follows speed.
export function setEngine(on, speedRatio = 0, throttle = 0) {
  if (!ctx) return;
  if (on && !engineNodes) {
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const gain = ctx.createGain();
    oscA.type = 'sawtooth';
    oscB.type = 'square';
    gain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain).connect(master);
    oscA.start();
    oscB.start();
    engineNodes = { oscA, oscB, gain };
  }
  if (!on && engineNodes) {
    const nodes = engineNodes;
    engineNodes = null;
    nodes.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    setTimeout(() => { try { nodes.oscA.stop(); nodes.oscB.stop(); } catch { /* already stopped */ } }, 250);
    return;
  }
  if (engineNodes) {
    const base = 55 + speedRatio * 130 + throttle * 22;
    engineNodes.oscA.frequency.value = base;
    engineNodes.oscB.frequency.value = base * 0.5 + 2;
    engineNodes.gain.gain.value = 0.05 + speedRatio * 0.05 + throttle * 0.03;
  }
}

// A two-tone police siren that exists only while a cruiser is close.
export function setSiren(on, volume = 0) {
  if (!ctx) return;
  if (on && !sirenNodes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 820;
    lfo.frequency.value = 0.9;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.value = 0;
    osc.connect(gain).connect(master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, lfo, gain };
  }
  if (!on && sirenNodes) {
    const nodes = sirenNodes;
    sirenNodes = null;
    try { nodes.osc.stop(); nodes.lfo.stop(); } catch { /* already stopped */ }
    return;
  }
  if (sirenNodes) sirenNodes.gain.gain.value = Math.min(0.14, volume);
}

// A tiny synthwave bass loop for menus: four bars of sequenced oscillators.
const BASSLINE = [55, 0, 55, 55, 0, 55, 0, 65.4, 0, 55, 0, 55, 49, 0, 73.4, 0];
export function setMusic(on) {
  if (!ctx) return;
  if (on && !musicTimer) {
    let step = 0;
    musicTimer = setInterval(() => {
      const freq = BASSLINE[step % BASSLINE.length];
      if (freq) tone({ freq, type: 'sawtooth', dur: 0.19, vol: 0.055 });
      if (step % 8 === 0) tone({ freq: freq ? freq * 4 : 220, type: 'triangle', dur: 0.4, vol: 0.03 });
      step++;
    }, 210);
  }
  if (!on && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
