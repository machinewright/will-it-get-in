import { solve, reachOf } from '../src/plan.js';
import { stairs, corner } from '../src/scene.js';
import { sofa } from '../src/shape.js';
const d = sofa({ L: 200, D: 90, H: 85, seatH: 45, backT: 20, armH: 62, armW: 15 });
for (const w of [80, 84, 86.36, 88, 92]) {
  const r1 = solve(d, corner({ a: w, b: 120, ceiling: 240, reach: reachOf(d) }), { step: 5, yawSteps: 72, pitchSteps: 18, maxStates: 3e5 });
  console.log('corner a=', w, 'seeds', r1.seeds, r1.found);
}
