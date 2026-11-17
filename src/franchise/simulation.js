import { fixtureMatch, simulateFixture } from './league.js';

// The standalone file cannot load a sibling worker module. It yields between fixtures instead.
export function simulationRunner() {
  const worker = globalThis.TT_ASSETS ? null : new Worker(new URL('src/franchise/worker.js', document.baseURI), { type: 'module' });
  return {
    async game(league) {
      if (!worker) {
        await new Promise(resolve => setTimeout(resolve, 0));
        return simulateFixture(league);
      }
      return new Promise((resolve, reject) => {
        worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.result);
        worker.onerror = () => reject(new Error('The simulation worker could not finish the game.'));
        worker.postMessage(fixtureMatch(league));
      });
    },
    close() { worker?.terminate(); }
  };
}
