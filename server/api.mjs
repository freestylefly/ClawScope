import http from 'node:http';
import { URL } from 'node:url';
import { getJobDetail, getUsageStats, knowledgeTodos, listCronJobs, listRuns, notificationDigestPreview, DataError } from './openclawData.mjs';

const PORT = Number(process.env.CLAWSCOPE_API_PORT || 4317);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(body);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });

  if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, name: 'ClawScope API', time: new Date().toISOString() });
  if (url.pathname === '/api/jobs') return sendJson(res, 200, { jobs: await listCronJobs() });
  if (url.pathname === '/api/runs') return sendJson(res, 200, { runs: (await listRuns()).slice(0, 100) });
  if (url.pathname.startsWith('/api/jobs/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    return sendJson(res, 200, await getJobDetail(id));
  }
  if (url.pathname === '/api/usage') return sendJson(res, 200, await getUsageStats());
  if (url.pathname === '/api/notification-digest') return sendJson(res, 200, await notificationDigestPreview({ limit: Number(url.searchParams.get('limit') || 80) }));
  if (url.pathname === '/api/todos') return sendJson(res, 200, { todos: await knowledgeTodos({ limit: Number(url.searchParams.get('limit') || 100) }) });
  return sendJson(res, 404, { error: 'not_found' });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (error) {
      const status = error instanceof DataError && error.details?.status ? error.details.status : 500;
      sendJson(res, status, { error: error.name || 'Error', message: error.message, details: error.details ?? undefined });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const srv = createServer();
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} already in use. Set CLAWSCOPE_API_PORT to use a different port.`);
      process.exit(1);
    }
    throw err;
  });
  srv.listen(PORT, () => {
    console.log(`ClawScope API listening on http://localhost:${PORT}`);
  });
}
