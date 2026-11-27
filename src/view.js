// Draws the scene and the box at a pose on a canvas: a simple perspective view (or straight down from above).
// Walls are drawn see-through so the box stays visible; the box's shadow on the floor shows where it is.

import { holdsFor, rotation, orient, liftOf, rampAt } from './geom.js';

export function makeView(canvas, scene, dims) {
  const ctx = canvas.getContext('2d');
  const W = scene.window; // { x0, x1, y0, y1 }: the part of the floor plan worth showing
  const cx = (W.x0 + W.x1) / 2, cy = (W.y0 + W.y1) / 2;
  const span = Math.max(W.x1 - W.x0, W.y1 - W.y0);
  // Wall prisms clipped to the window, up to the ceiling.
  const top = scene.ceiling;
  const blocks = scene.blocks.map((b) => ({ x0: Math.max(b.x0, W.x0), x1: Math.min(b.x1, W.x1), y0: Math.max(b.y0, W.y0), y1: Math.min(b.y1, W.y1), zb: b.zb }))
    .filter((b) => b.x1 > b.x0 + 0.01 && b.y1 > b.y0 + 0.01);
  let mode = 'angled';

  function camera() {
    if (mode === 'above') { // straight down from far away: practically a floor plan, north (+y) up
      const dist = span * 50;
      return { eye: [cx, cy, dist], f: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0], dist };
    }
    // Look from the side the box comes from (scene.viewFrom: angle in the floor plan, radians), raised.
    const az = scene.viewFrom ?? -Math.PI / 2, el = mode === 'above' ? Math.PI / 2 - 1e-3 : scene.viewEl ?? 0.95;
    const dist = span * (scene.viewOrtho ? 50 : 2.6); // (far away: practically a side elevation)
    const eye = [cx + Math.cos(az) * Math.cos(el) * dist, cy + Math.sin(az) * Math.cos(el) * dist, (scene.viewZ ?? top * 0.35) + Math.sin(el) * dist];
    const target = [cx, cy, mode === 'above' ? 0 : scene.viewZ ?? top * 0.2];
    const f = norm(sub(target, eye)), r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
    return { eye, f, r, u, dist };
  }

  function project(cam, p, w, h) {
    // The window's size at the camera's distance fills about 85% of the canvas's smaller side.
    const d = sub(p, cam.eye), z = dot(d, cam.f), k = (mode === 'above' ? 0.92 : 0.78) * Math.min(w, h) * cam.dist / span / z;
    return [w / 2 + dot(d, cam.r) * k, h / 2 - dot(d, cam.u) * k, z];
  }

  function prism(x0, x1, y0, y1, z0, z1) {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    return [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].map((f) => f.map((i) => v[i]));
  }

  function boxFaces(pose) {
    const o = orient(dims, rotation(holdsFor(dims)[pose.hold], pose.yaw, pose.pitch));
    const lift = scene.ramp ? liftOf(scene.ramp, o, pose.y) : 0; // carried up the stairs
    const V = [];
    for (let i = 0; i < o.verts.length / 3; i++) V.push([pose.x + o.verts[3 * i], pose.y + o.verts[3 * i + 1], lift + o.verts[3 * i + 2]]);
    // Each part's vertices are indexed by bits (1: +length, 2: +depth, 4: +height).
    const F = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]];
    const faces = [];
    for (let q = 0; q < V.length / 8; q++) for (const f of F) faces.push(f.map((i) => V[8 * q + i]));
    return { faces, V };
  }

  function draw(pose) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cam = camera();
    const P = (p) => project(cam, p, w, h);
    const poly = (pts, fill, stroke, lw = 1) => {
      ctx.beginPath(); pts.forEach((p, i) => { const q = P(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    };
    const facing = (f) => { const n = cross(sub(f[1], f[0]), sub(f[2], f[0])); return dot(n, sub(cam.eye, f[0])) > 0; };
    // Floor.
    poly([[W.x0, W.y0, 0], [W.x1, W.y0, 0], [W.x1, W.y1, 0], [W.x0, W.y1, 0]], '#efe9dc', null);
    // Stairs: each step as a solid block, then the floor above, drawn back to front.
    if (scene.stairs) {
      const st = scene.stairs, H = st.n * st.rise, xr = st.turn ? W.x1 : st.w;
      const solids = [];
      for (let i = 1; i < st.n; i++) solids.push(prism(0, st.w, (i - 1) * st.going, i * st.going, 0, i * st.rise));
      solids.push(prism(0, xr, st.Y0, W.y1, 0, H));
      const fs = solids.flatMap((pr) => pr.filter(facing)).map((f) => ({ f, d: dot(sub(centroid(f), cam.eye), cam.f) })).sort((p, q) => q.d - p.d);
      for (const { f } of fs) { const up = f.every((p) => p[2] === f[0][2]) && f[0][2] > 0; poly(f, up ? '#e6dcc8' : '#cdbfa5', 'rgba(90,80,64,0.5)'); }
    }
    // Walls: faces turned away first (behind everything), then their footprints.
    const wallFaces = blocks.flatMap((b) => prism(b.x0, b.x1, b.y0, b.y1, b.zb, top).map((f) => ({ f, b })));
    for (const { f } of wallFaces) if (!facing(f)) poly(f, 'rgba(140,128,108,0.30)', 'rgba(90,80,64,0.35)');
    for (const b of blocks) if (b.zb === 0) poly([[b.x0, b.y0, 0], [b.x1, b.y0, 0], [b.x1, b.y1, 0], [b.x0, b.y1, 0]], '#b9ad96', null);
    if (pose) {
      const { faces, V } = boxFaces(pose);
      // Shadow: the convex hull of the corners on the floor.
      const hull = convexHull(V.map((v) => [v[0], v[1]]));
      poly(hull.map(([x, y]) => [x, y, scene.ramp ? rampAt(scene.ramp, y) + 0.5 : 0]), 'rgba(40,50,70,0.18)', null);
      const light = norm([0.3, -0.5, 0.8]);
      const order = faces.filter(facing).map((f) => ({ f, d: dot(sub(centroid(f), cam.eye), cam.f) })).sort((p, q) => q.d - p.d);
      for (const { f } of order) {
        const n = norm(cross(sub(f[1], f[0]), sub(f[2], f[0])));
        const k = 0.55 + 0.45 * Math.max(0, dot(n, light));
        poly(f, `rgb(${Math.round(47 * k + 30)},${Math.round(106 * k + 30)},${Math.round(168 * k + 30)})`, '#1d3f66', 1.2);
      }
    }
    // Walls facing the camera, over the box, see-through.
    for (const { f, b } of wallFaces) if (facing(f)) poly(f, b.zb > 0 ? 'rgba(120,96,64,0.45)' : 'rgba(150,138,118,0.12)', 'rgba(80,70,55,0.45)');
  }

  return { draw, setMode: (m) => { mode = m; } };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const centroid = (f) => [0, 1, 2].map((r) => f.reduce((s, p) => s + p[r], 0) / f.length);

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cr(hi.at(-2), hi.at(-1), q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
