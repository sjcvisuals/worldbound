import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { DEMO_LYRICS_LRC } from "../lyrics/demo";
import { engine } from "../render/engine";
import { layoutSpan } from "../lyrics/layout";
import type { LyricsMapMode } from "../types";

export function LyricsPanel() {
  const lyrics = useStore((s) => s.lyrics);
  const update = useStore((s) => s.updateLyrics);
  const setSource = useStore((s) => s.setLyricsSource);
  const audio = useStore((s) => s.audio);
  const screens = useStore((s) => s.screens);
  const stripRef = useRef<HTMLCanvasElement>(null);

  const duration = audio?.analysis?.duration ?? 96;
  const barSec = audio?.analysis ? (60 / audio.analysis.bpm) * 4 : 2;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const canvas = stripRef.current;
      if (canvas && lyrics.enabled && lyrics.mode !== "off") {
        engine.lyrics.blitAtlas(canvas);
        const ctx = canvas.getContext("2d");
        const layout = layoutSpan(screens);
        if (ctx && lyrics.mode === "span") {
          ctx.strokeStyle = "rgba(125,249,255,0.55)";
          ctx.lineWidth = 2;
          for (const sl of layout.slices) {
            const x = sl.x * canvas.width;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lyrics.enabled, lyrics.mode, screens]);

  function apply(raw: string) {
    setSource(raw, duration, barSec);
  }

  return (
    <div className="section">
      <h3>Lyrics · spanning type</h3>
      <div className="row">
        <label>Map</label>
        <div className="toggle">
          {(["span", "each", "off"] as LyricsMapMode[]).map((m) => (
            <button
              key={m}
              className={lyrics.mode === m ? "on" : ""}
              onClick={() => update({ mode: m, enabled: m !== "off" })}
              title={
                m === "span"
                  ? "One line across the group by physical width — reads as a single LED surface"
                  : m === "each"
                    ? "Same full line on every screen"
                    : "Hide lyrics"
              }
            >
              {m === "span" ? "Span group" : m === "each" ? "Each screen" : "Off"}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <button className={lyrics.karaoke ? "btn sm on" : "btn sm"} onClick={() => update({ karaoke: !lyrics.karaoke })}>
          Karaoke wipe
        </button>
        <button className={lyrics.showNext ? "btn sm on" : "btn sm"} onClick={() => update({ showNext: !lyrics.showNext })}>
          Next line
        </button>
      </div>
      <textarea
        value={lyrics.source}
        onChange={(e) => apply(e.target.value)}
        placeholder={"Paste lyrics or LRC…\n[00:12.00]HELLO WORLD"}
        style={{ minHeight: 88 }}
      />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn sm grow" onClick={() => apply(DEMO_LYRICS_LRC)}>
          Load demo lyrics
        </button>
        <label className="btn sm grow" style={{ textAlign: "center" }}>
          Load .lrc
          <input
            type="file"
            accept=".lrc,.txt,text/plain"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              f.text().then(apply);
            }}
          />
        </label>
      </div>
      <canvas ref={stripRef} className="lyric-strip" title="How the current line splits across walls" />
      <div className="hint">
        {lyrics.lines.length
          ? `${lyrics.lines.length} timed lines · Span unfolds the group left→right by physical width so type reads as one surface (not 3D-warped).`
          : "Load demo lyrics or paste LRC. Untimed text is snapped across the track."}
      </div>
    </div>
  );
}
