import { useEffect, useRef } from "react";
import { makeBasis } from "../playground/camera";
import { renderScene } from "../playground/render";
import { demoScene } from "../playground/scene";

/**
 * A live, non-interactive render of the real playground engine — the same
 * renderer the editor uses, so the preview can never drift from the product.
 */
export default function PlaygroundPreview({
  className = "",
}: {
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const scene = demoScene();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    const start = performance.now();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const w = cvs.clientWidth;
      const h = cvs.clientHeight;
      if (!w || !h) return;
      if (cvs.width !== Math.round(w * dpr)) {
        cvs.width = Math.round(w * dpr);
        cvs.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = (performance.now() - start) / 1000;
      const cam = {
        ...scene.cam,
        yaw: scene.cam.yaw + Math.sin(t * 0.16) * 0.6,
        pitch: scene.cam.pitch + Math.sin(t * 0.11) * 0.1,
      };
      const basis = makeBasis(cam, w, h);
      renderScene(ctx, {
        scene: { ...scene, cam },
        basis,
        view: { grid: true, guides: true, measures: true, wire: false },
        selection: new Set(),
        w,
        h,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
