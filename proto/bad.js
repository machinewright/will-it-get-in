import { solve, solveTwoStage, reachOf, smooth } from '../src/plan.js';
import { roomDoor } from '../src/scene.js';
import { verifyPath } from '../test/verify.test.js';
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 3; i++) {
  const L = 120 + Math.round(rnd() * 110), D = 50 + Math.round(rnd() * 50), H = 40 + Math.round(rnd() * 50);
  const dims = [L, D, H], ceiling = 200 + Math.round(rnd() * 60);
  let sc;
  if (i % 3 === 2) sc = roomDoor({ b: 70 + Math.round(rnd() * 25), doorH: 190 + Math.round(rnd() * 20), t: 1 + Math.round(rnd() * 25), ceiling, reach: reachOf(dims) });
  else if (i % 3 === 1) { rnd(); rnd(); continue; } else { for (let k = 0; k < 5; k++) rnd(); continue; }
  console.log(dims, sc.door, ceiling);
  const r = solveTwoStage(dims, sc);
  console.log('raw', verifyPath(r, dims, sc), 'smoothed', verifyPath({ ...r, path: smooth(dims, sc, r.path) }, dims, sc));
  console.log(r.path.slice(0, 3));
}
