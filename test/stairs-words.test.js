// Stair steps say how the angle changes on the way up (review repro: the tilt eased from 35 to 15 degrees on the
// flight, but the steps only gave 35).
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveTwoStage, reachOf, smooth } from '../src/plan.js';
import { stairs } from '../src/scene.js';
import { sofa } from '../src/shape.js';
import { describe, posture } from '../src/describe.js';

test('stairs: the carry-up step gives the angle at the end of the flight too', () => {
  const d = sofa({ L: 200, D: 90, H: 85, seatH: 45, backT: 20, armH: 62, armW: 15 });
  const sc = stairs({ w: 90, n: 13, rise: 20, going: 22.5, headroom: 200, hc: 240, b: 95, turn: true, reach: reachOf(d) });
  const r = solveTwoStage(d, sc);
  assert.equal(r.found, true);
  const p = smooth(d, sc, r.path), steps = describe(r.before, p, sc.spot, d, sc);
  const up = steps.find((s) => s.startsWith('Carry it up the stairs'));
  assert.ok(up, steps.join(' / '));
  // The last pose on the stairs: its posture's angle must be the one the step ends with.
  const H = 13 * 20, last = p.filter((q) => q.y >= 0 && q.z < H - 0.01).at(-1);
  const ang = /(\d+)°/.exec(posture(last, d).text)?.[1];
  if (ang) assert.match(up, new RegExp(`${ang}°( on the way up)?\\.$`), steps.join(' / '));
});
