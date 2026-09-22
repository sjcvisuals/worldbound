import type { GenerationModel } from "../types";

/**
 * Built-in looks run entirely in the browser (AE-style 2.5D plates or a
 * volumetric 3D world). Video models (Veo, Seedance, ComfyUI) are optional
 * plate jobs: the GPU worker holds the keys, Worldbound maps the looping MP4
 * onto the cinema far plate and still bakes through nDisplay cameras.
 */
export const GENERATION_MODELS: GenerationModel[] = [
  {
    id: "cinema",
    label: "Cinema plates (built-in, AE-style)",
    kind: "builtin",
    available: true,
    openSource: true,
    description:
      "Prompt-driven 2.5D plates. Fire, grid, figures, water, lightning and so on only appear when the prompt asks for them — then bloom, anamorphic streak and grain, baked through nDisplay cameras.",
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
    id: "veo",
    label: "Google Veo — video plate",
    kind: "backend",
    available: false,
    openSource: false,
    provider: "veo",
    description:
      "Gemini Veo generates a looping master plate from your prompt. Worldbound maps it onto the cinema far plate and still bakes every LED camera. Needs GEMINI_API_KEY on the GPU worker.",
  },
  {
    id: "seedance",
    label: "ByteDance Seedance — video plate",
    kind: "backend",
    available: false,
    openSource: false,
    provider: "seedance",
    description:
      "Seedance 2.5 (via fal.ai) generates a cinematic looping plate. Same nDisplay bake as cinema. Needs FAL_KEY on the GPU worker.",
  },
  {
    id: "animatediff",
    label: "AnimateDiff (SD 1.5) — open source GPU",
    kind: "backend",
    available: false,
    openSource: true,
    provider: "comfy",
    description:
      "Text-to-looping-video via ComfyUI. Generates a master plate, then Worldbound reprojects it through the stage cameras. Needs the GPU worker + ComfyUI.",
  },
  {
    id: "svd",
    label: "Stable Video Diffusion — open source GPU",
    kind: "backend",
    available: false,
    openSource: true,
    provider: "comfy",
    description:
      "Image-to-video diffusion for photoreal plate motion. GPU worker + ComfyUI.",
  },
  {
    id: "cogvideox",
    label: "CogVideoX — open source GPU",
    kind: "backend",
    available: false,
    openSource: true,
    provider: "comfy",
    description:
      "Higher-end open text-to-video. Best current open-source path toward AE-grade generated plates. GPU worker.",
  },
];

export function getModel(id: string): GenerationModel {
  return GENERATION_MODELS.find((m) => m.id === id) ?? GENERATION_MODELS[0];
}
