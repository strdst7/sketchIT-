import type { Basis } from "./camera";
import { project } from "./camera";
import type { Scene } from "./scene";
import { sceneEdges } from "./scene";
import {
  add,
  centroid,
  cross,
  dot,
  len3,
  mid,
  mul,
  norm,
  sub,
  type Vec3,
} from "./vec";

export interface Cand {
  kind: string;
  label: string;
  color: string;
  pos: Vec3;
  prio: number;
  sx: number;
  sy: number;
  d: number;
  /** For "On Edge": the edge it lies on. */
  edge?: [Vec3, Vec3];
}

/**
 * A point that looks t of the way along an edge on screen is NOT t of the
 * way along it in the world — perspective foreshortens. This converts.
 */
export function worldParam(t: number, za: number, zb: number): number {
  const den = zb + t * (za - zb);
  return Math.abs(den) < 1e-9 ? t : (t * za) / den;
}

export const COLORS = {
  endpoint: "#ff5c5c",
  midpoint: "#5ea0ff",
  center: "#3ddc97",
  intersection: "#f472b6",
  onedge: "#2dd4ee",
  guidepoint: "#ffb020",
  parallel: "#f472b6",
  perpendicular: "#f472b6",
  onface: "#a78bfa",
  axis: "#5ea0ff",
  grid: "#8b95a5",
};

export const ALL_INFERENCES = [
  { id: "endpoint", label: "Endpoint", color: COLORS.endpoint },
  { id: "midpoint", label: "Midpoint", color: COLORS.midpoint },
  { id: "center", label: "Face Center", color: COLORS.center },
  { id: "intersection", label: "Intersection", color: COLORS.intersection },
  { id: "onedge", label: "On Edge", color: COLORS.onedge },
  { id: "guidepoint", label: "Guide Point", color: COLORS.guidepoint },
  { id: "onface", label: "On Face", color: COLORS.onface },
  { id: "grid", label: "Grid 0.5 m", color: COLORS.grid },
  { id: "parallel", label: "Parallel / Perp", color: COLORS.parallel },
];

export interface InferConfig {
  enabled: Set<string>;
  threshold: number;
}

export const defaultInferConfig = (): InferConfig => ({
  enabled: new Set(ALL_INFERENCES.map((i) => i.id)),
  threshold: 15,
});

function segDist2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): { d: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return { d: Math.hypot(px - ax, py - ay), t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { d: Math.hypot(px - cx, py - cy), t };
}

/**
 * The inference engine. Reads the whole scene and proposes the best
 * candidate point for the cursor, the way SketchUp does.
 */
export function collectCandidates(
  scene: Scene,
  basis: Basis,
  sx: number,
  sy: number,
  cfg: InferConfig
): Cand[] {
  const out: Cand[] = [];
  const push = (
    kind: string,
    label: string,
    pos: Vec3,
    prio: number,
    color: string
  ) => {
    if (!cfg.enabled.has(kind)) return;
    const p = project(basis, pos);
    if (!p.ok) return;
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d > cfg.threshold) return;
    out.push({ kind, label, color, pos, prio, sx: p.x, sy: p.y, d });
  };

  for (const f of scene.faces) {
    for (const v of f.pts) push("endpoint", "Endpoint", v, 1, COLORS.endpoint);
    for (let i = 0; i < f.pts.length; i++) {
      const a = f.pts[i];
      const b = f.pts[(i + 1) % f.pts.length];
      push("midpoint", "Midpoint", mid(a, b), 3, COLORS.midpoint);
    }
    if (f.pts.length > 2) {
      push("center", "Face Center", centroid(f.pts), 6, COLORS.center);
    }
  }

  for (const e of scene.edges) {
    if (e.kind === "guide" || e.kind === "measure") {
      push("guidepoint", e.kind === "guide" ? "Guide Point" : "Measure Point", e.a, 4, COLORS.guidepoint);
      push("guidepoint", e.kind === "guide" ? "Guide Point" : "Measure Point", e.b, 4, COLORS.guidepoint);
      continue;
    }
    push("endpoint", "Endpoint", e.a, 1, COLORS.endpoint);
    push("endpoint", "Endpoint", e.b, 1, COLORS.endpoint);
    push("midpoint", "Midpoint", mid(e.a, e.b), 3, COLORS.midpoint);
  }

  for (const g of scene.guides) push("guidepoint", "Guide Point", g, 4, COLORS.guidepoint);

  // closest point on any edge
  if (cfg.enabled.has("onedge")) {
    for (const e of sceneEdges(scene)) {
      const pa = project(basis, e.a);
      const pb = project(basis, e.b);
      if (!pa.ok || !pb.ok) continue;
      const { d, t } = segDist2D(sx, sy, pa.x, pa.y, pb.x, pb.y);
      if (d > cfg.threshold) continue;
      const pos = add(e.a, mul(sub(e.b, e.a), worldParam(t, pa.z, pb.z)));
      out.push({
        kind: "onedge",
        label: "On Edge",
        color: COLORS.onedge,
        pos,
        prio: 8,
        sx: pa.x + (pb.x - pa.x) * t,
        sy: pa.y + (pb.y - pa.y) * t,
        d,
        edge: [e.a, e.b],
      });
    }
  }

  // true 3D intersections between edges
  if (cfg.enabled.has("intersection")) {
    const edges = sceneEdges(scene).slice(0, 160);
    for (let i = 0; i < edges.length; i++) {
      const a = edges[i].a;
      const u = sub(edges[i].b, a);
      const A = dot(u, u);
      if (A < 1e-9) continue;
      for (let j = i + 1; j < edges.length; j++) {
        const c = edges[j].a;
        const v = sub(edges[j].b, c);
        const C = dot(v, v);
        if (C < 1e-9) continue;
        const B = dot(u, v);
        const den = A * C - B * B;
        if (den < 1e-9 * A * C) continue;
        const w0 = sub(a, c);
        const D = dot(u, w0);
        const E = dot(v, w0);
        const si = (B * E - C * D) / den;
        const ti = (A * E - B * D) / den;
        if (si < 0.02 || si > 0.98 || ti < 0.02 || ti > 0.98) continue;
        const p = add(a, mul(u, si));
        const q = add(c, mul(v, ti));
        if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-4) continue;
        push("intersection", "Intersection", p, 2, COLORS.intersection);
      }
    }
  }

  const rank = (c: Cand) => (c.kind === "onedge" ? 1 : 0);
  out.sort((p, q) => rank(p) - rank(q) || p.d - q.d || p.prio - q.prio);
  return out;
}

export function bestCandidate(cands: Cand[]): Cand | null {
  return cands.length ? cands[0] : null;
}

export interface DirInference {
  label: string;
  color: string;
  dir: Vec3;
  angle: number;
}

/**
 * Directional inference: are we parallel or perpendicular to existing
 * geometry? Returns the corrected direction.
 */
export function inferDirection(
  scene: Scene,
  from: Vec3,
  to: Vec3
): DirInference | null {
  const seg = sub(to, from);
  const sl = len3(seg);
  if (sl < 1e-6) return null;
  const d = mul(seg, 1 / sl);
  let best: DirInference | null = null;

  for (const e of sceneEdges(scene)) {
    const ed = sub(e.b, e.a);
    const el = len3(ed);
    if (el < 1e-6) continue;
    const u = mul(ed, 1 / el);
    const c = Math.max(-1, Math.min(1, dot(d, u)));
    const ang = (Math.acos(c) * 180) / Math.PI;
    const acute = Math.min(ang, 180 - ang);

    const targets: Array<[number, string]> = [
      [0, "Parallel"],
      [90, "Perpendicular"],
    ];
    for (const [target, label] of targets) {
      const diff = Math.abs(acute - target);
      if (diff > 3.5) continue;
      if (best && diff >= best.angle) continue;
      let dir: Vec3;
      if (target === 0) {
        dir = u;
      } else {
        const n = cross(u, [0, 0, 1]);
        dir = len3(n) < 1e-4 ? cross(u, [0, 1, 0]) : norm(n);
      }
      if (dot(dir, d) < 0) dir = mul(dir, -1);
      best = {
        label,
        color: target === 0 ? COLORS.parallel : COLORS.perpendicular,
        dir,
        angle: diff,
      };
    }
  }
  return best;
}

/* --------------------------------- picking --------------------------------- */

export interface Pick {
  kind: "face" | "edge" | "guide";
  id: string;
  pos: Vec3;
  t: number;
}

function rayTriangle(
  o: Vec3,
  d: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3
): number | null {
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const p = cross(d, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-9) return null;
  const inv = 1 / det;
  const tv = sub(o, a);
  const u = dot(tv, p) * inv;
  if (u < -1e-4 || u > 1 + 1e-4) return null;
  const q = cross(tv, e1);
  const v = dot(d, q) * inv;
  if (v < -1e-4 || u + v > 1 + 1e-4) return null;
  const t = dot(e2, q) * inv;
  return t > 1e-4 ? t : null;
}

export function pickFace(
  scene: Scene,
  origin: Vec3,
  dir: Vec3
): { id: string; pos: Vec3; t: number } | null {
  let best: { id: string; pos: Vec3; t: number } | null = null;
  for (const f of scene.faces) {
    for (let i = 1; i < f.pts.length - 1; i++) {
      const t = rayTriangle(
        origin,
        dir,
        f.pts[0],
        f.pts[i],
        f.pts[i + 1]
      );
      if (t !== null && (!best || t < best.t)) {
        best = { id: f.id, pos: add(origin, mul(dir, t)), t };
      }
    }
  }
  return best;
}

export function pickEdge(
  scene: Scene,
  basis: Basis,
  sx: number,
  sy: number
): { id: string; pos: Vec3; t: number } | null {
  let best: { id: string; pos: Vec3; t: number } | null = null;
  for (const e of scene.edges) {
    const pa = project(basis, e.a);
    const pb = project(basis, e.b);
    if (!pa.ok || !pb.ok) continue;
    const { d, t } = segDist2D(sx, sy, pa.x, pa.y, pb.x, pb.y);
    if (d > 8) continue;
    if (!best || d < best.t) {
      best = {
        id: e.id,
        pos: add(e.a, mul(sub(e.b, e.a), worldParam(t, pa.z, pb.z))),
        t: d,
      };
    }
  }
  return best;
}

export function angleBetween(a: Vec3, b: Vec3, c: Vec3): number {
  const v1 = sub(a, b);
  const v2 = sub(c, b);
  const l1 = len3(v1);
  const l2 = len3(v2);
  if (l1 < 1e-6 || l2 < 1e-6) return 0;
  const cs = Math.max(-1, Math.min(1, dot(mul(v1, 1 / l1), mul(v2, 1 / l2))));
  return (Math.acos(cs) * 180) / Math.PI;
}
