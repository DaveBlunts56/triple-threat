import * as THREE from 'three';
import { BALL, PLAYER } from '../sim/tuning.js';

const TEAM_COLOURS = [0x2f6fe0, 0xd83a3a];
const HEIGHT = 1.95, HEAD = 0.13;

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

// Meshes for the six players, the ball and the ring under the player you control.
export function createActors(scene) {
  const players = [0, 0, 0, 1, 1, 1].map(buildPlayer);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius, 24, 16), new THREE.MeshStandardMaterial({ color: 0xe8792b, roughness: 0.8 }));
  ball.castShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
  ring.rotation.x = -Math.PI / 2;
  scene.add(...players, ball, ring);

  return {
    sync(state) {
      state.players.forEach((p, i) => {
        players[i].position.set(p.x, p.y, p.z);
        players[i].rotation.y = -p.facing;   // facing is measured from +x toward +z; three.js turns the other way
      });
      ball.position.set(state.ball.x, state.ball.y, state.ball.z);
      const me = state.players[state.controlled];
      ring.position.set(me.x, 0.02, me.z);
    },
  };
}
