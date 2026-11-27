// Turn a route (poses) into a few plain steps a person can follow while carrying.
//
// The box's sides: 0 = length (its longest side, e.g. a sofa's width), 1 = depth, 2 = height. A pose holds the
// box with axis `a` tilted up by `pitch` from a resting position in which axis `v` is vertical; the third axis
// stays level, so its direction (the yaw) measures turning without jumps.

import { holdsFor, rotation } from './geom.js';

const DEG = 180 / Math.PI;

// How the box is held: which of its sides point up, and how far its length is lifted.
// dims: the item (a sofa shape has a front and a back: its backrest is at +y, its seat on the bottom, -z).
export function posture(pose, dims = [1, 1, 1]) {
  const R = rotation(holdsFor(dims)[pose.hold], pose.yaw, pose.pitch), shape = !!dims.parts;
  if (shape) return shapePosture(R);
  const up = [0, 1, 2].map((i) => Math.asin(Math.min(1, Math.abs(R[2][i]))) * DEG); // how far each side points up
  if (up[2] >= 81) return R[2][2] < 0 && shape ? { kind: 'upside', text: 'upside down' } : { kind: 'upright', text: 'upright, on its feet' };
  if (up[1] >= 81) return R[2][1] > 0 && shape ? { kind: 'front', text: 'on its front' } : { kind: 'back', text: 'on its back' };
  if (up[0] >= 81) return { kind: 'end', text: 'standing on its end' };
  if (up[0] >= 9) {
    const lift = Math.round(up[0] / 5) * 5, onBack = up[1] > up[2];
    return { kind: onBack ? 'liftBack' : 'lift', lift, text: `${onBack ? 'on its back with ' : 'with '}one end lifted about ${lift}°` };
  }
  const tip = Math.round(Math.max(up[1], 90 - up[2]) / 5) * 5;
  const fwd = shape && R[2][1] > 0; // its back end is the higher one: tipped forward, onto its front
  return { kind: fwd ? 'tipF' : 'tip', tip, text: `tipped ${fwd ? 'forward' : 'back'} about ${tip}°` };
}

let dimsOf = [1, 1, 1]; // the item being described (set by describe)

// For a sofa, start from which face is down (its feet, its back, its front, its top, an end), then say how far it's
// lifted or tipped from there.
function shapePosture(R) {
  const z = [R[2][0], R[2][1], R[2][2]], up = z.map((v) => Math.asin(Math.min(1, Math.abs(v))) * DEG);
  const i = up.indexOf(Math.max(...up)); // the side closest to vertical
  const base = i === 0 ? 'end' : i === 1 ? (z[1] > 0 ? 'front' : 'back') : (z[2] > 0 ? 'upright' : 'upside');
  const words = { end: 'standing on its end', front: 'on its front', back: 'on its back', upright: 'upright, on its feet', upside: 'upside down' };
  const tilt = 90 - up[i];
  if (tilt < 9) return { kind: base, text: words[base] };
  if (base !== 'end' && up[0] >= 9) { // its length is lifted: one end up
    const lift = Math.round(up[0] / 5) * 5, pre = { upright: 'with', back: 'on its back with', front: 'on its front with', upside: 'upside down with' }[base];
    return { kind: 'lift' + base, lift, text: `${pre} one end lifted about ${lift}°` };
  }
  const t = Math.round(tilt / 5) * 5;
  if (base === 'upright') return z[1] < 0 ? { kind: 'tip', tip: t, text: `tipped back about ${t}°` } : { kind: 'tipF', tip: t, text: `tipped forward about ${t}°` };
  return { kind: 'tilt' + base, text: `${words[base]}, tilted about ${t}°` };
}

const sameKind = (p, q) => p.kind === q.kind || (p.kind.startsWith('lift') && q.kind.startsWith('lift'));

// spot: what the tight spot is called ('the corner', 'the door').
export function describe(before, path, spot = 'the tight spot', dims = [1, 1, 1]) {
  dimsOf = dims;
  const steps = [];
  const P = path.map((p) => ({ ...p, post: posture(p, dims) }));
  // Say how to get it into its starting position only when that's more than lifting an end a little.
  if (before && before.length > 1 && !(P[0].post.kind === 'lift' && P[0].post.lift <= 30)) {
    steps.push(`Before it goes in, where there's room, get it ${P[0].post.text}.`);
  }
  steps.push(`Bring it up to ${spot} ${P[0].post.text}.`);
  // Phases: runs of the same kind of hold (all the lifted ones count as one run, however high).
  let i = 0;
  while (i < P.length) {
    let j = i;
    let turn = 0;
    while (j + 1 < P.length && sameKind(P[j + 1].post, P[i].post)) {
      if (P[j + 1].hold === P[j].hold) { let d = P[j + 1].yaw - P[j].yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d; }
      j++;
    }
    const post = P[i].post;
    if (i > 0) steps.push(enter(P[i - 1], P[i], P[j]));
    const q = Math.round(Math.abs(turn * DEG) / 5) * 5;
    if (q >= 15) steps.push(`${i === 0 ? 'At ' + spot + ', turn' : 'Turn'} it about ${q}° as you go${q >= 75 && q <= 105 ? ' (roughly a quarter turn)' : ''}${post.kind === 'upright' ? '' : ', still ' + post.text.replace(/^with /, 'with ')}.`);
    i = j + 1;
  }
  steps.push('Carry it on through. That\'s it.');
  return steps;
}

// Words for going from pose `prev` into a phase that runs from `a` to `b`.
function enter(prev, a, b) {
  const to = a.post, end = b.post;
  if (to.kind.startsWith('lift')) {
    const which = frontOrBack(a, b), from = prev.post;
    const fromLift = from.kind === 'end' ? 90 : from.lift ?? 0;
    const top = Math.max(to.lift, end.lift ?? 0);
    if (fromLift > to.lift) return `Lower it from ${from.kind === 'end' ? 'its end' : 'there'}, so one end is about ${to.lift}° up${end.lift !== undefined && end.lift < to.lift - 10 ? `, then on down to about ${end.lift}°` : ''}.`;
    if (end.lift !== undefined && end.lift < to.lift - 10) return `Lift the ${which} end to about ${to.lift}°, then lower it to about ${end.lift}° as you go.`;
    return `Lift the ${which} end${top > to.lift + 10 ? `, gradually, to about ${top}°` : ` to about ${top}°`}.`;
  }
  if (to.kind === 'end') return prev.post.kind.startsWith('lift') ? 'Keep lifting until it stands on its end.' : 'Stand it on its end.';
  if (to.kind === 'upright') return 'Put it back down on its feet.';
  if (to.kind === 'back') return prev.post.kind.startsWith('lift') ? 'Lower it onto its back.' : 'Lay it on its back.';
  if (to.kind === 'front') return 'Lay it on its front.';
  if (to.kind === 'upside') return 'Turn it upside down.';
  if (to.kind === 'tip' || to.kind === 'tipF') return `Tip it ${to.kind === 'tipF' ? 'forward' : 'back'} about ${to.tip}°.`;
  if (to.kind === 'end') return 'Stand it on its end.';
  return `Now hold it ${to.text}.`;
}

// Is the raised end the one in front (in the direction it's moving)?
function frontOrBack(a, b) {
  const R = rotation(holdsFor(dimsOf)[a.hold], a.yaw, a.pitch), ax = holdsFor(dimsOf)[a.hold].a;
  // The raised end of the tilted axis: the end with positive z (pitch > 0 raises +axis).
  const sx = R[0][ax] * Math.sign(R[2][ax] || 1), sy = R[1][ax] * Math.sign(R[2][ax] || 1);
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 5) return 'one';
  return sx * dx + sy * dy >= 0 ? 'front' : 'back';
}
