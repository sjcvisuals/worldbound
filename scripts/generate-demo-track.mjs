// Synthesises a royalty-free demo track with a clear 4/4 beat and a
// start → build → chorus → breakdown → big-finish structure so the analyser has
// real tempo/beats/sections to work with. Pure Node, no dependencies.
//
// Usage: node scripts/generate-demo-track.mjs
// Output: public/demo-track.wav

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/demo-track.wav");

const SR = 44100;
const BPM = 120;
const beat = 60 / BPM; // 0.5s
const bar = beat * 4; // 2s
const BARS = 48;
const DURATION = BARS * bar; // 96s
const N = Math.floor(SR * DURATION);

const left = new Float32Array(N);
const right = new Float32Array(N);

function addAt(buf, tStart, tLen, fn) {
  const start = Math.floor(tStart * SR);
  const len = Math.floor(tLen * SR);
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx < 0 || idx >= buf.length) continue;
    buf[idx] += fn(i / SR, i / len);
  }
}

function kick(gain = 1) {
  return (t) => {
    const env = Math.exp(-t * 30);
    const f = 120 * Math.exp(-t * 25) + 45;
    return Math.sin(2 * Math.PI * f * t) * env * gain;
  };
}
function snare(gain = 1) {
  return (t, p) => {
    const env = Math.exp(-p * 12);
    return (Math.random() * 2 - 1) * env * gain * 0.6;
  };
}
function hat(gain = 1) {
  return (t, p) => {
    const env = Math.exp(-p * 40);
    return (Math.random() * 2 - 1) * env * gain * 0.3;
  };
}
function tone(freq, gain, decay) {
  return (t) => Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * decay) * gain;
}
function pad(freqs, gain) {
  return (t, p) => {
    const env = Math.sin(Math.PI * p) * gain;
    let v = 0;
    for (const f of freqs) v += Math.sin(2 * Math.PI * f * t);
    return (v / freqs.length) * env;
  };
}

// Section plan: [name, startBar, endBar]
const sections = [
  ["intro", 0, 8],
  ["build", 8, 16],
  ["chorus", 16, 32],
  ["breakdown", 32, 40],
  ["finish", 40, 48],
];

function sectionAtBar(b) {
  for (const [name, s, e] of sections) if (b >= s && b < e) return name;
  return "chorus";
}

const ROOT = 55; // A1
const CHORD = [110, 164.81, 220, 277.18]; // A minor-ish pad

for (let b = 0; b < BARS; b++) {
  const barT = b * bar;
  const sec = sectionAtBar(b);
  const energy =
    sec === "intro" ? 0.35 : sec === "build" ? 0.6 : sec === "chorus" ? 1 : sec === "breakdown" ? 0.4 : 1;

  // Pad / chord bed
  if (sec === "intro" || sec === "breakdown") {
    addAt(left, barT, bar, pad(CHORD, 0.18));
    addAt(right, barT, bar, pad(CHORD, 0.18));
  }
  if (sec === "chorus" || sec === "finish") {
    addAt(left, barT, bar, pad(CHORD.map((f) => f * 2), 0.14 * energy));
    addAt(right, barT, bar, pad(CHORD.map((f) => f * 2), 0.14 * energy));
  }

  for (let beatI = 0; beatI < 4; beatI++) {
    const t = barT + beatI * beat;
    // Kick on every beat (soft in intro)
    const kg = sec === "intro" ? 0.5 : 0.95;
    addAt(left, t, beat, kick(kg));
    addAt(right, t, beat, kick(kg));

    // Snare on 2 & 4 (from build onward)
    if ((sec === "build" || sec === "chorus" || sec === "finish") && (beatI === 1 || beatI === 3)) {
      addAt(left, t, beat * 0.5, snare(energy));
      addAt(right, t, beat * 0.5, snare(energy));
    }

    // Hats on 8ths (build/chorus/finish)
    if (sec === "build" || sec === "chorus" || sec === "finish") {
      addAt(left, t, beat * 0.25, hat(0.8 * energy));
      addAt(left, t + beat * 0.5, beat * 0.25, hat(0.6 * energy));
      addAt(right, t, beat * 0.25, hat(0.8 * energy));
      addAt(right, t + beat * 0.5, beat * 0.25, hat(0.6 * energy));
    }

    // Bassline 8ths in chorus/finish
    if (sec === "chorus" || sec === "finish") {
      for (let e8 = 0; e8 < 2; e8++) {
        const bt = t + e8 * beat * 0.5;
        addAt(left, bt, beat * 0.5, tone(ROOT * (beatI % 2 ? 1.5 : 1), 0.3, 6));
        addAt(right, bt, beat * 0.5, tone(ROOT * (beatI % 2 ? 1.5 : 1), 0.3, 6));
      }
    }

    // Lead stabs in chorus/finish on the beat
    if (sec === "chorus" || sec === "finish") {
      const note = CHORD[(b + beatI) % CHORD.length] * 2;
      addAt(left, t, beat * 0.9, tone(note, 0.16 * energy, 3));
      addAt(right, t, beat * 0.9, tone(note * 1.003, 0.16 * energy, 3));
    }
  }
}

// Normalise + soft clip
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const norm = peak > 0 ? 0.9 / peak : 1;

// Write 16-bit stereo WAV
const bytesPerSample = 2;
const blockAlign = 2 * bytesPerSample;
const dataSize = N * blockAlign;
const buffer = Buffer.alloc(44 + dataSize);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(2, 22); // stereo
buffer.writeUInt32LE(SR, 24);
buffer.writeUInt32LE(SR * blockAlign, 28);
buffer.writeUInt16LE(blockAlign, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(dataSize, 40);

let off = 44;
const clip = (x) => Math.max(-1, Math.min(1, x));
for (let i = 0; i < N; i++) {
  const l = clip(left[i] * norm);
  const r = clip(right[i] * norm);
  buffer.writeInt16LE((l * 32767) | 0, off);
  buffer.writeInt16LE((r * 32767) | 0, off + 2);
  off += 4;
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buffer);
console.log(`Wrote ${OUT} (${(dataSize / 1e6).toFixed(1)} MB, ${DURATION}s, ${BPM} BPM)`);
