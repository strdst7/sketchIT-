import type { Cam } from "./scene";
import { add, cross, dot, mul, norm, sub, type Vec3 } from "./vec";

export const NEAR = 0.05;
export const FOV = (50 * Math.PI) / 180;

export interface Basis {
  eye: Vec3;
  target: Vec3;
  right: Vec3;
  up: Vec3;
  fwd: Vec3;
  cx: number;
  cy: number;
  f: number;
  w: number;
  h: number;
}

export interface Proj {
  x: number;
  y: number;
  z: number;
  ok: boolean;
}

export function makeBasis(cam: Cam, w: number, h: number): Basis {
  const pitch = Math.max(-1.5, Math.min(1.5, cam.pitch));
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const dir: Vec3 = [
    Math.sin(cam.yaw) * cp,
    -Math.cos(cam.yaw) * cp,
    sp,
  ];
  const eye = add(cam.target, mul(dir, cam.dist));
  const fwd = norm(sub(cam.target, eye));
  let right = norm(cross(fwd, [0, 0, 1]));
  if (!isFinite(right[0]) || len3Safe(right) < 1e-5) right = [1, 0, 0];
  const up = cross(right, fwd);
  const f = h / 2 / Math.tan(FOV / 2);
  return {
    eye,
    target: cam.target,
    right,
    up,
    fwd,
    cx: w / 2,
    cy: h / 2,
    f,
    w,
    h,
  };
}

function len3Safe(v: Vec3) {
  return Math.hypot(v[0], v[1], v[2]);
}

export function project(b: Basis, p: Vec3): Proj {
  const d = sub(p, b.eye);
  const z = dot(d, b.fwd);
  const x = dot(d, b.right);
  const y = dot(d, b.up);
  if (z <= NEAR) return { x: 0, y: 0, z, ok: false };
  const s = b.f / z;
  return { x: b.cx + x * s, y: b.cy - y * s, z, ok: true };
}

export function viewZ(b: Basis, p: Vec3): number {
  return dot(sub(p, b.eye), b.fwd);
}

/** Clip a world-space polygon against the near plane. */
export function clipPolyNear(pts: Vec3[], b: Basis): Vec3[] {
  const out: Vec3[] = [];
  const inside = (p: Vec3) => viewZ(b, p) >= NEAR;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    const ci = inside(cur);
    const pi = inside(prev);
    if (ci) {
      if (!pi) {
        const t = (NEAR - viewZ(b, prev)) / (viewZ(b, cur) - viewZ(b, prev));
        out.push(add(prev, mul(sub(cur, prev), t)));
      }
      out.push(cur);
    } else if (pi) {
      const t = (NEAR - viewZ(b, prev)) / (viewZ(b, cur) - viewZ(b, prev));
      out.push(add(prev, mul(sub(cur, prev), t)));
    }
  }
  return out;
}

/** Clip a world-space segment against the near plane. */
export function clipSegNear(
  a: Vec3,
  b: Vec3,
  basis: Basis
): [Vec3, Vec3] | null {
  const za = viewZ(basis, a);
  const zb = viewZ(basis, b);
  if (za < NEAR && zb < NEAR) return null;
  if (za >= NEAR && zb >= NEAR) return [a, b];
  const t = (NEAR - za) / (zb - za);
  const p = add(a, mul(sub(b, a), t));
  return za < NEAR ? [p, b] : [a, p];
}

export interface Ray {
  origin: Vec3;
  dir: Vec3;
}

export function screenRay(b: Basis, sx: number, sy: number): Ray {
  const ndcX = (sx - b.cx) / b.f;
  const ndcY = -(sy - b.cy) / b.f;
  const dir = norm(
    add(add(mul(b.right, ndcX), mul(b.up, ndcY)), b.fwd)
  );
  return { origin: b.eye, dir };
}

/** Intersect a ray with an infinite plane defined by a point + normal. */
export function rayPlane(
  ray: Ray,
  point: Vec3,
  normal: Vec3
): Vec3 | null {
  const denom = dot(ray.dir, normal);
  if (Math.abs(denom) < 1e-6) return null;
  const t = dot(sub(point, ray.origin), normal) / denom;
  if (t <= 0) return null;
  return add(ray.origin, mul(ray.dir, t));
}
