// What is painted on a jersey, a pair of shorts and the socks, and the painting, as basketball kit is worn today: a word
// arched across the chest over a big outlined number, side panels piped in a colour that stands out, shorts with bold
// stripes down their sides and a trimmed hem, and white or black crew socks. A team with home and road uniforms (the
// league's: see sim/league.js) wears its home whites at home, its nickname on the chest, and its road colours away,
// its city on the chest; a dev team wears its one kit, its nickname on the chest. No Three.js here, so it can be
// tested without a browser.
import { TEAMS } from '../sim/teams.js';

const f = Object.freeze;

// layout: the regions of each garment's picture, as [top, bottom] shares of its height (the build lays the garment
// out so: tools/blender/kit.py LAYOUT): main, the front panel on the left and the back on the right, the garment's top
// along the top; trim, the bindings, waistband and hems, with their inner (stitched) edge at the bottom.
// sides: where the front panel meets the back, as [x, width] shares of the picture's width: the side panels of a
// jersey and the stripes of the shorts are painted there, as wide as `sides` says for each. hem: the trim line round
// each leg of the shorts just above the hem's binding: where its middle is and how tall it is, shares of the height.
// size: pixels along each side of a garment's picture. team: the colour each team wears (by team id). trim: the bindings and the
// numbers. shade: how much darker than the team's colour a jersey's side panels are. font: {px} stands for the height
// of a number in pixels. digit: the widest one digit is painted, as a share of its height: the cloth stretches the
// picture sideways, so a digit this narrow has its natural shape on the player. chest, back: the middle of the number
// and how tall it is. name: the team's name across the chest: the middle of its middle letter, how tall the letters are,
// how far round an arch the word bends (radians, end to end), how far apart the letters are (a share of their
// width), and the widest the word may be (most of the chest between the arm holes): a longer one is lettered smaller. outline: how thick the outline round each letter and number is, as a share of its height. piping: how wide
// the white line down the inner edge of each side panel is. stitch: the stitching along each seam: [length, gap,
// thickness] of a stitch, in shares of the picture, and how far in from the seam it runs. gear: the colours headbands, sleeves and wristbands come in, besides
// the team's, and their order on the far model's picture (see ATLAS).
export const KIT = f({
  layout: f({ main: f([0, 0.8]), trim: f([0.82, 0.9]) }),
  sides: f({ at: f([0.02, 0.48, 0.52, 0.98]), jersey: 0.025, shorts: 0.07 }), hem: f({ at: 0.765, height: 0.014 }),
  size: 512, team: f(TEAMS.map(t => t.colour)), trim: '#ffffff', shade: 0.7, font: 'bold {px}px system-ui, sans-serif', digit: 0.45,
  chest: f({ at: f([0.25, 0.5]), height: 0.22 }),
  back: f({ at: f([0.75, 0.36]), height: 0.30 }),
  name: f({ at: f([0.25, 0.3]), height: 0.09, arch: 0.8, spacing: 1.15, widest: 0.245 }),
  outline: 0.12, piping: 0.005,
  stitch: f({ dash: f([0.008, 0.006, 0.003]), inset: 0.006 }),
  gear: f({ white: '#f2f2f2', black: '#161616', order: f(['white', 'black', 'team']) }),
});

// The socks: tubes round his legs that the file draws from a corner of the shoes' picture, [x, y, width, height] in
// shares of it (round the corner the file's sock uses, u 0.78-1 and v 0.86-1), repainted white under a light jersey
// and black under a dark one. light: how light a jersey must be (0 to 1) to go with white socks. knit: how strongly
// the file's knit shows through the new colour.
export const SOCK = f({ rect: f([0.77, 0.85, 0.23, 0.15]), white: '#f2f2f2', black: '#1b1b1b', light: 0.6, knit: 0.35 });

// The one picture a player's far model wears (see people.js): each part's picture drawn in its own place, so that the
// whole player is one thing to draw. size: pixels along each side at full quality. gutter: pixels left clear round
// each part's picture, so that neighbours do not bleed into it when the picture is shrunk for distance. cells: where
// each part's picture lies, as [x, y, width, height] in shares of the whole, from its top left corner. The gear's
// place holds a swatch of each of its colours, side by side in KIT.gear.order.
export const ATLAS = f({
  size: 1024, gutter: 6,
  cells: f({ skin: f([0, 0, 0.5, 0.5]), jersey: f([0.5, 0, 0.5, 0.5]), shorts: f([0, 0.5, 0.5, 0.5]), hair: f([0.5, 0.5, 0.25, 0.4375]), shoes: f([0.75, 0.5, 0.25, 0.5]), gear: f([0.5, 0.9375, 0.25, 0.0625]) }),
});

// The part of the one picture that a material of the players' file is drawn in, by its name, or null for the parts
// that are not on it (eyes, brows and lashes).
export const atlasPart = name => Object.keys(ATLAS.cells).find(part => name.startsWith(part)) ?? null;

// Where a part's own picture is drawn on the one picture: its cell, less the gutter, as [x, y, width, height].
export function atlasRect(part) {
  const [x, y, w, h] = ATLAS.cells[part], gutter = ATLAS.gutter / ATLAS.size;
  return [x + gutter, y + gutter, w - 2 * gutter, h - 2 * gutter];
}

// The point (u, v) of a part's own picture, as a point of the one picture. A point outside the part's picture is held
// to its edge.
export function atlasUV(part, u, v) {
  const [x, y, w, h] = atlasRect(part), hold = n => Math.min(Math.max(n, 0), 1);
  return [x + hold(u) * w, y + hold(v) * h];
}

// The colour ('#rrggbb') of gear worn in `colour` ('white', 'black' or 'team') by a player of `team` (0 or 1).
export const gearColour = (colour, team) => (colour === 'team' ? KIT.team[team] : KIT.gear[colour]);

export const TEAM_COLOURS = KIT.team.map(hex => parseInt(hex.slice(1), 16));   // KIT.team as numbers, for a material

// A region of the picture, [top, bottom], as a rectangle [x, y, width, height] across the whole width, a pixel's worth
// wider each way so that no seam of the background shows between regions when the picture is shrunk.
const band = ([top, bottom]) => [0, Math.max(0, top - 0.008), 1, Math.min(1, bottom + 0.008) - Math.max(0, top - 0.008)];
// The side panels or stripes of a `part`, as rectangles [x, y, width, height] down the main region at the side edges
// of its front and back panels; the outermost reach the picture's edges.
const sideRects = part => {
  const w = KIT.sides[part], [top, bottom] = KIT.layout.main, h = bottom - top, [a, b, c, d] = KIT.sides.at;
  return [[0, top, a + w, h], [b - w, top, w, h], [c, top, w, h], [d - w, top, 1 - d + w, h]];
};

// The line down the inner edge of each side panel (the edge away from the seam it covers).
const piping = sides => sides.map(([x, top, w, h]) => {
  const seam = KIT.sides.at.reduce((best, at) => (Math.abs(at - (x + w / 2)) < Math.abs(best - (x + w / 2)) ? at : best));
  const edge = Math.abs(x - seam) > Math.abs(x + w - seam) ? x : x + w;
  return [edge - KIT.piping / 2, top, KIT.piping, h];
});

// The word on the chest of `team`'s `kit` (see kitName): its city on its road colours, its nickname on its home whites
// and on a dev team's one kit.
export const chestWord = (team, kit = 'own') => (kit === 'road' ? TEAMS[team].city : TEAMS[team].nickname).toUpperCase();

// The lettering of a jersey for `team` in `kit` and `number`, in `fill` with an `outline`: its chest word arched across
// the chest, each letter turned to the arch, and the number on the chest and on the back.
function lettering(team, number, fill, outline, kit) {
  const word = chestWord(team, kit), { at: [x, y], arch, spacing, widest } = KIT.name;
  const fit = Math.min(1, widest / (KIT.name.height * KIT.digit * (spacing * (word.length - 1) + 1)));
  const height = KIT.name.height * fit, step = height * KIT.digit * spacing, radius = (step * word.length) / arch;
  const letters = [...word].map((text, k) => {
    const angle = ((k - (word.length - 1) / 2) * step) / radius;
    return { text, at: [x + radius * Math.sin(angle), y + radius * (1 - Math.cos(angle))], height, angle, fill, outline };
  });
  return [...letters, ...[KIT.chest, KIT.back].map(spot => ({ text: String(number), ...spot, fill, outline }))];
}

// What to paint on a `part` ('jersey' or 'shorts') of the player of `team` wearing `number` in `kit` (see kitName), in
// the order it is painted: { fill, rect } or { text, at, height, angle?, fill, outline }, placed as in KIT, with `fill`
// and `outline` naming 'team' (the body), 'panel', 'piping', 'binding', 'letters' or 'outline' (see kitColours).
// Everything below the main region is the binding's colour, the strip and round it, so that no clear pixel is ever
// blended into a binding's edge when the picture is shrunk (it frayed: the far model drops what is not opaque).
export function kitOps(part, number, team = 0, kit = 'own') {
  const sides = sideRects(part), below = KIT.layout.main[1] + 0.008;
  const ops = [
    { fill: 'team', rect: band(KIT.layout.main) },
    { fill: 'binding', rect: [0, below, 1, 1 - below] },
    ...sides.map(rect => ({ fill: 'panel', rect })),
    ...piping(sides).map(rect => ({ fill: 'piping', rect })),
    { fill: 'binding', rect: band(KIT.layout.trim) },
  ];
  if (part === 'shorts') ops.push({ fill: 'piping', rect: [0, KIT.hem.at - KIT.hem.height / 2, 1, KIT.hem.height] });
  if (part === 'jersey') ops.push(...lettering(team, number, 'letters', 'outline', kit));
  return ops;
}

// A row of stitches across the picture at height y; a column of them down the main region at x.
const stitches = y => {
  const [length, gap, thick] = KIT.stitch.dash, ops = [];
  for (let x = 0; x < 1; x += length + gap) ops.push({ fill: 'high', rect: [x, y - thick / 2, length, thick] });
  return ops;
};
const stitchesDown = x => {
  const [length, gap, thick] = KIT.stitch.dash, [top, bottom] = KIT.layout.main, ops = [];
  for (let y = top; y < bottom; y += length + gap) ops.push({ fill: 'high', rect: [x - thick / 2, y, thick, Math.min(length, bottom - y)] });
  return ops;
};

// What stands out of the cloth on a `part`, painted as heights (white raised, black flat) in the same places: the
// name and numbers, which are stitched on with their outlines, the stitching along the bindings' inner edge, and down
// each side panel's seams.
export function heightOps(part, number, team = 0, kit = 'own') {
  const { trim } = KIT.layout, inset = KIT.stitch.inset;
  const seams = sideRects(part).flatMap(([x, , w]) => [x + inset, x + w - inset]).filter(x => x > 0.01 && x < 0.99);
  const ops = [{ fill: 'low', rect: [0, 0, 1, 1] }, ...stitches(trim[1] - inset), ...seams.flatMap(stitchesDown)];
  if (part === 'jersey') ops.push(...lettering(team, number, 'high', 'high', kit));
  return ops;
}

// The kit team `id` wears as side `side` of a match whose home side is `home`: 'home' or 'road' for a team with home
// and road uniforms, 'own' for one with a single kit (a dev team's), whichever side it is on.
export const kitName = (id, side, home = 0) => (TEAMS[id]?.uniforms ? (side === home ? 'home' : 'road') : 'own');

// A colour's red, green and blue (0 to 255) from '#rrggbb'; how far apart two such colours are; how light one is (0 to 1).
const rgbOf = hex => hex.slice(1).match(/../g).map(h => parseInt(h, 16));
const apart = (a, b) => Math.hypot(...rgbOf(a).map((v, i) => v - rgbOf(b)[i]));
export const lightness = hex => { const [r, g, b] = rgbOf(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
// The piping of a uniform (`own`: its jersey, trim, letters and outline): the first of its outline, its lettering's
// colour, white and black that stands out from both the panels it edges (the trim) and the cloth beside them.
export const pipingOf = own => [own.outline, own.letters, KIT.trim, KIT.gear.black].find(c => apart(c, own.trim) > 120 && apart(c, own.jersey) > 120) ?? KIT.trim;

// The colours each fill names, for team `team` (its id) in its `kit` (see kitName): the body ('team'), the side panels,
// the piping down them and round the shorts' hems, the bindings, the lettering and its outline, and the heights' white
// and black. One kit of the team's uniforms has its jersey's colour on the body and its trim's on the panels and
// bindings, piped in a colour that stands out from both (see pipingOf); a single kit has the team's colour on the body,
// a shade of it on the panels and round the lettering, and white for the rest.
export function kitColours(team, kit = 'own') {
  const own = TEAMS[team]?.uniforms?.[kit], heights = { high: '#ffffff', low: '#000000' };
  if (own) return { team: own.jersey, panel: own.trim, piping: pipingOf(own), binding: own.trim, letters: own.letters, outline: own.outline, ...heights };
  const rgb = KIT.team[team].slice(1).match(/../g).map(h => Math.round(parseInt(h, 16) * KIT.shade)), shade = `rgb(${rgb.join(', ')})`;
  return { team: KIT.team[team], panel: shade, piping: KIT.trim, binding: KIT.trim, letters: KIT.trim, outline: shade, ...heights };
}

// Paints `ops` on a 2D canvas context whose picture is `size` pixels each way, in `colours` (see kitColours).
export function paintKit(context, size, ops, colours) {
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const op of ops) {
    context.fillStyle = colours[op.fill];
    if (op.rect) context.fillRect(...op.rect.map(n => n * size));
    else {
      const px = op.height * size, widest = px * KIT.digit * op.text.length;   // a wider one is squeezed to fit
      context.save();
      context.translate(op.at[0] * size, op.at[1] * size);
      if (op.angle) context.rotate(op.angle);
      context.font = KIT.font.replace('{px}', Math.round(px));
      if (op.outline) {
        context.strokeStyle = colours[op.outline];
        context.lineWidth = px * KIT.outline;
        context.lineJoin = 'round';
        context.strokeText(op.text, 0, 0, widest);
      }
      context.fillText(op.text, 0, 0, widest);
      context.restore();
    }
  }
}

// The colour of the socks worn under a jersey of `colours` (see kitColours): white under a light one, black under a
// dark one.
export const sockColour = colours => (lightness(colours.team) >= SOCK.light ? SOCK.white : SOCK.black);

// Repaints the socks on a shoes' picture already drawn on `context` at [x, y, width, height] (pixels), from `image`
// (the file's picture): the sock's corner filled with `colour`, and the file's knit laid over it, darkening a white
// sock and lightening a black one.
export function paintSocks(context, image, [x, y, w, h], colour) {
  const [u, v, sw, sh] = SOCK.rect, { width, height } = image;
  context.save();
  context.fillStyle = colour;
  context.fillRect(x + u * w, y + v * h, sw * w, sh * h);
  context.globalAlpha = SOCK.knit;
  context.globalCompositeOperation = colour === SOCK.white ? 'multiply' : 'screen';
  context.drawImage(image, u * width, v * height, sw * width, sh * height, x + u * w, y + v * h, sw * w, sh * h);
  context.restore();
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
