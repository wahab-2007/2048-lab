'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Game, fresh, merge, parse, load, save, template, count, STORAGE_KEY } = require('../state.js');
const { ELEMENTS, CATEGORIES, elementPosition } = require('../elements.js');

const timestamp = new Date('2026-11-18T10:00:00.000Z');
const gameAt = () => new Game(fresh(), () => timestamp);
const roundTrip = state => parse(JSON.stringify(state));

function firstMerge(game) {
  game.act('generate', 0);
  game.act('generate', 15);
  return game.act('place', 0, 15);
}

test('valid merge sums and out-of-range values', () => {
  for (const [a, b, sum] of [[1, 1, 2], [1, 2, 3], [8, 10, 18], [20, 26, 46], [36, 54, 90],
    [113, 5, 118], [117, 1, 118], [92, 29, null], [0, 1, null], [1.5, 2, null], ['1', 1, null]]) {
    assert.equal(merge(a, b), sum, `${a} + ${b}`);
  }
});

test('generation requires empty cells and moving preserves the atom', () => {
  const game = gameAt();
  assert.equal(game.act('generate', 0).discovery, true);
  assert.equal(game.act('generate', 0), null);
  assert.equal(game.act('place', 0, 0), null);
  assert.equal(game.act('place', 0, 16), null);
  assert.equal(game.act('place', 0, 15).type, 'move');
  assert.deepEqual(game.board.filter(Boolean), [1]);
  assert.equal(game.board[15], 1);
  assert.equal(game.state.stats.hydrogenGenerated, 1);
  game.undo();
  assert.equal(game.board[0], 1);
  assert.equal(game.board[15], null);
  game.undo();
  assert.ok(game.board.every(cell => cell === null));
  assert.equal(game.state.stats.hydrogenGenerated, 0);
  assert.deepEqual(game.state.discovered, [1]);
});

test('remote merges update stats and undo preserves discovery and milestones', () => {
  const game = gameAt();
  const event = firstMerge(game);
  assert.equal(event.number, 2);
  assert.equal(event.discovery, true);
  assert.equal(game.board[0], null);
  assert.equal(game.board[15], 2);
  assert.equal(game.state.stats.merges, 1);
  assert.equal(game.state.timeline.length, 2);
  assert.deepEqual(game.state.timeline[1].inputs, [1, 1]);
  assert.ok(game.undo());
  assert.equal(game.state.stats.merges, 0);
  assert.deepEqual(game.board.filter(Boolean), [1, 1]);
  assert.deepEqual(game.state.discovered, [1, 2]);
  assert.ok(game.state.achievements.includes('reaction'));
  assert.equal(game.act('place', 0, 15).discovery, false);
  assert.equal(game.state.timeline.length, 2);
  assert.deepEqual(roundTrip(game.state), game.state);
});

test('invalid merges preserve both inputs and do not create undo records', () => {
  const game = gameAt();
  game.board[0] = 92;
  game.board[1] = 29;
  assert.equal(game.act('place', 0, 1).type, 'invalid');
  assert.deepEqual(game.board.slice(0, 2), [92, 29]);
  assert.equal(game.undo(), false);
  assert.equal(game.state.stats.merges, 0);
});

test('store, retrieve, delete and undo conserve quantities', () => {
  const game = gameAt();
  firstMerge(game);
  game.act('store', 15);
  assert.equal(count(game.state, 2), 1);
  assert.equal(game.board[15], null);
  assert.ok(game.undo());
  assert.equal(count(game.state, 2), 0);
  assert.equal(game.board[15], 2);
  game.act('store', 15);
  game.act('generate', 15);
  assert.equal(game.act('retrieve', 15, 2), null);
  game.act('retrieve', 0, 2);
  assert.equal(count(game.state, 2), 0);
  assert.equal(game.act('retrieve', 1, 2), null);
  assert.deepEqual(game.board.filter(Boolean), [2, 1]);
  assert.ok(game.undo());
  assert.equal(count(game.state, 2), 1);
  assert.equal(game.board[0], null);
  game.act('delete', 15);
  assert.equal(game.board[15], null);
  assert.equal(count(game.state, 1), 0);
  assert.ok(game.undo());
  assert.equal(game.board[15], 1);
  assert.deepEqual(game.state.discovered, [1, 2]);
  assert.deepEqual(roundTrip(game.state), game.state);
});

test('every element is reachable and the certificate records the completion snapshot', () => {
  const game = gameAt();
  game.act('generate', 0);
  for (let n = 2; n <= 118; n++) {
    game.act('generate', 15);
    assert.equal(game.act('place', 15, 0).number, n);
  }
  assert.equal(game.state.discovered.length, 118);
  assert.equal(game.state.achievements.length, 10);
  assert.deepEqual(game.state.completion, {
    date: timestamp.toISOString(), theme: 'midnight', stats: { merges: 117, hydrogenGenerated: 118 }
  });
  game.undo();
  assert.equal(game.board[0], 117);
  assert.equal(game.state.completion.stats.merges, 117);
  assert.deepEqual(roundTrip(game.state), game.state);
});

test('favourites have a five-entry limit and never grant copies', () => {
  const game = gameAt();
  game.act('generate', 0);
  for (let n = 2; n <= 6; n++) {
    game.act('generate', 1);
    game.act('place', 1, 0);
  }
  for (let n = 1; n <= 5; n++) assert.ok(game.favourite(n));
  assert.equal(game.favourite(6), false);
  assert.ok(game.favourite(1));
  assert.ok(game.favourite(6));
  assert.deepEqual(game.state.favourites, [2, 3, 4, 5, 6]);
  assert.deepEqual(game.state.inventory, {});
});

test('full registry has 118 unique symbols, facts and periodic positions', () => {
  assert.equal(ELEMENTS.length, 118);
  assert.equal(Object.keys(CATEGORIES).length, 10);
  for (const key of ['symbol', 'name', 'funFact']) assert.equal(new Set(ELEMENTS.map(e => e[key])).size, 118);
  const occupied = new Set();
  const core = { He: 2, Ne: 10, Ar: 18, Kr: 36, Xe: 54, Rn: 86 };
  for (const [index, e] of ELEMENTS.entries()) {
    assert.equal(e.atomicNumber, index + 1);
    assert.match(e.symbol, /^[A-Z][a-z]?$/);
    assert.match(e.atomicWeight, /^(\d+(\.\d+)?|\[\d+\])$/);
    assert.ok(Object.hasOwn(CATEGORIES, e.category));
    for (const key of ['crystalStructure', 'oxideAcidBase', 'group']) assert.ok(Object.hasOwn(e, key));
    for (const key of ['description', 'electronConfiguration', 'physicalState', 'funFact']) assert.ok(e[key]);
    const condensed = e.electronConfiguration;
    const coreSymbol = condensed.match(/^\[(\w+)\]/)?.[1];
    const electrons = [...condensed.matchAll(/[spdf](\d+)/g)].reduce((sum, m) => sum + Number(m[1]), core[coreSymbol] ?? 0);
    assert.equal(electrons, e.atomicNumber, e.name);
    const [column, row] = elementPosition(e.atomicNumber);
    assert.ok(column >= 1 && column <= 18 && row >= 1 && row <= 9, e.name);
    assert.ok(!occupied.has(column + ':' + row), e.name);
    occupied.add(column + ':' + row);
  }
  for (const [n, symbol, position] of [[1, 'H', [1, 1]], [2, 'He', [18, 1]], [57, 'La', [3, 8]],
    [80, 'Hg', [12, 6]], [103, 'Lr', [17, 9]], [118, 'Og', [18, 7]]]) {
    assert.equal(ELEMENTS[n - 1].symbol, symbol);
    assert.deepEqual(elementPosition(n), position);
  }
});

test('autosave, export and import round-trip major state', () => {
  const stateStore = new Map();
  const storage = { getItem: key => stateStore.get(key) ?? null, setItem: (key, value) => stateStore.set(key, value) };
  const game = gameAt();
  firstMerge(game);
  game.act('store', 15);
  game.favourite(2);
  game.state.settings.theme = 'ivory';
  game.state.tutorial = 5;
  assert.ok(save(storage, game.state));
  assert.deepEqual(load(() => storage).state, game.state);
  assert.deepEqual(parse(stateStore.get(STORAGE_KEY)), game.state);
});

test('bad saves are rejected and storage failures remain recoverable through JSON', () => {
  const game = gameAt();
  firstMerge(game);
  for (const corrupt of ['{', null, { version: 8 }, { board: [1] }, { board: Array(16).fill(119) },
    { inventory: { 2: -1 } }, { favourites: [3] }, { timeline: [] }, { board: Array(16).fill(3) }]) {
    assert.throws(() => parse(typeof corrupt === 'string' ? corrupt : JSON.stringify({ ...game.state, ...corrupt,
      ...(corrupt === null ? { version: null } : {}) })));
  }
  const corruptStorage = { getItem: () => '{', setItem: () => { throw new Error(); } };
  assert.ok(load(() => corruptStorage).blocked);
  const denied = load(() => { throw new Error('denied'); });
  assert.ok(denied.issue);
  assert.equal(denied.storage, null);
  assert.equal(save(denied.storage, game.state), false);
  assert.equal(save(corruptStorage, game.state), false);
  assert.deepEqual(roundTrip(game.state), game.state);
});

test('every daily template is solvable and challenge results persist separately', () => {
  const recipes = { 18: [4, 6, 8], 26: [11, 15], 50: [10, 14, 12, 14], 36: [4, 8, 8, 16],
    55: [12, 14, 16, 13], 118: [28, 34, 56] };
  const exercised = new Set();
  const game = gameAt();
  firstMerge(game);
  const sandbox = [...game.board];
  for (let offset = 1; offset <= 6; offset++) {
    const day = `2026-11-0${offset}`;
    const { target } = template(day);
    exercised.add(target);
    assert.ok(game.startChallenge(day));
    assert.equal(game.act('generate', 2), null);
    const [first, ...remaining] = recipes[target];
    const accumulator = game.board.indexOf(first);
    let result;
    for (const n of remaining) {
      const next = game.board.findIndex((value, index) => value === n && index !== accumulator);
      result = game.act('place', next, accumulator);
    }
    assert.ok(result.challengeComplete);
    assert.equal(game.round.best, remaining.length);
    assert.deepEqual(roundTrip(game.state), game.state);
    assert.ok(game.undo());
    assert.equal(game.round.best, remaining.length);
    assert.deepEqual(roundTrip(game.state), game.state);
    game.startChallenge(day, true);
    assert.equal(game.round.merges, 0);
    assert.equal(game.round.best, remaining.length);
    game.leaveChallenge();
    assert.deepEqual(game.board, sandbox);
  }
  assert.equal(exercised.size, 6);
  assert.deepEqual(game.state.discovered, [1, 2]);
});
