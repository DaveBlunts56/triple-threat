// What a player likes to do, from his role (see ROLES in teams.js) moved by his ratings, unless he has his own. Each is
// 0 to 1. The decision maker, the coach and the fast engine read these; nothing here decides anything.
//
// usage: how much he looks for his own shot. diet: where he likes to shoot from, { rim, mid, three }, adding up to 1.
// passFirst: how much he would rather pass than shoot. drive, post, iso: how much he likes to attack off the dribble,
// back a man down, or take him one on one. crash: whether he goes to the offensive glass. gamble: whether he reaches
// for steals. help: how readily he leaves his man to help. foul: how often his contact draws a whistle.
// iq: how well he decides (0.35 to 0.98).
import { ROLES } from './teams.js';
import { overall } from './overall.js';

const clamp01 = v => Math.min(1, Math.max(0, v));

export function tendenciesOf(person, own = {}) {
  const prior = ROLES[person.role] ?? ROLES['Role player'], r = person.ratings;
  // Where he likes to shoot from: his role's leaning, weighted by how well he shoots from each place.
  const weight = { rim: prior.diet.rim * (r.inside / 70) ** 3, mid: prior.diet.mid * (r.mid / 70) ** 3, three: prior.diet.three * (r.three / 70) ** 3 };
  const sum = weight.rim + weight.mid + weight.three;
  const tend = {
    usage: clamp01(prior.usage + (overall(person) - 80) / 50),
    diet: { rim: weight.rim / sum, mid: weight.mid / sum, three: weight.three / sum },
    passFirst: prior.passFirst,
    drive: clamp01(prior.drive + ((r.speed + r.handle) / 2 - 70) / 100),
    post: clamp01(prior.post + (r.inside - 75) / 100),
    iso: clamp01(prior.iso + (r.handle - 75) / 150),
    crash: clamp01(prior.crash + (r.rebound - 70) / 100),
    gamble: clamp01(prior.gamble + (r.defence - 70) / 150),
    help: clamp01(prior.help + (r.defence - 70) / 200),
    foul: prior.foul,
  };
  return { ...tend, ...own, diet: { ...tend.diet, ...own.diet } };
}

export const iqOf = (person, own) => own ?? Math.min(0.98, Math.max(0.35, (ROLES[person.role] ?? ROLES['Role player']).iq + (overall(person) - 80) / 60));
