import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboard } from '../src/input.js';
import { pauseKey, setPaused } from '../src/pause.js';
import { live } from './helpers.js';

const key = (type, code) => Object.assign(new Event(type, { cancelable: true }), { code });
function paused() {
  const target = new EventTarget();
  const keyboard = createKeyboard(target);
  const game = { state: live(), paused: false, pick: null };
  setPaused(game, keyboard, true);
  return { game, keyboard, tap: code => { target.dispatchEvent(key('keydown', code)); target.dispatchEvent(key('keyup', code)); } };
}

test('on the pause screen two row keys queue a swap, the same row twice does nothing, and A flips automatic substitutions', () => {
  const { game } = paused();
  pauseKey(game, 'Digit2');
  assert.equal(game.pick, 1);
  pauseKey(game, 'Digit4');
  assert.deepEqual([game.pick, game.state.subQueue], [null, [{ team: 0, out: 1, in: 3 }]]);
  pauseKey(game, 'Digit5'); pauseKey(game, 'Digit5');
  assert.deepEqual([game.pick, game.state.subQueue.length], [null, 1]);
  pauseKey(game, 'KeyA');
  assert.deepEqual(game.state.autoSubs, [false, true]);
});

test('the game cannot be paused before it starts or after it ends, and resuming forgets the selected row', () => {
  const { game, keyboard } = paused();
  pauseKey(game, 'Digit1');
  setPaused(game, keyboard, false);
  assert.deepEqual([game.paused, game.pick], [false, null]);
  game.state.phase = 'final';
  setPaused(game, keyboard, true);
  assert.equal(game.paused, false);
});

test('a key tapped on the pause screen does not act when play resumes', () => {
  const { game, keyboard, tap } = paused();
  tap('Space'); tap('KeyA'); tap('KeyE');
  setPaused(game, keyboard, false);
  const intent = keyboard.intent();
  assert.deepEqual([intent.shoot, intent.moveX, intent.pass], [false, 0, false]);
});
