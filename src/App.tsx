import { useCallback, useEffect, useRef } from "react";
import { useStore } from "./state/store";
import { StageView } from "./components/StageView";
import { Topbar } from "./components/Topbar";
import { SceneTree } from "./components/SceneTree";
import { ScreenInspector } from "./components/ScreenInspector";
import { ViewpointPanel } from "./components/ViewpointPanel";
import { AudioPanel } from "./components/AudioPanel";
import { GenerationPanel } from "./components/GenerationPanel";
import { OutputPanel } from "./components/OutputPanel";
import { Timeline } from "./components/Timeline";
import { PreviewPanel } from "./components/PreviewPanel";

export function App() {
  const audioUrl = useStore((s) => s.audio?.url);
  const playing = useStore((s) => s.playing);
  const setPlayhead = useStore((s) => s.setPlayhead);
  const setPlaying = useStore((s) => s.setPlaying);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!audioRef.current) audioRef.current = new Audio();

  useEffect(() => {
    const el = audioRef.current!;
    if (audioUrl) {
      el.src = audioUrl;
      el.load();
      setPlayhead(0);
      setPlaying(false);
    }
  }, [audioUrl, setPlayhead, setPlaying]);

  useEffect(() => {
    const el = audioRef.current!;
    if (playing) el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing, setPlaying]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = audioRef.current!;
      if (useStore.getState().playing) {
        setPlayhead(el.currentTime);
        if (el.ended) setPlaying(false);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [setPlayhead, setPlaying]);

  const onSeek = useCallback(
    (t: number) => {
      audioRef.current!.currentTime = t;
      setPlayhead(t);
    },
    [setPlayhead]
  );

  const onTogglePlay = useCallback(() => setPlaying(!useStore.getState().playing), [setPlaying]);
  const onStop = useCallback(() => {
    audioRef.current!.pause();
    audioRef.current!.currentTime = 0;
    setPlayhead(0);
    setPlaying(false);
  }, [setPlayhead, setPlaying]);

  return (
    <div className="app">
      <Topbar />
      <div className="sidebar left">
        <SceneTree />
        <ScreenInspector />
        <ViewpointPanel />
      </div>
      <div className="stage">
        <div className="stage-overlay">
          <span className="badge chip">Drag red marker = move perspective eye · Orbit to inspect</span>
        </div>
        <StageView />
      </div>
      <div className="sidebar right">
        <AudioPanel />
        <GenerationPanel />
        <OutputPanel />
      </div>
      <div className="bottom">
        <Timeline onSeek={onSeek} onTogglePlay={onTogglePlay} onStop={onStop} />
        <PreviewPanel />
      </div>
    </div>
  );
}
