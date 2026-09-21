import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Line, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../state/store";
import { engine } from "../render/engine";
import { screenCorners } from "../render/geometry";
import type { Screen } from "../types";

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
    const { screens, groups, viewpoint, loops, playhead, generation } = st;

    // Active loop → visual params (fallback to generation defaults pre-generate).
    const active = loops.find((l) => playhead >= l.startSec && playhead < l.endSec);
    if (active) engine.world.applyLoopVisual(active.visual);
    else
      engine.world.applyLoopVisual({
        seed: 0,
        palette: generation.palette,
        intensity: 0.5,
        speed: 1,
        density: 0.5,
        beatPunch: 0.5,
        motif: generation.motif,
      });

    // Beat detection: pulse when playhead crosses a beat time.
    let beat = 0;
    const a = st.audio?.analysis;
    if (a && st.playing) {
      if (playhead < lastPlay.current) beatIdx.current = 0; // looped/seek back
      while (beatIdx.current < a.beats.length && a.beats[beatIdx.current] <= playhead) {
        beat = 1;
        beatIdx.current++;
      }
    }
    lastPlay.current = playhead;

    const energy = sampleEnergy(playhead);
    engine.world.update(Math.min(dt, 0.05), energy, beat);
    engine.renderScreens(gl, screens, groups, viewpoint);
  }, 0);

  return null;
}

function ScreenMesh({ screen }: { screen: Screen }) {
  const selectScreen = useStore((s) => s.selectScreen);
  const selected = useStore((s) => s.selectedScreenId === screen.id);
  const group = useStore((s) => s.groups.find((g) => g.id === screen.groupId));
  const texture = engine.getTarget(screen).texture;

  const corners = useMemo(() => screenCorners(screen), [screen]);
  const linePoints = useMemo(
    () => [...corners, corners[0]].map((c) => [c.x, c.y, c.z] as [number, number, number]),
    [corners]
  );

  const quat = useMemo(
    () =>
      new THREE.Euler(
        THREE.MathUtils.degToRad(screen.rotation[0]),
        THREE.MathUtils.degToRad(screen.rotation[1]),
        THREE.MathUtils.degToRad(screen.rotation[2])
      ),
    [screen.rotation]
  );

  return (
    <group>
      <mesh
        position={screen.position}
        rotation={quat}
        onClick={(e) => {
          e.stopPropagation();
          selectScreen(screen.id);
        }}
      >
        <planeGeometry args={[screen.size.width, screen.size.height]} />
        <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <Line
        points={linePoints}
        color={selected ? "#ffffff" : group?.color ?? "#38bdf8"}
        lineWidth={selected ? 2.5 : 1.2}
      />
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
            color="#7df9ff"
            transparent
            opacity={0.28}
            lineWidth={1}
          />
        ));
      })}
    </>
  );
}

function ViewpointGizmo() {
  const viewpoint = useStore((s) => s.viewpoint);
  const setViewpoint = useStore((s) => s.setViewpoint);
  const ref = useRef<THREE.Mesh>(null);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;

  return (
    <TransformControls
      mode="translate"
      onMouseDown={() => controls && (controls.enabled = false)}
      onMouseUp={() => controls && (controls.enabled = true)}
      onObjectChange={() => {
        if (ref.current)
          setViewpoint([ref.current.position.x, ref.current.position.y, ref.current.position.z]);
      }}
    >
      <mesh ref={ref} position={viewpoint.position}>
        <sphereGeometry args={[0.4, 20, 20]} />
        <meshBasicMaterial color="#ff2d55" />
      </mesh>
    </TransformControls>
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
      <ViewpointGizmo />
      <OrbitControls makeDefault target={[0, 2, 0]} maxPolarAngle={Math.PI * 0.52} />
    </Canvas>
  );
}
