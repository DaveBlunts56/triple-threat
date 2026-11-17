// The teams' arenas: each team's home, as its building, its court and its banners look. Plain data, no Three.js; the
// building (building.js), the floor (floor.js) and the video board (videoboard.js) are made from it. The dev teams'
// names are invented; the league's are parodies (see sim/league.js).
import { TEAMS } from '../sim/teams.js';
import { assetUrl } from './assets.js';

const f = Object.freeze;

// Each team's mark (see sim/teams.js), by team id.
export const LOGOS = Object.freeze(TEAMS.map(team => team.logo));

// The pictures of the marks that are pictures (the league's: see sim/teams.js), by team id, once loadLogos has them.
const pictures = {};

// Loads every mark that is a picture. Resolves when they have all loaded (a missing one is left out: its team's mark
// is then drawn as a plain disc in its colour). In the browser only.
export function loadLogos() {
  return Promise.all(LOGOS.map((logo, team) => logo.image && new Promise(done => {
    const img = new Image();
    img.onload = () => { pictures[team] = img; done(); };
    img.onerror = () => done();
    img.src = assetUrl(logo.image);
  })));
}

// Draws team `team`'s mark on the 2D canvas context `g`, `size` pixels across, centred on (x, y): its picture, or its
// disc and paths. In the browser only (it needs Path2D).
export function drawLogo(g, team, x, y, size) {
  const logo = LOGOS[team], k = size / 40;
  if (logo.image && pictures[team]) { g.drawImage(pictures[team], x - size / 2, y - size / 2, size, size); return; }
  g.save();
  g.translate(x - size / 2, y - size / 2); g.scale(k, k);
  g.beginPath(); g.arc(20, 20, 18, 0, 2 * Math.PI);
  g.fillStyle = logo.disc; g.fill();
  g.lineWidth = 2; g.strokeStyle = logo.rim; g.stroke();
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const p of logo.paths ?? []) {
    const path = new Path2D(p.d);
    if (p.fill) { g.fillStyle = p.fill; g.fill(path); }
    if (p.stroke) { g.strokeStyle = p.stroke; g.lineWidth = p.width; g.stroke(path); }
  }
  g.restore();
}

// Team `team`'s mark as the inside of an SVG with a 0 0 40 40 view box, for the page.
export function logoSvg(team) {
  const logo = LOGOS[team];
  if (logo.image) return `<image href="${assetUrl(logo.image)}" x="0" y="0" width="40" height="40"/>`;
  const paths = logo.paths.map(p => `<path d="${p.d}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.width}" stroke-linecap="round" stroke-linejoin="round"` : ''}/>`);
  return `<circle cx="20" cy="20" r="18" fill="${logo.disc}" stroke="${logo.rim}" stroke-width="2"/>${paths.join('')}`;
}

// name, city: on the sidelines and the baselines. team: whose home it is. colour: the building's fascia, its accent
// (the ribbon's frame, the railings' tops, the tunnel signs), the stands' concrete, the steel of the roof, the tint of
// the railings' glass, the suites' glow, the roof's underside, the court's lane and centre circle (`laneShade`: how
// strongly the lane's colour stains the wood), and the roof's lights ([r, g, b], brighter than white so they bloom
// before LOOK.glow, see arena.js). trusses: the roof's shape, 'wave' (rolling) or 'angle' (folded into sharp ridges).
// banners: what hangs from the roof.
export const ARENAS = f({
  tidewater: f({
    name: 'TIDEWATER ARENA', city: 'HARBOR CITY', team: 0,
    colour: f({ fascia: '#0b2a52', accent: '#18a8a8', concrete: '#1b2232', steel: '#7d8794', glass: '#9fd4e6', warm: '#ffcf8a',
      ceiling: '#05070c', lane: '#1d4fb8', laneShade: 0.9, lights: f([1, 0.97, 0.92]) }),
    trusses: 'wave',
    banners: f([
      f({ top: 'HARBOR CITY WAVES', big: '2014', bottom: 'CONFERENCE CHAMPIONS' }),
      f({ top: 'HARBOR CITY WAVES', big: '2011', bottom: 'DIVISION CHAMPIONS' }),
      f({ top: 'HARBOR CITY WAVES', big: '2017', bottom: 'DIVISION CHAMPIONS' }),
      f({ top: 'WAVES LEGEND', big: '7', bottom: 'RETIRED' }),
    ]),
  }),
  redrock: f({
    name: 'RED ROCK PAVILION', city: 'RED ROCK', team: 1,
    colour: f({ fascia: '#80492c', accent: '#ff8a2a', concrete: '#46332a', steel: '#9a7660', glass: '#ffb37a', warm: '#ff9a48',
      ceiling: '#0d0605', lane: '#a3301e', laneShade: 0.85, lights: f([1, 0.84, 0.66]) }),
    trusses: 'angle',
    banners: f([
      f({ top: 'RED ROCK SCORPIONS', big: '2016', bottom: 'CONFERENCE CHAMPIONS' }),
      f({ top: 'RED ROCK SCORPIONS', big: '2009', bottom: 'DIVISION CHAMPIONS' }),
      f({ top: 'RED ROCK SCORPIONS', big: '2019', bottom: 'DIVISION CHAMPIONS' }),
      f({ top: 'SCORPIONS LEGEND', big: '23', bottom: 'RETIRED' }),
    ]),
  }),
});

// A colour `by` of the way to black.
const darker = (hex, by) => `#${hex.slice(1).match(/../g).map(h => Math.round(parseInt(h, 16) * (1 - by)).toString(16).padStart(2, '0')).join('')}`;

// The arena of a team that has none drawn here (the league's, for now): its own name and city, the building in its
// colours (its deep colour on the walls, its second on the trim), its lane in its colour, and its banners.
const made = {};
function arenaFor(id) {
  const t = TEAMS[id], year = k => 2001 + ((id * 7 + k * 5) % 24);
  return made[id] ??= f({
    name: (t.venue?.name ?? `${t.city} Arena`).toUpperCase(), city: t.city.toUpperCase(), team: id,
    colour: f({ fascia: darker(t.colour, 0.6), accent: t.secondary ?? '#ffffff', concrete: '#1c1f27', steel: '#808894', glass: '#cfd8e0', warm: '#ffd9a0',
      ceiling: '#06070b', lane: t.colour, laneShade: 0.85, lights: f([1, 0.97, 0.92]) }),
    trusses: id % 2 ? 'angle' : 'wave',
    banners: f([
      f({ top: t.name.toUpperCase(), big: String(year(0)), bottom: 'CONFERENCE CHAMPIONS' }),
      f({ top: t.name.toUpperCase(), big: String(year(1)), bottom: 'DIVISION CHAMPIONS' }),
      f({ top: t.name.toUpperCase(), big: String(year(2)), bottom: 'DIVISION CHAMPIONS' }),
      f({ top: `${t.nickname.toUpperCase()} LEGEND`, big: String(1 + ((id * 13) % 54)), bottom: 'RETIRED' }),
    ]),
  });
}

// The arena a match is played in: the home team's (`home`, its id), its own if drawn here, else made from the team.
// (A team there is not plays at Tidewater.)
export const arenaOf = (home = 0) => (TEAMS[home] ? ARENAS[TEAMS[home].arena] ?? arenaFor(home) : ARENAS.tidewater);
