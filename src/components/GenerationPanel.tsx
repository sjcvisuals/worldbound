import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { GENERATION_MODELS, getModel } from "../generation/models";
import { generateFromStore } from "../generation/run";
import { lookTags, parsePrompt } from "../generation/prompt";
import { gpuHealth, type GpuHealth } from "../generation/gpuWorker";
import { providerReady, requestVideoPlate } from "../generation/plates";
import { Slider } from "./ui";

export function GenerationPanel() {
  const generation = useStore((s) => s.generation);
  const update = useStore((s) => s.updateGeneration);
  const audio = useStore((s) => s.audio);
  const setGenerating = useStore((s) => s.setGenerating);
  const setPlateVideoUrl = useStore((s) => s.setPlateVideoUrl);
  const plateVideoUrl = useStore((s) => s.plateVideoUrl);
  const isGenerating = useStore((s) => s.isGenerating);
  const loops = useStore((s) => s.loops);
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState<GpuHealth>({ ok: false });

  const model = getModel(generation.modelId);
  const parsed = useMemo(() => parsePrompt(generation.prompt), [generation.prompt]);
  const tags = lookTags(generation.look ?? parsed);
  const canGenerate = !!audio?.analysis;
  const videoReady = providerReady(health, generation.modelId);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      gpuHealth().then((h) => {
        if (!cancelled) setHealth(h);
      });
    };
    tick();
    const id = window.setInterval(tick, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  function applyPrompt(prompt: string) {
    const look = parsePrompt(prompt);
    update({ prompt, palette: look.palette, motif: look.motif, look });
  }

  async function generate() {
    if (!audio?.analysis) {
      setStatus("Load and analyse an audio track first.");
      return;
    }
    setGenerating(true);
    setStatus("Interpreting prompt…");
    await new Promise((r) => setTimeout(r, 80));
    const result = generateFromStore();
    setStatus(result.status);
    if (model.provider) {
      try {
        const url = await requestVideoPlate({
          modelId: generation.modelId,
          prompt: generation.prompt,
          look: useStore.getState().generation.look ?? parsed,
          seconds: Math.min(8, generation.targetLoopSeconds),
          fps: useStore.getState().output.fps,
          seed: 1000,
          onStatus: setStatus,
        });
        if (url) {
          setPlateVideoUrl(url);
          setStatus(`${result.status} · ${model.label} plate on the far wall`);
        }
      } catch (e) {
        setStatus(`${result.status} · ${(e as Error).message} Cinema look is on the walls.`);
      }
    }
    setGenerating(false);
  }

  return (
    <div className="section">
      <h3>Content Generation</h3>
      <textarea
        value={generation.prompt}
        onChange={(e) => applyPrompt(e.target.value)}
        placeholder="Describe the visuals, theme and mood…"
      />

      <div className="wizard-chips" style={{ marginTop: 8 }}>
        {tags.length ? (
          tags.map((t) => (
            <span key={t} className="pill on">
              {t}
            </span>
          ))
        ) : (
          <span className="pill">abstract energy</span>
        )}
      </div>

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
              {m.kind === "backend" && !providerReady(health, m.id) ? " — key required" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="hint">{model.description}</div>
      {model.provider && (
        <div className="hint" style={{ marginTop: 4 }}>
          Worker: {health.ok ? "up" : "offline"} · Veo {health.veo ? "ready" : "no key"} · Seedance{" "}
          {health.seedance ? "ready" : "no key"} · ComfyUI {health.comfy ? "ready" : "off"}
        </div>
      )}

      <div className="row" style={{ marginTop: 8 }}>
        <label>Look</label>
        <div className="toggle">
          <button
            className={generation.visualEngine === "cinema" ? "on" : ""}
            onClick={() =>
              update({
                visualEngine: "cinema",
                modelId: generation.modelId === "volumetric" ? "cinema" : generation.modelId,
              })
            }
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
        The prompt drives which plates turn on. “Gold fire” is fire and embers; “cyan grid”
        is a lattice/tunnel — figures only appear if you ask for them. Veo / Seedance
        (optional) replace the far plate with a generated loop; nDisplay bake stays the same.
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
      {model.provider && !videoReady && (
        <div className="hint" style={{ marginTop: 6 }}>
          This video model needs a key on `npm run gpu-worker` (GEMINI_API_KEY for Veo, FAL_KEY
          for Seedance). Generate still builds the cinema look from your prompt.
        </div>
      )}
      {plateVideoUrl && (
        <div className="hint" style={{ marginTop: 6 }}>
          Far plate: {plateVideoUrl}
          {" · "}
          <button className="btn sm" onClick={() => setPlateVideoUrl(null)}>
            Clear plate
          </button>
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
