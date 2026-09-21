import type { WebGLRenderer } from "three";
import { engine } from "./engine";
import { encodeH264Mp4 } from "./encodeMp4";
import { outputSize, slug } from "./outputSize";
import { zipStore } from "./zipStore";
import { useStore } from "../state/store";
import type {
  AudioAnalysis,
  ContentLoop,
  ExportQuality,
  ExportScope,
  ExportedClip,
  OutputSettings,
  Screen,
} from "../types";

const QUICK_SECONDS = 4;

export function listExportJobs(
  screens: Screen[],
  loops: ContentLoop[],
  playhead: number,
  scope: ExportScope
): { screen: Screen; loop: ContentLoop; duration: number }[] {
  if (!loops.length) return [];
  let chosen: ContentLoop[] = [];
  if (scope === "all") chosen = loops;
  else {
    const current =
      loops.find((l) => playhead >= l.startSec && playhead < l.endSec) ?? loops[0];
    chosen = [current];
  }
  const jobs: { screen: Screen; loop: ContentLoop; duration: number }[] = [];
  for (const loop of chosen) {
    const duration = scope === "quick" ? Math.min(QUICK_SECONDS, loop.lengthSec) : loop.lengthSec;
    for (const screen of screens) jobs.push({ screen, loop, duration });
  }
  return jobs;
}

function beatAt(analysis: AudioAnalysis | null, t: number, dt: number): number {
  if (!analysis) return 0;
  for (const b of analysis.beats) {
    if (b >= t && b < t + dt) return 1;
  }
  return 0;
}

function energyAt(analysis: AudioAnalysis | null, t: number): number {
  if (!analysis) return 0.4;
  const f = Math.floor(t * analysis.envelopeHz);
  return analysis.envelope[Math.max(0, Math.min(analysis.envelope.length - 1, f))] ?? 0.4;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function maybeTranscode(
  bytes: Uint8Array,
  filename: string,
  output: OutputSettings
): Promise<{ bytes: Uint8Array; filename: string }> {
  if (output.codec === "h264") return { bytes, filename };
  try {
    const params = new URLSearchParams({
      codec: output.codec,
      fps: String(output.fps),
      bitDepth: String(output.bitDepth),
      color: output.colorProfile,
      name: filename.replace(/\.mp4$/i, ""),
    });
    const res = await fetch(`/encode/transcode?${params}`, {
      method: "POST",
      headers: { "content-type": "video/mp4" },
      body: toArrayBuffer(bytes),
    });
    if (!res.ok) throw new Error(`encode-server ${res.status}`);
    const out = new Uint8Array(await res.arrayBuffer());
    return { bytes: out, filename: filename.replace(/\.mp4$/i, ".mov") };
  } catch {
    // Server optional — keep the in-browser H.264 when ProRes/NotchLC backend is down.
    return { bytes, filename };
  }
}

export async function runExport(opts: {
  gl: WebGLRenderer;
  quality: ExportQuality;
  scope: ExportScope;
}): Promise<ExportedClip[]> {
  const st = useStore.getState();
  const jobs = listExportJobs(st.screens, st.loops, st.playhead, opts.scope);
  if (!jobs.length) throw new Error("Generate loops first.");

  const fps = st.output.fps || 25;
  const analysis = st.audio?.analysis ?? null;
  const totalFrames = jobs.reduce(
    (n, j) => n + Math.max(1, Math.round(j.duration * fps)),
    0
  );

  st.setExportProgress({ active: true, label: "Starting…", current: 0, total: totalFrames, error: null });
  st.setPlaying(false);

  const clips: ExportedClip[] = [];
  const zipFiles: { name: string; data: Uint8Array }[] = [];
  let doneFrames = 0;

  try {
    for (const job of jobs) {
      const { width, height } = outputSize(job.screen, st.output, opts.quality);
      const frameCount = Math.max(1, Math.round(job.duration * fps));
      const image = new ImageData(width, height);

      st.setExportProgress({
        active: true,
        label: `${job.screen.name} · ${job.loop.id} (${width}×${height})`,
        current: doneFrames,
        total: totalFrames,
      });

      engine.setLook(st.generation.visualEngine === "volumetric" ? "volumetric" : "cinema");
      engine.world.applyLoopVisual(job.loop.visual);

      const mp4 = await encodeH264Mp4({
        width,
        height,
        fps,
        frameCount,
        onProgress: (i) => {
          useStore.getState().setExportProgress({
            current: doneFrames + i,
            label: `${job.screen.name} · ${job.loop.id}  ${i}/${frameCount}`,
          });
        },
        renderFrame: (i) => {
          const t = (i / fps) % job.loop.lengthSec;
          const worldT = job.loop.startSec + t;
          engine.world.setTime(t, job.loop.lengthSec);
          engine.world.setPulse(energyAt(analysis, worldT), beatAt(analysis, worldT, 1 / fps));
          engine.setLyricsFrame({
            enabled: st.lyrics.enabled,
            mode: st.lyrics.mode,
            lines: st.lyrics.lines,
            playhead: worldT,
            karaoke: st.lyrics.karaoke,
            showNext: st.lyrics.showNext,
            fill: job.loop.visual.palette[0] ?? "#00b3ff",
            beat: beatAt(analysis, worldT, 1 / fps),
          });
          engine.renderExportFrame(
            opts.gl,
            job.screen,
            st.screens,
            st.groups,
            st.viewpoint,
            width,
            height,
            image.data as Uint8ClampedArray
          );
          return image;
        },
      });

      doneFrames += frameCount;
      const baseName = `${slug(job.screen.name)}_${job.loop.id}_${width}x${height}_${fps}fps.mp4`;
      const transcoded = await maybeTranscode(mp4, baseName, st.output);
      zipFiles.push({ name: transcoded.filename, data: transcoded.bytes });

      const blob = new Blob([toArrayBuffer(transcoded.bytes)], {
        type: transcoded.filename.endsWith(".mov") ? "video/quicktime" : "video/mp4",
      });
      clips.push({
        id: `${job.screen.id}-${job.loop.id}-${opts.quality}`,
        screenId: job.screen.id,
        screenName: job.screen.name,
        loopId: job.loop.id,
        filename: transcoded.filename,
        url: URL.createObjectURL(blob),
        size: transcoded.bytes.byteLength,
        width,
        height,
        duration: job.duration,
      });
    }

    if (zipFiles.length > 1) {
      const zip = zipStore(zipFiles);
      const zipBlob = new Blob([toArrayBuffer(zip)], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(zipBlob);
      a.download = `worldbound-loops-${opts.quality}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } else if (clips[0]) {
      const a = document.createElement("a");
      a.href = clips[0].url;
      a.download = clips[0].filename;
      a.click();
    }

    st.addExportedClips(clips);
    st.setExportProgress({ active: false, label: `Wrote ${clips.length} clip(s)`, current: totalFrames, total: totalFrames });
    return clips;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    useStore.getState().setExportProgress({ active: false, error: msg, label: "Export failed" });
    throw e;
  }
}
