import {
  ArrowUpRight,
  Download,
  FileDown,
  Hammer,
  Save,
  ShieldCheck,
} from "lucide-react";
import PlaygroundPreview from "./PlaygroundPreview";
import { Reveal, SectionHead } from "./ui";

const CAPABILITIES = [
  {
    icon: Hammer,
    title: "Real geometry",
    desc: "Faces, edges, guides and measurements — modelled live in a 3D viewport, not a mock-up.",
  },
  {
    icon: ShieldCheck,
    title: "Local & free",
    desc: "Everything runs in your browser. No account, no server, no upload, no watermark.",
  },
  {
    icon: Save,
    title: "Save projects",
    desc: "Keep a library of your own scenes in the browser, re-openable in one click.",
  },
  {
    icon: FileDown,
    title: "Embed anywhere",
    desc: "Export a standalone .html with the model inside, or paste an iframe into any site.",
  },
];

export default function Playground({
  onOpen,
}: {
  onOpen: () => void;
}) {
  return (
    <section id="playground" className="scroll-mt-20 border-t border-white/10">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 md:py-36">
        <SectionHead
          index="01"
          label="The Playground"
          title={
            <>
              Not a video.
              <br />
              An actual editor.
            </>
          }
          sub="Sketchline's inference rules, rebuilt for the browser: the same snapping behaviour the Blender add-on is being built around. Model something, save it, and take it with you."
        />

        <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.title} delay={i * 0.07}>
                <div className="group flex gap-4 border-b border-white/10 py-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-ink-2 text-blend transition-colors duration-500 group-hover:border-blend/40">
                    <c.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h3 className="mb-1.5 text-base font-semibold tracking-tight text-paper">
                      {c.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-dim">{c.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}

            <Reveal delay={0.3}>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  onClick={onOpen}
                  className="group flex items-center gap-3 rounded-full bg-blend px-7 py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-ink transition-all duration-300 hover:bg-blend-soft hover:shadow-[0_0_40px_rgba(255,106,0,0.35)]"
                >
                  Open the playground
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
                  free · no install · no signup
                </span>
              </div>
            </Reveal>
          </div>

          {/* blender-ish window chrome */}
          <Reveal delay={0.12}>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#12151b] shadow-2xl shadow-black/50">
              <div className="flex items-center gap-2 border-b border-white/10 bg-[#171a21] px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-inf-red/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-inf-amber/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-inf-green/60" />
                <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
                  sketchline · layout
                </span>
                <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-faint">
                  <Download className="h-3 w-3" />
                  free
                </span>
              </div>

              <div className="flex">
                {/* fake toolbar */}
                <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-white/10 py-3">
                  {[
                    "M2 7l6-5 6 5v9H2z",
                    "M3 17h10",
                    "M3 12h10",
                    "M6 7v10",
                    "M2 20h14",
                    "M9 2v4",
                  ].map((d, i) => (
                    <span
                      key={i}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        i === 1 ? "bg-blend/18 ring-1 ring-blend/50" : ""
                      }`}
                    >
                      <svg
                        viewBox="0 0 18 22"
                        className={`h-4 w-4 ${
                          i === 1 ? "text-blend-soft" : "text-faint"
                        }`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.6}
                      >
                        <path d={d} />
                      </svg>
                    </span>
                  ))}
                </div>

                {/* live viewport */}
                <div className="relative min-w-0 flex-1">
                  <PlaygroundPreview className="h-[330px] w-full sm:h-[380px]" />
                  <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-blend-soft">
                    Line
                  </div>
                  <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-dim">
                    <span className="h-1.5 w-1.5 rounded-full bg-inf-cyan" />
                    On Edge
                  </div>
                </div>

                {/* fake properties */}
                <div className="hidden w-44 shrink-0 border-l border-white/10 p-3 sm:block">
                  {[
                    { l: "Faces", v: "6" },
                    { l: "Guides", v: "2" },
                    { l: "Measures", v: "1" },
                  ].map((r) => (
                    <div
                      key={r.l}
                      className="mb-2 flex items-center justify-between font-mono text-[10px]"
                    >
                      <span className="text-faint">{r.l}</span>
                      <span className="text-paper">{r.v}</span>
                    </div>
                  ))}
                  <div className="my-3 h-px bg-white/10" />
                  {[
                    { l: "Endpoint", c: "#ff5c5c" },
                    { l: "Midpoint", c: "#5ea0ff" },
                    { l: "On Edge", c: "#2dd4ee" },
                    { l: "Parallel", c: "#f472b6" },
                  ].map((r) => (
                    <div key={r.l} className="mb-2 flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: r.c }}
                      />
                      <span className="font-mono text-[10px] text-dim">{r.l}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4 border-t border-white/10 bg-[#171a21] px-4 py-2 font-mono text-[10px] text-faint">
                <span className="text-blend-soft">On Edge</span>
                <span>12 objects</span>
                <span className="ml-auto">60 fps</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
