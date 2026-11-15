// What should be heard, worked out from the match alone: no Web Audio here, so it can be tested without a browser.
// It reads the match and never changes it, and draws nothing from the match's dice.
import { PLAYER } from '../sim/tuning.js';
import { onFloor } from '../sim/state.js';

// squeakFrom: m/s a player must have been moving to squeak when he stops or cuts. squeakLook: seconds back his speed
// is compared with. squeakStop: the share of that speed he must have lost; squeakTurn: or the cosine of the angle he
// has turned through. squeakApart: seconds between one player's squeaks; squeakAll: between anybody's.
// bounceFrom: m/s upward below which a ball on the floor makes no sound. hitApart: seconds between two rim sounds, or
// two bounces. bed: how loud the crowd's murmur is; bedClose: what a close game late on adds; bedLeft: what a crowd
// that has gone home takes off; bedMenu: on the menus.
export const CUE = Object.freeze({ squeakFrom: 3, squeakLook: 0.15, squeakStop: 0.4, squeakTurn: 0.5, squeakApart: 1, squeakAll: 0.4,
  bounceFrom: 0.6, hitApart: 0.1, dribble: 0.7, bed: 0.3, bedClose: 0.3, bedLeft: 0.2, bedMenu: 0.15, distract: 0.6 });

export const createEars = () => ({ queue: [], n: 0, time: null, was: null, touched: false, trail: [], squeaked: {}, lastSqueak: -Infinity,
  lastHit: {}, turn: 0, boo: 0 });

// One sound to play: its name, how loud (0 to 1) and how fast (so that no two hits sound quite alike).
function cue(ears, name, gain = 1) {
  ears.n++;
  ears.queue.push({ name, gain: Math.min(1, Math.max(0, gain)), rate: 1 + 0.06 * Math.sin(ears.n * 2.4) });
}
// The next of `count` takes of a sound, in turn.
const take = (ears, name, count) => `${name}${(ears.turn++ % count) + 1}`;
// Not more often than every `apart` seconds.
function spaced(ears, key, time, apart) {
  if (time - (ears.lastHit[key] ?? -Infinity) < apart) return false;
  ears.lastHit[key] = time;
  return true;
}

// One step of listening, after the step: `events` is what step() returned. What is heard waits in the queue for the
// frame (frameCues).
export function listen(ears, state, events) {
  const { ball } = state, t = state.time;
  if (ears.time !== null && t < ears.time) Object.assign(ears, createEars());   // another match
  const was = ears.was;
  ears.was = { holder: ball.holder, mode: ball.mode, call: state.call, phase: state.phase, moves: state.players.map(p => p.move?.kind ?? null), stumbles: state.players.map(p => p.stumbleT > 0) };
  ears.time = t;
  if (!events || !was) return;

  // The ball: on the floor, on the rim, on the glass, through the net.
  if (events.release) ears.touched = false;
  if (events.hitFloor && ball.vy > CUE.bounceFrom && spaced(ears, 'bounce', t, CUE.hitApart)) cue(ears, take(ears, 'bounce', 3), Math.max(0.25, Math.min(1, ball.vy / 5)));
  if (events.hitRim) { ears.touched = true; if (spaced(ears, 'rim', t, CUE.hitApart)) cue(ears, take(ears, 'rim', 2), 0.8); }
  if (events.hitBoard) { ears.touched = true; if (spaced(ears, 'board', t, CUE.hitApart)) cue(ears, 'board', 0.8); }
  if (events.scored) {
    // A dunk goes through with the rim rattling.
    const dunk = state.last.score?.finish === 'dunk' && Math.abs(state.last.score.at - t) < 1e-6;
    if (dunk) cue(ears, take(ears, 'rim', 2), 1);
    cue(ears, dunk || ears.touched ? 'net' : 'swish', 0.9); ears.touched = false;
  }
  // A dribble: the ball meets the floor twice in each of its beats, as the rules bounce it.
  const holder = state.players[ball.holder];
  const dribbling = holder && state.phase === 'live' && onFloor(holder) && !holder.shooting && !holder.inbounder && !holder.held && Math.hypot(holder.vx, holder.vz) > 0.5;
  if (dribbling && Math.floor(t * PLAYER.dribbleRate) !== Math.floor((t - 1 / 60) * PLAYER.dribbleRate)) cue(ears, take(ears, 'bounce', 3), CUE.dribble);
  // A pass caught.
  if (ball.holder !== null && was.holder === null && was.mode === 'pass') cue(ears, 'catch', 0.8);

  // Shoes: a hard stop or a sharp cut at speed, the start of a move, a stumble.
  const look = Math.round(CUE.squeakLook * 60);
  ears.trail.push(state.players.map(p => ({ vx: p.vx, vz: p.vz })));
  if (ears.trail.length > look + 1) ears.trail.shift();
  const then = ears.trail.length > look ? ears.trail[0] : null;
  state.players.forEach((p, i) => {
    const moved = p.move && was.moves[i] !== p.move.kind, fell = p.stumbleT > 0 && !was.stumbles[i];
    let cut = false;
    if (then?.[i] && onFloor(p) && state.phase === 'live') {
      const before = Math.hypot(then[i].vx, then[i].vz), now = Math.hypot(p.vx, p.vz);
      cut = before > CUE.squeakFrom && (now < CUE.squeakStop * before || (then[i].vx * p.vx + then[i].vz * p.vz) / (before * (now || 1)) < CUE.squeakTurn);
    }
    if (!(moved || fell || cut)) return;
    if (t - (ears.squeaked[i] ?? -Infinity) < CUE.squeakApart || t - ears.lastSqueak < CUE.squeakAll) return;
    ears.squeaked[i] = t; ears.lastSqueak = t;
    cue(ears, take(ears, 'squeak', 3), moved || fell ? 0.6 : 0.45);
  });

  // The whistle, the shot-clock buzzer, and the horn at the end of a period.
  if (state.call && state.call !== was.call) cue(ears, state.call.kind === 'shotClock' ? 'buzzer' : 'whistle', 0.8);
  const ended = (state.phase === 'quarterEnd' || state.phase === 'final') && was.phase !== 'quarterEnd' && was.phase !== 'final';
  if (ended) { cue(ears, 'horn', 0.9); cue(ears, 'whistleLong', 0.5); }
}

// Once a frame: the sounds to play now, and how loud the crowd's two loops are. `heard` is what the broadcast's
// watcher heard this frame; `life` is the crowd's mood (see render/life.js).
// Returns { shots: [{ name, gain, rate }], bed: 0 to 1, distract: 0 to 1 }.
export function frameCues(ears, state, heard, life) {
  for (const h of heard) {
    if (h.moment || (h.kind === 'made' && h.finish === 'dunk')) cue(ears, h.team === 0 ? 'cheerBig' : 'groan', h.team === 0 ? 1 : 0.9);       // the home crowd, for and against: a big moment, or a dunk
    else if (h.kind === 'made') cue(ears, h.team === 0 ? 'cheer' : 'groan', h.team === 0 ? (h.points === 3 ? 0.8 : 0.6) : 0.5);
  }
  if (life.boo > ears.boo + 0.5) cue(ears, 'boo', 0.8);   // a call against the home team
  ears.boo = life.boo;
  const shots = ears.queue;
  ears.queue = [];
  if (state.phase === 'start' || state.phase === 'final') return { shots, bed: CUE.bedMenu, distract: 0 };
  // The murmur: louder the closer the game and the later it is, thinner once fans have gone home, up while they cheer.
  const closeness = 1 - Math.min(1, Math.abs(state.score[0] - state.score[1]) / 12);
  const played = Math.min(1, ((state.quarter - 1) * state.quarterLength + (state.quarterLength - state.gameClock)) / (4 * state.quarterLength));
  const bed = CUE.bed + CUE.bedClose * closeness * played - CUE.bedLeft * Math.min(1, life.left / 0.45) + (life.cheer[0] > 0 ? 0.15 : 0);
  return { shots, bed: Math.min(1, Math.max(0.05, bed)), distract: life.distract ? CUE.distract : 0 };
}
