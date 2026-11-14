import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dribbleHeight, switchSpot, ballSpot, ballHands, BALL_IN_HAND, carrying, blendFrom, crossFrom, dribbleSpot, moveSpot, MOVE_BALL } from '../src/render/hands.js';
import { checkHands } from '../src/render/checks.js';

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;

test('a dribbled ball stays at the hand for 55% of each bounce and touches the floor midway through the rest', () => {
  const d = { push: 0.25, bounces: 1 }, height = phase => dribbleHeight(phase, d, 1, 0.12);
  assert.ok(near(height(0.25), 1) && near(height(0.475), 0.12) && near(height(0.7), 1) && near(height(0.9), 1) && near(height(0.1), 1));
  const atHand = Array.from({ length: 1000 }, (_, i) => height(i / 1000)).filter(y => y > 1 - 1e-9).length;
  assert.ok(Math.abs(atHand - 550) <= 2, `${atHand / 10}% of the cycle at the hand`);
  assert.ok(near(dribbleHeight(0.5, { push: 0, bounces: 2 }, 1, 0.12), 1) && near(dribbleHeight(0.1125, { push: 0, bounces: 2 }, 1, 0.12), 0.12));
  assert.ok(near(dribbleHeight(0.475, d, 0.8, 0.12), 0.12) && near(dribbleHeight(0.9, d, 0.8, 0.12), 0.8));   // it follows the hand's real height
});

test('changing hands, the ball crosses low in front with one bounce on the way', () => {
  const from = { x: 0, y: 0.9, z: -0.3 }, to = { x: 0.1, y: 0.9, z: 0.3 };
  assert.deepEqual(switchSpot(from, to, 0, 0.12), from);
  assert.deepEqual(switchSpot(from, to, 1, 0.12), to);
  const mid = switchSpot(from, to, 0.5, 0.12);
  assert.ok(near(mid.x, 0.05) && near(mid.z, 0) && near(mid.y, 0.12));
  assert.ok(switchSpot(from, to, 0.25, 0.12).y < 0.9 && switchSpot(from, to, 0.25, 0.12).y > 0.12);
});

test('whenever the ball changes hands or leaves them it is drawn there over a tenth of a second, and never jumps', () => {
  const held = { x: 1, y: 2, z: 0 }, ruled = { x: 2, y: 3, z: 0 };
  assert.deepEqual(ballSpot(held, ruled, 0), held);
  assert.deepEqual(ballSpot(held, ruled, 0.05), { x: 1.5, y: 2.5, z: 0 });
  assert.deepEqual(ballSpot(held, ruled, BALL_IN_HAND.blend), ruled);
  assert.deepEqual(ballSpot(held, ruled, 5), ruled);
  assert.deepEqual(ballSpot(null, ruled, 0), ruled);                       // the first frame: nothing to blend from
});

test('the dribble is carried in one hand, everything else in both', () => {
  assert.deepEqual(['dribble', 'dribbleLeft', 'hold', 'holdLeft', 'shoot', 'catch'].map(ballHands), ['right', 'left', 'both', 'both', 'both', 'both']);
});

// ---- rulings after Task 10 ----

test('on its way back up a dribbled ball rises as it fell, and is never under the floor', () => {
  const d = { push: 0.25, bounces: 1 }, height = phase => dribbleHeight(phase, d, 1, 0.12);
  assert.ok(near(height(0.6), height(0.35)) && height(0.6) > 0.12);
  assert.ok(Array.from({ length: 1000 }, (_, i) => height(i / 1000)).every(y => y >= 0.12 - 1e-9));
});

test('the ball is drawn across again when the way it is carried changes, but crosses between the two dribbling hands', () => {
  assert.equal(carrying(null, null), null);                                // nobody has it
  assert.equal(carrying(2, 'right'), carrying(2, 'left'));                 // a change of dribbling hand is a crossing, not a blend
  assert.notEqual(carrying(2, 'right'), carrying(2, 'both'));              // dribble to shot, to a pick-up; catch to dribble
  assert.notEqual(carrying(2, 'both'), carrying(3, 'both'));               // another holder
  assert.notEqual(carrying(2, 'both'), carrying(2, null));                 // held, then the final screen
});

test('a ball the rules put with an inbounder or a free-throw shooter is drawn there at once; any other change of holder is drawn across', () => {
  const drawn = { x: 9, y: 1, z: 0 };
  const placed = (before, after) => blendFrom(drawn, before, after) === null;
  assert.ok(placed({ holder: null, phase: 'dead' }, { holder: 2, phase: 'inbound' }));            // an inbound set up
  assert.ok(placed({ holder: 1, phase: 'quarterEnd' }, { holder: 4, phase: 'inbound' }));         // a period begun
  assert.ok(placed({ holder: 4, phase: 'dead' }, { holder: 0, phase: 'freeThrow' }));             // a free throw set up
  assert.ok(placed({ holder: null, phase: 'freeThrow' }, { holder: 0, phase: 'freeThrow' }));     // handed back for the second
  assert.ok(!placed({ holder: null, phase: 'inbound' }, { holder: 3, phase: 'live' }));           // the inbound pass caught
  assert.ok(!placed({ holder: null, phase: 'freeThrow' }, { holder: 4, phase: 'live' }));         // a missed last free throw rebounded
  assert.ok(!placed({ holder: null, phase: 'live' }, { holder: 3, phase: 'quarterEnd' }));        // picked up as the period ends
  assert.ok(!placed({ holder: 2, phase: 'inbound' }, { holder: null, phase: 'inbound' }));        // the inbound pass thrown
  assert.ok(!placed({ holder: 0, phase: 'freeThrow' }, { holder: null, phase: 'freeThrow' }));    // a free throw let go
  assert.ok(!placed({ holder: 2, phase: 'inbound' }, { holder: 2, phase: 'inbound' }));           // he already had it: nothing came to him
  assert.deepEqual(blendFrom(drawn, { holder: 2, phase: 'live' }, { holder: 5, phase: 'live' }), drawn);      // a steal, however far
  assert.deepEqual(blendFrom(drawn, { holder: 1, phase: 'live' }, { holder: 1, phase: 'dead' }), drawn);      // the whistle: he keeps it
  const from = blendFrom(drawn, { holder: null, phase: 'live' }, { holder: 3, phase: 'live' });
  drawn.x = 0;
  assert.equal(from.x, 9);                                                 // a copy: the drawn ball goes on moving
  assert.equal('reach' in BALL_IN_HAND, false);                            // distance decides nothing
});

test('a change of dribbling hand crosses from where the ball was drawn, not from the hand it left', () => {
  const low = { x: 0.2, y: 0.3, z: 0.1 }, other = { x: 1, y: 1, z: 1 };
  let cross = crossFrom(null, 2, 'left', 0, low);
  low.y = 0.9;
  assert.deepEqual(cross.from, { x: 0.2, y: 0.3, z: 0.1 });                // the frame of the change: where it was drawn, copied
  cross = crossFrom(cross, 2, 'left', 0.25, other);
  assert.deepEqual(cross.from, { x: 0.2, y: 0.3, z: 0.1 });                // kept while it crosses
  assert.deepEqual(crossFrom(cross, 2, 'right', 0.3, other).from, other);  // the other hand: another crossing
  assert.deepEqual(crossFrom(cross, 3, 'left', 0.3, other).from, other);   // another player
  assert.deepEqual(crossFrom(cross, 2, 'left', 0.1, other).from, other);   // a new crossing to the same hand
});

// ---- review of Task 10 ----

test('a crossing ends where the dribble goes on, wherever the new hand is in its bounce', () => {
  const d = { push: 0.25, bounces: 3 }, palm = { x: 0.3, y: 0.9, z: 0.2 }, cross = { from: { x: -0.3, y: 0.4, z: 0.1 } };
  const same = (a, b) => near(a.x, b.x) && near(a.y, b.y) && near(a.z, b.z);
  for (const phase of [0, 0.1, 0.27, 0.33, 0.4, 0.5, 0.62, 0.71, 0.9, 0.99]) {
    const dribbled = dribbleSpot(palm, phase, d, 0.12);
    assert.deepEqual(dribbled, { x: 0.3, y: dribbleHeight(phase, d, 0.9, 0.12), z: 0.2 });   // no crossing: the dribble
    assert.ok(same(dribbleSpot(palm, phase, d, 0.12, cross, 0), cross.from));               // it sets off where it was
    assert.ok(same(dribbleSpot(palm, phase, d, 0.12, cross, 1), dribbled), `phase ${phase}`); // and ends in the dribble
    assert.ok(near(dribbleSpot(palm, phase, d, 0.12, cross, 0.5).y, 0.12));                  // with one bounce midway
  }
});

test('a player whose model lacks a hand bone cannot be drawn: the game falls back to capsules', () => {
  assert.doesNotThrow(() => checkHands('player-0-4', { left: {}, right: {} }));
  assert.throws(() => checkHands('player-0-4', { left: {}, right: undefined }), /player-0-4 has no mixamorigRightHand/);
  assert.throws(() => checkHands('player-1-7', { left: undefined, right: {} }), /player-1-7 has no mixamorigLeftHand/);
});

// ---- the dribble moves: the ball goes across on its own, by the floor ----

test('in a dribble move the ball leaves one hand, bounces once on the floor and comes up into the other', () => {
  const from = { x: -0.4, y: 0.6, z: 0.1 }, to = { x: 0.4, y: 0.7, z: 0.1 }, body = { x: 0, z: 0, heading: Math.PI / 2 };   // he faces +z
  const spot = share => moveSpot('cross', share, from, to, body, 0.12);
  for (const share of [0, MOVE_BALL.leave]) assert.deepEqual(spot(share), from);          // still in the hand it starts in
  for (const share of [MOVE_BALL.arrive, 1]) assert.deepEqual(spot(share), to);           // in the other well before the move ends
  const floor = spot(0.5);
  assert.ok(near(floor.y, 0.12) && near(floor.x, 0) && near(floor.z, MOVE_BALL.ahead.cross), JSON.stringify(floor));
  const heights = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map(share => spot(share).y);
  assert.ok(heights[0] > heights[1] && heights[1] > heights[2] && heights[2] > heights[3], 'it goes down to the floor');
  assert.ok(heights[3] < heights[4] && heights[4] < heights[5] && heights[5] < heights[6], 'and comes up from it');
  assert.ok(heights.every(y => y >= 0.12 - 1e-9), 'never under the floor');
});

test('a crossover bounces in front of him, between the legs under him, behind the back behind him, whichever way he faces', () => {
  const from = { x: 0, y: 0.6, z: 0 }, to = { x: 0, y: 0.6, z: 0 };
  for (const heading of [0, 1, -2.5]) {
    const body = { x: 3, z: -2, heading }, ahead = kind => {
      const floor = moveSpot(kind, 0.5, from, to, body, 0.12);
      return (floor.x - body.x) * Math.cos(heading) + (floor.z - body.z) * Math.sin(heading);
    };
    assert.ok(ahead('cross') > 0.3, `a crossover ${ahead('cross')} m ahead`);
    assert.ok(ahead('legs') > 0 && ahead('legs') < 0.25, `between the legs ${ahead('legs')} m ahead`);
    assert.ok(ahead('back') < -0.2, `behind the back ${ahead('back')} m ahead`);
  }
});

test('a dribble move carries the ball its own way, so the ball is drawn across to it and back from it', () => {
  assert.deepEqual(['crossover', 'crossoverLeft', 'betweenLegs', 'betweenLegsLeft', 'behindBack', 'behindBackLeft', 'stepBack'].map(ballHands),
    ['move', 'move', 'move', 'move', 'move', 'move', 'both']);
  assert.equal(carrying(2, 'move'), '2 move');
  assert.notEqual(carrying(2, 'move'), carrying(2, 'right'));
  assert.notEqual(carrying(2, 'move'), carrying(2, 'both'));
});
