// The ball handler decides by expected points (plan Task 3.5). Each test looks at many seeds, since a choice is drawn
// (see choose.js): it pins what he does most of the time, or that he sometimes errs, not one draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { giveBall } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { AI, DT, RIM } from '../src/sim/tuning.js';
import { plain } from './helpers.js';
import { playHeadless } from '../tools/sim/measure.mjs';

const put = (s, id, x, z) => Object.assign(s.players[id], { x, z, vx: 0, vz: 0 });
const person = (s, id) => s.rosters[s.players[id].team][s.players[id].person];

// Three a side in live play, set: team 0 attacks +x; player 0 has had the ball a moment `out` metres from the hoop
// with his man `gap` in front of him; the others far away unless a test moves them. Nobody plays (the computer drives
// everyone it is asked to), and no coach calls a play.
function scene(seed, out, gap, { clock = 12 } = {}) {
  const s = plain(createMatch(seed, 3));
  startMatch(s);
  Object.assign(s, { phase: 'live', frontcourt: true, playWait: [Infinity, Infinity], tempo: { clock: Infinity, wait: 0 }, shotClock: clock });
  s.players.forEach(p => { p.inbounder = false; put(s, p.id, -9 - p.slot, p.team === 0 ? 6 : -6); });
  giveBall(s, s.players[0]);
  put(s, 0, RIM.x - out, 0); put(s, 3, RIM.x - out + gap, 0);
  Object.assign(s.players[0].ai, { heldT: 1, had: true, timer: 0 });
  return s;
}
// What player 0 chooses at his first decision.
const first = s => { aiIntents(s, DT); return s.players[0].ai; };
const share = (n, make, what) => { let k = 0; for (let seed = 1; seed <= n; seed++) if (what(first(make(seed)))) k++; return k / n; };

test('wide open on the catch, a good shooter takes the three', () => {
  const caught = seed => {
    const s = scene(seed, 7.3, 4); person(s, 0).ratings.three = 85;
    Object.assign(s.players[0].ai, { heldT: 0.3, from: 1, gotAt: s.time });
    return s;
  };
  assert.ok(share(60, caught, ai => ai.chose === 'shoot') >= 0.8);
});

test('a poor shooter with room passes to a good one who has more', () => {
  const s = seed => {
    const t = scene(seed, 7.3, 2.4); person(t, 0).ratings.three = 45; person(t, 0).ratings.mid = 45;
    t.players[0].ai.heldT = 2;   // long enough in his hands to move it on (AI.passAfter)
    put(t, 1, RIM.x - 5.8, 3.8); person(t, 1).ratings.three = 92;   // a sharpshooter alone on the wing, nearer the hoop (a
    // handler with nobody on him passes only to a man nearer it)
    return t;
  };
  const passes = share(60, s, ai => ai.chose === 'pass'), shots = share(60, s, ai => ai.chose === 'shoot');
  assert.ok(passes > 2 * shots && passes >= 0.5, `passed ${passes}, shot ${shots}`);
});

test('early in the clock he drives a clear lane only when every defender is behind him', () => {
  const early = (seed, behind) => {
    const s = scene(seed, 7, 3, { clock: 21 }); s.tempo = { clock: Infinity, wait: 15 };
    put(s, 3, behind ? RIM.x - 10 : RIM.x - 2.4, behind ? 0 : 3.5);   // behind him, or between him and the hoop but off his line
    return s;
  };
  assert.ok(share(40, seed => early(seed, true), ai => ai.chose === 'drive') >= 0.8, 'a fast break');
  assert.equal(share(40, seed => early(seed, false), ai => ai.chose === 'drive'), 0, 'a set defence');
});

test('late in the clock he shoots what he has', () => {
  assert.ok(share(60, seed => scene(seed, 6, 1, { clock: 5 }), ai => ai.chose === 'shoot' || ai.action === 'shoot') >= 0.8);
});

test('a low-IQ passer sometimes throws into a defender\'s lane; a sharp one hardly ever', () => {
  const lane = (seed, iq) => {
    const s = scene(seed, 7.5, 4); person(s, 0).iq = iq; s.players[0].ai.heldT = 2;
    put(s, 1, RIM.x - 5.5, 4.5); put(s, 4, RIM.x - 6.5, 2.25);   // his only team-mate near, with a defender on the line between
    return s;
  };
  const poor = share(200, seed => lane(seed, 0.35), ai => ai.chose === 'pass'), sharp = share(200, seed => lane(seed, 0.98), ai => ai.chose === 'pass');
  assert.ok(poor >= 0.04 && poor > 3 * sharp, `low IQ ${poor}, sharp ${sharp}`);
  // And the pass into the lane is picked off, as passes are.
  let lost = 0;
  for (let seed = 1; seed <= 200 && !lost; seed++) {
    const s = lane(seed, 0.35);
    for (let t = 0; t < 2; t += DT) {
      const all = aiIntents(s, DT);
      step(s, all.map((it, i) => (i === 0 || i === 4 ? it : emptyIntent())), DT);
      if (s.ball.holder !== null && s.players[s.ball.holder].team === 1) { lost++; break; }
    }
  }
  assert.ok(lost > 0, 'no misread pass was ever picked off');
});

test('a high-usage scorer shoots over a contest more often than a low-usage one, with a man open', () => {
  const s = (seed, usage) => {
    const t = scene(seed, 6, 1); person(t, 0).tend.usage = usage; person(t, 0).ratings.mid = 80;
    put(t, 1, RIM.x - 6.6, -4); return t;   // a team-mate open on the other wing
  };
  const high = share(80, seed => s(seed, 0.98), ai => ai.chose === 'shoot'), low = share(80, seed => s(seed, 0.2), ai => ai.chose === 'shoot');
  assert.ok(high > low + 0.1, `high usage ${high}, low ${low}`);
});

// Arcade's own rules (a hard distance curve, threes early only with 3 m of room) keep shooters off the arc; their
// identity from three is Simulation's to show (tests/simplay.test.js). What every style shows is here.
test('players play their roles: slashers attack the rim, shooters and creators shoot from out, bigs inside, playmakers set others up', () => {
  const by = {};
  const line = person => (by[person.role] ??= { fga: 0, rim: 0, three: 0, ast: 0, secs: 0 });
  for (let seed = 1; seed <= 8; seed++) {
    let last = null;
    const r = playHeadless({ seed, size: 5, minutes: 3, setup: s => { s.humans = []; }, observe: s => {
      if (s.shot && s.shot !== last && s.shot.shooter !== undefined) {
        const p = s.players[s.shot.shooter], person = s.rosters[p.team][p.person], far = Math.hypot(p.x - (p.team === 0 ? 1 : -1) * RIM.x, p.z);
        const l = line(person); l.fga++; if (s.shot.finish || far < 1.5) l.rim++; if (far > 6.75 || Math.abs(p.z) > 6.6) l.three++;
      }
      last = s.shot;
    } });
    for (const person of r.state.rosters.flat()) { const l = line(person); l.ast += person.stats.ast; l.secs += person.secs; }
  }
  const pool = (roles, key, per = 'fga') => roles.reduce((a, r) => a + (by[r]?.[key] ?? 0), 0) / (roles.reduce((a, r) => a + (by[r]?.[per] ?? 0), 0) || 1);
  const show = (roles, key, per) => roles.map(r => `${r} ${pool([r], key, per).toFixed(2)}`).join(', ');
  const outside = ['Sharpshooter', 'Shot creator'], bigs = ['Rim protector', 'Glass cleaner', 'Rebounder', 'Post scorer'];
  assert.ok(pool(['Slasher'], 'rim') > pool([...outside, 'Playmaker'], 'rim'), `rim share: ${show(['Slasher', ...outside, 'Playmaker'], 'rim')}`);
  assert.ok(pool(outside, 'three') > 2 * pool(bigs, 'three'), `three-point share: ${show([...outside, ...bigs], 'three')}`);
  assert.ok(pool(bigs, 'rim') > 1.5 * pool(outside, 'rim'), `rim share: ${show([...bigs, ...outside], 'rim')}`);
  assert.ok(pool(['Playmaker'], 'ast', 'secs') > pool(['Rim protector', 'Post scorer', 'Glass cleaner', 'Stretch big'], 'ast', 'secs'), 'assists a second');
  assert.ok(pool(['Shot creator', 'Post scorer', 'Playmaker'], 'fga', 'secs') > pool(['Lockdown wing', 'Lockdown guard', 'Rebounder', 'Glass cleaner'], 'fga', 'secs'), 'shots a second');
});
