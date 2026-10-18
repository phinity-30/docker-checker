const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');

const DEFAULT_DEMO_GROUPS = [
  {
    id: 'grp-media-cinema',
    name: 'Kino-Abend (Cross-Stack)',
    icon: '🎬',
    description: 'Startet Reverse-Proxy, Jellyfin und qBittorrent gemeinsam über Stack-Grenzen hinweg',
    containerNames: ['nginx-proxy', 'jellyfin', 'qbittorrent'],
    createdAt: '2026-10-18T20:00:00.000Z'
  },
  {
    id: 'grp-dev-db',
    name: 'Lokale Datenbank-Umgebung',
    icon: '💻',
    description: 'PostgreSQL, Redis Cache & pgAdmin4 zusammen ein- und ausschalten',
    containerNames: ['postgres-dev', 'redis-cache', 'pgadmin4'],
    createdAt: '2026-10-18T21:00:00.000Z'
  }
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadGroups(isDemoMode = false) {
  ensureDataDir();
  if (!fs.existsSync(GROUPS_FILE)) {
    const initial = isDemoMode ? DEFAULT_DEMO_GROUPS : [];
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(GROUPS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Fehler beim Lesen von groups.json:', err.message);
    return [];
  }
}

function saveGroups(groups) {
  ensureDataDir();
  fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2), 'utf8');
}

function createGroup({ name, description = '', icon = '🔗', containerNames = [] }, isDemoMode = false) {
  const groups = loadGroups(isDemoMode);
  const cleanNames = Array.from(new Set(containerNames.map(n => String(n).trim()).filter(Boolean)));
  const newGroup = {
    id: 'grp-' + crypto.randomBytes(4).toString('hex'),
    name: String(name || 'Neue Gruppe').trim(),
    icon: String(icon || '🔗').trim(),
    description: String(description || '').trim(),
    containerNames: cleanNames,
    createdAt: new Date().toISOString()
  };
  groups.unshift(newGroup);
  saveGroups(groups);
  return newGroup;
}

function updateGroup(id, updates, isDemoMode = false) {
  const groups = loadGroups(isDemoMode);
  const idx = groups.findIndex(g => g.id === id);
  if (idx === -1) return null;

  const existing = groups[idx];
  if (updates.name !== undefined) existing.name = String(updates.name).trim() || existing.name;
  if (updates.description !== undefined) existing.description = String(updates.description).trim();
  if (updates.icon !== undefined) existing.icon = String(updates.icon).trim() || '🔗';
  if (Array.isArray(updates.containerNames)) {
    existing.containerNames = Array.from(
      new Set(updates.containerNames.map(n => String(n).trim()).filter(Boolean))
    );
  }
  existing.updatedAt = new Date().toISOString();
  groups[idx] = existing;
  saveGroups(groups);
  return existing;
}

function deleteGroup(id, isDemoMode = false) {
  const groups = loadGroups(isDemoMode);
  const filtered = groups.filter(g => g.id !== id);
  if (filtered.length === groups.length) return false;
  saveGroups(filtered);
  return true;
}

module.exports = {
  loadGroups,
  saveGroups,
  createGroup,
  updateGroup,
  deleteGroup
};
