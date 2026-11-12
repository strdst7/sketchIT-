import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Mark } from "./ui";

const LINKS = [
  { href: "#playground", label: "Playground" },
  { href: "#tutorial", label: "Film" },
  { href: "#features", label: "Toolbelt" },
  { href: "#codex", label: "Codex" },
  { href: "#roadmap", label: "Schedule" },
  { href: "#download", label: "Download" },
];

export default function Nav({
  onOpenPlayground,
}: {
  onOpenPlayground: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "border-b border-white/10 bg-ink/80 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-10">
        <a href="#top" className="group flex items-center gap-3">
          <Mark className="h-7 w-7" />
          <span className="font-mono text-sm font-semibold tracking-[0.22em] text-paper">
            SKETCHLINE
          </span>
          <span className="font-mono text-[10px] tracking-widest text-faint">
            /BL
          </span>
        </a>

        <div className="hidden items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="font-mono text-[11px] uppercase tracking-[0.25em] text-dim transition-colors duration-300 hover:text-paper"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenPlayground}
            className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-paper transition-all duration-300 hover:border-blend/50 hover:bg-blend/10 hover:text-blend-soft"
          >
            Open editor
          </button>
          <a
            href="#download"
            className="group hidden items-center gap-2 rounded-full border border-blend/50 bg-blend/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-blend-soft transition-all duration-300 hover:bg-blend hover:text-ink sm:flex"
          >
            Get the add-on
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </nav>
    </header>
  );
}
