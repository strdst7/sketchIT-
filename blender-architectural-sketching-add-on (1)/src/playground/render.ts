import { clipSegNear, NEAR, project, type Basis } from "./camera";
import { newell, rectCorners, type Draft } from "./ops";
import type { FaceObj, Scene } from "./scene";
import { add, dist3, dot, len3, mid, mul, norm, sub, type Vec3 } from "./vec";

export type { Draft } from "./ops";

export interface ViewOpts {
  grid: boolean;
  guides: boolean;
  measures: boolean;
  wire: boolean;
}

export interface CandView {
  kind: string;
  label: string;
  color: string;
  sx: number;
  sy: number;
}

export const LIGHT = norm([0.5, -0.3, 0.81]);

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string
) {
  ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
  const tw = ctx.measureText(text).width;
  const padX = 7;
  const w = tw + padX * 2;
  const h = 19;
  const left = x - w / 2;
  const top = y - h / 2;
  roundRect(ctx, left, top, w, h, 4);
  ctx.fillStyle = "rgba(8,10,14,0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + padX, top + h / 2 + 0.5);
}

/* ------------------------------ visibility (BSP) ----------------------------- */
/*
 * Faces are sorted with a BSP tree, so the painting order is exact for any
 * view — walls never bleed through roofs, and coplanar faces (a door on a
 * wall) paint in the order they were drawn.
 */

interface Frag {
  pts: Vec3[];
  /** real[i]: the edge pts[i]→pts[i+1] is a true face edge, not a BSP cut. */
  real: boolean[];
  n: Vec3;
  color: string;
}

interface BspNode {
  n: Vec3;
  d: number;
  frags: Frag[];
  front: BspNode | null;
  back: BspNode | null;
}

interface Piece {
  pts: Vec3[];
  real: boolean[];
}

const EPS = 1e-4;

function splitPoly(
  pts: Vec3[],
  real: boolean[],
  n: Vec3,
  d: number
): { front: Piece | null; back: Piece | null; coplanar: boolean } {
  const cnt = pts.length;
  const ds: number[] = [];
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < cnt; i++) {
    const v = dot(n, pts[i]) - d;
    ds.push(v);
    if (v > EPS) pos++;
    else if (v < -EPS) neg++;
  }
  if (!pos && !neg) return { front: null, back: null, coplanar: true };
  if (!neg) return { front: { pts, real }, back: null, coplanar: false };
  if (!pos) return { front: null, back: { pts, real }, coplanar: false };

  const f: Piece = { pts: [], real: [] };
  const b: Piece = { pts: [], real: [] };
  for (let i = 0; i < cnt; i++) {
    const j = (i + 1) % cnt;
    const di = ds[i];
    const dj = ds[j];
    const si = di > EPS ? 1 : di < -EPS ? -1 : 0;
    const sj = dj > EPS ? 1 : dj < -EPS ? -1 : 0;
    if (si >= 0) {
      f.pts.push(pts[i]);
      f.real.push(si === 0 && sj < 0 ? false : real[i]);
    }
    if (si <= 0) {
      b.pts.push(pts[i]);
      b.real.push(si === 0 && sj > 0 ? false : real[i]);
    }
    if (si * sj < 0) {
      const t = di / (di - dj);
      const x = add(pts[i], mul(sub(pts[j], pts[i]), t));
      if (si > 0) {
        f.pts.push(x);
        f.real.push(false);
        b.pts.push(x);
        b.real.push(real[i]);
      } else {
        b.pts.push(x);
        b.real.push(false);
        f.pts.push(x);
        f.real.push(real[i]);
      }
    }
  }
  return {
    front: f.pts.length >= 3 ? f : null,
    back: b.pts.length >= 3 ? b : null,
    coplanar: false,
  };
}

function buildBsp(frags: Frag[]): BspNode | null {
  if (!frags.length) return null;
  const root = frags[0];
  const n = root.n;
  const d = dot(n, root.pts[0]);
  const node: BspNode = { n, d, frags: [root], front: null, back: null };
  const front: Frag[] = [];
  const back: Frag[] = [];
  for (let i = 1; i < frags.length; i++) {
    const fr = frags[i];
    const s = splitPoly(fr.pts, fr.real, n, d);
    if (s.coplanar) {
      node.frags.push(fr);
      continue;
    }
    if (s.front) front.push({ ...fr, pts: s.front.pts, real: s.front.real });
    if (s.back) back.push({ ...fr, pts: s.back.pts, real: s.back.real });
  }
  node.front = buildBsp(front);
  node.back = buildBsp(back);
  return node;
}

function walk(node: BspNode | null, eye: Vec3, out: Frag[]) {
  if (!node) return;
  if (dot(node.n, eye) - node.d > 0) {
    walk(node.back, eye, out);
    for (const f of node.frags) out.push(f);
    walk(node.front, eye, out);
  } else {
    walk(node.front, eye, out);
    for (const f of node.frags) out.push(f);
    walk(node.back, eye, out);
  }
}

const bspCache = new WeakMap<FaceObj[], BspNode | null>();

function treeFor(faces: FaceObj[]): BspNode | null {
  const cached = bspCache.get(faces);
  if (cached !== undefined) return cached;
  const frags: Frag[] = [];
  for (const f of faces) {
    if (f.pts.length < 3) continue;
    const nv = newell(f.pts);
    const l = len3(nv);
    if (l < 1e-10) continue;
    frags.push({
      pts: f.pts,
      real: f.pts.map(() => true),
      n: mul(nv, 1 / l),
      color: f.color,
    });
  }
  const tree = buildBsp(frags);
  bspCache.set(faces, tree);
  return tree;
}

function paintFaces(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  basis: Basis,
  view: ViewOpts
) {
  const order: Frag[] = [];
  walk(treeFor(scene.faces), basis.eye, order);
  const nearD = dot(basis.fwd, basis.eye) + NEAR;

  for (const fr of order) {
    let pts = fr.pts;
    let real = fr.real;
    let behind = false;
    for (const p of pts) {
      if (dot(basis.fwd, p) - nearD < 0) {
        behind = true;
        break;
      }
    }
    if (behind) {
      const s = splitPoly(pts, real, basis.fwd, nearD);
      if (!s.front) continue;
      pts = s.front.pts;
      real = s.front.real;
    }

    const scr = pts.map((p) => project(basis, p));
    if (scr.some((s) => !s.ok)) continue;

    // light the side of the face that is looking at the camera
    const facing = dot(fr.n, sub(basis.eye, pts[0])) >= 0 ? 1 : -1;
    const nz = fr.n[2] * facing;
    const lit =
      0.48 + 0.14 * nz + 0.42 * Math.max(0, dot(fr.n, LIGHT) * facing);

    ctx.beginPath();
    ctx.moveTo(scr[0].x, scr[0].y);
    for (let i = 1; i < scr.length; i++) ctx.lineTo(scr[i].x, scr[i].y);
    ctx.closePath();
    if (!view.wire) {
      const fill = shade(fr.color, lit);
      ctx.fillStyle = fill;
      ctx.fill();
      // hide anti-aliasing seams between BSP fragments
      ctx.strokeStyle = fill;
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }

    ctx.beginPath();
    for (let i = 0; i < scr.length; i++) {
      if (!real[i]) continue;
      const j = (i + 1) % scr.length;
      ctx.moveTo(scr[i].x, scr[i].y);
      ctx.lineTo(scr[j].x, scr[j].y);
    }
    ctx.strokeStyle = view.wire ? shade(fr.color, 1.05) : "rgba(8,10,14,0.78)";
    ctx.lineWidth = 1.1;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

/* --------------------------------- the scene -------------------------------- */

function strokeSeg(
  ctx: CanvasRenderingContext2D,
  basis: Basis,
  a: Vec3,
  b: Vec3
): boolean {
  const seg = clipSegNear(a, b, basis);
  if (!seg) return false;
  const pa = project(basis, seg[0]);
  const pb = project(basis, seg[1]);
  if (!pa.ok || !pb.ok) return false;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
  return true;
}

function drawGrid(ctx: CanvasRenderingContext2D, basis: Basis) {
  const R = 16;
  ctx.lineWidth = 1;
  for (let i = -R; i <= R; i++) {
    ctx.strokeStyle =
      i % 5 === 0 ? "rgba(233,237,242,0.1)" : "rgba(233,237,242,0.04)";
    strokeSeg(ctx, basis, [i, -R, 0], [i, R, 0]);
    strokeSeg(ctx, basis, [-R, i, 0], [R, i, 0]);
  }
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(255,92,92,0.5)";
  strokeSeg(ctx, basis, [-R, 0, 0], [R, 0, 0]);
  ctx.strokeStyle = "rgba(61,220,151,0.42)";
  strokeSeg(ctx, basis, [0, -R, 0], [0, R, 0]);
}

export interface SceneRenderOpts {
  scene: Scene;
  basis: Basis;
  view: ViewOpts;
  selection: Set<string>;
  w: number;
  h: number;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  { scene, basis, view, selection, w, h }: SceneRenderOpts
) {
  ctx.setLineDash([]);
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createRadialGradient(
    w * 0.5,
    h * 0.42,
    0,
    w * 0.5,
    h * 0.42,
    Math.max(w, h) * 0.78
  );
  bg.addColorStop(0, "#171b23");
  bg.addColorStop(1, "#0a0c10");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  if (view.grid) drawGrid(ctx, basis);
  paintFaces(ctx, scene, basis, view);

  // selection outline, drawn over everything like Blender's
  if (selection.size) {
    ctx.strokeStyle = "#ff6a00";
    ctx.lineWidth = 2;
    for (const f of scene.faces) {
      if (!selection.has(f.id)) continue;
      const scr = f.pts.map((p) => project(basis, p));
      if (scr.some((s) => !s.ok)) continue;
      ctx.beginPath();
      ctx.moveTo(scr[0].x, scr[0].y);
      for (let i = 1; i < scr.length; i++) ctx.lineTo(scr[i].x, scr[i].y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // loose edges
  for (const e of scene.edges) {
    if (e.kind !== "edge") continue;
    const on = selection.has(e.id);
    ctx.strokeStyle = "rgba(8,10,14,0.85)";
    ctx.lineWidth = 3.4;
    strokeSeg(ctx, basis, e.a, e.b);
    ctx.strokeStyle = on ? "#ff6a00" : "rgba(233,237,242,0.92)";
    ctx.lineWidth = 1.5;
    strokeSeg(ctx, basis, e.a, e.b);
  }

  // construction geometry
  for (const e of scene.edges) {
    if (e.kind === "edge") continue;
    if (e.kind === "guide" && !view.guides) continue;
    if (e.kind === "measure" && !view.measures) continue;
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = selection.has(e.id)
      ? "#ff6a00"
      : e.kind === "guide"
      ? "rgba(45,212,238,0.95)"
      : "rgba(255,176,32,0.95)";
    ctx.lineWidth = 1.4;
    strokeSeg(ctx, basis, e.a, e.b);
    ctx.setLineDash([]);
    if (e.kind === "measure" && e.label) {
      const m = project(basis, mid(e.a, e.b));
      if (m.ok) drawLabel(ctx, m.x, m.y - 14, e.label, "#ffb020");
    }
  }

  if (view.guides) {
    for (const g of scene.guides) {
      const p = project(basis, g);
      if (!p.ok) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = "rgba(255,176,32,0.95)";
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-3.5, -3.5, 7, 7);
      ctx.restore();
    }
  }
}

/* --------------------------------- overlay --------------------------------- */

export interface OverlayOpts {
  basis: Basis;
  draft: Draft | null;
  cand: CandView | null;
  cursor: { x: number; y: number } | null;
  nextPoint: Vec3 | null;
  color: string;
  showGizmo: boolean;
}

export function drawOverlay(ctx: CanvasRenderingContext2D, o: OverlayOpts) {
  const { basis, draft, cand, cursor, nextPoint, color } = o;

  const rubber = (a: Vec3, b: Vec3, col: string, label?: string) => {
    const pa = project(basis, a);
    const pb = project(basis, b);
    if (!pa.ok || !pb.ok) return;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (label && Math.hypot(pa.x - pb.x, pa.y - pb.y) > 24) {
      drawLabel(ctx, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2 - 15, label, col);
    }
  };
  const metres = (a: Vec3, b: Vec3) => `${dist3(a, b).toFixed(3)} m`;

  if (draft) {
    if (draft.kind === "line") {
      for (let i = 0; i < draft.pts.length - 1; i++) {
        rubber(draft.pts[i], draft.pts[i + 1], color);
      }
      const last = draft.pts[draft.pts.length - 1];
      if (nextPoint && last) {
        rubber(last, nextPoint, color, metres(last, nextPoint));
      }
      ctx.fillStyle = color;
      for (const p of draft.pts) {
        const q = project(basis, p);
        if (q.ok) ctx.fillRect(q.x - 2.5, q.y - 2.5, 5, 5);
      }
    } else if (draft.kind === "rect") {
      if (nextPoint) {
        const corners = rectCorners(draft.a, nextPoint);
        const scr = corners.map((c) => project(basis, c));
        if (scr.every((s) => s.ok)) {
          ctx.beginPath();
          ctx.moveTo(scr[0].x, scr[0].y);
          for (let i = 1; i < scr.length; i++) ctx.lineTo(scr[i].x, scr[i].y);
          ctx.closePath();
          ctx.fillStyle = "rgba(255,106,0,0.14)";
          ctx.fill();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.setLineDash([]);
          const wd = dist3(corners[0], corners[1]);
          const hd = dist3(corners[1], corners[2]);
          if (wd > 1e-3 && hd > 1e-3) {
            const cx = (scr[0].x + scr[2].x) / 2;
            const cy = (scr[0].y + scr[2].y) / 2;
            drawLabel(
              ctx,
              cx,
              cy,
              `${wd.toFixed(2)} × ${hd.toFixed(2)} m`,
              "#ffb020"
            );
          }
        }
      }
    } else if (draft.kind === "tape") {
      if (nextPoint) {
        rubber(draft.a, nextPoint, "#ffb020", metres(draft.a, nextPoint));
      }
    } else if (draft.kind === "guide") {
      if (nextPoint) {
        rubber(draft.a, nextPoint, "#2dd4ee", metres(draft.a, nextPoint));
      }
    } else if (draft.kind === "protractor") {
      if (nextPoint) {
        rubber(draft.a, nextPoint, "#f472b6");
        const a = project(basis, draft.a);
        if (a.ok) {
          const ang =
            ((Math.atan2(
              nextPoint[1] - draft.a[1],
              nextPoint[0] - draft.a[0]
            ) *
              180) /
              Math.PI +
              360) %
            360;
          drawLabel(ctx, a.x + 36, a.y - 26, `${ang.toFixed(1)}°`, "#f472b6");
        }
      }
    } else if (draft.kind === "push") {
      const tip = add(draft.origin, mul(draft.normal, draft.dist));
      rubber(draft.origin, tip, color);
      const q = project(basis, tip);
      if (q.ok) {
        drawLabel(
          ctx,
          q.x + 52,
          q.y - 20,
          `${Math.abs(draft.dist).toFixed(3)} m`,
          "#ffb020"
        );
      }
    }
  }

  // inference badge
  if (cand && cursor) {
    const col = cand.color;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cand.sx, cand.sy, 6.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cand.sx - 12, cand.sy);
    ctx.lineTo(cand.sx - 7, cand.sy);
    ctx.moveTo(cand.sx + 7, cand.sy);
    ctx.lineTo(cand.sx + 12, cand.sy);
    ctx.moveTo(cand.sx, cand.sy - 12);
    ctx.lineTo(cand.sx, cand.sy - 7);
    ctx.moveTo(cand.sx, cand.sy + 7);
    ctx.lineTo(cand.sx, cand.sy + 12);
    ctx.stroke();
    ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
    const half = ctx.measureText(cand.label).width / 2 + 7;
    drawLabel(ctx, cand.sx + 16 + half, cand.sy - 22, cand.label, col);
  }

  if (o.showGizmo) drawGizmo(ctx, basis, 54, 54, 30);
}

export function drawGizmo(
  ctx: CanvasRenderingContext2D,
  basis: Basis,
  cx: number,
  cy: number,
  size: number
) {
  const dirs: Array<[Vec3, string, string]> = [
    [[1, 0, 0], "#ff5c5c", "X"],
    [[0, 1, 0], "#3ddc97", "Y"],
    [[0, 0, 1], "#5ea0ff", "Z"],
  ];
  ctx.font = '600 9px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [d, col, label] of dirs) {
    const x = dot(d, basis.right);
    const y = -dot(d, basis.up);
    const depth = dot(d, basis.fwd);
    ctx.globalAlpha = 0.45 + 0.55 * ((1 - depth) / 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + x * size, cy + y * size);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillText(label, cx + x * (size + 9), cy + y * (size + 9));
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();
}
