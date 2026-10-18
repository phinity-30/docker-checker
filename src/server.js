const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  isDockerAvailable,
  listContainers,
  getContainerDetails,
  performContainerAction,
  performBatchAction
} = require('./dockerClient');
const {
  loadGroups,
  createGroup,
  updateGroup,
  deleteGroup
} = require('./groupStore');

// --- CONFIGURATION VIA ENVIRONMENT VARIABLES ---
const PORT = Number(process.env.PORT) || 3000;
const APP_TITLE = process.env.APP_TITLE || 'DockPulse';
const AUTO_REFRESH_SECONDS = Math.max(1, Number(process.env.AUTO_REFRESH_SECONDS) || 4);
const DEFAULT_THEME = (process.env.DEFAULT_THEME || 'dark').toLowerCase();
const DEFAULT_VIEW = (process.env.DEFAULT_VIEW || 'stacks').toLowerCase();
const LOG_TAIL_LINES = Math.max(10, Number(process.env.LOG_TAIL_LINES) || 150);

// Authentication & Security Settings
const AUTH_ENABLED = (process.env.AUTH_ENABLED || 'true').toLowerCase() !== 'false';
const AUTH_USER = process.env.AUTH_USER || process.env.BASIC_AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || process.env.BASIC_AUTH_PASS || 'admin123';
const SESSION_HOURS = Math.max(1, Number(process.env.SESSION_HOURS) || 24);
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`dockpulse-${AUTH_USER}-${AUTH_PASS}`).digest('hex');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const COOKIE_NAME = 'dockpulse_session';

// Brute-force protection store: ip -> { count, resetAt }
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data, extraHeaders = {}) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    ...extraHeaders
  });
  res.end(payload);
}

/**
 * Constant-time string comparison using SHA-256 digests to prevent timing attacks
 */
function safeCompare(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Create signed HMAC session token
 */
function createSessionToken(username) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ u: username, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Verify signed HMAC session token
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  if (!safeCompare(sig, expectedSig)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    if (!safeCompare(data.u, AUTH_USER)) return null;
    return data.u;
  } catch (_) {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      cookies[k] = decodeURIComponent(v);
    }
  });
  return cookies;
}

function getAuthenticatedUser(req) {
  if (!AUTH_ENABLED) return AUTH_USER;
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  return verifySessionToken(token);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString('utf8');
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Ungültiges JSON-Format'));
      }
    });
    req.on('error', reject);
  });
}

function buildStacksSummary(containers) {
  const map = new Map();
  for (const c of containers) {
    const stackName = c.stack || 'standalone';
    if (!map.has(stackName)) {
      map.set(stackName, {
        name: stackName,
        isStandalone: stackName === 'standalone',
        workingDir: c.composeWorkingDir || '',
        containers: [],
        runningCount: 0,
        stoppedCount: 0,
        totalCount: 0
      });
    }
    const entry = map.get(stackName);
    entry.containers.push(c);
    entry.totalCount += 1;
    if (c.state === 'running') {
      entry.runningCount += 1;
    } else {
      entry.stoppedCount += 1;
    }
    if (!entry.workingDir && c.composeWorkingDir) {
      entry.workingDir = c.composeWorkingDir;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.isStandalone && !b.isStandalone) return 1;
    if (!a.isStandalone && b.isStandalone) return -1;
    return a.name.localeCompare(b.name);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    // 1. Healthcheck Endpoint (unauthenticated for Docker/Portainer healthcheck)
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
    }

    // 2. Public Auth Endpoints (/api/auth/status, /api/auth/login, /api/auth/logout)
    if (req.method === 'GET' && pathname === '/api/auth/status') {
      const user = getAuthenticatedUser(req);
      return sendJson(res, 200, {
        authEnabled: AUTH_ENABLED,
        authenticated: Boolean(user),
        username: user || null,
        appTitle: APP_TITLE
      });
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const now = Date.now();
      const attempt = loginAttempts.get(clientIp);
      if (attempt && attempt.count >= MAX_LOGIN_ATTEMPTS && now < attempt.resetAt) {
        const waitSec = Math.ceil((attempt.resetAt - now) / 1000);
        return sendJson(res, 429, {
          error: `Zu viele Fehlversuche. Bitte warte ${waitSec} Sekunden.`
        });
      }

      const body = await parseJsonBody(req);
      const inputUser = String(body.username || '').trim();
      const inputPass = String(body.password || '');

      const validUser = safeCompare(inputUser, AUTH_USER);
      const validPass = safeCompare(inputPass, AUTH_PASS);

      if (!validUser || !validPass) {
        const prevCount = attempt && now < attempt.resetAt ? attempt.count : 0;
        loginAttempts.set(clientIp, {
          count: prevCount + 1,
          resetAt: now + LOCKOUT_MS
        });
        return sendJson(res, 401, {
          error: 'Ungültiger Benutzername oder Passwort.'
        });
      }

      loginAttempts.delete(clientIp);
      const token = createSessionToken(AUTH_USER);
      const maxAge = SESSION_HOURS * 3600;
      return sendJson(
        res,
        200,
        { ok: true, username: AUTH_USER },
        {
          'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
        }
      );
    }

    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      return sendJson(
        res,
        200,
        { ok: true },
        {
          'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
        }
      );
    }

    // 3. Public Static Assets needed for Login Page (/login, /styles.css)
    if (req.method === 'GET' && (pathname === '/login' || pathname === '/login.html')) {
      const user = getAuthenticatedUser(req);
      if (user) {
        res.writeHead(302, { Location: '/' });
        return res.end();
      }
      const loginFile = path.join(PUBLIC_DIR, 'login.html');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return fs.createReadStream(loginFile).pipe(res);
    }

    if (req.method === 'GET' && pathname === '/styles.css') {
      const cssFile = path.join(PUBLIC_DIR, 'styles.css');
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      return fs.createReadStream(cssFile).pipe(res);
    }

    // 4. Enforce Authentication for Dashboard & Protected API Routes
    const currentUser = getAuthenticatedUser(req);
    if (!currentUser) {
      if (pathname.startsWith('/api/')) {
        return sendJson(res, 401, { error: 'Nicht angemeldet', unauthorized: true });
      }
      res.writeHead(302, { Location: '/login' });
      return res.end();
    }

    // --- PROTECTED API ROUTES ---

    // GET /api/overview
    if (req.method === 'GET' && pathname === '/api/overview') {
      const includeStats = parsedUrl.searchParams.get('stats') === 'true';
      const { mode, socketPath, containers } = await listContainers(includeStats);
      const isDemo = mode === 'demo';
      const groups = loadGroups(isDemo);
      const stacks = buildStacksSummary(containers);

      const running = containers.filter(c => c.state === 'running').length;
      const paused = containers.filter(c => c.state === 'paused').length;
      const stopped = containers.length - running - paused;

      return sendJson(res, 200, {
        mode,
        socketPath,
        auth: {
          authEnabled: AUTH_ENABLED,
          username: currentUser
        },
        config: {
          appTitle: APP_TITLE,
          autoRefreshSeconds: AUTO_REFRESH_SECONDS,
          defaultTheme: DEFAULT_THEME,
          defaultView: DEFAULT_VIEW,
          logTailLines: LOG_TAIL_LINES
        },
        stats: {
          total: containers.length,
          running,
          paused,
          stopped,
          stacksCount: stacks.filter(s => !s.isStandalone).length,
          groupsCount: groups.length
        },
        containers,
        stacks,
        groups
      });
    }

    // GET /api/containers/:id
    const containerDetailMatch = pathname.match(/^\/api\/containers\/([^/]+)$/);
    if (req.method === 'GET' && containerDetailMatch) {
      const idOrName = decodeURIComponent(containerDetailMatch[1]);
      const tail = Number(parsedUrl.searchParams.get('tail')) || LOG_TAIL_LINES;
      const details = await getContainerDetails(idOrName, tail);
      return sendJson(res, 200, details);
    }

    // POST /api/containers/:id/action
    const containerActionMatch = pathname.match(/^\/api\/containers\/([^/]+)\/action$/);
    if (req.method === 'POST' && containerActionMatch) {
      const idOrName = decodeURIComponent(containerActionMatch[1]);
      const body = await parseJsonBody(req);
      const result = await performContainerAction(idOrName, body.action);
      return sendJson(res, 200, result);
    }

    // POST /api/batch-action
    if (req.method === 'POST' && pathname === '/api/batch-action') {
      const body = await parseJsonBody(req);
      const result = await performBatchAction(body.targets || [], body.action);
      return sendJson(res, 200, result);
    }

    // GET /api/groups
    if (req.method === 'GET' && pathname === '/api/groups') {
      const live = await isDockerAvailable();
      return sendJson(res, 200, { groups: loadGroups(!live) });
    }

    // POST /api/groups
    if (req.method === 'POST' && pathname === '/api/groups') {
      const live = await isDockerAvailable();
      const body = await parseJsonBody(req);
      if (!body.name || !String(body.name).trim()) {
        return sendJson(res, 400, { error: 'Bitte gib einen Gruppennamen an.' });
      }
      const created = createGroup(
        {
          name: body.name,
          description: body.description,
          icon: body.icon,
          containerNames: body.containerNames || []
        },
        !live
      );
      return sendJson(res, 201, { group: created });
    }

    // PUT /api/groups/:id
    const groupMatch = pathname.match(/^\/api\/groups\/([^/]+)$/);
    if (req.method === 'PUT' && groupMatch) {
      const groupId = decodeURIComponent(groupMatch[1]);
      const live = await isDockerAvailable();
      const body = await parseJsonBody(req);
      const updated = updateGroup(groupId, body, !live);
      if (!updated) {
        return sendJson(res, 404, { error: 'Gruppe nicht gefunden.' });
      }
      return sendJson(res, 200, { group: updated });
    }

    // DELETE /api/groups/:id
    if (req.method === 'DELETE' && groupMatch) {
      const groupId = decodeURIComponent(groupMatch[1]);
      const live = await isDockerAvailable();
      const deleted = deleteGroup(groupId, !live);
      if (!deleted) {
        return sendJson(res, 404, { error: 'Gruppe nicht gefunden.' });
      }
      return sendJson(res, 200, { ok: true });
    }

    // --- PROTECTED STATIC FRONTEND SERVING ---
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const resolvedPath = path.normalize(path.join(PUBLIC_DIR, filePath));
    if (!resolvedPath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
      fs.createReadStream(resolvedPath).pipe(res);
    } else {
      const indexFile = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        fs.createReadStream(indexFile).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    }
  } catch (err) {
    console.error('Server Error:', err);
    sendJson(res, 500, { error: err.message || 'Interner Serverfehler' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`🐳 ${APP_TITLE} (Docker-Checker) läuft auf Port ${PORT}`);
  console.log(`🔐 Login-Schutz: ${AUTH_ENABLED ? `AKTIV (Benutzer: ${AUTH_USER})` : 'DEAKTIVIERT'}`);
  console.log(`🌐 Web-UI: http://localhost:${PORT}`);
  console.log(`=================================================`);
});
