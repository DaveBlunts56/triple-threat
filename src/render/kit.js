// What is painted on a jersey and a pair of shorts, and the painting. No Three.js here, so it can be tested without a browser.

const f = Object.freeze;

// size: pixels along each side of a kit's picture. team: the colour each team wears. trim: the bands and the numbers.
// font: {px} stands for the height of a number in pixels. digit: the widest one digit is painted, as a share of its
// height: the cloth stretches the picture sideways, so a digit this narrow has its natural shape on the player.
// The rest is where things go on the picture, which runs from 0 to 1 each way from its top left corner. Its left half
// is the front of the piece and its right half the back, each as you see it on the player, with the shoulders or the
// waistband along the top. A band is [x, y, width, height].
// sides: down his sides, where the front meets the back. hem: along the bottom edge.
// chest, back: the middle of the number and how tall it is.
export const KIT = f({
  size: 512, team: f(['#2f6fe0', '#d83a3a']), trim: '#ffffff', font: 'bold {px}px system-ui, sans-serif', digit: 0.45,
  sides: f([f([0, 0, 0.035, 1]), f([0.465, 0, 0.07, 1]), f([0.965, 0, 0.035, 1])]),
  hem: f([0, 0.94, 1, 0.06]),
  chest: f({ at: f([0.25, 0.42]), height: 0.26 }),
  back: f({ at: f([0.75, 0.40]), height: 0.34 }),
});

export const TEAM_COLOURS = KIT.team.map(hex => parseInt(hex.slice(1), 16));   // KIT.team as numbers, for a material

// What to paint on a `part` ('jersey' or 'shorts') of the player wearing `number`, in the order it is painted:
// { fill, rect } or { text, at, height, fill }, placed as in KIT, with `fill` naming the team's colour or the trim.
export function kitOps(part, number) {
  const band = rect => ({ fill: 'trim', rect });
  const ops = [{ fill: 'team', rect: [0, 0, 1, 1] }, ...KIT.sides.map(band), band(KIT.hem)];
  if (part === 'jersey') for (const spot of [KIT.chest, KIT.back]) ops.push({ text: String(number), ...spot, fill: 'trim' });
  return ops;
}

// Paints `ops` on a 2D canvas context whose picture is `size` pixels each way, for `team` (0 or 1).
export function paintKit(context, size, ops, team) {
  const colours = { team: KIT.team[team], trim: KIT.trim };
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const op of ops) {
    context.fillStyle = colours[op.fill];
    if (op.rect) context.fillRect(...op.rect.map(n => n * size));
    else {
      const px = op.height * size;
      context.font = KIT.font.replace('{px}', Math.round(px));
      // The last argument is the widest the number may be: a wider one is squeezed to fit, so no font reaches the bands.
      context.fillText(op.text, op.at[0] * size, op.at[1] * size, px * KIT.digit * op.text.length);
    }
  }
}
