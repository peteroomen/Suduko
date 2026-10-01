import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { build, projectDir, serviceWorkerSource } from '../scripts/build.mjs';
import { audio } from '../src/audio.js';

test('manifest supplies scoped installation and real maskable icons', async () => {
  const manifest = JSON.parse(await readFile(join(projectDir, 'public/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(item => item.sizes === `${size}x${size}`);
    assert.ok(icon.purpose.includes('maskable'));
    const bytes = await readFile(join(projectDir, 'public', icon.src));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

test('build precaches every shipped module and asset with reproducible content digests', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'suduko-build-'));
  try {
    const first = await build({ output: join(temporary, 'first') });
    const second = await build({ output: join(temporary, 'second') });
    assert.equal(first.version, second.version);
    const manifest = JSON.parse(await readFile(join(first.output, 'build-manifest.json'), 'utf8'));
    const allFiles = async (directory, prefix = '') => {
      const files = [];
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = `${prefix}/${entry.name}`;
        if (entry.isDirectory()) files.push(...await allFiles(join(directory, entry.name), path));
        else files.push(path);
      }
      return files;
    };
    const shipped = (await allFiles(first.output)).filter(path => path !== '/build-manifest.json').sort();
    assert.deepEqual(manifest.files, shipped);
    assert.ok(manifest.files.includes('/index.html'));
    assert.ok(manifest.files.includes('/assets/paper.webp'));
    assert.ok(manifest.files.includes('/assets/fonts/lora.ttf'));
    assert.ok(manifest.files.includes('/src/audio.js'));
    const worker = await readFile(join(first.output, 'service-worker.js'), 'utf8');
    assert.ok(worker.includes(`suduko-shell-${manifest.version}`));
    for (const path of manifest.files) {
      const contents = await readFile(join(first.output, path));
      assert.equal(createHash('sha256').update(contents).digest('hex'), manifest.digests[path], path);
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('service worker waits for active games and serves its complete cached shell offline', async () => {
  const events = {};
  const cached = new Map();
  const deleted = [];
  const cache = {
    async addAll(files) { files.forEach(path => cached.set(path, { cached: path })); },
    async match(path) { return cached.get(path); },
  };
  const files = ['/index.html', '/src/app.js', '/src/bank.js', '/assets/paper.webp'];
  const sandbox = {
    URL,
    self: { location: { origin: 'https://suduko.example' }, addEventListener(type, callback) { events[type] = callback; } },
    caches: {
      async open() { return cache; },
      async keys() { return ['suduko-shell-old', 'suduko-shell-new', 'other-app']; },
      async delete(name) { deleted.push(name); },
    },
    fetch() { throw new Error('Offline'); },
  };
  vm.runInNewContext(serviceWorkerSource('new', files), sandbox);
  let wait;
  events.install({ waitUntil(promise) { wait = promise; } });
  await wait;
  assert.deepEqual([...cached.keys()], files);
  let response;
  events.fetch({
    request: { url: 'https://suduko.example/a-page', mode: 'navigate', method: 'GET' },
    respondWith(promise) { response = promise; },
  });
  assert.equal((await response).cached, '/index.html');
  events.fetch({
    request: { url: 'https://suduko.example/src/bank.js', mode: 'cors', method: 'GET' },
    respondWith(promise) { response = promise; },
  });
  assert.equal((await response).cached, '/src/bank.js');
  events.activate({ waitUntil(promise) { wait = promise; } });
  await wait;
  assert.deepEqual(deleted, ['suduko-shell-old']);
});

test('audio remains safe in a browser without WebAudio and before a user gesture', async () => {
  audio.setSettings({ sound: true, ambience: 'rain', sfxVolume: 0.3, ambienceVolume: 0.2 });
  assert.equal(await audio.unlock(), false);
  for (const kind of ['write', 'erase', 'tap', 'error', 'complete']) audio.play(kind);
  audio.suspend();
  audio.resume();
  audio.setSettings({ sound: false, ambience: 'off' });
});
