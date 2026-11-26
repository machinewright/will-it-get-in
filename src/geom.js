// Geometry of a box (the furniture) among walls, in centimetres.
//
// Walls are vertical: a "block" is an axis-aligned rectangle on the floor plan that is solid from height zb upwards
// (zb = 0 for a wall, zb = door height for the wall above a door). The ceiling is one height for the whole scene.
// Because blocks are vertical prisms, a box hits a block exactly when the part of the box above zb, seen from above,
// overlaps the block's rectangle. So every test is a 2D separating-axis test on the floor plan.

// The box's own axes: 0 = length, 1 = depth, 2 = height. A "hold" says which box axis tilts (lies along the carrying
// direction when flat) and which one is vertical when flat. Tilting raises the front end by `pitch` radians.
export const HOLDS = [];
for (let a = 0; a < 3; a++) for (let v = 0; v < 3; v++) if (v !== a) HOLDS.push({ a, v, w: 3 - a - v });

// Rotation matrix (row-major 3x3, columns = world directions of the box's length/depth/height axes).
export function rotation(hold, yaw, pitch) {
  // Base: tilt axis -> X, other horizontal axis -> Y, vertical axis -> Z.
  const base = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  base[0][hold.a] = 1; base[1][hold.w] = 1; base[2][hold.v] = 1;
  // Ry(-pitch): X -> (cos p, 0, sin p), Z -> (-sin p, 0, cos p): raises the +X end.
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const ry = [[cp, 0, -sp], [0, 1, 0], [sp, 0, cp]];
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const rz = [[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]];
  return mul(rz, mul(ry, base));
}

function mul(A, B) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return C;
}

// Everything about an orientation that doesn't depend on where the box is.
// dims = [length, depth, height]. The box rests with its lowest point on the floor.
export function orient(dims, R) {
  const h = dims.map((d) => d / 2);
  const zc = Math.abs(R[2][0]) * h[0] + Math.abs(R[2][1]) * h[1] + Math.abs(R[2][2]) * h[2]; // centre height
  const verts = new Float64Array(24); // x, y, z offsets from the centre's floor point, z measured from the floor
  let k = 0;
  for (let i = 0; i < 8; i++) {
    const s0 = i & 1 ? 1 : -1, s1 = i & 2 ? 1 : -1, s2 = i & 4 ? 1 : -1;
    for (let r = 0; r < 3; r++) verts[k++] = R[r][0] * s0 * h[0] + R[r][1] * s1 * h[1] + R[r][2] * s2 * h[2] + (r === 2 ? zc : 0);
  }
  // Candidate separating axes on the floor plan: x, y, each box axis's floor direction and its normal.
  const axes = [1, 0, 0, 1];
  for (let c = 0; c < 3; c++) {
    const ax = R[0][c], ay = R[1][c], n = Math.hypot(ax, ay);
    if (n < 1e-9) continue;
    axes.push(ax / n, ay / n, -ay / n, ax / n);
  }
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let i = 0; i < 8; i++) {
    minx = Math.min(minx, verts[3 * i]); maxx = Math.max(maxx, verts[3 * i]);
    miny = Math.min(miny, verts[3 * i + 1]); maxy = Math.max(maxy, verts[3 * i + 1]);
  }
  return { R, verts, top: 2 * zc, axes: Float64Array.from(axes), minx, maxx, miny, maxy };
}

// Box edges as vertex index pairs (vertices differ in one bit).
const EDGES = [];
for (let i = 0; i < 8; i++) for (const b of [1, 2, 4]) if (!(i & b)) EDGES.push(i, i | b);

const pts = new Float64Array(64); // scratch: floor-plan points of the clipped box

// Floor-plan points of the part of the box at or above height z0 (offsets from the centre). Returns the count.
function clipAbove(o, z0) {
  const v = o.verts;
  if (z0 <= 0) { for (let i = 0; i < 8; i++) { pts[2 * i] = v[3 * i]; pts[2 * i + 1] = v[3 * i + 1]; } return 8; }
  let n = 0;
  for (let i = 0; i < 8; i++) if (v[3 * i + 2] >= z0) { pts[2 * n] = v[3 * i]; pts[2 * n + 1] = v[3 * i + 1]; n++; }
  if (n === 0 || n === 8) return n;
  for (let e = 0; e < EDGES.length; e += 2) {
    const i = EDGES[e], j = EDGES[e + 1];
    const zi = v[3 * i + 2], zj = v[3 * j + 2];
    if ((zi < z0) !== (zj < z0)) {
      const t = (z0 - zi) / (zj - zi);
      pts[2 * n] = v[3 * i] + t * (v[3 * j] - v[3 * i]); pts[2 * n + 1] = v[3 * i + 1] + t * (v[3 * j + 1] - v[3 * i + 1]); n++;
    }
  }
  return n;
}

// Is the box with orientation o, centre at (x, y), at least `m` cm clear of every block and the ceiling?
// (Blocks grow by m on every side and downwards, the ceiling comes down by m: an L-infinity margin, so the true
// Euclidean clearance is at least m.)
export function clear(scene, o, x, y, m) {
  if (o.top > scene.ceiling - m) return false;
  for (const b of scene.blocks) {
    const x0 = b.x0 - m - x, x1 = b.x1 + m - x, y0 = b.y0 - m - y, y1 = b.y1 + m - y; // block relative to the centre
    // Quick reject with the box's own bounding rectangle.
    if (o.maxx <= x0 || o.minx >= x1 || o.maxy <= y0 || o.miny >= y1) continue;
    const n = clipAbove(o, b.zb - m);
    if (n === 0) continue;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
    let separated = false;
    const ax = o.axes;
    for (let k = 0; k < ax.length && !separated; k += 2) {
      const nx = ax[k], ny = ax[k + 1];
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) { const p = pts[2 * i] * nx + pts[2 * i + 1] * ny; if (p < lo) lo = p; if (p > hi) hi = p; }
      const c = cx * nx + cy * ny, r = hx * Math.abs(nx) + hy * Math.abs(ny);
      if (hi <= c - r || lo >= c + r) separated = true;
    }
    if (!separated) return false;
  }
  return true;
}

// Floor-plan extent of the box at (x, y): used for "is it fully in the hallway / the room yet?".
export const extent = (o, x, y) => ({ minx: x + o.minx, maxx: x + o.maxx, miny: y + o.miny, maxy: y + o.maxy });
