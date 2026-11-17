// The team's moments between plays, which the players walk to and the renderer shows (see render/motion.js and
// broadcast/reactions.js): a man knocked to the floor and the team-mate who helps him up, the passer who goes to the
// scorer after an assisted basket, the team-mate who comes in from the lane to slap a free-throw shooter's hand, and the
// huddle at a timeout. Nothing here touches the ball, and the rules wait only for a man who is down to get up.
import { AI, COURT, DOWN, FT, HUDDLE, MEET, isHuman } from './tuning.js';

const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const mine = (state, p) => state.players.filter(m => m.team === p.team && m !== p);
// A team-mate the computer moves: not the man a person controls.
const moved = (state, p) => !(isHuman(state, p.team) && p.id === state.controlled);

// ---------- down on the floor ----------

// Knocks `p` down: he stays where he is, on the floor, for DOWN.time seconds, and the nearest team-mate the computer
// moves comes to help him up.
export function knockDown(state, p) {
  if (p.downT > 0) return;
  Object.assign(p, { downT: DOWN.time, fallOnLanding: false, vx: 0, vz: 0 });
  const helpers = mine(state, p).filter(m => moved(state, m) && m.downT <= 0);
  const helper = helpers.length ? helpers.reduce((a, b) => (apart(b, p) < apart(a, p) ? b : a)) : null;
  state.down = { id: p.id, helper: helper?.id ?? null };
}

// The clock of a man who is down, and his landing if he is to go down as he lands. Called each step for each player
// (see players.js), with `landed` true on the step he comes down.
export function stepDown(state, p, dt, landed) {
  if (landed && p.fallOnLanding) knockDown(state, p);
  if (p.downT <= 0) return;
  p.downT = Math.max(0, p.downT - dt);
  if (p.downT === 0 && state.down?.id === p.id) state.down = null;
}

// Whether anyone is down: the rules do not go on until he is up.
export const anyoneDown = state => state.players.some(p => p.downT > 0);

// Where the team-mate helping a man up stands: DOWN.help in front of him, the way he faces. Null for anyone else.
export function helpSpot(state, p) {
  const down = state.down && state.players[state.down.id];
  if (!down || state.down.helper !== p.id || down.downT <= 0) return null;
  return { x: down.x + Math.cos(down.facing) * DOWN.help, z: down.z + Math.sin(down.facing) * DOWN.help };
}

// ---------- the passer and the scorer ----------

// Where the man who passed for a basket goes in the seconds after it: to the scorer, until he is near him. Null for
// anyone else, and once they have met or MEET.time has gone.
export function meetSpot(state, p) {
  const sc = state.last.score;
  if (!sc || sc.assist === null || sc.assist === undefined || p.team !== sc.team || p.person !== sc.assist || state.time - sc.at > MEET.time) return null;
  const scorer = state.players[sc.by];
  if (!scorer || scorer === p || apart(p, scorer) <= MEET.near) return null;
  return { x: scorer.x + scorer.vx * 0.3, z: scorer.z + scorer.vz * 0.3 };
}

// ---------- the free throw ----------

// After a made free throw that is not the last: the shooter's team-mate nearest him (one the computer moves) comes in
// from his place to stand FT.fiveSide to the shooter's side, slaps his hand, and goes back. Returns the plan, or null.
export function freeThrowFive(state, shooter) {
  const mates = mine(state, shooter).filter(m => moved(state, m));
  if (!mates.length) return null;
  const by = mates.reduce((a, b) => (apart(b, shooter) < apart(a, shooter) ? b : a));
  // The shooter faces the hoop: his side toward the team-mate.
  const side = Math.cos(shooter.facing) * (by.z - shooter.z) - Math.sin(shooter.facing) * (by.x - shooter.x) < 0 ? -1 : 1;
  const to = { x: shooter.x - Math.sin(shooter.facing) * side * FT.fiveSide, z: shooter.z + Math.cos(shooter.facing) * side * FT.fiveSide };
  return { by: by.id, home: { x: by.x, z: by.z, facing: by.facing }, to, stage: 'in', held: 0, t: 0 };
}

// Near enough a spot to have got there: where a computer player stops walking to it (AI.arrive), and a little more.
const THERE = AI.arrive + 0.05;

// One step of it (see freethrow.js): he walks in, holds a moment, and walks back, and is put exactly where he was. It
// never takes more than FT.fiveMost seconds, whatever is in his way. Returns whether it is still on.
export function stepFive(state, five, dt) {
  const p = state.players[five.by];
  five.t += dt;
  if (five.stage === 'in' && apart(p, five.to) < THERE) five.stage = 'slap';
  else if (five.stage === 'slap' && (five.held += dt) >= FT.fiveHold) five.stage = 'back';
  else if ((five.stage === 'back' && apart(p, five.home) < THERE) || five.t >= FT.fiveMost) {
    Object.assign(p, { x: five.home.x, z: five.home.z, vx: 0, vz: 0, facing: five.home.facing });
    return false;
  }
  return true;
}

// Where he is walking now.
export const fiveTarget = five => (five.stage === 'back' ? five.home : five.to);

// ---------- the huddle ----------

// A timeout: each team's middle, moved HUDDLE.benchward toward its bench (the benches are along the -z side) and kept
// on the court, and the two kept apart.
export function startHuddle(state) {
  const centres = [0, 1].map(team => {
    const men = state.players.filter(p => p.team === team);
    const x = men.reduce((a, p) => a + p.x, 0) / men.length, z = men.reduce((a, p) => a + p.z, 0) / men.length - HUDDLE.benchward;
    return { x: Math.max(-COURT.halfLength + 1.5, Math.min(COURT.halfLength - 1.5, x)), z: Math.max(-COURT.halfWidth + 1.5, Math.min(COURT.halfWidth - 1.5, z)) };
  });
  const gap = centres[1].x - centres[0].x;
  if (Math.abs(gap) < 3) { const push = (3 - Math.abs(gap)) / 2 * (gap >= 0 ? 1 : -1); centres[0].x -= push; centres[1].x += push; }
  state.huddle = { centres };
}

// Where `p` stands in his team's huddle: round its middle, by his place in the order. Null once it is over, or in its
// last HUDDLE.back seconds, when everyone goes back.
export function huddleSpot(state, p) {
  if (!state.huddle || state.phase !== 'dead' || state.call?.kind !== 'timeout' || state.phaseT <= HUDDLE.back) return null;
  const c = state.huddle.centres[p.team], angle = (2 * Math.PI * p.slot) / state.size + p.team * 0.3;
  return { x: c.x + Math.cos(angle) * HUDDLE.ring, z: c.z + Math.sin(angle) * HUDDLE.ring, centre: c };
}
