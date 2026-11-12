import { createMatch } from './sim/state.js';
import { startMatch } from './sim/rules.js';
import { step } from './sim/step.js';
import { aiIntents } from './sim/ai.js';
import { DT } from './sim/tuning.js';
import { createScene } from './render/scene.js';
import { createActors } from './render/actors.js';
import { loadPeople } from './render/people.js';
import { createHud } from './render/hud.js';
import { createKeyboard } from './input.js';
import { inPlay, pauseKey, setPaused } from './pause.js';

const MAX_FRAME = 0.1;   // seconds: after a stall, never simulate more than this to catch up
const FPS_EASE = 0.05;   // how fast the frame-rate readout follows the real rate: steady enough to read
const newMatch = () => createMatch(Date.now() % 1e6);

const view = await createScene(document.getElementById('court'));
if (view) {
  // The generated players. If their files are missing or broken the match is still playable, with capsules.
  const people = await loadPeople().catch(error => { console.warn('Players could not be loaded; using capsules.', error); return null; });
  const actors = createActors(view.scene, people);
  const hud = createHud(document);
  const keyboard = createKeyboard(window);
  const game = { state: newMatch(), paused: false, pick: null, fps: 60 };   // pick: the roster row chosen first on the pause screen
  globalThis.game = game;   // handle for poking at the match from the browser console

  const pause = on => setPaused(game, keyboard, on);

  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') pause(!game.paused);
    else if (game.paused) pauseKey(game, e.code);
    if (e.code !== 'Enter' || inPlay(game.state)) return;
    if (game.state.phase === 'final') game.state = newMatch();
    startMatch(game.state);
  });
  window.addEventListener('blur', () => pause(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

  let last = performance.now(), owed = 0;
  const frame = now => {
    const { state } = game;
    if (now > last) game.fps += (1000 / (now - last) - game.fps) * FPS_EASE;
    owed = game.paused ? 0 : owed + Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const before = state.time;
    for (; owed >= DT; owed -= DT) {
      const intents = aiIntents(state, DT);
      intents[state.controlled] = keyboard.intent();   // the human replaces the computer for one player
      step(state, intents, DT);
    }
    actors.sync(state, state.time - before);   // motion advances by the match time that passed: none while paused
    view.follow(state.ball.x);
    view.render();
    hud.update(state, view.backend, game);
    hud.show(state.phase === 'start' ? 'start' : state.phase === 'final' ? 'final' : game.paused ? 'pause' : null);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
