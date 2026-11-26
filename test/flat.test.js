// Carrying a box flat round a hallway corner has an exact answer, computed here without any of the app's code.
//
// At each angle, slide the box as far as it goes into the outside corner (towards both outside walls). Sliding that
// way never brings it closer to the inside corner, so if the box fits at that angle anywhere, it fits there. And
// that pushed position changes smoothly with the angle, so: the box can be carried round flat exactly when, at every
// angle from "along the first hallway" to "along the second", the pushed box misses the inside corner.
// The search must agree: never find a way when this says no, and find one when there is room to spare.

import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, reachOf } from '../src/plan.js';
import { corner } from '../src/scene.js';

// Polygon (array of [x, y]) clipped to a half-plane keep(p) with boundary crossing found by cross(p, q).
function clip(poly, keep, cross) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if (keep(p)) out.push(p);
    if (keep(p) !== keep(q)) out.push(cross(p, q));
  }
  return out;
}
const area = (P) => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

// Does an len x wid rectangle at angle th (0 = along the second hallway, 90 deg = along the first), pushed into the
// outside corner, miss the inside corner? Hallways a (first) and b (second) wide, walls m thicker on each side.
function fitsAt(len, wid, th, a, b, m) {
  const ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
  let P = [];
  for (const [s, t] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) P.push([s * len / 2 * ux + t * wid / 2 * nx, s * len / 2 * uy + t * wid / 2 * ny]);
  const minx = Math.min(...P.map((p) => p[0])), maxy = Math.max(...P.map((p) => p[1]));
  P = P.map(([x, y]) => [x - minx + m, y - maxy + b - m]);
  // The inside corner, grown by m: x > a - m and y < m.
  const X = a - m, Yc = m;
  P = clip(P, (p) => p[0] > X, (p, q) => { const t = (X - p[0]) / (q[0] - p[0]); return [X, p[1] + t * (q[1] - p[1])]; });
  if (P.length) P = clip(P, (p) => p[1] < Yc, (p, q) => { const t = (Yc - p[1]) / (q[1] - p[1]); return [p[0] + t * (q[0] - p[0]), Yc]; });
  return P.length < 3 || area(P) < 1e-9;
}

// The box may come up the first hallway at any angle at which it fits there (its width across the hallway is at
// most a - 2m), and must leave at any angle at which it fits the second. It goes round iff one unbroken range of
// angles at which the pushed box misses the corner contains both kinds. Angles run over half a turn (a box turned
// by 180 degrees is the same box), sampled finely.
function goesRound(len, wid, a, b, m, N = 3600) {
  const ok = [], S = [], G = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI, c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
    ok.push(fitsAt(len, wid, th, a, b, m));
    S.push(len * c + wid * s <= a - 2 * m); // width across the first hallway (it runs along y)
    G.push(len * s + wid * c <= b - 2 * m); // width across the second (along x)
  }
  if (ok.every(Boolean)) return S.some(Boolean) && G.some(Boolean);
  // Walk each unbroken run of ok angles (on a circle).
  const start = ok.indexOf(false);
  let hasS = false, hasG = false;
  for (let i = 1; i <= N; i++) {
    const k = (start + i) % N;
    if (!ok[k]) { hasS = hasG = false; continue; }
    hasS ||= S[k]; hasG ||= G[k];
    if (hasS && hasG) return true;
  }
  return false;
}

// Longest box of width wid that goes round flat.
export function longestFlat(wid, a, b, m) {
  let lo = wid, hi = 2000;
  if (!goesRound(lo, wid, a, b, m)) return 0;
  for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (goesRound(mid, wid, a, b, m)) lo = mid; else hi = mid; }
  return lo;
}

test('the exact rule reproduces the textbook ladder: (a^2/3 + b^2/3)^3/2', () => {
  for (const [a, b] of [[100, 100], [80, 120], [90, 150]]) {
    const ladder = (a ** (2 / 3) + b ** (2 / 3)) ** 1.5;
    assert.ok(Math.abs(longestFlat(1e-6, a, b, 0) - ladder) < 0.05, `${a}/${b}: ${longestFlat(1e-6, a, b, 0)} vs ${ladder}`);
  }
});

// Only flat, upright poses fit under a ceiling just above the box's height (tilting or turning it on its side would
// hit the ceiling), so the search is held to the flat case.
function flatOnly(len, wid, hgt, a, b) {
  const dims = [len, wid, hgt];
  return solve(dims, corner({ a, b, ceiling: hgt + 2, reach: reachOf(dims) }), { margin: 1, slack: 0.5 });
}

test('flat round a corner: the search agrees with the exact rule to within 1 cm', () => {
  const cases = [[90, 80, 100, 100], [70, 60, 90, 90], [60, 55, 80, 110], [95, 90, 100, 120], [50, 45, 80, 80]];
  // Plus random hallways and boxes (fixed seed).
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 6; i++) {
    const a = 70 + Math.round(rnd() * 60), b = 70 + Math.round(rnd() * 60);
    const wid = Math.round(30 + rnd() * (Math.min(a, b) - 35)), hgt = Math.round(wid * (0.5 + rnd() * 0.4));
    cases.push([wid, hgt, a, b]);
  }
  for (const [wid, hgt, a, b] of cases) {
    const lmax = longestFlat(wid, a, b, 1.5);
    const tooLong = flatOnly(lmax + 0.3, wid, hgt, a, b);
    assert.equal(tooLong.found, false, `w${wid} ${a}/${b}: found a way for ${lmax + 0.3} > exact ${lmax.toFixed(1)}`);
    const shorter = flatOnly(lmax - 1, wid, hgt, a, b);
    assert.equal(shorter.found, true, `w${wid} ${a}/${b}: no way for ${lmax - 1} (exact ${lmax.toFixed(1)})`);
  }
});
