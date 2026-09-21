import type { LyricLine, LyricWord } from "../types";

const TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/g;

function toSec(m: string, s: string, frac?: string) {
  let f = 0;
  if (frac) {
    const n = parseInt(frac, 10);
    f = frac.length === 1 ? n / 10 : frac.length === 2 ? n / 100 : n / 1000;
  }
  return parseInt(m, 10) * 60 + parseInt(s, 10) + f;
}

/**
 * Parse LRC (`[mm:ss.xx]line`, optional enhanced `<mm:ss.xx>word`) or plain
 * text (one line per line). Untimed text is snapped across `duration` — on
 * even bar boundaries when `barSec` is given.
 */
export function parseLyrics(
  raw: string,
  duration: number,
  barSec = 2
): LyricLine[] {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  const hasTime = /\[\d{1,2}:\d{2}/.test(text) || /<\d{1,2}:\d{2}/.test(text);
  if (hasTime) return parseLrc(text, duration);
  return timePlain(text, duration, barSec);
}

function parseLrc(raw: string, duration: number): LyricLine[] {
  const rows: { t: number; body: string }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const tags: number[] = [];
    let m: RegExpExecArray | null;
    TAG.lastIndex = 0;
    while ((m = TAG.exec(line))) tags.push(toSec(m[1], m[2], m[3]));
    const body = line.replace(TAG, "").trim();
    if (!tags.length) continue;
    for (const t of tags) rows.push({ t, body });
  }
  rows.sort((a, b) => a.t - b.t);
  const lines: LyricLine[] = [];
  for (let i = 0; i < rows.length; i++) {
    const startSec = rows[i].t;
    const next = rows[i + 1]?.t;
    const endSec = next != null ? next : Math.min(duration || startSec + 4, startSec + 8);
    const words = parseWords(rows[i].body, startSec, endSec);
    const text = words
      ? words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim()
      : rows[i].body.replace(WORD, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    lines.push({ startSec, endSec, text, words });
  }
  return lines;
}

function parseWords(body: string, lineStart: number, lineEnd: number): LyricWord[] | undefined {
  if (!body.includes("<")) return undefined;
  const words: LyricWord[] = [];
  WORD.lastIndex = 0;
  const matches = [...body.matchAll(WORD)];
  if (!matches.length) return undefined;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const startSec = toSec(m[1], m[2], m[3]);
    const after = m.index! + m[0].length;
    const until = matches[i + 1]?.index ?? body.length;
    const text = body.slice(after, until).replace(TAG, "").trim();
    if (text) words.push({ startSec, text });
  }
  if (!words.length) return undefined;
  if (words[0].startSec > lineStart + 0.05) {
    const head = body.slice(0, matches[0].index).replace(TAG, "").trim();
    if (head) words.unshift({ startSec: lineStart, text: head });
  }
  void lineEnd;
  return words;
}

function timePlain(raw: string, duration: number, barSec: number): LyricLine[] {
  const rows = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
  if (!rows.length) return [];
  const span = Math.max(duration, rows.length * barSec);
  const slot = span / rows.length;
  return rows.map((text, i) => ({
    startSec: i * slot,
    endSec: (i + 1) * slot,
    text,
  }));
}

export function activeLyric(
  lines: LyricLine[],
  t: number
): { current: LyricLine | null; next: LyricLine | null; progress: number } {
  let current: LyricLine | null = null;
  let next: LyricLine | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (t >= l.startSec && t < l.endSec) {
      current = l;
      next = lines[i + 1] ?? null;
      break;
    }
    if (t < l.startSec) {
      next = l;
      break;
    }
  }
  const progress = current
    ? Math.max(0, Math.min(1, (t - current.startSec) / Math.max(0.05, current.endSec - current.startSec)))
    : 0;
  return { current, next, progress };
}

/** Karaoke wipe 0..1, using word timestamps when present. */
export function karaokeProgress(line: LyricLine, t: number, fallback: number): number {
  const words = line.words;
  if (!words || words.length < 2) return fallback;
  if (t <= words[0].startSec) return 0;
  for (let i = 0; i < words.length; i++) {
    const a = words[i].startSec;
    const b = words[i + 1]?.startSec ?? line.endSec;
    if (t >= a && t < b) {
      const i0 = i / words.length;
      const i1 = (i + 1) / words.length;
      const p = (t - a) / Math.max(0.01, b - a);
      return i0 + (i1 - i0) * p;
    }
  }
  return 1;
}
