/**
 * GPU plate worker client.
 *
 * Worldbound stays a browser show-tool. High-end generated plates (Veo,
 * Seedance, AnimateDiff, CogVideoX, SVD) are produced by the GPU worker and
 * returned as a looping MP4 "master plate". Worldbound then maps that plate
 * onto the cinema far layer and reprojects it through the stage cameras —
 * same as playing an AE render on an LED wall.
 *
 * Keys never leave the worker:
 *   GEMINI_API_KEY  → Google Veo
 *   FAL_KEY         → ByteDance Seedance (fal.ai)
 *   COMFY_URL       → local ComfyUI
 *
 * Contract: POST {WORLDBOUND_GPU_URL}/render
 *   body: { prompt, seconds, fps, width, height, seed, model }
 *   202 + { jobId } then GET /render/:jobId until { status: "done", url }
 */

export interface GpuRenderRequest {
  prompt: string;
  seconds: number;
  fps: number;
  width: number;
  height: number;
  seed: number;
  model: string;
}

export interface GpuJob {
  jobId: string;
  status: "queued" | "running" | "done" | "error";
  url?: string;
  error?: string;
  provider?: string;
}

export interface GpuHealth {
  ok: boolean;
  comfy?: boolean;
  veo?: boolean;
  seedance?: boolean;
  hint?: string;
}

const GPU_URL = "/gpu";

export async function gpuHealth(): Promise<GpuHealth> {
  try {
    const r = await fetch(`${GPU_URL}/health`);
    if (!r.ok) return { ok: false };
    return r.json();
  } catch {
    return { ok: false };
  }
}

export async function requestPlate(req: GpuRenderRequest): Promise<GpuJob> {
  const r = await fetch(`${GPU_URL}/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (r.status === 501 || r.status === 503) {
    const body = await r.json().catch(() => ({}));
    throw new Error(
      (body as { hint?: string; error?: string }).hint ||
        (body as { error?: string }).error ||
        "GPU worker cannot run that provider. Cinema plates stay in the browser."
    );
  }
  if (!r.ok) throw new Error(`GPU worker ${r.status}`);
  return r.json();
}

export async function getPlateJob(jobId: string): Promise<GpuJob> {
  const r = await fetch(`${GPU_URL}/render/${encodeURIComponent(jobId)}`);
  if (!r.ok) throw new Error(`GPU worker ${r.status}`);
  return r.json();
}

export async function pollPlate(
  jobId: string,
  onTick?: (job: GpuJob) => void,
  { intervalMs = 4000, attempts = 90 } = {}
): Promise<GpuJob> {
  for (let i = 0; i < attempts; i++) {
    const job = await getPlateJob(jobId);
    onTick?.(job);
    if (job.status === "done" || job.status === "error") return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Plate job timed out");
}
