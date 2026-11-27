import { solve, reachOf } from '../src/plan.js';
import { sideDoor } from '../src/scene.js';
import { HOLDS } from '../src/geom.js';
const d = [180, 75, 75], sc = sideDoor({ a: 120, b: 80, doorH: 200, t: 10, past: 200, ceiling: 240, reach: reachOf(d) });
const r = solve(d, sc, { maxStates: 3e5, debug: true }), D = r.debug;
const h = HOLDS.findIndex((x) => x.a === 0 && x.v === 2), id = D.oid(h, 0, 36);
console.log('enter', D.enter(id), 'seed', sc.seed);
const P = (x, y) => D.posAt[Math.round((x - D.x0) / D.step) + Math.round((y - D.y0) / D.step) * D.GW];
let prev = null;
for (const [x, y] of [[60, sc.seed.y], [60, -100], [60, 0], [60, 40], [100, 40], [125, 40], [150, 40], [170, 40]]) {
  const pos = P(x, y);
  console.log(x, y, 'pos', pos, pos >= 0 && D.X(id, pos), pos >= 0 && D.Y(id, pos), 'free', pos >= 0 && D.free(id, pos), 'seen', pos >= 0 && D.isSeen(id, pos));
}
