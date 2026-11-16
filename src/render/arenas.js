// The teams' arenas: each team's home, as its building, its court and its banners look. Plain data, no Three.js; the
// building (building.js), the floor (floor.js) and the video board (videoboard.js) are made from it. All names are
// invented.
const f = Object.freeze;

// Each team's mark, as the scorebug draws it (index.html), in a 40-unit square: its disc, its rim, and its paths, each
// filled or stroked.
export const LOGOS = f([
  f({ disc: '#1d4fb8', rim: '#e6ecf5', paths: f([
    f({ d: 'M5 24c4-7 9-7 13 0s9 7 17-2v6c-7 7-13 6-17 0s-8-5-13 2z', fill: '#ffffff' }),
    f({ d: 'M8 17c3-5 7-5 10 0s7 5 13-1', stroke: '#9cc4ff', width: 2.4 }),
  ]) }),
  f({ disc: '#8f1717', rim: '#f1e2e2', paths: f([
    f({ d: 'M13 29c-5-5-5-13 1-17 5-3 12-1 13 4', stroke: '#ffffff', width: 3.2 }),
    f({ d: 'M27 16l4-6-1 8z', fill: '#ffffff' }),
    f({ d: 'M19.2 29a3.2 3.2 0 1 1-6.4 0a3.2 3.2 0 1 1 6.4 0z', fill: '#ffffff' }),
    f({ d: 'M19 28l7 2M19 30l6 4', stroke: '#ffffff', width: 2 }),
  ]) }),
]);

// Draws team `team`'s mark on the 2D canvas context `g`, `size` pixels across, centred on (x, y). In the browser only
// (it needs Path2D).
export function drawLogo(g, team, x, y, size) {
  const logo = LOGOS[team], k = size / 40;
  g.save();
  g.translate(x - size / 2, y - size / 2); g.scale(k, k);
  g.beginPath(); g.arc(20, 20, 18, 0, 2 * Math.PI);
  g.fillStyle = logo.disc; g.fill();
  g.lineWidth = 2; g.strokeStyle = logo.rim; g.stroke();
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const p of logo.paths) {
    const path = new Path2D(p.d);
    if (p.fill) { g.fillStyle = p.fill; g.fill(path); }
    if (p.stroke) { g.strokeStyle = p.stroke; g.lineWidth = p.width; g.stroke(path); }
  }
  g.restore();
}

// name, city: on the sidelines and the baselines. team: whose home it is. colour: the building's fascia, its accent
// (the ribbon's frame, the railings' tops, the tunnel signs), the stands' concrete, the steel of the roof, the tint of
// the railings' glass, the suites' glow, the roof's underside, and the court's lane and centre circle (`laneShade`: how
// strongly the lane's colour stains the wood). trusses: the roof's shape, 'wave' or 'angle'. banners: what hangs from
// the roof.
export const ARENAS = f({
  tidewater: f({
    name: 'TIDEWATER ARENA', city: 'HARBOR CITY', team: 0,
    colour: f({ fascia: '#0b2a52', accent: '#18a8a8', concrete: '#1b2232', steel: '#7d8794', glass: '#9fd4e6', warm: '#ffcf8a',
      ceiling: '#05070c', lane: '#1d4fb8', laneShade: 0.9 }),
    trusses: 'wave',
    banners: f([
      f({ top: 'HARBOR CITY WAVES', big: '2014', bottom: 'CONFERENCE CHAMPIONS' }),
      f({ top: 'HARBOR CITY WAVES', big: '2011', bottom: 'DIVISION CHAMPIONS' }),
      f({ top: 'HARBOR CITY WAVES', big: '2017', bottom: 'DIVISION CHAMPIONS' }),
      f({ top: 'WAVES LEGEND', big: '7', bottom: 'RETIRED' }),
    ]),
  }),
});

// The arena a match is played in: the home side's. (Until the Scorpions' is built, every match is at Tidewater.)
export const arenaOf = () => ARENAS.tidewater;
