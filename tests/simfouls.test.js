// Simulation's fouls and turnovers, each impossible in Arcade (plan Task 4.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setStyle } from '../src/sim/styles.js';
import { judgeContacts } from '../src/sim/fouls.js';
import { emptyEvents } from '../src/sim/state.js';
import { giveBall, passBall } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { DT, FOUL } from '../src/sim/tuning.js';
import { callPlay, stepPlays } from '../src/sim/plays.js';
import { guardOf } from '../src/sim/matchups.js';
import { live, at, idle, run } from './helpers.js';

// Over `n` seeds, how often `make(seed)`'s step is judged a foul of `kind`.
function calls(style, n, make, kind) {
  let k = 0;
  for (let seed = 1; seed <= n; seed++) {
    const { s, events } = make(seed);
    setStyle(s, style);
    if (judgeContacts(s, events, DT)?.kind === kind) k++;
  }
  return k;
}

test('a loose-ball foul in the scramble for a rebound, in Simulation; never in Arcade', () => {
  const scramble = seed => {
    const s = live(seed, 5);
    Object.assign(s.ball, { holder: null, mode: 'loose', x: 11, y: 3.5, z: 0 }); s.board = true;
    at(s, 2, 11, 0.5); at(s, 7, 11.4, 0.6); s.players[7].setT = 1;   // a defender holding his ground, run into
    const events = emptyEvents(); events.contacts = [[2, 7]];
    return { s, events };
  };
  const sim = calls('sim', 400, scramble, 'looseBall');
  assert.ok(sim > 8 && sim < 60, `${sim} of 400`);
  assert.equal(calls('arcade', 400, scramble, 'looseBall'), 0);
  // It is on the man who ran into the one holding his ground.
  const { s, events } = scramble(1); setStyle(s, 'sim');
  for (let seed = 1; seed <= 400; seed++) { s.seed = seed; s.players[2].foulCooldown = s.players[7].foulCooldown = 0; const f = judgeContacts(s, events, DT); if (f) { assert.deepEqual([f.by, f.on], [2, 7]); break; } }
});

test('an illegal screen: a screener still moving into the defender, in Simulation; never in Arcade', () => {
  // Team 0 runs a pick and roll: its big, still moving, runs into the defender of the ball handler (player 0).
  const screen = seed => {
    const s = live(seed, 5);
    callPlay(s, 0, 'pickRoll'); stepPlays(s, DT);
    const big = s.players[s.plays[0].ids.big], d = guardOf(s, s.players[0]);
    at(s, big.id, 6, 2); Object.assign(big, { vx: 2, vz: 0 }); at(s, d.id, 6.5, 2);
    const events = emptyEvents(); events.contacts = [[big.id, d.id]];
    return { s, events };
  };
  const sim = calls('sim', 400, screen, 'illegalScreen');
  assert.ok(sim > 30 && sim < 100, `${sim} of 400`);
  assert.equal(calls('arcade', 400, screen, 'illegalScreen'), 0);
  // A set screener is no foul.
  const set = seed => { const r = screen(seed); Object.assign(r.s.players[r.s.plays[0].ids.big], { vx: 0, vz: 0, setT: 1 }); return r; };
  assert.equal(calls('sim', 200, set, 'illegalScreen'), 0);
});

test('contact on a drive: a finish with a defender on him draws shooting fouls in Simulation; in Arcade only an airborne one does', () => {
  const drive = seed => {
    const s = live(seed, 5);
    const events = emptyEvents();
    events.release = { shooter: 0, defender: null, blocked: false, near: 5 };   // a layup with a defender at his side, on the floor
    return { s, events };
  };
  const sim = calls('sim', 400, drive, 'shooting');
  assert.ok(Math.abs(sim / 400 - 0.25) < 0.07, `${sim} of 400`);
  assert.equal(calls('arcade', 400, drive, 'shooting'), 0);
});

test('a pass caught with a defender right on the catcher is sometimes fumbled in Simulation, and the other team\'s pick-up is his turnover; never in Arcade', () => {
  const fumbled = style => {
    let n = 0, tov = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = live(seed, 5); setStyle(s, style);
      for (const p of s.players) at(s, p.id, -10, (p.id - 5) * 1.2);   // everyone else out of the way
      at(s, 0, 4, 0); at(s, 1, 7, 0); at(s, 6, 7.6, 0.4);   // the receiver (1) with his man on him
      passBall(s, s.players[0], { moveX: 1, moveZ: 0 });
      run(s, 0.4, idle(10), st => st.ball.holder !== null || st.fumbledBy != null);
      if (s.fumbledBy != null) {
        n++;
        run(s, 3, idle(10), st => st.ball.holder !== null);
        if (s.ball.holder !== null && s.players[s.ball.holder].team === 1) tov += s.rosters[0][s.players[1].person].stats.tov;
      }
    }
    return { n, tov };
  };
  const sim = fumbled('sim'), arcade = fumbled('arcade');
  assert.ok(sim.n >= 2 && sim.n <= 20, `${sim.n} fumbles in 300`);
  assert.equal(arcade.n, 0);
});

test('an offensive foul is a turnover in the box score', async () => {
  const { recordFoul } = await import('../src/sim/fouls.js');
  const s = live(1, 5);
  at(s, 0, 8, 0); at(s, 5, 8.6, 0); s.players[5].setT = 1;
  Object.assign(s.players[0], { vx: FOUL.chargeSpeed + 1, vz: 0 });
  let charged = false;
  for (let seed = 1; seed <= 50 && !charged; seed++) {
    const t = live(seed, 5); at(t, 0, 8, 0); at(t, 5, 8.6, 0); t.players[5].setT = 1; Object.assign(t.players[0], { vx: FOUL.chargeSpeed + 1, vz: 0 });
    step(t, idle(10).map((it, i) => (i === 0 ? { ...it, moveX: 1, sprint: true } : it)), DT);
    if (t.call?.kind === 'charge') { charged = true; assert.equal(t.rosters[0][0].stats.tov, 1); }
  }
  assert.ok(charged, 'no charge was called in 50 seeds');
  assert.equal(typeof recordFoul, 'function');
});
