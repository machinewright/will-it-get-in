import { solve, reachOf } from '../src/plan.js';
import { corner, sideDoor } from '../src/scene.js';
const [L, D, H, a, b, ceil] = process.argv.slice(2).map(Number);
const dims = [L, D, H], reach = reachOf(dims);
const t0 = Date.now();
const r = solve(dims, corner({ a, b, ceiling: ceil, reach }));
console.log({ found: r.found, explored: r.explored, seeds: r.seeds, ms: Date.now() - t0, len: r.path?.length });
if (r.path) { const ps = r.path.map((p) => `${p.hold}:${(p.pitch * 180 / Math.PI).toFixed(0)}`); console.log([...new Set(ps)].join(' ')); }
