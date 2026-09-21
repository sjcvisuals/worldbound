import { Muxer, ArrayBufferTarget } from "mp4-muxer";

function pickAvcCodec(width: number, height: number): string {
  const pixels = width * height;
  return pixels > 1920 * 1080 ? "avc1.640032" : "avc1.640028";
}

export async function encodeH264Mp4(opts: {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  renderFrame: (i: number) => Promise<ImageData> | ImageData;
  onProgress?: (i: number) => void;
}): Promise<Uint8Array> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("WebCodecs VideoEncoder is not available in this browser.");
  }
  const { width, height, fps, frameCount, renderFrame, onProgress } = opts;
  if (frameCount <= 0) throw new Error("No frames to encode.");
  const codec = pickAvcCodec(width, height);
  const bitrate = Math.max(2_000_000, Math.round(width * height * fps * 0.08));

  const support = await VideoEncoder.isConfigSupported({
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
    avc: { format: "avc" },
  });
  if (!support.supported) {
    throw new Error(`H.264 ${width}×${height} @ ${fps}fps is not supported by WebCodecs here.`);
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: fps },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
    },
  });
  encoder.configure({
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
    avc: { format: "avc" },
    latencyMode: "quality",
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2D context for encoder.");

  for (let i = 0; i < frameCount; i++) {
    const img = await renderFrame(i);
    ctx.putImageData(img, 0, 0);
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    encoder.encode(frame, { keyFrame: i % Math.max(1, fps) === 0 });
    frame.close();
    if (encoderError) throw encoderError;
    onProgress?.(i + 1);
    if (encoder.encodeQueueSize > 8) {
      await new Promise<void>((resolve) => {
        encoder.ondequeue = () => resolve();
      });
    }
    // Yield so the UI can paint progress.
    if (i % 4 === 0) await new Promise((r) => requestAnimationFrame(() => r(null)));
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();
  if (!target.buffer) throw new Error("Muxer produced an empty buffer.");
  return new Uint8Array(target.buffer);
}
