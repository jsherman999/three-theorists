// The Loop Theory video's soundtrack, synthesized from scratch so it follows
// the picture exactly: a soft pad, a dry clap and then a clap with a
// stairwell's echo, ticks for the one-way sweep, tones that circle with the
// loop, party murmur, a swell into ignition, and a hum that carries on after
// the input stops. Returns a 16-bit stereo WAV.

import { DURATION, EVENTS as E, HUM_HIGHLIGHTS, HUM_PULSES, rng } from "./timeline.js";

const RATE = 48000;
const TAU = Math.PI * 2;

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const seg = (t, a, b) => clamp((t - a) / (b - a));
function keys(t, frames) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i];
    const [t0, v0] = frames[i - 1];
    if (t <= t1) return lerp(v0, v1, smooth((t - t0) / (t1 - t0)));
  }
  return frames[frames.length - 1][1];
}

// Note frequencies. The loop plays an open D chord with no third; the third
// (F sharp) arrives with ignition, when something finally resolves.
const NOTE = { D2: 73.42, A2: 110, D3: 146.83, A3: 220, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, D5: 587.33, E5: 659.25, Fs5: 739.99, A5: 880, D6: 1174.66 };

class Track {
  constructor(length) {
    this.left = new Float32Array(length);
    this.right = new Float32Array(length);
    this.send = new Float32Array(length); // mono feed into the reverb
  }
  add(i, value, pan = 0, send = 0) {
    if (i < 0 || i >= this.left.length) return;
    const angle = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
    this.left[i] += value * Math.cos(angle);
    this.right[i] += value * Math.sin(angle);
    this.send[i] += value * send;
  }
}

// RBJ cookbook band-pass biquad (0 dB peak), retunable as it runs.
function bandpass(freq, q) {
  let b0, b2, a1, a2;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const step = (x) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
  step.tune = (f) => {
    const w = (TAU * f) / RATE;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    b0 = alpha / a0;
    b2 = -alpha / a0;
    a1 = (-2 * Math.cos(w)) / a0;
    a2 = (1 - alpha) / a0;
  };
  step.tune(freq);
  return step;
}

// A soft struck tone: sine plus a little of the octave and twelfth.
function mallet(track, t0, freq, gain, { pan = 0, send = 0.4, decay = 0.6, attack = 0.004 } = {}) {
  const start = Math.round(t0 * RATE);
  const length = Math.round(decay * 6 * RATE);
  for (let n = 0; n < length; n++) {
    const t = n / RATE;
    const env = Math.min(1, t / attack) * Math.exp(-t / decay);
    const v = Math.sin(TAU * freq * t) + 0.18 * Math.sin(TAU * 2 * freq * t) * Math.exp(-t / (decay * 0.4)) + 0.06 * Math.sin(TAU * 3 * freq * t) * Math.exp(-t / (decay * 0.2));
    track.add(start + n, gain * env * v, pan, send);
  }
}

// One recorded-sounding clap: three quick bursts as skin meets skin, then a
// short tail. Both scenes use this same clap, so only the room differs.
function makeClap(random) {
  const filter = bandpass(1300, 0.8);
  const sound = new Float32Array(Math.round(0.35 * RATE));
  for (let n = 0; n < sound.length; n++) {
    const t = n / RATE;
    let env = 0;
    for (const at of [0, 0.007, 0.015]) if (t >= at) env = Math.max(env, Math.exp(-(t - at) / 0.004));
    if (t >= 0.022) env = Math.max(env, 0.8 * Math.exp(-(t - 0.022) / 0.03));
    sound[n] = 3 * env * filter(random() * 2 - 1);
  }
  return sound;
}

function place(track, sound, t0, gain, pan, send) {
  const start = Math.round(t0 * RATE);
  for (let n = 0; n < sound.length; n++) track.add(start + n, gain * sound[n], pan, send);
}

function buildScore() {
  const length = Math.ceil(DURATION * RATE);
  const track = new Track(length);
  const random = rng(5);

  // Pad: a slow, breathing drone under everything.
  const pad = [
    [NOTE.D2, 0.5, -0.1], [NOTE.A2, 0.5, 0.15], [NOTE.D3, 0.6, -0.3], [NOTE.A3, 0.5, 0.35],
    [NOTE.E4, 0.28, -0.45], [NOTE.A4, 0.2, 0.5], [NOTE.Fs4, 0.26, 0.2, "third"],
    [NOTE.E5, 0.08, -0.6, "bright"], [NOTE.A5, 0.06, 0.6, "bright"],
  ];
  const phases = pad.map(() => random() * TAU);
  const drift = pad.map(() => 0.04 + random() * 0.09);
  const running = phases.slice();
  for (let n = 0; n < length; n++) {
    const t = n / RATE;
    const level = keys(t, [
      [0, 0], [1.6, 0.55], [5, 0.5], [6.4, 0.16], [15.4, 0.16], [17, 0.34], [E.loopStart, 0.36],
      [E.loopStart + 3, 0.5], [37.5, 0.5], [40.5, 0.34], [E.ramp, 0.34], [E.ignition - 0.05, 0.4],
      [E.ignition + 0.4, 0.85], [58, 0.62], [E.calm + 1, 0.55], [E.outro, 0.5], [88, 0.66], [97, 0.6], [DURATION, 0],
    ]);
    const third = smooth(seg(t, E.ignition, E.ignition + 0.6));
    const bright = keys(t, [[0, 0.3], [6, 0], [E.loopStart, 0], [E.loopStart + 3, 0.6], [38, 0.6], [41, 0.1], [E.ignition, 0.1], [E.ignition + 0.3, 1], [E.calm + 2, 0.55], [DURATION, 0.5]]);
    for (let p = 0; p < pad.length; p++) {
      const [freq, gain, pan, kind] = pad[p];
      const k = kind === "third" ? third : kind === "bright" ? bright : 1;
      const wobble = 0.72 + 0.28 * Math.sin(TAU * drift[p] * t + phases[p]);
      running[p] += (TAU * freq * (1 + 0.0015 * Math.sin(TAU * 0.17 * t + phases[p]))) / RATE;
      if (k <= 0) continue;
      track.add(n, 0.08 * level * gain * k * wobble * Math.sin(running[p]), pan, 0.25);
    }
  }

  // The two claps: bare in the field; in the stairwell, bouncing between the
  // walls and dying away as slowly as the trace on screen.
  const clapSound = makeClap(random);
  place(track, clapSound, E.clapField, 0.5, -0.45, 0.02);
  place(track, clapSound, E.clapStairwell, 0.5, 0.45, 0.8);
  for (let k = 1; k <= 20; k++) {
    place(track, clapSound, E.clapStairwell + k * 0.26, 0.4 * Math.exp((-k * 0.26) / 1.7), 0.45 + (k % 2 ? -0.3 : 0.3), 0.7);
  }

  // One-way sweeps: a rising tick at each stage, travelling left to right.
  const sweepNotes = [NOTE.A5, 987.77, NOTE.D6, 1318.51, 1760];
  for (const s of E.sweeps) {
    sweepNotes.forEach((freq, j) => {
      const u = j / 4;
      mallet(track, s + u * E.sweepTime, freq, 0.07, { pan: lerp(-0.6, 0.45, u), send: 0.15, decay: 0.09 });
    });
  }

  // The loop: up the chain and back, a note at each stage, ringing on.
  const loopNotes = [NOTE.D4, NOTE.E4, NOTE.A4, NOTE.D5];
  for (let cycle = 0; E.loopStart + cycle * E.loopPeriod < 38.2; cycle++) {
    const t0 = E.loopStart + cycle * E.loopPeriod;
    const level = smooth(seg(t0, E.loopStart - 0.1, E.loopStart + 2.2)) * (1 - smooth(seg(t0, 36.8, 38.2)));
    loopNotes.forEach((freq, i) => {
      mallet(track, t0 + (i / 3) * (E.loopPeriod / 2), freq, 0.055 * level, { pan: lerp(-0.4, 0.4, i / 3), send: 0.55, decay: 0.5 });
    });
    // The return trip down the big arc: a soft, low answer.
    mallet(track, t0 + E.loopPeriod * 0.75, NOTE.A3, 0.035 * level, { pan: 0, send: 0.6, decay: 0.7, attack: 0.05 });
  }

  // Party murmur: filtered noise shaped into syllables, until the name wins.
  const murmur = [bandpass(420, 0.9), bandpass(1100, 1.1), bandpass(430, 0.9), bandpass(1150, 1.1)];
  for (let n = Math.round(E.whispers * RATE); n < Math.round((E.calm + 1) * RATE); n++) {
    const t = n / RATE;
    const level = smooth(seg(t, E.whispers, E.whispers + 1.8)) * lerp(1, 0.12, smooth(seg(t, E.ignition, E.ignition + 0.5))) * (1 - smooth(seg(t, E.ignition + 2, E.calm)));
    const syll = (seed, rate) => Math.pow(0.5 + 0.5 * Math.sin(TAU * rate * t + seed + 2 * Math.sin(TAU * 0.37 * t + seed)), 2);
    const l = murmur[0](random() * 2 - 1) * syll(1, 4.3) + 0.6 * murmur[1](random() * 2 - 1) * syll(4, 5.1);
    const r = murmur[2](random() * 2 - 1) * syll(2.5, 3.9) + 0.6 * murmur[3](random() * 2 - 1) * syll(6, 5.6);
    track.add(n, 0.16 * level * l, -0.6, 0.2);
    track.add(n, 0.16 * level * r, 0.6, 0.2);
  }

  // Your name gathers strength: a swell that rises into the tipping point.
  const riser = bandpass(300, 2.5);
  let tonePhase = 0;
  for (let n = Math.round(E.ramp * RATE); n < Math.round(E.ignition * RATE); n++) {
    const t = n / RATE;
    const k = seg(t, E.ramp, E.ignition);
    riser.tune(lerp(300, 3800, k * k));
    tonePhase += (TAU * lerp(NOTE.A3, NOTE.A4, k * k)) / RATE;
    const hiss = riser(random() * 2 - 1) * 2.5;
    const release = 1 - smooth(seg(t, E.ignition - 0.02, E.ignition));
    track.add(n, 0.12 * Math.pow(k, 2.4) * (0.35 * Math.sin(tonePhase) + hiss) * release, 0, 0.3);
  }

  // Ignition: a low thump, a bright chord bloom, and a burst of air.
  const hit = Math.round(E.ignition * RATE);
  let phase = 0;
  for (let n = 0; n < Math.round(3 * RATE); n++) {
    const t = n / RATE;
    phase += (TAU * (38 + 34 * Math.exp(-t / 0.18))) / RATE;
    track.add(hit + n, 0.4 * Math.min(1, t / 0.004) * Math.exp(-t / 0.7) * Math.sin(phase), 0, 0.1);
    track.add(hit + n, 0.12 * Math.exp(-t / 0.22) * (random() * 2 - 1), (random() - 0.5) * 0.6, 0.8);
  }
  for (const [freq, pan] of [[NOTE.D4, -0.3], [NOTE.Fs4, 0.3], [NOTE.A4, -0.1], [NOTE.E5, 0.4], [NOTE.A5, -0.45], [NOTE.D6, 0.2]]) {
    mallet(track, E.ignition, freq, 0.06, { pan, send: 0.7, decay: 2.2, attack: 0.02 });
  }
  // The broadcast keeps going out, beat after beat.
  for (let t0 = E.ignition + 0.9; t0 < E.calm + 1; t0 += 0.9) {
    const level = 1 - smooth(seg(t0, E.calm - 1, E.calm + 1));
    mallet(track, t0 + 0.28, NOTE.A5, 0.035 * level, { pan: -0.2, send: 0.6, decay: 0.5 });
    mallet(track, t0 + 0.28, NOTE.D6, 0.02 * level, { pan: 0.2, send: 0.6, decay: 0.4 });
  }

  // Input from the senses: a fine patter that stops the moment the eyes close.
  for (let i = 0; ; i++) {
    const born = E.calm - 0.4 + i * 0.16;
    if (born > E.inputCut) break;
    const level = smooth(seg(born, E.calm - 0.4, E.calm + 0.6));
    mallet(track, born, 2637 * (1 + 0.03 * (random() - 0.5)), 0.022 * level, { pan: -0.55, send: 0.05, decay: 0.025 });
  }

  // The hum: specialists signalling each other, with nothing coming in.
  const humNotes = [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.E4, NOTE.Fs4, NOTE.A4, NOTE.D5];
  for (const p of HUM_PULSES) {
    const level = smooth(seg(p.ts, E.calm, E.calm + 1.6)) * (1 - smooth(seg(p.ts, E.outro - 1.5, E.outro)));
    mallet(track, p.ts + p.dur, humNotes[p.b], 0.03 * level, { pan: lerp(-0.5, 0.5, p.b / 6), send: 0.6, decay: 0.45, attack: 0.01 });
  }
  for (const [at, k] of HUM_HIGHLIGHTS) mallet(track, at, humNotes[k] * 2, 0.045, { pan: 0, send: 0.7, decay: 1.2, attack: 0.03 });

  // The one-pass system: a single dry blip per stage, then silence.
  for (const s of E.onePassInputs) {
    for (let j = 0; j < 4; j++) {
      mallet(track, s + ((140 + j * 160) / 740) * 0.9, 1318.51, 0.035, { pan: 0.5, send: 0, decay: 0.05 });
    }
  }

  // Recap chimes, and a last chord for the closing card.
  [NOTE.D5, NOTE.Fs5, NOTE.A5].forEach((freq, i) => mallet(track, E.outro + 0.2 + i * 0.45, freq, 0.05, { pan: (i - 1) * 0.4, send: 0.6, decay: 1.4, attack: 0.01 }));
  for (const [freq, pan] of [[NOTE.D3, 0], [NOTE.A3, -0.3], [NOTE.D4, 0.3], [NOTE.Fs4, -0.2], [NOTE.A4, 0.2], [NOTE.E5, 0]]) {
    mallet(track, E.finale + 0.1, freq, 0.03, { pan, send: 0.7, decay: 2.6, attack: 0.08 });
  }
  return track;
}

// Freeverb: parallel damped combs into series all-passes, mono in, stereo out.
function reverb(input, { room = 0.86, damp = 0.25, spread = 23 } = {}) {
  const scale = RATE / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const passes = [556, 441, 341, 225];
  const channel = (offset) => {
    const out = new Float32Array(input.length);
    const cb = combs.map((d) => ({ buf: new Float32Array(Math.round((d + offset) * scale)), i: 0, store: 0 }));
    const ap = passes.map((d) => ({ buf: new Float32Array(Math.round((d + offset) * scale)), i: 0 }));
    for (let n = 0; n < input.length; n++) {
      const x = input[n] * 0.015;
      let y = 0;
      for (const c of cb) {
        const o = c.buf[c.i];
        c.store = o * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * room;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      for (const a of ap) {
        const o = a.buf[a.i];
        a.buf[a.i] = y + o * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = o - y;
      }
      out[n] = y;
    }
    return out;
  };
  return [channel(0), channel(spread)];
}

function encodeWav(left, right) {
  const frames = left.length;
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 4, 40);
  for (let n = 0; n < frames; n++) {
    buffer.writeInt16LE(Math.round(clamp(left[n], -1, 1) * 32767), 44 + n * 4);
    buffer.writeInt16LE(Math.round(clamp(right[n], -1, 1) * 32767), 46 + n * 4);
  }
  return buffer;
}

// A look-ahead peak limiter: the claps and the ignition hit are brief, so
// taming them lets everything else sit at a comfortable level.
function limit(left, right, ceiling) {
  const ahead = Math.round(0.005 * RATE);
  const release = Math.exp(-1 / (0.12 * RATE));
  const attack = Math.exp(-1 / (0.001 * RATE));
  const need = new Float32Array(left.length);
  for (let n = 0; n < left.length; n++) need[n] = Math.min(1, ceiling / Math.max(Math.abs(left[n]), Math.abs(right[n]), 1e-9));
  // The smallest gain needed over the next few milliseconds (sliding minimum).
  const queue = [];
  let head = 0;
  let gain = 1;
  for (let n = 0; n < left.length; n++) {
    const edge = n + ahead;
    if (edge < left.length) {
      while (queue.length > head && need[queue[queue.length - 1]] >= need[edge]) queue.pop();
      queue.push(edge);
    }
    while (queue[head] < n) head++;
    const target = head < queue.length ? need[queue[head]] : 1;
    gain = target < gain ? target + (gain - target) * attack : target + (gain - target) * release;
    const g = Math.min(gain, need[n]);
    left[n] *= g;
    right[n] *= g;
  }
}

export function buildSoundtrack({ from = 0, to = DURATION } = {}) {
  const track = buildScore();
  const [wetL, wetR] = reverb(track.send);
  const length = track.left.length;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  let peak = 0;
  for (let n = 0; n < length; n++) {
    left[n] = track.left[n] + 0.8 * wetL[n];
    right[n] = track.right[n] + 0.8 * wetR[n];
    peak = Math.max(peak, Math.abs(left[n]), Math.abs(right[n]));
  }
  // Bring the mix up 8 dB past full scale, then let the limiter hold the
  // peaks at -1 dBFS.
  const gain = peak > 0 ? 2.5 / peak : 1;
  for (let n = 0; n < length; n++) {
    left[n] *= gain;
    right[n] *= gain;
  }
  limit(left, right, 0.89);
  // Short fades at the edges so partial renders don't click.
  const start = Math.round(from * RATE);
  const end = Math.min(length, Math.round(to * RATE));
  const fade = Math.round(0.02 * RATE);
  const outL = left.slice(start, end);
  const outR = right.slice(start, end);
  for (let n = 0; n < outL.length; n++) {
    const edge = Math.min(1, n / fade, (outL.length - 1 - n) / fade);
    outL[n] *= edge;
    outR[n] *= edge;
  }
  return encodeWav(outL, outR);
}
