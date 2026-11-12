import { ArrowUpRight } from "lucide-react";
import { Reveal, SectionHead } from "./ui";

const RULES = [
  {
    num: "01",
    title: "Inference before input",
    desc: "The model proposes, you confirm. Snapping is predictive and visible — never reactive, never hidden.",
  },
  {
    num: "02",
    title: "Never break the flow",
    desc: "Zero modal dialogs. Every tool stays live under the cursor until you explicitly commit.",
  },
  {
    num: "03",
    title: "Numbers are optional",
    desc: "Typing is a shortcut, not a requirement. If you can't draw it with the mouse, the tool is wrong.",
  },
  {
    num: "04",
    title: "Guides are geometry",
    desc: "Every guide you draw is a first-class citizen of the scene — snappable, measurable, deletable.",
  },
  {
    num: "05",
    title: "Feedback is honest",
    desc: "Every snap state is announced three ways: color, label, and line. No hidden magic, no surprise vertices.",
  },
  {
    num: "06",
    title: "Blender-native",
    desc: "Operators, keymaps, preferences. It installs the way Blender expects and behaves the way Blender wants.",
  },
];

export default function Codex() {
  return (
    <section id="codex" className="scroll-mt-20 border-t border-white/10 bg-ink-2">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 md:py-36">
        <SectionHead
          index="04"
          label="The Codex"
          title={
            <>
              Six rules the code
              <br />
              is written by.
            </>
          }
          sub="The project codex isn't documentation — it's the spec. Every pull request is judged against these lines before it ships."
        />

        <div className="border-t border-white/10">
          {RULES.map((r, i) => (
            <Reveal key={r.num} delay={i * 0.05}>
              <div className="group grid cursor-default items-baseline gap-2 border-b border-white/10 py-8 transition-colors duration-500 hover:bg-white/[0.03] md:grid-cols-[110px_1fr_1.4fr] md:gap-10 md:py-10">
                <span className="font-mono text-sm tracking-[0.2em] text-faint transition-colors duration-500 group-hover:text-blend">
                  {r.num}
                </span>
                <h3 className="flex items-center gap-3 text-xl font-semibold tracking-tight text-paper transition-transform duration-500 group-hover:translate-x-2 md:text-2xl">
                  {r.title}
                  <ArrowUpRight className="h-4 w-4 text-blend opacity-0 transition-all duration-500 group-hover:opacity-100" />
                </h3>
                <p className="max-w-xl leading-relaxed text-dim">{r.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
