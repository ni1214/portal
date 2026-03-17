import { state } from './state.js';
import { esc } from './utils.js';

const MAX_EVENTS = 80;

let eventsBound = false;
let bindRetryQueued = false;

function createEmptyDiagnostics() {
  return {
    sessionStartedAt: Date.now(),
    estimatedReads: 0,
    listenerStarts: 0,
    listenerSnapshots: 0,
    getDocsCalls: 0,
    activeListenerCount: 0,
    sources: {},
    events: [],
  };
}

function ensureDiagnostics() {
  if (!state.readDiagnostics || typeof state.readDiagnostics !== 'object') {
    state.readDiagnostics = createEmptyDiagnostics();
  }
  if (!state.readDiagnostics.sources || typeof state.readDiagnostics.sources !== 'object') {
    state.readDiagnostics.sources = {};
  }
  if (!Array.isArray(state.readDiagnostics.events)) {
    state.readDiagnostics.events = [];
  }
  return state.readDiagnostics;
}

function getSourceEntry(key, defaults = {}) {
  const diag = ensureDiagnostics();
  if (!diag.sources[key]) {
    diag.sources[key] = {
      key,
      label: defaults.label || key,
      scope: defaults.scope || '',
      mode: defaults.mode || 'listener',
      active: false,
      starts: 0,
      stops: 0,
      snapshotCount: 0,
      getDocsCount: 0,
      totalEstimatedReads: 0,
      lastDocCount: 0,
      lastAt: 0,
      lastStartedAt: 0,
      lastStoppedAt: 0,
      note: defaults.note || '',
    };
  }
  const entry = diag.sources[key];
  if (defaults.label) entry.label = defaults.label;
  if (defaults.scope !== undefined) entry.scope = defaults.scope;
  if (defaults.mode) entry.mode = defaults.mode;
  if (defaults.note !== undefined) entry.note = defaults.note;
  return entry;
}

function pushEvent(type, label, docCount = 0, extra = '') {
  const diag = ensureDiagnostics();
  diag.events.unshift({
    type,
    label,
    docCount: Math.max(0, Number(docCount) || 0),
    extra: extra || '',
    at: Date.now(),
  });
  if (diag.events.length > MAX_EVENTS) {
    diag.events.length = MAX_EVENTS;
  }
}

function renderIfOpen() {
  if (!state.readDiagModalOpen) return;
  renderReadDiagnostics();
}

function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatElapsed(fromTs) {
  if (!fromTs) return '-';
  const diffSec = Math.max(0, Math.floor((Date.now() - fromTs) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hour = Math.floor(min / 60);
  return `${hour}h ${min % 60}m`;
}

function buildSummaryHtml(diag) {
  const sourceCount = Object.keys(diag.sources || {}).length;
  return `
    <div class="rd-summary-grid">
      <div class="rd-stat-card">
        <div class="rd-stat-label">推定 read</div>
        <div class="rd-stat-value">${diag.estimatedReads}</div>
        <div class="rd-stat-note">返却 doc 件数ベースの概算</div>
      </div>
      <div class="rd-stat-card">
        <div class="rd-stat-label">稼働中 listener</div>
        <div class="rd-stat-value">${diag.activeListenerCount}</div>
        <div class="rd-stat-note">開始 ${diag.listenerStarts} / snapshot ${diag.listenerSnapshots}</div>
      </div>
      <div class="rd-stat-card">
        <div class="rd-stat-label">getDocs 回数</div>
        <div class="rd-stat-value">${diag.getDocsCalls}</div>
        <div class="rd-stat-note">読みに行った処理の回数</div>
      </div>
      <div class="rd-stat-card">
        <div class="rd-stat-label">計測セッション</div>
        <div class="rd-stat-value">${formatElapsed(diag.sessionStartedAt)}</div>
        <div class="rd-stat-note">ソース ${sourceCount}件 / 開始 ${formatTime(diag.sessionStartedAt)}</div>
      </div>
    </div>
  `;
}

function buildSourceListHtml(diag) {
  const sources = Object.values(diag.sources || {})
    .sort((a, b) => {
      if (b.totalEstimatedReads !== a.totalEstimatedReads) {
        return b.totalEstimatedReads - a.totalEstimatedReads;
      }
      return (b.lastAt || 0) - (a.lastAt || 0);
    });

  if (!sources.length) {
    return '<div class="rd-empty">まだ計測データがありません。</div>';
  }

  return sources.map(source => `
    <div class="rd-source-card">
      <div class="rd-source-head">
        <div>
          <div class="rd-source-title">${esc(source.label)}</div>
          <div class="rd-source-meta">${esc(source.scope || 'scope未設定')} / ${source.mode === 'listener' ? 'listener' : 'getDocs'}</div>
        </div>
        <span class="rd-source-badge${source.active ? ' is-active' : ''}">
          ${source.active ? '稼働中' : '待機'}
        </span>
      </div>
      <div class="rd-source-stats">
        <span>推定read ${source.totalEstimatedReads}</span>
        <span>snapshot ${source.snapshotCount}</span>
        <span>getDocs ${source.getDocsCount}</span>
        <span>最終件数 ${source.lastDocCount}</span>
      </div>
      <div class="rd-source-foot">
        <span>開始 ${source.starts} / 停止 ${source.stops}</span>
        <span>最終 ${formatTime(source.lastAt)}</span>
      </div>
    </div>
  `).join('');
}

function buildEventListHtml(diag) {
  const items = (diag.events || []).slice(0, 30);
  if (!items.length) {
    return '<div class="rd-empty">イベントログはまだありません。</div>';
  }
  return items.map(item => `
    <div class="rd-log-item">
      <div class="rd-log-main">
        <span class="rd-log-type">${esc(item.type)}</span>
        <span class="rd-log-label">${esc(item.label)}</span>
      </div>
      <div class="rd-log-meta">
        <span>${formatTime(item.at)}</span>
        <span>${item.docCount} docs</span>
        <span>${esc(item.extra || '')}</span>
      </div>
    </div>
  `).join('');
}

export function initReadDiagnostics() {
  ensureDiagnostics();
  bindReadDiagnosticsEvents();
  renderReadDiagnostics();
}

export function resetReadDiagnostics() {
  state.readDiagnostics = createEmptyDiagnostics();
  renderIfOpen();
}

export function recordListenerStart(key, label, scope = '') {
  const diag = ensureDiagnostics();
  const entry = getSourceEntry(key, { label, scope, mode: 'listener' });
  if (!entry.active) {
    entry.active = true;
    diag.activeListenerCount += 1;
  }
  entry.starts += 1;
  entry.lastStartedAt = Date.now();
  entry.lastAt = entry.lastStartedAt;
  diag.listenerStarts += 1;
  pushEvent('listener:start', entry.label, 0, scope);
  renderIfOpen();
}

export function recordListenerSnapshot(key, docCount, extra = '') {
  const diag = ensureDiagnostics();
  const entry = getSourceEntry(key, { mode: 'listener' });
  const docs = Math.max(0, Number(docCount) || 0);
  entry.snapshotCount += 1;
  entry.lastDocCount = docs;
  entry.totalEstimatedReads += docs;
  entry.lastAt = Date.now();
  diag.listenerSnapshots += 1;
  diag.estimatedReads += docs;
  pushEvent('listener:snapshot', entry.label, docs, extra);
  renderIfOpen();
}

export function wrapTrackedListenerUnsubscribe(key, unsub) {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    try {
      unsub?.();
    } finally {
      const diag = ensureDiagnostics();
      const entry = getSourceEntry(key, { mode: 'listener' });
      if (entry.active) {
        entry.active = false;
        diag.activeListenerCount = Math.max(0, diag.activeListenerCount - 1);
      }
      entry.stops += 1;
      entry.lastStoppedAt = Date.now();
      entry.lastAt = entry.lastStoppedAt;
      pushEvent('listener:stop', entry.label, entry.lastDocCount, entry.scope);
      renderIfOpen();
    }
  };
}

export function recordGetDocsRead(key, label, scope = '', docCount = 0) {
  const diag = ensureDiagnostics();
  const entry = getSourceEntry(key, { label, scope, mode: 'getDocs' });
  const docs = Math.max(0, Number(docCount) || 0);
  entry.getDocsCount += 1;
  entry.lastDocCount = docs;
  entry.totalEstimatedReads += docs;
  entry.lastAt = Date.now();
  diag.getDocsCalls += 1;
  diag.estimatedReads += docs;
  pushEvent('getDocs', entry.label, docs, scope);
  renderIfOpen();
}

export function openReadDiagnosticsModal() {
  const modal = document.getElementById('rd-modal');
  if (!modal) return;
  state.readDiagModalOpen = true;
  modal.classList.add('visible');
  renderReadDiagnostics();
}

export function closeReadDiagnosticsModal() {
  const modal = document.getElementById('rd-modal');
  if (modal) modal.classList.remove('visible');
  state.readDiagModalOpen = false;
}

export function renderReadDiagnostics() {
  ensureDiagnostics();
  const summaryEl = document.getElementById('rd-summary');
  const sourceEl = document.getElementById('rd-source-list');
  const eventEl = document.getElementById('rd-event-list');
  if (!summaryEl || !sourceEl || !eventEl) return;

  const diag = state.readDiagnostics;
  summaryEl.innerHTML = buildSummaryHtml(diag);
  sourceEl.innerHTML = buildSourceListHtml(diag);
  eventEl.innerHTML = buildEventListHtml(diag);
}

function bindReadDiagnosticsEvents() {
  if (eventsBound) return;
  const trigger = document.getElementById('btn-read-diagnostics');
  const closeBtn = document.getElementById('rd-close');
  const closeBtn2 = document.getElementById('rd-close2');
  const resetBtn = document.getElementById('rd-reset-btn');
  const modal = document.getElementById('rd-modal');

  if (!trigger || !closeBtn || !closeBtn2 || !resetBtn || !modal) {
    if (!bindRetryQueued) {
      bindRetryQueued = true;
      const retry = () => {
        bindRetryQueued = false;
        bindReadDiagnosticsEvents();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', retry, { once: true });
      } else {
        setTimeout(retry, 100);
      }
    }
    return;
  }

  eventsBound = true;
  trigger.addEventListener('click', openReadDiagnosticsModal);
  closeBtn.addEventListener('click', closeReadDiagnosticsModal);
  closeBtn2.addEventListener('click', closeReadDiagnosticsModal);
  resetBtn.addEventListener('click', resetReadDiagnostics);
  modal.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeReadDiagnosticsModal();
  });
}
