import { useStore } from "../state/store";
import { Vec3Row } from "./ui";

export function ViewpointPanel() {
  const viewpoint = useStore((s) => s.viewpoint);
  const setViewpoint = useStore((s) => s.setViewpoint);
  const showFrustums = useStore((s) => s.showFrustums);
  const toggleFrustums = useStore((s) => s.toggleFrustums);

  return (
    <div className="section">
      <h3>Perspective Viewpoint</h3>
      <div className="hint" style={{ marginBottom: 8 }}>
        The baked 3D eye point. Content in “3D” groups is generated as seen from here — drag the red
        marker in the stage or edit below.
      </div>
      <Vec3Row label="Eye pos" value={viewpoint.position} onChange={setViewpoint} />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn sm grow" onClick={() => setViewpoint([0, 1.7, 12])}>
          Reset (front)
        </button>
        <button className={"btn sm grow" + (showFrustums ? " primary" : "")} onClick={toggleFrustums}>
          {showFrustums ? "Frustums: on" : "Frustums: off"}
        </button>
      </div>
    </div>
  );
}
