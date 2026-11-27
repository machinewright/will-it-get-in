// Timing: straight-hallway shortcut vs plain search, on everyday cases (solveTwoStage, like the page).
import { solveTwoStage, reachOf } from '../src/plan.js';
import { sideDoor, corner, stairs } from '../src/scene.js';
import { sofa } from '../src/shape.js';
const S = sofa({ L: 200, D: 90, H: 85, seatH: 45, backT: 20, armH: 62, armW: 15 });
const cases = [
  ['box corner yes', [200, 70, 80], (r) => corner({ a: 90, b: 90, ceiling: 240, reach: r })],
  ['box corner tight', [220, 70, 80], (r) => corner({ a: 80, b: 80, ceiling: 240, reach: r })],
  ['box corner no', [260, 75, 80], (r) => corner({ a: 80, b: 80, ceiling: 240, reach: r })],
  ['box door yes', [200, 70, 80], (r) => sideDoor({ a: 100, b: 80, doorH: 200, t: 12, past: 100, ceiling: 240, reach: r })],
  ['box door tight', [210, 72, 75], (r) => sideDoor({ a: 90, b: 78, doorH: 200, t: 12, past: 50, ceiling: 240, reach: r })],
  ['box door no', [240, 74, 75], (r) => sideDoor({ a: 85, b: 78, doorH: 200, t: 12, past: 0, ceiling: 240, reach: r })],
  ['sofa corner', S, (r) => corner({ a: 90, b: 90, ceiling: 240, reach: r })],
  ['sofa door 100/80', S, (r) => sideDoor({ a: 100, b: 80, doorH: 200, t: 12, past: 100, ceiling: 240, reach: r })],
  ['box stairs turn', [190, 85, 80], (r) => stairs({ w: 90, n: 13, rise: 19, going: 25, headroom: 200, hc: 240, b: 100, turn: true, reach: r })],
  ['box stairs straight', [200, 90, 85], (r) => stairs({ w: 85, n: 13, rise: 19, going: 25, headroom: 200, hc: 240, b: 0, turn: false, reach: r })],
];
const only = process.argv[2];
for (const [name, d, sc] of cases) {
  const out = [name];
  for (const corridor of [true, false]) {
    if (only && only !== String(corridor)) continue;
    const t = Date.now(), r = solveTwoStage(d, sc(reachOf(d)), { maxStates: 3e6, corridor });
    out.push(`${corridor ? 'new' : 'old'}: ${r.found ? 'YES' : r.capped ? 'CAP' : 'no'} ${r.explored} ${Date.now() - t}ms`);
  }
  console.log(out.join(' | '));
}
