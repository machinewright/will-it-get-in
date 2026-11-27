import { solveTwoStage, reachOf, smooth } from '../src/plan.js';
import { stairs } from '../src/scene.js';
import { sofa } from '../src/shape.js';
import { checkPath } from './review-check.js';
const items = [
  ['box 200x80x70', [200, 80, 70]],
  ['box 180x90x45', [180, 90, 45]],
  ['sofa arms', sofa({ L: 200, D: 90, H: 85, seatH: 45, backT: 20, armH: 62, armW: 15 })],
  ['sofa noarm', sofa({ L: 190, D: 85, H: 80, seatH: 42, backT: 18 })],
];
const flights = [
  ['hr-min(yb=0)', { n: 13, rise: 20, going: 22.5, hc: 240, head: 'min' }],
  ['hr-max(yb=Y0)', { n: 13, rise: 20, going: 22.5, hc: 240, head: 'max' }],
  ['steep', { n: 15, rise: 23, going: 19, hc: 250, head: 'mid' }],
  ['shallow', { n: 10, rise: 15, going: 30, hc: 230, head: 'mid' }],
];
const only = process.argv[2];
for (const [iname, d] of items) for (const [fname, f] of flights) for (const turn of [false, true]) {
  if (only && !(iname + fname).includes(only)) continue;
  const hmax = f.hc - f.rise, hmin = f.hc - f.n * f.rise, headroom = f.head === 'min' ? hmax : f.head === 'max' ? hmin : (hmin + hmax) / 2;
  const mk = (w) => stairs({ w, n: f.n, rise: f.rise, going: f.going, headroom, hc: f.hc, b: 90, turn, reach: reachOf(d) });
  let lo = 40, hi = 130, best = null;
  const tryw = (w) => { const sc = mk(w), r = solveTwoStage(d, sc, { maxStates: 1e6 }); return r.found ? { sc, r } : null; };
  if (!tryw(hi)) { console.log(iname, fname, turn, 'no path at w=130'); continue; }
  while (hi - lo > 4) { const m = (lo + hi) / 2, x = tryw(m); if (x) { hi = m; best = x; } else lo = m; }
  best = best ?? tryw(hi);
  for (const [nm, path] of [['raw', best.r.path], ['smooth', smooth(d, best.sc, best.r.path)]]) {
    const e = checkPath(d, best.sc, path, 0.2);
    console.log(iname, fname, turn ? 'turn' : 'straight', 'w=' + hi.toFixed(1), nm, e ?? 'ok');
  }
}
