import type { LookRecipe } from "../types";
import { platePrompt } from "./prompt";
import { getModel } from "./models";
import { gpuHealth, pollPlate, requestPlate, type GpuHealth } from "./gpuWorker";

export { platePrompt };

export function providerReady(health: GpuHealth, modelId: string): boolean {
  const model = getModel(modelId);
  if (model.kind === "builtin") return true;
  if (model.provider === "veo") return !!health.veo;
  if (model.provider === "seedance") return !!health.seedance;
  if (model.provider === "comfy") return !!health.comfy;
  return false;
}

export async function requestVideoPlate(opts: {
  modelId: string;
  prompt: string;
  look: LookRecipe;
  seconds: number;
  fps: number;
  seed: number;
  onStatus?: (s: string) => void;
}): Promise<string | null> {
  const model = getModel(opts.modelId);
  if (!model.provider) return null;
  const health = await gpuHealth();
  if (!providerReady(health, opts.modelId)) {
    throw new Error(
      model.provider === "veo"
        ? "Veo needs GEMINI_API_KEY on the GPU worker (`npm run gpu-worker`)."
        : model.provider === "seedance"
          ? "Seedance needs FAL_KEY on the GPU worker (`npm run gpu-worker`)."
          : "Connect ComfyUI to the GPU worker for this open-source plate model."
    );
  }
  opts.onStatus?.(`Requesting ${model.label} plate…`);
  const job = await requestPlate({
    prompt: platePrompt(opts.prompt, opts.look),
    seconds: Math.max(4, Math.min(8, Math.round(opts.seconds))),
    fps: opts.fps,
    width: 1280,
    height: 720,
    seed: opts.seed,
    model: opts.modelId,
  });
  opts.onStatus?.(`Plate job ${job.jobId} · ${job.status}`);
  const done = await pollPlate(job.jobId, (j) => {
    opts.onStatus?.(`Plate ${j.status}${j.provider ? ` · ${j.provider}` : ""}`);
  });
  if (done.status === "error" || !done.url) {
    throw new Error(done.error || "Plate job failed");
  }
  return done.url;
}
