// The fans in the stands and courtside, drawn as one batch and moved on the graphics card: each fan's seat, build,
// colours and way of cheering are fixed (crowd.js), and a few numbers a frame (the crowd's mood and the time) make
// them stand, clap, jump, wave their towels, fingers and signs, boo, groan and sit back down, so that a reaction
// costs the main thread nothing per fan. On Low each fan is the simplest body, with no hair styles and nothing in
// their hands.
import * as THREE from 'three';
import { attribute, uniform, uniformArray, vec2, vec3, int, sin, cos, abs, mix, step, smoothstep, max, floor, mod, exp2,
  positionGeometry, uv, varying, texture } from 'three/tsl';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, SIGNS, WHITE, STYLE, createMood, stepMood } from './crowd.js';
import { KIT } from './kit.js';

const f = Object.freeze;

// A seated fan, facing +z with the seat at the origin (a seat's height is the top of its step): the hip the body
// rises with, the knee the thighs turn about when they stand (their feet stay on the step in front), the left
// shoulder (the right is across, at -x) and the height of the elbows. simple: the levels that draw the simplest body.
export const RIG = f({ hip: f([0, 0.1, 0]), knee: f([0, 0.08, 0.45]), shoulder: f([0.21, 0.64, 0]), elbow: 0.34, simple: f(['low']) });
// What each piece moves with, and what it is painted in.
const JOINT = f({ shin: 0, thigh: 1, body: 2, upperL: 3, foreL: 4, upperR: 5, foreR: 6 });
const PAINT = f({ skin: 0, shirt: 1, pants: 2, hair: 3, upper: 4, fore: 5, prop: 6, sign: 7 });
// Pieces shown only with a kind of hair (a mask of HAIR's kinds), or with a prop (16 + PROP's number).
const SHOW = f({ always: 0, anyHair: 14, long: 4, cap: 8, finger: 17, towel: 18, sign: 19 });

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// A piece of a fan: the geometry with what it moves with, its paint and when it is shown, and with no normals (each
// face is lit flat from its own slope, which suits the pieces and lets their corners be shared).
function piece(geometry, joint, paint, show = SHOW.always) {
  geometry.deleteAttribute('normal');
  if (paint !== PAINT.sign) geometry.getAttribute('uv').array.fill(0);   // only the sign's picture needs them
  const n = geometry.getAttribute('position').count, rig = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) rig.set([joint, paint, show, 0], i * 4);
  geometry.setAttribute('fanRig', new THREE.BufferAttribute(rig, 4));
  return geometry;
}

// The full fan: legs, hips and a body narrower at the waist, a head with three kinds of hair (high at the brow), arms
// that bend at the elbow, and what they hold in their right hand. The props are made as they hang from a lowered arm:
// raised overhead, they stand up from the hand, and the sign turns to face the court.
function fullBody() {
  const parts = [];
  for (const s of [1, -1]) {
    const [upper, fore] = s > 0 ? [JOINT.upperL, JOINT.foreL] : [JOINT.upperR, JOINT.foreR];
    parts.push(piece(box(0.12, 0.5, 0.13, s * 0.1, -0.17, 0.47), JOINT.shin, PAINT.pants));
    parts.push(piece(box(0.15, 0.15, 0.5, s * 0.1, 0.09, 0.22), JOINT.thigh, PAINT.pants));
    parts.push(piece(box(0.1, 0.32, 0.11, s * 0.21, 0.5, 0), upper, PAINT.upper));
    parts.push(piece(box(0.085, 0.27, 0.09, s * 0.21, 0.205, 0), fore, PAINT.fore));
    parts.push(piece(box(0.08, 0.1, 0.05, s * 0.21, 0.02, 0), fore, PAINT.skin));
  }
  parts.push(piece(box(0.34, 0.15, 0.25, 0, 0.1, -0.01), JOINT.body, PAINT.pants));
  const torso = box(0.4, 0.5, 0.22, 0, 0.42, -0.02), p = torso.getAttribute('position');
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.42) p.setX(i, p.getX(i) * 0.85);   // narrower at the waist
  parts.push(piece(torso, JOINT.body, PAINT.shirt));
  parts.push(piece(new THREE.SphereGeometry(0.105, 7, 5).scale(1, 1.12, 1).translate(0, 0.79, 0), JOINT.body, PAINT.skin));
  parts.push(piece(new THREE.SphereGeometry(0.117, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-0.45).translate(0, 0.8, -0.01), JOINT.body, PAINT.hair, SHOW.anyHair));
  parts.push(piece(box(0.21, 0.24, 0.07, 0, 0.72, -0.085), JOINT.body, PAINT.hair, SHOW.long));
  parts.push(piece(box(0.17, 0.02, 0.12, 0, 0.825, 0.115), JOINT.body, PAINT.hair, SHOW.cap));
  // In the right hand (at x -0.21): a foam finger, a towel, a sign.
  parts.push(piece(box(0.15, 0.2, 0.08, -0.21, -0.1, 0), JOINT.foreR, PAINT.prop, SHOW.finger));
  parts.push(piece(box(0.055, 0.22, 0.055, -0.18, -0.31, 0), JOINT.foreR, PAINT.prop, SHOW.finger));
  parts.push(piece(box(0.3, 0.42, 0.015, -0.33, -0.24, 0), JOINT.foreR, PAINT.prop, SHOW.towel));
  parts.push(piece(new THREE.PlaneGeometry(0.72, 0.46).rotateX(Math.PI).translate(0, -0.24, 0), JOINT.foreR, PAINT.sign, SHOW.sign));
  return mergeVertices(mergeGeometries(parts));
}

// The simplest fan, for Low: a block for the legs, the body, a round head with a cap of hair, and straight arms.
function simpleBody() {
  const parts = [
    piece(box(0.32, 0.5, 0.13, 0, -0.17, 0.47), JOINT.shin, PAINT.pants),
    piece(box(0.34, 0.15, 0.5, 0, 0.09, 0.22), JOINT.thigh, PAINT.pants),
    piece(box(0.4, 0.62, 0.22, 0, 0.36, -0.02), JOINT.body, PAINT.shirt),
    piece(new THREE.SphereGeometry(0.11, 6, 4).scale(1, 1.1, 1).translate(0, 0.79, 0), JOINT.body, PAINT.skin),
    piece(box(0.21, 0.07, 0.21, 0, 0.88, -0.01), JOINT.body, PAINT.hair, SHOW.anyHair),
    piece(box(0.1, 0.62, 0.1, 0.21, 0.35, 0), JOINT.upperL, PAINT.upper),
    piece(box(0.1, 0.62, 0.1, -0.21, 0.35, 0), JOINT.upperR, PAINT.upper),
  ];
  return mergeVertices(mergeGeometries(parts));
}

// The fans' signs: SIGNS's words, two by two on one picture, each in its team's colour.
function signPicture() {
  const c = document.createElement('canvas'), w = 256, h = 164;
  c.width = 2 * w; c.height = 2 * h;
  const g = c.getContext('2d');
  SIGNS.forEach((sign, k) => {
    const x = (k % 2) * w, y = (1 - Math.floor(k / 2)) * h;   // the first row of signs at the bottom of the picture
    g.fillStyle = '#f4f4f2'; g.fillRect(x, y, w, h);
    g.fillStyle = KIT.team[sign.team]; g.fillRect(x + 8, y + 8, w - 16, h - 16);
    g.fillStyle = '#ffffff'; g.font = '900 56px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sign.words, x + w / 2, y + h / 2 + 3, w - 28);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The angles of the arms, [lift, out, bend] (lift swings the arm forward and up from hanging, out swings it away from
// the body, bend folds the forearm forward) for a fan cheering in `style` at time `t` (`ph` sets them apart), left
// and right.
const arms = (lift, out, bend) => vec3(lift, out, bend);
function cheering(style, t, ph) {
  const is = k => step(abs(style.sub(k)), 0.5);
  const clap = arms(1.15, sin(t.mul(15).add(ph)).mul(0.13).sub(0.2), 0.35);
  const up = arms(sin(t.mul(9).add(ph)).mul(0.15).add(2.75), 0.4, 0.25);
  const pump = sin(t.mul(10).add(ph)), low = arms(0.6, 0.15, 1.1);
  const fist = arms(pump.mul(0.35).add(2.45), 0.15, pump.mul(0.5).add(0.9));
  const wave = arms(2.85, sin(t.mul(8).add(ph)).mul(0.55).add(0.2), 0.15);
  const sign = arms(2.95, sin(t.mul(4).add(ph)).mul(0.08).sub(0.12), 0.1);
  const pick = (a, b, c, d, e, g) => a.mul(is(STYLE.clap)).add(b.mul(is(STYLE.armsUp))).add(c.mul(is(STYLE.fistPump)))
    .add(d.mul(is(STYLE.wave))).add(e.mul(is(STYLE.courtside))).add(g.mul(is(STYLE.sign)));
  return { left: pick(clap, up, low, low, clap, sign), right: pick(clap, up, fist, wave, clap, sign) };
}

const rotX = (v, a) => { const c = cos(a), s = sin(a); return vec3(v.x, v.y.mul(c).sub(v.z.mul(s)), v.y.mul(s).add(v.z.mul(c))); };
const rotZ = (v, a) => { const c = cos(a), s = sin(a); return vec3(v.x.mul(c).sub(v.y.mul(s)), v.x.mul(s).add(v.y.mul(c)), v.z); };

// The material that places, poses and paints every fan from their own numbers and the mood's (`mood`: uniforms).
function fanLook(mood, signs) {
  const seat = attribute('fanSeat', 'vec4'), body = attribute('fanBody', 'vec4'), who = attribute('fanMood', 'vec4');
  const paint = attribute('fanPaint', 'vec4'), gear = attribute('fanGear', 'vec4'), rig = attribute('fanRig', 'vec4');
  const is = (v, k) => step(abs(v.sub(k)), 0.5);
  const [side, end, style, seed] = [who.x, who.y, who.z, who.w], t = mood.time, ph = seed.mul(6.2832);
  const look = gear.w, hairStyle = mod(look, 4), prop = mod(floor(look.div(4)), 4), signCell = floor(look.div(16));

  // How stirred this fan is: by their team's fans' mood (a fan of neither side half as much as the home crowd's), or
  // by the waving behind their end. Each stands at their own point of it; a courtside fan never stands, but claps.
  const cheer = mood.home.mul(is(side, 0)).add(mood.away.mul(is(side, 1))).add(mood.home.mul(0.4).mul(is(side, 2)));
  const waving = mood.wave.mul(step(0.5, end.mul(mood.end)));
  const stirred = max(cheer, waving), courtside = is(style, STYLE.courtside), from = seed.mul(0.55).add(0.08);
  const stand = smoothstep(from, from.add(0.35), stirred).mul(courtside.oneMinus());
  const busy = max(stand, stirred.mul(courtside));
  const boo = mood.boo.mul(is(side, 1).oneMinus()).mul(busy.oneMinus()), groan = mood.groan.mul(is(side, 0)).mul(busy.oneMinus());
  // The arms: at rest on the lap, cheering, booing (one arm thrust out and shaken), hands on the head at a groan, and
  // both arms waving at a free-throw shooter.
  const rest = arms(0.3, 0.1, 1.15), how = cheering(style, t, ph);
  const booing = arms(sin(t.mul(14).add(ph)).mul(0.12).add(1.45), -0.05, 0.15), head = arms(2.6, 0.55, 2.3);
  const wave = arms(2.8, sin(t.mul(11).add(ph)).mul(0.45).add(0.35), 0.2), wavers = waving.mul(courtside.oneMinus());
  const posed = cheering => mix(mix(mix(mix(rest, cheering, busy), booing, boo), head, groan), wave, wavers);
  const left = posed(how.left), right = posed(how.right);
  const lean = sin(t.mul(0.6).add(ph)).mul(0.03).add(boo.mul(0.25)).sub(groan.mul(0.12));
  const bounce = stand.mul(is(style, STYLE.armsUp)).mul(abs(sin(t.mul(7).add(ph))).mul(0.14))
    .add(wavers.mul(abs(sin(t.mul(11).add(ph))).mul(0.05)));

  // Each corner of the fan: hidden if it belongs to a kind of hair or a prop this fan has not got; the shins
  // reaching down to the step below; the forearm bent at the elbow and the arm turned at the shoulder; the body
  // leant; the thighs turned up about the knees as the fan stands, the body rising with the hip; then the fan's
  // build, the way they face and their seat.
  const show = rig.z, joint = rig.x;
  const shown = mix(mix(is(show.sub(16), prop), mod(floor(show.div(exp2(hairStyle))), 2), step(show, 15.5)), 1, step(show, 0.5));
  const [hx, hy, hz] = RIG.hip, [, ky, kz] = RIG.knee, hip0 = vec3(hx, hy, hz), knee = vec3(0, ky, kz);
  let p = positionGeometry.mul(shown);
  const stretch = body.z.add(ky).div(0.45 + ky);
  p = vec3(p.x, mix(p.y, p.y.sub(ky).mul(stretch).add(ky), is(joint, JOINT.shin)), p.z);
  const isL = is(joint, JOINT.upperL).add(is(joint, JOINT.foreL)), isArm = isL.add(is(joint, JOINT.upperR)).add(is(joint, JOINT.foreR));
  const fore = is(joint, JOINT.foreL).add(is(joint, JOINT.foreR)), way = isL.mul(2).sub(1);
  const angles = mix(right, left, isL).mul(isArm);
  const shoulder = vec3(way.mul(RIG.shoulder[0]), RIG.shoulder[1], 0), elbow = vec3(way.mul(RIG.shoulder[0]), RIG.elbow, 0);
  p = rotX(p.sub(elbow), angles.z.mul(fore).negate()).add(elbow);
  p = rotX(rotZ(p.sub(shoulder), way.mul(angles.y)), angles.x.negate()).add(shoulder);
  const above = step(1.5, joint);   // the body and the arms
  p = rotX(p.sub(hip0), lean.mul(above)).add(hip0);
  const turn = stand.mul(Math.PI / 2 - Math.atan2(hy - ky, kz - hz));
  p = rotX(p.sub(knee), turn.mul(is(joint, JOINT.thigh))).add(knee);
  const hip = rotX(hip0.sub(knee), turn).add(knee);
  p = p.add(hip.sub(hip0).mul(above));
  p = vec3(p.x, p.y.add(bounce), p.z).mul(vec3(body.x, body.y, body.x));
  const c = cos(seat.w), s = sin(seat.w);
  const position = vec3(p.x.mul(c).add(p.z.mul(s)), p.y, p.z.mul(c).sub(p.x.mul(s))).add(seat.xyz);

  // Each corner's colour, from the fan's own: their skin, shirt, trousers, hair (or cap), sleeves and prop; the sign
  // painted with its words.
  const k = rig.y, palette = uniformArray(PALETTE.map(hex => new THREE.Color(hex)), 'color');
  const index = paint.x.mul(is(k, PAINT.skin)).add(paint.y.mul(is(k, PAINT.shirt))).add(paint.z.mul(is(k, PAINT.pants)))
    .add(paint.w.mul(is(k, PAINT.hair))).add(gear.x.mul(is(k, PAINT.upper))).add(gear.y.mul(is(k, PAINT.fore)))
    .add(gear.z.mul(is(k, PAINT.prop))).add(is(k, PAINT.sign).mul(WHITE));
  const colour = varying(palette.element(int(index.add(0.5))), 'vFanColour');
  const onSign = varying(is(k, PAINT.sign), 'vFanSign'), dim = varying(body.w, 'vFanDim');
  const where = varying(uv().add(vec2(mod(signCell, 2), floor(signCell.div(2)))).mul(0.5), 'vFanSignAt');
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  material.positionNode = position;
  material.colorNode = mix(colour, texture(signs, where).rgb, onSign).mul(dim);
  return material;
}

// The fans, `crowd` (see crowd.js's dressCrowd: the courtside fans first), added to `group`. Returns { seats,
// setQuality(level), live(life, now, count) }: how many fans there are, the body the level draws, and the crowd's mood
// at `now` seconds, with the first `count` fans in their seats.
export function createFans(group, crowd) {
  const n = crowd.length, data = () => new Float32Array(n * 4);
  const columns = { fanSeat: data(), fanBody: data(), fanMood: data(), fanPaint: data(), fanGear: data() };
  crowd.forEach((fan, i) => {
    columns.fanSeat.set([fan.x, fan.y, fan.z, fan.turn], i * 4);
    columns.fanBody.set([fan.width, fan.height, fan.rise, fan.dim], i * 4);
    columns.fanMood.set([fan.side, fan.end, fan.style, fan.seed], i * 4);
    columns.fanPaint.set([fan.skin, fan.shirt, fan.pants, fan.hair], i * 4);
    columns.fanGear.set([fan.upper, fan.fore, fan.propColour, fan.hairStyle + 4 * fan.prop + 16 * fan.sign], i * 4);
  });
  const shared = Object.fromEntries(Object.entries(columns).map(([name, array]) => [name, new THREE.InstancedBufferAttribute(array, 4)]));
  const mood = { time: uniform(0), home: uniform(0), away: uniform(0), boo: uniform(0), groan: uniform(0), wave: uniform(0), end: uniform(0) };
  const material = fanLook(mood, signPicture());
  const batch = geometry => {
    const g = new THREE.InstancedBufferGeometry().copy(geometry);
    for (const [name, attr] of Object.entries(shared)) g.setAttribute(name, attr);
    g.instanceCount = n;
    const mesh = new THREE.Mesh(g, material);
    mesh.frustumCulled = false;   // each fan is placed by the graphics card, far from where the geometry says
    group.add(mesh);
    return mesh;
  };
  const full = batch(fullBody()), simple = batch(simpleBody());
  simple.visible = false;
  const now = createMood();
  let last = null;
  return {
    seats: n,
    setQuality(level) { simple.visible = RIG.simple.includes(level); full.visible = !simple.visible; },
    live(life, time, count) {
      stepMood(now, life, last === null ? 0 : Math.max(0, time - last));
      last = time;
      full.geometry.instanceCount = simple.geometry.instanceCount = Math.min(n, count);
      mood.time.value = time;
      for (const key of ['home', 'away', 'boo', 'groan', 'wave', 'end']) mood[key].value = now[key];
    },
  };
}
