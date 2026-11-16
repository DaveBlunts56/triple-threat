import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { overall } from '../src/sim/ratings.js';
import { tendenciesOf, iqOf } from '../src/sim/tendencies.js';

const s = createMatch(1, 5);
const who = name => s.rosters.flat().find(p => p.name === name);
const all = s.rosters.flat();

test('each role\'s players look like their role', () => {
  for (const name of ['Sam Okoro', 'Devon Hale']) {
    const { diet } = who(name).tend;
    assert.ok(diet.three > diet.mid && diet.three > diet.rim, `${name} ${JSON.stringify(diet)}`);
  }
  const lund = who('Viktor Lund').tend.post;
  for (const p of all) if (p.name !== 'Viktor Lund') assert.ok(p.tend.post < lund, `${p.name} posts up as much as Lund`);
  for (const p of s.rosters[1]) assert.ok(who('Jalen Cross').tend.passFirst > p.tend.passFirst, `${p.name} passes first as much as Cross`);
  const drivers = [...all].sort((a, b) => b.tend.drive - a.tend.drive).slice(0, 2).map(p => p.name).sort();
  assert.deepEqual(drivers, ['Jamal Whitaker', 'Theo Marsh']);
  const helpers = [...all].sort((a, b) => b.tend.help - a.tend.help).slice(0, 2).map(p => p.name).sort();
  assert.deepEqual(helpers, ['Bogdan Ilic', 'Darius Stone']);
  for (const p of all) assert.ok(Math.abs(p.tend.diet.rim + p.tend.diet.mid + p.tend.diet.three - 1) < 1e-9);
});

test('a player\'s own tendencies and IQ win over his role\'s', () => {
  const person = who('Darius Stone');
  assert.equal(tendenciesOf(person, { usage: 0.9 }).usage, 0.9);
  assert.equal(tendenciesOf(person, { diet: { three: 0.8 } }).diet.three, 0.8);
  assert.equal(iqOf(person, 0.5), 0.5);
});

test('IQ stays within its range, and the overall is unchanged', () => {
  for (const p of all) assert.ok(p.iq >= 0.35 && p.iq <= 0.98, `${p.name} ${p.iq}`);
  assert.equal(overall(who('Jalen Cross')), 88); assert.equal(overall(who('Kai Mercer')), 89);
  assert.ok(who('Jalen Cross').iq > who('Idris Kane').iq);
});
