import { solve, reachOf, smooth } from '../src/plan.js';
import { corner, sideDoor, roomDoor } from '../src/scene.js';
import { describe } from '../src/describe.js';
const cases = [
  ['sofa 200x90x85, corner 100/100', [200, 90, 85], (r) => corner({ a: 100, b: 100, ceiling: 240, reach: r })],
  ['wardrobe-ish 150x60x50, corner 90/90', [150, 60, 50], (r) => corner({ a: 90, b: 90, ceiling: 240, reach: r })],
  ['180x75x75 side door', [180, 75, 75], (r) => sideDoor({ a: 120, b: 80, doorH: 200, t: 10, past: 200, ceiling: 240, reach: r })],
  ['180x85x75 room door', [180, 85, 75], (r) => roomDoor({ b: 80, doorH: 200, t: 10, ceiling: 240, reach: r })],
  ['sofa 210x95x85 corner 110/110 ceil 230', [210, 95, 85], (r) => corner({ a: 110, b: 110, ceiling: 230, reach: r })],
];
for (const [n, d, mk] of cases) { const sc = mk(reachOf(d)); const r = solve(d, sc); console.log('\n' + n, r.found); if (r.found) console.log(describe(r.before, smooth(d, sc, r.path), sc.kind === 'corner' ? 'the corner' : 'the door').map((s, i) => `  ${i + 1}. ${s}`).join('\n')); }
