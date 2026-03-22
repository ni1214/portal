import { state } from './state.js';
import { recordTransferFetch } from './read-diagnostics.js';

const BACKEND_FIREBASE = 'firebase';
const BACKEND_SUPABASE = 'supabase';
const SUPABASE_STORAGE_KEY = 'portal-supabase-v2';

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

export function saveSupabaseConfigToStorage(url, apiKey, mode) {
  try {
    localStorage.setItem(SUPABASE_STORAGE_KEY, JSON.stringify({
      url: normalizeUrl(url),
      apiKey: normalizeApiKey(apiKey),
      mode: normalizeBackendMode(mode),
    }));
  } catch (_) {}
}

export function loadSupabaseConfigFromStorage() {
  try {
    const raw = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      supabaseUrl: parsed.url || '',
      supabasePublishableKey: parsed.apiKey || '',
      dataBackendMode: parsed.mode || 'supabase',
    };
  } catch (_) { return null; }
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

  // localStorage に保存（Firebase依存を廃止）
  saveSupabaseConfigToStorage(nextUrl, nextApiKey, nextMode);

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

// ===== 個人データ (Step 4: user_accounts / user_lock_pins / user_preferences / etc.) =====

// ---- user_accounts ----

export async function checkUserExistsInSupabase(username) {
  if (!username) return false;
  const rows = await requestSupabase(
    `user_accounts?username=eq.${encodeURIComponent(username)}&select=username`,
    { diagKey: 'supabase.user_accounts.check', diagLabel: 'Supabase ユーザー存在確認', diagScope: 'user_accounts' }
  );
  return Array.isArray(rows) && rows.length > 0;
}

export async function registerUserLoginInSupabase(username) {
  if (!username) return;
  await requestSupabase('user_accounts', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: { username, last_login_at: new Date().toISOString() },
  });
}

export async function deleteUserFromSupabase(username) {
  if (!username) return;
  // assigned_tasks の assigned_to / assigned_by は FK なしなので手動削除
  await Promise.allSettled([
    requestSupabase(`assigned_tasks?assigned_to=eq.${encodeURIComponent(username)}`, {
      method: 'DELETE', prefer: 'return=minimal',
    }),
    requestSupabase(`assigned_tasks?assigned_by=eq.${encodeURIComponent(username)}`, {
      method: 'DELETE', prefer: 'return=minimal',
    }),
  ]);
  // user_accounts 削除 → CASCADE で全ユーザーデータが削除される
  await requestSupabase(`user_accounts?username=eq.${encodeURIComponent(username)}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

export async function fetchAllUserAccountsFromSupabase() {
  const rows = await requestSupabase(
    'user_accounts?select=username,last_login_at&order=username.asc',
    { diagKey: 'supabase.user_accounts.all', diagLabel: 'Supabase 全ユーザー一覧', diagScope: 'user_accounts' }
  );
  return Array.isArray(rows) ? rows : [];
}

// ---- user_lock_pins ----

export async function getUserLockPinFromSupabase(username) {
  if (!username) return null;
  const rows = await requestSupabase(
    `user_lock_pins?username=eq.${encodeURIComponent(username)}&select=enabled,hash,auto_lock_minutes`,
    { diagKey: 'supabase.user_lock_pins', diagLabel: 'Supabase PINロック', diagScope: 'user_lock_pins' }
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0];
}

export async function saveLockPinToSupabase(username, { hash, enabled, autoLockMinutes }) {
  if (!username) return;
  await requestSupabase('user_lock_pins', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: {
      username,
      hash: hash ?? null,
      enabled: !!enabled,
      auto_lock_minutes: autoLockMinutes ?? 5,
    },
  });
}

// ---- user_preferences ----

const PREFS_SELECT = 'theme,font_size,fav_only,favorites,collapsed_sections,collapse_seeded,hidden_cards,mission_banner_hidden,last_viewed_suggestions_at';

function mapPrefsRow(row = {}) {
  return {
    theme: row.theme || 'dark',
    fontSize: row.font_size || 'font-md',
    favOnly: !!row.fav_only,
    favorites: Array.isArray(row.favorites) ? row.favorites : [],
    collapsedSections: Array.isArray(row.collapsed_sections) ? row.collapsed_sections : [],
    collapseSeeded: !!row.collapse_seeded,
    hiddenCards: Array.isArray(row.hidden_cards) ? row.hidden_cards : [],
    missionBannerHidden: row.mission_banner_hidden !== false,
    lastViewedSuggestionsAt: row.last_viewed_suggestions_at
      ? Math.floor(Date.parse(row.last_viewed_suggestions_at) / 1000)
      : null,
  };
}

export async function fetchUserPreferencesFromSupabase(username) {
  if (!username) return null;
  const rows = await requestSupabase(
    `user_preferences?username=eq.${encodeURIComponent(username)}&select=${encodeURIComponent(PREFS_SELECT)}`,
    { diagKey: 'supabase.user_preferences', diagLabel: 'Supabase 個人設定', diagScope: 'user_preferences' }
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return mapPrefsRow(rows[0]);
}

export async function saveUserPreferencesToSupabase(username, prefs = {}) {
  if (!username) return;
  const body = { username };
  if ('theme' in prefs) body.theme = prefs.theme || 'dark';
  if ('fontSize' in prefs) body.font_size = prefs.fontSize || 'font-md';
  if ('favOnly' in prefs) body.fav_only = !!prefs.favOnly;
  if ('favorites' in prefs) body.favorites = Array.isArray(prefs.favorites) ? prefs.favorites : [];
  if ('collapsedSections' in prefs) body.collapsed_sections = Array.isArray(prefs.collapsedSections) ? prefs.collapsedSections : [];
  if ('collapseSeeded' in prefs) body.collapse_seeded = !!prefs.collapseSeeded;
  if ('hiddenCards' in prefs) body.hidden_cards = Array.isArray(prefs.hiddenCards) ? prefs.hiddenCards : [];
  if ('missionBannerHidden' in prefs) body.mission_banner_hidden = prefs.missionBannerHidden !== false;
  if ('lastViewedSuggestionsAt' in prefs && prefs.lastViewedSuggestionsAt != null) {
    body.last_viewed_suggestions_at = new Date(prefs.lastViewedSuggestionsAt * 1000).toISOString();
  }
  await requestSupabase('user_preferences', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body,
  });
}

// ---- user_section_orders ----

export async function fetchSectionOrderFromSupabase(username) {
  if (!username) return [];
  const rows = await requestSupabase(
    `user_section_orders?username=eq.${encodeURIComponent(username)}&select=order_ids`,
    { diagKey: 'supabase.user_section_orders', diagLabel: 'Supabase セクション順', diagScope: 'user_section_orders' }
  );
  if (!Array.isArray(rows) || !rows.length) return [];
  return Array.isArray(rows[0].order_ids) ? rows[0].order_ids : [];
}

export async function saveSectionOrderToSupabase(username, orderIds) {
  if (!username) return;
  await requestSupabase('user_section_orders', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: { username, order_ids: Array.isArray(orderIds) ? orderIds : [] },
  });
}

// ---- user_profiles ----

const PROFILE_SELECT = 'real_name,department,role_type,email,phone,signature_template';

function mapProfileRow(row = {}) {
  return {
    realName: row.real_name || '',
    department: row.department || '',
    roleType: row.role_type || 'member',
    email: row.email || '',
    phone: row.phone || '',
    signatureTemplate: row.signature_template || '',
  };
}

export async function fetchUserProfileFromSupabase(username) {
  if (!username) return null;
  const rows = await requestSupabase(
    `user_profiles?username=eq.${encodeURIComponent(username)}&select=${encodeURIComponent(PROFILE_SELECT)}`,
    { diagKey: 'supabase.user_profiles', diagLabel: 'Supabase プロフィール', diagScope: 'user_profiles' }
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return mapProfileRow(rows[0]);
}

export async function saveUserProfileToSupabase(username, data = {}) {
  if (!username) return;
  const body = { username };
  if ('realName' in data) body.real_name = data.realName || '';
  if ('department' in data) body.department = data.department || '';
  if ('roleType' in data) body.role_type = data.roleType || 'member';
  if ('email' in data) body.email = data.email || '';
  if ('phone' in data) body.phone = data.phone || '';
  if ('signatureTemplate' in data) body.signature_template = data.signatureTemplate || '';
  await requestSupabase('user_profiles', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body,
  });
}

// ---- private_sections ----

const PRIVATE_SECTION_SELECT = 'id,label,icon,color_index,order_index';

function mapPrivateSectionRow(row = {}) {
  return {
    docId: row.id,
    id: row.id,
    label: row.label || '',
    icon: row.icon || 'fa-solid fa-star',
    colorIndex: Number.isFinite(row.color_index) ? row.color_index : 1,
    order: Number.isFinite(row.order_index) ? row.order_index : 0,
    isPrivate: true,
  };
}

export async function fetchPrivateSectionsFromSupabase(username) {
  if (!username) return [];
  const rows = await requestSupabase(
    `private_sections?username=eq.${encodeURIComponent(username)}&select=${encodeURIComponent(PRIVATE_SECTION_SELECT)}&order=order_index.asc`,
    { diagKey: 'supabase.private_sections', diagLabel: 'Supabase マイセクション', diagScope: 'private_sections' }
  );
  return Array.isArray(rows) ? rows.map(mapPrivateSectionRow) : [];
}

export async function createPrivateSectionInSupabase(username, data) {
  const id = data.id || createSupabaseClientId('psec');
  await requestSupabase('private_sections', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id,
      username,
      label: data.label || '',
      icon: data.icon || 'fa-solid fa-star',
      color_index: Number.isFinite(data.colorIndex) ? data.colorIndex : 1,
      order_index: Number.isFinite(data.order) ? data.order : 0,
    },
  });
  return id;
}

export async function updatePrivateSectionInSupabase(id, data) {
  const payload = {};
  if ('label' in data) payload.label = data.label || '';
  if ('icon' in data) payload.icon = data.icon || 'fa-solid fa-star';
  if ('colorIndex' in data) payload.color_index = Number.isFinite(data.colorIndex) ? data.colorIndex : 1;
  if ('order' in data) payload.order_index = Number.isFinite(data.order) ? data.order : 0;
  await requestSupabase(`private_sections?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: payload,
  });
}

export async function deletePrivateSectionInSupabase(id) {
  await requestSupabase(`private_sections?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

// ---- private_cards ----

const PRIVATE_CARD_SELECT = 'id,label,icon,url,section_id,parent_id,order_index';

function mapPrivateCardRow(row = {}) {
  return {
    id: row.id,
    label: row.label || '',
    icon: row.icon || 'fa-solid fa-link',
    url: row.url || '#',
    category: row.section_id || '',   // Firebase 互換: category = section_id
    parentId: row.parent_id || null,
    order: Number.isFinite(row.order_index) ? row.order_index : 0,
    isPrivate: true,
  };
}

export async function fetchPrivateCardsFromSupabase(username) {
  if (!username) return [];
  const rows = await requestSupabase(
    `private_cards?username=eq.${encodeURIComponent(username)}&select=${encodeURIComponent(PRIVATE_CARD_SELECT)}`,
    { diagKey: 'supabase.private_cards', diagLabel: 'Supabase マイカード', diagScope: 'private_cards' }
  );
  return Array.isArray(rows) ? rows.map(mapPrivateCardRow) : [];
}

export async function createPrivateCardInSupabase(username, data) {
  const id = data.id || createSupabaseClientId('pcard');
  await requestSupabase('private_cards', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id,
      username,
      label: data.label || '',
      icon: data.icon || 'fa-solid fa-link',
      url: data.url || '#',
      section_id: data.category || data.sectionId || '',
      parent_id: data.parentId || null,
      order_index: Number.isFinite(data.order) ? data.order : 0,
    },
  });
  return id;
}

export async function updatePrivateCardInSupabase(id, data) {
  const payload = {};
  if ('label' in data) payload.label = data.label || '';
  if ('icon' in data) payload.icon = data.icon || 'fa-solid fa-link';
  if ('url' in data) payload.url = data.url || '#';
  if ('category' in data) payload.section_id = data.category || '';
  if ('sectionId' in data) payload.section_id = data.sectionId || '';
  if ('parentId' in data) payload.parent_id = data.parentId || null;
  if ('order' in data) payload.order_index = Number.isFinite(data.order) ? data.order : 0;
  await requestSupabase(`private_cards?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: payload,
  });
}

export async function deletePrivateCardInSupabase(id) {
  await requestSupabase(`private_cards?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

// ---- user_todos ----

const TODO_SELECT = 'id,text,done,due_date,created_at';

function mapTodoRow(row = {}) {
  return {
    id:        row.id,
    text:      row.text || '',
    done:      !!row.done,
    dueDate:   row.due_date || null,
    createdAt: row.created_at ? isoToFirestoreTs(row.created_at) : null,
  };
}

export async function fetchUserTodosFromSupabase(username) {
  if (!username) return [];
  const rows = await requestSupabase(
    `user_todos?username=eq.${encodeURIComponent(username)}&select=${encodeURIComponent(TODO_SELECT)}&order=created_at.asc`,
    { diagKey: 'supabase.user_todos', diagLabel: 'Supabase TODO', diagScope: 'user_todos' }
  );
  return Array.isArray(rows) ? rows.map(mapTodoRow) : [];
}

export async function createUserTodoInSupabase(username, data) {
  const id = data.id || createSupabaseClientId('todo');
  await requestSupabase('user_todos', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id,
      username,
      text:    data.text || '',
      done:    false,
      due_date: data.dueDate || null,
    },
  });
  return id;
}

export async function updateUserTodoInSupabase(id, data) {
  const payload = {};
  if ('text' in data) payload.text = data.text || '';
  if ('done' in data) payload.done = !!data.done;
  if ('dueDate' in data) payload.due_date = data.dueDate || null;
  await requestSupabase(`user_todos?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: payload,
  });
}

export async function deleteUserTodoInSupabase(id) {
  await requestSupabase(`user_todos?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

// ---- user_email_contacts ----
// 注意: テーブルの PK カラム名は `contact_id`（`id` ではない）

const EMAIL_CONTACT_SELECT = 'contact_id,company_name,person_name,created_at';

function mapEmailContactRow(row = {}) {
  return {
    id:          row.contact_id,   // Firebase 互換: contact_id → id
    companyName: row.company_name || '',
    personName:  row.person_name  || '',
  };
}

export async function fetchEmailContactsFromSupabase(username) {
  if (!username) return [];
  const rows = await requestSupabase(
    `user_email_contacts?username=eq.${encodeURIComponent(username)}&select=${encodeURIComponent(EMAIL_CONTACT_SELECT)}&order=created_at.asc`,
    { diagKey: 'supabase.email_contacts', diagLabel: 'Supabase メール連絡先', diagScope: 'user_email_contacts' }
  );
  return Array.isArray(rows) ? rows.map(mapEmailContactRow) : [];
}

export async function createEmailContactInSupabase(username, data) {
  const contactId = data.id || createSupabaseClientId('contact');
  await requestSupabase('user_email_contacts', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      contact_id:   contactId,
      username,
      company_name: data.companyName || '',
      person_name:  data.personName  || '',
    },
  });
  return contactId;
}

// ===== Step 5: 業務系 =====

// ---- cross_dept_requests ----

const CDR_SELECT = [
  'id', 'title', 'project_key', 'to_dept', 'from_dept', 'content', 'proposal', 'remarks',
  'status', 'created_by', 'status_note', 'status_updated_by', 'archived',
  'notify_creator', 'linked_task_id', 'linked_task_status', 'linked_task_assigned_to',
  'linked_task_linked_by', 'linked_task_linked_at', 'linked_task_closed_at',
  'created_at', 'updated_at',
].join(',');

function mapCdrRow(row = {}) {
  return {
    id:                  row.id,
    title:               row.title || '',
    projectKey:          row.project_key || '',
    toDept:              row.to_dept || '',
    fromDept:            row.from_dept || '',
    content:             row.content || '',
    proposal:            row.proposal || '',
    remarks:             row.remarks || '',
    status:              row.status || 'submitted',
    createdBy:           row.created_by || '',
    statusNote:          row.status_note || '',
    statusUpdatedBy:     row.status_updated_by || '',
    archived:            !!row.archived,
    notifyCreator:       !!row.notify_creator,
    linkedTaskId:        row.linked_task_id || null,
    linkedTaskStatus:    row.linked_task_status || null,
    linkedTaskAssignedTo: row.linked_task_assigned_to || null,
    linkedTaskLinkedBy:  row.linked_task_linked_by || null,
    linkedTaskLinkedAt:  row.linked_task_linked_at ? isoToFirestoreTs(row.linked_task_linked_at) : null,
    linkedTaskClosedAt:  row.linked_task_closed_at ? isoToFirestoreTs(row.linked_task_closed_at) : null,
    createdAt:           isoToFirestoreTs(row.created_at),
    updatedAt:           isoToFirestoreTs(row.updated_at),
  };
}

/** 自分の部署宛て・アクティブな依頼 */
export async function fetchReceivedRequestsFromSupabase(myDept) {
  if (!myDept) return [];
  const rows = await requestSupabase(
    `cross_dept_requests?to_dept=eq.${encodeURIComponent(myDept)}&status=eq.submitted&archived=eq.false&select=${encodeURIComponent(CDR_SELECT)}&order=created_at.desc`,
    { diagKey: 'supabase.cdr.received', diagLabel: 'Supabase 受信依頼', diagScope: 'cross_dept_requests' }
  );
  return Array.isArray(rows) ? rows.map(mapCdrRow) : [];
}

/** 自分が送信した依頼・通知あり */
export async function fetchSentRequestsFromSupabase(username) {
  if (!username) return [];
  const rows = await requestSupabase(
    `cross_dept_requests?created_by=eq.${encodeURIComponent(username)}&notify_creator=eq.true&archived=eq.false&select=${encodeURIComponent(CDR_SELECT)}&order=created_at.desc`,
    { diagKey: 'supabase.cdr.sent', diagLabel: 'Supabase 送信依頼', diagScope: 'cross_dept_requests' }
  );
  return Array.isArray(rows) ? rows.map(mapCdrRow) : [];
}

/** 履歴取得（archived 含む全件） */
export async function fetchRequestHistoryFromSupabase(side, { myDept, username } = {}) {
  let url;
  if (side === 'received' && myDept) {
    url = `cross_dept_requests?to_dept=eq.${encodeURIComponent(myDept)}&select=${encodeURIComponent(CDR_SELECT)}&order=created_at.desc`;
  } else if (username) {
    url = `cross_dept_requests?created_by=eq.${encodeURIComponent(username)}&select=${encodeURIComponent(CDR_SELECT)}&order=created_at.desc`;
  } else {
    return [];
  }
  const rows = await requestSupabase(url,
    { diagKey: `supabase.cdr.history.${side}`, diagLabel: `Supabase 依頼履歴:${side}`, diagScope: 'cross_dept_requests' }
  );
  return Array.isArray(rows) ? rows.map(mapCdrRow) : [];
}

export async function createCrossDeptRequestInSupabase(data) {
  const id = data.id || createSupabaseClientId('req');
  await requestSupabase('cross_dept_requests', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id,
      title:             data.title || '',
      project_key:       data.projectKey || '',
      to_dept:           data.toDept || '',
      from_dept:         data.fromDept || '',
      content:           data.content || '',
      proposal:          data.proposal || '',
      remarks:           data.remarks || '',
      status:            data.status || 'submitted',
      created_by:        data.createdBy || '',
      status_note:       '',
      status_updated_by: '',
      archived:          false,
      notify_creator:    false,
    },
  });
  return id;
}

export async function updateCrossDeptRequestInSupabase(id, data) {
  const payload = {};
  if ('status' in data)           payload.status              = data.status;
  if ('statusNote' in data)       payload.status_note         = data.statusNote || '';
  if ('statusUpdatedBy' in data)  payload.status_updated_by   = data.statusUpdatedBy || '';
  if ('archived' in data)         payload.archived            = !!data.archived;
  if ('notifyCreator' in data)    payload.notify_creator      = !!data.notifyCreator;
  if ('linkedTaskId' in data)     payload.linked_task_id      = data.linkedTaskId || null;
  if ('linkedTaskStatus' in data) payload.linked_task_status  = data.linkedTaskStatus || null;
  if ('linkedTaskAssignedTo' in data) payload.linked_task_assigned_to = data.linkedTaskAssignedTo || null;
  if ('linkedTaskLinkedBy' in data)   payload.linked_task_linked_by   = data.linkedTaskLinkedBy || null;
  if ('linkedTaskLinkedAt' in data)   payload.linked_task_linked_at   = data.linkedTaskLinkedAt || null;
  if ('linkedTaskClosedAt' in data)   payload.linked_task_closed_at   = data.linkedTaskClosedAt || null;
  if ('proposal' in data)         payload.proposal            = data.proposal || '';
  if ('remarks' in data)          payload.remarks             = data.remarks || '';
  await requestSupabase(`cross_dept_requests?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: payload,
  });
}

export async function deleteCrossDeptRequestInSupabase(id) {
  await requestSupabase(`cross_dept_requests?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

// ---- assigned_tasks ----

const TASK_SELECT = [
  'id', 'title', 'description', 'assigned_by', 'assigned_to', 'status',
  'due_date', 'project_key', 'source_type', 'source_request_id',
  'source_request_from_dept', 'source_request_to_dept',
  'notified_done', 'shared_with', 'shared_responses',
  'accepted_at', 'done_at', 'created_at', 'updated_at',
].join(',');

function mapTaskRow(row = {}) {
  return {
    id:                   row.id,
    title:                row.title || '',
    description:          row.description || '',
    assignedBy:           row.assigned_by || '',
    assignedTo:           row.assigned_to || '',
    status:               row.status || 'pending',
    dueDate:              row.due_date || '',
    projectKey:           row.project_key || '',
    sourceType:           row.source_type || 'manual',
    sourceRequestId:      row.source_request_id || null,
    sourceRequestFromDept: row.source_request_from_dept || null,
    sourceRequestToDept:  row.source_request_to_dept || null,
    notifiedDone:         !!row.notified_done,
    sharedWith:           Array.isArray(row.shared_with) ? row.shared_with : [],
    sharedResponses:      (row.shared_responses && typeof row.shared_responses === 'object') ? row.shared_responses : {},
    acceptedAt:           row.accepted_at ? isoToFirestoreTs(row.accepted_at) : null,
    doneAt:               row.done_at     ? isoToFirestoreTs(row.done_at)     : null,
    createdAt:            isoToFirestoreTs(row.created_at),
    updatedAt:            isoToFirestoreTs(row.updated_at),
  };
}

const ACTIVE_TASK_STATUSES_SB = ['pending', 'accepted'];

export async function fetchReceivedTasksFromSupabase(username) {
  if (!username) return [];
  const rows = await requestSupabase(
    `assigned_tasks?assigned_to=eq.${encodeURIComponent(username)}&status=in.(pending,accepted)&select=${encodeURIComponent(TASK_SELECT)}&order=created_at.desc`,
    { diagKey: 'supabase.tasks.received', diagLabel: 'Supabase 受け取りタスク', diagScope: 'assigned_tasks' }
  );
  return Array.isArray(rows) ? rows.map(mapTaskRow) : [];
}

export async function fetchSentTasksFromSupabase(username) {
  if (!username) return [];
  const rows = await requestSupabase(
    `assigned_tasks?assigned_by=eq.${encodeURIComponent(username)}&status=in.(pending,accepted)&select=${encodeURIComponent(TASK_SELECT)}&order=created_at.desc`,
    { diagKey: 'supabase.tasks.sent', diagLabel: 'Supabase 依頼タスク', diagScope: 'assigned_tasks' }
  );
  return Array.isArray(rows) ? rows.map(mapTaskRow) : [];
}

export async function fetchSentDoneNotifyTasksFromSupabase(username) {
  if (!username) return [];
  const rows = await requestSupabase(
    `assigned_tasks?assigned_by=eq.${encodeURIComponent(username)}&status=eq.done&notified_done=eq.false&select=${encodeURIComponent(TASK_SELECT)}&order=created_at.desc`,
    { diagKey: 'supabase.tasks.done-notify', diagLabel: 'Supabase 未確認完了タスク', diagScope: 'assigned_tasks' }
  );
  return Array.isArray(rows) ? rows.map(mapTaskRow) : [];
}

/** shared_with に username を含む全タスクを取得しクライアント側でフィルタ */
export async function fetchSharedTasksFromSupabase(username) {
  if (!username) return [];
  // PostgREST: text[] contains → cs.{value}
  const rows = await requestSupabase(
    `assigned_tasks?shared_with=cs.${encodeURIComponent(`{${username}}`)}&select=${encodeURIComponent(TASK_SELECT)}&order=created_at.desc`,
    { diagKey: 'supabase.tasks.shared', diagLabel: 'Supabase 共有タスク', diagScope: 'assigned_tasks' }
  );
  if (!Array.isArray(rows)) return [];
  // クライアント側で pending 応答のみフィルタ
  return rows
    .map(mapTaskRow)
    .filter(t => {
      const resp = t.sharedResponses?.[username];
      return !resp || resp === 'pending';
    });
}

export async function fetchTaskHistoryFromSupabase(side, username) {
  if (!username) return [];
  const filter = side === 'received'
    ? `assigned_to=eq.${encodeURIComponent(username)}`
    : side === 'shared'
    ? `shared_with=cs.${encodeURIComponent(`{${username}}`)}`
    : `assigned_by=eq.${encodeURIComponent(username)}`;
  const rows = await requestSupabase(
    `assigned_tasks?${filter}&select=${encodeURIComponent(TASK_SELECT)}&order=created_at.desc`,
    { diagKey: `supabase.tasks.history.${side}`, diagLabel: `Supabase タスク履歴:${side}`, diagScope: 'assigned_tasks' }
  );
  return Array.isArray(rows) ? rows.map(mapTaskRow) : [];
}

export async function getAssignedTaskFromSupabase(taskId) {
  if (!taskId) return null;
  const rows = await requestSupabase(
    `assigned_tasks?id=eq.${encodeURIComponent(taskId)}&select=${encodeURIComponent(TASK_SELECT)}&limit=1`,
    { diagKey: 'supabase.tasks.get', diagLabel: 'Supabase タスク取得', diagScope: 'assigned_tasks' }
  );
  return Array.isArray(rows) && rows.length > 0 ? mapTaskRow(rows[0]) : null;
}

export async function createAssignedTaskInSupabase(data) {
  const id = data.id || createSupabaseClientId('task');
  await requestSupabase('assigned_tasks', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id,
      title:                    data.title || '',
      description:              data.description || '',
      assigned_by:              data.assignedBy || '',
      assigned_to:              data.assignedTo || '',
      status:                   data.status || 'pending',
      due_date:                 data.dueDate || '',
      project_key:              data.projectKey || '',
      source_type:              data.sourceType || 'manual',
      source_request_id:        data.sourceRequestId || null,
      source_request_from_dept: data.sourceRequestFromDept || null,
      source_request_to_dept:   data.sourceRequestToDept || null,
      notified_done:            false,
      shared_with:              [],
      shared_responses:         {},
    },
  });
  return id;
}

export async function updateAssignedTaskInSupabase(id, data) {
  const payload = {};
  if ('status' in data)           payload.status           = data.status;
  if ('notifiedDone' in data)     payload.notified_done    = !!data.notifiedDone;
  if ('acceptedAt' in data)       payload.accepted_at      = data.acceptedAt || null;
  if ('doneAt' in data)           payload.done_at          = data.doneAt || null;
  if ('sharedWith' in data)       payload.shared_with      = Array.isArray(data.sharedWith) ? data.sharedWith : [];
  if ('sharedResponses' in data)  payload.shared_responses = (data.sharedResponses && typeof data.sharedResponses === 'object') ? data.sharedResponses : {};
  if ('title' in data)            payload.title            = data.title || '';
  if ('description' in data)      payload.description      = data.description || '';
  if ('dueDate' in data)          payload.due_date         = data.dueDate || '';
  if ('projectKey' in data)       payload.project_key      = data.projectKey || '';
  if ('linkedTaskId' in data)     payload.linked_task_id   = data.linkedTaskId || null;  // cross_dept_requests 側の更新用
  await requestSupabase(`assigned_tasks?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: payload,
  });
}

export async function deleteAssignedTaskInSupabase(id) {
  await requestSupabase(`assigned_tasks?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

// ---- attendance_sites ----

const SITE_SELECT = 'id,code,name,sort_order,active,updated_by,created_at,updated_at';

function mapSiteRow(row = {}) {
  return {
    id:        row.id,
    code:      row.code || '',
    name:      row.name || '',
    sortOrder: Number.isFinite(row.sort_order) ? row.sort_order : 0,
    active:    row.active !== false,
    updatedBy: row.updated_by || '',
    createdAt: isoToFirestoreTs(row.created_at),
    updatedAt: isoToFirestoreTs(row.updated_at),
  };
}

export async function fetchAttendanceSitesFromSupabase() {
  const rows = await requestSupabase(
    `attendance_sites?select=${encodeURIComponent(SITE_SELECT)}&order=sort_order.asc`,
    { diagKey: 'supabase.attendance_sites', diagLabel: 'Supabase 登録現場', diagScope: 'attendance_sites' }
  );
  return Array.isArray(rows) ? rows.map(mapSiteRow) : [];
}

export async function createAttendanceSiteInSupabase(data) {
  const id = data.id || createSupabaseClientId('site');
  await requestSupabase('attendance_sites', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id,
      code:       data.code || '',
      name:       data.name || '',
      sort_order: Number.isFinite(data.sortOrder) ? data.sortOrder : 0,
      active:     true,
      updated_by: data.updatedBy || '',
    },
  });
  return id;
}

export async function updateAttendanceSiteInSupabase(id, data) {
  const payload = {};
  if ('code' in data)       payload.code        = data.code || '';
  if ('name' in data)       payload.name        = data.name || '';
  if ('sortOrder' in data)  payload.sort_order  = Number.isFinite(data.sortOrder) ? data.sortOrder : 0;
  if ('active' in data)     payload.active      = !!data.active;
  if ('updatedBy' in data)  payload.updated_by  = data.updatedBy || '';
  await requestSupabase(`attendance_sites?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: payload,
  });
}

export async function deleteAttendanceSiteInSupabase(id) {
  await requestSupabase(`attendance_sites?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

// ---- attendance_entries ----

const ENTRY_SELECT = 'username,entry_date,type,hayade,zangyo,note,work_site_hours,project_keys,year_month,created_at,updated_at';

function mapEntryRow(row = {}) {
  return {
    dateStr:        row.entry_date,   // YYYY-MM-DD
    type:           row.type || null,
    hayade:         row.hayade || null,
    zangyo:         row.zangyo || null,
    note:           row.note || null,
    yearMonth:      row.year_month || '',
    workSiteHours:  (row.work_site_hours && typeof row.work_site_hours === 'object') ? row.work_site_hours : {},
    projectKeys:    Array.isArray(row.project_keys) ? row.project_keys : [],
    updatedAt:      isoToFirestoreTs(row.updated_at),
  };
}

/** username + yearMonth(s) で個人勤怠を取得 */
export async function fetchAttendanceEntriesFromSupabase(username, yearMonths) {
  if (!username) return {};
  const yms = Array.isArray(yearMonths) ? yearMonths : [yearMonths];
  // OR フィルタは PostgREST の year_month=in.(ym1,ym2,...) で対応
  const ymList = yms.map(ym => encodeURIComponent(ym)).join(',');
  const rows = await requestSupabase(
    `attendance_entries?username=eq.${encodeURIComponent(username)}&year_month=in.(${ymList})&select=${encodeURIComponent(ENTRY_SELECT)}&order=entry_date.asc`,
    { diagKey: 'supabase.attendance_entries', diagLabel: 'Supabase 個人勤怠', diagScope: 'attendance_entries' }
  );
  if (!Array.isArray(rows)) return {};
  const map = {};
  rows.forEach(row => {
    if (row.entry_date) map[row.entry_date] = mapEntryRow(row);
  });
  return map;
}

/** 個人勤怠を upsert（on conflict (username, entry_date) → update） */
export async function upsertAttendanceEntryInSupabase(username, dateStr, data) {
  if (!username || !dateStr) return;
  await requestSupabase('attendance_entries', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      username,
      entry_date:       dateStr,
      type:             data.type ?? null,
      hayade:           data.hayade ?? null,
      zangyo:           data.zangyo ?? null,
      note:             data.note ?? null,
      year_month:       data.yearMonth || dateStr.slice(0, 7),
      work_site_hours:  (data.workSiteHours && typeof data.workSiteHours === 'object') ? data.workSiteHours : {},
      project_keys:     Array.isArray(data.projectKeys) ? data.projectKeys : [],
    },
  });
}

export async function deleteAttendanceEntryInSupabase(username, dateStr) {
  if (!username || !dateStr) return;
  await requestSupabase(
    `attendance_entries?username=eq.${encodeURIComponent(username)}&entry_date=eq.${encodeURIComponent(dateStr)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  );
}

/** 全ユーザーの月次勤怠一括取得（管理者向け集計） */
export async function fetchMonthlyAttendanceSummaryFromSupabase(yearMonth) {
  if (!yearMonth) return [];
  const rows = await requestSupabase(
    `attendance_entries?year_month=eq.${encodeURIComponent(yearMonth)}&select=${encodeURIComponent(ENTRY_SELECT)}&order=username.asc,entry_date.asc`,
    { diagKey: 'supabase.attendance_summary', diagLabel: 'Supabase 月次勤怠集計', diagScope: 'attendance_entries' }
  );
  return Array.isArray(rows) ? rows.map(r => ({ ...mapEntryRow(r), username: r.username })) : [];
}

// ---- order_suppliers ----

const SUPPLIER_SELECT = 'id,name,email,tel,address,active,created_at,updated_at';

function mapSupplierRow(row = {}) {
  return {
    id:      row.id,
    name:    row.name    || '',
    email:   row.email   || '',
    tel:     row.tel     || '',
    address: row.address || '',
    active:  row.active !== false,
  };
}

export async function fetchOrderSuppliersFromSupabase() {
  const rows = await requestSupabase(
    `order_suppliers?active=eq.true&select=${encodeURIComponent(SUPPLIER_SELECT)}&order=name.asc`,
    { diagKey: 'supabase.order_suppliers', diagLabel: 'Supabase 発注先', diagScope: 'order_suppliers' }
  );
  return Array.isArray(rows) ? rows.map(mapSupplierRow) : [];
}

export async function createOrderSupplierInSupabase(data) {
  const id = data.id || createSupabaseClientId('sup');
  await requestSupabase('order_suppliers', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id,
      name:    data.name    || '',
      email:   data.email   || '',
      tel:     data.tel     || '',
      address: data.address || '',
      active:  true,
    },
  });
  return id;
}

export async function updateOrderSupplierInSupabase(id, data) {
  const payload = {};
  if ('name' in data)    payload.name    = data.name    || '';
  if ('email' in data)   payload.email   = data.email   || '';
  if ('tel' in data)     payload.tel     = data.tel     || '';
  if ('address' in data) payload.address = data.address || '';
  if ('active' in data)  payload.active  = !!data.active;
  await requestSupabase(`order_suppliers?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: payload,
  });
}

// ---- order_items ----

const ITEM_SELECT = 'id,supplier_id,item_category,name,spec,unit,default_qty,order_type,material_type,available_lengths,sort_order,active,created_at,updated_at';

function mapItemRow(row = {}) {
  return {
    id:               row.id,
    supplierId:       row.supplier_id || null,
    itemCategory:     row.item_category || '',
    name:             row.name   || '',
    spec:             row.spec   || '',
    unit:             row.unit   || '',
    defaultQty:       Number.isFinite(row.default_qty) ? Number(row.default_qty) : 1,
    orderType:        row.order_type    || 'both',
    materialType:     row.material_type || 'steel',
    availableLengths: Array.isArray(row.available_lengths) ? row.available_lengths : [],
    sortOrder:        Number.isFinite(row.sort_order) ? row.sort_order : 0,
    active:           row.active !== false,
  };
}

export async function fetchOrderItemsFromSupabase() {
  const rows = await requestSupabase(
    `order_items?select=${encodeURIComponent(ITEM_SELECT)}&order=sort_order.asc,item_category.asc,spec.asc`,
    { diagKey: 'supabase.order_items', diagLabel: 'Supabase 鋼材マスタ', diagScope: 'order_items' }
  );
  return Array.isArray(rows) ? rows.map(mapItemRow) : [];
}

export async function upsertOrderItemInSupabase(data) {
  const id = data.id || createSupabaseClientId('item');
  await requestSupabase('order_items', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      id,
      supplier_id:       data.supplierId     || null,
      item_category:     data.itemCategory   || '',
      name:              data.name           || '',
      spec:              data.spec           || '',
      unit:              data.unit           || '',
      default_qty:       Number.isFinite(data.defaultQty) ? data.defaultQty : 1,
      order_type:        data.orderType      || 'both',
      material_type:     data.materialType   || 'steel',
      available_lengths: Array.isArray(data.availableLengths) ? data.availableLengths : [],
      sort_order:        Number.isFinite(data.sortOrder) ? data.sortOrder : 0,
      active:            data.active !== false,
    },
  });
  return id;
}

export async function deactivateOrderItemInSupabase(id) {
  await requestSupabase(`order_items?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { active: false },
  });
}

// ---- orders ----

const ORDER_SELECT = 'id,supplier_id,supplier_name,supplier_email,order_type,site_name,project_key,items,ordered_by,note,ordered_at,email_sent,email_sent_at,deleted_at,deleted_by,created_at,updated_at';

function mapOrderRow(row = {}) {
  return {
    id:            row.id,
    supplierId:    row.supplier_id    || null,
    supplierName:  row.supplier_name  || '',
    supplierEmail: row.supplier_email || '',
    orderType:     row.order_type     || 'factory',
    siteName:      row.site_name      || null,
    projectKey:    row.project_key    || '',
    items:         Array.isArray(row.items) ? row.items : [],
    orderedBy:     row.ordered_by     || '',
    note:          row.note           || '',
    orderedAt:     isoToFirestoreTs(row.ordered_at),
    emailSent:     !!row.email_sent,
    emailSentAt:   row.email_sent_at  ? isoToFirestoreTs(row.email_sent_at) : null,
    deletedAt:     row.deleted_at     ? isoToFirestoreTs(row.deleted_at) : null,
    deletedBy:     row.deleted_by     || null,
    createdAt:     isoToFirestoreTs(row.created_at),
    updatedAt:     isoToFirestoreTs(row.updated_at),
  };
}

/** orderedBy でフィルタ（管理者は全件 → username=null） */
export async function fetchOrdersFromSupabase(username) {
  const filter = username
    ? `ordered_by=eq.${encodeURIComponent(username)}&`
    : '';
  const rows = await requestSupabase(
    `orders?${filter}deleted_at=is.null&select=${encodeURIComponent(ORDER_SELECT)}&order=ordered_at.desc`,
    { diagKey: 'supabase.orders', diagLabel: 'Supabase 発注履歴', diagScope: 'orders' }
  );
  return Array.isArray(rows) ? rows.map(mapOrderRow) : [];
}

export async function createOrderInSupabase(data) {
  const id = data.id || createSupabaseClientId('order');
  const now = new Date().toISOString();
  await requestSupabase('orders', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id,
      supplier_id:    data.supplierId    || null,
      supplier_name:  data.supplierName  || '',
      supplier_email: data.supplierEmail || '',
      order_type:     data.orderType     || 'factory',
      site_name:      data.siteName      || null,
      project_key:    data.projectKey    || '',
      items:          Array.isArray(data.items) ? data.items : [],
      ordered_by:     data.orderedBy     || '',
      note:           data.note          || '',
      ordered_at:     data.orderedAt     || now,
      email_sent:     !!data.emailSent,
      email_sent_at:  data.emailSentAt   || null,
    },
  });
  return id;
}

export async function updateOrderInSupabase(id, data) {
  const payload = {};
  if ('emailSent' in data)    payload.email_sent     = !!data.emailSent;
  if ('emailSentAt' in data)  payload.email_sent_at  = data.emailSentAt || null;
  if ('deletedAt' in data)    payload.deleted_at     = data.deletedAt || null;
  if ('deletedBy' in data)    payload.deleted_by     = data.deletedBy || null;
  if ('note' in data)         payload.note           = data.note || '';
  await requestSupabase(`orders?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: payload,
  });
}

// ===== portal_config（管理設定） =====

const PORTAL_CONFIG_SELECT = 'pin_hash,invite_code_hash,invite_code_plain,invite_updated_at,gemini_api_key,departments,suggestion_box_viewers,mission_text,gas_order_url,order_seed_version';

export async function fetchPortalConfigFromSupabase() {
  const rows = await requestSupabase(
    `portal_config?id=eq.1&select=${encodeURIComponent(PORTAL_CONFIG_SELECT)}`,
    { diagKey: 'supabase.portal_config', diagLabel: 'Supabase 管理設定', diagScope: 'portal_config' }
  );
  if (!Array.isArray(rows) || !rows.length) return {};
  const r = rows[0];
  return {
    pinHash: r.pin_hash || null,
    inviteCodeHash: r.invite_code_hash || null,
    inviteCodePlain: r.invite_code_plain || '',
    inviteUpdatedAt: r.invite_updated_at || null,
    geminiApiKey: r.gemini_api_key || '',
    departments: Array.isArray(r.departments) ? r.departments : [],
    suggestionBoxViewers: Array.isArray(r.suggestion_box_viewers) ? r.suggestion_box_viewers : [],
    missionText: r.mission_text || '',
    gasOrderUrl: r.gas_order_url || '',
    orderSeedVersion: typeof r.order_seed_version === 'number' ? r.order_seed_version : 0,
  };
}

export async function savePortalConfigToSupabase(fields = {}) {
  const body = {};
  if ('pinHash' in fields)              body.pin_hash = fields.pinHash || null;
  if ('inviteCodeHash' in fields)       body.invite_code_hash = fields.inviteCodeHash || null;
  if ('inviteCodePlain' in fields)      body.invite_code_plain = fields.inviteCodePlain || '';
  if ('inviteUpdatedAt' in fields)      body.invite_updated_at = fields.inviteUpdatedAt || null;
  if ('geminiApiKey' in fields)         body.gemini_api_key = fields.geminiApiKey || '';
  if ('departments' in fields)          body.departments = Array.isArray(fields.departments) ? fields.departments : [];
  if ('suggestionBoxViewers' in fields) body.suggestion_box_viewers = Array.isArray(fields.suggestionBoxViewers) ? fields.suggestionBoxViewers : [];
  if ('missionText' in fields)          body.mission_text = fields.missionText ?? '';
  if ('gasOrderUrl' in fields)          body.gas_order_url = fields.gasOrderUrl || '';
  if ('orderSeedVersion' in fields)     body.order_seed_version = Number(fields.orderSeedVersion) || 0;
  if (Object.keys(body).length === 0) return;
  await requestSupabase('portal_config?id=eq.1', {
    method: 'PATCH',
    prefer: 'return=minimal',
    body,
  });
}

// ===== suggestion_box（目安箱） =====

const SUGGESTION_SELECT = 'id,content,created_by,is_anonymous,archived,admin_reply,replied_by,replied_at,created_at';

export async function fetchSuggestionsFromSupabase() {
  const rows = await requestSupabase(
    `suggestion_box?select=${encodeURIComponent(SUGGESTION_SELECT)}&order=created_at.desc`,
    { diagKey: 'supabase.suggestion_box', diagLabel: 'Supabase 目安箱', diagScope: 'suggestion_box' }
  );
  return Array.isArray(rows) ? rows.map(r => ({
    id: r.id,
    content: r.content || '',
    createdBy: r.created_by || 'anonymous',
    isAnonymous: !!r.is_anonymous,
    archived: !!r.archived,
    adminReply: r.admin_reply || '',
    repliedBy: r.replied_by || '',
    repliedAt: r.replied_at ? new Date(r.replied_at) : null,
    createdAt: r.created_at ? new Date(r.created_at) : null,
  })) : [];
}

export async function updateSuggestionInSupabase(id, fields = {}) {
  const body = {};
  if ('archived' in fields)   body.archived    = !!fields.archived;
  if ('adminReply' in fields) body.admin_reply = fields.adminReply ?? null;
  if ('repliedBy' in fields)  body.replied_by  = fields.repliedBy  ?? null;
  if ('repliedAt' in fields)  body.replied_at  = fields.repliedAt  ?? null;
  await requestSupabase(`suggestion_box?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body,
  });
}

export async function createSuggestionInSupabase(data) {
  const id = data.id || createSupabaseClientId('sug');
  await requestSupabase('suggestion_box', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id,
      content: data.content || '',
      created_by: data.createdBy || 'anonymous',
      is_anonymous: !!data.isAnonymous,
    },
  });
  return id;
}

export async function deleteSuggestionInSupabase(id) {
  await requestSupabase(`suggestion_box?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

// ========== 会社カレンダー ==========

export async function fetchCompanyCalSettingsFromSupabase() {
  const rows = await requestSupabase(
    'company_calendar_settings?id=eq.config&select=work_saturdays,planned_leave_saturdays,holiday_ranges,events',
    { diagKey: 'supabase.company_cal_settings', diagLabel: 'Supabase 会社カレンダー設定', diagScope: 'company_calendar_settings' }
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  const r = rows[0];
  return {
    workSaturdays: r.work_saturdays || [],
    plannedLeaveSaturdays: r.planned_leave_saturdays || [],
    holidayRanges: r.holiday_ranges || [],
    events: r.events || [],
  };
}

export async function saveCompanyCalSettingsToSupabase(fields = {}) {
  const body = { id: 'config' };
  if ('workSaturdays' in fields)         body.work_saturdays = fields.workSaturdays;
  if ('plannedLeaveSaturdays' in fields) body.planned_leave_saturdays = fields.plannedLeaveSaturdays;
  if ('holidayRanges' in fields)         body.holiday_ranges = fields.holidayRanges;
  if ('events' in fields)                body.events = fields.events;
  await requestSupabase('company_calendar_settings', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body,
  });
}

export async function fetchPublicAttendanceFromSupabase(ym) {
  const rows = await requestSupabase(
    `public_attendance_months?year_month=eq.${encodeURIComponent(ym)}&select=days`,
    { diagKey: 'supabase.public_attendance', diagLabel: 'Supabase 公開出席', diagScope: 'public_attendance_months' }
  );
  if (!Array.isArray(rows) || !rows.length) return {};
  return rows[0].days || {};
}

export async function writePublicAttendanceToSupabase(ym, day, username, type) {
  const rows = await requestSupabase(
    `public_attendance_months?year_month=eq.${encodeURIComponent(ym)}&select=days`,
    { diagKey: 'supabase.public_attendance.write', diagLabel: 'Supabase 公開出席書込', diagScope: 'public_attendance_months' }
  );
  const current = (Array.isArray(rows) && rows.length) ? (rows[0].days || {}) : {};
  const updated = { ...current, [day]: { ...(current[day] || {}), [username]: type } };
  await requestSupabase('public_attendance_months', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: { year_month: ym, days: updated },
  });
}

export async function removePublicAttendanceFromSupabase(ym, day, username) {
  const rows = await requestSupabase(
    `public_attendance_months?year_month=eq.${encodeURIComponent(ym)}&select=days`,
    { diagKey: 'supabase.public_attendance.remove', diagLabel: 'Supabase 公開出席削除', diagScope: 'public_attendance_months' }
  );
  if (!Array.isArray(rows) || !rows.length) return;
  const current = rows[0].days || {};
  const dayData = { ...(current[day] || {}) };
  delete dayData[username];
  const updated = { ...current };
  if (Object.keys(dayData).length === 0) {
    delete updated[day];
  } else {
    updated[day] = dayData;
  }
  await requestSupabase(`public_attendance_months?year_month=eq.${encodeURIComponent(ym)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { days: updated },
  });
}
