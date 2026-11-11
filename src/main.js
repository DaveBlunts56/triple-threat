import { createMatch } from './sim/state.js';
import { startMatch } from './sim/rules.js';
import { step } from './sim/step.js';
import { aiIntents } from './sim/ai.js';
import { DT } from './sim/tuning.js';
import { createScene } from './render/scene.js';
import { createActors } from './render/actors.js';

const MAX_FRAME = 0.1;   // seconds: after a stall, never simulate more than this to catch up

const view = await createScene(document.getElementById('court'));
if (view) {
  const actors = createActors(view.scene);
  const state = createMatch(Date.now() % 1e6);
  startMatch(state);
  globalThis.game = { state };   // handle for poking at the match from the browser console

  let last = performance.now(), owed = 0;
  const frame = now => {
    owed += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    for (; owed >= DT; owed -= DT) step(state, aiIntents(state, DT), DT);
    actors.sync(state);
    view.follow(state.ball.x);
    view.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
