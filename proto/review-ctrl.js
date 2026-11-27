import { solveTwoStage, reachOf, smooth, liftAt } from '../src/plan.js';
import { stairs } from '../src/scene.js';
import { checkPath, checkPose, solids } from './review-check.js';
const d = [190, 50, 40];
const sc = stairs({ w: 85, n: 13, rise: 20, going: 22.5, headroom: 200, hc: 240, b: 90, turn: false, reach: reachOf(d) });
const r = solveTwoStage(d, sc); console.log(r.found, r.path.length, checkPath(d, sc, r.path));
// negative control: lower item by 1.5 cm
const sc2 = { ...sc, ramp: { ...sc.ramp, rise: sc.ramp.rise - 1.5 } };
console.log('control (should fail):', checkPath(d, sc2, r.path));
