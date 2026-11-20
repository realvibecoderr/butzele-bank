/* Kleine 8-Bit-Geräusche, live mit WebAudio erzeugt (keine Audiodateien nötig). */
window.Sfx = (() => {
  'use strict';
  let ac = null;
  let enabled = true;

  function ctx() {
    if (!enabled) return null;
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(f0, f1, start, dur, type = 'square', vol = 0.06) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + start;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(start, dur, freq, vol) {
    const a = ctx(); if (!a) return;
    const n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.4;
    const g = a.createGain(), t = a.currentTime + start;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t); src.stop(t + dur);
  }

  function woof(at) {
    tone(620, 240, at, 0.12, 'triangle', 0.16);
    tone(310, 150, at, 0.12, 'sawtooth', 0.035);
    noise(at, 0.08, 1200, 0.1);
  }

  return {
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; },
    unlock() { ctx(); },
    coin() { tone(988, null, 0, 0.07, 'square', 0.05); tone(1319, null, 0.07, 0.3, 'square', 0.05); },
    bark() { woof(0); woof(0.19); },
    oops() { tone(520, 330, 0, 0.18, 'triangle', 0.09); tone(330, 220, 0.18, 0.3, 'triangle', 0.08); },
    pet() { tone(880, 1175, 0, 0.09, 'sine', 0.08); tone(1175, 1568, 0.09, 0.12, 'sine', 0.07); },
    party() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, null, i * 0.09, 0.15, 'square', 0.045)); },
  };
})();
