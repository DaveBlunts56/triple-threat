import { attackSign, createMatch } from './sim/state.js';
import { step } from './sim/step.js';
import { callTimeout } from './sim/rules.js';
import { aiIntents } from './sim/ai.js';
import { DT } from './sim/tuning.js';
import { createScene } from './render/scene.js';
import { createActors } from './render/actors.js';
import { shotMeter, SHOT_METER } from './render/meter.js';
import { loadPeople } from './render/people.js';
import { createHud, easeFrame } from './render/hud.js';
import { createQuality, autoQuality, stepQuality } from './render/quality.js';
import { createKeyboard, steer } from './input.js';
import { createPauseMenu, inPlay, pauseKey, pauseHasRow, pausePoint, quitToMenu, setPaused } from './pause.js';
import { createMenu, menuKey, menuPoint, menuHasRow, startFromMenu } from './menu.js';
import { createPlayList, playListKey } from './playlist.js';
import { createLife, stepLife } from './render/life.js';

const MAX_FRAME = 0.1;   // seconds: after a stall, never simulate more than this to catch up
const newMatch = size => createMatch(Date.now() % 1e6, size);   // size: 3 or 5 a side; three when not said
const MENU_KEYS = new Set(['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Enter', 'Space', 'Escape', 'Backspace']);
const MENU_ONCE = new Set(['Enter', 'Space', 'Escape', 'Backspace']);   // a held one counts once; the bar keys may repeat

const view = await createScene(document.getElementById('court'));
if (view) {
  // The generated players. If their files are missing or broken the match is still playable, with capsules.
  const people = await loadPeople().catch(error => { console.warn('Players could not be loaded; using capsules.', error); return null; });
  const actors = createActors(view.scene, people);
  const hud = createHud(document);
  const keyboard = createKeyboard(window);
  const quality = createQuality();
  // pick: the roster row chosen first on the pause screen. quality: the level the game is drawn at, one of QUALITY.order.
  // meter: the shot meter and where its top is on the page, or null. menu: the start menu. pauseMenu: the pause menu.
  // camera: '2k', behind the team with the ball, or 'broadcast', the sideline view.
  const game = { state: newMatch(), paused: false, pick: null, fps: 60, quality: quality.level, camera: '2k', meter: null, menu: createMenu(),
    pauseMenu: createPauseMenu(), playList: createPlayList() };
  globalThis.game = game;   // handle for poking at the match from the browser console

  const pause = on => { game.playList.open = false; setPaused(game, keyboard, on); };   // the play list never stays up under the pause screen
  // Draws the game at the level `quality` is now on: called whenever that changes.
  const showQuality = () => {
    game.quality = quality.level;
    view.setQuality(quality.level);
    people?.setQuality(quality.level);
  };

  const switchCamera = () => { game.camera = game.camera === '2k' ? 'broadcast' : '2k'; view.setCamera(game.camera); };
  view.setCamera(game.camera);
  const life = createLife();   // the crowd's mood
  let heading = view.heading();   // what up the screen means to the movement keys

  // Starts play, from the menu or the final screen. startFromMenu drops the keys held then, which relies on the
  // keyboard's own keydown listener (createKeyboard, above) being registered before the one below, so the key that
  // chose Play is already held when it is dropped.
  const play = () => startFromMenu(game, keyboard, newMatch);
  // A key on the start menu, or a click on a row (as Enter).
  const onMenu = code => {
    const asked = menuKey(game.menu, code);
    if (asked === 'play') play();
    else if (asked === 'quality') { stepQuality(quality); showQuality(); }
    else if (asked === 'camera') switchCamera();
  };

  // A key on the pause menu, or a click on one of its buttons (as Enter).
  const onPause = code => {
    const asked = pauseKey(game, code);
    if (asked === 'resume') pause(false);
    else if (asked === 'quality') { stepQuality(quality); showQuality(); }
    else if (asked === 'camera') switchCamera();
    else if (asked === 'quit') quitToMenu(game, keyboard, newMatch);
  };

  window.addEventListener('keydown', e => {
    if (e.code === 'KeyG' && !e.repeat) { stepQuality(quality); showQuality(); }   // on any screen; a held key counts once
    if (e.code === 'KeyC' && !e.repeat) switchCamera();
    if (game.state.phase === 'start') {
      if (MENU_KEYS.has(e.code)) e.preventDefault();
      if (!(e.repeat && MENU_ONCE.has(e.code))) onMenu(e.code);
      return;
    }
    if (game.paused) {
      if (MENU_KEYS.has(e.code)) e.preventDefault();
      if (!(e.repeat && MENU_ONCE.has(e.code))) onPause(e.code);
      return;
    }
    if (!e.repeat && inPlay(game.state) && playListKey(game, e.code)) { e.preventDefault(); return; }   // the play list, open over the match
    if (e.code === 'KeyZ' && !e.repeat && inPlay(game.state)) callTimeout(game.state, 0);   // a timeout, when the rules allow one
    if (e.code === 'Escape' && !e.repeat) pause(true);
    if (e.code === 'Enter' && game.state.phase === 'final') play();
  });
  // The menu's rows: moving the pointer over a row moves the bar there, a click chooses. mousemove, not mouseenter,
  // which also fires when a row appears under a pointer that is not moving.
  document.querySelectorAll('#menuList li').forEach((item, row) => {
    item.addEventListener('mousemove', () => { if (menuHasRow(game, row)) menuPoint(game.menu, row); });
    item.addEventListener('click', () => { if (menuHasRow(game, row)) { menuPoint(game.menu, row); onMenu('Enter'); } });
  });
  document.querySelectorAll('#pauseList li').forEach((item, row) => {
    item.addEventListener('mousemove', () => pausePoint(game, row));
    item.addEventListener('click', () => { if (pauseHasRow(game, row)) { pausePoint(game, row); onPause('Enter'); } });
  });
  // Losing the window pauses a match in play; one already paused stays as it is.
  window.addEventListener('blur', () => { if (!game.paused) pause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !game.paused) pause(true); });

  let last = performance.now(), owed = 0, frameMs = 1000 / game.fps;
  let slowest = 0, since = last;   // the longest frame since `since`, for the corner label: a stutter the average hides
  const frame = now => {
    const { state } = game;
    // A stall (a hidden tab) counts as one long frame at most, as it does for the match below.
    if (now > last) game.fps = 1000 / (frameMs = easeFrame(frameMs, Math.min(now - last, MAX_FRAME * 1000)));
    // Real time since the last frame. Never negative: the first frame's time can be earlier than `last`.
    const ms = Math.max(now - last, 0), elapsed = Math.min(ms / 1000, MAX_FRAME);
    slowest = Math.max(slowest, ms);
    if (now - since >= 1000) { game.worst = slowest; slowest = 0; since = now; }
    if (autoQuality(quality, ms, inPlay(state) && !game.paused)) showQuality();
    owed = game.paused ? 0 : owed + elapsed;
    last = now;
    const before = state.time;
    for (; owed >= DT; owed -= DT) {
      const intents = aiIntents(state, DT);
      // The human replaces the computer for one player. His keys follow the camera, and keep their meaning through a
      // swing of the camera until they are let go.
      const keys = keyboard.intent();
      if (!keys.moveX && !keys.moveZ) heading = view.heading();
      intents[state.controlled] = steer(keys, heading);
      step(state, intents, DT);
      view.swayNets(state.ball, DT);   // at every step, so a ball moved far in one step is never swept through a net
    }
    // Motion advances by the match time that passed: none while paused. Before and after a match no match time
    // passes, so it advances by real time and the players stand breathing.
    const passed = inPlay(state) ? state.time - before : elapsed;
    actors.sync(state, passed);
    const real = game.paused ? 0 : elapsed;   // the crowd and the referees stand still with a paused game
    view.live(state, stepLife(life, state, real), game.paused ? 0 : inPlay(state) ? state.time - before : 0, real);
    view.follow(state.ball, attackSign(state.possession));
    view.watch(state);
    view.render();
    // Where the feet of the player you control are on the page, for his name; nothing before and after a match.
    const me = state.players[state.controlled];
    game.feet = inPlay(state) ? view.toScreen(me.x, 0, me.z) : null;
    const m = shotMeter(state);
    game.meter = m && { ...m, head: view.toScreen(m.x, SHOT_METER.high, m.z) };
    game.missing = view.missing;
    hud.update(state, view.backend, game);
    hud.show(state.phase === 'start' ? 'start' : state.phase === 'final' ? 'final' : game.paused ? 'pause' : null);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
