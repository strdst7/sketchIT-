import type { Scene } from "./scene";

/**
 * Produces a fully self-contained HTML document with the scene embedded.
 * No build step, no CDN, no dependencies — open it anywhere, or iframe it.
 *
 * The viewer is plain ES5 and carries its own copy of the BSP depth sort used
 * by the editor, so exported models draw exactly the way they were built.
 */
export function buildStandaloneHTML(scene: Scene): string {
  const json = JSON.stringify(scene).replace(/</g, "\\u003c");
  const title = (scene.name || "Sketchline Project").replace(/[<>&"]/g, "");

  const viewer = `(function () {
  var data = JSON.parse(document.getElementById('scene-data').textContent);
  var cvs = document.getElementById('c');
  var ctx = cvs.getContext('2d');
  var c0 = data.cam || { yaw: 0.62, pitch: 0.38, dist: 22, target: [0, 0, 1] };
  var yaw = c0.yaw, pitch = c0.pitch, dist = c0.dist, target = c0.target.slice();
  var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var EPS = 1e-4, NEAR = 0.05, dirty = true, cons = true;

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norm(a) {
    var l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  var LIGHT = norm([0.5, -0.3, 0.81]);

  function shade(hex, f) {
    var h = String(hex || '#cccccc').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16) || 0;
    var q = function (v) { return Math.max(0, Math.min(255, Math.round(v * f))); };
    return 'rgb(' + q((n >> 16) & 255) + ',' + q((n >> 8) & 255) + ',' + q(n & 255) + ')';
  }

  /* ---- BSP depth sort: exact painting order from any angle ---- */
  function split(pts, real, n, d) {
    var cnt = pts.length, ds = [], pos = 0, neg = 0, i;
    for (i = 0; i < cnt; i++) {
      var v = dot(n, pts[i]) - d;
      ds.push(v);
      if (v > EPS) pos++; else if (v < -EPS) neg++;
    }
    if (!pos && !neg) return { co: true };
    if (!neg) return { f: { pts: pts, real: real } };
    if (!pos) return { b: { pts: pts, real: real } };
    var f = { pts: [], real: [] }, b = { pts: [], real: [] };
    for (i = 0; i < cnt; i++) {
      var j = (i + 1) % cnt, di = ds[i], dj = ds[j];
      var si = di > EPS ? 1 : di < -EPS ? -1 : 0;
      var sj = dj > EPS ? 1 : dj < -EPS ? -1 : 0;
      if (si >= 0) { f.pts.push(pts[i]); f.real.push(si === 0 && sj < 0 ? false : real[i]); }
      if (si <= 0) { b.pts.push(pts[i]); b.real.push(si === 0 && sj > 0 ? false : real[i]); }
      if (si * sj < 0) {
        var x = add(pts[i], mul(sub(pts[j], pts[i]), di / (di - dj)));
        if (si > 0) { f.pts.push(x); f.real.push(false); b.pts.push(x); b.real.push(real[i]); }
        else { b.pts.push(x); b.real.push(false); f.pts.push(x); f.real.push(real[i]); }
      }
    }
    return { f: f.pts.length >= 3 ? f : null, b: b.pts.length >= 3 ? b : null };
  }
  function build(list) {
    if (!list.length) return null;
    var root = list[0], n = root.n, d = dot(n, root.pts[0]);
    var node = { n: n, d: d, frags: [root], front: null, back: null };
    var fr = [], bk = [];
    for (var i = 1; i < list.length; i++) {
      var g = list[i], s = split(g.pts, g.real, n, d);
      if (s.co) { node.frags.push(g); continue; }
      if (s.f) fr.push({ pts: s.f.pts, real: s.f.real, n: g.n, color: g.color });
      if (s.b) bk.push({ pts: s.b.pts, real: s.b.real, n: g.n, color: g.color });
    }
    node.front = build(fr);
    node.back = build(bk);
    return node;
  }
  function walk(node, eye, out) {
    if (!node) return;
    var i;
    if (dot(node.n, eye) - node.d > 0) {
      walk(node.back, eye, out);
      for (i = 0; i < node.frags.length; i++) out.push(node.frags[i]);
      walk(node.front, eye, out);
    } else {
      walk(node.front, eye, out);
      for (i = 0; i < node.frags.length; i++) out.push(node.frags[i]);
      walk(node.back, eye, out);
    }
  }

  var frags = [];
  (data.faces || []).forEach(function (fc) {
    var p = fc.pts;
    if (!p || p.length < 3) return;
    var x = 0, y = 0, z = 0;
    for (var i = 0; i < p.length; i++) {
      var a = p[i], b = p[(i + 1) % p.length];
      x += (a[1] - b[1]) * (a[2] + b[2]);
      y += (a[2] - b[2]) * (a[0] + b[0]);
      z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    var l = Math.hypot(x, y, z);
    if (l < 1e-10) return;
    frags.push({
      pts: p,
      real: p.map(function () { return true; }),
      n: [x / l, y / l, z / l],
      color: fc.color
    });
  });
  var root = build(frags);

  function resize() {
    W = cvs.clientWidth; H = cvs.clientHeight;
    cvs.width = Math.max(1, Math.round(W * dpr));
    cvs.height = Math.max(1, Math.round(H * dpr));
    dirty = true;
  }

  function label(x, y, text, color) {
    ctx.font = '500 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    var w = ctx.measureText(text).width + 14, h = 19;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, 4);
    else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = 'rgba(8,10,14,0.9)';
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
  }

  function draw() {
    requestAnimationFrame(draw);
    if (!dirty) return;
    dirty = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var eye = add(target, mul([Math.sin(yaw) * cp, -Math.cos(yaw) * cp, sp], dist));
    var fwd = norm(sub(target, eye));
    var right = norm(cross(fwd, [0, 0, 1]));
    var up = cross(right, fwd);
    var f = H / 2 / Math.tan(25 * Math.PI / 180);
    function proj(p) {
      var d = sub(p, eye), z = dot(d, fwd);
      if (z <= NEAR) return null;
      var s = f / z;
      return { x: W / 2 + dot(d, right) * s, y: H / 2 - dot(d, up) * s };
    }
    function line(a, b) {
      var pa = proj(a), pb = proj(b);
      if (!pa || !pb) return;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    var bg = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.8);
    bg.addColorStop(0, '#171b23');
    bg.addColorStop(1, '#0a0c10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    for (var g = -12; g <= 12; g++) {
      ctx.strokeStyle = g % 5 === 0 ? 'rgba(233,237,242,0.1)' : 'rgba(233,237,242,0.04)';
      line([g, -12, 0], [g, 12, 0]);
      line([-12, g, 0], [12, g, 0]);
    }

    var order = [];
    walk(root, eye, order);
    var nd = dot(fwd, eye) + NEAR;
    order.forEach(function (fr) {
      var pts = fr.pts, real = fr.real, behind = false, i;
      for (i = 0; i < pts.length; i++) {
        if (dot(fwd, pts[i]) - nd < 0) { behind = true; break; }
      }
      if (behind) {
        var s = split(pts, real, fwd, nd);
        if (!s.f) return;
        pts = s.f.pts; real = s.f.real;
      }
      var scr = pts.map(proj);
      for (i = 0; i < scr.length; i++) if (!scr[i]) return;
      var facing = dot(fr.n, sub(eye, pts[0])) >= 0 ? 1 : -1;
      var lit = 0.48 + 0.14 * fr.n[2] * facing + 0.42 * Math.max(0, dot(fr.n, LIGHT) * facing);
      var fill = shade(fr.color, lit);
      ctx.beginPath();
      ctx.moveTo(scr[0].x, scr[0].y);
      for (i = 1; i < scr.length; i++) ctx.lineTo(scr[i].x, scr[i].y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = fill;
      ctx.lineWidth = 0.75;
      ctx.stroke();
      ctx.beginPath();
      for (i = 0; i < scr.length; i++) {
        if (!real[i]) continue;
        var j = (i + 1) % scr.length;
        ctx.moveTo(scr[i].x, scr[i].y);
        ctx.lineTo(scr[j].x, scr[j].y);
      }
      ctx.strokeStyle = 'rgba(8,10,14,0.78)';
      ctx.lineWidth = 1.1;
      ctx.lineJoin = 'round';
      ctx.stroke();
    });

    (data.edges || []).forEach(function (e) {
      if (e.kind !== 'edge' && !cons) return;
      ctx.setLineDash(e.kind === 'edge' ? [] : [6, 5]);
      ctx.strokeStyle = e.kind === 'guide' ? 'rgba(45,212,238,0.95)'
        : e.kind === 'measure' ? 'rgba(255,176,32,0.95)' : 'rgba(233,237,242,0.92)';
      ctx.lineWidth = 1.5;
      line(e.a, e.b);
      ctx.setLineDash([]);
      if (e.kind === 'measure' && e.label) {
        var m = proj([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, (e.a[2] + e.b[2]) / 2]);
        if (m) label(m.x, m.y - 14, e.label, '#ffb020');
      }
    });

    if (cons) (data.guides || []).forEach(function (gp) {
      var p = proj(gp);
      if (!p) return;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = 'rgba(255,176,32,0.95)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-3.5, -3.5, 7, 7);
      ctx.restore();
    });
  }

  /* ---- input: drag to orbit, wheel or pinch to zoom ---- */
  var pts = {}, pinch = 0;
  function zoom(k) { dist = Math.max(1.5, Math.min(300, dist * k)); dirty = true; }
  cvs.addEventListener('pointerdown', function (e) {
    if (cvs.setPointerCapture) cvs.setPointerCapture(e.pointerId);
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    pinch = 0;
  });
  function lift(e) { delete pts[e.pointerId]; pinch = 0; }
  cvs.addEventListener('pointerup', lift);
  cvs.addEventListener('pointercancel', lift);
  cvs.addEventListener('pointermove', function (e) {
    var p = pts[e.pointerId];
    if (!p) return;
    var ids = Object.keys(pts);
    if (ids.length === 1) {
      yaw -= (e.clientX - p.x) * 0.006;
      pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - p.y) * 0.006));
      dirty = true;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (ids.length === 2) {
      var a = pts[ids[0]], b = pts[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch && d > 0) zoom(pinch / d);
      pinch = d;
    }
  });
  cvs.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoom(1 + e.deltaY * 0.0012);
  }, { passive: false });

  document.getElementById('reset').addEventListener('click', function () {
    yaw = c0.yaw; pitch = c0.pitch; dist = c0.dist; target = c0.target.slice();
    dirty = true;
  });
  var consBtn = document.getElementById('cons');
  consBtn.addEventListener('click', function () {
    cons = !cons;
    consBtn.setAttribute('aria-pressed', cons ? 'true' : 'false');
    consBtn.textContent = cons ? 'Hide guides' : 'Show guides';
    dirty = true;
  });
  document.getElementById('dl').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (data.name || 'project') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Sketchline</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #0a0c10; color: #e9edf2;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  #bar { min-height: 46px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
    padding: 6px 14px; border-bottom: 1px solid rgba(255,255,255,0.09);
    background: #101319; font-size: 13px; }
  #mark { width: 12px; height: 12px; border: 1.5px solid #ff6a00; transform: rotate(45deg); flex: none; }
  #name { font-weight: 600; letter-spacing: 0.04em; }
  #tag { color: #8b95a5; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; }
  #bar .sp { flex: 1; }
  button { background: transparent; border: 1px solid rgba(255,255,255,0.16);
    color: #e9edf2; border-radius: 999px; padding: 7px 13px; font-size: 12px;
    cursor: pointer; font-family: inherit; }
  button:hover { border-color: #ff6a00; color: #ff8a3d; }
  button:focus-visible { outline: 2px solid #ff6a00; outline-offset: 2px; }
  #wrap { position: absolute; left: 0; right: 0; bottom: 0; top: 0; display: flex; flex-direction: column; }
  #stage { position: relative; flex: 1; min-height: 0; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block;
    cursor: grab; touch-action: none; }
  canvas:active { cursor: grabbing; }
  #hint { position: absolute; left: 14px; bottom: 12px; font-size: 11px;
    color: #6f7887; letter-spacing: 0.06em; pointer-events: none; }
</style>
</head>
<body>
<div id="wrap">
  <div id="bar">
    <div id="mark"></div>
    <div id="name">${title}</div>
    <div id="tag">Sketchline project</div>
    <div class="sp"></div>
    <button id="cons" aria-pressed="true">Hide guides</button>
    <button id="reset">Reset view</button>
    <button id="dl">Download JSON</button>
  </div>
  <div id="stage">
    <canvas id="c"></canvas>
    <div id="hint">drag to orbit &middot; scroll or pinch to zoom</div>
  </div>
</div>
<script id="scene-data" type="application/json">${json}</script>
<script>${viewer}</script>
</body>
</html>`;
}

/** An iframe snippet that can be pasted into any page. */
export function buildEmbedSnippet(scene: Scene): string {
  const html = buildStandaloneHTML(scene);
  const escaped = html
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const name = (scene.name || "Sketchline project").replace(/[<>&"]/g, "");
  return `<iframe srcdoc="${escaped}" width="100%" height="520" style="border:1px solid rgba(255,255,255,0.12);border-radius:12px;background:#0a0c10" title="${name}"></iframe>`;
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
