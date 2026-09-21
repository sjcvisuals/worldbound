/** Shared GLSL1 helpers for cinema plates. Motion wraps on uLoopLength. */

export const LOOP_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uLoopLength;
  float loopT() {
    if (uLoopLength <= 0.001) return uTime;
    return mod(uTime, uLoopLength);
  }
  float loopPhase() {
    if (uLoopLength <= 0.001) return fract(uTime * 0.05);
    return fract(uTime / uLoopLength);
  }
`;

export const NOISE_GLSL = /* glsl */ `
  float hash11(float n){ return fract(sin(n)*43758.5453123); }
  float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  vec2 hash22(vec2 p){
    p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
    return fract(sin(p)*43758.5453);
  }
  float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = hash21(i);
    float b = hash21(i+vec2(1.0,0.0));
    float c = hash21(i+vec2(0.0,1.0));
    float d = hash21(i+vec2(1.0,1.0));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float fbm(vec2 p){
    float v = 0.0; float a = 0.5;
    for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  float fbmWarp(vec2 p, float ph){
    vec2 q = vec2(fbm(p + vec2(ph, 0.1)), fbm(p + vec2(5.2, 1.3 - ph)));
    vec2 r = vec2(fbm(p + 4.0*q + vec2(1.7, 9.2)), fbm(p + 4.0*q + vec2(8.3, 2.8)));
    return fbm(p + 4.0*r);
  }
`;

export const ANGEL_GLSL = /* glsl */ `
  float sdEllipse(vec2 p, vec2 r){
    float k = length(p/r);
    return (k-1.0)*min(r.x,r.y);
  }
  float sdCircle(vec2 p, float r){ return length(p)-r; }
  // Stylised winged figure in local space (body ~ 1 unit tall).
  float sdAngel(vec2 p){
    float body = sdEllipse(p - vec2(0.0, -0.05), vec2(0.09, 0.38));
    float head = sdCircle(p - vec2(0.0, 0.38), 0.075);
    float halo = abs(sdCircle(p - vec2(0.0, 0.50), 0.13)) - 0.012;
    vec2 wl = p - vec2(-0.12, 0.08);
    wl = vec2(wl.x*0.75 + wl.y*0.35, wl.y);
    float wingL = sdEllipse(wl, vec2(0.42, 0.13));
    vec2 wr = p - vec2(0.12, 0.08);
    wr = vec2(wr.x*0.75 - wr.y*0.35, wr.y);
    float wingR = sdEllipse(wr, vec2(0.42, 0.13));
    float robe = sdEllipse(p - vec2(0.0, -0.42), vec2(0.16, 0.22));
    return min(min(min(body, head), min(wingL, wingR)), min(halo, robe));
  }
`;
