import type { ExportQuality, OutputSettings, Screen } from "../types";

/** Resolution used for a given screen at the chosen quality cap. */
export function outputSize(
  screen: Screen,
  output: OutputSettings,
  quality: ExportQuality
): { width: number; height: number } {
  const native =
    output.resolutionMode === "custom" ? output.custom : screen.resolution;
  const cap = quality === "preview" ? 960 : quality === "delivery" ? 1920 : 3840;
  const long = Math.max(native.width, native.height);
  if (long <= cap) {
    return {
      width: even(Math.max(2, native.width)),
      height: even(Math.max(2, native.height)),
    };
  }
  const s = cap / long;
  return {
    width: even(Math.max(2, Math.round(native.width * s))),
    height: even(Math.max(2, Math.round(native.height * s))),
  };
}

function even(n: number): number {
  return n % 2 === 0 ? n : n + 1;
}

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "screen";
}
