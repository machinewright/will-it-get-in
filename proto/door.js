import { solve, reachOf } from '../src/plan.js';
import { sideDoor } from '../src/scene.js';
const [L, D, H, a, b, past] = process.argv.slice(2).map(Number);
const d = [L, D, H], t0 = Date.now();
const sc = sideDoor({ a, b, doorH: 200, t: 10, past, ceiling: 240, reach: reachOf(d) });
const r = solve(d, sc, { maxStates: 3e6 });
console.log(r.found, r.explored, r.seeds, r.capped, Date.now() - t0 + 'ms');
if (r.path) console.log(r.path.slice(-3));
