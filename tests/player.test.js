import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, createPlayer, nextSound } from '../src/audio/player.js';

// Just enough of Web Audio: nodes that remember what was set and what they were joined to.
function FakeContext() {
  const made = [];
  const node = kind => { const n = { kind, to: null, connect(other) { this.to = other; }, started: 0, start() { this.started++; }, gain: { value: 1 }, playbackRate: { value: 1 } }; made.push(n); return n; };
  return Object.assign(this, { made, destination: { kind: 'out' }, currentTime: 0, state: 'running', resumed: 0, resume() { this.resumed++; return Promise.resolve(); },
    createGain: () => node('gain'), createBufferSource: () => node('source'), decodeAudioData: data => Promise.resolve({ decoded: data.byteLength }) });
}
const fetcher = url => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(url.length)) });
const urlOf = name => `sounds/${name}.ogg`;
async function loaded(names = ['net', 'murmur']) {
  let ctx = null;
  const player = createPlayer(function Context() { ctx = new FakeContext(); return ctx; });
  assert.equal(await player.load(urlOf, names, fetcher), true);
  return { player, ctx: () => ctx };
}

test('the Sound setting goes round full, quiet, off', () => {
  assert.deepEqual(['full', 'quiet', 'off'].map(nextSound), ['quiet', 'off', 'full']);
  assert.deepEqual(LEVELS, { full: 1, quiet: 0.4, off: 0 });
});

test('nothing plays before the first key press, and after it a sound is played at its gain and speed', async () => {
  const { player, ctx } = await loaded();
  assert.equal(player.ready, false);
  player.play('net'); player.loop('murmur', 0.5);                      // before waking: no audio is even made
  assert.equal(ctx(), null);
  assert.equal(await player.wake(), true);
  assert.deepEqual([player.ready, ctx().resumed], [true, 1]);
  const before = ctx().made.length;
  player.play('net', 0.7, 1.05);
  const [source, own] = ctx().made.slice(before);
  assert.deepEqual([source.kind, source.started, source.playbackRate.value, own.gain.value, source.to, own.to.kind], ['source', 1, 1.05, 0.7, own, 'gain']);
  player.play('nothing');                                              // a name it does not have
  assert.equal(ctx().made.length, before + 2);
});

test('a loop is started once and after that only its loudness changes', async () => {
  const { player, ctx } = await loaded();
  await player.wake();
  const before = ctx().made.length;
  player.loop('murmur', 0.3); player.loop('murmur', 0.6); player.loop('murmur', 0);
  const made = ctx().made.slice(before);
  assert.deepEqual([made.length, made[0].loop, made[0].started, made[1].gain.value], [2, true, 1, 0]);
});

test('off and a pause are silence; quiet is two fifths', async () => {
  const { player, ctx } = await loaded();
  await player.wake();
  const master = ctx().made[0];
  assert.equal(master.gain.value, 1);
  player.level('quiet'); assert.equal(master.gain.value, 0.4);
  player.hush(true); assert.equal(master.gain.value, 0);
  player.hush(false); assert.equal(master.gain.value, 0.4);
  player.level('off'); assert.equal(master.gain.value, 0);
  const before = ctx().made.length;
  player.play('net');
  assert.equal(ctx().made.length, before);                             // nothing is even started
  player.level('full'); assert.equal(master.gain.value, 1);
});

test('a level chosen before the first key press is the level it wakes at', async () => {
  const { player, ctx } = await loaded();
  player.level('quiet');
  await player.wake();
  assert.equal(ctx().made[0].gain.value, 0.4);
});

test('where the browser has no audio, or a sound cannot be fetched or decoded, nothing throws and nothing plays', async () => {
  const none = createPlayer(undefined);
  assert.equal(await none.load(urlOf, ['net'], fetcher), false);
  assert.equal(await none.wake(), false);
  none.play('net'); none.loop('murmur', 1); none.level('quiet'); none.hush(true);
  assert.equal(none.ready, false);
  const offline = createPlayer(FakeContext);
  assert.equal(await offline.load(urlOf, ['net'], () => Promise.reject(new Error('offline'))), false);
  assert.equal(await offline.wake(), false);
  offline.play('net');
  const broken = createPlayer(function Context() { const c = new FakeContext(); c.decodeAudioData = () => Promise.reject(new Error('bad file')); return c; });
  await broken.load(urlOf, ['net'], fetcher);
  assert.equal(await broken.wake(), false);
  broken.play('net'); broken.loop('net', 1);
});

test('waking twice decodes once', async () => {
  let contexts = 0;
  const player = createPlayer(function Context() { contexts++; return new FakeContext(); });
  await player.load(urlOf, ['net'], fetcher);
  await Promise.all([player.wake(), player.wake()]);
  await player.wake();
  assert.equal(contexts, 1);
});
