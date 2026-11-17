import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { createPlayList, playListKey, playListRows } from '../src/playlist.js';
import { createHud } from '../src/render/hud.js';
import { stepPlays } from '../src/sim/plays.js';
import { giveBall } from '../src/sim/players.js';
import { DT } from '../src/sim/tuning.js';
import { live, at } from './helpers.js';

const game = size => ({ state: live(1, size), playList: createPlayList() });

test('T opens and closes the play list, and no other key is the list\'s while it is closed', () => {
  const g = game(5);
  assert.deepEqual([playListKey(g, 'Digit1'), playListKey(g, 'Escape'), g.playList.open], [false, false, false]);
  assert.deepEqual([playListKey(g, 'KeyT'), g.playList.open], [true, true]);
  assert.deepEqual([playListKey(g, 'KeyT'), g.playList.open], [true, false]);
});

test('with the list open a number calls that play for your team and closes it; Escape closes it without a call', () => {
  const g = game(5);
  playListKey(g, 'KeyT');
  assert.deepEqual([playListKey(g, 'KeyW'), g.playList.open], [false, true]);   // the match goes on under it
  assert.deepEqual([playListKey(g, 'Digit4'), g.playList.open, g.state.playCall], [true, false, ['horns', null]]);
  playListKey(g, 'KeyT'); playListKey(g, 'Digit0');
  assert.equal(g.state.playCall[0], 'ucla');                                    // 0 is the tenth
  playListKey(g, 'KeyT'); playListKey(g, 'Minus');
  assert.equal(g.state.playCall[0], 'dho');                                     // then - and =
  playListKey(g, 'KeyT'); playListKey(g, 'Equal');
  assert.equal(g.state.playCall[0], 'flare');
  playListKey(g, 'KeyT'); g.state.playCall[0] = null;
  assert.deepEqual([playListKey(g, 'Escape'), g.playList.open, g.state.playCall[0]], [true, false, null]);
  const three = game(3);
  playListKey(three, 'KeyT');
  assert.deepEqual([playListKey(three, 'Digit9'), three.playList.open, three.state.playCall[0]], [false, true, null]);   // three a side has seven plays
  assert.deepEqual([playListKey(three, 'Digit7'), three.state.playCall[0]], [true, 'flare']);
});

test('the list names the plays of the match\'s size, each with its key', () => {
  assert.deepEqual(playListRows(createMatch(1, 3)), ['1 · Pick & Roll', '2 · Pick & Pop', '3 · Clear Out', '4 · Post Up', '5 · Give & Go', '6 · Handoff', '7 · Flare Screen']);
  assert.equal(playListRows(createMatch(1, 5)).length, 12);
  assert.deepEqual(playListRows(createMatch(1, 5)).slice(9), ['0 · UCLA Cut', '- · Handoff', '= · Flare Screen']);
});

test('the page shows the list while it is open, and the name and the hint of the play your team is running', () => {
  const els = {}, doc = { getElementById: id => (els[id] ??= { textContent: '', hidden: false, style: {} }) };
  const hud = createHud(doc), g = game(5), show = () => hud.update(g.state, 'webgl2', { paused: false, pick: null, playList: g.playList });
  at(g.state, 0, 5, 0); giveBall(g.state, g.state.players[0]); g.state.playWait = [Infinity, Infinity];
  show();
  assert.deepEqual([els.playList.hidden, els.playName.hidden], [true, true]);
  playListKey(g, 'KeyT'); show();
  assert.deepEqual([els.playList.hidden, els.playRow0.textContent, els.playRow9.textContent, els.playRow11.textContent], [false, '1 · Pick & Roll', '0 · UCLA Cut', '= · Flare Screen']);
  playListKey(g, 'Digit1'); stepPlays(g.state, DT); show();
  assert.deepEqual([els.playList.hidden, els.playName.hidden, els.playName.textContent], [true, false, 'Pick & Roll · Use the screen, then hit the roller or score']);
  const three = game(3); playListKey(three, 'KeyT');
  hud.update(three.state, 'webgl2', { paused: false, pick: null, playList: three.playList });
  assert.deepEqual([els.playRow6.hidden, els.playRow7.hidden], [false, true]);
});
