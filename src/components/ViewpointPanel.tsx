import { useStore } from "../state/store";
import { Vec3Row } from "./ui";

export function ViewpointPanel() {
  const viewpoint = useStore((s) => s.viewpoint);
  const setViewpoint = useStore((s) => s.setViewpoint);
  const setOverride = useStore((s) => s.setViewpointOverride);
  const showFrustums = useStore((s) => s.showFrustums);
  const toggleFrustums = useStore((s) => s.toggleFrustums);
  const selected = useStore((s) => s.screens.find((x) => x.id === s.selectedScreenId));
  const setGizmoMode = useStore((s) => s.setGizmoMode);

  const independent = !!(selected && viewpoint.overrides[selected.id]);

  return (
    <div className="section">
      <h3>Perspective Viewpoint</h3>
      <div className="hint" style={{ marginBottom: 8 }}>
        Baked 3D eye point (nDisplay-style). Drag the red marker, or give a selected screen its own
        independent eye (magenta).
      </div>
      <Vec3Row label="Global eye" value={viewpoint.position} onChange={setViewpoint} />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn sm grow" onClick={() => setViewpoint([0, 1.7, 12])}>
          Reset (front)
        </button>
        <button className={"btn sm grow" + (showFrustums ? " primary" : "")} onClick={toggleFrustums}>
          {showFrustums ? "Frustums: on" : "Frustums: off"}
        </button>
      </div>

      {selected && (
        <>
          <div className="group-head">Independent · {selected.name}</div>
          <div className="row">
            <button
              className={"btn sm grow" + (independent ? " primary" : "")}
              onClick={() => {
                if (independent) setOverride(selected.id, null);
                else {
                  setOverride(selected.id, [...viewpoint.position]);
                  setGizmoMode("eye");
                }
              }}
            >
              {independent ? "Using own eye" : "Use independent eye"}
            </button>
          </div>
          {independent && (
            <Vec3Row
              label="Own eye"
              value={viewpoint.overrides[selected.id]}
              onChange={(v) => setOverride(selected.id, v)}
            />
          )}
        </>
      )}
    </div>
  );
}
