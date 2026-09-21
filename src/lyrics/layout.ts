import * as THREE from "three";
import type { Screen } from "../types";

export interface SpanSlice {
  screenId: string;
  /** Atlas UV rect, origin top-left: x, y, w, h in 0..1. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpanLayout {
  totalWidth: number;
  maxHeight: number;
  slices: SpanSlice[];
}

/**
 * Unfold a screen group into one 2D canvas by physical width, left → right
 * along the first screen's right-axis. Shorter walls are a centred vertical
 * crop so a line of type sits on the same baseline across the array.
 */
export function layoutSpan(members: Screen[]): SpanLayout {
  if (!members.length) return { totalWidth: 1, maxHeight: 1, slices: [] };
  const base = members[0];
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(base.rotation[0]),
    THREE.MathUtils.degToRad(base.rotation[1]),
    THREE.MathUtils.degToRad(base.rotation[2])
  );
  const q = new THREE.Quaternion().setFromEuler(euler);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const origin = new THREE.Vector3(...base.position);

  const ranked = [...members].sort((a, b) => {
    const ua = new THREE.Vector3(...a.position).sub(origin).dot(right);
    const ub = new THREE.Vector3(...b.position).sub(origin).dot(right);
    return ua - ub;
  });

  const maxHeight = Math.max(...ranked.map((s) => s.size.height), 0.01);
  const totalWidth = ranked.reduce((n, s) => n + s.size.width, 0) || 0.01;
  let x = 0;
  const slices: SpanSlice[] = ranked.map((s) => {
    const w = s.size.width / totalWidth;
    const h = s.size.height / maxHeight;
    const y = (1 - h) / 2;
    const slice = { screenId: s.id, x, y, w, h };
    x += w;
    return slice;
  });
  return { totalWidth, maxHeight, slices };
}

export function sliceFor(layout: SpanLayout, screenId: string): SpanSlice | null {
  return layout.slices.find((s) => s.screenId === screenId) ?? null;
}
