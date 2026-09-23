// Efectos de sonido sintetizados con WebAudio (sin ficheros externos).
let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem('mus-muted') === '1';
} catch {
  /* sin almacenamiento: sonido activado */
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('mus-muted', muted ? '1' : '0');
  } catch {
    /* ignorar */
  }
  return muted;
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  void ctx?.resume();
}

function noise(duration: number, freq: number, gain: number) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}

function tone(freq: number, start: number, duration: number, gain: number, type: OscillatorType = 'sine') {
  if (!ctx) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + duration + 0.05);
}

export function play(name: 'deal' | 'chip' | 'call' | 'win' | 'ordago') {
  if (muted || !ctx) return;
  switch (name) {
    case 'deal':
      noise(0.07, 2400, 0.35);
      break;
    case 'chip':
      tone(1850, 0, 0.08, 0.12, 'triangle');
      tone(2600, 0.03, 0.08, 0.08, 'triangle');
      noise(0.04, 5000, 0.15);
      break;
    case 'call':
      tone(520, 0, 0.09, 0.04, 'sine');
      break;
    case 'ordago':
      tone(110, 0, 0.5, 0.35, 'sine');
      tone(82, 0.12, 0.6, 0.3, 'sine');
      noise(0.25, 300, 0.4);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.4, 0.12, 'triangle'));
      break;
  }
}
