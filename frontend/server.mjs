import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.CLAWSCOPE_WEB_PORT || 5174);
const API_ORIGIN = process.env.CLAWSCOPE_API_ORIGIN || 'http://localhost:4317';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function proxyApi(req, res) {
  const upstream = await fetch(`${API_ORIGIN}${req.url}`);
  const body = await upstream.arrayBuffer();
  res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json' });
  res.end(Buffer.from(body));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) return proxyApi(req, res);
    const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    const safePath = path.normalize(urlPath).replace(/^\.\.(\/|\\|$)/, '');
    const filePath = path.join(PUBLIC_DIR, safePath === '/' ? 'index.html' : safePath);
    if (!filePath.startsWith(PUBLIC_DIR)) throw new Error('Invalid path');
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'content-type': types[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } else {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`Frontend error: ${error.message}`);
    }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use. Set CLAWSCOPE_WEB_PORT to use a different port.`);
    process.exit(1);
  }
  throw err;
});
server.listen(PORT, () => console.log(`ClawScope web listening on http://localhost:${PORT}`));
