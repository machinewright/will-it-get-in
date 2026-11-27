// Checks every way the search finds with geometry written separately from src/geom.js: the box is rebuilt from
// its pose with its own formulas, and collisions are found by sampling points (on the box's surface, and along the
// walls' edges) instead of separating axes. Moves between path poses are replayed in small steps.
// Plus cases whose answer follows from a short argument (in the comments), so the search must get them right.

import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, solveTwoStage, reachOf, smooth } from '../src/plan.js';
import { describe } from '../src/describe.js';
import { corner, sideDoor, roomDoor } from '../src/scene.js';
import { HOLDS } from '../src/geom.js';

// Box axes in the world for a pose: the held axis points along the yaw, raised by the pitch; the upright axis
// leans back by the same angle; the third stays level.
function frame(pose, dims) {
  const { a, v, w } = HOLDS[pose.hold], cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
  const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw);
  const ax = []; ax[a] = [cp * cy, cp * sy, sp]; ax[v] = [-sp * cy, -sp * sy, cp]; ax[w] = [-sy, cy, 0];
  const half = dims.map((d) => d / 2);
  // Lowest corner on the floor.
  let low = Infinity;
  for (let i = 0; i < 8; i++) {
    let z = 0;
    for (let k = 0; k < 3; k++) z += ((i >> k) & 1 ? 1 : -1) * half[k] * ax[k][2];
    low = Math.min(low, z);
  }
  return { c: [pose.x, pose.y, -low], ax, half };
}

function corners(f) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const p = [...f.c];
    for (let k = 0; k < 3; k++) for (let r = 0; r < 3; r++) p[r] += ((i >> k) & 1 ? 1 : -1) * f.half[k] * f.ax[k][r];
    out.push(p);
  }
  return out;
}

// Points on the box's surface, about `gap` apart.
function surface(f, gap) {
  const pts = [];
  for (let k = 0; k < 3; k++) {
    const k1 = (k + 1) % 3, k2 = (k + 2) % 3;
    const n1 = Math.max(1, Math.ceil((2 * f.half[k1]) / gap)), n2 = Math.max(1, Math.ceil((2 * f.half[k2]) / gap));
    for (const s of [-1, 1]) for (let i = 0; i <= n1; i++) for (let j = 0; j <= n2; j++) {
      const u = -1 + (2 * i) / n1, t = -1 + (2 * j) / n2, p = [...f.c];
      for (let r = 0; r < 3; r++) p[r] += s * f.half[k] * f.ax[k][r] + u * f.half[k1] * f.ax[k1][r] + t * f.half[k2] * f.ax[k2][r];
      pts.push(p);
    }
  }
  return pts;
}

const inBox = (f, p, e) => f.ax.every((u, k) => Math.abs((p[0] - f.c[0]) * u[0] + (p[1] - f.c[1]) * u[1] + (p[2] - f.c[2]) * u[2]) < f.half[k] + e);
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
  return null;
}

const sameShape = (f, g) => {
  const key = (h) => corners(h).map((p) => p.map((v) => Math.round(v * 100)).join(',')).sort().join(';');
  return key(f) === key(g);
};

export function verifyPath(r, dims, scene, e = 0.6) {
  const edgePts = blockEdges(scene, 0.5);
  const P = r.path;
  for (let i = 0; i < P.length; i++) {
    const why = poseOK(frame(P[i], dims), scene, edgePts, e);
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
    for (let k = 1; k < K; k++) {
      const t = k / K;
      const pose = A.hold !== B.hold ? { ...A, x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) }
        : { hold: A.hold, x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y), yaw: A.yaw + t * dy, pitch: A.pitch + t * (B.pitch - A.pitch) };
      const why2 = poseOK(frame(pose, dims), scene, edgePts, e);
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

const run = (dims, mk) => { const scene = mk(reachOf(dims)); return { scene, r: solve(dims, scene) }; };

test('hand cases', () => {
  // 200 x 75 x 70 round an 80/80 corner. Flat it can't (75 and 70 are nearly the hallway's width, so it can only
  // slide, not turn). On its end its footprint (75 x 70) slides round; standing it up takes sqrt(200^2 + 70^2) =
  // 211.9 cm of headroom (+1 cm clearance).
  let d = [200, 75, 70];
  let { r, scene } = run(d, (reach) => corner({ a: 80, b: 80, ceiling: 240, reach }));
  assert.equal(r.found, true);
  assert.equal(verifyPath(r, d, scene), null);
  // Under 205 cm it can't be stood up here (that takes 211.9 cm), but it may arrive already on its end (from
  // outside, say), and then it slides round.
  ({ r, scene } = run(d, (reach) => corner({ a: 80, b: 80, ceiling: 205, reach })));
  assert.equal(r.found, true);
  assert.equal(verifyPath(r, d, scene), null);
  // Under 199 cm it can't be on its end at all (200 + 1.5 cm). Lifting one end is limited to about 49 degrees
  // (200 sin + 70 cos <= 197.5), when it is still 184 cm long on the floor; on its back or side it is 70 or 75 cm
  // wide, so in 77 cm it can only slide, never turn. No way.
  ({ r } = run(d, (reach) => corner({ a: 80, b: 80, ceiling: 199, reach })));
  assert.equal(r.found, false);

  // Through an 80 cm door between two rooms: 180 x 75 x 75 goes through flat.
  d = [180, 75, 75];
  ({ r, scene } = run(d, (reach) => roomDoor({ b: 80, doorH: 200, t: 10, ceiling: 240, reach })));
  assert.equal(r.found, true);
  assert.equal(verifyPath(r, d, scene), null);
  // 180 x 85 x 75: only on its side (75 across, 85 up).
  d = [180, 85, 75];
  ({ r, scene } = run(d, (reach) => roomDoor({ b: 80, doorH: 200, t: 10, ceiling: 240, reach })));
  assert.equal(r.found, true);
  assert.equal(verifyPath(r, d, scene), null);
  // 180 x 85 x 82: never. When its centre is in the doorway, the slice of the box in the doorway's plane contains
  // the line through the centre along the door's width, and any line through a box's centre is at least its
  // smallest side long: 82 > 80 - 2 x 1 cm.
  d = [180, 85, 82];
  ({ r } = run(d, (reach) => roomDoor({ b: 80, doorH: 200, t: 10, ceiling: 240, reach })));
  assert.equal(r.found, false);
  assert.equal(r.doorTooSmall, true);
  // The same box from a 100 cm hallway through an 80 cm side door: the same argument, the same answer.
  ({ r } = run(d, (reach) => sideDoor({ a: 100, b: 80, doorH: 200, t: 10, past: 100, ceiling: 240, reach })));
  assert.equal(r.found, false);

  // A wardrobe 230 cm tall under a 220 cm ceiling can't stand upright, but it arrives lying down and goes round a
  // wide corner lying down (found by an audit: only upright starts were allowed).
  d = [100, 50, 230];
  ({ r, scene } = run(d, (reach) => corner({ a: 150, b: 150, ceiling: 220, reach })));
  assert.equal(r.found, true);
  assert.equal(verifyPath(r, d, scene), null);
});

test('steps say "lower" when the route lowers it', () => {
  // From the audit: this route stands it on end, then lowers it to about 55 degrees and on down.
  const d = [200, 80, 75];
  const scene = sideDoor({ a: 110, b: 85, doorH: 200, t: 12, past: 0, ceiling: 240, reach: reachOf(d) });
  const r = solve(d, scene);
  assert.equal(r.found, true);
  const path = smooth(d, scene, r.path);
  const steps = describe(r.before, path, scene.spot);
  // Whatever the wording, a step that lifts must come before the end goes down, never after standing it on end.
  const iEnd = steps.findIndex((t) => /on its end/.test(t));
  if (iEnd >= 0) for (const t of steps.slice(iEnd + 1)) assert.doesNotMatch(t, /^Lift/, steps.join(' / '));
});

test('every way found in random scenes passes the independent check', () => {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let found = 0;
  for (let i = 0; i < 24; i++) {
    const L = 120 + Math.round(rnd() * 110), D = 50 + Math.round(rnd() * 50), H = 40 + Math.round(rnd() * 50);
    const dims = [L, D, H], ceiling = 200 + Math.round(rnd() * 60);
    const mk = i % 3 === 2 ? (reach) => roomDoor({ b: 70 + Math.round(rnd() * 25), doorH: 190 + Math.round(rnd() * 20), t: 1 + Math.round(rnd() * 25), ceiling, reach })
      : i % 3 === 1 ? (reach) => corner({ a: 75 + Math.round(rnd() * 50), b: 75 + Math.round(rnd() * 50), ceiling, reach })
      : (reach) => sideDoor({ a: 80 + Math.round(rnd() * 60), b: 70 + Math.round(rnd() * 25), doorH: 190 + Math.round(rnd() * 20), t: 8 + Math.round(rnd() * 20), past: Math.round(rnd() * 150), ceiling, reach });
    const { r, scene } = run(dims, mk);
    if (!r.found) continue;
    found++;
    assert.equal(verifyPath(r, dims, scene), null, `case ${i}: ${dims} in ${scene.kind}`);
    assert.equal(verifyPath({ ...r, path: smooth(dims, scene, r.path) }, dims, scene), null, `case ${i} smoothed: ${dims} in ${scene.kind}`);
    // The coarse-first search the page uses: its ways must pass too.
    const r2 = solveTwoStage(dims, scene);
    assert.equal(r2.found, true, `case ${i}: two-stage search lost a way the fine search found`);
    assert.equal(verifyPath({ ...r2, path: smooth(dims, scene, r2.path) }, dims, scene), null, `case ${i} two-stage: ${dims} in ${scene.kind}`);
  }
  assert.ok(found >= 8, `only ${found} of 24 random cases had a way: the check needs more`);
});
