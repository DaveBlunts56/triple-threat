// Builds the league players' models (assets/players/<key>-<number>.glb) from their recipes
// (assets/source/league-people.json), each player in a Blender run of his own, a few at a time. A player whose file
// is there already is skipped unless --force. Usage:
//   node tools/league/build_models.mjs [--jobs 3] [--team nye] [--only nye-11,phi-00] [--force] [--logs DIR] [--shots DIR]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2), given = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const jobs = Number(given('--jobs') ?? 3), team = given('--team'), only = given('--only')?.split(','), force = args.includes('--force');
const logs = given('--logs') ?? join(tmpdir(), 'triple-threat-models'), shots = given('--shots');
mkdirSync(logs, { recursive: true });
mkdirSync('assets/players', { recursive: true });

const { people } = JSON.parse(readFileSync('assets/source/league-people.json', 'utf8'));
const fileOf = p => `${p.key}-${p.number}`;
const todo = people.filter(p => (!team || p.key === team) && (!only || only.includes(fileOf(p))) && (force || !existsSync(`assets/players/${fileOf(p)}.glb`)));
console.log(`${todo.length} to build, ${jobs} at a time; logs in ${logs}`);

const failed = [];
let done = 0;
const build = p => new Promise(resolve => {
  const name = fileOf(p), log = openSync(join(logs, `${name}.log`), 'w'), started = Date.now();
  // --python-exit-code: a failing script fails the run (Blender exits 0 otherwise), so an old file is not taken for a new one.
  const run = spawn('blender-4.5', ['--background', '--python-exit-code', '1', '--python', 'tools/blender/build_players.py', '--', '--people', 'assets/source/league-people.json',
    '--only', `player-${p.team}-${p.number}`, '--team', String(p.team), '--out', 'assets/players', '--counts', join(logs, `${name}.counts.json`), '--skin-size', '1024',
    ...(shots ? ['--shots', shots] : [])], { stdio: ['ignore', log, log] });
  run.on('close', code => {
    const ok = code === 0 && existsSync(`assets/players/${name}.glb`);
    if (!ok) failed.push(name);
    console.log(`${++done}/${todo.length} ${name} ${ok ? 'built' : 'FAILED'} in ${Math.round((Date.now() - started) / 1000)} s`);
    resolve();
  });
});
const queue = [...todo];
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await build(queue.shift()); }));
console.log(failed.length ? `failed: ${failed.join(', ')}` : 'all built');
process.exitCode = failed.length ? 1 : 0;
