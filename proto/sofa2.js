import { solveTwoStage as solve, reachOf, smooth } from '../src/plan.js';
import { roomDoor, sideDoor } from '../src/scene.js';
import { sofa } from '../src/shape.js';
import { describe } from '../src/describe.js';
const S = sofa({ L: 200, D: 85, H: 78, seatH: 42, backT: 16, armH: 0, armW: 0 });
for (const [n, mk] of [['room door 80', (r) => roomDoor({ b: 80, doorH: 200, t: 12, ceiling: 240, reach: r })], ['side door 80 hall 120', (r) => sideDoor({ a: 120, b: 80, doorH: 200, t: 12, past: 60, ceiling: 240, reach: r })]]) {
  const sc = mk(reachOf(S)); const t0 = Date.now(); const r = solve(S, sc, { maxStates: 4e6 });
  console.log(n, r.found, r.capped, r.explored, Date.now() - t0 + 'ms');
  if (r.found) console.log('   ', describe(r.before, smooth(S, sc, r.path), sc.spot).join(' / '));
}
