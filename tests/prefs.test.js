import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, PREFS_KEY, readPrefs, storageOf, writePrefs } from '../src/prefs.js';

const box = text => ({ getItem: () => text, setItem(key, value) { this.saved = [key, value]; } });
const plainDefaults = { ...DEFAULT_PREFS, keys: {} };

test('with no storage, or nothing saved, the settings are the defaults', () => {
  assert.deepEqual(readPrefs(null), plainDefaults);
  assert.deepEqual(readPrefs(box(null)), plainDefaults);
});

test('saved settings come back, and what was not saved is the default', () => {
  const prefs = readPrefs(box('{"difficulty":"legend","camera":"broadcast","size":5,"select":{"away":0,"home":1,"side":"none"},"quality":"low","watch":{"style":"arcade","minutes":5}}'));
  assert.deepEqual(prefs, { ...plainDefaults, difficulty: 'legend', camera: 'broadcast', size: 5, select: { away: 0, home: 1, side: 'none' }, quality: 'low', watch: { style: 'arcade', minutes: 5 } });
  for (const bad of ['{"away":0,"home":0,"side":"home"}', '{"away":0,"home":99,"side":"home"}', '{"away":0,"home":1,"side":"left"}'])
    assert.deepEqual(readPrefs(box(`{"select":${bad}}`)).select, { away: 3, home: 2, side: 'home' }, `${bad}: a team twice, a team there is not, or no such side`);
  assert.deepEqual(DEFAULT_PREFS.select, { away: 3, home: 2, side: 'home' });   // Boston at New York, you playing New York
});

test('Play, Watch and Simulate start where the spec says: Play on Arcade\'s 3 minutes, Watch on Simulation\'s 12, Simulate on 12', () => {
  assert.deepEqual([DEFAULT_PREFS.play, DEFAULT_PREFS.watch, DEFAULT_PREFS.simulate], [{ style: 'arcade', minutes: 3 }, { style: 'sim', minutes: 12 }, { minutes: 12 }]);
});

test('an old saved quarter length becomes Play\'s, unless Play\'s own was saved', () => {
  assert.equal(readPrefs(box('{"minutes":8}')).play.minutes, 8);
  assert.equal(readPrefs(box('{"minutes":8,"play":{"minutes":12}}')).play.minutes, 12);
  assert.equal('minutes' in readPrefs(box('{"minutes":8}')), false);
});

test('a bad saved value in a group, or a slider, is dropped on its own', () => {
  const prefs = readPrefs(box(JSON.stringify({ play: { style: 'sideways', minutes: 5 }, simulate: { minutes: 7 },
    sliders: { sim: { pace: 70, shooting: 101, fouls: 12.5, fatigue: -5 }, arcade: { pace: 'fast', rebounding: 0 } } })));
  assert.deepEqual([prefs.play, prefs.simulate], [{ style: 'arcade', minutes: 5 }, { minutes: 12 }]);
  assert.deepEqual(prefs.sliders.sim, { ...DEFAULT_PREFS.sliders.sim, pace: 70 });
  assert.deepEqual(prefs.sliders.arcade, { ...DEFAULT_PREFS.sliders.arcade, rebounding: 0 });
});

test('each style\'s sliders are saved apart', () => {
  const b = box(null), prefs = readPrefs(null);
  prefs.sliders.sim.pace = 80;
  writePrefs(b, prefs);
  const back = readPrefs(box(b.saved[1]));
  assert.deepEqual([back.sliders.sim.pace, back.sliders.arcade.pace], [80, 50]);
});

test('something saved that is not a set of settings is ignored', () => {
  for (const text of ['not json', '[1]', '7', '"x"', 'null', '']) assert.deepEqual(readPrefs(box(text)), plainDefaults, text);
});

test('one bad value is dropped and the others still apply', () => {
  const prefs = readPrefs(box('{"difficulty":"godlike","camera":"broadcast","minutes":"8","autoSubs":"no","sound":"quiet","replays":0,"keys":[1],"size":4}'));
  assert.deepEqual(prefs, { ...plainDefaults, camera: 'broadcast', sound: 'quiet' });
});

test('a storage that throws on reading gives the defaults', () => {
  assert.deepEqual(readPrefs({ getItem() { throw new Error('denied'); } }), plainDefaults);
});

test('a storage that throws on writing, or none at all, is reported and nothing is thrown', () => {
  assert.equal(writePrefs({ setItem() { throw new Error('full'); } }, plainDefaults), false);
  assert.equal(writePrefs(null, plainDefaults), false);
});

test('what is written is read back the same', () => {
  const b = box(null), prefs = { ...plainDefaults, difficulty: 'rookie', quality: 'ultra', autoSubs: false, replays: false, commentary: 'off', keys: { cross: 'KeyH' } };
  assert.equal(writePrefs(b, prefs), true);
  assert.equal(b.saved[0], PREFS_KEY);
  assert.deepEqual(readPrefs(box(b.saved[1])), prefs);
});

test('reading never hands out the defaults themselves', () => {
  const prefs = readPrefs(null);
  prefs.keys.cross = 'KeyH'; prefs.size = 5; prefs.play.minutes = 8; prefs.sliders.sim.pace = 10;
  assert.deepEqual(readPrefs(null), plainDefaults);
});

test('node has no browser storage', () => {
  assert.equal(storageOf(), null);
});

test('whether the frame rate and the keys\' line are shown is kept: shown unless it was saved hidden', () => {
  assert.equal(DEFAULT_PREFS.info, true);
  assert.equal(readPrefs(box('{"info":false}')).info, false);
  assert.equal(readPrefs(box('{"info":"no"}')).info, true);
});
