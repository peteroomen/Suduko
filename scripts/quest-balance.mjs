// A reproducible model of deductions and slips, not a claim about human enjoyment.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { getCandidates, seededRandom } from '../src/engine.js';
import { createQuest, startEncounter, writeAnswer, chooseReward, damagePreview } from '../src/quest.js';
export function logicalMoves(values) {
  const candidates = values.map((v, i) => v ? [] : getCandidates(values, 9, i));
  const moves = new Map();
  candidates.forEach((a, i) => { if (a.length === 1) moves.set(i, a[0]); });
  const units = [];
  for (let n = 0; n < 9; n++) {
    units.push(Array.from({ length: 9 }, (_, j) => n * 9 + j));
    units.push(Array.from({ length: 9 }, (_, j) => j * 9 + n));
    units.push(Array.from({ length: 9 }, (_, j) => (Math.floor(n / 3) * 3 + Math.floor(j / 3)) * 9 + n % 3 * 3 + j % 3));
  }
  for (const unit of units) for (let v = 1; v <= 9; v++) {
    const cells = unit.filter(i => candidates[i].includes(v));
    if (cells.length === 1) moves.set(cells[0], v);
  }
  return [...moves].map(([index, value]) => ({ index, value }));
}
function reward(q, style, random) {
  if (style === 'random') return q.offers[Math.floor(random() * q.offers.length)];
  if (q.hearts <= 2) return 'rest';
  const order = q.hearts < 4 ? ['guard', 'nib', 'ruler', 'star', 'ribbon', 'lantern'] : ['nib', 'ruler', 'star', 'ribbon', 'guard', 'lantern'];
  return order.find(id => q.offers.includes(id));
}
export function simulate({ seed, slip = 0, style = 'tactical', route = 'quiet' }) {
  const q = createQuest(`balance-${seed}`), random = seededRandom(`slips:${seed}`), lengths = [];
  while (!['won', 'lost'].includes(q.phase)) {
    if (q.phase === 'route') startEncounter(q, route === 'adaptive' ? q.hearts < 4 ? 'bold' : 'quiet' : route);
    if (q.phase === 'reward') { chooseReward(q, reward(q, style, random)); continue; }
    const moves = logicalMoves(q.board.values);
    assert.ok(moves.length, `No logical move: seed ${seed}, room ${q.room}`);
    const move = style === 'tactical' ? moves.reduce((a, b) => damagePreview(q, b.index) > damagePreview(q, a.index) ? b : a) : moves[Math.floor(random() * moves.length)];
    assert.equal(move.value, q.board.solution[move.index], 'simulation must deduce, never guess');
    const before = q.writes;
    writeAnswer(q, move.index, random() < slip ? move.value % 9 + 1 : move.value);
    if (q.writes > before) lengths[q.room] = (lengths[q.room] || 0) + 1;
  }
  return { win: q.phase === 'won', writes: q.writes, hearts: q.hearts, lengths };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const samples = Number(process.argv[2] || 200);
  assert.ok(Number.isInteger(samples) && samples > 0 && samples <= 10000);
  const scenarios = [
    { name: 'Careful, random choices', slip: 0, style: 'random', route: 'quiet' },
    { name: 'Careful, tactical choices', slip: 0, style: 'tactical', route: 'quiet' },
    { name: '3% slips, random choices', slip: .03, style: 'random', route: 'quiet' },
    { name: '3% slips, tactical + rest', slip: .03, style: 'tactical', route: 'quiet' },
    { name: '6% slips, tactical + rest', slip: .06, style: 'tactical', route: 'quiet' },
    { name: '6% slips, tactical + bold recovery', slip: .06, style: 'tactical', route: 'adaptive' },
    { name: '10% slips, tactical + bold recovery', slip: .1, style: 'tactical', route: 'adaptive' },
    { name: 'Careful, all bold', slip: 0, style: 'tactical', route: 'bold' },
  ];
  const output = scenarios.map(s => {
    const results = Array.from({ length: samples }, (_, seed) => simulate({ ...s, seed }));
    const wins = results.filter(r => r.win), writes = wins.map(r => r.writes).sort((a, b) => a - b);
    const mean = list => +(list.reduce((a, b) => a + b, 0) / (list.length || 1)).toFixed(1);
    return { scenario: s.name, runs: samples, winPercent: +(wins.length / samples * 100).toFixed(1),
      meanWritesOnWin: mean(writes), p10Writes: writes[Math.floor(writes.length * .1)], p90Writes: writes[Math.floor(writes.length * .9)],
      meanHeartsOnWin: mean(wins.map(r => r.hearts)), meanWritesByRoom: Array.from({ length: 5 }, (_, room) => mean(wins.map(r => r.lengths[room]))) };
  });
  console.log(JSON.stringify(output, null, 2));
}
