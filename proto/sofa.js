import { solveTwoStage as solve, reachOf, smooth } from '../src/plan.js';
import { roomDoor, sideDoor, corner } from '../src/scene.js';
import { sofa } from '../src/shape.js';
import { describe } from '../src/describe.js';
const S = sofa({ L: 210, D: 95, H: 85, seatH: 45, backT: 20, armH: 62, armW: 15 });
const B = [210, 95, 85];
for (const [n, mk] of [['room door 80', (r) => roomDoor({ b: 80, doorH: 200, t: 12, ceiling: 240, reach: r })], ['room door 76', (r) => roomDoor({ b: 76, doorH: 200, t: 12, ceiling: 240, reach: r })], ['side door 80', (r) => sideDoor({ a: 110, b: 80, doorH: 200, t: 12, past: 60, ceiling: 240, reach: r })], ['corner 95/95', (r) => corner({ a: 95, b: 95, ceiling: 240, reach: r })]]) {
  for (const [k, d] of [['box', B], ['sofa', S]]) {
    const sc = mk(reachOf(d)); const t0 = Date.now(); const r = solve(d, sc, { maxStates: 4e6 });
    console.log(n.padEnd(14), k.padEnd(5), r.found, r.capped, r.explored, Date.now() - t0 + 'ms');
    if (r.found && k === 'sofa') console.log('   ', describe(r.before, smooth(d, sc, r.path), sc.spot).join(' / '));
  }
}
