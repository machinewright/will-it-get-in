import { solve, reachOf } from '../src/plan.js';
import { corner, sideDoor } from '../src/scene.js';
import { verifyPath } from '../test/verify.test.js';
const cases = [
  ['A240', [200, 75, 70], (r) => corner({ a: 80, b: 80, ceiling: 240, reach: r })],
  ['A205', [200, 75, 70], (r) => corner({ a: 80, b: 80, ceiling: 205, reach: r })],
  ['D1', [180, 75, 75], (r) => sideDoor({ a: 400, b: 80, doorH: 200, t: 10, past: 200, ceiling: 240, reach: r })],
  ['D2', [180, 85, 75], (r) => sideDoor({ a: 400, b: 80, doorH: 200, t: 10, past: 200, ceiling: 240, reach: r })],
  ['D3', [180, 85, 82], (r) => sideDoor({ a: 400, b: 80, doorH: 200, t: 10, past: 200, ceiling: 240, reach: r })],
];
for (const [n, d, mk] of cases) {
  const sc = mk(reachOf(d)); let t0 = Date.now(); const r = solve(d, sc); const ts = Date.now() - t0;
  t0 = Date.now(); const v = r.found ? verifyPath(r, d, sc) : '-'; console.log(n, r.found, r.explored, ts + 'ms', 'verify', v, Date.now() - t0 + 'ms', r.path?.length);
}
