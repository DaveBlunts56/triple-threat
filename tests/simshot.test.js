// Simulation's shooting against Arcade's (plan Task 4.2): shots by zone, a green release that helps, free throws by
// touch, and form on the night.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseShot, makeChance, shotWindow, SHOT_BEST } from '../src/sim/players.js';
import { setStyle, styled } from '../src/sim/styles.js';
import { startMatch } from '../src/sim/rules.js';
import { createMatch } from '../src/sim/state.js';
import { freeThrowChance, formOf, touchOf, distanceChance } from '../src/sim/shooting.js';
import { DT, FT, RIM } from '../src/sim/tuning.js';
import { live, at, run, idle } from './helpers.js';
import { newFreeThrow, setupFreeThrow, stepFreeThrow } from '../src/sim/freethrow.js';

// Player 0 `far` metres out in front of the hoop, his nearest defender `gap` off him, in the air at the best moment.
function shot(style, far, gap, seed) {
  const s = live(seed);
  setStyle(s, style);
  s.players.forEach((p, i) => { if (i) at(s, i, -11, (i - 3) * 2); });
  at(s, 0, RIM.x - far, 0); at(s, 3, RIM.x - far - gap, 0);
  Object.assign(s.players[0], { shooting: true, shotT: SHOT_BEST, y: 0.2, vy: 0.5 });
  return s;
}

test('in Simulation there is no meter: no release is green and its timing does not change the chance; in Arcade a green one always goes in', () => {
  // Arcade: a green release always goes in.
  let made = 0, green = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const s = shot('arcade', 6.5, 0.9, seed);
    releaseShot(s, s.players[0]);
    if (!s.shot.green) continue;
    green++;
    if (run(s, 4, idle(), st => st.score[0] > 0)) made++;
  }
  assert.ok(green > 100, `arcade: ${green} green releases`);
  assert.equal(made, green);
  // Simulation: released early, at the best moment or late, the chance is the same, and never green.
  for (let seed = 1; seed <= 100; seed++) {
    const chances = [SHOT_BEST - 0.2, SHOT_BEST, SHOT_BEST + 0.15].map(t => {
      const s = shot('sim', 6.5, 0.9, seed);
      s.players[0].shotT = t;
      const c = makeChance(s, s.players[0]);
      releaseShot(s, s.players[0]);
      assert.equal(s.shot.green, false, `sim seed ${seed}: a green release`);
      return c;
    });
    assert.ok(chances.every(c => c === chances[0]), `sim seed ${seed}: ${chances.join(', ')}`);
  }
});

test('a Simulation shot\'s open chance is its zone\'s', () => {
  const s = createMatch(1, 5); setStyle(s, 'sim');
  const table = styled(s, 'shot.curve');
  for (const [zone, far] of [['rim', 1], ['close', 2.4], ['mid', 5], ['arc3', 7.5]]) assert.equal(distanceChance(table, far, zone), table[zone]);
  assert.ok(table.rim > table.close && table.close > table.mid && table.mid > table.corner3 && table.corner3 > table.arc3);
});

test('free throws go by touch in Simulation, for you and for the computer; in Arcade as they were', () => {
  const s = createMatch(1, 5);
  const by = name => s.rosters.flat().find(p => p.name === name);
  assert.ok(touchOf(by('Devon Hale')) > 0.85 && touchOf(by('Darius Stone')) < 0.72, `${touchOf(by('Devon Hale'))} ${touchOf(by('Darius Stone'))}`);
  assert.equal(freeThrowChance('touch', by('Devon Hale')), touchOf(by('Devon Hale')));
  assert.equal(freeThrowChance('flat', by('Devon Hale')), FT.aiChance);
  const mean = s.rosters.flat().reduce((sum, p) => sum + touchOf(p), 0) / 16;
  assert.ok(mean > 0.72 && mean < 0.84, `the sixteen average ${mean.toFixed(3)}`);
});

test('form is drawn once a match, differs between players, and is 1 in Arcade', () => {
  const sim = createMatch(5, 5); setStyle(sim, 'sim'); startMatch(sim);
  const forms = sim.rosters.flat().map(p => p.form);
  assert.ok(new Set(forms).size > 10 && forms.every(f => f >= 0.85 && f <= 1.15));
  const arcade = createMatch(5, 5); startMatch(arcade);
  assert.ok(arcade.rosters.flat().every(p => p.form === 1));
  assert.equal(formOf(() => 0.5, 0), 1);
});

test('in Simulation your free throws have no aim bar: they go up by themselves, as the computer\'s do; in Arcade they wait for you', () => {
  for (const style of ['sim', 'arcade']) {
    const s = createMatch(2, 5); setStyle(s, style); s.humans = [0]; startMatch(s);
    s.freeThrow = newFreeThrow(0, 2); setupFreeThrow(s);
    const intents = idle(10);
    for (let t = 0; s.freeThrow.stage === 'aim' && t < FT.aiDelay + 0.5; t += DT) stepFreeThrow(s, intents, [], DT);
    if (style === 'sim') assert.notEqual(s.freeThrow.stage, 'aim', 'Simulation: still aiming');
    else assert.equal(s.freeThrow.stage, 'aim', 'Arcade: shot without a press');
  }
});
