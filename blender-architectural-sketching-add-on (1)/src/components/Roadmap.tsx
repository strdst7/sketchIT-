import { Check, CircleDot } from "lucide-react";
import { Reveal, SectionHead } from "./ui";

type Status = "shipped" | "progress" | "upcoming";

const STATUS_STYLE: Record<
  Status,
  { label: string; chip: string; dot: string }
> = {
  shipped: {
    label: "Shipped",
    chip: "border-inf-green/30 bg-inf-green/10 text-inf-green",
    dot: "bg-inf-green",
  },
  progress: {
    label: "In progress",
    chip: "border-blend/40 bg-blend/10 text-blend-soft",
    dot: "bg-blend animate-pulse-dot",
  },
  upcoming: {
    label: "Upcoming",
    chip: "border-white/15 bg-white/5 text-dim",
    dot: "bg-faint",
  },
};

const PHASES = [
  {
    version: "v0.1",
    name: "First Light",
    date: "Q4 2025",
    status: "shipped" as Status,
    desc: "Core inference engine — endpoint, midpoint, on-edge, and intersection snapping with the full tooltip system.",
  },
  {
    version: "v0.2",
    name: "Measure Twice",
    date: "Q1 2026",
    status: "shipped" as Status,
    desc: "Tape measure plus guide point and guide line tools. Construction geometry becomes first-class.",
  },
  {
    version: "v0.3",
    name: "Square One",
    date: "Now",
    status: "progress" as Status,
    desc: "Protractor, parallel & perpendicular inference, the measurements box, and keymap polish. This is the build you're looking at.",
  },
  {
    version: "v0.4",
    name: "Public Alpha",
    date: "Q2 2026",
    status: "upcoming" as Status,
    desc: "Performance pass on dense scenes, preferences panel, and full documentation.",
  },
  {
    version: "v1.0",
    name: "Open Lines",
    date: "Q3 2026",
    status: "upcoming" as Status,
    desc: "Full release on Blender 4.3+, asset-library packaging, and the guide-through-geometry tool.",
  },
];

export default function Roadmap() {
  return (
    <section id="roadmap" className="scroll-mt-20 border-t border-white/10">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 md:py-36">
        <SectionHead
          index="05"
          label="The Schedule"
          title={
            <>
              Built in the open,
              <br />
              on a schedule.
            </>
          }
          sub="No vaporware. Each phase ships as a working .zip the day it lands — the codex above is the only scope creep allowed."
        />

        <div className="relative">
          <div className="absolute bottom-4 left-[7px] top-4 w-px bg-white/10 md:left-[9px]" />
          <div className="space-y-2">
            {PHASES.map((p, i) => {
              const s = STATUS_STYLE[p.status];
              return (
                <Reveal key={p.version} delay={i * 0.06}>
                  <div className="group relative grid gap-3 py-7 pl-10 transition-colors duration-500 hover:bg-white/[0.03] md:grid-cols-[180px_1fr] md:gap-12 md:pl-14 md:pr-8">
                    <span
                      className={`absolute left-0 top-9 h-[15px] w-[15px] rounded-full border-2 border-ink md:h-[19px] md:w-[19px] ${s.dot}`}
                    />
                    <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-2">
                      <span className="font-mono text-lg font-semibold tracking-wider text-paper">
                        {p.version}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
                        {p.date}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-4">
                          <h3 className="text-xl font-semibold tracking-tight text-paper md:text-2xl">
                            {p.name}
                          </h3>
                          <span
                            className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] ${s.chip}`}
                          >
                            {p.status === "shipped" ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <CircleDot className="h-3 w-3" />
                            )}
                            {s.label}
                          </span>
                        </div>
                        <p className="max-w-2xl leading-relaxed text-dim">
                          {p.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
