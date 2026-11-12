import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowUpFromLine,
  Box,
  CircleDot,
  Crosshair,
  Download,
  FileDown,
  Gauge,
  Grid3x3,
  Hammer,
  MousePointer2,
  PenLine,
  Redo2,
  Rotate3d,
  RotateCcw,
  Ruler,
  Save,
  Square,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { cabinScene } from "../tutorial/film";
import { makeBasis, project, screenRay, type Basis } from "./camera";
import {
  ALL_INFERENCES,
  defaultInferConfig,
  pickEdge,
  pickFace,
  type Cand,
  type DirInference,
  type InferConfig,
} from "./geometry";
import {
  addFace,
  addMeasure,
  addRect,
  extrudeFace,
  lineParam,
  polyNormal,
  resolveSnap,
  typedPoint,
  type Draft,
} from "./ops";
import { drawOverlay, renderScene, type ViewOpts } from "./render";
import {
  clearAutosave,
  demoScene,
  emptyScene,
  getAutosave,
  listProjects,
  PALETTE,
  removeProject,
  sceneBounds,
  setAutosave,
  uid,
  upsertProject,
  type Scene,
  type StoredProject,
} from "./scene";
import {
  buildEmbedSnippet,
  buildStandaloneHTML,
  downloadFile,
} from "./standalone";
import { add, dist3, mul, type Vec3 } from "./vec";

type Tool =
  | "select"
  | "line"
  | "rect"
  | "push"
  | "tape"
  | "guide"
  | "protractor"
  | "orbit";

const TOOLS: Array<{
  id: Tool;
  key: string;
  label: string;
  icon: typeof MousePointer2;
  hint: string;
}> = [
  {
    id: "select",
    key: "B",
    label: "Select",
    icon: MousePointer2,
    hint: "Click a face or edge. Drag to move it in the view plane.",
  },
  {
    id: "line",
    key: "L",
    label: "Line",
    icon: PenLine,
    hint: "Click point to point. Z locks the blue axis, typing sets a length. Click the first point to close a face.",
  },
  {
    id: "rect",
    key: "R",
    label: "Face",
    icon: Square,
    hint: "Click two corners. If the second corner is higher — on a wall — the face stands up.",
  },
  {
    id: "push",
    key: "E",
    label: "Push/Pull",
    icon: ArrowUpFromLine,
    hint: "Click a face, pull, click again — or type a distance and press Enter.",
  },
  {
    id: "tape",
    key: "T",
    label: "Tape",
    icon: Ruler,
    hint: "Click two points to measure. Measurements are dashed.",
  },
  {
    id: "guide",
    key: "G",
    label: "Guide",
    icon: Crosshair,
    hint: "Click for a guide point, drag for a guide line.",
  },
  {
    id: "protractor",
    key: "P",
    label: "Protractor",
    icon: Gauge,
    hint: "Click an origin, then a direction. Angles snap parallel or perpendicular.",
  },
  {
    id: "orbit",
    key: "O",
    label: "Orbit",
    icon: Rotate3d,
    hint: "Drag to orbit. Right-drag pans, the wheel zooms.",
  },
];

const AXIS_LABELS = ["X", "Y", "Z"];

function downloadScene(scene: Scene) {
  downloadFile(
    `${(scene.name || "project").replace(/\s+/g, "-").toLowerCase()}.json`,
    JSON.stringify(scene, null, 2),
    "application/json"
  );
}

export default function Editor({
  onExit,
  onWatchTutorial,
  initialScene,
}: {
  onExit: () => void;
  onWatchTutorial?: () => void;
  initialScene?: Scene | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLInputElement>(null);

  const [scene, setScene] = useState<Scene>(
    () => initialScene ?? getAutosave() ?? demoScene()
  );
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const [tool, setTool] = useState<Tool>("line");
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;

  const [cand, setCand] = useState<Cand | null>(null);
  const [dirInf, setDirInf] = useState<DirInference | null>(null);
  const [nextPoint, setNextPoint] = useState<Vec3 | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [material, setMaterial] = useState(PALETTE[0]);
  const [inferCfg, setInferCfg] = useState<InferConfig>(defaultInferConfig);
  const [view, setView] = useState<ViewOpts>({
    grid: true,
    guides: true,
    measures: true,
    wire: false,
  });
  // History lives in refs: state updaters must stay pure, and these stacks are
  // read and written in the same tick. The counts below only drive the buttons.
  const pastRef = useRef<Scene[]>([]);
  const futureRef = useRef<Scene[]>([]);
  const [hist, setHist] = useState({ past: 0, future: 0 });
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(scene.name);
  const [modal, setModal] = useState<"none" | "projects" | "export">("none");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [measureInput, setMeasureInput] = useState("");
  const [focusBox, setFocusBox] = useState(false);
  const [info, setInfo] = useState("Ready");
  const [fps, setFps] = useState(60);
  const [zLock, setZLock] = useState(false);
  const zLockRef = useRef(false);
  zLockRef.current = zLock;
  const materialRef = useRef(material);
  materialRef.current = material;
  const viewRef = useRef(view);
  viewRef.current = view;

  const shiftRef = useRef(false);
  const dragRef = useRef<{
    mode: "none" | "orbit" | "pan" | "move";
    x: number;
    y: number;
    before?: Scene;
    orig?: Array<{ id: string; kind: "face" | "edge" | "guide"; pts: Vec3[] }>;
    depth?: number;
  }>({ mode: "none", x: 0, y: 0 });

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  const syncHist = useCallback(() => {
    setHist({
      past: pastRef.current.length,
      future: futureRef.current.length,
    });
  }, []);

  const applyScene = useCallback((next: Scene) => {
    sceneRef.current = next;
    setScene(next);
    setAutosave(next);
  }, []);

  const pushHistory = useCallback(
    (before: Scene) => {
      pastRef.current = [...pastRef.current.slice(-60), before];
      futureRef.current = [];
      syncHist();
    },
    [syncHist]
  );

  const commit = useCallback(
    (next: Scene) => {
      pushHistory(sceneRef.current);
      applyScene(next);
    },
    [applyScene, pushHistory]
  );

  // undo/redo restore the model, never the camera you are looking through
  const undo = useCallback(() => {
    const stack = pastRef.current;
    if (!stack.length) return;
    const cur = sceneRef.current;
    pastRef.current = stack.slice(0, -1);
    futureRef.current = [cur, ...futureRef.current];
    applyScene({ ...stack[stack.length - 1], cam: cur.cam });
    syncHist();
  }, [applyScene, syncHist]);

  const redo = useCallback(() => {
    const stack = futureRef.current;
    if (!stack.length) return;
    const cur = sceneRef.current;
    futureRef.current = stack.slice(1);
    pastRef.current = [...pastRef.current, cur];
    applyScene({ ...stack[0], cam: cur.cam });
    syncHist();
  }, [applyScene, syncHist]);

  /* ------------------------------ geometry helpers ------------------------------ */

  const getBasis = useCallback((): Basis => {
    const cvs = canvasRef.current;
    const w = cvs?.clientWidth ?? 800;
    const h = cvs?.clientHeight ?? 600;
    return makeBasis(sceneRef.current.cam, w, h);
  }, []);

  const resolvePoint = useCallback(
    (sx: number, sy: number) =>
      resolveSnap(
        sceneRef.current,
        getBasis(),
        sx,
        sy,
        inferCfg,
        draftRef.current,
        {
          zLock: zLockRef.current,
          axisLock: shiftRef.current,
          xray: viewRef.current.wire,
        }
      ),
    [getBasis, inferCfg]
  );

  /* --------------------------------- rendering --------------------------------- */

  const st = useRef({
    scene,
    tool,
    draft,
    cand,
    cursor,
    view,
    sel,
    nextPoint,
  });
  st.current = { scene, tool, draft, cand, cursor, view, sel, nextPoint };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let frames = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cvs = canvasRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext("2d");
      if (!ctx) return;
      const s = st.current;
      const w = cvs.clientWidth;
      const h = cvs.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cvs.width !== Math.round(w * dpr) || cvs.height !== Math.round(h * dpr)) {
        cvs.width = Math.round(w * dpr);
        cvs.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const basis = makeBasis(s.scene.cam, w, h);
      const shown =
        s.draft && s.draft.kind === "push"
          ? extrudeFace(
              s.scene,
              s.draft.faceId,
              s.draft.dist,
              materialRef.current
            )
          : s.scene;
      renderScene(ctx, {
        scene: shown,
        basis,
        view: s.view,
        selection: new Set(s.sel),
        w,
        h,
      });
      drawOverlay(ctx, {
        basis,
        draft: s.draft,
        cand: s.cand,
        cursor: s.cursor,
        nextPoint: s.nextPoint,
        color: "#ff6a00",
        showGizmo: true,
      });

      const now = performance.now();
      acc += now - last;
      last = now;
      frames++;
      if (acc > 1000) {
        setFps(Math.round((frames * 1000) / acc));
        acc = 0;
        frames = 0;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ------------------------------- pointer input ------------------------------- */

  const localPoint = (e: ReactPointerEvent): { x: number; y: number } => {
    const cvs = canvasRef.current!;
    const r = cvs.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const updateHover = (sx: number, sy: number) => {
    setCursor({ x: sx, y: sy });
    const { pos, cand: c, dir } = resolvePoint(sx, sy);
    setCand(c);
    setDirInf(dir);
    setNextPoint(pos);
    setInfo(
      `X ${pos[0].toFixed(2)}  Y ${pos[1].toFixed(2)}  Z ${pos[2].toFixed(
        2
      )}  ·  ${c ? c.label : dir ? dir.label : "free"}`
    );
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    const cvs = canvasRef.current!;
    cvs.setPointerCapture(e.pointerId);
    const { x, y } = localPoint(e);

    const orbiting =
      e.button === 1 ||
      (e.button === 0 && (e.altKey || tool === "orbit"));
    if (orbiting || e.button === 2) {
      dragRef.current = {
        mode:
          orbiting && !(e.button === 1 && e.shiftKey) ? "orbit" : "pan",
        x: e.clientX,
        y: e.clientY,
      };
      if (e.button === 2 && draftRef.current) {
        setDraft(null);
        setNextPoint(null);
      }
      return;
    }
    if (e.button !== 0) return;

    if (tool === "select") {
      const basis = getBasis();
      const r = screenRay(basis, x, y);
      const faceHit = pickFace(sceneRef.current, r.origin, r.dir);
      const edgeHit = pickEdge(sceneRef.current, basis, x, y);
      const useEdge = edgeHit && (!faceHit || edgeHit.t < 5);
      if (useEdge && edgeHit) {
        setSel([edgeHit.id]);
        const edge = sceneRef.current.edges.find((ed) => ed.id === edgeHit.id);
        const orig = edge
          ? [
              {
                id: edge.id,
                kind: "edge" as const,
                pts: [edge.a, edge.b] as Vec3[],
              },
            ]
          : [];
        dragRef.current = {
          mode: "move",
          x: e.clientX,
          y: e.clientY,
          before: sceneRef.current,
          orig,
          depth: project(basis, edgeHit.pos).z,
        };
      } else if (faceHit) {
        setSel([faceHit.id]);
        const orig = sceneRef.current.faces
          .filter((f) => f.id === faceHit.id)
          .map((f) => ({ id: f.id, kind: "face" as const, pts: f.pts.map((p) => [...p] as Vec3) }));
        dragRef.current = {
          mode: "move",
          x: e.clientX,
          y: e.clientY,
          before: sceneRef.current,
          orig,
          depth: faceHit.t,
        };
      } else {
        setSel([]);
        dragRef.current = { mode: "none", x: e.clientX, y: e.clientY };
      }
      return;
    }

    if (tool === "push") {
      const d = draftRef.current;
      if (d && d.kind === "push") {
        if (Math.abs(d.dist) > 1e-3) {
          commit(
            extrudeFace(
              sceneRef.current,
              d.faceId,
              d.dist,
              materialRef.current
            )
          );
          notify(`Extruded ${Math.abs(d.dist).toFixed(3)} m`);
        }
        setDraft(null);
        setNextPoint(null);
        setSel([]);
        return;
      }
      const basis = getBasis();
      const r = screenRay(basis, x, y);
      const hit = pickFace(sceneRef.current, r.origin, r.dir);
      const face = hit
        ? sceneRef.current.faces.find((f) => f.id === hit.id)
        : undefined;
      if (hit && face) {
        setDraft({
          kind: "push",
          faceId: face.id,
          origin: hit.pos,
          normal: polyNormal(face.pts),
          dist: 0,
        });
        setSel([face.id]);
      } else {
        notify("Click a face to push or pull");
      }
      return;
    }

    const { pos } = resolvePoint(x, y);

    if (tool === "guide") {
      guideDrag.current = { a: pos };
      setDraft({ kind: "guide", a: pos, b: pos });
      setNextPoint(pos);
      return;
    }

    if (tool === "line") {
      const d = draftRef.current;
      if (d && d.kind === "line" && d.pts.length >= 3) {
        const first = d.pts[0];
        if (dist3(first, pos) < 0.02) {
          commit(addFace(sceneRef.current, d.pts, material));
          setDraft(null);
          setNextPoint(null);
          notify("Face created");
          return;
        }
      }
      const pts = d && d.kind === "line" ? [...d.pts, pos] : [pos];
      setDraft({ kind: "line", pts });
      setNextPoint(pos);
      return;
    }

    if (tool === "rect") {
      const d = draftRef.current;
      if (d && d.kind === "rect") {
        const next = addRect(sceneRef.current, d.a, pos, material);
        if (next) {
          commit(next);
          notify("Face created");
        } else {
          notify("That rectangle has no area");
        }
        setDraft(null);
        setNextPoint(null);
      } else {
        setDraft({ kind: "rect", a: pos, b: pos });
        setNextPoint(pos);
      }
      return;
    }

    if (tool === "tape") {
      const d = draftRef.current;
      if (d && d.kind === "tape") {
        const len = dist3(d.a, pos);
        commit(addMeasure(sceneRef.current, d.a, pos));
        setDraft({ kind: "tape", a: pos, b: pos });
        setNextPoint(pos);
        notify(`Measured ${len.toFixed(3)} m`);
      } else {
        setDraft({ kind: "tape", a: pos, b: pos });
        setNextPoint(pos);
      }
      return;
    }

    if (tool === "protractor") {
      const d = draftRef.current;
      if (d && d.kind === "protractor") {
        const ang = (Math.atan2(pos[1] - d.a[1], pos[0] - d.a[0]) * 180) / Math.PI;
        const len = dist3(d.a, pos);
        const next: Scene = {
          ...sceneRef.current,
          edges: [
            ...sceneRef.current.edges,
            { id: uid(), a: d.a, b: pos, kind: "edge" },
            {
              id: uid(),
              a: d.a,
              b: pos,
              kind: "measure",
              label: `${ang.toFixed(1)}° · ${len.toFixed(3)} m`,
            },
          ],
        };
        commit(next);
        setDraft(null);
        setNextPoint(null);
        notify(`Angle ${ang.toFixed(1)}° locked`);
      } else {
        setDraft({ kind: "protractor", a: pos, b: pos });
        setNextPoint(pos);
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const { x, y } = localPoint(e);
    const drag = dragRef.current;

    if (drag.mode === "orbit") {
      const cam = sceneRef.current.cam;
      const next: Scene = {
        ...sceneRef.current,
        cam: {
          ...cam,
          yaw: cam.yaw - (e.clientX - drag.x) * 0.006,
          pitch: Math.max(
            -1.5,
            Math.min(1.5, cam.pitch + (e.clientY - drag.y) * 0.006)
          ),
        },
      };
      sceneRef.current = next;
      setScene(next);
      drag.x = e.clientX;
      drag.y = e.clientY;
      return;
    }

    if (drag.mode === "pan") {
      const basis = getBasis();
      const k = dist3(basis.eye, basis.target) / basis.f;
      const cam = sceneRef.current.cam;
      const next: Scene = {
        ...sceneRef.current,
        cam: {
          ...cam,
          target: add(
            cam.target,
            add(mul(basis.right, -(e.clientX - drag.x) * k), mul(basis.up, (e.clientY - drag.y) * k))
          ),
        },
      };
      sceneRef.current = next;
      setScene(next);
      drag.x = e.clientX;
      drag.y = e.clientY;
      return;
    }

    if (drag.mode === "move" && drag.orig) {
      const basis = getBasis();
      const depth = drag.depth ?? dist3(basis.eye, basis.target);
      const k = depth / basis.f;
      const dx = (e.clientX - drag.x) * k;
      const dy = (e.clientY - drag.y) * k;
      const delta = add(mul(basis.right, dx), mul(basis.up, -dy));
      const sc = sceneRef.current;
      const faces = sc.faces.map((f) => {
        const hit = drag.orig!.find((o) => o.id === f.id);
        if (!hit) return f;
        return { ...f, pts: f.pts.map((_, i) => add(hit.pts[i], delta)) };
      });
      const edges = sc.edges.map((ed) => {
        const hit = drag.orig!.find((o) => o.id === ed.id);
        if (!hit) return ed;
        return { ...ed, a: add(hit.pts[0], delta), b: add(hit.pts[1], delta) };
      });
      const guides = sc.guides.map((g, i) => {
        const hit = drag.orig!.find((o) => o.id === `g${i}`);
        return hit ? add(hit.pts[0], delta) : g;
      });
      const next: Scene = { ...sc, faces, edges, guides };
      sceneRef.current = next;
      setScene(next);
      return;
    }

    if (tool === "guide" && e.buttons === 1 && guideDrag.current) {
      const { pos } = resolvePoint(x, y);
      setDraft({ kind: "guide", a: guideDrag.current.a, b: pos });
      setNextPoint(pos);
      return;
    }

    const pd = draftRef.current;
    if (pd && pd.kind === "push") {
      const r = screenRay(getBasis(), x, y);
      let dist = lineParam(r, pd.origin, pd.normal);
      if (inferCfg.enabled.has("grid")) dist = Math.round(dist * 10) / 10;
      setDraft({ ...pd, dist });
      setCursor({ x, y });
      setCand(null);
      setNextPoint(add(pd.origin, mul(pd.normal, dist)));
      setInfo(`Distance ${dist.toFixed(3)} m — click, or type a value`);
      return;
    }

    updateHover(x, y);
  };

  const guideDrag = useRef<{ a: Vec3 } | null>(null);

  const onPointerUp = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    const { x, y } = localPoint(e);

    if (drag.mode === "move" && drag.before) {
      if (sceneRef.current !== drag.before) pushHistory(drag.before);
      setAutosave(sceneRef.current);
      dragRef.current = { mode: "none", x: 0, y: 0 };
      return;
    }

    if (tool === "guide" && guideDrag.current) {
      const a = guideDrag.current.a;
      const { pos } = resolvePoint(x, y);
      const sc = sceneRef.current;
      guideDrag.current = null;
      let next: Scene;
      if (dist3(a, pos) < 0.05) {
        next = { ...sc, guides: [...sc.guides, a] };
        notify("Guide point placed");
      } else {
        next = {
          ...sc,
          edges: [...sc.edges, { id: uid(), a, b: pos, kind: "guide" }],
        };
        notify("Guide line placed");
      }
      commit(next);
      guideDrag.current = null;
      setDraft(null);
      setNextPoint(null);
      dragRef.current = { mode: "none", x: 0, y: 0 };
      return;
    }

    dragRef.current = { mode: "none", x: 0, y: 0 };
  };

  const onWheel = (e: React.WheelEvent) => {
    const cam = sceneRef.current.cam;
    const next: Scene = {
      ...sceneRef.current,
      cam: {
        ...cam,
        dist: Math.max(1.2, Math.min(300, cam.dist * (1 + e.deltaY * 0.0012))),
      },
    };
    sceneRef.current = next;
    setScene(next);
  };

  /* -------------------------------- keyboard -------------------------------- */

  const finishDraft = useCallback(() => {
    const d = draftRef.current;
    if (!d) return;
    if (d.kind === "line" && d.pts.length > 1) {
      const edges = d.pts.slice(0, -1).map((p, i) => ({
        id: uid(),
        a: p,
        b: d.pts[i + 1],
        kind: "edge" as const,
      }));
      commit({ ...sceneRef.current, edges: [...sceneRef.current.edges, ...edges] });
      notify(`${edges.length} edge${edges.length > 1 ? "s" : ""} created`);
    }
    setDraft(null);
    setNextPoint(null);
  }, [commit, notify]);

  const deleteSelection = useCallback(() => {
    if (!sel.length) return;
    const sc = sceneRef.current;
    const next: Scene = {
      ...sc,
      faces: sc.faces.filter((f) => !sel.includes(f.id)),
      edges: sc.edges.filter((e) => !sel.includes(e.id)),
    };
    commit(next);
    setSel([]);
    notify(`${sel.length} object${sel.length > 1 ? "s" : ""} deleted`);
  }, [commit, notify, sel]);

  const frameAll = useCallback(() => {
    const b = sceneBounds(sceneRef.current);
    const next: Scene = {
      ...sceneRef.current,
      cam: { ...sceneRef.current.cam, target: b.center, dist: b.radius * 2.4 },
    };
    sceneRef.current = next;
    setScene(next);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const typing =
        tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA");

      if (e.key === "Shift") shiftRef.current = true;
      if (e.key === "Escape") {
        if (modal !== "none") setModal("none");
        else {
          setDraft(null);
          setNextPoint(null);
          setSel([]);
        }
        return;
      }
      if (typing) return;

      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setModal("projects");
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (e.key === "Enter") {
        finishDraft();
        return;
      }
      if (e.key.toLowerCase() === "f") {
        frameAll();
        return;
      }
      if (/^[0-9.]$/.test(e.key) && draftRef.current && !meta) {
        e.preventDefault();
        setMeasureInput((v) => v + e.key);
        measureRef.current?.focus();
        return;
      }
      if (e.key.toLowerCase() === "z") {
        setZLock((v) => !v);
        return;
      }
      if (e.key.toLowerCase() === "h") {
        setView((v) => ({ ...v, guides: !v.guides, measures: !v.guides }));
        return;
      }
      if (e.key.toLowerCase() === "m") {
        setFocusBox((v) => !v);
        return;
      }
      const tool = TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
      if (tool) {
        setTool(tool.id);
        setDraft(null);
        setNextPoint(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [deleteSelection, finishDraft, frameAll, modal, redo, undo]);

  /* ------------------------------ measurements box ------------------------------ */

  const applyMeasure = () => {
    const n = parseFloat(measureInput);
    if (!isFinite(n) || n <= 0) return;
    const d = draftRef.current;
    if (!d) {
      notify("Start a line, a tape or a push/pull first");
      return;
    }
    if (d.kind === "line" && d.pts.length) {
      const pt = typedPoint(d.pts[d.pts.length - 1], nextPoint, n);
      setDraft({ kind: "line", pts: [...d.pts, pt] });
      setNextPoint(pt);
      notify(`Segment set to ${n.toFixed(3)} m`);
    } else if (d.kind === "tape") {
      const pt = typedPoint(d.a, nextPoint, n);
      commit(addMeasure(sceneRef.current, d.a, pt));
      setDraft({ kind: "tape", a: pt, b: pt });
      setNextPoint(pt);
      notify(`Measured ${n.toFixed(3)} m`);
    } else if (d.kind === "push") {
      const dist = (d.dist < 0 ? -1 : 1) * n;
      commit(
        extrudeFace(sceneRef.current, d.faceId, dist, materialRef.current)
      );
      setDraft(null);
      setNextPoint(null);
      setSel([]);
      notify(`Extruded ${n.toFixed(3)} m`);
    } else {
      notify("Typed lengths work with Line, Tape and Push/Pull");
    }
    setMeasureInput("");
    measureRef.current?.blur();
  };

  /* --------------------------------- projects --------------------------------- */

  const openProjects = () => {
    setProjects(listProjects());
    setModal("projects");
  };

  const saveProject = () => {
    const name = projectName.trim() || "Untitled Project";
    const id = projectId ?? uid();
    const entry: StoredProject = {
      id,
      name,
      savedAt: Date.now(),
      data: { ...sceneRef.current, name },
    };
    upsertProject(entry);
    setProjects(listProjects());
    setProjectId(id);
    notify(`Saved “${name}” to this browser`);
  };

  const loadProject = (p: StoredProject) => {
    const next: Scene = { ...p.data, name: p.name };
    commit(next);
    setProjectName(p.name);
    setProjectId(p.id);
    setModal("none");
    notify(`Loaded “${p.name}”`);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Scene;
        if (!parsed || !Array.isArray(parsed.faces)) throw new Error("bad");
        commit({ ...parsed, name: parsed.name || file.name.replace(/\.json$/, "") });
        setProjectName(parsed.name || "Imported");
        notify("Project imported");
      } catch {
        notify("That file is not a Sketchline project");
      }
    };
    reader.readAsText(file);
  };

  const copyEmbed = async () => {
    const snippet = buildEmbedSnippet(sceneRef.current);
    try {
      await navigator.clipboard.writeText(snippet);
      notify("Embed snippet copied — paste it anywhere");
    } catch {
      notify("Clipboard blocked — use Download HTML instead");
    }
  };

  const measurements = useMemo(
    () => scene.edges.filter((e) => e.kind === "measure"),
    [scene.edges]
  );

  const currentTool = TOOLS.find((t) => t.id === tool)!;
  const activeInfer = cand?.label ?? dirInf?.label ?? "free";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0a0c10] font-display text-[#d8dde5]">
      {/* ------------------------------- top bar ------------------------------- */}
      <header className="relative z-40 flex h-11 shrink-0 items-center gap-1 border-b border-white/10 bg-[#12151b] px-2">
        <button
          onClick={onExit}
          className="mr-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-dim transition-colors hover:bg-white/5 hover:text-paper"
        >
          <X className="h-3.5 w-3.5" />
          Site
        </button>
        <span className="mr-2 h-5 w-px bg-white/10" />

        {[
          { id: "file", label: "File" },
          { id: "create", label: "Create" },
          { id: "view", label: "View" },
          { id: "help", label: "Help" },
        ].map((m) => (
          <div key={m.id} className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
              className={`rounded-md px-2.5 py-1.5 font-mono text-[11px] tracking-wide transition-colors ${
                openMenu === m.id
                  ? "bg-blend/15 text-blend-soft"
                  : "text-dim hover:bg-white/5 hover:text-paper"
              }`}
            >
              {m.label}
            </button>
            {openMenu === m.id && (
              <MenuPanel
                onClose={() => setOpenMenu(null)}
                items={
                  m.id === "file"
                    ? [
                        { label: "New Scene", act: () => {
                            commit(emptyScene("Untitled"));
                            setProjectId(null);
                            setProjectName("Untitled");
                            clearAutosave();
                            setDraft(null);
                            notify("New scene");
                          } },
                        { label: "Open Project…", act: openProjects },
                        { label: "Save Project", act: saveProject },
                        { sep: true },
                        { label: "Import JSON…", act: () => fileRef.current?.click() },
                        { label: "Export JSON", act: () => downloadScene(sceneRef.current) },
                        { label: "Export Standalone HTML", act: () => {
                            downloadFile(
                              `${(sceneRef.current.name || "project").replace(/\s+/g, "-").toLowerCase()}.html`,
                              buildStandaloneHTML(sceneRef.current),
                              "text/html"
                            );
                            notify("Standalone HTML downloaded");
                          } },
                        { label: "Copy Embed Snippet", act: copyEmbed },
                      ]
                    : m.id === "create"
                    ? TOOLS.map((t) => ({
                        label: `${t.label}  (${t.key})`,
                        act: () => {
                          setTool(t.id);
                          setDraft(null);
                        },
                      }))
                    : m.id === "view"
                    ? [
                        { label: "Frame All (F)", act: frameAll },
                        { label: "Front", act: () => setViewCam({ yaw: 0, pitch: 0 }) },
                        { label: "Top", act: () => setViewCam({ yaw: 0, pitch: 1.45 }) },
                        { label: "Right", act: () => setViewCam({ yaw: Math.PI / 2, pitch: 0 }) },
                        { sep: true },
                        { label: "Toggle Grid", act: () => setView((v) => ({ ...v, grid: !v.grid })) },
                        { label: "Toggle Wireframe", act: () => setView((v) => ({ ...v, wire: !v.wire })) },
                        { label: "Toggle Construction (H)", act: () => setView((v) => ({ ...v, guides: !v.guides, measures: !v.guides })) },
                      ]
                    : [
                        { label: "Watch the tutorial film", act: onWatchTutorial },
                        {
                          label: "Load the tutorial project",
                          act: () => {
                            commit(cabinScene());
                            setProjectId(null);
                            setProjectName("The Cabin");
                            setDraft(null);
                            notify("Tutorial project loaded");
                          },
                        },
                        { sep: true },
                        { label: "Orbit: O tool · Alt+drag · middle mouse", act: () => {} },
                        { label: "Pan: right-drag · Zoom: wheel", act: () => {} },
                        { label: "Z blue-axis lock · Shift axis lock", act: () => {} },
                        { label: "H hides guides · F frames all · Del", act: () => {} },
                      ]
                }
              />
            )}
          </div>
        ))}

        <div className="ml-4 flex items-center gap-1 border-l border-white/10 pl-4 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
          Layout
          <span className="rounded bg-blend/15 px-1.5 py-0.5 text-blend-soft">Sketcher</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-[11px] text-dim sm:block">
            {scene.name}
          </span>
          <button
            onClick={() => setModal("export")}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-dim transition-colors hover:bg-white/5 hover:text-paper"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button
            onClick={saveProject}
            className="flex items-center gap-1.5 rounded-md bg-blend px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-blend-soft"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------ toolbar ------------------------------ */}
        <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-[#12151b] py-2">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTool(t.id);
                setDraft(null);
                setNextPoint(null);
              }}
              title={`${t.label} (${t.key})`}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
                tool === t.id
                  ? "bg-blend/18 text-blend-soft ring-1 ring-blend/50"
                  : "text-dim hover:bg-white/5 hover:text-paper"
              }`}
            >
              <t.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              <span className="absolute -right-0.5 -top-0.5 rounded bg-black/70 px-1 font-mono text-[9px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
                {t.key}
              </span>
            </button>
          ))}
          <span className="my-1 h-px w-7 bg-white/10" />
          <button
            onClick={undo}
            disabled={!hist.past}
            title="Undo (Ctrl+Z)"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-dim transition-colors hover:bg-white/5 hover:text-paper disabled:opacity-25"
          >
            <Undo2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
          <button
            onClick={redo}
            disabled={!hist.future}
            title="Redo (Ctrl+Shift+Z)"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-dim transition-colors hover:bg-white/5 hover:text-paper disabled:opacity-25"
          >
            <Redo2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </aside>

        {/* ------------------------------ viewport ------------------------------ */}
        <div className="relative min-w-0 flex-1">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
              setCursor(null);
              setCand(null);
            }}
            onWheel={onWheel}
            onContextMenu={(e) => e.preventDefault()}
            className="h-full w-full touch-none"
          />

          {/* viewport header */}
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
            <span className="rounded bg-black/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-blend-soft">
              {currentTool.label}
            </span>
            <span className="hidden rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-dim md:block">
              {currentTool.hint}
            </span>
          </div>

          {/* viewport toggles */}
          <div className="absolute right-3 top-3 flex items-center gap-1">
            {(
              [
                ["grid", Grid3x3, "Grid"],
                ["wire", Box, "Wireframe"],
                ["guides", Crosshair, "Guides"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                onClick={() =>
                  setView((v) =>
                    key === "guides"
                      ? { ...v, guides: !v.guides, measures: !v.guides }
                      : { ...v, [key]: !v[key] }
                  )
                }
                aria-label={label}
                aria-pressed={view[key]}
                title={label}
                className={`flex h-8 w-8 items-center justify-center rounded-md border text-dim transition-colors ${
                  view[key]
                    ? "border-blend/40 bg-blend/10 text-blend-soft"
                    : "border-white/10 bg-black/50 hover:text-paper"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </button>
            ))}
            <button
              onClick={frameAll}
              title="Frame All (F)"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/50 text-dim transition-colors hover:text-paper"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              onClick={() => setZLock((v) => !v)}
              title="Lock drawing to the blue (Z) axis — key Z"
              aria-pressed={zLock}
              className={`flex h-8 items-center justify-center rounded-md border px-2.5 font-mono text-[10px] font-semibold tracking-wider transition-colors ${
                zLock
                  ? "border-inf-blue/60 bg-inf-blue/15 text-inf-blue"
                  : "border-white/10 bg-black/50 text-dim hover:text-paper"
              }`}
            >
              Z LOCK
            </button>
          </div>

          {/* measurements box */}
          {(draft || focusBox) && (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/15 bg-[#12151b]/95 px-3 py-2 shadow-2xl backdrop-blur">
              <Ruler className="h-4 w-4 text-blend" />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
                Length
              </span>
              <input
                ref={measureRef}
                aria-label="Length in metres"
                value={measureInput}
                onChange={(e) => setMeasureInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyMeasure();
                }}
                placeholder="0.000"
                className="w-24 bg-transparent font-mono text-sm text-paper outline-none placeholder:text-faint"
              />
              <span className="font-mono text-[11px] text-faint">m</span>
              <button
                onClick={applyMeasure}
                className="rounded bg-blend/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-blend-soft transition-colors hover:bg-blend hover:text-ink"
              >
                Set
              </button>
            </div>
          )}

          {/* mouse hints */}
          <div className="pointer-events-none absolute bottom-4 left-3 font-mono text-[10px] leading-relaxed text-faint">
            <div>O tool / Alt+drag / MMB orbit · RMB pan · Wheel zoom</div>
            <div className="text-dim">
              Z blue lock · SHIFT axis lock · type a length · H hide guides
            </div>
          </div>
        </div>

        {/* ------------------------------ sidebar ------------------------------ */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-white/10 bg-[#12151b] lg:block">
          <Panel title="Scene">
            <div className="space-y-1">
              <Row
                label={`Faces (${scene.faces.length})`}
                value={scene.faces.length.toString()}
              />
              <Row
                label={`Edges (${scene.edges.filter((e) => e.kind === "edge").length})`}
                value={scene.edges.filter((e) => e.kind === "edge").length.toString()}
              />
              <Row
                label={`Guides (${scene.guides.length + scene.edges.filter((e) => e.kind === "guide").length})`}
                value={(scene.guides.length + scene.edges.filter((e) => e.kind === "guide").length).toString()}
              />
              <Row
                label={`Measurements (${measurements.length})`}
                value={measurements.length.toString()}
              />
            </div>
            <div className="mt-3 max-h-40 space-y-0.5 overflow-y-auto">
              {scene.faces.map((f, i) => (
                <button
                  key={f.id}
                  onClick={() => setSel([f.id])}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-[10px] transition-colors ${
                    sel.includes(f.id)
                      ? "bg-blend/15 text-blend-soft"
                      : "text-dim hover:bg-white/5 hover:text-paper"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm border border-white/20"
                    style={{ background: f.color }}
                  />
                  <span className="truncate">
                    {f.name || `Face ${i + 1}`}
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Material">
            <div className="grid grid-cols-5 gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setMaterial(c);
                    if (sel.length) {
                      const sc = sceneRef.current;
                      commit({
                        ...sc,
                        faces: sc.faces.map((f) =>
                          sel.includes(f.id) ? { ...f, color: c } : f
                        ),
                      });
                      notify("Material applied");
                    }
                  }}
                  title={c}
                  className={`h-7 w-full rounded border transition-transform ${
                    material === c
                      ? "border-blend ring-1 ring-blend/60"
                      : "border-white/15 hover:scale-110"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-faint">
              Select a face, then pick a swatch — or set the colour for your next
              face.
            </p>
          </Panel>

          <Panel title="Inference">
            <div className="space-y-1.5">
              {ALL_INFERENCES.map((inf) => {
                const on = inferCfg.enabled.has(inf.id);
                return (
                  <button
                    key={inf.id}
                    onClick={() => {
                      const next = new Set(inferCfg.enabled);
                      if (on) next.delete(inf.id);
                      else next.add(inf.id);
                      setInferCfg({ ...inferCfg, enabled: next });
                    }}
                    className="flex w-full items-center gap-2.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-white/5"
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full transition-opacity ${
                        on ? "opacity-100" : "opacity-20"
                      }`}
                      style={{ background: inf.color }}
                    />
                    <span
                      className={`font-mono text-[11px] ${
                        on ? "text-paper" : "text-faint line-through"
                      }`}
                    >
                      {inf.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                Radius
              </span>
              <span className="font-mono text-[11px] text-blend-soft">
                {inferCfg.threshold}px
              </span>
            </div>
          </Panel>

          <Panel title="Measurements">
            {measurements.length === 0 ? (
              <p className="font-mono text-[10px] text-faint">
                Press T to measure. Results appear here.
              </p>
            ) : (
              <div className="space-y-1">
                {measurements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded bg-white/[0.03] px-2 py-1.5"
                  >
                    <span className="font-mono text-[11px] text-inf-amber">
                      {m.label}
                    </span>
                    <button
                      onClick={() => {
                        const sc = sceneRef.current;
                        commit({
                          ...sc,
                          edges: [
                            ...sc.edges.filter((e) => e.id !== m.id),
                            { id: uid(), a: m.a, b: m.b, kind: "guide" },
                          ],
                        });
                        notify("Converted to guide");
                      }}
                      className="font-mono text-[9px] uppercase tracking-[0.15em] text-dim transition-colors hover:text-blend"
                    >
                      → guide
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Transform">
            <TransformPanel scene={scene} sel={sel} onApply={commit} />
          </Panel>
        </aside>
      </div>

      {/* ------------------------------ status bar ------------------------------ */}
      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-white/10 bg-[#12151b] px-3 font-mono text-[10px] text-faint">
        <span className="flex items-center gap-1.5">
          <CircleDot
            className="h-3 w-3"
            style={{ color: cand ? cand.color : "#3b4350" }}
          />
          {activeInfer}
        </span>
        <span className="text-dim">{info}</span>
        <span className="ml-auto flex items-center gap-4">
          <span>{(scene.faces.length + scene.edges.length).toString()} objects</span>
          <span>{fps} fps</span>
          <span className="text-dim">
            {zLock ? "Z LOCK" : "free"} · {currentTool.key}
          </span>
        </span>
      </footer>

      {/* -------------------------------- modals -------------------------------- */}
      {modal !== "none" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
          onClick={() => setModal("none")}
        >
          {modal === "projects" ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#14171c] shadow-2xl"
            >
              <ModalHead title="Projects" onClose={() => setModal("none")} />
              <div className="space-y-4 p-5">
                <div className="flex gap-2">
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Project name"
                    className="flex-1 rounded-lg border border-white/10 bg-[#0e1116] px-3 py-2 font-mono text-sm text-paper outline-none transition-colors focus:border-blend/60"
                  />
                  <button
                    onClick={saveProject}
                    className="flex items-center gap-2 rounded-lg bg-blend px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-blend-soft"
                  >
                    <Save className="h-3.5 w-3.5" /> Save
                  </button>
                </div>
                <p className="font-mono text-[10px] leading-relaxed text-faint">
                  Saved in this browser only. Nothing is uploaded, nothing is
                  tracked. Free, forever.
                </p>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {projects.length === 0 && (
                    <p className="py-6 text-center font-mono text-[11px] text-faint">
                      No saved projects yet.
                    </p>
                  )}
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[12px] text-paper">
                          {p.name}
                        </div>
                        <div className="font-mono text-[10px] text-faint">
                          {new Date(p.savedAt).toLocaleString()} ·{" "}
                          {p.data.faces.length} faces
                        </div>
                      </div>
                      <button
                        onClick={() => loadProject(p)}
                        className="rounded border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-dim transition-colors hover:border-blend/50 hover:text-blend"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => {
                          setProjects(removeProject(p.id));
                          notify("Project deleted");
                        }}
                        className="rounded p-1.5 text-faint transition-colors hover:text-inf-red"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#14171c] shadow-2xl"
            >
              <ModalHead title="Export your project" onClose={() => setModal("none")} />
              <div className="space-y-2 p-5">
                <ExportRow
                  icon={FileDown}
                  title="Project file (.json)"
                  desc="Re-importable Sketchline scene — geometry, guides, camera."
                  onClick={() => downloadScene(sceneRef.current)}
                />
                <ExportRow
                  icon={Download}
                  title="Standalone page (.html)"
                  desc="One self-contained file with the model inside. Host it anywhere."
                  onClick={() => {
                    downloadFile(
                      `${(sceneRef.current.name || "project").replace(/\s+/g, "-").toLowerCase()}.html`,
                      buildStandaloneHTML(sceneRef.current),
                      "text/html"
                    );
                    notify("Standalone HTML downloaded");
                  }}
                />
                <ExportRow
                  icon={Hammer}
                  title="Embed snippet"
                  desc="An iframe you can paste into any site or README."
                  onClick={copyEmbed}
                />
                <ExportRow
                  icon={Upload}
                  title="Import a project (.json)"
                  desc="Load a scene someone sent you."
                  onClick={() => fileRef.current?.click()}
                />
              </div>
              <div className="border-t border-white/10 bg-black/20 px-5 py-3 font-mono text-[10px] leading-relaxed text-faint">
                Everything here is free and local to your machine — no account,
                no server, no watermark.
              </div>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          e.target.value = "";
        }}
      />

      {toast && (
        <div className="pointer-events-none fixed bottom-14 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-blend/40 bg-[#12151b]/95 px-4 py-2 font-mono text-[11px] text-blend-soft shadow-xl backdrop-blur">
          {toast}
        </div>
      )}
    </div>
  );

  function setViewCam(cam: { yaw: number; pitch: number }) {
    const next: Scene = {
      ...sceneRef.current,
      cam: { ...sceneRef.current.cam, ...cam },
    };
    sceneRef.current = next;
    setScene(next);
  }
}

/* ------------------------------- small parts ------------------------------- */

function MenuPanel({
  items,
  onClose,
}: {
  items: Array<{ label?: string; act?: () => void; sep?: boolean }>;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute left-0 top-9 z-40 min-w-[230px] overflow-hidden rounded-lg border border-white/12 bg-[#171a21] py-1 shadow-2xl">
        {items.map((it, i) =>
          it.sep ? (
            <div key={i} className="my-1 h-px bg-white/10" />
          ) : (
            <button
              key={i}
              onClick={() => {
                it.act?.();
                onClose();
              }}
              className="block w-full px-3 py-1.5 text-left font-mono text-[11px] text-dim transition-colors hover:bg-blend/10 hover:text-paper"
            >
              {it.label ?? ""}
            </button>
          )
        )}
      </div>
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/10 px-3 py-3">
      <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-faint">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded px-1.5 py-1 font-mono text-[11px]">
      <span className="text-dim">{label}</span>
      <span className="text-paper">{value}</span>
    </div>
  );
}

function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-paper">
        {title}
      </h2>
      <button
        onClick={onClose}
        className="rounded p-1 text-faint transition-colors hover:text-paper"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ExportRow({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof FileDown;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition-all hover:border-blend/40 hover:bg-blend/[0.06]"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blend" strokeWidth={1.75} />
      <span className="min-w-0">
        <span className="block font-mono text-[12px] text-paper">{title}</span>
        <span className="block font-mono text-[10px] leading-relaxed text-faint">
          {desc}
        </span>
      </span>
    </button>
  );
}

function TransformPanel({
  scene,
  sel,
  onApply,
}: {
  scene: Scene;
  sel: string[];
  onApply: (s: Scene) => void;
}) {
  const target = scene.faces.find((f) => sel.includes(f.id));
  const b = sceneBounds(scene);
  const [vals, setVals] = useState<[string, string, string]>([
    b.center[0].toFixed(3),
    b.center[1].toFixed(3),
    b.center[2].toFixed(3),
  ]);
  useEffect(() => {
    setVals([
      b.center[0].toFixed(3),
      b.center[1].toFixed(3),
      b.center[2].toFixed(3),
    ]);
  }, [b.center[0], b.center[1], b.center[2]]);

  const apply = () => {
    const n = vals.map((v) => parseFloat(v));
    if (n.some((v) => !isFinite(v))) return;
    if (!target) {
      const c = b.center;
      const d: Vec3 = [n[0] - c[0], n[1] - c[1], n[2] - c[2]];
      onApply({
        ...scene,
        faces: scene.faces.map((f) => ({
          ...f,
          pts: f.pts.map((p) => add(p, d)),
        })),
        edges: scene.edges.map((e) => ({
          ...e,
          a: add(e.a, d),
          b: add(e.b, d),
        })),
        guides: scene.guides.map((g) => add(g, d)),
      });
      return;
    }
    const c = target.pts.reduce<Vec3>((acc, p) => add(acc, p), [0, 0, 0]);
    const cc = mul(c, 1 / target.pts.length);
    const d: Vec3 = [n[0] - cc[0], n[1] - cc[1], n[2] - cc[2]];
    onApply({
      ...scene,
      faces: scene.faces.map((f) =>
        f.id === target.id
          ? { ...f, pts: f.pts.map((p) => add(p, d)) }
          : f
      ),
    });
  };

  return (
    <div>
      <div className="mb-2 font-mono text-[10px] text-faint">
        {target ? `origin of ${target.name}` : "origin of scene"}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {vals.map((v, i) => (
          <label key={i} className="block">
            <span className="mb-1 block font-mono text-[9px] uppercase text-faint">
              {AXIS_LABELS[i]}
            </span>
            <input
              value={v}
              onChange={(e) => {
                const next = [...vals] as [string, string, string];
                next[i] = e.target.value;
                setVals(next);
              }}
              className="w-full rounded border border-white/10 bg-[#0e1116] px-2 py-1 font-mono text-[11px] text-paper outline-none focus:border-blend/60"
            />
          </label>
        ))}
      </div>
      <button
        onClick={apply}
        className="mt-3 w-full rounded-lg border border-blend/40 bg-blend/10 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-blend-soft transition-colors hover:bg-blend hover:text-ink"
      >
        Apply position
      </button>
    </div>
  );
}
