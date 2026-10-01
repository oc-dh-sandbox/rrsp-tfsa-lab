import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };
http.createServer(async (req, res) => {
  try {
    const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const name = path.resolve(root, '.' + (requestPath.endsWith('/') ? requestPath + 'index.html' : requestPath));
    if (!name.startsWith(root + path.sep) || requestPath.split('/').some(p => p.startsWith('.') && p !== '')) { res.writeHead(403).end(); return; }
    const bytes = await readFile(name);
    res.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(bytes);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`The Long View: http://127.0.0.1:${port}`));
