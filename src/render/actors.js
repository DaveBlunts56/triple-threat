import * as THREE from 'three';
import { BALL, PLAYER } from '../sim/tuning.js';
import { TEAM_COLOURS } from './kit.js';
import { sideId } from './checks.js';
import { ballSpot, blendFrom, carrying } from './hands.js';
import { matchupMark, MARK } from './mark.js';

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
  group.userData.kit = material;
  group.add(body, head, nose);
  body.castShadow = head.castShadow = true;
  return group;
}

// The ball's leather: its colour with the black seams, and the pebbles as bumps. Both are painted once, here.
function paintBall() {
  const colour = document.createElement('canvas'), bumps = document.createElement('canvas');
  colour.width = bumps.width = 512; colour.height = bumps.height = 256;
  const g = colour.getContext('2d'), b = bumps.getContext('2d');
  g.fillStyle = '#d9692a'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#1a1210'; g.lineWidth = 5; g.lineCap = 'round';
  const line = points => { g.beginPath(); points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  line([[0, 128], [512, 128]]);                                             // round the middle
  for (const x of [0, 256, 512]) line([[x, 0], [x, 256]]);                  // over the top and under, front and back
  for (const side of [-1, 1]) line(Array.from({ length: 65 }, (_, i) => [i * 8, 128 + side * (62 + 34 * Math.cos(i * Math.PI / 16))]));   // the two curved seams
  // Pebbles: a grey field of lighter dots. Not random: the same ball every time.
  b.fillStyle = '#707070'; b.fillRect(0, 0, 512, 256);
  b.fillStyle = '#b8b8b8';
  for (let y = 0; y < 256; y += 4) for (let x = (y / 4) % 2 * 2; x < 512; x += 4) { b.beginPath(); b.arc(x, y, 1.2, 0, 2 * Math.PI); b.fill(); }
  const map = new THREE.CanvasTexture(colour), bumpMap = new THREE.CanvasTexture(bumps);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return { map, bumpMap, bumpScale: 0.6 };
}

// The arrow that points your player at his man: a shaft one metre long, stretched to the length wanted, and a head,
// both lying flat and pointing along +x from the group's own place. Returns { group, aim(arrow) }.
function buildArrow(material) {
  const flat = new THREE.PlaneGeometry(1, MARK.wide);
  flat.rotateX(-Math.PI / 2); flat.translate(0.5, 0, 0);
  const shaft = new THREE.Mesh(flat, material);
  const tip = new THREE.BufferGeometry();
  tip.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, MARK.head / 2, MARK.head, 0, 0, 0, 0, -MARK.head / 2], 3));
  const head = new THREE.Mesh(tip, material);
  const group = new THREE.Group();
  group.add(shaft, head);
  return {
    group,
    aim({ x, z, angle, length }) {
      group.position.set(x, 0.022, z);
      group.rotation.y = -angle;   // as a player's facing: measured from +x toward +z, and three.js turns the other way
      shaft.scale.x = Math.max(length - MARK.head, 0.01);
      head.position.x = Math.max(length - MARK.head, 0);
    },
  };
}

// The players (up to ten: as many are shown as the match has), the ball, the ring under the player you control, and
// the ring and arrow that show him his man.
// `people` are the generated, animated players (see people.js); without them the capsules stand in.
export function createActors(scene, people = null) {
  const players = people ? people.models : Array.from({ length: 10 }, () => buildPlayer(0));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius, 32, 24), new THREE.MeshStandardMaterial({ ...paintBall(), roughness: 0.78 }));
  ball.castShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
  ring.rotation.x = -Math.PI / 2;
  const red = new THREE.MeshBasicMaterial({ color: MARK.colour, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const manRing = new THREE.Mesh(ring.geometry, red);
  manRing.rotation.x = -Math.PI / 2;
  const arrow = buildArrow(red);
  scene.add(...players, ball, ring, manRing, arrow.group);
  // For drawing the ball across when its holder changes, or the way he carries it: who carried it and how on the last
  // frame (undefined before the first; see carrying), its holder and the phase then, where it was drawn when the way
  // it is carried last changed, and the seconds since.
  let carried, seen, last = null, since = 0;

  return {
    // Forgets what the last frame looked like: the next is drawn as a first one, so that a jump in time (into a
    // replay, or back out of one) is not read as catches, releases and landings, and the ball is not drawn across.
    cut() { carried = undefined; seen = undefined; last = null; since = 0; people?.cut(); },
    // dt: the match time that passed this frame, which drives the players' motion. show: who the broadcast has
    // celebrating and dejected (see people.update).
    sync(state, dt = 0, show = null) {
      if (people) people.update(state, dt, show);
      players.forEach((group, i) => { group.visible = i < state.players.length; });
      state.players.forEach((p, i) => {
        if (!people) {
          players[i].userData.kit.color.setHex(TEAM_COLOURS[sideId(state, p.team)]);   // a place holds either team's player, by the match's size
          players[i].position.set(p.x, p.y, p.z);
          players[i].rotation.y = -p.facing;   // facing is measured from +x toward +z; three.js turns the other way
        }
      });
      if (people) {
        // In its holder's hands, not at his hip where the rules keep it; drawn across over a moment whenever it
        // comes to a player, leaves one, goes from one to another or from one hand to both, so it never jumps. A ball
        // the rules put with an inbounder or a free-throw shooter is put there at once.
        const now = people.heldBall(state, ball.position) ?? state.ball, how = carrying(state.ball.holder, people.hands(state));
        const before = seen;
        seen = { holder: state.ball.holder, phase: state.phase };
        // On the frame it changes the blend is already dt under way, so the ball never stands still for a frame.
        if (how !== carried) [last, since] = [carried === undefined ? null : blendFrom(ball.position, before, seen), dt];
        else since += dt;
        carried = how;
        ball.position.copy(ballSpot(last, now, since));
      } else ball.position.set(state.ball.x, state.ball.y, state.ball.z);
      const me = state.players[state.controlled];
      ring.position.set(me.x, 0.02, me.z);
      ring.visible = (state.humans ?? [0]).includes(0);   // the ring under the player you control: none in Watch
      const mark = matchupMark(state);
      manRing.visible = mark !== null;
      arrow.group.visible = !!mark?.arrow;
      if (mark) manRing.position.set(mark.ring.x, 0.021, mark.ring.z);
      if (mark?.arrow) arrow.aim(mark.arrow);
    },
  };
}
