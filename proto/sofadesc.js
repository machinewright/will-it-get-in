import { solveTwoStage, reachOf, smooth } from '../src/plan.js';
import { stairs } from '../src/scene.js';
import { sofa } from '../src/shape.js';
import { describe } from '../src/describe.js';
const d = sofa({ L: 200, D: 90, H: 85, seatH: 45, backT: 20, armH: 62, armW: 15 });
const sc = stairs({ w: 90, n: 13, rise: 20, going: 22.5, headroom: 200, hc: 240, b: 95, turn: true, reach: reachOf(d) });
const r = solveTwoStage(d, sc); const p = smooth(d, sc, r.path);
console.log(describe(r.before, p, sc.spot, d, sc).join('\n'));
