// The ball handler decides by expected points (plan Task 3.5). Each test looks at many seeds, since a choice is drawn
// (see choose.js): it pins what he does most of the time, or that he sometimes errs, not one draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { giveBall } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { AI, COURT, DT, LANE, RIM } from '../src/sim/tuning.js';
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
    const r = playHeadless({ seed, size: 5, minutes: 3, glide: false, setup: s => { s.humans = []; }, observe: s => {
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

// ---------- Corner threes, reading closeouts, and stars (the tuning after the build) ----------

import { setStyle } from '../src/sim/styles.js';
import { shotValue } from '../src/sim/ai.js';
import { STAR_AT, starPull } from '../src/sim/choose.js';
import { overall } from '../src/sim/overall.js';

// Team 0's sharpshooter (Okoro) has just caught it in the right corner; his man is `gap` metres off toward the hoop;
// everyone else is far away.
function corner(style, gap) {
  const s = createMatch(1, 5); setStyle(s, style); s.humans = []; s.phase = 'live'; s.playWait = [Infinity, Infinity]; s.tempo = { clock: Infinity, wait: 0 };
  s.players.forEach((p, i) => put(s, p.id, -9 + i, p.team === 0 ? -6 : 6));
  const me = s.players.find(p => p.team === 0 && s.rosters[0][p.person].name.endsWith('Okoro'));
  put(s, me.id, 11.6, 6.95);
  const man = s.players.find(o => o.man === me.id); put(s, man.id, 11.6, 6.95 - gap);
  giveBall(s, me);
  return { s, me, man };
}

test('caught open in the corner, a shooter squares up there instead of dribbling out; closed out on, he moves on', () => {
  for (const style of ['sim', 'arcade']) {
    const open = corner(style, 3.2); aiIntents(open.s, DT);
    assert.deepEqual([open.me.ai.targetX, open.me.ai.targetZ], [open.me.x, open.me.z], style);
    const tight = corner(style, 1.2); aiIntents(tight.s, DT);
    assert.notDeepEqual([tight.me.ai.targetX, tight.me.ai.targetZ], [tight.me.x, tight.me.z], style);
  }
});

test('caught on the wing with nothing on, he squares up there, then works it along the arc on his own side: he never walks it out to the top to pass it on', () => {
  // Nine metres out on the right wing (beyond the arc), his man two metres off toward the hoop; his team-mates are
  // back over half court, so there is nobody to pass to. Player 0, no driver, caught it from player 1, or brought it
  // up himself.
  const wing = (heldT, from, out = 9, style = 'arcade') => {
    const s = scene(1, out, 2), a = Math.PI / 4;
    setStyle(s, style);
    put(s, 0, RIM.x - out * Math.cos(a), out * Math.sin(a)); put(s, 3, RIM.x - (out - 2) * Math.cos(a), (out - 2) * Math.sin(a));
    Object.assign(s.players[0].ai, { heldT, from, gotAt: s.time });
    person(s, 0).tend.drive = 0.2;   // no driver: in Simulation a driver would take his man on from here
    return s;
  };
  const target = ai => ({ x: ai.targetX, z: ai.targetZ }), top = { x: AI.topX, z: 0 };
  for (const style of ['arcade', 'sim']) {
    const caught = wing(0.3, 1, 9, style), me = caught.players[0];
    assert.deepEqual([first(caught).chose, target(me.ai)], ['hold', { x: me.x, z: me.z }], `${style}: squared up where he caught it`);
    const later = wing(2, 1, 9, style), it = later.players[0], to = target(first(later));
    assert.ok(to.z > 0 && to.z < it.z && Math.hypot(to.x - it.x, to.z - it.z) <= AI.workTo + 1e-9, `${style}: along the arc toward the middle, a few metres`);
    assert.ok(Math.hypot(to.x - top.x, to.z - top.z) > 2.5, `${style}: and not to the top`);
    assert.deepEqual(target(first(wing(2, null, 9, style))), top, `${style}: the man who brought it up takes it to the top`);
  }
  // Inside the arc, a man who likes to drive attacks the elbow on his side in Arcade; in Simulation he works it too.
  const driver = style => { const s = wing(2, 1, 6, style); person(s, 0).tend.drive = 0.8; return s; };
  assert.deepEqual(target(first(driver('arcade'))), { x: COURT.halfLength - LANE.depth, z: LANE.halfWidth });
  assert.notDeepEqual(target(first(driver('sim'))), { x: COURT.halfLength - LANE.depth, z: LANE.halfWidth });
});

test('a shooter reads a closeout in Simulation: his man sprinting at him makes the shot worth less than his man standing there; Arcade does not read it', () => {
  for (const style of ['sim', 'arcade']) {
    const { s, me, man } = corner(style, 2.6);
    const standing = shotValue(s, me);
    Object.assign(man, { vx: 0, vz: 6 });   // straight at him
    const running = shotValue(s, me);
    if (style === 'sim') assert.ok(running < standing - 0.05, `${standing.toFixed(3)} -> ${running.toFixed(3)}`);
    else assert.equal(running, standing);
  }
});

test('team-mates look for a star (83 or better): more for one who has had little of the ball, less for one who has had plenty; nothing for the rest', () => {
  const s = createMatch(1, 5); setStyle(s, 'sim');
  const [cross, marsh] = [s.rosters[0][0], s.rosters[0][1]];
  assert.ok(overall(cross) >= STAR_AT && overall(marsh) < STAR_AT);
  const fresh = starPull(s, cross, 0);
  assert.ok(fresh > 0 && starPull(s, marsh, 0) < fresh, 'a star more than a player below');
  for (const p of s.rosters[0]) p.stats.fga = 4;
  cross.stats.fga = 25;   // he has had most of the ball
  assert.ok(starPull(s, cross, 0) < fresh, 'less once he has had plenty');
  cross.stats.fga = 0;    // and none of it
  assert.ok(starPull(s, cross, 0) > fresh, 'more while he has had none');
});
