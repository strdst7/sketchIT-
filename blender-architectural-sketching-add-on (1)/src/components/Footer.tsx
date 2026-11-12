import { Mark } from "./ui";

export default function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto max-w-7xl px-6 py-14 sm:px-10">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <Mark className="h-7 w-7" />
            <div>
              <p className="font-mono text-sm font-semibold tracking-[0.22em] text-paper">
                SKETCHLINE
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                Drafted in the open
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-xs tracking-wide text-dim">
            <span>kdmirah lab</span>
            <span aria-hidden="true" className="text-faint">|</span>
            <a
              href="https://aimirah.me"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-wrap items-baseline gap-2 rounded-sm text-paper transition-colors duration-300 hover:text-blend focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blend"
            >
              aimirah
              <span className="text-[10px] text-faint transition-colors duration-300 group-hover:text-blend-soft">
                aimirah.me
              </span>
            </a>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-7 font-mono text-[10px] uppercase tracking-[0.2em] text-faint md:flex-row md:items-center md:justify-between">
          <span>© 2026 Sketchline — Blender add-on</span>
          <span>
            Not affiliated with SketchUp or the Blender Foundation
          </span>
        </div>
      </div>
    </footer>
  );
}
