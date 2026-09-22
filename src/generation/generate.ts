import type {
  AudioAnalysis,
  ContentLoop,
  GenerationParams,
  LoopVisual,
  SongSectionType,
} from "../types";

const BEATS_PER_BAR = 4;

function sectionAt(analysis: AudioAnalysis, t: number): SongSectionType {
  for (const s of analysis.sections) {
    if (t >= s.startSec && t < s.endSec) return s.type;
  }
  return analysis.sections.length ? analysis.sections[analysis.sections.length - 1].type : "chorus";
}

/** Mean normalised energy across a time span (0..1). */
function energyBetween(analysis: AudioAnalysis, t0: number, t1: number): number {
  const { envelope, envelopeHz } = analysis;
  const f0 = Math.max(0, Math.floor(t0 * envelopeHz));
  const f1 = Math.min(envelope.length, Math.ceil(t1 * envelopeHz));
  if (f1 <= f0) return 0.5;
  let sum = 0;
  for (let f = f0; f < f1; f++) sum += envelope[f];
  return sum / (f1 - f0);
}

const SECTION_INTENSITY: Record<SongSectionType, number> = {
  intro: 0.35,
  build: 0.6,
  chorus: 1.0,
  breakdown: 0.45,
  finish: 0.95,
};

const SECTION_MOTIF_SPEED: Record<SongSectionType, number> = {
  intro: 0.6,
  build: 0.85,
  chorus: 1.25,
  breakdown: 0.7,
  finish: 1.4,
};

/**
 * Generate seamless, beat-synced content loops that tile the whole track.
 *
 * Seamlessness: each loop length is a whole number of bars, so it wraps exactly
 * on the beat grid. Progression: visual parameters evolve gradually across the
 * show and are emphasised per song section (intro/build/chorus/breakdown/finish)
 * following the classic start → build → chorus → big-finish arc.
 */
export function generateLoops(analysis: AudioAnalysis, params: GenerationParams): ContentLoop[] {
  const { bpm, duration } = analysis;
  const barSec = (60 / bpm) * BEATS_PER_BAR;

  // Choose bars-per-loop so the length lands near the target (and within 20-30s).
  let bars = Math.max(1, Math.round(params.targetLoopSeconds / barSec));
  const clampLen = (b: number) => b * barSec;
  while (clampLen(bars) > 30 && bars > 1) bars--;
  while (clampLen(bars) < 18) bars++;
  const loopLen = clampLen(bars);

  const count = Math.max(1, Math.ceil(duration / loopLen));
  const loops: ContentLoop[] = [];

  for (let i = 0; i < count; i++) {
    const startSec = i * loopLen;
    const endSec = Math.min(duration, startSec + loopLen);
    const mid = (startSec + endSec) / 2;
    const section = sectionAt(analysis, mid);
    const progression = count > 1 ? i / (count - 1) : 0;

    const localEnergy = energyBetween(analysis, startSec, endSec);
    const intensity = clamp01(0.55 * SECTION_INTENSITY[section] + 0.45 * localEnergy);

    const visual: LoopVisual = {
      seed: 1000 + i * 137,
      palette: rotatePalette(params.palette, progression),
      intensity,
      // Motion accelerates through the show and per section.
      speed: SECTION_MOTIF_SPEED[section] * (0.9 + 0.3 * progression),
      // Elements accumulate as the show builds.
      density: clamp01(0.25 + 0.6 * progression + 0.2 * (intensity - 0.5)),
      beatPunch: clamp01(0.4 + 0.5 * SECTION_INTENSITY[section]),
      motif: params.motif,
      look: params.look,
    };

    loops.push({
      id: `loop-${i + 1}`,
      index: i,
      section,
      startSec,
      endSec,
      lengthSec: endSec - startSec,
      bars,
      progression,
      visual,
    });
  }

  return loops;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Gradually shift the palette hue across the show so each loop "progresses from
 * the initial graphics slightly" while staying on-theme.
 */
function rotatePalette(palette: string[], progression: number): string[] {
  const shift = progression * 24; // degrees, subtle
  return palette.map((hex) => shiftHue(hex, shift));
}

function shiftHue(hex: string, deg: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex((h + deg + 360) % 360, s, l);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = hex.replace("#", "");
  const r = parseInt(n.substring(0, 2), 16) / 255;
  const g = parseInt(n.substring(2, 4), 16) / 255;
  const b = parseInt(n.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
