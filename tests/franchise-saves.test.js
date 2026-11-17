// Exercise the actual slot adapter with deterministic request callbacks. The map transaction models
// IndexedDB's completion and abort boundary so a storage failure can be injected between two writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLeague, nextSeason, recordGame, simulateFixture } from '../src/franchise/league.js';
import { exportLeague, listSlots, loadSlot, previousCheckpoint, readArchive, validateSave, writeSlot } from '../src/franchise/saves.js';

function memoryDatabase() {
  const stores = {};
  let failOn = null;
  const db = {
    createObjectStore(name) { stores[name] = new Map(); },
    transaction(names) {
      const snapshot = structuredClone(stores), tasks = [];
      let aborted = false;
      const tx = {
        abort() { aborted = true; },
        objectStore(name) {
          const map = snapshot[name];
          function request(work) {
            const req = {};
            tasks.push(() => { req.result = work(); req.onsuccess?.(); });
            return req;
          }
          function write(value, key) {
            if (failOn === name) { failOn = null; throw new Error('Storage full'); }
            map.set(JSON.stringify(key), structuredClone(value));
          }
          return {
            get: key => request(() => map.get(JSON.stringify(key))),
            getAll: () => request(() => [...map.values()]),
            put: (value, key) => request(() => write(value, key)),
            add: (value, key) => request(() => {
              if (map.has(JSON.stringify(key))) throw new Error('Duplicate key');
              write(value, key);
            }),
          };
        },
      };
      queueMicrotask(() => {
        try { while (tasks.length && !aborted) tasks.shift()(); }
        catch (error) { tx.error = error; aborted = true; }
        if (aborted) { tx.onabort?.(); return; }
        if (Array.isArray(names)) for (const name of names) stores[name] = snapshot[name];
        tx.oncomplete?.();
      });
      return tx;
    }
  };
  return {
    open() {
      const request = { result: db };
      queueMicrotask(() => { request.onupgradeneeded(); request.onsuccess(); });
      return request;
    },
    failNextWrite(name) { failOn = name; },
  };
}

test('slots reject stale writers, roll back interrupted writes and round-trip archived seasons through export and import', async t => {
  const factory = memoryDatabase();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory });
  t.after(() => { delete globalThis.indexedDB; });
  const l = createLeague({ name: 'Local test', team: 'NYE', seed: 0, minutes: 3 });
  assert.equal(await writeSlot('a', 0, l), 1);
  await assert.rejects(previousCheckpoint('a'), /no earlier/);
  const otherTab = await loadSlot('a');
  recordGame(l, simulateFixture(l));
  assert.equal(await writeSlot('a', 1, l), 2);
  await assert.rejects(writeSlot('a', otherTab.revision, otherTab.league), /Another tab/);
  assert.deepEqual((await loadSlot('a')).league, l);

  while (!l.season.champion) recordGame(l, simulateFixture(l));
  nextSeason(l);
  factory.failNextWrite('slots');
  await assert.rejects(writeSlot('a', 2, l), /Storage full/);
  assert.equal((await listSlots())[0].revision, 2);
  assert.deepEqual(await previousCheckpoint('a'), otherTab.league);
  assert.equal((await loadSlot('a')).league.season.cursor, 1);
  assert.equal(await writeSlot('a', 2, l), 3);
  const slot = await loadSlot('a');
  assert.equal((await previousCheckpoint('a')).season.cursor, 1);
  assert.deepEqual(Object.keys(slot.league.history[0]).sort(), ['champion', 'year']);
  assert.deepEqual(await readArchive(slot, 0), l.history[0]);
  const restored = validateSave(JSON.parse(JSON.stringify(await exportLeague(slot))));
  assert.deepEqual(restored, l);
  await writeSlot('b', 0, restored);
  await assert.rejects(writeSlot('a', 0, restored), /Another tab/);
  assert.deepEqual((await listSlots()).map(s => s.id), ['a', 'b']);
});
