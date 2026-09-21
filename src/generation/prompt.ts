// Very small, deterministic prompt parser: extracts a colour palette and a
// human-readable motif from a free-text prompt. This keeps the lightweight
// built-in generator "prompt aware" without any model dependency.

interface NamedColor {
  keys: string[];
  hex: string;
}

const COLOR_WORDS: NamedColor[] = [
  { keys: ["electric blue", "electric"], hex: "#00b3ff" },
  { keys: ["cyan", "aqua", "teal"], hex: "#22d3ee" },
  { keys: ["blue"], hex: "#2563eb" },
  { keys: ["deep blue", "navy"], hex: "#0a1a5c" },
  { keys: ["purple", "violet"], hex: "#8b5cf6" },
  { keys: ["magenta", "pink"], hex: "#ff2d78" },
  { keys: ["red", "blood", "crimson"], hex: "#ff2d55" },
  { keys: ["orange", "amber", "fire"], hex: "#ff7a1a" },
  { keys: ["gold", "golden", "yellow"], hex: "#ffd23f" },
  { keys: ["green", "toxic", "acid"], hex: "#39ff14" },
  { keys: ["white", "holy", "light"], hex: "#eaf6ff" },
  { keys: ["black", "dark", "shadow", "hell"], hex: "#070a18" },
];

const MOTIF_HINTS = [
  "angels",
  "descending",
  "hell",
  "heaven",
  "fire",
  "water",
  "clouds",
  "particles",
  "geometry",
  "grid",
  "tunnel",
  "waves",
  "smoke",
  "lightning",
  "stars",
  "nebula",
];

export interface ParsedPrompt {
  palette: string[];
  motif: string;
}

export function parsePrompt(prompt: string): ParsedPrompt {
  const lower = prompt.toLowerCase();
  const palette: string[] = [];
  for (const c of COLOR_WORDS) {
    if (c.keys.some((k) => lower.includes(k))) {
      if (!palette.includes(c.hex)) palette.push(c.hex);
    }
  }
  // Sensible default electric-blue-into-dark palette if nothing matched.
  if (palette.length === 0) palette.push("#00b3ff", "#0044ff", "#070a18");
  // Ensure enough colours for the shader ramp.
  while (palette.length < 3) palette.push("#070a18");

  const found = MOTIF_HINTS.filter((m) => lower.includes(m));
  const motif = found.length ? found.join(" ") : "abstract energy";

  return { palette: palette.slice(0, 5), motif };
}
