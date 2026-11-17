import { attackSign, createMatch, setLength } from './sim/state.js';
import { step } from './sim/step.js';
import { callTimeout, startMatch } from './sim/rules.js';
import { setStyle } from './sim/styles.js';
import { STEPS, createTutorial, handBack, idle, keepPractising, stepTutorial, tutorialSpot } from './tutorial.js';
import { aiIntents } from './sim/ai.js';
import { DT, isHuman } from './sim/tuning.js';
import { quickMatch } from './sim/quick/engine.js';
import { createScene } from './render/scene.js';
import { createActors } from './render/actors.js';
import { shotMeter, SHOT_METER } from './render/meter.js';
import { loadPeople } from './render/people.js';
import { createHud, easeFrame } from './render/hud.js';
import { createQuality, autoQuality, stepQuality, nextRenderer } from './render/quality.js';
import { createKeyboard, steer } from './input.js';
import { createPauseMenu, inPlay, pauseKey, pauseHasRow, pausePoint, quitToMenu, setPaused } from './pause.js';
import { createMenu, matchTeams, menuKey, menuPoint, menuHasRow, pickableSelect, resultKey, startFromMenu } from './menu.js';
import { createStudio } from './render/studio.js';
import { createPlayList, playListKey } from './playlist.js';
import { createLife, stepLife } from './render/life.js';
import { actionOf, createKeys, savedKeys } from './keys.js';
import { readPrefs, storageOf, writePrefs } from './prefs.js';
import { createBroadcast } from './broadcast/broadcast.js';
import { PANELS } from './broadcast/director.js';
import { nextCommentary } from './broadcast/commentary.js';
import { slowFor } from './broadcast/moments.js';
import { createEars, frameCues, listen } from './audio/cues.js';
import { createPlayer, nextSound } from './audio/player.js';
import { SOUNDS, assetUrl, soundPath } from './render/assets.js';
import { createLoading } from './render/loading.js';
import { clear as clearReplays, createRecorder, decode, due, frameAt, mark, record, settle, skip as skipReplay, start as startReplay } from './replay.js';

const MAX_FRAME = 0.1;   // seconds: after a stall, never simulate more than this to catch up
const YOU_MARK = 2.5;    // metres above the floor the pointer over the player you control is put
const newMatch = (size, teams = [0, 1]) => createMatch(Date.now() % 1e6, size, teams);   // size: 3 or 5 a side (three when not said); teams by id
const MENU_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyR', 'Enter', 'Space', 'Escape', 'Backspace']);   // R: Team Select's random teams
const MENU_ONCE = new Set(['Enter', 'Space', 'Escape', 'Backspace', 'KeyR']);   // a held one counts once; the bar keys may repeat
// How long after the last press of the Renderer row the game restarts with the new renderer (milliseconds).
const RESTART_WAIT = 1500;

// The dev teams (the Waves and the Scorpions) may be picked only on a link ending #dev.
const devLink = () => window.location.hash === '#dev';
const chosen = matchTeams(pickableSelect(readPrefs(storageOf()).select, devLink()));   // the teams Team Select had last time
// The loading screen, up from the start (index.html) until the game can be played: the arena first, then the players.
const loading = createLoading(document);
loading.show('Loading the arena…');
// Makes the players (`made`, see people.js) of a match between `ids` with side `home` at home, the loading screen
// counting them as they come. Resolves once all are made; rejects as prepare does.
const loadPlayers = async (made, ids, home) => {
  const tick = () => { const { done, total } = made.count(ids, home); loading.show(`Loading the players… ${done} of ${total}`, total ? done / total : 1); };
  tick();
  const timer = setInterval(tick, 100);
  try { await made.prepare(ids, home); } finally { clearInterval(timer); tick(); }
};
// The renderer the player chose in Settings (Graphics), as it was when the page opened: another one needs a fresh page.
const drawingWith = readPrefs(storageOf()).renderer;
const view = await createScene(document.getElementById('court'), chosen.teams, chosen.home, drawingWith);
if (!view) loading.hide();   // the page says why there is no game
if (view) {
  // The generated players, and those of the two teams Team Select had. If their files are missing or broken the
  // match is still playable, with capsules.
  const people = await loadPeople(view.camera).then(async made => { await loadPlayers(made, chosen.teams, chosen.home); return made; })
    .catch(error => { console.warn('Players could not be loaded; using capsules.', error); return null; });
  const actors = createActors(view.scene, people);
  const studio = createStudio(view.renderer, people, view.scene.environment);   // Team Select's picture
  const hud = createHud(document);
  // What was saved the last time, and the keys as they were left. Both are kept up to date and saved at every change.
  const storage = storageOf(), prefs = readPrefs(storage);
  const keys = createKeys(prefs.keys);
  const keyboard = createKeyboard(window, keys);
  const quality = createQuality();
  if (prefs.quality) { quality.level = prefs.quality; quality.settled = true; }   // a level you chose is yours: the game leaves it alone
  // pick: the roster row chosen first on the pause screen. quality: the level the game is drawn at, one of QUALITY.order.
  // meter: the shot meter and where its top is on the page, or null. menu: the start menu. pauseMenu: the pause menu.
  // loading: Exhibition was chosen and the two teams' players are still being made (see start). tutorial: the tutorial
  // on (see tutorial.js), or null.
  // camera: '2k', behind the team with the ball, or 'broadcast', the sideline view. mode: the match on is 'play' (yours)
  // or 'watch' (nobody's). result: a simulated game shown over the menu, or null.
  const game = { state: Object.assign(newMatch(prefs.size, chosen.teams), { home: chosen.home }), paused: false, pick: null, fps: 60, quality: quality.level, camera: prefs.camera, meter: null, menu: createMenu(prefs, devLink()),
    pauseMenu: createPauseMenu(), playList: createPlayList(), keys, prefs, show: {}, mode: 'play', result: null, loading: false, tutorial: null };
  globalThis.game = game;   // handle for poking at the match from the browser console
  // Adding #dev to the link, or taking it off, shows or hides the dev teams at once.
  window.addEventListener('hashchange', () => { game.menu.dev = devLink(); game.menu.select = pickableSelect(game.menu.select, game.menu.dev); });

  // The broadcast: big moments, the commentator, the panels. It only watches.
  const broadcast = createBroadcast();
  game.hasVoice = broadcast.voice.available;
  // The commentary as it can be here: where the browser has no voice, voice and captions is captions only.
  const commentary = () => (prefs.commentary === 'voice' && !broadcast.voice.available ? 'captions' : prefs.commentary);
  const stepCommentary = () => { prefs.commentary = nextCommentary(commentary(), broadcast.voice.available); if (prefs.commentary !== 'voice') broadcast.hush(); };
  // Sound: the ball, the rim, shoes, whistles and the crowd. It is fetched now and starts with the first key press
  // or click, as browsers require.
  const audio = createPlayer(), ears = createEars();
  audio.load(name => assetUrl(soundPath(name)), SOUNDS);
  audio.level(prefs.sound);
  game.audio = audio;   // for looking at from the browser console, like the game itself
  const stepSound = () => { prefs.sound = nextSound(prefs.sound); audio.level(prefs.sound); };
  window.addEventListener('pointerdown', () => audio.wake());
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
    const { size, select, difficulty, autoSubs, play, watch, simulate, sliders } = game.menu;
    // The camera chosen in Play is the one kept: Watch starts on the broadcast view without changing it.
    const camera = game.mode === 'watch' ? prefs.camera : game.camera;
    Object.assign(prefs, { size, select: { ...select }, difficulty, autoSubs, camera, keys: savedKeys(keys), play: { ...play }, watch: { ...watch }, simulate: { ...simulate },
      sliders: { arcade: { ...sliders.arcade }, sim: { ...sliders.sim } } });
    if (chose) prefs.quality = quality.level;
    writePrefs(storage, prefs);
  };
  const stepQualityByHand = () => { stepQuality(quality); showQuality(); remember(true); };
  const stepReplays = () => { prefs.replays = !prefs.replays; if (!prefs.replays) clearReplays(replays); };
  const stepInfo = () => { prefs.info = !prefs.info; };   // the frame rate in the corner and the keys' line: shown or hidden
  // The renderer: Auto, WebGPU or WebGL 2, saved at once. Another one than the page opened with takes a fresh page: the
  // game restarts RESTART_WAIT ms after the last press, so that stepping past a choice does not restart it twice.
  let restart = null;
  const stepRenderer = () => {
    prefs.renderer = nextRenderer(prefs.renderer);
    remember();
    clearTimeout(restart);
    game.restarting = prefs.renderer !== drawingWith;
    if (game.restarting) restart = setTimeout(() => window.location.reload(), RESTART_WAIT);
  };
  const switchCamera = () => { game.camera = game.camera === '2k' ? 'broadcast' : '2k'; view.setCamera(game.camera); remember(); };
  view.setCamera(game.camera);
  const life = createLife();   // the crowd's mood
  let heading = view.heading();   // what up the screen means to the movement keys

  // Starts play, from the menu or the final screen. startFromMenu drops the keys held then, which relies on the
  // keyboard's own keydown listener (createKeyboard, above) being registered before the one below, so the key that
  // chose Play is already held when it is dropped.
  // Between the teams Team Select has: yours against the computer ('play'), on your camera, with your controller on a
  // side; the computer against itself ('watch'), from the sideline, with it in the middle. In the home team's arena.
  // It waits for the two teams' players to be made (see people.prepare), with the menu up and its keys shut.
  const start = async () => {
    if (game.loading) return;   // already on its way
    game.loading = true;
    const pick = matchTeams(game.menu.select);
    if (people) await loadPlayers(people, pick.teams, pick.home).catch(error => console.warn(error));
    loading.hide();
    game.loading = false;
    game.mode = startFromMenu(game, keyboard, newMatch);
    view.setTeams(game.state.ids, game.state.home);
    game.camera = game.mode === 'watch' ? 'broadcast' : prefs.camera;
    view.setCamera(game.camera);
  };
  // The tutorial: a practice three on three in your team's arena (Team Select's home team), the other team standing
  // aside, the ball yours, a step at a time (see tutorial.js). It waits for the players as Exhibition does.
  const startTutorial = async () => {
    if (game.loading) return;
    game.loading = true;
    const teams = [game.menu.select.home, game.menu.select.away];
    if (people) await loadPlayers(people, teams, 0).catch(error => console.warn(error));
    loading.hide();
    game.loading = false;
    const s = Object.assign(newMatch(3, teams), { home: 0, humans: [0] });
    setLength(s, 12); setStyle(s, 'arcade', game.menu.sliders.arcade); startMatch(s);
    Object.assign(s, { autoSubs: [false, false], timeouts: [0, 0], difficulty: game.menu.difficulty });
    handBack(s);
    Object.assign(game, { state: s, tutorial: createTutorial(s), mode: 'play', result: null });
    view.setTeams(s.ids, 0);
    game.camera = prefs.camera; view.setCamera(game.camera);
    keyboard.drop();
  };
  // Leaves the tutorial for the main menu.
  const endTutorial = () => { game.tutorial = null; quitToMenu(game, keyboard, waiting); };
  // A match waiting to begin between the teams Team Select has, for the menu (its Teams panel shows them).
  const waiting = size => { const pick = matchTeams(game.menu.select); return Object.assign(newMatch(size, pick.teams), { home: pick.home }); };
  // Simulate: a whole game by the fast engine, Simulation with its sliders, at Simulate's quarters and the menu's mode,
  // between the teams Team Select has, the away team first.
  const simulate = () => {
    const { away, home } = game.menu.select;
    game.result = quickMatch({ seed: Date.now() % 1e6, size: game.menu.size, minutes: game.menu.simulate.minutes, style: 'sim', sliders: game.menu.sliders.sim, teams: [away, home] });
  };
  // A key on the start menu, or a click on a row (as Enter).
  const onMenu = code => {
    if (game.loading) return;
    const asked = menuKey(game.menu, code, keys);
    if (asked === 'exhibition') start();
    else if (asked === 'tutorial') startTutorial();
    else if (asked === 'select') game.state = waiting(game.menu.size);
    else if (asked === 'simulate') simulate();
    else if (asked === 'quality') stepQualityByHand();
    else if (asked === 'camera') switchCamera();
    else if (asked === 'commentary') stepCommentary();
    else if (asked === 'replays') stepReplays();
    else if (asked === 'sound') stepSound();
    else if (asked === 'info') stepInfo();
    else if (asked === 'renderer') stepRenderer();
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
    else if (asked === 'sound') stepSound();
    else if (asked === 'info') stepInfo();
    else if (asked === 'quit') {
      game.tutorial = null;
      quitToMenu(game, keyboard, waiting);
      if (game.mode === 'watch') { game.mode = 'play'; game.camera = prefs.camera; view.setCamera(game.camera); }   // back to your own camera
    }
    remember();
    if (listened || asked === 'keys') keyboard.drop();   // the key just given to an action does nothing until let go
  };

  const held = new Set();   // keys pressed to take a panel down, ignored until they are let go
  window.addEventListener('keyup', e => held.delete(e.code));
  window.addEventListener('keydown', e => {
    audio.wake();
    // A panel (the line-ups, the end of a period, half-time): any key takes it down, and that key does nothing
    // else, now or while it is held.
    if (PANELS.includes(game.show.panel)) { e.preventDefault(); broadcast.skip(); keyboard.drop(); held.add(e.code); return; }
    // A replay: any key ends it, and does nothing else.
    if (replays.playing) { e.preventDefault(); endReplay(); keyboard.drop(); held.add(e.code); return; }
    // A close-up in dead time (see broadcast/cinema.js): any key ends it, and does what it does.
    broadcast.skipClose();
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
    // A simulated game's result: Enter simulates another, Esc goes back to the menu.
    if (game.result && game.state.phase === 'start') {
      if (MENU_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      const asked = resultKey(e.code);
      if (asked === 'simulate') simulate();
      else if (asked === 'back') game.result = null;
      return;
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
    const yours = isHuman(game.state, 0);   // in Watch there is no play list and no timeout key: nobody's team to call them for
    if (yours && !e.repeat && inPlay(game.state) && playListKey(game, e.code, keys)) {   // the play list, open over the match
      e.preventDefault();
      keyboard.drop([e.code]);   // a number that called a play is not also a move, if a move was put on it
      return;
    }
    if (yours && action === 'timeout' && !e.repeat && inPlay(game.state) && !game.tutorial) callTimeout(game.state, 0);   // a timeout, when the rules allow one
    if (e.code === 'Escape' && !e.repeat) pause(true);
    if (e.code === 'Enter' && !e.repeat && game.tutorial && game.tutorial.step >= STEPS.length) endTutorial();   // done: back to the menu
    if (e.code === 'Enter' && game.state.phase === 'final') start();   // the same again: the same teams, played or watched
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
    // A replay comes first: while one is on, or a moment is about to be set aside for one, a panel waits its turn.
    const replaysOn = prefs.replays && !game.tutorial;   // no replays in the tutorial
    const seconds = now / 1000, busy = replaysOn && !game.paused && !!(replays.playing || replays.waiting || due(replays, state));
    const panel = broadcast.panel(state, seconds, busy);
    // A replay that is set aside begins once play has stopped; the match waits while it plays.
    const holding = PANELS.includes(panel);
    if (replaysOn && !game.paused && due(replays, state)) {
      startReplay(replays, state);
      replaySide = decode(replays.playing.frames[replays.playing.frames.length - 1]).ball.z >= 0 ? 1 : -1;
      actors.cut();
    }
    const shown = replays.playing && !game.paused ? frameAt(replays, elapsed) : null;   // the frame of the replay to draw, if one is on
    if (replays.playing === null && wasReplaying) { actors.cut(); view.setCamera(game.camera); }   // it has just ended
    wasReplaying = replays.playing !== null;
    owed = game.paused || holding || shown ? 0 : owed + elapsed * slowFor(state);
    last = now;
    const before = state.time;
    for (; owed >= DT; owed -= DT) {
      const intents = aiIntents(state, DT);
      if (game.tutorial) idle(state, intents);   // the other team stands aside
      // The human replaces the computer for one player. His keys follow the camera, and keep their meaning through a
      // swing of the camera until they are let go.
      const keys = keyboard.intent();
      if (!keys.moveX && !keys.moveZ) heading = view.heading();
      if (isHuman(state, 0)) intents[state.controlled] = steer(keys, heading);   // in Watch nobody's keys are read
      const events = step(state, intents, DT);
      if (game.tutorial) { stepTutorial(game.tutorial, state, keys); keepPractising(game.tutorial, state); }
      broadcast.hear(state, events);
      listen(ears, state, events);
      if (replaysOn) { record(replays, state); settle(replays, state); }
      view.swayNets(state.ball, DT);   // at every step, so a ball moved far in one step is never swept through a net
    }
    // Motion advances by the match time that passed: none while paused. Before and after a match no match time
    // passes, so it advances by real time and the players stand breathing.
    const passed = inPlay(state) ? state.time - before : elapsed;
    const air = broadcast.frame(state, seconds, commentary(), busy || !!shown || game.paused || !!game.tutorial);
    // A star moment is set aside for a replay: a game-winner from its basket, which came before the call.
    if (replaysOn) for (const h of air.heard) if (h.star) mark(replays, h, h.kind === 'winner' ? state.last.score?.at ?? h.at : h.at);
    // Under the pause screen none of it shows.
    game.show = game.paused ? {} : shown ? { replay: true, caption: air.caption } : { banner: air.banner, lower: air.card ?? air.lower, caption: air.caption, panel };   // a close-up's card in place of the small card
    // In a replay the players and the ball are drawn as that frame has them, and the nets move with that ball.
    const drawn = shown ?? state;
    if (shown) view.swayNets(shown.ball, elapsed * 0.5);
    actors.sync(drawn, shown ? elapsed * 0.5 : passed, shown ? null : air);
    actors.spot(game.tutorial && !shown ? tutorialSpot(game.tutorial, state) : null);   // the tutorial's spot to reach
    const real = game.paused ? 0 : elapsed;   // the crowd and the referees stand still with a paused game
    const mood = stepLife(life, state, real, air.heard);
    view.live(state, mood, real);
    // What is heard this frame: each sound at most once, and none over a replay or a pause; the crowd's two loops.
    const cues = frameCues(ears, state, air.heard, mood), played = new Set();
    audio.hush(game.paused);
    if (!game.paused && !shown) for (const c of cues.shots) if (!played.has(c.name)) { played.add(c.name); audio.play(c.name, c.gain, c.rate); }
    audio.loop('murmur', cues.bed); audio.loop('distract', cues.distract);
    // From beside the hoop it happened at: the one the moment's team attacks, or for a block the one it defends.
    if (shown) view.replay(shown.ball, attackSign(replays.playing ? (replays.playing.kind === 'block' ? 1 - replays.playing.team : replays.playing.team) : shown.possession), replaySide);
    else view.follow(state.ball, attackSign(state.possession), state, air.close);   // with a close-up, the camera eases to it and back
    view.watch(state);
    if (state.phase === 'start' && game.menu.panel === 'teamSelect' && !game.result) studio.render(game.menu.select, elapsed);   // the two teams' stars
    else {
      // On the menu, the waiting match's players not made yet (its teams just chosen) come on as they are made.
      if (people && state.phase === 'start' && !people.ready(state.ids, state.home)) people.prepare(state.ids, state.home);
      view.render();
    }
    // Where the feet of the player you control are on the page, for his name; nothing before and after a match.
    const me = drawn.players[drawn.controlled];
    game.feet = inPlay(state) && !shown ? view.toScreen(me.x, 0, me.z) : null;
    // And over his head (YOU_MARK above the floor, over the tallest player's hair, and up with him in a jump).
    game.head = inPlay(state) && !shown ? view.toScreen(me.x, me.y + YOU_MARK, me.z) : null;
    // And where everyone's feet are, for the star, the flame and the ice cube under those who have one.
    game.spots = inPlay(state) && !shown ? state.players.map(p => view.toScreen(p.x, 0, p.z)) : null;
    const m = shown ? null : shotMeter(state);
    game.meter = m && { ...m, head: view.toScreen(m.x, SHOT_METER.high, m.z) };
    game.missing = view.missing;
    hud.update(state, view.backend, game);
    hud.show(shown ? null : state.phase === 'start' ? (game.result ? 'result' : game.menu.panel === 'teamSelect' ? 'select' : 'start') : state.phase === 'final' ? 'final' : game.paused ? 'pause' : null);   // the final screen waits for a last replay
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // The splash asks for a key, a click or a tap, and fades into the menu; that first touch wakes the sound too.
  loading.ready(window, matchMedia('(pointer: coarse)').matches).then(() => audio.wake());
}
