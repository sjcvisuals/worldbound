import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { engine } from "../render/engine";
import { runExport } from "../render/exportPipeline";
import type { BitDepth, Codec, ColorProfile, ExportQuality, ExportScope } from "../types";

const CODECS: { id: Codec; label: string }[] = [
  { id: "notchlc", label: "NotchLC (ProRes stand-in)" },
  { id: "prores", label: "ProRes 422 HQ" },
  { id: "h264", label: "H.264 (dev / in-browser)" },
];
const PROFILES: ColorProfile[] = ["rec709", "rec2020", "srgb", "p3"];
const DEPTHS: BitDepth[] = [8, 10, 12, 16];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function OutputPanel() {
  const output = useStore((s) => s.output);
  const update = useStore((s) => s.updateOutput);
  const screens = useStore((s) => s.screens);
  const loops = useStore((s) => s.loops);
  const progress = useStore((s) => s.exportProgress);
  const clips = useStore((s) => s.exportedClips);
  const clearClips = useStore((s) => s.clearExportedClips);
  const [quality, setQuality] = useState<ExportQuality>("preview");
  const [scope, setScope] = useState<ExportScope>("quick");
  const [server, setServer] = useState<"unknown" | "up" | "down">("unknown");

  useEffect(() => {
    fetch("/encode/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setServer(j?.ffmpeg ? "up" : "down"))
      .catch(() => setServer("down"));
  }, []);

  async function render() {
    const gl = engine.getRenderer();
    if (!gl) {
      useStore.getState().setExportProgress({
        active: false,
        error: "Renderer is not ready yet — wait for the 3D stage to load.",
        label: "Export failed",
      });
      return;
    }
    try {
      await runExport({ gl, quality, scope });
    } catch {
      /* progress.error already set */
    }
  }

  const jobCount =
    (scope === "all" ? loops.length : loops.length ? 1 : 0) * screens.length;

  return (
    <div className="section">
      <h3>Output Settings</h3>
      <div className="row">
        <label>Resolution</label>
        <div className="toggle">
          <button
            className={output.resolutionMode === "locked" ? "on" : ""}
            onClick={() => update({ resolutionMode: "locked" })}
          >
            Locked to screens
          </button>
          <button
            className={output.resolutionMode === "custom" ? "on" : ""}
            onClick={() => update({ resolutionMode: "custom" })}
          >
            Custom
          </button>
        </div>
      </div>
      {output.resolutionMode === "custom" && (
        <div className="row">
          <label>W × H</label>
          <input
            type="number"
            value={output.custom.width}
            onChange={(e) => update({ custom: { ...output.custom, width: parseInt(e.target.value) || 1 } })}
          />
          <input
            type="number"
            value={output.custom.height}
            onChange={(e) => update({ custom: { ...output.custom, height: parseInt(e.target.value) || 1 } })}
          />
        </div>
      )}

      <div className="row">
        <label>Frame rate</label>
        <select value={output.fps} onChange={(e) => update({ fps: parseInt(e.target.value) })}>
          {[24, 25, 30, 50, 60].map((f) => (
            <option key={f} value={f}>
              {f} fps
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>Colour</label>
        <select value={output.colorProfile} onChange={(e) => update({ colorProfile: e.target.value as ColorProfile })}>
          {PROFILES.map((p) => (
            <option key={p} value={p}>
              {p.toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>Codec</label>
        <select value={output.codec} onChange={(e) => update({ codec: e.target.value as Codec })}>
          {CODECS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>Bit depth</label>
        <select value={output.bitDepth} onChange={(e) => update({ bitDepth: parseInt(e.target.value) as BitDepth })}>
          {DEPTHS.map((d) => (
            <option key={d} value={d}>
              {d}-bit
            </option>
          ))}
        </select>
      </div>

      <div className="divider" />
      <h3>Render usable graphics</h3>
      <div className="row">
        <label>Quality</label>
        <select value={quality} onChange={(e) => setQuality(e.target.value as ExportQuality)}>
          <option value="preview">Preview (max 960)</option>
          <option value="delivery">Delivery (max 1920)</option>
          <option value="full">Full (locked / up to 4K)</option>
        </select>
      </div>
      <div className="row">
        <label>Scope</label>
        <select value={scope} onChange={(e) => setScope(e.target.value as ExportScope)}>
          <option value="quick">Quick clip (4s of current loop)</option>
          <option value="current">Current loop, full length</option>
          <option value="all">All loops × all screens</option>
        </select>
      </div>
      <div className="kv">
        <span>Clips</span>
        <span>{jobCount}</span>
      </div>
      <div className="kv">
        <span>Encode server</span>
        <span>{server === "up" ? "ffmpeg ready" : server === "down" ? "offline (H.264 in-browser)" : "…"}</span>
      </div>
      <button
        className="btn primary"
        style={{ width: "100%", marginTop: 8 }}
        onClick={render}
        disabled={loops.length === 0 || progress.active}
      >
        {progress.active ? "Rendering…" : "Render usable graphics"}
      </button>
      {(progress.active || progress.label) && (
        <div className="gen-status">
          {progress.label}
          {progress.total > 0 && progress.active && (
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
      {progress.error && <div className="hint" style={{ color: "var(--danger)" }}>{progress.error}</div>}
      <div className="hint" style={{ marginTop: 6 }}>
        {output.codec === "h264" || server === "down"
          ? "In-browser H.264 via WebCodecs, baked with each screen's perspective. Start `npm run encode-server` for ProRes / NotchLC-stand-in."
          : "H.264 is encoded in-browser then transcoded by ffmpeg to ProRes (NotchLC requests become ProRes 4444)."}
      </div>

      {clips.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="row">
            <span className="hint">{clips.length} clip(s)</span>
            <button className="btn sm" onClick={clearClips}>
              Clear
            </button>
          </div>
          {clips.map((c) => (
            <div key={c.id} className="clip-row">
              <a href={c.url} download={c.filename}>
                {c.filename}
              </a>
              <span className="hint">
                {c.width}×{c.height} · {fmtBytes(c.size)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
