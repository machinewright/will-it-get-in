// Runs the search off the main thread.
// In: { id, dims, kind, params }. Out: { id, type: 'result', ... } then { id, type: 'longest', ... }.
import { solveTwoStage as solve, reachOf, smooth } from './src/plan.js';
import { corner, sideDoor, roomDoor, stairs } from './src/scene.js';
import { describe } from './src/describe.js';
import { sofa } from './src/shape.js';

const BUILD = { corner, sideDoor, roomDoor, stairs: (p) => stairs({ ...p, turn: p.b > 0 }) };
const sceneFor = (kind, params, dims) => BUILD[kind]({ ...params, reach: reachOf(dims) });
const SOLVE = { maxStates: 3e6 };

self.onmessage = (e) => {
  const { id, kind, params, shape } = e.data;
  let dims = e.data.dims;
  try {
    if (shape) { // a sofa's shape instead of its box
      dims = sofa({ L: dims[0], D: dims[1], H: dims[2], ...shape });
      if (dims.error) { self.postMessage({ id, type: 'error', message: dims.error }); return; }
    }
    const t0 = performance.now();
    const scene = sceneFor(kind, params, dims);
    const r = solve(dims, scene, SOLVE);
    const path = r.found ? smooth(dims, scene, r.path) : null;
    self.postMessage({
      id, type: 'result', found: r.found, capped: r.capped, noStart: !r.found && !r.doorTooSmall && r.seeds === 0, doorTooSmall: !!r.doorTooSmall, explored: r.explored,
      ms: Math.round(performance.now() - t0), path, before: r.before ?? null,
      steps: r.found ? describe(r.before, path, scene.spot, dims) : null,
    });
    // When it doesn't get through: how much wider the tight spot would have to be (both hallways at a corner, the
    // door opening at a door), to the nearest cm.
    if (!r.found && !r.capped) {
      const keys = kind === 'corner' ? ['a', 'b'] : kind === 'stairs' ? (params.b > 0 ? ['w', 'b'] : ['w']) : ['b'];
      const wider = (k) => { const pp = { ...params }; for (const key of keys) pp[key] += k; const q = solve(dims, sceneFor(kind, pp, dims), { maxStates: 1.5e6 }); return q.capped ? null : q.found; };
      let lo = 0, hi = null;
      for (let k = r.doorTooSmall ? Math.ceil(Math.min(...dims) + 2 - params.b) : 5; k <= 160; k += 10) { const f = wider(k); if (f === null) break; if (f) { hi = k; break; } lo = k; }
      if (hi !== null) {
        while (hi - lo > 1) { const mid = Math.round((lo + hi) / 2), f = wider(mid); if (f === null) break; if (f) hi = mid; else lo = mid; }
        self.postMessage({ id, type: 'wider', by: hi, keys, to: keys.map((k2) => params[k2] + hi) });
      } else if (r.doorTooSmall) {
        self.postMessage({ id, type: 'wider', atLeast: Math.min(...dims) + 2 });
      }
    }
    // The longest box with the same depth and height that gets through (to the nearest cm), by halving.
    if (dims[0] < Math.max(dims[1], dims[2])) { self.postMessage({ id, type: 'longest', skip: true }); return; } // length isn't the longest side
    const fits = (len) => { const d = shape ? sofa({ L: len, D: dims[1], H: dims[2], ...shape }) : [len, dims[1], dims[2]]; if (d.error) return false; const q = solve(d, sceneFor(kind, params, d), { maxStates: 2e6 }); return q.capped ? null : q.found; };
    const floor = Math.max(dims[1], dims[2]);
    let lo, hi;
    if (r.found) {
      lo = dims[0]; hi = null;
      for (let L = dims[0] + 20; L <= 600; L += 40) { const f = fits(L); if (f === null) { self.postMessage({ id, type: 'longest', unsure: true }); return; } if (f) lo = L; else { hi = L; break; } }
      if (hi === null) { self.postMessage({ id, type: 'longest', atLeast: lo }); return; }
    } else if (r.capped) {
      self.postMessage({ id, type: 'longest', unsure: true }); return;
    } else {
      hi = dims[0];
      const f = fits(floor);
      if (f === null) { self.postMessage({ id, type: 'longest', unsure: true }); return; }
      if (!f) { self.postMessage({ id, type: 'longest', none: true, floor }); return; }
      lo = floor;
    }
    while (hi - lo > 1) {
      const mid = Math.round((lo + hi) / 2), f = fits(mid);
      if (f === null) { self.postMessage({ id, type: 'longest', between: [lo, hi] }); return; }
      if (f) lo = mid; else hi = mid;
    }
    self.postMessage({ id, type: 'longest', value: lo });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err && err.message || err) });
  }
};
