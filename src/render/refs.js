// The three referees: they keep up with play from outside the lines, and one of them signals every call.
import { createFigure, pose } from './figure.js';
import { refSpots, signFor, armsFor, REFS } from './life.js';
import { attackSign } from '../sim/state.js';

const LOOK = Object.freeze({ shirt: '#9aa0a6', trousers: '#15171c', skin: '#c99a6b', hair: '#1a1410', shoes: '#0c0d10' });
const SKINS = ['#e8c39e', '#8a5a3a', '#c99a6b'];

// Adds them to `scene`. Returns { live(state, dt) }: moves them on by dt seconds of match time.
export function createRefs(scene) {
  const refs = SKINS.map((skin, i) => {
    const figure = createFigure({ ...LOOK, skin });
    figure.mesh.position.set((i - 1) * 3, 0, i === 1 ? 8.4 : -8.4);
    scene.add(figure.mesh);
    return { ...figure, stride: 0 };
  });
  // The sign being made: its name, the seconds it has run, who makes it and which way he points.
  let sign = null, lastCall = null, lastScore = [0, 0];

  return {
    live(state, dt) {
      const spots = refSpots(state), { ball } = state;
      // A new call: the referee nearest the ball signals it. A three that goes in: the lead referee's arms go up.
      const three = [0, 1].some(team => state.score[team] - lastScore[team] === 3);
      lastScore = [...state.score];
      if (state.call !== lastCall && signFor(state.call)) {
        const by = refs.reduce((a, b) => (Math.hypot(b.mesh.position.x - ball.x, b.mesh.position.z - ball.z) < Math.hypot(a.mesh.position.x - ball.x, a.mesh.position.z - ball.z) ? b : a));
        // Which way the ball now goes, as he sees it: to his right or his left.
        const facing = by.mesh.rotation.y;
        sign = { name: signFor(state.call), t: 0, by, toward: -Math.cos(facing) * attackSign(state.call.ball) >= 0 ? 1 : -1 };
      } else if (three && !sign) sign = { name: 'madeThree', t: REFS.long - 1.2, by: refs[0], toward: 1 };
      lastCall = state.call;
      if (sign && (sign.t += dt) > REFS.long) sign = null;

      refs.forEach((ref, i) => {
        const at = ref.mesh.position, dx = spots[i].x - at.x, dz = spots[i].z - at.z, far = Math.hypot(dx, dz);
        const signalling = sign?.by === ref;
        const move = signalling || far < 0.15 ? 0 : Math.min(far, REFS.speed * dt);   // he stands to make his sign
        if (move) { at.x += (dx / far) * move; at.z += (dz / far) * move; ref.stride += move * 2.4; }
        ref.mesh.rotation.y = Math.atan2(ball.x - at.x, ball.z - at.z);   // he watches the ball
        const swing = move ? Math.sin(ref.stride) * 0.55 : 0;
        const arms = signalling ? armsFor(sign.name, sign.t, sign.toward) : { right: { lift: -swing * 0.7, bend: 0.3 }, left: { lift: swing * 0.7, bend: 0.3 } };
        pose(ref.bones, { ...arms, legR: { swing, knee: Math.max(0, -swing) * 1.2 }, legL: { swing: -swing, knee: Math.max(0, swing) * 1.2 } });
      });
    },
  };
}
