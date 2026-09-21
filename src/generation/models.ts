import type { GenerationModel } from "../types";

/**
 * Available generation models. Everything shippable in the lightweight browser
 * session is a built-in, real-time procedural generator. Heavier open-source
 * diffusion / video models are listed as backend models: the architecture is
 * ready to drive them from a render service, and they're marked unavailable
 * until that backend is connected.
 */
export const GENERATION_MODELS: GenerationModel[] = [
  {
    id: "procedural",
    label: "Worldbound Procedural (built-in)",
    kind: "builtin",
    available: true,
    openSource: true,
    description:
      "Real-time GLSL generator. Beat-synced, theme-aware, zero dependencies. Ideal lightweight default for previz and live use.",
  },
  {
    id: "animatediff",
    label: "AnimateDiff (SD 1.5) — open source",
    kind: "backend",
    available: false,
    openSource: true,
    description:
      "Text-to-video motion module over Stable Diffusion 1.5. Great for stylised loopable motion. Requires the Worldbound render backend (GPU).",
  },
  {
    id: "svd",
    label: "Stable Video Diffusion — open source",
    kind: "backend",
    available: false,
    openSource: true,
    description:
      "Image-to-video diffusion for photoreal motion. Requires the Worldbound render backend (GPU).",
  },
  {
    id: "deforum",
    label: "Deforum (SD) — open source",
    kind: "backend",
    available: false,
    openSource: true,
    description:
      "Keyframe-driven diffusion animation with camera moves. Excellent for evolving, seamless loops. Requires the render backend (GPU).",
  },
];

export function getModel(id: string): GenerationModel {
  return GENERATION_MODELS.find((m) => m.id === id) ?? GENERATION_MODELS[0];
}
