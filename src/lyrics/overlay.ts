import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import type { LyricLine, LyricsMapMode, Screen } from "../types";
import { layoutSpan, sliceFor, type SpanLayout } from "./layout";
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
        slices: members.map((s) => ({ screenId: s.id, x: 0, y: 0, w: 1, h: 1 })),
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
      this.paint(current.text, frame.showNext ? next?.text ?? "" : "", wipe, frame.fill, frame.beat);
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

  private paint(current: string, next: string, wipe: number, fill: string, beat: number) {
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

    const text = current.toUpperCase();
    const pad = w * 0.035;
    let size = Math.min(h * 0.32, w * 0.12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if (spaced.letterSpacing != null) spaced.letterSpacing = "0.04em";
    while (size > 18) {
      ctx.font = `800 ${size}px ${FONT}`;
      if (ctx.measureText(text).width <= w - pad * 2) break;
      size -= 2;
    }
    const punch = 1 + beat * 0.04;
    const cx = w / 2;
    const cy = h * 0.47;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(punch, punch);
    ctx.translate(-cx, -cy);

    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(6, size * 0.14);
    ctx.strokeStyle = "rgba(0,0,0,0.88)";
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.strokeText(text, cx, cy);

    ctx.shadowColor = fill;
    ctx.shadowBlur = size * 0.35;
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillText(text, cx, cy);
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, Math.max(1, w * wipe), h);
    ctx.clip();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, cx, cy);
    ctx.restore();

    ctx.restore();

    if (next) {
      ctx.font = `700 ${Math.max(14, size * 0.32)}px ${FONT}`;
      ctx.fillStyle = "rgba(180,220,255,0.55)";
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 3;
      const n = next.toUpperCase();
      ctx.strokeText(n, cx, h * 0.72);
      ctx.fillText(n, cx, h * 0.72);
    }
  }
}
