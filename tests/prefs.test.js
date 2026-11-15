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
  const prefs = readPrefs(box('{"difficulty":"legend","camera":"broadcast","minutes":8,"size":5,"quality":"low"}'));
  assert.deepEqual(prefs, { ...plainDefaults, difficulty: 'legend', camera: 'broadcast', minutes: 8, size: 5, quality: 'low' });
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
  prefs.keys.cross = 'KeyH'; prefs.size = 5;
  assert.deepEqual(readPrefs(null), plainDefaults);
});

test('node has no browser storage', () => {
  assert.equal(storageOf(), null);
});
