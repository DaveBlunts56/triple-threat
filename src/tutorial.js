// The tutorial: a guided practice on the court, a step at a time, each ticked off when the player has done it. Plain
// logic, no page: the match it runs in is an ordinary one (see main.js), the other team standing aside at the far end,
// the clocks held, and the ball handed back to you whenever it is lost or a shot is over.
import { attackSign, emptyIntent } from './sim/state.js';
import { giveBall } from './sim/players.js';
import { CLOCK } from './sim/tuning.js';
import { keyLabel } from './keys.js';

const f = Object.freeze;
const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);

// The steps, in order: what each asks, in the player's own keys (`k(action)`: its key's name), and for the walking
// ones the spot to reach ([metres toward the hoop you attack, metres across]). near: how close to a spot counts.
// back: seconds after the ball is lost, or a shot is over, before it is handed back.
// top: where the ball is handed back for the steps after the walking ones, the top of the key ([metres toward the
// hoop, across]), so that a shot, a drive or a play is at hand. aside: how far beyond half court the other team stands.
export const TUTORIAL = f({ near: 1.3, back: 1.2, aside: 11, top: f([7.5, 0]) });
export const STEPS = f([
  f({ key: 'move', title: 'Move', words: k => `${['up', 'left', 'down', 'right'].map(k).join(' ')} move your player. Walk into the blue ring on the floor.`, spot: f([5, 4]) }),
  f({ key: 'sprint', title: 'Sprint', words: k => `Hold ${k('sprint')} while you move to sprint. Sprint into the next blue ring.`, spot: f([11, -4.5]) }),
  f({ key: 'pass', title: 'Pass', words: k => `${k('pass')} passes to a teammate (hold a direction to pick which one). You then play as him. Make a pass.` }),
  f({ key: 'shoot', title: 'Shoot', words: k => `Hold ${k('shoot')} to rise, and let go at the top of the meter beside you: green is perfect. Take a shot.` }),
  f({ key: 'dunk', title: 'Dunk', words: k => `Drive at the rim and press ${k('dunk')} when you are close to it. Dunk it.` }),
  f({ key: 'play', title: 'Call a play', words: k => `Over half court, press ${k('plays')} for your plays, then a number to call one.` }),
  f({ key: 'run', title: 'Run the play', words: k => `Run it: your teammates move into their spots. Pass (${k('pass')}) to the one who comes open, or take the shot it makes.` }),
]);

// A tutorial at its first step. step: the step on (STEPS.length once all are done). since: the match time the step
// began. lost: when the ball was lost or a shot ended, or null. ticked: when each step was done, by key.
export const createTutorial = state => ({ step: 0, since: state.time, lost: null, ticked: {}, playSeen: false });

// The words of the step on, in the player's keys (`keys`, the actions' keys), or the closing words once all are done.
export function tutorialWords(tut, keys) {
  const k = action => keyLabel(keys[action]);
  if (tut.step >= STEPS.length) return 'That is the basics. Press Enter to go back to the menu, and pick Exhibition for a real game.';
  return STEPS[tut.step].words(k);
}

// The spot the step on asks you to reach, on the court ({ x, z }), or null.
export function tutorialSpot(tut, state) {
  const spot = STEPS[tut.step]?.spot;
  return spot ? { x: attackSign(0) * spot[0], z: spot[1] } : null;
}

// The one you play as, on your team.
const yours = state => state.players[state.controlled];
// A shot your team took since the step began, or null.
const shotSince = (tut, state) => (state.shot && state.shot.at >= tut.since && state.players[state.shot.shooter].team === 0 ? state.shot : null);

// Whether the step on is done, from the match and your keys (`intent`) this frame.
function done(tut, state, intent) {
  const me = yours(state), step = STEPS[tut.step];
  switch (step.key) {
    case 'move': { const s = tutorialSpot(tut, state); return dist(me, s.x, s.z) <= TUTORIAL.near; }
    case 'sprint': { const s = tutorialSpot(tut, state); return !!intent.sprint && dist(me, s.x, s.z) <= TUTORIAL.near; }
    case 'pass': return state.players.some(p => p.team === 0 && p.fed && p.fed.at >= tut.since);
    case 'shoot': return !!shotSince(tut, state);
    case 'dunk': return shotSince(tut, state)?.finish === 'dunk';
    case 'play': return state.plays[0] !== null || state.playCall[0] !== null;
    case 'run': {
      if (state.plays[0]) tut.playSeen = true;
      return state.plays[0]?.passAt != null || (tut.playSeen && !!shotSince(tut, state));
    }
    default: return false;
  }
}

// One frame of the tutorial, after the match's step: ticks the step on when it is done and moves to the next.
// Returns the key of the step just done, or null.
export function stepTutorial(tut, state, intent = emptyIntent()) {
  if (tut.step >= STEPS.length || !done(tut, state, intent)) return null;
  const key = STEPS[tut.step].key;
  tut.ticked[key] = state.time;
  tut.step += 1; tut.since = state.time; tut.playSeen = false;
  return key;
}

// The other team's keys: it stands where it is (see placeAside).
export function idle(state, intents) {
  for (const p of state.players) if (p.team === 1) intents[p.id] = emptyIntent();
  return intents;
}

// Puts the other team out of the way, across half court from where you attack.
export function placeAside(state) {
  const sign = attackSign(0);
  state.players.filter(p => p.team === 1).forEach((p, i, all) => {
    Object.assign(p, { x: -sign * TUTORIAL.aside, z: (i - (all.length - 1) / 2) * 3, vx: 0, vz: 0, y: 0, vy: 0 });
  });
}

// Keeps the practice going: the clocks held, and the ball handed back to you a moment after your team loses it, a
// shot is over, or play stops. Returns whether it handed the ball back this frame.
export function keepPractising(tut, state) {
  state.shotClock = CLOCK.shot;
  state.gameClock = Math.max(state.gameClock, 60);
  const holder = state.players[state.ball.holder];
  const lost = state.phase !== 'live' || state.possession !== 0 || (holder && holder.team !== 0) || state.ball.mode === 'loose';
  if (!lost) { tut.lost = null; return false; }
  tut.lost ??= state.time;
  if (state.time - tut.lost < TUTORIAL.back) return false;   // the match's time runs on in every phase
  handBack(state, STEPS[tut.step]?.spot ? null : TUTORIAL.top);
  tut.lost = null;
  return true;
}

// The ball in the hands of the one you play as (or your team's first player), play live, nothing pending; with `at`
// ([metres toward the hoop, across]) he is put there first.
export function handBack(state, at = null) {
  const me = yours(state).team === 0 ? yours(state) : state.players.find(p => p.team === 0);
  if (at) Object.assign(me, { x: attackSign(0) * at[0], z: at[1], vx: 0, vz: 0, y: 0, vy: 0 });
  for (const p of state.players) Object.assign(p, { shooting: false, fading: false, finish: null, inbounder: false, held: false, steps: 0 });
  Object.assign(state, { phase: 'live', phaseT: 0, call: null, freeThrow: null, pendingFoul: null, board: false, shot: null });
  Object.assign(state.ball, { x: me.x, y: 1, z: me.z, vx: 0, vy: 0, vz: 0, mode: 'held', holder: null, target: null, shooter: null, shotValue: 0, made: false });
  giveBall(state, me);
  state.clockRuns = true;
  placeAside(state);
}
