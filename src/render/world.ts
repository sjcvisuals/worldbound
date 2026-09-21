import * as THREE from "three";
import type { LoopVisual } from "../types";

/**
 * The shared 3D content "world". Every screen is a window into THIS single
 * scene, so content lines up and flows across screens automatically once each
 * screen is rendered with its own baked perspective (see engine.ts).
 *
 * The default world realises the demo brief — "angels descending into hell,
 * electric blue" — as a volumetric field of descending light motes over a
 * glowing abyss, with a nebula backdrop. It is fully procedural and GPU-cheap.
 */

const PARTICLE_COUNT = 4000;

export interface WorldUniforms {
  uTime: { value: number };
  uEnergy: { value: number };
  uBeat: { value: number };
  uIntensity: { value: number };
  uSpeed: { value: number };
  uDensity: { value: number };
  uBeatPunch: { value: number };
  uColTop: { value: THREE.Color };
  uColMid: { value: THREE.Color };
  uColBottom: { value: THREE.Color };
}

export class ContentWorld {
  readonly scene: THREE.Scene;
  readonly uniforms: WorldUniforms;
  private points: THREE.Points;
  private backdrop: THREE.Mesh;
  private abyss: THREE.Mesh;
  private beams: THREE.Mesh;

  constructor() {
    this.scene = new THREE.Scene();

    this.uniforms = {
      uTime: { value: 0 },
      uEnergy: { value: 0.2 },
      uBeat: { value: 0 },
      uIntensity: { value: 0.6 },
      uSpeed: { value: 1 },
      uDensity: { value: 0.6 },
      uBeatPunch: { value: 0.6 },
      uColTop: { value: new THREE.Color("#7df9ff") },
      uColMid: { value: new THREE.Color("#00b3ff") },
      uColBottom: { value: new THREE.Color("#ff2d55") },
    };

    this.backdrop = this.buildBackdrop();
    this.abyss = this.buildAbyss();
    this.beams = this.buildBeams();
    this.points = this.buildParticles();

    this.scene.add(this.backdrop, this.abyss, this.beams, this.points);
  }

  private buildBackdrop(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(90, 32, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vPos;
        uniform float uTime; uniform float uEnergy; uniform float uIntensity;
        uniform vec3 uColTop; uniform vec3 uColMid; uniform vec3 uColBottom;
        // hash / value noise
        float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float noise(vec3 x){
          vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                         mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                         mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }
        void main(){
          vec3 dir = normalize(vPos);
          float h = clamp(dir.y*0.5+0.5, 0.0, 1.0);
          float n = 0.0; vec3 q = dir*3.0 + vec3(0.0, uTime*0.03, 0.0);
          n += 0.6*noise(q); n += 0.3*noise(q*2.1+7.0); n += 0.1*noise(q*4.3+19.0);
          vec3 sky = mix(uColBottom, uColMid, smoothstep(0.0,0.55,h));
          sky = mix(sky, uColTop, smoothstep(0.5,1.0,h));
          float glow = pow(1.0-h, 3.0);            // hot horizon / abyss glow
          vec3 col = sky*(0.12+0.5*n*(0.4+uEnergy)) + uColBottom*glow*(0.4+0.8*uEnergy);
          col *= (0.5 + 0.9*uIntensity);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildAbyss(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(200, 200, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime; uniform float uEnergy; uniform float uBeat;
        uniform vec3 uColBottom; uniform vec3 uColMid;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453); }
        void main(){
          vec2 uv = vUv*10.0;
          vec2 g = floor(uv); vec2 f = fract(uv);
          float d = 1.0;
          for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
            vec2 o = vec2(float(x),float(y));
            vec2 p = o + 0.5 + 0.4*sin(uTime*0.7 + 6.2831*hash(g+o));
            d = min(d, length(f-p));
          }
          float cells = smoothstep(0.6,0.0,d);
          float pulse = 0.6 + 0.8*uEnergy + uBeat*0.8;
          vec3 col = mix(uColBottom, uColMid, cells) * cells * pulse;
          float fade = smoothstep(1.0, 0.2, distance(vUv, vec2(0.5)) * 2.0);
          gl_FragColor = vec4(col*fade, fade*cells);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -8;
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildBeams(): THREE.Mesh {
    // A few large additive vertical planes give volumetric "god ray" depth cues.
    const geo = new THREE.PlaneGeometry(1.4, 40, 1, 1);
    const inst = new THREE.InstancedMesh(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying float vRnd;
          attribute float aRnd;
          void main(){ vUv = uv; vRnd = aRnd;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `,
        fragmentShader: /* glsl */ `
          precision highp float; varying vec2 vUv; varying float vRnd;
          uniform float uTime; uniform float uEnergy; uniform float uIntensity;
          uniform vec3 uColMid; uniform vec3 uColTop;
          void main(){
            float x = abs(vUv.x-0.5)*2.0;
            float core = smoothstep(1.0,0.0,x);
            float flick = 0.6+0.4*sin(uTime*3.0+vRnd*30.0);
            float a = core*core*(0.12+0.5*uEnergy)*flick*uIntensity;
            vec3 col = mix(uColMid,uColTop,vUv.y);
            gl_FragColor = vec4(col, a);
          }
        `,
      }) as THREE.Material,
      14
    ) as unknown as THREE.Mesh;
    const im = inst as unknown as THREE.InstancedMesh;
    const rnd = new Float32Array(14);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2;
      const rad = 10 + (i % 3) * 6;
      m.makeRotationY(ang);
      m.setPosition(Math.cos(ang) * rad, 2, Math.sin(ang) * rad - 4);
      im.setMatrixAt(i, m);
      rnd[i] = Math.random();
    }
    im.geometry.setAttribute("aRnd", new THREE.InstancedBufferAttribute(rnd, 1));
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    return inst;
  }

  private buildParticles(): THREE.Points {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const rnd = new Float32Array(PARTICLE_COUNT);
    const spanX = 44;
    const spanZ = 44;
    const spanY = 34;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * spanX;
      pos[i * 3 + 1] = Math.random() * spanY - 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spanZ - 4;
      rnd[i] = Math.random();
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        ...(this.uniforms as unknown as Record<string, THREE.IUniform>),
        uSpanY: { value: spanY },
      },
      vertexShader: /* glsl */ `
        precision highp float;
        attribute float aRnd;
        uniform float uTime; uniform float uSpeed; uniform float uDensity;
        uniform float uBeat; uniform float uBeatPunch; uniform float uSpanY;
        varying float vLife; varying float vRnd;
        void main(){
          vRnd = aRnd;
          vec3 p = position;
          // Descend and wrap — "angels descending".
          float fall = uTime * (1.2 + uSpeed*1.6) * (0.6 + aRnd);
          float y = mod(p.y - fall + 20.0, uSpanY) ;      // 0..spanY
          p.y = y - 6.0;
          // gentle lateral drift
          p.x += sin(uTime*0.3 + aRnd*20.0) * 1.5;
          p.z += cos(uTime*0.25 + aRnd*17.0) * 1.5;
          vLife = y / uSpanY;                               // 1 top -> 0 bottom
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          float punch = 1.0 + uBeat*uBeatPunch*2.2;
          float size = (14.0 + 40.0*aRnd*uDensity) * punch;
          // fade distant motes beyond density budget
          if (aRnd > 0.25 + uDensity*0.75) size = 0.0;
          gl_PointSize = size * (10.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying float vLife; varying float vRnd;
        uniform float uEnergy; uniform float uIntensity; uniform float uBeat;
        uniform vec3 uColTop; uniform vec3 uColMid; uniform vec3 uColBottom;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float glow = smoothstep(0.5, 0.0, d);
          // colour by height: holy blue at top -> hellfire at bottom
          vec3 col = mix(uColBottom, uColMid, smoothstep(0.0,0.5,vLife));
          col = mix(col, uColTop, smoothstep(0.55,1.0,vLife));
          float b = (0.5 + 0.9*uIntensity + uBeat*0.8) * (0.6+0.8*uEnergy);
          gl_FragColor = vec4(col*b, glow*glow*(0.5+0.5*vRnd));
        }
      `,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  applyLoopVisual(v: LoopVisual) {
    const pal = v.palette;
    const pick = (i: number, fallback: string) => new THREE.Color(pal[i] ?? fallback);
    // top = holy light, mid = theme, bottom = hell
    this.uniforms.uColTop.value.copy(pick(2, "#7df9ff"));
    this.uniforms.uColMid.value.copy(pick(0, "#00b3ff"));
    this.uniforms.uColBottom.value.copy(pick(pal.length - 1, "#ff2d55"));
    this.uniforms.uIntensity.value = v.intensity;
    this.uniforms.uSpeed.value = v.speed;
    this.uniforms.uDensity.value = v.density;
    this.uniforms.uBeatPunch.value = v.beatPunch;
  }

  update(dt: number, energy: number, beat: number) {
    this.uniforms.uTime.value += dt;
    // smooth energy toward target
    this.uniforms.uEnergy.value += (energy - this.uniforms.uEnergy.value) * Math.min(1, dt * 8);
    // beat envelope decays
    this.uniforms.uBeat.value = Math.max(beat, this.uniforms.uBeat.value - dt * 3.5);
  }
}
