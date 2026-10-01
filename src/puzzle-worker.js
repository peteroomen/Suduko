import { generatePuzzle } from './engine.js';

self.addEventListener('message', event => {
  const { id, options } = event.data || {};
  try {
    self.postMessage({ id, puzzle: generatePuzzle(options) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Unable to prepare a puzzle.' });
  }
});
