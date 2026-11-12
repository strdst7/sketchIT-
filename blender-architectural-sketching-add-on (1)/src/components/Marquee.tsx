import { Diamond } from "lucide-react";

const ITEMS = [
  "Predictive Snapping",
  "Tape Measure",
  "Guide Lines",
  "Guide Points",
  "Protractor",
  "Measurements Box",
  "Inference Engine",
  "Live Playground",
  "Tutorial Film",
  "Non-Modal UX",
];

export default function Marquee() {
  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-ink-2 py-5">
      <div className="flex w-max animate-marquee">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {ITEMS.map((item) => (
              <span
                key={`${copy}-${item}`}
                className="flex items-center gap-8 pr-8 font-mono text-[11px] uppercase tracking-[0.3em] text-dim"
              >
                {item}
                <Diamond
                  className="h-2.5 w-2.5 text-blend"
                  fill="currentColor"
                />
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-ink-2 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-ink-2 to-transparent" />
    </section>
  );
}
