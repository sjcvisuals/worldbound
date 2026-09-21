#!/usr/bin/env node
/**
 * Packing invariants for spanning lyrics.
 *   node --experimental-strip-types scripts/test-lyric-pack.mjs
 */
import {
  allocateWordCounts,
  assignWordsToScreens,
  packWordsInBands,
  uniqueBands,
  wipeX,
} from "../src/lyrics/pack.ts";

let failed = 0;
function eq(name, got, exp) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(exp);
  if (a !== b) {
    failed++;
    console.error(`FAIL ${name}\n  got  ${a}\n  want ${b}`);
  } else {
    console.log(`ok   ${name}`);
  }
}
function ok(name, cond) {
  if (!cond) {
    failed++;
    console.error(`FAIL ${name}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

eq("4 words on L/C/R → 1,2,1", allocateWordCounts(4, [6, 10, 6]), [1, 2, 1]);
eq("3 words → one per wall", allocateWordCounts(3, [6, 10, 6]), [1, 1, 1]);
eq("1 word → centre", allocateWordCounts(1, [6, 10, 6]), [0, 1, 0]);
eq("2 words → left+centre", allocateWordCounts(2, [6, 10, 6]), [1, 1, 0]);
eq("5 words → 2,2,1", allocateWordCounts(5, [6, 10, 6]), [2, 2, 1]);
eq("each-mode single band", allocateWordCounts(4, [1]), [4]);
eq("empty", allocateWordCounts(0, [6, 10, 6]), [0, 0, 0]);

eq(
  "ANGELS IN THE FIRE split",
  assignWordsToScreens(["ANGELS", "IN", "THE", "FIRE"], [6, 10, 6]),
  [["ANGELS"], ["IN", "THE"], ["FIRE"]]
);

const words = ["ANGELS", "IN", "THE", "FIRE"];
const widths = [180, 50, 70, 90];
const space = 16;
const bands = [
  { x0: 0, x1: 273 },
  { x0: 273, x1: 727 },
  { x0: 727, x1: 1000 },
];
const { packed, overflow } = packWordsInBands(words, widths, space, bands);
ok("fits at this font", !overflow);
eq(
  "packed words in order",
  packed.map((p) => p.word),
  words
);
for (const p of packed) {
  const band = bands.find((b) => p.x >= b.x0 && p.x < b.x1);
  ok(`${p.word} starts in a band`, !!band);
  ok(`${p.word} ends in same band`, !!band && p.x + p.width <= band.x1);
}
for (const seam of [273, 727]) {
  const hit = packed.filter((p) => p.x < seam && p.x + p.width > seam);
  ok(`no glyph on seam ${seam}`, hit.length === 0);
}

ok("wipe 0 is first word", wipeX(packed, 0, 1000) === packed[0].x);
ok(
  "wipe 1 is last word end",
  wipeX(packed, 1, 1000) === packed[3].x + packed[3].width
);
const mid = wipeX(packed, 0.5, 1000);
ok(
  "wipe 0.5 is inside second half of line",
  mid >= packed[1].x && mid <= packed[2].x + packed[2].width
);

eq("uniqueBands collapses duplicate full-width rects", uniqueBands([
  { x0: 0, x1: 1000 },
  { x0: 0, x1: 1000 },
  { x0: 0, x1: 1000 },
]), [{ x0: 0, x1: 1000 }]);

const eachPacked = packWordsInBands(
  words,
  widths,
  space,
  [
    { x0: 0, x1: 1000 },
    { x0: 0, x1: 1000 },
    { x0: 0, x1: 1000 },
  ]
);
ok("each-mode duplicate bands still fit", !eachPacked.overflow);
eq(
  "each-mode keeps one copy of each word",
  eachPacked.packed.map((p) => p.word),
  words
);
const xs = eachPacked.packed.map((p) => p.x);
ok("each-mode words do not all start at the same x (not stacked)", new Set(xs).size === words.length);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall packing tests passed");
