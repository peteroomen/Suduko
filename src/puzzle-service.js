import { generatePuzzle } from './engine.js';

let nextRequest = 0;
const abortError = () => new DOMException('Puzzle generation was cancelled.', 'AbortError');

/** Generation is isolated from the UI thread. A failed worker is reported,
 * rather than silently starting expensive work on the browser's main thread. */
export function createPuzzle(options = {}) {
  const { signal, ...puzzleOptions } = options;
  if (signal?.aborted) return Promise.reject(abortError());
  // The portable Node API keeps browser-independent tests and authoring simple.
  if (typeof Worker === 'undefined') {
    if (typeof window !== 'undefined') return Promise.reject(new Error('This browser does not support puzzle workers. Please use a current browser.'));
    return Promise.resolve().then(() => generatePuzzle(puzzleOptions));
  }
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL('./puzzle-worker.js', import.meta.url), { type: 'module' }); }
    catch { reject(new Error('Could not start the puzzle worker. Please reload and try again.')); return; }
    const id = ++nextRequest;
    let finished = false;
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); worker.terminate(); };
    const finish = (error, puzzle) => {
      if (finished) return;
      finished = true; cleanup();
      if (error) reject(error); else resolve(puzzle);
    };
    const abort = () => finish(abortError());
    const timeout = setTimeout(() => finish(new Error('Puzzle preparation took too long. Please try again.')), 30000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.addEventListener('message', event => {
      if (event.data?.id !== id) return;
      if (event.data.error) finish(new Error(event.data.error));
      else if (!event.data.puzzle) finish(new Error('The puzzle worker returned an invalid result.'));
      else finish(null, event.data.puzzle);
    });
    worker.addEventListener('error', () => finish(new Error('Puzzle preparation failed. Please reload and try again.')));
    worker.addEventListener('messageerror', () => finish(new Error('The puzzle worker response could not be read.')));
    try { worker.postMessage({ id, options: puzzleOptions }); }
    catch (error) { finish(error); }
  });
}
