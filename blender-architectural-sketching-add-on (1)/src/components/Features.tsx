import {
  Crosshair,
  Gauge,
  Hash,
  Magnet,
  PenLine,
  Ruler,
  Sparkles,
} from "lucide-react";
import { Reveal, SectionHead } from "./ui";

const CHIPS = [
  "Endpoint",
  "Midpoint",
  "On Edge",
  "On Face",
  "Intersection",
  "Parallel",
  "Perpendicular",
  "Angle",
  "Through",
  "Center",
  "Tangent",
  "Guide",
];

const CARDS = [
  {
    icon: Magnet,
    num: "01",
    title: "Predictive Snapping",
    desc: "An inference engine that reads the scene ahead of your cursor — endpoints, midpoints, intersections, parallels — and proposes the exact point before your mouse arrives. Twelve inference types, each announced in its own color.",
    chips: CHIPS,
    span: "lg:col-span-2",
  },
  {
    icon: Ruler,
    num: "02",
    title: "Tape Measure",
    desc: "Click-click to measure anything in the scene. Every measurement converts into a guide line with a single keystroke — no dialog, no commit step.",
    span: "",
  },
  {
    icon: PenLine,
    num: "03",
    title: "Guide Tools",
    desc: "Guide points, guide lines, and guides-through-geometry. Construction geometry that snaps exactly like the real thing, then fades away when you're done.",
    span: "",
  },
  {
    icon: Gauge,
    num: "04",
    title: "Protractor",
    desc: "Live angle readout with inference. Lock to 45°, 90°, or any value while you draw — the engine keeps your geometry honest.",
    span: "",
  },
  {
    icon: Hash,
    num: "05",
    title: "Measurements Box",
    desc: "Type a length, an offset, or a coordinate mid-operation. The box accepts it SketchUp-style — numbers are a shortcut, never a requirement.",
    span: "",
  },
  {
    icon: Sparkles,
    num: "06",
    title: "Premium UX",
    desc: "Non-modal, context-aware, and fast. The interface you need appears under the cursor; everything else stays out of the way.",
    span: "",
  },
];

export default function Features() {
  return (
    <section id="features" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 md:py-36">
        <SectionHead
          index="03"
          label="The Toolbelt"
          title={
            <>
              Six tools.
              <br />
              One inference engine.
            </>
          }
          sub="Every tool shares the same brain. Draw a line, measure a wall, or drop a guide — the viewport reads your intent either way."
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c, i) => (
            <Reveal key={c.num} delay={i * 0.06} className={c.span}>
              <div className="tick-corner group flex h-full flex-col rounded-2xl border border-white/10 bg-ink-2 p-7 transition-all duration-500 hover:-translate-y-1 hover:border-blend/40 hover:bg-ink-3">
                <div className="mb-8 flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-ink text-blend transition-colors duration-500 group-hover:border-blend/40">
                    <c.icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <span className="font-mono text-[11px] tracking-[0.2em] text-faint">
                    /{c.num}
                  </span>
                </div>
                <h3 className="mb-3 text-xl font-semibold tracking-tight text-paper">
                  {c.title}
                </h3>
                <p className="leading-relaxed text-dim">{c.desc}</p>
                {c.chips && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {c.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-dim transition-colors duration-300 group-hover:border-blend/25 group-hover:text-paper"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-white/10 bg-ink-2 px-7 py-5">
            <Crosshair className="h-5 w-5 shrink-0 text-blend" strokeWidth={1.75} />
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-dim">
              Every tool stays live under the cursor —
              <span className="text-paper"> commit with a click, never a dialog</span>
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
