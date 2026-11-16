// What happens in the fast engine when a choice is made: a shot's chance and whether it goes in, the free throws, the
// rebound, the tiredness of the seconds played. Chances come from the shared models (shooting.js, the ratings, the
// style's numbers), and the box score is kept with the same notes as the 3D game's (stats.js).
import { AI, DIFFICULTY, RATE, SHOT } from '../tuning.js';
import { addPoints, personOf, rand } from '../state.js';
import { styled } from '../styles.js';
import { lift, drop } from '../overall.js';
import { heatOf } from '../ratings.js';
import { note } from '../stats.js';
import { shotFactor } from '../stamina.js';
import { contestShare, distanceChance, expectedShot, freeThrowChance, greenChance, greenShare, levelFor, meanTiming, rangeShare, shotChance, skillOf, windowHalf } from '../shooting.js';
import { QUICK, within } from './shapes.js';
import { playbookOf } from '../coach.js';

const BEST = SHOT.gather + SHOT.bestAt * 2.2 / 9.81, LANDS = SHOT.gather + 2 * 2.2 / 9.81;   // a jump shot's, as players.js has them
const LEVEL = DIFFICULTY.levels.allstar;   // a match nobody plays: both sides at All-Star's numbers
const TIMING = meanTiming(AI.releaseJitter, SHOT.worstTiming, BEST, LANDS, SHOT.gather);   // a computer's release, on average

const ratingFor = zone => (zone === 'rim' || zone === 'close' ? 'inside' : zone === 'mid' ? 'mid' : 'three');
export const isThreeZone = zone => zone === 'corner3' || zone === 'arc3';

// A look: `shooter` from `zone` (from `far` metres if given), his defender `defender` `gap` metres off. Its chance, its chance of a green release,
// and its worth in expected points, as the shared shot model has them for a computer shooter.
export function look(state, shooter, zone, gap, defender, { fading = false, far: span = null } = {}) {
  const person = personOf(state, shooter), far = within(state.dice ??= () => rand(state), span ?? QUICK.far[zone]);
  const rating = person.ratings[ratingFor(zone)], heat = heatOf(person);
  const contest = contestShare({ gap, defence: personOf(state, defender).ratings.defence, fading });
  const chance = shotChance({ base: distanceChance(styled(state, 'shot.curve'), far, zone), timing: TIMING,
    contest, energy: person.energy, levelMake: LEVEL.cpuMake, skill: skillOf(rating, heat), fading, make: styled(state, 'shot.make'), form: person.form ?? 1 });
  const range = rangeShare(far);
  const half = windowHalf({ steps: levelFor(contest).steps, range, energy: person.energy, levelGreen: LEVEL.cpuGreen, rating, heat });
  const green = greenShare(half, AI.releaseJitter, range > 0);
  const value = isThreeZone(zone) ? 3 : 2;
  return { shooter, defender, zone, far, gap, chance, green, value, ep: expectedShot({ value, chance, green, rule: styled(state, 'shot.green'), boost: styled(state, 'shot.boost') }) };
}

// His makes or misses in a row, as players.js keeps them.
function streak(person, made) { person.streak = made ? Math.max(person.streak, 0) + 1 : Math.min(person.streak, 0) - 1; }

// Takes the shot of `l` (a look). Returns 'made', 'missed' or 'blocked', and whether a shooting foul came with it:
// { result, fouled, by }. The box score is noted here: the attempt, the make, the block, the points (not the free
// throws, which engine.js shoots).
export function shoot(state, l, { drive = false } = {}) {
  const person = personOf(state, l.shooter), three = isThreeZone(l.zone), team = l.shooter.team;
  note(state, l.shooter, 'fga'); if (three) note(state, l.shooter, 'tpa');
  const zones = (state.shotZones ??= [{}, {}])[team];   // for whoever watches: each team's shots by zone
  zones[l.zone] = (zones[l.zone] ?? 0) + 1;
  person.energy = Math.max(0, person.energy - styled(state, 'stamina.jump'));
  // A block: a defender in reach, the more often the better he defends.
  if (rand(state) < QUICK.block[l.zone] * lift(personOf(state, l.defender).ratings.defence, 0.15) * (l.gap < 1.2 ? 1.4 : 0.6)) {
    note(state, l.defender, 'blk'); streak(person, false);
    return { result: 'blocked', fouled: false, by: l.defender };
  }
  // Contact: on a finish where the style calls contact on a drive, and on any shot an airborne defender reaches.
  const contact = (drive ? (QUICK.contact.drive[l.zone] ?? 0) * styled(state, 'foul.drive') : 0)
    + (QUICK.contact.air[l.zone] ?? 0) * styled(state, 'foul.shooting') * (l.gap < 1 ? 1.5 : 0.7);
  const fouled = rand(state) < contact;
  // A foul on the shot makes it harder; a green release is drawn first, then its chance, as the 3D game draws them.
  const chance = l.chance * (fouled ? 0.55 : 1), rule = styled(state, 'shot.green');
  const made = rand(state) < l.green ? rule === 'sure' || rand(state) < greenChance(rule, chance, styled(state, 'shot.boost')) : rand(state) < chance;
  streak(person, made);
  if (made) {
    note(state, l.shooter, 'fgm'); note(state, l.shooter, 'pts', l.value); if (three) note(state, l.shooter, 'tpm');
    addPoints(state, team, l.value);
  }
  return { result: made ? 'made' : 'missed', fouled, by: fouled ? l.defender : null };
}

// `n` free throws by `shooter`. Returns whether the last one missed (a live rebound), and the points.
export function freeThrows(state, shooter, n) {
  const person = personOf(state, shooter), chance = freeThrowChance(styled(state, 'ft.model'), person) * shotFactor(person.energy);
  let made = 0, lastMissed = false;
  for (let i = 0; i < n; i++) {
    note(state, shooter, 'fta');
    lastMissed = !(rand(state) < chance);
    if (!lastMissed) { made++; note(state, shooter, 'ftm'); note(state, shooter, 'pts'); addPoints(state, shooter.team, 1); }
  }
  return { lastMissed, made };
}

// Who takes a missed shot: the offence's (an offensive rebound) or the defence's. The offence's chance comes from how
// many its playbook sends and the style crashes, how strongly the box-outs hold (the style's board weight), and the
// rebounders on each side; a long miss carries to the offence a little more. `after`: 'shot' or 'ft'.
export function rebound(state, team, zone, after = 'shot') {
  const players = state.players, mine = players.filter(p => p.team === team), theirs = players.filter(p => p.team !== team);
  const reb = list => list.reduce((sum, p) => sum + personOf(state, p).ratings.rebound * (0.5 + personOf(state, p).tend.crash), 0) / list.length;
  const crashers = Math.min(mine.length - 1, Math.max(1, Math.round(((2 * playbookCrash(state, team)) / 0.4) * styled(state, 'board.crash'))));
  let chance = QUICK.oreb * Math.sqrt(crashers / 2) * Math.sqrt(styled(state, 'board.offence')) * (reb(mine) / reb(theirs)) ** 1.5;
  if (isThreeZone(zone)) chance *= 1.15;
  if (after === 'ft') chance *= 0.45;
  const offensive = rand(state) < Math.min(0.6, chance);
  const side = offensive ? mine : theirs;
  // The rebounder, by how well each rebounds and goes to the glass.
  const weight = p => personOf(state, p).ratings.rebound ** 3 * (offensive ? 0.4 + personOf(state, p).tend.crash : 1);
  let at = rand(state) * side.reduce((sum, p) => sum + weight(p), 0);
  const who = side.find(p => (at -= weight(p)) < 0) ?? side[side.length - 1];
  note(state, who, 'reb'); if (offensive) note(state, who, 'orb');
  personOf(state, who).energy = Math.max(0, personOf(state, who).energy - styled(state, 'stamina.jump'));
  return { offensive, who };
}

// The crash of `team`'s playbook (see teams.js).
const playbookCrash = (state, team) => playbookOf(state, team).crash;

// `secs` seconds of play (no more than the period has left): the ten on court tire as the 3D game's players do over
// that time, the bench rests, and the minutes and the clock run. `push`: a possession run in transition (more of it
// sprinted).
export function playFor(state, wanted, push = false) {
  const secs = Math.min(wanted, state.gameClock);
  if (secs <= 0) return;
  const sprint = push ? 0.55 : QUICK.effort.sprint, run = push ? 0.35 : QUICK.effort.run, rest = 1 - sprint - run;
  const effort = sprint * styled(state, 'stamina.sprint') + run * styled(state, 'stamina.run'), resting = rest * styled(state, 'stamina.rest'), bench = styled(state, 'stamina.bench');
  const tick = (state.tick = (state.tick ?? 0) + 1);   // marks who is on court this time, without making garbage
  for (const p of state.players) {
    const person = personOf(state, p);
    person.tick = tick;
    const drain = effort * drop(person.ratings.stamina, RATE.tire) - resting;
    person.energy = Math.min(1, Math.max(0, person.energy - drain * secs));
    person.secs += secs;
  }
  for (const roster of state.rosters) for (const person of roster) if (person.tick !== tick) person.energy = Math.min(1, person.energy + bench * secs);
  state.gameClock = Math.max(0, state.gameClock - secs);
  state.shotClock = Math.max(0, state.shotClock - secs);
  state.time += secs;
}

