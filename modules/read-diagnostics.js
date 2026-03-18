import { state } from './state.js';
import { esc } from './utils.js';

const MAX_EVENTS = 80;
// Spark free tier read quota (official docs, 2026-03).
const FIRESTORE_FREE_READS_PER_DAY = 50000;
const DIAGNOSTIC_TARGET_USERS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('ja-JP');
}

function formatPercent(value) {
  const num = Number(value) || 0;
  if (num >= 1000) return `${Math.round(num).toLocaleString('ja-JP')}%`;
  if (num >= 100) return `${num.toFixed(0)}%`;
  if (num >= 10) return `${num.toFixed(1)}%`;
  if (num >= 1) return `${num.toFixed(2)}%`;
  return `${num.toFixed(3)}%`;
}

function getRatioTone(ratio) {
  if (ratio >= 100) return 'danger';
  if (ratio >= 60) return 'warning';
  if (ratio >= 20) return 'caution';
  return 'safe';
}

function buildDiagnosticsOverview(diag) {
  const elapsedMs = Math.max(Date.now() - (diag.sessionStartedAt || Date.now()), 1000);
  const estimatedReads = Math.max(0, Number(diag.estimatedReads) || 0);
  const freeQuota = FIRESTORE_FREE_READS_PER_DAY;
  const sessionQuotaRatio = (estimatedReads / freeQuota) * 100;
  const dailyReadsAtCurrentPace = Math.round((estimatedReads / elapsedMs) * DAY_MS);
  const dailyQuotaRatio = (dailyReadsAtCurrentPace / freeQuota) * 100;
  const projectedThirtyUsersDailyReads = Math.round(dailyReadsAtCurrentPace * DIAGNOSTIC_TARGET_USERS);
  const projectedThirtyUsersRatio = (projectedThirtyUsersDailyReads / freeQuota) * 100;
  const remainingQuota = Math.max(0, freeQuota - estimatedReads);
  const heavySources = Object.values(diag.sources || {})
    .filter(source => source.totalEstimatedReads > 0)
    .sort((a, b) => b.totalEstimatedReads - a.totalEstimatedReads);
  const topSource = heavySources[0] || null;
  const topSourceShare = topSource
    ? (topSource.totalEstimatedReads / Math.max(estimatedReads, 1)) * 100
    : 0;

  return {
    estimatedReads,
    freeQuota,
    remainingQuota,
    sessionQuotaRatio,
    dailyReadsAtCurrentPace,
    dailyQuotaRatio,
    projectedThirtyUsersDailyReads,
    projectedThirtyUsersRatio,
    topSource,
    topSourceShare,
  };
}

function buildSummaryHtml(diag) {
  const sourceCount = Object.keys(diag.sources || {}).length;
  const overview = buildDiagnosticsOverview(diag);
  const sessionTone = getRatioTone(overview.sessionQuotaRatio);
  const paceTone = getRatioTone(overview.dailyQuotaRatio);
  const projectedTone = getRatioTone(overview.projectedThirtyUsersRatio);
  const topSourceLabel = overview.topSource
    ? `${overview.topSource.label} が ${formatPercent(overview.topSourceShare)}`
    : 'まだ十分な計測データがありません';

  return `
    <div class="rd-overview-callout">
      <div class="rd-overview-callout-title">この診断は何を見る画面？</div>
      <div class="rd-overview-callout-body">
        今このブラウザで「どの機能がどれだけ Firestore を読んでいそうか」を見るための画面です。
        Firebase Console の請求値そのものではありませんが、重い機能を見つけるにはかなり役立ちます。
      </div>
    </div>
    <div class="rd-summary-grid">
      <div class="rd-stat-card rd-stat-card--${sessionTone}">
        <div class="rd-stat-label">このセッションの推定 read</div>
        <div class="rd-stat-value">${formatNumber(overview.estimatedReads)}</div>
        <div class="rd-stat-note">無料枠 50,000 read/日のうち ${formatPercent(overview.sessionQuotaRatio)} / 残り ${formatNumber(overview.remainingQuota)}</div>
      </div>
      <div class="rd-stat-card rd-stat-card--${paceTone}">
        <div class="rd-stat-label">今のペースで1日使うと</div>
        <div class="rd-stat-value">${formatNumber(overview.dailyReadsAtCurrentPace)}</div>
        <div class="rd-stat-note">無料枠比 ${formatPercent(overview.dailyQuotaRatio)} / セッション時間 ${formatElapsed(diag.sessionStartedAt)}</div>
      </div>
      <div class="rd-stat-card rd-stat-card--${projectedTone}">
        <div class="rd-stat-label">${DIAGNOSTIC_TARGET_USERS}人が同じペースなら/日</div>
        <div class="rd-stat-value">${formatNumber(overview.projectedThirtyUsersDailyReads)}</div>
        <div class="rd-stat-note">無料枠比 ${formatPercent(overview.projectedThirtyUsersRatio)} / 全員が同じ使い方をした目安</div>
      </div>
      <div class="rd-stat-card">
        <div class="rd-stat-label">いま一番重い機能</div>
        <div class="rd-stat-value">${overview.topSource ? '1位' : '-'}</div>
        <div class="rd-stat-note">${esc(topSourceLabel)} / ソース ${formatNumber(sourceCount)}件</div>
      </div>
      <div class="rd-stat-card">
        <div class="rd-stat-label">稼働中 listener</div>
        <div class="rd-stat-value">${formatNumber(diag.activeListenerCount)}</div>
        <div class="rd-stat-note">開始 ${formatNumber(diag.listenerStarts)} / snapshot ${formatNumber(diag.listenerSnapshots)}</div>
      </div>
      <div class="rd-stat-card">
        <div class="rd-stat-label">getDocs 回数</div>
        <div class="rd-stat-value">${formatNumber(diag.getDocsCalls)}</div>
        <div class="rd-stat-note">都度読みに行った処理の回数</div>
      </div>
    </div>
    <div class="rd-summary-hint">
      30人換算は「今のあなたと同じペースで、30人が1日使い続けたら」という荒い目安です。安全側で考えるための数字です。
    </div>
  `;
}

function buildSourceListHtml(diag) {
  const totalReads = Math.max(1, Number(diag.estimatedReads) || 0);
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

  return sources.map((source, index) => {
    const sessionShare = (source.totalEstimatedReads / totalReads) * 100;
    const quotaShare = (source.totalEstimatedReads / FIRESTORE_FREE_READS_PER_DAY) * 100;
    const tone = getRatioTone(quotaShare);
    const statusLabel = source.active ? '稼働中' : (source.mode === 'getDocs' ? '都度読込' : '待機');
    const statusClass = source.active ? 'is-active' : (source.mode === 'getDocs' ? 'is-passive' : '');

    return `
      <div class="rd-source-card rd-source-card--${tone}">
        <div class="rd-source-head">
          <div class="rd-source-head-main">
            <div class="rd-rank-badge">#${index + 1}</div>
            <div>
              <div class="rd-source-title">${esc(source.label)}</div>
              <div class="rd-source-meta">${esc(source.scope || 'scope未設定')} / ${source.mode === 'listener' ? 'listener' : 'getDocs'}</div>
            </div>
          </div>
          <span class="rd-source-badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="rd-source-reading">${formatNumber(source.totalEstimatedReads)} read</div>
        <div class="rd-source-stats">
          <span>セッション比 ${formatPercent(sessionShare)}</span>
          <span>無料枠比 ${formatPercent(quotaShare)}</span>
          <span>snapshot ${formatNumber(source.snapshotCount)}</span>
          <span>getDocs ${formatNumber(source.getDocsCount)}</span>
        </div>
        <div class="rd-source-foot">
          <span>開始 ${formatNumber(source.starts)} / 停止 ${formatNumber(source.stops)} / 最終件数 ${formatNumber(source.lastDocCount)}</span>
          <span>最終 ${formatTime(source.lastAt)}</span>
        </div>
      </div>
    `;
  }).join('');
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
        <span>${formatNumber(item.docCount)} docs</span>
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
