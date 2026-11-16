// Replays: the match as it was, kept for a few seconds, so that a big moment can be shown again at the next stop in
// play. It reads the match and copies it; it never changes it.

// keep: seconds of the match kept. before, after: seconds shown before and after the moment. speed: how fast a replay
// runs. apart: seconds of match time between replays (a buzzer-beater or a game-winner is shown whatever).
// keep is long enough for a game-winner, which is only known as one when the match ends, up to 10 s after the shot.
export const REPLAY = Object.freeze({ keep: 16, before: 4, after: 1, speed: 0.5, apart: 20 });
const ALWAYS = ['buzzer', 'winner'];

// frames: copies of the match, one a step, oldest first. waiting: the moment whose `after` has not yet passed.
// held: a moment set aside with its frames, until play stops. shown: the match time the last replay began.
// playing: the replay on now, { frames, at, kind, team }, or null.
export const createRecorder = () => ({ frames: [], waiting: null, held: null, shown: -Infinity, playing: null });

// A copy of `v`, plain data as the match state is (objects, arrays, Maps, numbers, strings, booleans, null and
// undefined, nothing in it reached twice): what structuredClone gives, a few times faster.
function copy(v) {
  if (typeof v !== 'object' || v === null) return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = copy(v[i]);
    return out;
  }
  if (v instanceof Map) {
    const out = new Map();
    for (const [key, value] of v) out.set(copy(key), copy(value));
    return out;
  }
  const out = {};
  for (const key of Object.keys(v)) out[key] = copy(v[key]);
  return out;
}

// A copy of the whole match as it is now. Two parts are set once, at the start of a match, and never changed in place,
// so a frame shares them instead of copying them: the style's table (a Map made by setStyle, its values frozen) and
// the teams' data (frozen: see teams.js).
export function snapshot(state) {
  const out = {};
  for (const key of Object.keys(state)) out[key] = key === 'styleTable' ? state.styleTable : key === 'teams' ? [...state.teams] : copy(state[key]);
  return out;
}

// Keeps a copy of the match as it is after a step (about 30 KB, 60 times a second). Frames older than REPLAY.keep are
// let go.
export function record(rec, state) {
  const { frames } = rec;
  if (frames.length && state.time < frames[frames.length - 1].time) Object.assign(rec, createRecorder());   // another match
  rec.frames.push(snapshot(state));
  while (rec.frames.length && rec.frames[0].time < state.time - REPLAY.keep) rec.frames.shift();
}

// Play has stopped: a whistle or a basket, the end of a period, the end of the match.
export const stopped = state => state.phase === 'dead' || state.phase === 'quarterEnd' || state.phase === 'final';

// A star moment (see moments.js) happened at match time `at`. It waits for its `after`, unless a bigger one already does.
export function mark(rec, moment, at = moment.at) {
  const bigger = other => other && other.rank < moment.rank;
  if (bigger(rec.waiting) || bigger(rec.held)) return;
  rec.waiting = { kind: moment.kind, rank: moment.rank, team: moment.team, at };
}

// To be called after every recorded step: once a waiting moment's `after` has passed, or the match is over, its
// frames are set aside until play stops.
export function settle(rec, state) {
  const w = rec.waiting;
  if (!w || (state.time < w.at + REPLAY.after && state.phase !== 'final')) return;
  const frames = rec.frames.filter(frame => frame.time >= w.at - REPLAY.before && frame.time <= w.at + REPLAY.after);
  rec.waiting = null;
  if (frames.length > 1) rec.held = { ...w, frames };
}

// Is there a replay to show now? One is set aside, play has stopped, and the last was long enough ago (a
// buzzer-beater and a game-winner are always shown).
export const due = (rec, state) => !rec.playing && !!rec.held && stopped(state)
  && (state.time - rec.shown >= REPLAY.apart || ALWAYS.includes(rec.held.kind));

// Begins the replay that is set aside.
export function start(rec, state) {
  rec.playing = { frames: rec.held.frames, at: 0, kind: rec.held.kind, team: rec.held.team };
  rec.shown = state.time;
  rec.held = null;
}

// The frame to draw after `dt` more seconds of real time, or null when the replay is over.
export function frameAt(rec, dt) {
  const p = rec.playing;
  if (!p) return null;
  const from = p.frames[0].time, last = p.frames[p.frames.length - 1].time;
  p.at += dt * REPLAY.speed;
  if (from + p.at > last) { rec.playing = null; return null; }
  // The latest frame at or before that moment of the match.
  let i = p.index ?? 0;
  while (i + 1 < p.frames.length && p.frames[i + 1].time <= from + p.at + 1e-9) i++;
  p.index = i;
  return p.frames[i];
}

// Ends the replay at once (any key, a pause, leaving the match).
export const skip = rec => { rec.playing = null; };

// Forgets everything (replays turned off, a new match).
export const clear = rec => { Object.assign(rec, createRecorder()); };
