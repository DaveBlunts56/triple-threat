// The ball handler's moves: three ways of taking the ball across (a crossover, between the legs, behind the back) and
// the step-back. Each pushes him a set distance in a set time, during which he does not steer, and each can leave his
// defender late. The post fade is a shot, and lives with the shots in players.js.
import { DT, MOVES } from './tuning.js';
import { attackSign, onFloor, personOf, rand } from './state.js';
import { rimCentre } from './ball.js';
import { rated } from './ratings.js';
import { spend } from './stamina.js';

export const DRIBBLES = Object.freeze(['cross', 'legs', 'back']);
export const KINDS = Object.freeze([...DRIBBLES, 'stepBack']);

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// May `p` start a move now? He must have the ball in live play, on the floor, with his dribble alive, not shooting,
// not throwing the ball in, not in a move already, and not within MOVES.gap of his last.
export const canMove = (state, p) => state.phase === 'live' && state.ball.holder === p.id && onFloor(p) && !p.held && !p.shooting
  && !p.inbounder && !p.move && p.moveWait <= 0;

// Seconds a defender is late to a move by `handler`: MOVES.late when the handler's Handle equals his Defence, more for
// a better handler, down to nothing for a much worse one.
export const lateBy = (state, handler, defender) =>
  clamp(MOVES.late + ((rated(state, handler, 'handle') - rated(state, defender, 'defence')) / 10) * MOVES.latePer10, 0, MOVES.lateMax);

// Starts `kind` (one of KINDS) for `p` if he may. `intent` is his keys: a dribble move goes to the side they point,
// across his line to the hoop. Returns whether it started.
export function startMove(state, p, kind, intent) {
  if (!KINDS.includes(kind) || !canMove(state, p)) return false;
  const hoop = rimCentre(attackSign(p.team));
  const far = dist(hoop, p) || 1, hx = (hoop.x - p.x) / far, hz = (hoop.z - p.z) / far;   // toward the hoop
  // The nearest opponent, if he is close enough and on the floor: the one who can be beaten.
  let near = null;
  for (const o of state.players) if (o.team !== p.team && (!near || dist(o, p) < dist(near, p))) near = o;
  if (near && (dist(near, p) > MOVES.near || !onFloor(near))) near = null;

  let dx = -hx, dz = -hz;   // a step-back: straight away from the hoop
  if (kind !== 'stepBack') {
    const ax = -hz, az = hx;   // across his line to the hoop
    const want = (intent.moveX * ax + intent.moveZ * az) / Math.max(1, Math.hypot(intent.moveX, intent.moveZ));
    let side;
    if (Math.abs(want) > MOVES.side) side = Math.sign(want);                                                // where the keys point
    else if (near) side = (near.x - p.x) * ax + (near.z - p.z) * az > 0 ? -1 : 1;                          // away from his defender
    else side = -p.z * az >= 0 ? 1 : -1;                                                                    // toward the middle of the court
    dx = ax * side; dz = az * side;
  }
  // A tired player's move carries him less far.
  const push = MOVES[kind].push * (MOVES.tired + (1 - MOVES.tired) * personOf(state, p).energy);
  p.move = { kind, t: 0, dx, dz, cx: p.vx, cz: p.vz, push };
  if (kind === 'stepBack') p.facing = Math.atan2(hz, hx);
  spend(state, p, MOVES.cost);

  // His defender is late unless he was already going that way. Seldom, against a far better handler, a defender going
  // the wrong way stumbles: only then is a random number drawn.
  if (near) {
    const along = near.vx * dx + near.vz * dz;
    if (along < MOVES.leaning) {
      near.lateT = Math.max(near.lateT, lateBy(state, p, near));
      const edge = rated(state, p, 'handle') - rated(state, near, 'defence');
      if (kind !== 'stepBack' && edge >= MOVES.ankle.edge && along <= -MOVES.ankle.wrong && rand(state) < MOVES.ankle.chance) {
        near.stumbleT = near.lateT = MOVES.ankle.time;
        state.last.stumble = { by: p.id, on: near.id, at: state.time };
      }
    }
  }
  return true;
}

function endMove(state, p) {
  if (p.move.kind === 'stepBack') { p.vx = 0; p.vz = 0; }
  p.move = null;
  p.moveWait = MOVES.gap;
  p.moved = state.time;
}

// One step of the move `p` is in, before he is moved: it sets his velocity, or ends the move at once if he has lost the
// ball, play has stopped or he has gone up for a shot.
export function stepMove(state, p, dt) {
  const move = p.move, spec = MOVES[move.kind];
  if (state.ball.holder !== p.id || state.phase !== 'live' || p.shooting) { endMove(state, p); return; }
  move.t += dt;
  const keep = spec.keep ?? 0;
  p.vx = (move.dx * move.push) / spec.time + move.cx * keep;
  p.vz = (move.dz * move.push) / spec.time + move.cz * keep;
}

// After he has been moved: the move ends when its time is up.
export function finishMove(state, p) {
  if (p.move && p.move.t >= MOVES[p.move.kind].time - DT / 2) endMove(state, p);
}
