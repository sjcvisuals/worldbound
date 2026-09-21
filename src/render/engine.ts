import * as THREE from "three";
import type { Screen, ScreenGroup, Viewpoint, VisualEngine } from "../types";
import { ContentWorld } from "./world";
import { CinemaWorld } from "./cinema/scene";
import { PostStack } from "./cinema/post";

const PREVIEW_HEIGHT = 320;

interface ScreenTarget {
  target: THREE.WebGLRenderTarget;
  width: number;
  height: number;
}

/**
 * The render engine owns the shared ContentWorld and renders it once per screen
 * with the correct baked projection:
 *  - "world" groups: generalized (off-axis) perspective from the viewpoint
 *    through the screen quad — the nDisplay technique. Content is a continuous
 *    window into the shared 3D world across all screens.
 *  - "flat" groups: an orthographic slice of the world across the group's
 *    combined bounds, so 2D content maps across the screens as one surface.
 */
class Engine {
  readonly volumetric = new ContentWorld();
  readonly cinema = new CinemaWorld();
  look: VisualEngine = "cinema";
  private post = new PostStack();
  private targets = new Map<string, ScreenTarget>();
  private exportTarget: ScreenTarget | null = null;
  private offAxisCam = new THREE.Camera();
  private orthoCam = new THREE.OrthographicCamera();
  private gl: THREE.WebGLRenderer | null = null;
  private vpScratch = new THREE.Vector4();

  // scratch
  private pa = new THREE.Vector3();
  private pb = new THREE.Vector3();
  private pc = new THREE.Vector3();
  private va = new THREE.Vector3();
  private vb = new THREE.Vector3();
  private vc = new THREE.Vector3();
  private vr = new THREE.Vector3();
  private vu = new THREE.Vector3();
  private vn = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private rightV = new THREE.Vector3();
  private upV = new THREE.Vector3();

  constructor() {
    this.offAxisCam.matrixAutoUpdate = false;
  }

  get world(): ContentWorld | CinemaWorld {
    return this.look === "cinema" ? this.cinema : this.volumetric;
  }

  setLook(look: VisualEngine) {
    this.look = look;
  }

  setRenderer(gl: THREE.WebGLRenderer) {
    this.gl = gl;
  }

  getRenderer(): THREE.WebGLRenderer | null {
    return this.gl;
  }

  getTarget(screen: Screen): THREE.WebGLRenderTarget {
    const aspect = screen.resolution.width / screen.resolution.height || 16 / 9;
    const height = PREVIEW_HEIGHT;
    const width = Math.max(2, Math.round(height * aspect));
    let entry = this.targets.get(screen.id);
    if (!entry || entry.width !== width || entry.height !== height) {
      entry?.target.dispose();
      const target = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        colorSpace: THREE.SRGBColorSpace,
      });
      entry = { target, width, height };
      this.targets.set(screen.id, entry);
    }
    return entry.target;
  }

  /** World-space corners of a screen quad: bottom-left, bottom-right, top-left. */
  private corners(screen: Screen) {
    this.euler.set(
      THREE.MathUtils.degToRad(screen.rotation[0]),
      THREE.MathUtils.degToRad(screen.rotation[1]),
      THREE.MathUtils.degToRad(screen.rotation[2])
    );
    this.quat.setFromEuler(this.euler);
    this.rightV.set(1, 0, 0).applyQuaternion(this.quat);
    this.upV.set(0, 1, 0).applyQuaternion(this.quat);
    const hw = screen.size.width / 2;
    const hh = screen.size.height / 2;
    const cx = screen.position[0];
    const cy = screen.position[1];
    const cz = screen.position[2];
    const c = new THREE.Vector3(cx, cy, cz);
    this.pa.copy(c).addScaledVector(this.rightV, -hw).addScaledVector(this.upV, -hh);
    this.pb.copy(c).addScaledVector(this.rightV, hw).addScaledVector(this.upV, -hh);
    this.pc.copy(c).addScaledVector(this.rightV, -hw).addScaledVector(this.upV, hh);
  }

  /** Kooima generalized perspective projection for one screen. */
  private setupOffAxis(screen: Screen, eye: THREE.Vector3) {
    this.corners(screen);
    this.vr.subVectors(this.pb, this.pa).normalize();
    this.vu.subVectors(this.pc, this.pa).normalize();
    this.vn.crossVectors(this.vr, this.vu).normalize();
    this.va.subVectors(this.pa, eye);
    this.vb.subVectors(this.pb, eye);
    this.vc.subVectors(this.pc, eye);

    const near = 0.1;
    const far = 500;
    let d = -this.va.dot(this.vn);
    if (d < 1e-3) d = 1e-3; // eye behind screen guard
    const nd = near / d;
    const left = this.vr.dot(this.va) * nd;
    const right = this.vr.dot(this.vb) * nd;
    const bottom = this.vu.dot(this.va) * nd;
    const top = this.vu.dot(this.vc) * nd;

    const cam = this.offAxisCam;
    cam.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

    // View = rotation(world->screen basis) * translate(-eye).
    const rot = new THREE.Matrix4().set(
      this.vr.x, this.vr.y, this.vr.z, 0,
      this.vu.x, this.vu.y, this.vu.z, 0,
      this.vn.x, this.vn.y, this.vn.z, 0,
      0, 0, 0, 1
    );
    const trans = new THREE.Matrix4().makeTranslation(-eye.x, -eye.y, -eye.z);
    const view = rot.multiply(trans);
    cam.matrixWorld.copy(view).invert();
    cam.matrixWorldInverse.copy(view);
  }

  /** Orthographic slice covering a flat screen's portion of the group bounds. */
  private setupFlat(screen: Screen, group: Screen[]) {
    // Use the first screen's orientation as the group plane basis.
    const base = group[0];
    this.euler.set(
      THREE.MathUtils.degToRad(base.rotation[0]),
      THREE.MathUtils.degToRad(base.rotation[1]),
      THREE.MathUtils.degToRad(base.rotation[2])
    );
    this.quat.setFromEuler(this.euler);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quat);
    const origin = new THREE.Vector3(...base.position);

    // Combined bounds in (right, up) coordinates.
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const s of group) {
      const c = new THREE.Vector3(...s.position).sub(origin);
      const u = c.dot(right);
      const v = c.dot(up);
      minU = Math.min(minU, u - s.size.width / 2);
      maxU = Math.max(maxU, u + s.size.width / 2);
      minV = Math.min(minV, v - s.size.height / 2);
      maxV = Math.max(maxV, v + s.size.height / 2);
    }

    // This screen's sub-rect within the group bounds.
    const c = new THREE.Vector3(...screen.position).sub(origin);
    const su = c.dot(right);
    const sv = c.dot(up);
    const sLeft = su - screen.size.width / 2;
    const sRight = su + screen.size.width / 2;
    const sBottom = sv - screen.size.height / 2;
    const sTop = sv + screen.size.height / 2;

    void minU; void maxU; void minV; void maxV; // bounds computed for clarity/future normalisation

    const cam = this.orthoCam;
    cam.left = sLeft;
    cam.right = sRight;
    cam.top = sTop;
    cam.bottom = sBottom;
    cam.near = 0.1;
    cam.far = 500;
    const camPos = origin.clone().addScaledVector(right, su).addScaledVector(up, sv).addScaledVector(normal, 60);
    cam.position.copy(camPos);
    cam.up.copy(up);
    cam.lookAt(camPos.clone().addScaledVector(normal, -1));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }

  /** Render every screen for the current frame. */
  renderScreens(
    gl: THREE.WebGLRenderer,
    screens: Screen[],
    groups: ScreenGroup[],
    viewpoint: Viewpoint
  ) {
    this.gl = gl;
    const prevTarget = gl.getRenderTarget();
    gl.getViewport(this.vpScratch);
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    const membersByGroup = new Map<string, Screen[]>();
    for (const s of screens) {
      const arr = membersByGroup.get(s.groupId) ?? [];
      arr.push(s);
      membersByGroup.set(s.groupId, arr);
    }

    for (const screen of screens) {
      const group = groupMap.get(screen.groupId);
      const target = this.getTarget(screen);
      const override = viewpoint.overrides[screen.id];
      this.eye.set(
        ...(override ?? viewpoint.position)
      );

      this.drawScreen(
        gl,
        screen,
        membersByGroup.get(screen.groupId) ?? [screen],
        group,
        target,
        target.width,
        target.height
      );
    }
    gl.setViewport(this.vpScratch.x, this.vpScratch.y, this.vpScratch.z, this.vpScratch.w);
    gl.setRenderTarget(prevTarget);
  }

  private drawScreen(
    gl: THREE.WebGLRenderer,
    screen: Screen,
    members: Screen[],
    group: ScreenGroup | undefined,
    dst: THREE.WebGLRenderTarget,
    width: number,
    height: number
  ) {
    this.post.ensure(width, height);
    if (group && group.mode === "flat") {
      this.setupFlat(screen, members);
      gl.setRenderTarget(this.post.raw);
      gl.setViewport(0, 0, width, height);
      gl.clear();
      gl.render(this.world.scene, this.orthoCam);
    } else {
      this.setupOffAxis(screen, this.eye);
      gl.setRenderTarget(this.post.raw);
      gl.setViewport(0, 0, width, height);
      gl.clear();
      gl.render(this.world.scene, this.offAxisCam);
    }
    const bloom = this.look === "cinema" ? 0.9 : 0.55;
    const grain = this.look === "cinema" ? 0.05 : 0.03;
    this.post.apply(gl, dst, {
      bloom,
      beat: this.world.uniforms.uBeat.value,
      time: this.world.uniforms.uTime.value,
      grain,
    });
  }

  /** Copy a screen target into a 2D canvas for the preview panel. */
  readInto(screen: Screen, canvas: HTMLCanvasElement) {
    if (!this.gl) return;
    const entry = this.targets.get(screen.id);
    if (!entry) return;
    const { width, height } = entry;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const buf = new Uint8Array(width * height * 4);
    this.gl.readRenderTargetPixels(entry.target, 0, 0, width, height, buf);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(width, height);
    // Flip vertically (WebGL origin is bottom-left).
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * width * 4;
      const dst = y * width * 4;
      img.data.set(buf.subarray(src, src + width * 4), dst);
    }
    ctx.putImageData(img, 0, 0);
  }

  private ensureExportTarget(width: number, height: number): THREE.WebGLRenderTarget {
    if (!this.exportTarget || this.exportTarget.width !== width || this.exportTarget.height !== height) {
      this.exportTarget?.target.dispose();
      this.exportTarget = {
        target: new THREE.WebGLRenderTarget(width, height, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          colorSpace: THREE.SRGBColorSpace,
        }),
        width,
        height,
      };
    }
    return this.exportTarget.target;
  }

  /**
   * Render one screen at an explicit pixel size into `pixels` (RGBA, top-left origin).
   * Used by the offline exporter. Reuses a dedicated render target.
   */
  renderExportFrame(
    gl: THREE.WebGLRenderer,
    screen: Screen,
    screens: Screen[],
    groups: ScreenGroup[],
    viewpoint: Viewpoint,
    width: number,
    height: number,
    pixels: Uint8ClampedArray
  ) {
    this.gl = gl;
    const target = this.ensureExportTarget(width, height);
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    const members = screens.filter((s) => s.groupId === screen.groupId);
    const group = groupMap.get(screen.groupId);
    const override = viewpoint.overrides[screen.id];
    this.eye.set(...(override ?? viewpoint.position));

    const prevTarget = gl.getRenderTarget();
    gl.getViewport(this.vpScratch);

    this.drawScreen(gl, screen, members.length ? members : [screen], group, target, width, height);

    const buf = new Uint8Array(width * height * 4);
    gl.setRenderTarget(target);
    gl.readRenderTargetPixels(target, 0, 0, width, height, buf);
    gl.setViewport(this.vpScratch.x, this.vpScratch.y, this.vpScratch.z, this.vpScratch.w);
    gl.setRenderTarget(prevTarget);

    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * width * 4;
      const dst = y * width * 4;
      pixels.set(buf.subarray(src, src + width * 4), dst);
    }
  }
}

export const engine = new Engine();
