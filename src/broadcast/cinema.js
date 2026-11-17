// The broadcast's close-ups (overhaul Stage 4): after a big basket the camera comes in on the scorer as he celebrates,
// and at a timeout on the huddle of the team that called it, then goes back to the game. Only while the ball is dead:
// a close-up ends the moment play is live again, and any key ends it sooner. The camera eases in and out of it from
// wherever the game's camera is (see scene.js). Worked out from the match and from who reacts (see reactions.js); it
// changes neither. Times are real seconds, as the broadcast's are.
import { personOf } from '../sim/state.js';
import { nicknameOf } from '../sim/teams.js';
import { CELEBRATIONS } from './reactions.js';

// basket, huddle: seconds a close-up lasts at most. ease: seconds the camera takes to come in, and to go back.
// near, far: metres in front of the scorer the camera ends and starts (it pushes in), high: its height, look: the
// height it looks at, aside: metres to his side, fov: its field of view. ring, ringHigh, turn: the huddle's: metres from
// its middle, height, and how fast it goes round, in radians a second. court: the camera stays within these of the
// middle of the court, clear of the seats. gap: real seconds after a scorer's close-up before another (a clinching
// basket, celebrated with both arms up, always has one).
export const CINEMA = Object.freeze({ basket: 2.8, huddle: 3.6, gap: 90, ease: 0.6, near: 2.4, far: 3.4, high: 1.55, look: 1.3, aside: 0.6, fov: 30,
  ring: 3.4, ringHigh: 2.5, turn: 0.12, court: Object.freeze({ x: 15.4, z: 8.4 }) });

// on: the close-up showing, { kind: 'scorer' | 'huddle', id (the scorer) or team (the huddle's), from, until }, or null.
// seen: the last basket and the last timeout one was shown for, so none is shown twice. last: when the last scorer's
// close-up began.
export const createCinema = () => ({ on: null, seen: { score: null, call: null }, last: -Infinity });

const smooth = t => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
const dead = state => state.phase === 'dead' || state.phase === 'inbound' || state.phase === 'freeThrow';

// One frame at real time `now`: starts a close-up after a big basket (its scorer has just begun a celebration: see
// reactions.js's `react`, given as `reacting`) or at a timeout, and ends one that is over or whose play has gone live.
// `blocked`: something else has the screen (a replay): nothing starts, and one on ends. Returns the close-up, or null.
export function cue(c, state, now, reacting = {}, blocked = false) {
  if (c.on && (blocked || now >= c.on.until || !dead(state) || state.phase === 'start' || state.phase === 'final')) c.on = null;
  if (blocked || c.on || !dead(state)) return c.on;
  const sc = state.last.score, scorer = sc && state.players[sc.by];
  const clip = scorer && reacting[scorer.id]?.clip, celebrating = CELEBRATIONS.includes(clip);
  if (celebrating && c.seen.score !== sc && (clip === 'armsUp' || now - c.last >= CINEMA.gap)) {
    c.seen.score = sc; c.last = now;
    c.on = { kind: 'scorer', id: scorer.id, from: now, until: now + CINEMA.basket };
  } else if (state.call?.kind === 'timeout' && state.huddle && c.seen.call !== state.call) {
    c.seen.call = state.call;
    c.on = { kind: 'huddle', team: state.call.team, from: now, until: now + CINEMA.huddle };
  }
  return c.on;
}

// Any key: the close-up ends now.
export const skipClose = c => { c.on = null; };

// Where the close-up's camera is at `now`: { at: [x, y, z], look: [x, y, z], fov, blend }, `blend` how far the picture
// has come from the game's camera to it (0 to 1, eased in over CINEMA.ease and out over the last of it). Null with none.
export function closeUp(c, state, now) {
  const on = c.on;
  if (!on) return null;
  const t = now - on.from, blend = Math.min(smooth(t / CINEMA.ease), smooth((on.until - now) / CINEMA.ease));
  const keep = (x, z) => [Math.max(-CINEMA.court.x, Math.min(CINEMA.court.x, x)), Math.max(-CINEMA.court.z, Math.min(CINEMA.court.z, z))];
  if (on.kind === 'scorer') {
    const p = state.players[on.id], ahead = { x: Math.cos(p.facing), z: Math.sin(p.facing) };
    const d = CINEMA.far + (CINEMA.near - CINEMA.far) * smooth(t / (on.until - on.from));   // pushing in
    const [x, z] = keep(p.x + ahead.x * d - ahead.z * CINEMA.aside, p.z + ahead.z * d + ahead.x * CINEMA.aside);
    return { at: [x, CINEMA.high, z], look: [p.x, CINEMA.look, p.z], fov: CINEMA.fov, blend };
  }
  const m = state.huddle?.centres[on.team];
  if (!m) return null;
  const angle = Math.atan2(-m.z, -m.x) + CINEMA.turn * t;   // from the middle of the court's side, going round
  const [x, z] = keep(m.x + Math.cos(angle) * CINEMA.ring, m.z + Math.sin(angle) * CINEMA.ring);
  return { at: [x, CINEMA.ringHigh, z], look: [m.x, 1, m.z], fov: CINEMA.fov + 8, blend };
}

// The card shown with a close-up, { title, lines }, or null: the scorer's name and his night so far; the team that
// called the timeout and how many it has left.
export function closeCard(c, state) {
  const on = c.on;
  if (!on) return null;
  if (on.kind === 'scorer') {
    const person = personOf(state, state.players[on.id]), s = person.stats;
    return { title: person.name.toUpperCase(), lines: [`${s.pts} PTS · ${s.reb} REB · ${s.ast} AST · ${s.fgm}/${s.fga} FG`] };
  }
  return { title: `${nicknameOf(state.teams[on.team]).toUpperCase()} HUDDLE`, lines: [`Timeout · ${state.timeouts[on.team]} left`] };
}
