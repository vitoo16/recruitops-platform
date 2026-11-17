#!/usr/bin/env node
// Minimal local static-server for Playwright budget tests; replaces Python dependency on Windows.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep, join } from 'node:path';
const root = resolve(process.argv[2] ?? 'out');
const port = Number(process.argv[3] ?? 3200);
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png',
  '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.ico':'image/x-icon' };
createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const target = resolve(root, '.' + pathname);
    if (target !== root && !target.startsWith(root + sep)) {
      response.writeHead(403); response.end(); return;
    }
    const choices = [target, target + '.html', join(target, 'index.html')];
    const path = choices.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
    if (!path) { response.writeHead(404); response.end('Not found'); return; }
    response.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream');
    createReadStream(path).pipe(response);
  } catch { response.writeHead(400); response.end('Invalid request'); }
}).listen(port, '127.0.0.1');
