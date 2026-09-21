#!/usr/bin/env node
// GPU plate worker — HTTP front-end to a local ComfyUI instance.
// This box does NOT need a GPU; the worker does. Point it at ComfyUI:
//
//   COMFY_URL=http://127.0.0.1:8188 WORLDBOUND_GPU_PORT=8788 npm run gpu-worker
//
// Without ComfyUI it still serves /health and returns 501 for /render so the
// UI can explain that cinema plates are the in-browser path.

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.WORLDBOUND_GPU_PORT || 8788);
const HOST = process.env.WORLDBOUND_GPU_HOST || "127.0.0.1";
const COMFY = process.env.COMFY_URL || "http://127.0.0.1:8188";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowPath = join(__dirname, "../workers/comfyui/plate_loop.json");

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
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

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    });
    return res.end();
  }
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const comfy = await comfyAlive();
    return send(res, 200, {
      ok: true,
      comfy,
      workflow: existsSync(workflowPath),
      hint: comfy
        ? "ComfyUI is reachable — POST /render to enqueue a plate."
        : "Cinema plates run in the browser. Connect ComfyUI (COMFY_URL) on a GPU box to generate diffusion plates.",
    });
  }

  if (req.method === "POST" && url.pathname === "/render") {
    const comfy = await comfyAlive();
    if (!comfy) {
      return send(res, 501, {
        error: "ComfyUI is not running",
        hint: "Worldbound cinema plates already produce high-end 2.5D content in-browser. For diffusion plates, install ComfyUI + AnimateDiff or CogVideoX on a GPU machine and restart this worker with COMFY_URL.",
      });
    }
    await readBody(req);
    // A full ComfyUI prompt enqueue would go here (load plate_loop.json, patch
    // prompt/seed/size, POST /prompt). Left as a thin 501 until a GPU box is attached.
    return send(res, 202, {
      jobId: "pending-comfy",
      status: "queued",
      note: "ComfyUI is up. Wire POST /prompt with workers/comfyui/plate_loop.json to complete this path.",
    });
  }

  if (req.method === "GET" && url.pathname === "/workflow") {
    if (!existsSync(workflowPath)) return send(res, 404, { error: "workflow missing" });
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    return res.end(readFileSync(workflowPath));
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Worldbound GPU worker on http://${HOST}:${PORT}  comfy=${COMFY}`);
});
