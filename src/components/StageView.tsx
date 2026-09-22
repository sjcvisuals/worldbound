import { useLayoutEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Line, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../state/store";
import { engine } from "../render/engine";
import { screenCorners } from "../render/geometry";
import type { GizmoMode, Screen, Vec3 } from "../types";

function sampleEnergy(playhead: number): number {
  const { audio } = useStore.getState();
  const a = audio?.analysis;
  if (!a) return 0.35;
  const f = Math.floor(playhead * a.envelopeHz);
  return a.envelope[Math.max(0, Math.min(a.envelope.length - 1, f))] ?? 0.35;
}

function RenderDriver() {
  const gl = useThree((s) => s.gl);
  const lastPlay = useRef(0);
  const beatIdx = useRef(0);

  useFrame((_, dt) => {
    const st = useStore.getState();
    if (st.exportProgress.active) return;
    const { screens, groups, viewpoint, loops, playhead, generation } = st;

    engine.setLook(generation.visualEngine === "volumetric" ? "volumetric" : "cinema");
    engine.cinema.setPlateVideo(st.plateVideoUrl);
    const active = loops.find((l) => playhead >= l.startSec && playhead < l.endSec);
    const look = generation.look;
    if (active) {
      engine.world.applyLoopVisual({ ...active.visual, look: look ?? active.visual.look });
      engine.world.setTime(playhead - active.startSec, active.lengthSec);
    } else {
      engine.world.applyLoopVisual({
        seed: 0,
        palette: generation.palette,
        intensity: 0.75,
        speed: 1,
        density: 0.7,
        beatPunch: 0.55,
        motif: generation.motif,
        look,
      });
      engine.world.setTime(playhead, 0);
    }

    let beat = 0;
    const a = st.audio?.analysis;
    if (a && st.playing) {
      if (playhead < lastPlay.current) beatIdx.current = 0;
      while (beatIdx.current < a.beats.length && a.beats[beatIdx.current] <= playhead) {
        beat = 1;
        beatIdx.current++;
      }
    }
    lastPlay.current = playhead;

    engine.world.pulse(Math.min(dt, 0.05), sampleEnergy(playhead), beat);
    if (st.lyrics.enabled && st.lyrics.mode !== "off" && st.lyrics.lines.length) {
      engine.setLyricsFrame({
        enabled: true,
        mode: st.lyrics.mode,
        lines: st.lyrics.lines,
        playhead,
        karaoke: st.lyrics.karaoke,
        showNext: st.lyrics.showNext,
        fill: generation.palette[0] ?? "#00b3ff",
        beat: engine.world.uniforms.uBeat.value,
      });
    } else {
      engine.setLyricsFrame(null);
    }
    engine.renderScreens(gl, screens, groups, viewpoint);
  }, 0);

  return null;
}

function rad(d: number) {
  return THREE.MathUtils.degToRad(d);
}
function deg(r: number) {
  return THREE.MathUtils.radToDeg(r);
}

function ScreenMesh({ screen }: { screen: Screen }) {
  const selectScreen = useStore((s) => s.selectScreen);
  const selected = useStore((s) => s.selectedScreenId === screen.id);
  const gizmoMode = useStore((s) => s.gizmoMode);
  const updateScreen = useStore((s) => s.updateScreen);
  const group = useStore((s) => s.groups.find((g) => g.id === screen.groupId));
  const texture = engine.getTarget(screen).texture;
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const tex = engine.getTarget(screen).texture;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    if (mat.map !== tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  });
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;

  const corners = useMemo(() => screenCorners(screen), [screen]);
  const linePoints = useMemo(
    () => [...corners, corners[0]].map((c) => [c.x, c.y, c.z] as [number, number, number]),
    [corners]
  );

  const euler = useMemo(
    () => new THREE.Euler(rad(screen.rotation[0]), rad(screen.rotation[1]), rad(screen.rotation[2])),
    [screen.rotation]
  );

  const showGizmo = selected && gizmoMode !== "eye";

  return (
    <group>
      <group
        ref={groupRef}
        position={screen.position}
        rotation={euler}
        scale={[screen.size.width, screen.size.height, 1]}
      >
        <mesh
          ref={meshRef}
          onClick={(e) => {
            e.stopPropagation();
            selectScreen(screen.id);
          }}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <Line
        points={linePoints}
        color={selected ? "#ffffff" : group?.color ?? "#38bdf8"}
        lineWidth={selected ? 2.5 : 1.2}
      />
      {showGizmo && (
        <TransformControls
          object={groupRef as unknown as MutableRefObject<THREE.Object3D>}
          mode={gizmoMode}
          onMouseDown={() => controls && (controls.enabled = false)}
          onMouseUp={() => {
            if (controls) controls.enabled = true;
          }}
          onObjectChange={() => {
            const g = groupRef.current;
            if (!g) return;
            updateScreen(screen.id, {
              position: [g.position.x, g.position.y, g.position.z],
              rotation: [deg(g.rotation.x), deg(g.rotation.y), deg(g.rotation.z)],
              size: {
                width: Math.max(0.2, Math.abs(g.scale.x)),
                height: Math.max(0.2, Math.abs(g.scale.y)),
              },
            });
          }}
        />
      )}
    </group>
  );
}

function Frustums() {
  const screens = useStore((s) => s.screens);
  const viewpoint = useStore((s) => s.viewpoint);
  const show = useStore((s) => s.showFrustums);
  if (!show) return null;
  return (
    <>
      {screens.map((s) => {
        const eye = viewpoint.overrides[s.id] ?? viewpoint.position;
        const corners = screenCorners(s);
        return corners.map((c, i) => (
          <Line
            key={`${s.id}-${i}`}
            points={[
              [eye[0], eye[1], eye[2]],
              [c.x, c.y, c.z],
            ]}
            color={viewpoint.overrides[s.id] ? "#f472b6" : "#7df9ff"}
            transparent
            opacity={0.28}
            lineWidth={1}
          />
        ));
      })}
    </>
  );
}

function EyeGizmo({
  position,
  color,
  active,
  onChange,
}: {
  position: Vec3;
  color: string;
  active: boolean;
  onChange: (p: Vec3) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;

  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.position.set(position[0], position[1], position[2]);
  }, [position]);

  const sphere = (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.38, 20, 20]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );

  if (!active) return sphere;
  return (
    <TransformControls
      mode="translate"
      onMouseDown={() => controls && (controls.enabled = false)}
      onMouseUp={() => controls && (controls.enabled = true)}
      onObjectChange={() => {
        if (ref.current) onChange([ref.current.position.x, ref.current.position.y, ref.current.position.z]);
      }}
    >
      {sphere}
    </TransformControls>
  );
}

function ViewpointGizmos() {
  const viewpoint = useStore((s) => s.viewpoint);
  const setViewpoint = useStore((s) => s.setViewpoint);
  const setOverride = useStore((s) => s.setViewpointOverride);
  const gizmoMode = useStore((s) => s.gizmoMode);
  const selectedId = useStore((s) => s.selectedScreenId);
  const screens = useStore((s) => s.screens);
  const selectedHasOverride = !!(selectedId && viewpoint.overrides[selectedId]);

  return (
    <>
      <EyeGizmo
        position={viewpoint.position}
        color="#ff2d55"
        active={gizmoMode === "eye" && !selectedHasOverride}
        onChange={setViewpoint}
      />
      {screens.map((s) => {
        const ov = viewpoint.overrides[s.id];
        if (!ov) return null;
        return (
          <EyeGizmo
            key={s.id}
            position={ov}
            color="#f472b6"
            active={gizmoMode === "eye" && selectedId === s.id}
            onChange={(p) => setOverride(s.id, p)}
          />
        );
      })}
    </>
  );
}

const MODE_LABEL: Record<GizmoMode, string> = {
  translate: "Move screens (W)",
  rotate: "Rotate screens (E)",
  scale: "Scale screens (R)",
  eye: "Perspective eye (V)",
};

export function StageToolbar() {
  const mode = useStore((s) => s.gizmoMode);
  const set = useStore((s) => s.setGizmoMode);
  return (
    <div className="stage-overlay">
      <div className="toggle">
        {(["translate", "rotate", "scale", "eye"] as GizmoMode[]).map((m) => (
          <button key={m} className={mode === m ? "on" : ""} onClick={() => set(m)} title={MODE_LABEL[m]}>
            {m === "translate" ? "Move" : m === "rotate" ? "Rotate" : m === "scale" ? "Scale" : "Eye"}
          </button>
        ))}
      </div>
      <span className="badge chip">{MODE_LABEL[mode]}</span>
    </div>
  );
}

export function StageView() {
  const screens = useStore((s) => s.screens);
  return (
    <Canvas
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: [0, 4, 24], fov: 45 }}
      onPointerMissed={() => useStore.getState().selectScreen(null)}
    >
      <color attach="background" args={["#04060d"]} />
      <RenderDriver />
      <Grid
        args={[80, 80]}
        cellSize={1}
        cellColor="#12203f"
        sectionSize={5}
        sectionColor="#1e3a6b"
        position={[0, -0.9, 0]}
        fadeDistance={70}
        infiniteGrid
      />
      {screens.map((s) => (
        <ScreenMesh key={s.id} screen={s} />
      ))}
      <Frustums />
      <ViewpointGizmos />
      <OrbitControls makeDefault target={[0, 2, 0]} maxPolarAngle={Math.PI * 0.52} />
    </Canvas>
  );
}
