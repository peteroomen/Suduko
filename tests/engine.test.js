import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePuzzle, getCandidates, getConflicts, countSolutions, ratePuzzle, getHint, solvePuzzle } from '../src/engine.js';
import { createPuzzle } from '../src/puzzle-service.js';
import { PUZZLE_BANK } from '../src/puzzle-bank.js';

const levels = ['beginner', 'easy', 'medium', 'hard', 'expert'];
const symbols = '123456789ABCDEFG';
const decode = encoded => [...encoded].map(c => c === '.' ? 0 : symbols.indexOf(c) + 1);

for (const size of [9, 16]) for (const difficulty of levels) {
  test(`${size}×${size} ${difficulty}: templates are unique and genuinely technique-rated`, () => {
    assert.ok(PUZZLE_BANK[size][difficulty].length >= 4);
    for (const template of PUZZLE_BANK[size][difficulty]) {
      const givens = decode(template.givens), solution = decode(template.solution);
      assert.equal(givens.length, size * size);
      assert.equal(solution.length, size * size);
      assert.ok(solution.every(v => v >= 1 && v <= size));
      assert.deepEqual(getConflicts(solution, size), []);
      assert.ok(givens.every((v, i) => !v || v === solution[i]));
      assert.equal(countSolutions(givens, size, 2), 1);
      assert.deepEqual(solvePuzzle(givens, size), solution);
      const rating = ratePuzzle(givens, size);
      assert.equal(rating.solved, true);
      assert.equal(rating.difficulty, difficulty);
      const expected = {
        beginner: ['naked-single'], easy: ['hidden-single'], medium: ['locked-candidates'],
        hard: ['naked-pair', 'hidden-pair'], expert: ['naked-triple', 'x-wing'],
      };
      assert.ok(expected[difficulty].includes(rating.technique));
    }
  });
  test(`${size}×${size} ${difficulty}: seeded variations preserve exact difficulty and uniqueness`, () => {
    const seed = 'daily:2026-10-01';
    const first = generatePuzzle({ size, difficulty, seed });
    assert.deepEqual(generatePuzzle({ size, difficulty, seed }), first);
    assert.equal(first.difficulty, difficulty);
    assert.equal(first.requestedDifficulty, difficulty);
    assert.equal(first.seed, seed);
    assert.deepEqual(getConflicts(first.solution, size), []);
    assert.equal(countSolutions(first.givens, size), 1);
    assert.equal(ratePuzzle(first.givens, size).difficulty, difficulty);
    const second = generatePuzzle({ size, difficulty, seed: 'daily:2026-10-02' });
    assert.notDeepEqual(second.givens, first.givens);
    assert.equal(second.difficulty, difficulty);
  });
}

test('row, column, and box conflicts mark every repeated entry', () => {
  const values = Array(81).fill(0);
  values[0] = 1; values[1] = 1; values[9] = 1;
  assert.deepEqual(getConflicts(values, 9), [0, 1, 9]);
  assert.equal(countSolutions(values, 9), 0);
  assert.deepEqual(getCandidates(values, 9, 2), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(getCandidates(values, 9, 0), []);
  assert.equal(getHint(values, 9).type, 'conflict');
});

test('solution counting distinguishes no solution, one solution, and many', () => {
  assert.equal(countSolutions(Array(81).fill(0), 9, 2), 2);
  assert.equal(countSolutions(Array(256).fill(0), 16, 2), 2);
  assert.equal(countSolutions([1], 9), 0);
  assert.equal(countSolutions(Array(81).fill(-1), 9), 0);
  assert.throws(() => generatePuzzle({ size: 12 }));
  assert.throws(() => generatePuzzle({ difficulty: 'impossible' }));
});

for (const size of [9, 16]) test(`hint deductions solve the complete ${size}×${size} Expert without revealing guesses`, () => {
  const puzzle = generatePuzzle({ size, difficulty: 'expert', seed: 'hint-proof' });
  const values = puzzle.givens.slice();
  const notes = Object.fromEntries(values.map((v, i) => [i, v ? [] : getCandidates(values, size, i)]));
  const seen = new Set();
  let steps = 0;
  while (values.includes(0) && steps < size * size * 3) {
    const hint = getHint(values, size, notes);
    assert.ok(hint);
    assert.ok(hint.explanation.length > 20);
    seen.add(hint.type);
    if (hint.index !== undefined) {
      assert.equal(hint.value, puzzle.solution[hint.index], `unsound ${hint.type} at ${hint.index}`);
      assert.equal(values[hint.index], 0);
      values[hint.index] = hint.value; notes[hint.index] = [];
      for (let i = 0; i < values.length; i++) if (!values[i]) {
        const legal = getCandidates(values, size, i);
        notes[i] = notes[i].filter(v => legal.includes(v));
      }
    } else {
      assert.ok(hint.eliminations?.length, `unexpected hint: ${hint.type}`);
      for (const elimination of hint.eliminations) {
        assert.ok(!elimination.values.includes(puzzle.solution[elimination.index]), 'eliminated the solution');
        notes[elimination.index] = notes[elimination.index].filter(v => !elimination.values.includes(v));
      }
    }
    steps++;
  }
  assert.deepEqual(values, puzzle.solution);
  assert.ok(seen.has('naked-triple') || seen.has('x-wing'));
  assert.equal(getHint(values, size), null);
});

test('annotated candidate mistakes never authorize an unsound hint', () => {
  const puzzle = generatePuzzle({ size: 9, difficulty: 'expert', seed: 'bad-notes' });
  const notes = Object.fromEntries(puzzle.givens.map((_, i) => [i, []]));
  const hint = getHint(puzzle.givens, 9, notes);
  if (hint.index !== undefined) assert.equal(hint.value, puzzle.solution[hint.index]);
});

test('async service returns deterministic puzzle and honors already-aborted requests', async () => {
  const options = { size: 16, difficulty: 'hard', seed: 'service' };
  assert.deepEqual(await createPuzzle(options), generatePuzzle(options));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createPuzzle({ ...options, signal: controller.signal }), { name: 'AbortError' });
});
