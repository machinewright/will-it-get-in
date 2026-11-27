import { liftAt, reachOf } from '../src/plan.js';
import { sofa } from '../src/shape.js';
import { holdsFor } from '../src/geom.js';
import { stairs } from '../src/scene.js';
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function world(d, sc, pose) {
  const H = holdsFor(d), { a, v, w, s = 1 } = H[pose.hold]; const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch), cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw);
  const ax = []; ax[a] = [cp * cy, cp * sy, sp]; ax[v] = [-sp * cy * s, -sp * sy * s, cp * s]; ax[w] = [-sy * s, cy * s, 0];
  const parts = d.parts ?? [{ c: [0, 0, 0], h: d.map((q) => q / 2) }];
  const pts = []; let low = Infinity;
  for (const p of parts) for (let i = 0; i < 8; i++) { const P = [0, 0, 0]; for (let r = 0; r < 3; r++) { P[r] = p.c[0] * ax[0][r] + p.c[1] * ax[1][r] + p.c[2] * ax[2][r]; for (let k = 0; k < 3; k++) P[r] += ((i >> k) & 1 ? 1 : -1) * p.h[k] * ax[k][r]; } pts.push(P); low = Math.min(low, P[2]); }
  const lift = liftAt(d, sc, pose);
  return pts.map((P) => [P[0] + pose.x, P[1] + pose.y, P[2] - low + lift]);
}
let worst = 0;
for (let t = 0; t < 20000; t++) {
  const d = t % 2 ? [90 + rnd() * 130, 40 + rnd() * 60, 30 + rnd() * 60] : sofa({ L: 190, D: 90, H: 80, seatH: 42, backT: 18, armH: 60, armW: 14 });
  const rise = 12 + rnd() * 18, going = 18 + rnd() * 15, n = 4 + Math.floor(rnd() * 10);
  const sc = stairs({ w: 90, n, rise, going, headroom: 200, hc: 240, b: 90, turn: false, reach: reachOf(d) });
  const reach = reachOf(d), H = holdsFor(d);
  const A = { hold: Math.floor(rnd() * H.length), yaw: rnd() * 6, pitch: (rnd() - 0.2) * 1.3, x: 45, y: (n - 1) * going * rnd() * 1.2 - going };
  const e = 0.05;
  const B = { ...A, x: A.x + (rnd() - 0.5) * e, y: A.y + (rnd() - 0.5) * e, yaw: A.yaw + (rnd() - 0.5) * e / reach, pitch: A.pitch + (rnd() - 0.5) * e / reach / 2 };
  const T = Math.hypot(B.x - A.x, B.y - A.y) + reach * Math.abs(B.yaw - A.yaw) + 2.8 * reach * Math.abs(B.pitch - A.pitch);
  const wa = world(d, sc, A), wb = world(d, sc, B);
  const lf = 2 + rise / going;
  for (let i = 0; i < wa.length; i++) { const dz = Math.abs(wa[i][2] - wb[i][2]), dp = Math.hypot(wa[i][0] - wb[i][0], wa[i][1] - wb[i][1]); worst = Math.max(worst, Math.hypot(dz, dp) / (T * lf)); }
}
console.log('max ratio (should be <=1):', worst);
