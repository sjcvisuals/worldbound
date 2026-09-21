import { useState } from "react";
import { useStore } from "../state/store";
import { GENERATION_MODELS, getModel } from "../generation/models";
import { parsePrompt } from "../generation/prompt";
import { generateLoops } from "../generation/generate";
import { Slider } from "./ui";

export function GenerationPanel() {
  const generation = useStore((s) => s.generation);
  const update = useStore((s) => s.updateGeneration);
  const audio = useStore((s) => s.audio);
  const setLoops = useStore((s) => s.setLoops);
  const setGenerating = useStore((s) => s.setGenerating);
  const isGenerating = useStore((s) => s.isGenerating);
  const loops = useStore((s) => s.loops);
  const [status, setStatus] = useState("");

  const model = getModel(generation.modelId);
  const canGenerate = !!audio?.analysis && model.available;

  async function generate() {
    if (!audio?.analysis) {
      setStatus("Load and analyse an audio track first.");
      return;
    }
    setGenerating(true);
    setStatus("Interpreting prompt…");
    const parsed = parsePrompt(generation.prompt);
    update({ palette: parsed.palette, motif: parsed.motif });
    // Simulate staged generation for UX feedback (kept lightweight).
    await new Promise((r) => setTimeout(r, 250));
    setStatus("Mapping loops to song structure…");
    const params = { ...generation, palette: parsed.palette, motif: parsed.motif };
    const generated = generateLoops(audio.analysis, params);
    await new Promise((r) => setTimeout(r, 250));
    setLoops(generated);
    setGenerating(false);
    setStatus(
      `Generated ${generated.length} seamless loops · ${generated[0]?.bars ?? 0} bars each (${generated[0]?.lengthSec.toFixed(
        1
      )}s)`
    );
  }

  return (
    <div className="section">
      <h3>Content Generation</h3>
      <textarea
        value={generation.prompt}
        onChange={(e) => update({ prompt: e.target.value })}
        placeholder="Describe the visuals, theme and mood…"
      />

      <div className="row" style={{ marginTop: 8 }}>
        <label>Model</label>
        <select
          value={generation.modelId}
          onChange={(e) => {
            const id = e.target.value;
            update({
              modelId: id,
              visualEngine: id === "volumetric" ? "volumetric" : "cinema",
            });
          }}
        >
          {GENERATION_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.available ? "" : " — backend required"}
            </option>
          ))}
        </select>
      </div>
      <div className="hint">{model.description}</div>

      <div className="row" style={{ marginTop: 8 }}>
        <label>Look</label>
        <div className="toggle">
          <button
            className={generation.visualEngine === "cinema" ? "on" : ""}
            onClick={() => update({ visualEngine: "cinema", modelId: generation.modelId === "volumetric" ? "cinema" : generation.modelId })}
            title="AE-style 2.5D plates with parallax, bloom and grain"
          >
            Cinema 2.5D
          </button>
          <button
            className={generation.visualEngine === "volumetric" ? "on" : ""}
            onClick={() => update({ visualEngine: "volumetric", modelId: "volumetric" })}
            title="True 3D volume world (Notch-like particles)"
          >
            Volumetric 3D
          </button>
        </div>
      </div>
      <div className="hint">
        Live-event content is usually 2D and heavy. Cinema is a 5-plate After Effects-style
        stack (nebula, haze, figures, energy ribbons, embers) with bloom, anamorphic streak and
        grain, then baked through your LED cameras so it still parallaxes across screens.
      </div>

      <div style={{ marginTop: 8 }}>
        <Slider
          label="Loop len"
          value={generation.targetLoopSeconds}
          min={10}
          max={40}
          step={1}
          onChange={(v) => update({ targetLoopSeconds: v })}
          fmt={(v) => `${v}s`}
        />
        <Slider
          label="Loops"
          value={generation.targetLoopCount}
          min={2}
          max={16}
          step={1}
          onChange={(v) => update({ targetLoopCount: v })}
          fmt={(v) => `~${v}`}
        />
      </div>

      <div className="swatches">
        {generation.palette.map((c, i) => (
          <div key={i} className="swatch" style={{ background: c }} title={c} />
        ))}
      </div>

      <button
        className="btn primary"
        style={{ width: "100%", marginTop: 10 }}
        disabled={!canGenerate || isGenerating}
        onClick={generate}
      >
        {isGenerating ? "Generating…" : "Generate content for full track"}
      </button>
      {!model.available && (
        <div className="hint" style={{ marginTop: 6 }}>
          This open-source model runs on a GPU worker (ComfyUI). Cinema plates
          stay in the browser and already produce a heavy live-event look — use
          those until a GPU box is connected.
        </div>
      )}
      <div className="gen-status">{status}</div>
      {loops.length > 0 && (
        <div className="hint" style={{ marginTop: 4 }}>
          {loops.length} loops placed on the timeline, one per section, progressing intro → build →
          chorus → finish.
        </div>
      )}
    </div>
  );
}
