// Floor plans, in centimetres. Each scene gives: blocks (see geom.js), the ceiling height, the floor-plan region a
// box centre can be in (for the search grid), and two tests on the box's floor-plan extent: `start` (it is entirely
// in the place it comes from) and `goal` (it is entirely where it has to go).

const T = 30; // thickness of walls that only close the scene off

// A hallway that turns a right-angle corner. Coming up the hallway (width `a`, along +y), turning right into the
// other hallway (width `b`, along +x). The inside corner is at (a, 0).
export function corner({ a, b, ceiling, reach }) {
  const Y = 2 * reach + 40, X = a + Y; // long enough to get the whole box past the corner
  const blocks = [
    { x0: -T, x1: 0, y0: -Y - T, y1: b + T, zb: 0 },         // outside wall of the first hallway
    { x0: -T, x1: X + T, y0: b, y1: b + T, zb: 0 },          // outside wall of the second hallway
    { x0: a, x1: X + T, y0: -Y - T, y1: 0, zb: 0 },          // the inside corner
    { x0: 0, x1: a, y0: -Y - T, y1: -Y, zb: 0 },             // far end of the first hallway (scene edge)
    { x0: X, x1: X + T, y0: 0, y1: b, zb: 0 },               // far end of the second hallway (scene edge)
  ];
  return {
    kind: 'corner', spot: 'the corner', ceiling, blocks,
    window: { x0: -25, x1: a + 1.3 * reach, y0: -1.3 * reach, y1: b + 25 }, viewFrom: -Math.PI / 2 - 0.55,
    bounds: { x0: 0, x1: X, y0: -Y, y1: b },
    snap: { x: 0, y: b }, // the outside walls: the tightest ways round press against them
    seed: { x: a / 2, y: -Y + reach + 5 }, // deep in the first hallway: any pose that fits the hallway is clear of its end
    inside: (x, y) => (x >= 0 && x <= a && y >= -Y && y <= b) || (y >= 0 && y <= b && x >= 0 && x <= X),
    start: (e) => e.maxy <= 0 && e.minx >= 0 && e.maxx <= a,
    goal: (e) => e.minx >= a && e.miny >= 0 && e.maxy <= b,
    togo: (e) => Math.max(0, a - e.minx) + Math.max(0, -e.miny),
  };
}

// A door in the side wall of a hallway. The hallway (width `a`) runs along +y; the door is in its right-hand wall,
// `b` wide and `doorH` high, with a frame (wall) `t` deep. The hallway goes on `past` cm beyond the door (0: the
// door is at the very end). The room behind the door is large.
export function sideDoor({ a, b, doorH, t, past, ceiling, reach }) {
  const Y = 2 * reach + 40, R = Y;
  const x2 = a + t; // the room starts here
  const blocks = [
    { x0: -T, x1: 0, y0: -Y - T, y1: b + past + T, zb: 0 },          // far wall of the hallway
    { x0: 0, x1: a, y0: -Y - T, y1: -Y, zb: 0 },                       // hallway end behind you (scene edge)
    { x0: 0, x1: a, y0: b + past, y1: b + past + T, zb: 0 },           // hallway end beyond the door
    { x0: a, x1: x2, y0: -R - T, y1: 0, zb: 0 },                       // wall with the door, before it
    { x0: a, x1: x2, y0: b, y1: R + T, zb: 0 },                        // ... and after it
    { x0: a, x1: x2, y0: 0, y1: b, zb: doorH },                        // wall above the door
    { x0: x2 + R, x1: x2 + R + T, y0: -R - T, y1: R + T, zb: 0 },      // room (scene edges)
    { x0: x2, x1: x2 + R, y0: -R - T, y1: -R, zb: 0 },
    { x0: x2, x1: x2 + R, y0: R, y1: R + T, zb: 0 },
  ];
  return {
    kind: 'sideDoor', spot: 'the door', ceiling, blocks, hallway: a, opening: { x: a, y0: 0, y1: b },
    window: { x0: -25, x1: x2 + reach, y0: -1.2 * reach, y1: b + Math.min(past, reach) + 25 }, viewFrom: Math.PI + 0.5, door: { width: b, height: doorH, depth: t },
    // Once the centre is more than `reach` into the room the whole box is in, so the grid stops there.
    bounds: { x0: 0, x1: x2 + reach + 10, y0: -Y, y1: Math.max(b + past, b + reach + 10) },
    snap: { x: 0, y: b }, // the hallway's far wall and the door's far jamb
    seed: { x: a / 2, y: -Y + reach + 5 },
    inside: (x, y) => (x >= 0 && x <= a && y >= -Y && y <= b + past) || (x >= a && x <= x2 && y >= 0 && y <= b)
      || (x >= x2 && x <= x2 + R && y >= -R && y <= R),
    start: (e) => e.maxx <= a && e.miny >= -Y && e.maxy <= b + past,
    goal: (e) => e.minx >= x2,
    // Into the room, and first along the hallway to the door.
    togo: (e) => Math.max(0, x2 - e.minx) + Math.max(0, -(e.miny + e.maxy) / 2, (e.miny + e.maxy) / 2 - b),
  };
}

// A door between two open spaces (room to room, or outside to inside): a wall `t` deep, the opening `b` wide and
// `doorH` high, plenty of room on both sides. In an open room every pose can be reached from every other (back
// away, turn it, come back), so all poses entirely in front of the wall count as one start: the search only needs
// the poses that are partly in the doorway.
export function roomDoor({ b, doorH, t, ceiling, reach }) {
  const BIG = b + 2 * reach + 100, r = reach + 10;
  const blocks = [
    { x0: 0, x1: t, y0: -BIG, y1: 0, zb: 0 },     // wall on one side of the door
    { x0: 0, x1: t, y0: b, y1: BIG, zb: 0 },      // ... and the other
    { x0: 0, x1: t, y0: 0, y1: b, zb: doorH },    // wall above the door
  ];
  return {
    kind: 'roomDoor', spot: 'the door', ceiling, blocks,
    window: { x0: -reach, x1: t + reach, y0: -0.8 * reach, y1: b + 0.8 * reach }, viewFrom: Math.PI + 0.6, openStart: true, door: { width: b, height: doorH, depth: t },
    // Any pose touching the doorway has its centre within `reach` of the opening.
    bounds: { x0: -r, x1: t + r, y0: -r, y1: b + r },
    snap: { x: t, y: b },
    inside: () => true,
    start: (e) => e.maxx <= 0,
    goal: (e) => e.minx >= t,
    togo: (e) => Math.max(0, t - e.minx) + Math.max(0, -(e.miny + e.maxy) / 2, (e.miny + e.maxy) / 2 - b),
    opening: { x: 0, y0: 0, y1: b },
  };
}
