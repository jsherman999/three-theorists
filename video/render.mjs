// Renders loop-theory.html to an MP4. Headless Chromium draws each frame,
// soundtrack.mjs builds the audio, and ffmpeg encodes both.
//
//   node video/render.mjs                         # video/loop-theory.mp4
//   node video/render.mjs --stills 8,30,55        # PNG stills, for checking a frame
//   node video/render.mjs --from 50 --to 60       # part of the video
//
// Needs Playwright (npm i -g playwright, or a local install) and an ffmpeg with
// libx264 on the PATH, or at $FFMPEG.

import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSoundtrack } from "./soundtrack.mjs";
import { DURATION } from "./timeline.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const args = parseArgs(process.argv.slice(2));
const fps = Number(args.fps || 30);
const from = Number(args.from || 0);
const to = Math.min(DURATION, Number(args.to || DURATION));
const out = resolve(args.out || join(here, "loop-theory.mp4"));
const workers = Number(args.workers || 4);
const ffmpegPath = process.env.FFMPEG || "ffmpeg";

function parseArgs(list) {
  const parsed = {};
  for (let i = 0; i < list.length; i++) {
    if (!list[i].startsWith("--")) continue;
    const key = list[i].slice(2);
    const value = list[i + 1] && !list[i + 1].startsWith("--") ? list[++i] : true;
    parsed[key] = value;
  }
  return parsed;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const globalRoot = execFileSync("npm", ["root", "-g"]).toString().trim();
    return createRequire(join(globalRoot, "noop.js"))("playwright");
  }
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

function serve() {
  const server = createServer(async (req, res) => {
    const path = resolve(root, `.${decodeURIComponent(new URL(req.url, "http://x").pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(path);
      res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function openPages(browser, url, count) {
  const pages = [];
  for (let i = 0; i < count; i++) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(url);
    await page.waitForFunction(() => window.loopVideo);
    await page.evaluate(() => window.loopVideo.ready);
    const missing = await page.evaluate(() => [...document.fonts].filter((face) => face.status !== "loaded").map((face) => face.family));
    if (missing.length) throw new Error(`Fonts failed to load: ${missing.join(", ")}`);
    pages.push(page);
  }
  return pages;
}

async function capture(page, t) {
  await page.evaluate((time) => window.loopVideo.draw(time), t);
  return page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1920, height: 1080 } });
}

const { chromium } = await loadPlaywright();
const server = await serve();
const url = `http://127.0.0.1:${server.address().port}/video/loop-theory.html?render`;
const browser = await chromium.launch();

try {
  if (args.stills) {
    const dir = resolve(args["out-dir"] || join(here, "stills"));
    await mkdir(dir, { recursive: true });
    const [page] = await openPages(browser, url, 1);
    for (const t of String(args.stills).split(",").map(Number)) {
      const file = join(dir, `still-${t.toFixed(1).padStart(5, "0")}.png`);
      await writeFile(file, await capture(page, t));
      console.log(file);
    }
  } else {
    const temp = await mkdtemp(join(tmpdir(), "loop-video-"));
    const inputs = ["-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-"];
    if (!args["no-audio"]) {
      const wav = join(temp, "soundtrack.wav");
      await writeFile(wav, buildSoundtrack({ from, to }));
      inputs.push("-i", wav);
    }
    const ffmpeg = spawn(
      ffmpegPath,
      [
        "-y", "-loglevel", "error", ...inputs,
        "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-x264-params", "aq-mode=3",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", out,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const finished = once(ffmpeg, "close");

    const total = Math.round((to - from) * fps);
    const pages = await openPages(browser, url, workers);
    const ready = new Map();
    let next = 0;
    let written = 0;
    const started = Date.now();
    const flush = async () => {
      while (ready.has(written)) {
        const frame = ready.get(written);
        ready.delete(written);
        written++;
        if (!ffmpeg.stdin.write(frame)) await once(ffmpeg.stdin, "drain");
        if (written % (fps * 5) === 0 || written === total) {
          const rate = written / ((Date.now() - started) / 1000);
          console.log(`frame ${written}/${total} (${rate.toFixed(1)} fps)`);
        }
      }
    };
    await Promise.all(
      pages.map(async (page) => {
        for (let i = next++; i < total; i = next++) {
          ready.set(i, await capture(page, from + i / fps));
          await flush();
        }
      }),
    );
    ffmpeg.stdin.end();
    const [code] = await finished;
    await rm(temp, { recursive: true, force: true });
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    console.log(out);
  }
} finally {
  await browser.close();
  server.close();
}
