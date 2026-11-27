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
//
// A straight hallway on the way in is searched once across rather than at every point along it (see scene.corridor
// below): far fewer states, and in the tests always the same answers.

import { holdsFor, rotation, rotationInto, orient, clear, extent, liftOf, rampAt } from './geom.js';

export const DEFAULTS = { greed: 2, step: 2.5, yawSteps: 144, pitchSteps: 36, margin: 1, slack: 0.5, maxStates: 6e6 };

export function reachOf(dims) { return Math.hypot(dims[0], dims[1], dims[2]) / 2; }

export function solve(dims, scene, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { step, yawSteps: NY, pitchSteps, margin, slack } = o;
  const HOLDS = holdsFor(dims), shape = !!dims.parts;
  // Pitch 0 .. 90 degrees for a box (raising either end is the same by symmetry); -90 .. 90 for a shape.
  const NP = (shape ? 2 : 1) * pitchSteps + 1, P0 = shape ? pitchSteps : 0;
  const NH = HOLDS.length;
  const m = margin + slack;
  const reach = reachOf(dims);
  const dYaw = (2 * Math.PI) / NY, dPitch = Math.PI / 2 / pitchSteps;
  // On stairs the item's height follows the slope under it, so its points also move up and down: a point that
  // moves by d (with the item's lowest point held still) rises or falls by at most sqrt(1 + slope^2) d more (scene.js).
  const LF = scene.liftFactor ?? 1;

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
  function angles(id) { const p = id % NP, y = ((id - p) / NP) % NY, h = Math.floor(id / (NP * NY)); return { h, yaw: y * dYaw, pitch: (p - P0) * dPitch }; }
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
  for (const p of new Set([0, P0, NP - 1])) {
    const keyOf = new Map();
    for (let h = 0; h < NH; h++) for (let y = 0; y < NY; y++) {
      const id = oid(h, y, p), v = ori(id).verts, ks = [];
      for (let i = 0; i < v.length / 3; i++) ks.push(`${Math.round(v[3 * i] * 1e3)},${Math.round(v[3 * i + 1] * 1e3)},${Math.round(v[3 * i + 2] * 1e3)}`);
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
  let cap = 1 << 16, qo = new Int32Array(cap), qp = new Int32Array(cap), par = new Int32Array(cap), gc = new Float64Array(cap), n = 0;
  const grow = (a) => { const b = new a.constructor(cap); b.set(a); return b; };
  function push(id, pos, parent, g) {
    if (n === cap) { cap *= 2; qo = grow(qo); qp = grow(qp); par = grow(par); gc = grow(gc); }
    qo[n] = id; qp[n] = pos; par[n] = parent; gc[n] = g; mark(id, pos); hpush(n, g + o.greed * togo(id, pos)); n++;
  }
  const X = (id, pos) => px[pos] + ori(id).offx, Y = (id, pos) => py[pos] + ori(id).offy;
  // Search order: A* weighted towards the goal (expand the pose with the least distance travelled + greed x the
  // scene's measure of how far it still has to go), so a way is usually found long before everything is explored.
  // When there is no way, everything reachable gets explored either way, so the answer doesn't depend on the order.
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

  const free = (id, pos, sc = scene) => clear(sc, ori(id), X(id, pos), Y(id, pos), m);

  const scratchR = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], scratchO = orient(dims, rotation(HOLDS[0], 0, 0));

  // A move from state A to state B (neighbours): check points along it.
  function moveClear(ida, posa, idb, posb, sc = scene) {
    const A = angles(ida), B = angles(idb);
    const xa = X(ida, posa), ya = Y(ida, posa), dx = X(idb, posb) - xa, dyy = Y(idb, posb) - ya;
    if (A.h !== B.h) { // same orientation through another hold: only the grid shift can differ
      if (Math.hypot(dx, dyy) < 1e-9) return true;
      const k = Math.ceil(Math.hypot(dx, dyy) * LF / (2 * slack));
      for (let i = 1; i < k; i++) if (!clear(sc, ori(ida), xa + (i / k) * dx, ya + (i / k) * dyy, m)) return false;
      return true;
    }
    let dy = B.yaw - A.yaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
    const dp = B.pitch - A.pitch;
    // Longest path any point of the box can travel: translation + turning about the vertical + tilting (the tilt
    // also lifts or lowers the centre: at most the sum of the half sizes, < 2 * reach).
    const travel = Math.hypot(dx, dyy) + reach * Math.abs(dy) + 2.8 * reach * Math.abs(dp);
    // In open space: if A is clear by more than the furthest any point moves, the whole move is (blocks and ceiling
    // grow by the margin in every direction, which contains a ball of that radius).
    if (clear(sc, ori(ida), xa, ya, m + travel * LF)) return true;
    const k = Math.ceil(travel * LF / (2 * slack));
    for (let i = 1; i < k; i++) {
      const t = i / k;
      const oo = orient(dims, rotationInto(scratchR, HOLDS[A.h], A.yaw + t * dy, A.pitch + t * dp), scratchO);
      if (!clear(sc, oo, xa + t * dx, ya + t * dyy, m)) return false;
    }
    return true;
  }

  // Which orientations can the box be turned into in open space under this ceiling, starting from resting on one
  // of its sides? Only those are allowed when it enters. Turning about the vertical and changing hold are free
  // there. Tilting a hold's axis up to pitch p makes the box dims[a] sin p + dims[v] cos p tall (whatever the yaw),
  // which peaks at the diagonal sqrt(dims[a]^2 + dims[v]^2) when tan p = dims[a] / dims[v]: so a tilt from p0 to
  // p1 fits exactly when that height stays under the ceiling over the whole range.
  const limit = (scene.startCeiling ?? scene.ceiling) - m; // (on stairs: the ceiling where it starts)
  // (For a shape these are its bounding box's sizes: it is no taller than that, so this never allows too much.)
  const tallest = (hd, p0, p1) => {
    const A = dims[hd.a], V = dims[hd.v], peak = Math.atan2(A, V), f = (p) => A * Math.abs(Math.sin(p)) + V * Math.cos(p);
    const lo = Math.min(p0, p1), hi = Math.max(p0, p1);
    return (peak > lo && peak < hi) || (-peak > lo && -peak < hi) ? Math.hypot(A, V) : Math.max(f(lo), f(hi));
  };
  const enterHP = new Uint8Array(NH * NP), fromHP = new Int32Array(NH * NP).fill(-1), todo = []; // by hold and pitch
  // It can arrive resting on any side (upright, on its back, on its end...), if that fits under the ceiling.
  for (let h = 0; h < NH; h++) if (dims[HOLDS[h].v] <= limit) { enterHP[h * NP + P0] = 1; todo.push(h * NP + P0); }
  for (let qi = 0; qi < todo.length; qi++) {
    const k = todo[qi], h = Math.floor(k / NP), p = k % NP;
    const next = [];
    for (const q of [p - 1, p + 1]) if (q >= 0 && q < NP && tallest(HOLDS[h], (p - P0) * dPitch, (q - P0) * dPitch) <= limit) next.push(h * NP + q);
    if (p === 0 || p === P0 || p === NP - 1) for (const j of same.get(oid(h, 0, p)) ?? []) next.push(Math.floor(j / (NP * NY)) * NP + p);
    for (const j of next) if (!enterHP[j]) { enterHP[j] = 1; fromHP[j] = k; todo.push(j); }
  }
  const enter = (id) => enterHP[Math.floor(id / (NP * NY)) * NP + (id % NP)] === 1;

  // Quick "no" for a doorway: while the box goes through, there is a moment when its centre is in the doorway's
  // plane, and the line through the centre across the doorway then lies in the opening. Every line through a box's
  // centre, between two faces, is at least as long as the box's smallest side. So if the smallest side is wider
  // than the opening (less the clearance on both sides), no way exists, and there's no need to search.
  if (scene.door && !shape && Math.min(...dims) > scene.door.width - 2 * margin) { // (boxes only: needs convexity)
    return { found: false, explored: 0, seeds: 0, capped: false, path: null, doorTooSmall: true };
  }

  // How far a pose must back off along -x to be entirely in front of the doorway's wall, and whether that straight
  // move is clear (checked like any other move: nothing travels more than 2 x slack between checks).
  const backOff = (id, pos) => X(id, pos) + ori(id).maxx - scene.opening.x + 0.01;
  function approachClear(id, pos) {
    const dist = backOff(id, pos), k = Math.ceil(dist / (2 * slack)), oo = ori(id);
    for (let i = 1; i <= k; i++) if (!clear(scene, oo, X(id, pos) - (i / k) * dist, Y(id, pos), m)) return false;
    return true;
  }

  // Starting tilted, on its side or upside down costs the tipping it took, so the easiest way wins.
  function tipCost(id) {
    const hd = HOLDS[Math.floor(id / (NP * NY))], tilt = Math.abs((id % NP) - P0) * dPitch;
    return reach * (tilt + (hd.v === 2 ? (hd.s === 1 ? 0 : Math.PI) : Math.PI / 2));
  }

  // Door between open rooms: try carrying it straight through first. Moving straight along x, every point of it
  // crosses the doorway at its own fixed (y, z), so it gets through exactly when its silhouette on the wall's plane
  // fits the opening (less the margin): all its corners within the opening's width, and under the door's height.
  // Checked over a fine set of turns and tilts it could be tipped into from resting under this ceiling (one tilt);
  // the move is then checked again like any other.
  // Off a hallway, the same works if, held that way, it also fits the hallway's width to be walked up to the door.
  if (scene.door && (scene.openStart || scene.hallway)) {
    const st = straightThrough();
    if (st) return st;
  }
  function straightThrough() {
    const { width, height } = scene.door, oy0 = scene.opening.y0, wx = scene.opening.x, R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    let best = null, o2;
    for (let h = 0; h < NH; h++) {
      const hd = HOLDS[h];
      if (dims[hd.v] > limit) continue;
      for (let pi = -360; pi <= 360; pi++) {
        const pitch = pi * Math.PI / 720; // 0.25 degree steps
        if (pitch < 0 && !shape) continue;
        if (tallest(hd, 0, pitch) > limit) continue;
        for (let yi = 0; yi < 24; yi++) {
          const yaw = yi * Math.PI / 12;
          o2 = orient(dims, rotationInto(R, hd, yaw, pitch), o2);
          if (o2.top > height - m || o2.maxy - o2.miny > width - 2 * m) continue;
          if (scene.hallway && o2.maxx - o2.minx > scene.hallway - 2 * m) continue;
          const cost = Math.abs(pitch) + (hd.v === 2 ? (hd.s === 1 ? 0 : Math.PI) : Math.PI / 2);
          if (!best || cost < best.cost) best = { cost, h, yaw, pitch, y: oy0 + width / 2 - (o2.maxy + o2.miny) / 2, minx: o2.minx, maxx: o2.maxx };
        }
      }
    }
    if (!best) return null;
    const A = { x: wx - best.maxx - 0.01, y: best.y, hold: best.h, yaw: best.yaw, pitch: best.pitch };
    const B = { ...A, x: wx + scene.door.depth - best.minx + 0.01 };
    const path = [A, B];
    if (scene.hallway) { // start deep in the hallway, centred, and walk up to the door first
      A.x = scene.hallway / 2 - (best.minx + best.maxx) / 2;
      path.unshift({ ...A, y: scene.seed.y });
    }
    for (let i = 1; i < path.length; i++) if (!straightClear(dims, scene, path[i - 1], path[i], opts)) return null; // (shouldn't happen)
    const before = [{ hold: best.h, pitch: 0 }];
    if (best.pitch !== 0) before.push({ hold: best.h, pitch: best.pitch });
    return { found: true, explored: 0, seeds: 0, capped: false, path, before, straight: true };
  }

  // Straight hallway on the way in (scene.corridor): the hallway x0 .. x1 runs along y from the scene's edge up to
  // yEnd (a wall, or where the stairs start), with walls on both sides except, if given, an opening at x1 from
  // opening.y0 to opening.y1, which only adds space (any block beyond x1 there lies inside where the wall would be).
  // A pose entirely in the hallway, at least m from x1 and from yEnd, is then clear exactly when it is clear on a
  // reference row deep in the hallway, and so is every move between two such poses that is clear there. Those
  // poses are "covered" once (orientation, sideways position) is reached on the reference row, whatever the row.
  let cor = scene.corridor && o.corridor !== false && !scene.openStart ? scene.corridor : null;
  // Checks there are made against the plain hallway alone (its two walls, endless, under its ceiling), so the
  // reference row can be any row of the grid in the hallway.
  const dMove = Math.SQRT2 * step + reach * (dYaw + 2.8 * dPitch) + 1; // more than any point moves in one move
  const jRef = cor ? Math.round((scene.seed.y - y0) / step) : 0;
  if (cor && (jRef < 1 || jRef + 1 >= GH)) cor = null;
  const csc = cor && { blocks: [{ x0: x0 - 100, x1: x0, y0: -1e7, y1: 1e7, zb: 0 }, { x0: cor.x1, x1: cor.x1 + 100, y0: -1e7, y1: 1e7, zb: 0 }], ceiling: cor.ceiling ?? scene.ceiling };
  const CW = cor ? Math.min(GW, Math.floor((cor.x1 - x0) / step) + 2) : 0;
  let cpar = null, cdj = null, corN = 0, corCapped = false;
  const seedKey = new Map(); // seed state -> the straight-hallway pair it came from
  const inStraight = (no, nid, npos) => {
    if (!cor || Y(nid, npos) + no.maxy > cor.yEnd - m || X(nid, npos) + no.maxx > cor.x1 - m) return false;
    const ni = pg[npos] % GW;
    return ni < CW && cpar[nid * CW + ni] !== -2;
  };

  if (scene.openStart) {
    // Open start: seeds are the poses just entering the doorway (the part past the wall's face must be within the
    // opening), every orientation it can enter in. Poses entirely in front of the wall are never expanded.
    const { x: wx, y0: oy0, y1: oy1 } = scene.opening;
    for (let id = 0; id < NO; id++) {
      if (!enter(id)) continue;
      const oo = ori(id), v = oo.verts;
      let lo = Infinity, hi = -Infinity; // y range of the leading corners
      for (let k = 0; k < v.length / 3; k++) if (v[3 * k] >= oo.maxx - 1.5 * step) { lo = Math.min(lo, v[3 * k + 1]); hi = Math.max(hi, v[3 * k + 1]); }
      for (let i = 0; i < GW; i++) {
        const xc = x0 + i * step + oo.offx;
        if (xc + oo.maxx <= wx || xc + oo.maxx > wx + 1.5 * step) continue;
        const ya = oy0 + m - lo, yb = oy1 - m - hi;
        for (let j = Math.max(0, Math.floor((ya - oo.offy - y0) / step)); j < GH; j++) {
          const yc = y0 + j * step + oo.offy;
          if (yc > yb) break;
          const pos = posAt[i + j * GW];
          if (pos < 0 || isSeen(id, pos)) continue;
          // The approach from the open room (straight in along x, from fully in front of the wall) is checked too.
          if (free(id, pos) && approachClear(id, pos)) push(id, pos, -1, tipCost(id));
        }
      }
    }
  } else if (cor) {
    // A straight hallway on the way in (see `scene.corridor`): there, which (orientation, sideways position) pairs
    // can be reached doesn't depend on how far along it the item is, so they are found once, on a single row deep
    // in it (a move to the row before or after is checked there, and is the same anywhere along it). Then the
    // search proper starts from each of those, slid straight up until it first reaches past the straight part
    // (each such move checked as usual). Meant to give the same answers as searching the whole hallway (and did, in
    // the tests and a 615-case review), without repeating the same turns at every point along it.
    cpar = new Int32Array(NO * CW).fill(-2); cdj = new Int8Array(NO * CW);
    const cq = [];
    for (let id = 0; id < NO; id++) {
      if (!enter(id)) continue;
      const oo = ori(id), iSeed = Math.round((scene.seed.x - (oo.minx + oo.maxx) / 2 - oo.offx - x0) / step);
      for (let i = Math.max(0, iSeed - 1); i <= Math.min(CW - 1, iSeed + 1); i++) {
        const pos = posAt[i + jRef * GW], key = id * CW + i;
        if (pos < 0 || cpar[key] !== -2) continue;
        if (scene.start(extent(oo, X(id, pos), Y(id, pos))) && free(id, pos, csc)) { cpar[key] = -1; cq.push(key); }
      }
    }
    for (let qi = 0; qi < cq.length && cq.length < o.maxStates; qi++) {
      const key = cq[qi], id = Math.floor(key / CW), pos = posAt[key - id * CW + jRef * GW];
      const cand = neighbours(id, pos);
      for (let c = 0; c < cand.length; c += 2) {
        const nid = cand[c], npos = cand[c + 1], g = pg[npos], ni = g % GW, nkey = nid * CW + ni;
        if (ni >= CW || cpar[nkey] !== -2 || isBlocked(nid, npos)) continue;
        if (!free(nid, npos, csc)) { markBlocked(nid, npos); continue; } // (blocked there => blocked in the scene)
        if (!moveClear(id, pos, nid, npos, csc)) continue;
        cpar[nkey] = key; cdj[nkey] = (g - ni) / GW - jRef; cq.push(nkey);
      }
    }
    corN = cq.length; corCapped = corN >= o.maxStates;
    // Where the hallway stops being plain: its end (a wall, or the stairs) and the opening in its side. The search
    // proper starts from every pose one move away from a covered pose that isn't itself covered: across the end
    // line, into the opening, or turned in a way that only the opening leaves room for.
    const d = dMove;
    const op = cor.opening;
    for (const key of cq) {
      if (n + corN >= o.maxStates) { corCapped = true; break; }
      const id = Math.floor(key / CW), i = key - id * CW, oo = ori(id), xr = x0 + i * step + oo.offx + oo.maxx;
      const jOf = (yy) => (yy - oo.offy - y0) / step; // row at which the centre is at yy
      const jTop = Math.floor(jOf(cor.yEnd - m - oo.maxy)); // the last row it is covered at
      const rows = [[Math.max(0, Math.ceil(jOf(cor.yEnd - m - d - oo.maxy))), jTop]];
      if (op && xr + d > cor.x1 - m) rows.push([Math.max(0, Math.ceil(jOf(op.y0 - m - d - oo.maxy))), Math.min(jTop, Math.floor(jOf(op.y1 + m + d - oo.miny)))]);
      for (const [ja, jb] of rows) for (let j = ja; j <= jb && j < GH; j++) {
        const pos = posAt[i + j * GW];
        if (pos < 0) continue;
        const cand = neighbours(id, pos);
        for (let c = 0; c < cand.length; c += 2) {
          const nid = cand[c], npos = cand[c + 1];
          if (isSeen(nid, npos) || isBlocked(nid, npos)) continue;
          const no = ori(nid);
          if (inStraight(no, nid, npos)) continue;
          if (no.top > scene.ceiling - m || !free(nid, npos)) { markBlocked(nid, npos); continue; }
          if (!moveClear(id, pos, nid, npos)) continue;
          push(nid, npos, -1, tipCost(id)); seedKey.set(n - 1, { key, j });
        }
      }
    }
  } else {
  // Seeds: every clear pose in an orientation it can enter in, on the centre line deep in the hallway it comes from
  // (a pose that fits a straight hallway anywhere fits it centred; a cell either side allows for the grid).
  // (Centred means its shadow is centred: for a sofa held tilted that isn't where its bounding box's centre is.)
  const jSeed = Math.round((scene.seed.y - y0) / step);
  for (let id = 0; id < NO; id++) {
    if (!enter(id)) continue;
    const oo = ori(id), iSeed = Math.round((scene.seed.x - (oo.minx + oo.maxx) / 2 - oo.offx - x0) / step);
    for (let i = iSeed - 1; i <= iSeed + 1; i++) {
      const pos = i >= 0 && i < GW ? posAt[i + jSeed * GW] : -1;
      if (pos < 0 || isSeen(id, pos)) continue;
      // Starting tilted or on its side costs the tipping it took, so the easiest way wins when there are several.
      if (scene.start(extent(oo, X(id, pos), Y(id, pos))) && free(id, pos)) push(id, pos, -1, tipCost(id));
    }
  }
  }
  const seeds = n;

  // Neighbours: shift by up to one step in x and y, turn by up to one step and tilt by up to one step, together
  // (the tightest ways round need sliding while turning), plus changes of hold. Returns (orientation, position) pairs.
  function neighbours(id, pos) {
    const p = id % NP, y = ((id - p) / NP) % NY, h = Math.floor(id / (NP * NY));
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
        const R = (dy || dp) && !o.wide ? 0 : 1; // turning: only to the cell itself; shifting: the 8 around
        for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
          if (!dy && !dp && !ci && !cj && !di && !dj) continue;
          const ii = gi + ci + di, jj = gj + cj + dj;
          if (ii < 0 || ii >= GW || jj < 0 || jj >= GH) continue;
          const q = posAt[ii + jj * GW];
          if (q >= 0) cand.push(nid, q);
        }
      }
    }
    for (const j of same.get(id) ?? []) cand.push(j, pos);
    return cand;
  }

  let found = -1;
  while (hn > 0 && found < 0 && n + corN < o.maxStates) {
    const me = hpop(), id = qo[me], pos = qp[me];
    const p = id % NP, y = ((id - p) / NP) % NY;
    const cand = neighbours(id, pos);
    for (let c = 0; c < cand.length; c += 2) {
      const nid = cand[c], npos = cand[c + 1];
      if (isSeen(nid, npos) || isBlocked(nid, npos)) continue;
      const no = ori(nid);
      if (scene.openStart && scene.start(extent(no, X(nid, npos), Y(nid, npos)))) continue; // back in the open room
      if (inStraight(no, nid, npos)) continue; // back in the straight hallway, in a way already covered from there
      if (no.top > scene.ceiling - m || !free(nid, npos)) { markBlocked(nid, npos); continue; }
      if (!moveClear(id, pos, nid, npos)) continue;
      const pn = nid % NP, yn = ((nid - pn) / NP) % NY, dyn = Math.min(Math.abs(yn - y), NY - Math.abs(yn - y));
      const walk = Math.hypot(X(nid, npos) - X(id, pos), Y(nid, npos) - Y(id, pos));
      let cost = walk + reach * (dyn * dYaw + Math.abs(pn - p) * dPitch) + 0.1;
      // On stairs, prefer carrying it low along the slope over holding it high above the steps (only a preference:
      // every move is checked the same either way).
      if (scene.ramp) { const yc = Y(nid, npos) + (no.miny + no.maxy) / 2; cost += walk * Math.max(0, liftOf(scene.ramp, no, Y(nid, npos)) - rampAt(scene.ramp, yc)) / 15; }
      push(nid, npos, me, gc[me] + cost);
      if (scene.goal(extent(no, X(nid, npos), Y(nid, npos)))) { found = n - 1; break; }
    }
  }

  const result = { found: found >= 0, explored: n + corN, seeds, capped: found < 0 && (corCapped || n + corN >= o.maxStates), path: null };
  if (o.debug) result.debug = { isSeen, isBlocked, oid, posAt, GW, GH, x0, y0, step, free, moveClear, X, Y, enter, ori };
  if (found >= 0) {
    const path = [];
    for (let i = found; i >= 0; i = par[i]) {
      const a = angles(qo[i]);
      path.push({ x: X(qo[i], qp[i]), y: Y(qo[i], qp[i]), hold: a.h, yaw: a.yaw, pitch: a.pitch, z: scene.ramp ? liftOf(scene.ramp, ori(qo[i]), Y(qo[i], qp[i])) : 0 });
    }
    result.path = path.reverse();
    if (scene.openStart) { // begin from the checked approach: entirely in front of the wall
      const i0 = (() => { let i = found; while (par[i] >= 0) i = par[i]; return i; })();
      result.path.unshift({ ...result.path[0], x: result.path[0].x - backOff(qo[i0], qp[i0]) });
    }
    const i1 = (() => { let i = found; while (par[i] >= 0) i = par[i]; return i; })();
    if (seedKey.has(i1)) { // the way along the straight hallway to where the search proper started
      const { key, j } = seedKey.get(i1), chain = [];
      for (let k = key, r = 0; k >= 0; r -= cdj[k], k = cpar[k]) chain.push({ id: Math.floor(k / CW), i: k % CW, r });
      // Place that way so that it starts where the plain search starts (deep in the hallway), or further back if
      // that's needed for every pose on it to be covered and none past row j; then slide the last pose straight
      // along the hallway to row j (clear: it's covered all the way).
      let jA = Math.min(j, jRef - Math.min(...chain.map((c) => c.r))), ok = true; // (its furthest-back pose on jRef)
      for (const c of chain) { const oo = ori(c.id); jA = Math.min(jA, Math.floor((cor.yEnd - m - oo.maxy - oo.offy - y0) / step) - c.r); }
      { // and with the first pose where the scene says it starts from (e.g. before the corner)
        const c = chain[chain.length - 1], oo = ori(c.id), xc = x0 + c.i * step + oo.offx;
        let t = 0;
        for (; t < GH && !scene.start(extent(oo, xc, y0 + (jA + c.r) * step + oo.offy)); t++) jA--;
        if (t === GH) ok = false;
      }
      const pose = (id, i, jj) => { const a = angles(id), oo = ori(id), x = x0 + i * step + oo.offx, y = y0 + jj * step + oo.offy;
        if (y + oo.miny < scene.bounds.y0 + m) ok = false; // (would run into the scene's edge: then search the plain way)
        return { x, y, hold: a.h, yaw: a.yaw, pitch: a.pitch, z: scene.ramp ? liftOf(scene.ramp, oo, y) : 0 }; };
      const lead = chain.reverse().map((c) => pose(c.id, c.i, jA + c.r));
      const last = chain[chain.length - 1];
      if (jA < j) lead.push(pose(last.id, last.i, j));
      if (!ok) return solve(dims, scene, { ...opts, corridor: false });
      result.path = lead.concat(result.path);
    }
    // How to get it from upright into the pose it goes in with, before it goes in (open space, same ceiling).
    const first = result.path[0], before = [];
    for (let k = first.hold * NP + Math.round(first.pitch / dPitch) + P0; k >= 0; k = fromHP[k]) before.push({ hold: Math.floor(k / NP), pitch: ((k % NP) - P0) * dPitch });
    result.before = before.reverse();
  }
  return result;
}

// Is the straight move from pose A to pose B (same hold) clear by margin all the way? Checked the same way as the
// search's moves: points close enough together that nothing travels more than 2 x slack between them.
export function straightClear(dims, scene, A, B, opts = {}) {
  const { margin, slack } = { ...DEFAULTS, ...opts }, m = margin + slack, reach = reachOf(dims);
  if (A.hold !== B.hold) return false;
  let dy = B.yaw - A.yaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
  const dp = B.pitch - A.pitch, dx = B.x - A.x, dyy = B.y - A.y;
  const travel = Math.hypot(dx, dyy) + reach * Math.abs(dy) + 2.8 * reach * Math.abs(dp);
  const k = Math.max(1, Math.ceil(travel * (scene.liftFactor ?? 1) / (2 * slack)));
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let o;
  for (let i = 0; i <= k; i++) {
    const t = i / k;
    o = orient(dims, rotationInto(R, holdsFor(dims)[A.hold], A.yaw + t * dy, A.pitch + t * dp), o);
    if (!clear(scene, o, A.x + t * dx, A.y + t * dyy, m)) return false;
  }
  return true;
}

// Replace runs of grid moves by single straight moves where those are clear too (the grid zigzags; people don't).
export function smooth(dims, scene, path, opts = {}) {
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = Math.min(path.length - 1, i + 60);
    // (A straight move may tilt or walk, but not tilt slowly over a long walk: that's not how people carry, and the
    // steps would describe it wrongly.)
    const ok = (j) => path[j].hold === path[i].hold && sameHoldRun(path, i, j)
      && (Math.abs(path[j].pitch - path[i].pitch) < 1e-6 || Math.hypot(path[j].x - path[i].x, path[j].y - path[i].y) <= 30)
      && straightClear(dims, scene, path[i], path[j], opts);
    while (j > i + 1 && !ok(j)) j = i + 1 + Math.floor((j - i - 1) / 2);
    out.push(path[j]);
    i = j;
  }
  return out;
}
const sameHoldRun = (P, i, j) => { for (let k = i + 1; k <= j; k++) if (P[k].hold !== P[i].hold) return false; return true; };

// Coarse grid first (5 cm, 5 degrees): a way found there is checked exactly like any other, so it's just as good,
// and it's found several times faster. Only if that finds nothing, search the fine grid.
export function solveTwoStage(dims, scene, opts = {}) {
  const coarse = solve(dims, scene, { ...opts, step: 5, yawSteps: 72, pitchSteps: 18 });
  if (coarse.found || coarse.doorTooSmall) return coarse;
  return solve(dims, scene, opts);
}

// How high the item at this pose is carried (its lowest point above the bottom floor): 0 except on stairs.
export function liftAt(dims, scene, pose) {
  if (!scene.ramp) return 0;
  return liftOf(scene.ramp, orient(dims, rotation(holdsFor(dims)[pose.hold], pose.yaw, pose.pitch)), pose.y);
}
