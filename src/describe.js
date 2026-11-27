// Turn a route (poses) into a few plain steps a person can follow while carrying.
//
// The box's sides: 0 = length (its longest side, e.g. a sofa's width), 1 = depth, 2 = height. A pose holds the
// box with axis `a` tilted up by `pitch` from a resting position in which axis `v` is vertical; the third axis
// stays level, so its direction (the yaw) measures turning without jumps.

import { HOLDS, rotation } from './geom.js';

const DEG = 180 / Math.PI;

// How the box is held: which of its sides point up, and how far its length is lifted.
export function posture(pose) {
  const R = rotation(HOLDS[pose.hold], pose.yaw, pose.pitch);
  const up = [0, 1, 2].map((i) => Math.asin(Math.min(1, Math.abs(R[2][i]))) * DEG); // how far each side points up
  if (up[2] >= 81) return { kind: 'upright', text: 'upright, on its feet' };
  if (up[1] >= 81) return { kind: 'back', text: 'on its back' };
  if (up[0] >= 81) return { kind: 'end', text: 'standing on its end' };
  if (up[0] >= 9) {
    const lift = Math.round(up[0] / 5) * 5, onBack = up[1] > up[2];
    return { kind: onBack ? 'liftBack' : 'lift', lift, text: `${onBack ? 'on its back with ' : 'with '}one end lifted about ${lift}°` };
  }
  const tip = Math.round(Math.max(up[1], 90 - up[2]) / 5) * 5;
  return { kind: 'tip', tip, text: `tipped back about ${tip}°` };
}

const sameKind = (p, q) => p.kind === q.kind || (p.kind.startsWith('lift') && q.kind.startsWith('lift'));

// spot: what the tight spot is called ('the corner', 'the door').
export function describe(before, path, spot = 'the tight spot') {
  const steps = [];
  const P = path.map((p) => ({ ...p, post: posture(p) }));
  if (before && before.length > 1) {
    const last = posture({ hold: before.at(-1).hold, yaw: 0, pitch: before.at(-1).pitch });
    steps.push(`Before it goes in, where there's room, get it ${last.text}.`);
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
    const which = frontOrBack(a, b);
    const top = Math.max(to.lift, end.lift ?? 0);
    if (end.lift !== undefined && end.lift < to.lift - 10) return `Lift the ${which} end to about ${to.lift}°, then lower it to about ${end.lift}° as you go.`;
    return `Lift the ${which} end${top > to.lift + 10 ? `, gradually, to about ${top}°` : ` to about ${top}°`}.`;
  }
  if (to.kind === 'end') return prev.post.kind.startsWith('lift') ? 'Keep lifting until it stands on its end.' : 'Stand it on its end.';
  if (to.kind === 'upright') return 'Put it back down on its feet.';
  if (to.kind === 'back') return prev.post.kind.startsWith('lift') ? 'Lower it onto its back.' : 'Lay it on its back.';
  return `Tip it back about ${to.tip}°.`;
}

// Is the raised end the one in front (in the direction it's moving)?
function frontOrBack(a, b) {
  const R = rotation(HOLDS[a.hold], a.yaw, a.pitch), ax = HOLDS[a.hold].a;
  // The raised end of the tilted axis: the end with positive z (pitch > 0 raises +axis).
  const sx = R[0][ax] * Math.sign(R[2][ax] || 1), sy = R[1][ax] * Math.sign(R[2][ax] || 1);
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 5) return 'one';
  return sx * dx + sy * dy >= 0 ? 'front' : 'back';
}
