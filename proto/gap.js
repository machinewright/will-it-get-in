import { solve, reachOf } from '../src/plan.js';
import { corner } from '../src/scene.js';
import { longestFlat } from '../test/flat.test.js';
const opts = JSON.parse(process.argv[2] || '{}');
const cases = [[90, 80, 100, 100], [70, 60, 90, 90], [60, 55, 80, 110], [95, 90, 100, 120], [50, 45, 80, 80]];
for (const [wid, hgt, a, b] of cases) {
  const ex = longestFlat(wid, a, b, 1.5);
  const f = (len) => { const d = [len, wid, hgt]; return solve(d, corner({ a, b, ceiling: hgt + 2, reach: reachOf(d) }), { margin: 1, slack: 0.5, ...opts }).found; };
  let lo = wid, hi = ex + 10; const t0 = Date.now();
  for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (f(mid)) lo = mid; else hi = mid; }
  console.log(`w${wid} ${a}/${b}: exact ${ex.toFixed(1)} search ${lo.toFixed(1)} gap ${(ex - lo).toFixed(1)}  ${Date.now() - t0}ms`);
}
