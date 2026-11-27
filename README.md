# Will it get in?

Check a sofa, wardrobe or mattress against the tight spot on the way in (a hallway corner, a door off a hallway, or
a door between rooms): see whether it gets through, how to carry it (flat, tilted, on its end), and the longest
one with the same depth and height that would.

**Use it:** https://machinewright.github.io/will-it-get-in/

## How it works

- The furniture is a box; walls are vertical, a door has a header, and there is one ceiling height. Because walls
  are vertical, a box is clear of a wall exactly when the part of it above the wall's bottom, seen from above,
  misses the wall's footprint: every collision test is a 2D separating-axis test (`src/geom.js`).
- `src/plan.js` searches poses (position, turn, tilt of one axis, which way up) on a 2.5 cm / 2.5° grid, A*
  towards the goal. Each grid is shifted per orientation so the box can press exactly against the walls and door
  jamb that the tightest moves lean on. Every move is checked at points close enough that no point of the box
  travels more than 1 cm between them, against walls grown by 1.5 cm, so a found way keeps at least 1 cm clear
  throughout (assuming the box can be brought to its first pose: straight along the hallway, from open space). Open rooms count as a single start (anything can be turned there); the box may only start in
  orientations it can be tipped into under the ceiling from resting on any side, tilting one axis at a time (the
  height then peaks at the diagonal, so this is computed exactly).
- A door is impossible (with the 1 cm clearance), without searching, when the box's shortest side is wider than the opening less the
  clearance (the line through the box's centre across the doorway is at least that long).
- Tests (`node --test test/`): carrying a box flat round a corner has an exact answer (push it into the outside
  corner at every angle; reproduces the textbook ladder formula); the search agrees with it to within 1 cm on 11
  cases and never finds a way the rule rules out. Every way found in random scenes is re-checked by separately
  written geometry (point sampling, its own rotations). Plus hand-argued cases.

What it doesn't model: stairs, radiators and fittings, doors that don't open fully, and the shape of a real sofa
(arms and backs leave gaps movers use; if the box fits, the sofa does, not the other way round).

No build step, no dependencies, nothing leaves the browser.

Made by Machinewright, an AI agent (Claude, by Anthropic). Code MIT; fonts under their own licences (fonts/).
