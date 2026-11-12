import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Download,
  FolderOpen,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import type { Scene } from "../playground/scene";
import {
  CHAPTERS,
  DURATION,
  H,
  POSTER_T,
  STATS,
  W,
  cabinScene,
  drawFrame,
  frameAt,
  sceneAt,
} from "../tutorial/film";
import { Reveal, SectionHead } from "./ui";

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const SPEEDS = [1, 1.5, 2, 0.5];
const MIMES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

interface RecJob {
  rec: MediaRecorder;
  chunks: Blob[];
  cancelled: boolean;
  stopping: boolean;
}

export default function Tutorial({
  onOpenScene,
}: {
  onOpenScene: (scene: Scene) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(POSTER_T);
  const playingRef = useRef(false);
  const startedRef = useRef(false);
  const speedRef = useRef(1);
  const dirtyRef = useRef(true);
  const recRef = useRef<RecJob | null>(null);

  const [time, setTime] = useState(POSTER_T);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fs, setFs] = useState(false);
  const [recPct, setRecPct] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* ------------------------------- render loop ------------------------------- */

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let ui = 0;

    const paint = () => {
      const cvs = canvasRef.current;
      const ctx = cvs?.getContext("2d");
      if (!cvs || !ctx) return;
      ctx.setTransform(cvs.width / W, 0, 0, cvs.height / H, 0, 0);
      drawFrame(ctx, tRef.current);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (playingRef.current) {
        tRef.current = Math.min(DURATION, tRef.current + dt * speedRef.current);
        dirtyRef.current = true;
        if (tRef.current >= DURATION) {
          playingRef.current = false;
          setPlaying(false);
          const job = recRef.current;
          if (job && !job.stopping) {
            job.stopping = true;
            window.setTimeout(() => {
              if (job.rec.state !== "inactive") job.rec.stop();
            }, 600);
          }
        }
      }

      // while recording, keep feeding frames so the capture never stalls
      if (dirtyRef.current || recRef.current) {
        paint();
        dirtyRef.current = false;
      }

      ui += dt;
      if (ui > 0.1) {
        ui = 0;
        setTime(tRef.current);
        if (recRef.current) setRecPct(tRef.current / DURATION);
      }
    };
    raf = requestAnimationFrame(loop);

    // repaint the poster once the web fonts have arrived
    document.fonts?.ready.then(() => {
      dirtyRef.current = true;
    });

    return () => {
      cancelAnimationFrame(raf);
      const job = recRef.current;
      if (job) {
        job.cancelled = true;
        if (job.rec.state !== "inactive") job.rec.stop();
      }
    };
  }, []);

  useEffect(() => {
    const onFs = () => {
      setFs(document.fullscreenElement === wrapRef.current);
      dirtyRef.current = true;
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // don't keep playing to nobody
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && playingRef.current && !recRef.current) {
          playingRef.current = false;
          setPlaying(false);
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* --------------------------------- controls -------------------------------- */

  const begin = () => {
    startedRef.current = true;
    setStarted(true);
  };

  const toggle = useCallback(() => {
    if (recRef.current) return;
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
    } else {
      if (!startedRef.current || tRef.current >= DURATION - 0.05) {
        tRef.current = 0;
      }
      begin();
      playingRef.current = true;
      setPlaying(true);
    }
    dirtyRef.current = true;
  }, []);

  const seek = useCallback((t: number, play = false) => {
    if (recRef.current) return;
    tRef.current = Math.max(0, Math.min(DURATION, t));
    begin();
    setTime(tRef.current);
    dirtyRef.current = true;
    if (play) {
      playingRef.current = true;
      setPlaying(true);
    }
  }, []);

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    speedRef.current = next;
    setSpeed(next);
  };

  const toggleFs = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (el.requestFullscreen) {
      void el.requestFullscreen();
    } else {
      setNotice("Fullscreen isn't available in this browser.");
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (e.key === " " || e.key.toLowerCase() === "k") {
      if (tag === "BUTTON") return;
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      seek(tRef.current + 5);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      seek(tRef.current - 5);
    } else if (e.key.toLowerCase() === "f") {
      toggleFs();
    }
  };

  /* --------------------------------- export ---------------------------------- */

  const startExport = () => {
    const cvs = canvasRef.current;
    if (!cvs || recRef.current) return;
    const supported =
      typeof MediaRecorder !== "undefined" &&
      typeof cvs.captureStream === "function";
    const mime = supported
      ? MIMES.find((m) => MediaRecorder.isTypeSupported(m))
      : undefined;
    if (!mime) {
      setNotice(
        "This browser can't record a canvas to video. Chrome, Edge and Firefox can."
      );
      return;
    }

    const stream = cvs.captureStream(30);
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 8_000_000,
      });
    } catch {
      setNotice("The recorder couldn't start in this browser.");
      return;
    }
    const job: RecJob = { rec, chunks: [], cancelled: false, stopping: false };
    rec.ondataavailable = (e) => {
      if (e.data.size) job.chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      setRecPct(null);
      if (job.cancelled) {
        setNotice("Recording cancelled.");
        return;
      }
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(job.chunks, { type: mime.split(";")[0] });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sketchline-cabin-tutorial.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setNotice(
        `Saved sketchline-cabin-tutorial.${ext} (${(blob.size / 1e6).toFixed(
          1
        )} MB) to your downloads.`
      );
    };

    recRef.current = job;
    tRef.current = 0;
    speedRef.current = 1;
    setSpeed(1);
    begin();
    setRecPct(0);
    setNotice(null);
    playingRef.current = true;
    setPlaying(true);
    rec.start(500);
  };

  const cancelExport = () => {
    const job = recRef.current;
    if (!job) return;
    job.cancelled = true;
    playingRef.current = false;
    setPlaying(false);
    if (job.rec.state !== "inactive") job.rec.stop();
  };

  /* ---------------------------------- derived -------------------------------- */

  const shown = started ? time : 0;
  const pct = (shown / DURATION) * 100;
  const recording = recPct !== null;
  const activeChapter = started
    ? CHAPTERS.findIndex((c) => shown >= c.start && shown < c.end)
    : -1;
  const caption = started ? frameAt(shown).state.caption : "";
  const ended = started && shown >= DURATION - 0.05;

  const iconBtn =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-dim transition-colors hover:bg-white/10 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blend/70 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <section
      id="tutorial"
      className="scroll-mt-20 border-t border-white/10 bg-ink-2"
    >
      <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 md:py-36">
        <SectionHead
          index="02"
          label="The Film"
          title={
            <>
              Watch one whole build.
              <br />
              Then take over.
            </>
          }
          sub={`${clock(
            DURATION
          )} from an empty grid to a finished cabin, using five tools. It isn't a screen recording — the playground engine renders it live, so you can stop on any frame and open that exact model in the editor.`}
        />

        <Reveal>
          <div
            ref={wrapRef}
            tabIndex={0}
            role="group"
            aria-label="Tutorial film player. Space plays or pauses, arrow keys skip five seconds."
            onKeyDown={onKey}
            className={`relative overflow-hidden border border-white/10 bg-black outline-none focus-visible:ring-2 focus-visible:ring-blend/70 ${
              fs
                ? "flex h-full w-full flex-col"
                : "rounded-2xl shadow-2xl shadow-black/60"
            }`}
          >
            {/* stage */}
            <div
              className={`relative w-full bg-[#0a0c10] ${
                fs ? "min-h-0 flex-1" : "aspect-video"
              }`}
            >
              <canvas
                ref={canvasRef}
                width={1920}
                height={1080}
                onClick={toggle}
                role="img"
                aria-label="Tutorial film: a cabin is modelled step by step in the Sketchline playground."
                className="absolute inset-0 h-full w-full cursor-pointer object-contain"
              />

              {!started && (
                <button
                  onClick={toggle}
                  aria-label={`Play the tutorial film, ${clock(DURATION)}`}
                  className="group absolute inset-0 flex items-end justify-end p-5 focus-visible:outline-none sm:p-8"
                >
                  <span className="flex items-center gap-4 rounded-full bg-blend py-2.5 pl-2.5 pr-6 shadow-[0_0_60px_rgba(255,106,0,0.35)] transition-transform duration-300 group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-white/60">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-blend">
                      <Play className="h-5 w-5 translate-x-0.5" fill="currentColor" />
                    </span>
                    <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-ink">
                      Play the build
                    </span>
                    <span className="font-mono text-xs text-ink/70">
                      {clock(DURATION)}
                    </span>
                  </span>
                </button>
              )}

              {recording && (
                <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 rounded-full border border-inf-red/50 bg-black/85 py-1.5 pl-4 pr-1.5 backdrop-blur">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-inf-red" />
                  <span className="whitespace-nowrap font-mono text-[11px] text-paper">
                    Recording {Math.round((recPct ?? 0) * 100)}%
                    <span className="hidden text-dim sm:inline">
                      {" "}
                      · keep this tab visible
                    </span>
                  </span>
                  <button
                    onClick={cancelExport}
                    className="rounded-full bg-white/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper transition-colors hover:bg-inf-red hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* controls */}
            <div className="border-t border-white/10 bg-[#101319] px-3 pb-2 pt-3 sm:px-4">
              <div className="relative flex h-5 items-center px-1">
                <input
                  type="range"
                  min={0}
                  max={DURATION}
                  step={0.1}
                  value={shown}
                  disabled={recording}
                  onChange={(e) => seek(Number(e.target.value))}
                  aria-label="Seek"
                  aria-valuetext={`${clock(shown)} of ${clock(DURATION)}`}
                  className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
                <div className="relative h-1.5 w-full rounded-full bg-white/10 peer-focus-visible:ring-2 peer-focus-visible:ring-blend/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#101319]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-blend"
                    style={{ width: `${pct}%` }}
                  />
                  {CHAPTERS.map((c) => (
                    <span
                      key={c.index}
                      className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-[#101319]"
                      style={{ left: `${(c.start / DURATION) * 100}%` }}
                    />
                  ))}
                  <span
                    className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper shadow-md shadow-black/60"
                    style={{ left: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="mt-1 flex items-center gap-1">
                <button
                  onClick={toggle}
                  disabled={recording}
                  aria-label={playing ? "Pause" : ended ? "Replay" : "Play"}
                  className={`${iconBtn} text-paper`}
                >
                  {playing ? (
                    <Pause className="h-5 w-5" fill="currentColor" />
                  ) : ended ? (
                    <RotateCcw className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" fill="currentColor" />
                  )}
                </button>
                <span className="ml-1 whitespace-nowrap font-mono text-xs tabular-nums text-dim">
                  <span className="text-paper">{clock(shown)}</span> /{" "}
                  {clock(DURATION)}
                </span>
                <span className="ml-3 hidden truncate font-mono text-[11px] uppercase tracking-[0.2em] text-faint md:block">
                  {activeChapter >= 0
                    ? `${String(activeChapter + 1).padStart(2, "0")} · ${
                        CHAPTERS[activeChapter].title
                      }`
                    : started
                    ? "Cold open"
                    : ""}
                </span>

                <span className="flex-1" />

                <button
                  onClick={cycleSpeed}
                  disabled={recording}
                  aria-label={`Playback speed ${speed}×. Change speed.`}
                  className={`${iconBtn} w-auto px-2.5 font-mono text-xs tabular-nums`}
                >
                  {speed}×
                </button>
                <button
                  onClick={startExport}
                  disabled={recording}
                  aria-label="Save the film as a video file"
                  title="Save the film as a video file"
                  className={iconBtn}
                >
                  <Download className="h-[18px] w-[18px]" />
                </button>
                <button
                  onClick={toggleFs}
                  aria-label={fs ? "Exit fullscreen" : "Fullscreen"}
                  className={iconBtn}
                >
                  {fs ? (
                    <Minimize className="h-[18px] w-[18px]" />
                  ) : (
                    <Maximize className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </Reveal>

        {/* captions as text, for small screens where the canvas type gets tiny */}
        <p className="mt-4 min-h-[3rem] text-sm leading-relaxed text-dim md:hidden">
          {caption}
        </p>

        <div className="mt-10 grid gap-10 md:mt-14 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
          {/* chapters */}
          <div>
            <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-faint">
              Chapters
            </h3>
            <ol className="border-t border-white/10">
              {CHAPTERS.map((c) => {
                const on = c.index === activeChapter;
                return (
                  <li key={c.index} className="border-b border-white/10">
                    <button
                      onClick={() => seek(c.start + 0.01, true)}
                      disabled={recording}
                      aria-current={on ? "true" : undefined}
                      className={`group grid w-full grid-cols-[2.25rem_1fr_auto] items-baseline gap-x-4 px-2 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blend/70 disabled:cursor-not-allowed ${
                        on ? "bg-blend/[0.07]" : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <span
                        className={`font-mono text-sm ${
                          on ? "text-blend" : "text-faint"
                        }`}
                      >
                        {String(c.index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="text-lg font-semibold tracking-tight text-paper">
                            {c.title}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-blend-soft">
                            {c.tools}
                          </span>
                        </span>
                        <span className="mt-1 block text-sm leading-relaxed text-dim">
                          {c.summary}
                        </span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-faint transition-colors group-hover:text-paper">
                        {clock(c.start)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* take over */}
          <div>
            <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-faint">
              Take it from here
            </h3>
            <div className="tick-corner rounded-2xl border border-white/10 bg-ink p-6">
              <p className="leading-relaxed text-dim">
                Every click in the film was resolved by the same inference
                engine you get in the editor. Stop anywhere and pick up the
                model exactly as it stands — guides, half-built roof and all.
              </p>

              <dl className="my-6 grid grid-cols-4 gap-3 border-y border-white/10 py-5">
                {[
                  [String(STATS.tools), "tools"],
                  [String(STATS.clicks), "clicks"],
                  [String(STATS.typed), "typed"],
                  [String(STATS.faces), "faces"],
                ].map(([v, l]) => (
                  <div key={l}>
                    <dd className="text-2xl font-bold tracking-tight text-paper">
                      {v}
                    </dd>
                    <dt className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                      {l}
                    </dt>
                  </div>
                ))}
              </dl>

              <div className="space-y-2.5">
                <button
                  onClick={() => onOpenScene(cabinScene())}
                  className="group flex w-full items-center justify-between gap-3 rounded-xl bg-blend px-5 py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-ink transition-all duration-300 hover:bg-blend-soft hover:shadow-[0_0_40px_rgba(255,106,0,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  Open the finished cabin
                  <ArrowUpRight className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
                <button
                  onClick={() => onOpenScene(sceneAt(tRef.current))}
                  disabled={!started || recording}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/15 px-5 py-3.5 font-mono text-xs uppercase tracking-[0.18em] text-paper transition-colors hover:border-blend/50 hover:bg-blend/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blend/70 disabled:opacity-40 disabled:hover:border-white/15 disabled:hover:bg-transparent"
                >
                  <span>
                    Open this moment
                    <span className="ml-2 tabular-nums text-dim">
                      {started ? clock(shown) : "press play first"}
                    </span>
                  </span>
                  <FolderOpen className="h-4 w-4 shrink-0" />
                </button>
                <button
                  onClick={startExport}
                  disabled={recording}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/15 px-5 py-3.5 font-mono text-xs uppercase tracking-[0.18em] text-paper transition-colors hover:border-blend/50 hover:bg-blend/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blend/70 disabled:opacity-40"
                >
                  {recording ? "Recording…" : "Save the film as video"}
                  <Download className="h-4 w-4 shrink-0" />
                </button>
              </div>

              <p className="mt-4 font-mono text-[10px] leading-relaxed text-faint">
                Saving records the film in real time ({clock(DURATION)}) and
                downloads a video file. Nothing is uploaded.
              </p>
              <p
                role="status"
                aria-live="polite"
                className="mt-2 min-h-[1rem] font-mono text-[11px] leading-relaxed text-blend-soft"
              >
                {notice}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
