import { Check, Download as DownloadIcon } from "lucide-react";
import { Reveal, SectionHead } from "./ui";

const STEPS = [
  { n: "01", text: "Download sketchline-0.3.zip (2.1 MB)" },
  { n: "02", text: "Blender → Edit → Preferences → Add-ons → Install…" },
  { n: "03", text: "Enable “Sketchline” — keymaps appear under “Sketchline”" },
];

const KEYMAPS = [
  { key: "G", label: "Guide tool" },
  { key: "T", label: "Tape measure" },
  { key: "P", label: "Protractor" },
  { key: "M", label: "Measurements box" },
];

const REQS = [
  "Blender 4.2 LTS or newer",
  "Windows, macOS, Linux",
  "2.1 MB · zero dependencies",
  "Free throughout the alpha",
];

export default function Download({
  onOpenPlayground,
}: {
  onOpenPlayground: () => void;
}) {
  return (
    <section id="download" className="scroll-mt-20 border-t border-white/10 bg-ink-2">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 md:py-36">
        <SectionHead
          index="06"
          label="Get It"
          title={
            <>
              Get the alpha.
              <br />
              Draw like it&apos;s 2005.
            </>
          }
          sub="Free throughout the alpha. No tracker, no telemetry — just a .zip and a keymap."
        />

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          {/* left: pitch + requirements */}
          <div>
            <Reveal>
              <p className="mb-8 max-w-lg text-lg leading-relaxed text-dim">
                Sketchline is a single-file add-on. It installs in seconds,
                lives in Blender&apos;s keymap, and never asks you to leave
                the viewport. If you can sketch a room in SketchUp, you can
                sketch it here.
              </p>
            </Reveal>

            <Reveal delay={0.1}>
              <ul className="mb-10 space-y-3">
                {REQS.map((r) => (
                  <li key={r} className="flex items-center gap-3 text-dim">
                    <Check className="h-4 w-4 shrink-0 text-inf-green" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.12}>
              <p className="mb-8 border-l-2 border-blend/50 pl-4 font-mono text-[11px] leading-relaxed text-dim">
                Not ready to install anything? The playground runs the same
                inference engine in your browser — model, save, and export a
                project for free.
              </p>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#download"
                  onClick={(e) => e.preventDefault()}
                  className="group flex items-center gap-3 rounded-full bg-blend px-8 py-4 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-ink transition-all duration-300 hover:bg-blend-soft hover:shadow-[0_0_50px_rgba(255,106,0,0.4)]"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Download v0.3
                </a>
                <button
                  onClick={onOpenPlayground}
                  className="group flex items-center gap-3 rounded-full border border-white/15 px-8 py-4 font-mono text-xs uppercase tracking-[0.2em] text-paper transition-all duration-300 hover:border-blend/50 hover:bg-blend/10 hover:text-blend-soft"
                >
                  Try the playground
                </button>
              </div>
            </Reveal>
          </div>

          {/* right: install card */}
          <Reveal delay={0.15}>
            <div className="tick-corner rounded-2xl border border-white/10 bg-ink p-7">
              <div className="mb-6 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-inf-red/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-inf-amber/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-inf-green/60" />
                <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
                  install — 3 steps
                </span>
              </div>

              <div className="space-y-5">
                {STEPS.map((s) => (
                  <div key={s.n} className="flex items-start gap-4">
                    <span className="mt-0.5 font-mono text-xs text-blend">
                      {s.n}
                    </span>
                    <p className="font-mono text-sm leading-relaxed text-paper">
                      {s.text}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 border-t border-white/10 pt-6">
                <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
                  default keymaps
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {KEYMAPS.map((k) => (
                    <div
                      key={k.key}
                      className="flex items-center gap-3 rounded-lg border border-white/10 bg-ink-2 px-4 py-3 transition-colors duration-300 hover:border-blend/30"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blend/15 font-mono text-sm font-semibold text-blend-soft">
                        {k.key}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-dim">
                        {k.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
