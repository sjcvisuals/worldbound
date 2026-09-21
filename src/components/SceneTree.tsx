import { useStore } from "../state/store";

export function SceneTree() {
  const groups = useStore((s) => s.groups);
  const screens = useStore((s) => s.screens);
  const selectedId = useStore((s) => s.selectedScreenId);
  const selectScreen = useStore((s) => s.selectScreen);
  const addScreen = useStore((s) => s.addScreen);
  const addGroup = useStore((s) => s.addGroup);
  const updateGroup = useStore((s) => s.updateGroup);

  return (
    <div className="section">
      <h3>Stage · Screens</h3>
      {groups.map((g) => {
        const members = screens.filter((s) => s.groupId === g.id);
        return (
          <div key={g.id}>
            <div className="group-head">
              <span className="dot" style={{ background: g.color, width: 9, height: 9, borderRadius: 3 }} />
              <span style={{ flex: 1 }}>{g.name}</span>
              <div className="toggle">
                <button
                  className={g.mode === "world" ? "on" : ""}
                  onClick={() => updateGroup(g.id, { mode: "world" })}
                  title="Screens are windows into one 3D world (baked perspective)"
                >
                  3D
                </button>
                <button
                  className={g.mode === "flat" ? "on" : ""}
                  onClick={() => updateGroup(g.id, { mode: "flat" })}
                  title="Screens map one flat 2D image across the group"
                >
                  Flat
                </button>
              </div>
            </div>
            {members.map((s) => (
              <div
                key={s.id}
                className={"tree-item" + (selectedId === s.id ? " active" : "")}
                onClick={() => selectScreen(s.id)}
              >
                <span className="dot" style={{ background: g.color }} />
                <span>{s.name}</span>
                <span className="res">
                  {s.resolution.width}×{s.resolution.height}
                </span>
              </div>
            ))}
            {members.length === 0 && <div className="hint">No screens in this group.</div>}
          </div>
        );
      })}

      <div className="divider" />
      <div className="row">
        <button className="btn sm grow" onClick={addScreen}>
          + Screen
        </button>
        <button className="btn sm grow" onClick={() => addGroup("world")}>
          + 3D Group
        </button>
        <button className="btn sm grow" onClick={() => addGroup("flat")}>
          + Flat Group
        </button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        Move a screen into a group by changing its group in the inspector. 3D groups bake perspective;
        flat groups map one image across all member screens.
      </div>
      {/* Group reassignment convenience */}
      <ScreenGroupPicker />
    </div>
  );
}

function ScreenGroupPicker() {
  const selectedId = useStore((s) => s.selectedScreenId);
  const screen = useStore((s) => s.screens.find((x) => x.id === s.selectedScreenId));
  const groups = useStore((s) => s.groups);
  const updateScreen = useStore((s) => s.updateScreen);
  if (!selectedId || !screen) return null;
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <label>Group</label>
      <select value={screen.groupId} onChange={(e) => updateScreen(screen.id, { groupId: e.target.value })}>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} ({g.mode})
          </option>
        ))}
      </select>
    </div>
  );
}
