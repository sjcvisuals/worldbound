import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { engine } from "../render/engine";

export function PreviewPanel() {
  const screens = useStore((s) => s.screens);
  const groups = useStore((s) => s.groups);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const st = useStore.getState();
      for (const screen of st.screens) {
        const canvas = canvasRefs.current.get(screen.id);
        if (canvas) engine.readInto(screen, canvas);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="preview">
      <h3>Program Output · per screen</h3>
      <div className="preview-grid">
        {screens.map((s) => {
          const g = groups.find((x) => x.id === s.groupId);
          return (
            <div className="preview-cell" key={s.id}>
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(s.id, el);
                  else canvasRefs.current.delete(s.id);
                }}
              />
              <div className="cap">
                <span>{s.name}</span>
                <span style={{ color: g?.color }}>{g?.mode === "flat" ? "FLAT" : "3D"}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        Each tile is the final program feed for that screen — baked with its own perspective. In a 3D
        group the content is one continuous world across screens; in a flat group it is one image
        mapped across them.
      </div>
    </div>
  );
}
