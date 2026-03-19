import { db, doc, setDoc, serverTimestamp } from './config.js';
import { state } from './state.js';
import { recordTransferFetch } from './read-diagnostics.js';

const BACKEND_FIREBASE = 'firebase';
const BACKEND_SUPABASE = 'supabase';

const CATEGORY_SELECT = 'id,label,icon,color_index,order_index,is_external';
const CARD_SELECT = 'id,label,icon,url,category_id,parent_id,order_index,category_order,is_external_tool';

function normalizeBackendMode(value) {
  return value === BACKEND_SUPABASE ? BACKEND_SUPABASE : BACKEND_FIREBASE;
}

function normalizeUrl(value) {
  return `${value || ''}`.trim().replace(/\/+$/, '');
}

function normalizeApiKey(value) {
  return `${value || ''}`.trim();
}

function resolveApiKey(config = {}) {
  return normalizeApiKey(
    config.supabasePublishableKey
    || config.supabaseApiKey
    || config.supabaseAnonKey
    || ''
  );
}

function maskApiKey(key) {
  const normalized = normalizeApiKey(key);
  if (!normalized) return '未設定';
  if (normalized.length <= 16) return normalized;
  return `${normalized.slice(0, 12)}...${normalized.slice(-6)}`;
}

function validateRuntimeConfig(mode, url, apiKey) {
  if (mode !== BACKEND_SUPABASE) return;
  if (!url) throw new Error('Supabase URL を入力してください。');
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Supabase URL は https:// から始めてください。');
  }
  if (!apiKey) throw new Error('Supabase APIキーを入力してください。');
}

function getRestBaseUrl() {
  return `${state.supabaseUrl}/rest/v1`;
}

function getApiHeaders({ includeJson = false, prefer = '' } = {}) {
  const headers = {
    apikey: state.supabaseApiKey,
    Authorization: `Bearer ${state.supabaseApiKey}`,
    Accept: 'application/json',
  };
  if (includeJson) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  return headers;
}

function buildFilterValue(value) {
  const raw = `${value ?? ''}`;
  if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function encodeInFilter(ids = []) {
  return `(${ids.map(buildFilterValue).join(',')})`;
}

function summarizeError(text = '') {
  const compact = `${text || ''}`.replace(/\s+/g, ' ').trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

async function requestSupabase(path, {
  method = 'GET',
  body = null,
  prefer = '',
  diagKey = '',
  diagLabel = '',
  diagScope = '',
} = {}) {
  if (!state.supabaseConfigured) {
    throw new Error('Supabase 設定がまだ完了していません。');
  }

  const response = await fetch(`${getRestBaseUrl()}/${path}`, {
    method,
    headers: getApiHeaders({ includeJson: body != null, prefer }),
    body: body == null ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${method} 失敗 (${response.status}): ${summarizeError(text)}`);
  }

  if (!text) return null;

  const data = JSON.parse(text);
  if (diagKey) {
    const itemCount = Array.isArray(data) ? data.length : (data ? 1 : 0);
    recordTransferFetch(diagKey, diagLabel, diagScope, itemCount, data);
  }
  return data;
}

function mapCategoryRow(row = {}) {
  return {
    docId: row.id,
    id: row.id,
    label: row.label || '',
    icon: row.icon || 'fa-solid fa-folder',
    colorIndex: Number.isFinite(row.color_index) ? row.color_index : 1,
    order: Number.isFinite(row.order_index) ? row.order_index : 0,
    isExternal: !!row.is_external,
  };
}

function mapCardRow(row = {}) {
  return {
    id: row.id,
    label: row.label || '',
    icon: row.icon || 'fa-solid fa-link',
    url: row.url || '#',
    category: row.category_id || '',
    parentId: row.parent_id || null,
    order: Number.isFinite(row.order_index) ? row.order_index : 0,
    categoryOrder: Number.isFinite(row.category_order) ? row.category_order : 0,
    isExternalTool: !!row.is_external_tool,
  };
}

function mapCategoryPayload(data = {}) {
  return {
    id: data.id,
    label: data.label || '',
    icon: data.icon || 'fa-solid fa-folder',
    color_index: Number.isFinite(data.colorIndex) ? data.colorIndex : 1,
    order_index: Number.isFinite(data.order) ? data.order : 0,
    is_external: !!data.isExternal,
  };
}

function mapCategoryUpdatePayload(data = {}) {
  const payload = {};
  if ('label' in data) payload.label = data.label || '';
  if ('icon' in data) payload.icon = data.icon || 'fa-solid fa-folder';
  if ('colorIndex' in data) payload.color_index = Number.isFinite(data.colorIndex) ? data.colorIndex : 1;
  if ('order' in data) payload.order_index = Number.isFinite(data.order) ? data.order : 0;
  if ('isExternal' in data) payload.is_external = !!data.isExternal;
  return payload;
}

function mapCardPayload(data = {}) {
  return {
    id: data.id,
    label: data.label || '',
    icon: data.icon || 'fa-solid fa-link',
    url: data.url || '#',
    category_id: data.category || '',
    parent_id: data.parentId || null,
    order_index: Number.isFinite(data.order) ? data.order : 0,
    category_order: Number.isFinite(data.categoryOrder) ? data.categoryOrder : 0,
    is_external_tool: !!data.isExternalTool,
  };
}

function mapCardUpdatePayload(data = {}) {
  const payload = {};
  if ('label' in data) payload.label = data.label || '';
  if ('icon' in data) payload.icon = data.icon || 'fa-solid fa-link';
  if ('url' in data) payload.url = data.url || '#';
  if ('category' in data) payload.category_id = data.category || '';
  if ('parentId' in data) payload.parent_id = data.parentId || null;
  if ('order' in data) payload.order_index = Number.isFinite(data.order) ? data.order : 0;
  if ('categoryOrder' in data) payload.category_order = Number.isFinite(data.categoryOrder) ? data.categoryOrder : 0;
  if ('isExternalTool' in data) payload.is_external_tool = !!data.isExternalTool;
  return payload;
}

export function applySupabaseRuntimeConfig(config = {}) {
  state.dataBackendMode = normalizeBackendMode(config.dataBackendMode);
  state.supabaseUrl = normalizeUrl(config.supabaseUrl);
  state.supabaseApiKey = resolveApiKey(config);
  state.supabaseConfigured = !!(state.supabaseUrl && state.supabaseApiKey);
  renderSupabaseAdminState();
  return {
    mode: state.dataBackendMode,
    url: state.supabaseUrl,
    apiKey: state.supabaseApiKey,
    configured: state.supabaseConfigured,
  };
}

export function isSupabaseSharedCoreEnabled() {
  return state.dataBackendMode === BACKEND_SUPABASE && state.supabaseConfigured;
}

export function createSupabaseClientId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function renderSupabaseAdminState(message = '') {
  const modeEl = document.getElementById('admin-supabase-mode');
  const urlEl = document.getElementById('admin-supabase-url');
  const keyEl = document.getElementById('admin-supabase-key');
  const statusEl = document.getElementById('admin-supabase-status');
  const hintEl = document.getElementById('admin-supabase-hint');
  const previewEl = document.getElementById('admin-supabase-key-preview');

  if (modeEl && modeEl.value !== state.dataBackendMode) modeEl.value = state.dataBackendMode;
  if (urlEl && urlEl.value !== state.supabaseUrl) urlEl.value = state.supabaseUrl;
  if (keyEl && keyEl.value !== state.supabaseApiKey) keyEl.value = state.supabaseApiKey;

  if (statusEl) {
    const modeLabel = state.dataBackendMode === BACKEND_SUPABASE ? 'Supabase' : 'Firebase';
    statusEl.textContent = state.supabaseConfigured
      ? `${modeLabel} 有効`
      : `${modeLabel} 待機`;
    statusEl.classList.toggle('is-configured', state.supabaseConfigured);
  }

  if (hintEl) {
    hintEl.textContent = message || (state.dataBackendMode === BACKEND_SUPABASE
      ? '現在は「共有リンク / 公開カテゴリ / 公開カード」のみ Supabase に切り替えます。'
      : 'いまは Firebase を使います。切り替えても対象は共有リンク系だけです。');
  }

  if (previewEl) {
    previewEl.textContent = maskApiKey(state.supabaseApiKey);
  }
}

export async function saveSupabaseRuntimeConfig({ mode, url, apiKey }) {
  const nextMode = normalizeBackendMode(mode);
  const nextUrl = normalizeUrl(url);
  const nextApiKey = normalizeApiKey(apiKey);

  validateRuntimeConfig(nextMode, nextUrl, nextApiKey);

  await setDoc(doc(db, 'portal', 'config'), {
    dataBackendMode: nextMode,
    supabaseUrl: nextUrl || null,
    supabasePublishableKey: nextApiKey || null,
    supabaseUpdatedAt: serverTimestamp(),
  }, { merge: true });

  return applySupabaseRuntimeConfig({
    dataBackendMode: nextMode,
    supabaseUrl: nextUrl,
    supabasePublishableKey: nextApiKey,
  });
}

export async function fetchSharedCategoriesFromSupabase() {
  const rows = await requestSupabase(
    `public_categories?select=${encodeURIComponent(CATEGORY_SELECT)}&order=order_index.asc`,
    {
      diagKey: 'supabase.public_categories',
      diagLabel: 'Supabase 公開カテゴリ',
      diagScope: 'public_categories',
    }
  );
  return Array.isArray(rows) ? rows.map(mapCategoryRow) : [];
}

export async function fetchSharedCardsFromSupabase() {
  const rows = await requestSupabase(
    `public_cards?select=${encodeURIComponent(CARD_SELECT)}`,
    {
      diagKey: 'supabase.public_cards',
      diagLabel: 'Supabase 公開カード一覧',
      diagScope: 'public_cards',
    }
  );
  return Array.isArray(rows) ? rows.map(mapCardRow) : [];
}

export async function fetchSharedCardsByIdsFromSupabase(ids = []) {
  const filteredIds = [...new Set((ids || []).filter(Boolean))];
  if (!filteredIds.length) return [];

  const rows = await requestSupabase(
    `public_cards?select=${encodeURIComponent(CARD_SELECT)}&id=in.${encodeURIComponent(encodeInFilter(filteredIds))}`,
    {
      diagKey: 'supabase.public_cards.favorites',
      diagLabel: 'Supabase 公開カード(お気に入り)',
      diagScope: 'public_cards',
    }
  );
  return Array.isArray(rows) ? rows.map(mapCardRow) : [];
}

export async function createSharedCategoryInSupabase(data) {
  await requestSupabase('public_categories', {
    method: 'POST',
    prefer: 'return=minimal',
    body: mapCategoryPayload(data),
  });
}

export async function updateSharedCategoryInSupabase(id, data) {
  const payload = mapCategoryUpdatePayload(data);
  await requestSupabase(`public_categories?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: payload,
  });
}

export async function deleteSharedCategoryInSupabase(id) {
  await requestSupabase(`public_categories?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

export async function createSharedCardInSupabase(data) {
  await requestSupabase('public_cards', {
    method: 'POST',
    prefer: 'return=minimal',
    body: mapCardPayload(data),
  });
}

export async function updateSharedCardInSupabase(id, data) {
  const payload = mapCardUpdatePayload(data);
  await requestSupabase(`public_cards?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: payload,
  });
}

export async function deleteSharedCardInSupabase(id) {
  await requestSupabase(`public_cards?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

// ===== お知らせ (notices / notice_reactions / user_notice_reads) =====

const NOTICE_SELECT = 'id,title,body,priority,target_scope,target_departments,require_acknowledgement,acknowledged_by,created_by,created_at';

function isoToFirestoreTs(isoStr) {
  if (!isoStr) return null;
  const ms = Date.parse(isoStr);
  return Number.isFinite(ms) ? { seconds: Math.floor(ms / 1000), nanoseconds: 0 } : null;
}

function normalizeTextArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim());
}

function mapNoticeRow(row = {}) {
  return {
    id: row.id,
    title: row.title || '',
    body: row.body || '',
    priority: row.priority || 'normal',
    targetScope: row.target_scope || 'all',
    targetDepartments: normalizeTextArray(row.target_departments),
    requireAcknowledgement: !!row.require_acknowledgement,
    acknowledgedBy: normalizeTextArray(row.acknowledged_by),
    createdBy: row.created_by || '',
    createdAt: isoToFirestoreTs(row.created_at),
  };
}

function mapNoticePayload(data = {}) {
  return {
    id: data.id,
    title: data.title || '',
    body: data.body || '',
    priority: data.priority || 'normal',
    target_scope: data.targetScope || 'all',
    target_departments: normalizeTextArray(data.targetDepartments),
    require_acknowledgement: !!data.requireAcknowledgement,
    acknowledged_by: normalizeTextArray(data.acknowledgedBy),
    created_by: data.createdBy || '',
  };
}

function mapNoticeUpdatePayload(data = {}) {
  const payload = {};
  if ('title' in data) payload.title = data.title || '';
  if ('body' in data) payload.body = data.body || '';
  if ('priority' in data) payload.priority = data.priority || 'normal';
  if ('targetScope' in data) payload.target_scope = data.targetScope || 'all';
  if ('targetDepartments' in data) payload.target_departments = normalizeTextArray(data.targetDepartments);
  if ('requireAcknowledgement' in data) payload.require_acknowledgement = !!data.requireAcknowledgement;
  if ('acknowledgedBy' in data) payload.acknowledged_by = normalizeTextArray(data.acknowledgedBy);
  return payload;
}

export async function fetchNoticesFromSupabase() {
  const rows = await requestSupabase(
    `notices?select=${encodeURIComponent(NOTICE_SELECT)}&order=created_at.desc`,
    {
      diagKey: 'supabase.notices',
      diagLabel: 'Supabase お知らせ一覧',
      diagScope: 'notices',
    }
  );
  return Array.isArray(rows) ? rows.map(mapNoticeRow) : [];
}

export async function createNoticeInSupabase(data) {
  const payload = mapNoticePayload(data);
  if (!payload.id) payload.id = createSupabaseClientId('notice');
  await requestSupabase('notices', {
    method: 'POST',
    prefer: 'return=minimal',
    body: payload,
  });
  return payload.id;
}

export async function updateNoticeInSupabase(id, data) {
  const payload = mapNoticeUpdatePayload(data);
  await requestSupabase(`notices?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: payload,
  });
}

export async function deleteNoticeInSupabase(id) {
  await requestSupabase(`notices?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

export async function acknowledgeNoticeInSupabase(noticeId, acknowledgedByArray) {
  // acknowledged_by は配列ごと PATCH（Supabase REST は arrayUnion 非対応）
  await requestSupabase(`notices?id=eq.${encodeURIComponent(noticeId)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { acknowledged_by: normalizeTextArray(acknowledgedByArray) },
  });
}

// ---- user_notice_reads ----

export async function fetchReadNoticeIdsFromSupabase(username) {
  if (!username) return new Set();
  const rows = await requestSupabase(
    `user_notice_reads?username=eq.${encodeURIComponent(username)}&select=notice_id`,
    {
      diagKey: 'supabase.user_notice_reads',
      diagLabel: 'Supabase 既読お知らせ',
      diagScope: 'user_notice_reads',
    }
  );
  if (!Array.isArray(rows)) return new Set();
  return new Set(rows.map(r => r.notice_id).filter(Boolean));
}

export async function markNoticesReadInSupabase(username, noticeIds) {
  const ids = [...new Set((noticeIds || []).filter(Boolean))];
  if (!username || !ids.length) return;
  const rows = ids.map(notice_id => ({ username, notice_id }));
  await requestSupabase('user_notice_reads', {
    method: 'POST',
    prefer: 'return=minimal,resolution=ignore-duplicates',
    body: rows,
  });
}

// ---- notice_reactions ----

export async function fetchNoticeReactionsFromSupabase() {
  const rows = await requestSupabase(
    'notice_reactions?select=notice_id,emoji,username',
    {
      diagKey: 'supabase.notice_reactions',
      diagLabel: 'Supabase お知らせリアクション',
      diagScope: 'notice_reactions',
    }
  );
  if (!Array.isArray(rows)) return {};
  // { [noticeId]: { [emoji]: [username, ...] } } に変換（Firebase 互換形式）
  const grouped = {};
  rows.forEach(({ notice_id, emoji, username }) => {
    if (!notice_id || !emoji || !username) return;
    if (!grouped[notice_id]) grouped[notice_id] = {};
    if (!grouped[notice_id][emoji]) grouped[notice_id][emoji] = [];
    grouped[notice_id][emoji].push(username);
  });
  return grouped;
}

export async function addNoticeReactionInSupabase(noticeId, emoji, username) {
  await requestSupabase('notice_reactions', {
    method: 'POST',
    prefer: 'return=minimal,resolution=ignore-duplicates',
    body: { notice_id: noticeId, emoji, username },
  });
}

export async function removeNoticeReactionInSupabase(noticeId, emoji, username) {
  await requestSupabase(
    `notice_reactions?notice_id=eq.${encodeURIComponent(noticeId)}&emoji=eq.${encodeURIComponent(emoji)}&username=eq.${encodeURIComponent(username)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  );
}
