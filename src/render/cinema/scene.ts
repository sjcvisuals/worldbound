import * as THREE from "three";
import type { LoopVisual } from "../../types";
import { ANGEL_GLSL, LOOP_GLSL, NOISE_GLSL } from "./glsl";

/**
 * AE / Notch-style 2.5D content: a stack of full-bleed plates parked in 3D
 * behind the LED walls. Off-axis (nDisplay) cameras looking through those walls
 * see real parallax between layers — the same trick as a media-server plate
 * world, not a game scene.
 *
 * Far      = hell/heaven nebula (opaque) — fills the frame
 * Atmosphere = volumetric haze / god-ray continuation (additive)
 * Mid      = descending light-figures + trails (additive)
 * Ribbons  = Notch-style energy streams (additive)
 * Near     = embers, bokeh, optical sparks (additive)
 *
 * Motion is authored on loopPhase so t=0 and t=T are identical (seamless).
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
      float cy = loopCycles();
      vec2 uv = vUv;
      float h = uv.y;

      // Domain-warped nebula — AE Fractal Noise + Colorama.
      vec2 nUv = uv * vec2(2.8, 3.4) + vec2(0.15 * sin(ph * 6.2831 * cy), ph);
      float n = fbmWarp(nUv, ph);
      float n2 = fbm(uv * 6.5 + vec2(ph * 2.0 * cy, -ph));
      n = smoothstep(0.18, 0.92, n);

      vec3 col = mix(uColBottom, uColMid, smoothstep(0.02, 0.48, h));
      col = mix(col, uColTop, smoothstep(0.42, 1.0, h));
      col *= 0.22 + 1.05 * n * (0.45 + uEnergy * 0.85);

      // Ridged energy veins (lightning in the cloud).
      float vein = pow(ridge(uv * vec2(3.4, 5.0) + vec2(ph * cy, 0.0)), 4.5);
      col += mix(uColMid, uColTop, h) * vein * (0.55 + uBeat * 1.4 + uEnergy);

      // Hell mouth — turbulent fire well, looping rise.
      float fire = fbmWarp(vec2(uv.x * 4.6, uv.y * 3.2 - ph * cy * 1.6), ph);
      fire = pow(max(fire, 0.0), 1.25) * smoothstep(0.48, 0.0, h);
      vec3 fireCol = mix(uColBottom, vec3(1.0, 0.55, 0.12), fire);
      col += fireCol * fire * (1.6 + uBeat * 1.8 + uEnergy);

      // Heaven wash + stars
      float heaven = pow(h, 1.85) * (0.35 + 0.7 * uIntensity);
      col += uColTop * heaven * (0.55 + 0.5 * n2);
      float stars = pow(hash21(floor(uv * 220.0 + vec2(uTime * 0.0, 3.1))), 28.0);
      col += uColTop * stars * smoothstep(0.4, 1.0, h) * 1.8;

      // Vertical god-ray shafts (CC Light Rays).
      float shafts = 0.0;
      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float x = uv.x - 0.5 - 0.18 * sin(ph * 6.2831 * cy + fi * 1.51);
        float s = exp(-pow(x * (8.0 + fi * 0.55), 2.0)) * (0.16 + 0.14 * uEnergy);
        shafts += s * mix(h, 1.0 - h * 0.35, 0.4);
      }
      col += mix(uColMid, uColTop, h) * shafts * (1.1 + uBeat * 1.3);

      // Horizon glow so the plate never reads as empty mid-frame.
      float band = exp(-pow((h - 0.28) * 6.0, 2.0));
      col += uColMid * band * (0.18 + 0.22 * uEnergy);

      col *= 0.75 + 1.05 * uIntensity;
      gl_FragColor = vec4(col, 1.0);
    }
  `;
}

function hazeFrag(): string {
  return /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform float uEnergy; uniform float uIntensity; uniform float uBeat;
    uniform vec3 uColTop; uniform vec3 uColMid; uniform vec3 uColBottom;
    ${LOOP_GLSL}
    ${NOISE_GLSL}
    void main(){
      float ph = loopPhase();
      float cy = loopCycles();
      vec2 uv = vUv;
      float fog = fbm(uv * vec2(2.2, 1.6) + vec2(ph * cy * 0.35, ph * 0.2));
      fog = smoothstep(0.28, 0.85, fog);
      float h = uv.y;
      vec3 col = mix(uColBottom, uColMid, smoothstep(0.0, 0.45, h));
      col = mix(col, uColTop, smoothstep(0.5, 1.0, h));
      float a = fog * (0.18 + 0.35 * uEnergy) * (0.5 + 0.7 * uIntensity);
      a *= 0.55 + 0.45 * h;
      a += uBeat * 0.06;
      if (a < 0.02) discard;
      gl_FragColor = vec4(col * a * 1.4, clamp(a, 0.0, 1.0));
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
      float cy = loopCycles();
      float d = 1e5;
      float haloAcc = 0.0;
      float trail = 0.0;
      // Dense grid of descending light-figures. Integer cycles keep the seam.
      for (int j = 0; j < 5; j++) {
        for (int i = 0; i < 8; i++) {
          vec2 id = vec2(float(i), float(j));
          float rnd = hash21(id + vec2(uSeed * 0.001, 3.1));
          // Higher density → more figures (rnd is 0..1).
          if (rnd > mix(0.28, 0.94, uDensity)) continue;
          vec2 cell = vec2((id.x - 3.5) * 0.118, (id.y - 0.4) * 0.20);
          float cycles = cy + floor(mod(rnd * 3.0, 2.0));
          cell.y = fract(cell.y - ph * cycles + rnd) * 1.22 - 0.10;
          cell.x += 0.02 * sin(ph * 6.2831 * cy + rnd * 12.0);
          float flap = 1.0 + 0.10 * sin(ph * 25.13 * cy + rnd * 8.0);
          vec2 p = (vUv - 0.5 - cell);
          p.x /= flap;
          float sc = 11.0 + rnd * 10.0;
          float ad = sdAngel(p * sc);
          ad += 0.035 * (fbm(p * 9.0 + rnd) - 0.5);
          d = min(d, ad);
          haloAcc += exp(-max(ad, 0.0) * 16.0) * (0.12 + 0.22 * rnd);

          // Cheap descent trails (blobs, not extra SDFs) — AE Echo.
          for (int t = 1; t <= 4; t++) {
            float ft = float(t);
            vec2 tc = cell;
            tc.y += 0.048 * ft;
            float tr = length((vUv - 0.5 - tc) * vec2(16.0, 6.5));
            trail += exp(-tr * tr * 16.0) * (0.24 / ft) * (0.45 + rnd);
          }
        }
      }
      float fill = 1.0 - smoothstep(0.0, 0.07, d);
      float glow = exp(-max(d, 0.0) * 8.0);
      float core = exp(-max(d, 0.0) * 26.0);
      float life = clamp(vUv.y, 0.0, 1.0);
      vec3 holy = mix(uColMid, uColTop, 0.7);
      vec3 hell = mix(uColBottom, uColMid, 0.3);
      vec3 col = mix(hell, holy, smoothstep(0.1, 0.78, life));
      col = mix(col, vec3(1.0), core * 0.55);
      float punch = 1.0 + uBeat * uBeatPunch * 2.0;
      float a = (fill * 0.9 + glow * 0.65 + core * 1.05 + haloAcc + trail) * punch;
      a *= 0.55 + 0.75 * uIntensity + 0.4 * uEnergy;
      if (a < 0.02) discard;
      gl_FragColor = vec4(col * a, clamp(a, 0.0, 1.0));
    }
  `;
}

function ribbonFrag(): string {
  return /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform float uEnergy; uniform float uIntensity; uniform float uBeat;
    uniform float uDensity; uniform vec3 uColTop; uniform vec3 uColMid; uniform vec3 uColBottom;
    ${LOOP_GLSL}
    ${NOISE_GLSL}
    void main(){
      float ph = loopPhase();
      float cy = loopCycles();
      vec2 uv = vUv;
      vec3 col = vec3(0.0);
      float acc = 0.0;
      for (int i = 0; i < 7; i++) {
        float fi = float(i);
        float n = fbm(vec2(uv.x * 3.2 + fi, ph * cy));
        float y = 0.12 + fi * 0.115 + 0.07 * sin(uv.x * 6.2831 * 1.5 + ph * 6.2831 * cy + fi)
          + 0.05 * (n - 0.5);
        float d = abs(uv.y - y);
        float w = 0.010 + 0.008 * uEnergy + uBeat * 0.006;
        float ribbon = exp(-d / max(w, 0.002));
        ribbon *= 0.45 + 0.55 * smoothstep(0.15, 0.9, uDensity + 0.3);
        // Bright core + outer glow
        float core = exp(-d / max(w * 0.28, 0.001));
        vec3 c = mix(uColBottom, mix(uColMid, uColTop, uv.y), fi / 6.0);
        col += c * (ribbon * 0.55 + core * 1.1);
        acc += ribbon + core;
      }
      // Cross wisps
      float wisp = pow(ridge(uv * vec2(8.0, 3.0) + vec2(ph * cy * 2.0, 0.0)), 5.0);
      col += uColMid * wisp * 0.45 * (0.4 + uEnergy);
      acc += wisp * 0.3;
      float a = acc * (0.35 + 0.7 * uIntensity) * (0.55 + 0.7 * uEnergy);
      a *= 1.0 + uBeat * 0.8;
      if (a < 0.02) discard;
      gl_FragColor = vec4(col * (1.0 + uBeat), clamp(a, 0.0, 1.0));
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
      float cy = loopCycles();
      vec2 uv = vUv;
      float acc = 0.0;
      vec3 col = vec3(0.0);

      // Optical dust / embers — hashed cells, wrap on phase.
      for (int i = 0; i < 36; i++) {
        float fi = float(i);
        vec2 rnd = hash22(vec2(fi * 3.1, 8.7));
        float cycles = cy + floor(rnd.y * 3.0);
        vec2 p = vec2(
          fract(rnd.x + 0.035 * sin(ph * 6.2831 * cy + fi)),
          fract(rnd.y - ph * cycles)
        );
        float r = length((uv - p) * vec2(1.7, 1.0));
        float spark = exp(-r * (90.0 + 70.0 * rnd.x));
        float live = rnd.x < (0.35 + uDensity * 0.7) ? 1.0 : 0.0;
        spark *= (0.5 + rnd.x * 1.8) * live;
        acc += spark;
        vec3 c = mix(uColBottom, mix(uColMid, uColTop, uv.y), rnd.y);
        col += c * spark * 1.4;
      }

      // Large bokeh orbs (AE CC Particle World / Optical Flares vibe).
      for (int i = 0; i < 10; i++) {
        float fi = float(i);
        vec2 rnd = hash22(vec2(fi * 9.2, 1.7));
        float cycles = cy;
        vec2 p = vec2(fract(rnd.x + 0.02 * sin(ph * 6.2831)), fract(rnd.y - ph * cycles * 0.5));
        float r = length((uv - p) * vec2(1.2, 1.0));
        float orb = exp(-pow(r * (9.0 + 8.0 * rnd.y), 2.0));
        orb *= 0.35 + 0.5 * uDensity;
        acc += orb;
        col += mix(uColMid, uColTop, rnd.x) * orb * 0.9;
      }

      // Fine grain field
      float dust = pow(noise(uv * 110.0 + ph * cy * 3.0), 7.0) * 0.45 * (0.4 + uDensity);
      col += mix(uColMid, uColTop, uv.y) * dust;
      acc += dust;

      float punch = 1.0 + uBeat * 1.7;
      float a = acc * punch * (0.45 + 0.85 * uEnergy) * (0.55 + 0.7 * uIntensity);
      if (a < 0.012) discard;
      gl_FragColor = vec4(col * punch, clamp(a, 0.0, 1.0));
    }
  `;
}

export class CinemaWorld {
  readonly scene: THREE.Scene;
  readonly uniforms: CinemaUniforms;
  private far: THREE.Mesh;
  private haze: THREE.Mesh;
  private angels: THREE.Mesh;
  private ribbons: THREE.Mesh;
  private embers: THREE.Mesh;

  constructor() {
    this.scene = new THREE.Scene();
    this.uniforms = {
      uTime: { value: 0 },
      uLoopLength: { value: 0 },
      uEnergy: { value: 0.4 },
      uBeat: { value: 0 },
      uIntensity: { value: 0.85 },
      uSpeed: { value: 1 },
      uDensity: { value: 0.75 },
      uBeatPunch: { value: 0.7 },
      uSeed: { value: 0 },
      uColTop: { value: new THREE.Color("#d8fbff") },
      uColMid: { value: new THREE.Color("#00b3ff") },
      uColBottom: { value: new THREE.Color("#ff2d55") },
    };

    this.far = this.layer(farFrag(), false, [130, 74], [0, 2.4, -34]);
    this.haze = this.layer(hazeFrag(), true, [96, 54], [0, 2.2, -22]);
    this.angels = this.layer(angelFrag(), true, [72, 40], [0, 2.0, -13]);
    this.ribbons = this.layer(ribbonFrag(), true, [56, 32], [0, 1.9, -7.2]);
    this.embers = this.layer(emberFrag(), true, [42, 24], [0, 1.8, -3.1]);
    this.scene.add(this.far, this.haze, this.angels, this.ribbons, this.embers);
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
    this.uniforms.uIntensity.value = Math.min(1.2, v.intensity * 1.15);
    this.uniforms.uSpeed.value = v.speed;
    this.uniforms.uDensity.value = Math.min(1, v.density * 1.15);
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
