/**
 * The tutorial film.
 *
 * Not a recording: a deterministic timeline that is rendered live by the
 * playground engine. Every cursor move is resolved through the real inference
 * resolver and every click runs the same scene operations the editor runs, so
 * the film can only show things the editor actually does.
 */
import { makeBasis, project, screenRay } from "../playground/camera";
import { defaultInferConfig, pickFace } from "../playground/geometry";
import {
  addFace,
  addGuideLine,
  addMeasure,
  addRect,
  extrudeFace,
  polyNormal,
  resolveSnap,
  typedPoint,
  type Draft,
} from "../playground/ops";
import {
  drawGizmo,
  drawOverlay,
  renderScene,
  type ViewOpts,
} from "../playground/render";
import { emptyScene, type Cam, type Scene } from "../playground/scene";
import { add, dist3, lerp3, mul, type Vec3 } from "../playground/vec";

/** Logical frame size. The canvas backing store can be any multiple of it. */
export const W = 1280;
export const H = 720;

const INTRO = 3.8;
const CFG = defaultInferConfig();

type ToolId = "select" | "line" | "rect" | "push" | "tape" | "guide";

const TOOLS: Array<{ id: ToolId; key: string; name: string }> = [
  { id: "select", key: "B", name: "Select" },
  { id: "line", key: "L", name: "Line" },
  { id: "rect", key: "R", name: "Face" },
  { id: "push", key: "E", name: "Push/Pull" },
  { id: "tape", key: "T", name: "Tape" },
  { id: "guide", key: "G", name: "Guide" },
];

const MATERIALS: Record<string, string> = {
  "#c9c1ae": "Concrete",
  "#e7e3d8": "Plaster",
  "#b4674a": "Terracotta",
  "#343b45": "Charcoal",
  "#9fb3c4": "Glass",
};

interface Snap {
  label: string;
  color: string;
}

interface FilmState {
  scene: Scene;
  tool: ToolId;
  draft: Draft | null;
  /** The pointer lives in the world, so it stays put while the camera moves. */
  cursor: Vec3;
  pointer: boolean;
  material: string;
  view: ViewOpts;
  caption: string;
  captionAt: number;
  chapter: number;
  zLock: boolean;
  snap: Snap | null;
}

type SegKind =
  | "intro"
  | "card"
  | "wait"
  | "cam"
  | "key"
  | "move"
  | "click"
  | "type"
  | "pull"
  | "end";

type Ease = "inout" | "in" | "out" | "linear";

interface Seg {
  kind: SegKind;
  start: number;
  end: number;
  before: FilmState;
  after: FilmState;
  title?: string;
  sub?: string;
  key?: string;
  label?: string;
  swatch?: string;
  text?: string;
  camFrom?: Cam;
  camTo?: Cam;
  ease?: Ease;
  from?: Vec3;
  to?: Vec3;
  snap?: Snap | null;
  pullFrom?: number;
  pullTo?: number;
}

export interface Chapter {
  index: number;
  title: string;
  tools: string;
  summary: string;
  start: number;
  end: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const EASE: Record<Ease, (p: number) => number> = {
  linear: (p) => p,
  in: (p) => p * p,
  out: (p) => 1 - (1 - p) * (1 - p),
  inout: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
};

function lerpCam(a: Cam, b: Cam, t: number): Cam {
  return {
    yaw: lerp(a.yaw, b.yaw, t),
    pitch: lerp(a.pitch, b.pitch, t),
    dist: lerp(a.dist, b.dist, t),
    target: lerp3(a.target, b.target, t),
  };
}

/* --------------------------------- builder --------------------------------- */

class Builder {
  t: number;
  s: FilmState;
  segs: Seg[] = [];
  chapters: Array<Omit<Chapter, "end">> = [];
  /** Moves where the engine did not resolve to the scripted point. */
  issues: string[] = [];
  /** What the inference engine answered for every move. */
  moves: string[] = [];

  constructor(init: FilmState, t0: number) {
    this.s = init;
    this.t = t0;
  }

  private seg(
    kind: SegKind,
    dur: number,
    after: FilmState,
    extra: Partial<Seg> = {}
  ) {
    this.segs.push({
      kind,
      start: this.t,
      end: this.t + dur,
      before: this.s,
      after,
      ...extra,
    });
    this.t += dur;
    this.s = after;
  }

  private set(patch: Partial<FilmState>) {
    this.s = { ...this.s, ...patch };
  }

  say(text: string) {
    this.set({ caption: text, captionAt: this.t });
  }

  wait(d: number) {
    this.seg("wait", d, this.s);
  }

  chapter(title: string, tools: string, summary: string) {
    const index = this.chapters.length;
    this.set({ chapter: index, caption: "", captionAt: this.t, snap: null });
    this.chapters.push({ index, title, tools, summary, start: this.t });
    this.seg("card", 1.9, this.s, { title, sub: tools });
  }

  cam(to: Partial<Cam>, d: number, ease: Ease = "inout") {
    const from = this.s.scene.cam;
    const cam: Cam = { ...from, ...to };
    this.seg(
      "cam",
      d,
      { ...this.s, scene: { ...this.s.scene, cam } },
      { camFrom: from, camTo: cam, ease }
    );
  }

  key(
    key: string,
    label: string,
    patch: (s: FilmState) => Partial<FilmState>,
    d = 0.85,
    swatch?: string
  ) {
    this.set(patch(this.s));
    this.seg("key", d, this.s, { key, label, swatch });
  }

  tool(id: ToolId) {
    const t = TOOLS.find((x) => x.id === id);
    if (!t) return;
    this.key(t.key, `${t.name} tool`, () => ({
      tool: id,
      draft: null,
      snap: null,
    }));
  }

  material(color: string) {
    this.key(
      "",
      `Material · ${MATERIALS[color] ?? color}`,
      () => ({ material: color }),
      0.8,
      color
    );
  }

  esc(label: string) {
    this.key("Esc", label, () => ({ draft: null, snap: null }), 0.6);
  }

  /** Move the pointer. The engine decides where it actually lands. */
  move(to: Vec3, d?: number, pace = 1) {
    const basis = makeBasis(this.s.scene.cam, W, H);
    const q = project(basis, to);
    const res = resolveSnap(
      this.s.scene,
      basis,
      q.x,
      q.y,
      CFG,
      this.s.draft,
      { zLock: this.s.zLock }
    );
    const label = res.cand?.label ?? res.dir?.label ?? "free";
    const at = `${this.t.toFixed(1)}s`;
    this.moves.push(`${at} ${label} @ ${res.pos.map((v) => +v.toFixed(3))}`);
    if (dist3(res.pos, to) > 1e-3) {
      this.issues.push(
        `${at} wanted ${to} but the engine resolved ${res.pos.map(
          (v) => +v.toFixed(3)
        )} (${label})`
      );
    }
    const from = this.s.cursor;
    const pf = project(basis, from);
    const px = Math.hypot(q.x - pf.x, q.y - pf.y);
    const dur = d ?? clamp(0.3 + px / 700, 0.45, 1.05) * pace;
    const snap: Snap | null = res.cand
      ? { label: res.cand.label, color: res.cand.color }
      : res.dir
      ? { label: res.dir.label, color: res.dir.color }
      : null;
    this.set({ snap: null });
    this.seg(
      "move",
      dur,
      { ...this.s, cursor: res.pos, snap },
      { from, to: res.pos, snap }
    );
  }

  private click(fn: (s: FilmState) => Partial<FilmState>, d = 0.32) {
    this.set(fn(this.s));
    this.seg("click", d, this.s);
  }

  /** Mouse down — dispatches on the active tool exactly like the editor. */
  press() {
    const pos = this.s.cursor;
    switch (this.s.tool) {
      case "guide":
        this.click(() => ({ draft: { kind: "guide", a: pos, b: pos } }));
        break;
      case "tape":
        this.click((s) => {
          const d = s.draft;
          if (d && d.kind === "tape") {
            return {
              scene: addMeasure(s.scene, d.a, pos),
              draft: { kind: "tape", a: pos, b: pos },
            };
          }
          return { draft: { kind: "tape", a: pos, b: pos } };
        });
        break;
      case "rect":
        this.click((s) => {
          const d = s.draft;
          if (d && d.kind === "rect") {
            return {
              scene: addRect(s.scene, d.a, pos, s.material) ?? s.scene,
              draft: null,
            };
          }
          return { draft: { kind: "rect", a: pos, b: pos } };
        });
        break;
      case "line":
        this.click((s) => {
          const d = s.draft;
          if (d && d.kind === "line") {
            if (d.pts.length >= 3 && dist3(d.pts[0], pos) < 0.02) {
              return {
                scene: addFace(s.scene, d.pts, s.material),
                draft: null,
              };
            }
            return { draft: { kind: "line", pts: [...d.pts, pos] } };
          }
          return { draft: { kind: "line", pts: [pos] } };
        });
        break;
      case "push":
        this.click((s) => {
          const basis = makeBasis(s.scene.cam, W, H);
          const q = project(basis, pos);
          const r = screenRay(basis, q.x, q.y);
          const hit = pickFace(s.scene, r.origin, r.dir);
          const face = hit
            ? s.scene.faces.find((f) => f.id === hit.id)
            : undefined;
          if (!hit || !face) {
            this.issues.push(`${this.t.toFixed(1)}s push/pull found no face`);
            return {};
          }
          return {
            draft: {
              kind: "push",
              faceId: face.id,
              origin: hit.pos,
              normal: polyNormal(face.pts),
              dist: 0,
            },
          };
        });
        break;
      default:
        break;
    }
  }

  /** Mouse up — ends a guide drag. */
  release() {
    const d = this.s.draft;
    if (!d || d.kind !== "guide") return;
    this.click(
      (s) => ({ scene: addGuideLine(s.scene, d.a, s.cursor), draft: null }),
      0.3
    );
  }

  /** Pull the active push/pull upward by `h` metres with the mouse. */
  pullUp(h: number, d: number) {
    const dr = this.s.draft;
    if (!dr || dr.kind !== "push") return;
    const dist = h * (dr.normal[2] >= 0 ? 1 : -1);
    this.set({ snap: null });
    this.seg(
      "pull",
      d,
      {
        ...this.s,
        draft: { ...dr, dist },
        cursor: add(dr.origin, mul(dr.normal, dist)),
        snap: null,
      },
      { pullFrom: dr.dist, pullTo: dist }
    );
  }

  /** Type a length and press Enter — same rules as the editor's box. */
  type(text: string) {
    const n = parseFloat(text);
    const s = this.s;
    const d = s.draft;
    let after: FilmState = s;
    if (d && d.kind === "line") {
      const p = typedPoint(d.pts[d.pts.length - 1], s.cursor, n);
      after = { ...s, draft: { kind: "line", pts: [...d.pts, p] }, cursor: p };
    } else if (d && d.kind === "tape") {
      const p = typedPoint(d.a, s.cursor, n);
      after = {
        ...s,
        scene: addMeasure(s.scene, d.a, p),
        draft: { kind: "tape", a: p, b: p },
        cursor: p,
      };
    } else if (d && d.kind === "push") {
      const dist = (d.dist < 0 ? -1 : 1) * n;
      after = {
        ...s,
        scene: extrudeFace(s.scene, d.faceId, dist, s.material),
        draft: null,
        cursor: add(d.origin, mul(d.normal, dist)),
      };
    } else {
      this.issues.push(`${this.t.toFixed(1)}s typed with nothing to apply to`);
    }
    this.seg("type", 1.25, { ...after, snap: null }, { text });
  }

  end(d: number) {
    this.set({ caption: "", snap: null });
    this.seg("end", d, this.s);
  }
}

/* ---------------------------------- script --------------------------------- */

function buildFilm() {
  const init: FilmState = {
    scene: {
      ...emptyScene("The Cabin"),
      cam: { yaw: 0.32, pitch: 0.72, dist: 10, target: [0, 0.3, 0] },
    },
    tool: "select",
    draft: null,
    cursor: [5, -3.5, 0],
    pointer: true,
    material: "#c9c1ae",
    view: { grid: true, guides: true, measures: true, wire: false },
    caption: "",
    captionAt: 0,
    chapter: -1,
    zLock: false,
    snap: null,
  };
  const b = new Builder(init, INTRO);

  /** Click a loop of points with the Line tool, closing on the first. */
  const loop = (pts: Vec3[], pace = 1) => {
    for (const p of pts) {
      b.move(p, undefined, pace);
      b.press();
    }
    b.move(pts[0], undefined, pace);
    b.press();
  };

  // 01 ─ construction geometry
  b.chapter(
    "Lay out the site",
    "Guide · Tape",
    "Drag two guides for the building lines, then confirm the 6 m front with the tape."
  );
  b.say(
    "Start with construction geometry. G is the Guide tool — drag out the front building line."
  );
  b.tool("guide");
  b.move([-3, -2, 0]);
  b.press();
  b.move([3, -2, 0], 1.1);
  b.release();
  b.say(
    "Guides are dashed, snappable, and never part of the model. Drag a second one for the depth."
  );
  b.move([-3, -2, 0]);
  b.press();
  b.move([-3, 2, 0], 0.9);
  b.release();
  b.say(
    "T is the Tape Measure. Click both ends of the guide — the inference engine locks onto them."
  );
  b.tool("tape");
  b.move([-3, -2, 0]);
  b.press();
  b.move([3, -2, 0], 1.1);
  b.press();
  b.esc("Finish measuring");
  b.wait(0.5);

  // 02 ─ footprint
  b.chapter(
    "Draw the footprint",
    "Face",
    "One rectangle, corner to corner, snapped to the guide points: a 6 × 4 m slab."
  );
  b.say(
    "R draws a face from corner to corner. Both corners snap to guide points, so the slab is exactly 6 × 4 m."
  );
  b.tool("rect");
  b.move([-3, 2, 0]);
  b.press();
  b.move([3, -2, 0], 1.2);
  b.press();
  b.wait(1.1);

  // 03 ─ walls
  b.chapter(
    "Raise the walls",
    "Push/Pull",
    "Pull the slab into a volume and type the exact wall height."
  );
  b.cam({ yaw: 0.6, pitch: 0.5, dist: 13, target: [0, 0, 0.2] }, 1.3);
  b.material("#e7e3d8");
  b.say("E is Push/Pull. Click the slab and pull it upward…");
  b.tool("push");
  b.move([0.5, 0.5, 0]);
  b.press();
  b.pullUp(1.6, 1.3);
  b.say("…then type the exact height. 2.6, Enter.");
  b.type("2.6");
  b.wait(1.1);

  // 04 ─ roof
  b.chapter(
    "Frame the roof",
    "Tape · Z-lock · Line",
    "Set the ridge height with a locked tape, then click the gables and slopes into place."
  );
  b.cam({ yaw: 0.6, pitch: 0.58, dist: 13.5, target: [0, 0, 1.2] }, 1.2);
  b.say(
    "Set the ridge height with the tape. Click the midpoint of the end wall…"
  );
  b.tool("tape");
  b.move([-3, 0, 2.6]);
  b.press();
  b.say("…press Z to lock the blue axis, and type 1.4.");
  b.key("Z", "Lock to blue axis", () => ({ zLock: true }));
  b.move([-3, 0, 3.5], 0.6);
  b.type("1.4");
  b.esc("Finish measuring");
  b.say("Same again at the other end wall.");
  b.move([3, 0, 2.6]);
  b.press();
  b.move([3, 0, 3.5], 0.5);
  b.type("1.4");
  b.esc("Finish measuring");
  b.key("Z", "Unlock axis", () => ({ zLock: false }), 0.7);
  b.say(
    "L is the Line tool. Click corner to corner — closing the loop makes a face."
  );
  b.tool("line");
  loop([
    [3, -2, 2.6],
    [3, 2, 2.6],
    [3, 0, 4],
  ]);
  b.material("#b4674a");
  b.say(
    "Switch material for the roof. Every click lands on an inferred point — nothing is typed."
  );
  loop([
    [-3, -2, 2.6],
    [3, -2, 2.6],
    [3, 0, 4],
    [-3, 0, 4],
  ]);
  b.say("Orbit to the back and repeat.");
  b.cam({ yaw: 3.6 }, 1.8);
  loop(
    [
      [3, 2, 2.6],
      [-3, 2, 2.6],
      [-3, 0, 4],
      [3, 0, 4],
    ],
    0.8
  );
  b.material("#e7e3d8");
  loop(
    [
      [-3, 2, 2.6],
      [-3, -2, 2.6],
      [-3, 0, 4],
    ],
    0.8
  );
  b.wait(0.5);

  // 05 ─ openings
  b.chapter(
    "Door & windows",
    "Face · On Face",
    "Rectangles drawn straight onto the walls stand up on their own."
  );
  b.cam({ yaw: 6.7, pitch: 0.3, dist: 11.5, target: [0, 0, 1.1] }, 1.8);
  b.material("#343b45");
  b.say(
    "R again — this time on a wall. First corner on the bottom edge, second on the face: the rectangle stands up."
  );
  b.tool("rect");
  b.move([1, -2, 0]);
  b.press();
  b.move([2, -2, 2], 0.9);
  b.press();
  b.material("#9fb3c4");
  b.say("Glass for the windows. On Face keeps both corners in the wall plane.");
  b.move([-2.5, -2, 1]);
  b.press();
  b.move([-1, -2, 2], 0.9);
  b.press();
  b.say("Orbit to the gable end and add one more.");
  b.cam({ yaw: 7.45, pitch: 0.28 }, 1.4);
  b.move([3, -1, 1]);
  b.press();
  b.move([3, 1, 2], 0.9);
  b.press();
  b.wait(0.7);

  // 06 ─ finish
  b.chapter(
    "Finish & ship",
    "Hide · Save · Export",
    "Hide the construction lines, then save, export or embed the model."
  );
  b.say("H hides the construction geometry.");
  b.key(
    "H",
    "Hide construction",
    (s) => ({
      tool: "select",
      draft: null,
      snap: null,
      pointer: false,
      view: { ...s.view, guides: false, measures: false },
    }),
    1.2
  );
  const faces = b.s.scene.faces.length;
  b.say(
    `That's the cabin — ${faces} faces, and every corner was placed by inference.`
  );
  b.cam(
    { yaw: 10.31, pitch: 0.34, dist: 13, target: [0, 0, 1.7] },
    4.2,
    "in"
  );
  b.say(
    "Save it in your browser, export a .json, or a standalone .html you can embed anywhere. Free."
  );
  b.cam({ yaw: 13.17, pitch: 0.36 }, 4.2, "out");
  b.end(4.5);

  // cold open: the finished cabin, shown before the build starts
  const finalScene = b.s.scene;
  const introState: FilmState = {
    ...init,
    scene: {
      ...finalScene,
      cam: { yaw: -0.25, pitch: 0.34, dist: 13.5, target: [-4.4, 0, 0.4] },
    },
    view: { grid: true, guides: false, measures: false, wire: false },
    pointer: false,
  };
  const intro: Seg = {
    kind: "intro",
    start: 0,
    end: INTRO,
    before: introState,
    after: introState,
    camFrom: introState.scene.cam,
    camTo: { ...introState.scene.cam, yaw: 0.3 },
    ease: "linear",
  };

  const segs = [intro, ...b.segs];
  const duration = b.t;
  const chapters: Chapter[] = b.chapters.map((c, i) => ({
    ...c,
    end: i + 1 < b.chapters.length ? b.chapters[i + 1].start : duration,
  }));

  return {
    segs,
    chapters,
    duration,
    issues: b.issues,
    moves: b.moves,
    finalScene,
    stats: {
      clicks: b.segs.filter((s) => s.kind === "click").length,
      typed: b.segs.filter((s) => s.kind === "type").length,
      moves: b.moves.length,
      faces: finalScene.faces.length,
      tools: 5,
    },
  };
}

const FILM = buildFilm();

export const SEGS = FILM.segs;
export const CHAPTERS = FILM.chapters;
export const DURATION = FILM.duration;
export const STATS = FILM.stats;
/** Empty when every scripted move resolved exactly through the engine. */
export const ISSUES = FILM.issues;
export const MOVES = FILM.moves;
export const POSTER_T = 2.7;

/* ---------------------------------- frames --------------------------------- */

interface Frame {
  t: number;
  seg: Seg;
  p: number;
  state: FilmState;
  typed: string | null;
}

export function frameAt(time: number): Frame {
  const t = clamp(time, 0, DURATION);
  let seg = SEGS[SEGS.length - 1];
  for (const s of SEGS) {
    if (t < s.end) {
      seg = s;
      break;
    }
  }
  const span = seg.end - seg.start;
  const p = span > 0 ? clamp((t - seg.start) / span, 0, 1) : 1;
  let state = seg.before;
  let typed: string | null = null;

  if (seg.kind === "move" && seg.from && seg.to) {
    state = {
      ...state,
      cursor: lerp3(seg.from, seg.to, EASE.inout(p)),
      snap: p > 0.7 ? seg.snap ?? null : null,
    };
  } else if ((seg.kind === "cam" || seg.kind === "intro") && seg.camFrom && seg.camTo) {
    const e = EASE[seg.ease ?? "inout"](p);
    state = {
      ...state,
      scene: { ...state.scene, cam: lerpCam(seg.camFrom, seg.camTo, e) },
    };
  } else if (seg.kind === "pull") {
    const dr = state.draft;
    if (dr && dr.kind === "push") {
      const dist = lerp(seg.pullFrom ?? 0, seg.pullTo ?? 0, EASE.out(p));
      state = {
        ...state,
        draft: { ...dr, dist },
        cursor: add(dr.origin, mul(dr.normal, dist)),
      };
    }
  } else if (seg.kind === "type") {
    const txt = seg.text ?? "";
    if (p >= 0.8) state = seg.after;
    typed = txt.slice(0, Math.round(clamp((p - 0.08) / 0.42, 0, 1) * txt.length));
  }

  return { t, seg, p, state, typed };
}

/** The committed model at a moment of the film — open it in the editor. */
export function sceneAt(time: number): Scene {
  return { ...frameAt(time).state.scene, name: "The Cabin" };
}

/** The finished tutorial project. */
export function cabinScene(): Scene {
  return {
    ...FILM.finalScene,
    name: "The Cabin",
    cam: { yaw: 0.6, pitch: 0.4, dist: 16, target: [0, 0, 1.8] },
  };
}

/* --------------------------------- drawing --------------------------------- */

type Ctx = CanvasRenderingContext2D;

const MONO =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const SANS =
  '"Space Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PAPER = "#e9edf2";
const DIM = "#8b95a5";
const BLEND = "#ff6a00";
const INK = "#08090c";
const NONE = new Set<string>();

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
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

/** Letter-spaced text. Returns the drawn width. */
function spaced(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  gap: number,
  align: "left" | "right" = "left"
): number {
  const chars = Array.from(text);
  const ws = chars.map((c) => ctx.measureText(c).width);
  const total = ws.reduce((a, c) => a + c, 0) + gap * (chars.length - 1);
  let cx = align === "right" ? x - total : x;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += ws[i] + gap;
  });
  return total;
}

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function shadeEdges(ctx: Ctx) {
  const top = ctx.createLinearGradient(0, 0, 0, 120);
  top.addColorStop(0, "rgba(8,9,12,0.78)");
  top.addColorStop(1, "rgba(8,9,12,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 120);
  const bot = ctx.createLinearGradient(0, H - 210, 0, H);
  bot.addColorStop(0, "rgba(8,9,12,0)");
  bot.addColorStop(1, "rgba(8,9,12,0.8)");
  ctx.fillStyle = bot;
  ctx.fillRect(0, H - 210, W, 210);
}

function drawPointer(ctx: Ctx, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.25, 1.25);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 17);
  ctx.lineTo(4.4, 13.2);
  ctx.lineTo(7.4, 19.8);
  ctx.lineTo(10, 18.6);
  ctx.lineTo(7.1, 12.2);
  ctx.lineTo(12.6, 12.2);
  ctx.closePath();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1.3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0a0c10";
  ctx.stroke();
  ctx.restore();
}

function drawRipple(ctx: Ctx, x: number, y: number, p: number) {
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = BLEND;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, 8 + 26 * EASE.out(p), 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = (1 - p) * 0.35;
  ctx.fillStyle = BLEND;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRail(ctx: Ctx, tool: ToolId) {
  const x = 28;
  let y = 150;
  ctx.textBaseline = "middle";
  for (const t of TOOLS) {
    const on = t.id === tool;
    rr(ctx, x, y, 42, 42, 10);
    ctx.fillStyle = on ? "rgba(255,106,0,0.2)" : "rgba(10,12,16,0.72)";
    ctx.fill();
    ctx.strokeStyle = on ? BLEND : "rgba(255,255,255,0.11)";
    ctx.lineWidth = on ? 1.5 : 1;
    ctx.stroke();
    ctx.font = `600 15px ${MONO}`;
    ctx.fillStyle = on ? "#ff8a3d" : DIM;
    ctx.textAlign = "center";
    ctx.fillText(t.key, x + 21, y + 22);
    if (on) {
      ctx.font = `500 12px ${MONO}`;
      const tw = ctx.measureText(t.name).width;
      rr(ctx, x + 52, y + 8, tw + 20, 26, 7);
      ctx.fillStyle = "rgba(8,10,14,0.88)";
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.textAlign = "left";
      ctx.fillText(t.name, x + 62, y + 22);
    }
    y += 50;
  }
}

function drawStatus(ctx: Ctx, s: FilmState) {
  // material
  const name = MATERIALS[s.material] ?? s.material;
  ctx.textBaseline = "middle";
  ctx.font = `500 12px ${MONO}`;
  const nw = ctx.measureText(name).width;
  const right = W - 28;
  ctx.fillStyle = PAPER;
  ctx.textAlign = "right";
  ctx.fillText(name, right, 66);
  rr(ctx, right - nw - 26, 58, 16, 16, 4);
  ctx.fillStyle = s.material;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `500 10px ${MONO}`;
  ctx.fillStyle = DIM;
  spaced(ctx, "MATERIAL", right - nw - 38, 66, 2, "right");

  // blue-axis lock
  if (s.zLock) {
    const w = 226;
    rr(ctx, W / 2 - w / 2, 52, w, 30, 15);
    ctx.fillStyle = "rgba(94,160,255,0.16)";
    ctx.fill();
    ctx.strokeStyle = "#5ea0ff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = "#9cc3ff";
    const tw =
      ctx.measureText("Z").width + 10 + ctx.measureText("BLUE AXIS LOCK").width + 28;
    let x = W / 2 - tw / 2;
    ctx.textAlign = "left";
    ctx.fillText("Z", x, 67.5);
    x += ctx.measureText("Z").width + 10;
    spaced(ctx, "BLUE AXIS LOCK", x, 67.5, 2);
  }
}

function drawKeyToast(ctx: Ctx, seg: Seg, p: number) {
  const label = seg.label ?? "";
  const key = seg.key ?? "";
  const pop = EASE.out(clamp(p / 0.2, 0, 1));
  const alpha = p > 0.82 ? (1 - p) / 0.18 : clamp(p / 0.08, 0, 1);
  const cy = H - 166;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 21px ${MONO}`;
  const kw = seg.swatch ? 46 : Math.max(46, ctx.measureText(key).width + 28);
  ctx.font = `500 18px ${SANS}`;
  const lw = ctx.measureText(label).width;
  const total = 12 + kw + 16 + lw + 24;
  const x0 = W / 2 - total / 2;
  const k = 0.88 + 0.12 * pop;
  ctx.translate(W / 2, cy);
  ctx.scale(k, k);
  ctx.translate(-W / 2, -cy);

  rr(ctx, x0, cy - 35, total, 70, 18);
  ctx.fillStyle = "rgba(8,10,14,0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const kx = x0 + 12;
  if (seg.swatch) {
    rr(ctx, kx, cy - 23, kw, 46, 11);
    ctx.fillStyle = seg.swatch;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.stroke();
  } else {
    rr(ctx, kx, cy - 20, kw, 46, 11);
    ctx.fillStyle = "#b34700";
    ctx.fill();
    rr(ctx, kx, cy - 24, kw, 46, 11);
    ctx.fillStyle = BLEND;
    ctx.fill();
    ctx.font = `700 21px ${MONO}`;
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(key, kx + kw / 2, cy);
  }
  ctx.font = `500 18px ${SANS}`;
  ctx.fillStyle = PAPER;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, kx + kw + 16, cy + 1);
  ctx.restore();
}

function drawTyped(ctx: Ctx, typed: string, p: number) {
  const cy = H - 166;
  const w = 320;
  const h = 62;
  const x = W / 2 - w / 2;
  const alpha = p > 0.94 ? (1 - p) / 0.06 : clamp(p / 0.06, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  rr(ctx, x, cy - h / 2, w, h, 16);
  ctx.fillStyle = "rgba(8,10,14,0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,106,0,0.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = DIM;
  spaced(ctx, "LENGTH", x + 22, cy + 1, 2.2);

  ctx.font = `600 27px ${MONO}`;
  ctx.fillStyle = PAPER;
  ctx.textAlign = "left";
  const vx = x + 106;
  ctx.fillText(typed, vx, cy + 1);
  const tw = ctx.measureText(typed).width;
  if (p < 0.62 && Math.floor(p * 16) % 2 === 0) {
    ctx.fillStyle = BLEND;
    ctx.fillRect(vx + tw + 3, cy - 13, 2, 26);
  }
  ctx.font = `500 16px ${MONO}`;
  ctx.fillStyle = DIM;
  ctx.fillText("m", vx + tw + 12, cy + 3);

  const on = p >= 0.62;
  rr(ctx, x + w - 88, cy - 17, 70, 34, 9);
  ctx.fillStyle = on ? BLEND : "rgba(255,255,255,0.07)";
  ctx.fill();
  ctx.font = `600 11px ${MONO}`;
  ctx.fillStyle = on ? INK : DIM;
  ctx.textAlign = "center";
  ctx.fillText("ENTER", x + w - 53, cy + 1);
  ctx.restore();
}

function drawCaption(ctx: Ctx, text: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `500 22px ${SANS}`;
  const lines = wrap(ctx, text, 900);
  const lh = 31;
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 52;
  const bh = lines.length * lh + 24;
  const x = (W - bw) / 2;
  const y = H - 34 - bh;
  rr(ctx, x, y, bw, bh, 14);
  ctx.fillStyle = "rgba(8,10,14,0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 12 + lh * (i + 0.5) + 1));
  ctx.restore();
}

function drawCard(ctx: Ctx, seg: Seg, p: number, index: number) {
  const a = clamp(p / 0.16, 0, 1) * (p > 0.84 ? (1 - p) / 0.16 : 1);
  ctx.save();
  if (index === 0) {
    // the cold open cuts to an empty grid: come up from black
    ctx.fillStyle = `rgba(8,9,12,${1 - clamp(p / 0.2, 0, 1)})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = `rgba(8,9,12,${0.74 * a})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  const slide = (1 - EASE.out(clamp(p / 0.3, 0, 1))) * 26;
  const num = String(index + 1).padStart(2, "0");

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `700 210px ${SANS}`;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(233,237,242,0.28)";
  ctx.strokeText(num, 104 - slide, 392);

  ctx.font = `500 12px ${MONO}`;
  ctx.fillStyle = BLEND;
  spaced(ctx, `CHAPTER ${num} / ${String(CHAPTERS.length).padStart(2, "0")}`, 112 + slide, 446, 3.4);

  ctx.font = `700 68px ${SANS}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(seg.title ?? "", 108 + slide, 522);

  ctx.font = `500 15px ${MONO}`;
  ctx.fillStyle = DIM;
  spaced(ctx, (seg.sub ?? "").toUpperCase(), 112 + slide, 566, 2.6);
  ctx.restore();
}

function fmtClock(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function drawIntro(ctx: Ctx, p: number) {
  const a = clamp(p / 0.14, 0, 1);
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, W * 0.75, 0);
  g.addColorStop(0, "rgba(8,9,12,0.9)");
  g.addColorStop(1, "rgba(8,9,12,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = a;
  const slide = (1 - EASE.out(clamp(p / 0.25, 0, 1))) * 24;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 12px ${MONO}`;
  ctx.fillStyle = BLEND;
  spaced(ctx, "TUTORIAL — ONE COMPLETE PROJECT", 84, 430 + slide, 3.4);

  ctx.font = `700 96px ${SANS}`;
  ctx.fillStyle = PAPER;
  ctx.fillText("Build a cabin", 78, 532 + slide);
  ctx.font = `700 58px ${SANS}`;
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(233,237,242,0.55)";
  ctx.strokeText("from an empty grid.", 82, 602 + slide);

  ctx.font = `500 13px ${MONO}`;
  ctx.fillStyle = DIM;
  spaced(
    ctx,
    `${STATS.tools} TOOLS  ·  ${STATS.clicks} CLICKS  ·  ${STATS.faces} FACES  ·  ${fmtClock(DURATION)}`,
    84,
    652 + slide,
    2
  );
  ctx.restore();

  const out = clamp((p - 0.9) / 0.1, 0, 1);
  if (out > 0) {
    ctx.fillStyle = `rgba(8,9,12,${out})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawEnd(ctx: Ctx, p: number) {
  const a = clamp(p / 0.2, 0, 1);
  ctx.save();
  ctx.fillStyle = `rgba(8,9,12,${0.8 * a})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  const slide = (1 - EASE.out(clamp(p / 0.3, 0, 1))) * 22;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 104px ${SANS}`;
  ctx.fillStyle = PAPER;
  ctx.fillText("Your turn.", W / 2, 352 + slide);
  ctx.font = `500 22px ${SANS}`;
  ctx.fillStyle = DIM;
  ctx.fillText(
    "Open this project in the playground and keep building.",
    W / 2,
    408 + slide
  );
  ctx.font = `500 12px ${MONO}`;
  ctx.fillStyle = BLEND;
  const label = "FREE  ·  NO ACCOUNT  ·  SAVE  ·  EXPORT .JSON / .HTML";
  const w = Array.from(label).reduce(
    (acc, c) => acc + ctx.measureText(c).width + 3,
    -3
  );
  spaced(ctx, label, W / 2 - w / 2, 464 + slide, 3);
  ctx.restore();
}

function drawTopBar(ctx: Ctx, chapter: number) {
  ctx.save();
  ctx.translate(38, 34);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = BLEND;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-6.5, -6.5, 13, 13);
  ctx.restore();
  ctx.fillStyle = BLEND;
  ctx.beginPath();
  ctx.arc(38, 34, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.textBaseline = "middle";
  ctx.font = `600 12px ${MONO}`;
  ctx.fillStyle = PAPER;
  let x = 60;
  x += spaced(ctx, "SKETCHLINE", x, 35, 2.6) + 14;
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = DIM;
  spaced(ctx, "PLAYGROUND  /  THE CABIN", x, 35, 2);

  if (chapter >= 0) {
    const c = CHAPTERS[chapter];
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = DIM;
    const w = spaced(ctx, c.title.toUpperCase(), W - 28, 35, 2, "right");
    ctx.fillStyle = BLEND;
    spaced(
      ctx,
      `${String(chapter + 1).padStart(2, "0")} / ${String(CHAPTERS.length).padStart(2, "0")}`,
      W - 28 - w - 16,
      35,
      2,
      "right"
    );
  }
}

function drawProgress(ctx: Ctx, t: number) {
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(0, H - 4, W, 4);
  ctx.fillStyle = BLEND;
  ctx.fillRect(0, H - 4, (W * t) / DURATION, 4);
  ctx.fillStyle = INK;
  for (const c of CHAPTERS) {
    ctx.fillRect((W * c.start) / DURATION - 1, H - 4, 2, 4);
  }
}

/**
 * Paint one frame. The context should already be scaled so that
 * 1280 × 720 logical units fill the canvas.
 */
export function drawFrame(ctx: Ctx, time: number) {
  const fr = frameAt(time);
  const { state, seg, p } = fr;
  const basis = makeBasis(state.scene.cam, W, H);
  const live = seg.kind !== "intro" && seg.kind !== "end" && seg.kind !== "card";
  const d = live ? state.draft : null;
  const shown =
    d && d.kind === "push"
      ? extrudeFace(state.scene, d.faceId, d.dist, state.material)
      : state.scene;

  ctx.save();
  renderScene(ctx, {
    scene: shown,
    basis,
    view: state.view,
    selection: NONE,
    w: W,
    h: H,
  });

  const cur = project(basis, state.cursor);
  const pointer = live && state.pointer && cur.ok;
  drawOverlay(ctx, {
    basis,
    draft: d,
    cand:
      pointer && state.snap
        ? {
            kind: "snap",
            label: state.snap.label,
            color: state.snap.color,
            sx: cur.x,
            sy: cur.y,
          }
        : null,
    cursor: pointer ? { x: cur.x, y: cur.y } : null,
    nextPoint: d ? state.cursor : null,
    color: BLEND,
    showGizmo: false,
  });

  shadeEdges(ctx);

  if (pointer) {
    if (seg.kind === "click") drawRipple(ctx, cur.x, cur.y, p);
    drawPointer(ctx, cur.x, cur.y);
  }

  if (live) {
    drawRail(ctx, state.tool);
    drawStatus(ctx, state);
    drawGizmo(ctx, basis, W - 76, 134, 26);
    if (seg.kind === "key") drawKeyToast(ctx, seg, p);
    if (fr.typed !== null) drawTyped(ctx, fr.typed, p);
    if (state.caption) {
      drawCaption(
        ctx,
        state.caption,
        clamp((fr.t - state.captionAt) / 0.3, 0, 1)
      );
    }
  }

  if (seg.kind === "card") drawCard(ctx, seg, p, state.chapter);
  if (seg.kind === "intro") drawIntro(ctx, p);
  if (seg.kind === "end") drawEnd(ctx, p);

  drawTopBar(ctx, state.chapter);
  drawProgress(ctx, fr.t);
  ctx.restore();
}
