/**
 * Tool operations shared by the editor and the tutorial film.
 * Both call exactly this code, so the film can only show what the editor does.
 */
import { project, rayPlane, screenRay, type Basis, type Ray } from "./camera";
import {
  bestCandidate,
  collectCandidates,
  COLORS,
  inferDirection,
  pickFace,
  type Cand,
  type DirInference,
  type InferConfig,
} from "./geometry";
import { uid, type FaceObj, type Scene } from "./scene";
import { add, dist3, dot, len3, mul, sub, type Vec3 } from "./vec";

export const GRID_STEP = 0.5;

export type Draft =
  | { kind: "line"; pts: Vec3[] }
  | { kind: "rect"; a: Vec3; b: Vec3 }
  | { kind: "tape"; a: Vec3; b: Vec3 }
  | { kind: "guide"; a: Vec3; b: Vec3 }
  | { kind: "protractor"; a: Vec3; b: Vec3 }
  | { kind: "push"; faceId: string; origin: Vec3; normal: Vec3; dist: number };

/* -------------------------------- polygons -------------------------------- */

/** Newell's method — robust for any planar polygon, convex or not. */
export function newell(pts: Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

export function polyNormal(pts: Vec3[]): Vec3 {
  const v = newell(pts);
  const l = len3(v);
  return l < 1e-12 ? [0, 0, 1] : mul(v, 1 / l);
}

/**
 * Corner-to-corner rectangle. Same height → it lies flat.
 * Different heights → it stands up between the two corners.
 */
export function rectCorners(a: Vec3, b: Vec3): Vec3[] {
  if (Math.abs(a[2] - b[2]) < 1e-6) {
    return [a, [b[0], a[1], a[2]], b, [a[0], b[1], a[2]]];
  }
  return [a, [b[0], b[1], a[2]], b, [a[0], a[1], b[2]]];
}

export function rectIsValid(a: Vec3, b: Vec3): boolean {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  const dz = Math.abs(a[2] - b[2]);
  return dz < 1e-6 ? dx > 1e-4 && dy > 1e-4 : Math.hypot(dx, dy) > 1e-4;
}

/* ------------------------------ scene reducers ----------------------------- */

export function addFace(
  scene: Scene,
  pts: Vec3[],
  color: string,
  name?: string
): Scene {
  const face: FaceObj = {
    id: uid(),
    name: name ?? `Face ${scene.faces.length + 1}`,
    pts,
    color,
  };
  return { ...scene, faces: [...scene.faces, face] };
}

export function addRect(
  scene: Scene,
  a: Vec3,
  b: Vec3,
  color: string
): Scene | null {
  if (!rectIsValid(a, b)) return null;
  return addFace(scene, rectCorners(a, b), color);
}

export function addMeasure(scene: Scene, a: Vec3, b: Vec3): Scene {
  return {
    ...scene,
    edges: [
      ...scene.edges,
      {
        id: uid(),
        a,
        b,
        kind: "measure",
        label: `${dist3(a, b).toFixed(3)} m`,
      },
    ],
  };
}

export function addGuideLine(scene: Scene, a: Vec3, b: Vec3): Scene {
  return {
    ...scene,
    edges: [...scene.edges, { id: uid(), a, b, kind: "guide" }],
  };
}

/** The point a typed length lands on: `n` metres from the anchor, toward the cursor. */
export function typedPoint(anchor: Vec3, toward: Vec3 | null, n: number): Vec3 {
  let dir: Vec3 = toward ? sub(toward, anchor) : [1, 0, 0];
  let l = len3(dir);
  if (l < 1e-6) {
    dir = [1, 0, 0];
    l = 1;
  }
  return add(anchor, mul(dir, n / l));
}

/** Push/Pull: extrude a face along its normal into walls and a cap. */
export function extrudeFace(
  scene: Scene,
  faceId: string,
  dist: number,
  color?: string
): Scene {
  const face = scene.faces.find((f) => f.id === faceId);
  if (!face || Math.abs(dist) < 1e-4) return scene;
  const off = mul(polyNormal(face.pts), dist);
  const top = face.pts.map((p) => add(p, off));
  const col = color ?? face.color;
  const sides: FaceObj[] = face.pts.map((p, i) => {
    const j = (i + 1) % face.pts.length;
    return {
      id: uid(),
      name: "Wall",
      pts: [p, face.pts[j], top[j], top[i]],
      color: col,
    };
  });
  const cap: FaceObj = { id: uid(), name: "Cap", pts: top, color: col };
  return { ...scene, faces: [...scene.faces, ...sides, cap] };
}

/* ------------------------------- constraints ------------------------------- */

/** Parameter along the line (origin + s·dir) closest to a view ray. */
export function lineParam(ray: Ray, origin: Vec3, dir: Vec3): number {
  const w0 = sub(origin, ray.origin);
  const a = dot(dir, dir);
  const b = dot(dir, ray.dir);
  const c = dot(ray.dir, ray.dir);
  const d = dot(dir, w0);
  const e = dot(ray.dir, w0);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-9) return 0;
  return (b * e - c * d) / den;
}

export function draftAnchor(d: Draft | null): Vec3 | null {
  if (!d) return null;
  if (d.kind === "line") return d.pts.length ? d.pts[d.pts.length - 1] : null;
  if (d.kind === "push") return null;
  return d.a;
}

const snapN = (v: number) => Math.round(v / GRID_STEP) * GRID_STEP;
const gridPoint = (p: Vec3): Vec3 => [snapN(p[0]), snapN(p[1]), snapN(p[2])];

function onSegment(p: Vec3, a: Vec3, b: Vec3): boolean {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return dist3(p, a) < 1e-6;
  const t = dot(sub(p, a), ab) / l2;
  if (t < -1e-9 || t > 1 + 1e-9) return false;
  return dist3(p, add(a, mul(ab, t))) < 1e-6;
}

function axisConstrain(p: Vec3, anchor: Vec3): Vec3 {
  const d = sub(p, anchor);
  const ax = Math.abs(d[0]);
  const ay = Math.abs(d[1]);
  const az = Math.abs(d[2]);
  if (ax >= ay && ax >= az) return add(anchor, [d[0], 0, 0]);
  if (ay >= az) return add(anchor, [0, d[1], 0]);
  return add(anchor, [0, 0, d[2]]);
}

function candAt(
  kind: string,
  label: string,
  color: string,
  pos: Vec3,
  basis: Basis
): Cand {
  const q = project(basis, pos);
  return { kind, label, color, pos, prio: 0, sx: q.x, sy: q.y, d: 0 };
}

/** A snap target hidden behind a face is not a snap target. */
function isVisible(scene: Scene, eye: Vec3, pos: Vec3): boolean {
  const d = sub(pos, eye);
  const l = len3(d);
  if (l < 1e-6) return true;
  const hit = pickFace(scene, eye, mul(d, 1 / l));
  return !hit || hit.t > l - 0.02;
}

/* ------------------------------ the resolver ------------------------------- */

export interface SnapOpts {
  /** Slide along the blue (Z) axis through the anchor. */
  zLock?: boolean;
  /** Constrain to the dominant world axis from the anchor. */
  axisLock?: boolean;
  /** Wireframe: allow snapping to hidden geometry. */
  xray?: boolean;
}

export interface SnapResult {
  pos: Vec3;
  cand: Cand | null;
  dir: DirInference | null;
}

/**
 * Turns a screen position into a 3D point, in SketchUp's order of trust:
 * point inferences → on edge → on face → the drawing plane (grid).
 */
export function resolveSnap(
  scene: Scene,
  basis: Basis,
  sx: number,
  sy: number,
  cfg: InferConfig,
  draft: Draft | null,
  opts: SnapOpts = {}
): SnapResult {
  const anchor = draftAnchor(draft);
  const ray = screenRay(basis, sx, sy);
  const grid = cfg.enabled.has("grid");

  let cands = collectCandidates(scene, basis, sx, sy, cfg);
  if (!opts.xray) {
    cands = cands.filter((c) => isVisible(scene, basis.eye, c.pos));
  }
  let best = bestCandidate(cands);

  // the chain's own first point closes the loop into a face
  if (draft && draft.kind === "line" && draft.pts.length >= 3) {
    const p0 = project(basis, draft.pts[0]);
    if (p0.ok) {
      const dd = Math.hypot(p0.x - sx, p0.y - sy);
      if (
        dd <= cfg.threshold &&
        (!best || best.kind === "onedge" || dd <= best.d + 0.5)
      ) {
        best = {
          kind: "close",
          label: "Close Face",
          color: COLORS.endpoint,
          pos: draft.pts[0],
          prio: 0,
          sx: p0.x,
          sy: p0.y,
          d: dd,
        };
      }
    }
  }

  // blue-axis lock: only the height is free
  if (opts.zLock && anchor) {
    const strong = best && best.kind !== "onedge" ? best : null;
    let z = strong
      ? strong.pos[2]
      : anchor[2] + lineParam(ray, anchor, [0, 0, 1]);
    if (!strong && grid) z = snapN(z);
    const pos: Vec3 = [anchor[0], anchor[1], z];
    return {
      pos,
      cand: candAt("axis", "On Blue Axis", COLORS.axis, pos, basis),
      dir: null,
    };
  }

  // point inferences win outright
  if (best && best.kind !== "onedge") {
    const pos =
      opts.axisLock && anchor ? axisConstrain(best.pos, anchor) : best.pos;
    return { pos, cand: best, dir: null };
  }

  let pos: Vec3 | null = null;
  let cand: Cand | null = null;

  if (best) {
    // on edge
    pos = best.pos;
    cand = best;
    if (grid && best.edge) {
      const g = gridPoint(pos);
      if (onSegment(g, best.edge[0], best.edge[1])) {
        pos = g;
        cand = {
          ...candAt("onedge", "On Edge", COLORS.onedge, g, basis),
          edge: best.edge,
        };
      }
    }
  } else if (cfg.enabled.has("onface")) {
    const hit = pickFace(scene, ray.origin, ray.dir);
    const face = hit ? scene.faces.find((f) => f.id === hit.id) : undefined;
    if (hit && face) {
      pos = hit.pos;
      let label = "On Face";
      if (grid) {
        const g = gridPoint(pos);
        const n = polyNormal(face.pts);
        if (Math.abs(dot(n, sub(g, face.pts[0]))) < 1e-6) {
          pos = g;
          label = "On Face · Grid";
        }
      }
      cand = candAt("onface", label, COLORS.onface, pos, basis);
    }
  }

  // the drawing plane: level with the anchor, or the ground
  if (!pos) {
    const z0 = anchor ? anchor[2] : 0;
    let p = rayPlane(ray, [0, 0, z0], [0, 0, 1]);
    if (p && dist3(p, basis.target) > 400) p = null;
    if (!p && anchor) p = rayPlane(ray, anchor, basis.fwd);
    if (!p) p = add(basis.eye, mul(ray.dir, dist3(basis.eye, basis.target)));
    pos = p;
    if (grid && Math.abs(p[2] - z0) < 1e-6) {
      pos = [snapN(p[0]), snapN(p[1]), z0];
      cand = candAt("grid", "Grid", COLORS.grid, pos, basis);
    }
  }

  let dir: DirInference | null = null;
  if (!cand && anchor && cfg.enabled.has("parallel")) {
    const di = inferDirection(scene, anchor, pos);
    if (di) {
      dir = di;
      pos = add(anchor, mul(di.dir, dist3(anchor, pos)));
    }
  }
  if (opts.axisLock && anchor) pos = axisConstrain(pos, anchor);
  return { pos, cand, dir };
}
