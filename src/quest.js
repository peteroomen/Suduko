import { generatePuzzle, getHint, seededRandom, shuffle, getConflicts } from './engine.js';

export const ROOMS = [
  { name: 'The Margin Mite', subtitle: 'A small smudge with big ambitions.', ink: 36, difficulty: 'beginner' },
  { name: 'The Paper Moth', subtitle: 'It has been nibbling your notes.', ink: 48, difficulty: 'beginner' },
  { name: 'The Blot Twins', subtitle: 'Two blots. One very untidy page.', ink: 60, difficulty: 'easy' },
  { name: 'The Doodle Drake', subtitle: 'A dragon drawn during a long meeting.', ink: 72, difficulty: 'easy' },
  { name: 'The Inkkeeper', subtitle: 'One last blot between you and a clean notebook.', ink: 100, difficulty: 'easy' },
];
export const RELICS = [
  { id: 'nib', name: 'Sharp nib', mark: '✎', text: '+1 ink cleared with every correct answer.' },
  { id: 'ribbon', name: 'Purple ribbon', mark: '〰', text: '+4 extra ink on every fourth correct answer in a streak.' },
  { id: 'star', name: 'Star stamp', mark: '☆', text: 'Starred squares clear +5 extra ink.' },
  { id: 'ruler', name: 'Brass ruler', mark: '+', text: 'Completing a row, column or box clears +6 extra ink per unit.' },
  { id: 'guard', name: 'Soft eraser', mark: '◇', text: 'Protects one heart from the first mistake in each encounter.' },
  { id: 'lantern', name: 'Reading lamp', mark: '☼', text: '+1 hint now and at the start of each later encounter (maximum 5).' },
];
export function isPeer(a, b) {
  return Math.floor(a / 9) === Math.floor(b / 9) || a % 9 === b % 9 ||
    (Math.floor(a / 27) === Math.floor(b / 27) && Math.floor(a % 9 / 3) === Math.floor(b % 9 / 3));
}
function unitsAt(i) {
  const r = Math.floor(i / 9), c = i % 9;
  return [Array.from({ length: 9 }, (_, n) => r * 9 + n),
    Array.from({ length: 9 }, (_, n) => n * 9 + c),
    Array.from({ length: 9 }, (_, n) => (Math.floor(r / 3) * 3 + Math.floor(n / 3)) * 9 + Math.floor(c / 3) * 3 + n % 3)];
}
export function createQuest(seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {
  const run = { version: 1, seed: String(seed), room: 0, phase: 'route', hearts: 4, hints: 2,
    relics: [], board: null, offers: [], streak: 0, writes: 0, mistakes: 0, hintsUsed: 0, cleared: 0 };
  return run;
}
export function startEncounter(run, route) {
  if (run.phase !== 'route' || !['quiet', 'bold'].includes(route)) return false;
  const spec = ROOMS[run.room];
  const puzzle = generatePuzzle({ size: 9, difficulty: spec.difficulty, seed: `quest-v1:${run.seed}:${run.room}` });
  const stars = shuffle(puzzle.givens.flatMap((v, i) => v ? [] : [i]), seededRandom(`${run.seed}:stars:${run.room}`)).slice(0, 9);
  const maximum = spec.ink + (route === 'bold' ? Math.ceil(spec.ink / 4) : 0);
  run.board = { givens: puzzle.givens, solution: puzzle.solution, values: [...puzzle.givens], notes: {},
    selected: puzzle.givens.indexOf(0), stars, ink: maximum, maximum, route, guardUsed: false };
  if (run.room > 0 && run.relics.includes('lantern')) run.hints = Math.min(5, run.hints + 1);
  run.streak = 0;
  run.phase = 'battle';
  return true;
}
export function damagePreview(run, i) {
  const b = run.board;
  if (run.phase !== 'battle' || !Number.isInteger(i) || i < 0 || i >= 81 || b.values[i]) return 0;
  const units = unitsAt(i).filter(unit => unit.every(j => j === i || b.values[j])).length;
  return 3 + Number(run.relics.includes('nib')) +
    ((run.streak + 1) % 4 === 0 ? 2 + (run.relics.includes('ribbon') ? 4 : 0) : 0) +
    (b.stars.includes(i) ? 2 + (run.relics.includes('star') ? 5 : 0) : 0) +
    units * (2 + (run.relics.includes('ruler') ? 6 : 0));
}
function clearCheck(run) {
  if (run.board.ink > 0 && run.board.values.includes(0)) return false;
  run.board.ink = 0;
  run.cleared++;
  if (run.board.route === 'bold') {
    run.hearts = Math.min(4, run.hearts + 1);
    run.hints = Math.min(5, run.hints + 1);
  }
  if (run.room === ROOMS.length - 1) run.phase = 'won';
  else {
    run.phase = 'reward';
    run.offers = shuffle(RELICS.filter(r => !run.relics.includes(r.id)).map(r => r.id),
      seededRandom(`${run.seed}:rewards:${run.room}`)).slice(0, 3);
  }
  return true;
}
export function writeAnswer(run, i, value, { note = false } = {}) {
  const b = run.board;
  if (run.phase !== 'battle' || !Number.isInteger(i) || i < 0 || i >= 81 || !Number.isInteger(value) || value < 0 || value > 9 || b.values[i])
    return { changed: false, text: 'Ink already dried here. Choose an empty square.' };
  if (note || value === 0) {
    const notes = b.notes[i] || [];
    if (!value) delete b.notes[i];
    else b.notes[i] = notes.includes(value) ? notes.filter(v => v !== value) : [...notes, value].sort((a, c) => a - c);
    return { changed: true, type: 'note', text: value ? 'Pencil marks updated. Notes never cost hearts.' : 'Pencil marks erased.' };
  }
  if (value !== b.solution[i]) {
    run.mistakes++;
    run.streak = 0;
    const protectedHeart = run.relics.includes('guard') && !b.guardUsed;
    if (protectedHeart) b.guardUsed = true;
    else run.hearts--;
    if (!run.hearts) run.phase = 'lost';
    return { changed: true, type: 'error', text: protectedHeart ? 'Soft eraser caught that slip. Streak reset; heart protected.' : 'A little ink spill. −1 heart; streak reset. The square stays empty.' };
  }
  const damage = damagePreview(run, i);
  b.values[i] = value;
  delete b.notes[i];
  for (const key of Object.keys(b.notes)) if (isPeer(i, Number(key))) b.notes[key] = b.notes[key].filter(v => v !== value);
  b.ink = Math.max(0, b.ink - damage);
  run.streak++;
  run.writes++;
  const cleared = clearCheck(run);
  return { changed: true, type: cleared ? 'complete' : 'write', damage, text: cleared ? 'Page rescued! Choose what to carry onward.' : `−${damage} ink${run.streak % 4 === 0 ? ' · Streak bonus!' : ''}` };
}
export function questHint(run) {
  if (run.phase !== 'battle' || !run.hints) return null;
  return getHint(run.board.values, 9, run.board.notes);
}
export function applyQuestHint(run) {
  const hint = questHint(run);
  if (!hint || (!hint.value && !hint.eliminations?.length)) return false;
  if (hint.value) {
    const b = run.board;
    b.values[hint.index] = hint.value;
    b.selected = hint.index;
    delete b.notes[hint.index];
    for (const key of Object.keys(b.notes)) if (isPeer(hint.index, Number(key))) b.notes[key] = b.notes[key].filter(v => v !== hint.value);
  } else {
    // The v1 encounter bank uses only singles. Keep an explicit guard for future banks.
    return false;
  }
  run.hints--;
  run.hintsUsed++;
  run.streak = 0;
  clearCheck(run); // A fully solved Sudoku always wins, even if hints did the writing.
  return true;
}
export function chooseReward(run, id) {
  if (run.phase !== 'reward') return false;
  if (id === 'rest') {
    if (run.hearts === 4) return false;
    run.hearts++;
  } else {
    if (!run.offers.includes(id) || run.relics.includes(id)) return false;
    run.relics.push(id);
    if (id === 'lantern') run.hints = Math.min(5, run.hints + 1);
  }
  run.room++;
  run.phase = 'route';
  run.offers = [];
  run.board = null;
  return true;
}

// Old backups omit quest; a malformed new run must not overwrite a good save.
export function validQuest(q) {
  if (q === undefined || q === null) return true;
  const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const ids = RELICS.map(r => r.id);
  const unique = (a, allowed, limit) => Array.isArray(a) && a.length <= limit && new Set(a).size === a.length && a.every(v => allowed.includes(v));
  if (!q || q.version !== 1 || typeof q.seed !== 'string' || !q.seed.length || q.seed.length > 100 ||
    !integer(q.room, 0, 4) || !['route', 'battle', 'reward', 'won', 'lost'].includes(q.phase) ||
    !integer(q.hearts, 0, 4) || !integer(q.hints, 0, 5) || !integer(q.streak, 0, 81) ||
    !unique(q.relics, ids, 4) || !unique(q.offers, ids.filter(id => !q.relics.includes(id)), 3) ||
    !integer(q.writes, 0, 405) || !integer(q.mistakes, 0, 100) || !integer(q.hintsUsed, 0, 30) || !integer(q.cleared, 0, 5)) return false;
  if ((q.phase === 'lost') !== (q.hearts === 0) || (q.phase === 'won' && (q.room !== 4 || q.cleared !== 5)) ||
    (q.phase === 'reward' && (q.room === 4 || q.offers.length !== 3)) ||
    (q.phase !== 'reward' && q.offers.length) ||
    q.cleared !== q.room + Number(['reward', 'won'].includes(q.phase))) return false;
  if (q.phase === 'route') return q.board === null;
  const b = q.board, grid = a => Array.isArray(a) && a.length === 81 && a.every(v => integer(v, 0, 9));
  if (!b || !grid(b.givens) || !grid(b.solution) || b.solution.includes(0) || getConflicts(b.solution).length || !grid(b.values) ||
    b.givens.some((v, i) => v && v !== b.solution[i]) || b.values.some((v, i) => (v && v !== b.solution[i]) || (b.givens[i] && v !== b.givens[i])) ||
    !integer(b.selected, 0, 80) || !integer(b.ink, 0, 125) || !integer(b.maximum, 1, 125) || b.ink > b.maximum ||
    !['quiet', 'bold'].includes(b.route) || typeof b.guardUsed !== 'boolean' ||
    !unique(b.stars, b.givens.flatMap((v, i) => v ? [] : [i]), 9) ||
    !b.notes || typeof b.notes !== 'object' || Array.isArray(b.notes) ||
    !Object.entries(b.notes).every(([i, notes]) => /^\d+$/.test(i) && integer(Number(i), 0, 80) && !b.values[i] && unique(notes, [1,2,3,4,5,6,7,8,9], 9))) return false;
  if (['reward', 'won'].includes(q.phase) ? b.ink !== 0 : b.ink === 0 || !b.values.includes(0)) return false;
  return true;
}
