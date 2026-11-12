// What is painted on a jersey and a pair of shorts, and the painting. No Three.js here, so it can be tested without a browser.

// size: pixels along each side of a kit's picture. team: the colour each team wears. trim: the bands and the numbers.
// font: {px} stands for the height of a number in pixels.
export const KIT = Object.freeze({ size: 512, team: ['#2f6fe0', '#d83a3a'], trim: '#ffffff', font: 'bold {px}px system-ui, sans-serif' });

export const TEAM_COLOURS = [0x2f6fe0, 0xd83a3a];   // KIT.team as numbers, for a material

// What to paint on a `part` ('jersey' or 'shorts') of the player wearing `number`, in the order it is painted.
// The picture runs from 0 to 1 each way from its top left corner. Its left half is the front of the piece and its
// right half the back, each as you see it on the player, with the shoulders or the waistband along the top.
export function kitOps(part, number) {
  const ops = [
    { fill: 'team', rect: [0, 0, 1, 1] },
    // Down his sides, where the front meets the back. The seam there is ragged, and the bands cover it.
    { fill: 'trim', rect: [0, 0, 0.06, 1] },
    { fill: 'trim', rect: [0.44, 0, 0.12, 1] },
    { fill: 'trim', rect: [0.94, 0, 0.06, 1] },
    { fill: 'trim', rect: [0, 0.94, 1, 0.06] },   // the hem
  ];
  if (part === 'jersey') {
    const text = String(number);
    ops.push({ text, at: [0.25, 0.42], height: 0.26, fill: 'trim' }, { text, at: [0.75, 0.40], height: 0.34, fill: 'trim' });   // chest, back
  }
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
      context.font = KIT.font.replace('{px}', Math.round(op.height * size));
      context.fillText(op.text, op.at[0] * size, op.at[1] * size);
    }
  }
}
