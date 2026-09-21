import { useStore } from "../state/store";
import { Vec3Row } from "./ui";

export function ScreenInspector() {
  const screen = useStore((s) => s.screens.find((x) => x.id === s.selectedScreenId));
  const update = useStore((s) => s.updateScreen);
  const duplicate = useStore((s) => s.duplicateScreen);
  const remove = useStore((s) => s.removeScreen);

  if (!screen) {
    return (
      <div className="section">
        <h3>Screen Inspector</h3>
        <div className="hint">Select a screen in the stage or the list to edit it.</div>
      </div>
    );
  }

  return (
    <div className="section">
      <h3>Screen · {screen.name}</h3>
      <div className="row">
        <label>Name</label>
        <input type="text" value={screen.name} onChange={(e) => update(screen.id, { name: e.target.value })} />
      </div>

      <div className="group-head">Resolution (px)</div>
      <div className="row">
        <label>W × H</label>
        <input
          type="number"
          value={screen.resolution.width}
          onChange={(e) =>
            update(screen.id, { resolution: { ...screen.resolution, width: parseInt(e.target.value) || 1 } })
          }
        />
        <input
          type="number"
          value={screen.resolution.height}
          onChange={(e) =>
            update(screen.id, { resolution: { ...screen.resolution, height: parseInt(e.target.value) || 1 } })
          }
        />
      </div>

      <div className="group-head">Physical size (m)</div>
      <div className="row">
        <label>W × H</label>
        <input
          type="number"
          step={0.1}
          value={screen.size.width}
          onChange={(e) => update(screen.id, { size: { ...screen.size, width: parseFloat(e.target.value) || 0.1 } })}
        />
        <input
          type="number"
          step={0.1}
          value={screen.size.height}
          onChange={(e) => update(screen.id, { size: { ...screen.size, height: parseFloat(e.target.value) || 0.1 } })}
        />
      </div>

      <div className="group-head">Transform</div>
      <Vec3Row label="Position" value={screen.position} onChange={(v) => update(screen.id, { position: v })} />
      <Vec3Row label="Rotation°" value={screen.rotation} step={1} onChange={(v) => update(screen.id, { rotation: v })} />

      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm grow" onClick={() => duplicate(screen.id)}>
          Duplicate
        </button>
        <button className="btn sm grow danger" onClick={() => remove(screen.id)}>
          Delete
        </button>
      </div>
      <div className="kv" style={{ marginTop: 6 }}>
        <span>Aspect</span>
        <span>{(screen.resolution.width / screen.resolution.height).toFixed(3)}</span>
      </div>
    </div>
  );
}
