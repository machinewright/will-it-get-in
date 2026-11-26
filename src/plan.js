// Find a way to carry a box through a scene, or report that none exists on the search grid.
//
// A pose is (centre x, y on the floor plan; hold; yaw; pitch), with the box's lowest point on the floor. Poses lie
// on a grid; neighbouring poses differ by one grid step in one coordinate, and a hold can change where two holds
// give the same orientation (lying flat, or standing on end). The search is breadth-first from poses deep in the
// place the box comes from, to any pose where it is entirely where it has to go.
//
// Why a found way is real and not just a chain of snapshots: every pose on it is clear by margin + d, and every move
// between neighbouring poses is checked at points so close together that no part of the box travels more than 2d
// between them. So at every moment in between, every point of the box is within d of a checked position, and the
// whole movement keeps at least `margin` from walls, door frame and ceiling.

import { HOLDS, rotation, rotationInto, orient, clear, extent } from './geom.js';

export const DEFAULTS = { step: 2.5, yawSteps: 144, pitchSteps: 36, margin: 1, slack: 0.5, maxStates: 30e6 };

export function reachOf(dims) { return Math.hypot(dims[0], dims[1], dims[2]) / 2; }

export function solve(dims, scene, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { step, yawSteps: NY, pitchSteps, margin, slack } = o;
  const NP = pitchSteps + 1; // pitch 0 .. 90 degrees inclusive
  const NH = HOLDS.length;
  const m = margin + slack;
  const reach = reachOf(dims);
  const dYaw = (2 * Math.PI) / NY, dPitch = Math.PI / 2 / pitchSteps;

  // Positions: grid points (centres) inside the scene's region.
  const { x0, x1, y0, y1 } = scene.bounds;
  const GW = Math.floor((x1 - x0) / step) + 1, GH = Math.floor((y1 - y0) / step) + 1;
  const posAt = new Int32Array(GW * GH).fill(-1);
  const px = [], py = [], pg = [];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = x0 + i * step, y = y0 + j * step;
    if (scene.inside(x, y) || scene.inside(x + step, y) || scene.inside(x, y + step) || scene.inside(x + step, y + step)) { posAt[i + j * GW] = px.length; px.push(x); py.push(y); pg.push(i + j * GW); }
  }
  const NPOS = px.length;

  // Orientations, built on demand.
  const NO = NH * NY * NP;
  const oris = new Array(NO);
  const ori = (id) => oris[id] ?? (oris[id] = orientAt(id));
  function angles(id) { const p = id % NP, y = ((id - p) / NP) % NY, h = Math.floor(id / (NP * NY)); return { h, yaw: y * dYaw, pitch: p * dPitch }; }
  // Each orientation gets its own copy of the position grid, shifted so that the box's left edge and far edge land
  // exactly `m` from the scene's snap walls. Then the box can be pressed against those walls at any angle, which is
  // what the tightest ways round need; a fixed grid of centre points would keep it up to a step away.
  const snap = scene.snap;
  const fmod = (v) => ((v % step) + step) % step;
  function orientAt(id) {
    const a = angles(id), oo = orient(dims, rotation(HOLDS[a.h], a.yaw, a.pitch));
    // (Plus 1.5 mm: a straight move between two pressed poses sags very slightly towards the wall, since the
    // pressed path curves; this keeps such moves clear.)
    oo.offx = snap ? fmod(snap.x + m + 0.15 - oo.minx - x0) : 0;
    oo.offy = snap ? fmod(snap.y - m - 0.15 - oo.maxy - y0) : 0;
    return oo;
  }
  const oid = (h, y, p) => (h * NY + y) * NP + p;

  // Hold changes: same orientation reached through two holds (flat: pitch 0; on end: pitch 90).
  const same = new Map(); // oid -> [oid...]
  for (const p of [0, NP - 1]) {
    const keyOf = new Map();
    for (let h = 0; h < NH; h++) for (let y = 0; y < NY; y++) {
      const id = oid(h, y, p), v = ori(id).verts, ks = [];
      for (let i = 0; i < 8; i++) ks.push(`${Math.round(v[3 * i] * 1e3)},${Math.round(v[3 * i + 1] * 1e3)},${Math.round(v[3 * i + 2] * 1e3)}`);
      const key = ks.sort().join(';');
      if (!keyOf.has(key)) keyOf.set(key, []);
      keyOf.get(key).push(id);
    }
    for (const ids of keyOf.values()) for (const id of ids) same.set(id, ids.filter((j) => j !== id));
  }

  // Visited sets, one bitset per orientation, allocated when first needed.
  const seen = new Array(NO);
  const words = (NPOS + 31) >>> 5;
  const isSeen = (id, pos) => { const s = seen[id]; return s !== undefined && (s[pos >>> 5] & (1 << (pos & 31))) !== 0; };
  const mark = (id, pos) => { (seen[id] ?? (seen[id] = new Int32Array(words)))[pos >>> 5] |= 1 << (pos & 31); };
  // Poses already found blocked (a blocked pose is proposed by many neighbours; test it once).
  const blocked = new Array(NO);
  const isBlocked = (id, pos) => { const s = blocked[id]; return s !== undefined && (s[pos >>> 5] & (1 << (pos & 31))) !== 0; };
  const markBlocked = (id, pos) => { (blocked[id] ?? (blocked[id] = new Int32Array(words)))[pos >>> 5] |= 1 << (pos & 31); };

  // Queue of states (orientation, position) with parents, for the way back.
  let cap = 1 << 16, qo = new Int32Array(cap), qp = new Int32Array(cap), par = new Int32Array(cap), n = 0;
  function push(id, pos, parent) {
    if (n === cap) { cap *= 2; for (const nm of ['qo', 'qp', 'par']) { const g = new Int32Array(cap); g.set(nm === 'qo' ? qo : nm === 'qp' ? qp : par); if (nm === 'qo') qo = g; else if (nm === 'qp') qp = g; else par = g; } }
    qo[n] = id; qp[n] = pos; par[n] = parent; mark(id, pos); hpush(n, togo(id, pos)); n++;
  }
  const X = (id, pos) => px[pos] + ori(id).offx, Y = (id, pos) => py[pos] + ori(id).offy;
  // Best-first: always expand the pose nearest the goal (by the scene's measure of how far the box still has to
  // go), so a way is usually found long before everything is explored. When there is no way, everything reachable
  // gets explored either way.
  let heap = new Int32Array(1 << 16), hkey = new Float64Array(1 << 16), hn = 0;
  function hpush(i, k) {
    if (hn === heap.length) { const a = new Int32Array(hn * 2); a.set(heap); heap = a; const b = new Float64Array(hn * 2); b.set(hkey); hkey = b; }
    let c = hn++;
    while (c > 0) { const pa = (c - 1) >> 1; if (hkey[pa] <= k) break; heap[c] = heap[pa]; hkey[c] = hkey[pa]; c = pa; }
    heap[c] = i; hkey[c] = k;
  }
  function hpop() {
    const top = heap[0], last = heap[--hn], lk = hkey[hn];
    let c = 0;
    for (;;) {
      let ch = 2 * c + 1;
      if (ch >= hn) break;
      if (ch + 1 < hn && hkey[ch + 1] < hkey[ch]) ch++;
      if (hkey[ch] >= lk) break;
      heap[c] = heap[ch]; hkey[c] = hkey[ch]; c = ch;
    }
    heap[c] = last; hkey[c] = lk;
    return top;
  }
  const togo = (id, pos) => scene.togo(extent(ori(id), X(id, pos), Y(id, pos)));

  const free = (id, pos) => clear(scene, ori(id), X(id, pos), Y(id, pos), m);

  const scratchR = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], scratchO = orient(dims, rotation(HOLDS[0], 0, 0));

  // A move from state A to state B (neighbours): check points along it.
  function moveClear(ida, posa, idb, posb) {
    const A = angles(ida), B = angles(idb);
    const xa = X(ida, posa), ya = Y(ida, posa), dx = X(idb, posb) - xa, dyy = Y(idb, posb) - ya;
    if (A.h !== B.h) { // same orientation through another hold: only the grid shift can differ
      if (Math.hypot(dx, dyy) < 1e-9) return true;
      const k = Math.ceil(Math.hypot(dx, dyy) / (2 * slack));
      for (let i = 1; i < k; i++) if (!clear(scene, ori(ida), xa + (i / k) * dx, ya + (i / k) * dyy, m)) return false;
      return true;
    }
    let dy = B.yaw - A.yaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
    const dp = B.pitch - A.pitch;
    // Longest path any point of the box can travel: translation + turning about the vertical + tilting (the tilt
    // also lifts or lowers the centre: at most the sum of the half sizes, < 2 * reach).
    const travel = Math.hypot(dx, dyy) + reach * Math.abs(dy) + 2.8 * reach * Math.abs(dp);
    const k = Math.ceil(travel / (2 * slack));
    for (let i = 1; i < k; i++) {
      const t = i / k;
      const oo = orient(dims, rotationInto(scratchR, HOLDS[A.h], A.yaw + t * dy, A.pitch + t * dp), scratchO);
      if (!clear(scene, oo, xa + t * dx, ya + t * dyy, m)) return false;
    }
    return true;
  }

  // Which orientations can the box be turned into in open space under this ceiling, starting upright (height
  // axis vertical)? Only those are allowed when it enters. Turning about the vertical and changing hold are free
  // there. Tilting a hold's axis up to pitch p makes the box dims[a] sin p + dims[v] cos p tall (whatever the yaw),
  // which peaks at the diagonal sqrt(dims[a]^2 + dims[v]^2) when tan p = dims[a] / dims[v]: so a tilt from p0 to
  // p1 fits exactly when that height stays under the ceiling over the whole range.
  const limit = scene.ceiling - m;
  const tallest = (hd, p0, p1) => {
    const A = dims[hd.a], V = dims[hd.v], peak = Math.atan2(A, V);
    const lo = Math.min(p0, p1), hi = Math.max(p0, p1);
    return peak > lo && peak < hi ? Math.hypot(A, V) : Math.max(A * Math.sin(lo) + V * Math.cos(lo), A * Math.sin(hi) + V * Math.cos(hi));
  };
  const enterHP = new Uint8Array(NH * NP), todo = []; // by hold and pitch (yaw doesn't matter)
  for (let h = 0; h < NH; h++) if (HOLDS[h].v === 2 && dims[2] <= limit) { enterHP[h * NP] = 1; todo.push(h * NP); }
  while (todo.length) {
    const k = todo.pop(), h = Math.floor(k / NP), p = k % NP;
    const next = [];
    for (const q of [p - 1, p + 1]) if (q >= 0 && q < NP && tallest(HOLDS[h], p * dPitch, q * dPitch) <= limit) next.push(h * NP + q);
    if (p === 0 || p === NP - 1) for (const j of same.get(oid(h, 0, p)) ?? []) next.push(Math.floor(j / (NP * NY)) * NP + p);
    for (const j of next) if (!enterHP[j]) { enterHP[j] = 1; todo.push(j); }
  }
  const enter = (id) => enterHP[Math.floor(id / (NP * NY)) * NP + (id % NP)] === 1;

  // Seeds: every clear pose on one row deep in the place the box comes from, in an orientation it can enter in.
  const jSeed = Math.round((scene.seedY - y0) / step);
  for (let id = 0; id < NO; id++) {
    const oo = ori(id);
    if (!enter(id)) continue;
    for (let i = 0; i < GW; i++) {
      const pos = posAt[i + jSeed * GW];
      if (pos < 0 || isSeen(id, pos)) continue;
      if (scene.start(extent(oo, X(id, pos), Y(id, pos))) && free(id, pos)) push(id, pos, -1);
    }
  }
  const seeds = n;

  let found = -1;
  while (hn > 0 && found < 0 && n < o.maxStates) {
    const me = hpop(), id = qo[me], pos = qp[me];
    const p = id % NP, y = ((id - p) / NP) % NY, h = Math.floor(id / (NP * NY));
    // Neighbours: shift by up to one step in x and y, turn by up to one step and tilt by up to one step, together
    // (the tightest ways round need sliding while turning), plus changes of hold.
    const cand = [];
    const g = pg[pos], gi = g % GW, gj = (g - gi) / GW;
    const me0 = ori(id);
    for (let dy = -1; dy <= 1; dy++) for (let dp = -1; dp <= 1; dp++) {
      const pp = p + dp;
      if (pp < 0 || pp >= NP) continue;
      const nid = oid(h, (y + dy + NY) % NY, pp), no = ori(nid);
      // Around the same centre, and around the cell that keeps the box's left and far edges where they are.
      const si = Math.round((me0.offx + me0.minx - no.offx - no.minx) / step), sj = Math.round((me0.offy + me0.maxy - no.offy - no.maxy) / step);
      for (const [ci, cj] of si || sj ? [[0, 0], [si, sj]] : [[0, 0]]) {
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!dy && !dp && !ci && !cj && !di && !dj) continue;
          const ii = gi + ci + di, jj = gj + cj + dj;
          if (ii < 0 || ii >= GW || jj < 0 || jj >= GH) continue;
          const q = posAt[ii + jj * GW];
          if (q >= 0) cand.push(nid, q);
        }
      }
    }
    for (const j of same.get(id) ?? []) cand.push(j, pos);
    for (let c = 0; c < cand.length; c += 2) {
      const nid = cand[c], npos = cand[c + 1];
      if (isSeen(nid, npos) || isBlocked(nid, npos)) continue;
      const no = ori(nid);
      if (no.top > scene.ceiling - m || !free(nid, npos)) { markBlocked(nid, npos); continue; }
      if (!moveClear(id, pos, nid, npos)) continue;
      push(nid, npos, me);
      if (scene.goal(extent(no, X(nid, npos), Y(nid, npos)))) { found = n - 1; break; }
    }
  }

  const result = { found: found >= 0, explored: n, seeds, capped: found < 0 && n >= o.maxStates, path: null };
  if (found >= 0) {
    const path = [];
    for (let i = found; i >= 0; i = par[i]) {
      const a = angles(qo[i]);
      path.push({ x: X(qo[i], qp[i]), y: Y(qo[i], qp[i]), hold: a.h, yaw: a.yaw, pitch: a.pitch });
    }
    result.path = path.reverse();
  }
  return result;
}
