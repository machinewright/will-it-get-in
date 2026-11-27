import { solveTwoStage, solve, reachOf } from '../src/plan.js';
import { sideDoor, corner, stairs } from '../src/scene.js';
import { sofa } from '../src/shape.js';
const d = sofa({ L: 200, D: 90, H: 85, seatH: 45, backT: 20, armH: 62, armW: 15 });
const which = process.argv[2] ?? 'both';
for (const [a, b] of [[100, 80], [90, 80], [110, 76], [85, 85]]) {
  for (const corridor of which === 'both' ? [true, false] : [true]) {
    const t = Date.now(), r = solveTwoStage(d, sideDoor({ a, b, doorH: 200, t: 12, past: 100, ceiling: 240, reach: reachOf(d) }), { maxStates: 3e6, corridor });
    console.log('hall', a, 'door', b, corridor ? 'COR' : 'old', r.found, r.explored, r.capped, Date.now() - t, 'ms');
  }
}
