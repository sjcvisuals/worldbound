import type { AudioAnalysis, AudioSection, SongSectionType } from "../types";

/**
 * Lightweight, dependency-free audio analysis running fully in the browser:
 *  - energy envelope (for waveform + reactive visuals)
 *  - onset detection (half-wave rectified energy flux)
 *  - BPM estimation via autocorrelation of the onset envelope
 *  - beat grid generation (bpm + phase)
 *  - coarse song-section segmentation (intro/build/chorus/breakdown/finish)
 */

const HOP = 512;

export async function analyzeAudio(url: string): Promise<AudioAnalysis> {
  const resp = await fetch(url);
  const arrayBuf = await resp.arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
  await ctx.close();

  const sampleRate = audioBuf.sampleRate;
  const duration = audioBuf.duration;

  // Mono mix.
  const chs = audioBuf.numberOfChannels;
  const len = audioBuf.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < chs; c++) {
    const data = audioBuf.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += data[i] / chs;
  }

  // Energy envelope (RMS per hop).
  const frames = Math.floor(len / HOP);
  const envelope = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * HOP;
    for (let i = 0; i < HOP; i++) {
      const s = mono[start + i];
      sum += s * s;
    }
    envelope[f] = Math.sqrt(sum / HOP);
  }
  const envelopeHz = sampleRate / HOP;

  // Onset strength: half-wave rectified difference of a smoothed envelope.
  const smooth = movingAverage(envelope, 3);
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    const d = smooth[f] - smooth[f - 1];
    flux[f] = d > 0 ? d : 0;
  }
  normalize(flux);

  const bpm = estimateBpm(flux, envelopeHz);
  const beats = generateBeatGrid(flux, envelopeHz, bpm, duration);
  const sections = segmentSections(envelope, envelopeHz, duration, beats, bpm);

  // Downsample envelope for storage/visuals (~50 Hz).
  const targetHz = 50;
  const factor = Math.max(1, Math.round(envelopeHz / targetHz));
  const outEnv: number[] = [];
  for (let f = 0; f < frames; f += factor) {
    let m = 0;
    for (let k = 0; k < factor && f + k < frames; k++) m = Math.max(m, envelope[f + k]);
    outEnv.push(m);
  }
  normalizeArr(outEnv);

  return {
    duration,
    bpm,
    beats,
    envelope: outEnv,
    envelopeHz: envelopeHz / factor,
    sections,
  };
}

function movingAverage(arr: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let n = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j >= 0 && j < arr.length) {
        sum += arr[j];
        n++;
      }
    }
    out[i] = sum / n;
  }
  return out;
}

function normalize(arr: Float32Array) {
  let max = 0;
  for (let i = 0; i < arr.length; i++) max = Math.max(max, arr[i]);
  if (max > 0) for (let i = 0; i < arr.length; i++) arr[i] /= max;
}

function normalizeArr(arr: number[]) {
  let max = 0;
  for (const v of arr) max = Math.max(max, v);
  if (max > 0) for (let i = 0; i < arr.length; i++) arr[i] /= max;
}

/** BPM via autocorrelation of the onset envelope over a musical lag range. */
function estimateBpm(flux: Float32Array, hz: number): number {
  const minBpm = 70;
  const maxBpm = 175;
  const minLag = Math.floor((60 / maxBpm) * hz);
  const maxLag = Math.ceil((60 / minBpm) * hz);
  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let i = lag; i < flux.length; i++) score += flux[i] * flux[i - lag];
    // Slight preference for mid-tempo to avoid octave errors.
    score /= flux.length - lag;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  let bpm = (60 * hz) / bestLag;
  // Fold into a musical range.
  while (bpm < 90) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

/** Build a beat grid from bpm, choosing the phase that best matches onsets. */
function generateBeatGrid(flux: Float32Array, hz: number, bpm: number, duration: number): number[] {
  const beatPeriod = 60 / bpm; // seconds
  const periodFrames = beatPeriod * hz;
  let bestPhase = 0;
  let bestScore = -Infinity;
  const steps = 32;
  for (let p = 0; p < steps; p++) {
    const phase = (p / steps) * beatPeriod;
    let score = 0;
    for (let t = phase; t < duration; t += beatPeriod) {
      const f = Math.round(t * hz);
      if (f >= 0 && f < flux.length) score += flux[f];
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }
  const beats: number[] = [];
  for (let t = bestPhase; t < duration; t += beatPeriod) beats.push(Math.round(t * 1000) / 1000);
  void periodFrames;
  return beats;
}

/**
 * Coarse structural segmentation. Splits the track into bar-aligned blocks and
 * classifies each by relative energy and position into named song sections.
 */
function segmentSections(
  envelope: Float32Array,
  hz: number,
  duration: number,
  beats: number[],
  bpm: number
): AudioSection[] {
  const beatsPerBar = 4;
  const barSec = (60 / bpm) * beatsPerBar;
  const blockBars = 4; // ~one phrase
  const blockSec = barSec * blockBars;
  const nBlocks = Math.max(4, Math.round(duration / blockSec));
  const blockEnergy: number[] = [];
  for (let b = 0; b < nBlocks; b++) {
    const t0 = (b / nBlocks) * duration;
    const t1 = ((b + 1) / nBlocks) * duration;
    let sum = 0;
    let n = 0;
    for (let f = Math.floor(t0 * hz); f < Math.floor(t1 * hz) && f < envelope.length; f++) {
      sum += envelope[f];
      n++;
    }
    blockEnergy.push(n ? sum / n : 0);
  }
  const maxE = Math.max(...blockEnergy, 1e-6);
  const norm = blockEnergy.map((e) => e / maxE);

  const sections: AudioSection[] = [];
  for (let b = 0; b < nBlocks; b++) {
    const t0 = (b / nBlocks) * duration;
    const t1 = ((b + 1) / nBlocks) * duration;
    const e = norm[b];
    const prev = b > 0 ? norm[b - 1] : e;
    let type: SongSectionType;
    if (b === 0) type = "intro";
    else if (b === nBlocks - 1) type = "finish";
    else if (e > 0.8) type = "chorus";
    else if (e < 0.4) type = "breakdown";
    else if (e > prev + 0.05) type = "build";
    else type = e > 0.6 ? "chorus" : "build";
    // Merge consecutive identical types.
    const last = sections[sections.length - 1];
    if (last && last.type === type) last.endSec = t1;
    else sections.push({ type, startSec: t0, endSec: t1 });
  }
  void beats;
  return sections;
}
