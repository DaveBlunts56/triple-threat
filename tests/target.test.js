import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyIntent } from '../src/sim/state.js';
import { passBall } from '../src/sim/players.js';
import { DT } from '../src/sim/tuning.js';
import { live, idle, run, at } from './helpers.js';

test('a pass remembers who it is for until it is caught', () => {
  const s = live();                                      // player 0 at (5, -3) with the ball; team-mates at (5, 0) and (5, 3)
  assert.equal(s.ball.target, null);
  passBall(s, s.players[0], { ...emptyIntent(), moveZ: 1 });
  assert.deepEqual([s.ball.mode, s.ball.target], ['pass', 1]);
  assert.ok(run(s, 1, idle(), st => st.ball.holder !== null));
  assert.deepEqual([s.ball.holder, s.ball.target], [1, null]);
});

test('a pass nobody catches forgets its receiver when it goes loose, and so does one cut short by a whistle', () => {
  const s = live();
  passBall(s, s.players[0], { ...emptyIntent(), moveZ: 1 });
  s.players.forEach(p => { if (p.id !== 0) at(s, p.id, -12, p.z); });       // everyone else leaves
  assert.ok(run(s, 3, idle(), st => st.ball.mode === 'loose'));
  assert.equal(s.ball.target, null);
  const t = live(); t.shotClock = 2 * DT;
  passBall(t, t.players[0], { ...emptyIntent(), moveZ: 1 });
  run(t, 0.1);
  assert.deepEqual([t.phase, t.ball.target], ['dead', null]);
});
