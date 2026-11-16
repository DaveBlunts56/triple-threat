// Checks of the players' and the motions' files at load, and who is who among the people. No Three.js here.
import { TEAMS } from '../sim/teams.js';
import { LEG_CLIPS, ARM_CLIPS, GAITS, STRIDES } from './motion.js';

// Throws unless `facts` (assets/motion.json) gives every gait and every guarding step a speed: without one a moving
// player cannot be drawn.
export function checkGaits(facts) {
  for (const gait of [...GAITS.slice(1), 'strafeLeft', 'strafeRight', 'backpedal']) {
    if (!(facts?.gaits?.[gait] > 0)) throw new Error(`assets/motion.json has no speed for "${gait}"`);
  }
}

// Throws, naming it, for the first motion of the two tables that is not among `names`, the motions in assets/motion.glb.
export function checkMotions(names) {
  const missing = [...LEG_CLIPS, ...ARM_CLIPS].find(name => !names.includes(name));
  if (missing) throw new Error(`assets/motion.glb has no "${missing}" motion`);
}

// Throws unless `facts` (assets/motion.json) says what is read from it on every frame: how long each motion of the
// two tables lasts, where in the dribble the ball leaves the hand and how often, and where in a run and a sprint each
// foot lands.
export function checkFacts(facts) {
  const clips = facts?.clips ?? {};
  for (const name of [...LEG_CLIPS, ...ARM_CLIPS]) {
    if (!(clips[name]?.duration > 0)) throw new Error(`assets/motion.json has no length for "${name}"`);
  }
  const { push, bounces } = clips.dribble;
  if (!(push >= 0 && push <= 1 && bounces > 0)) throw new Error('assets/motion.json does not say where the dribble pushes the ball down, or how often');
  for (const gait of STRIDES) {
    const { left, right } = clips[gait].strike ?? {};
    if (!(left >= 0 && right >= 0)) throw new Error(`assets/motion.json does not say where each foot lands in "${gait}"`);
  }
}

// Throws unless the model of person `name` has both hand bones, `hands` being { left, right } as found in it: the ball
// is drawn in them.
export function checkHands(name, hands) {
  for (const side of ['Left', 'Right']) {
    if (!hands[side.toLowerCase()]) throw new Error(`assets/players.glb: ${name} has no mixamorig${side}Hand`);
  }
}

// The name of a person's model in assets/players.glb.
export const personName = (team, number) => `player-${team}-${number}`;

// The model name for each court player, in `state.players` order: by his team's id (state.ids), not its side.
export const courtPeople = state => state.players.map(p => personName(sideId(state, p.team), state.rosters[p.team][p.person].number));
// The id of the team on side `side` of the match (0 or 1).
export const sideId = (state, side) => state.ids?.[side] ?? side;

// Whether a track of a motion is kept at load: every turn of a bone, and where the hips are. The other bones' positions
// and every scale never change, and would stamp the bone lengths of the player the motions were made on onto everyone.
export const keepTrack = name => name.endsWith('.quaternion') || name === 'mixamorigHips.position';

// The gait speeds of a player `scale` times the size of the one they were measured on: longer legs cover more ground.
export function sized(gaits, scale) {
  return Object.fromEntries(Object.entries(gaits).map(([gait, speed]) => [gait, Math.round(speed * scale * 1000) / 1000]));
}

// Every person on a roster who has no model among `names`.
export function missingPeople(names) {
  return TEAMS.flatMap((team, id) => team.players.map(p => personName(id, p.number))).filter(name => !names.includes(name));
}
