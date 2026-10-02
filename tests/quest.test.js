import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuest, startEncounter, writeAnswer, chooseReward, damagePreview, questHint, applyQuestHint, validQuest, RELICS } from '../src/quest.js';
import { countSolutions, getHint } from '../src/engine.js';
import { freshState, parseBackup } from '../src/storage.js';
const battle = seed => { const q = createQuest(seed || 'test'); startEncounter(q, 'quiet'); return q; };
function clear(q) {
  while (q.phase === 'battle') {
    const step = getHint(q.board.values);
    assert.ok(step?.value, 'every position must have a provable singles step');
    writeAnswer(q, step.index, step.value);
  }
}
test('Quest seeds are repeatable, unique classic Sudoku; paths alter stakes only', () => {
  for (let seed = 0; seed < 12; seed++) {
    const q = createQuest(`seed-${seed}`), bold = createQuest(q.seed);
    startEncounter(q, 'quiet'); startEncounter(bold, 'bold');
    assert.deepEqual(q.board.givens, bold.board.givens);
    assert.equal(countSolutions(q.board.givens), 1);
    assert.equal(q.board.stars.length, 9);
    assert.equal(bold.board.maximum, 45);
  }
});
test('notes are free; wrong entries cost hearts and are never accepted; eraser shields once', () => {
  const q = battle(), i = q.board.selected, wrong = q.board.solution[i] % 9 + 1;
  writeAnswer(q, i, wrong, { note: true });
  assert.equal(q.hearts, 4); assert.deepEqual(q.board.notes[i], [wrong]);
  q.relics.push('guard');
  writeAnswer(q, i, wrong); assert.equal(q.hearts, 4); assert.equal(q.board.guardUsed, true);
  writeAnswer(q, i, wrong); assert.equal(q.hearts, 3); assert.equal(q.board.values[i], 0);
  assert.equal(q.streak, 0); assert.equal(q.mistakes, 2);
  for (let n = 0; n < 3; n++) writeAnswer(q, i, wrong);
  assert.equal(q.phase, 'lost'); assert.ok(validQuest(q));
  const snapshot = structuredClone(q); writeAnswer(q, i, q.board.solution[i]); assert.deepEqual(q, snapshot);
});
test('correct answers cannot be erased, overwritten or farmed, and preview matches damage', () => {
  const q = battle(), i = q.board.selected, damage = damagePreview(q, i), before = q.board.ink;
  assert.equal(writeAnswer(q, i, q.board.solution[i]).damage, damage);
  assert.equal(q.board.ink, before - damage);
  const saved = structuredClone(q);
  for (const value of [0, q.board.solution[i], 10, -1]) writeAnswer(q, i, value);
  assert.deepEqual(q, saved);
});
test('streak, star, nib and unit bonuses stack with exact previews', () => {
  const q = battle(); q.relics = ['nib', 'ribbon', 'star', 'ruler']; q.streak = 3;
  const i = q.board.stars[0];
  assert.equal(damagePreview(q, i), 3 + 1 + 6 + 7);
  q.board.values = [...q.board.solution]; q.board.values[i] = 0;
  assert.equal(damagePreview(q, i), 3 + 1 + 6 + 7 + 24);
});
test('hint commits a proven step once, spends a charge, resets streak and cannot clear ink', () => {
  const q = battle(); q.streak = 3;
  const hint = questHint(q), ink = q.board.ink;
  assert.equal(q.hints, 2); assert.equal(q.board.values[hint.index], 0);
  assert.equal(applyQuestHint(q), true);
  assert.equal(q.board.values[hint.index], hint.value); assert.equal(q.hints, 1);
  assert.equal(q.board.ink, ink); assert.equal(q.streak, 0); assert.equal(q.writes, 0);
  const before = structuredClone(q); writeAnswer(q, hint.index, hint.value); assert.deepEqual(q, before);
  applyQuestHint(q); assert.equal(applyQuestHint(q), false);
});
test('fully solving the grid always clears a room, including a final hint', () => {
  const q = battle(), i = q.board.selected;
  q.board.values = [...q.board.solution]; q.board.values[i] = 0;
  assert.equal(applyQuestHint(q), true); assert.equal(q.phase, 'reward'); assert.equal(q.board.ink, 0);
});
test('rewards are one-shot; rest trades an upgrade for health; bold and lamp respect caps', () => {
  const q = createQuest('reward'); startEncounter(q, 'bold'); q.hearts = 2; q.hints = 4;
  clear(q); assert.equal(q.hearts, 3); assert.equal(q.hints, 5);
  assert.equal(chooseReward(q, 'invented'), false);
  assert.equal(chooseReward(q, 'rest'), true); assert.equal(q.hearts, 4); assert.equal(q.relics.length, 0);
  assert.equal(chooseReward(q, 'rest'), false); assert.equal(q.room, 1);
  startEncounter(q, 'quiet'); clear(q);
  const offered = q.offers[0]; assert.equal(chooseReward(q, offered), true);
  assert.equal(chooseReward(q, offered), false);
  q.relics = ['lantern']; q.hints = 5; startEncounter(q, 'quiet'); assert.equal(q.hints, 5);
});
test('all five encounters finish with singles; every phase survives backup roundtrip', () => {
  for (let seed = 0; seed < 15; seed++) {
    const state = freshState(), q = state.quest = createQuest(`run-${seed}`);
    const roundtrip = () => assert.deepEqual(parseBackup(JSON.stringify(state)), state);
    for (let room = 0; room < 5; room++) {
      roundtrip(); startEncounter(q, room % 2 ? 'bold' : 'quiet'); roundtrip();
      clear(q); assert.ok(validQuest(q)); roundtrip();
      if (q.phase === 'reward') { assert.equal(q.offers.length, 3); chooseReward(q, q.offers[0]); }
    }
    assert.equal(q.phase, 'won'); assert.equal(q.cleared, 5); assert.equal(q.hearts, 4);
    const saved = structuredClone(q); startEncounter(q, 'quiet'); chooseReward(q, 'rest'); assert.deepEqual(q, saved);
  }
});
test('old backups remain valid; corrupt run state is rejected without changing the original', () => {
  const old = freshState(); delete old.quest; assert.deepEqual(parseBackup(JSON.stringify(old)), old);
  const state = freshState(); state.quest = battle(); const original = structuredClone(state);
  for (const mutate of [q => q.hearts = -1, q => q.room = 5, q => q.offers = ['nib'], q => q.relics = ['unknown'],
    q => q.board.values[0] = 10, q => q.board.solution[0] = q.board.solution[1], q => q.board.notes[90] = [1],
    q => q.phase = 'won', q => q.board.ink = 500, q => q.streak = Infinity, q => q.board = null]) {
    const incoming = structuredClone(state); mutate(incoming.quest);
    assert.throws(() => parseBackup(JSON.stringify(incoming)));
    assert.deepEqual(state, original);
  }
});
test('every relic can be chosen from an offer and its protection renews in a new room', () => {
  for (const r of RELICS) {
    const q = battle(); clear(q); q.offers = [r.id];
    assert.equal(chooseReward(q, r.id), true); assert.ok(q.relics.includes(r.id));
    if (r.id === 'lantern') assert.equal(q.hints, 3);
    startEncounter(q, 'quiet'); assert.equal(q.board.guardUsed, false);
    if (r.id === 'lantern') assert.equal(q.hints, 4);
  }
});
