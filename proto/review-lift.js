import { liftAt } from '../src/plan.js';
import { sofa } from '../src/shape.js';
import { holdsFor } from '../src/geom.js';
import { stairs } from '../src/scene.js';
const f = (r, y) => Math.min(r.n * r.rise, Math.max(0, r.rise * (1 + y / r.going)));
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let worstUnder = 0, worstOver = 0, cnt = 0;
for (let t = 0; t < 400; t++) {
  const d = t % 2 ? [90 + rnd() * 130, 40 + rnd() * 60, 30 + rnd() * 60] : sofa({ L: 190, D: 90, H: 80, seatH: 42, backT: 18, armH: 60, armW: 14 });
  const rise = 12 + rnd() * 15, going = 18 + rnd() * 15, n = 3 + Math.floor(rnd() * 12);
  const sc = stairs({ w: 90, n, rise, going, headroom: 200, hc: 240, b: 90, turn: false, reach: 120 });
  const H = holdsFor(d), hold = Math.floor(rnd() * H.length), yaw = (rnd() - 0.5) * 2.4 + Math.PI / 2, pitch = (rnd() - 0.2) * 1.3;
  const top = (n - 1) * going;
  const y = (rnd() < 0.5 ? -going : top) + (rnd() - 0.5) * 120;
  const pose = { hold, yaw, pitch, x: 45, y };
  const lift = liftAt(d, sc, pose);
  // own dense sampling of the surface
  const { a, v, w, s = 1 } = H[hold]; const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ax = []; ax[a] = [cp * cy, cp * sy, sp]; ax[v] = [-sp * cy * s, -sp * sy * s, cp * s]; ax[w] = [-sy * s, cy * s, 0];
  const parts = d.parts ?? [{ c: [0, 0, 0], h: d.map((q) => q / 2) }];
  let low = Infinity, need = -Infinity; const pts = [];
  for (const p of parts) {
    const N = 24;
    for (let k = 0; k < 3; k++) { const k1 = (k + 1) % 3, k2 = (k + 2) % 3;
      for (const sg of [-1, 1]) for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const u = -1 + 2 * i / N, q = -1 + 2 * j / N, P = [0, 0, 0];
        for (let r = 0; r < 3; r++) P[r] = p.c[0] * ax[0][r] + p.c[1] * ax[1][r] + p.c[2] * ax[2][r] + sg * p.h[k] * ax[k][r] + u * p.h[k1] * ax[k1][r] + q * p.h[k2] * ax[k2][r];
        pts.push(P); low = Math.min(low, P[2]);
      } }
  }
  for (const P of pts) need = Math.max(need, f(sc.ramp, y + P[1]) - (P[2] - low));
  need = Math.max(need, 0);
  // lowest point must sit at lift; need is the required lift
  const under = need - lift, over = lift - need; // under>0 means lift too low (collision)
  worstUnder = Math.max(worstUnder, under); worstOver = Math.max(worstOver, over); cnt++;
  if (under > 0.01) console.log('UNDER', t, under, JSON.stringify(pose), n, rise, going);
}
console.log({ cnt, worstUnder, worstOver });
