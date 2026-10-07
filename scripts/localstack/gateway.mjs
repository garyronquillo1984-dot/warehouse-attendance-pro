// Local API gateway: one URL like a Supabase project.
//   /auth/v1/*  -> Supabase Auth (GoTrue)
//   /rest/v1/*  -> PostgREST
// Adds CORS so the Vite dev server can call it. Development and tests only.
import http from 'node:http';

const PORT = Number(process.env.LS_GATEWAY_PORT || 54321);
const AUTH = Number(process.env.LS_AUTH_PORT || 9999);
const REST = Number(process.env.LS_REST_PORT || 3000);

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, prefer, accept-profile, content-profile, range, x-supabase-api-version',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': 'content-range, x-total-count',
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let port, path;
  if (req.url.startsWith('/auth/v1')) { port = AUTH; path = req.url.slice('/auth/v1'.length) || '/'; }
  // GoTrue builds email links from the external URL's host only (/verify), unlike hosted Supabase.
  else if (req.url.startsWith('/verify')) { port = AUTH; path = req.url; }
  else if (req.url.startsWith('/rest/v1')) { port = REST; path = req.url.slice('/rest/v1'.length) || '/'; }
  else { res.writeHead(404, cors); return res.end('not found'); }
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  const up = http.request({ host: '127.0.0.1', port, path, method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode, { ...r.headers, ...cors });
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502, cors); res.end(String(e)); });
  req.pipe(up);
}).listen(PORT, '127.0.0.1', () => console.log(`gateway on :${PORT}`));
