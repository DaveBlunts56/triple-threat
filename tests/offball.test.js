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

test('whoever has just passed may cut for the ball back, though he is no slasher', () => {
  const s = settled(5, 1);                    // Marsh has the ball; Cross (a shooter) is off it
  at(s, 5, s.players[0].x - 1, s.players[0].z + 3.2);
  at(s, 7, 0, 6); at(s, 9, 0, 6.5);           // the bigs' defenders are not in the lane
  assert.equal(offBallSpot(s, s.players[0]).why, 'place', 'a shooter cut without having passed');
  s.time += 6; passed(s, s.players[0]);
  assert.equal(offBallSpot(s, s.players[0]).why, 'cut');
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

test('on a shot the two best rebounders go to the boards and the rest get back, in five a side and three', () => {
  for (const size of [5, 3]) {
    const s = settled(size);
    Object.assign(s.ball, { holder: null, mode: 'shot', shooter: 0, x: 9, y: 4, z: 0, vx: 2, vy: 1, vz: 0 });
    for (const p of s.players) p.ai.timer = 0;
    aiIntents(s, DT);
    const mine = s.players.filter(p => p.team === 0), chasing = mine.filter(p => p.ai.chase).map(p => p.id).sort();
    assert.deepEqual(chasing, size === 5 ? [2, 4] : [1, 2], `${size} a side`);   // Stone and Volkov; in three a side Stone and Marsh
    for (const p of mine.filter(m => !m.ai.chase)) assert.ok(p.ai.targetX < 0, `${size} a side: player ${p.id} did not get back`);
  }
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
