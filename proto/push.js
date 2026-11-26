import { orient, rotation, HOLDS, clear, extent } from '../src/geom.js';
import { corner } from '../src/scene.js';
import { reachOf } from '../src/plan.js';
const [len, wid, hgt, a, b] = [105, 70, 60, 90, 90], m = 1.5, dims = [len, wid, hgt];
const sc = corner({ a, b, ceiling: hgt + 2, reach: reachOf(dims) });
let bad = 0;
for (let k = 0; k <= 36; k++) {
  const psi = (k * 2.5) * Math.PI / 180, o = orient(dims, rotation(HOLDS.find((h) => h.a === 0 && h.v === 2), psi, 0));
  const x = m - o.minx, y = b - m - o.maxy;
  const ok = clear(sc, o, x, y, m), okm = clear(sc, o, x, y, m - 0.01);
  if (!ok) { bad++; console.log('blocked at', k * 2.5, 'deg', x.toFixed(2), y.toFixed(2), 'with m-0.01:', okm); }
}
console.log('bad', bad);
