import { solve, reachOf } from '../src/plan.js';
import { roomDoor } from '../src/scene.js';
const d = [84 * 2.54, 38 * 2.54, 34 * 2.54];
for (const k of [8, 12, 18]) { const t0 = Date.now(); const r = solve(d, roomDoor({ b: 32 * 2.54 + k, doorH: 80 * 2.54, t: 5 * 2.54, ceiling: 96 * 2.54, reach: reachOf(d) }), { maxStates: 4e6 }); console.log(k, r.found, r.capped, r.explored, r.seeds, Date.now() - t0 + 'ms'); }
