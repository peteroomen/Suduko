import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { projectDir } from './build.mjs';

const args = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const port = Number(argument('--port', process.env.PORT || 4173));
const host = argument('--host', '127.0.0.1');
const isPreview = args.includes('--dist');
const root = isPreview ? join(projectDir, 'dist') : projectDir;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const publicPath = isPreview || pathname.startsWith('/src/') || pathname === '/' || pathname === '/index.html'
      ? root : join(root, 'public');
    let target = resolve(publicPath, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (target !== publicPath && !target.startsWith(publicPath + sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!isPreview && pathname.startsWith('/src/') && !target.startsWith(join(root, 'src') + sep)) {
      response.writeHead(403).end(); return;
    }
    if (!isPreview && !(pathname === '/' || pathname === '/index.html' || pathname.startsWith('/src/') || publicPath.endsWith('/public'))) {
      response.writeHead(404).end(); return;
    }
    if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': types[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(port, host, () => console.log(`Suduko ${isPreview ? 'preview' : 'development'}: http://${host}:${port}`));
