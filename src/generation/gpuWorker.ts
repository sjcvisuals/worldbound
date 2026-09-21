/**
 * GPU plate worker client.
 *
 * Worldbound stays a browser show-tool. High-end generated plates (AnimateDiff,
 * CogVideoX, SVD) are produced by a local ComfyUI box and returned as a looping
 * MP4/WebM "master plate". Worldbound then reprojects that plate through the
 * stage cameras — same as playing an AE render on an LED wall.
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
}

const GPU_URL = "/gpu";

export async function gpuHealth(): Promise<{ ok: boolean; comfy?: boolean }> {
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
    throw new Error(
      "GPU worker is not running. Start ComfyUI and `npm run gpu-worker` on a machine with an NVIDIA GPU."
    );
  }
  if (!r.ok) throw new Error(`GPU worker ${r.status}`);
  return r.json();
}
