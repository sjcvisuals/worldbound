import * as THREE from "three";
import type { LoopVisual } from "../../types";
import { ANGEL_GLSL, LOOP_GLSL, NOISE_GLSL } from "./glsl";

/**
 * AE / Notch-style 2.5D content: a stack of full-bleed plates parked in 3D
 * behind the LED walls. Off-axis (nDisplay) cameras looking through those walls
 * see real parallax between layers — the same trick as a media-server plate
 * world, not a game scene.
 *
 * Far  = hell/heaven nebula (opaque)
 * Mid  = descending angels + halos (additive)
 * Near = embers, dust, optical sparks (additive)
 */

export interface CinemaUniforms {
  uTime: { value: number };
  uLoopLength: { value: number };
  uEnergy: { value: number };
  uBeat: { value: number };
  uIntensity: { value: number };
  uSpeed: { value: number };
  uDensity: { value: number };
  uBeatPunch: { value: number };
  uSeed: { value: number };
  uColTop: { value: THREE.Color };
  uColMid: { value: THREE.Color };
  uColBottom: { value: THREE.Color };
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main(){
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

function farFrag(): string {
  return /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform float uEnergy; uniform float uIntensity; uniform float uBeat;
    uniform vec3 uColTop; uniform vec3 uColMid; uniform vec3 uColBottom;
    ${LOOP_GLSL}
    ${NOISE_GLSL}
    void main(){
      float ph = loopPhase();
      vec2 uv = vUv;
      // Domain-warped nebula — the "after effects fractal noise" look.
      float n = fbmWarp(uv * 3.2 + vec2(0.0, ph), ph);
      float n2 = fbm(uv * 7.0 + vec2(ph * 2.0, -ph));
      float h = uv.y;
      vec3 col = mix(uColBottom, uColMid, smoothstep(0.05, 0.55, h));
      col = mix(col, uColTop, smoothstep(0.45, 1.0, h));
      col *= 0.18 + 0.85 * n * (0.35 + uEnergy);
      // Hell mouth at the bottom — turbulent fire well.
      float fire = fbmWarp(vec2(uv.x * 5.0, uv.y * 3.0 - ph * 2.0), ph);
      fire = pow(max(fire, 0.0), 1.4) * smoothstep(0.42, 0.0, h);
      col += mix(uColBottom, uColMid, fire) * fire * (1.2 + uBeat * 1.4 + uEnergy);
      // Heaven wash
      float heaven = pow(h, 2.2) * (0.25 + 0.55 * uIntensity);
      col += uColTop * heaven * (0.4 + 0.4 * n2);
      // Vertical god-ray shafts (cheap, AE CC Light Rays vibe).
      float shafts = 0.0;
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float x = uv.x - 0.5 - 0.16 * sin(ph * 6.2831 + fi * 1.7);
        float s = exp(-pow(x * (9.0 + fi), 2.0)) * (0.12 + 0.1 * uEnergy);
        shafts += s * mix(h, 1.0 - h, 0.35);
      }
      col += mix(uColMid, uColTop, h) * shafts * (0.8 + uBeat);
      col *= 0.55 + 0.9 * uIntensity;
      gl_FragColor = vec4(col, 1.0);
    }
  `;
}

function angelFrag(): string {
  return /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform float uEnergy; uniform float uIntensity; uniform float uBeat;
    uniform float uDensity; uniform float uBeatPunch; uniform float uSeed;
    uniform vec3 uColTop; uniform vec3 uColMid; uniform vec3 uColBottom;
    ${LOOP_GLSL}
    ${NOISE_GLSL}
    ${ANGEL_GLSL}
    void main(){
      float ph = loopPhase();
      float d = 1e5;
      float haloAcc = 0.0;
      // Grid of descending figures. Integer cycles so t=0 and t=T match.
      for (int j = 0; j < 4; j++) {
        for (int i = 0; i < 6; i++) {
          vec2 id = vec2(float(i), float(j));
          float rnd = hash21(id + vec2(uSeed * 0.001, 3.1));
          if (rnd > 0.18 + uDensity * 0.85) continue;
          vec2 cell = vec2((id.x - 2.5) * 0.155, (id.y - 0.2) * 0.26);
          float cycles = 1.0 + floor(mod(rnd * 5.0, 2.0));
          cell.y = fract(cell.y - ph * cycles + rnd) * 1.25 - 0.12;
          cell.x += 0.025 * sin(ph * 6.2831 + rnd * 12.0);
          float flap = 1.0 + 0.08 * sin(ph * 25.13 + rnd * 8.0);
          vec2 p = (vUv - 0.5 - cell);
          p.x /= flap;
          float sc = 7.5 + rnd * 9.0;
          float ad = sdAngel(p * sc);
          d = min(d, ad);
          haloAcc += exp(-max(ad, 0.0) * 18.0) * (0.15 + 0.2 * rnd);
        }
      }
      float fill = 1.0 - smoothstep(0.0, 0.08, d);
      float glow = exp(-max(d, 0.0) * 9.0);
      float core = exp(-max(d, 0.0) * 28.0);
      // Heaven at the top of the plate, hell-tint as they fall.
      float life = clamp(vUv.y, 0.0, 1.0);
      vec3 holy = mix(uColMid, uColTop, 0.65);
      vec3 hell = mix(uColBottom, uColMid, 0.25);
      vec3 col = mix(hell, holy, smoothstep(0.12, 0.8, life));
      float punch = 1.0 + uBeat * uBeatPunch * 1.8;
      float a = (fill * 0.85 + glow * 0.55 + core * 0.9 + haloAcc) * punch;
      a *= 0.45 + 0.7 * uIntensity + 0.35 * uEnergy;
      // AE-style echo / echo trails (ghosts of the descent).
      float echo = exp(-max(d + 0.15, 0.0) * 6.0) * 0.25;
      a += echo * (0.3 + uEnergy);
      if (a < 0.02) discard;
      gl_FragColor = vec4(col * a, clamp(a, 0.0, 1.0));
    }
  `;
}

function emberFrag(): string {
  return /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform float uEnergy; uniform float uIntensity; uniform float uBeat;
    uniform float uDensity; uniform vec3 uColTop; uniform vec3 uColMid; uniform vec3 uColBottom;
    ${LOOP_GLSL}
    ${NOISE_GLSL}
    void main(){
      float ph = loopPhase();
      vec2 uv = vUv;
      float acc = 0.0;
      vec3 col = vec3(0.0);
      // Optical dust / embers — hashed cells, wrap on phase.
      for (int i = 0; i < 18; i++) {
        float fi = float(i);
        vec2 rnd = hash22(vec2(fi * 3.1, 8.7));
        float cycles = 1.0 + floor(rnd.y * 3.0);
        vec2 p = vec2(fract(rnd.x + 0.04 * sin(ph * 6.2831 + fi)), fract(rnd.y - ph * cycles));
        float r = length((uv - p) * vec2(1.6, 1.0));
        float spark = exp(-r * (70.0 + 80.0 * rnd.x));
        float sz = 0.4 + rnd.x * 1.6;
        spark *= sz * (rnd.x < (0.25 + uDensity * 0.8) ? 1.0 : 0.0);
        acc += spark;
        vec3 c = mix(uColBottom, mix(uColMid, uColTop, uv.y), rnd.y);
        col += c * spark;
      }
      // Fine grain field
      float dust = pow(noise(uv * 90.0 + ph * 4.0), 8.0) * 0.35 * uDensity;
      col += mix(uColMid, uColTop, uv.y) * dust;
      acc += dust;
      float punch = 1.0 + uBeat * 1.6;
      float a = acc * punch * (0.4 + 0.8 * uEnergy) * (0.5 + 0.7 * uIntensity);
      if (a < 0.015) discard;
      gl_FragColor = vec4(col * punch, clamp(a, 0.0, 1.0));
    }
  `;
}

export class CinemaWorld {
  readonly scene: THREE.Scene;
  readonly uniforms: CinemaUniforms;
  private far: THREE.Mesh;
  private angels: THREE.Mesh;
  private embers: THREE.Mesh;

  constructor() {
    this.scene = new THREE.Scene();
    this.uniforms = {
      uTime: { value: 0 },
      uLoopLength: { value: 0 },
      uEnergy: { value: 0.25 },
      uBeat: { value: 0 },
      uIntensity: { value: 0.7 },
      uSpeed: { value: 1 },
      uDensity: { value: 0.65 },
      uBeatPunch: { value: 0.6 },
      uSeed: { value: 0 },
      uColTop: { value: new THREE.Color("#d8fbff") },
      uColMid: { value: new THREE.Color("#00b3ff") },
      uColBottom: { value: new THREE.Color("#ff2d55") },
    };

    this.far = this.layer(farFrag(), false, [110, 62], [0, 2.2, -30]);
    this.angels = this.layer(angelFrag(), true, [64, 36], [0, 2.0, -12]);
    this.embers = this.layer(emberFrag(), true, [40, 22], [0, 1.8, -3.5]);
    this.scene.add(this.far, this.angels, this.embers);
  }

  private layer(frag: string, additive: boolean, size: [number, number], pos: [number, number, number]) {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: VERT,
      fragmentShader: frag,
      transparent: additive,
      depthWrite: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.frustumCulled = false;
    return mesh;
  }

  applyLoopVisual(v: LoopVisual) {
    const pal = v.palette;
    const pick = (i: number, fallback: string) => new THREE.Color(pal[i] ?? fallback);
    this.uniforms.uColTop.value.copy(pick(2, "#d8fbff"));
    this.uniforms.uColMid.value.copy(pick(0, "#00b3ff"));
    this.uniforms.uColBottom.value.copy(pick(pal.length - 1, "#ff2d55"));
    this.uniforms.uIntensity.value = v.intensity;
    this.uniforms.uSpeed.value = v.speed;
    this.uniforms.uDensity.value = v.density;
    this.uniforms.uBeatPunch.value = v.beatPunch;
    this.uniforms.uSeed.value = v.seed;
  }

  setTime(t: number, loopLength = 0) {
    this.uniforms.uTime.value = t;
    this.uniforms.uLoopLength.value = loopLength;
  }

  pulse(dt: number, energy: number, beat: number) {
    this.uniforms.uEnergy.value += (energy - this.uniforms.uEnergy.value) * Math.min(1, dt * 8);
    this.uniforms.uBeat.value = Math.max(beat, this.uniforms.uBeat.value - dt * 3.5);
  }

  setPulse(energy: number, beat: number) {
    this.uniforms.uEnergy.value = energy;
    this.uniforms.uBeat.value = beat;
  }
}
