// The founding catalogue supplies faces and names. Career records and club membership belong to the save.
import { clubs, standings } from './calendar.js';
import { rand } from '../sim/state.js';
import { KEYS, overall } from '../sim/overall.js';

export const careerId = player => player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const directions = ['Compete', 'Develop'];

export function seedCareers(league) {
  const rng = { seed: league.initialSeed };
  league.careers = {};
  league.staff = {};
  for (const club of Object.values(clubs)) {
    const ids = club.players.map(p => {
      const id = careerId(p);
      league.careers[id] = { age: 19 + Math.floor(rand(rng) * 15), potential: rand(rng), ratings: { ...p.ratings }, change: 0 };
      return id;
    });
    league.staff[club.key] = { ids, direction: 'Compete', playbook: club.playbook, coach: club.coach };
  }
}

export function develop(league) {
  const rng = { seed: league.season.seed };
  for (const row of standings(league.season)) {
    const staff = league.staff[row.key];
    const players = staff.ids.map(id => league.careers[id]);
    const core = [...players].sort((a,b) => overall(b) - overall(a)).slice(0, 3);
    const aging = core.filter(p => p.age >= 31).length;
    if (row.key !== league.team) staff.direction = row.l > row.w || (aging >= 2 && row.w <= row.l + 2) ? 'Develop' : 'Compete';
    for (const id of staff.ids) {
      const p = league.careers[id], before = overall(p);
      const minutes = (league.season.stats[id]?.secs ?? 0) / (league.games * league.minutes * 240);
      const youth = p.age < 27;
      const growth = youth ? p.potential + Math.min(1, minutes) + (staff.direction === 'Develop' ? 0.9 : 0) : 0;
      const decline = Math.min(2.2, Math.max(0, p.age - 29) * 0.22);
      const season = growth - decline + (rand(rng) - 0.5) * 4;
      for (const key of KEYS) {
        const physical = ['speed','stamina'].includes(key);
        const delta = Math.round(season + (rand(rng) - 0.5) * 3 - (physical ? decline / 2 : 0));
        p.ratings[key] = Math.max(35, Math.min(99, p.ratings[key] + delta));
      }
      p.change = overall(p) - before;
      p.age++;
    }
    const spacing = core.reduce((sum,p) => sum + p.ratings.three - p.ratings.inside, 0) / core.length;
    staff.playbook = spacing > 4 ? 'paceSpace' : spacing < -4 ? 'insideOut' : 'balanced';
    staff.coach = staff.direction === 'Develop' ? 'steady' : 'aggressive';
  }
}

// Keep the shape of the club's starting five (or three). A developing team can give a close
// positional contest to a younger player. A clear difference in ability still wins the job.
export function starters(league, key) {
  const club = clubs[key], staff = league.staff[key];
  const selected = club.players.slice(0, league.size).map((_,i) => i);
  if (league.season.year === 1) return selected;
  const merit = row => {
    const p = league.careers[staff.ids[row]];
    return overall(p) + (staff.direction === 'Develop' ? Math.max(0, 27 - p.age) / 2 : 0);
  };
  for (let slot = 0; slot < selected.length; slot++) {
    for (let row = 0; row < club.players.length; row++) {
      if (club.players[row].position === club.players[slot].position && !selected.includes(row) && merit(row) > merit(selected[slot]))
        selected[slot] = row;
    }
  }
  return selected;
}
