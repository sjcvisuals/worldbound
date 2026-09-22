#!/usr/bin/env node
/**
 * Prompt → LookRecipe invariants so cinema plates match the user's words.
 *   node --experimental-strip-types scripts/test-prompt-look.mjs
 */
import { lookTags, parsePrompt, platePrompt } from "../src/generation/prompt.ts";

let failed = 0;
function ok(name, cond) {
  if (!cond) {
    failed++;
    console.error(`FAIL ${name}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

const gold = parsePrompt(
  "Gold and amber fire, embers and a hell mouth that punch on the kick."
);
ok("gold fire on", gold.fire >= 0.9);
ok("gold no figures", gold.figures < 0.05);
ok("gold no grid", gold.grid < 0.05);
ok("gold particles from fire", gold.particles >= 0.5);
ok("gold palette has gold or orange", gold.palette.some((c) => c === "#ffd23f" || c === "#ff7a1a"));
ok("gold tags include fire", lookTags(gold).includes("fire"));
ok("gold tags omit figures", !lookTags(gold).includes("figures"));

const cyan = parsePrompt("Cyan grid tunnel and neon geometry, clean festival look.");
ok("cyan grid on", cyan.grid >= 0.9);
ok("cyan tunnel from grid", cyan.tunnel >= 0.3);
ok("cyan no figures", cyan.figures < 0.05);
ok("cyan no water from waves-of-light", cyan.water < 0.05);
ok("gold no stars from start", gold.stars < 0.45);

const startOnly = parsePrompt("Start, build, chorus, big finish. Electric blue theme.");
ok("start does not light stars", startOnly.stars < 0.45);
ok("start does not light figures", startOnly.figures < 0.05);
ok("cyan palette cyan", cyan.palette.includes("#22d3ee"));
ok("cyan tags include grid", lookTags(cyan).includes("grid"));

const angels = parsePrompt(
  "electric blue theme and graphics of angels descending into hell"
);
ok("angels figures on", angels.figures >= 0.9);
ok("angels fire from hell", angels.fire >= 0.9);
ok("angels electric blue", angels.palette.includes("#00b3ff"));

const lightning = parsePrompt("Magenta and violet lightning, smoke and particles.");
ok("lightning bolt on", lightning.lightning >= 0.9);
ok("lightning smoke", lightning.smoke >= 0.4);
ok("lightning no figures", lightning.figures < 0.05);
ok("lightning magenta", lightning.palette.includes("#ff2d78") || lightning.palette.includes("#8b5cf6"));

const colour = parsePrompt("deep purple");
ok("colour-only no leftover angels", colour.figures < 0.05);
ok("colour-only no fire", colour.fire < 0.05);
ok("colour-only atmosphere", colour.smoke > 0 && colour.stars > 0);

const plate = platePrompt("Gold fire", gold);
ok("plate prompt bans lyrics", /no lyrics/i.test(plate));
ok("plate prompt keeps user text", /Gold fire/.test(plate));
ok("plate prompt includes fire motif", /fire/.test(plate));

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall prompt-look tests passed");
