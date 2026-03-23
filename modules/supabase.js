import { state } from './state.js';
import { recordTransferFetch } from './read-diagnostics.js';

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
