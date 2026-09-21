import { useState } from "react";
import { useStore } from "../state/store";
import { analyzeAudio } from "../audio/analyze";

export function AudioPanel() {
  const audio = useStore((s) => s.audio);
  const setAudio = useStore((s) => s.setAudio);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const [status, setStatus] = useState("");

  async function load(name: string, url: string) {
    setAudio(name, url);
    setStatus("Analysing audio…");
    try {
      const analysis = await analyzeAudio(url);
      setAnalysis(analysis);
      setStatus(
        `Analysed · ${analysis.bpm} BPM · ${analysis.beats.length} beats · ${analysis.sections.length} sections`
      );
    } catch (e) {
      setStatus("Analysis failed: " + (e as Error).message);
    }
  }

  return (
    <div className="section">
      <h3>Audio Track</h3>
      <div className="row">
        <button className="btn grow" onClick={() => load("Demo Track", "/demo-track.wav")}>
          Load demo track
        </button>
      </div>
      <div className="row">
        <label>Upload</label>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) load(f.name, URL.createObjectURL(f));
          }}
        />
      </div>
      {audio && (
        <>
          <div className="kv">
            <span>Track</span>
            <span>{audio.name}</span>
          </div>
          {audio.analysis && (
            <>
              <div className="kv">
                <span>Duration</span>
                <span>{audio.analysis.duration.toFixed(1)}s</span>
              </div>
              <div className="kv">
                <span>Tempo</span>
                <span>{audio.analysis.bpm} BPM</span>
              </div>
              <div style={{ marginTop: 6 }}>
                {audio.analysis.sections.map((s, i) => (
                  <span key={i} className="pill on">
                    {s.type} {Math.round(s.endSec - s.startSec)}s
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <div className="gen-status">{status}</div>
    </div>
  );
}
