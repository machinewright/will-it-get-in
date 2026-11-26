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
    kind: 'corner', ceiling, blocks,
    bounds: { x0: 0, x1: X, y0: -Y, y1: b },
    snap: { x: 0, y: b }, // the outside walls: the tightest ways round press against them
    seedY: -Y + reach + 5, // a row deep in the first hallway where any pose that fits the hallway is clear of its end
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
    kind: 'sideDoor', ceiling, blocks,
    // Once the centre is more than `reach` into the room the whole box is in, so the grid stops there.
    bounds: { x0: 0, x1: x2 + reach + 10, y0: -Y, y1: Math.max(b + past, b + reach + 10) },
    seedY: -Y + reach + 5,
    inside: (x, y) => (x >= 0 && x <= a && y >= -Y && y <= b + past) || (x >= a && x <= x2 && y >= 0 && y <= b)
      || (x >= x2 && x <= x2 + R && y >= -R && y <= R),
    start: (e) => e.maxx <= a && e.miny >= -Y && e.maxy <= b + past,
    goal: (e) => e.minx >= x2,
    togo: (e) => Math.max(0, x2 - e.minx),
  };
}
