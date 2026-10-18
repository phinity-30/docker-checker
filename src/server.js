const http = require('http');
const fs = require('fs');
const path = require('path');
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

// Configuration via Environment Variables
const PORT = Number(process.env.PORT) || 3000;
const APP_TITLE = process.env.APP_TITLE || 'DockPulse';
const AUTO_REFRESH_SECONDS = Math.max(1, Number(process.env.AUTO_REFRESH_SECONDS) || 4);
const DEFAULT_THEME = (process.env.DEFAULT_THEME || 'dark').toLowerCase();
const DEFAULT_VIEW = (process.env.DEFAULT_VIEW || 'stacks').toLowerCase();
const LOG_TAIL_LINES = Math.max(10, Number(process.env.LOG_TAIL_LINES) || 150);
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || '';
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || '';

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function checkBasicAuth(req, res) {
  if (!BASIC_AUTH_USER || !BASIC_AUTH_PASS) return true;
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Basic ')) {
    res.writeHead(401, { 'WWW-Authenticate': `Basic realm="${APP_TITLE}"` });
    res.end('Authentifizierung erforderlich');
    return false;
  }
  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const [user, pass] = credentials.split(':');
  if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) {
    return true;
  }
  res.writeHead(401, { 'WWW-Authenticate': `Basic realm="${APP_TITLE}"` });
  res.end('Ungültige Zugangsdaten');
  return false;
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

/**
 * Build Portainer-style Stacks summary from container list
 */
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

    // Healthcheck Endpoint (unauthenticated for Docker/Portainer healthcheck)
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
    }

    // Optional Basic Auth Check
    if (!checkBasicAuth(req, res)) return;

    // --- API ROUTES ---

    // 1. GET /api/overview
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

    // 2. GET /api/containers/:id
    const containerDetailMatch = pathname.match(/^\/api\/containers\/([^/]+)$/);
    if (req.method === 'GET' && containerDetailMatch) {
      const idOrName = decodeURIComponent(containerDetailMatch[1]);
      const tail = Number(parsedUrl.searchParams.get('tail')) || LOG_TAIL_LINES;
      const details = await getContainerDetails(idOrName, tail);
      return sendJson(res, 200, details);
    }

    // 3. POST /api/containers/:id/action
    const containerActionMatch = pathname.match(/^\/api\/containers\/([^/]+)\/action$/);
    if (req.method === 'POST' && containerActionMatch) {
      const idOrName = decodeURIComponent(containerActionMatch[1]);
      const body = await parseJsonBody(req);
      const result = await performContainerAction(idOrName, body.action);
      return sendJson(res, 200, result);
    }

    // 4. POST /api/batch-action (Stack / Group / Multi-Select Start, Stop, Restart)
    if (req.method === 'POST' && pathname === '/api/batch-action') {
      const body = await parseJsonBody(req);
      const result = await performBatchAction(body.targets || [], body.action);
      return sendJson(res, 200, result);
    }

    // 5. GET /api/groups
    if (req.method === 'GET' && pathname === '/api/groups') {
      const live = await isDockerAvailable();
      return sendJson(res, 200, { groups: loadGroups(!live) });
    }

    // 6. POST /api/groups (Create merged container group)
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

    // 7. PUT /api/groups/:id (Update group / add or remove containers)
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

    // 8. DELETE /api/groups/:id
    if (req.method === 'DELETE' && groupMatch) {
      const groupId = decodeURIComponent(groupMatch[1]);
      const live = await isDockerAvailable();
      const deleted = deleteGroup(groupId, !live);
      if (!deleted) {
        return sendJson(res, 404, { error: 'Gruppe nicht gefunden.' });
      }
      return sendJson(res, 200, { ok: true });
    }

    // --- STATIC FRONTEND SERVING ---
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const resolvedPath = path.normalize(path.join(PUBLIC_DIR, filePath));
    if (!resolvedPath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(resolvedPath).pipe(res);
    } else {
      const indexFile = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
  console.log(`🌐 Web-UI: http://localhost:${PORT}`);
  console.log(`=================================================`);
});
