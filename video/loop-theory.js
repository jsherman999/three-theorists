// The Loop Theory explainer: what sustained recurrent dynamics claims, in about
// a hundred seconds. Every frame is a pure function of time, so the page can
// play live or be captured frame by frame by render.mjs.

import { DURATION, EVENTS as E, HUM_HIGHLIGHTS, HUM_PULSES, rng } from "./timeline.js";

const W = 1920;
const H = 1080;
const TAU = Math.PI * 2;

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

const FONT_DISPLAY = '"Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif';
const FONT_BODY = '"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, sans-serif';

// The app's night palette: the Loop Theorist's warm ink for looping activity,
// a cool blue for the one-way sweep.
const INK = [230, 235, 242];
const MUTED = [154, 166, 184];
const LINE = [58, 72, 98];
const PANEL = [16, 22, 34];
const NODE = [24, 32, 48];
const WARM = [242, 176, 124];
const HOT = [255, 228, 200];
const COOL = [150, 186, 245];
const APPLE = [222, 96, 84];
const LEAF = [150, 206, 160];
const HIGHLIGHT = [112, 78, 54];

const CAPTIONS = [
  [6.2, 9.8, "Clap in an open field, and the sound is gone in an instant."],
  [9.8, 12.9, "Clap in a stairwell, and it keeps ringing."],
  [12.9, 16.0, "The Loop Theory says awareness is like that echo."],
  [16.6, 21.6, "When you look at something, signals first race one way: from your senses up to higher regions."],
  [21.6, 26.2, "This fast sweep can even recognize things, but on its own, you aren't aware of it."],
  [26.2, 31.8, "Awareness comes when higher regions send signals back down, and the activity keeps looping."],
  [31.8, 37.6, "Like the echo, it keeps reverberating instead of making a single pass. Now you see the apple."],
  [38.8, 43.4, "Zoom out, and your brain is running many specialists at once, mostly out of sight."],
  [43.4, 48.6, "At a noisy party, dozens of voices get processed, all competing for attention."],
  [48.6, 53.3, "Then someone says your name. It gathers strength until it tips over…"],
  [53.4, 57.0, "…and ignites: a sudden, all-or-nothing burst."],
  [57.0, 61.6, "It's broadcast to the whole brain at once. On this view, that broadcast is awareness."],
  [62.4, 67.2, "Now take the input away. Close your eyes and stare at the ceiling."],
  [67.2, 73.2, "Your brain doesn't go quiet. Its loops keep humming on their own: daydreaming, remembering, planning."],
  [74.0, 82.8, "Today's chatbots mostly work in single passes. Between prompts, they sit completely still."],
  [83.8, 88.8, "Put together: on this view, awareness is a pattern of activity, not a special material."],
  [88.8, 93.8, "So a machine with the right loops might, in principle, be aware too."],
];

const HEADINGS = [
  [16.2, 37.8, "Idea 1 of 3", "Sustained loops"],
  [38.6, 61.4, "Idea 2 of 3", "Something like ignition"],
  [62.0, 82.8, "Idea 3 of 3", "Ongoing activity with no input"],
];

// ---------------------------------------------------------------- helpers

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOutBack = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${clamp(a)})`;
// Visible from a to b, fading in over fi seconds and out over fo seconds.
const span = (t, a, b, fi = 0.5, fo = 0.5) => smooth(seg(t, a, a + fi)) * (1 - smooth(seg(t, b - fo, b)));
// Smoothly interpolated keyframes: [[time, value], ...].
function keys(t, frames) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i];
    const [t0, v0] = frames[i - 1];
    if (t <= t1) return lerp(v0, v1, smooth((t - t0) / (t1 - t0)));
  }
  return frames[frames.length - 1][1];
}

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Smooth value noise in [0, 1].
function noise(x, seed = 0) {
  const i = Math.floor(x);
  return lerp(hash(i + seed * 57.31), hash(i + 1 + seed * 57.31), smooth(x - i));
}

function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// A soft additive glow.
function glow(x, y, r, color, alpha) {
  if (alpha <= 0.003 || r <= 1) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.3, rgba(color, alpha * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

function setFont(size, weight = 400, font = FONT_BODY, italic = false) {
  ctx.font = `${italic ? "italic " : ""}${weight} ${size}px ${font}`;
}

function text(str, x, y, { size = 32, weight = 400, font = FONT_BODY, color = INK, alpha = 1, align = "center", italic = false, spacing = 0 } = {}) {
  if (alpha <= 0.003) return;
  ctx.save();
  setFont(size, weight, font, italic);
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillStyle = rgba(color, alpha);
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(str, x, y);
  ctx.restore();
}

// Wrap to the fewest lines, then narrow the lines so they come out even.
const wrapCache = new Map();
function balancedWrap(str, maxWidth) {
  const key = `${ctx.font}|${maxWidth}|${str}`;
  if (wrapCache.has(key)) return wrapCache.get(key);
  const greedy = (width) => {
    const lines = [];
    let line = "";
    for (const word of str.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  let best = greedy(maxWidth);
  for (let width = maxWidth - 20; width > maxWidth * 0.4; width -= 20) {
    const lines = greedy(width);
    if (lines.length > best.length) break;
    best = lines;
  }
  wrapCache.set(key, best);
  return best;
}

// Paths that particles and pulses can travel along, as u goes from 0 to 1.
const straight = (a, b) => (u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
const curve = (a, c, b) => (u) => {
  const v = 1 - u;
  return [v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]];
};

function strokeAlong(path, from = 0, to = 1, steps = 48) {
  if (to <= from) return;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const [x, y] = path(lerp(from, to, i / steps));
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
}

// A glowing dot with a fading tail.
function comet(path, u, color, alpha, size = 7, tail = 0.1) {
  if (alpha <= 0.003) return;
  for (let i = 14; i >= 1; i--) {
    const uu = u - (tail * i) / 14;
    if (uu < 0 || uu > 1) continue;
    const [x, y] = path(uu);
    const k = 1 - i / 15;
    ctx.fillStyle = rgba(color, alpha * k * 0.45);
    circle(x, y, size * (0.3 + 0.6 * k));
    ctx.fill();
  }
  if (u < 0 || u > 1) return;
  const [x, y] = path(u);
  glow(x, y, size * 5, color, alpha * 0.55);
  ctx.fillStyle = rgba(mix(color, HOT, 0.6), alpha);
  circle(x, y, size * 0.75);
  ctx.fill();
}

function arrowOn(path, u, size, color, alpha) {
  if (alpha <= 0.003) return;
  const [x1, y1] = path(clamp(u - 0.01));
  const [x2, y2] = path(clamp(u + 0.01));
  const [x, y] = path(u);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
  ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.7, size * 0.8);
  ctx.lineTo(-size * 0.7, -size * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// A brain region: dark when idle, cool when the one-way sweep passes,
// warm when activity loops through it.
function drawNode(x, y, r, cool, warm, alpha = 1) {
  if (alpha <= 0.003 || r <= 0) return;
  const act = clamp(cool + warm);
  const color = cool + warm > 0.001 ? mix(COOL, WARM, warm / (cool + warm)) : MUTED;
  glow(x, y, r * 3.6, color, 0.6 * act * alpha);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = rgba(NODE);
  circle(x, y, r);
  ctx.fill();
  const body = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r * 0.8);
  body.addColorStop(0, rgba(mix(color, HOT, 0.55), 0.95 * Math.pow(act, 0.6)));
  body.addColorStop(1, rgba(color, 0.9 * Math.pow(act, 0.6)));
  ctx.fillStyle = body;
  circle(x, y, r * 0.8);
  ctx.fill();
  ctx.fillStyle = rgba(HOT, 0.9 * act);
  circle(x, y, r * 0.3);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(mix(LINE, color, clamp(act * 1.4)));
  circle(x, y, r);
  ctx.stroke();
  ctx.restore();
}

// Expanding rings, the loop's signature: activity echoing outward.
function ripples(x, y, r, t, strength, color = WARM, rate = 0.8, count = 2) {
  if (strength <= 0.01) return;
  for (let i = 0; i < count; i++) {
    const p = (t * rate + i / count) % 1;
    ctx.strokeStyle = rgba(color, (1 - p) * 0.45 * strength);
    ctx.lineWidth = 2;
    circle(x, y, r * (1 + p * 0.9));
    ctx.stroke();
  }
}

// The Loop Theorist's emblem from the app: an orbit that feeds back on itself.
function loopEmblem(x, y, R, t, draw = 1, alpha = 1) {
  if (alpha <= 0.003) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.5 + i / 3) % 1;
    ctx.strokeStyle = rgba(WARM, (1 - p) * 0.5 * draw);
    ctx.lineWidth = R * 0.04;
    circle(x, y, R * (0.3 + p * 0.62));
    ctx.stroke();
  }
  glow(x, y, R * 1.1, WARM, 0.28 * draw);
  if (draw > 0.01) {
    const start = -Math.PI / 2 + t * 0.6;
    const end = start + (300 / 360) * TAU * draw;
    ctx.strokeStyle = rgba(WARM);
    ctx.lineWidth = R * 0.14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(x, y, R, start, end);
    ctx.stroke();
    // Arrowhead at the leading end, pointing the way the orbit travels.
    const px = x + R * Math.cos(end);
    const py = y + R * Math.sin(end);
    const tx = -Math.sin(end);
    const ty = Math.cos(end);
    const nx = Math.cos(end);
    const ny = Math.sin(end);
    const s = R * Math.min(1, draw * 4);
    ctx.fillStyle = rgba(WARM);
    ctx.beginPath();
    ctx.moveTo(px + tx * s * 0.22, py + ty * s * 0.22);
    ctx.lineTo(px - tx * s * 0.1 + nx * s * 0.2, py - ty * s * 0.1 + ny * s * 0.2);
    ctx.lineTo(px - tx * s * 0.1 - nx * s * 0.2, py - ty * s * 0.1 - ny * s * 0.2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = rgba(WARM);
  circle(x, y, R * 0.22 * draw * (1 + 0.05 * Math.sin(t * 4)));
  ctx.fill();
  ctx.restore();
}

function drawApple(x, y, s, alpha = 1) {
  if (alpha <= 0.003) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = rgba([120, 90, 60]);
  ctx.lineWidth = 0.07;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -0.38);
  ctx.quadraticCurveTo(0.02, -0.6, 0.1, -0.72);
  ctx.stroke();
  ctx.fillStyle = rgba(LEAF);
  ctx.beginPath();
  ctx.ellipse(0.24, -0.6, 0.2, 0.09, -0.5, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(-0.25, -0.2, 0.05, 0, 0.05, 0.85);
  g.addColorStop(0, rgba(mix(APPLE, HOT, 0.35)));
  g.addColorStop(0.55, rgba(APPLE));
  g.addColorStop(1, rgba(mix(APPLE, [60, 20, 20], 0.5)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -0.36);
  ctx.bezierCurveTo(0.25, -0.62, 0.8, -0.5, 0.76, 0.04);
  ctx.bezierCurveTo(0.72, 0.52, 0.36, 0.82, 0.13, 0.74);
  ctx.bezierCurveTo(0.05, 0.71, -0.05, 0.71, -0.13, 0.74);
  ctx.bezierCurveTo(-0.36, 0.82, -0.72, 0.52, -0.76, 0.04);
  ctx.bezierCurveTo(-0.8, -0.5, -0.25, -0.62, 0, -0.36);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  ctx.beginPath();
  ctx.ellipse(-0.36, -0.14, 0.1, 0.2, 0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// An eye that can close: open = 1 is wide open, 0 is shut.
function drawEye(x, y, s, open, color, alpha = 1) {
  if (alpha <= 0.003) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.strokeStyle = rgba(color);
  ctx.lineWidth = s * 0.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const lid = lerp(s * 0.94, -s * 0.94, open);
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.quadraticCurveTo(0, lid, s, 0);
  ctx.quadraticCurveTo(0, s * 0.94, -s, 0);
  ctx.save();
  ctx.clip();
  if (open > 0.05) {
    ctx.fillStyle = rgba(color);
    circle(0, 0, s * 0.36);
    ctx.fill();
    ctx.fillStyle = rgba(NODE);
    circle(0, 0, s * 0.15);
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.quadraticCurveTo(0, lid, s, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.quadraticCurveTo(0, s * 0.94, s, 0);
  ctx.stroke();
  const lashes = smooth(seg(1 - open, 0.7, 1));
  if (lashes > 0) {
    // Lashes on a closed eye.
    ctx.globalAlpha *= lashes;
    for (const dx of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(dx * s, s * 0.47);
      ctx.lineTo(dx * s * 1.3, s * 0.8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Line icons for the brain's specialists.
function drawIcon(name, x, y, s, color, alpha = 1) {
  if (alpha <= 0.003) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.strokeStyle = rgba(color);
  ctx.fillStyle = rgba(color);
  ctx.lineWidth = Math.max(2, s * 0.13);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (name) {
    case "eye":
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(0, -s * 0.95, s, 0);
      ctx.quadraticCurveTo(0, s * 0.95, -s, 0);
      ctx.stroke();
      circle(0, 0, s * 0.3);
      ctx.fill();
      break;
    case "ear":
      circle(-s * 0.55, 0, s * 0.14);
      ctx.fill();
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(-s * 0.55, 0, s * 0.42 * i, -0.85, 0.85);
        ctx.stroke();
      }
      break;
    case "speech":
      roundRect(-s, -s * 0.75, s * 2, s * 1.25, s * 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.5);
      ctx.lineTo(-s * 0.62, s * 0.95);
      ctx.lineTo(-s * 0.1, s * 0.5);
      ctx.stroke();
      for (const dx of [-0.45, 0, 0.45]) {
        circle(dx * s, -s * 0.12, s * 0.1);
        ctx.fill();
      }
      break;
    case "flag":
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, s * 0.95);
      ctx.lineTo(-s * 0.6, -s * 0.95);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, -s * 0.95);
      ctx.lineTo(s * 0.85, -s * 0.5);
      ctx.lineTo(-s * 0.6, -s * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    case "move":
      for (const dx of [-0.45, 0.35]) {
        ctx.beginPath();
        ctx.moveTo((dx - 0.3) * s, -s * 0.65);
        ctx.lineTo((dx + 0.25) * s, 0);
        ctx.lineTo((dx - 0.3) * s, s * 0.65);
        ctx.stroke();
      }
      break;
    case "heart":
      ctx.beginPath();
      ctx.moveTo(0, s * 0.85);
      ctx.bezierCurveTo(-s * 1.3, 0, -s * 0.7, -s * 1.05, 0, -s * 0.4);
      ctx.bezierCurveTo(s * 0.7, -s * 1.05, s * 1.3, 0, 0, s * 0.85);
      ctx.fill();
      break;
    case "memory": {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.85, -Math.PI * 0.9, Math.PI * 0.75);
      ctx.stroke();
      const a = -Math.PI * 0.9;
      const px = s * 0.85 * Math.cos(a);
      const py = s * 0.85 * Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(px - s * 0.3, py - s * 0.05);
      ctx.lineTo(px + s * 0.05, py + s * 0.35);
      ctx.lineTo(px + s * 0.25, py - s * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.45);
      ctx.lineTo(0, 0);
      ctx.lineTo(s * 0.35, s * 0.25);
      ctx.stroke();
      break;
    }
    case "burst":
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const r0 = s * (i % 2 ? 0.5 : 0.42);
        const r1 = s * (i % 2 ? 0.8 : 1.05);
        ctx.beginPath();
        ctx.moveTo(r0 * Math.cos(a), r0 * Math.sin(a));
        ctx.lineTo(r1 * Math.cos(a), r1 * Math.sin(a));
        ctx.stroke();
      }
      circle(0, 0, s * 0.26);
      ctx.fill();
      break;
  }
  ctx.restore();
}

// ------------------------------------------------------------- background

const DUST = (() => {
  const r = rng(7);
  return Array.from({ length: 90 }, () => ({ x: r() * W, y: r() * H, s: 0.6 + r() * 1.7, v: 3 + r() * 9, p: r() * TAU, a: 0.04 + r() * 0.1 }));
})();

// How warm the whole scene glows: it tracks how much looping is going on.
function warmth(t) {
  return keys(t, [
    [0, 0], [2, 0.35], [5, 0.35], [6.2, 0.04], [E.loopStart, 0.04], [E.loopStart + 3, 0.6],
    [37.6, 0.6], [40.2, 0.12], [E.ignition - 0.05, 0.2], [E.ignition + 0.2, 1],
    [58, 0.75], [E.calm + 1.5, 0.45], [E.split[0], 0.45], [E.split[1], 0.3],
    [E.outro, 0.3], [E.finale + 1, 0.5], [DURATION, 0.3],
  ]);
}

function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1b2437");
  g.addColorStop(0.55, "#131a28");
  g.addColorStop(1, "#0c111b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const top = ctx.createRadialGradient(W / 2, -220, 0, W / 2, -220, 1150);
  top.addColorStop(0, "rgba(120, 150, 210, 0.13)");
  top.addColorStop(1, "rgba(120, 150, 210, 0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H);
  glow(W / 2, 500, 1000, [240, 140, 70], 0.12 * warmth(t));

  ctx.strokeStyle = "rgba(180, 200, 240, 0.03)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 30; x < W; x += 60) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 30; y < H; y += 60) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  for (const d of DUST) {
    const y = (((d.y - t * d.v) % H) + H) % H;
    const x = d.x + Math.sin(t * 0.3 + d.p) * 12;
    ctx.fillStyle = rgba(INK, d.a * (0.6 + 0.4 * Math.sin(t * 0.8 + d.p)));
    circle(x, y, d.s);
    ctx.fill();
  }
}

function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.4, W / 2, H * 0.48, H * 1.05);
  g.addColorStop(0, "rgba(0, 0, 0, 0)");
  g.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// --------------------------------------------------------- captions, titles

function drawCaptions(t) {
  let band = 0;
  for (const [a, b] of CAPTIONS) band = Math.max(band, span(t, a - 0.3, b + 0.3, 0.6, 0.6));
  if (band > 0) {
    const g = ctx.createLinearGradient(0, 830, 0, H);
    g.addColorStop(0, "rgba(8, 11, 18, 0)");
    g.addColorStop(0.45, rgba([8, 11, 18], 0.62 * band));
    g.addColorStop(1, rgba([8, 11, 18], 0.78 * band));
    ctx.fillStyle = g;
    ctx.fillRect(0, 830, W, H - 830);
  }
  for (const [a, b, str] of CAPTIONS) {
    const k = span(t, a, b, 0.45, 0.4);
    if (k <= 0) continue;
    const rise = (1 - easeOut(seg(t, a, a + 0.6))) * 16;
    setFont(46, 400);
    const lines = balancedWrap(str, 1400);
    const lh = 62;
    const y0 = 978 - ((lines.length - 1) * lh) / 2 + rise;
    lines.forEach((line, i) => text(line, W / 2, y0 + i * lh, { size: 46, alpha: k }));
  }
}

// Section headings echo the bold, highlighted phrases in the app's answers.
function drawHeadings(t) {
  for (const [a, b, kicker, title] of HEADINGS) {
    const k = span(t, a, b, 0.6, 0.5);
    if (k <= 0) continue;
    const x = 110;
    const y = 158;
    const slide = (1 - easeOut(seg(t, a, a + 0.7))) * -24;
    text(kicker.toUpperCase(), x + slide, y - 68, { size: 22, weight: 700, color: WARM, alpha: k, align: "left", spacing: 4 });
    setFont(56, 700, FONT_DISPLAY);
    const w = ctx.measureText(title).width;
    const bar = easeInOut(seg(t, a + 0.35, a + 1.15));
    ctx.fillStyle = rgba(HIGHLIGHT, 0.85 * k);
    roundRect(x - 6 + slide, y - 22, (w + 12) * bar, 26, 4);
    ctx.fill();
    text(title, x + slide, y, { size: 56, weight: 700, font: FONT_DISPLAY, alpha: k, align: "left" });
  }
}

// ------------------------------------------------------------------ title

function sceneTitle(t) {
  const a = 1 - smooth(seg(t, 4.8, 5.7));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const rise = (k) => (1 - easeOut(k)) * 18;
  loopEmblem(W / 2, 355, 118, t, easeInOut(seg(t, 0.2, 1.8)));
  const k1 = seg(t, 0.8, 1.5);
  const k2 = seg(t, 1.0, 1.8);
  const k3 = seg(t, 1.6, 2.4);
  text("THREE THEORISTS  ·  THE LOOP THEORIST", W / 2, 590 + rise(k1), { size: 24, weight: 700, color: WARM, alpha: smooth(k1), spacing: 5 });
  text("Sustained Recurrent Dynamics", W / 2, 690 + rise(k2), { size: 92, weight: 700, font: FONT_DISPLAY, alpha: smooth(k2) });
  text("Awareness is an echo that keeps going.", W / 2, 772 + rise(k3), { size: 42, italic: true, color: MUTED, alpha: smooth(k3) });
  ctx.restore();
}

// --------------------------------------------------- the clap and the echo

function sceneEcho(t) {
  const a = smooth(seg(t, 5.3, 6.1)) * (1 - smooth(seg(t, 15.3, 16.2)));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  echoPanel(t, 500, "Open field", "One clap, then silence", E.clapField, false);
  echoPanel(t, 1420, "Stairwell", "The sound keeps bouncing around", E.clapStairwell, true);
  ctx.restore();
}

function echoPanel(t, cx, title, note, clapAt, stairwell) {
  const cy = 430;
  const pw = 760;
  const ph = 440;
  const x0 = cx - pw / 2;
  const y0 = cy - ph / 2;
  const dt = t - clapAt;
  text(title, cx, y0 - 58, { size: 44, weight: 700, font: FONT_DISPLAY });
  text(note, cx, y0 - 18, { size: 26, color: WARM, alpha: smooth(seg(t, clapAt + 0.5, clapAt + 1.2)) });

  ctx.fillStyle = rgba(PANEL, 0.75);
  roundRect(x0, y0, pw, ph, 22);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(LINE);
  ctx.stroke();

  ctx.save();
  roundRect(x0, y0, pw, ph, 22);
  ctx.clip();
  const box = { ax: cx - 200, bx: cx + 200, ay: cy - 185, by: cy + 185 };
  const src = stairwell ? [cx - 80, cy + 40] : [cx, cy + 70];
  if (stairwell) drawStairwell(box);
  else drawField(cx, cy);
  drawClapper(src[0], src[1], dt);
  if (dt > 0) {
    if (stairwell) echoRings(src, box, dt);
    else {
      const r = dt * 440;
      const amp = Math.exp(-dt * 1.4);
      ctx.strokeStyle = rgba(WARM, 0.18 * amp);
      ctx.lineWidth = 18;
      circle(src[0], src[1], r);
      ctx.stroke();
      ctx.strokeStyle = rgba(WARM, 0.9 * amp);
      ctx.lineWidth = 4;
      circle(src[0], src[1], r);
      ctx.stroke();
    }
  }
  ctx.restore();

  loudnessTrace(t, cx, y0 + ph + 92, clapAt, stairwell);
}

function drawField(cx, cy) {
  const ground = cy + 118;
  ctx.fillStyle = "rgba(60, 80, 70, 0.22)";
  ctx.fillRect(cx - 400, ground, 800, 200);
  ctx.strokeStyle = "rgba(150, 190, 165, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 400, ground);
  ctx.lineTo(cx + 400, ground);
  ctx.stroke();
  ctx.strokeStyle = "rgba(150, 190, 165, 0.14)";
  ctx.beginPath();
  ctx.moveTo(cx - 400, ground - 30);
  ctx.bezierCurveTo(cx - 250, ground - 110, cx - 120, ground - 40, cx + 20, ground - 70);
  ctx.bezierCurveTo(cx + 160, ground - 100, cx + 280, ground - 20, cx + 400, ground - 60);
  ctx.stroke();
  for (const [tx, size] of [[cx - 270, 1], [cx + 250, 0.8]]) {
    const base = ground - 4;
    ctx.strokeStyle = "rgba(150, 190, 165, 0.28)";
    ctx.lineWidth = 5 * size;
    ctx.beginPath();
    ctx.moveTo(tx, base);
    ctx.lineTo(tx, base - 60 * size);
    ctx.stroke();
    ctx.fillStyle = "rgba(150, 190, 165, 0.16)";
    ctx.beginPath();
    for (const [dx, dy, r] of [[0, -88, 42], [-26, -66, 28], [26, -68, 30]]) {
      ctx.moveTo(tx + (dx + r) * size, base + dy * size);
      ctx.arc(tx + dx * size, base + dy * size, r * size, 0, TAU);
    }
    ctx.fill();
  }
}

function drawStairwell(box) {
  ctx.strokeStyle = rgba(MUTED, 0.2);
  ctx.lineWidth = 2;
  const steps = 8;
  const w = (box.bx - box.ax) / steps;
  const h = (box.by - box.ay) / steps;
  ctx.beginPath();
  ctx.moveTo(box.ax, box.by);
  for (let i = 0; i < steps; i++) {
    ctx.lineTo(box.ax + i * w, box.by - (i + 1) * h);
    ctx.lineTo(box.ax + (i + 1) * w, box.by - (i + 1) * h);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(box.ax + 10, box.by - h - 60);
  ctx.lineTo(box.bx - 10, box.ay - 60 + h);
  ctx.stroke();
  ctx.strokeStyle = rgba(MUTED, 0.75);
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(box.ax, box.ay - 40);
  ctx.lineTo(box.ax, box.by + 40);
  ctx.moveTo(box.bx, box.ay - 40);
  ctx.lineTo(box.bx, box.by + 40);
  ctx.moveTo(box.ax, box.by);
  ctx.lineTo(box.bx, box.by);
  ctx.moveTo(box.ax, box.ay);
  ctx.lineTo(box.bx, box.ay);
  ctx.stroke();
}

// A small figure, facing us, who claps once.
function drawClapper(x, y, dt) {
  ctx.save();
  ctx.strokeStyle = rgba(INK, 0.85);
  ctx.fillStyle = rgba(INK, 0.85);
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  circle(x, y - 50, 11);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - 36);
  ctx.lineTo(x, y + 6);
  ctx.moveTo(x - 11, y + 36);
  ctx.lineTo(x, y + 6);
  ctx.lineTo(x + 11, y + 36);
  ctx.stroke();
  // Hands swing apart, then meet in front of the chest.
  const open = dt < -0.3 ? 1 : dt < 0 ? -dt / 0.3 : Math.min(1, dt * 2);
  const spread = 3 + 19 * open;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y - 30);
    ctx.lineTo(x + side * (10 + spread * 0.6), y - 14);
    ctx.lineTo(x + side * spread, y - 30);
    ctx.stroke();
  }
  if (dt > 0 && dt < 0.45) {
    const k = dt / 0.45;
    ctx.strokeStyle = rgba(HOT, 1 - k);
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i - 3.5) * 0.42;
      const r0 = 12 + 14 * k;
      const r1 = 22 + 20 * k;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y - 32 + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, y - 32 + Math.sin(a) * r1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Echoes in a box are rings from mirror-image copies of the clap, one copy
// per bounce off the walls, each a little fainter.
function echoRings(src, box, dt) {
  const r = dt * 360;
  const env = Math.exp(-dt / 3.4);
  const lx = box.bx - box.ax;
  const ly = box.by - box.ay;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.ax, box.ay, lx, ly);
  ctx.clip();
  glow((box.ax + box.bx) / 2, (box.ay + box.by) / 2, 330, WARM, 0.22 * env * smooth(clamp(dt * 3)));
  for (let i = -4; i <= 4; i++) {
    for (const fx of [0, 1]) {
      const ix = fx ? 2 * box.ax - src[0] + 2 * i * lx : src[0] + 2 * i * lx;
      const ox = fx ? Math.abs(2 * i - 1) : Math.abs(2 * i);
      for (let j = -4; j <= 4; j++) {
        for (const fy of [0, 1]) {
          const iy = fy ? 2 * box.ay - src[1] + 2 * j * ly : src[1] + 2 * j * ly;
          const oy = fy ? Math.abs(2 * j - 1) : Math.abs(2 * j);
          const amp = env * Math.pow(0.8, ox + oy);
          if (amp < 0.03) continue;
          const near = Math.hypot(Math.max(box.ax - ix, 0, ix - box.bx), Math.max(box.ay - iy, 0, iy - box.by));
          const far = Math.hypot(Math.max(Math.abs(ix - box.ax), Math.abs(ix - box.bx)), Math.max(Math.abs(iy - box.ay), Math.abs(iy - box.by)));
          if (r < near || r > far) continue;
          ctx.strokeStyle = rgba(WARM, 0.9 * amp);
          ctx.lineWidth = 3;
          circle(ix, iy, r);
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}

function loudnessTrace(t, cx, y, clapAt, echo) {
  const w = 700;
  const h = 40;
  const x0 = cx - w / 2;
  text("How long you hear it", x0, y - h - 16, { size: 22, color: MUTED, align: "left" });
  ctx.strokeStyle = rgba(LINE);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + w, y);
  ctx.stroke();
  const window = 5;
  const lead = 0.3;
  const shown = t - (clapAt - lead);
  if (shown <= 0) return;
  ctx.fillStyle = rgba(WARM, 0.9);
  for (let px = 0; px < w; px += 4) {
    const tau = (px / w) * window;
    if (tau > shown) break;
    const d = tau - lead;
    if (d < 0) continue;
    const spike = Math.exp(-d * 16);
    const tail = echo ? 0.8 * Math.exp(-d / 1.7) * (0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.cos((d * TAU) / 0.26), 2)) : 0;
    const env = Math.max(spike, tail);
    const a = h * env * (0.55 + 0.45 * Math.abs(Math.sin(d * 53 + Math.sin(d * 17))));
    if (a > 0.5) ctx.fillRect(x0 + px, y - a, 3, a * 2);
  }
}

// ------------------------------------------------------ 1. sustained loops

const CHAIN_Y = 470;
const CHAIN_X = [600, 840, 1080, 1320];
const EYE_AT = [360, CHAIN_Y];
const APPLE_AT = [175, CHAIN_Y];
const FRAME = { x: 1510, y: 320, w: 300, h: 300 };
const forward = straight(EYE_AT, [CHAIN_X[3], CHAIN_Y]);
const nodeU = (x) => (x - EYE_AT[0]) / (CHAIN_X[3] - EYE_AT[0]);
const backArcs = [
  curve([CHAIN_X[1], CHAIN_Y], [(CHAIN_X[0] + CHAIN_X[1]) / 2, CHAIN_Y - 170], [CHAIN_X[0], CHAIN_Y]),
  curve([CHAIN_X[2], CHAIN_Y], [(CHAIN_X[1] + CHAIN_X[2]) / 2, CHAIN_Y - 170], [CHAIN_X[1], CHAIN_Y]),
  curve([CHAIN_X[3], CHAIN_Y], [(CHAIN_X[2] + CHAIN_X[3]) / 2, CHAIN_Y - 170], [CHAIN_X[2], CHAIN_Y]),
];
const bigArc = curve([CHAIN_X[3], CHAIN_Y], [(CHAIN_X[0] + CHAIN_X[3]) / 2, CHAIN_Y - 440], [CHAIN_X[0], CHAIN_Y]);

function coolAt(x, t) {
  let v = 0;
  for (const s of E.sweeps) {
    const d = t - (s + nodeU(x) * E.sweepTime);
    v += d >= 0 ? Math.exp(-d * 2.4) : Math.exp(d * 30);
  }
  return clamp(v);
}

const loopLevel = (t) => smooth(seg(t, E.loopStart, E.loopStart + 2.2));

// Where the main reverberating pulse is: up the chain, then back down the big arc.
function loopPulse(t) {
  const phase = (((t - E.loopStart) / E.loopPeriod) % 1 + 1) % 1;
  if (phase < 0.5) {
    const u = phase / 0.5;
    return { path: straight([CHAIN_X[0], CHAIN_Y], [CHAIN_X[3], CHAIN_Y]), u, point: [lerp(CHAIN_X[0], CHAIN_X[3], u), CHAIN_Y] };
  }
  const u = (phase - 0.5) / 0.5;
  return { path: bigArc, u, point: bigArc(u) };
}

// Warm activity in chain node i. The ring of specialists picks this up when the
// chain opens out, so the hand-off is seamless.
function chainWarm(i, t) {
  const level = loopLevel(t);
  if (level <= 0) return 0;
  const p = loopPulse(t).point;
  const near = Math.exp(-((p[0] - CHAIN_X[i]) ** 2 + (p[1] - CHAIN_Y) ** 2) / (2 * 80 * 80));
  return level * (0.5 + 0.12 * Math.sin(t * 3.1 - i * 0.9) + 0.38 * near);
}

function sceneLoops(t) {
  const a = smooth(seg(t, 15.6, 16.6));
  const out = 1 - smooth(seg(t, 37.4, 38.3));
  if (a <= 0 || t > 38.4) return;
  const level = loopLevel(t);
  ctx.save();
  ctx.globalAlpha = a * out;

  // The apple, and light travelling from it to the eye.
  drawApple(APPLE_AT[0], APPLE_AT[1] - 6, 58);
  ctx.save();
  ctx.setLineDash([10, 12]);
  ctx.lineDashOffset = -t * 50;
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(INK, 0.3);
  for (const dy of [-26, 0, 26]) {
    ctx.beginPath();
    ctx.moveTo(APPLE_AT[0] + 50, APPLE_AT[1] + dy);
    ctx.lineTo(EYE_AT[0] - 52, EYE_AT[1] + dy * 0.3);
    ctx.stroke();
  }
  ctx.restore();

  // Forward wiring along the chain.
  const wireColor = mix(COOL, WARM, level);
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(mix(LINE, wireColor, 0.25 + 0.5 * Math.max(level, 0.3)));
  ctx.beginPath();
  ctx.moveTo(EYE_AT[0] + 48, CHAIN_Y);
  ctx.lineTo(CHAIN_X[3], CHAIN_Y);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const x0 = i === 0 ? EYE_AT[0] : CHAIN_X[i - 1];
    arrowOn(straight([x0, CHAIN_Y], [CHAIN_X[i], CHAIN_Y]), 0.55, 9, mix(COOL, WARM, level), 0.8);
  }

  // Feedback arcs draw themselves in once the loop starts.
  [...backArcs, bigArc].forEach((arc, i) => {
    const grow = easeInOut(seg(t, E.loopStart + i * 0.25, E.loopStart + 0.8 + i * 0.25));
    if (grow <= 0) return;
    ctx.lineWidth = i === 3 ? 4 : 3;
    ctx.strokeStyle = rgba(WARM, 0.55);
    strokeAlong(arc, 0, grow);
    if (grow > 0.6) arrowOn(arc, 0.5, 10, WARM, smooth(seg(grow, 0.6, 1)));
  });

  // Small particles circulating forward and back.
  if (level > 0) {
    for (let i = 0; i < 3; i++) {
      const fwd = straight([CHAIN_X[i], CHAIN_Y], [CHAIN_X[i + 1], CHAIN_Y]);
      for (let k = 0; k < 2; k++) {
        const u = (t * 0.9 + k / 2 + i * 0.13) % 1;
        comet(fwd, u, WARM, level * 0.55 * Math.sin(u * Math.PI), 4.5, 0.12);
        const v = (t * 0.9 + k / 2 + i * 0.29) % 1;
        comet(backArcs[i], v, WARM, level * 0.55 * Math.sin(v * Math.PI), 4.5, 0.12);
      }
    }
    const p = loopPulse(t);
    comet(p.path, p.u, WARM, level, 10, 0.16);
  }

  // The one-way sweeps.
  for (const s of E.sweeps) {
    const u = (t - s) / E.sweepTime;
    if (u > -0.05 && u < 1.15) comet(forward, clamp(u), COOL, 1 - smooth(seg(u, 1, 1.15)), 11, 0.2);
  }

  // Eye and nodes.
  drawIcon("eye", EYE_AT[0], EYE_AT[1], 40, INK, 0.9);
  glow(EYE_AT[0], EYE_AT[1], 110, COOL, 0.4 * coolAt(EYE_AT[0], t));
  CHAIN_X.forEach((x, i) => {
    drawNode(x, CHAIN_Y, 44, coolAt(x, t), chainWarm(i, t));
    ripples(x, CHAIN_Y, 44, t + i * 0.3, level, WARM, 0.7);
  });

  // Labels.
  text("Apple", APPLE_AT[0], CHAIN_Y + 92, { size: 24, color: MUTED });
  text("Eye", EYE_AT[0], CHAIN_Y + 92, { size: 24, color: MUTED });
  text("Early regions", CHAIN_X[0], CHAIN_Y + 92, { size: 24, color: MUTED });
  text("Higher regions", CHAIN_X[3], CHAIN_Y + 92, { size: 24, color: MUTED });
  const oneWay = span(t, 17.0, 26.6, 0.6, 0.6);
  if (oneWay > 0) {
    ctx.save();
    ctx.globalAlpha *= oneWay;
    ctx.strokeStyle = rgba(COOL, 0.8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(CHAIN_X[0], CHAIN_Y + 140);
    ctx.lineTo(CHAIN_X[3] - 12, CHAIN_Y + 140);
    ctx.stroke();
    arrowOn(straight([CHAIN_X[0], CHAIN_Y + 140], [CHAIN_X[3], CHAIN_Y + 140]), 0.985, 12, COOL, 0.9);
    ctx.restore();
    text("One way: from the senses up", (CHAIN_X[0] + CHAIN_X[3]) / 2, CHAIN_Y + 185, { size: 28, color: COOL, alpha: oneWay });
  }
  text("…and back down, over and over", (CHAIN_X[0] + CHAIN_X[3]) / 2, CHAIN_Y - 250, { size: 28, color: WARM, alpha: span(t, E.loopStart + 1.2, 37.6, 0.8, 0.5) });

  // The sweep recognizes the apple, without anyone seeing it.
  const tag = span(t, E.sweeps[1] + E.sweepTime, E.loopStart - 0.2, 0.4, 0.5);
  if (tag > 0) {
    const tx = CHAIN_X[3];
    const ty = CHAIN_Y - 96;
    ctx.fillStyle = rgba(PANEL, 0.9 * tag);
    roundRect(tx - 76, ty - 26, 152, 46, 23);
    ctx.fill();
    ctx.strokeStyle = rgba(COOL, 0.7 * tag);
    ctx.lineWidth = 2;
    ctx.stroke();
    text("“apple”", tx, ty + 7, { size: 24, weight: 600, color: COOL, alpha: tag });
  }

  experienceFrame(t);
  ctx.restore();
}

function experienceFrame(t) {
  const { x, y, w, h } = FRAME;
  const seen = smooth(seg(t, E.loopStart + 1.4, E.loopStart + 3.4));
  text("What you experience", x + w / 2, y - 22, { size: 24, color: MUTED });
  ctx.fillStyle = "rgba(9, 13, 21, 0.85)";
  roundRect(x, y, w, h, 20);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(mix(LINE, WARM, seen * 0.8));
  ctx.stroke();
  text("nothing yet", x + w / 2, y + h / 2 + 10, { size: 30, italic: true, color: MUTED, alpha: (1 - smooth(seg(seen, 0, 0.35))) * 0.85 });
  if (seen > 0) {
    ctx.save();
    roundRect(x, y, w, h, 20);
    ctx.clip();
    glow(x + w / 2, y + h / 2 - 12, 190, WARM, 0.4 * seen);
    ctx.restore();
    drawApple(x + w / 2, y + h / 2 - 16, 84 * (0.8 + 0.2 * easeOutBack(seen)), seen);
    text("Now you see it", x + w / 2, y + h - 28, { size: 26, weight: 600, color: WARM, alpha: seen });
  }
}

// ------------------------------------- 2. ignition, and 3. the ongoing hum

// Labels sit outside the ring, clear of the broadcast lines.
const MODULES = [
  { name: "Vision", icon: "eye", side: "right" },
  { name: "Hearing", icon: "ear", side: "right" },
  { name: "Language", icon: "speech", side: "right" },
  { name: "Planning", icon: "flag", side: "below" },
  { name: "Movement", icon: "move", side: "below" },
  { name: "Feelings", icon: "heart", side: "left" },
  { name: "Memory", icon: "memory", side: "left" },
];
const HEARING = 1;

// The ring of specialists sits centre-left, then shrinks aside for the comparison.
function ringFrame(t) {
  const s = easeInOut(seg(t, E.split[0], E.split[1]));
  return { cx: lerp(820, 500, s), cy: lerp(510, 490, s), scale: lerp(1, 0.6, s), split: s };
}

function ringPoint(k, f) {
  const a = -Math.PI / 2 + (k * TAU) / MODULES.length;
  return [f.cx + f.scale * 390 * Math.cos(a), f.cy + f.scale * 265 * Math.sin(a)];
}

const WHISPERS = [
  { text: "…more chips?…", dx: -150, dy: -95 },
  { text: "…so anyway…", dx: 150, dy: -112 },
  { text: "…your name…", dx: 0, dy: 10, winner: true },
  { text: "…traffic was awful…", dx: -140, dy: 105 },
  { text: "…did you see that?…", dx: 165, dy: 92 },
];

const inputOn = (t) => 1 - smooth(seg(t, E.inputCut - 0.1, E.inputCut + 0.4));

function barValue(i, t) {
  const idle = 0.2 + 0.17 * noise(t * 1.7, i * 3 + 1);
  if (!WHISPERS[i].winner) return lerp(idle, 0.05 + 0.03 * noise(t, i), smooth(seg(t, E.ignition, E.ignition + 0.8)));
  if (t < E.ignition) return lerp(idle, 0.62, Math.pow(seg(t, E.ramp, E.ignition), 2.2));
  return lerp(0.62, 0.93 + 0.03 * Math.sin(t * 4), easeOut(seg(t, E.ignition, E.ignition + 0.2)));
}

function moduleState(k, t) {
  let cool = 0;
  let warm = 0;
  if (k < 4) warm += (1 - smooth(seg(t, E.morph[0], E.morph[1]))) * chainWarm(k, t);
  // Busy but unconscious processing, before anything wins.
  const busy = smooth(seg(t, E.morph[0] + 0.8, E.morph[1] + 0.6)) * (1 - smooth(seg(t, E.ignition, E.ignition + 0.8)));
  cool += busy * (0.14 + 0.16 * noise(t * 2.4, k + 1));
  if (k === HEARING) cool += busy * 0.25 * smooth(seg(t, E.whispers, E.whispers + 1));
  // Ignition: every specialist lights up at once and stays lit.
  const d = t - E.ignition - 0.28;
  if (d >= 0) {
    const sustain = 1 - smooth(seg(t, E.calm, E.calm + 1.6));
    const beat = Math.exp(-(((t - E.ignition) / 0.9) % 1) * 4);
    warm += sustain * (0.62 + 0.25 * Math.exp(-d * 2.2) + 0.14 * beat);
  }
  // The hum: a slow wave of activity rolling round the ring, plus chatter.
  const hum = smooth(seg(t, E.calm, E.calm + 1.6));
  if (hum > 0) {
    warm += hum * (0.2 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.7 - (k * TAU) / 7)));
    for (const p of HUM_PULSES) {
      const arrive = t - (p.ts + p.dur);
      if (p.b === k && arrive > 0 && arrive < 1.2) warm += hum * 0.3 * Math.exp(-arrive * 3.5);
    }
    for (const [at, m] of HUM_HIGHLIGHTS) if (m === k && t > at) warm += 0.45 * Math.exp(-(t - at) * 0.9) * smooth(seg(t, at, at + 0.25));
    if (k === 0) cool += hum * 0.35 * inputOn(t) * (0.7 + 0.3 * Math.sin(t * 9));
  }
  return [cool, warm];
}

function bubble(x, y, str, scale, alpha, color, border) {
  if (alpha <= 0.003) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  setFont(24, 600);
  const w = ctx.measureText(str).width + 40;
  const h = 48;
  ctx.fillStyle = rgba(PANEL, 0.88 * alpha);
  roundRect(-w / 2, -h / 2, w, h, 24);
  ctx.fill();
  ctx.strokeStyle = rgba(border, 0.7 * alpha);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = rgba(PANEL, 0.88 * alpha);
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 20, h / 2 - 1);
  ctx.lineTo(-w / 2 + 12, h / 2 + 13);
  ctx.lineTo(-w / 2 + 36, h / 2 - 1);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  text(str, 0, 8, { size: 24, weight: 600, color, alpha });
  ctx.restore();
}

function sceneNetwork(t) {
  if (t < E.morph[0] || t > E.outro + 1) return;
  const out = 1 - smooth(seg(t, E.outro - 0.4, E.outro + 0.6));
  const f = ringFrame(t);
  const m = easeInOut(seg(t, E.morph[0], E.morph[1]));
  const r = lerp(44, 54, m) * f.scale;
  const pos = MODULES.map((_, k) => {
    const [x, y] = ringPoint(k, f);
    return k < 4 ? [lerp(CHAIN_X[k], x, m), lerp(CHAIN_Y, y, m)] : [x, y];
  });
  const shown = MODULES.map((_, k) => (k < 4 ? 1 : smooth(seg(t, E.morph[0] + 0.4 + (k - 4) * 0.2, E.morph[0] + 1.4 + (k - 4) * 0.2))));
  const states = MODULES.map((_, k) => moduleState(k, t));
  const ign = t >= E.ignition ? 1 - smooth(seg(t, E.calm, E.calm + 1.6)) : 0;
  const hum = smooth(seg(t, E.calm, E.calm + 1.6));
  const hub = [f.cx, f.cy];

  ctx.save();
  ctx.globalAlpha = out;

  // Wiring: neighbours round the ring, and spokes to the shared hub.
  const wired = smooth(seg(t, E.morph[1] - 0.6, E.morph[1] + 0.4));
  ctx.lineWidth = 2;
  for (let k = 0; k < 7; k++) {
    const j = (k + 1) % 7;
    const act = clamp((states[k][1] + states[j][1]) / 2);
    ctx.strokeStyle = rgba(mix(LINE, WARM, act), (0.45 + 0.4 * act) * wired * Math.min(shown[k], shown[j]));
    ctx.beginPath();
    ctx.moveTo(pos[k][0], pos[k][1]);
    ctx.lineTo(pos[j][0], pos[j][1]);
    ctx.stroke();
  }
  const beam = easeOut(seg(t, E.ignition, E.ignition + 0.28));
  for (let k = 0; k < 7; k++) {
    const spoke = straight(hub, pos[k]);
    ctx.save();
    ctx.setLineDash([6, 10]);
    ctx.strokeStyle = rgba(LINE, 0.7 * wired * shown[k] * (1 - beam * ign));
    strokeAlong(spoke, 0.12, 0.85, 2);
    ctx.restore();
    if (beam > 0 && ign > 0) {
      ctx.strokeStyle = rgba(WARM, 0.7 * ign);
      ctx.lineWidth = 5;
      strokeAlong(spoke, 0, beam, 2);
      ctx.strokeStyle = rgba(HOT, 0.8 * ign);
      ctx.lineWidth = 2;
      strokeAlong(spoke, 0, beam, 2);
      // The broadcast keeps going out, to everyone at once.
      const u = (((t - E.ignition) / 0.9) % 1) * 1.1;
      if (t > E.ignition + 0.3) comet(spoke, Math.min(u, 1), HOT, ign * (1 - seg(u, 0.9, 1.1)), 8, 0.15);
    }
    if (hum > 0) {
      ctx.strokeStyle = rgba(WARM, 0.18 * hum * (1 - f.split));
      ctx.lineWidth = 2;
      strokeAlong(spoke, 0.12, 0.85, 2);
    }
  }

  // The hub: the stage where the winner gets broadcast.
  const hubGlow = ign * (0.5 + 0.2 * Math.sin(t * 6)) + hum * 0.2 * (1 - f.split);
  glow(hub[0], hub[1], 160 * f.scale, WARM, hubGlow);
  ctx.strokeStyle = rgba(mix(LINE, WARM, hubGlow), 0.8 * wired);
  ctx.lineWidth = 2;
  circle(hub[0], hub[1], 20 * f.scale);
  ctx.stroke();

  // Chatter between specialists during the hum.
  if (hum > 0) {
    for (const p of HUM_PULSES) {
      const u = (t - p.ts) / p.dur;
      if (u < 0 || u > 1.1) continue;
      const a = pos[p.a];
      const b = pos[p.b];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const path = curve(a, [lerp(mid[0], hub[0], 0.55), lerp(mid[1], hub[1], 0.55)], b);
      comet(path, Math.min(u, 1), WARM, hum * 0.85 * (1 - seg(u, 1, 1.1)), 7 * f.scale + 2, 0.18);
    }
  }

  // Ignition flash and shock wave.
  const d = t - E.ignition;
  if (d >= 0 && d < 3) {
    glow(hub[0], hub[1], 140 + 900 * easeOut(clamp(d / 0.6)), HOT, 0.85 * Math.exp(-d * 2.4));
    const k = clamp(d / 1.1);
    ctx.strokeStyle = rgba(WARM, 0.75 * (1 - k));
    ctx.lineWidth = 2 + 8 * (1 - k);
    circle(hub[0], hub[1], d * 1500);
    ctx.stroke();
  }

  // Specialists.
  MODULES.forEach((mod, k) => {
    const [x, y] = pos[k];
    const [cool, warm] = states[k];
    const rr = r * (k < 4 ? 1 : easeOutBack(shown[k]));
    drawNode(x, y, rr, cool, warm, shown[k]);
    ripples(x, y, rr, t + k * 0.21, clamp(warm - 0.2) * 1.2, WARM, 0.75);
    // Unconscious busywork: small cool dots circling inside.
    const busy = smooth(seg(t, E.morph[1] - 0.4, E.morph[1] + 0.4)) * (1 - smooth(seg(t, E.ignition, E.ignition + 0.6)));
    for (let i = 0; i < 3; i++) {
      const a = t * (1.6 + k * 0.17) + (i * TAU) / 3 + k;
      ctx.fillStyle = rgba(COOL, 0.8 * busy * shown[k]);
      circle(x + Math.cos(a) * rr * 0.66, y + Math.sin(a) * rr * 0.66, 3.5 * f.scale + 1);
      ctx.fill();
    }
    const act = clamp(cool + warm);
    const iconColor = mix(mix(MUTED, INK, act), NODE, clamp(act * 1.2 - 0.25));
    drawIcon(mod.icon, x, y, 20 * f.scale * (rr / (54 * f.scale || 1)), iconColor, smooth(seg(t, E.morph[1] - 0.5, E.morph[1] + 0.3)) * shown[k]);
    const labelAlpha = smooth(seg(t, E.morph[1] - 0.2, E.morph[1] + 0.5)) * shown[k] * (1 - f.split);
    const label = { size: 24, weight: 600, color: mix(MUTED, WARM, clamp(warm)), alpha: labelAlpha };
    if (mod.side === "below") text(mod.name, x, y + rr + 36, label);
    else if (mod.side === "right") text(mod.name, x + rr + 16, y + 8, { ...label, align: "left" });
    else text(mod.name, x - rr - 16, y + 8, { ...label, align: "right" });
  });

  drawWhispers(t, f, pos);
  drawMeters(t);
  drawInput(t, pos);
  drawOnePass(t, f);
  ctx.restore();
}

function drawWhispers(t, f, pos) {
  const vis = span(t, E.whispers, E.calm + 0.6, 0.6, 0.9);
  if (vis <= 0) return;
  const from = pos[HEARING];
  WHISPERS.forEach((w, i) => {
    const arrive = easeInOut(seg(t, E.whispers + i * 0.35, E.whispers + 1.1 + i * 0.35));
    if (arrive <= 0) return;
    let tx = f.cx + w.dx + 9 * Math.sin(t * 0.9 + i * 2);
    let ty = f.cy + w.dy + 7 * Math.cos(t * 1.1 + i);
    let scale = 0.6 + 0.4 * arrive;
    let alpha = 0.55 * arrive;
    let color = MUTED;
    let border = LINE;
    if (w.winner) {
      const grow = smooth(seg(t, E.ramp - 0.6, E.ignition));
      const pop = t > E.ignition ? 0.25 * Math.exp(-(t - E.ignition) * 3) : 0;
      tx = lerp(tx, f.cx, grow);
      ty = lerp(ty, f.cy - 4, grow);
      scale *= 1 + 0.35 * grow + pop;
      alpha = lerp(alpha, 1, grow);
      color = mix(MUTED, HOT, grow);
      border = mix(LINE, WARM, grow);
      if (t > E.ignition) glow(tx, ty, 170, WARM, 0.35 * Math.exp(-(t - E.ignition) * 0.5));
    } else {
      alpha *= 1 - smooth(seg(t, E.ignition, E.ignition + 0.8));
    }
    bubble(lerp(from[0], tx, arrive), lerp(from[1], ty, arrive), w.text, scale, alpha * vis, color, border);
  });
}

// Signal strength for each voice, with the tipping point marked.
function drawMeters(t) {
  const vis = span(t, E.whispers + 0.4, E.calm, 0.7, 0.8);
  if (vis <= 0) return;
  ctx.save();
  ctx.globalAlpha *= vis;
  const x0 = 1530;
  const bw = 34;
  const gap = 20;
  const base = 730;
  const hMax = 380;
  const right = x0 + 5 * bw + 4 * gap;
  text("Signal strength", (x0 + right) / 2, 300, { size: 26, weight: 600, color: MUTED });
  ctx.strokeStyle = rgba(LINE);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0 - 16, base);
  ctx.lineTo(right + 16, base);
  ctx.stroke();
  WHISPERS.forEach((w, i) => {
    const v = barValue(i, t);
    const x = x0 + i * (bw + gap);
    const h = v * hMax;
    const over = w.winner ? smooth(seg(t, E.ignition - 0.05, E.ignition + 0.2)) : 0;
    const color = w.winner ? mix(WARM, HOT, 0.4 * over) : MUTED;
    if (over > 0) glow(x + bw / 2, base - h, 90, WARM, 0.5 * over);
    ctx.fillStyle = rgba(color, w.winner ? 0.95 : 0.45);
    roundRect(x, base - h, bw, h, [8, 8, 0, 0]);
    ctx.fill();
    if (w.winner) text("your name", x + bw / 2, base - h - 18, { size: 22, weight: 600, color: WARM, alpha: smooth(seg(t, E.ramp, E.ramp + 0.8)) });
  });
  const ty = base - 0.62 * hMax;
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0 - 16, ty);
  ctx.lineTo(right + 16, ty);
  ctx.stroke();
  ctx.restore();
  text("tipping point", right + 16, ty - 12, { size: 20, color: INK, alpha: 0.75, align: "right" });
  text("Voices at the party", (x0 + right) / 2, base + 40, { size: 22, color: MUTED });
  ctx.restore();
}

// Input from the eye, which stops when the eyes close.
function drawInput(t, pos) {
  const vis = span(t, E.calm - 0.4, E.split[0] + 0.4, 0.8, 0.8);
  if (vis <= 0) return;
  const open = inputOn(t);
  const eye = [180, 380];
  const path = curve([eye[0] + 55, eye[1] - 20], [420, 170], [pos[0][0] - 50, pos[0][1] + 6]);
  ctx.save();
  ctx.globalAlpha *= vis;
  ctx.setLineDash([4, 10]);
  ctx.strokeStyle = rgba(COOL, 0.15 + 0.3 * open);
  ctx.lineWidth = 2;
  strokeAlong(path);
  ctx.restore();
  for (let i = 0; i < 40; i++) {
    const born = E.calm - 0.4 + i * 0.16;
    if (born > E.inputCut) break;
    const u = (t - born) / 0.9;
    if (u < 0 || u > 1) continue;
    comet(path, u, COOL, vis * 0.9 * Math.sin(u * Math.PI) ** 0.5, 6, 0.12);
  }
  drawEye(eye[0], eye[1], 46, open, INK, vis);
  glow(eye[0], eye[1], 100, COOL, 0.25 * open * vis);
  text("Input from the senses", eye[0], eye[1] + 88, { size: 24, color: COOL, alpha: vis * open });
  text("No input", eye[0], eye[1] + 88, { size: 24, weight: 600, color: MUTED, alpha: vis * (1 - open) });
}

// A single-pass system beside the brain: it responds once, then goes still.
function drawOnePass(t, f) {
  const vis = f.split * (1 - smooth(seg(t, E.outro - 0.4, E.outro + 0.4)));
  if (vis <= 0) return;
  ctx.save();
  ctx.globalAlpha *= vis;
  const xs = [1180, 1340, 1500, 1660];
  const y = 490;
  const r = 34;
  const path = straight([1040, y], [1780, y]);
  const nodeAt = (x) => (x - 1040) / 740;
  text("Your brain", 500, 232, { size: 38, weight: 700, font: FONT_DISPLAY });
  text("keeps humming on its own", 500, 272, { size: 24, color: WARM });
  text("A one-pass system", 1420, 232, { size: 38, weight: 700, font: FONT_DISPLAY });
  text("still between inputs", 1420, 272, { size: 24, color: MUTED });
  ctx.strokeStyle = rgba(LINE);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(1060, y);
  ctx.lineTo(1760, y);
  ctx.stroke();
  for (let i = 0; i <= 4; i++) arrowOn(straight([i ? xs[i - 1] : 1040, y], [i < 4 ? xs[i] : 1780, y]), 0.55, 8, MUTED, 0.6);
  for (const s of E.onePassInputs) {
    const u = (t - s) / 0.9;
    if (u > -0.05 && u < 1.1) comet(path, clamp(u), COOL, 1 - seg(u, 1, 1.1), 9, 0.16);
  }
  xs.forEach((x) => {
    let cool = 0;
    for (const s of E.onePassInputs) {
      const d = t - (s + nodeAt(x) * 0.9);
      if (d >= 0) cool += Math.exp(-d * 3.5);
    }
    drawNode(x, y, r, clamp(cool), 0);
  });

  // Activity traces: the brain never flatlines; the one-pass system does.
  const traceIn = smooth(seg(t, E.split[1] - 0.4, E.split[1] + 0.6));
  const brainWave = (tau) => 0.42 * Math.sin(tau * 6.3) + 0.26 * Math.sin(tau * 11.7 + 1) + 0.32 * (noise(tau * 5, 4) - 0.5) * 2;
  const passWave = (tau) => {
    let v = 0;
    for (const s of E.onePassInputs) {
      const d = tau - (s + 0.45);
      v += Math.exp(-(d * d) / 0.012) - 0.35 * Math.exp(-((d - 0.18) ** 2) / 0.01);
    }
    return v;
  };
  drawTrace(240, 760, 520, t, brainWave, WARM, traceIn);
  drawTrace(1160, 760, 520, t, passWave, COOL, traceIn);
  ctx.restore();
}

function drawTrace(x0, y, w, t, fn, color, alpha) {
  if (alpha <= 0.003) return;
  const h = 40;
  const window = 4;
  text("activity", x0, y - h - 18, { size: 20, color: MUTED, alpha, align: "left" });
  ctx.strokeStyle = rgba(LINE, alpha);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + w, y);
  ctx.stroke();
  ctx.strokeStyle = rgba(color, 0.95 * alpha);
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let px = 0; px <= w; px += 3) {
    const tau = t - (1 - px / w) * window;
    const v = clamp(fn(tau), -1, 1) * h;
    if (px) ctx.lineTo(x0 + px, y - v);
    else ctx.moveTo(x0 + px, y - v);
  }
  ctx.stroke();
  const tip = clamp(fn(t), -1, 1) * h;
  glow(x0 + w, y - tip, 30, color, 0.6 * alpha);
}

// ------------------------------------------------------------------ outro

const RECAP = [
  { icon: "loop", title: "Sustained loops", note: "Activity keeps reverberating" },
  { icon: "burst", title: "Ignition", note: "One signal wins, and is broadcast" },
  { icon: "wave", title: "Ongoing activity", note: "It hums on with no input" },
];

function sceneOutro(t) {
  const out = 1 - smooth(seg(t, E.finale - 0.8, E.finale));
  if (t < E.outro || out <= 0) return;
  ctx.save();
  ctx.globalAlpha = out;
  const xs = [500, 960, 1420];
  const y = 430;
  const R = 104;
  // A thread linking the three ideas, with activity running along it.
  const thread = smooth(seg(t, E.outro + 1.2, E.outro + 2.2));
  if (thread > 0) {
    for (let i = 0; i < 2; i++) {
      const path = straight([xs[i] + R + 12, y], [xs[i + 1] - R - 12, y]);
      ctx.strokeStyle = rgba(WARM, 0.3 * thread);
      ctx.lineWidth = 2;
      strokeAlong(path, 0, 1, 2);
      const u = (t * 0.6 + i * 0.5) % 1;
      comet(path, u, WARM, thread * Math.sin(u * Math.PI), 5, 0.2);
    }
  }
  RECAP.forEach((item, i) => {
    const k = seg(t, E.outro + 0.2 + i * 0.45, E.outro + 1.0 + i * 0.45);
    if (k <= 0) return;
    const a = smooth(k);
    const x = xs[i];
    const lift = (1 - easeOut(k)) * 30;
    ctx.save();
    ctx.globalAlpha *= a;
    glow(x, y + lift, R * 1.8, WARM, 0.18);
    ctx.fillStyle = rgba(PANEL, 0.9);
    circle(x, y + lift, R);
    ctx.fill();
    ctx.strokeStyle = rgba(mix(LINE, WARM, 0.6));
    ctx.lineWidth = 3;
    ctx.stroke();
    if (item.icon === "loop") loopEmblem(x, y + lift, 50, t);
    else if (item.icon === "burst") {
      const beat = Math.exp(-((t % 2) * 3));
      glow(x, y + lift, 90, HOT, 0.5 * beat);
      drawIcon("burst", x, y + lift, 50 * (1 + 0.12 * beat), WARM);
    } else {
      ctx.strokeStyle = rgba(WARM);
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let px = -62; px <= 62; px += 3) {
        const v = 20 * Math.sin(px * 0.09 - t * 4) * Math.cos(px * 0.024);
        if (px === -62) ctx.moveTo(x + px, y + lift + v);
        else ctx.lineTo(x + px, y + lift + v);
      }
      ctx.stroke();
    }
    text(item.title, x, y + R + 76 + lift, { size: 40, weight: 700, font: FONT_DISPLAY });
    text(item.note, x, y + R + 118 + lift, { size: 26, color: MUTED });
    ctx.restore();
  });
  ctx.restore();
}

function sceneFinale(t) {
  if (t < E.finale) return;
  const a = smooth(seg(t, E.finale, E.finale + 0.9));
  ctx.save();
  ctx.globalAlpha = a;
  const rise = (k) => (1 - easeOut(k)) * 18;
  loopEmblem(W / 2, 360, 104, t, easeInOut(seg(t, E.finale + 0.1, E.finale + 1.5)));
  const k1 = seg(t, E.finale + 0.5, E.finale + 1.3);
  const k2 = seg(t, E.finale + 1.0, E.finale + 1.8);
  const k3 = seg(t, E.finale + 1.6, E.finale + 2.4);
  text("Awareness is an echo that keeps going.", W / 2, 610 + rise(k1), { size: 64, weight: 700, font: FONT_DISPLAY, alpha: smooth(k1) });
  text("THE LOOP THEORIST  ·  SUSTAINED RECURRENT DYNAMICS", W / 2, 680 + rise(k2), { size: 22, weight: 700, color: WARM, alpha: smooth(k2), spacing: 5 });
  text("Drawing on the work of Victor Lamme, Bernard Baars and Stanislas Dehaene.", W / 2, 780 + rise(k3), { size: 27, color: MUTED, alpha: smooth(k3) });
  text("One view among several, and still debated.", W / 2, 822 + rise(k3), { size: 27, color: MUTED, alpha: smooth(k3) });
  ctx.restore();
}

// ------------------------------------------------------------------- frame

export function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  drawBackground(t);
  sceneTitle(t);
  sceneEcho(t);
  sceneLoops(t);
  sceneNetwork(t);
  sceneOutro(t);
  sceneFinale(t);
  drawCaptions(t);
  drawHeadings(t);
  drawVignette();
  const black = Math.max(1 - seg(t, 0, 0.8), smooth(seg(t, DURATION - 1.2, DURATION)));
  if (black > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${black})`;
    ctx.fillRect(0, 0, W, H);
  }
}

async function fontsReady() {
  const specs = [
    `700 56px ${FONT_DISPLAY}`,
    `400 46px ${FONT_BODY}`,
    `600 24px ${FONT_BODY}`,
    `700 22px ${FONT_BODY}`,
    `italic 400 42px ${FONT_BODY}`,
  ];
  await Promise.all(specs.map((spec) => document.fonts.load(spec).catch(() => null)));
  await document.fonts.ready;
}

const params = new URLSearchParams(location.search);
window.loopVideo = { duration: DURATION, draw, ready: fontsReady() };

if (!params.has("render")) {
  // Live playback. Space pauses, the arrow keys skip five seconds, ?t= starts part way in.
  let offset = Number(params.get("t")) || 0;
  let origin = null;
  let paused = false;
  let shown = offset;
  window.loopVideo.ready.then(() => {
    const tick = (now) => {
      if (origin === null) origin = now;
      if (!paused) shown = (offset + (now - origin) / 1000) % DURATION;
      draw(shown);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const restart = (t) => {
    offset = (t + DURATION) % DURATION;
    origin = null;
    shown = offset;
  };
  addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      paused = !paused;
      if (!paused) restart(shown);
    } else if (event.code === "ArrowRight") restart(shown + 5);
    else if (event.code === "ArrowLeft") restart(shown - 5);
  });
}
