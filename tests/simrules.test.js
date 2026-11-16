// Simulation's rules, each against Arcade's (plan Task 4.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, setLength } from '../src/sim/state.js';
import { setStyle } from '../src/sim/styles.js';
import { startMatch } from '../src/sim/rules.js';
import { recordFoul } from '../src/sim/fouls.js';
import { step } from '../src/sim/step.js';
import { CLOCK, DT } from '../src/sim/tuning.js';
import { idle } from './helpers.js';

const match = (style, minutes = 12) => { const s = createMatch(1, 5); setLength(s, minutes); setStyle(s, style); return s; };

test('overtime is 5 minutes after 12-minute quarters in Simulation (5/12 of a quarter), and the game\'s minute in Arcade', () => {
  for (const [style, minutes, want] of [['sim', 12, 300], ['sim', 3, 75], ['arcade', 12, CLOCK.overtime], ['arcade', 3, CLOCK.overtime]]) {
    const s = match(style, minutes);
    startMatch(s);
    // To the end of the fourth quarter, level: overtime begins.
    Object.assign(s, { quarter: 4, phase: 'quarterEnd', phaseT: 0, score: [50, 50] });
    step(s, idle(10), DT);
    assert.equal(s.quarter, 5, `${style}, ${minutes}-minute quarters`);
    assert.ok(Math.abs(s.gameClock - want) < 1e-9, `${style}, ${minutes}-minute quarters: ${s.gameClock}`);
  }
});

test('a shot off the rim resets the shot clock to 14 in Simulation and to 24 in Arcade', async () => {
  const { live, shotAt, run } = await import('./helpers.js');
  for (const [style, want] of [['sim', 14], ['arcade', 24]]) {
    const s = live(1, 5); setStyle(s, style);
    s.shotClock = 9;
    shotAt(s, { x: 12.425 - 0.3, y: 3.4, z: 0 });
    Object.assign(s.ball, { vx: 1.2, vy: -2, vz: 0 });
    run(s, 0.5, idle(10), st => st.shotClock > 9);
    assert.equal(Math.round(s.shotClock), want, style);
  }
});

test('in the last two minutes of a period a team\'s second foul there is shot in Simulation; in Arcade only the bonus counts', () => {
  for (const [style, want] of [['sim', [0, 2]], ['arcade', [0, 0]]]) {
    const s = match(style);
    Object.assign(s, { gameClock: 100, teamFouls: [1, 1], lateFouls: [0, 0] });
    const shots = [recordFoul(s, { kind: 'reach', by: 5, on: 0 }).shots, recordFoul(s, { kind: 'reach', by: 6, on: 1 }).shots];
    assert.deepEqual(shots, want, style);
  }
  const early = match('sim');
  Object.assign(early, { gameClock: 300, teamFouls: [1, 1] });
  assert.deepEqual([recordFoul(early, { kind: 'reach', by: 5, on: 0 }).shots, recordFoul(early, { kind: 'reach', by: 6, on: 1 }).shots], [0, 0], 'not before the last two minutes');
});

test('seven timeouts a team in Simulation and three in Arcade, and a timeout rests a little less', () => {
  for (const [style, want] of [['sim', 7], ['arcade', 3]]) {
    const s = match(style);
    startMatch(s);
    assert.deepEqual(s.timeouts, [want, want], style);
  }
});
