import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { kindOf, places, offBallSpot, passed } from '../src/sim/offball.js';
import { aiIntents } from '../src/sim/ai.js';
import { isThree } from '../src/sim/players.js';
import { AI, DT, OFF, RIM } from '../src/sim/tuning.js';
import { at } from './helpers.js';

const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const target = p => ({ x: p.ai.targetX, z: p.ai.targetZ });

// Live play with the real players, no coach and no waiting. Team 0 (attacking +x) has the ball with player `holder`
// at the top of the key; everyone else starts far back; each of team 1 is put a metre and a third from his man,
// toward the hoop, once the test has placed the men it cares about (call `guard(s)`).
function scene(size = 5, holder = 0) {
  const s = createMatch(1, size);
  s.phase = 'live'; s.playWait = [Infinity, Infinity]; s.tempo = { clock: Infinity, wait: 0 };
  s.players.forEach((p, i) => at(s, p.id, -8 + (i % size) * 1.5, p.team === 0 ? -5 : 5));
  at(s, holder, 5.4, 0);
  giveBall(s, s.players[holder]);
  return s;
}
function guard(s, gap = 1.35) {
  for (const p of s.players.filter(o => o.team === 1)) {
    const man = s.players[p.man], far = Math.hypot(RIM.x - man.x, man.z) || 1;
    at(s, p.id, man.x + gap * (RIM.x - man.x) / far, man.z - gap * man.z / far);
  }
  return s;
}
// Puts every team-mate of the handler on his place, with his defender on him.
function settled(size = 5, holder = 0) {
  const s = scene(size, holder);
  for (const [id, spot] of places(s, 0)) at(s, id, spot.x, spot.z);
  return guard(s);
}

test('what each player is: the two best inside are bigs (one in three a side), a good three-point shooter is a shooter, the rest slashers', () => {
  const five = scene(5), three = scene(3);
  assert.deepEqual([0, 1, 2, 3, 4].map(id => kindOf(five, five.players[id])), ['shooter', 'slasher', 'big', 'shooter', 'big']);
  assert.deepEqual([0, 1, 2].map(id => kindOf(three, three.players[id])), ['shooter', 'slasher', 'big']);
});

test('every role has a place, no two team-mates the same and none on the handler, in three a side and five', () => {
  for (const size of [3, 5]) for (let holder = 0; holder < size; holder++) {
    const s = scene(size, holder), given = places(s, 0);
    assert.equal(given.size, size - 1, `${size} a side, holder ${holder}`);
    assert.ok(!given.has(holder));
    const spots = [...given.values(), s.players[holder]];
    spots.forEach((a, i) => spots.slice(i + 1).forEach(b => assert.ok(apart(a, b) >= OFF.apart - 1e-9, `${size} a side, holder ${holder}: ${JSON.stringify(a)} and ${JSON.stringify(b)}`)));
    for (const spot of given.values()) assert.ok(spot.x > 0 && Math.abs(spot.x) <= 14 && Math.abs(spot.z) <= 7.2);
  }
});

test('shooters stand behind the line, a big is low on the weak side, and the side changes only when the ball is well past the middle', () => {
  const s = scene(5), given = places(s, 0);
  assert.ok(isThree(given.get(3).x, given.get(3).z, 1), `the sharpshooter is sent to ${JSON.stringify(given.get(3))}`);
  assert.ok(given.get(3).z > 6 && given.get(3).x > 11, 'he is not in the corner on the ball\'s side');
  assert.ok(given.get(2).x > 10 && given.get(2).z < -3, `the centre is sent to ${JSON.stringify(given.get(2))}`);
  s.ball.z = -1; assert.ok(places(s, 0).get(3).z > 0, 'the ball a metre past the middle moved everyone');
  s.ball.z = -2; assert.ok(places(s, 0).get(3).z < 0, 'the ball well past the middle moved nobody');
  s.ball.z = 1; assert.ok(places(s, 0).get(3).z < 0);
});

test('a big comes to the high post on the ball\'s side when the ball is on a wing', () => {
  const five = scene(5); at(five, 0, 7.4, 5.4); five.ball.z = 5.4;
  const high = [...places(five, 0).entries()].filter(([id]) => kindOf(five, five.players[id]) === 'big').map(([, spot]) => spot);
  assert.ok(high.some(spot => Math.abs(spot.x - 8.2) < 0.01 && spot.z > 2), `the bigs are at ${JSON.stringify(high)}`);
  const three = scene(3); at(three, 0, 7.4, 5.4); three.ball.z = 5.4;
  assert.ok(Math.abs(places(three, 0).get(2).x - 8.2) < 0.01, 'the one big of three a side stayed low');
});

test('nobody takes up a new place in the same instant as a team-mate', () => {
  const s = settled();
  const idle = s.players.map(emptyIntent);
  let together = 0, changes = 0;
  for (let t = 0; t < 20; t += DT) {
    const before = s.players.map(p => JSON.stringify(p.ai.place));
    s.ball.z = 6 * Math.sin(t);   // the ball swings from side to side, so the places keep changing
    for (const p of s.players) p.ai.timer = 0;
    aiIntents(s, DT); s.time += DT;
    const moved = s.players.filter((p, i) => p.team === 0 && before[i] !== undefined && JSON.stringify(p.ai.place) !== before[i]).length;
    changes += moved; if (moved > 1) together++;
  }
  assert.ok(changes >= 6, `only ${changes} changes of place in 20 seconds`);
  assert.equal(together, 0, 'two team-mates changed place on one step');
});

test('a slasher cuts when his defender is beaten and his lane is clear; not when he is covered; and only one of a team cuts at a time', () => {
  const covered = settled();
  assert.equal(offBallSpot(covered, covered.players[1]).why, 'place');
  const beaten = settled();
  at(beaten, 6, beaten.players[1].x - 1, beaten.players[1].z - 3.2);   // his defender has wandered off, up the court
  at(beaten, 7, 0, -6); at(beaten, 9, 0, -6.5);                        // and the bigs' defenders are not in the lane
  const cut = offBallSpot(beaten, beaten.players[1]);
  assert.deepEqual([cut.why, cut.sprint], ['cut', true]);
  assert.ok(apart(cut, { x: RIM.x, z: 0 }) < AI.layupDist, `he cuts to ${JSON.stringify(cut)}`);
  assert.equal(beaten.cut[0].id, 1);
  // A second player beaten at the same moment waits his turn.
  at(beaten, 8, 0, 0);
  passed(beaten, beaten.players[3]);
  assert.equal(offBallSpot(beaten, beaten.players[3]).why, 'place');
  // A cut lasts a moment; then he goes back to a place.
  assert.equal(offBallSpot(beaten, beaten.players[1]).why, 'cut');
  beaten.time += OFF.cutFor + 0.01;
  assert.equal(offBallSpot(beaten, beaten.players[1]).why, 'place');
  assert.equal(beaten.cut[0], null);
  // With a defender standing on his way to the rim he does not go.
  const blocked = settled();
  at(blocked, 6, blocked.players[1].x - 1, blocked.players[1].z - 3.2);
  at(blocked, 9, (blocked.players[1].x + RIM.x) / 2, blocked.players[1].z / 2);
  assert.equal(offBallSpot(blocked, blocked.players[1]).why, 'place');
});

// A cut is a choice (see choose.js): over many seeds, a shooter who has not passed mostly stays, and one who has just
// passed mostly cuts for the ball back.
test('whoever has just passed may cut for the ball back, though he is no slasher', () => {
  let before = 0, after = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = settled(5, 1); s.seed = seed * 7;   // Marsh has the ball; Cross (a shooter) is off it
    at(s, 5, s.players[0].x - 1, s.players[0].z + 3.2);
    at(s, 7, 0, 6); at(s, 9, 0, 6.5);           // the bigs' defenders are not in the lane
    if (offBallSpot(s, s.players[0]).why === 'cut') before++;
    s.cut[0] = null; s.time += 6; passed(s, s.players[0]);
    if (offBallSpot(s, s.players[0]).why === 'cut') after++;
  }
  assert.ok(before <= 12, `a shooter cut ${before} times of 40 without having passed`);
  assert.ok(after >= 24 && after > before + 10, `after passing he cut ${after} times of 40`);
});

test('the others get out of the way of a drive, and stay when they are clear of it', () => {
  const s = settled();
  at(s, 0, 6, 0); Object.assign(s.players[0], { vx: 5, vz: 0 });   // the handler goes at the hoop down the middle
  at(s, 1, 9.5, 0.6);                                              // a team-mate on his line
  const out = offBallSpot(s, s.players[1]);
  assert.equal(out.why, 'clear');
  assert.ok(Math.abs(out.z) > 3 && out.sprint, `he is sent to ${JSON.stringify(out)}`);
  assert.equal(offBallSpot(s, s.players[3]).why, 'place', 'a man in the corner was moved');
  Object.assign(s.players[0], { vx: 0, vz: 0 });
  assert.equal(offBallSpot(s, s.players[1]).why, 'place', 'he cleared out for a handler who is standing still');
});

test('on a fast break the two quickest run wide of the ball all the way, and the rest trail', () => {
  const s = scene(5);
  at(s, 0, -2, 0);
  for (const p of s.players.filter(o => o.team === 1)) p.x -= 4;   // every defender is far behind him
  const quick = [1, 3].map(id => offBallSpot(s, s.players[id])), slow = [2, 4].map(id => offBallSpot(s, s.players[id]));
  for (const lane of quick) assert.ok(lane.why === 'break' && lane.x > 10 && Math.abs(lane.z) === OFF.breakWide && lane.sprint, JSON.stringify(lane));
  assert.ok(quick[0].z * quick[1].z < 0, 'both run the same side');
  for (const trail of slow) assert.ok(trail.why === 'break' && trail.x < -2, JSON.stringify(trail));
});

test('an open player in a place he can score from calls for the ball; a covered one, a poor shooter out there, and the player you control do not', () => {
  const s = guard(settled(5, 1), 0.8);        // every defender tight on his man
  s.controlled = 1;
  const calls = () => { for (const p of s.players) p.ai.timer = 0; aiIntents(s, DT); return [0, 2, 3, 4].map(id => s.players[id].calling); };
  assert.deepEqual(calls(), [false, false, false, false], 'covered players called for the ball');
  at(s, 8, 0, 0); at(s, 7, 0, 3);             // the sharpshooter's defender and the centre's are nowhere near
  at(s, 2, 7.4, -5.6);                        // the centre stands out at the three-point line
  s.players.forEach(p => { p.ai.place = undefined; });
  const [, centre, shooter] = calls();
  assert.deepEqual([shooter, centre], [true, false]);
  s.controlled = 3;
  assert.equal(calls()[2], false, 'the player you control called for the ball');
});

// How many go is the team's playbook's choice (see the next test): a team like any other ('balanced') sends two.
test('on a shot the two best rebounders go to the boards and the rest get back, in five a side and three', () => {
  for (const size of [5, 3]) {
    const s = settled(size);
    s.teams = [{ ...s.teams[0], playbook: 'balanced' }, s.teams[1]];
    Object.assign(s.ball, { holder: null, mode: 'shot', shooter: 0, x: 9, y: 4, z: 0, vx: 2, vy: 1, vz: 0 });
    for (const p of s.players) p.ai.timer = 0;
    aiIntents(s, DT);
    const mine = s.players.filter(p => p.team === 0), chasing = mine.filter(p => p.ai.chase).map(p => p.id).sort();
    assert.deepEqual(chasing, size === 5 ? [2, 4] : [1, 2], `${size} a side`);   // Stone and Volkov; in three a side Stone and Marsh
    for (const p of mine.filter(m => !m.ai.chase)) assert.ok(p.ai.targetX < 0, `${size} a side: player ${p.id} did not get back`);
  }
});

test('a team that gets back sends one to the glass, a team that crashes sends three', () => {
  const sent = playbook => {
    const s = settled(5);
    s.teams = [{ ...s.teams[0], playbook }, s.teams[1]];
    Object.assign(s.ball, { holder: null, mode: 'shot', shooter: 0, x: 9, y: 4, z: 0, vx: 2, vy: 1, vz: 0 });
    for (const p of s.players) p.ai.timer = 0;
    aiIntents(s, DT);
    return s.players.filter(p => p.team === 0 && p.ai.chase).length;
  };
  assert.deepEqual([sent('paceSpace'), sent('balanced'), sent('insideOut')], [1, 2, 3]);
});

test('the player you control is given no place and no cut, and his team-mates clear his drive as they do the computer\'s', () => {
  const s = settled();
  s.controlled = 1;
  assert.equal(offBallSpot(s, s.players[1]), null);
  s.controlled = 0;                            // you have the ball and go at the hoop
  at(s, 0, 6, 0); Object.assign(s.players[0], { vx: 5, vz: 0 });
  at(s, 1, 9.5, 0.6);
  assert.equal(offBallSpot(s, s.players[1]).why, 'clear');
});

// ---------- off the ball: the defence ----------

// Team 1 defends the hoop at +x. Each test places the men and reads where the defenders are sent.
const plan = s => { for (const p of s.players) p.ai.timer = 0; return aiIntents(s, DT); };
const hoop = { x: RIM.x, z: 0 };

test('a defender one pass from the ball stays close; two passes away he sags toward the lane', () => {
  const s = settled();
  at(s, 0, 7.4, 5.4); s.ball.z = 5.4;                 // the ball on the wing
  at(s, 1, 9.5, 2.5);                                 // one man a pass away
  at(s, 3, 11.6, -6.9);                               // one in the far corner, two passes away
  guard(s); plan(s);
  const near = apart(target(s.players[6]), s.players[1]), far = apart(target(s.players[8]), s.players[3]);
  assert.ok(near < 2.2, `one pass away he stands ${near} m off`);
  assert.ok(far > 2.6, `two passes away he stands only ${far} m off`);
  assert.ok(Math.abs(target(s.players[8]).z) < 6.2 && apart(target(s.players[8]), hoop) < apart(s.players[3], hoop), 'he did not sag toward the lane');
});

test('he closes out at a sprint with a hand up when his man catches the ball; once he is there, or once his man has had it a while, he does not', () => {
  const s = settled();
  at(s, 6, 9.5, 0);                                   // Marsh's defender has sagged off him
  giveBall(s, s.players[1]); s.players[1].ai.heldT = 0; s.players[1].ai.had = true;
  plan(s);
  assert.deepEqual([s.players[6].closing, s.players[6].ai.sprint], [true, true]);
  assert.ok(apart(target(s.players[6]), s.players[1]) < 2, 'he did not go to his man');
  s.players[1].ai.heldT = AI.closeFor + 0.5; plan(s);
  assert.equal(s.players[6].closing, false, 'he is still closing out on a man who has had the ball a while');
  s.players[1].ai.heldT = 0; at(s, 6, target(s.players[6]).x, target(s.players[6]).z); plan(s);
  assert.equal(s.players[6].closing, false, 'he has a hand up though he is on his man');
});

test('on a shot every defender puts himself between his man and the hoop before anyone goes for the ball; then the two nearest the rim go', () => {
  const s = settled();
  s.shot = { shooter: 0, at: s.time };
  Object.assign(s.ball, { holder: null, mode: 'shot', shooter: 0, x: 9, y: 4, z: 0, vx: 2, vy: 1, vz: 0 });
  plan(s);
  for (const p of s.players.filter(m => m.team === 1)) {
    const man = s.players[p.man], spot = target(p);
    assert.ok(Math.abs(apart(spot, man) - AI.boxGap) < 0.01 && apart(spot, hoop) < apart(man, hoop), `player ${p.id} is sent to ${JSON.stringify(spot)}`);
    assert.equal(p.ai.chase, false, `player ${p.id} went for the ball at once`);
  }
  s.time += AI.boxFor + 0.01; plan(s);
  const chasing = s.players.filter(m => m.team === 1 && m.ai.chase).map(m => m.id).sort();
  assert.equal(chasing.length, AI.boards, 'the defenders nearest the rim did not go for it');
  // The team that shot does not box out: its rebounders go straight to the boards (as many as its playbook sends).
  assert.ok(s.players.filter(m => m.team === 0 && m.ai.chase).length >= 1);
});

test('the man a helper leaves is covered by a sagging team-mate, who goes back when the helper does', () => {
  const s = settled();
  at(s, 0, 7, 0); at(s, 5, 6, 2.5);                   // the handler has beaten his man down the middle
  at(s, 3, 11.6, 6.9); at(s, 1, 7.4, -5.6); at(s, 2, 11, -3.2); at(s, 4, 11, 3.2);
  for (const id of [6, 7, 8, 9]) { const man = s.players[s.players[id].man], far = apart(man, hoop); at(s, id, man.x + 1.4 * (hoop.x - man.x) / far, man.z - 1.4 * man.z / far); }
  plan(s); plan(s);                                    // once for the helper to come, once for the rest to see him
  const helper = s.players.find(p => p.team === 1 && (p.ai.helpUntil ?? 0) > s.time);
  assert.ok(helper, 'nobody helped');
  const left = s.players[helper.man];
  const cover = s.players.filter(p => p.team === 1 && p !== helper && p.id !== 5)
    .find(p => apart(target(p), { x: (s.players[p.man].x + left.x) / 2, z: (s.players[p.man].z + left.z) / 2 }) < 0.01);
  assert.ok(cover, 'nobody covers the man the helper left');
  s.time += AI.helpFor + 0.1; at(s, 5, 8.2, 0);       // the handler is covered again and the helper's moment is over
  plan(s);
  assert.ok(apart(target(cover), s.players[cover.man]) < apart(target(cover), left), 'the cover did not go back to his own man');
});

test('getting back: with the ball still in the other half, the defender nearest his hoop guards the rim and the next picks up the ball', () => {
  const s = scene(5);
  at(s, 0, -6, 1);                                     // the handler in his own half
  [[6, 2], [7, 9], [8, -1], [9, 3]].forEach(([id, x], i) => at(s, id, x, -4 + i * 2.5));
  at(s, 5, -9, 0);                                     // his own defender is behind the play
  plan(s);
  assert.ok(apart(target(s.players[7]), hoop) <= AI.helpAt + 0.01, `the first man back is sent to ${JSON.stringify(target(s.players[7]))}`);
  const stopper = s.players[8];                        // the nearest of the rest to the ball
  assert.ok(Math.abs(target(stopper).z - 1) < 2 && target(stopper).x > -6, `the second is sent to ${JSON.stringify(target(stopper))}, not at the ball`);
  at(s, 0, 3, 1); plan(s);                             // once the ball is over half way everyone has his own man
  assert.ok(apart(target(s.players[7]), hoop) > AI.helpAt + 0.5 || s.players[7].man === 0);
});

// A cut is a choice (see choose.js): Marsh, a slasher on the wing whose man is right on him, cuts far more often when
// that man is one who watches the ball than when he is one who watches him.
test('a cutter whose man is watching the ball cuts; one who is well guarded mostly stays', () => {
  const cuts = iq => {
    let n = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = settled(5, 0); s.seed = seed * 11;
      const marsh = s.players[1], d = s.players.find(p => p.man === marsh.id);
      s.rosters[1][d.person].iq = iq;
      // His man stands close, a step toward the ball and off his line to the rim (as a man watching the ball does):
      // not beaten, but the way to the rim is open.
      // Marsh is at (7.4, 5.6), the ball at the top: half a metre toward the rim and 1.2 m across toward the ball.
      at(s, d.id, 6.84, 4.43);
      at(s, 7, 0, 6); at(s, 9, 0, 6.5);           // the bigs' defenders are not in the lane
      if (offBallSpot(s, marsh).why === 'cut') n++;
    }
    return n;
  };
  const watched = cuts(0.98), watcher = cuts(0.35);
  assert.ok(watcher > watched + 10, `against a ball-watcher he cut ${watcher} times of 60, against a sharp man ${watched}`);
});
