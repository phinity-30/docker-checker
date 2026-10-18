const http = require('http');
const os = require('os');

// Determine Docker Socket / Host configuration
const DEFAULT_SOCKET =
  process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || DEFAULT_SOCKET;
const DOCKER_HOST = process.env.DOCKER_HOST || null;
const FORCE_DEMO = process.env.DEMO_MODE === 'true';

// Stateful Demo Containers for fallback when no Docker Daemon is reachable locally
const demoContainers = [
  {
    id: 'a81f92c1b011',
    fullId: 'a81f92c1b0114e8a9c01d3b5f6a7e8c9d0b1a2f3e4d5c6b7a890123456789abc',
    name: 'nginx-proxy',
    image: 'jc21/nginx-proxy-manager:latest',
    stack: 'proxy-stack',
    service: 'app',
    composeWorkingDir: '/opt/stacks/proxy-stack',
    state: 'running',
    status: 'Up 4 days (healthy)',
    created: Math.floor(Date.now() / 1000) - 3600 * 108,
    startedAt: new Date(Date.now() - 3600 * 108 * 1000).toISOString(),
    restartPolicy: 'unless-stopped',
    ports: [
      { ip: '0.0.0.0', publicPort: 80, privatePort: 80, type: 'tcp' },
      { ip: '0.0.0.0', publicPort: 443, privatePort: 443, type: 'tcp' },
      { ip: '0.0.0.0', publicPort: 81, privatePort: 81, type: 'tcp' }
    ],
    ip: '172.18.0.2',
    networkName: 'proxy-stack_default',
    gateway: '172.18.0.1',
    macAddress: '02:42:ac:12:00:02',
    cpuPercent: 1.4,
    memUsageMb: 68.5,
    memLimitMb: 16384,
    netRxMb: 412.8,
    netTxMb: 890.4,
    cmd: ['init'],
    entrypoint: ['/init'],
    mounts: [
      { type: 'bind', source: '/opt/stacks/proxy-stack/data', destination: '/data', rw: true },
      { type: 'bind', source: '/opt/stacks/proxy-stack/letsencrypt', destination: '/etc/letsencrypt', rw: true }
    ],
    env: [
      'DB_MYSQL_HOST=proxy-db',
      'DB_MYSQL_PORT=3306',
      'DB_MYSQL_USER=npm',
      'DB_MYSQL_PASSWORD=supersecret_npm_pw',
      'DISABLE_IPV6=true',
      'TZ=Europe/Berlin'
    ],
    logs: [
      '2026-10-18T21:10:01Z [Nginx] Reloading configuration...',
      '2026-10-18T21:10:02Z [SSL] Let\'s Encrypt certificate valid for 64 days',
      '2026-10-18T22:14:22Z [Access] 200 GET https://jellyfin.home.local/web/index.html (192.168.1.40)',
      '2026-10-18T23:31:09Z [Access] 200 GET https://radarr.home.local/api/v3/health (192.168.1.40)'
    ]
  },
  {
    id: 'b72e81d2c022',
    fullId: 'b72e81d2c0224e8a9c01d3b5f6a7e8c9d0b1a2f3e4d5c6b7a890123456789def',
    name: 'proxy-db',
    image: 'mariadb:10.11',
    stack: 'proxy-stack',
    service: 'db',
    composeWorkingDir: '/opt/stacks/proxy-stack',
    state: 'running',
    status: 'Up 4 days',
    created: Math.floor(Date.now() / 1000) - 3600 * 108,
    startedAt: new Date(Date.now() - 3600 * 108 * 1000).toISOString(),
    restartPolicy: 'unless-stopped',
    ports: [{ ip: '', publicPort: null, privatePort: 3306, type: 'tcp' }],
    ip: '172.18.0.3',
    networkName: 'proxy-stack_default',
    gateway: '172.18.0.1',
    macAddress: '02:42:ac:12:00:03',
    cpuPercent: 0.7,
    memUsageMb: 142.0,
    memLimitMb: 16384,
    netRxMb: 48.2,
    netTxMb: 51.9,
    cmd: ['mariadbd'],
    entrypoint: ['docker-entrypoint.sh'],
    mounts: [
      { type: 'volume', source: '/var/lib/docker/volumes/npm_db_data/_data', destination: '/var/lib/mysql', rw: true }
    ],
    env: [
      'MYSQL_DATABASE=npm',
      'MYSQL_USER=npm',
      'MYSQL_PASSWORD=supersecret_npm_pw',
      'MYSQL_ROOT_PASSWORD=root_secret_pw',
      'TZ=Europe/Berlin'
    ],
    logs: [
      '2026-10-18T08:00:00Z [Note] mariadbd: ready for connections.',
      '2026-10-18T10:01:12Z [Note] InnoDB: Buffer pool(s) load completed at 100112'
    ]
  },
  {
    id: 'c93a44f1e033',
    fullId: 'c93a44f1e0334e8a9c01d3b5f6a7e8c9d0b1a2f3e4d5c6b7a890123456789001',
    name: 'jellyfin',
    image: 'jellyfin/jellyfin:latest',
    stack: 'media-stack',
    service: 'jellyfin',
    composeWorkingDir: '/opt/stacks/media-stack',
    state: 'running',
    status: 'Up 18 hours (healthy)',
    created: Math.floor(Date.now() / 1000) - 3600 * 48,
    startedAt: new Date(Date.now() - 3600 * 18 * 1000).toISOString(),
    restartPolicy: 'unless-stopped',
    ports: [
      { ip: '0.0.0.0', publicPort: 8096, privatePort: 8096, type: 'tcp' },
      { ip: '0.0.0.0', publicPort: 7359, privatePort: 7359, type: 'udp' }
    ],
    ip: '172.19.0.2',
    networkName: 'media-stack_default',
    gateway: '172.19.0.1',
    macAddress: '02:42:ac:13:00:02',
    cpuPercent: 14.2,
    memUsageMb: 824.6,
    memLimitMb: 16384,
    netRxMb: 1240.5,
    netTxMb: 8420.1,
    cmd: ['/jellyfin/jellyfin'],
    entrypoint: ['/jellyfin/jellyfin'],
    mounts: [
      { type: 'bind', source: '/mnt/storage/media', destination: '/media', rw: false },
      { type: 'bind', source: '/opt/stacks/media-stack/jellyfin/config', destination: '/config', rw: true },
      { type: 'bind', source: '/opt/stacks/media-stack/jellyfin/cache', destination: '/cache', rw: true }
    ],
    env: [
      'TZ=Europe/Berlin',
      'JELLYFIN_PublishedServerUrl=http://192.168.1.10:8096',
      'PUID=1000',
      'PGID=1000'
    ],
    logs: [
      '2026-10-18T14:20:11Z [INF] Startup trigger completed for Jellyfin Server 10.9.11',
      '2026-10-18T22:10:04Z [INF] Playback started: DirectStream (HEVC -> Direct) for Chrome Web',
      '2026-10-18T23:31:00Z [INF] Library scan finished in 00:00:14'
    ]
  },
  {
    id: 'd14b55a2f044',
    fullId: 'd14b55a2f0444e8a9c01d3b5f6a7e8c9d0b1a2f3e4d5c6b7a890123456789002',
    name: 'radarr',
    image: 'lscr.io/linuxserver/radarr:latest',
    stack: 'media-stack',
    service: 'radarr',
    composeWorkingDir: '/opt/stacks/media-stack',
    state: 'running',
    status: 'Up 18 hours',
    created: Math.floor(Date.now() / 1000) - 3600 * 48,
    startedAt: new Date(Date.now() - 3600 * 18 * 1000).toISOString(),
    restartPolicy: 'unless-stopped',
    ports: [{ ip: '0.0.0.0', publicPort: 7878, privatePort: 7878, type: 'tcp' }],
    ip: '172.19.0.3',
    networkName: 'media-stack_default',
    gateway: '172.19.0.1',
    macAddress: '02:42:ac:13:00:03',
    cpuPercent: 0.5,
    memUsageMb: 195.2,
    memLimitMb: 16384,
    netRxMb: 64.1,
    netTxMb: 12.8,
    cmd: ['/init'],
    entrypoint: ['/init'],
    mounts: [
      { type: 'bind', source: '/mnt/storage/media/movies', destination: '/movies', rw: true },
      { type: 'bind', source: '/opt/stacks/media-stack/radarr', destination: '/config', rw: true }
    ],
    env: ['PUID=1000', 'PGID=1000', 'TZ=Europe/Berlin'],
    logs: [
      '2026-10-18T22:00:00Z [Info] RssSyncService: Starting RSS Sync',
      '2026-10-18T22:00:04Z [Info] DownloadDecisionMaker: 28 reports analyzed, 0 grabbed'
    ]
  },
  {
    id: 'e25c66b3a055',
    fullId: 'e25c66b3a0554e8a9c01d3b5f6a7e8c9d0b1a2f3e4d5c6b7a890123456789003',
    name: 'qbittorrent',
    image: 'lscr.io/linuxserver/qbittorrent:latest',
    stack: 'media-stack',
    service: 'qbittorrent',
    composeWorkingDir: '/opt/stacks/media-stack',
    state: 'exited',
    status: 'Exited (0) 3 hours ago',
    created: Math.floor(Date.now() / 1000) - 3600 * 48,
    startedAt: new Date(Date.now() - 3600 * 24 * 1000).toISOString(),
    restartPolicy: 'no',
    ports: [
      { ip: '0.0.0.0', publicPort: 8080, privatePort: 8080, type: 'tcp' },
      { ip: '0.0.0.0', publicPort: 6881, privatePort: 6881, type: 'tcp' }
    ],
    ip: '—',
    networkName: 'media-stack_default',
    gateway: '—',
    macAddress: '—',
    cpuPercent: 0.0,
    memUsageMb: 0.0,
    memLimitMb: 16384,
    netRxMb: 2150.0,
    netTxMb: 540.0,
    cmd: ['/init'],
    entrypoint: ['/init'],
    mounts: [
      { type: 'bind', source: '/mnt/storage/downloads', destination: '/downloads', rw: true },
      { type: 'bind', source: '/opt/stacks/media-stack/qbittorrent', destination: '/config', rw: true }
    ],
    env: ['WEBUI_PORT=8080', 'PUID=1000', 'PGID=1000', 'TZ=Europe/Berlin'],
    logs: [
      '2026-10-18T20:15:00Z [Info] Caught SIGTERM, shutting down gracefully...',
      '2026-10-18T20:15:02Z [Info] WebUI stopped. Process exited with code 0.'
    ]
  },
  {
    id: 'f36d77c4b066',
    fullId: 'f36d77c4b0664e8a9c01d3b5f6a7e8c9d0b1a2f3e4d5c6b7a890123456789004',
    name: 'postgres-dev',
    image: 'postgres:16-alpine',
    stack: 'dev-tools',
    service: 'postgres',
    composeWorkingDir: '/home/dev/projects/dev-tools',
    state: 'running',
    status: 'Up 2 days',
    created: Math.floor(Date.now() / 1000) - 3600 * 52,
    startedAt: new Date(Date.now() - 3600 * 52 * 1000).toISOString(),
    restartPolicy: 'unless-stopped',
    ports: [{ ip: '0.0.0.0', publicPort: 5432, privatePort: 5432, type: 'tcp' }],
    ip: '172.20.0.2',
    networkName: 'dev-tools_default',
    gateway: '172.20.0.1',
    macAddress: '02:42:ac:14:00:02',
    cpuPercent: 0.3,
    memUsageMb: 58.4,
    memLimitMb: 16384,
    netRxMb: 19.4,
    netTxMb: 24.1,
    cmd: ['postgres'],
    entrypoint: ['docker-entrypoint.sh'],
    mounts: [
      { type: 'volume', source: '/var/lib/docker/volumes/pgdata_dev/_data', destination: '/var/lib/postgresql/data', rw: true }
    ],
    env: ['POSTGRES_DB=app_dev', 'POSTGRES_USER=developer', 'POSTGRES_PASSWORD=dev_secret_pw'],
    logs: [
      '2026-10-16T19:00:02Z LOG: database system is ready to accept connections',
      '2026-10-18T23:00:00Z LOG: checkpoint starting: time',
      '2026-10-18T23:00:01Z LOG: checkpoint complete: wrote 12 buffers (0.1%)'
    ]
  },
  {
    id: '147e88d5c077',
    fullId: '147e88d5c0774e8a9c01d3b5f6a7e8c9d0b1a2f3e4d5c6b7a890123456789005',
    name: 'redis-cache',
    image: 'redis:7-alpine',
    stack: 'dev-tools',
    service: 'redis',
    composeWorkingDir: '/home/dev/projects/dev-tools',
    state: 'running',
    status: 'Up 2 days',
    created: Math.floor(Date.now() / 1000) - 3600 * 52,
    startedAt: new Date(Date.now() - 3600 * 52 * 1000).toISOString(),
    restartPolicy: 'unless-stopped',
    ports: [{ ip: '0.0.0.0', publicPort: 6379, privatePort: 6379, type: 'tcp' }],
    ip: '172.20.0.3',
    networkName: 'dev-tools_default',
    gateway: '172.20.0.1',
    macAddress: '02:42:ac:14:00:03',
    cpuPercent: 0.2,
    memUsageMb: 18.2,
    memLimitMb: 16384,
    netRxMb: 8.7,
    netTxMb: 9.2,
    cmd: ['redis-server', '--appendonly', 'yes'],
    entrypoint: ['docker-entrypoint.sh'],
    mounts: [
      { type: 'volume', source: '/var/lib/docker/volumes/redis_data/_data', destination: '/data', rw: true }
    ],
    env: ['REDIS_AOF_ENABLED=yes'],
    logs: [
      '1:C 16 Oct 2026 19:00:01.010 # oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo',
      '1:M 16 Oct 2026 19:00:01.120 * Ready to accept connections tcp'
    ]
  },
  {
    id: '258f99e6d088',
    fullId: '258f99e6d0884e8a9c01d3b5f6a7e8c9d0b1a2f3e4d5c6b7a890123456789006',
    name: 'pgadmin4',
    image: 'dpage/pgadmin4:latest',
    stack: 'dev-tools',
    service: 'pgadmin',
    composeWorkingDir: '/home/dev/projects/dev-tools',
    state: 'exited',
    status: 'Exited (0) 1 day ago',
    created: Math.floor(Date.now() / 1000) - 3600 * 52,
    startedAt: new Date(Date.now() - 3600 * 48 * 1000).toISOString(),
    restartPolicy: 'no',
    ports: [{ ip: '0.0.0.0', publicPort: 5050, privatePort: 80, type: 'tcp' }],
    ip: '—',
    networkName: 'dev-tools_default',
    gateway: '—',
    macAddress: '—',
    cpuPercent: 0.0,
    memUsageMb: 0.0,
    memLimitMb: 16384,
    netRxMb: 4.1,
    netTxMb: 6.3,
    cmd: ['/entrypoint.sh'],
    entrypoint: ['/entrypoint.sh'],
    mounts: [
      { type: 'volume', source: '/var/lib/docker/volumes/pgadmin_data/_data', destination: '/var/lib/pgadmin', rw: true }
    ],
    env: ['PGADMIN_DEFAULT_EMAIL=admin@local.dev', 'PGADMIN_DEFAULT_PASSWORD=admin_secret'],
    logs: [
      '2026-10-17T21:00:10Z [INFO] Starting gunicorn 21.2.0',
      '2026-10-17T22:30:00Z [INFO] Handling signal: term',
      '2026-10-17T22:30:01Z [INFO] Shutting down: Master'
    ]
  },
  {
    id: '369a00f7e099',
    fullId: '369a00f7e0994e8a9c01d3b5f6a7e8c9d0b1a2f3e4d5c6b7a890123456789007',
    name: 'uptime-kuma',
    image: 'louislam/uptime-kuma:1',
    stack: 'standalone',
    service: '',
    composeWorkingDir: '',
    state: 'running',
    status: 'Up 12 days (healthy)',
    created: Math.floor(Date.now() / 1000) - 3600 * 288,
    startedAt: new Date(Date.now() - 3600 * 288 * 1000).toISOString(),
    restartPolicy: 'always',
    ports: [{ ip: '0.0.0.0', publicPort: 3001, privatePort: 3001, type: 'tcp' }],
    ip: '172.17.0.2',
    networkName: 'bridge',
    gateway: '172.17.0.1',
    macAddress: '02:42:ac:11:00:02',
    cpuPercent: 0.9,
    memUsageMb: 112.4,
    memLimitMb: 16384,
    netRxMb: 310.2,
    netTxMb: 285.7,
    cmd: ['node', 'server/server.js'],
    entrypoint: ['/usr/bin/dumb-init', '--'],
    mounts: [
      { type: 'bind', source: '/opt/uptime-kuma/data', destination: '/app/data', rw: true }
    ],
    env: ['NODE_ENV=production'],
    logs: [
      '2026-10-18T23:30:00Z [MONITOR] Ping Proxy-Stack: 4ms (OK)',
      '2026-10-18T23:31:00Z [MONITOR] Ping Jellyfin HTTP: 11ms (OK)'
    ]
  }
];

let cachedDockerReachable = null;
let lastPingTime = 0;

/**
 * Low-level HTTP request to Docker Engine Socket or TCP Host
 */
function dockerRequest(method, apiPath, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      path: apiPath,
      headers: {
        Accept: 'application/json',
        Host: 'localhost'
      },
      timeout: timeoutMs
    };

    if (DOCKER_HOST && DOCKER_HOST.startsWith('http')) {
      const parsed = new URL(DOCKER_HOST);
      options.hostname = parsed.hostname;
      options.port = parsed.port || 2375;
    } else if (DOCKER_HOST && DOCKER_HOST.startsWith('tcp://')) {
      const parsed = new URL(DOCKER_HOST.replace(/^tcp:\/\//, 'http://'));
      options.hostname = parsed.hostname;
      options.port = parsed.port || 2375;
    } else {
      options.socketPath = DOCKER_SOCKET;
    }

    const req = http.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          buffer,
          text: buffer.toString('utf8')
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Docker API Timeout'));
    });

    req.on('error', err => {
      reject(err);
    });

    req.end();
  });
}

/**
 * Check if real Docker Daemon is reachable
 */
async function isDockerAvailable() {
  if (FORCE_DEMO) return false;
  const now = Date.now();
  if (cachedDockerReachable !== null && now - lastPingTime < 5000) {
    return cachedDockerReachable;
  }
  try {
    const res = await dockerRequest('GET', '/_ping', 1200);
    cachedDockerReachable = res.statusCode === 200;
  } catch (_) {
    cachedDockerReachable = false;
  }
  lastPingTime = now;
  return cachedDockerReachable;
}

/**
 * Parse Docker multiplexed log buffer (strips 8-byte stream header if present)
 */
function parseDockerLogBuffer(buffer) {
  if (!buffer || buffer.length === 0) return [];
  const lines = [];
  let offset = 0;

  // Check if buffer uses Docker 8-byte multiplexed header: [0|1|2, 0, 0, 0, size...]
  const isMultiplexed =
    buffer.length >= 8 &&
    (buffer[0] === 0 || buffer[0] === 1 || buffer[0] === 2) &&
    buffer[1] === 0 &&
    buffer[2] === 0 &&
    buffer[3] === 0;

  if (isMultiplexed) {
    while (offset + 8 <= buffer.length) {
      const frameSize = buffer.readUInt32BE(offset + 4);
      offset += 8;
      if (offset + frameSize > buffer.length) {
        const remaining = buffer.slice(offset).toString('utf8');
        remaining.split(/\r?\n/).forEach(l => {
          if (l.trim()) lines.push(l);
        });
        break;
      }
      const chunkStr = buffer.slice(offset, offset + frameSize).toString('utf8');
      chunkStr.split(/\r?\n/).forEach(l => {
        if (l.trim()) lines.push(l);
      });
      offset += frameSize;
    }
  } else {
    buffer
      .toString('utf8')
      .split(/\r?\n/)
      .forEach(l => {
        if (l.trim()) lines.push(l);
      });
  }
  return lines;
}

/**
 * Fetch quick stats for a running container in Live Docker Mode
 */
async function fetchLiveContainerStats(containerId) {
  try {
    const res = await dockerRequest('GET', `/containers/${containerId}/stats?stream=false`, 2000);
    if (res.statusCode !== 200) return { cpuPercent: 0, memUsageMb: 0, memLimitMb: 0, netRxMb: 0, netTxMb: 0 };
    const stats = JSON.parse(res.text);

    // CPU % calculation
    let cpuPercent = 0;
    const cpuDelta =
      (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
      (stats.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta =
      (stats.cpu_stats?.system_cpu_usage || 0) -
      (stats.precpu_stats?.system_cpu_usage || 0);
    const onlineCpus =
      stats.cpu_stats?.online_cpus ||
      stats.cpu_stats?.cpu_usage?.percpu_usage?.length ||
      os.cpus().length ||
      1;

    if (systemDelta > 0 && cpuDelta > 0) {
      cpuPercent = Number(((cpuDelta / systemDelta) * onlineCpus * 100).toFixed(1));
    }

    // Memory calculation
    const rawUsage = stats.memory_stats?.usage || 0;
    const cache =
      stats.memory_stats?.stats?.inactive_file ||
      stats.memory_stats?.stats?.cache ||
      0;
    const usedBytes = Math.max(0, rawUsage - cache);
    const limitBytes = stats.memory_stats?.limit || 0;

    // Network RX / TX
    let rxBytes = 0;
    let txBytes = 0;
    if (stats.networks) {
      Object.values(stats.networks).forEach(net => {
        rxBytes += net.rx_bytes || 0;
        txBytes += net.tx_bytes || 0;
      });
    }

    return {
      cpuPercent,
      memUsageMb: Number((usedBytes / (1024 * 1024)).toFixed(1)),
      memLimitMb: Number((limitBytes / (1024 * 1024)).toFixed(0)),
      netRxMb: Number((rxBytes / (1024 * 1024)).toFixed(1)),
      netTxMb: Number((txBytes / (1024 * 1024)).toFixed(1))
    };
  } catch (_) {
    return { cpuPercent: 0, memUsageMb: 0, memLimitMb: 0, netRxMb: 0, netTxMb: 0 };
  }
}

/**
 * List all containers (with Stack detection and basic stats)
 */
async function listContainers(includeStats = false) {
  const live = await isDockerAvailable();
  if (!live) {
    // Return simulated containers with slight realistic CPU jitter for running ones
    return {
      mode: 'demo',
      socketPath: DOCKER_SOCKET,
      containers: demoContainers.map(c => {
        const jitter = c.state === 'running' ? Number((Math.random() * 0.4 - 0.2).toFixed(1)) : 0;
        return {
          ...c,
          cpuPercent: c.state === 'running' ? Math.max(0.1, Number((c.cpuPercent + jitter).toFixed(1))) : 0
        };
      })
    };
  }

  const res = await dockerRequest('GET', '/containers/json?all=true');
  if (res.statusCode !== 200) {
    throw new Error(`Docker API Fehler (${res.statusCode}): ${res.text}`);
  }

  const rawList = JSON.parse(res.text);

  const mapped = await Promise.all(
    rawList.map(async raw => {
      const cleanName = (raw.Names && raw.Names[0] ? raw.Names[0] : raw.Id.slice(0, 12)).replace(/^\//, '');
      const labels = raw.Labels || {};

      // Portainer-style Stack Detection via Compose or Swarm labels
      const composeProject =
        labels['com.docker.compose.project'] ||
        labels['com.docker.stack.namespace'] ||
        'standalone';
      const composeService = labels['com.docker.compose.service'] || '';
      const composeWorkingDir = labels['com.docker.compose.project.working_dir'] || '';

      // Extract networks
      const networksObj = raw.NetworkSettings?.Networks || {};
      const networkNames = Object.keys(networksObj);
      const firstNet = networkNames.length > 0 ? networksObj[networkNames[0]] : null;

      // Normalize Ports
      const ports = (raw.Ports || []).map(p => ({
        ip: p.IP || '',
        publicPort: p.PublicPort || null,
        privatePort: p.PrivatePort || null,
        type: p.Type || 'tcp'
      }));

      // Normalize Mounts
      const mounts = (raw.Mounts || []).map(m => ({
        type: m.Type || 'volume',
        source: m.Source || m.Name || '',
        destination: m.Destination || '',
        rw: m.RW !== false
      }));

      let stats = { cpuPercent: 0, memUsageMb: 0, memLimitMb: 0, netRxMb: 0, netTxMb: 0 };
      if (includeStats && raw.State === 'running') {
        stats = await fetchLiveContainerStats(raw.Id);
      }

      return {
        id: raw.Id.slice(0, 12),
        fullId: raw.Id,
        name: cleanName,
        image: raw.Image,
        stack: composeProject,
        service: composeService,
        composeWorkingDir,
        state: raw.State, // running, exited, paused, restarting, dead, created
        status: raw.Status,
        created: raw.Created,
        ports,
        ip: firstNet?.IPAddress || '—',
        networkName: networkNames.join(', ') || 'bridge',
        gateway: firstNet?.Gateway || '—',
        macAddress: firstNet?.MacAddress || '—',
        mounts,
        ...stats
      };
    })
  );

  // Sort by name
  mapped.sort((a, b) => a.name.localeCompare(b.name));

  return {
    mode: 'live',
    socketPath: DOCKER_SOCKET,
    containers: mapped
  };
}

/**
 * Inspect a single container in detail (including Env, RestartPolicy, live stats & logs)
 */
async function getContainerDetails(idOrName, tailLines = 100) {
  const live = await isDockerAvailable();
  if (!live) {
    const found = demoContainers.find(
      c => c.id === idOrName || c.fullId === idOrName || c.name === idOrName
    );
    if (!found) throw new Error('Container nicht gefunden');
    return {
      mode: 'demo',
      container: {
        ...found,
        logs: found.logs.slice(-tailLines)
      }
    };
  }

  const [inspectRes, logsRes] = await Promise.all([
    dockerRequest('GET', `/containers/${encodeURIComponent(idOrName)}/json`),
    dockerRequest(
      'GET',
      `/containers/${encodeURIComponent(idOrName)}/logs?stdout=true&stderr=true&tail=${Number(tailLines) || 100}&timestamps=true`
    )
  ]);

  if (inspectRes.statusCode !== 200) {
    throw new Error(`Container ${idOrName} konnte nicht geladen werden (${inspectRes.statusCode})`);
  }

  const info = JSON.parse(inspectRes.text);
  const cleanName = (info.Name || info.Id.slice(0, 12)).replace(/^\//, '');
  const labels = info.Config?.Labels || {};
  const composeProject =
    labels['com.docker.compose.project'] ||
    labels['com.docker.stack.namespace'] ||
    'standalone';

  const networksObj = info.NetworkSettings?.Networks || {};
  const networkNames = Object.keys(networksObj);
  const firstNet = networkNames.length > 0 ? networksObj[networkNames[0]] : null;

  // Extract Port bindings from NetworkSettings.Ports
  const ports = [];
  const rawPorts = info.NetworkSettings?.Ports || {};
  Object.entries(rawPorts).forEach(([portProto, bindings]) => {
    const [privPort, type] = portProto.split('/');
    if (Array.isArray(bindings) && bindings.length > 0) {
      bindings.forEach(b => {
        ports.push({
          ip: b.HostIp || '0.0.0.0',
          publicPort: b.HostPort ? Number(b.HostPort) : null,
          privatePort: Number(privPort),
          type: type || 'tcp'
        });
      });
    } else {
      ports.push({
        ip: '',
        publicPort: null,
        privatePort: Number(privPort),
        type: type || 'tcp'
      });
    }
  });

  const mounts = (info.Mounts || []).map(m => ({
    type: m.Type || 'volume',
    source: m.Source || m.Name || '',
    destination: m.Destination || '',
    rw: m.RW !== false
  }));

  const isRunning = info.State?.Status === 'running';
  const stats = isRunning
    ? await fetchLiveContainerStats(info.Id)
    : { cpuPercent: 0, memUsageMb: 0, memLimitMb: 0, netRxMb: 0, netTxMb: 0 };

  const logs = logsRes.statusCode === 200 ? parseDockerLogBuffer(logsRes.buffer) : [];

  return {
    mode: 'live',
    container: {
      id: info.Id.slice(0, 12),
      fullId: info.Id,
      name: cleanName,
      image: info.Config?.Image || info.Image,
      stack: composeProject,
      service: labels['com.docker.compose.service'] || '',
      composeWorkingDir: labels['com.docker.compose.project.working_dir'] || '',
      state: info.State?.Status || 'unknown',
      status: isRunning
        ? `Running (seit ${new Date(info.State.StartedAt).toLocaleString('de-DE')})`
        : `Exited (${info.State?.ExitCode ?? 0})`,
      startedAt: info.State?.StartedAt || null,
      finishedAt: info.State?.FinishedAt || null,
      restartPolicy: info.HostConfig?.RestartPolicy?.Name || 'no',
      ports,
      ip: firstNet?.IPAddress || '—',
      networkName: networkNames.join(', ') || 'bridge',
      gateway: firstNet?.Gateway || '—',
      macAddress: firstNet?.MacAddress || '—',
      mounts,
      env: info.Config?.Env || [],
      cmd: info.Config?.Cmd || [],
      entrypoint: info.Config?.Entrypoint || [],
      logs,
      ...stats
    }
  };
}

/**
 * Perform an action (start, stop, restart, pause, unpause) on a single container
 */
async function performContainerAction(idOrName, action) {
  const validActions = ['start', 'stop', 'restart', 'pause', 'unpause'];
  if (!validActions.includes(action)) {
    throw new Error(`Ungültige Aktion: ${action}`);
  }

  const live = await isDockerAvailable();
  if (!live) {
    const c = demoContainers.find(
      x => x.id === idOrName || x.fullId === idOrName || x.name === idOrName
    );
    if (!c) throw new Error(`Container ${idOrName} nicht gefunden`);

    const nowIso = new Date().toISOString();
    if (action === 'start' || action === 'unpause') {
      c.state = 'running';
      c.status = 'Up Less than a second';
      c.startedAt = nowIso;
      c.cpuPercent = Number((Math.random() * 2.5 + 0.3).toFixed(1));
      if (c.memUsageMb === 0) c.memUsageMb = Number((Math.random() * 120 + 35).toFixed(1));
      if (c.ip === '—') c.ip = '172.19.0.' + Math.floor(Math.random() * 20 + 10);
      c.logs.push(`${nowIso} [DOCKER-CHECKER] Container wurde gestartet.`);
    } else if (action === 'stop') {
      c.state = 'exited';
      c.status = 'Exited (0) Less than a second ago';
      c.cpuPercent = 0.0;
      c.memUsageMb = 0.0;
      c.ip = '—';
      c.logs.push(`${nowIso} [DOCKER-CHECKER] Container wurde gestoppt (SIGTERM).`);
    } else if (action === 'restart') {
      c.state = 'running';
      c.status = 'Up Less than a second (restarted)';
      c.startedAt = nowIso;
      c.cpuPercent = Number((Math.random() * 3.0 + 0.5).toFixed(1));
      if (c.memUsageMb === 0) c.memUsageMb = Number((Math.random() * 120 + 35).toFixed(1));
      c.logs.push(`${nowIso} [DOCKER-CHECKER] Container wurde neu gestartet.`);
    } else if (action === 'pause') {
      c.state = 'paused';
      c.status = 'Up (Paused)';
      c.cpuPercent = 0.0;
      c.logs.push(`${nowIso} [DOCKER-CHECKER] Container wurde pausiert.`);
    }

    return { ok: true, id: c.id, name: c.name, state: c.state };
  }

  // Live Docker Engine API call
  const res = await dockerRequest(
    'POST',
    `/containers/${encodeURIComponent(idOrName)}/${action}`,
    15000
  );

  // 204 = success, 304 = already in desired state
  if (res.statusCode === 204 || res.statusCode === 304) {
    return { ok: true, idOrName, action, statusCode: res.statusCode };
  }

  throw new Error(`Docker Aktion "${action}" fehlgeschlagen (${res.statusCode}): ${res.text}`);
}

/**
 * Execute batch action across multiple containers (for Stacks, Custom Groups, or Multi-Select)
 */
async function performBatchAction(targets, action) {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('Keine Ziel-Container angegeben.');
  }

  const results = await Promise.all(
    targets.map(async target => {
      try {
        const res = await performContainerAction(target, action);
        return { target, ok: true, result: res };
      } catch (err) {
        return { target, ok: false, error: err.message };
      }
    })
  );

  return {
    action,
    total: targets.length,
    succeeded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results
  };
}

module.exports = {
  isDockerAvailable,
  listContainers,
  getContainerDetails,
  performContainerAction,
  performBatchAction
};
