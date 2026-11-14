// Sound, synthesised — no audio files, no network. A noise burst is a gunshot,
// a low sine thump is the durian going off, a little pentatonic plink is a
// kill. The context starts on the first user gesture, as browsers require.
let ctx = null;
let noiseBuf = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

function noise(dur, filterFreq, gain, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + dur);
}

function tone(freq, dur, type, gain, slideTo = 0, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

export const sfx = {
  shot(kind) {
    if (kind === 'sniper' || kind === 'shotgun') noise(0.22, 900, 0.5);
    else if (kind === 'pistol') noise(0.09, 1800, 0.32);
    else noise(0.12, 1400, 0.4);
    tone(160, 0.08, 'square', 0.12, 60);
  },
  dryFire() { tone(1200, 0.05, 'square', 0.08); },
  reload() {
    tone(500, 0.05, 'square', 0.1);
    tone(700, 0.05, 'square', 0.1, 0, 0.18);
  },
  hit() { tone(880, 0.07, 'triangle', 0.16); },
  kill() {
    // a tiny pentatonic plink: C E G, because a kill at the pasar should sing
    tone(523, 0.12, 'triangle', 0.18);
    tone(659, 0.12, 'triangle', 0.18, 0, 0.09);
    tone(784, 0.2, 'triangle', 0.18, 0, 0.18);
  },
  hurt() { tone(140, 0.15, 'sawtooth', 0.2, 70); },
  plantBeep() { tone(990, 0.09, 'square', 0.12); },
  defuseBeep() { tone(660, 0.09, 'square', 0.12); },
  explosion() {
    noise(0.9, 300, 0.8);
    tone(70, 0.8, 'sine', 0.5, 30);
  },
  click() { tone(900, 0.04, 'square', 0.08); },
  buy() { tone(660, 0.08, 'triangle', 0.14); tone(880, 0.12, 'triangle', 0.14, 0, 0.08); },
  roundWin() {
    tone(523, 0.15, 'triangle', 0.16);
    tone(659, 0.15, 'triangle', 0.16, 0, 0.12);
    tone(784, 0.3, 'triangle', 0.16, 0, 0.24);
  },
  roundLose() {
    tone(392, 0.2, 'triangle', 0.14);
    tone(311, 0.35, 'triangle', 0.14, 0, 0.16);
  },
};
