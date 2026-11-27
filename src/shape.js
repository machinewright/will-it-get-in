// A sofa as boxes, in its own axes: x along its length (centred), y front (-) to back (+), z bottom (-) to top (+).
// L, D, H: overall length, depth, height. seatH: height of the seat's top (the solid block under the cushions,
// cushions included); backT: how deep the backrest is, front to back; armH, armW: arm height and width (armH <=
// seatH or armW = 0: no arms). Returns [L, D, H] with .parts, or a reason it can't be built.
export function sofa({ L, D, H, seatH, backT, armH = 0, armW = 0 }) {
  if (!(seatH > 0 && seatH < H)) return { error: 'The seat height must be more than 0 and less than the overall height.' };
  if (!(backT > 0 && backT < D)) return { error: 'The backrest depth must be more than 0 and less than the overall depth.' };
  if (armW > 0 && armH > seatH && !(armH <= H && 2 * armW < L)) return { error: 'The arms must be no higher than the sofa and narrower than half its length.' };
  const zb = -H / 2;
  const parts = [
    { c: [0, 0, zb + seatH / 2], h: [L / 2, D / 2, seatH / 2] },                                   // seat block
    { c: [0, D / 2 - backT / 2, (zb + seatH + H / 2) / 2], h: [L / 2, backT / 2, (H - seatH) / 2] }, // backrest
  ];
  if (armW > 0 && armH > seatH) {
    const ad = D - backT, h = [armW / 2, ad / 2, (armH - seatH) / 2], cy = -D / 2 + ad / 2, cz = zb + seatH + (armH - seatH) / 2;
    parts.push({ c: [-L / 2 + armW / 2, cy, cz], h }, { c: [L / 2 - armW / 2, cy, cz], h });
  }
  const dims = [L, D, H];
  dims.parts = parts;
  return dims;
}
