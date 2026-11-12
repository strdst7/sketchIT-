import { useEffect, useRef } from "react";

type Pt = [number, number];
type InfType = "endpoint" | "midpoint" | "onedge" | "onface" | "parallel" | "angle";

interface InfEvent {
  t: number;
  type: InfType;
  target: Pt; // normalized 0..1
  label: string;
}

interface Stroke {
  from: Pt;
  to: Pt;
  lengthLabel: string;
  events: InfEvent[];
}

const RECT = { x0: 0.3, y0: 0.24, x1: 0.7, y1: 0.64 };

const STROKES: Stroke[] = [
  {
    from: [0.08, 0.52],
    to: [0.92, 0.52],
    lengthLabel: "6.40 m",
    events: [
      { t: 0.24, type: "onedge", target: [0.3, 0.52], label: "On Edge" },
      { t: 0.5, type: "onface", target: [0.5, 0.52], label: "On Face" },
      { t: 0.76, type: "onedge", target: [0.7, 0.52], label: "On Edge" },
    ],
  },
  {
    from: [0.5, 0.52],
    to: [0.5, 0.08],
    lengthLabel: "4.80 m",
    events: [
      { t: 0.05, type: "onedge", target: [0.5, 0.52], label: "On Edge" },
      { t: 0.4, type: "midpoint", target: [0.5, 0.24], label: "Midpoint" },
      { t: 0.72, type: "parallel", target: [0.3, 0.4], label: "Parallel" },
    ],
  },
  {
    from: [0.3, 0.64],
    to: [0.66, 0.9],
    lengthLabel: "4.90 m",
    events: [
      { t: 0.04, type: "endpoint", target: [0.3, 0.64], label: "Endpoint" },
      { t: 0.55, type: "angle", target: [0.66, 0.64], label: "Angle" },
    ],
  },
  {
    from: [0.66, 0.9],
    to: [0.66, 0.12],
    lengthLabel: "8.64 m",
    events: [{ t: 0.32, type: "parallel", target: [0.7, 0.5], label: "Parallel" }],
  },
];

const INF_COLORS: Record<InfType, string> = {
  endpoint: "#ff5c5c",
  midpoint: "#5ea0ff",
  onedge: "#2dd4ee",
  onface: "#3ddc97",
  parallel: "#f472b6",
  angle: "#f472b6",
};

const STROKE_DUR = 2600;
const GAP = 850;
const END_PAUSE = 1500;
const FADE = 700;
const LOOP = STROKES.length * STROKE_DUR + (STROKES.length - 1) * GAP + END_PAUSE;

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function InferenceCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const start = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const map = (p: Pt): Pt => [p[0] * w, p[1] * h];
    const lerp = (a: Pt, b: Pt, t: number): Pt => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
    ];

    const pill = (
      x: number,
      y: number,
      text: string,
      color: string,
      opts: { border?: boolean; textColor?: string } = {}
    ) => {
      ctx.font = '500 11px "JetBrains Mono", monospace';
      const tw = ctx.measureText(text).width;
      const padX = 10;
      const pw = tw + padX * 2;
      const ph = 22;
      const rx = Math.min(Math.max(x - pw / 2, 4), w - pw - 4);
      const ry = Math.min(Math.max(y - ph / 2, 4), h - ph - 4);
      ctx.beginPath();
      roundRectPath(ctx, rx, ry, pw, ph, 6);
      ctx.fillStyle = "rgba(10,12,16,0.92)";
      ctx.fill();
      if (opts.border !== false) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = opts.textColor ?? color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, rx + pw / 2, ry + ph / 2 + 0.5);
    };

    const drawGrid = () => {
      const minor = 26;
      const major = 130;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(139,149,165,0.05)";
      ctx.beginPath();
      for (let x = 0.5; x < w; x += minor) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0.5; y < h; y += minor) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(139,149,165,0.1)";
      ctx.beginPath();
      for (let x = 0.5; x < w; x += major) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0.5; y < h; y += major) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    };

    const drawRect = () => {
      const rx = RECT.x0 * w;
      const ry = RECT.y0 * h;
      const rw = (RECT.x1 - RECT.x0) * w;
      const rh = (RECT.y1 - RECT.y0) * h;
      ctx.fillStyle = "rgba(233,237,242,0.025)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = "rgba(233,237,242,0.28)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, ry, rw, rh);
      // corner endpoints
      ctx.fillStyle = "rgba(233,237,242,0.55)";
      (
        [
          [rx, ry],
          [rx + rw, ry],
          [rx + rw, ry + rh],
          [rx, ry + rh],
        ] as Pt[]
      ).forEach(([x, y]) => ctx.fillRect(x - 2.5, y - 2.5, 5, 5));
      // edge midpoint hints
      ctx.fillStyle = "rgba(94,160,255,0.4)";
      (
        [
          [rx + rw / 2, ry],
          [rx + rw / 2, ry + rh],
          [rx, ry + rh / 2],
          [rx + rw, ry + rh / 2],
        ] as Pt[]
      ).forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const drawStroke = (s: Stroke, to: Pt, alpha: number) => {
      const a = map(s.from);
      const b = map(to);
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.strokeStyle = "#e9edf2";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(255,106,0,0.5)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "rgba(233,237,242,0.9)";
      ctx.beginPath();
      ctx.arc(a[0], a[1], 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawInference = (s: Stroke, ev: InfEvent, pos: Pt) => {
      const color = INF_COLORS[ev.type];
      const fromPx = map(s.from);
      const targetPx = map(ev.target);

      if (ev.type === "onface") {
        const rx = RECT.x0 * w;
        const ry = RECT.y0 * h;
        const rw = (RECT.x1 - RECT.x0) * w;
        const rh = (RECT.y1 - RECT.y0) * h;
        ctx.fillStyle = "rgba(61,220,151,0.07)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "rgba(61,220,151,0.55)";
        ctx.lineWidth = 1;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
      }

      // inference line
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      if (ev.type === "angle") {
        ctx.moveTo(fromPx[0], fromPx[1]);
        ctx.lineTo(pos[0], fromPx[1]);
      } else {
        ctx.moveTo(pos[0], pos[1]);
        ctx.lineTo(targetPx[0], targetPx[1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // target marker
      if (ev.type === "angle") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(fromPx[0], fromPx[1], 16, 0, Math.PI / 2);
        ctx.stroke();
      } else if (ev.type === "onface") {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pos[0], pos[1], 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(targetPx[0], targetPx[1]);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = color;
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      }

      // tooltip
      let label = ev.label;
      if (ev.type === "angle") {
        const deg = Math.round(
          (Math.atan2(pos[1] - fromPx[1], pos[0] - fromPx[0]) * 180) / Math.PI
        );
        label = `${deg}°`;
      }
      pill(pos[0] + 22, pos[1] - 32, label, color);
    };

    const drawCursor = (pos: Pt) => {
      ctx.strokeStyle = "rgba(233,237,242,0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pos[0] - 11, pos[1]);
      ctx.lineTo(pos[0] - 4, pos[1]);
      ctx.moveTo(pos[0] + 4, pos[1]);
      ctx.lineTo(pos[0] + 11, pos[1]);
      ctx.moveTo(pos[0], pos[1] - 11);
      ctx.lineTo(pos[0], pos[1] - 4);
      ctx.moveTo(pos[0], pos[1] + 4);
      ctx.lineTo(pos[0], pos[1] + 11);
      ctx.stroke();
      // Blender 3D-cursor ring
      ctx.strokeStyle = "#ff6a00";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pos[0], pos[1], 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ff6a00";
      ctx.beginPath();
      ctx.arc(pos[0], pos[1], 1.5, 0, Math.PI * 2);
      ctx.fill();
    };

    const frame = (now: number) => {
      const t = (now - start) % LOOP;
      const fade = Math.max(0, Math.min(1, t / FADE, (LOOP - t) / FADE));

      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = fade;
      drawGrid();
      drawRect();

      // locate active stroke
      let acc = 0;
      let activeIdx = STROKES.length;
      let p = 1;
      for (let i = 0; i < STROKES.length; i++) {
        if (t < acc + STROKE_DUR) {
          activeIdx = i;
          p = (t - acc) / STROKE_DUR;
          break;
        }
        acc += STROKE_DUR;
        if (t < acc + GAP) {
          activeIdx = i;
          p = 1;
          break;
        }
        acc += GAP;
      }

      // completed strokes
      for (let i = 0; i < Math.min(activeIdx, STROKES.length); i++) {
        drawStroke(STROKES[i], STROKES[i].to, 0.55);
      }

      if (activeIdx < STROKES.length) {
        const s = STROKES[activeIdx];
        let pos: Pt = lerp(s.from, s.to, p);
        let ev: InfEvent | null = null;
        for (const e of s.events) {
          if (p >= e.t - 0.07 && p <= e.t + 0.03) ev = e;
        }
        if (ev) pos = map(ev.target); // snap to the inferred point
        drawStroke(s, pos, 1);
        if (ev) drawInference(s, ev, pos);
        drawCursor(pos);
        if (p > 0.03) {
          pill(pos[0] + 22, pos[1] + 34, s.lengthLabel, "#ffb020", {
            border: false,
            textColor: "#e9edf2",
          });
        }
      } else {
        drawCursor(map(STROKES[STROKES.length - 1].to));
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
