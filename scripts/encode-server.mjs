#!/usr/bin/env node
// Lightweight ffmpeg transcode sidecar for ProRes (and H.264 rewrap).
// NotchLC is proprietary; requests for it are encoded as ProRes 4444, the
// closest open master codec a media server will ingest.
//
//   npm run encode-server      → http://127.0.0.1:8787
//   GET  /health
//   POST /transcode?codec=prores|notchlc|h264&fps=25&bitDepth=10&color=rec709
//        body: input video bytes (mp4/webm)

import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.WORLDBOUND_ENCODE_PORT || 8787);
const HOST = process.env.WORLDBOUND_ENCODE_HOST || "127.0.0.1";

function ffmpegPath() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return "ffmpeg";
  } catch {
    return null;
  }
}

const FFMPEG = ffmpegPath();

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const isBuf = Buffer.isBuffer(data);
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "content-type": isBuf ? "application/octet-stream" : "application/json",
    ...headers,
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

function argsFor(codec, fps, bitDepth, color, input, output) {
  const common = ["-y", "-i", input, "-r", String(fps)];
  const colorArgs =
    color === "rec2020"
      ? ["-colorspace", "bt2020nc", "-color_primaries", "bt2020", "-color_trc", "bt2020-10"]
      : ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];

  if (codec === "h264") {
    const pix = bitDepth >= 10 ? "yuv420p10le" : "yuv420p";
    return [...common, "-c:v", "libx264", "-pix_fmt", pix, "-crf", "18", "-preset", "fast", ...colorArgs, output];
  }
  // prores / notchlc stand-in
  // profile 3 = HQ 422 10-bit, 4 = 4444
  const profile = bitDepth >= 12 || codec === "notchlc" ? "4" : "3";
  const pix = profile === "4" ? "yuva444p10le" : "yuv422p10le";
  return [
    ...common,
    "-c:v",
    "prores_ks",
    "-profile:v",
    profile,
    "-pix_fmt",
    pix,
    ...colorArgs,
    output,
  ];
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
    });
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-800)}`));
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "");

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { ok: true, ffmpeg: Boolean(FFMPEG) });
  }

  if (req.method === "POST" && url.pathname === "/transcode") {
    if (!FFMPEG) return send(res, 503, { error: "ffmpeg not found on PATH" });
    const codec = (url.searchParams.get("codec") || "h264").toLowerCase();
    const fps = Number(url.searchParams.get("fps") || 25);
    const bitDepth = Number(url.searchParams.get("bitDepth") || 10);
    const color = url.searchParams.get("color") || "rec709";
    const name = (url.searchParams.get("name") || "worldbound").replace(/[^\w.-]+/g, "_");

    const body = await readBody(req);
    if (!body.length) return send(res, 400, { error: "empty body" });

    const dir = mkdtempSync(join(tmpdir(), "wb-encode-"));
    const input = join(dir, "in.mp4");
    const ext = codec === "h264" ? "mp4" : "mov";
    const output = join(dir, `${name}.${ext}`);
    try {
      writeFileSync(input, body);
      await runFfmpeg(argsFor(codec, fps, bitDepth, color, input, output));
      if (!existsSync(output)) throw new Error("ffmpeg produced no output");
      const out = readFileSync(output);
      const mime = ext === "mp4" ? "video/mp4" : "video/quicktime";
      const note = codec === "notchlc" ? "notchlc-standin:prores4444" : codec;
      send(res, 200, out, {
        "content-type": mime,
        "content-disposition": `attachment; filename="${name}.${ext}"`,
        "x-worldbound-codec": note,
      });
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    return;
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Worldbound encode-server on http://${HOST}:${PORT}  ffmpeg=${FFMPEG ? "yes" : "NO"}`);
});
