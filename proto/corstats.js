import { solve, reachOf } from '../src/plan.js';
import { sideDoor } from '../src/scene.js';
import { sofa } from '../src/shape.js';
const d = sofa({ L: 200, D: 90, H: 85, seatH: 45, backT: 20, armH: 62, armW: 15 });
const a = 100, b = 80; const H = {};
let poke = 0, plain = 0, beyond = 0, room = 0;
const r = solve(d, sideDoor({ a, b, doorH: 200, t: 12, past: 100, ceiling: 240, reach: reachOf(d) }), { maxStates: 3e6, corridor: process.argv[2] !== 'old', stats: (o, x, y) => {
  const mx = x + o.maxx, my = y + o.maxy, ny = y + o.miny;
  if (mx > a + 12) room++; else if (mx > a - 1.5) poke++; else if (ny > b) beyond++; else plain++;
  const k = Math.floor(y / 20) * 20; H[k] = (H[k] ?? 0) + 1;
} });
console.log(r.found, r.explored, r.seeds, { poke, plain, beyond, room }); console.log(H);
