import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboard } from '../src/input.js';
import { emptyIntent } from '../src/sim/state.js';
import { bind, createKeys } from '../src/keys.js';

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

test('drop() forgets the keys held at that moment, even their repeats, until each is let go', () => {
  const { k, down, up } = keyboard();
  down('Space'); down('KeyS');
  k.drop();
  let i = k.intent();
  assert.deepEqual([i.shoot, i.moveZ], [false, 0]);
  down('Space');                                        // an auto-repeat while it is still held
  i = k.intent();
  assert.deepEqual([i.shoot, i.moveZ], [false, 0]);
  up('Space'); down('Space');                           // let go and pressed again: seen as normal
  i = k.intent();
  assert.deepEqual([i.shoot, i.moveZ], [true, 0]);
  up('KeyS'); down('KeyS');
  assert.equal(k.intent().moveZ, 1);
});

test('a key pressed after drop() that was not held then shows at once', () => {
  const { k, down } = keyboard();
  down('Space'); k.drop();
  down('KeyD');
  const i = k.intent();
  assert.deepEqual([i.moveX, i.shoot], [1, false]);
});

test('blur also ends a drop, since a key let go while the window is unfocused sends no keyup', () => {
  const { k, down, target } = keyboard();
  down('Space'); k.drop();
  target.dispatchEvent(new Event('blur'));
  down('Space');
  assert.equal(k.intent().shoot, true);
});

// ---------- keys that follow the camera ----------

test('the movement keys follow the camera: W runs up the screen whichever way the camera looks', async () => {
  const { steer } = await import('../src/input.js');
  const keys = (x, z) => ({ ...emptyIntent(), moveX: x, moveZ: z, sprint: true });
  const near = (got, x, z) => assert.ok(Math.abs(got.moveX - x) < 1e-9 && Math.abs(got.moveZ - z) < 1e-9, `${got.moveX}, ${got.moveZ} is not ${x}, ${z}`);
  // The sideline camera looks toward -z: the keys mean what they always have.
  near(steer(keys(1, 0), { x: 0, z: -1 }), 1, 0);
  near(steer(keys(0, -1), { x: 0, z: -1 }), 0, -1);
  // Behind the offence looking toward +x: W runs toward +x, D toward +z.
  near(steer(keys(0, -1), { x: 1, z: 0 }), 1, 0);
  near(steer(keys(1, 0), { x: 1, z: 0 }), 0, 1);
  // Looking toward -x: W runs toward -x, D toward -z.
  near(steer(keys(0, -1), { x: -1, z: 0 }), -1, 0);
  near(steer(keys(1, 0), { x: -1, z: 0 }), 0, -1);
  assert.equal(steer(keys(1, 0), { x: 1, z: 0 }).sprint, true);   // the other keys pass through
});

// ---------- keys that can be changed ----------

function bound(change) {
  const target = new EventTarget(), keys = createKeys();
  change?.(keys);
  const k = createKeyboard(target, keys), events = [];
  const send = (type, code) => { const e = key(type, code); target.dispatchEvent(e); events.push(e); return e; };
  return { k, keys, down: code => send('keydown', code), up: code => send('keyup', code) };
}

test('the five moves have keys of their own', () => {
  const { k, down } = bound();
  down('KeyJ'); down('KeyU');
  const intent = k.intent();
  assert.equal(intent.cross, true);
  assert.equal(intent.fade, true);
  assert.equal(intent.legs, false);
  assert.equal(intent.back, false);
  assert.equal(intent.stepBack, false);
});

test('an intent has every field an empty one has', () => {
  const { k } = bound();
  assert.deepEqual(Object.keys(k.intent()).sort(), Object.keys(emptyIntent()).sort());
});

test('a changed key acts and the old one no longer does', () => {
  const { k, down, up } = bound(keys => bind(keys, 'shoot', 'KeyP'));
  down('KeyP');
  assert.equal(k.intent().shoot, true);
  up('KeyP'); down('Space');
  assert.equal(k.intent().shoot, false);
});

test('a key changed after the keyboard was made counts at once', () => {
  const { k, keys, down } = bound();
  bind(keys, 'cross', 'KeyR');
  down('KeyR');
  assert.equal(k.intent().cross, true);
});

test('only keys that do something are kept from the browser', () => {
  const { down } = bound();
  assert.equal(down('KeyJ').defaultPrevented, true);
  assert.equal(down('KeyP').defaultPrevented, false);
  assert.equal(down('KeyT').defaultPrevented, false);   // the page's own key, not the keyboard's
});

test('dropping by keyboard code drops a Shift key as the one key it is', () => {
  const { k, down, up } = bound();
  down('ShiftRight');
  k.drop(['ShiftRight']);
  assert.equal(k.intent().sprint, false);
  up('ShiftRight'); down('ShiftLeft');
  assert.equal(k.intent().sprint, true);
});
