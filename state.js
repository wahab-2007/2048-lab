'use strict';

const Cesium = (() => {
  const elements = typeof module === 'object' ? require('./elements.js').ELEMENTS : ELEMENTS;
  const THEMES = ['midnight', 'ivory', 'graphite', 'aurora', 'sepia'];
  const SETTINGS = Object.freeze({
    theme: 'midnight', sound: true, soundEffects: true, volume: 0.35,
    ambience: false, ambientVolume: 0.18, effects: true, particles: true,
    intensity: 'subtle', reducedMotion: false, zen: false, preview: true
  });
  const SIZE = 16;
  const LIMIT = 118;
  const STORAGE_KEY = 'cesium-save-v1';
  const DAY = 86400000;
  const blankBoard = () => Array(SIZE).fill(null);
  const statistics = () => ({ merges: 0, hydrogenGenerated: 0 });
  const isElement = n => Number.isInteger(n) && n >= 1 && n <= LIMIT;
  const isCell = i => Number.isInteger(i) && i >= 0 && i < SIZE;
  const isCount = n => Number.isSafeInteger(n) && n >= 0;
  const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const isDate = x => typeof x === 'string' && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
  const isDay = x => /^\d{4}-\d{2}-\d{2}$/.test(x) && isDate(x + 'T00:00:00.000Z');
  const utcDay = (date = new Date()) => date.toISOString().slice(0, 10);
  const validBoard = board => Array.isArray(board) && board.length === SIZE && board.every(n => n === null || isElement(n));
  const count = (state, n) => state.inventory[n] || 0;
  const merge = (a, b) => isElement(a) && isElement(b) && a + b <= LIMIT ? a + b : null;

  const MILESTONES = [
    ['reaction', 'First Reaction', 'Complete your first merge.', s => s.stats.merges > 0],
    ['helium', 'The Noble Beginning', 'Discover helium.', s => s.discovered.includes(2)],
    ['ten', 'Ten Elements', 'Discover ten elements.', s => s.discovered.length >= 10],
    ['noble', 'Noble Collector', 'Discover all group 18 elements.', s => familyComplete(s, 'noble-gas')],
    ['halogen', 'Halogen Specialist', 'Discover all halogens.', s => familyComplete(s, 'halogen')],
    ['mercury', 'Heavy Metal', 'Discover mercury.', s => s.discovered.includes(80)],
    ['uranium', 'The Nuclear Age', 'Discover uranium.', s => s.discovered.includes(92)],
    ['half', 'Halfway There', 'Discover 59 elements.', s => s.discovered.length >= 59],
    ['oganesson', 'Beyond the Periodic Frontier', 'Discover oganesson.', s => s.discovered.includes(118)],
    ['complete', 'The Complete Table', 'Discover all 118 elements.', s => s.discovered.length === LIMIT]
  ];

  function familyComplete(state, family) {
    return elements.filter(e => e.category === family).every(e => state.discovered.includes(e.atomicNumber));
  }

  const CHALLENGES = [
    { target: 18, seed: [4, 6, 8, 11], limit: 2 },
    { target: 26, seed: [7, 8, 11, 15], limit: 2 },
    { target: 50, seed: [10, 14, 12, 14, 19], limit: 3 },
    { target: 36, seed: [4, 8, 8, 16, 25], limit: 3 },
    { target: 55, seed: [12, 14, 16, 13, 20], limit: 3 },
    { target: 118, seed: [28, 34, 56, 67], limit: 2 }
  ];

  function template(day) {
    const index = Math.floor(Date.parse(day + 'T00:00:00.000Z') / DAY);
    return CHALLENGES[((index % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length];
  }

  function challengeAttempt(day) {
    const board = blankBoard();
    template(day).seed.forEach((value, i) => { board[[0, 3, 5, 10, 15][i]] = value; });
    return { board, merges: 0 };
  }

  function fresh() {
    return {
      version: 1, board: blankBoard(), discovered: [], inventory: {}, favourites: [],
      timeline: [], achievements: [], stats: statistics(), settings: { ...SETTINGS },
      tutorial: 0, completion: null, challenge: { active: null, days: {} }
    };
  }

  function validSettings(settings) {
    return isObject(settings) && Object.keys(settings).length === Object.keys(SETTINGS).length &&
      Object.keys(SETTINGS).every(key => {
        const value = settings[key];
        if (key === 'theme') return THEMES.includes(value);
        if (key === 'intensity') return ['off', 'subtle', 'full'].includes(value);
        if (typeof SETTINGS[key] === 'number') return Number.isFinite(value) && value >= 0 && value <= 1;
        return typeof value === 'boolean';
      });
  }

  function validStats(stats) {
    return isObject(stats) && isCount(stats.merges) && isCount(stats.hydrogenGenerated);
  }

  function validChallenges(challenge) {
    if (!isObject(challenge) || !isObject(challenge.days)) return false;
    if (challenge.active !== null && (!isDay(challenge.active) || !Object.hasOwn(challenge.days, challenge.active))) return false;
    return Object.entries(challenge.days).every(([day, round]) => {
      if (!isDay(day) || !isObject(round)) return false;
      const { target, limit, seed } = template(day);
      return validBoard(round.board) && isCount(round.merges) && round.merges <= limit &&
        (!round.board.includes(target) || (round.best !== null && round.best <= round.merges)) &&
        (round.best === null || (isCount(round.best) && round.best >= 1 && round.best <= limit)) &&
        round.board.reduce((sum, n) => sum + n, 0) === seed.reduce((sum, n) => sum + n, 0) &&
        round.board.filter(n => n !== null).length === seed.length - round.merges;
    });
  }

  function parse(text) {
    function check(ok, message) { if (!ok) throw new Error(message); }
    const state = JSON.parse(text);
    check(isObject(state) && state.version === 1, 'Unsupported CESIUM save version.');
    check(validBoard(state.board), 'The board must contain 16 valid cells.');
    check(Array.isArray(state.discovered) && state.discovered.every(isElement), 'Invalid discovery records.');
    const unlocked = new Set(state.discovered);
    check(unlocked.size === state.discovered.length, 'Repeated discovery records.');
    check(state.board.every(n => n === null || unlocked.has(n)), 'Board elements must be discovered.');
    check(isObject(state.inventory) && Object.entries(state.inventory).every(([n, qty]) =>
      String(Number(n)) === n && unlocked.has(Number(n)) && isCount(qty) && qty > 0), 'Invalid stored quantities.');
    check(Array.isArray(state.favourites) && state.favourites.length <= 5 &&
      state.favourites.every(n => unlocked.has(n)) && new Set(state.favourites).size === state.favourites.length, 'Invalid favourites.');
    check(Array.isArray(state.timeline) && state.timeline.length === unlocked.size, 'Invalid discovery timeline.');
    const seen = new Set();
    for (const entry of state.timeline) {
      check(isObject(entry) && unlocked.has(entry.number) && !seen.has(entry.number) &&
        isDate(entry.date), 'Invalid first discovery.');
      const inputs = entry.inputs;
      check(inputs === null ? entry.number === 1 : Array.isArray(inputs) &&
        inputs.length === 2 && inputs.every(n => seen.has(n)) && merge(...inputs) === entry.number, 'Invalid discovery combination.');
      seen.add(entry.number);
    }
    check(validStats(state.stats) && validSettings(state.settings), 'Invalid statistics or settings.');
    check(Array.isArray(state.achievements) && new Set(state.achievements).size === state.achievements.length &&
      state.achievements.every(id => MILESTONES.some(([known]) => id === known)), 'Invalid achievements.');
    check(Number.isInteger(state.tutorial) && state.tutorial >= 0 && state.tutorial <= 5, 'Invalid tutorial status.');
    check(state.completion === null ? unlocked.size < LIMIT :
      unlocked.size === LIMIT && isObject(state.completion) && isDate(state.completion.date) &&
      validStats(state.completion.stats) && THEMES.includes(state.completion.theme), 'Invalid completion record.');
    check(validChallenges(state.challenge), 'Invalid daily challenge data.');
    return state;
  }

  function load(getStorage) {
    try {
      const storage = getStorage();
      if (!storage) return { state: fresh(), issue: 'Automatic saving is unavailable. Export a JSON backup.', storage: null };
      const raw = storage.getItem(STORAGE_KEY);
      try {
        return { state: raw === null ? fresh() : parse(raw), storage, issue: '' };
      } catch {
        return { state: fresh(), storage, issue: 'The existing save could not be read. Export new progress or import a backup. The old save is preserved.', blocked: true, raw };
      }
    } catch {
      return { state: fresh(), storage: null, issue: 'Automatic saving is unavailable. Export a JSON backup.' };
    }
  }

  function save(storage, state) {
    try {
      if (!storage) return false;
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  class Game {
    constructor(state = fresh(), now = () => new Date()) {
      this.state = state;
      this.now = now;
      this.history = [];
      this.challengeHistory = [];
    }

    get round() {
      const { active, days } = this.state.challenge;
      return active ? days[active] : null;
    }

    get board() { return this.round?.board ?? this.state.board; }
    get undoAvailable() { return (this.round ? this.challengeHistory : this.history).length > 0; }

    startChallenge(day, restart = false) {
      if (!isDay(day)) return false;
      const { challenge } = this.state;
      if (restart || !challenge.days[day]) {
        challenge.days[day] = { ...challengeAttempt(day), best: challenge.days[day]?.best ?? null };
      }
      challenge.active = day;
      this.challengeHistory = [];
      return true;
    }

    leaveChallenge() {
      this.state.challenge.active = null;
      this.challengeHistory = [];
    }

    snapshot() {
      const { inventory, stats } = this.state;
      const round = this.round;
      const stack = round ? this.challengeHistory : this.history;
      stack.push(round ? { board: [...round.board], merges: round.merges } :
        { board: [...this.board], inventory: { ...inventory }, stats: { ...stats } });
      if (stack.length > 64) stack.shift();
    }

    undo() {
      const stack = this.round ? this.challengeHistory : this.history;
      if (!stack.length) return false;
      Object.assign(this.round ?? this.state, stack.pop());
      return true;
    }

    refreshMilestones() {
      const { state } = this;
      const unlocked = [];
      for (const [id, title, , met] of MILESTONES) {
        if (!state.achievements.includes(id) && met(state)) {
          state.achievements.push(id);
          unlocked.push(title);
        }
      }
      return unlocked;
    }

    discover(number, inputs = null) {
      const { state } = this;
      if (state.discovered.includes(number)) return false;
      const date = this.now().toISOString();
      state.discovered.push(number);
      state.timeline.push({ number, date, inputs });
      if (state.discovered.length === LIMIT) {
        state.completion = { date, stats: { ...state.stats }, theme: state.settings.theme };
      }
      return true;
    }

    act(action, cell, target) {
      if (!isCell(cell)) return null;
      const { state, board, round } = this;
      const number = board[cell];
      const result = { type: action, number, cell, target, discovery: false, milestones: [] };
      if (action === 'place') {
        if (!isCell(target) || number === null || cell === target) return null;
        const other = board[target];
        const sum = other === null ? number : merge(number, other);
        const daily = round ? template(state.challenge.active) : null;
        if (sum === null || (daily && other !== null && (round.merges >= daily.limit || board.includes(daily.target)))) {
          return { ...result, type: 'invalid' };
        }
        if (!daily && other !== null && state.stats.merges === Number.MAX_SAFE_INTEGER) return null;
        this.snapshot();
        board[cell] = null;
        board[target] = sum;
        result.number = sum;
        result.type = other === null ? 'move' : 'merge';
        if (other !== null) {
          result.inputs = [number, other];
          if (round) {
            round.merges++;
            if (sum === daily.target) {
              round.best = Math.min(round.best ?? Infinity, round.merges);
              result.challengeComplete = true;
            }
          } else {
            state.stats.merges++;
            result.discovery = this.discover(sum, result.inputs);
          }
        }
      } else {
        if (round) return null;
        if (action === 'generate' && number === null && state.stats.hydrogenGenerated < Number.MAX_SAFE_INTEGER) {
          this.snapshot();
          board[cell] = result.number = 1;
          state.stats.hydrogenGenerated++;
          result.discovery = this.discover(1);
        } else if (action === 'retrieve' && number === null && isElement(target) && count(state, target)) {
          this.snapshot();
          board[cell] = result.number = target;
          if (--state.inventory[target] === 0) delete state.inventory[target];
        } else if (number !== null && (action === 'delete' || (action === 'store' && count(state, number) < Number.MAX_SAFE_INTEGER))) {
          this.snapshot();
          board[cell] = null;
          if (action === 'store') state.inventory[number] = count(state, number) + 1;
        } else {
          return null;
        }
      }
      if (!round) result.milestones = this.refreshMilestones();
      return result;
    }

    favourite(number) {
      const { favourites, discovered } = this.state;
      if (!discovered.includes(number)) return false;
      const index = favourites.indexOf(number);
      if (index >= 0) favourites.splice(index, 1);
      else if (favourites.length < 5) favourites.push(number);
      else return false;
      return true;
    }
  }

  return { Game, fresh, parse, load, save, count, merge, utcDay, template, THEMES, MILESTONES, STORAGE_KEY };
})();

if (typeof module === 'object') module.exports = Cesium;
