import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import {
  movePlayers, carryBall, isThree, makeChance, releaseShot, passBall,
  trySteal, tryPickup, giveBall, applyActions,
} from '../src/sim/players.js';
import { stepBall } from '../src/sim/ball.js';
import { DT, RIM, PLAYER, BALL, SHOT, STEAL } from '../src/sim/tuning.js';

const APEX = PLAYER.jumpV / BALL.gravity;   // seconds from take-off to the top of a jump

// Team 0 near the +x hoop, team 1 parked far away at the other end. Player 0 has the ball.
function setup(seed = 1) {
  const s = createMatch(seed);
  s.phase = 'live';
  const at = (id, x, z) => Object.assign(s.players[id], { x, z });
  at(0, 8, 0); at(1, 8, -4); at(2, 8, 4);
  at(3, -10, -3); at(4, -10, 0); at(5, -10, 3);
  giveBall(s, s.players[0]);
  carryBall(s, DT);
  return s;
}
const intents = (id, intent) => Array.from({ length: 6 }, (_, i) => (i === id ? { ...emptyIntent(), ...intent } : emptyIntent()));
function tick(s, its) { movePlayers(s, its, DT); applyActions(s, its, DT); carryBall(s, DT); }
const airborneAtApex = p => Object.assign(p, { y: 0.8, vy: 0, jumpT: APEX, shooting: true });

test('isThree: arc and corners', () => {
  assert.equal(isThree(RIM.x - 6.7, 0, 1), false);
  assert.equal(isThree(RIM.x - 6.8, 0, 1), true);
  assert.equal(isThree(13, 6.7, 1), true);
  assert.equal(isThree(13, 6.5, 1), false);
  assert.equal(isThree(-RIM.x + 6.8, 0, -1), true);
  assert.equal(isThree(-RIM.x + 6.7, 0, -1), false);
});

test('makeChance falls with distance', () => {
  const s = setup(), p = airborneAtApex(s.players[0]);
  const at = d => { p.x = RIM.x - d; return makeChance(s, p); };
  assert.ok(Math.abs(at(1) - (0.85 - 0.5 / 8)) < 0.02, `1 m: ${at(1)}`);
  assert.ok(at(1) > at(4) && at(4) > at(7));
  assert.ok(at(12) >= SHOT.minChance);
});

test('makeChance is best at the apex', () => {
  const s = setup(), p = airborneAtApex(s.players[0]);
  const best = makeChance(s, p);
  p.jumpT = 0;
  assert.ok(Math.abs(makeChance(s, p) / best - SHOT.worstTiming) < 0.02);
  p.jumpT = 2 * APEX;
  assert.ok(Math.abs(makeChance(s, p) / best - SHOT.worstTiming) < 0.02);
});

test('makeChance falls when a defender is close, more if airborne', () => {
  const s = setup(), p = airborneAtApex(s.players[0]), d = s.players[3];
  const open = makeChance(s, p);
  Object.assign(d, { x: p.x + 0.5, z: 0 });
  const contested = makeChance(s, p);
  d.y = 0.5;
  const smothered = makeChance(s, p);
  assert.ok(open > contested && contested > smothered, `${open} ${contested} ${smothered}`);
});

test('releaseShot launches a 3 from behind the arc', () => {
  const s = setup(), p = airborneAtApex(s.players[0]);
  p.x = RIM.x - 7;
  releaseShot(s, p);
  assert.equal(s.ball.mode, 'shot');
  assert.equal(s.ball.shotValue, 3);
  assert.equal(s.ball.shooter, 0);
  assert.equal(s.ball.holder, null);
  assert.equal(p.shooting, false);
  assert.ok(s.ball.vx > 0 && s.ball.vy > 0);
});

test('releaseShot launches a 2 from inside the arc', () => {
  const s = setup(), p = airborneAtApex(s.players[0]);
  p.x = RIM.x - 4;
  releaseShot(s, p);
  assert.equal(s.ball.shotValue, 2);
});

test('open close-range shots at the apex mostly go in', () => {
  let made = 0;
  const tries = 200;
  for (let seed = 1; seed <= tries; seed++) {
    const s = setup(seed), p = airborneAtApex(s.players[0]);
    p.x = RIM.x - 2;
    releaseShot(s, p);
    for (let t = 0; t < 3; t += DT) {
      const e = stepBall(s.ball, DT);
      if (e.scored === 1) { made++; break; }
      if (e.hitFloor) break;
    }
  }
  assert.ok(made / tries > 0.6 && made / tries < 0.95, `made ${made}/${tries}`);
});

test('an airborne defender in front blocks about half of shots', () => {
  let blocked = 0;
  const tries = 200;
  for (let seed = 1; seed <= tries; seed++) {
    const s = setup(seed), p = airborneAtApex(s.players[0]);
    p.facing = 0;
    Object.assign(s.players[3], { x: p.x + 0.8, z: 0, y: 0.6 });
    releaseShot(s, p);
    if (s.ball.mode === 'loose') { blocked++; assert.equal(s.lastTouch, 1); assert.equal(s.ball.holder, null); }
  }
  assert.ok(blocked / tries > 0.35 && blocked / tries < 0.65, `blocked ${blocked}/${tries}`);
});

test('a defender standing on the floor cannot block', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = setup(seed), p = airborneAtApex(s.players[0]);
    p.facing = 0;
    Object.assign(s.players[3], { x: p.x + 0.8, z: 0, y: 0 });
    releaseShot(s, p);
    assert.equal(s.ball.mode, 'shot');
  }
});

test('pressing shoot jumps; releasing it in the air shoots', () => {
  const s = setup();
  tick(s, intents(0, { shoot: true }));
  assert.equal(s.players[0].shooting, true);
  assert.ok(s.players[0].vy > 0);
  for (let i = 0; i < 20; i++) tick(s, intents(0, { shoot: true }));
  assert.equal(s.ball.holder, 0);
  tick(s, intents(0, {}));
  assert.equal(s.ball.mode, 'shot');
});

test('holding shoot through landing releases the ball', () => {
  const s = setup();
  for (let t = 0; t < 2; t += DT) tick(s, intents(0, { shoot: true }));
  assert.equal(s.ball.holder, null);
  assert.equal(s.players[0].shooting, false);
  assert.equal(s.players[0].y, 0);
});

test('pass goes to the teammate in the input direction', () => {
  const s = setup();
  passBall(s, s.players[0], { ...emptyIntent(), moveZ: 1 });
  assert.equal(s.ball.mode, 'pass');
  assert.ok(s.ball.vz > 0);
  assert.equal(s.controlled, 2);
});

test('pass with no input goes to the nearest teammate', () => {
  const s = setup();
  s.players[1].z = -2;
  passBall(s, s.players[0], emptyIntent());
  assert.ok(s.ball.vz < 0);
  assert.equal(s.controlled, 1);
});

test('a pass reaches its receiver, who catches it', () => {
  const s = setup();
  tick(s, intents(0, { pass: true, moveZ: 1 }));
  assert.equal(s.ball.mode, 'pass');
  for (let t = 0; t < 1 && s.ball.holder === null; t += DT) { stepBall(s.ball, DT); tick(s, intents(0, {})); }
  assert.equal(s.ball.holder, 2);
});

test('a free ball is picked up by the nearest player in reach', () => {
  const s = setup();
  Object.assign(s.ball, { holder: null, mode: 'loose', x: 0, y: BALL.radius, z: 0 });
  Object.assign(s.players[1], { x: 0.5, z: 0 });
  Object.assign(s.players[4], { x: -0.3, z: 0 });
  assert.equal(tryPickup(s).id, 4);
});

test('a ball above reach cannot be picked up', () => {
  const s = setup();
  Object.assign(s.ball, { holder: null, mode: 'loose', x: 0, y: 3, z: 0 });
  Object.assign(s.players[1], { x: 0.2, z: 0 });
  assert.equal(tryPickup(s), null);
  s.players[1].y = 0.7;
  assert.equal(tryPickup(s).id, 1);
});

test('the passer cannot immediately re-take their own pass', () => {
  const s = setup();
  passBall(s, s.players[0], emptyIntent());
  assert.equal(tryPickup(s), null);
});

test('a ball in shot mode cannot be picked up', () => {
  const s = setup();
  Object.assign(s.ball, { holder: null, mode: 'shot', x: 0, y: 1, z: 0 });
  Object.assign(s.players[1], { x: 0.1, z: 0 });
  assert.equal(tryPickup(s), null);
});

test('steals from the front succeed far more often than from behind', () => {
  const rate = offset => {
    let won = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = setup(seed);
      s.players[0].facing = 0;
      Object.assign(s.players[3], { x: 8 + offset, z: 0 });
      trySteal(s, s.players[3]);
      if (s.ball.holder === 3) won++;
    }
    return won / 300;
  };
  const front = rate(1), behind = rate(-1);
  assert.ok(Math.abs(front - STEAL.frontChance) < 0.1, `front ${front}`);
  assert.ok(Math.abs(behind - STEAL.backChance) < 0.08, `behind ${behind}`);
});

test('steal respects the cooldown', () => {
  const s = setup();
  Object.assign(s.players[3], { x: 9, z: 0, stealCooldown: 0.5 });
  const seed = s.seed;
  trySteal(s, s.players[3]);
  assert.equal(s.seed, seed);
  assert.equal(s.ball.holder, 0);
});

test('a steal attempt out of reach does nothing', () => {
  const s = setup();
  const seed = s.seed;
  trySteal(s, s.players[3]);
  assert.equal(s.seed, seed);
  assert.equal(s.players[3].stealCooldown, 0);
});

test('gaining the ball from the other team resets the shot clock to 24', () => {
  const s = setup();
  s.shotClock = 5;
  giveBall(s, s.players[1]);
  assert.equal(s.shotClock, 5);
  giveBall(s, s.players[4]);
  assert.equal(s.shotClock, 24);
  assert.equal(s.possession, 1);
  assert.equal(s.lastTouch, 1);
});

test('switch moves control to the defender nearest the ball', () => {
  const s = setup();
  giveBall(s, s.players[4]);
  carryBall(s, DT);
  s.controlled = 0;
  Object.assign(s.players[2], { x: -9, z: 0 });
  tick(s, intents(0, { switch: true }));
  assert.equal(s.controlled, 2);
});

test('an inbounder can pass but not shoot', () => {
  const s = setup(), p = s.players[0];
  p.inbounder = true;
  tick(s, intents(0, { shoot: true }));
  assert.equal(p.shooting, false);
  assert.equal(p.vy, 0);
  tick(s, intents(0, {}));
  tick(s, intents(0, { pass: true }));
  assert.equal(s.ball.mode, 'pass');
});

test('an inbounder cannot be stolen from', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = setup(seed);
    s.players[0].inbounder = true;
    Object.assign(s.players[3], { x: 9, z: 0 });
    trySteal(s, s.players[3]);
    assert.equal(s.ball.holder, 0);
  }
});

test('a lead pass to a teammate running toward the sideline is not aimed out of bounds', () => {
  const s = setup();
  Object.assign(s.players[2], { x: 8, z: 7, vz: 7 });
  passBall(s, s.players[0], { ...emptyIntent(), moveZ: 1 });
  const landing = s.ball.z + s.ball.vz * ((2 * s.ball.vy) / BALL.gravity);
  assert.ok(landing <= 7.5, `aimed at z=${landing}`);
});

test('a defender right in front cannot snatch a pass the instant it leaves the hand', () => {
  const s = setup();
  Object.assign(s.players[3], { x: 8, z: 1 });   // directly between passer and receiver
  tick(s, intents(0, { pass: true, moveZ: 1 }));
  assert.equal(s.ball.holder, null);
  assert.equal(s.ball.mode, 'pass');
});

test('a sprinting player who goes up for a shot does not fly on at full speed', () => {
  const s = setup();
  for (let i = 0; i < 30; i++) tick(s, intents(0, { moveX: 1, sprint: true }));
  const x = s.players[0].x;
  for (let t = 0; t < 2 && s.ball.holder === 0; t += DT) tick(s, intents(0, { moveX: 1, sprint: true, shoot: true }));
  assert.ok(s.players[0].x - x < 1.5, `drifted ${s.players[0].x - x} m during the shot`);
});
