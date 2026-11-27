// Independent collision checker for stairs paths (own SAT, own treads/bulkhead from first principles).
import { solveTwoStage, reachOf, smooth, liftAt } from '../src/plan.js';
import { stairs } from '../src/scene.js';
import { sofa } from '../src/shape.js';
import { holdsFor } from '../src/geom.js';

// world OBBs of the item at a pose (centre bbox at x,y; lowest point at z=lift)
function obbs(dims, pose, lift) {
  const { a, v, w, s = 1 } = holdsFor(dims)[pose.hold];
  const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch), cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw);
  const ax = []; ax[a] = [cp * cy, cp * sy, sp]; ax[v] = [-sp * cy * s, -sp * sy * s, cp * s]; ax[w] = [-sy * s, cy * s, 0];
  const parts = dims.parts ?? [{ c: [0, 0, 0], h: dims.map((d) => d / 2) }];
  const bs = parts.map((p) => ({ c: [0, 1, 2].map((r) => p.c[0] * ax[0][r] + p.c[1] * ax[1][r] + p.c[2] * ax[2][r]), h: p.h, ax }));
  let low = Infinity, high = -Infinity;
  for (const b of bs) for (let i = 0; i < 8; i++) { let z = b.c[2]; for (let k = 0; k < 3; k++) z += ((i >> k) & 1 ? 1 : -1) * b.h[k] * ax[k][2]; low = Math.min(low, z); high = Math.max(high, z); }
  const base = lift - low;
  return { bs: bs.map((b) => ({ ...b, c: [pose.x + b.c[0], pose.y + b.c[1], b.c[2] + base] })), top: high + base };
}
// OBB vs AABB penetration (SAT): returns min overlap depth over 15 axes (>0 means interpenetrating by that much)
function pen(b, lo, hi) {
  const cc = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], hh = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
  const E = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const axes = [...E, ...b.ax];
  for (const e of E) for (const u of b.ax) axes.push([e[1] * u[2] - e[2] * u[1], e[2] * u[0] - e[0] * u[2], e[0] * u[1] - e[1] * u[0]]);
  let best = Infinity;
  for (const n of axes) {
    const l = Math.hypot(...n); if (l < 1e-9) continue;
    const u = n.map((q) => q / l);
    const d = [0, 1, 2].reduce((s, r) => s + (b.c[r] - cc[r]) * u[r], 0);
    const rb = [0, 1, 2].reduce((s, k) => s + b.h[k] * Math.abs(b.ax[k][0] * u[0] + b.ax[k][1] * u[1] + b.ax[k][2] * u[2]), 0);
    const ra = [0, 1, 2].reduce((s, k) => s + hh[k] * Math.abs(u[k]), 0);
    best = Math.min(best, ra + rb - Math.abs(d));
  }
  return best;
}
const BIG = 1e4;
export function solids(sc) {
  const S = sc.stairs, { w, n, rise, going: g, hc } = S, H = n * rise, out = [];
  // walls from the scene (grown by MARGIN later); treads; floors
  for (let i = 1; i <= n - 1; i++) out.push({ k: 'tread' + i, lo: [0, (i - 1) * g, -1], hi: [w, i * g, i * rise] });
  out.push({ k: 'floorAbove', lo: [-BIG, (n - 1) * g, -1], hi: [BIG, BIG, H] });
  out.push({ k: 'floorBelow', lo: [-BIG, -BIG, -1], hi: [BIG, 0, 0] });
  out.push({ k: 'floorBelowAll', lo: [-BIG, -BIG, -1], hi: [BIG, (n - 1) * g, 0] });
  // bulkhead from first principles: floor above ends where the slope is hc - headroom below the ceiling
  const yb = (hc - S.headroom - rise) * g / rise;
  out.push({ k: 'bulk', lo: [0, -BIG, hc], hi: [w, Math.min(Math.max(yb, 0), (n - 1) * g), BIG], margin: true });
  for (const b of sc.blocks) out.push({ k: 'wall', lo: [b.x0, b.y0, b.zb], hi: [b.x1, b.y1, BIG], margin: true });
  return out;
}
const MARG = 0.99;
export function checkPose(dims, sc, pose, SO) {
  const lift = liftAt(dims, sc, pose), o = obbs(dims, pose, lift);
  if (o.top > sc.ceiling - MARG) return `ceiling top=${o.top.toFixed(2)} lim=${sc.ceiling}`;
  for (const b of o.bs) for (const s of SO) {
    const m = s.margin ? MARG : 0, tol = s.margin ? 0 : 0.02;
    const lo = s.lo.map((q) => q - m), hi = s.hi.map((q) => q + m);
    const d = pen(b, lo, hi);
    if (d > tol) return `${s.k} pen=${d.toFixed(3)}`;
  }
  return null;
}
const norm = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
export function checkPath(dims, sc, path, gap = 0.15) {
  const SO = solids(sc), reach = reachOf(dims);
  for (let i = 0; i < path.length; i++) {
    const e = checkPose(dims, sc, path[i], SO); if (e) return `pose ${i} ${JSON.stringify(path[i])}: ${e}`;
    if (i === 0) continue;
    const A = path[i - 1], B = path[i], dy = norm(B.yaw - A.yaw), dp = B.pitch - A.pitch;
    const T = Math.hypot(B.x - A.x, B.y - A.y) + reach * Math.abs(dy) + reach * Math.abs(dp);
    const k = Math.ceil(T / gap);
    for (let j = 1; j < k; j++) {
      const t = j / k;
      const P = { hold: A.hold, x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y), yaw: A.yaw + t * dy, pitch: A.pitch + t * dp };
      const e2 = checkPose(dims, sc, P, SO); if (e2) return `seg ${i - 1}->${i} t=${t.toFixed(3)} ${JSON.stringify(P)}: ${e2}`;
    }
  }
  return null;
}
