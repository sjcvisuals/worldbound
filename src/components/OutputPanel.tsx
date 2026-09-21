import { useStore } from "../state/store";
import type { BitDepth, Codec, ColorProfile } from "../types";

const CODECS: { id: Codec; label: string }[] = [
  { id: "notchlc", label: "NotchLC (ideal)" },
  { id: "prores", label: "ProRes 4444" },
  { id: "h264", label: "H.264 (dev)" },
];
const PROFILES: ColorProfile[] = ["rec709", "rec2020", "srgb", "p3"];
const DEPTHS: BitDepth[] = [8, 10, 12, 16];

export function OutputPanel() {
  const output = useStore((s) => s.output);
  const update = useStore((s) => s.updateOutput);
  const screens = useStore((s) => s.screens);
  const loops = useStore((s) => s.loops);

  function exportManifest() {
    const st = useStore.getState();
    const manifest = {
      project: "worldbound",
      generatedAt: new Date().toISOString(),
      output: st.output,
      viewpoint: st.viewpoint,
      groups: st.groups,
      screens: st.screens.map((s) => ({
        id: s.id,
        name: s.name,
        group: s.groupId,
        resolution:
          st.output.resolutionMode === "custom" ? st.output.custom : s.resolution,
        position: s.position,
        rotation: s.rotation,
      })),
      loops: st.loops.map((l) => ({
        id: l.id,
        section: l.section,
        start: l.startSec,
        end: l.endSec,
        length: l.lengthSec,
        bars: l.bars,
        seamless: true,
      })),
      renderTasks: st.screens.length * st.loops.length,
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "worldbound-export-manifest.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

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
      <div className="kv">
        <span>Render tasks</span>
        <span>
          {screens.length} screens × {loops.length} loops = {screens.length * loops.length}
        </span>
      </div>
      <button className="btn grow" style={{ width: "100%", marginTop: 8 }} onClick={exportManifest} disabled={loops.length === 0}>
        Export render manifest (JSON)
      </button>
      <div className="hint" style={{ marginTop: 6 }}>
        {output.codec === "notchlc" || output.codec === "prores"
          ? `${output.codec.toUpperCase()} ${output.bitDepth}-bit encoding runs in the Worldbound render backend (ffmpeg/AVEncoder). Use H.264 for quick in-browser dev exports.`
          : `H.264 ${output.bitDepth}-bit is available for fast dev exports directly in the browser.`}
      </div>
    </div>
  );
}
