import { solve, reachOf } from '../src/plan.js';
import { sideDoor } from '../src/scene.js';
import { orient, rotation, HOLDS, clear, extent } from '../src/geom.js';
const d = [180, 75, 75], sc = sideDoor({ a: 120, b: 80, doorH: 200, t: 10, past: 200, ceiling: 240, reach: reachOf(d) });
const h = HOLDS.findIndex((x) => x.a === 0 && x.v === 2);
const o = orient(d, rotation(HOLDS[h], 0, Math.PI / 2));
console.log('on end top', o.top, o.minx, o.maxx, o.miny, o.maxy);
for (const [x, y] of [[60, 40], [125, 40], [170, 40]]) console.log(x, y, clear(sc, o, x, y, 1.5), sc.goal(extent(o, x, y)), sc.inside(x, y));
for (const tg of ['bfs']) { const s2 = { ...sc, togo: () => 0 }; const t0 = Date.now(); const r = solve(d, s2, { maxStates: 6e6 }); console.log(tg, r.found, r.explored, r.capped, Date.now() - t0); }
