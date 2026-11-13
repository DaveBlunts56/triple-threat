import * as THREE from 'three';
import { BALL, PLAYER } from '../sim/tuning.js';
import { TEAM_COLOURS } from './kit.js';
import { ballSpot, blendFrom, carrying } from './motion.js';

const HEIGHT = 1.95, HEAD = 0.13;
// above: metres between the top of a capsule and the middle of its number.
// height: how high above the floor the number floats over a generated player.
const LABEL = Object.freeze({ above: 0.35, height: 2.3 });

// Placeholder player: a capsule body, a head, and a nose showing which way they face.
function buildPlayer(team) {
  const material = new THREE.MeshStandardMaterial({ color: TEAM_COLOURS[team], roughness: 0.6 });
  const bodyHeight = HEIGHT - 2 * HEAD;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(PLAYER.radius, bodyHeight - 2 * PLAYER.radius, 4, 12), material);
  body.position.y = bodyHeight / 2;
  const skin = new THREE.MeshStandardMaterial({ color: 0xe9c9a4, roughness: 0.7 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD, 16, 12), skin);
  head.position.y = HEIGHT - HEAD;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.07), skin);
  nose.position.set(HEAD, HEIGHT - HEAD, 0);   // +x is "forward" for facing = 0

  const group = new THREE.Group();
  group.add(body, head, nose);
  body.castShadow = head.castShadow = true;
  return group;
}

// A jersey number, white on a dark rounded patch. Drawn once per number.
const numberTextures = new Map();
function numberTexture(number) {
  if (!numberTextures.has(number)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const c = canvas.getContext('2d');
    c.fillStyle = 'rgba(10, 12, 18, 0.85)';
    c.beginPath(); c.roundRect(2, 10, 60, 44, 10); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 34px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(number), 32, 33);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    numberTextures.set(number, texture);
  }
  return numberTextures.get(number);
}

// The six players, the ball and the ring under the player you control.
// `people` are the generated, animated players (see people.js); without them the capsules stand in.
export function createActors(scene, people = null) {
  const players = people ? people.models : [0, 0, 0, 1, 1, 1].map(buildPlayer);
  // The number floats above each head and always faces the camera, so you can see who is on the floor.
  const labels = players.map(group => {
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    label.position.y = people ? LABEL.height : HEIGHT + LABEL.above;
    label.scale.set(0.6, 0.6, 1);
    group.add(label);
    return label;
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius, 24, 16), new THREE.MeshStandardMaterial({ color: 0xe8792b, roughness: 0.8 }));
  ball.castShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
  ring.rotation.x = -Math.PI / 2;
  scene.add(...players, ball, ring);
  // For drawing the ball across when its holder changes, or the way he carries it: who carried it and how on the last
  // frame (undefined before the first; see carrying), its holder and the phase then, where it was drawn when the way
  // it is carried last changed, and the seconds since.
  let carried, seen, last = null, since = 0;

  return {
    // dt: the match time that passed this frame, which drives the players' motion.
    sync(state, dt = 0) {
      if (people) people.update(state, dt);
      state.players.forEach((p, i) => {
        if (!people) {
          players[i].position.set(p.x, p.y, p.z);
          players[i].rotation.y = -p.facing;   // facing is measured from +x toward +z; three.js turns the other way
        }
        const { number } = state.rosters[p.team][p.person];
        if (labels[i].userData.number !== number) {   // a substitution: a different player now wears this capsule
          labels[i].userData.number = number;
          labels[i].material.map = numberTexture(number);
          labels[i].material.needsUpdate = true;
        }
      });
      if (people) {
        // In its holder's hands, not at his hip where the rules keep it; drawn across over a moment whenever it
        // comes to a player, leaves one, goes from one to another or from one hand to both, so it never jumps. A ball
        // the rules hand over as the phase changes is put there at once.
        const now = people.heldBall(state, ball.position) ?? state.ball, how = carrying(state.ball.holder, people.hands(state));
        const before = seen;
        seen = { holder: state.ball.holder, phase: state.phase };
        if (how !== carried) [last, since] = [carried === undefined ? null : blendFrom(ball.position, before, seen), 0];
        else since += dt;
        carried = how;
        ball.position.copy(ballSpot(last, now, since));
      } else ball.position.set(state.ball.x, state.ball.y, state.ball.z);
      const me = state.players[state.controlled];
      ring.position.set(me.x, 0.02, me.z);
    },
  };
}
