import { createMatch } from './sim/state.js';
import { startMatch } from './sim/rules.js';
import { step } from './sim/step.js';
import { aiIntents } from './sim/ai.js';
import { DT } from './sim/tuning.js';
import { createScene } from './render/scene.js';
import { createActors } from './render/actors.js';
import { shotMeter, SHOT_METER } from './render/motion.js';
import { loadPeople } from './render/people.js';
import { createHud, easeFrame } from './render/hud.js';
import { createQuality, autoQuality, toggleQuality } from './render/quality.js';
import { createKeyboard } from './input.js';
import { inPlay, pauseKey, setPaused } from './pause.js';

const MAX_FRAME = 0.1;   // seconds: after a stall, never simulate more than this to catch up
const newMatch = () => createMatch(Date.now() % 1e6);

const view = await createScene(document.getElementById('court'));
if (view) {
  // The generated players. If their files are missing or broken the match is still playable, with capsules.
  const people = await loadPeople().catch(error => { console.warn('Players could not be loaded; using capsules.', error); return null; });
  const actors = createActors(view.scene, people);
  const hud = createHud(document);
  const keyboard = createKeyboard(window);
  const quality = createQuality();
  // pick: the roster row chosen first on the pause screen. quality: the level the game is drawn at, 'high' or 'low'.
  // meter: the shot meter and where its top is on the page, or null.
  const game = { state: newMatch(), paused: false, pick: null, fps: 60, quality: quality.level, meter: null };
  globalThis.game = game;   // handle for poking at the match from the browser console

  const pause = on => setPaused(game, keyboard, on);
  // Draws the game at the level `quality` is now on: called whenever that changes.
  const showQuality = () => {
    game.quality = quality.level;
    view.setQuality(quality.level);
    people?.setQuality(quality.level);
  };

  window.addEventListener('keydown', e => {
    if (e.code === 'KeyG' && !e.repeat) { toggleQuality(quality); showQuality(); }   // on any screen; a held key counts once
    if (e.code === 'Escape') pause(!game.paused);
    else if (game.paused) pauseKey(game, e.code);
    if (e.code !== 'Enter' || inPlay(game.state)) return;
    if (game.state.phase === 'final') game.state = newMatch();
    startMatch(game.state);
  });
  window.addEventListener('blur', () => pause(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

  let last = performance.now(), owed = 0, frameMs = 1000 / game.fps;
  const frame = now => {
    const { state } = game;
    // A stall (a hidden tab) counts as one long frame at most, as it does for the match below.
    if (now > last) game.fps = 1000 / (frameMs = easeFrame(frameMs, Math.min(now - last, MAX_FRAME * 1000)));
    // Real time since the last frame. Never negative: the first frame's time can be earlier than `last`.
    const ms = Math.max(now - last, 0), elapsed = Math.min(ms / 1000, MAX_FRAME);
    if (autoQuality(quality, ms, inPlay(state) && !game.paused)) showQuality();
    owed = game.paused ? 0 : owed + elapsed;
    last = now;
    const before = state.time;
    for (; owed >= DT; owed -= DT) {
      const intents = aiIntents(state, DT);
      intents[state.controlled] = keyboard.intent();   // the human replaces the computer for one player
      step(state, intents, DT);
    }
    // Motion advances by the match time that passed: none while paused. Before and after a match no match time
    // passes, so it advances by real time and the players stand breathing.
    actors.sync(state, inPlay(state) ? state.time - before : elapsed);
    view.follow(state.ball.x);
    view.render();
    const m = shotMeter(state);
    game.meter = m && { ...m, head: view.toScreen(m.x, SHOT_METER.high, m.z) };
    hud.update(state, view.backend, game);
    hud.show(state.phase === 'start' ? 'start' : state.phase === 'final' ? 'final' : game.paused ? 'pause' : null);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
