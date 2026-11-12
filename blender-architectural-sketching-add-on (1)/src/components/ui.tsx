import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHead({
  index,
  label,
  title,
  sub,
}: {
  index: string;
  label: string;
  title: ReactNode;
  sub?: string;
}) {
  return (
    <div className="mb-14 md:mb-20">
      <Reveal>
        <div className="mb-7 flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.35em] text-dim">
          <span className="text-blend">{index}</span>
          <span className="h-px w-12 bg-white/15" />
          <span>{label}</span>
        </div>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 className="max-w-3xl text-4xl font-bold leading-[1.02] tracking-[-0.03em] sm:text-5xl md:text-6xl">
          {title}
        </h2>
      </Reveal>
      {sub && (
        <Reveal delay={0.16}>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-dim">{sub}</p>
        </Reveal>
      )}
    </div>
  );
}

export function Mark({ className = "" }: { className?: string }) {
  return (
    <span className={`relative flex items-center justify-center ${className}`}>
      <span className="absolute h-5 w-5 rotate-45 border border-blend transition-transform duration-500 group-hover:rotate-[135deg]" />
      <span className="h-1.5 w-1.5 rounded-full bg-blend" />
    </span>
  );
}
