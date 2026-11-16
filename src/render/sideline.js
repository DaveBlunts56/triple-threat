// The people and furniture round the court who never leave their places: the two benches, the commentators and the
// scorer's officials at the table, the courtside chairs (their fans are the crowd's: see fans.js), the photographers
// on the baselines and the camera crews.
// Everything that does not move is one mesh; the cameras turn to follow the ball and the photographers' flashes fire.
import * as THREE from 'three';
import { bakedFigure, bakedBox, bakedMesh, SEATED, KNEELING } from './figure.js';
import { KIT } from './kit.js';

const SKINS = ['#f0cfae', '#d9a877', '#a8744a', '#7a4f31', '#55371f'], HAIRS = ['#1a1410', '#3b2a1e', '#6b4a2a', '#c9a35a', '#8a8a8a', '#101010'];
const TOPS = ['#cfd3d8', '#2a2d33', '#5b6570', '#8c8f96', '#6a5a4a', '#3e4c5e', '#7b2d3a', '#2d5a7b', '#d9c9a3', KIT.team[0], KIT.team[0], KIT.team[1]];
const LEGS = ['#22252c', '#3a4150', '#4a4034', '#1c2a3d', '#55585e'];
const SEAT = Object.freeze({ gap: 0.64, high: 0.45, chair: '#1c2030' });
// Not Math.random: the same people every time. `n` picks from `list` for person `i`, differently for each `salt`.
const pick = (list, i, salt) => list[Math.abs((i * 7919 + salt * 104729 + i * i * 31) % list.length)];
const anyone = (i, extra = {}) => ({ shirt: pick(TOPS, i, 1), trousers: pick(LEGS, i, 2), skin: pick(SKINS, i, 3), hair: pick(HAIRS, i, 4), shoes: '#15161a', ...extra });

// A row of places `gap` apart from `from` to `to`.
const row = (from, to) => Array.from({ length: Math.floor((to - from) / SEAT.gap) + 1 }, (_, i) => from + i * SEAT.gap);

// Where everyone sits: { x, z, facing, look, chair, bench }: the benches (`bench`: in their team's colours) and the
// table on the far side, and the seats at the far side's ends. `ids`: the match's teams, the first on the left bench.
export function sidelinePeople(ids = [0, 1]) {
  const all = [];
  const seat = (x, z, facing, look, chair = SEAT.chair, bench = false) => all.push({ x, z, facing, look: look(all.length), chair, bench });
  const suit = i => anyone(i, { shirt: pick(['#20232b', '#2c3440', '#3a2f2a'], i, 5), trousers: '#1b1d23' });
  for (const [team, way] of [[0, -1], [1, 1]]) {
    const colour = KIT.team[ids[team]], bench = i => anyone(i, { shirt: colour, trousers: colour, shoes: '#e8e8ea' });
    row(4.2, 10.6).forEach((x, i) => seat(way * x, -9.05, 0, i < 2 ? suit : i < 7 ? bench : i2 => anyone(i2, { shirt: '#e9ecef' }), colour, true));
    for (const x of row(11.4, 13.4)) seat(way * x, -9.05, 0, anyone);
  }
  for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) seat(x, -9.85, 0, suit);                      // the table: three commentators and two officials
  return all;
}

// The courtside seats, their fans drawn with the crowd's (see fans.js): { x, y, z, facing }, y the chair's height. They
// run along the near side and behind both baselines.
export function courtsideSeats() {
  const all = [], seat = (x, z, facing) => all.push({ x, y: SEAT.high, z, facing });
  for (const x of row(-13, 13)) seat(x, 9.3, Math.PI);
  for (const side of [1, -1]) for (const z of [...row(-7, -2.6), ...row(2.6, 7)]) seat(side * 15.9, z, -side * Math.PI / 2);
  return all;
}

// The photographers, kneeling on the baselines: { x, z, facing }.
export const photographers = () => [1, -1].flatMap(side => [-6.2, -5, -3.8, 3.8, 5, 6.2].map(z => ({ x: side * 15.05, z, facing: -side * Math.PI / 2 })));
// The camera crews, standing: beside each hoop and at the near corners.
export const cameraCrews = () => [[15.3, -2.3], [-15.3, 2.3], [13.9, 9.0], [-13.9, 9.0]].map(([x, z]) => ({ x, z, facing: Math.atan2(-x, -z) }));

// Adds them to `scene`, the benches in the colours of the teams `ids`. Returns { live(ball, life, now), setTeams(ids) }:
// the cameras follow `ball` and the flashes fire as the crowd's mood (`life`) asks, `now` being the time in seconds;
// and the benches dressed for other teams.
export function createSideline(scene, ids = [0, 1]) {
  const parts = [], ahead = (p, far) => [p.x + Math.sin(p.facing) * far, p.z + Math.cos(p.facing) * far];
  const chair = p => {
    parts.push(bakedBox(p.chair ?? SEAT.chair, 0.46, 0.06, 0.44, p.x, SEAT.high, p.z, p.facing));
    const [bx, bz] = ahead(p, -0.24);
    parts.push(bakedBox(p.chair ?? SEAT.chair, 0.46, 0.5, 0.05, bx, SEAT.high + 0.27, bz, p.facing));
  };
  courtsideSeats().forEach(chair);
  sidelinePeople(ids).filter(p => !p.bench).forEach(p => {
    parts.push(bakedFigure(p.look, SEATED, p.x, 0, p.z, p.facing));
    chair(p);
    if (p.z < -9.5) {   // at the table: a headset, and a screen in front of him
      const [sx, sz] = ahead(p, 0.62);
      parts.push(bakedBox('#101114', 0.25, 0.03, 0.06, p.x, 1.42, p.z, p.facing), bakedBox('#9fd0ff', 0.42, 0.26, 0.04, sx, 0.96, sz, p.facing));
    }
  });
  const snappers = photographers();
  snappers.forEach((p, i) => {
    const [cx, cz] = ahead(p, 0.3);
    parts.push(bakedFigure(anyone(i + 500, { shirt: '#2a2d33' }), KNEELING, p.x, 0, p.z, p.facing), bakedBox('#0d0e11', 0.16, 0.12, 0.26, cx, 1.02, cz, p.facing));
  });
  const crews = cameraCrews();
  crews.forEach((p, i) => {
    const [tx, tz] = ahead(p, 0.45);
    parts.push(bakedFigure(anyone(i + 700, { shirt: '#15171c', trousers: '#15171c' }), { right: { lift: 1.2, bend: 0.9 }, left: { lift: 1.2, bend: 0.9 } }, p.x, 0, p.z, p.facing));
    parts.push(bakedBox('#2b2e35', 0.06, 1.4, 0.06, tx, 0.7, tz));   // the stand
  });
  const people = bakedMesh(parts);
  people.receiveShadow = true;
  scene.add(people);
  // The benches: one mesh of their own, made again for other teams.
  let benches = null, dressedFor = '';
  const setTeams = to => {
    if (to.join() === dressedFor) return;
    dressedFor = to.join();
    if (benches) { scene.remove(benches); benches.geometry.dispose(); benches.material.dispose(); }
    parts.length = 0;
    sidelinePeople(to).filter(p => p.bench).forEach(p => { parts.push(bakedFigure(p.look, SEATED, p.x, 0, p.z, p.facing)); chair(p); });
    benches = bakedMesh(parts);
    benches.receiveShadow = true;
    scene.add(benches);
  };
  setTeams(ids);

  // The cameras on their stands turn to the ball.
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c21, roughness: 0.6 });
  const body = new THREE.BoxGeometry(0.26, 0.24, 0.6).translate(0, 0, 0.1);
  const cameras = crews.map(p => {
    const camera = new THREE.Mesh(body, dark), [tx, tz] = ahead(p, 0.45);
    camera.position.set(tx, 1.5, tz);
    scene.add(camera);
    return camera;
  });
  // The flashes: a bright point at each photographer's camera, shown for a moment.
  const flashes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6.5) }), snappers.length);
  const spot = new THREE.Object3D(), until = snappers.map(() => 0);
  flashes.frustumCulled = false;
  scene.add(flashes);
  let next = 0;
  const show = now => {
    snappers.forEach((p, i) => {
      const [cx, cz] = ahead(p, 0.45);
      spot.position.set(cx, 1.02, cz); spot.scale.setScalar(now < until[i] ? 1 : 0); spot.updateMatrix();
      flashes.setMatrixAt(i, spot.matrix);
    });
    flashes.instanceMatrix.needsUpdate = true;
  };
  show(0);

  return {
    setTeams,
    live(ball, life, now) {
      for (const camera of cameras) camera.rotation.y = Math.atan2(ball.x - camera.position.x, ball.z - camera.position.z);
      const lit = until.some(t => t > now - 0.1);
      if (life.flashes > 0 && now >= next) {
        until[Math.floor(Math.random() * until.length)] = now + 0.07;   // which one fires is of no account to the match
        life.flashes--; next = now + 0.11;
      }
      if (lit || life.flashes > 0) show(now);
    },
  };
}
