import { solveTwoStage, reachOf, smooth } from '../src/plan.js';
import { stairs } from '../src/scene.js';
import { sofa } from '../src/shape.js';
import { describe } from '../src/describe.js';
const cases = [
 ['box190x50x40 straight', [190,50,40], 85, 0],
 ['box200x80x80 turn', [200,80,80], 85, 90],
 ['sofa turn', sofa({ L: 200, D: 90, H: 85, seatH: 45, backT: 20, armH: 62, armW: 15 }), 90, 95],
 ['sofa180 turn', sofa({ L: 180, D: 85, H: 80, seatH: 42, backT: 18 }), 85, 90],
];
for (const [nm, d, w, b] of cases) {
  const sc = stairs({ w, n: 13, rise: 20, going: 22.5, headroom: 200, hc: 240, b, turn: b > 0, reach: reachOf(d) });
  const r = solveTwoStage(d, sc, { maxStates: 2e6 });
  console.log('==', nm, r.found);
  if (!r.found) continue;
  const p = smooth(d, sc, r.path);
  console.log(describe(r.before, p, sc.spot, d, sc).map((s, i) => (i + 1) + '. ' + s).join('\n'));
  console.log(p.map(q => `(${q.x.toFixed(0)},${q.y.toFixed(0)}) z${q.z.toFixed(0)} yaw${(q.yaw*57.3).toFixed(0)} p${(q.pitch*57.3).toFixed(0)} h${q.hold}`).join(' | '));
}
