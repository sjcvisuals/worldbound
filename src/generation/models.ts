import type { GenerationModel } from "../types";

/**
 * Built-in looks run entirely in the browser (AE-style 2.5D plates or a
 * volumetric 3D world). Diffusion video models are GPU-backend jobs: the UI
 * can target them, and `scripts/gpu-worker.mjs` is the contract for a ComfyUI
 * box when you have one.
 */
export const GENERATION_MODELS: GenerationModel[] = [
  {
    id: "cinema",
    label: "Cinema plates (built-in, AE-style)",
    kind: "builtin",
    available: true,
    openSource: true,
    description:
      "High-end 2.5D plates — nebula, descending angels, embers — stacked in depth like an After Effects comp, then baked through your screens with nDisplay cameras. Bloom, anamorphic streak, grain. The live-event default.",
  },
  {
    id: "volumetric",
    label: "Volumetric 3D world (built-in)",
    kind: "builtin",
    available: true,
    openSource: true,
    description:
      "Notch-like 3D particle/volume world. Screens are windows into one volume. Lighter look, useful for previz of true 3D content.",
  },
  {
    id: "animatediff",
    label: "AnimateDiff (SD 1.5) — open source GPU",
    kind: "backend",
    available: false,
    openSource: true,
    description:
      "Text-to-looping-video via ComfyUI. Generates a master plate, then Worldbound reprojects it through the stage cameras. Needs the GPU worker.",
  },
  {
    id: "svd",
    label: "Stable Video Diffusion — open source GPU",
    kind: "backend",
    available: false,
    openSource: true,
    description:
      "Image-to-video diffusion for photoreal plate motion. GPU worker + ComfyUI.",
  },
  {
    id: "cogvideox",
    label: "CogVideoX — open source GPU",
    kind: "backend",
    available: false,
    openSource: true,
    description:
      "Higher-end open text-to-video. Best current open-source path toward AE-grade generated plates. GPU worker.",
  },
];

export function getModel(id: string): GenerationModel {
  return GENERATION_MODELS.find((m) => m.id === id) ?? GENERATION_MODELS[0];
}
