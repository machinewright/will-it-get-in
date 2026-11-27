import { solve, reachOf } from '../src/plan.js';
import { roomDoor } from '../src/scene.js';
import { verifyPath } from '../test/verify.test.js';
for (const d of [[180, 75, 75], [180, 85, 75], [180, 85, 82], [210, 95, 85], [200, 78, 76]]) {
  const sc = roomDoor({ b: 80, doorH: 200, t: 10, ceiling: 240, reach: reachOf(d) }); const t0 = Date.now();
  const r = solve(d, sc); const ms = Date.now() - t0;
  console.log(d.join('x'), r.found, r.explored, r.seeds, ms + 'ms', r.found ? verifyPath(r, d, sc) : '');
}
