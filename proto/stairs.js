import { solveTwoStage, solve, reachOf, smooth } from '../src/plan.js';
import { stairs } from '../src/scene.js';
const [L, D, H, w = 85, hr = 200, turn = '1', b = 90] = process.argv.slice(2).map(Number);
const dims = [L, D, H];
const sc = stairs({ w, n: 13, rise: 20, going: 22.5, headroom: hr, hc: 240, b, turn: turn === 1, reach: reachOf(dims) });
const t = Date.now();
const r = solveTwoStage(dims, sc);
console.log(dims, 'w', w, 'hr', hr, 'turn', turn, '->', r.found, 'explored', r.explored, 'capped', r.capped, (Date.now() - t) + 'ms');
if (r.found) { const p = smooth(dims, sc, r.path); for (const q of p) console.log(q.x.toFixed(1), q.y.toFixed(1), (q.z ?? 0).toFixed(1), q.hold, (q.yaw * 57.3).toFixed(0), (q.pitch * 57.3).toFixed(0)); }
import { describe } from '../src/describe.js';
if (r.found) console.log(describe(r.before, smooth(dims, sc, r.path), sc.spot, dims, sc).join('\n'));
