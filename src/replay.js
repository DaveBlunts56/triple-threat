// Replays: the match as it was, kept for a few seconds, so that a big moment can be shown again at the next stop in
// play. It reads the match and copies it; it never changes it.

// keep: seconds of the match kept. before, after: seconds shown before and after the moment. speed: how fast a replay
// runs. apart: seconds of match time between replays (a buzzer-beater or a game-winner is shown whatever).
// keep is long enough for a game-winner, which is only known as one when the match ends, up to 10 s after the shot.
export const REPLAY = Object.freeze({ keep: 16, before: 4, after: 1, speed: 0.5, apart: 20 });
const ALWAYS = ['buzzer', 'winner'];

// frames: the match after each step, oldest first, each { time, shape, values, count, refs } (see store). waiting: the
// moment whose `after` has not yet passed. held: a moment set aside with its frames, until play stops. shown: the
// match time the last replay began. playing: the replay on now, { frames, at, kind, team }, or null. free: frames let
// go, to be written over by the next steps.
export const createRecorder = () => ({ frames: [], waiting: null, held: null, shown: -Infinity, playing: null, free: [] });

// A frame is the match's numbers in a Float64Array, its strings and shared parts in `refs`, and its `shape`: which keys,
// arrays and kinds of value hold them. A copy of the match as objects, made sixty times a second and kept sixteen
// seconds, kept the garbage collector busy enough to stall a slow machine for a tenth of a second; numbers in a typed
// array it never has to look through. The shape is the last frame's wherever the match's is the same (which is most
// of it, most steps), so a step makes almost nothing new.
const NUM = { kind: 'num' }, BOOL = { kind: 'bool' }, REF = { kind: 'ref' }, NULL = { kind: 'null' }, UNDEF = { kind: 'undef' };
let frame = null;   // the frame being written (see store)

function put(n) {
  if (frame.count === frame.values.length) {
    const more = new Float64Array(frame.values.length * 2);
    more.set(frame.values);
    frame.values = more;
  }
  frame.values[frame.count++] = n;
}

// Writes `v` into the frame and returns its shape: `was`, the shape of what stood there in the last frame, if `v`'s is
// the same. Strings, and any value that is not plain data, are kept as they are in `refs` (a string never changes).
function write(v, was) {
  switch (typeof v) {
    case 'number': put(v); return NUM;
    case 'boolean': put(v ? 1 : 0); return BOOL;
    case 'undefined': return UNDEF;
    case 'string': frame.refs.push(v); return REF;
  }
  if (v === null) return NULL;
  if (Array.isArray(v)) return writeArray(v, was);
  if (Object.getPrototypeOf(v) === Object.prototype) return writeObject(v, was);
  frame.refs.push(structuredClone(v));   // none in the match (its one Map, the style's table, is shared: see store)
  return REF;
}

function writeArray(v, was) {
  const old = was !== undefined && was.kind === 'array' ? was.kids : null, same = old !== null && old.length === v.length;
  let kids = null;   // made at the first item whose shape is not the last frame's, or at once for another length
  for (let i = 0; i < v.length; i++) {
    const kid = write(v[i], old?.[i]);
    if (kids !== null) kids.push(kid);
    else if (!same || kid !== old[i]) { kids = old === null ? [] : old.slice(0, i); kids.push(kid); }
  }
  if (kids === null) return same ? was : { kind: 'array', kids: [] };
  return { kind: 'array', kids };
}

function writeObject(v, was) {
  const old = was !== undefined && was.kind === 'object' ? was : null;
  let i = 0, keys = null, kids = null;   // made at the first key or shape that is not the last frame's; the rest keep theirs
  for (const key in v) {
    const before = old !== null && i < old.keys.length && old.keys[i] === key ? old.kids[i] : undefined;
    const kid = write(v[key], before);
    i++;
    if (keys === null && kid === before) continue;
    if (keys === null) { keys = old === null ? [] : old.keys.slice(0, i - 1); kids = old === null ? [] : old.kids.slice(0, i - 1); }
    keys.push(key); kids.push(kid);
  }
  if (keys === null) {
    if (old !== null && i === old.keys.length) return was;
    keys = old === null ? [] : old.keys.slice(0, i); kids = old === null ? [] : old.kids.slice(0, i);   // fewer keys than before
  }
  return { kind: 'object', keys, kids };
}

// The match as it is now, written into `into` (a frame let go, or a new one) after the frame `last`. Two parts are set
// once, at the start of a match, and never changed in place, so a frame shares them instead of copying them: the
// style's table (a Map made by setStyle, its values frozen) and the teams' data (frozen: see teams.js).
const top = [];   // the shapes of the match's own keys, while they are written
function store(into, state, last) {
  frame = into;
  frame.time = state.time;
  frame.count = 0;
  frame.refs.length = 0;
  const kids = top, old = last?.shape ?? undefined;
  kids.length = 0;
  let same = old !== undefined, i = 0;
  for (const key in state) {
    const before = old !== undefined && old.keys[i] === key ? old.kids[i] : undefined;
    let kid;
    if (key === 'styleTable') { frame.refs.push(state.styleTable); kid = REF; }
    else if (key === 'teams') { for (const team of state.teams) frame.refs.push(team); kid = before?.count === state.teams.length ? before : { kind: 'teams', count: state.teams.length }; }
    else kid = write(state[key], before);
    if (kid !== before) same = false;
    kids.push(kid);
    i++;
  }
  frame.shape = same && i === old.keys.length ? old : { kind: 'object', keys: Object.keys(state), kids: kids.slice() };
  frame = null;
  return into;
}

const blank = (size = 4096) => ({ time: 0, shape: null, values: new Float64Array(size), count: 0, refs: [] });

// The match as `stored` has it, as objects: what structuredClone would have given when it was stored, but for the
// shared parts (see store).
export function decode(stored) {
  let n = 0, r = 0;
  const read = shape => {
    switch (shape.kind) {
      case 'num': return stored.values[n++];
      case 'bool': return stored.values[n++] === 1;
      case 'ref': return stored.refs[r++];
      case 'null': return null;
      case 'undef': return undefined;
      case 'teams': return Array.from({ length: shape.count }, () => stored.refs[r++]);
      case 'array': return shape.kids.map(read);
    }
    const out = {};
    for (let i = 0; i < shape.keys.length; i++) out[shape.keys[i]] = read(shape.kids[i]);
    return out;
  };
  return read(stored.shape);
}

// A copy of the whole match as it is now (see decode).
export const snapshot = state => decode(store(blank(), state, null));

// Keeps the match as it is after a step. Frames older than REPLAY.keep are let go and written over by the steps after,
// unless a replay holds them.
export function record(rec, state) {
  const { frames } = rec;
  if (frames.length && state.time < frames[frames.length - 1].time) Object.assign(rec, createRecorder());   // another match
  while (rec.frames.length && rec.frames[0].time < state.time - REPLAY.keep) {
    const old = rec.frames.shift();
    if (!rec.held?.frames.includes(old) && !rec.playing?.frames.includes(old)) rec.free.push(old);
  }
  const last = rec.frames[rec.frames.length - 1];
  rec.frames.push(store(rec.free.pop() ?? blank(last ? Math.ceil(last.count * 1.25) : 4096), state, last));
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
  // The latest frame at or before that moment of the match, as objects: made once for each frame shown.
  let i = p.index ?? 0;
  while (i + 1 < p.frames.length && p.frames[i + 1].time <= from + p.at + 1e-9) i++;
  if (p.index !== i || !p.drawn) p.drawn = decode(p.frames[i]);
  p.index = i;
  return p.drawn;
}

// Ends the replay at once (any key, a pause, leaving the match).
export const skip = rec => { rec.playing = null; };

// Forgets everything (replays turned off, a new match).
export const clear = rec => { Object.assign(rec, createRecorder()); };
