// When things happen in the Loop Theory video, in seconds. The animation and
// the soundtrack both read these, so picture and sound stay in sync.

export const DURATION = 100;

export const EVENTS = {
  clapField: 7.0, // a clap in an open field
  clapStairwell: 10.2, // the same clap in a stairwell
  sweeps: [18.4, 21.0], // one-way sweeps from the eye to the higher regions
  sweepTime: 1.0, // how long one sweep takes to cross the chain
  loopStart: 26.4, // feedback starts and activity reverberates
  loopPeriod: 1.6, // one trip up the chain and back down
  morph: [38.0, 40.2], // the chain opens out into a ring of specialists
  whispers: 43.6, // party voices start competing
  ramp: 49.8, // "your name" starts gathering strength
  ignition: 53.4, // it crosses the tipping point and ignites
  calm: 61.6, // the broadcast settles into a steady hum
  inputCut: 65.6, // eyes close: no more input
  split: [73.0, 74.6], // the brain moves aside for a one-pass system
  onePassInputs: [75.8, 79.2], // inputs arriving at the one-pass system
  outro: 83.4, // the three ideas side by side
  finale: 94.0, // closing card
};

// A small seeded random generator, so every render is identical.
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// During the hum, signals travel between the seven specialists: from a to b,
// leaving at ts and taking dur seconds.
export const HUM_PULSES = (() => {
  const r = rng(11);
  const list = [];
  for (let ts = EVENTS.calm + 0.6; ts < EVENTS.outro; ts += 0.24 + r() * 0.26) {
    const a = Math.floor(r() * 7);
    const b = (a + 1 + Math.floor(r() * 6)) % 7;
    list.push({ ts, a, b, dur: 0.9 + r() * 0.5 });
  }
  return list;
})();

// Daydreaming, remembering, planning: when the caption names them, the
// matching specialist (vision, memory, planning) lights up.
export const HUM_HIGHLIGHTS = [
  [70.2, 0],
  [71.0, 6],
  [71.8, 3],
];
