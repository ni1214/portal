import { state } from './state.js';
import { recordTransferFetch } from './read-diagnostics.js';
import { db, collection, collectionGroup, getDocs, query, where } from './config.js';

const BACKEND_FIREBASE = 'firebase';
const BACKEND_SUPABASE = 'supabase';
const SUPABASE_STORAGE_KEY = 'portal-supabase-v2';

// デフォルト資格情報 — 新規デバイス・新規ユーザーでも即座に Supabase を使う
const DEFAULT_SUPABASE_URL = 'https://ydcxgxzeavumvubrqmlq.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_TuZiMD49GBC9NMSf-tyWYA_NKq8430v';

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

function encodeArrayContainsFilter(values = []) {
  const items = (values || [])
    .filter(value => value != null && `${value}` !== '')
    .map(value => `"${`${value}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return encodeURIComponent(`{${items.join(',')}}`);
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

export function applySupabaseRuntimeConfig(config = {}) {
  state.dataBackendMode = BACKEND_SUPABASE; // モード選択廃止: 常にSupabase
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
  return state.supabaseConfigured; // モード選択廃止: URL+キー設定済みなら常に有効
}

export function createSupabaseClientId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function renderSupabaseAdminState(message = '') {
  const urlEl = document.getElementById('admin-supabase-url');
  const keyEl = document.getElementById('admin-supabase-key');
  const statusEl = document.getElementById('admin-supabase-status');
  const hintEl = document.getElementById('admin-supabase-hint');
  const previewEl = document.getElementById('admin-supabase-key-preview');

  if (urlEl && urlEl.value !== state.supabaseUrl) urlEl.value = state.supabaseUrl;
  if (keyEl && keyEl.value !== state.supabaseApiKey) keyEl.value = state.supabaseApiKey;

  if (statusEl) {
    statusEl.textContent = state.supabaseConfigured ? 'Supabase 有効' : 'Supabase 未設定';
    statusEl.classList.toggle('is-configured', state.supabaseConfigured);
  }

  if (hintEl) {
    hintEl.textContent = message || (state.supabaseConfigured
      ? 'Supabase に接続済みです。全データが Supabase を使用します。'
      : 'URL と APIキーを入力して保存してください。');
  }

  if (previewEl) {
    previewEl.textContent = maskApiKey(state.supabaseApiKey);
  }
}

export async function saveSupabaseRuntimeConfig({ url, apiKey }) {
  const nextUrl = normalizeUrl(url);
  const nextApiKey = normalizeApiKey(apiKey);

  validateRuntimeConfig(BACKEND_SUPABASE, nextUrl, nextApiKey);

  // localStorage に保存
  saveSupabaseConfigToStorage(nextUrl, nextApiKey, BACKEND_SUPABASE);

  return applySupabaseRuntimeConfig({
    dataBackendMode: BACKEND_SUPABASE,
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

// ========== 個人データ（プライベートセクション・カード・TODO・設定）==========

export function loadSupabaseConfigFromStorage() {
  try {
    const raw = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        supabaseUrl: parsed.url || DEFAULT_SUPABASE_URL,
        supabasePublishableKey: parsed.apiKey || DEFAULT_SUPABASE_KEY,
        dataBackendMode: BACKEND_SUPABASE,
      };
    }
  } catch (_) {}
  // localStorage 未設定でもデフォルト資格情報で Supabase を使う
  return {
    supabaseUrl: DEFAULT_SUPABASE_URL,
    supabasePublishableKey: DEFAULT_SUPABASE_KEY,
    dataBackendMode: BACKEND_SUPABASE,
  };
}

// --- マッピング関数 ---

function mapPrivateSectionRow(row = {}) {
  return {
    docId: String(row.id),
    id: String(row.id),
    label: row.label || '',
    icon: row.icon || 'fa-solid fa-star',
    colorIndex: Number.isFinite(row.color_index) ? row.color_index : 1,
    order: Number.isFinite(row.order_index) ? row.order_index : 0,
    isPrivate: true,
  };
}

function mapPrivateCardRow(row = {}) {
  return {
    id: String(row.id),
    label: row.label || '',
    icon: row.icon || 'fa-solid fa-link',
    url: row.url || '#',
    sectionId: row.section_id || null,
    parentId: row.parent_id || null,
    order: Number.isFinite(row.order_index) ? row.order_index : 0,
    isPrivate: true,
  };
}

function mapTodoRow(row = {}) {
  return {
    id: String(row.id),
    text: row.text || '',
    done: !!row.done,
    dueDate: row.due_date || null,
  };
}

// --- プライベートセクション ---

export async function fetchPrivateSectionsFromSupabase(username) {
  const encoded = encodeURIComponent(buildFilterValue(username));
  const rows = await requestSupabase(
    `private_sections?username=eq.${encoded}&select=id,label,icon,color_index,order_index&order=order_index.asc`,
    {
      diagKey: 'supabase.private_sections',
      diagLabel: 'Supabase マイセクション',
      diagScope: `private_sections/${username}`,
    }
  );
  return Array.isArray(rows) ? rows.map(mapPrivateSectionRow) : [];
}

export async function createPrivateSectionInSupabase(username, data) {
  const rows = await requestSupabase('private_sections', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      username,
      label: data.label || '',
      icon: data.icon || 'fa-solid fa-star',
      color_index: Number.isFinite(data.colorIndex) ? data.colorIndex : 1,
      order_index: Number.isFinite(data.order) ? data.order : 0,
    },
  });
  return Array.isArray(rows) && rows[0] ? String(rows[0].id) : null;
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

// --- プライベートカード ---

export async function fetchPrivateCardsFromSupabase(username) {
  const encoded = encodeURIComponent(buildFilterValue(username));
  const rows = await requestSupabase(
    `private_cards?username=eq.${encoded}&select=id,label,icon,url,section_id,parent_id,order_index&order=order_index.asc`,
    {
      diagKey: 'supabase.private_cards',
      diagLabel: 'Supabase マイカード',
      diagScope: `private_cards/${username}`,
    }
  );
  return Array.isArray(rows) ? rows.map(mapPrivateCardRow) : [];
}

export async function createPrivateCardInSupabase(username, data) {
  const rows = await requestSupabase('private_cards', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      username,
      label: data.label || '',
      icon: data.icon || 'fa-solid fa-link',
      url: data.url || '#',
      section_id: data.sectionId || null,
      parent_id: data.parentId || null,
      order_index: Number.isFinite(data.order) ? data.order : 0,
    },
  });
  return Array.isArray(rows) && rows[0] ? String(rows[0].id) : null;
}

export async function updatePrivateCardInSupabase(id, data) {
  const payload = {};
  if ('label' in data) payload.label = data.label || '';
  if ('icon' in data) payload.icon = data.icon || 'fa-solid fa-link';
  if ('url' in data) payload.url = data.url || '#';
  if ('sectionId' in data) payload.section_id = data.sectionId || null;
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

// --- 個人TODO ---

export async function fetchUserTodosFromSupabase(username) {
  const encoded = encodeURIComponent(buildFilterValue(username));
  const rows = await requestSupabase(
    `user_todos?username=eq.${encoded}&select=id,text,done,due_date&order=created_at.asc`,
    {
      diagKey: 'supabase.user_todos',
      diagLabel: 'Supabase 個人TODO',
      diagScope: `user_todos/${username}`,
    }
  );
  return Array.isArray(rows) ? rows.map(mapTodoRow) : [];
}

export async function createUserTodoInSupabase(username, data) {
  const rows = await requestSupabase('user_todos', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      username,
      text: data.text || '',
      done: !!data.done,
      due_date: data.dueDate || null,
    },
  });
  return Array.isArray(rows) && rows[0] ? String(rows[0].id) : null;
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

// ===== portal_config（管理設定） =====

const PORTAL_CONFIG_SELECT = 'pin_hash,gemini_api_key,departments,suggestion_box_viewers,mission_text,gas_order_url,order_seed_version';

export async function fetchPortalConfigFromSupabase() {
  const rows = await requestSupabase(
    `portal_config?id=eq.1&select=${encodeURIComponent(PORTAL_CONFIG_SELECT)}`,
    { diagKey: 'supabase.portal_config', diagLabel: 'Supabase 管理設定', diagScope: 'portal_config' }
  );
  if (!Array.isArray(rows) || !rows.length) return {};
  const r = rows[0];
  return {
    pinHash: r.pin_hash || null,
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

// --- 個人設定 ---

function mapPreferencesRow(row = {}) {
  const prefs = {};
  if (row.theme != null) prefs.theme = row.theme;
  if (row.font_size != null) prefs.fontSize = row.font_size;
  if (row.fav_only != null) prefs.favOnly = !!row.fav_only;
  if (Array.isArray(row.favorites)) prefs.favorites = row.favorites;
  if (Array.isArray(row.collapsed_sections)) prefs.collapsedSections = row.collapsed_sections;
  if (row.collapse_seeded != null) prefs.collapseSeeded = !!row.collapse_seeded;
  if (Array.isArray(row.hidden_cards)) prefs.hiddenCards = row.hidden_cards;
  if (row.mission_banner_hidden != null) prefs.missionBannerHidden = !!row.mission_banner_hidden;
  if (row.last_viewed_suggestions_at != null) prefs.lastViewedSuggestionsAt = row.last_viewed_suggestions_at;
  return prefs;
}

export async function fetchUserPreferencesFromSupabase(username) {
  const encoded = encodeURIComponent(buildFilterValue(username));
  const rows = await requestSupabase(
    `user_preferences?username=eq.${encoded}&select=theme,font_size,fav_only,favorites,collapsed_sections,collapse_seeded,hidden_cards,mission_banner_hidden,last_viewed_suggestions_at&limit=1`,
    {
      diagKey: 'supabase.user_preferences',
      diagLabel: 'Supabase 個人設定',
      diagScope: `user_preferences/${username}`,
    }
  );
  if (Array.isArray(rows) && rows[0]) return mapPreferencesRow(rows[0]);
  return null;
}

export async function saveUserPreferencesToSupabase(username, prefs = {}) {
  const payload = { username };
  if ('theme' in prefs) payload.theme = prefs.theme;
  if ('fontSize' in prefs) payload.font_size = prefs.fontSize;
  if ('favOnly' in prefs) payload.fav_only = !!prefs.favOnly;
  if ('favorites' in prefs) payload.favorites = prefs.favorites;
  if ('collapsedSections' in prefs) payload.collapsed_sections = prefs.collapsedSections;
  if ('collapseSeeded' in prefs) payload.collapse_seeded = !!prefs.collapseSeeded;
  if ('hiddenCards' in prefs) payload.hidden_cards = prefs.hiddenCards;
  if ('missionBannerHidden' in prefs) payload.mission_banner_hidden = !!prefs.missionBannerHidden;
  if ('lastViewedSuggestionsAt' in prefs) payload.last_viewed_suggestions_at = prefs.lastViewedSuggestionsAt;
  // Upsert: username が主キー（ON CONFLICT DO UPDATE）
  await requestSupabase('user_preferences', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: payload,
  });
}

// ===== 鋼材発注（order_suppliers / order_items / orders）=====

function isoToFirestoreTs(isoStr) {
  if (!isoStr) return null;
  const ms = Date.parse(isoStr);
  return Number.isFinite(ms) ? { seconds: Math.floor(ms / 1000), nanoseconds: 0 } : null;
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

export async function fetchOrdersFromSupabase(username, { includeDeleted = false } = {}) {
  const parts = [];
  if (username) parts.push(`ordered_by=eq.${encodeURIComponent(username)}`);
  if (!includeDeleted) parts.push('deleted_at=is.null');
  const filterStr = parts.length ? parts.join('&') + '&' : '';
  const rows = await requestSupabase(
    `orders?${filterStr}select=${encodeURIComponent(ORDER_SELECT)}&order=ordered_at.desc`,
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

// ==================== ヘルパー関数 ====================

/** ISO 日時文字列を Firebase Timestamp 互換オブジェクトに変換 */
function toTimestamp(isoStr) {
  if (!isoStr) return null;
  const ms = new Date(isoStr).getTime();
  if (isNaN(ms)) return null;
  return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6, toDate: () => new Date(ms) };
}

async function callRpc(funcName, body = {}) {
  return requestSupabase(`rpc/${funcName}`, { method: 'POST', body });
}

// ==================== ユーザー認証 ====================

export async function checkUserExistsInSupabase(username) {
  const rows = await requestSupabase(
    `user_accounts?username=eq.${encodeURIComponent(username)}&select=username&limit=1`
  );
  return Array.isArray(rows) && rows.length > 0;
}

export async function registerUserLoginInSupabase(username) {
  await requestSupabase('user_accounts', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: { username, last_login_at: new Date().toISOString() },
  });
}

export async function getUserLockPinFromSupabase(username) {
  const rows = await requestSupabase(
    `user_lock_pins?username=eq.${encodeURIComponent(username)}&select=enabled,hash,auto_lock_minutes&limit=1`
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  return { enabled: !!r.enabled, hash: r.hash || null, autoLockMinutes: r.auto_lock_minutes ?? 5 };
}

export async function saveLockPinToSupabase(username, { enabled, hash, autoLockMinutes = 5 }) {
  await requestSupabase('user_lock_pins', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: { username, enabled: !!enabled, hash: hash || null, auto_lock_minutes: autoLockMinutes },
  });
}

export async function fetchAllUserAccountsFromSupabase() {
  const rows = await requestSupabase('user_accounts?select=username,last_login_at&order=username.asc');
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({ username: r.username, lastLoginAt: r.last_login_at || null }));
}

export async function deleteUserFromSupabase(username) {
  await requestSupabase(`user_accounts?username=eq.${encodeURIComponent(username)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

export async function migrateUsernameInSupabase(oldName, newName) {
  // 1. 新しいユーザーを作成（既存なら merge）
  await requestSupabase('user_accounts', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: { username: newName, last_login_at: new Date().toISOString() },
  });
  // 2. 旧ユーザーの各テーブルデータを新名にコピーしてから削除
  const copyTables = [
    'user_preferences', 'user_lock_pins', 'user_profiles', 'user_section_orders',
    'private_sections', 'private_cards', 'user_todos', 'user_email_contacts',
    'user_drive_links', 'user_drive_contacts', 'user_notice_reads', 'user_chat_reads',
  ];
  for (const tbl of copyTables) {
    try {
      const rows = await requestSupabase(`${tbl}?username=eq.${encodeURIComponent(oldName)}&select=*`);
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const newRows = rows.map(r => ({ ...r, username: newName }));
      await requestSupabase(tbl, { method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates', body: newRows });
      await requestSupabase(`${tbl}?username=eq.${encodeURIComponent(oldName)}`, { method: 'DELETE', prefer: 'return=minimal' });
    } catch (_) {}
  }
  // 3. assigned_tasks の参照を更新（PATCH は配列フィルタがないため行単位で）
  try {
    const tasks = await requestSupabase(
      `assigned_tasks?or=(assigned_to.eq.${encodeURIComponent(oldName)},assigned_by.eq.${encodeURIComponent(oldName)})`
    );
    if (Array.isArray(tasks)) {
      for (const t of tasks) {
        const patch = {};
        if (t.assigned_to === oldName) patch.assigned_to = newName;
        if (t.assigned_by === oldName) patch.assigned_by = newName;
        if (Object.keys(patch).length > 0) {
          await requestSupabase(`assigned_tasks?id=eq.${encodeURIComponent(t.id)}`, {
            method: 'PATCH', prefer: 'return=minimal', body: patch,
          });
        }
      }
    }
  } catch (_) {}
  // 4. 旧アカウント削除（cascade で関連データも削除）
  await requestSupabase(`user_accounts?username=eq.${encodeURIComponent(oldName)}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

// ==================== お知らせ ====================

function mapNoticeRow(row = {}) {
  return {
    id: row.id,
    title: row.title || '',
    body: row.body || '',
    priority: row.priority || 'normal',
    targetScope: row.target_scope || 'all',
    targetDepartments: Array.isArray(row.target_departments) ? row.target_departments : [],
    requireAcknowledgement: !!row.require_acknowledgement,
    acknowledgedBy: Array.isArray(row.acknowledged_by) ? row.acknowledged_by : [],
    createdBy: row.created_by || '',
    createdAt: toTimestamp(row.created_at),
  };
}

export async function fetchNoticesFromSupabase() {
  const rows = await requestSupabase('notices?select=*&order=created_at.desc', {
    diagKey: 'notice.list', diagLabel: 'お知らせ一覧', diagScope: 'notices',
  });
  return Array.isArray(rows) ? rows.map(mapNoticeRow) : [];
}

export async function createNoticeInSupabase(data) {
  const id = createSupabaseClientId('notice');
  await requestSupabase('notices', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id,
      title: data.title || '',
      body: data.body || '',
      priority: data.priority || 'normal',
      target_scope: data.targetScope || 'all',
      target_departments: Array.isArray(data.targetDepartments) ? data.targetDepartments : [],
      require_acknowledgement: !!data.requireAcknowledgement,
      acknowledged_by: [],
      created_by: data.createdBy || '',
    },
  });
  return id;
}

export async function updateNoticeInSupabase(id, data) {
  const payload = {};
  if ('title' in data) payload.title = data.title || '';
  if ('body' in data) payload.body = data.body || '';
  if ('priority' in data) payload.priority = data.priority || 'normal';
  if ('targetScope' in data) payload.target_scope = data.targetScope || 'all';
  if ('targetDepartments' in data) payload.target_departments = Array.isArray(data.targetDepartments) ? data.targetDepartments : [];
  if ('requireAcknowledgement' in data) payload.require_acknowledgement = !!data.requireAcknowledgement;
  if ('acknowledgedBy' in data) payload.acknowledged_by = Array.isArray(data.acknowledgedBy) ? data.acknowledgedBy : [];
  await requestSupabase(`notices?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: payload,
  });
}

export async function deleteNoticeInSupabase(id) {
  await requestSupabase(`notices?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

export async function acknowledgeNoticeInSupabase(noticeId, acknowledgedByArray) {
  await requestSupabase(`notices?id=eq.${encodeURIComponent(noticeId)}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: { acknowledged_by: Array.isArray(acknowledgedByArray) ? acknowledgedByArray : [] },
  });
}

export async function fetchReadNoticeIdsFromSupabase(username) {
  const rows = await requestSupabase(
    `user_notice_reads?username=eq.${encodeURIComponent(username)}&select=notice_id`
  );
  if (!Array.isArray(rows)) return new Set();
  return new Set(rows.map(r => r.notice_id));
}

export async function markNoticesReadInSupabase(username, noticeIds) {
  if (!noticeIds || noticeIds.length === 0) return;
  const now = new Date().toISOString();
  const body = noticeIds.map(id => ({ username, notice_id: id, read_at: now }));
  await requestSupabase('user_notice_reads', {
    method: 'POST', prefer: 'return=minimal,resolution=ignore-duplicates', body,
  });
}

export async function fetchNoticeReactionsFromSupabase() {
  const rows = await requestSupabase('notice_reactions?select=notice_id,emoji,username');
  if (!Array.isArray(rows)) return {};
  const map = {};
  rows.forEach(r => {
    if (!map[r.notice_id]) map[r.notice_id] = {};
    if (!map[r.notice_id][r.emoji]) map[r.notice_id][r.emoji] = [];
    map[r.notice_id][r.emoji].push(r.username);
  });
  return map;
}

export async function addNoticeReactionInSupabase(noticeId, emoji, username) {
  await requestSupabase('notice_reactions', {
    method: 'POST', prefer: 'return=minimal,resolution=ignore-duplicates',
    body: { notice_id: noticeId, emoji, username },
  });
}

export async function removeNoticeReactionInSupabase(noticeId, emoji, username) {
  await requestSupabase(
    `notice_reactions?notice_id=eq.${encodeURIComponent(noticeId)}&emoji=eq.${encodeURIComponent(emoji)}&username=eq.${encodeURIComponent(username)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  );
}

// ==================== タスク ====================

function mapTaskRow(row = {}) {
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    assignedBy: row.assigned_by || '',
    assignedTo: row.assigned_to || '',
    status: row.status || 'pending',
    dueDate: row.due_date || '',
    projectKey: row.project_key || '',
    sourceType: row.source_type || 'manual',
    sourceRequestId: row.source_request_id || null,
    sourceRequestFromDept: row.source_request_from_dept || null,
    sourceRequestToDept: row.source_request_to_dept || null,
    notifiedDone: !!row.notified_done,
    sharedWith: Array.isArray(row.shared_with) ? row.shared_with : [],
    sharedResponses: (row.shared_responses && typeof row.shared_responses === 'object') ? row.shared_responses : {},
    acceptedAt: toTimestamp(row.accepted_at),
    doneAt: toTimestamp(row.done_at),
    createdAt: toTimestamp(row.created_at),
  };
}

export async function fetchReceivedTasksFromSupabase(username) {
  const rows = await requestSupabase(
    `assigned_tasks?assigned_to=eq.${encodeURIComponent(username)}&status=in.(pending,accepted,done)&order=created_at.desc&limit=100`,
    { diagKey: 'task.received', diagLabel: '受け取ったタスク', diagScope: username }
  );
  return Array.isArray(rows) ? rows.map(mapTaskRow) : [];
}

export async function fetchSentTasksFromSupabase(username) {
  const rows = await requestSupabase(
    `assigned_tasks?assigned_by=eq.${encodeURIComponent(username)}&status=in.(pending,accepted,done)&order=created_at.desc&limit=100`,
    { diagKey: 'task.sent', diagLabel: '依頼したタスク', diagScope: username }
  );
  return Array.isArray(rows) ? rows.map(mapTaskRow) : [];
}

export async function fetchSharedTasksFromSupabase(username) {
  const encoded = encodeArrayContainsFilter([username]);
  const rows = await requestSupabase(
    `assigned_tasks?shared_with=cs.${encoded}&status=in.(pending,accepted,done)&order=created_at.desc&limit=100`,
    { diagKey: 'task.shared', diagLabel: '共有されたタスク', diagScope: username }
  );
  return Array.isArray(rows) ? rows.map(mapTaskRow) : [];
}

export async function fetchTaskHistoryFromSupabase(tab, username) {
  let filter = '';
  if (tab === 'received') filter = `assigned_to=eq.${encodeURIComponent(username)}&status=in.(done,cancelled)`;
  else if (tab === 'sent')   filter = `assigned_by=eq.${encodeURIComponent(username)}&status=in.(done,cancelled)`;
  else {
    const encoded = encodeArrayContainsFilter([username]);
    filter = `shared_with=cs.${encoded}&status=in.(done,cancelled)`;
  }
  const rows = await requestSupabase(
    `assigned_tasks?${filter}&order=created_at.desc&limit=200`,
    { diagKey: `task.history.${tab}`, diagLabel: `タスク履歴:${tab}`, diagScope: username }
  );
  return Array.isArray(rows) ? rows.map(mapTaskRow) : [];
}

export async function fetchSentDoneNotifyTasksFromSupabase(username) {
  const rows = await requestSupabase(
    `assigned_tasks?assigned_by=eq.${encodeURIComponent(username)}&status=eq.done&notified_done=eq.false&order=done_at.desc&limit=50`
  );
  return Array.isArray(rows) ? rows.map(mapTaskRow) : [];
}

export async function getAssignedTaskFromSupabase(id) {
  const rows = await requestSupabase(`assigned_tasks?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return mapTaskRow(rows[0]);
}

export async function createAssignedTaskInSupabase(data) {
  const id = createSupabaseClientId('task');
  const now = new Date().toISOString();
  await requestSupabase('assigned_tasks', {
    method: 'POST', prefer: 'return=minimal',
    body: {
      id,
      title: data.title || '',
      description: data.description || '',
      assigned_by: data.assignedBy || '',
      assigned_to: data.assignedTo || '',
      status: data.status || 'pending',
      due_date: data.dueDate || '',
      project_key: data.projectKey || '',
      source_type: data.sourceType || 'manual',
      source_request_id: data.sourceRequestId || null,
      source_request_from_dept: data.sourceRequestFromDept || null,
      source_request_to_dept: data.sourceRequestToDept || null,
      notified_done: false,
      shared_with: Array.isArray(data.sharedWith) ? data.sharedWith : [],
      shared_responses: (data.sharedResponses && typeof data.sharedResponses === 'object') ? data.sharedResponses : {},
      created_at: now,
    },
  });
  return id;
}

export async function updateAssignedTaskInSupabase(id, data) {
  const payload = {};
  if ('title' in data)         payload.title          = data.title || '';
  if ('description' in data)   payload.description    = data.description || '';
  if ('status' in data)        payload.status         = data.status;
  if ('dueDate' in data)       payload.due_date       = data.dueDate || '';
  if ('projectKey' in data)    payload.project_key    = data.projectKey || '';
  if ('notifiedDone' in data)  payload.notified_done  = !!data.notifiedDone;
  if ('sharedWith' in data)    payload.shared_with    = Array.isArray(data.sharedWith) ? data.sharedWith : [];
  if ('sharedResponses' in data) payload.shared_responses = (data.sharedResponses && typeof data.sharedResponses === 'object') ? data.sharedResponses : {};
  if ('acceptedAt' in data)    payload.accepted_at    = data.acceptedAt || null;
  if ('doneAt' in data)        payload.done_at        = data.doneAt || null;
  if ('sourceRequestId' in data)         payload.source_request_id          = data.sourceRequestId || null;
  if ('linkedTaskStatus' in data)        payload.linked_task_status         = data.linkedTaskStatus || null;
  if ('linkedTaskAssignedTo' in data)    payload.linked_task_assigned_to    = data.linkedTaskAssignedTo || null;
  if ('linkedTaskLinkedBy' in data)      payload.linked_task_linked_by      = data.linkedTaskLinkedBy || null;
  if ('linkedTaskLinkedAt' in data)      payload.linked_task_linked_at      = data.linkedTaskLinkedAt || null;
  if ('linkedTaskClosedAt' in data)      payload.linked_task_closed_at      = data.linkedTaskClosedAt || null;
  await requestSupabase(`assigned_tasks?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: payload,
  });
}

export async function deleteAssignedTaskInSupabase(id) {
  await requestSupabase(`assigned_tasks?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

export async function fetchTaskCommentsFromSupabase(taskId) {
  const rows = await requestSupabase(
    `task_comments?task_id=eq.${encodeURIComponent(taskId)}&select=*&order=created_at.asc`
  );
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    id: r.id,
    taskId: r.task_id,
    username: r.username || '',
    body: r.body || '',
    createdAt: toTimestamp(r.created_at),
  }));
}

export async function addTaskCommentInSupabase(data) {
  await requestSupabase('task_comments', {
    method: 'POST', prefer: 'return=minimal',
    body: { task_id: data.taskId, username: data.username || '', body: data.body || '' },
  });
}

export async function deleteTaskCommentInSupabase(id) {
  await requestSupabase(`task_comments?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

export async function fetchTasksByProjectKeyFromSupabase(projectKey) {
  const rows = await requestSupabase(
    `assigned_tasks?project_key=eq.${encodeURIComponent(projectKey)}&order=created_at.desc&limit=200`
  );
  return Array.isArray(rows) ? rows.map(mapTaskRow) : [];
}

// ==================== チャット ====================

function mapChatRoomRow(row = {}) {
  return {
    id: row.id,
    type: row.type || 'dm',
    name: row.name || '',
    members: Array.isArray(row.members) ? row.members : [],
    createdBy: row.created_by || '',
    lastMessage: row.last_message || '',
    lastAt: row.last_at || null,
    lastSender: row.last_sender || '',
    createdAt: toTimestamp(row.created_at),
  };
}

export async function fetchChatRoomsFromSupabase(username, type = null) {
  const encoded = encodeArrayContainsFilter([username]);
  let path = `chat_rooms?members=cs.${encoded}&order=last_at.desc.nullslast&limit=100`;
  if (type) path += `&type=eq.${encodeURIComponent(type)}`;
  const rows = await requestSupabase(path, {
    diagKey: `chat.rooms.${type || 'all'}`, diagLabel: 'チャットルーム', diagScope: username,
  });
  return Array.isArray(rows) ? rows.map(mapChatRoomRow) : [];
}

export async function getChatRoomFromSupabase(roomId) {
  const rows = await requestSupabase(`chat_rooms?id=eq.${encodeURIComponent(roomId)}&select=*&limit=1`);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return mapChatRoomRow(rows[0]);
}

export async function upsertDmRoomInSupabase(roomId, data) {
  await requestSupabase('chat_rooms', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
    body: {
      id: roomId,
      type: 'dm',
      name: data.name || '',
      members: Array.isArray(data.members) ? data.members : [],
      created_by: data.createdBy || '',
      last_message: data.lastMessage || '',
      last_at: data.lastAt || null,
      last_sender: data.lastSender || '',
    },
  });
}

export async function ensureDmMembersInSupabase(roomId, members) {
  const room = await getChatRoomFromSupabase(roomId);
  if (!room) return;
  const current = room.members || [];
  const missing = members.filter(m => !current.includes(m));
  if (missing.length === 0) return;
  const newMembers = [...new Set([...current, ...missing])];
  await requestSupabase(`chat_rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: { members: newMembers },
  });
}

export async function createGroupRoomInSupabase(data) {
  const id = data.id || createSupabaseClientId('room');
  await requestSupabase('chat_rooms', {
    method: 'POST', prefer: 'return=minimal',
    body: {
      id,
      type: 'group',
      name: data.name || '',
      members: Array.isArray(data.members) ? data.members : [],
      created_by: data.createdBy || '',
      last_message: '',
      last_at: null,
      last_sender: '',
    },
  });
  return id;
}

export async function updateChatRoomLastInSupabase(roomId, data) {
  const payload = {};
  if ('lastMessage' in data) payload.last_message = data.lastMessage || '';
  if ('lastAt' in data)      payload.last_at      = data.lastAt || null;
  if ('lastSender' in data)  payload.last_sender  = data.lastSender || '';
  if ('name' in data)        payload.name         = data.name || '';
  if ('members' in data)     payload.members      = Array.isArray(data.members) ? data.members : [];
  await requestSupabase(`chat_rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: payload,
  });
}

export async function removeSelfFromDmRoomInSupabase(roomId, username, currentMembers) {
  const newMembers = (currentMembers || []).filter(m => m !== username);
  await requestSupabase(`chat_rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: { members: newMembers },
  });
}

export async function fetchChatMessagesFromSupabase(roomId, msgLimit = 200) {
  const rows = await requestSupabase(
    `chat_messages?room_id=eq.${encodeURIComponent(roomId)}&select=*&order=created_at.desc&limit=${msgLimit}`,
    { diagKey: 'chat.messages', diagLabel: 'チャットメッセージ', diagScope: roomId }
  );
  if (!Array.isArray(rows)) return [];
  return rows.reverse().map(r => ({
    id: r.id,
    roomId: r.room_id,
    username: r.username || '',
    text: r.text || '',
    createdAt: toTimestamp(r.created_at),
  }));
}

export async function addChatMessageInSupabase(data) {
  const result = await requestSupabase('chat_messages', {
    method: 'POST', prefer: 'return=representation',
    body: { room_id: data.roomId, username: data.username || '', text: data.text || '' },
  });
  if (Array.isArray(result) && result[0]) return result[0].id;
  return null;
}

export async function deleteChatMessageInSupabase(id) {
  await requestSupabase(`chat_messages?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

export async function deleteOldestChatMessageInSupabase(roomId) {
  // 最古のメッセージを1件取得して削除
  const rows = await requestSupabase(
    `chat_messages?room_id=eq.${encodeURIComponent(roomId)}&select=id&order=created_at.asc&limit=1`
  );
  if (Array.isArray(rows) && rows.length > 0) {
    await requestSupabase(`chat_messages?id=eq.${encodeURIComponent(rows[0].id)}`, {
      method: 'DELETE', prefer: 'return=minimal',
    });
  }
}

export async function fetchChatReadTimesFromSupabase(username) {
  const rows = await requestSupabase(
    `user_chat_reads?username=eq.${encodeURIComponent(username)}&select=room_key,read_at`
  );
  if (!Array.isArray(rows)) return {};
  const map = {};
  rows.forEach(r => { map[r.room_key] = r.read_at; });
  return map;
}

export async function markChatRoomReadInSupabase(username, roomKey) {
  await requestSupabase('user_chat_reads', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
    body: { username, room_key: roomKey, read_at: new Date().toISOString() },
  });
}

// ==================== 勤怠 ====================

function mapAttendanceRow(row = {}) {
  return {
    id: `${row.username}_${row.entry_date}`,
    username: row.username || '',
    date: row.entry_date || '',
    dateStr: row.entry_date || '',
    type: row.type || null,
    hayade: row.hayade || null,
    zangyo: row.zangyo || null,
    note: row.note || null,
    workSiteHours: (row.work_site_hours && typeof row.work_site_hours === 'object') ? row.work_site_hours : {},
    projectKeys: Array.isArray(row.project_keys) ? row.project_keys : [],
    yearMonth: row.year_month || '',
    updatedAt: toTimestamp(row.updated_at),
  };
}

function mapLegacyAttendanceDoc(username, dateStr, data = {}) {
  return {
    id: `${username}_${dateStr}`,
    username: username || '',
    date: dateStr || '',
    dateStr: dateStr || '',
    type: data.type || null,
    hayade: data.hayade || null,
    zangyo: data.zangyo || null,
    note: data.note || null,
    workSiteHours: (data.workSiteHours && typeof data.workSiteHours === 'object') ? data.workSiteHours : {},
    projectKeys: Array.isArray(data.projectKeys) ? data.projectKeys : [],
    yearMonth: data.yearMonth || (dateStr ? dateStr.slice(0, 7) : ''),
    updatedAt: data.updatedAt || null,
  };
}

function mergeAttendanceEntries(primaryRows = [], legacyRows = []) {
  const byKey = new Map();
  for (const entry of legacyRows) {
    if (!entry?.username || !entry?.date) continue;
    byKey.set(`${entry.username}__${entry.date}`, entry);
  }
  for (const entry of primaryRows) {
    if (!entry?.username || !entry?.date) continue;
    byKey.set(`${entry.username}__${entry.date}`, entry);
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.username !== b.username) return a.username.localeCompare(b.username);
    return a.date.localeCompare(b.date);
  });
}

function normalizeYearMonths(yearMonths) {
  const list = Array.isArray(yearMonths) ? yearMonths : [yearMonths];
  return [...new Set(list.filter(Boolean))];
}

async function fetchLegacyAttendanceEntriesFromFirebase(username, yearMonths) {
  const yms = normalizeYearMonths(yearMonths);
  if (!username || !yms.length) return [];

  const snaps = await Promise.all(
    yms.map(ym =>
      getDocs(
        query(
          collection(db, 'users', username, 'attendance'),
          where('yearMonth', '==', ym)
        )
      )
    )
  );

  const rows = [];
  snaps.forEach(snap => {
    snap.docs.forEach(docSnap => {
      rows.push(mapLegacyAttendanceDoc(username, docSnap.id, docSnap.data()));
    });
  });
  return rows;
}

async function fetchLegacyAttendanceSummaryFromFirebase(yearMonths) {
  const yms = normalizeYearMonths(yearMonths);
  if (!yms.length) return [];

  const rows = [];
  const chunkSize = 10;
  for (let i = 0; i < yms.length; i += chunkSize) {
    const chunk = yms.slice(i, i + chunkSize);
    const snap = await getDocs(
      query(
        collectionGroup(db, 'attendance'),
        where('yearMonth', 'in', chunk)
      )
    );
    snap.docs.forEach(docSnap => {
      const username = docSnap.ref.parent?.parent?.id || '';
      if (!username) return;
      rows.push(mapLegacyAttendanceDoc(username, docSnap.id, docSnap.data()));
    });
  }
  return rows;
}

async function backfillLegacyAttendanceEntriesToSupabase(username, supabaseRows = [], legacyRows = []) {
  const supabaseKeys = new Set(
    (supabaseRows || [])
      .map(entry => entry?.date)
      .filter(Boolean)
  );
  const missingRows = (legacyRows || []).filter(entry => entry?.date && !supabaseKeys.has(entry.date));
  if (!username || !missingRows.length) return;

  await Promise.allSettled(
    missingRows.map(entry =>
      upsertAttendanceEntryInSupabase(username, entry.date, {
        type: entry.type,
        hayade: entry.hayade,
        zangyo: entry.zangyo,
        note: entry.note,
        workSiteHours: entry.workSiteHours,
        projectKeys: entry.projectKeys,
        yearMonth: entry.yearMonth,
      })
    )
  );
}

export async function fetchAttendanceEntriesFromSupabase(username, yearMonths) {
  const yms = normalizeYearMonths(yearMonths);
  if (!username || !yms.length) return [];

  const encoded = encodeURIComponent(encodeInFilter(yms));
  const rows = await requestSupabase(
    `attendance_entries?username=eq.${encodeURIComponent(username)}&year_month=in.${encoded}&order=entry_date.asc`,
    { diagKey: 'attendance.entries', diagLabel: '勤怠', diagScope: username }
  );
  const supabaseRows = Array.isArray(rows) ? rows.map(mapAttendanceRow) : [];

  let legacyRows = [];
  try {
    legacyRows = await fetchLegacyAttendanceEntriesFromFirebase(username, yms);
  } catch (_) {}

  if (legacyRows.length) {
    await backfillLegacyAttendanceEntriesToSupabase(username, supabaseRows, legacyRows);
  }

  return mergeAttendanceEntries(supabaseRows, legacyRows);
}

export async function upsertAttendanceEntryInSupabase(username, date, data) {
  const yearMonth = date.slice(0, 7);
  await requestSupabase('attendance_entries', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
    body: {
      username,
      entry_date: date,
      type: data.type || null,
      hayade: data.hayade || null,
      zangyo: data.zangyo || null,
      note: data.note || null,
      work_site_hours: (data.workSiteHours && typeof data.workSiteHours === 'object') ? data.workSiteHours : {},
      project_keys: Array.isArray(data.projectKeys) ? data.projectKeys : [],
      year_month: yearMonth,
    },
  });
}

export async function deleteAttendanceEntryInSupabase(username, date) {
  await requestSupabase(
    `attendance_entries?username=eq.${encodeURIComponent(username)}&entry_date=eq.${encodeURIComponent(date)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  );
}

export async function fetchAttendanceSitesFromSupabase() {
  const rows = await requestSupabase(
    'attendance_sites?active=eq.true&order=sort_order.asc,code.asc',
    { diagKey: 'attendance.sites', diagLabel: '現場マスタ', diagScope: 'attendance_sites' }
  );
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    id: r.id, code: r.code || '', name: r.name || '',
    sortOrder: r.sort_order || 0, active: !!r.active, updatedBy: r.updated_by || '',
  }));
}

export async function createAttendanceSiteInSupabase(data) {
  const id = createSupabaseClientId('site');
  await requestSupabase('attendance_sites', {
    method: 'POST', prefer: 'return=minimal',
    body: {
      id, code: data.code || '', name: data.name || '',
      sort_order: data.sortOrder || 0, active: true, updated_by: data.updatedBy || '',
    },
  });
  return id;
}

export async function updateAttendanceSiteInSupabase(id, data) {
  const payload = {};
  if ('code' in data)      payload.code       = data.code || '';
  if ('name' in data)      payload.name       = data.name || '';
  if ('sortOrder' in data) payload.sort_order = data.sortOrder || 0;
  if ('active' in data)    payload.active     = !!data.active;
  if ('updatedBy' in data) payload.updated_by = data.updatedBy || '';
  await requestSupabase(`attendance_sites?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: payload,
  });
}

export async function deleteAttendanceSiteInSupabase(id) {
  await requestSupabase(`attendance_sites?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: { active: false },
  });
}

export async function fetchMultipleMonthsAttendanceSummaryFromSupabase(yearMonths) {
  const yms = normalizeYearMonths(yearMonths);
  if (!yms.length) return [];

  const encoded = encodeURIComponent(encodeInFilter(yms));
  const rows = await requestSupabase(
    `attendance_entries?year_month=in.${encoded}&order=entry_date.asc`,
    { diagKey: 'attendance.summary', diagLabel: '勤怠集計', diagScope: yms.join(',') }
  );
  const supabaseRows = Array.isArray(rows) ? rows.map(mapAttendanceRow) : [];

  let legacyRows = [];
  try {
    legacyRows = await fetchLegacyAttendanceSummaryFromFirebase(yms);
  } catch (_) {}

  return mergeAttendanceEntries(supabaseRows, legacyRows);
}

export async function cleanupOldAttendanceInSupabase(username, cutoffDate) {
  await requestSupabase(
    `attendance_entries?username=eq.${encodeURIComponent(username)}&entry_date=lt.${encodeURIComponent(cutoffDate)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  );
}

export async function fetchAttendanceByProjectKeyFromSupabase(projectKey) {
  const encoded = encodeArrayContainsFilter([projectKey]);
  const rows = await requestSupabase(
    `attendance_entries?project_keys=cs.${encoded}&select=*&order=entry_date.desc&limit=500`
  );
  return Array.isArray(rows) ? rows.map(mapAttendanceRow) : [];
}

// ==================== 会社カレンダー ====================

export async function fetchCompanyCalSettingsFromSupabase() {
  const rows = await requestSupabase(
    'company_calendar_settings?order=updated_at.desc&limit=1',
    { diagKey: 'cal.settings', diagLabel: '会社カレンダー設定', diagScope: 'company_calendar_settings' }
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    workSaturdays: Array.isArray(r.work_saturdays) ? r.work_saturdays : [],
    plannedLeaveSaturdays: Array.isArray(r.planned_leave_saturdays) ? r.planned_leave_saturdays : [],
    holidayRanges: Array.isArray(r.holiday_ranges) ? r.holiday_ranges : [],
    events: Array.isArray(r.events) ? r.events : [],
  };
}

export async function saveCompanyCalSettingsToSupabase(data) {
  const id = data.id || 'default';
  await requestSupabase('company_calendar_settings', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
    body: {
      id,
      work_saturdays: Array.isArray(data.workSaturdays) ? data.workSaturdays : [],
      planned_leave_saturdays: Array.isArray(data.plannedLeaveSaturdays) ? data.plannedLeaveSaturdays : [],
      holiday_ranges: Array.isArray(data.holidayRanges) ? data.holidayRanges : [],
      events: Array.isArray(data.events) ? data.events : [],
    },
  });
}

export async function fetchPublicAttendanceFromSupabase(yearMonth) {
  const rows = await requestSupabase(
    `public_attendance_months?year_month=eq.${encodeURIComponent(yearMonth)}&select=year_month,days&limit=1`
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { yearMonth: rows[0].year_month, days: rows[0].days || {} };
}

export async function writePublicAttendanceToSupabase(username, yearMonth, dayData) {
  // 既存データをマージして保存
  const existing = await fetchPublicAttendanceFromSupabase(yearMonth);
  const days = (existing?.days) || {};
  days[username] = dayData;
  await requestSupabase('public_attendance_months', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
    body: { year_month: yearMonth, days },
  });
}

export async function removePublicAttendanceFromSupabase(username, yearMonth) {
  const existing = await fetchPublicAttendanceFromSupabase(yearMonth);
  if (!existing) return;
  const days = { ...(existing.days || {}) };
  delete days[username];
  await requestSupabase('public_attendance_months', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
    body: { year_month: yearMonth, days },
  });
}

// ==================== 部門間依頼 ====================

function mapRequestRow(row = {}) {
  return {
    id: row.id,
    title: row.title || '',
    projectKey: row.project_key || '',
    toDept: row.to_dept || '',
    fromDept: row.from_dept || '',
    content: row.content || '',
    proposal: row.proposal || '',
    remarks: row.remarks || '',
    status: row.status || 'submitted',
    createdBy: row.created_by || '',
    statusNote: row.status_note || '',
    statusUpdatedBy: row.status_updated_by || '',
    archived: !!row.archived,
    notifyCreator: !!row.notify_creator,
    linkedTaskId: row.linked_task_id || null,
    linkedTaskStatus: row.linked_task_status || null,
    linkedTaskAssignedTo: row.linked_task_assigned_to || null,
    linkedTaskLinkedBy: row.linked_task_linked_by || null,
    linkedTaskLinkedAt: toTimestamp(row.linked_task_linked_at),
    linkedTaskClosedAt: toTimestamp(row.linked_task_closed_at),
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
  };
}

export async function fetchReceivedRequestsFromSupabase(myDept) {
  if (!myDept) return [];
  const rows = await requestSupabase(
    `cross_dept_requests?to_dept=eq.${encodeURIComponent(myDept)}&archived=eq.false&order=created_at.desc&limit=200`,
    { diagKey: 'req.received', diagLabel: '受け取った依頼', diagScope: myDept }
  );
  return Array.isArray(rows) ? rows.map(mapRequestRow) : [];
}

export async function fetchSentRequestsFromSupabase(username) {
  const rows = await requestSupabase(
    `cross_dept_requests?created_by=eq.${encodeURIComponent(username)}&archived=eq.false&order=created_at.desc&limit=200`,
    { diagKey: 'req.sent', diagLabel: '送った依頼', diagScope: username }
  );
  return Array.isArray(rows) ? rows.map(mapRequestRow) : [];
}

export async function fetchRequestHistoryFromSupabase(side, { myDept, username }) {
  let filter = '';
  if (side === 'received' && myDept) filter = `to_dept=eq.${encodeURIComponent(myDept)}`;
  else filter = `created_by=eq.${encodeURIComponent(username || '')}`;
  const rows = await requestSupabase(
    `cross_dept_requests?${filter}&order=created_at.desc&limit=300`,
    { diagKey: `req.history.${side}`, diagLabel: `依頼履歴:${side}`, diagScope: myDept || username }
  );
  return Array.isArray(rows) ? rows.map(mapRequestRow) : [];
}

export async function createCrossDeptRequestInSupabase(data) {
  const id = createSupabaseClientId('req');
  await requestSupabase('cross_dept_requests', {
    method: 'POST', prefer: 'return=minimal',
    body: {
      id,
      title: data.title || '',
      project_key: data.projectKey || '',
      to_dept: data.toDept || '',
      from_dept: data.fromDept || '',
      content: data.content || '',
      proposal: data.proposal || '',
      remarks: data.remarks || '',
      status: data.status || 'submitted',
      created_by: data.createdBy || '',
    },
  });
  return id;
}

export async function updateCrossDeptRequestInSupabase(id, data) {
  const payload = {};
  if ('status' in data)             payload.status               = data.status;
  if ('statusNote' in data)         payload.status_note          = data.statusNote || '';
  if ('statusUpdatedBy' in data)    payload.status_updated_by    = data.statusUpdatedBy || '';
  if ('archived' in data)           payload.archived             = !!data.archived;
  if ('notifyCreator' in data)      payload.notify_creator       = !!data.notifyCreator;
  if ('linkedTaskId' in data)       payload.linked_task_id       = data.linkedTaskId || null;
  if ('linkedTaskStatus' in data)   payload.linked_task_status   = data.linkedTaskStatus || null;
  if ('linkedTaskAssignedTo' in data) payload.linked_task_assigned_to = data.linkedTaskAssignedTo || null;
  if ('linkedTaskLinkedBy' in data) payload.linked_task_linked_by = data.linkedTaskLinkedBy || null;
  if ('linkedTaskLinkedAt' in data) payload.linked_task_linked_at = data.linkedTaskLinkedAt || null;
  if ('linkedTaskClosedAt' in data) payload.linked_task_closed_at = data.linkedTaskClosedAt || null;
  await requestSupabase(`cross_dept_requests?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: payload,
  });
}

export async function deleteCrossDeptRequestInSupabase(id) {
  await requestSupabase(`cross_dept_requests?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

export async function fetchRequestCommentsFromSupabase(requestId) {
  const rows = await requestSupabase(
    `request_comments?request_id=eq.${encodeURIComponent(requestId)}&select=*&order=created_at.asc`
  );
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    id: r.id, requestId: r.request_id,
    username: r.username || '', body: r.body || '',
    createdAt: toTimestamp(r.created_at),
  }));
}

export async function addRequestCommentInSupabase(data) {
  await requestSupabase('request_comments', {
    method: 'POST', prefer: 'return=minimal',
    body: { request_id: data.requestId, username: data.username || '', body: data.body || '' },
  });
}

export async function deleteRequestCommentInSupabase(id) {
  await requestSupabase(`request_comments?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

export async function fetchRequestsByProjectKeyFromSupabase(projectKey) {
  const rows = await requestSupabase(
    `cross_dept_requests?project_key=eq.${encodeURIComponent(projectKey)}&order=created_at.desc&limit=200`
  );
  return Array.isArray(rows) ? rows.map(mapRequestRow) : [];
}

function mapSuggRow(row = {}) {
  return {
    id: row.id,
    content: row.content || '',
    createdBy: row.created_by || 'anonymous',
    isAnonymous: !!row.is_anonymous,
    archived: !!row.archived,
    adminReply: row.admin_reply || null,
    repliedBy: row.replied_by || null,
    repliedAt: toTimestamp(row.replied_at),
    createdAt: toTimestamp(row.created_at),
    category: row.category || 'other',
  };
}

export async function fetchSuggestionsFromSupabase() {
  const rows = await requestSupabase(
    'suggestion_box?order=created_at.desc&limit=200',
    { diagKey: 'sugg.list', diagLabel: '目安箱', diagScope: 'suggestion_box' }
  );
  return Array.isArray(rows) ? rows.map(mapSuggRow) : [];
}

export async function createSuggestionInSupabase(data) {
  const id = createSupabaseClientId('sugg');
  await requestSupabase('suggestion_box', {
    method: 'POST', prefer: 'return=minimal',
    body: {
      id,
      content: data.content || '',
      created_by: data.createdBy || 'anonymous',
      is_anonymous: !!data.isAnonymous,
      archived: false,
      category: data.category || 'other',
    },
  });
  return id;
}

export async function updateSuggestionInSupabase(id, data) {
  const payload = {};
  if ('archived' in data)    payload.archived     = !!data.archived;
  if ('adminReply' in data)  payload.admin_reply  = data.adminReply || null;
  if ('repliedBy' in data)   payload.replied_by   = data.repliedBy || null;
  if ('repliedAt' in data)   payload.replied_at   = data.repliedAt || null;
  await requestSupabase(`suggestion_box?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: payload,
  });
}

export async function deleteSuggestionInSupabase(id) {
  await requestSupabase(`suggestion_box?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

// ==================== ファイル転送 / Drive ====================

export async function fetchMyDriveLinkFromSupabase(username) {
  const rows = await requestSupabase(
    `user_drive_links?username=eq.${encodeURIComponent(username)}&select=url&limit=1`
  );
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return rows[0].url || '';
}

export async function saveMyDriveLinkInSupabase(username, url) {
  await requestSupabase('user_drive_links', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
    body: { username, url: url || '' },
  });
}

export async function fetchDriveContactsFromSupabase(username) {
  const rows = await requestSupabase(
    `user_drive_contacts?username=eq.${encodeURIComponent(username)}&select=contact_username,url,saved_at`
  );
  if (!Array.isArray(rows)) return {};
  const map = {};
  rows.forEach(r => { map[r.contact_username] = { url: r.url || '', savedAt: new Date(r.saved_at || 0).getTime() }; });
  return map;
}

export async function saveDriveContactInSupabase(username, contactUsername, url) {
  await requestSupabase('user_drive_contacts', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
    body: { username, contact_username: contactUsername, url: url || '' },
  });
}

export async function deleteDriveContactInSupabase(username, contactUsername) {
  await requestSupabase(
    `user_drive_contacts?username=eq.${encodeURIComponent(username)}&contact_username=eq.${encodeURIComponent(contactUsername)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  );
}

export async function fetchDriveSharesFromSupabase(username) {
  const enc = encodeURIComponent(username);
  const rows = await requestSupabase(
    `drive_shares?or=(from.eq.${enc},to.eq.${enc})&order=created_at.desc&limit=100`
  );
  if (!Array.isArray(rows)) return { incoming: [], outgoing: [] };
  const mapShare = r => ({
    id: r.id,
    from: r.from || '',
    to: r.to || '',
    driveUrl: r.drive_url || '',
    message: r.message || '',
    status: r.status || 'pending',
    viewedAt: toTimestamp(r.viewed_at),
    createdAt: toTimestamp(r.created_at),
  });
  return {
    incoming: rows.filter(r => r.to === username).map(mapShare),
    outgoing: rows.filter(r => r.from === username).map(mapShare),
  };
}

export async function addDriveShareInSupabase(from, to, driveUrl, message) {
  await requestSupabase('drive_shares', {
    method: 'POST', prefer: 'return=minimal',
    body: { from, to, drive_url: driveUrl || '', message: message || '', status: 'pending' },
  });
}

export async function updateDriveShareStatusInSupabase(id, status) {
  const payload = { status };
  if (status === 'viewed') payload.viewed_at = new Date().toISOString();
  await requestSupabase(`drive_shares?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: payload,
  });
}

export async function deleteDriveShareInSupabase(id) {
  await requestSupabase(`drive_shares?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

export async function fetchP2pSignalsFromSupabase(username) {
  const rows = await requestSupabase(
    `p2p_signals?to=eq.${encodeURIComponent(username)}&status=in.(pending,connected)&order=created_at.desc&limit=20`
  );
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    id: r.id,
    from: r.from || '',
    to: r.to || '',
    fileName: r.file_name || '',
    fileSize: r.file_size || 0,
    fileType: r.file_type || '',
    status: r.status || 'pending',
    offer: r.offer || null,
    answer: r.answer || null,
    fromCandidates: Array.isArray(r.from_candidates) ? r.from_candidates : [],
    toCandidates: Array.isArray(r.to_candidates) ? r.to_candidates : [],
    createdAt: toTimestamp(r.created_at),
  }));
}

export async function getP2pSignalFromSupabase(sessionId) {
  const rows = await requestSupabase(
    `p2p_signals?id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id, from: r.from || '', to: r.to || '',
    fileName: r.file_name || '', fileSize: r.file_size || 0, fileType: r.file_type || '',
    status: r.status || 'pending',
    offer: r.offer || null, answer: r.answer || null,
    fromCandidates: Array.isArray(r.from_candidates) ? r.from_candidates : [],
    toCandidates: Array.isArray(r.to_candidates) ? r.to_candidates : [],
  };
}

export async function createP2pSignalInSupabase(sessionId, data) {
  await requestSupabase('p2p_signals', {
    method: 'POST', prefer: 'return=minimal',
    body: {
      id: sessionId,
      from: data.from || '',
      to: data.to || '',
      file_name: data.fileName || '',
      file_size: data.fileSize || 0,
      file_type: data.fileType || '',
      status: 'pending',
      offer: data.offer || null,
      answer: null,
      from_candidates: [],
      to_candidates: [],
    },
  });
}

export async function updateP2pSignalInSupabase(sessionId, data) {
  const payload = {};
  if ('status' in data)  payload.status  = data.status;
  if ('answer' in data)  payload.answer  = data.answer || null;
  if ('offer' in data)   payload.offer   = data.offer || null;
  await requestSupabase(`p2p_signals?id=eq.${encodeURIComponent(sessionId)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: payload,
  });
}

export async function appendP2pCandidateInSupabase(sessionId, role, candidate) {
  await callRpc('append_p2p_candidate', {
    p_session_id: sessionId,
    p_role: role,
    p_candidate: candidate,
  });
}

export async function deleteP2pSignalInSupabase(sessionId) {
  await requestSupabase(`p2p_signals?id=eq.${encodeURIComponent(sessionId)}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

// ==================== メール / プロフィール ====================

export async function fetchUserProfileFromSupabase(username) {
  const rows = await requestSupabase(
    `user_profiles?username=eq.${encodeURIComponent(username)}&select=*&limit=1`
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  return {
    realName: r.real_name || '',
    department: r.department || '',
    roleType: r.role_type || 'member',
    email: r.email || '',
    phone: r.phone || '',
    signatureTemplate: r.signature_template || '',
  };
}

export async function saveUserProfileToSupabase(username, data) {
  const payload = { username };
  if ('realName' in data)            payload.real_name           = data.realName || '';
  if ('department' in data)          payload.department          = data.department || '';
  if ('roleType' in data)            payload.role_type           = data.roleType || 'member';
  if ('email' in data)               payload.email               = data.email || '';
  if ('phone' in data)               payload.phone               = data.phone || '';
  if ('signatureTemplate' in data)   payload.signature_template  = data.signatureTemplate || '';
  await requestSupabase('user_profiles', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates', body: payload,
  });
}

export async function fetchEmailContactsFromSupabase(username) {
  const rows = await requestSupabase(
    `user_email_contacts?username=eq.${encodeURIComponent(username)}&order=company_name.asc`,
    { diagKey: 'email.contacts', diagLabel: 'メール連絡先', diagScope: username }
  );
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    id: r.contact_id || r.id,
    username: r.username || '',
    companyName: r.company_name || '',
    personName: r.person_name || '',
    createdAt: toTimestamp(r.created_at),
  }));
}

export async function createEmailContactInSupabase(username, data) {
  const id = data.id || createSupabaseClientId('contact');
  await requestSupabase('user_email_contacts', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
    body: {
      contact_id: id,
      username,
      company_name: data.companyName || '',
      person_name: data.personName || '',
    },
  });
  return id;
}

// ==================== プロパティサマリー補助 ====================

export async function fetchOrdersByProjectKeyFromSupabase(projectKey) {
  const rows = await requestSupabase(
    `orders?project_key=eq.${encodeURIComponent(projectKey)}&order=ordered_at.desc&limit=200`
  );
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    id: r.id,
    supplierName: r.supplier_name || '',
    orderType: r.order_type || 'factory',
    siteName: r.site_name || null,
    projectKey: r.project_key || '',
    items: Array.isArray(r.items) ? r.items : [],
    orderedBy: r.ordered_by || '',
    orderedAt: r.ordered_at || null,
    emailSent: !!r.email_sent,
    deletedAt: r.deleted_at || null,
    createdAt: toTimestamp(r.created_at),
  }));
}

// ========== セクション並び順 ==========

export async function fetchSectionOrderFromSupabase(username) {
  const rows = await requestSupabase(
    `user_section_orders?username=eq.${encodeURIComponent(username)}&select=order_ids`
  );
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return Array.isArray(rows[0].order_ids) ? rows[0].order_ids : [];
}

export async function saveSectionOrderToSupabase(username, order) {
  await requestSupabase('user_section_orders', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: { username, order_ids: Array.isArray(order) ? order : [] },
  });
}
