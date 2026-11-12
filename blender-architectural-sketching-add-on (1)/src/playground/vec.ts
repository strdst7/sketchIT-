export type Vec3 = [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];

export const sub = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];

export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

export const dot = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const len3 = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export const norm = (a: Vec3): Vec3 => {
  const l = len3(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const dist3 = (a: Vec3, b: Vec3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const mid = (a: Vec3, b: Vec3): Vec3 => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
  (a[2] + b[2]) / 2,
];

export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const centroid = (pts: Vec3[]): Vec3 => {
  if (!pts.length) return [0, 0, 0];
  const s = pts.reduce<Vec3>((acc, p) => add(acc, p), [0, 0, 0]);
  return mul(s, 1 / pts.length);
};

export const key3 = (p: Vec3): string =>
  `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)},${Math.round(
    p[2] * 1000
  )}`;

export const samePoint = (a: Vec3, b: Vec3, eps = 1e-4): boolean =>
  dist3(a, b) < eps;

export const fmt = (n: number, digits = 2): string =>
  n.toFixed(digits).replace(/\.?0+$/, (m) => (m.includes(".") ? "" : m));

export const meters = (n: number): string => `${fmt(n, 3)} m`;
