import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboard } from '../src/input.js';
import { emptyIntent } from '../src/sim/state.js';

const key = (type, code) => Object.assign(new Event(type, { cancelable: true }), { code });
function keyboard() {
  const target = new EventTarget();
  const k = createKeyboard(target);
  return { k, down: code => target.dispatchEvent(key('keydown', code)), up: code => target.dispatchEvent(key('keyup', code)), target };
}

test('WASD maps to movement', () => {
  const { k, down } = keyboard();
  down('KeyD'); assert.equal(k.intent().moveX, 1);
  down('KeyA'); assert.equal(k.intent().moveX, 0);
  down('KeyW'); assert.equal(k.intent().moveZ, -1);
  down('KeyS'); assert.equal(k.intent().moveZ, 0);
});

test('S alone moves toward the camera', () => {
  const { k, down } = keyboard();
  down('KeyS');
  assert.equal(k.intent().moveZ, 1);
});

test('E sets both pass and switch', () => {
  const { k, down } = keyboard();
  down('KeyE');
  assert.equal(k.intent().pass, true);
  assert.equal(k.intent().switch, true);
});

test('Space shoots and Q steals', () => {
  const { k, down } = keyboard();
  down('Space'); down('KeyQ');
  assert.equal(k.intent().shoot, true);
  assert.equal(k.intent().steal, true);
});

test('either Shift key sprints; releasing one while the other is held keeps sprinting', () => {
  const { k, down, up } = keyboard();
  down('ShiftLeft'); down('ShiftRight');
  up('ShiftLeft');
  assert.equal(k.intent().sprint, true);
  up('ShiftRight');
  assert.equal(k.intent().sprint, false);
});

test('keyup clears the key', () => {
  const { k, down, up } = keyboard();
  down('KeyD'); k.intent(); up('KeyD');
  assert.deepEqual(k.intent(), emptyIntent());
});

test('a key tapped and released between two reads is still seen, once', () => {
  const { k, down, up } = keyboard();
  down('Space'); up('Space');                           // a slow frame: the whole tap happened before the game looked
  assert.equal(k.intent().shoot, true);
  assert.equal(k.intent().shoot, false);
});

test('blur releases every held key', () => {
  const { k, down, target } = keyboard();
  down('KeyD'); down('Space'); down('ShiftLeft');
  target.dispatchEvent(new Event('blur'));
  assert.deepEqual(k.intent(), emptyIntent());
});

test('game keys are default-prevented, other keys are left alone', () => {
  const target = new EventTarget();
  createKeyboard(target);
  const space = key('keydown', 'Space'), f5 = key('keydown', 'F5');
  target.dispatchEvent(space); target.dispatchEvent(f5);
  assert.equal(space.defaultPrevented, true);
  assert.equal(f5.defaultPrevented, false);
});

test('F is the hold key', () => {
  const { k, down, up } = keyboard();
  down('KeyF'); assert.equal(k.intent().hold, true);
  up('KeyF'); assert.equal(k.intent().hold, false);
});
