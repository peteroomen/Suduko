// Offline authoring tool. Every accepted removal has a full, sound logical solve;
// every published template also passes the independent solution-count verifier.
import { ratePuzzle, countSolutions, seededRandom, shuffle } from '../src/engine.js';
import { writeFile } from 'node:fs/promises';

const symbols = '123456789ABCDEFG';
const encode = values => values.map(v => v ? symbols[v - 1] : '.').join('');
const levels = ['beginner', 'easy', 'medium', 'hard', 'expert'];
const bank = {};
const target = Number(process.argv[2] || 4);
const random = seededRandom('paper-sudoku-bank-v3');
for (const size of [9, 16]) {
  bank[size] = Object.fromEntries(levels.map(level => [level, []]));
  const box = Math.sqrt(size);
  for (let trial = 0; trial < 400 && levels.some(l => bank[size][l].length < target); trial++) {
    const digits = shuffle(Array.from({ length: size }, (_, i) => i + 1), random);
    const order = () => shuffle(Array.from({ length: box }, (_, i) => i), random).flatMap(b => shuffle(Array.from({ length: box }, (_, i) => b * box + i), random));
    const rows = order(), cols = order();
    const solution = Array.from({ length: size * size }, (_, i) => digits[(rows[Math.floor(i / size)] * box + Math.floor(rows[Math.floor(i / size)] / box) + cols[i % size]) % size]);
    const givens = solution.slice();
    const snapshots = {};
    for (const index of shuffle(Array.from({ length: size * size }, (_, i) => i), random)) {
      const previous = givens[index]; givens[index] = 0;
      const rating = ratePuzzle(givens, size);
      if (!rating.solved) { givens[index] = previous; continue; }
      snapshots[rating.difficulty] = { givens: encode(givens), solution: encode(solution), technique: rating.technique };
    }
    for (const level of levels) if (snapshots[level] && bank[size][level].length < target) {
      const template = snapshots[level];
      const values = [...template.givens].map(c => c === '.' ? 0 : symbols.indexOf(c) + 1);
      if (countSolutions(values, size) !== 1) throw new Error(`Non-unique ${size}/${level}`);
      bank[size][level].push(template);
      console.log(`verified ${size} ${level} ${bank[size][level].length}/${target} (${template.technique})`);
    }
    await writeFile(new URL('../src/puzzle-bank.js', import.meta.url), `// Offline authored templates: each has one solution and a complete human-technique solve.\n// Runtime generation permutes symbols, bands, stacks, rows, columns, and transposes.\nexport const PUZZLE_BANK = ${JSON.stringify(bank, null, 2)};\n`);
    if (trial % 10 === 0) console.log(`trial ${trial} size ${size}`);
  }
  if (levels.some(l => bank[size][l].length < target)) throw new Error(`Incomplete bank for ${size}`);
}
