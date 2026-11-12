import { motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import InferenceCanvas from "./InferenceCanvas";

const STATS = [
  { value: "12", label: "Inference types" },
  { value: "06", label: "Tools in the box" },
  { value: "00", label: "Modal dialogs" },
  { value: "4.2+", label: "Blender LTS" },
];

const ease = [0.22, 1, 0.36, 1] as const;

export default function Hero({
  onOpenPlayground,
}: {
  onOpenPlayground: () => void;
}) {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const cx = useTransform(mx, [0, 1], [-16, 16]);
  const cy = useTransform(my, [0, 1], [-12, 12]);

  return (
    <section
      id="top"
      className="relative min-h-screen overflow-hidden"
      onMouseMove={(e) => {
        mx.set(e.clientX / window.innerWidth);
        my.set(e.clientY / window.innerHeight);
      }}
    >
      {/* live inference viewport */}
      <motion.div
        style={{ x: cx, y: cy }}
        className="absolute inset-0 scale-[1.05]"
      >
        <InferenceCanvas className="h-full w-full" />
      </motion.div>

      {/* depth overlays */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/85 via-ink/35 to-ink" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_45%,transparent_0%,rgba(8,9,12,0.5)_100%)]" />

      {/* content */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col justify-end px-6 pb-14 pt-32 sm:px-10 md:pb-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease }}
          className="mb-8 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.35em] text-dim"
        >
          <span className="h-2 w-2 rounded-full bg-blend animate-pulse-dot" />
          Blender add-on — Public alpha v0.3
        </motion.div>

        <h1 className="text-[clamp(3rem,9vw,7.5rem)] font-bold leading-[0.95] tracking-[-0.035em]">
          <motion.span
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.25, ease }}
            className="text-outline block"
          >
            SketchUp-class
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.38, ease }}
            className="block"
          >
            sketching, inside
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.51, ease }}
            className="block"
          >
            <span className="text-blend">Blender.</span>
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.68, ease }}
          className="mt-8 max-w-xl text-lg leading-relaxed text-dim"
        >
          Sketchline ports the inference engine, tape measure, and guide tools
          of a twenty-year architectural workflow into Blender&apos;s viewport —
          predictive snapping, construction geometry, and a measurements box.
          No modal dialogs. No second UI. Just the mouse and a keystroke.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8, ease }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <a
            href="#download"
            className="group flex items-center gap-3 rounded-full bg-blend px-7 py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-ink transition-all duration-300 hover:bg-blend-soft hover:shadow-[0_0_40px_rgba(255,106,0,0.35)]"
          >
            Download the alpha
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
          <button
            onClick={onOpenPlayground}
            className="group flex items-center gap-3 rounded-full border border-blend/50 bg-blend/10 px-7 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-blend-soft transition-all duration-300 hover:border-blend hover:bg-blend/15"
          >
            Try the playground
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
          <a
            href="#tutorial"
            className="group flex items-center gap-3 rounded-full border border-white/15 px-7 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-paper transition-all duration-300 hover:border-white/40 hover:bg-white/5"
          >
            Watch the build
            <ArrowDown className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5" />
          </a>
        </motion.div>

        {/* stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          className="mt-14 grid grid-cols-2 gap-6 border-t border-white/10 pt-7 sm:grid-cols-4"
        >
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-2xl font-bold tracking-tight text-paper md:text-3xl">
                {s.value}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
                {s.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* scroll cue */}
      <motion.a
        href="#features"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 1 }}
        className="absolute bottom-6 right-6 z-10 hidden h-12 w-12 items-center justify-center rounded-full border border-white/15 text-dim transition-colors duration-300 hover:border-blend hover:text-blend md:flex"
        aria-label="Scroll to features"
      >
        <ArrowDown className="h-4 w-4 animate-bounce" />
      </motion.a>
    </section>
  );
}
