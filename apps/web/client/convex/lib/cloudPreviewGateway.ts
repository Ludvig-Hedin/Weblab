/** Runs outside editable source. Only this port is exposed; Next stays on loopback. */
export const CLOUD_PREVIEW_GATEWAY_SCRIPT = String.raw`
'use strict';
const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const COOKIE = '__Host-weblab-preview';
const PARAM = '__weblab_preview';
const capability = process.env.WEBLAB_PREVIEW_CAPABILITY;
const expiresAt = Number(process.env.WEBLAB_PREVIEW_EXPIRES_AT);
const configuredOrigin = process.env.WEBLAB_EDITOR_ORIGIN;
const verifier = process.env.WEBLAB_PREVIEW_VERIFIER;
const projectId = process.env.WEBLAB_PREVIEW_PROJECT_ID;
const branchId = process.env.WEBLAB_PREVIEW_BRANCH_ID;
const sandboxId = process.env.WEBLAB_PREVIEW_SANDBOX_ID;
const convex = new URL(process.env.WEBLAB_CONVEX_URL);
if (convex.protocol !== 'https:' || !convex.hostname.endsWith('.convex.cloud') || convex.username || convex.password ||
    convex.pathname !== '/' || convex.search || convex.hash || !/^[a-f0-9]{64}$/.test(verifier || '') ||
    !projectId || !branchId || !sandboxId) throw new Error('Invalid preview authorization configuration');
if (!/^[a-f0-9]{64}$/.test(capability || '') || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())
  throw new Error('Invalid preview configuration');
const editor = new URL(configuredOrigin);
if (editor.protocol !== 'https:' || editor.username || editor.password || editor.origin !== configuredOrigin)
  throw new Error('Invalid editor origin');
const sockets = new Set();
const remaining = () => Math.max(0, expiresAt - Date.now());
const equal = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) &&
  timingSafeEqual(Buffer.from(value), Buffer.from(capability));
const cookieTicket = req => {
  if (!remaining()) return null;
  const matches = (req.headers.cookie || '').split(';').map(part => part.trim())
    .filter(part => part.slice(0, part.indexOf('=')) === COOKIE);
  const value = matches.length === 1 ? matches[0].slice(COOKIE.length + 1) : null;
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
};
// No positive access cache: each new request/upgrade checks current permissions.
const authorize = async ticket => {
  if (!remaining() || typeof ticket !== 'string' || !/^[a-f0-9]{64}$/.test(ticket)) return false;
  try {
    const response = await fetch(new URL('/api/query', convex), { method: 'POST', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(2000), headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'cloudPreviewAccess:authorize', format: 'convex_encoded_json',
        args: [{ projectId, branchId, sandboxId, verifier, ticket }] }) });
    if (!response.ok) return false;
    const data = await response.json();
    return !!remaining() && data.status === 'success' && data.value?.allowed === true &&
      Number.isSafeInteger(data.value.expiresAt) && data.value.expiresAt > Date.now() && data.value.expiresAt <= expiresAt;
  } catch { return false; }
};
// Pause long-lived traffic during each check. Denial/outage closes both ends;
// already delivered bytes cannot be recalled. No timers remain after close.
const monitorAccess = (ticket, close, pause, resume) => {
  let stopped = false;
  let timer;
  const check = async () => {
    if (stopped) return;
    pause();
    const allowed = await authorize(ticket);
    if (stopped) return;
    if (!allowed) { stopped = true; close(); return; }
    resume();
    timer = setTimeout(check, Math.min(2000, remaining()));
  };
  timer = setTimeout(check, Math.min(2000, remaining()));
  return () => { stopped = true; if (timer) clearTimeout(timer); };
};
const target = req => {
  const raw = req.url;
  const host = req.headers.host;
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') ||
      /[\\\u0000-\u0020\u007f]/.test(raw) || typeof host !== 'string' ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?$/i.test(host)) return null;
  try {
    const url = new URL(raw, 'https://' + host);
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded)) return null;
    return { url, origin: 'https://' + host };
  } catch { return null; }
};
const securityHeaders = () => ({
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
  'content-security-policy': 'frame-ancestors ' + editor.origin,
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin',
});
const deny = (res, status = 401) => {
  res.writeHead(status, { ...securityHeaders(), 'content-type': 'text/plain; charset=utf-8' });
  res.end(status === 401 ? 'Preview access required.' : 'Preview request unavailable.');
};
const blocked = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'authorization', 'referer',
  'x-weblab-preview', 'x-weblab-preview-control', 'x-forwarded-host', 'x-forwarded-proto']);
const forwardHeaders = (req, websocket) => {
  const headers = {};
  const connectionNames = new Set(String(req.headers.connection || '').toLowerCase().split(',').map(x => x.trim()));
  for (const [name, value] of Object.entries(req.headers)) {
    if (!blocked.has(name) && !connectionNames.has(name) && name !== 'cookie') headers[name] = value;
  }
  const cookies = String(req.headers.cookie || '').split(';').map(part => part.trim())
    .filter(part => part && part.slice(0, part.indexOf('=')).toLowerCase() !== COOKIE.toLowerCase());
  if (cookies.length) headers.cookie = cookies.join('; ');
  headers.host = req.headers.host;
  headers['x-forwarded-host'] = req.headers.host;
  headers['x-forwarded-proto'] = 'https';
  if (websocket) { headers.connection = 'Upgrade'; headers.upgrade = 'websocket'; }
  return headers;
};
const responseHeaders = (headers, websocket = false) => {
  const clean = {};
  const connectionNames = new Set(String(headers.connection || '').toLowerCase().split(',').map(x => x.trim()));
  for (const [name, value] of Object.entries(headers)) {
    if (blocked.has(name) || connectionNames.has(name) || name === 'set-cookie' || name === 'content-security-policy' ||
        name === 'cache-control' || name === 'referrer-policy' || name === 'x-frame-options' ||
        name.startsWith('access-control-')) continue;
    clean[name] = value;
  }
  const cookies = headers['set-cookie'];
  if (cookies) {
    const allowed = (Array.isArray(cookies) ? cookies : [cookies])
      .filter(cookie => cookie.slice(0, cookie.indexOf('=')).trim().toLowerCase() !== COOKIE.toLowerCase());
    if (allowed.length) clean['set-cookie'] = allowed;
  }
  Object.assign(clean, securityHeaders());
  if (headers['content-security-policy']) {
    const existing = Array.isArray(headers['content-security-policy']) ? headers['content-security-policy'] : [headers['content-security-policy']];
    clean['content-security-policy'] = [...existing, clean['content-security-policy']];
  }
  if (websocket) { clean.connection = 'Upgrade'; clean.upgrade = 'websocket'; }
  return clean;
};
const server = http.createServer(async (req, res) => {
  const parsed = target(req);
  if (!parsed) return deny(res, 400);
  const tickets = parsed.url.searchParams.getAll(PARAM);
  if (tickets.length) {
    if (req.method !== 'GET' || tickets.length !== 1 || !await authorize(tickets[0])) return deny(res);
    parsed.url.searchParams.delete(PARAM);
    res.writeHead(303, { ...securityHeaders(),
      'set-cookie': COOKIE + '=' + tickets[0] + '; Path=/; Secure; HttpOnly; SameSite=None; Partitioned; Max-Age=' + Math.floor(remaining() / 1000),
      location: parsed.url.pathname + parsed.url.search,
    });
    return res.end();
  }
  const ticket = cookieTicket(req);
  // Only the runtime worker knows this independent readiness credential. It
  // is never issued as a cookie, returned by status, or forwarded to Next.
  const control = ['GET', 'HEAD'].includes(req.method) && equal(req.headers['x-weblab-preview-control']);
  if (!control && !await authorize(ticket)) return deny(res);
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method)) return deny(res, 405);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== parsed.origin) return deny(res, 403);
  let stopMonitoring = () => {};
  let responseStream;
  let pausedForAccess = false;
  const upstream = http.request({ hostname: '127.0.0.1', port: 3001, method: req.method,
    path: parsed.url.pathname + parsed.url.search, headers: forwardHeaders(req, false) }, response => {
    if (!remaining()) { response.destroy(); return deny(res); }
    const headers = responseHeaders(response.headers);
    responseStream = response;
    res.writeHead(response.statusCode || 502, headers);
    response.on('error', () => res.destroy());
    response.pipe(res);
    if (pausedForAccess) response.pause();
  });
  upstream.on('error', () => { if (!res.headersSent) deny(res, 502); else res.destroy(); });
  upstream.setTimeout(60_000, () => upstream.destroy());
  req.on('aborted', () => upstream.destroy());
  req.on('error', () => upstream.destroy());
  res.on('close', () => { stopMonitoring(); upstream.destroy(); });
  res.on('finish', () => stopMonitoring());
  if (!control) stopMonitoring = monitorAccess(ticket,
    () => { upstream.destroy(); res.destroy(); req.destroy(); },
    () => { pausedForAccess = true; req.pause(); if (responseStream) responseStream.pause(); },
    () => { pausedForAccess = false; req.resume(); if (responseStream) responseStream.resume(); });
  req.pipe(upstream);
});
server.on('upgrade', async (req, socket, head) => {
  const reject = () => socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n');
  const parsed = target(req);
  if (!parsed || parsed.url.searchParams.has(PARAM) ||
      req.method !== 'GET' || String(req.headers.upgrade || '').toLowerCase() !== 'websocket' ||
      req.headers.origin !== parsed.origin) return reject();
  const ticket = cookieTicket(req);
  socket.pause();
  if (!await authorize(ticket) || socket.destroyed) return reject();
  const upstream = http.request({ hostname: '127.0.0.1', port: 3001, method: 'GET',
    path: parsed.url.pathname + parsed.url.search, headers: forwardHeaders(req, true) });
  let remote;
  let timer;
  let closed = false;
  let stopMonitoring = () => {};
  let pausedForAccess = false;
  let attachUpgrade = null;
  const close = () => {
    if (closed) return;
    closed = true;
    stopMonitoring();
    if (timer) clearTimeout(timer);
    sockets.delete(close);
    socket.destroy();
    if (remote) remote.destroy();
    upstream.destroy();
  };
  sockets.add(close);
  timer = setTimeout(close, remaining());
  stopMonitoring = monitorAccess(ticket, close,
    () => { pausedForAccess = true; socket.pause(); if (remote) remote.pause(); },
    () => { pausedForAccess = false; if (attachUpgrade) attachUpgrade(); socket.resume(); if (remote) remote.resume(); });
  socket.on('error', close);
  socket.on('close', close);
  upstream.on('error', close);
  upstream.on('response', response => { response.resume(); close(); });
  upstream.setTimeout(10_000, close);
  upstream.on('upgrade', (response, connection, upstreamHead) => {
    if (closed) { connection.destroy(); return; }
    remote = connection;
    remote.pause();
    upstream.setTimeout(0);
    if (!remaining() || response.statusCode !== 101) return close();
    remote.on('error', close);
    remote.on('close', close);
    attachUpgrade = () => {
      attachUpgrade = null;
      if (closed || !remaining()) return close();
      const headers = responseHeaders(response.headers, true);
      socket.write('HTTP/1.1 101 Switching Protocols\r\n');
      for (const [name, value] of Object.entries(headers))
        for (const entry of Array.isArray(value) ? value : [value]) socket.write(name + ': ' + entry + '\r\n');
      socket.write('\r\n');
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) remote.write(head);
      socket.pipe(remote);
      remote.pipe(socket);
      socket.resume();
    };
    // A late upgrade must not bypass a pending current-access check, including
    // the already-read head bytes which would bypass stream pause entirely.
    if (!pausedForAccess) attachUpgrade();
  });
  upstream.end();
});
server.on('connect', (_req, socket) => socket.destroy());
server.on('clientError', (_error, socket) => socket.destroy());
server.headersTimeout = 15_000;
server.requestTimeout = 60_000;
server.maxHeadersCount = 100;
server.listen(3000, '0.0.0.0');
const expiry = setTimeout(() => { for (const close of sockets) close(); server.close(); server.closeAllConnections(); }, remaining());
expiry.unref();
`;
