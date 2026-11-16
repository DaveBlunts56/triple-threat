// The two styles of game, Arcade and Simulation, and the nine sliders on each. A style is every number the simulation
// reads that a style may change; the rest of tuning.js is the same in both. Arcade's are the game's own numbers, taken
// from tuning.js as they are. Simulation's are its own, written out in full: neither table refers to the other, so
// nothing done to one can reach the other (see the plan, "Independence of the two modes").
//
// A match holds its style, its sliders and the table resolved from them (state.styleTable). Everything reads a styled
// number through `styled(state, key)`.
import { AI, CLOCK, FOUL, PASS, PLAY, PLAYER, STAMINA, STEAL, TIMEOUT } from './tuning.js';

const f = Object.freeze;

// What kind of number each key is: 'chance' (kept within 0 to 1 when a slider scales it), 'positive' (a quantity
// that stays above 0), or 'word' (a choice, never scaled). Ranges ([low, high]) are scaled end by end.
export const KINDS = f({
  'ai.patience': 'positive', 'play.startAt': 'positive', 'ai.contestDelay': 'positive', 'ai.stealRate': 'chance', 'ai.farAway': 'positive',
  'player.accel': 'positive', 'player.brake': 'positive', 'decide.earlyThree': 'positive', 'decide.earlyRoom': 'positive', 'board.boxHold': 'word', 'board.selfWait': 'word', 'board.defence': 'word', 'board.crash': 'positive', 'board.lead': 'word',
  'steal.front': 'chance', 'steal.back': 'chance', 'pass.intercept': 'positive',
  'foul.reachFront': 'chance', 'foul.reachBack': 'chance', 'foul.shooting': 'chance', 'foul.charge': 'chance', 'foul.block': 'chance',
  'foul.looseBall': 'chance', 'foul.illegalScreen': 'chance', 'foul.drive': 'chance', 'fumble.rate': 'chance',
  'stamina.sprint': 'positive', 'stamina.run': 'positive', 'stamina.jump': 'positive', 'stamina.rest': 'positive', 'stamina.bench': 'positive',
  'stamina.subOut': 'chance', 'stamina.subIn': 'chance',
  'timeout.each': 'positive', 'timeout.rest': 'chance',
  'shot.make': 'positive', 'board.offence': 'positive',
  'shot.curve': 'word', 'shot.green': 'word', 'shot.boost': 'positive', 'ft.model': 'word',
  'decide.temperature': 'positive', 'iq.offence': 'positive', 'iq.defence': 'positive', 'coach.adapt': 'positive', 'coach.rotation': 'word', 'coach.ease': 'word', 'coach.focus': 'word',
  'decide.possession': 'positive', 'decide.usage': 'positive', 'decide.diet': 'positive', 'decide.drive': 'positive',
  'decide.pass': 'positive', 'decide.floor': 'positive', 'decide.misread': 'chance', 'decide.foulDraw': 'positive', 'decide.stale': 'positive', 'decide.rhythm': 'positive',
  'decide.scout': 'positive', 'decide.watch': 'chance', 'decide.watchDelay': 'positive', 'decide.fly': 'chance', 'decide.spread': 'positive', 'react.iq': 'chance', 'decide.threes': 'positive',
  'rules.overtimeShare': 'chance', 'rules.orebClock': 'positive', 'rules.lastTwo': 'word', 'rules.madeClock': 'word', 'form.sd': 'chance', 'move.pacing': 'word', 'decide.threeBase': 'chance', 'decide.rimBase': 'chance', 'decide.openKeep': 'positive', 'off.drift': 'word', 'off.threeCut': 'word', 'decide.stars': 'word', 'decide.starLight': 'word', 'decide.attack': 'word', 'decide.starFrom': 'positive', 'decide.openFrom': 'word', 'decide.squareUp': 'word', 'decide.stayHome': 'word', 'decide.readClose': 'word', 'decide.midCost': 'chance',
});

// Arcade: the game as it was, read from tuning.js.
const ARCADE = f({
  'ai.patience': AI.patience, 'play.startAt': PLAY.startAt, 'ai.contestDelay': AI.contestDelay, 'ai.stealRate': AI.stealRate, 'ai.farAway': AI.farAway,
  'player.accel': PLAYER.accel, 'player.brake': PLAYER.accel, 'decide.earlyThree': AI.earlyThree, 'decide.earlyRoom': AI.roomFor, 'board.boxHold': false, 'board.selfWait': 0, 'board.defence': AI.boards, 'board.crash': 1, 'board.lead': 0,
  'steal.front': STEAL.frontChance, 'steal.back': STEAL.backChance, 'pass.intercept': PASS.interceptRadius,
  'foul.reachFront': FOUL.reachFront, 'foul.reachBack': FOUL.reachBack, 'foul.shooting': FOUL.shooting, 'foul.charge': FOUL.charge, 'foul.block': FOUL.block,
  'foul.looseBall': 0, 'foul.illegalScreen': 0, 'foul.drive': 0, 'fumble.rate': 0,
  'stamina.sprint': STAMINA.sprint, 'stamina.run': STAMINA.run, 'stamina.jump': STAMINA.jump, 'stamina.rest': STAMINA.rest, 'stamina.bench': STAMINA.bench,
  'stamina.subOut': STAMINA.subOut, 'stamina.subIn': STAMINA.subIn,
  'timeout.each': TIMEOUT.each, 'timeout.rest': TIMEOUT.rest,
  'shot.make': 1, 'board.offence': 1,
  'shot.curve': 'line', 'shot.green': 'sure', 'shot.boost': 1, 'ft.model': 'flat',
  'decide.temperature': 0.3, 'iq.offence': 1, 'iq.defence': 1, 'coach.adapt': 1, 'coach.rotation': 'energy', 'coach.ease': 0, 'coach.focus': 0,
  'decide.possession': 1.0, 'decide.usage': 0.5, 'decide.diet': 0.6, 'decide.drive': 0.2,
  'decide.pass': 0.15, 'decide.floor': 60, 'decide.misread': 0.25, 'decide.foulDraw': 0.15, 'decide.stale': 0.08, 'decide.rhythm': 0.15,
  'decide.scout': 0.5, 'decide.watch': 0.15, 'decide.watchDelay': 0.5, 'decide.fly': 0.5, 'decide.spread': 0.5, 'react.iq': 0, 'decide.threes': 0.6,
  'rules.overtimeShare': 0, 'rules.orebClock': CLOCK.shot, 'rules.lastTwo': false, 'rules.madeClock': false, 'form.sd': 0, 'move.pacing': 'free', 'decide.threeBase': 0, 'decide.rimBase': 0, 'decide.openKeep': 1, 'off.drift': false, 'off.threeCut': 1, 'decide.stars': 0.25, 'decide.starLight': false, 'decide.attack': 0, 'decide.starFrom': 24, 'decide.openFrom': 0, 'decide.squareUp': true, 'decide.stayHome': 0, 'decide.readClose': 0, 'decide.midCost': 0,
});

// Simulation: NBA-like. Its own numbers, written out (Stage 4 tunes them).
const SIM = f({
  'ai.patience': f([19, 24]), 'play.startAt': 11, 'ai.contestDelay': 0.3, 'ai.stealRate': 0.01, 'ai.farAway': 6,
  'player.accel': 14, 'player.brake': 28, 'decide.earlyThree': 80, 'decide.earlyRoom': 2, 'board.boxHold': true, 'board.selfWait': 1.2, 'board.defence': 4, 'board.crash': 0.4, 'board.lead': 1,
  'steal.front': 0.25, 'steal.back': 0.08, 'pass.intercept': 0.2,
  'foul.reachFront': 0.12, 'foul.reachBack': 0.3, 'foul.shooting': 1, 'foul.charge': 0.6, 'foul.block': 0.15,
  'foul.looseBall': 0.02, 'foul.illegalScreen': 0.05, 'foul.drive': 0.9, 'fumble.rate': 0.005,
  // Sized for 12-minute quarters: a starter tires over 8-12 minutes of play, and a man on the bench is ready again
  // after about 4.
  'stamina.sprint': 0.003, 'stamina.run': 0.0008, 'stamina.jump': 0.004, 'stamina.rest': 0.0015, 'stamina.bench': 0.0015,
  'stamina.subOut': 0.35, 'stamina.subIn': 0.7,
  'timeout.each': 7, 'timeout.rest': 0.12,
  'shot.make': 1, 'board.offence': 0.25,
  // The chance of an open shot from each zone, before the defender, his rating, tiredness and timing (see shooting.js).
  'shot.curve': f({ rim: 0.95, close: 0.66, mid: 0.44, corner3: 0.38, arc3: 0.35 }), 'shot.green': 'boost', 'shot.boost': 0.5, 'ft.model': 'touch',
  'decide.temperature': 0.3, 'iq.offence': 1, 'iq.defence': 1, 'coach.adapt': 1, 'coach.rotation': 'plan', 'coach.ease': 1, 'coach.focus': 0.4,
  'decide.possession': 1.6, 'decide.usage': 0.5, 'decide.diet': 0.6, 'decide.drive': 0.2,
  'decide.pass': 0.15, 'decide.floor': 60, 'decide.misread': 0.25, 'decide.foulDraw': 0.15, 'decide.stale': 0.08, 'decide.rhythm': 0.15,
  'decide.scout': 0.5, 'decide.watch': 0.15, 'decide.watchDelay': 0.5, 'decide.fly': 0.5, 'decide.spread': 0.5, 'react.iq': 1, 'decide.threes': 0.5,
  'rules.overtimeShare': 5 / 12, 'rules.orebClock': 14, 'rules.lastTwo': true, 'rules.madeClock': true, 'form.sd': 0.05, 'move.pacing': 'gaits', 'decide.threeBase': 0, 'decide.rimBase': 0.04, 'decide.openKeep': 1.2, 'off.drift': true, 'off.threeCut': 1, 'decide.stars': 0.3, 'decide.starLight': true, 'decide.attack': 0.45, 'decide.starFrom': 7, 'decide.openFrom': 8, 'decide.squareUp': true, 'decide.stayHome': 0.3, 'decide.readClose': 0.5, 'decide.midCost': 0.04,
});

export const STYLES = f({ arcade: ARCADE, sim: SIM });
export const STYLE_NAMES = f(['arcade', 'sim']);
export const STYLE_LABEL = f({ arcade: 'Arcade', sim: 'Simulation' });

// The nine sliders, in the order the panel lists them. A slider at s (0 to 100) gives the factor 0.5 + s / 100: a
// key it lists with +1 is multiplied by that, one with -1 divided by it.
export const SLIDERS = f([
  f({ key: 'pace', label: 'Pace', scales: f({ 'ai.patience': -1, 'play.startAt': -1 }) }),
  f({ key: 'selection', label: 'Shot selection', scales: f({ 'decide.threeBase': 1, 'decide.threes': 1, 'decide.rimBase': 1, 'decide.midCost': 1 }) }),
  f({ key: 'shooting', label: 'Shooting', scales: f({ 'shot.make': 1 }) }),
  f({ key: 'offIQ', label: 'Offensive IQ', scales: f({ 'iq.offence': 1 }) }),
  f({ key: 'defIQ', label: 'Defensive IQ', scales: f({ 'ai.contestDelay': -1, 'iq.defence': 1 }) }),
  f({ key: 'security', label: 'Ball security', scales: f({ 'steal.front': -1, 'steal.back': -1, 'pass.intercept': -1, 'fumble.rate': -1 }) }),
  f({ key: 'fouls', label: 'Foul frequency', scales: f({ 'foul.reachFront': 1, 'foul.reachBack': 1, 'foul.shooting': 1, 'foul.charge': 1, 'foul.block': 1, 'foul.looseBall': 1, 'foul.illegalScreen': 1, 'foul.drive': 1 }) }),
  f({ key: 'rebounding', label: 'Rebounding', scales: f({ 'board.offence': 1, 'board.crash': 1 }) }),
  f({ key: 'fatigue', label: 'Fatigue', scales: f({ 'stamina.sprint': 1, 'stamina.run': 1, 'stamina.jump': 1, 'stamina.rest': -1, 'stamina.bench': -1 }) }),
]);

export const defaultSliders = () => Object.fromEntries(SLIDERS.map(s => [s.key, 50]));

// The factor a slider at `value` gives.
export const sliderFactor = value => 0.5 + Math.min(100, Math.max(0, value)) / 100;

// One key's value under the sliders: its base, scaled by every slider that lists it.
function resolve(key, base, sliders) {
  let factor = 1;
  for (const slider of SLIDERS) {
    const sign = slider.scales[key];
    if (sign === undefined) continue;
    const v = sliderFactor(sliders[slider.key] ?? 50);
    factor *= sign > 0 ? v : 1 / v;
  }
  if (factor === 1 || KINDS[key] === 'word') return base;
  const scale = x => (KINDS[key] === 'chance' ? Math.min(1, x * factor) : x * factor);
  return Array.isArray(base) ? f(base.map(scale)) : scale(base);
}

// Sets `state`'s style and sliders, and resolves its table once. `tables` is for tests, which pass their own to prove
// that a match reads only its own style's.
export function setStyle(state, style = 'arcade', sliders = defaultSliders(), tables = STYLES) {
  if (!STYLE_NAMES.includes(style)) style = 'arcade';
  const base = tables[style];
  state.style = style;
  state.sliders = { ...defaultSliders(), ...sliders };
  // A Map: it is read many times a step, and a plain object of this many keys reads slower.
  state.styleTable = new Map(Object.keys(KINDS).map(key => [key, resolve(key, base[key], state.sliders)]));
  return state;
}

// The value of a styled number for this match. An unknown key throws, so a misspelt one cannot read as nothing.
export function styled(state, key) {
  const value = state.styleTable.get(key);
  if (value === undefined) throw new Error(`no styled number "${key}"`);
  return value;
}
