import { PUZZLE_BANK } from './puzzle-bank.js';

const structures = new Map();
const LEVELS = ['beginner', 'easy', 'medium', 'hard', 'expert'];
const SYMBOLS = '123456789ABCDEFG';

function structure(size) {
  if (size !== 9 && size !== 16) throw new Error('Choose a 9×9 or 16×16 board.');
  if (structures.has(size)) return structures.get(size);
  const box = Math.sqrt(size), units = [], cellUnits = [], peers = [];
  for (let r = 0; r < size; r++) units.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) units.push(Array.from({ length: size }, (_, r) => r * size + c));
  for (let br = 0; br < box; br++) for (let bc = 0; bc < box; bc++) {
    units.push(Array.from({ length: size }, (_, i) => (br * box + Math.floor(i / box)) * size + bc * box + i % box));
  }
  for (let i = 0; i < size * size; i++) {
    cellUnits[i] = units.filter(u => u.includes(i));
    peers[i] = [...new Set(cellUnits[i].flat())].filter(j => j !== i);
  }
  const s = { size, box, units, cellUnits, peers, full: (1 << size) - 1 };
  structures.set(size, s);
  return s;
}

const bit = v => 1 << (v - 1);
const single = m => m !== 0 && (m & (m - 1)) === 0;
const popcount = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const number = m => 32 - Math.clz32(m);
function numbers(mask, size) {
  const result = [];
  for (let v = 1; v <= size; v++) if (mask & bit(v)) result.push(v);
  return result;
}
function validInput(values, size) {
  return Array.isArray(values) && values.length === size * size && values.every(v => Number.isInteger(v) && v >= 0 && v <= size);
}
function masksFor(values, s) {
  return values.map((v, i) => v ? 0 : s.full & ~s.peers[i].reduce((m, j) => values[j] ? m | bit(values[j]) : m, 0));
}

export function getConflicts(values, size = 9) {
  const s = structure(size), conflicts = new Set();
  if (!validInput(values, size)) return [];
  for (const unit of s.units) {
    const seen = new Map();
    for (const i of unit) if (values[i]) {
      if (seen.has(values[i])) { conflicts.add(i); conflicts.add(seen.get(values[i])); }
      else seen.set(values[i], i);
    }
  }
  return [...conflicts].sort((a, b) => a - b);
}

export function getCandidates(values, size = 9, index) {
  const s = structure(size);
  if (!validInput(values, size) || !Number.isInteger(index) || index < 0 || index >= values.length || values[index]) return [];
  return numbers(masksFor(values, s)[index], size);
}

// Algorithm X with dancing links. Cell, row-symbol, column-symbol, and box-
// symbol constraints are checked independently of the human-technique rater.
function search(initial, size, limit, onSolution) {
  const s = structure(size);
  if (!validInput(initial, size) || getConflicts(initial, size).length) return 0;
  const columns = 4 * size * size, capacity = columns + 1 + 4 * size * size * size;
  const left = new Int32Array(capacity), right = new Int32Array(capacity);
  const up = new Int32Array(capacity), down = new Int32Array(capacity);
  const column = new Int32Array(capacity), row = new Int32Array(capacity);
  const counts = new Int32Array(columns + 1), assignments = [];
  for (let c = 0; c <= columns; c++) {
    left[c] = c - 1; right[c] = c + 1; up[c] = down[c] = c;
  }
  left[0] = columns; right[columns] = 0;
  let next = columns + 1;
  const masks = masksFor(initial, s);
  for (let i = 0; i < initial.length; i++) {
    const r = Math.floor(i / size), c = i % size;
    const b = Math.floor(r / s.box) * s.box + Math.floor(c / s.box);
    const candidates = initial[i] ? [initial[i]] : numbers(masks[i], size);
    if (!candidates.length) return 0;
    for (const v of candidates) {
      const rowId = assignments.length; assignments.push([i, v]);
      const constraints = [i, size * size + r * size + v - 1, 2 * size * size + c * size + v - 1, 3 * size * size + b * size + v - 1];
      const first = next;
      for (const constraint of constraints) {
        const node = next++, head = constraint + 1;
        column[node] = head; row[node] = rowId; counts[head]++;
        up[node] = up[head]; down[node] = head;
        down[up[head]] = node; up[head] = node;
        left[node] = node === first ? first + 3 : node - 1;
        right[node] = node === first + 3 ? first : node + 1;
      }
    }
  }
  function cover(c) {
    right[left[c]] = right[c]; left[right[c]] = left[c];
    for (let i = down[c]; i !== c; i = down[i]) for (let j = right[i]; j !== i; j = right[j]) {
      down[up[j]] = down[j]; up[down[j]] = up[j]; counts[column[j]]--;
    }
  }
  function uncover(c) {
    for (let i = up[c]; i !== c; i = up[i]) for (let j = left[i]; j !== i; j = left[j]) {
      counts[column[j]]++; down[up[j]] = j; up[down[j]] = j;
    }
    right[left[c]] = c; left[right[c]] = c;
  }
  let found = 0;
  const chosen = [];
  function visit() {
    if (right[0] === 0) {
      found++;
      if (onSolution) {
        const values = Array(size * size).fill(0);
        for (const rowId of chosen) { const [i, v] = assignments[rowId]; values[i] = v; }
        onSolution(values);
      }
      return;
    }
    let best = right[0];
    for (let c = right[best]; c; c = right[c]) if (counts[c] < counts[best]) {
      best = c;
      if (counts[best] <= 1) break;
    }
    if (!counts[best]) return;
    cover(best);
    for (let r = down[best]; r !== best; r = down[r]) {
      chosen.push(row[r]);
      for (let j = right[r]; j !== r; j = right[j]) cover(column[j]);
      visit();
      for (let j = left[r]; j !== r; j = left[j]) uncover(column[j]);
      chosen.pop();
      if (found >= limit) break;
    }
    uncover(best);
  }
  visit();
  return found;
}

export function countSolutions(givens, size = 9, limit = 2) {
  structure(size);
  const cap = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 2;
  // The empty grid admits both the cyclic Latin construction and its symbol
  // permutation. Avoid an exponential search just to establish ambiguity.
  if (validInput(givens, size) && givens.every(v => !v) && cap <= 2) return cap;
  return search(givens, size, cap, null);
}
export function solvePuzzle(givens, size = 9) {
  const { box } = structure(size);
  if (validInput(givens, size) && givens.every(v => !v)) return Array.from({ length: size * size }, (_, i) => {
    const row = Math.floor(i / size), column = i % size;
    return (row * box + Math.floor(row / box) + column) % size + 1;
  });
  let result = null;
  search(givens, size, 1, values => { result = values.slice(); });
  return result;
}

function cellName(i, size) { return `row ${Math.floor(i / size) + 1}, column ${i % size + 1}`; }
function symbol(v) { return SYMBOLS[v - 1]; }
function unitName(u, s) {
  const i = s.units.indexOf(u);
  return i < s.size ? `row ${i + 1}` : i < 2 * s.size ? `column ${i - s.size + 1}` : `box ${i - 2 * s.size + 1}`;
}
function placement(type, title, explanation, index, value, cells, tier = 1) {
  return { type, title, explanation, index, value, cells, tier };
}
function eliminate(type, title, explanation, cells, eliminations, tier) {
  return { type, title, explanation, cells: [...new Set([...cells, ...eliminations.map(e => e.index)])], eliminations, tier };
}

function logicalStep(values, masks, s, maxTier = 5) {
  for (let i = 0; i < values.length; i++) if (!values[i] && single(masks[i])) {
    const value = number(masks[i]);
    return placement('naked-single', 'Only one candidate', `${cellName(i, s.size)} can only be ${symbol(value)}: its row, column, and box rule out every other symbol.`, i, value, [i]);
  }
  if (maxTier < 2) return null;
  for (const unit of s.units) for (let v = 1; v <= s.size; v++) {
    const cells = unit.filter(i => masks[i] & bit(v));
    if (cells.length === 1) return placement('hidden-single', 'Only one place', `${symbol(v)} has just one possible position in ${unitName(unit, s)}: ${cellName(cells[0], s.size)}.`, cells[0], v, unit, 2);
  }
  if (maxTier < 3) return null;
  // Pointing and claiming: intersecting units share all positions for a value.
  for (const unit of s.units) for (let v = 1; v <= s.size; v++) {
    const cells = unit.filter(i => masks[i] & bit(v));
    if (cells.length < 2) continue;
    for (const other of s.cellUnits[cells[0]]) if (other !== unit && cells.every(i => other.includes(i))) {
      const eliminations = other.filter(i => !unit.includes(i) && (masks[i] & bit(v))).map(index => ({ index, values: [v] }));
      if (eliminations.length) return eliminate('locked-candidates', 'Locked candidates', `Every position for ${symbol(v)} in ${unitName(unit, s)} also lies in ${unitName(other, s)}. Remove ${symbol(v)} from the rest of that ${unitName(other, s)}.`, cells, eliminations, 3);
    }
  }
  if (maxTier < 4) return null;
  for (const unit of s.units) {
    const pairs = unit.filter(i => popcount(masks[i]) === 2);
    for (let a = 0; a < pairs.length; a++) for (let b = a + 1; b < pairs.length; b++) if (masks[pairs[a]] === masks[pairs[b]]) {
      const union = masks[pairs[a]], cells = [pairs[a], pairs[b]];
      const eliminations = unit.filter(i => !cells.includes(i) && (masks[i] & union)).map(index => ({ index, values: numbers(masks[index] & union, s.size) }));
      if (eliminations.length) return eliminate('naked-pair', 'Naked pair', `These two cells in ${unitName(unit, s)} contain only ${numbers(union, s.size).map(symbol).join(' and ')}. Reserve those symbols for the pair and remove them from the other cells in the unit.`, cells, eliminations, 4);
    }
    for (let a = 1; a < s.size; a++) for (let b = a + 1; b <= s.size; b++) {
      const ca = unit.filter(i => masks[i] & bit(a)), cb = unit.filter(i => masks[i] & bit(b));
      if (ca.length === 2 && cb.length === 2 && ca[0] === cb[0] && ca[1] === cb[1]) {
        const union = bit(a) | bit(b);
        const eliminations = ca.filter(i => masks[i] & ~union).map(index => ({ index, values: numbers(masks[index] & ~union, s.size) }));
        if (eliminations.length) return eliminate('hidden-pair', 'Hidden pair', `${symbol(a)} and ${symbol(b)} can appear only in these two cells of ${unitName(unit, s)}. Remove the other candidates from those cells.`, ca, eliminations, 4);
      }
    }
  }
  if (maxTier < 5) return null;
  for (const unit of s.units) {
    const candidates = unit.filter(i => popcount(masks[i]) >= 2 && popcount(masks[i]) <= 3);
    for (let a = 0; a < candidates.length; a++) for (let b = a + 1; b < candidates.length; b++) for (let c = b + 1; c < candidates.length; c++) {
      const cells = [candidates[a], candidates[b], candidates[c]], union = cells.reduce((m, i) => m | masks[i], 0);
      if (popcount(union) !== 3) continue;
      const eliminations = unit.filter(i => !cells.includes(i) && (masks[i] & union)).map(index => ({ index, values: numbers(masks[index] & union, s.size) }));
      if (eliminations.length) return eliminate('naked-triple', 'Naked triple', `These three cells in ${unitName(unit, s)} share exactly three symbols: ${numbers(union, s.size).map(symbol).join(', ')}. Those symbols belong to the triple, so remove them elsewhere in the unit.`, cells, eliminations, 5);
    }
  }
  for (let direction = 0; direction < 2; direction++) for (let v = 1; v <= s.size; v++) {
    const lines = s.units.slice(direction * s.size, (direction + 1) * s.size);
    const position = i => direction === 0 ? i % s.size : Math.floor(i / s.size);
    for (let a = 0; a < s.size; a++) {
      const ca = lines[a].filter(i => masks[i] & bit(v));
      if (ca.length !== 2) continue;
      for (let b = a + 1; b < s.size; b++) {
        const cb = lines[b].filter(i => masks[i] & bit(v));
        if (cb.length !== 2 || position(ca[0]) !== position(cb[0]) || position(ca[1]) !== position(cb[1])) continue;
        const cells = [...ca, ...cb], positions = ca.map(position);
        const eliminations = masks.flatMap((m, index) => !cells.includes(index) && positions.includes(position(index)) && (m & bit(v)) ? [{ index, values: [v] }] : []);
        if (eliminations.length) return eliminate('x-wing', 'X-wing', `In these two ${direction === 0 ? 'rows' : 'columns'}, ${symbol(v)} can only occupy the same two ${direction === 0 ? 'columns' : 'rows'}. The four corners form an X-wing: remove ${symbol(v)} from other cells in those ${direction === 0 ? 'columns' : 'rows'}.`, cells, eliminations, 5);
      }
    }
  }
  return null;
}

function applyStep(values, masks, step, s) {
  if (step.index !== undefined) {
    values[step.index] = step.value; masks[step.index] = 0;
    for (const p of s.peers[step.index]) masks[p] &= ~bit(step.value);
  } else for (const e of step.eliminations) for (const v of e.values) masks[e.index] &= ~bit(v);
}

export function ratePuzzle(givens, size = 9) {
  const s = structure(size);
  if (!validInput(givens, size) || getConflicts(givens, size).length) return { difficulty: null, solved: false, technique: 'invalid', label: 'Invalid puzzle', steps: 0 };
  const values = givens.slice(), masks = masksFor(values, s);
  let tier = 1, technique = 'naked-single', steps = 0;
  while (values.includes(0)) {
    const step = logicalStep(values, masks, s);
    if (!step) return { difficulty: null, solved: false, technique: 'beyond-supported-techniques', label: 'Requires further deduction', steps };
    if (step.tier > tier) { tier = step.tier; technique = step.type; }
    applyStep(values, masks, step, s); steps++;
  }
  const labels = { 'naked-single': 'Singles', 'hidden-single': 'Hidden singles', 'locked-candidates': 'Locked candidates', 'naked-pair': 'Pairs', 'hidden-pair': 'Pairs', 'naked-triple': 'Naked triples', 'x-wing': 'X-wing' };
  return { difficulty: LEVELS[tier - 1], solved: true, technique, label: labels[technique], steps };
}

export function getHint(values, size = 9, notes) {
  const s = structure(size);
  if (!validInput(values, size)) return null;
  const conflicts = getConflicts(values, size);
  if (conflicts.length) return { type: 'conflict', title: 'Resolve a conflict', explanation: 'The highlighted cells repeat a symbol in a row, column, or box. Clear or correct an entry before continuing.', cells: conflicts };
  if (!values.includes(0)) return null;
  const masks = masksFor(values, s), work = values.slice();
  const impossible = masks.flatMap((m, i) => !values[i] && !m ? [i] : []);
  if (impossible.length) return { type: 'contradiction', title: 'A cell has no candidates', explanation: 'The highlighted empty cells have no legal symbol. Undo or correct a recent entry before continuing.', cells: impossible };
  // Notes are annotations, not evidence. Derive every reduction from the board.
  // Skip reductions already represented in the notes, while retaining their proof.
  for (let attempts = 0; attempts < size * size * size; attempts++) {
    const step = logicalStep(work, masks, s);
    if (!step) break;
    if (step.index !== undefined) { const { tier, ...hint } = step; return hint; }
    const visible = !notes || step.eliminations.some(e => !Array.isArray(notes[e.index]) || e.values.some(v => notes[e.index].includes(v)));
    if (visible) { const { tier, ...hint } = step; return hint; }
    applyStep(work, masks, step, s);
  }
  const blocked = masks.flatMap((m, i) => !values[i] && !m ? [i] : []);
  if (blocked.length) return { type: 'contradiction', title: 'A cell has no candidates', explanation: 'The highlighted empty cells have no legal symbol. Undo or correct a recent entry before continuing.', cells: blocked };
  return { type: 'guidance', title: 'Review your recent entries', explanation: 'No supported logical step is available in this position. Check your recent entries or undo a move, then request another hint.', cells: [] };
}

export function seededRandom(seed) {
  let h = 2166136261;
  for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function shuffle(array, random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

export function generatePuzzle({ size = 9, difficulty = 'easy', seed = `${Date.now()}-${Math.random()}` } = {}) {
  const s = structure(size);
  if (!LEVELS.includes(difficulty)) throw new Error('Unknown puzzle difficulty.');
  const bank = PUZZLE_BANK[size]?.[difficulty];
  if (!bank?.length) throw new Error(`No verified ${difficulty} puzzles are available for ${size}×${size}.`);
  seed = String(seed);
  const random = seededRandom(`${size}:${difficulty}:${seed}`);
  for (let attempt = 0; attempt < 64; attempt++) {
    const template = bank[Math.floor(random() * bank.length)];
    const symbols = shuffle(Array.from({ length: size }, (_, i) => i + 1), random);
    const order = () => shuffle(Array.from({ length: s.box }, (_, i) => i), random).flatMap(b => shuffle(Array.from({ length: s.box }, (_, i) => b * s.box + i), random));
    const rows = order(), columns = order(), transpose = random() < .5;
    const transform = encoded => Array.from({ length: size * size }, (_, i) => {
      const r = rows[Math.floor(i / size)], c = columns[i % size], source = transpose ? c * size + r : r * size + c;
      const v = encoded[source] === '.' ? 0 : SYMBOLS.indexOf(encoded[source]) + 1;
      return v ? symbols[v - 1] : 0;
    });
    const givens = transform(template.givens), solution = transform(template.solution);
    // Greedy deductions can expose a different tier after changing scan order.
    // Only return a variant with the requested, independently verified rating.
    const rating = ratePuzzle(givens, size);
    if (!rating.solved || rating.difficulty !== difficulty) continue;
    return { id: `sudoku-${size}-${difficulty}-${seed}`, size, difficulty, requestedDifficulty: difficulty, givens, solution, seed, rating: { technique: rating.technique, label: rating.label } };
  }
  // A seed always succeeds even if no scanned symmetry keeps the same tier.
  const template = bank[Math.floor(random() * bank.length)];
  const decode = encoded => [...encoded].map(c => c === '.' ? 0 : SYMBOLS.indexOf(c) + 1);
  const givens = decode(template.givens), solution = decode(template.solution), rating = ratePuzzle(givens, size);
  if (!rating.solved || rating.difficulty !== difficulty) throw new Error('The puzzle bank failed its difficulty check.');
  return { id: `sudoku-${size}-${difficulty}-${seed}`, size, difficulty, requestedDifficulty: difficulty, givens, solution, seed, rating: { technique: rating.technique, label: rating.label } };
}
