// Application State
let appState = {
  mode: 'demo',
  socketPath: '',
  containers: [],
  stacks: [],
  groups: [],
  stats: { total: 0, running: 0, stopped: 0, paused: 0, stacksCount: 0, groupsCount: 0 }
};

let currentView = 'stacks'; // 'stacks' | 'all' | 'groups'
let statusFilter = 'all'; // 'all' | 'running' | 'stopped'
let selectedContainerName = null;
let selectedContainerDetails = null;
let inspectorTab = 'overview'; // 'overview' | 'logs' | 'mounts' | 'env'
let checkedNames = new Set();
let collapsedCards = new Set();
let showSecrets = false;
let logSearchQuery = '';
let autoRefreshEnabled = true;
let autoRefreshTimer = null;

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await refreshAll(true);
  startAutoRefresh();
});

function initTheme() {
  const saved = localStorage.getItem('dockpulse_theme');
  if (saved === 'light') {
    document.documentElement.classList.add('light');
    document.getElementById('btn-theme').innerHTML = '<span>🌙</span>';
  }
}

function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('dockpulse_theme', isLight ? 'light' : 'dark');
  document.getElementById('btn-theme').innerHTML = isLight ? '<span>🌙</span>' : '<span>☀️</span>';
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    if (autoRefreshEnabled && document.visibilityState === 'visible') {
      refreshAll(false);
    }
  }, 4000);
}

function toggleAutoRefresh() {
  autoRefreshEnabled = !autoRefreshEnabled;
  const btn = document.getElementById('btn-autorefresh');
  btn.classList.toggle('active', autoRefreshEnabled);
  showToast(
    autoRefreshEnabled ? 'Live-Aktualisierung aktiviert (4s)' : 'Live-Aktualisierung pausiert',
    'info'
  );
}

// --- API CALLS ---
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP Fehler ${res.status}`);
  }
  return data;
}

let configAppliedOnce = false;

async function refreshAll(fetchDetailsToo = true) {
  try {
    const data = await apiFetch('/api/overview?stats=true');
    appState = data;

    if (!configAppliedOnce && data.config) {
      configAppliedOnce = true;
      if (data.config.appTitle) {
        document.title = `${data.config.appTitle} — Docker Container, Stack & Gruppen Manager`;
        const titleSpan = document.querySelector('.brand-title > span:first-child');
        if (titleSpan) titleSpan.textContent = data.config.appTitle;
      }
      if (!localStorage.getItem('dockpulse_theme') && data.config.defaultTheme === 'light') {
        document.documentElement.classList.add('light');
        document.getElementById('btn-theme').innerHTML = '<span>🌙</span>';
      }
      if (['stacks', 'all', 'groups'].includes(data.config.defaultView)) {
        setMainView(data.config.defaultView);
      }
    }

    // Select first container by default if none selected
    if (!selectedContainerName && data.containers.length > 0) {
      selectedContainerName = data.containers[0].name;
      fetchDetailsToo = true;
    } else if (
      selectedContainerName &&
      !data.containers.some(c => c.name === selectedContainerName) &&
      data.containers.length > 0
    ) {
      selectedContainerName = data.containers[0].name;
      fetchDetailsToo = true;
    }

    updateTopHeader();
    updateBatchBar();
    renderLeftPane();

    if (selectedContainerName && (fetchDetailsToo || !selectedContainerDetails)) {
      await loadContainerDetails(selectedContainerName, false);
    } else {
      renderRightInspector();
    }
  } catch (err) {
    console.error('Refresh error:', err);
  }
}

async function loadContainerDetails(nameOrId, showLoading = true) {
  selectedContainerName = nameOrId;
  renderLeftPane();
  if (showLoading) {
    document.getElementById('right-pane').innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px;">
        Lade Container-Details für <strong>${escapeHtml(nameOrId)}</strong>...
      </div>
    `;
  }
  try {
    const res = await apiFetch(`/api/containers/${encodeURIComponent(nameOrId)}?tail=150`);
    selectedContainerDetails = res.container;
    renderRightInspector();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- ACTIONS (SINGLE, STACK, GROUP, MULTI-SELECT) ---
async function triggerContainerAction(nameOrId, action, event) {
  if (event) event.stopPropagation();
  const labels = {
    start: 'Starte',
    stop: 'Stoppe',
    restart: 'Starte neu:',
    pause: 'Pausiere',
    unpause: 'Setze fort:'
  };
  showToast(`${labels[action] || action} ${nameOrId}...`, 'info');
  try {
    await apiFetch(`/api/containers/${encodeURIComponent(nameOrId)}/action`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    showToast(`Container "${nameOrId}": Aktion "${action}" erfolgreich!`, 'success');
    await refreshAll(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function triggerBatchAction(targetNames, action, labelName, event) {
  if (event) event.stopPropagation();
  if (!targetNames || targetNames.length === 0) return;

  const actionVerb =
    action === 'start' ? 'Starte' : action === 'stop' ? 'Stoppe' : 'Starte neu';
  showToast(`${actionVerb} ${labelName} (${targetNames.length} Container)...`, 'info');

  try {
    const res = await apiFetch('/api/batch-action', {
      method: 'POST',
      body: JSON.stringify({ targets: targetNames, action })
    });
    showToast(
      `${labelName}: ${res.succeeded}/${res.total} Container erfolgreich (${action}).`,
      res.failed === 0 ? 'success' : 'error'
    );
    await refreshAll(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- HEADER & FILTER CONTROLS ---
function updateTopHeader() {
  const badge = document.getElementById('socket-badge');
  const badgeText = document.getElementById('socket-badge-text');
  const pathLabel = document.getElementById('socket-path-label');

  if (appState.mode === 'live') {
    badge.className = 'mode-badge live';
    badgeText.textContent = 'docker.sock Live';
    pathLabel.textContent = `Verbunden mit Docker Engine (${appState.socketPath})`;
  } else {
    badge.className = 'mode-badge demo';
    badgeText.textContent = 'Demo-Simulation';
    pathLabel.textContent = `Kein lokaler Docker-Socket (${appState.socketPath}) — Interaktiver Demo-Modus aktiv`;
  }

  document.getElementById('stat-running').textContent = appState.stats.running;
  document.getElementById('stat-stopped').textContent = appState.stats.stopped;

  document.getElementById('badge-stacks-count').textContent = appState.stacks.length;
  document.getElementById('badge-all-count').textContent = appState.containers.length;
  document.getElementById('badge-groups-count').textContent = appState.groups.length;
}

function setMainView(view) {
  currentView = view;
  ['stacks', 'all', 'groups'].forEach(v => {
    document.getElementById(`view-btn-${v}`).classList.toggle('active', v === view);
  });
  renderLeftPane();
}

function setStatusFilter(filter) {
  statusFilter = filter;
  ['all', 'running', 'stopped'].forEach(f => {
    document.getElementById(`filter-${f}`).classList.toggle('active', f === filter);
  });
  renderLeftPane();
}

function matchesSearchAndFilter(c) {
  if (statusFilter === 'running' && c.state !== 'running') return false;
  if (statusFilter === 'stopped' && c.state === 'running') return false;

  const q = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  if (!q) return true;

  const portStr = (c.ports || []).map(p => `${p.publicPort || ''}:${p.privatePort || ''}`).join(' ');
  return (
    c.name.toLowerCase().includes(q) ||
    (c.image || '').toLowerCase().includes(q) ||
    (c.stack || '').toLowerCase().includes(q) ||
    (c.ip || '').toLowerCase().includes(q) ||
    portStr.includes(q)
  );
}

// --- MULTI-SELECT & BATCH BAR ---
function toggleCheckContainer(name, event) {
  if (event) event.stopPropagation();
  if (checkedNames.has(name)) {
    checkedNames.delete(name);
  } else {
    checkedNames.add(name);
  }
  updateBatchBar();
  renderLeftPane();
}

function clearSelection() {
  checkedNames.clear();
  updateBatchBar();
  renderLeftPane();
}

function updateBatchBar() {
  const bar = document.getElementById('batch-bar');
  const hint = document.getElementById('toolbar-hint');
  const countEl = document.getElementById('batch-count');

  if (checkedNames.size > 0) {
    bar.style.display = 'flex';
    hint.style.display = 'none';
    countEl.textContent = checkedNames.size;
  } else {
    bar.style.display = 'none';
    hint.style.display = 'block';
  }
}

async function runBatchSelected(action) {
  const targets = Array.from(checkedNames);
  await triggerBatchAction(targets, action, 'Auswahl', null);
  clearSelection();
}

// --- RENDER LEFT PANE ---
function toggleCollapseCard(cardKey) {
  if (collapsedCards.has(cardKey)) {
    collapsedCards.delete(cardKey);
  } else {
    collapsedCards.add(cardKey);
  }
  renderLeftPane();
}

function getGroupsForContainer(containerName) {
  return appState.groups.filter(g => (g.containerNames || []).includes(containerName));
}

function renderPortBadges(ports) {
  if (!Array.isArray(ports) || ports.length === 0) return '';
  const host = window.location.hostname || 'localhost';
  return ports
    .filter(p => p.publicPort)
    .slice(0, 3)
    .map(
      p => `
      <a
        href="http://${host}:${p.publicPort}"
        target="_blank"
        rel="noopener"
        onclick="event.stopPropagation()"
        class="badge badge-port"
        title="Öffne http://${host}:${p.publicPort} im Browser"
      >
        ↗ :${p.publicPort}
      </a>
    `
    )
    .join('');
}

function renderContainerRowHtml(c, showStackBadge = true) {
  const isSelected = c.name === selectedContainerName;
  const isChecked = checkedNames.has(c.name);
  const isRunning = c.state === 'running';
  const memberGroups = getGroupsForContainer(c.name);

  return `
    <div
      class="container-row ${isSelected ? 'selected' : ''}"
      onclick="loadContainerDetails('${escapeAttr(c.name)}')"
    >
      <div class="row-left">
        <input
          type="checkbox"
          class="row-checkbox"
          ${isChecked ? 'checked' : ''}
          onclick="toggleCheckContainer('${escapeAttr(c.name)}', event)"
          title="Auswählen zum Zusammenführen oder für Sammel-Aktion"
        />
        <span class="status-led ${escapeAttr(c.state)}" title="Status: ${escapeAttr(c.status)}"></span>
        <div class="row-info">
          <div class="row-title-line">
            <span class="container-name">${escapeHtml(c.name)}</span>
            ${
              showStackBadge && c.stack
                ? `<span class="badge badge-stack">📚 ${escapeHtml(c.stack)}</span>`
                : ''
            }
            ${memberGroups
              .map(
                g =>
                  `<span class="badge badge-group" title="Teil der Gruppe: ${escapeAttr(g.name)}">${escapeHtml(
                    g.icon || '🔗'
                  )} ${escapeHtml(g.name)}</span>`
              )
              .join('')}
            ${renderPortBadges(c.ports)}
          </div>
          <div class="row-sub-line">
            <span class="mono">${escapeHtml(c.image)}</span>
            <span>•</span>
            <span>${escapeHtml(c.status)}</span>
          </div>
        </div>
      </div>

      <div class="row-right">
        <div class="row-metrics">
          <div class="metric-cpu">${isRunning ? `${c.cpuPercent ?? 0}% CPU` : '—'}</div>
          <div class="metric-ram">${isRunning ? `${c.memUsageMb ?? 0} MB` : 'Gestoppt'}</div>
        </div>

        <div style="display: flex; gap: 6px;" onclick="event.stopPropagation()">
          ${
            isRunning
              ? `<button class="btn btn-danger btn-sm" onclick="triggerContainerAction('${escapeAttr(c.name)}', 'stop', event)" title="Container stoppen">⏹ Stop</button>`
              : `<button class="btn btn-success btn-sm" onclick="triggerContainerAction('${escapeAttr(c.name)}', 'start', event)" title="Container starten">▶ Start</button>`
          }
          <button
            class="btn btn-ghost btn-sm"
            onclick="triggerContainerAction('${escapeAttr(c.name)}', 'restart', event)"
            title="Container neu starten"
          >
            🔄
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderLeftPane() {
  const pane = document.getElementById('left-pane');
  const filteredContainers = appState.containers.filter(matchesSearchAndFilter);

  // 1. ALL CONTAINERS VIEW
  if (currentView === 'all') {
    if (filteredContainers.length === 0) {
      pane.innerHTML = `
        <div class="info-card" style="text-align: center; padding: 36px; color: var(--text-muted);">
          Keine passenden Container gefunden.
        </div>
      `;
      return;
    }

    pane.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0 4px;">
        <span style="font-size: 12.5px; color: var(--text-muted); font-weight: 600;">
          Zeige ${filteredContainers.length} von ${appState.containers.length} Containern
        </span>
        <button class="btn btn-ghost btn-sm" onclick="selectAllFiltered()">
          ☑️ Alle sichtbaren auswählen
        </button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${filteredContainers.map(c => renderContainerRowHtml(c, true)).join('')}
      </div>
    `;
    return;
  }

  // 2. STACKS VIEW (PORTAINER STYLE)
  if (currentView === 'stacks') {
    const stackCards = appState.stacks
      .map(stack => {
        const visibleInStack = stack.containers.filter(matchesSearchAndFilter);
        if (visibleInStack.length === 0) return '';

        const cardKey = `stack:${stack.name}`;
        const isCollapsed = collapsedCards.has(cardKey);
        const allNamesJson = JSON.stringify(stack.containers.map(c => c.name)).replace(/"/g, '&quot;');
        const allRunning = stack.runningCount === stack.totalCount;
        const noneRunning = stack.runningCount === 0;

        return `
          <div class="group-card">
            <div class="group-header" onclick="toggleCollapseCard('${escapeAttr(cardKey)}')">
              <div class="group-title-area">
                <span class="collapse-icon">${isCollapsed ? '▶' : '▼'}</span>
                <div>
                  <div class="group-name">
                    <span>${stack.isStandalone ? '📦 Einzel-Container (Ohne Compose-Stack)' : `📚 Stack: ${escapeHtml(stack.name)}`}</span>
                    <span class="mode-badge ${allRunning ? 'live' : noneRunning ? 'demo' : 'demo'}">
                      ${stack.runningCount}/${stack.totalCount} aktiv
                    </span>
                  </div>
                  ${
                    stack.workingDir
                      ? `<div class="group-desc mono">Pfad: ${escapeHtml(stack.workingDir)}</div>`
                      : `<div class="group-desc">${
                          stack.isStandalone
                            ? 'Container, die direkt per docker run gestartet wurden'
                            : 'Automatisch erkannt über Docker Compose Label (com.docker.compose.project)'
                        }</div>`
                  }
                </div>
              </div>

              <div style="display: flex; gap: 6px;" onclick="event.stopPropagation()">
                <button
                  class="btn btn-success btn-sm"
                  onclick="triggerBatchAction(${allNamesJson}, 'start', 'Stack ${escapeAttr(stack.name)}', event)"
                >
                  ▶ Stack Starten
                </button>
                <button
                  class="btn btn-danger btn-sm"
                  onclick="triggerBatchAction(${allNamesJson}, 'stop', 'Stack ${escapeAttr(stack.name)}', event)"
                >
                  ⏹ Stack Stoppen
                </button>
                <button
                  class="btn btn-ghost btn-sm"
                  onclick="triggerBatchAction(${allNamesJson}, 'restart', 'Stack ${escapeAttr(stack.name)}', event)"
                  title="Gesamten Stack neu starten"
                >
                  🔄
                </button>
              </div>
            </div>

            ${
              !isCollapsed
                ? `<div class="group-body">
                    ${visibleInStack.map(c => renderContainerRowHtml(c, false)).join('')}
                  </div>`
                : ''
            }
          </div>
        `;
      })
      .filter(Boolean);

    pane.innerHTML =
      stackCards.length > 0
        ? stackCards.join('')
        : `<div class="info-card" style="text-align: center; padding: 36px; color: var(--text-muted);">Keine passenden Stacks gefunden.</div>`;
    return;
  }

  // 3. CUSTOM MERGED GROUPS VIEW
  if (currentView === 'groups') {
    const headerBanner = `
      <div class="info-card" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--primary-soft); border-color: rgba(59,130,246,0.3);">
        <div>
          <div style="font-weight: 700; font-size: 13.5px;">🔗 Eigene Container-Gruppen (Zusammengeführt)</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
            Fasse beliebige Container (auch aus verschiedenen Stacks) zu einer Gruppe zusammen, um sie mit einem Klick gemeinsam zu starten oder zu stoppen.
          </div>
        </div>
        <button class="btn btn-primary" onclick="openGroupModal()">
          ➕ Neue Gruppe erstellen
        </button>
      </div>
    `;

    if (appState.groups.length === 0) {
      pane.innerHTML =
        headerBanner +
        `
        <div class="info-card" style="text-align: center; padding: 40px; color: var(--text-muted);">
          Noch keine eigene Gruppe erstellt. Klicke auf <strong>➕ Neue Gruppe erstellen</strong> oder wähle Container per Checkbox ☑️ aus!
        </div>
      `;
      return;
    }

    const groupCards = appState.groups.map(group => {
      const memberContainers = (group.containerNames || [])
        .map(name => appState.containers.find(c => c.name === name))
        .filter(Boolean);

      const runningCount = memberContainers.filter(c => c.state === 'running').length;
      const cardKey = `group:${group.id}`;
      const isCollapsed = collapsedCards.has(cardKey);
      const namesJson = JSON.stringify(group.containerNames || []).replace(/"/g, '&quot;');

      return `
        <div class="group-card">
          <div class="group-header" onclick="toggleCollapseCard('${escapeAttr(cardKey)}')">
            <div class="group-title-area">
              <span class="collapse-icon">${isCollapsed ? '▶' : '▼'}</span>
              <div>
                <div class="group-name">
                  <span>${escapeHtml(group.icon || '🔗')} ${escapeHtml(group.name)}</span>
                  <span class="mode-badge ${runningCount === memberContainers.length && memberContainers.length > 0 ? 'live' : 'demo'}">
                    ${runningCount}/${memberContainers.length} aktiv
                  </span>
                </div>
                <div class="group-desc">
                  ${escapeHtml(group.description || `${memberContainers.length} zusammengeführte Container`)}
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 6px;" onclick="event.stopPropagation()">
              <button
                class="btn btn-success btn-sm"
                onclick="triggerBatchAction(${namesJson}, 'start', 'Gruppe ${escapeAttr(group.name)}', event)"
              >
                ▶ Gruppe Starten
              </button>
              <button
                class="btn btn-danger btn-sm"
                onclick="triggerBatchAction(${namesJson}, 'stop', 'Gruppe ${escapeAttr(group.name)}', event)"
              >
                ⏹ Gruppe Stoppen
              </button>
              <button
                class="btn btn-ghost btn-sm"
                onclick="triggerBatchAction(${namesJson}, 'restart', 'Gruppe ${escapeAttr(group.name)}', event)"
                title="Gesamte Gruppe neu starten"
              >
                🔄
              </button>
              <button
                class="btn btn-ghost btn-sm"
                onclick="openEditGroupModal('${escapeAttr(group.id)}', event)"
                title="Gruppe bearbeiten / Container hinzufügen oder entfernen"
              >
                ✏️
              </button>
              <button
                class="btn btn-ghost btn-sm"
                onclick="confirmDeleteGroup('${escapeAttr(group.id)}', '${escapeAttr(group.name)}', event)"
                title="Gruppe auflösen"
              >
                🗑
              </button>
            </div>
          </div>

          ${
            !isCollapsed
              ? `<div class="group-body">
                  ${
                    memberContainers.length > 0
                      ? memberContainers.map(c => renderContainerRowHtml(c, true)).join('')
                      : `<div style="padding: 12px; font-size: 12px; color: var(--text-muted);">Keine aktiven Container mit diesen Namen gefunden.</div>`
                  }
                </div>`
              : ''
          }
        </div>
      `;
    });

    pane.innerHTML = headerBanner + groupCards.join('');
  }
}

function selectAllFiltered() {
  const filtered = appState.containers.filter(matchesSearchAndFilter);
  const allAlreadySelected = filtered.every(c => checkedNames.has(c.name));
  if (allAlreadySelected) {
    filtered.forEach(c => checkedNames.delete(c.name));
  } else {
    filtered.forEach(c => checkedNames.add(c.name));
  }
  updateBatchBar();
  renderLeftPane();
}

// --- RENDER RIGHT INSPECTOR (CONTAINER DETAILS & ACTIONS) ---
function setInspectorTab(tab) {
  inspectorTab = tab;
  renderRightInspector();
}

async function toggleContainerInGroup(groupId, containerName) {
  const group = appState.groups.find(g => g.id === groupId);
  if (!group) return;
  const set = new Set(group.containerNames || []);
  if (set.has(containerName)) {
    set.delete(containerName);
  } else {
    set.add(containerName);
  }

  try {
    await apiFetch(`/api/groups/${encodeURIComponent(groupId)}`, {
      method: 'PUT',
      body: JSON.stringify({ containerNames: Array.from(set) })
    });
    showToast(`Gruppenzuordnung für "${containerName}" aktualisiert`, 'success');
    await refreshAll(false);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderRightInspector() {
  const pane = document.getElementById('right-pane');
  const c =
    selectedContainerDetails ||
    appState.containers.find(x => x.name === selectedContainerName) ||
    appState.containers[0];

  if (!c) {
    pane.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px;">
        Wähle links einen Container aus, um Details, Logs und Aktionen anzuzeigen.
      </div>
    `;
    return;
  }

  const isRunning = c.state === 'running';
  const isPaused = c.state === 'paused';
  const logs = c.logs || [];
  const mounts = c.mounts || [];
  const envList = c.env || [];

  let tabBodyHtml = '';

  if (inspectorTab === 'overview') {
    const memPercent =
      c.memLimitMb > 0 ? Math.min(100, ((c.memUsageMb || 0) / c.memLimitMb) * 100).toFixed(1) : 0;

    tabBodyHtml = `
      <!-- Live Metrics Cards -->
      <div class="metrics-grid">
        <div class="metric-box">
          <div class="metric-box-label">CPU-Auslastung</div>
          <div class="metric-box-value">${isRunning ? `${c.cpuPercent ?? 0}%` : '0.0%'}</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(100, c.cpuPercent || 0)}%"></div>
          </div>
        </div>
        <div class="metric-box">
          <div class="metric-box-label">Arbeitsspeicher (RAM)</div>
          <div class="metric-box-value">${isRunning ? `${c.memUsageMb ?? 0} MB` : '0 MB'}</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${memPercent}%"></div>
          </div>
        </div>
      </div>

      <!-- Quick Group Assignment Card -->
      <div class="info-card">
        <div class="info-card-title">
          <span>🔗 Gruppenzugehörigkeit (Zusammenführen)</span>
          <button class="btn btn-ghost btn-sm" onclick="openGroupModal('${escapeAttr(c.name)}')">+ Neue Gruppe</button>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${
            appState.groups.length > 0
              ? appState.groups
                  .map(g => {
                    const inGroup = (g.containerNames || []).includes(c.name);
                    return `
                      <button
                        onclick="toggleContainerInGroup('${escapeAttr(g.id)}', '${escapeAttr(c.name)}')"
                        class="btn btn-sm ${inGroup ? 'btn-primary' : 'btn-ghost'}"
                        title="${inGroup ? 'Klicken zum Entfernen aus dieser Gruppe' : 'Klicken zum Hinzufügen zu dieser Gruppe'}"
                      >
                        <span>${escapeHtml(g.icon || '🔗')} ${escapeHtml(g.name)}</span>
                        <span>${inGroup ? '✓' : '+'}</span>
                      </button>
                    `;
                  })
                  .join('')
              : `<span style="font-size: 12px; color: var(--text-muted);">Noch keine eigenen Gruppen vorhanden.</span>`
          }
        </div>
      </div>

      <!-- General Container Info -->
      <div class="info-card">
        <div class="info-card-title">📋 Container-Informationen</div>
        <div class="kv-list">
          <div class="kv-row">
            <span class="kv-key">Container-ID</span>
            <span class="kv-val mono">${escapeHtml(c.id)}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">Compose Stack</span>
            <span class="kv-val">📚 ${escapeHtml(c.stack || 'standalone')}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">Status / Uptime</span>
            <span class="kv-val">${escapeHtml(c.status)}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">Restart-Policy</span>
            <span class="kv-val mono">${escapeHtml(c.restartPolicy || 'no')}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">Netzwerk & IP</span>
            <span class="kv-val mono">${escapeHtml(c.networkName || 'bridge')} (${escapeHtml(c.ip || '—')})</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">Netzwerk Traffic (RX / TX)</span>
            <span class="kv-val mono">⬇ ${c.netRxMb ?? 0} MB / ⬆ ${c.netTxMb ?? 0} MB</span>
          </div>
        </div>
      </div>

      <!-- Port Mappings -->
      <div class="info-card">
        <div class="info-card-title">🌐 Port-Freigaben</div>
        ${
          (c.ports || []).length > 0
            ? `<div class="kv-list">
                ${c.ports
                  .map(p => {
                    const host = window.location.hostname || 'localhost';
                    return `
                      <div class="kv-row">
                        <span class="kv-key mono">${
                          p.publicPort ? `${p.ip || '0.0.0.0'}:${p.publicPort}` : 'Intern'
                        } ➔ ${p.privatePort}/${p.type}</span>
                        <span class="kv-val">
                          ${
                            p.publicPort
                              ? `<a href="http://${host}:${p.publicPort}" target="_blank" class="badge badge-port">↗ Im Browser öffnen (:${p.publicPort})</a>`
                              : `<span style="color: var(--text-muted); font-size: 11.5px;">Nur intern erreichbar</span>`
                          }
                        </span>
                      </div>
                    `;
                  })
                  .join('')}
              </div>`
            : `<div style="font-size: 12px; color: var(--text-muted);">Keine Ports veröffentlicht.</div>`
        }
      </div>
    `;
  } else if (inspectorTab === 'logs') {
    const filteredLogs = logSearchQuery
      ? logs.filter(l => l.toLowerCase().includes(logSearchQuery.toLowerCase()))
      : logs;

    tabBodyHtml = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <input
          type="text"
          class="form-input"
          style="flex: 1; height: 32px; font-size: 12px;"
          placeholder="In Logs suchen..."
          value="${escapeAttr(logSearchQuery)}"
          oninput="logSearchQuery = this.value; renderRightInspector();"
        />
        <button class="btn btn-ghost btn-sm" onclick="loadContainerDetails('${escapeAttr(c.name)}', false)">
          🔄 Aktualisieren
        </button>
        <button class="btn btn-ghost btn-sm" onclick="copyContainerLogs()">
          📋 Kopieren
        </button>
      </div>

      <div class="log-viewer">
        ${
          filteredLogs.length > 0
            ? filteredLogs.map(line => `<div class="log-line">${escapeHtml(line)}</div>`).join('')
            : `<div style="color: var(--text-muted);">Keine Log-Einträge vorhanden.</div>`
        }
      </div>
    `;
  } else if (inspectorTab === 'mounts') {
    tabBodyHtml = `
      <div class="info-card">
        <div class="info-card-title">💾 Gemountete Volumes & Bind-Pfade (${mounts.length})</div>
        ${
          mounts.length > 0
            ? `<div style="display: flex; flex-direction: column; gap: 10px;">
                ${mounts
                  .map(
                    m => `
                  <div style="padding: 10px; border-radius: 8px; background: var(--bg-main); border: 1px solid var(--border); font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                      <span class="badge badge-stack">${escapeHtml(m.type.toUpperCase())}</span>
                      <span class="badge ${m.rw ? 'badge-group' : 'badge-stack'}">${m.rw ? 'Read/Write (RW)' : 'Read-Only (RO)'}</span>
                    </div>
                    <div class="mono" style="color: var(--text-muted); font-size: 11.5px;">Host: ${escapeHtml(m.source)}</div>
                    <div class="mono" style="font-weight: 600; margin-top: 2px;">➔ Container: ${escapeHtml(m.destination)}</div>
                  </div>
                `
                  )
                  .join('')}
              </div>`
            : `<div style="font-size: 12px; color: var(--text-muted);">Keine Volumes gemountet.</div>`
        }
      </div>

      <div class="info-card">
        <div class="info-card-title">🌐 Netzwerk-Details</div>
        <div class="kv-list">
          <div class="kv-row"><span class="kv-key">Netzwerk</span><span class="kv-val mono">${escapeHtml(c.networkName || 'bridge')}</span></div>
          <div class="kv-row"><span class="kv-key">IPv4-Adresse</span><span class="kv-val mono">${escapeHtml(c.ip || '—')}</span></div>
          <div class="kv-row"><span class="kv-key">Gateway</span><span class="kv-val mono">${escapeHtml(c.gateway || '—')}</span></div>
          <div class="kv-row"><span class="kv-key">MAC-Adresse</span><span class="kv-val mono">${escapeHtml(c.macAddress || '—')}</span></div>
        </div>
      </div>
    `;
  } else if (inspectorTab === 'env') {
    tabBodyHtml = `
      <div class="info-card">
        <div class="info-card-title">
          <span>⚙️ Umgebungsvariablen (${envList.length})</span>
          <button class="btn btn-ghost btn-sm" onclick="showSecrets = !showSecrets; renderRightInspector();">
            ${showSecrets ? '🙈 Passwörter verbergen' : '👁️ Passwörter zeigen'}
          </button>
        </div>
        ${
          envList.length > 0
            ? `<div class="kv-list mono" style="font-size: 11.5px;">
                ${envList
                  .map(item => {
                    const eqIdx = item.indexOf('=');
                    const key = eqIdx !== -1 ? item.slice(0, eqIdx) : item;
                    let val = eqIdx !== -1 ? item.slice(eqIdx + 1) : '';
                    const isSecret = /PASS|SECRET|TOKEN|KEY|AUTH/i.test(key);
                    if (isSecret && !showSecrets && val) {
                      val = '••••••••••••';
                    }
                    return `
                      <div class="kv-row">
                        <span class="kv-key">${escapeHtml(key)}</span>
                        <span class="kv-val">${escapeHtml(val)}</span>
                      </div>
                    `;
                  })
                  .join('')}
              </div>`
            : `<div style="font-size: 12px; color: var(--text-muted);">Keine Umgebungsvariablen gesetzt.</div>`
        }
      </div>

      <div class="info-card">
        <div class="info-card-title">🚀 Startbefehl (Entrypoint & Cmd)</div>
        <div class="mono" style="font-size: 12px; background: var(--bg-main); padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
          ${escapeHtml([...(c.entrypoint || []), ...(c.cmd || [])].join(' ') || 'Standard-Image-Entrypoint')}
        </div>
      </div>
    `;
  }

  pane.innerHTML = `
    <div class="inspector-header">
      <div class="inspector-top">
        <div>
          <div class="inspector-title">
            <span class="status-led ${escapeAttr(c.state)}"></span>
            <span>${escapeHtml(c.name)}</span>
          </div>
          <div class="inspector-image">${escapeHtml(c.image)}</div>
        </div>
        <span class="mode-badge ${isRunning ? 'live' : 'demo'}">
          ${escapeHtml((c.state || 'unknown').toUpperCase())}
        </span>
      </div>

      <!-- Action Buttons for this Container -->
      <div class="inspector-actions">
        ${
          isRunning
            ? `<button class="btn btn-danger" onclick="triggerContainerAction('${escapeAttr(c.name)}', 'stop', event)">⏹ Stoppen</button>`
            : `<button class="btn btn-success" onclick="triggerContainerAction('${escapeAttr(c.name)}', 'start', event)">▶ Starten</button>`
        }
        <button class="btn btn-ghost" onclick="triggerContainerAction('${escapeAttr(c.name)}', 'restart', event)">
          🔄 Neustart
        </button>
        ${
          isPaused
            ? `<button class="btn btn-warning" onclick="triggerContainerAction('${escapeAttr(c.name)}', 'unpause', event)">▶ Fortsetzen</button>`
            : `<button class="btn btn-ghost" ${!isRunning ? 'disabled' : ''} onclick="triggerContainerAction('${escapeAttr(c.name)}', 'pause', event)">⏸ Pause</button>`
        }
        <button class="btn btn-ghost" onclick="setInspectorTab('logs')">
          📜 Logs
        </button>
      </div>

      <!-- Inspector Sub-Navigation -->
      <div class="inspector-tabs">
        <button class="inspector-tab ${inspectorTab === 'overview' ? 'active' : ''}" onclick="setInspectorTab('overview')">
          📊 Übersicht & Ressourcen
        </button>
        <button class="inspector-tab ${inspectorTab === 'logs' ? 'active' : ''}" onclick="setInspectorTab('logs')">
          📜 Live-Logs (${logs.length})
        </button>
        <button class="inspector-tab ${inspectorTab === 'mounts' ? 'active' : ''}" onclick="setInspectorTab('mounts')">
          💾 Volumes (${mounts.length})
        </button>
        <button class="inspector-tab ${inspectorTab === 'env' ? 'active' : ''}" onclick="setInspectorTab('env')">
          ⚙️ Env (${envList.length})
        </button>
      </div>
    </div>

    <div class="inspector-body">
      ${tabBodyHtml}
    </div>
  `;
}

function copyContainerLogs() {
  const c = selectedContainerDetails;
  if (!c || !c.logs) return;
  navigator.clipboard.writeText(c.logs.join('\n'));
  showToast('Container-Logs in die Zwischenablage kopiert!', 'success');
}

// --- GROUP CREATION & EDIT MODAL ---
function populateModalChecklist(preselectedSet) {
  const listEl = document.getElementById('group-container-checklist');
  listEl.innerHTML = appState.containers
    .map(c => {
      const checked = preselectedSet.has(c.name);
      return `
        <label class="checklist-item">
          <input type="checkbox" class="modal-container-cb" value="${escapeAttr(c.name)}" ${checked ? 'checked' : ''} />
          <span class="status-led ${escapeAttr(c.state)}"></span>
          <span style="font-weight: 600;">${escapeHtml(c.name)}</span>
          <span class="badge badge-stack" style="margin-left: auto;">📚 ${escapeHtml(c.stack)}</span>
        </label>
      `;
    })
    .join('');
}

function openGroupModal(preselectSingleContainer = null) {
  document.getElementById('group-edit-id').value = '';
  document.getElementById('group-modal-title').textContent = '🔗 Container zu einer Gruppe zusammenführen';
  document.getElementById('group-name-input').value = '';
  document.getElementById('group-desc-input').value = '';
  document.getElementById('group-icon-input').value = '🔗';

  const preselected = new Set(checkedNames);
  if (preselectSingleContainer) preselected.add(preselectSingleContainer);

  populateModalChecklist(preselected);
  document.getElementById('group-modal').classList.remove('hidden');
  document.getElementById('group-name-input').focus();
}

function openGroupModalFromSelection() {
  openGroupModal();
}

function openEditGroupModal(groupId, event) {
  if (event) event.stopPropagation();
  const group = appState.groups.find(g => g.id === groupId);
  if (!group) return;

  document.getElementById('group-edit-id').value = group.id;
  document.getElementById('group-modal-title').textContent = `✏️ Gruppe "${group.name}" bearbeiten`;
  document.getElementById('group-name-input').value = group.name || '';
  document.getElementById('group-desc-input').value = group.description || '';
  document.getElementById('group-icon-input').value = group.icon || '🔗';

  populateModalChecklist(new Set(group.containerNames || []));
  document.getElementById('group-modal').classList.remove('hidden');
}

function closeGroupModal() {
  document.getElementById('group-modal').classList.add('hidden');
}

async function saveGroupModal() {
  const editId = document.getElementById('group-edit-id').value;
  const name = document.getElementById('group-name-input').value.trim();
  const description = document.getElementById('group-desc-input').value.trim();
  const icon = document.getElementById('group-icon-input').value;

  const selectedContainers = Array.from(
    document.querySelectorAll('.modal-container-cb:checked')
  ).map(cb => cb.value);

  if (!name) {
    showToast('Bitte gib einen Namen für die Gruppe ein.', 'error');
    return;
  }
  if (selectedContainers.length === 0) {
    showToast('Bitte wähle mindestens einen Container für die Gruppe aus.', 'error');
    return;
  }

  try {
    if (editId) {
      await apiFetch(`/api/groups/${encodeURIComponent(editId)}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, icon, containerNames: selectedContainers })
      });
      showToast(`Gruppe "${name}" aktualisiert!`, 'success');
    } else {
      await apiFetch('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name, description, icon, containerNames: selectedContainers })
      });
      showToast(`Gruppe "${name}" mit ${selectedContainers.length} Containern erstellt!`, 'success');
      checkedNames.clear();
      setMainView('groups');
    }
    closeGroupModal();
    await refreshAll(false);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmDeleteGroup(groupId, groupName, event) {
  if (event) event.stopPropagation();
  if (!confirm(`Möchtest du die Gruppe "${groupName}" wirklich auflösen? (Die Container selbst werden nicht gelöscht)`)) {
    return;
  }
  try {
    await apiFetch(`/api/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
    showToast(`Gruppe "${groupName}" wurde aufgelöst.`, 'success');
    await refreshAll(false);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- UTILITIES ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}
