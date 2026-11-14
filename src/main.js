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
import { actionOf, createKeys, savedKeys } from './keys.js';
import { readPrefs, storageOf, writePrefs } from './prefs.js';
import { createBroadcast } from './broadcast/broadcast.js';
import { nextCommentary } from './broadcast/commentary.js';
import { slowFor } from './broadcast/moments.js';
import { clear as clearReplays, createRecorder, due, frameAt, mark, record, settle, skip as skipReplay, start as startReplay } from './replay.js';

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
  // What was saved the last time, and the keys as they were left. Both are kept up to date and saved at every change.
  const storage = storageOf(), prefs = readPrefs(storage);
  const keys = createKeys(prefs.keys);
  const keyboard = createKeyboard(window, keys);
  const quality = createQuality();
  if (prefs.quality) { quality.level = prefs.quality; quality.settled = true; }   // a level you chose is yours: the game leaves it alone
  // pick: the roster row chosen first on the pause screen. quality: the level the game is drawn at, one of QUALITY.order.
  // meter: the shot meter and where its top is on the page, or null. menu: the start menu. pauseMenu: the pause menu.
  // camera: '2k', behind the team with the ball, or 'broadcast', the sideline view.
  const game = { state: newMatch(), paused: false, pick: null, fps: 60, quality: quality.level, camera: prefs.camera, meter: null, menu: createMenu(prefs),
    pauseMenu: createPauseMenu(), playList: createPlayList(), keys, prefs, show: {} };
  globalThis.game = game;   // handle for poking at the match from the browser console

  // The broadcast: big moments, the commentator, the panels. It only watches.
  const broadcast = createBroadcast();
  game.hasVoice = broadcast.voice.available;
  // The commentary as it can be here: where the browser has no voice, voice and captions is captions only.
  const commentary = () => (prefs.commentary === 'voice' && !broadcast.voice.available ? 'captions' : prefs.commentary);
  const stepCommentary = () => { prefs.commentary = nextCommentary(commentary(), broadcast.voice.available); if (prefs.commentary !== 'voice') broadcast.hush(); };
  // Replays of the biggest moments. `side`: the side of the court the replay's camera is on.
  const replays = createRecorder();
  let replaySide = 1;
  const endReplay = () => { if (!replays.playing) return; skipReplay(replays); actors.cut(); view.setCamera(game.camera); };
  const pause = on => { game.playList.open = false; if (on) { broadcast.hush(); endReplay(); } setPaused(game, keyboard, on); };   // the play list never stays up under the pause screen
  // Draws the game at the level `quality` is now on: called whenever that changes.
  const showQuality = () => {
    game.quality = quality.level;
    view.setQuality(quality.level);
    people?.setQuality(quality.level);
  };

  if (prefs.quality) showQuality();
  // Keeps what the menus and the keys have just changed for the next time. `chose`: the quality was stepped by hand,
  // which is the only way a level is remembered; one the game fell to by itself is not.
  const remember = (chose = false) => {
    const { size, difficulty, minutes, autoSubs } = game.menu;
    Object.assign(prefs, { size, difficulty, minutes, autoSubs, camera: game.camera, keys: savedKeys(keys) });
    if (chose) prefs.quality = quality.level;
    writePrefs(storage, prefs);
  };
  const stepQualityByHand = () => { stepQuality(quality); showQuality(); remember(true); };
  const stepReplays = () => { prefs.replays = !prefs.replays; if (!prefs.replays) clearReplays(replays); };
  const switchCamera = () => { game.camera = game.camera === '2k' ? 'broadcast' : '2k'; view.setCamera(game.camera); remember(); };
  view.setCamera(game.camera);
  const life = createLife();   // the crowd's mood
  let heading = view.heading();   // what up the screen means to the movement keys

  // Starts play, from the menu or the final screen. startFromMenu drops the keys held then, which relies on the
  // keyboard's own keydown listener (createKeyboard, above) being registered before the one below, so the key that
  // chose Play is already held when it is dropped.
  const play = () => startFromMenu(game, keyboard, newMatch);
  // A key on the start menu, or a click on a row (as Enter).
  const onMenu = code => {
    const asked = menuKey(game.menu, code, keys);
    if (asked === 'play') play();
    else if (asked === 'quality') stepQualityByHand();
    else if (asked === 'camera') switchCamera();
    else if (asked === 'commentary') stepCommentary();
    else if (asked === 'replays') stepReplays();
    remember();
    keyboard.drop();   // a key pressed on a menu, one just given to an action too, does nothing in the match until let go
  };

  // A key on the pause menu, or a click on one of its buttons (as Enter).
  const onPause = code => {
    const listened = game.pauseMenu.listening;
    const asked = pauseKey(game, code, keys);
    if (asked === 'resume') pause(false);
    else if (asked === 'quality') stepQualityByHand();
    else if (asked === 'camera') switchCamera();
    else if (asked === 'commentary') stepCommentary();
    else if (asked === 'replays') stepReplays();
    else if (asked === 'quit') quitToMenu(game, keyboard, newMatch);
    remember();
    if (listened || asked === 'keys') keyboard.drop();   // the key just given to an action does nothing until let go
  };

  const held = new Set();   // keys pressed to take a panel down, ignored until they are let go
  window.addEventListener('keyup', e => held.delete(e.code));
  window.addEventListener('keydown', e => {
    // The starting line-ups: any key takes them down, and that key does nothing else, now or while it is held.
    if (game.show.panel === 'lineups') { e.preventDefault(); broadcast.skip(); keyboard.drop(); held.add(e.code); return; }
    // A replay: any key ends it, and does nothing else.
    if (replays.playing) { e.preventDefault(); endReplay(); keyboard.drop(); held.add(e.code); return; }
    if (held.has(e.code)) { e.preventDefault(); keyboard.drop([e.code]); return; }
    const action = actionOf(keys, e.code);
    const onAMenu = game.state.phase === 'start' || game.paused;
    const listening = (game.state.phase === 'start' ? game.menu : game.pauseMenu).listening && onAMenu;
    // The quality and camera keys work on any screen, a held key counting once; but not while the Keys panel waits for
    // a key, and on a menu not when the key is one the menu itself uses.
    if (!e.repeat && !listening && !(onAMenu && MENU_KEYS.has(e.code))) {
      if (action === 'quality') stepQualityByHand();
      if (action === 'camera') switchCamera();
    }
    if (game.state.phase === 'start') {
      if (MENU_KEYS.has(e.code) || listening) e.preventDefault();
      if (!(e.repeat && (MENU_ONCE.has(e.code) || listening))) onMenu(e.code);
      return;
    }
    if (game.paused) {
      if (MENU_KEYS.has(e.code) || listening) e.preventDefault();
      if (!(e.repeat && (MENU_ONCE.has(e.code) || listening))) onPause(e.code);
      return;
    }
    if (!e.repeat && inPlay(game.state) && playListKey(game, e.code, keys)) {   // the play list, open over the match
      e.preventDefault();
      keyboard.drop([e.code]);   // a number that called a play is not also a move, if a move was put on it
      return;
    }
    if (action === 'timeout' && !e.repeat && inPlay(game.state)) callTimeout(game.state, 0);   // a timeout, when the rules allow one
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
  // The Keys panel's rows, over whichever menu opened it.
  document.querySelectorAll('#keyRows li').forEach((item, row) => {
    const panel = () => (game.state.phase === 'start' ? (game.menu.panel === 'keys' ? game.menu : null) : game.paused && game.pauseMenu.panel === 'keys' ? game.pauseMenu : null);
    item.addEventListener('mousemove', () => { const p = panel(); if (p && !p.listening) p.row = row; });
    item.addEventListener('click', () => {
      const p = panel();
      if (!p || p.listening) return;
      p.row = row;
      if (game.state.phase === 'start') onMenu('Enter'); else onPause('Enter');
    });
  });
  // Losing the window pauses a match in play; one already paused stays as it is.
  window.addEventListener('blur', () => { held.clear(); if (!game.paused) pause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !game.paused) pause(true); });

  let last = performance.now(), owed = 0, frameMs = 1000 / game.fps, wasReplaying = false;
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
    // The match waits while the line-ups are up, and runs slow for the last of a buzzer-beater's flight.
    const seconds = now / 1000, panel = broadcast.panel(state, seconds);
    // A replay that is set aside begins once play has stopped; the match waits while it plays.
    if (prefs.replays && !game.paused && panel !== 'lineups' && due(replays, state)) {
      startReplay(replays, state);
      replaySide = replays.playing.frames[replays.playing.frames.length - 1].ball.z >= 0 ? 1 : -1;
      actors.cut();
    }
    const shown = replays.playing && !game.paused ? frameAt(replays, elapsed) : null;   // the frame of the replay to draw, if one is on
    if (replays.playing === null && wasReplaying) { actors.cut(); view.setCamera(game.camera); }   // it has just ended
    wasReplaying = replays.playing !== null;
    owed = game.paused || panel === 'lineups' || shown ? 0 : owed + elapsed * slowFor(state);
    last = now;
    const before = state.time;
    for (; owed >= DT; owed -= DT) {
      const intents = aiIntents(state, DT);
      // The human replaces the computer for one player. His keys follow the camera, and keep their meaning through a
      // swing of the camera until they are let go.
      const keys = keyboard.intent();
      if (!keys.moveX && !keys.moveZ) heading = view.heading();
      intents[state.controlled] = steer(keys, heading);
      broadcast.hear(state, step(state, intents, DT));
      if (prefs.replays) { record(replays, state); settle(replays, state); }
      view.swayNets(state.ball, DT);   // at every step, so a ball moved far in one step is never swept through a net
    }
    // Motion advances by the match time that passed: none while paused. Before and after a match no match time
    // passes, so it advances by real time and the players stand breathing.
    const passed = inPlay(state) ? state.time - before : elapsed;
    const air = broadcast.frame(state, seconds, commentary());
    // A star moment is set aside for a replay: a game-winner from its basket, which came before the call.
    if (prefs.replays) for (const h of air.heard) if (h.star) mark(replays, h, h.kind === 'winner' ? state.last.score?.at ?? h.at : h.at);
    // Under the pause screen none of it shows.
    game.show = game.paused ? {} : shown ? { replay: true, caption: air.caption } : { banner: air.banner, lower: air.lower, caption: air.caption, panel };
    // In a replay the players and the ball are drawn as that frame has them, and the nets move with that ball.
    const drawn = shown ?? state;
    if (shown) view.swayNets(shown.ball, elapsed * 0.5);
    actors.sync(drawn, shown ? elapsed * 0.5 : passed, shown ? null : air);
    const real = game.paused ? 0 : elapsed;   // the crowd and the referees stand still with a paused game
    view.live(state, stepLife(life, state, real, air.heard), real);
    // From beside the hoop it happened at: the one the moment's team attacks, or for a block the one it defends.
    if (shown) view.replay(shown.ball, attackSign(replays.playing ? (replays.playing.kind === 'block' ? 1 - replays.playing.team : replays.playing.team) : shown.possession), replaySide);
    else view.follow(state.ball, attackSign(state.possession));
    view.watch(state);
    view.render();
    // Where the feet of the player you control are on the page, for his name; nothing before and after a match.
    const me = drawn.players[drawn.controlled];
    game.feet = inPlay(state) && !shown ? view.toScreen(me.x, 0, me.z) : null;
    // And where everyone's feet are, for the star, the flame and the ice cube under those who have one.
    game.spots = inPlay(state) && !shown ? state.players.map(p => view.toScreen(p.x, 0, p.z)) : null;
    const m = shown ? null : shotMeter(state);
    game.meter = m && { ...m, head: view.toScreen(m.x, SHOT_METER.high, m.z) };
    game.missing = view.missing;
    hud.update(state, view.backend, game);
    hud.show(shown ? null : state.phase === 'start' ? 'start' : state.phase === 'final' ? 'final' : game.paused ? 'pause' : null);   // the final screen waits for a last replay
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
