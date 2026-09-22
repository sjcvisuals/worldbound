import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { analyzeAudio } from "../audio/analyze";
import { lookTags, parsePrompt } from "../generation/prompt";
import { generateFromStore } from "../generation/run";
import { GENERATION_MODELS } from "../generation/models";
import { LOOK_CHIPS, STAGE_PRESETS, presetById } from "../setup/presets";
import { markSetupComplete } from "../setup/storage";
import type { Codec, ColorProfile } from "../types";

const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "stage", title: "Stage" },
  { id: "audio", title: "Audio" },
  { id: "look", title: "Look" },
  { id: "delivery", title: "Delivery" },
  { id: "go", title: "Open" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function SetupWizard() {
  const open = useStore((s) => s.setupOpen);
  const editorReady = useStore((s) => s.editorReady);
  const closeSetup = useStore((s) => s.closeSetup);
  const revealEditor = useStore((s) => s.revealEditor);
  const applyStage = useStore((s) => s.applyStage);
  const setAudio = useStore((s) => s.setAudio);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const updateGeneration = useStore((s) => s.updateGeneration);
  const updateOutput = useStore((s) => s.updateOutput);
  const setGenerating = useStore((s) => s.setGenerating);
  const generation = useStore((s) => s.generation);
  const output = useStore((s) => s.output);
  const audio = useStore((s) => s.audio);

  const [step, setStep] = useState<StepId>(editorReady ? "stage" : "welcome");
  const [presetId, setPresetId] = useState("wrap");
  const [audioStatus, setAudioStatus] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [prompt, setPrompt] = useState(generation.prompt);

  const idx = STEPS.findIndex((s) => s.id === step);
  const overlay = editorReady;
  const preset = useMemo(() => presetById(presetId), [presetId]);
  const parsed = useMemo(() => parsePrompt(prompt), [prompt]);
  const tags = lookTags(parsed);

  useEffect(() => {
    if (!open) return;
    setStep(editorReady ? "stage" : "welcome");
    setPrompt(useStore.getState().generation.prompt);
  }, [open, editorReady]);

  if (!open) return null;

  function go(id: StepId) {
    setStep(id);
  }

  function skipToEditor() {
    markSetupComplete();
    revealEditor();
  }

  function commitLook() {
    updateGeneration({
      prompt,
      palette: parsed.palette,
      motif: parsed.motif,
      look: parsed,
    });
  }

  async function loadAudio(name: string, url: string) {
    setAudio(name, url);
    setAnalysing(true);
    setAudioStatus("Reading the track…");
    try {
      const analysis = await analyzeAudio(url);
      setAnalysis(analysis);
      setAudioStatus(
        `${analysis.bpm.toFixed(0)} BPM · ${analysis.duration.toFixed(0)}s · ${analysis.sections.length} sections`
      );
      return analysis;
    } catch (e) {
      setAudioStatus("Could not analyse that file — you can continue without it.");
      console.error(e);
      return null;
    } finally {
      setAnalysing(false);
    }
  }

  async function finish(generate: boolean) {
    setBusy(true);
    setFinishError("");
    try {
      applyStage(preset.screens, preset.viewpoint);
      const model = GENERATION_MODELS.find((m) => m.id === generation.modelId);
      updateGeneration({
        prompt,
        palette: parsed.palette,
        motif: parsed.motif,
        look: parsed,
        visualEngine: generation.modelId === "volumetric" ? "volumetric" : "cinema",
        modelId: model?.id ?? "cinema",
      });
      if (generate && useStore.getState().audio?.analysis) {
        setGenerating(true);
        generateFromStore();
        setGenerating(false);
      }
      markSetupComplete();
      revealEditor();
    } catch (e) {
      setFinishError((e as Error).message || "Could not open the stage.");
    } finally {
      setBusy(false);
    }
  }

  const next = () => {
    const n = Math.min(STEPS.length - 1, idx + 1);
    go(STEPS[n].id);
  };
  const back = () => {
    const n = Math.max(0, idx - 1);
    go(STEPS[n].id);
  };

  return (
    <div className={overlay ? "wizard-root overlay" : "wizard-root"}>
      <div className="wizard-bg" aria-hidden />
      <div className="wizard-card" role="dialog" aria-labelledby="wizard-title">
        {step !== "welcome" && (
          <div className="wizard-steps">
            {STEPS.filter((s) => s.id !== "welcome").map((s) => (
              <button
                key={s.id}
                className={s.id === step ? "on" : idx > STEPS.findIndex((x) => x.id === s.id) ? "done" : ""}
                onClick={() => go(s.id)}
              >
                {STEPS.filter((x) => x.id !== "welcome").findIndex((x) => x.id === s.id) + 1}
              </button>
            ))}
          </div>
        )}

        {step === "welcome" && (
          <>
            <p className="wizard-kicker">Worldbound</p>
            <h2 id="wizard-title">Let’s set up your show</h2>
            <p className="wizard-lede">
              A few short questions — stage hang, audio, look — then the 3D editor
              opens with that world already on the walls. You can move screens and
              tweak everything after.
            </p>
            <div className="wizard-actions">
              <button className="btn primary" onClick={() => go("stage")}>
                Get started
              </button>
              <button className="btn ghost" onClick={skipToEditor}>
                Skip to editor
              </button>
            </div>
          </>
        )}

        {step === "stage" && (
          <>
            <h2 id="wizard-title">How is the stage hung?</h2>
            <p className="wizard-lede">Pick the layout that matches the room. You can still add, move and scale screens later.</p>
            <div className="wizard-grid">
              {STAGE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={"wizard-choice" + (presetId === p.id ? " on" : "")}
                  onClick={() => setPresetId(p.id)}
                >
                  <StageGlyph id={p.id} />
                  <strong>{p.name}</strong>
                  <span>{p.blurb}</span>
                </button>
              ))}
            </div>
            <Nav back={editorReady ? undefined : back} next={next} nextLabel="Next · audio" />
          </>
        )}

        {step === "audio" && (
          <>
            <h2 id="wizard-title">Got a track?</h2>
            <p className="wizard-lede">
              Optional. We’ll read tempo and sections so loops land on the bar. Skip if you only want to dress the stage first.
            </p>
            <div className="wizard-actions" style={{ marginTop: 4 }}>
              <button
                className="btn primary"
                disabled={analysing}
                onClick={() => loadAudio("Demo Track", "/demo-track.wav")}
              >
                {analysing ? "Analysing…" : "Use demo track"}
              </button>
              <label className="btn">
                Upload audio
                <input
                  type="file"
                  accept="audio/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) loadAudio(f.name, URL.createObjectURL(f));
                  }}
                />
              </label>
            </div>
            {audio && (
              <div className="wizard-status">
                <b>{audio.name}</b>
                <span>{audioStatus || (audio.analysis ? `${audio.analysis.bpm.toFixed(0)} BPM` : "Loaded")}</span>
              </div>
            )}
            <Nav back={back} next={next} nextLabel="Next · look" skip={{ label: "Skip audio", onClick: next }} />
          </>
        )}

        {step === "look" && (
          <>
            <h2 id="wizard-title">What should it look like?</h2>
            <p className="wizard-lede">
              Describe the show. Cinema plates turn that prompt into a layer recipe
              (fire vs grid vs figures) so the walls match what you asked for. Veo or
              Seedance can replace the far plate later if you attach an API key.
            </p>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ minHeight: 90 }} />
            <div className="wizard-chips">
              {LOOK_CHIPS.map((c) => (
                <button
                  key={c.label}
                  className={"pill" + (prompt === c.prompt ? " on" : "")}
                  onClick={() => setPrompt(c.prompt)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="wizard-chips" style={{ marginTop: 6 }}>
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
            <div className="row" style={{ marginTop: 10 }}>
              <label>Model</label>
              <select
                value={generation.modelId}
                onChange={(e) => {
                  const id = e.target.value;
                  updateGeneration({
                    modelId: id,
                    visualEngine: id === "volumetric" ? "volumetric" : "cinema",
                  });
                }}
              >
                {GENERATION_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.kind === "backend" ? " — API / GPU" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <label>Look</label>
              <div className="toggle">
                <button
                  className={generation.visualEngine === "cinema" ? "on" : ""}
                  onClick={() =>
                    updateGeneration({
                      visualEngine: "cinema",
                      modelId: generation.modelId === "volumetric" ? "cinema" : generation.modelId,
                    })
                  }
                >
                  Cinema 2.5D
                </button>
                <button
                  className={generation.visualEngine === "volumetric" ? "on" : ""}
                  onClick={() => updateGeneration({ visualEngine: "volumetric", modelId: "volumetric" })}
                >
                  Volumetric 3D
                </button>
              </div>
            </div>
            <div className="swatches" style={{ marginTop: 8 }}>
              {parsed.palette.map((c) => (
                <div key={c} className="swatch" style={{ background: c }} title={c} />
              ))}
            </div>
            <Nav
              back={back}
              next={() => {
                commitLook();
                next();
              }}
              nextLabel="Next · delivery"
            />
          </>
        )}

        {step === "delivery" && (
          <>
            <h2 id="wizard-title">How should we bake it?</h2>
            <p className="wizard-lede">Locked to each screen’s pixels. H.264 is in-browser; ProRes needs the encode sidecar later.</p>
            <div className="row">
              <label>Frame rate</label>
              <select value={output.fps} onChange={(e) => updateOutput({ fps: parseInt(e.target.value) })}>
                {[24, 25, 30, 50, 60].map((f) => (
                  <option key={f} value={f}>
                    {f} fps
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <label>Colour</label>
              <select
                value={output.colorProfile}
                onChange={(e) => updateOutput({ colorProfile: e.target.value as ColorProfile })}
              >
                {["rec709", "rec2020", "srgb", "p3"].map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <label>Codec</label>
              <select value={output.codec} onChange={(e) => updateOutput({ codec: e.target.value as Codec })}>
                <option value="h264">H.264 (in-browser)</option>
                <option value="prores">ProRes 422 HQ</option>
                <option value="notchlc">NotchLC (ProRes stand-in)</option>
              </select>
            </div>
            <div className="hint">Resolution stays locked to each wall. Change that in Output after you open the stage.</div>
            <Nav back={back} next={next} nextLabel="Next · open the stage" />
          </>
        )}

        {step === "go" && (
          <>
            <h2 id="wizard-title">Open the stage</h2>
            <p className="wizard-lede">We’ll hang the walls, drop in your look, and — if there’s a track — generate beat-synced loops so the 3D scene is already alive.</p>
            <ul className="wizard-summary">
              <li>
                <em>Stage</em> {preset.name} · {preset.screens.length} screen{preset.screens.length === 1 ? "" : "s"}
              </li>
              <li>
                <em>Audio</em> {audio?.name ?? "None yet"}
                {audio?.analysis ? ` · ${audio.analysis.bpm.toFixed(0)} BPM` : ""}
              </li>
              <li>
                <em>Look</em> {generation.visualEngine === "volumetric" ? "Volumetric 3D" : "Cinema 2.5D"} ·{" "}
                {tags.length ? tags.join(" · ") : parsed.motif}
              </li>
              <li>
                <em>Model</em> {GENERATION_MODELS.find((m) => m.id === generation.modelId)?.label ?? generation.modelId}
              </li>
              <li>
                <em>Bake</em> {output.fps} fps · {output.colorProfile.toUpperCase()} · {output.codec.toUpperCase()}
              </li>
            </ul>
            {finishError && <div className="hint" style={{ color: "var(--danger)" }}>{finishError}</div>}
            <div className="wizard-actions">
              <button className="btn ghost" onClick={back} disabled={busy}>
                Back
              </button>
              <button className="btn" onClick={() => finish(false)} disabled={busy}>
                Open empty stage
              </button>
              <button className="btn primary" onClick={() => finish(true)} disabled={busy}>
                {busy ? "Building…" : audio?.analysis ? "Generate & open stage" : "Open stage"}
              </button>
            </div>
          </>
        )}

        {overlay && step !== "welcome" && (
          <button className="wizard-dismiss" onClick={closeSetup} title="Keep the current editor">
            Close
          </button>
        )}
      </div>
    </div>
  );
}

function Nav({
  back,
  next,
  nextLabel,
  skip,
}: {
  back?: () => void;
  next: () => void;
  nextLabel: string;
  skip?: { label: string; onClick: () => void };
}) {
  return (
    <div className="wizard-actions">
      {back ? (
        <button className="btn ghost" onClick={back}>
          Back
        </button>
      ) : (
        <span />
      )}
      <div className="wizard-actions-right">
        {skip && (
          <button className="btn ghost" onClick={skip.onClick}>
            {skip.label}
          </button>
        )}
        <button className="btn primary" onClick={next}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

function StageGlyph({ id }: { id: string }) {
  if (id === "single") {
    return (
      <svg viewBox="0 0 72 40" className="stage-glyph" aria-hidden>
        <rect x="22" y="8" width="28" height="22" rx="2" />
      </svg>
    );
  }
  if (id === "imag") {
    return (
      <svg viewBox="0 0 72 40" className="stage-glyph" aria-hidden>
        <rect x="6" y="10" width="22" height="18" rx="2" transform="rotate(-12 17 19)" />
        <rect x="44" y="10" width="22" height="18" rx="2" transform="rotate(12 55 19)" />
      </svg>
    );
  }
  if (id === "ultrawide") {
    return (
      <svg viewBox="0 0 72 40" className="stage-glyph" aria-hidden>
        <rect x="4" y="14" width="64" height="12" rx="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 72 40" className="stage-glyph" aria-hidden>
      <rect x="4" y="12" width="18" height="16" rx="2" transform="rotate(-18 13 20)" />
      <rect x="24" y="8" width="24" height="22" rx="2" />
      <rect x="50" y="12" width="18" height="16" rx="2" transform="rotate(18 59 20)" />
    </svg>
  );
}
