// The three referees: they keep up with play from outside the lines, and one of them signals every call.
import { createFigure, pose } from './figure.js';
import { refSpots, leadSideOf, createRef, stepRef, refGait, signFor, armsFor, REFS } from './life.js';
import { attackSign } from '../sim/state.js';

const LOOK = Object.freeze({ shirt: '#9aa0a6', trousers: '#15171c', skin: '#c99a6b', hair: '#1a1410', shoes: '#0c0d10' });
const SKINS = ['#e8c39e', '#8a5a3a', '#c99a6b'];
const ORDERS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

// Adds them to `scene`. Returns { live(state, dt) }: moves them on by dt seconds.
export function createRefs(scene) {
  const refs = SKINS.map((skin, i) => {
    const figure = createFigure({ ...LOOK, skin });
    scene.add(figure.mesh);
    return { ...figure, at: createRef((i - 1) * 4, i === 1 ? 8.05 : -8.05) };
  });
  // order: which referee takes each of the three places (lead, trail, centre). It is set again when play turns round,
  // so that whoever is nearest each place takes it: the trail runs to the baseline and becomes the lead, as a crew does.
  // sign: the sign being made: its name, the seconds it has run, who makes it and which way he points.
  let order = [0, 1, 2], way = 0, side = 1, sign = null, lastCall = null, lastScore = [0, 0];

  return {
    live(state, dt) {
      const { ball } = state, dir = state.phase === 'jumpBall' ? 0 : attackSign(state.possession);
      side = leadSideOf(side, ball);
      const spots = refSpots(state, side);
      if (dir !== way) {
        const run = o => o.reduce((sum, ref, place) => sum + Math.hypot(refs[ref].at.x - spots[place].x, refs[ref].at.z - spots[place].z), 0);
        order = ORDERS.reduce((a, b) => (run(b) < run(a) ? b : a));
        way = dir;
      }
      // A new call: the referee nearest the ball signals it. A three that goes in: the lead referee's arms go up.
      const three = [0, 1].some(team => state.score[team] - lastScore[team] === 3);
      lastScore = [...state.score];
      if (state.call !== lastCall && signFor(state.call)) {
        const by = refs.reduce((a, b) => (Math.hypot(b.at.x - ball.x, b.at.z - ball.z) < Math.hypot(a.at.x - ball.x, a.at.z - ball.z) ? b : a));
        // Which way the ball now goes, as he sees it: to his right or his left.
        sign = { name: signFor(state.call), t: 0, by, toward: -Math.cos(by.at.facing) * attackSign(state.call.ball) >= 0 ? 1 : -1 };
      } else if (three && !sign) sign = { name: 'madeThree', t: REFS.long - 1.2, by: refs[order[0]], toward: 1 };
      lastCall = state.call;
      if (sign && (sign.t += dt) > REFS.long) sign = null;

      order.forEach((index, place) => {
        const ref = refs[index], signalling = sign?.by === ref;
        stepRef(ref.at, spots[place], ball, dt, signalling);
        const gait = refGait(ref.at);
        ref.mesh.position.set(ref.at.x, -gait.dip, ref.at.z);
        ref.mesh.rotation.y = ref.at.facing;
        const arms = signalling ? armsFor(sign.name, sign.t, sign.toward)
          : { right: { lift: -gait.arm, bend: gait.bend }, left: { lift: gait.arm, bend: gait.bend } };   // each arm swings with the other leg
        pose(ref.bones, { ...arms, legR: gait.legR, legL: gait.legL, lean: gait.lean });
      });
    },
  };
}
