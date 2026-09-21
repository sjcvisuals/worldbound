import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import type { LyricLine, LyricsMapMode, Screen } from "../types";
import { layoutSpan, sliceFor, type SpanLayout } from "./layout";
import { packWordsInBands, uniqueBands, wipeX, type PackBand, type PackedWord } from "./pack";
import { activeLyric, karaokeProgress } from "./parse";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tLyrics;
  uniform vec4 uRect;
  void main(){
    // uRect is atlas UV with origin top-left. vUv.y=0 is the bottom of the screen.
    vec2 uv = vec2(uRect.x + vUv.x * uRect.z, mix(uRect.y + uRect.w, uRect.y, vUv.y));
    vec4 lyr = texture2D(tLyrics, uv);
    if (lyr.a < 0.01) discard;
    gl_FragColor = lyr;
  }
`;

export interface LyricsFrame {
  enabled: boolean;
  mode: LyricsMapMode;
  lines: LyricLine[];
  playhead: number;
  karaoke: boolean;
  showNext: boolean;
  fill: string;
  beat: number;
}

const FONT = `"Anton", Impact, "Arial Black", sans-serif`;

/**
 * Draws timed lyrics onto a spanning atlas, then composites each screen's
 * crop on top of the baked feed — 2D type across the LED array, independent
 * of the 3D plate cameras so letters don't warp between walls.
 */
export class LyricsOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private quad: FullScreenQuad;
  private uRect = { value: new THREE.Vector4(0, 0, 1, 1) };
  private layout: SpanLayout | null = null;
  private lastKey = "";
  private lastGroup = "";
  private atlasW = 0;
  private atlasH = 0;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 4;
    this.canvas.height = 4;
    const ctx = this.canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.flipY = false;
    this.texture.premultiplyAlpha = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tLyrics: { value: this.texture }, uRect: this.uRect },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })
    );
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        this.lastKey = "";
      });
    }
  }

  sync(groupId: string, members: Screen[], frame: LyricsFrame, atlasHeight: number) {
    if (this.lastGroup !== groupId) {
      this.lastGroup = groupId;
      this.lastKey = "";
    }
    if (frame.mode === "each") {
      this.layout = {
        totalWidth: 16,
        maxHeight: 9,
        slices: [{ screenId: members[0]?.id ?? "each", x: 0, y: 0, w: 1, h: 1 }],
      };
    } else {
      this.layout = layoutSpan(members);
    }
    return this.draw(frame, atlasHeight);
  }

  draw(frame: LyricsFrame, atlasHeight: number) {
    if (!frame.enabled || frame.mode === "off" || !frame.lines.length || !this.layout) {
      this.lastKey = "";
      return false;
    }
    const { current, next, progress } = activeLyric(frame.lines, frame.playhead);
    if (!current) {
      this.clear();
      this.lastKey = "empty";
      return false;
    }
    const wipe = frame.karaoke ? karaokeProgress(current, frame.playhead, progress) : 1;
    const aspect = this.layout.totalWidth / this.layout.maxHeight;
    const h = Math.max(128, Math.round(atlasHeight));
    const w = Math.max(256, Math.round(h * aspect));
    this.ensure(w, h);
    const key = `${current.text}|${next?.text ?? ""}|${wipe.toFixed(3)}|${w}x${h}|${frame.mode}|${frame.fill}|${frame.showNext}`;
    if (key !== this.lastKey) {
      this.paint(
        current.text,
        frame.showNext ? next?.text ?? "" : "",
        wipe,
        frame.fill,
        frame.beat,
        frame.mode
      );
      this.texture.needsUpdate = true;
      this.lastKey = key;
    }
    return true;
  }

  composite(gl: THREE.WebGLRenderer, screen: Screen, mode: LyricsMapMode) {
    if (!this.layout || mode === "off") return;
    if (mode === "each") {
      this.uRect.value.set(0, 0, 1, 1);
    } else {
      const sl = sliceFor(this.layout, screen.id);
      if (!sl) return;
      this.uRect.value.set(sl.x, sl.y, sl.w, sl.h);
    }
    const prev = gl.autoClear;
    gl.autoClear = false;
    this.quad.render(gl);
    gl.autoClear = prev;
  }

  /** Debug strip of the current atlas (span preview in the lyrics panel). */
  blitAtlas(to: HTMLCanvasElement) {
    if (!this.atlasW) return;
    if (to.width !== this.atlasW || to.height !== this.atlasH) {
      to.width = this.atlasW;
      to.height = this.atlasH;
    }
    const c = to.getContext("2d");
    if (c) c.drawImage(this.canvas, 0, 0);
  }

  layoutSlices() {
    return this.layout?.slices ?? [];
  }

  private ensure(w: number, h: number) {
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.atlasW = w;
    this.atlasH = h;
    this.texture.needsUpdate = true;
  }

  private clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }

  private paint(
    current: string,
    next: string,
    wipe: number,
    fill: string,
    beat: number,
    mode: LyricsMapMode
  ) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const barH = h * 0.5;
    const barY = (h - barH) / 2;
    const g = ctx.createLinearGradient(0, barY, 0, barY + barH);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.25, "rgba(0,0,0,0.45)");
    g.addColorStop(0.75, "rgba(0,0,0,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, barY, w, barH);

    const bands = bandsFor(mode, this.layout, w);
    const words = current.toUpperCase().split(/\s+/).filter(Boolean);
    const minBand = Math.min(...bands.map((b) => b.x1 - b.x0), w);
    let size = Math.min(h * 0.34, minBand * 0.28);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let packed: PackedWord[] = [];
    while (size > 14) {
      ctx.font = `400 ${size}px ${FONT}`;
      const space = ctx.measureText(" ").width;
      const widths = words.map((word) => ctx.measureText(word).width);
      const result = packWordsInBands(words, widths, space, bands);
      packed = result.packed;
      if (!result.overflow) break;
      size -= 2;
    }
    ctx.font = `400 ${size}px ${FONT}`;
    const cy = h * 0.46;
    const punch = 1 + beat * 0.02;
    ctx.save();
    ctx.translate(0, cy);
    ctx.scale(1, punch);
    ctx.translate(0, -cy);

    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(6, size * 0.14);
    ctx.strokeStyle = "rgba(0,0,0,0.88)";
    ctx.shadowColor = fill;
    for (const p of packed) {
      ctx.shadowBlur = 0;
      ctx.strokeText(p.word, p.x, cy);
      ctx.shadowBlur = size * 0.3;
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillText(p.word, p.x, cy);
    }
    ctx.shadowBlur = 0;
    const cut = wipeX(packed, wipe, w);
    for (const p of packed) {
      const x0 = p.x;
      const x1 = p.x + p.width;
      if (cut <= x0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, Math.min(x1, cut) - x0, h);
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(p.word, p.x, cy);
      ctx.restore();
    }
    ctx.restore();

    if (next) {
      const nextWords = next.toUpperCase().split(/\s+/).filter(Boolean);
      let nSize = Math.max(12, size * 0.32);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      let nextPacked: PackedWord[] = [];
      while (nSize > 10) {
        ctx.font = `400 ${nSize}px ${FONT}`;
        const space = ctx.measureText(" ").width;
        const widths = nextWords.map((word) => ctx.measureText(word).width);
        const result = packWordsInBands(nextWords, widths, space, bands);
        nextPacked = result.packed;
        if (!result.overflow) break;
        nSize -= 1;
      }
      ctx.font = `400 ${nSize}px ${FONT}`;
      ctx.lineWidth = Math.max(2, nSize * 0.12);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.fillStyle = "rgba(180,220,255,0.55)";
      const ny = h * 0.72;
      for (const p of nextPacked) {
        ctx.strokeText(p.word, p.x, ny);
        ctx.fillText(p.word, p.x, ny);
      }
    }
  }
}

function bandsFor(mode: LyricsMapMode, layout: SpanLayout | null, atlasW: number): PackBand[] {
  if (mode === "each" || !layout?.slices.length) return [{ x0: 0, x1: atlasW }];
  return uniqueBands(
    layout.slices.map((s) => ({ x0: s.x * atlasW, x1: (s.x + s.w) * atlasW }))
  );
}
