import type { LookRecipe } from "../types";

interface NamedColor {
  keys: string[];
  hex: string;
}

const COLOR_WORDS: NamedColor[] = [
  { keys: ["electric blue"], hex: "#00b3ff" },
  { keys: ["cyan", "aqua", "teal"], hex: "#22d3ee" },
  { keys: ["deep blue", "navy"], hex: "#0a1a5c" },
  { keys: ["blue"], hex: "#2563eb" },
  { keys: ["purple", "violet"], hex: "#8b5cf6" },
  { keys: ["magenta", "pink"], hex: "#ff2d78" },
  { keys: ["red", "blood", "crimson"], hex: "#ff2d55" },
  { keys: ["orange", "amber"], hex: "#ff7a1a" },
  { keys: ["gold", "golden", "yellow"], hex: "#ffd23f" },
  { keys: ["green", "toxic", "acid"], hex: "#39ff14" },
  { keys: ["white", "holy"], hex: "#eaf6ff" },
  { keys: ["black", "shadow"], hex: "#070a18" },
];

interface MotifRule {
  keys: string[];
  field: keyof Omit<LookRecipe, "palette" | "motif">;
  weight: number;
  label: string;
}

const MOTIF_RULES: MotifRule[] = [
  { keys: ["angel", "figure", "dancer", "silhouette", "crowd", "human", "person", "wing"], field: "figures", weight: 1, label: "figures" },
  { keys: ["fire", "flame", "ember", "lava", "inferno", "hell", "heat"], field: "fire", weight: 1, label: "fire" },
  { keys: ["water", "ocean", "sea", "rain", "underwater", "wave", "caustic"], field: "water", weight: 1, label: "water" },
  { keys: ["grid", "neon", "laser", "geometry", "wireframe", "tron", "lattice"], field: "grid", weight: 1, label: "grid" },
  { keys: ["lightning", "bolt", "thunder", "storm", "strike"], field: "lightning", weight: 1, label: "lightning" },
  { keys: ["particle", "dust", "spark", "bokeh", "glitter", "ember"], field: "particles", weight: 0.85, label: "particles" },
  { keys: ["tunnel", "hyperspace", "warp", "vortex", "wormhole"], field: "tunnel", weight: 1, label: "tunnel" },
  { keys: ["smoke", "fog", "haze", "mist", "cloud"], field: "smoke", weight: 0.9, label: "smoke" },
  { keys: ["star", "cosmos", "nebula", "galaxy", "space", "night sky"], field: "stars", weight: 0.9, label: "stars" },
];

export interface ParsedPrompt extends LookRecipe {}

export function emptyLook(): LookRecipe {
  return {
    palette: ["#00b3ff", "#0044ff", "#070a18"],
    motif: "abstract energy",
    figures: 0,
    fire: 0,
    water: 0,
    grid: 0,
    lightning: 0,
    particles: 0.35,
    tunnel: 0,
    smoke: 0.25,
    stars: 0.2,
  };
}

/**
 * Turn a free-text show prompt into a palette + layer recipe so cinema plates
 * match what the user asked for (grid vs fire vs figures), not a fixed karaoke look.
 */
export function parsePrompt(prompt: string): ParsedPrompt {
  const look = emptyLook();
  const lower = (prompt || "").toLowerCase();
  const palette: string[] = [];
  for (const c of COLOR_WORDS) {
    if (c.keys.some((k) => lower.includes(k))) {
      if (!palette.includes(c.hex)) palette.push(c.hex);
    }
  }
  if (lower.includes("electric") && !palette.includes("#00b3ff")) palette.unshift("#00b3ff");
  if (palette.length === 0) palette.push("#00b3ff", "#0044ff", "#070a18");
  while (palette.length < 3) palette.push("#070a18");
  look.palette = palette.slice(0, 5);

  const labels: string[] = [];
  for (const rule of MOTIF_RULES) {
    if (rule.keys.some((k) => lower.includes(k))) {
      look[rule.field] = Math.max(look[rule.field], rule.weight);
      if (!labels.includes(rule.label)) labels.push(rule.label);
    }
  }

  // Colour-only prompts still get a sky/atmosphere, not leftover angels.
  if (labels.length === 0) {
    look.smoke = 0.45;
    look.stars = 0.35;
    look.particles = 0.4;
    look.motif = "abstract energy";
  } else {
    look.motif = labels.join(" ");
  }

  if (look.fire > 0.5 && look.particles < 0.4) look.particles = 0.55;
  if (look.grid > 0.5 && look.tunnel < 0.2) look.tunnel = 0.35;
  if (look.lightning > 0.5 && look.smoke < 0.2) look.smoke = 0.4;

  return look;
}

export function lookTags(look: LookRecipe): string[] {
  const tags: string[] = [];
  const entries: [string, number][] = [
    ["figures", look.figures],
    ["fire", look.fire],
    ["water", look.water],
    ["grid", look.grid],
    ["lightning", look.lightning],
    ["particles", look.particles],
    ["tunnel", look.tunnel],
    ["smoke", look.smoke],
    ["stars", look.stars],
  ];
  for (const [name, w] of entries) if (w >= 0.45) tags.push(name);
  return tags;
}

/** Expand a show prompt into a looping LED plate prompt (no karaoke text). */
export function platePrompt(user: string, look: LookRecipe): string {
  const tags = lookTags(look);
  return [
    "Seamless looping LED stage background, cinematic live-event content.",
    "No on-screen text, no lyrics, no logos, no UI, no watermarks.",
    "16:9, rec709, high-end festival plate, beat-friendly motion that can loop.",
    (user || "").trim(),
    tags.length ? `Motifs: ${tags.join(", ")}.` : "",
    look.palette.length ? `Colour palette: ${look.palette.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
