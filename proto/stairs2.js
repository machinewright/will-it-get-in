import { solveTwoStage, reachOf } from '../src/plan.js';
import { stairs } from '../src/scene.js';
import { sofa } from '../src/shape.js';
const cases = [
  ['box 200x90x80 turn 85/90', [200, 90, 80], 85, 90],
  ['box 220x95x85 turn 85/90', [220, 95, 85], 85, 90],
  ['box 260x90x90 straight', [260, 90, 90], 85, 0],
  ['sofa 200x90x85 straight', sofa({ L: 200, D: 90, H: 85, seatH: 45, backT: 20, armH: 62, armW: 15 }), 85, 0],
  ['sofa 200x90x85 turn 90/95', sofa({ L: 200, D: 90, H: 85, seatH: 45, backT: 20, armH: 62, armW: 15 }), 90, 95],
  ['sofa 180x85x80 turn 85/90', sofa({ L: 180, D: 85, H: 80, seatH: 42, backT: 18, armH: 0, armW: 0 }), 85, 90],
];
for (const [name, d, w, b] of cases) {
  const sc = stairs({ w, n: 13, rise: 20, going: 22.5, headroom: 200, hc: 240, b, turn: b > 0, reach: reachOf(d) });
  const t = Date.now(), r = solveTwoStage(d, sc, { maxStates: 3e6 });
  console.log(name, r.found, 'explored', r.explored, 'capped', r.capped, (Date.now() - t) + 'ms');
}
