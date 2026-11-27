// Runs the search off the main thread.
// In: { id, dims, kind, params }. Out: { id, type: 'result', ... } then { id, type: 'longest', ... }.
import { solve, reachOf, smooth } from './src/plan.js';
import { corner, sideDoor, roomDoor } from './src/scene.js';
import { describe } from './src/describe.js';

const BUILD = { corner, sideDoor, roomDoor };
const sceneFor = (kind, params, dims) => BUILD[kind]({ ...params, reach: reachOf(dims) });
const SOLVE = { maxStates: 4e6 };

self.onmessage = (e) => {
  const { id, dims, kind, params } = e.data;
  try {
    const t0 = performance.now();
    const scene = sceneFor(kind, params, dims);
    const r = solve(dims, scene, SOLVE);
    const path = r.found ? smooth(dims, scene, r.path) : null;
    self.postMessage({
      id, type: 'result', found: r.found, capped: r.capped, doorTooSmall: !!r.doorTooSmall, explored: r.explored,
      ms: Math.round(performance.now() - t0), path, before: r.before ?? null,
      steps: r.found ? describe(r.before, path, scene.spot) : null,
    });
    // The longest box with the same depth and height that gets through (to the nearest cm), by halving.
    const fits = (len) => { const d = [len, dims[1], dims[2]]; const q = solve(d, sceneFor(kind, params, d), SOLVE); return q.capped ? null : q.found; };
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
