import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

/**
 * After-Effects-style grade on each baked screen feed:
 * bright-pass bloom (wide + tight), anamorphic streak, chromatic aberration,
 * split-tone, grain, vignette. This is what makes 2D plates feel "heavy" on LED.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tMap;
  uniform float uThresh;
  void main(){
    vec3 c = texture2D(tMap, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 b = max(c - vec3(uThresh), vec3(0.0));
    gl_FragColor = vec4(b * (0.75 + l), 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tMap;
  uniform vec2 uDir;
  void main(){
    vec4 acc = vec4(0.0);
    acc += texture2D(tMap, vUv - uDir * 4.0) * 0.05;
    acc += texture2D(tMap, vUv - uDir * 3.0) * 0.09;
    acc += texture2D(tMap, vUv - uDir * 2.0) * 0.12;
    acc += texture2D(tMap, vUv - uDir * 1.0) * 0.15;
    acc += texture2D(tMap, vUv) * 0.18;
    acc += texture2D(tMap, vUv + uDir * 1.0) * 0.15;
    acc += texture2D(tMap, vUv + uDir * 2.0) * 0.12;
    acc += texture2D(tMap, vUv + uDir * 3.0) * 0.09;
    acc += texture2D(tMap, vUv + uDir * 4.0) * 0.05;
    gl_FragColor = acc;
  }
`;

const COMP_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uBloom;
  uniform float uBeat;
  uniform float uCA;
  uniform float uGrain;
  uniform float uTime;
  uniform vec2 uRes;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec2 uv = vUv;
    float ca = uCA * (1.0 + uBeat * 0.9);
    vec2 dir = (uv - 0.5);
    vec3 scene;
    scene.r = texture2D(tScene, uv + dir * ca).r;
    scene.g = texture2D(tScene, uv).g;
    scene.b = texture2D(tScene, uv - dir * ca).b;
    vec3 bloom = texture2D(tBloom, uv).rgb;

    // Anamorphic horizontal streak from bloom (JJ Abrams / live-IMAG).
    vec3 streak = vec3(0.0);
    streak += texture2D(tBloom, uv + vec2(0.006, 0.0)).rgb * 0.40;
    streak += texture2D(tBloom, uv - vec2(0.006, 0.0)).rgb * 0.40;
    streak += texture2D(tBloom, uv + vec2(0.016, 0.0)).rgb * 0.24;
    streak += texture2D(tBloom, uv - vec2(0.016, 0.0)).rgb * 0.24;
    streak += texture2D(tBloom, uv + vec2(0.034, 0.0)).rgb * 0.12;
    streak += texture2D(tBloom, uv - vec2(0.034, 0.0)).rgb * 0.12;

    // Cheap lens dirt in the highlights.
    float dirt = pow(hash(floor(uv * 48.0)), 9.0);
    vec3 col = scene + bloom * uBloom * (1.15 + uBeat * 1.25) + streak * uBloom * 0.7;
    col += bloom * dirt * 0.35;

    // Filmic rolloff so additive plates don't clip to chalk.
    col = col * (1.02 + 0.12 * col) / (1.0 + 0.38 * col);

    // Saturation + split tone (cyan highlights, magenta shadows).
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(lum), col, 1.22);
    col += vec3(0.025, 0.0, 0.04) * (1.0 - lum);
    col += vec3(0.0, 0.025, 0.045) * lum;

    float vig = smoothstep(1.18, 0.32, length(dir * vec2(1.15, 1.0)));
    col *= mix(0.72, 1.0, vig);

    float g = (hash(uv * uRes + uTime * 37.0) - 0.5) * uGrain;
    col += g;
    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }
`;

function rt(w: number, h: number) {
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
}

export class PostStack {
  private w = 0;
  private h = 0;
  private brightRT: THREE.WebGLRenderTarget | null = null;
  private blurH: THREE.WebGLRenderTarget | null = null;
  private blurV: THREE.WebGLRenderTarget | null = null;
  private rawRT: THREE.WebGLRenderTarget | null = null;

  private uBrightMap = { value: null as THREE.Texture | null };
  private uBlurMap = { value: null as THREE.Texture | null };
  private uBlurDir = { value: new THREE.Vector2() };
  private uScene = { value: null as THREE.Texture | null };
  private uBloom = { value: null as THREE.Texture | null };
  private uBloomAmt = { value: 1.05 };
  private uBeat = { value: 0 };
  private uCA = { value: 0.0045 };
  private uGrain = { value: 0.04 };
  private uTime = { value: 0 };
  private uRes = { value: new THREE.Vector2(1, 1) };

  private brightQ: FullScreenQuad;
  private blurQ: FullScreenQuad;
  private compQ: FullScreenQuad;

  constructor() {
    this.brightQ = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tMap: this.uBrightMap, uThresh: { value: 0.38 } },
        vertexShader: VERT,
        fragmentShader: BRIGHT_FRAG,
        depthTest: false,
        depthWrite: false,
      })
    );
    this.blurQ = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tMap: this.uBlurMap, uDir: this.uBlurDir },
        vertexShader: VERT,
        fragmentShader: BLUR_FRAG,
        depthTest: false,
        depthWrite: false,
      })
    );
    this.compQ = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: {
          tScene: this.uScene,
          tBloom: this.uBloom,
          uBloom: this.uBloomAmt,
          uBeat: this.uBeat,
          uCA: this.uCA,
          uGrain: this.uGrain,
          uTime: this.uTime,
          uRes: this.uRes,
        },
        vertexShader: VERT,
        fragmentShader: COMP_FRAG,
        depthTest: false,
        depthWrite: false,
      })
    );
  }

  ensure(width: number, height: number) {
    if (this.w === width && this.h === height && this.rawRT) return;
    this.w = width;
    this.h = height;
    this.brightRT?.dispose();
    this.blurH?.dispose();
    this.blurV?.dispose();
    this.rawRT?.dispose();
    const bw = Math.max(2, Math.floor(width / 2));
    const bh = Math.max(2, Math.floor(height / 2));
    this.brightRT = rt(bw, bh);
    this.blurH = rt(bw, bh);
    this.blurV = rt(bw, bh);
    this.rawRT = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      colorSpace: THREE.SRGBColorSpace,
    });
    this.uRes.value.set(width, height);
  }

  /** Scene should already have been rendered into `this.raw`. Grades into `dst`. */
  get raw(): THREE.WebGLRenderTarget {
    if (!this.rawRT) throw new Error("PostStack.ensure() first");
    return this.rawRT;
  }

  apply(
    gl: THREE.WebGLRenderer,
    dst: THREE.WebGLRenderTarget,
    opts: { bloom: number; beat: number; time: number; grain: number }
  ) {
    if (!this.rawRT || !this.brightRT || !this.blurH || !this.blurV) return;
    this.uBloomAmt.value = opts.bloom;
    this.uBeat.value = opts.beat;
    this.uTime.value = opts.time;
    this.uGrain.value = opts.grain;

    const prev = gl.getRenderTarget();
    const auto = gl.autoClear;
    gl.autoClear = true;

    this.uBrightMap.value = this.rawRT.texture;
    gl.setRenderTarget(this.brightRT);
    this.brightQ.render(gl);

    const px = 1 / this.brightRT.width;
    const py = 1 / this.brightRT.height;

    // Tight blur
    this.uBlurMap.value = this.brightRT.texture;
    this.uBlurDir.value.set(px, 0);
    gl.setRenderTarget(this.blurH);
    this.blurQ.render(gl);

    this.uBlurMap.value = this.blurH.texture;
    this.uBlurDir.value.set(0, py);
    gl.setRenderTarget(this.blurV);
    this.blurQ.render(gl);

    // Wide glow (second pass, larger kernel) — the "heavy" LED look.
    this.uBlurMap.value = this.blurV.texture;
    this.uBlurDir.value.set(px * 2.4, 0);
    gl.setRenderTarget(this.blurH);
    this.blurQ.render(gl);

    this.uBlurMap.value = this.blurH.texture;
    this.uBlurDir.value.set(0, py * 2.4);
    gl.setRenderTarget(this.blurV);
    this.blurQ.render(gl);

    this.uScene.value = this.rawRT.texture;
    this.uBloom.value = this.blurV.texture;
    gl.setRenderTarget(dst);
    this.compQ.render(gl);

    gl.autoClear = auto;
    gl.setRenderTarget(prev);
  }
}
