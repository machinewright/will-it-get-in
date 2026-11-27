import { solveTwoStage as solve, reachOf } from '../src/plan.js';
import { stairs } from '../src/scene.js';
const [D, H, b] = [60, 60, 90];
const sc = (d) => stairs({ w: 85, n: 13, rise: 20, going: 22.5, headroom: 200, hc: 240, b, turn: b > 0, reach: reachOf(d) });
const t0 = Date.now();
for (const L of [180, 200, 220, 260, 300]) { const t = Date.now(), d = [L, D, H], q = solve(d, sc(d), { maxStates: 2e6 }); console.log(L, q.found, q.capped, q.explored, Date.now() - t, 'ms'); }
console.log('total', Date.now() - t0);
