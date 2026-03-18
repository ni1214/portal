import { state } from './state.js';
import { esc } from './utils.js';

const MAX_EVENTS = 80;
const SUPABASE_FREE_TRANSFER_BYTES_PER_MONTH = 5 * 1024 * 1024 * 1024;
const DIAGNOSTIC_TARGET_USERS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
const DEFAULT_BYTES_PER_ITEM = 1024;
const textEncoder = new TextEncoder();

let eventsBound = false;
let bindRetryQueued = false;

function createEmptyDiagnostics() {
  return {
    sessionStartedAt: Date.now(),
    estimatedTransferBytes: 0,
    estimatedItems: 0,
    apiCalls: 0,
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
  const diag = state.readDiagnostics;
  if (!diag.sources || typeof diag.sources !== 'object') {
    diag.sources = {};
  }
  if (!Array.isArray(diag.events)) {
    diag.events = [];
  }
  if (!Number.isFinite(diag.estimatedTransferBytes)) {
    diag.estimatedTransferBytes = 0;
  }
  if (!Number.isFinite(diag.estimatedItems)) {
    diag.estimatedItems = 0;
  }
  if (!Number.isFinite(diag.apiCalls)) {
    diag.apiCalls = 0;
  }
  return diag;
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
      totalEstimatedBytes: 0,
      totalEstimatedItems: 0,
      lastItemCount: 0,
      lastEstimatedBytes: 0,
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

function normalizePayload(payload) {
  if (payload == null) return null;

  if (Array.isArray(payload)) {
    return payload
      .map(item => normalizePayload(item))
      .filter(item => item !== null && item !== undefined);
  }

  if (typeof payload === 'object' && Array.isArray(payload.docs)) {
    return normalizePayload(payload.docs);
  }

  if (typeof payload?.data === 'function') {
    const exists = typeof payload.exists === 'function' ? payload.exists() : true;
    if (!exists) return null;
    const data = payload.data();
    if (data == null) return null;
    return payload.id ? { id: payload.id, ...data } : data;
  }

  if (typeof payload === 'object') return payload;
  return payload;
}

function estimateItemCount(payload, fallback = 0) {
  const normalized = normalizePayload(payload);
  if (Array.isArray(normalized)) return normalized.length;
  if (normalized && typeof normalized === 'object') return 1;
  return Math.max(0, Number(fallback) || 0);
}

function estimatePayloadBytes(payload, itemCount = 0) {
  const normalized = normalizePayload(payload);
  if (normalized == null) {
    return Math.max(0, Number(itemCount) || 0) * DEFAULT_BYTES_PER_ITEM;
  }

  try {
    const json = JSON.stringify(normalized);
    const rawBytes = textEncoder.encode(json).length;
    const inferredItemCount = estimateItemCount(normalized, itemCount);
    const overheadBytes = 180 + (inferredItemCount * 32);
    return Math.max(rawBytes + overheadBytes, inferredItemCount * 48);
  } catch (_) {
    return Math.max(0, Number(itemCount) || 0) * DEFAULT_BYTES_PER_ITEM;
  }
}

function pushEvent(type, label, itemCount = 0, byteCount = 0, extra = '') {
  const diag = ensureDiagnostics();
  diag.events.unshift({
    type,
    label,
    itemCount: Math.max(0, Number(itemCount) || 0),
    byteCount: Math.max(0, Number(byteCount) || 0),
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

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

function getRatioTone(ratio) {
  if (ratio >= 100) return 'danger';
  if (ratio >= 60) return 'warning';
  if (ratio >= 20) return 'caution';
  return 'safe';
}

function buildDiagnosticsOverview(diag) {
  const elapsedMs = Math.max(Date.now() - (diag.sessionStartedAt || Date.now()), 1000);
  const estimatedBytes = Math.max(0, Number(diag.estimatedTransferBytes) || 0);
  const quotaBytes = SUPABASE_FREE_TRANSFER_BYTES_PER_MONTH;
  const sessionQuotaRatio = (estimatedBytes / quotaBytes) * 100;
  const monthlyBytesAtCurrentPace = Math.round((estimatedBytes / elapsedMs) * MONTH_MS);
  const monthlyQuotaRatio = (monthlyBytesAtCurrentPace / quotaBytes) * 100;
  const projectedThirtyUsersMonthlyBytes = Math.round(monthlyBytesAtCurrentPace * DIAGNOSTIC_TARGET_USERS);
  const projectedThirtyUsersRatio = (projectedThirtyUsersMonthlyBytes / quotaBytes) * 100;
  const dailyBytesAtCurrentPace = Math.round((estimatedBytes / elapsedMs) * DAY_MS);
  const heavySources = Object.values(diag.sources || {})
    .filter(source => source.totalEstimatedBytes > 0)
    .sort((a, b) => b.totalEstimatedBytes - a.totalEstimatedBytes);
  const topSource = heavySources[0] || null;
  const topSourceShare = topSource
    ? (topSource.totalEstimatedBytes / Math.max(estimatedBytes, 1)) * 100
    : 0;

  return {
    estimatedBytes,
    quotaBytes,
    sessionQuotaRatio,
    monthlyBytesAtCurrentPace,
    monthlyQuotaRatio,
    projectedThirtyUsersMonthlyBytes,
    projectedThirtyUsersRatio,
    dailyBytesAtCurrentPace,
    topSource,
    topSourceShare,
  };
}

function buildSummaryHtml(diag) {
  const sourceCount = Object.keys(diag.sources || {}).length;
  const overview = buildDiagnosticsOverview(diag);
  const sessionTone = getRatioTone(overview.sessionQuotaRatio);
  const paceTone = getRatioTone(overview.monthlyQuotaRatio);
  const projectedTone = getRatioTone(overview.projectedThirtyUsersRatio);
  const topSourceLabel = overview.topSource
    ? `${overview.topSource.label} ・ ${formatPercent(overview.topSourceShare)}`
    : 'まだ転送イベントがありません';

  return `
    <div class="rd-overview-callout">
      <div class="rd-overview-callout-title">この診断で見ているもの</div>
      <div class="rd-overview-callout-body">
        Supabase や Firebase の請求値そのものではなく、取得したデータを JSON 化したときの推定転送量です。
        どの画面が重いか、ホーム初期表示がどのくらい太いか、30人運用でどこが危なそうかを見つけるための診断です。
      </div>
    </div>
    <div class="rd-summary-grid">
      <div class="rd-stat-card rd-stat-card--${sessionTone}">
        <div class="rd-stat-label">このセッションの推定転送量</div>
        <div class="rd-stat-value">${formatBytes(overview.estimatedBytes)}</div>
        <div class="rd-stat-note">Supabase 無料枠 5GB/月 に対して ${formatPercent(overview.sessionQuotaRatio)}</div>
      </div>
      <div class="rd-stat-card rd-stat-card--${paceTone}">
        <div class="rd-stat-label">今のペースで30日使うと</div>
        <div class="rd-stat-value">${formatBytes(overview.monthlyBytesAtCurrentPace)}</div>
        <div class="rd-stat-note">無料枠比 ${formatPercent(overview.monthlyQuotaRatio)} / 1日換算 ${formatBytes(overview.dailyBytesAtCurrentPace)}</div>
      </div>
      <div class="rd-stat-card rd-stat-card--${projectedTone}">
        <div class="rd-stat-label">${DIAGNOSTIC_TARGET_USERS}人が同じペースなら/月</div>
        <div class="rd-stat-value">${formatBytes(overview.projectedThirtyUsersMonthlyBytes)}</div>
        <div class="rd-stat-note">無料枠比 ${formatPercent(overview.projectedThirtyUsersRatio)} / 全員が同じ使い方をした目安</div>
      </div>
      <div class="rd-stat-card">
        <div class="rd-stat-label">いちばん重い機能</div>
        <div class="rd-stat-value">${overview.topSource ? '1位' : '-'}</div>
        <div class="rd-stat-note">${esc(topSourceLabel)} / ソース ${formatNumber(sourceCount)}種</div>
      </div>
      <div class="rd-stat-card">
        <div class="rd-stat-label">稼働中 listener</div>
        <div class="rd-stat-value">${formatNumber(diag.activeListenerCount)}</div>
        <div class="rd-stat-note">開始 ${formatNumber(diag.listenerStarts)} / snapshot ${formatNumber(diag.listenerSnapshots)}</div>
      </div>
      <div class="rd-stat-card">
        <div class="rd-stat-label">都度取得回数</div>
        <div class="rd-stat-value">${formatNumber(diag.getDocsCalls + diag.apiCalls)}</div>
        <div class="rd-stat-note">getDocs ${formatNumber(diag.getDocsCalls)} / API ${formatNumber(diag.apiCalls)}</div>
      </div>
    </div>
    <div class="rd-summary-hint">
      5GB/月 は 1日あたり約 170MB の感覚です。テキスト中心の社内ポータルなら十分狙えますが、
      ホーム初期表示で大きい一覧をまとめて読む、添付や大きい JSON を何度も取る、realtime を広く張ると急に太くなります。
    </div>
  `;
}

function buildSourceListHtml(diag) {
  const totalBytes = Math.max(1, Number(diag.estimatedTransferBytes) || 0);
  const sources = Object.values(diag.sources || {})
    .sort((a, b) => {
      if (b.totalEstimatedBytes !== a.totalEstimatedBytes) {
        return b.totalEstimatedBytes - a.totalEstimatedBytes;
      }
      return (b.lastAt || 0) - (a.lastAt || 0);
    });

  if (!sources.length) {
    return '<div class="rd-empty">まだ転送データがありません。</div>';
  }

  return sources.map((source, index) => {
    const sessionShare = (source.totalEstimatedBytes / totalBytes) * 100;
    const quotaShare = (source.totalEstimatedBytes / SUPABASE_FREE_TRANSFER_BYTES_PER_MONTH) * 100;
    const tone = getRatioTone(quotaShare);
    const statusLabel = source.active
      ? '稼働中'
      : (source.mode === 'getDocs' ? '都度取得' : (source.mode === 'api' ? 'API取得' : '待機'));
    const statusClass = source.active ? 'is-active' : ((source.mode === 'getDocs' || source.mode === 'api') ? 'is-passive' : '');
    const modeLabel = source.mode === 'listener'
      ? 'listener'
      : (source.mode === 'api' ? 'api' : 'getDocs');

    return `
      <div class="rd-source-card rd-source-card--${tone}">
        <div class="rd-source-head">
          <div class="rd-source-head-main">
            <div class="rd-rank-badge">#${index + 1}</div>
            <div>
              <div class="rd-source-title">${esc(source.label)}</div>
              <div class="rd-source-meta">${esc(source.scope || 'scope未設定')} / ${modeLabel}</div>
            </div>
          </div>
          <span class="rd-source-badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="rd-source-reading">${formatBytes(source.totalEstimatedBytes)}</div>
        <div class="rd-source-stats">
          <span>セッション比 ${formatPercent(sessionShare)}</span>
          <span>無料枠比 ${formatPercent(quotaShare)}</span>
          <span>snapshot ${formatNumber(source.snapshotCount)}</span>
          <span>calls ${formatNumber(source.getDocsCount)}</span>
        </div>
        <div class="rd-source-foot">
          <span>累計 ${formatNumber(source.totalEstimatedItems)}件 / 最終 ${formatNumber(source.lastItemCount)}件 / 最終 ${formatBytes(source.lastEstimatedBytes)}</span>
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
        <span>${formatNumber(item.itemCount)}件</span>
        <span>${formatBytes(item.byteCount)}</span>
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

export const initTransferDiagnostics = initReadDiagnostics;

export function resetReadDiagnostics() {
  state.readDiagnostics = createEmptyDiagnostics();
  renderIfOpen();
}

export const resetTransferDiagnostics = resetReadDiagnostics;

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
  pushEvent('listener:start', entry.label, 0, 0, scope);
  renderIfOpen();
}

export function recordListenerSnapshot(key, docCount, extra = '', payload = null) {
  const diag = ensureDiagnostics();
  const entry = getSourceEntry(key, { mode: 'listener' });
  const items = estimateItemCount(payload, docCount);
  const bytes = estimatePayloadBytes(payload, items);
  entry.snapshotCount += 1;
  entry.lastItemCount = items;
  entry.lastEstimatedBytes = bytes;
  entry.totalEstimatedItems += items;
  entry.totalEstimatedBytes += bytes;
  entry.lastAt = Date.now();
  diag.listenerSnapshots += 1;
  diag.estimatedItems += items;
  diag.estimatedTransferBytes += bytes;
  pushEvent('listener:snapshot', entry.label, items, bytes, extra);
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
      pushEvent('listener:stop', entry.label, entry.lastItemCount, entry.lastEstimatedBytes, entry.scope);
      renderIfOpen();
    }
  };
}

export function recordGetDocsRead(key, label, scope = '', docCount = 0, payload = null) {
  const diag = ensureDiagnostics();
  const entry = getSourceEntry(key, { label, scope, mode: 'getDocs' });
  const items = estimateItemCount(payload, docCount);
  const bytes = estimatePayloadBytes(payload, items);
  entry.getDocsCount += 1;
  entry.lastItemCount = items;
  entry.lastEstimatedBytes = bytes;
  entry.totalEstimatedItems += items;
  entry.totalEstimatedBytes += bytes;
  entry.lastAt = Date.now();
  diag.getDocsCalls += 1;
  diag.estimatedItems += items;
  diag.estimatedTransferBytes += bytes;
  pushEvent('getDocs', entry.label, items, bytes, scope);
  renderIfOpen();
}

export function recordTransferFetch(key, label, scope = '', itemCount = 0, payload = null) {
  const diag = ensureDiagnostics();
  const entry = getSourceEntry(key, { label, scope, mode: 'api' });
  const items = estimateItemCount(payload, itemCount);
  const bytes = estimatePayloadBytes(payload, items);
  entry.getDocsCount += 1;
  entry.lastItemCount = items;
  entry.lastEstimatedBytes = bytes;
  entry.totalEstimatedItems += items;
  entry.totalEstimatedBytes += bytes;
  entry.lastAt = Date.now();
  diag.apiCalls += 1;
  diag.estimatedItems += items;
  diag.estimatedTransferBytes += bytes;
  pushEvent('api', entry.label, items, bytes, scope);
  renderIfOpen();
}

export function openReadDiagnosticsModal() {
  const modal = document.getElementById('rd-modal');
  if (!modal) return;
  state.readDiagModalOpen = true;
  modal.classList.add('visible');
  renderReadDiagnostics();
}

export const openTransferDiagnosticsModal = openReadDiagnosticsModal;

export function closeReadDiagnosticsModal() {
  const modal = document.getElementById('rd-modal');
  if (modal) modal.classList.remove('visible');
  state.readDiagModalOpen = false;
}

export const closeTransferDiagnosticsModal = closeReadDiagnosticsModal;

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

export const renderTransferDiagnostics = renderReadDiagnostics;

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
