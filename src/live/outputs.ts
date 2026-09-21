import type { Screen } from "../types";
import { engine } from "../render/engine";

/** Program-monitor height. Bumped while any live window is open so capture isn't mushy. */
const PREVIEW_HEIGHT = 384;
const LIVE_HEIGHT = 720;

/**
 * Web stand-in for NDI/Spout: one pop-out window per LED wall, filled with that
 * screen's baked feed. Window-capture it in OBS / Resolume / vMix, or hit F for
 * native fullscreen on a dedicated output display.
 *
 * Feeds are copied from the engine's program textures every frame (same pixels
 * as the Program Output tiles). Opening a live window raises program resolution
 * to 720p-tall so the capture is usable.
 */
class LiveOutputs {
  private outs = new Map<string, { win: Window; canvas: HTMLCanvasElement }>();
  lastError: string | null = null;

  get size() {
    return this.outs.size;
  }

  isOpen(id: string) {
    const o = this.outs.get(id);
    return !!o && !o.win.closed;
  }

  open(screen: Screen): boolean {
    this.lastError = null;
    const existing = this.outs.get(screen.id);
    if (existing && !existing.win.closed) {
      existing.win.focus();
      return true;
    }
    const aspect = screen.resolution.width / screen.resolution.height || 16 / 9;
    const width = Math.round(LIVE_HEIGHT * aspect);
    const w = window.open(
      "",
      `worldbound-live-${screen.id}`,
      `popup=yes,width=${width},height=${LIVE_HEIGHT}`
    );
    if (!w) {
      this.lastError = "Pop-out blocked — allow pop-ups for this site, or double-click a tile for fullscreen.";
      return false;
    }
    this.writeDoc(w, screen);
    const canvas = w.document.getElementById("feed") as HTMLCanvasElement | null;
    if (!canvas) {
      w.close();
      this.lastError = "Live window failed to initialise.";
      return false;
    }
    this.outs.set(screen.id, { win: w, canvas });
    this.syncHeight();

    w.addEventListener("beforeunload", () => {
      this.outs.delete(screen.id);
      this.syncHeight();
    });
    w.document.addEventListener("keydown", (ev) => {
      if (ev.key === "f" || ev.key === "F") {
        ev.preventDefault();
        toggleFullscreen(w);
      }
      if (ev.key === "h" || ev.key === "H") {
        const hud = w.document.getElementById("hud");
        if (hud) hud.style.opacity = hud.style.opacity === "0" ? "0.9" : "0";
      }
    });
    canvas.addEventListener("dblclick", () => toggleFullscreen(w));
    return true;
  }

  openAll(screens: Screen[]) {
    let ok = true;
    for (const s of screens) {
      if (!this.open(s)) ok = false;
    }
    return ok;
  }

  /** Copy current program textures into any open live windows. */
  pump(screens: Screen[]) {
    for (const [id, o] of [...this.outs]) {
      if (o.win.closed) {
        this.outs.delete(id);
        this.syncHeight();
        continue;
      }
      const screen = screens.find((s) => s.id === id);
      if (screen) engine.readInto(screen, o.canvas);
    }
  }

  private syncHeight() {
    engine.setProgramHeight(this.outs.size > 0 ? LIVE_HEIGHT : PREVIEW_HEIGHT);
  }

  private writeDoc(w: Window, screen: Screen) {
    const { width, height } = screen.resolution;
    w.document.open();
    w.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(screen.name)} — Worldbound Live</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
    body { display: flex; align-items: center; justify-content: center; }
    canvas { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; background: #000; }
    #hud {
      position: fixed; left: 14px; bottom: 12px;
      color: #b9e7ff; font: 12px/1.45 ui-sans-serif, system-ui, sans-serif;
      text-shadow: 0 1px 6px #000; pointer-events: none; opacity: 0.9;
      letter-spacing: 0.02em;
    }
    #hud b { color: #7df9ff; }
  </style>
</head>
<body>
  <canvas id="feed"></canvas>
  <div id="hud"><b>${escapeHtml(screen.name)}</b><br/>${width}×${height} · F fullscreen · H hide label · dbl-click</div>
</body>
</html>`);
    w.document.close();
  }
}

function toggleFullscreen(w: Window) {
  const doc = w.document;
  if (doc.fullscreenElement) doc.exitFullscreen().catch(() => undefined);
  else doc.documentElement.requestFullscreen().catch(() => undefined);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export const liveOutputs = new LiveOutputs();
