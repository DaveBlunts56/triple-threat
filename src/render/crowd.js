// The fans: who sits where, whose side they are on, what they wear and carry, how they cheer, and the crowd's mood
// eased from moment to moment. Plain logic, no Three.js, so it can be tested without a browser. The fans are drawn,
// and moved, by fans.js.
import { TEAMS, nicknameOf } from '../sim/teams.js';
import { KIT } from './kit.js';

const f = Object.freeze;

// The colours the fans are painted in. fans.js keeps them in one list; each fan names its colours by their place in it.
const SKINS = f(['#f3d3b5', '#e2b48c', '#c68c5e', '#9c6542', '#704529', '#4a2c18']);
const HAIRS = f(['#15100c', '#3a281b', '#6b4a2a', '#c8a15a', '#7c3518']);
const GREYS = f(['#8c8c8c', '#d6d6d0']);
const SHIRTS = f(['#e9ecef', '#2a2d33', '#5b6570', '#8c8f96', '#6a5a4a', '#3e4c5e', '#7b2d3a', '#2d5a7b', '#d9c9a3', '#46613a', '#c26a2a', '#f0e6c8']);
const PANTS = f(['#2c3d5a', '#22252c', '#7d6e55', '#141518', '#55585e', '#3a4f70']);
const SUITS = f(['#20232b', '#2c3440', '#3a2f2a']);
export const PALETTE = f([...SKINS, ...HAIRS, ...GREYS, ...SHIRTS, ...PANTS, ...SUITS, ...KIT.team, '#f4f4f2']);
const at = (list, i) => PALETTE.indexOf(list[i]);
const COLOURS = f(KIT.team.map(colour => PALETTE.indexOf(colour)));   // each team's colour's place in PALETTE, by id
export const WHITE = PALETTE.length - 1;

// How a fan cheers (style), what is on their head (hair) and what they carry (prop). A courtside fan only claps, and
// stays in their seat: standing there would block the camera's view of the court.
export const STYLE = f({ clap: 0, armsUp: 1, fistPump: 2, wave: 3, courtside: 4, sign: 5 });
export const HAIR = f({ bald: 0, short: 1, long: 2, cap: 3 });
export const PROP = f({ none: 0, finger: 1, towel: 2, sign: 3 });

// The crowd's make-up. side: the shares of home fans and away fans (the rest support neither). jersey, tee: the shares of
// a team's fans in its jersey (bare arms) and in a shirt of its colour; the rest wear their own. sleeves: the share of
// the rest in long sleeves. hair: the shares of each kind of head, in HAIR's order. kid, elder: the shares of children
// (smaller) and of the grey-haired. props: the shares of a team's fans with a foam finger, a towel and a sign. cheer:
// the shares of the rest who clap, throw both arms up (and jump), and pump a fist. courtsideHome: the share of the
// courtside seats held by home fans. dim: how much darker than on the floor the stands' fans are drawn. rise: how far
// below a seat its occupant's feet rest, on the lower stands, the upper deck and the floor.
export const CROWD = f({
  side: f([0.62, 0.16]), jersey: 0.35, tee: 0.35, sleeves: 0.25,
  hair: f([0.12, 0.43, 0.25, 0.2]), kid: 0.07, elder: 0.12,
  props: f([0.06, 0.1, 0.06]), cheer: f([0.5, 0.3, 0.2]),
  courtsideHome: 0.7, dim: 0.55, rise: f({ lower: 0.45, upper: 0.62, floor: 0.45 }),
});

// How far a standing fan reaches: up from their seat, arms and sign raised, at the tallest build and the top of a jump;
// and how far ahead of their seat they stand, their feet on the step in front.
export const REACH = f({ up: 2.4, ahead: 0.45 });

// The words on the fans' signs with team `home` at home against team `away` (ids), each with the team whose colour
// it is in: home fans hold one of the first three, away fans the last.
const nickname = team => nicknameOf(TEAMS[team]).toUpperCase();
export const signsFor = (home = 0, away = 1 - home) => [
  { words: 'DEFENSE!', team: home }, { words: `GO ${nickname(home)}!`, team: home }, { words: '#1 FAN', team: home },
  { words: `GO ${nickname(away)}!`, team: away },
];

// A small seeded generator for fan `i`: the same fan every time, not Math.random.
function dice(i) {
  let s = (i * 2654435761 + 0x9e3779b9) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
}
// The index of the share in `shares` that `r` falls in (past the last, the one after it).
const among = (shares, r) => { let sum = 0; for (let k = 0; k < shares.length; k++) { sum += shares[k]; if (r < sum) return k; } return shares.length; };

// One fan for a seat ({ x, y, z, facing }): `i` makes them who they are, `upper` puts them on the upper deck,
// `courtside` on the floor; `home` and `away` are the teams' ids, whose colours their fans wear. Returns the seat with
// { turn, width, height, rise, dim, side (0 home, 1 away, 2 neither), end (the end they sit behind, +1 or -1, or 0),
// style, seed, skin, shirt, pants, hair, upper, fore, prop colour (all places in PALETTE), hairStyle, prop, sign (its
// place in signsFor(home, away)) }.
export function dressFan(seat, i, { upper = false, courtside = false, home = 0, away = 1 - home } = {}) {
  const team = [COLOURS[home], COLOURS[away]];   // the home side's colour, the away side's
  const r = dice(i), kid = !courtside && r() < CROWD.kid, elder = !kid && r() < CROWD.elder;
  const side = courtside ? (r() < CROWD.courtsideHome ? 0 : 2) : among(CROWD.side, r());
  const pick = list => at(list, Math.floor(r() * list.length));
  const skin = pick(SKINS);
  // What they wear: a team's fans mostly wear its colour, a jersey with bare arms or a shirt; the rest their own,
  // some in long sleeves. Courtside, a suit as often as not.
  const wear = r();
  let shirt = pick(SHIRTS), upperArm = shirt, fore = skin;
  if (side < 2 && wear < CROWD.jersey) { shirt = team[side]; upperArm = skin; }
  else if (side < 2 && wear < CROWD.jersey + CROWD.tee) { shirt = upperArm = team[side]; }
  else if (courtside && wear < 0.5) { shirt = upperArm = fore = pick(SUITS); }
  else if (r() < CROWD.sleeves) fore = shirt;
  const pants = courtside && fore === shirt ? shirt : pick(PANTS);
  let hairStyle = among(CROWD.hair, r());
  if (courtside && hairStyle === HAIR.cap) hairStyle = HAIR.short;
  const hair = hairStyle === HAIR.cap ? (side < 2 && r() < 0.7 ? team[side] : pick(SHIRTS)) : elder ? pick(GREYS) : pick(HAIRS);
  const prop = side < 2 && !courtside ? [PROP.finger, PROP.towel, PROP.sign, PROP.none][among(CROWD.props, r())] : PROP.none;
  const propColour = prop === PROP.towel && r() < 0.5 ? WHITE : team[Math.min(side, 1)];
  const style = courtside ? STYLE.courtside : prop === PROP.sign ? STYLE.sign : prop !== PROP.none ? STYLE.wave
    : [STYLE.clap, STYLE.armsUp, STYLE.fistPump][Math.min(2, among(CROWD.cheer, r()))];
  const sign = side === 1 ? 3 : Math.floor(r() * 3);
  const behind = Math.abs(Math.sin(seat.facing)) > 0.5 && !courtside;   // the end stands face along the court
  return {
    ...seat, turn: seat.facing + (r() - 0.5) * 0.24,
    width: kid ? 0.84 : 0.9 + 0.26 * r() ** 2, height: kid ? 0.74 : 0.93 + 0.12 * r(),
    rise: courtside ? CROWD.rise.floor : upper ? CROWD.rise.upper : CROWD.rise.lower, dim: courtside ? 1 : CROWD.dim,
    side, end: behind ? Math.sign(seat.x) : 0, style, seed: r(),
    skin, shirt, pants, hair, upper: upperArm, fore, propColour, hairStyle, prop, sign,
  };
}

// A player on his team's bench (see sideline.js's benchSeats: `seat.team` his team's id), drawn as a fan of his team
// is: in its kit, on its side (0 for the home team, `home`, 1 for the visitors), so that he stands and cheers when its
// fans do; a third of them wave a white towel. `i` makes them who they are.
export const BENCH = f({ towel: 0.35, width: 1.04, height: 1.1 });
export function dressBench(seat, i, home = 0) {
  const r = dice(300000 + i), pick = list => at(list, Math.floor(r() * list.length));
  const colour = COLOURS[seat.team], skin = pick(SKINS), towel = r() < BENCH.towel;
  return {
    ...seat, turn: seat.facing, width: BENCH.width, height: BENCH.height, rise: CROWD.rise.floor, dim: 1,
    side: seat.team === home ? 0 : 1, end: 0, seed: r(),
    style: towel ? STYLE.wave : [STYLE.armsUp, STYLE.fistPump, STYLE.clap][Math.floor(r() * 3)],
    skin, shirt: colour, pants: colour, hair: pick(HAIRS), upper: skin, fore: skin, propColour: WHITE,
    hairStyle: r() < 0.3 ? HAIR.bald : HAIR.short, prop: towel ? PROP.towel : PROP.none, sign: 0,
  };
}

// The whole crowd: the courtside fans first (always shown), then the stands' in `stands` order (see layout.js's
// shown: the first so many fill the stands evenly). `upperFrom`: the height from which a seat is on the upper deck.
// `home`, `away`: the teams' ids.
export function dressCrowd(stands, courtside, upperFrom, home = 0, away = 1 - home) {
  return [...courtside.map((seat, i) => dressFan(seat, 100000 + i, { courtside: true, home, away })),
    ...stands.map((seat, i) => dressFan(seat, i, { upper: seat.y >= upperFrom, home, away }))];
}

// The crowd's mood as the fans show it, with side `home` (0 or 1, the match's state.home) at home: how far each
// side's fans are on their feet (home, away), the home fans' boos
// and groans, and the waving at a free-throw shooter behind `end` (+1 or -1). Each eases toward what the crowd's mood
// (life.js) says, `rise` a second going up and `fall` coming down, so that a crowd rises together and sits back down
// a few at a time rather than all in one frame.
export const MOOD = f({ rise: 1.4, fall: 1.4 });
export const createMood = () => ({ home: 0, away: 0, boo: 0, groan: 0, wave: 0, end: 0 });
export function stepMood(mood, life, dt, home = 0) {
  const ease = (v, to) => v + Math.max(-MOOD.fall * dt, Math.min(MOOD.rise * dt, to - v));
  mood.home = ease(mood.home, Math.min(1, life.cheer[home]));
  mood.away = ease(mood.away, Math.min(1, life.cheer[1 - home]));
  mood.boo = ease(mood.boo, Math.min(1, life.boo));
  mood.groan = ease(mood.groan, Math.min(1, life.groan));
  if (life.distract !== 0) mood.end = life.distract;
  mood.wave = ease(mood.wave, life.distract !== 0 ? 1 : 0);
  return mood;
}
