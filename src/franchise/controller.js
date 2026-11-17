import { createLeague, fixtureMatch, gameReport, involved, nextFixture, nextSeason, recordGame } from './league.js';
import { library, dashboard } from './view.js';
import { archiveSummary, exportLeague, previousCheckpoint, readArchive, listSlots, loadSlot, validateSave, writeSlot } from './saves.js';
import { simulationRunner } from './simulation.js';
import { clubs } from './calendar.js';

export function franchiseScreen(dialog, launch) {
  const content = dialog.querySelector('main'), status = dialog.querySelector('[role=status]'), stop = dialog.querySelector('[data-stop]');
  let slot = null, tab = 'Overview', archived = 0, busy = false, cancel = false, pending = null;
  let finalWrite = null;
  const say = message => { status.textContent = message; };
  async function draw() {
    dialog.style.setProperty('--club', slot ? clubs[slot.league.team].colour : '#4fa1e6');
    if (!slot) {
      content.innerHTML = library([]);
      content.innerHTML = library(await listSlots());
    } else {
      const past = tab === 'History' && slot.league.history.length ? await readArchive(slot, archived) : null;
      content.innerHTML = dashboard(slot.league, tab, archived, past);
    }
    if (pending) content.querySelector('footer')?.insertAdjacentHTML('afterbegin', '<button data-action="retry">Retry saving final score</button><button data-action="recover">Save game to a new slot</button>');
  }
  async function run(operation) {
    if (busy) return;
    busy = true;
    content.inert = true;
    try { say(''); await operation(); }
    catch (e) { say(e.message || 'MyLeague could not finish that action.'); }
    finally { busy = false; content.inert = false; stop.hidden = true; }
  }
  dialog.addEventListener('cancel', e => { e.preventDefault(); if (!busy) dialog.close(); });
  // The game's window-level keyboard listens for these same keys. Native controls in the dialog own them.
  dialog.addEventListener('keydown', e => e.stopPropagation());
  stop.onclick = () => { cancel = true; stop.disabled = true; say('Finishing the current game…'); };
  async function create(data) {
    const id = crypto.randomUUID(), revision = await writeSlot(id, 0, data);
    slot = { id, revision, league: { ...data, history: data.history.map(archiveSummary) } }; pending = null; tab = 'Overview'; archived = 0;
    await draw();
  }
  async function persist(next) {
    const revision = await writeSlot(slot.id, slot.revision, next);
    slot = { id: slot.id, revision, league: { ...next, history: next.history.map(archiveSummary) } };
  }
  // A failed write leaves the loaded revision untouched. Finished seasons are immutable and can be shared.
  function draft() {
    const { history, ...active } = slot.league;
    return { ...structuredClone(active), history: [...history] };
  }
  async function commit(result) {
    const next = draft();
    recordGame(next, result);
    await persist(next);
  }
  async function settleFinal() {
    await commit(pending.result); pending = null;
    await draw(); say('Final score saved.');
  }
  async function advance(action, day = Infinity) {
    if (pending) throw new Error('Save the finished game before advancing.');
    const runner = simulationRunner(), league = slot.league;
    const target = league.season.fixtures.slice(league.season.cursor).find(f => involved(f, league.team));
    const single = ['play', 'watch', 'simGame'].includes(action);
    if (single && !target) { runner.close(); throw new Error('No team game is scheduled.'); }
    cancel = false; stop.disabled = false; stop.hidden = false;
    try {
      for (let f = nextFixture(slot.league); f && !cancel && f.day <= day; f = nextFixture(slot.league)) {
        if (action === 'nextMatchup' && involved(f, league.team)) break;
        if (single && f.id === target.id && action !== 'simGame') {
          const state = fixtureMatch(slot.league);
          stop.hidden = true;
          say('Loading ' + clubs[f.home].venue.name + '…');
          await launch(state, action);
          dialog.close();
          return;
        }
        say('Day ' + f.day + ' · ' + f.away + ' at ' + f.home);
        await commit(await runner.game(slot.league));
        if (single && f.id === target.id) break;
      }
    } finally { runner.close(); await draw(); }
    say(cancel ? 'Simulation stopped. Completed games are saved.' : 'League saved.');
  }

  async function action(key) {
    if (key === 'retry') return settleFinal();
    if (key === 'close') { dialog.close(); return; }
    if (key === 'library') {
      if (pending) throw new Error('Save the finished game or recover it to a new slot first.');
      slot = null; await draw(); return;
    }
    if (key === 'recover') {
      const next = await exportLeague(slot);
      recordGame(next, pending.result);
      await create(next); say('The finished game was saved in a new slot.'); return;
    }
    if (key === 'save') { await persist(slot.league); say('Franchise saved.'); return; }
    if (key === 'export') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(await exportLeague(slot))], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'myleague-' + slot.league.team + '.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000); return;
    }
    if (key === 'nextSeason') {
      const next = draft(); nextSeason(next); await persist(next); await draw(); return;
    }
    await advance(key);
  }

  content.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.action) run(() => action(b.dataset.action));
    else if (b.dataset.tab) run(async () => { tab = b.dataset.tab; await draw(); content.querySelector('[aria-pressed=true]')?.focus(); });
    else if (b.dataset.backup) run(async () => create(await previousCheckpoint(b.dataset.backup)));
    else if (b.dataset.slot) run(async () => {
      try { slot = await loadSlot(b.dataset.slot); }
      catch (error) {
        const recover = document.createElement('button');
        recover.textContent = 'Recover previous checkpoint in a new slot';
        recover.dataset.backup = b.dataset.slot;
        b.parentNode.querySelector('[data-backup]')?.remove();
        b.after(recover);
        throw error;
      }
      tab = 'Overview'; archived = 0;
      if (pending?.slot !== slot.id) pending = null;
      await draw();
    });
  });
  content.addEventListener('submit', e => {
    e.preventDefault();
    const form = new FormData(e.target);
    if (e.target.id === 'ml-date') run(() => advance('date', Number(form.get('day'))));
    else run(() => {
      const setup = Object.fromEntries(form);
      for (const k of ['size', 'games', 'minutes', 'bestOf']) setup[k] = Number(setup[k]);
      setup.seed = setup.seed === '' ? crypto.getRandomValues(new Uint32Array(1))[0] : Number(setup.seed);
      return create(createLeague(setup));
    });
  });
  content.addEventListener('change', e => {
    if (e.target.name === 'archive') run(async () => { archived = Number(e.target.value); await draw(); });
    if (e.target.id === 'ml-import' && e.target.files.length) run(async () => create(validateSave(JSON.parse(await e.target.files[0].text()))));
  });
  return {
    open() {
      dialog.showModal();
      run(async () => { if (!pending) slot = null; await draw(); });
    },
    resume() {
      tab = 'Overview'; dialog.showModal();
      run(async () => {
        const message = await finalWrite;
        finalWrite = null;
        await draw();
        if (message) say(message);
      });
    },
    finish(state) {
      pending = { slot: slot.id, result: gameReport(state) };
      finalWrite = commit(pending.result).then(() => {
        pending = null;
        return 'Final score saved.';
      }, error => error.message || 'The final score could not be saved.');
    }
  };
}
