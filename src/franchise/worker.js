// The page sends one prepared fixture at a time. History and the renderer stay off this thread.
import { simulate } from '../sim/quick/engine.js';
import { gameReport } from './league.js';

self.onmessage = ({ data }) => {
  try { self.postMessage({ result: gameReport(simulate(data)) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
