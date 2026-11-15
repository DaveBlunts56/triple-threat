// What is painted on a jersey and a pair of shorts, and the painting. No Three.js here, so it can be tested without a browser.

const f = Object.freeze;

// layout: the regions of each garment's picture, as [top, bottom] shares of its height (the build lays the garment
// out so: tools/blender/kit.py LAYOUT): main, the front panel on the left and the back on the right, the garment's top
// along the top; trim, the bindings, waistband and hems, with their inner (stitched) edge at the bottom; panel, the side
// panels and stripes, with the edges where they are stitched to the front and the back at its top and bottom.
// size: pixels along each side of a garment's picture. team: the colour each team wears. trim: the bindings and the
// numbers. shade: how much darker than the team's colour a jersey's side panels are. font: {px} stands for the height
// of a number in pixels. digit: the widest one digit is painted, as a share of its height: the cloth stretches the
// picture sideways, so a digit this narrow has its natural shape on the player. chest, back: the middle of the number
// and how tall it is. stitch: the stitching along each seam: [length, gap, thickness] of a stitch, in shares of the
// picture, and how far in from the seam it runs.
export const KIT = f({
  layout: f({ main: f([0, 0.8]), trim: f([0.82, 0.9]), panel: f([0.92, 1]) }),
  size: 512, team: f(['#2f6fe0', '#d83a3a']), trim: '#ffffff', shade: 0.7, font: 'bold {px}px system-ui, sans-serif', digit: 0.45,
  chest: f({ at: f([0.25, 0.34]), height: 0.21 }),
  back: f({ at: f([0.75, 0.32]), height: 0.27 }),
  stitch: f({ dash: f([0.008, 0.006, 0.003]), inset: 0.006 }),
});

export const TEAM_COLOURS = KIT.team.map(hex => parseInt(hex.slice(1), 16));   // KIT.team as numbers, for a material

// A region of the picture, [top, bottom], as a rectangle [x, y, width, height] across the whole width, a pixel's worth
// wider each way so that no seam of the background shows between regions when the picture is shrunk.
const band = ([top, bottom]) => [0, Math.max(0, top - 0.008), 1, Math.min(1, bottom + 0.008) - Math.max(0, top - 0.008)];

// What to paint on a `part` ('jersey' or 'shorts') of the player wearing `number`, in the order it is painted:
// { fill, rect } or { text, at, height, fill }, placed as in KIT, with `fill` naming 'team', 'trim' or 'panel'.
export function kitOps(part, number) {
  const ops = [
    { fill: 'team', rect: band(KIT.layout.main) },
    { fill: 'trim', rect: band(KIT.layout.trim) },
    { fill: part === 'jersey' ? 'panel' : 'trim', rect: band(KIT.layout.panel) },
  ];
  if (part === 'jersey') for (const spot of [KIT.chest, KIT.back]) ops.push({ text: String(number), ...spot, fill: 'trim' });
  return ops;
}

// A row of stitches across the picture at height y.
const stitches = y => {
  const [length, gap, thick] = KIT.stitch.dash, ops = [];
  for (let x = 0; x < 1; x += length + gap) ops.push({ fill: 'high', rect: [x, y - thick / 2, length, thick] });
  return ops;
};

// What stands out of the cloth on a `part`, painted as heights (white raised, black flat) in the same places: the
// numbers, which are stitched on, and the stitching along each seam.
export function heightOps(part, number) {
  const { trim, panel } = KIT.layout, inset = KIT.stitch.inset;
  const ops = [{ fill: 'low', rect: [0, 0, 1, 1] }, ...stitches(trim[1] - inset), ...stitches(panel[0] + inset), ...stitches(panel[1] - inset)];
  if (part === 'jersey') for (const spot of [KIT.chest, KIT.back]) ops.push({ text: String(number), ...spot, fill: 'high' });
  return ops;
}

// The colours each fill names, for `team` (0 or 1).
export function kitColours(team) {
  const rgb = KIT.team[team].slice(1).match(/../g).map(h => Math.round(parseInt(h, 16) * KIT.shade));
  return { team: KIT.team[team], trim: KIT.trim, panel: `rgb(${rgb.join(', ')})`, high: '#ffffff', low: '#000000' };
}

// Paints `ops` on a 2D canvas context whose picture is `size` pixels each way, in `colours` (see kitColours).
export function paintKit(context, size, ops, colours) {
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const op of ops) {
    context.fillStyle = colours[op.fill];
    if (op.rect) context.fillRect(...op.rect.map(n => n * size));
    else {
      const px = op.height * size;
      context.font = KIT.font.replace('{px}', Math.round(px));
      // The last argument is the widest the number may be: a wider one is squeezed to fit.
      context.fillText(op.text, op.at[0] * size, op.at[1] * size, px * KIT.digit * op.text.length);
    }
  }
}

// A tangent-space normal map (RGBA bytes, rows from the top) from a picture of heights (RGBA bytes, its red the height)
// `size` pixels each way: each pixel's slope taken from its neighbours, held at the edges. `strength`: how steep a
// step from black to white is.
export function normalFromHeight(heights, size, strength = 2) {
  const out = new Uint8ClampedArray(size * size * 4);
  const h = (x, y) => heights[(Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * 0.5 * strength, dy = (h(x, y + 1) - h(x, y - 1)) * 0.5 * strength;
    const length = Math.hypot(dx, dy, 1), at = (y * size + x) * 4;
    // Rows run down the picture; a normal map's green points up it.
    out[at] = Math.round((-dx / length * 0.5 + 0.5) * 255);
    out[at + 1] = Math.round((dy / length * 0.5 + 0.5) * 255);
    out[at + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
    out[at + 3] = 255;
  }
  return out;
}
