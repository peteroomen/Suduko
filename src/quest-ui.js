import { ROOMS, RELICS, createQuest, startEncounter, writeAnswer, chooseReward, damagePreview, questHint, applyQuestHint, isPeer } from './quest.js';

const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const action = (id, label, cls = 'secondary', disabled = false, pressed) => `<button ${pressed === undefined ? '' : `aria-pressed="${pressed}"`} class="${cls}" data-quest="${id}" ${disabled ? 'disabled' : ''}>${label}</button>`;
function creature(room) {
  const shapes = [
    '<path d="M21 43Q9 19 35 24Q44 6 52 24Q82 17 68 45Q77 65 52 62Q34 79 29 60Q9 66 21 43Z"/>',
    '<path d="M40 33Q-3 2 9 42Q5 73 38 56Q49 82 53 54Q84 78 80 40Q92 0 49 32Z"/>',
    '<path d="M9 53Q-1 27 20 20Q41 12 43 41Q47 13 65 20Q91 24 79 55Q66 77 45 60Q19 79 9 53Z"/>',
    '<path d="M20 52 7 24 33 33 44 7 54 29 78 15 72 47 86 65 59 61Q33 80 20 52Z"/>',
    '<path d="m17 32-6-22 22 12L44 3l13 19 23-13-8 25Q92 49 73 67Q45 86 17 65Q0 50 17 32Z"/>',
  ];
  return `<svg class="quest-creature" viewBox="0 0 90 85" aria-hidden="true"><g fill="currentColor" stroke="currentColor" stroke-width="2">${shapes[room]}</g><g fill="var(--sheet)" stroke="none"><ellipse cx="33" cy="42" rx="5" ry="7"/><ellipse cx="56" cy="42" rx="5" ry="7"/></g><path d="M32 57q12 7 25-1" stroke="var(--sheet)" stroke-width="2"/></svg>`;
}
const rules = `<details class="quest-rules"><summary>How Pencil Quest works</summary><p>Normal Sudoku: 1–9 once in each row, column and 3 × 3 box. Clear five ink creatures to rescue your notebook.</p><p>Correct answer: 3 ink. Starred square: +2. Every fourth answer in a streak: +2. Complete a row, column or box: +2 each. Upgrades add to these bonuses.</p><p>A wrong answer costs one of your 4 hearts and resets your streak. Correct answers dry in place; you cannot erase or farm them. Pencil notes are always free.</p><p>Spend a hint to write and explain one proven step. This resets your streak and clears no ink. Fully solving a grid always clears its creature. You start with 2 hints.</p><p>Between encounters, take one upgrade or recover 1 heart. A bold path adds 25% ink (rounded up), then restores 1 heart and 1 hint on a win. Hearts cap at 4; hints cap at 5. No clock. Progress saves automatically.</p><p>Keyboard: arrows move, 1–9 write, N toggles notes, Delete clears notes. Leaving Quest pauses your adventure.</p></details>`;

export function createQuestUI({ getRun, setRun, save, render, sound, confirmRestart }) {
  let notes = false, hint = null, message = '', lastRun = null;
  function resetView() { notes = false; hint = null; message = ''; }
  function changed() { save(); render(); }
  function select(i) {
    const q = getRun();
    if (q?.phase !== 'battle') return;
    q.board.selected = i;
    hint = null;
    message = '';
    changed();
  }
  function enter(value) {
    const q = getRun();
    if (!q) return;
    const result = writeAnswer(q, q.board?.selected, value, { note: notes });
    message = result.text;
    hint = null;
    if (result.changed) { sound(result.type === 'note' ? 'tap' : result.type); changed(); }
    else render();
  }
  function handle(id) {
    const q = getRun();
    if (id === 'start' || id === 'restart') {
      const start = () => { setRun(createQuest()); resetView(); changed(); };
      if (q && !['won', 'lost'].includes(q.phase)) confirmRestart(start);
      else start();
      return;
    }
    if (!q) return;
    if (id.startsWith('route:')) {
      if (startEncounter(q, id.slice(6))) { resetView(); changed(); }
    } else if (id.startsWith('reward:')) {
      if (chooseReward(q, id.slice(7))) { resetView(); changed(); }
    } else if (id === 'notes' && q.phase === 'battle') { notes = !notes; render(); }
    else if (id === 'erase') enter(0);
    else if (id === 'hint') {
      hint = q.phase === 'battle' && q.hints ? { pending: true, title: 'A little light?', explanation: 'Spend 1 hint to write and explain a proven answer. It resets your streak and clears no ink.' } : null;
      changed();
    } else if (id === 'apply-hint' && hint?.pending) {
      const step = questHint(q);
      if (applyQuestHint(q)) { sound(q.phase === 'battle' ? 'write' : 'complete'); message = 'Hint applied. Streak reset; no ink damage.'; hint = { title: step.title, explanation: step.explanation, cells: step.cells }; }
      else hint = null;
      changed();
    } else if (id === 'dismiss') { hint = null; render(); }
  }
  function board(q) {
    const b = q.board;
    return `<div class="board quest-board" role="group" aria-label="9 by 9 Quest Sudoku" style="grid-template-columns:repeat(9,1fr)">${b.values.map((v, i) => {
      const r = Math.floor(i / 9), c = i % 9;
      const classes = ['cell', !b.givens[i] ? 'edit' : '', isPeer(i, b.selected) ? 'peer' : '',
        v && v === b.values[b.selected] ? 'same' : '', i === b.selected ? 'selected' : '',
        b.stars.includes(i) && !v ? 'quest-star' : '', hint?.cells?.includes(i) ? 'hint-cell' : '',
        c === 2 || c === 5 ? 'edge-r' : '', r === 2 || r === 5 ? 'edge-b' : '', c === 8 ? 'last-r' : '', r === 8 ? 'last-b' : ''].join(' ');
      const marks = b.notes[i] || [];
      return `<button class="${classes}" data-qcell="${i}" tabindex="${i === b.selected ? 0 : -1}" aria-pressed="${i === b.selected}" aria-label="Row ${r + 1}, column ${c + 1}, ${v ? v + (b.givens[i] ? ', printed clue' : ', dried answer') : 'empty' + (b.stars.includes(i) ? ', starred' : '') + (marks.length ? ', notes ' + marks.join(', ') : '')}">${v || (marks.length ? `<span class="cell-notes">${Array.from({ length: 9 }, (_, n) => `<span>${marks.includes(n + 1) ? n + 1 : ''}</span>`).join('')}</span>` : '')}${b.stars.includes(i) && !v ? '<span class="star-mark" aria-hidden="true">✦</span>' : ''}</button>`;
    }).join('')}</div>`;
  }
  function html() {
    const q = getRun();
    if (q !== lastRun) { resetView(); lastRun = q; }
    const title = `<span class="badge">A little adventure in the margins</span><h2>Pencil Quest<span class="quest-title-star" aria-hidden="true">✧</span></h2>`;
    if (!q) return `<section class="quest">${title}<div class="ticket quest-intro">${creature(0)}<h3>Your notebook has visitors.</h3><p class="muted">Five ink creatures. Four hearts. A pencil with something to prove.</p><p>Play ordinary Sudoku to clear the blots. Find little upgrades, build a streak, and rescue your notebook—one short encounter at a time.</p>${action('start', 'Begin an adventure', 'primary')}<small class="notice">Classic 9 × 9 · no time limit · saves as you go</small></div>${rules}</section>`;
    const spec = ROOMS[q.room];
    const head = `<div class="quest-topline"><span class="badge">Pencil Quest · ${q.room === 4 ? 'final encounter' : 'encounter ' + (q.room + 1) + ' of 5'}</span><span class="quest-hearts" aria-label="${q.hearts} of 4 hearts">${'♥'.repeat(q.hearts)}<span aria-hidden="true">${'♡'.repeat(4 - q.hearts)}</span></span></div><ol class="quest-map" aria-label="Run progress">${ROOMS.map((r, i) => `<li class="${i < q.cleared ? 'done' : i === q.room ? 'current' : ''}" ${i === q.room ? 'aria-current="step"' : ''} aria-label="${esc(r.name)}${i < q.cleared ? ', cleared' : i === q.room ? ', current' : ', ahead'}">${i < q.cleared ? '✓' : i === 4 ? '♛' : i + 1}</li>`).join('')}</ol>`;
    const relics = q.relics.length ? `<div class="quest-kit" aria-label="Your upgrades">${q.relics.map(id => { const r = RELICS.find(x => x.id === id); return `<details><summary>${r.mark} ${r.name}</summary><p>${r.text}</p></details>`; }).join('')}</div>` : '';
    let body;
    if (q.phase === 'route') {
      body = `<div class="quest-encounter">${creature(q.room)}<h2>${spec.name}</h2><p class="muted">${spec.subtitle}</p></div><p class="quest-prompt">Choose your path. Same Sudoku, different stakes.</p><div class="quest-choices">${action('route:quiet', `<strong>The quiet margin</strong><span>${spec.ink} ink · ${spec.difficulty === 'beginner' ? 'single-candidate' : 'hidden-single'} Sudoku</span><small>${q.room === 4 ? 'Clear the Inkkeeper and rescue your notebook.' : 'Clear the creature, then choose an upgrade.'}</small>`, 'quest-choice')}${action('route:bold', `<strong>The bold margin <span aria-hidden="true">✦</span></strong><span>${spec.ink + Math.ceil(spec.ink / 4)} ink · same puzzle</span><small>On clear: +1 heart and +1 hint${q.room === 4 ? '' : ', plus your upgrade'}.${q.room === 4 ? ' Finish with a flourish.' : ''}</small>`, 'quest-choice bold')}</div><p class="notice">${q.hints} hints packed. ${q.room === 0 ? 'Start on the quiet margin to find your feet.' : 'Your upgrades travel with you.'}</p>`;
    } else if (q.phase === 'battle') {
      const b = q.board, damage = damagePreview(q, b.selected);
      body = `<div class="quest-enemy">${creature(q.room)}<div><h3>${spec.name}</h3><div class="quest-ink-label"><span>${b.route === 'bold' ? 'Bold' : 'Quiet'} margin</span><strong>${b.ink} / ${b.maximum} ink</strong></div><meter min="0" max="${b.maximum}" value="${b.ink}" aria-label="Creature ink remaining">${b.ink}</meter></div></div><div class="quest-battle-meta"><span>Streak <strong>${q.streak}</strong> · ${4 - q.streak % 4} to bonus</span><span>${q.relics.includes('guard') ? b.guardUsed ? '◇ Eraser used' : '◇ Heart protected' : `${q.hints} hints left`}</span></div>${board(q)}<div class="quest-tools">${action('notes', notes ? '✎ Notes on' : '✎ Notes off', 'secondary' + (notes ? ' active' : ''), false, notes)}${action('erase', 'Clear notes')}${action('hint', `Hint · ${q.hints}`, 'secondary', !q.hints)}</div><div class="keypad quest-keys">${Array.from({ length: 9 }, (_, i) => `<button data-qvalue="${i + 1}" aria-label="${notes ? 'Toggle note' : 'Write'} ${i + 1}">${i + 1}</button>`).join('')}</div><p class="quest-preview">${notes ? 'Pencil marks are free. Press N to switch.' : damage ? `This square clears ${damage} ink with the correct answer.` : 'Choose an empty square. Correct answers stay in place.'}</p>${hint ? `<div class="hint" role="status"><h3>${esc(hint.title)}</h3><p>${esc(hint.explanation)}</p>${hint.pending ? action('apply-hint', 'Apply · spend 1 hint', 'primary') : ''}${action('dismiss', 'Keep thinking', 'text-button')}</div>` : ''}<p class="status" role="status">${esc(message || '✦ Starred squares +2 ink · every fourth answer +2')}</p>`;
    } else if (q.phase === 'reward') {
      body = `<div class="quest-result"><span class="quest-stamp">PAGE RESCUED</span><h2>A little stronger.</h2><p class="muted">${spec.name} is back in the margins.${q.board.route === 'bold' ? ' Bold reward collected: +1 heart and +1 hint (up to their caps).' : ''}</p></div><p class="quest-prompt">Take one upgrade for the rest of this run.</p><div class="quest-choices">${q.offers.map(id => { const r = RELICS.find(x => x.id === id); return action('reward:' + id, `<strong>${r.mark} ${r.name}</strong><span>${r.text}</span>`, 'quest-choice'); }).join('')}${action('reward:rest', '<strong>♡ A tea break</strong><span>Recover 1 heart instead of taking an upgrade.</span>', 'quest-choice', q.hearts === 4)}</div>`;
    } else {
      body = `<div class="ticket quest-result">${creature(q.room)}<span class="quest-stamp">${q.phase === 'won' ? 'NOTEBOOK RESCUED' : 'TO BE CONTINUED'}</span><h2>${q.phase === 'won' ? 'The last word is yours.' : 'Even pencils have off days.'}</h2><p class="muted">${q.phase === 'won' ? 'Five creatures cleared. A small adventure, neatly finished.' : 'Your hearts ran out. A fresh notebook is waiting, with a new set of possibilities.'}</p><div class="quest-summary"><span><strong>${q.cleared}/5</strong> pages rescued</span><span><strong>${q.writes}</strong> answers written</span><span><strong>${q.mistakes}</strong> slips</span><span><strong>${q.hintsUsed}</strong> hints used</span></div>${action('restart', 'Try a fresh adventure', 'primary')}</div>`;
    }
    return `<section class="quest">${head}${body}${relics}${rules}${!['won', 'lost'].includes(q.phase) ? action('restart', 'Start over…', 'text-button') : ''}</section>`;
  }
  return {
    html,
    click(button) {
      if (button.dataset.quest) handle(button.dataset.quest);
      else if (button.dataset.qcell !== undefined) select(Number(button.dataset.qcell));
      else if (button.dataset.qvalue) enter(Number(button.dataset.qvalue));
      else return false;
      return true;
    },
    key(event) {
      const q = getRun();
      if (q?.phase !== 'battle' || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toUpperCase(), b = q.board;
      if (/^[1-9]$/.test(key)) { event.preventDefault(); enter(Number(key)); }
      else if (key === 'N') { event.preventDefault(); notes = !notes; render(); }
      else if (key === 'DELETE' || key === 'BACKSPACE') { event.preventDefault(); enter(0); }
      else if (['ARROWUP', 'ARROWDOWN', 'ARROWLEFT', 'ARROWRIGHT'].includes(key)) {
        event.preventDefault();
        const r = Math.floor(b.selected / 9), c = b.selected % 9;
        const i = key === 'ARROWUP' ? ((r + 8) % 9) * 9 + c : key === 'ARROWDOWN' ? ((r + 1) % 9) * 9 + c : key === 'ARROWLEFT' ? r * 9 + (c + 8) % 9 : r * 9 + (c + 1) % 9;
        select(i);
        document.querySelector(`[data-qcell="${i}"]`)?.focus({ preventScroll: true });
      }
    },
  };
}
