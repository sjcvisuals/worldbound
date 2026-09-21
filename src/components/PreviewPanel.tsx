import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { engine } from "../render/engine";
import { liveOutputs } from "../live/outputs";
import type { Screen } from "../types";

export function PreviewPanel() {
  const screens = useStore((s) => s.screens);
  const groups = useStore((s) => s.groups);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const liveCount = useRef(0);
  const [liveTick, setLiveTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const st = useStore.getState();
      for (const screen of st.screens) {
        const canvas = canvasRefs.current.get(screen.id);
        if (canvas) engine.readInto(screen, canvas);
      }
      liveOutputs.pump(st.screens);
      if (liveOutputs.size !== liveCount.current) {
        liveCount.current = liveOutputs.size;
        setLiveTick((n) => n + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function popOut(screen: Screen) {
    const ok = liveOutputs.open(screen);
    setError(ok ? null : liveOutputs.lastError);
    setLiveTick((n) => n + 1);
  }

  function popOutAll() {
    const ok = liveOutputs.openAll(screens);
    setError(ok ? null : liveOutputs.lastError);
    setLiveTick((n) => n + 1);
  }

  function fullscreen(screenId: string) {
    const canvas = canvasRefs.current.get(screenId);
    const cell = canvas?.closest(".preview-cell") as HTMLElement | null;
    const el = cell ?? canvas;
    if (!el) return;
    if (document.fullscreenElement === el) document.exitFullscreen().catch(() => undefined);
    else el.requestFullscreen().catch(() => undefined);
  }

  void liveTick;

  return (
    <div className="preview">
      <div className="preview-head">
        <h3>Program Output · per screen</h3>
        <button className="btn sm" onClick={popOutAll} title="Open a live window per wall — window-capture in OBS / Resolume">
          Pop out all
        </button>
      </div>
      <div className="preview-grid">
        {screens.map((s) => {
          const g = groups.find((x) => x.id === s.groupId);
          const live = liveOutputs.isOpen(s.id);
          return (
            <div className={`preview-cell${live ? " live" : ""}`} key={s.id}>
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(s.id, el);
                  else canvasRefs.current.delete(s.id);
                }}
                onDoubleClick={() => fullscreen(s.id)}
                title="Double-click for fullscreen"
              />
              <div className="cap">
                <span>{s.name}</span>
                <span style={{ color: g?.color }}>{g?.mode === "flat" ? "FLAT" : "3D"}</span>
              </div>
              <div className="preview-actions">
                {live && <span className="live-dot">LIVE</span>}
                <button className="btn sm" onClick={() => popOut(s)} title="Pop out this feed">
                  Live
                </button>
                <button className="btn sm" onClick={() => fullscreen(s.id)} title="Fullscreen this tile">
                  Full
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <div className="hint" style={{ marginTop: 8, color: "var(--danger)" }}>
          {error}
        </div>
      )}
      <div className="hint" style={{ marginTop: 8 }}>
        Each tile is the final program feed for that screen — baked with its own perspective.
        <b> Live</b> pops out a capture window (web stand-in for NDI/Spout). Double-click or{" "}
        <b>Full</b> for fullscreen. In a live window: <b>F</b> fullscreen, <b>H</b> hide label.
      </div>
    </div>
  );
}
