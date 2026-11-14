# Sketchline

SketchUp-class architectural sketching for Blender — predictive snapping, tape measure, guides and a protractor, delivered as a non-modal Blender add-on, with a browser playground that runs the same inference engine today.

[![Live](https://img.shields.io/badge/live-sketchit--kdmirah.vercel.app-ff6a00?style=flat-square)](https://sketchit-kdmirah.vercel.app)
[![Status](https://img.shields.io/badge/status-public%20alpha%20v0.3-informational?style=flat-square)](#roadmap)
[![Blender](https://img.shields.io/badge/blender-4.2%20LTS%2B-265787?style=flat-square&logo=blender&logoColor=white)](#requirements)
[![React](https://img.shields.io/badge/react-19.2-61dafb?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/vite-7.3-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind](https://img.shields.io/badge/tailwind-4.1-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/license-not%20yet%20specified-lightgrey?style=flat-square)](#license)

---

## What this repository is

This repository holds two things:

| Path | What it is |
| --- | --- |
| `blender-architectural-sketching-add-on (1)/` | A React + Vite + TypeScript marketing site and a fully working browser playground. This is the code in this repo. |
| *(not in this repo)* | The Blender Python add-on itself. The site describes it; the add-on source does not live here yet. |

The deployed site is the single-file build of the playground app: `npm run build` produces one self-contained `dist/index.html` (518 kB, 159 kB gzipped) with no external requests.

**Live:** https://sketchit-kdmirah.vercel.app

## The playground

The site is not a mock-up. The Playground section boots a real 3D editor that reimplements Sketchline's inference rules in the browser. Everything runs client-side — no account, no server, no upload, no watermark.

### Tools

| Tool | Key | Behaviour |
| --- | --- | --- |
| Select | `B` | Click a face or edge. Drag to move it in the view plane. |
| Line | `L` | Click point to point. `Z` locks the blue axis, typing sets a length. Click the first point to close a face. |
| Face | `R` | Click two corners. If the second corner is higher — on a wall — the face stands up. |
| Push/Pull | `E` | Click a face, pull, click again — or type a distance and press Enter. |
| Tape | `T` | Click two points to measure. Measurements render dashed. |
| Guide | `G` | Click for a guide point, drag for a guide line. |
| Protractor | `P` | Click an origin, then a direction. Angles snap parallel or perpendicular. |
| Orbit | `O` | Drag to orbit. Right-drag pans, wheel zooms. |

### Inference engine

The engine reads the whole scene and proposes the best candidate for the cursor before the mouse arrives. Each inference type has its own colour and is individually toggleable in the sidebar.

| Inference | Notes |
| --- | --- |
| Endpoint | Polyline vertices |
| Midpoint | Segment midpoints |
| Face Center | Centroid of a face |
| Intersection | Edge crossings and surface hits |
| On Edge | Constrained to an existing edge |
| Guide Point | Placed guide points |
| On Face | Constrained to the face plane |
| Grid 0.5 m | Quantised grid snapping |
| Parallel / Perp | Directional lock, tolerance 3.5° |

Default capture radius is **15 px**, adjustable in the panel. Snapping is predictive and visible: every state is announced three ways — colour, label, and line. There are no hidden vertices.

### Camera and navigation

- Orbit: `O` tool, `Alt`+drag, or middle-mouse drag
- Pan: right-drag
- Zoom: wheel
- `Z` locks the blue axis. `Shift` takes an axis lock.
- `F` frames all. `H` hides guides and measurements. `M` opens the measurements box.
- `Del` / `Backspace` deletes the selection. `Ctrl`/`Cmd`+`Z` undoes, `Ctrl`/`Cmd`+`Y` redoes, `Ctrl`/`Cmd`+`S` saves.

### Measurements box

Type a length, an offset, or a coordinate mid-operation. Numbers are a shortcut, never a requirement — if you cannot draw it with the mouse, the tool is wrong.

### Saving, import, and export

| Format | What it does |
| --- | --- |
| Project file (`.json`) | Re-importable scene — geometry, guides, camera. |
| Standalone page (`.html`) | One self-contained file with the model inside, including its own copy of the BSP depth sort. Host it anywhere. |
| Embed snippet | An `<iframe srcdoc>` you can paste into any site or README. |

Saved projects and the autosave live in browser `localStorage` (`sketchline.projects.v1`, `sketchline.autosave.v1`). Clearing site data removes them.

### Tutorial film

The Tutorial section renders a scripted 6-chapter build of a cabin — layout, footprint, walls, roof, openings, finish — on canvas. Every scripted move is resolved through the same engine the editor uses, so the film can only show what the editor actually does. You can scrub it, change playback speed, go fullscreen, and record it to `.webm` / `.mp4` via `MediaRecorder`.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | React 19.2 |
| Build | Vite 7.3, `vite-plugin-singlefile` |
| Language | TypeScript 5.9 |
| Styling | Tailwind CSS 4.1 (`@tailwindcss/vite`) |
| Motion | `framer-motion` 14 |
| Icons | `lucide-react` |
| Utilities | `clsx`, `tailwind-merge` |

There is no 3D library. The viewport, projection, clipping, depth sort, picking, and shading are hand-written against the 2D canvas API.

## Getting started

Requires Node.js 20 or newer.

```bash
cd "blender-architectural-sketching-add-on (1)"
npm install
npm run dev       # dev server with HMR
npm run build     # single-file dist/index.html
npm run preview   # serve the production build
```

Note the directory name contains a space and a `(1)` suffix. Quote it in your shell.

### Project layout

```
blender-architectural-sketching-add-on (1)/
├── index.html              # shell, fonts, meta
├── vite.config.ts          # react + tailwind + singlefile
├── src/
│   ├── App.tsx             # site/playground view switch
│   ├── components/         # marketing sections (Hero, Features, Tutorial, …)
│   ├── playground/
│   │   ├── Editor.tsx      # the editor: tools, keymap, panels, modals
│   │   ├── geometry.ts     # inference engine, picking, direction locks
│   │   ├── ops.ts          # tool operations shared by editor and film
│   │   ├── camera.ts       # basis, projection, near clipping, screen rays
│   │   ├── render.ts       # scene raster, overlay, gizmo, shading
│   │   ├── scene.ts        # scene model, palette, localStorage persistence
│   │   ├── standalone.ts   # standalone HTML and iframe export
│   │   └── vec.ts          # vector maths
│   └── tutorial/
│       └── film.ts         # scripted build, frame solver, canvas drawing
└── tsconfig.json
```

## Requirements

- Blender 4.2 LTS or newer for the add-on
- Windows, macOS, or Linux
- 2.1 MB add-on, zero runtime dependencies
- For the playground: any modern browser with canvas 2D. Recording needs `MediaRecorder` — Chrome, Edge, and Firefox support it; Safari does not.

## Codex

Six rules the code is written by. They are the spec, not documentation — changes are judged against them.

1. **Inference before input.** The model proposes, you confirm. Snapping is predictive and visible.
2. **Never break the flow.** Zero modal dialogs during drawing. Every tool stays live under the cursor until you commit.
3. **Numbers are optional.** Typing is a shortcut, not a requirement.
4. **Guides are geometry.** Every guide is a first-class scene object — snappable, measurable, deletable.
5. **Feedback is honest.** Every snap state is announced by colour, label, and line.
6. **Blender-native.** Operators, keymaps, preferences. It installs and behaves the way Blender expects.

## Roadmap

| Version | Name | Status | Scope |
| --- | --- | --- | --- |
| v0.1 | First Light | Shipped (Q4 2025) | Core inference engine — endpoint, midpoint, on-edge, intersection snapping, tooltip system. |
| v0.2 | Measure Twice | Shipped (Q1 2026) | Tape measure, guide point and guide line tools. Construction geometry becomes first-class. |
| v0.3 | Square One | In progress | Protractor, parallel and perpendicular inference, measurements box, keymap polish. |
| v0.4 | Public Alpha | Upcoming (Q2 2026) | Performance pass on dense scenes, preferences panel, full documentation. |
| v1.0 | Open Lines | Upcoming (Q3 2026) | Full release on Blender 4.3+, asset-library packaging, guide-through-geometry. |

Dates are targets, not commitments. The in-app status chips are the source of truth for what has shipped.

## Contributing

Issues and pull requests are welcome. Before opening a PR against the playground:

1. `npm run build` must pass.
2. Keep the Codex rules above. A change that adds a modal dialog mid-operation will be sent back.
3. Do not modify the inference colours or the capture radius default without a stated reason — they are load-bearing for muscle memory.

## Disclaimer

Sketchline is an independent project. It is **not affiliated with SketchUp, Trimble, or the Blender Foundation**. "SketchUp" is referenced only to describe the workflow being brought to Blender.

## License
MIT
---

Built by [kdmirah lab](https://aimirah.me).
