// Checks every way the search finds with geometry written separately from src/geom.js: the box is rebuilt from
// its pose with its own formulas, and collisions are found by sampling points (on the box's surface, and along the
// walls' edges) instead of separating axes. Moves between path poses are replayed in small steps.
// Plus cases whose answer follows from a short argument (in the comments), so the search must get them right.

import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, solveTwoStage, reachOf, smooth, liftAt } from '../src/plan.js';
import { describe } from '../src/describe.js';
import { corner, sideDoor, roomDoor, stairs } from '../src/scene.js';
import { holdsFor } from '../src/geom.js';
import { sofa } from '../src/shape.js';

// Box axes in the world for a pose: the held axis points along the yaw, raised by the pitch; the upright axis
// leans back by the same angle; the third stays level.
function frame(pose, dims) {
  const { a, v, w, s = 1 } = holdsFor(dims)[pose.hold], cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
  const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw);
  const ax = []; ax[a] = [cp * cy, cp * sy, sp]; ax[v] = [-sp * cy * s, -sp * sy * s, cp * s]; ax[w] = [-sy * s, cy * s, 0];
  // The item's boxes (one, or a sofa's parts), each as its own frame: centre offset and half sizes.
  const parts = dims.parts ?? [{ c: [0, 0, 0], h: dims.map((d) => d / 2) }];
  const boxes = parts.map((pt) => ({ off: [0, 1, 2].map((r) => pt.c[0] * ax[0][r] + pt.c[1] * ax[1][r] + pt.c[2] * ax[2][r]), half: pt.h, ax }));
  // Lowest corner of any part on the floor.
  let low = Infinity;
  for (const b of boxes) for (let i = 0; i < 8; i++) {
    let z = b.off[2];
    for (let k = 0; k < 3; k++) z += ((i >> k) & 1 ? 1 : -1) * b.half[k] * ax[k][2];
    low = Math.min(low, z);
  }
  const c = [pose.x, pose.y, -low + (pose.z ?? 0)];
  return { boxes: boxes.map((b) => ({ c: [c[0] + b.off[0], c[1] + b.off[1], c[2] + b.off[2]], ax, half: b.half })) };
}

function corners(f) {
  const out = [];
  for (const b of f.boxes) for (let i = 0; i < 8; i++) {
    const p = [...b.c];
    for (let k = 0; k < 3; k++) for (let r = 0; r < 3; r++) p[r] += ((i >> k) & 1 ? 1 : -1) * b.half[k] * b.ax[k][r];
    out.push(p);
  }
  return out;
}

// Points on the item's surface (each part's), about `gap` apart.
function surface(f, gap) {
  const pts = [];
  for (const b of f.boxes) for (let k = 0; k < 3; k++) {
    const k1 = (k + 1) % 3, k2 = (k + 2) % 3;
    const n1 = Math.max(1, Math.ceil((2 * b.half[k1]) / gap)), n2 = Math.max(1, Math.ceil((2 * b.half[k2]) / gap));
    for (const s of [-1, 1]) for (let i = 0; i <= n1; i++) for (let j = 0; j <= n2; j++) {
      const u = -1 + (2 * i) / n1, t = -1 + (2 * j) / n2, p = [...b.c];
      for (let r = 0; r < 3; r++) p[r] += s * b.half[k] * b.ax[k][r] + u * b.half[k1] * b.ax[k1][r] + t * b.half[k2] * b.ax[k2][r];
      pts.push(p);
    }
  }
  return pts;
}

const inBox = (f, p, e) => f.boxes.some((b) => b.ax.every((u, k) => Math.abs((p[0] - b.c[0]) * u[0] + (p[1] - b.c[1]) * u[1] + (p[2] - b.c[2]) * u[2]) < b.half[k] + e));
const inBlock = (b, p, e) => p[0] > b.x0 - e && p[0] < b.x1 + e && p[1] > b.y0 - e && p[1] < b.y1 + e && p[2] > b.zb - e;

// Points along each block's edges that could poke into the box: its four vertical edges and, for a block that
// starts above the floor, its bottom edges.
function blockEdges(scene, gap) {
  const pts = [];
  const line = (p, q) => { const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / gap)); for (let i = 0; i <= n; i++) pts.push(p.map((v, r) => v + (i / n) * (q[r] - v))); };
  for (const b of scene.blocks) {
    for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) line([x, y, b.zb], [x, y, scene.ceiling]);
    if (b.zb > 0) {
      line([b.x0, b.y0, b.zb], [b.x1, b.y0, b.zb]); line([b.x0, b.y1, b.zb], [b.x1, b.y1, b.zb]);
      line([b.x0, b.y0, b.zb], [b.x0, b.y1, b.zb]); line([b.x1, b.y0, b.zb], [b.x1, b.y1, b.zb]);
    }
  }
  return pts;
}

// Does the box at this pose keep at least e from everything (as far as the samples can tell)?
function poseOK(f, scene, edgePts, e) {
  if (corners(f).some((p) => p[2] > scene.ceiling - e)) return 'ceiling';
  for (const p of surface(f, 2)) for (const b of scene.blocks) if (inBlock(b, p, e)) return 'box surface in a wall';
  for (const p of edgePts) if (inBox(f, p, e)) return 'wall edge in the box';
  if (scene.stairs) { // the real steps, not the solver's slope: no surface point under a tread, no step edge inside
    const st = scene.stairs;
    for (const p of surface(f, 2)) if (p[2] < treadAt(st, p[1]) - 0.05) return `box below a step (${p.map((v) => v.toFixed(1))})`;
    for (let i = 1; i <= st.n; i++) for (let x = 0; x <= st.w; x += 0.5) if (inBox(f, [x, (i - 1) * st.going, i * st.rise], -0.05)) return `step edge ${i} in the box`;
  }
  return null;
}

// Height of the floor at y: the bottom floor, then step i (from 1) from y = (i - 1) going, then the floor above.
const treadAt = (st, y) => (y < 0 ? 0 : Math.min(st.n, Math.floor(y / st.going) + 1) * st.rise);

const sameShape = (f, g) => {
  const key = (h) => corners(h).map((p) => p.map((v) => Math.round(v * 100)).join(',')).sort().join(';');
  return key(f) === key(g);
};

export function verifyPath(r, dims, scene, e = +(process.env.VERIFY_E ?? 0.95)) { // the page promises 1 cm; 0.05 for sampling
  const edgePts = blockEdges(scene, 0.5);
  const P = r.path;
  for (let i = 0; i < P.length; i++) {
    const lift = (pose) => ({ ...pose, z: liftAt(dims, scene, pose) }); // the solver's carrying height
    if (scene.stairs && Math.abs(liftAt(dims, scene, P[i]) - (P[i].z ?? 0)) > 1e-6) return `pose ${i}: height isn't the carrying height`;
    const why = poseOK(frame(lift(P[i]), dims), scene, edgePts, e);
    if (why) return `pose ${i}: ${why}`;
    if (i === 0) continue;
    const A = P[i - 1], B = P[i];
    if (A.hold !== B.hold) {
      if (!sameShape(frame({ ...A, x: 0, y: 0 }, dims), frame({ ...B, x: 0, y: 0 }, dims))) return `pose ${i}: hold change with a different orientation`;
    }
    let dy = B.yaw - A.yaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
    // Sub-steps: at most 0.5 cm of travel for any point of the box between them.
    const R0 = Math.hypot(...dims) / 2;
    const K = Math.max(12, Math.ceil((Math.hypot(B.x - A.x, B.y - A.y) + R0 * Math.abs(dy) + 3 * R0 * Math.abs(B.pitch - A.pitch)) / 0.5));
    let zPrev = liftAt(dims, scene, A);
    for (let k = 1; k < K; k++) {
      const t = k / K;
      const pose = A.hold !== B.hold ? { ...A, x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) }
        : { hold: A.hold, x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y), yaw: A.yaw + t * dy, pitch: A.pitch + t * (B.pitch - A.pitch) };
      const z = liftAt(dims, scene, pose);
      if (Math.abs(z - zPrev) > 2) return `between poses ${i - 1} and ${i}: height jumps ${(z - zPrev).toFixed(1)} cm`;
      zPrev = z;
      const why2 = poseOK(frame({ ...pose, z }, dims), scene, edgePts, e);
      if (why2) return `between poses ${i - 1} and ${i}: ${why2}`;
    }
  }
  if (!scene.start(extentOf(frame(P[0], dims)))) return 'first pose is not in the start area';
  if (!scene.goal(extentOf(frame(P.at(-1), dims)))) return 'last pose is not in the goal area';
  return null;
}
function extentOf(f) {
  const c = corners(f);
  return { minx: Math.min(...c.map((p) => p[0])), maxx: Math.max(...c.map((p) => p[0])), miny: Math.min(...c.map((p) => p[1])), maxy: Math.max(...c.map((p) => p[1])) };
}

