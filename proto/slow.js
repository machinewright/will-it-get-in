import { solve, reachOf } from '../src/plan.js';
import { corner, sideDoor } from '../src/scene.js';
for (const [n, d, mk] of [
  ['wide side door', [250, 90, 88], (r) => sideDoor({ a: 150, b: 85, doorH: 200, t: 12, past: 0, ceiling: 240, reach: r })],
  ['wide corner', [260, 95, 88], (r) => corner({ a: 140, b: 140, ceiling: 240, reach: r })],
  ['wide corner low', [300, 95, 88], (r) => corner({ a: 150, b: 130, ceiling: 240, reach: r })],
]) { const t0 = Date.now(); const r = solve(d, mk(reachOf(d)), { maxStates: 4e6 }); console.log(n, r.found, r.capped, r.explored, Date.now() - t0 + 'ms'); }
