// Optional browser test. Install Playwright separately; no browser code ships in the app.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { logicalMoves } from './quest-balance.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const artifactDir = process.env.QUEST_ARTIFACTS || '/tmp/quest-browser';
await mkdir(artifactDir, { recursive: true });
const server = spawn(process.execPath, ['scripts/dev.mjs', '--dist', '--port', '4178'], { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
try {
  await once(server.stdout, 'data');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const click = selector => page.locator(selector).click();
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('paper-sudoku-v1')));
  const quest = async () => (await state()).quest;
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
  await page.goto('http://127.0.0.1:4178');
  await click('[data-page="quest"]');
  await page.screenshot({ path: `${artifactDir}/intro-mobile.png`, fullPage: true });
  await click('[data-quest="start"]');
  await click('[data-quest="route:quiet"]');
  assert.equal(await page.locator('.quest-board .cell').count(), 81);
  let q = await quest(), i = q.board.selected, right = q.board.solution[i], wrong = right % 9 + 1;
  await click('[data-quest="notes"]'); await click(`[data-qvalue="${wrong}"]`);
  assert.equal((await quest()).hearts, 4); assert.deepEqual((await quest()).board.notes[i], [wrong]);
  await page.keyboard.press('Delete'); assert.equal((await quest()).board.notes[i], undefined);
  await page.keyboard.press('n'); await page.keyboard.press(String(wrong));
  assert.equal((await quest()).hearts, 3); assert.equal((await quest()).board.values[i], 0);
  await page.keyboard.press(String(right)); assert.equal((await quest()).writes, 1);
  await page.keyboard.press(String(right)); assert.equal((await quest()).writes, 1);
  await page.keyboard.press('ArrowRight'); assert.equal((await quest()).board.selected, Math.floor(i / 9) * 9 + (i % 9 + 1) % 9);
  const ink = (await quest()).board.ink;
  await click('[data-quest="hint"]');
  assert.equal((await quest()).hints, 2);
  assert.ok(!(await page.locator('.hint').innerText()).includes('can only be'), 'no free hint reveal before purchase');
  await click('[data-quest="apply-hint"]');
  assert.equal((await quest()).hints, 1); assert.equal((await quest()).board.ink, ink);
  assert.equal(await page.locator('[data-quest="apply-hint"]').count(), 0, 'hint cannot apply twice');
  assert.ok((await page.locator('.hint').innerText()).includes('row'));
  await click('[data-quest="dismiss"]');
  const saved = await quest();
  await page.reload(); await click('[data-page="quest"]'); assert.deepEqual(await quest(), saved);
  await click('[data-quest="restart"]');
  await page.getByRole('button', { name: 'Keep this run', exact: true }).click();
  assert.equal((await quest()).seed, saved.seed);
  await noOverflow();
  await page.screenshot({ path: `${artifactDir}/battle-mobile.png`, fullPage: true });
  console.log('PASS notes, keyboard, mistakes, locked answers, paid hints, reload, restart cancellation');
  let rewards = 0;
  while (!['won', 'lost'].includes((q = await quest()).phase)) {
    if (q.phase === 'route') {
      await click('[data-quest="route:bold"]');
    } else if (q.phase === 'reward') {
      await page.screenshot({ path: `${artifactDir}/reward-mobile.png`, fullPage: true });
      if (!rewards) {
        await click('[data-quest="reward:rest"]'); assert.equal((await quest()).hearts, 4);
      } else await click(`[data-quest="reward:${q.offers[0]}"]`);
      rewards++;
    } else {
      const move = logicalMoves(q.board.values)[0]; assert.ok(move);
      await click(`[data-qcell="${move.index}"]`);
      await page.keyboard.press(String(move.value));
    }
  }
  assert.equal(q.phase, 'won'); assert.equal(q.cleared, 5); assert.equal(rewards, 4);
  await page.screenshot({ path: `${artifactDir}/victory-mobile.png`, fullPage: true });
  console.log('PASS five complete encounters via logical UI moves, rest, upgrades, bold rewards, victory');
  await click('[data-page="settings"]');
  const downloadPromise = page.waitForEvent('download'); await click('[data-action="export"]');
  const download = await downloadPromise; await download.saveAs(`${artifactDir}/backup.json`);
  const won = await quest();
  await click('[data-page="quest"]'); await click('[data-quest="restart"]'); await click('[data-quest="route:quiet"]');
  q = await quest(); i = q.board.selected; wrong = q.board.solution[i] % 9 + 1;
  for (let n = 0; n < 4; n++) await page.keyboard.press(String(wrong));
  assert.equal((await quest()).phase, 'lost');
  await page.screenshot({ path: `${artifactDir}/defeat-mobile.png`, fullPage: true });
  await page.keyboard.press(String(q.board.solution[i])); assert.equal((await quest()).phase, 'lost');
  await click('[data-page="settings"]');
  await page.locator('#backup-file').setInputFiles(`${artifactDir}/backup.json`);
  await page.getByRole('button', { name: 'Replace with backup', exact: true }).click();
  assert.deepEqual(await quest(), won);
  console.log('PASS defeat lockout, fresh run, export/import preserves full Quest');
  await click('[data-page="play"]'); await click('[data-action="new"]');
  await page.getByRole('button', { name: 'Start puzzle', exact: true }).click();
  await page.locator('.board').waitFor();
  const classic = (await state()).games[0];
  await page.keyboard.press(String(classic.solution[classic.selected]));
  assert.equal((await state()).games[0].values[classic.selected], classic.solution[classic.selected]);
  await click('[data-action="undo"]'); assert.equal((await state()).games[0].values[classic.selected], 0);
  await click('[data-mode="16"]'); await click('[data-action="new"]');
  await page.getByRole('button', { name: 'Start puzzle', exact: true }).click();
  await page.locator('.board.super').waitFor(); assert.equal(await page.locator('.cell').count(), 64);
  assert.deepEqual(await quest(), won);
  console.log('PASS Classic entries/undo and Super focus; ordinary games isolated from Quest');
  await click('[data-page="quest"]'); await click('[data-quest="restart"]'); await click('[data-quest="route:bold"]');
  for (const [width, height] of [[320, 740], [360, 800], [412, 915], [1440, 1000]]) {
    await page.setViewportSize({ width, height }); await noOverflow();
    await page.screenshot({ path: `${artifactDir}/battle-${width}.png`, fullPage: true });
  }
  await click('[data-page="settings"]'); await page.locator('[data-setting="theme"]').selectOption('dark');
  await page.locator('[data-setting="reducedMotion"]').check(); await click('[data-page="quest"]');
  await page.screenshot({ path: `${artifactDir}/battle-dark.png`, fullPage: true });
  assert.ok(await page.locator('html').evaluate(e => e.classList.contains('dark') && e.classList.contains('reduced')));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await click('[data-page="quest"]');
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
  const offlineSave = await quest(); await context.setOffline(true);
  await page.reload(); await click('[data-page="quest"]'); assert.deepEqual(await quest(), offlineSave);
  const step = logicalMoves(offlineSave.board.values)[0];
  await click(`[data-qcell="${step.index}"]`); await page.keyboard.press(String(step.value));
  assert.equal((await quest()).writes, offlineSave.writes + 1);
  await click('[data-quest="restart"]'); await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await click('[data-quest="route:quiet"]'); assert.equal((await quest()).phase, 'battle');
  assert.deepEqual(errors, []);
  console.log('PASS 320/360/412/1440 widths, dark/reduced motion, offline reload/play/new run; zero browser errors');
} finally {
  await browser?.close(); server.kill();
}
