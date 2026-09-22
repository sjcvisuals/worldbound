import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import type { SongSectionType } from "../types";

const SECTION_COLORS: Record<SongSectionType, string> = {
  intro: "#1f6feb",
  build: "#7c3aed",
  chorus: "#00b3ff",
  breakdown: "#0ea5a5",
  finish: "#ff2d55",
};

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Timeline({
  onSeek,
  onTogglePlay,
  onStop,
}: {
  onSeek: (t: number) => void;
  onTogglePlay: () => void;
  onStop: () => void;
}) {
  const audio = useStore((s) => s.audio);
  const loops = useStore((s) => s.loops);
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);

  const analysis = audio?.analysis ?? null;
  const duration = analysis?.duration ?? 0;

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis) return;
    const h = 96;
    canvas.width = width;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, h);

    // waveform
    const env = analysis.envelope;
    const n = env.length;
    ctx.fillStyle = "#0e2a4a";
    for (let x = 0; x < width; x++) {
      const idx = Math.floor((x / width) * n);
      const v = env[idx] ?? 0;
      const bh = v * (h - 8);
      ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }

    // beat / bar ticks
    for (let i = 0; i < analysis.beats.length; i++) {
      const t = analysis.beats[i];
      const x = (t / duration) * width;
      ctx.fillStyle = i % 4 === 0 ? "rgba(125,249,255,0.45)" : "rgba(125,249,255,0.14)";
      ctx.fillRect(x, 0, 1, h);
    }
  }, [analysis, width, duration]);

  function handleSeek(e: React.MouseEvent) {
    if (!duration) return;
    const rect = trackRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onSeek(Math.max(0, Math.min(duration, (x / rect.width) * duration)))
  }

  const playX = duration ? (playhead / duration) * width : 0;

  return (
    <div className="timeline">
      <div className="transport">
        <button className="btn sm primary" onClick={onTogglePlay} disabled={!audio}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button className="btn sm" onClick={onStop} disabled={!audio}>
          ■ Stop
        </button>
        <span className="time">
          {fmt(playhead)} / {fmt(duration)}
        </span>
        {analysis && <span className="badge">{analysis.bpm} BPM</span>}
        <span className="badge">{loops.length} loops</span>
        <div style={{ flex: 1 }} />
        <span className="hint">Space play/pause · click the timeline to scrub</span>
      </div>

      <div className="tl-track" ref={trackRef} onClick={handleSeek}>
        <div className="tl-loops">
          {duration > 0 &&
            loops.map((l) => {
              const left = (l.startSec / duration) * width;
              const w = ((l.endSec - l.startSec) / duration) * width;
              return (
                <div
                  key={l.id}
                  className="loop-seg"
                  style={{
                    left,
                    width: Math.max(2, w - 2),
                    background: `linear-gradient(160deg, ${SECTION_COLORS[l.section]}dd, ${SECTION_COLORS[l.section]}55)`,
                  }}
                  title={`${l.id} · ${l.section} · ${l.lengthSec.toFixed(1)}s · ${l.bars} bars`}
                >
                  <div className="sec">{l.section}</div>
                  <div>#{l.index + 1}</div>
                </div>
              );
            })}
          {loops.length === 0 && (
            <div className="sec-label" style={{ left: 8, top: 20 }}>
              Generated loops will appear here, placed above the audio.
            </div>
          )}
        </div>
        <div className="tl-wave">
          <canvas ref={canvasRef} style={{ width: "100%", height: 96, display: "block" }} />
        </div>
        <div className="playhead" style={{ left: playX }} />
      </div>
    </div>
  );
}
