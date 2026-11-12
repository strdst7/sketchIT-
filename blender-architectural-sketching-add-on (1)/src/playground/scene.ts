import type { Vec3 } from "./vec";
import { mid } from "./vec";

export type EdgeKind = "edge" | "guide" | "measure";

export interface EdgeObj {
  id: string;
  a: Vec3;
  b: Vec3;
  kind: EdgeKind;
  label?: string;
}

export interface FaceObj {
  id: string;
  name: string;
  pts: Vec3[];
  color: string;
}

export interface Cam {
  yaw: number;
  pitch: number;
  dist: number;
  target: Vec3;
}

export interface Scene {
  name: string;
  faces: FaceObj[];
  edges: EdgeObj[];
  guides: Vec3[];
  cam: Cam;
}

export const PALETTE = [
  "#e7e3d8",
  "#c9c1ae",
  "#9fb3c4",
  "#5f7f9c",
  "#3d5a80",
  "#b4674a",
  "#d9a441",
  "#6f8f5f",
  "#96a89a",
  "#343b45",
];

export const uid = (): string =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export function emptyScene(name = "Untitled"): Scene {
  return {
    name,
    faces: [],
    edges: [],
    guides: [],
    cam: { yaw: 0.65, pitch: 0.45, dist: 18, target: [0, 0, 0] },
  };
}

export function sceneEdges(scene: Scene): EdgeObj[] {
  const out: EdgeObj[] = [];
  for (const f of scene.faces) {
    for (let i = 0; i < f.pts.length; i++) {
      out.push({
        id: `${f.id}:e${i}`,
        a: f.pts[i],
        b: f.pts[(i + 1) % f.pts.length],
        kind: "edge",
      });
    }
  }
  for (const e of scene.edges) out.push(e);
  return out;
}

export function sceneBounds(scene: Scene) {
  const pts: Vec3[] = [];
  for (const f of scene.faces) pts.push(...f.pts);
  for (const e of scene.edges) pts.push(e.a, e.b);
  pts.push(...scene.guides);
  if (!pts.length) {
    return {
      min: [0, 0, 0] as Vec3,
      max: [0, 0, 0] as Vec3,
      center: [0, 0, 0] as Vec3,
      radius: 5,
    };
  }
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    min[0] = Math.min(min[0], p[0]);
    min[1] = Math.min(min[1], p[1]);
    min[2] = Math.min(min[2], p[2]);
    max[0] = Math.max(max[0], p[0]);
    max[1] = Math.max(max[1], p[1]);
    max[2] = Math.max(max[2], p[2]);
  }
  const center: Vec3 = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const radius =
    Math.max(
      0.5,
      Math.hypot(max[0] - center[0], max[1] - center[1], max[2] - center[2])
    ) * 1.35;
  return { min, max, center, radius };
}

/** A small demo building so the playground is never empty on load. */
export function demoScene(): Scene {
  const floor: FaceObj = {
    id: uid(),
    name: "Floor",
    pts: [
      [-7, -5, 0],
      [7, -5, 0],
      [7, 5, 0],
      [-7, 5, 0],
    ],
    color: "#9fb3c4",
  };

  const wall = (pts: Vec3[], color: string): FaceObj => ({
    id: uid(),
    name: "Wall",
    pts,
    color,
  });

  const faces: FaceObj[] = [
    floor,
    wall(
      [
        [-2.6, -2, 0],
        [2.6, -2, 0],
        [2.6, -2, 3.2],
        [-2.6, -2, 3.2],
      ],
      "#e7e3d8"
    ),
    wall(
      [
        [2.6, 2, 0],
        [-2.6, 2, 0],
        [-2.6, 2, 3.2],
        [2.6, 2, 3.2],
      ],
      "#e7e3d8"
    ),
    wall(
      [
        [-2.6, 2, 0],
        [-2.6, -2, 0],
        [-2.6, -2, 3.2],
        [-2.6, 2, 3.2],
      ],
      "#d9d9d2"
    ),
    wall(
      [
        [2.6, -2, 0],
        [2.6, 2, 0],
        [2.6, 2, 3.2],
        [2.6, -2, 3.2],
      ],
      "#d9d9d2"
    ),
    wall(
      [
        [-2.6, -2, 3.2],
        [2.6, -2, 3.2],
        [2.6, 2, 3.2],
        [-2.6, 2, 3.2],
      ],
      "#b4674a"
    ),
  ];

  const edges: EdgeObj[] = [
    {
      id: uid(),
      a: [-7, 0, 0],
      b: [7, 0, 0],
      kind: "guide",
    },
    {
      id: uid(),
      a: [-7, 0, 0],
      b: [7, 0, 0],
      kind: "measure",
      label: "14.000 m",
    },
  ];

  return {
    name: "Studio House",
    faces,
    edges,
    guides: [[0, 0, 0]],
    cam: { yaw: 0.62, pitch: 0.36, dist: 22, target: [0, 0, 1.4] },
  };
}

/* ---------------------------------- storage --------------------------------- */

export interface StoredProject {
  id: string;
  name: string;
  savedAt: number;
  data: Scene;
}

const PROJECTS_KEY = "sketchline.projects.v1";
const AUTOSAVE_KEY = "sketchline.autosave.v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function listProjects(): StoredProject[] {
  if (typeof localStorage === "undefined") return [];
  return safeParse<StoredProject[]>(localStorage.getItem(PROJECTS_KEY), []);
}

export function writeProjects(list: StoredProject[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
}

export function upsertProject(project: StoredProject): StoredProject[] {
  const list = listProjects();
  const idx = list.findIndex((p) => p.id === project.id);
  if (idx >= 0) list[idx] = project;
  else list.unshift(project);
  writeProjects(list);
  return list;
}

export function removeProject(id: string): StoredProject[] {
  const list = listProjects().filter((p) => p.id !== id);
  writeProjects(list);
  return list;
}

export function setAutosave(scene: Scene): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(scene));
  } catch {
    /* quota */
  }
}

export function getAutosave(): Scene | null {
  if (typeof localStorage === "undefined") return null;
  return safeParse<Scene | null>(localStorage.getItem(AUTOSAVE_KEY), null);
}

export function clearAutosave(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(AUTOSAVE_KEY);
}

export function edgeMid(e: EdgeObj): Vec3 {
  return mid(e.a, e.b);
}
