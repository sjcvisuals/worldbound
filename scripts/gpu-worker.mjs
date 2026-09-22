#!/usr/bin/env node
// GPU plate worker — HTTP front-end to Veo, Seedance (fal.ai), and ComfyUI.
// Keys stay on this process, never in the browser.
//
//   GEMINI_API_KEY=...            Google Veo (Gemini API)
//   FAL_KEY=...                   ByteDance Seedance via fal.ai
//   COMFY_URL=http://127.0.0.1:8188
//   WORLDBOUND_GPU_PORT=8788 npm run gpu-worker
//
// Without keys it still serves /health and returns 501 for /render so the UI
// can keep using in-browser cinema plates.

import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.WORLDBOUND_GPU_PORT || 8788);
const HOST = process.env.WORLDBOUND_GPU_HOST || "127.0.0.1";
const COMFY = process.env.COMFY_URL || "http://127.0.0.1:8188";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const FAL_KEY = process.env.FAL_KEY || "";
const VEO_MODEL = process.env.VEO_MODEL || "veo-3.1-generate-preview";
const SEEDANCE_MODEL = process.env.SEEDANCE_MODEL || "bytedance/seedance-2.5/text-to-video";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowPath = join(__dirname, "../workers/comfyui/plate_loop.json");
const PLATE_DIR = join(tmpdir(), "worldbound-plates");
mkdirSync(PLATE_DIR, { recursive: true });

/** @type {Map<string, { jobId: string, status: string, url?: string, error?: string, provider?: string }>} */
const jobs = new Map();

function cors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  cors(res);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function comfyAlive() {
  try {
    const r = await fetch(`${COMFY}/system_stats`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch {
    return false;
  }
}

function providerOf(model) {
  const id = String(model || "").toLowerCase();
  if (id.includes("veo")) return "veo";
  if (id.includes("seedance") || id.includes("bytedance")) return "seedance";
  if (id.includes("animate") || id.includes("svd") || id.includes("cogvideo") || id.includes("comfy")) {
    return "comfy";
  }
  return id || "unknown";
}

function newJob(provider) {
  const jobId = randomUUID().slice(0, 12);
  const job = { jobId, status: "queued", provider };
  jobs.set(jobId, job);
  return job;
}

function setJob(jobId, patch) {
  const cur = jobs.get(jobId);
  if (!cur) return;
  Object.assign(cur, patch);
}

async function savePlate(jobId, bytes, ext = ".mp4") {
  const name = `${jobId}${ext}`;
  writeFileSync(join(PLATE_DIR, name), bytes);
  return `/gpu/plates/${name}`;
}

async function downloadBytes(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`download ${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function runVeo(jobId, body) {
  setJob(jobId, { status: "running" });
  const prompt = body.prompt || "";
  const duration = Math.max(4, Math.min(8, Number(body.seconds) || 8));
  const start = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:predictLongRunning?key=${encodeURIComponent(GEMINI_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio: "16:9",
          durationSeconds: duration,
        },
      }),
    }
  );
  const started = await start.json();
  if (!start.ok) {
    throw new Error(started.error?.message || `Veo start ${start.status}`);
  }
  const opName = started.name;
  if (!opName) throw new Error("Veo did not return an operation name");

  let op = started;
  for (let i = 0; i < 90; i++) {
    if (op.done) break;
    await new Promise((r) => setTimeout(r, 4000));
    const poll = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${encodeURIComponent(GEMINI_KEY)}`
    );
    op = await poll.json();
    if (!poll.ok) throw new Error(op.error?.message || `Veo poll ${poll.status}`);
  }
  if (!op.done) throw new Error("Veo timed out");
  if (op.error) throw new Error(op.error.message || "Veo operation failed");

  const samples =
    op.response?.generateVideoResponse?.generatedSamples ||
    op.response?.generateVideoResponse?.generatedVideos ||
    [];
  const sample = samples[0];
  const uri = sample?.video?.uri || sample?.video?.videoUri;
  const b64 = sample?.video?.bytesBase64Encoded;
  let bytes;
  if (b64) {
    bytes = Buffer.from(b64, "base64");
  } else if (uri) {
    const sep = uri.includes("?") ? "&" : "?";
    bytes = await downloadBytes(`${uri}${sep}key=${encodeURIComponent(GEMINI_KEY)}`);
  } else {
    throw new Error("Veo finished without a video URI");
  }
  const url = await savePlate(jobId, bytes);
  setJob(jobId, { status: "done", url });
}

async function runSeedance(jobId, body) {
  setJob(jobId, { status: "running" });
  const prompt = body.prompt || "";
  const duration = String(Math.max(4, Math.min(8, Number(body.seconds) || 8)));
  const submit = await fetch(`https://queue.fal.run/${SEEDANCE_MODEL}`, {
    method: "POST",
    headers: {
      authorization: `Key ${FAL_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      duration,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: false,
      seed: body.seed,
    }),
  });
  const queued = await submit.json();
  if (!submit.ok) {
    throw new Error(queued.detail || queued.error || `Seedance start ${submit.status}`);
  }
  const statusUrl = queued.status_url;
  const responseUrl = queued.response_url;
  if (!statusUrl || !responseUrl) throw new Error("Seedance did not return queue URLs");

  for (let i = 0; i < 90; i++) {
    const st = await fetch(statusUrl, { headers: { authorization: `Key ${FAL_KEY}` } });
    const payload = await st.json();
    if (!st.ok) throw new Error(payload.detail || `Seedance poll ${st.status}`);
    const status = String(payload.status || "").toUpperCase();
    if (status === "COMPLETED") break;
    if (status === "FAILED" || status === "CANCELLED") {
      throw new Error(payload.error || `Seedance ${status.toLowerCase()}`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }

  const done = await fetch(responseUrl, { headers: { authorization: `Key ${FAL_KEY}` } });
  const result = await done.json();
  if (!done.ok) throw new Error(result.detail || `Seedance result ${done.status}`);
  const videoUrl = result.video?.url || result.data?.video?.url;
  if (!videoUrl) throw new Error("Seedance finished without a video URL");
  const bytes = await downloadBytes(videoUrl);
  const url = await savePlate(jobId, bytes);
  setJob(jobId, { status: "done", url });
}

function startJob(provider, body) {
  const job = newJob(provider);
  const run =
    provider === "veo" ? runVeo : provider === "seedance" ? runSeedance : null;
  if (!run) {
    setJob(job.jobId, {
      status: "error",
      error: "ComfyUI enqueue is still a stub — use cinema, Veo, or Seedance.",
    });
    return job;
  }
  run(job.jobId, body).catch((err) => {
    setJob(job.jobId, { status: "error", error: err.message || String(err) });
  });
  return job;
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const comfy = await comfyAlive();
    const veo = Boolean(GEMINI_KEY);
    const seedance = Boolean(FAL_KEY);
    return send(res, 200, {
      ok: true,
      comfy,
      veo,
      seedance,
      workflow: existsSync(workflowPath),
      hint: veo || seedance || comfy
        ? "POST /render with model veo | seedance | animatediff."
        : "Cinema plates run in the browser. Set GEMINI_API_KEY (Veo) and/or FAL_KEY (Seedance) on this worker, or connect ComfyUI.",
    });
  }

  if (req.method === "POST" && url.pathname === "/render") {
    const raw = await readBody(req);
    let body = {};
    try {
      body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    } catch {
      return send(res, 400, { error: "invalid json" });
    }
    const provider = providerOf(body.model);
    if (provider === "veo" && !GEMINI_KEY) {
      return send(res, 501, {
        error: "Veo is not configured",
        hint: "Set GEMINI_API_KEY on the GPU worker. Cinema plates already match the prompt in-browser.",
      });
    }
    if (provider === "seedance" && !FAL_KEY) {
      return send(res, 501, {
        error: "Seedance is not configured",
        hint: "Set FAL_KEY on the GPU worker (fal.ai). Cinema plates already match the prompt in-browser.",
      });
    }
    if (provider === "comfy") {
      const comfy = await comfyAlive();
      if (!comfy) {
        return send(res, 501, {
          error: "ComfyUI is not running",
          hint: "Worldbound cinema plates already produce high-end 2.5D content in-browser. For diffusion plates, install ComfyUI + AnimateDiff or CogVideoX on a GPU machine and restart this worker with COMFY_URL.",
        });
      }
      const job = newJob("comfy");
      setJob(job.jobId, {
        status: "error",
        error:
          "ComfyUI is up. Wire POST /prompt with workers/comfyui/plate_loop.json to complete this path.",
      });
      return send(res, 202, job);
    }
    if (provider !== "veo" && provider !== "seedance") {
      return send(res, 501, {
        error: `Unknown plate model ${body.model || "(none)"}`,
        hint: "Use model: veo | seedance | animatediff. Cinema plates do not need this worker.",
      });
    }
    const job = startJob(provider, body);
    return send(res, 202, job);
  }

  if (req.method === "GET" && url.pathname.startsWith("/render/")) {
    const jobId = url.pathname.slice("/render/".length);
    const job = jobs.get(jobId);
    if (!job) return send(res, 404, { error: "unknown job" });
    return send(res, 200, job);
  }

  if (req.method === "GET" && url.pathname.startsWith("/plates/")) {
    const name = url.pathname.slice("/plates/".length);
    if (!name || name.includes("/") || name.includes("..")) {
      return send(res, 400, { error: "bad plate id" });
    }
    const file = join(PLATE_DIR, name);
    if (!existsSync(file)) return send(res, 404, { error: "plate missing" });
    const mime = extname(file) === ".webm" ? "video/webm" : "video/mp4";
    cors(res);
    res.writeHead(200, { "content-type": mime });
    return createReadStream(file).pipe(res);
  }

  if (req.method === "GET" && url.pathname === "/workflow") {
    if (!existsSync(workflowPath)) return send(res, 404, { error: "workflow missing" });
    cors(res);
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(readFileSync(workflowPath));
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(
    `Worldbound GPU worker on http://${HOST}:${PORT}  veo=${Boolean(GEMINI_KEY)} seedance=${Boolean(FAL_KEY)} comfy=${COMFY}`
  );
});
