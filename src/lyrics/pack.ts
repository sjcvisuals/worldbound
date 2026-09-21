export interface PackedWord {
  word: string;
  x: number;
  width: number;
}

export interface PackBand {
  /** Inclusive left, exclusive right, atlas pixels. */
  x0: number;
  x1: number;
}

/**
 * Split `nWords` across screens by physical width. If there are at least as
 * many words as screens, every wall gets one; leftovers go to the widest.
 * That keeps bezels in the gaps between words (never through a glyph).
 */
export function allocateWordCounts(nWords: number, weights: number[]): number[] {
  const n = weights.length;
  const counts = new Array<number>(n).fill(0);
  if (nWords <= 0 || n === 0) return counts;

  const safe = weights.map((w) => Math.max(w, 1e-6));
  const totalW = safe.reduce((a, b) => a + b, 0);

  let remaining = nWords;
  if (nWords >= n) {
    for (let i = 0; i < n; i++) counts[i] = 1;
    remaining = nWords - n;
  }
  if (remaining === 0) return counts;

  const quotas = safe.map((w) => remaining * (w / totalW));
  const extra = quotas.map((q) => Math.floor(q));
  let used = extra.reduce((a, b) => a + b, 0);
  const order = quotas
    .map((q, i) => ({ i, r: q - Math.floor(q) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  let k = 0;
  while (used < remaining) {
    extra[order[k % n].i]++;
    used++;
    k++;
  }
  for (let i = 0; i < n; i++) counts[i] += extra[i];
  return counts;
}

export function assignWordsToScreens(words: string[], weights: number[]): string[][] {
  const counts = allocateWordCounts(words.length, weights);
  const groups: string[][] = [];
  let i = 0;
  for (const c of counts) {
    groups.push(words.slice(i, i + c));
    i += c;
  }
  return groups;
}

/**
 * Place each screen's words centred in its band, inset so glyphs never sit on
 * the bezel. `overflow` is true when the current font is too wide for a band.
 */
export function packWordsInBands(
  words: string[],
  widths: number[],
  space: number,
  bands: PackBand[]
): { packed: PackedWord[]; overflow: boolean } {
  const weights = bands.map((b) => Math.max(0, b.x1 - b.x0));
  const counts = allocateWordCounts(words.length, weights);
  const packed: PackedWord[] = [];
  let overflow = false;
  let i = 0;
  for (let b = 0; b < bands.length; b++) {
    const count = counts[b];
    const band = bands[b];
    const bandW = Math.max(1, band.x1 - band.x0);
    const pad = Math.max(8, bandW * 0.07);
    const groupWidths = widths.slice(i, i + count);
    const group = words.slice(i, i + count);
    i += count;
    if (!group.length) continue;
    const total =
      groupWidths.reduce((n, x) => n + x, 0) + space * Math.max(0, group.length - 1);
    const inner = bandW - pad * 2;
    if (total > inner) overflow = true;
    let x = band.x0 + pad + Math.max(0, (inner - total) / 2);
    for (let k = 0; k < group.length; k++) {
      packed.push({ word: group[k], x, width: groupWidths[k] });
      if (x + groupWidths[k] > band.x1 - pad * 0.35) overflow = true;
      x += groupWidths[k] + space;
    }
  }
  return { packed, overflow };
}

/** Karaoke wipe x in atlas pixels, following packed word order (not raw UV). */
export function wipeX(packed: PackedWord[], wipe: number, atlasW: number): number {
  if (!packed.length) return atlasW * wipe;
  if (wipe <= 0) return packed[0].x;
  const last = packed[packed.length - 1];
  if (wipe >= 1) return last.x + last.width;
  const f = wipe * packed.length;
  const i = Math.min(packed.length - 1, Math.floor(f));
  const frac = f - i;
  const p = packed[i];
  return p.x + p.width * frac;
}
