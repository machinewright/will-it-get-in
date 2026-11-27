import { solveTwoStage, reachOf, smooth } from '../src/plan.js';
import { stairs } from '../src/scene.js';
import { sofa } from '../src/shape.js';
import { checkPath } from './review-check.js';
let seed = +process.argv[2] || 1, N = +process.argv[3] || 30;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const R = (a, b) => a + rnd() * (b - a);
let found = 0, bad = 0;
for (let i = 0; i < N; i++) {
  const isSofa = rnd() < 0.5;
  const d = isSofa ? sofa({ L: R(120, 190), D: R(75, 100), H: R(70, 95), seatH: R(35, 48), backT: R(12, 25), armH: rnd() < 0.5 ? 0 : R(55, 70), armW: R(8, 18) }) : [R(70, 200), R(35, 90), R(30, 80)];
  if (d.error) continue;
  const rise = R(12, 30), going = R(14, 35), n = Math.round(R(2, 5)), hc = R(200, 250);
  const hmin = hc - n * rise, hmax = hc - rise;
  const p = { w: R(70, 110), n, rise, going, headroom: Math.max(hmin, Math.min(hmax, R(hmin - 5, hmax + 5))), hc, b: R(70, 120), turn: rnd() < 0.5 };
  const sc = stairs({ ...p, reach: reachOf(d) });
  const r = solveTwoStage(d, sc, { maxStates: 1.5e6 });
  if (!r.found) continue;
  found++;
  for (const [nm, path] of [['raw', r.path], ['smooth', smooth(d, sc, r.path)]]) {
    const e = checkPath(d, sc, path);
    if (e) { bad++; console.log('BAD', i, nm, isSofa ? 'sofa' : 'box', JSON.stringify(p), JSON.stringify(isSofa ? d.parts : d), e); }
  }
}
console.log('found', found, 'bad', bad);
