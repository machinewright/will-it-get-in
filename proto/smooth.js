import { solve, reachOf, smooth, straightClear } from '../src/plan.js';
import { corner, sideDoor } from '../src/scene.js';
import { verifyPath } from '../test/verify.test.js';
for (const [d, sc] of [[[200, 90, 85], (r) => corner({ a: 100, b: 100, ceiling: 240, reach: r })], [[180, 75, 75], (r) => sideDoor({ a: 120, b: 80, doorH: 200, t: 10, past: 200, ceiling: 240, reach: r })], [[150, 60, 50], (r) => corner({ a: 90, b: 90, ceiling: 240, reach: r })]]) {
  const scene = sc(reachOf(d)), r = solve(d, scene); const t0 = Date.now();
  const s = smooth(d, scene, r.path);
  console.log(r.path.length, '->', s.length, Date.now() - t0 + 'ms', verifyPath({ ...r, path: s }, d, scene));
}
