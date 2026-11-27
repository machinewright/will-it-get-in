import { solve, reachOf } from '../src/plan.js';
import { roomDoor, corner, sideDoor } from '../src/scene.js';
const cases = [
  ['US couch, door +12', [84 * 2.54, 38 * 2.54, 34 * 2.54], (r) => roomDoor({ b: 32 * 2.54 + 12, doorH: 80 * 2.54, t: 5 * 2.54, ceiling: 96 * 2.54, reach: r })],
  ['US couch, door +8', [84 * 2.54, 38 * 2.54, 34 * 2.54], (r) => roomDoor({ b: 32 * 2.54 + 8, doorH: 80 * 2.54, t: 5 * 2.54, ceiling: 96 * 2.54, reach: r })],
  ['200x78x76 room door 80', [200, 78, 76], (r) => roomDoor({ b: 80, doorH: 200, t: 10, ceiling: 240, reach: r })],
  ['180x75x75 room door 80', [180, 75, 75], (r) => roomDoor({ b: 80, doorH: 200, t: 10, ceiling: 240, reach: r })],
];
for (const [n, d, mk] of cases) for (const o of [{}, { yawSteps: 72, pitchSteps: 18 }, { yawSteps: 72, pitchSteps: 18, step: 5 }]) {
  const t0 = Date.now(); const r = solve(d, mk(reachOf(d)), { maxStates: 6e6, ...o });
  console.log(n.padEnd(26), JSON.stringify(o).padEnd(42), r.found, r.capped, r.explored, r.seeds, Date.now() - t0 + 'ms');
}
