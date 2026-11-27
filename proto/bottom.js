import { solveTwoStage, reachOf } from '../src/plan.js';
import { stairs } from '../src/scene.js';
for (const [L, D, H, a, b] of [[200, 90, 80, 85, 90], [200, 90, 80, 150, 90], [200, 90, 80, 300, 90], [230, 85, 80, 85, 0], [230, 85, 80, 200, 0]]) {
  const d = [L, D, H], sc = stairs({ w: 85, n: 13, rise: 20, going: 22.5, headroom: 200, hc: 240, b, a, turn: b > 0, reach: reachOf(d) });
  const t = Date.now(), r = solveTwoStage(d, sc, { maxStates: 3e6 });
  console.log(d, 'a', a, 'b', b, r.found, r.explored, r.capped, Date.now() - t, 'ms');
}
