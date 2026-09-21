import * as THREE from "three";
import type { Screen, Vec3 } from "../types";

/** Returns the four world-space corners of a screen: BL, BR, TR, TL. */
export function screenCorners(screen: Screen): THREE.Vector3[] {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(screen.rotation[0]),
      THREE.MathUtils.degToRad(screen.rotation[1]),
      THREE.MathUtils.degToRad(screen.rotation[2])
    )
  );
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const hw = screen.size.width / 2;
  const hh = screen.size.height / 2;
  const c = new THREE.Vector3(...screen.position);
  return [
    c.clone().addScaledVector(right, -hw).addScaledVector(up, -hh),
    c.clone().addScaledVector(right, hw).addScaledVector(up, -hh),
    c.clone().addScaledVector(right, hw).addScaledVector(up, hh),
    c.clone().addScaledVector(right, -hw).addScaledVector(up, hh),
  ];
}

export function toArr(v: THREE.Vector3): Vec3 {
  return [v.x, v.y, v.z];
}
