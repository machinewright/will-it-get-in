import { solve, reachOf, smooth } from '../src/plan.js';
import { corner } from '../src/scene.js';
import { posture } from '../src/describe.js';
import { HOLDS } from '../src/geom.js';
const d = [200, 90, 85], sc = corner({ a: 100, b: 100, ceiling: 240, reach: reachOf(d) }); const r = solve(d, sc);
for (const p of smooth(d, sc, r.path)) console.log(p.x.toFixed(0), p.y.toFixed(0), JSON.stringify(HOLDS[p.hold]), (p.yaw * 57.3).toFixed(0), (p.pitch * 57.3).toFixed(0), posture(p).text);
