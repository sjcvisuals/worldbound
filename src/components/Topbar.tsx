import { useStore } from "../state/store";

export function Topbar() {
  const openSetup = useStore((s) => s.openSetup);
  return (
    <div className="topbar">
      <div className="brand">
        WORLDBOUND <span>· live event content engine</span>
      </div>
      <div className="spacer" />
      <button className="btn sm" onClick={openSetup} title="Run the show setup again">
        Setup show
      </button>
      <span className="badge">Perspective-baked · nDisplay-style</span>
      <span className="badge">Audio-reactive generation</span>
      <span className="badge">Live program pop-outs</span>
    </div>
  );
}
