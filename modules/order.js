// ========== 鋼材発注 (order.js) ==========
import {
  db, doc, getDoc, setDoc, addDoc, getDocs, updateDoc, deleteDoc,
  collection, query, where, orderBy,
  serverTimestamp
} from './config.js';
import {
  isSupabaseSharedCoreEnabled,
  fetchPortalConfigFromSupabase,
  savePortalConfigToSupabase,
  fetchOrderSuppliersFromSupabase,
  fetchOrderItemsFromSupabase,
  createOrderInSupabase,
  fetchOrdersFromSupabase,
  updateOrderInSupabase,
  createOrderSupplierInSupabase,
  updateOrderSupplierInSupabase,
  upsertOrderItemInSupabase,
  deactivateOrderItemInSupabase,
} from './supabase.js';
import { state } from './state.js';
import { esc, normalizeProjectKey } from './utils.js';

// ===== 内部状態 =====
let _suppliers = [];   // order_suppliers
let _items = [];       // order_items
let _historyOffset = 0; // 履歴期間オフセット（0=今期）
let _gasUrl = '';
let _orderType = 'factory';    // 工場在庫 / 現場名発注
let _materialFilter = 'all';   // すべて / steel / stainless
let _categoryFilter = 'all';   // カテゴリ絞り込み
let _searchQuery = '';          // 検索文字列
let _showSelectedOnly = false;  // 選択済みのみ表示
let _pins = [];                 // ピン留め品目ID（localStorage）
let _recent = [];               // 最近使った品目ID（localStorage、最大10件）
let _checkedItems = new Map();  // itemId → {checked, qty, length, finish}
let _customItems = [];          // 今回の発注だけで使うマスタ外品目
let _customItemSeq = 0;
let _activeOrderView = 'compose';
let _historyOrders = [];     // 履歴画面で読み込んだ発注データ
let _deletedHistoryOrders = []; // 削除済み履歴
let _editingItemId = null;
let _editingSupplierId = null;

const ORDER_VIEWS = new Set(['compose', 'preview', 'history', 'detail', 'admin']);

function setOrderWorkspaceView(view, { focus = true } = {}) {
  const nextView = ORDER_VIEWS.has(view) ? view : 'compose';
  const modal = document.getElementById('ord-modal');
  if (!modal) return;
  _activeOrderView = nextView;
  modal.dataset.orderView = nextView;

  modal.querySelectorAll('[data-ord-view]').forEach(section => {
    section.hidden = section.dataset.ordView !== nextView;
  });

  const composeActive = nextView === 'compose' || nextView === 'preview';
  const historyActive = nextView === 'history' || nextView === 'detail';
  const composeButton = document.getElementById('ord-nav-compose');
  const historyButton = document.getElementById('ord-btn-history');
  const settingsButton = document.getElementById('ord-open-admin-btn');
  [
    [composeButton, composeActive],
    [historyButton, historyActive],
  ].forEach(([button, active]) => {
    if (!button) return;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  settingsButton?.classList.toggle('active', nextView === 'admin');
  settingsButton?.setAttribute('aria-pressed', String(nextView === 'admin'));

  if (!focus) return;
  requestAnimationFrame(() => {
    const activeSection = modal.querySelector(`[data-ord-view="${nextView}"]`);
    const focusTarget = activeSection?.querySelector('[data-workspace-back], input:not([type="hidden"]), button, select, textarea');
    focusTarget?.focus({ preventScroll: true });
  });
}

// ===== マスタ読み込み =====
function normalizeSharedOrderItem(item = {}) {
  return { ...item, supplierId: null };
}

function parseOrderLengths(raw = '') {
  return raw ? raw.split(/[,、\s]+/).map(s => s.trim()).filter(Boolean) : ['6m'];
}

async function loadMasters() {
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const [suppliers, items, config] = await Promise.all([
        fetchOrderSuppliersFromSupabase(),
        fetchOrderItemsFromSupabase(),
        fetchPortalConfigFromSupabase().catch(err => {
          console.error('order: portal_config Supabase読込失敗', err);
          return {};
        }),
      ]);
      _suppliers = suppliers;
      _items = items.map(normalizeSharedOrderItem);
      _gasUrl = config.gasOrderUrl || '';
    } catch (err) {
      console.error('order: loadMasters (Supabase) error', err);
    }
    return;
  }
  try {
    const [suppSnap, itemSnap, configSnap] = await Promise.all([
      getDocs(query(collection(db, 'order_suppliers'), where('active', '==', true))),
      getDocs(query(collection(db, 'order_items'), orderBy('sortOrder'))),
      getDoc(doc(db, 'portal', 'config'))
    ]);
    _suppliers = suppSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    _items = itemSnap.docs.map(d => normalizeSharedOrderItem({ id: d.id, ...d.data() }));
    if (configSnap.exists()) {
      _gasUrl = configSnap.data().gasOrderUrl || '';
    }
  } catch (err) {
    console.error('order: loadMasters error', err);
  }
}

// ===== 初期化 =====
export async function initOrder(d) {
  // d は deps（将来の拡張用）
  await loadMasters();
  bindOrderEvents();
}

// ===== 20日締め期間計算 =====
function getPeriod(offset = 0) {
  const now = new Date();
  const day20 = new Date(now.getFullYear(), now.getMonth(), 20);
  let endYear = now.getFullYear();
  let endMonth = now.getMonth(); // 0-indexed
  if (now > day20) {
    endMonth += 1;
  }
  endMonth += offset;
  endYear += Math.floor(endMonth / 12);
  endMonth = ((endMonth % 12) + 12) % 12;

  const end = new Date(endYear, endMonth, 20, 23, 59, 59, 999);
  const start = new Date(endYear, endMonth - 1, 21, 0, 0, 0, 0);

  return { start, end };
}

function fmtPeriodLabel(period) {
  const s = period.start;
  const e = period.end;
  return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日 〜 ${e.getFullYear()}年${e.getMonth() + 1}月${e.getDate()}日`;
}

// ===== 日付フォーマット =====
const WEEK_DAYS = ['日', '月', '火', '水', '木', '金', '土'];
function fmtDatetime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate()
    : typeof ts.seconds === 'number' ? new Date(ts.seconds * 1000)
    : new Date(ts);
  const wd = WEEK_DAYS[d.getDay()];
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${wd}）${pad(d.getHours())}時${pad(d.getMinutes())}分`;
}

function toDateValue(value) {
  if (!value) return null;
  const date = value.toDate ? value.toDate()
    : typeof value.seconds === 'number' ? new Date(value.seconds * 1000)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isOrderDeleted(order) {
  return Boolean(order?.deletedAt);
}

function findOrderById(orderId) {
  return _historyOrders.find(o => o.id === orderId) || _deletedHistoryOrders.find(o => o.id === orderId) || null;
}

function getOrderHistoryProjectFilterValue() {
  return normalizeProjectKey(state.orderHistoryProjectKeyFilter || '').toLowerCase();
}

function filterOrdersByProjectKey(list) {
  const filter = getOrderHistoryProjectFilterValue();
  if (!filter) return list;
  return list.filter(order => normalizeProjectKey(order.projectKey || '').toLowerCase().includes(filter));
}

function updateOrderHistoryFilterUi(totalCount, filteredCount) {
  const input = document.getElementById('ord-history-project-filter');
  const clearBtn = document.getElementById('ord-history-project-filter-clear');
  const countEl = document.getElementById('ord-history-project-filter-count');
  if (input && input.value !== (state.orderHistoryProjectKeyFilter || '')) {
    input.value = state.orderHistoryProjectKeyFilter || '';
  }
  if (clearBtn) clearBtn.hidden = !state.orderHistoryProjectKeyFilter;
  if (countEl) {
    countEl.textContent = state.orderHistoryProjectKeyFilter
      ? `${filteredCount} / ${totalCount}件`
      : `${totalCount}件`;
  }
}

function getOrderTypeMeta(order) {
  const isFactory = !order.orderType || order.orderType === 'factory';
  return {
    label: isFactory ? '工場在庫' : (order.siteName || '現場名発注'),
    className: isFactory ? 'ord-type-badge--factory' : 'ord-type-badge--site'
  };
}

function getOrderItemsSummary(order) {
  return (order.items || []).map(it => {
    const nm = it.category || it.name || '';
    const fin = it.finish ? ` ${it.finish}` : '';
    const len = it.length ? ` L=${it.length}` : '';
    return `${nm}${it.spec ? ' ' + it.spec : ''}${fin}${len} ${it.qty}${it.unit || '本'}`;
  }).join('、');
}

function getOrderItemStats(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  return { itemCount: items.length, totalQty };
}

function buildHistoryOverview(activeOrders, deletedOrders) {
  const visibleCount = activeOrders.length;
  const deletedCount = deletedOrders.length;
  const totalQty = activeOrders.reduce((sum, order) => sum + getOrderItemStats(order).totalQty, 0);
  const unsentCount = activeOrders.filter(order => !order.emailSent).length;
  return `
    <div class="ord-history-overview">
      <div class="ord-history-overview-card">
        <span>表示中</span>
        <strong>${visibleCount}件</strong>
      </div>
      <div class="ord-history-overview-card">
        <span>合計本数</span>
        <strong>${totalQty}本</strong>
      </div>
      <div class="ord-history-overview-card${unsentCount ? ' ord-history-overview-card--warn' : ''}">
        <span>未送信</span>
        <strong>${unsentCount}件</strong>
      </div>
      <div class="ord-history-overview-card">
        <span>削除済み</span>
        <strong>${deletedCount}件</strong>
      </div>
    </div>`;
}

function buildStoredOrderData(data, { emailSent = false } = {}) {
  return {
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    supplierEmail: data.supplierEmail,
    orderType: data.orderType,
    siteName: data.siteName,
    projectKey: data.projectKey || '',
    items: data.items,
    orderedBy: data.orderedBy,
    note: data.note,
    orderedAt: serverTimestamp(),
    emailSent,
    emailSentAt: emailSent ? serverTimestamp() : null,
    deletedAt: null,
    deletedBy: null
  };
}

function renderHistoryItem(order, { deleted = false } = {}) {
  const { label: typeLabel, className: typeCls } = getOrderTypeMeta(order);
  const itemsSummary = getOrderItemsSummary(order);
  const { itemCount, totalQty } = getOrderItemStats(order);
  const projectKeyHtml = order.projectKey
    ? `<div class="ord-history-project"><span class="ord-history-project-label">物件No</span><span class="ord-project-key-chip">${esc(order.projectKey)}</span></div>`
    : '';
  const emailBadge = order.emailSent
    ? `<span class="ord-email-badge ord-email-badge--sent"><i class="fa-solid fa-envelope-circle-check"></i> 送信済み</span>`
    : `<span class="ord-email-badge ord-email-badge--unsent"><i class="fa-solid fa-envelope"></i> 未送信</span>`;
  const deletedBadge = deleted
    ? '<span class="ord-history-deleted-badge"><i class="fa-solid fa-trash-can"></i> 削除済み</span>'
    : '';
  const deletedMeta = deleted
    ? `<div class="ord-history-deleted-note"><i class="fa-solid fa-rotate-left"></i> ${fmtDatetime(order.deletedAt)} に ${esc(order.deletedBy || '不明')} が削除</div>`
    : '';
  const actionButtons = deleted
    ? `
        <button class="ord-history-action-btn ord-history-detail-btn" data-id="${esc(order.id)}"><i class="fa-solid fa-file-lines"></i> 詳細</button>
        <button class="ord-history-action-btn ord-history-restore-btn" data-id="${esc(order.id)}"><i class="fa-solid fa-rotate-left"></i> 元に戻す</button>`
    : `
        <button class="ord-history-action-btn ord-history-detail-btn" data-id="${esc(order.id)}"><i class="fa-solid fa-file-lines"></i> 詳細</button>
        <button class="ord-history-action-btn ord-history-delete-btn" data-id="${esc(order.id)}"><i class="fa-solid fa-trash"></i> 削除</button>`;

  return `
    <div class="ord-history-item${deleted ? ' ord-history-item--deleted' : ''}" data-id="${esc(order.id)}">
      <div class="ord-history-header">
        <span class="ord-history-date">${fmtDatetime(order.orderedAt)}</span>
        <span class="ord-type-badge ${typeCls}">${esc(typeLabel)}</span>
        <span class="ord-history-by">${esc(order.orderedBy || '')}</span>
        ${emailBadge}
        ${deletedBadge}
      </div>
      <div class="ord-history-item-main">
        <div class="ord-history-items">${esc(itemsSummary)}</div>
        <div class="ord-history-metrics">
          <span>${itemCount}品目</span>
          <span>合計${totalQty}本</span>
        </div>
      </div>
      ${projectKeyHtml}
      ${order.note ? `<div class="ord-history-note">備考: ${esc(order.note)}</div>` : ''}
      ${deletedMeta}
      <div class="ord-history-detail-btn-row">${actionButtons}</div>
    </div>`;
}

// ===== メール本文組み立て =====
function buildEmailContent(orderData) {
  const supplier = _suppliers.find(s => s.id === orderData.supplierId) || {
    name: orderData.supplierName,
    email: orderData.supplierEmail
  };

  const now = orderData.orderedAt instanceof Date ? orderData.orderedAt : new Date();
  const wd = WEEK_DAYS[now.getDay()];
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${wd}）${pad(now.getHours())}時${pad(now.getMinutes())}分`;

  const typeLabel = orderData.orderType === 'site' ? '現場名発注' : '工場在庫';
  const siteInfo  = orderData.orderType === 'site' && orderData.siteName
    ? `現場名　：${orderData.siteName}\n` : '';
  const projectKeyInfo = orderData.projectKey ? `物件No：${orderData.projectKey}\n` : '';
  const projectKeySuffix = orderData.projectKey ? ` / ${orderData.projectKey}` : '';

  const subject = `【鋼材発注・${typeLabel}】${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日${projectKeySuffix} - 日建フレメックス株式会社 生産管理課`;

  const itemLines = orderData.items.map((item, i) => {
    const no = String(i + 1).padStart(2, ' ');
    const finishStr = item.finish ? `　${item.finish}` : '';
    const lengthStr = item.length ? `　L=${item.length}` : '';
    const label = `${item.category}　${item.spec}${finishStr}${lengthStr}`;
    return `${no}    ${label}      ${item.qty}本`;
  }).join('\n');

  const noteText = (orderData.note || '').trim() || 'なし';
  const supplierName = supplier.name || orderData.supplierName || '発注先';

  const body = `${supplierName}
ご担当者様

いつもお世話になっております。
日建フレメックス株式会社 生産管理課の髙林でございます。

以下の通り、鋼材のご発注をお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
発注日時：${dateStr}
発注担当：${orderData.orderedBy}
発注区分：${typeLabel}
${siteInfo}${projectKeyInfo}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【発注明細】
No.  品名・規格                    数量
────────────────────────────────────────
${itemLines}
────────────────────────────────────────

【備考】
${noteText}

どうぞよろしくお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
日建フレメックス株式会社
生産管理課　髙林
E-mail：takabayashi@framex.co.jp
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  return { subject, body, toEmail: supplier.email || orderData.supplierEmail, replyTo: NOTIFY_EMAIL };
}

// ===== メール送信 =====
const NOTIFY_EMAIL = 'takabayashi@framex.co.jp';

async function sendOrderEmail(orderData) {
  if (!_gasUrl) {
    alert('GAS URLが設定されていません。管理者に設定を依頼してください。');
    return false;
  }

  const { subject, body, toEmail, replyTo } = buildEmailContent(orderData);

  try {
    // 発注先へ送信（replyTo を設定することで返信先を担当者メールに）
    await fetch(_gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toEmail, subject, body, replyTo })
    });

    // 担当者（髙林）へも同内容を送信（誰が発注したかわかるよう控えとして）
    await fetch(_gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: NOTIFY_EMAIL,
        subject: `【控え】${subject}`,
        body: `※ これは発注控えです。発注者：${orderData.orderedBy}\n\n${body}`
      })
    });

    return true;
  } catch (err) {
    console.error('order: sendOrderEmail error', err);
    alert('メール送信に失敗しました。\n' + err.message);
    return false;
  }
}

// ===== 印刷 =====
function printOrder(orderData) {
  const now = orderData.orderedAt instanceof Date ? orderData.orderedAt : new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const { itemCount, totalQty } = getOrderItemStats(orderData);
  const orderNo = orderData.orderId
    ? `ORD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${orderData.orderId.slice(-3).toUpperCase()}`
    : `ORD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-001`;

  const supplier = _suppliers.find(s => s.id === orderData.supplierId) || {
    name: orderData.supplierName || '土屋鋼材株式会社',
    address: '〒370-1201 群馬県高崎市倉賀野町2459-11',
    tel: '027-346-4700'
  };

  const itemRows = orderData.items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(item.category || item.name || '')}　${esc(item.spec)}${item.finish ? '　' + esc(item.finish) : ''}${item.length ? '　L=' + esc(item.length) : ''}</td>
      <td class="ord-print-qty">${item.qty}${esc(item.unit)}</td>
    </tr>`).join('');

  const noteText = (orderData.note || '').trim() || '（なし）';

  const area = document.getElementById('ord-print-area');
  if (!area) return;
  area.innerHTML = `
    <div class="ord-print-doc">
      <div class="ord-print-title">鋼 材 発 注 書</div>
      <table class="ord-print-meta">
        <tr><th>発注日時</th><td>${dateStr}</td></tr>
        <tr><th>発注番号</th><td>${orderNo}</td></tr>
        <tr><th>発注者</th><td>${esc(orderData.orderedBy)}（日建フレメックス株式会社 生産管理課）</td></tr>
        <tr><th>発注区分</th><td>${orderData.orderType === 'site' ? '現場名発注' : '工場在庫'}${orderData.siteName ? `　現場名：${esc(orderData.siteName)}` : ''}</td></tr>
        ${orderData.projectKey ? `<tr><th>物件No</th><td>${esc(orderData.projectKey)}</td></tr>` : ''}
        <tr><th>品目/本数</th><td>${itemCount}品目 / 合計${totalQty}本</td></tr>
      </table>
      <div class="ord-print-section-title">【発注先】</div>
      <div class="ord-print-supplier">
        <div>${esc(supplier.name)}</div>
        <div>${esc(supplier.address || '')}</div>
        <div>TEL: ${esc(supplier.tel || '')}</div>
      </div>
      <div class="ord-print-section-title">【発注明細】</div>
      <table class="ord-print-items">
        <thead>
          <tr><th>No.</th><th>品名・規格</th><th>数量</th></tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="ord-print-section-title">【備考】</div>
      <div class="ord-print-note">${esc(noteText)}</div>
      <div class="ord-print-footer">日建フレメックス株式会社 生産管理課</div>
    </div>`;

  area.hidden = false;
  window.print();
  area.hidden = true;
  area.innerHTML = '';
}

// ===== 発注区分切替 =====
function switchOrderType(type) {
  _orderType = type;
  ['factory', 'site'].forEach(t => {
    const button = document.getElementById(`ord-type-${t}`);
    button?.classList.toggle('active', t === type);
    button?.setAttribute('aria-pressed', String(t === type));
  });
  const siteGroup = document.getElementById('ord-site-name-group');
  if (siteGroup) siteGroup.hidden = (type !== 'site');
  renderCategoryTabs();
  renderOrderItemList();
}

function normalizeOrderItemType(item) {
  const type = item?.orderType || 'both';
  return ['factory', 'site', 'both'].includes(type) ? type : 'both';
}

function matchesOrderType(item) {
  const type = normalizeOrderItemType(item);
  if (_orderType === 'factory') return type === 'factory' || type === 'both';
  return type === 'site' || type === 'both';
}

// ===== ピン留め管理 =====
function loadPins() {
  try { _pins = JSON.parse(localStorage.getItem('portal-order-pins') || '[]'); } catch { _pins = []; }
}
function savePins() {
  localStorage.setItem('portal-order-pins', JSON.stringify(_pins));
}
function togglePin(itemId) {
  const idx = _pins.indexOf(itemId);
  if (idx >= 0) _pins.splice(idx, 1); else _pins.unshift(itemId);
  savePins();
  renderOrderItemList();
}

// ===== 最近使った品目 =====
function loadRecent() {
  try { _recent = JSON.parse(localStorage.getItem('portal-order-recent') || '[]'); } catch { _recent = []; }
}
function saveRecent(itemIds) {
  _recent = [...new Set([...itemIds, ..._recent])].slice(0, 10);
  localStorage.setItem('portal-order-recent', JSON.stringify(_recent));
}

// ===== 選択中サマリー =====
function renderSelectedSummary() {
  const el = document.getElementById('ord-selected-summary');
  if (!el) return;
  const selected = [];
  _checkedItems.forEach((saved, itemId) => {
    if (!saved.checked) return;
    const item = _items.find(it => it.id === itemId);
    if (!item) return;
    selected.push({ item, saved });
  });
  el.hidden = false;
  const totalItems = selected.length + _customItems.length;
  if (!totalItems) {
    el.innerHTML = `
      <div class="ord-sum-header"><span>選択中</span><strong>0品目</strong></div>
      <div class="ord-sum-empty">
        <i class="material-symbols-rounded" aria-hidden="true">playlist_add</i>
        <strong>品目はまだ選択されていません</strong>
        <span>品目一覧のチェックを入れると、ここに発注内容が表示されます。</span>
      </div>`;
    return;
  }
  const masterRows = selected.map(({ item, saved }) => {
    const detail = [item.itemCategory || item.name || '鋼材', saved.length, saved.finish].filter(Boolean).join(' / ');
    return `
      <div class="ord-selected-item" data-selected-id="${esc(item.id)}">
        <div class="ord-selected-item-copy">
          <strong>${esc(item.spec || item.itemCategory || '品目')}</strong>
          <span>${esc(detail)}</span>
        </div>
        <label class="ord-selected-qty"><span>数量</span><input type="number" min="1" step="1" value="${Number(saved.qty) || 1}" data-ord-selected-qty="${esc(item.id)}" aria-label="${esc(item.spec || '品目')}の数量"></label>
        <button type="button" class="ord-selected-remove" data-ord-remove-item="${esc(item.id)}" title="品目から外す" aria-label="${esc(item.spec || '品目')}を発注から外す"><i class="material-symbols-rounded" aria-hidden="true">close</i></button>
      </div>`;
  }).join('');
  const customRows = _customItems.map(item => `
    <div class="ord-selected-item ord-selected-item--custom" data-custom-id="${esc(item.id)}">
      <div class="ord-custom-fields">
        <input type="text" class="form-input" value="${esc(item.name)}" placeholder="品名" maxlength="40" data-ord-custom-field="name" aria-label="追加品目の品名">
        <input type="text" class="form-input" value="${esc(item.spec)}" placeholder="規格" maxlength="40" data-ord-custom-field="spec" aria-label="追加品目の規格">
        <input type="text" class="form-input ord-custom-unit" value="${esc(item.unit)}" placeholder="単位" maxlength="10" data-ord-custom-field="unit" aria-label="追加品目の単位">
      </div>
      <label class="ord-selected-qty"><span>数量</span><input type="number" min="1" step="1" value="${Number(item.qty) || 1}" data-ord-custom-field="qty" aria-label="追加品目の数量"></label>
      <button type="button" class="ord-selected-remove" data-ord-remove-custom="${esc(item.id)}" title="品目を削除" aria-label="追加品目を削除"><i class="material-symbols-rounded" aria-hidden="true">close</i></button>
    </div>`).join('');
  el.innerHTML = `
    <div class="ord-sum-header"><span>選択中</span><strong>${totalItems}品目</strong></div>
    <div class="ord-selected-items">${masterRows}${customRows}</div>`;
}

// ===== カテゴリフィルタドロップダウン =====
function renderCategoryTabs() {
  const sel = document.getElementById('ord-cat-select');
  if (!sel) return;
  const cats = [...new Set(
    _items.filter(it =>
      it.active !== false &&
      matchesOrderType(it) &&
      (_materialFilter === 'all' || (it.materialType || 'steel') === _materialFilter)
    ).map(it => it.itemCategory || it.name || '')
  )];
  if (_categoryFilter !== 'all' && !cats.includes(_categoryFilter)) {
    _categoryFilter = 'all';
  }
  sel.innerHTML = [
    `<option value="all">── カテゴリで絞り込む ──</option>`,
    ...cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`)
  ].join('');
  sel.value = _categoryFilter;
}

// ===== 品目行HTML生成 =====
function buildItemRow(item) {
  const id = item.id;
  const lengths = item.availableLengths || [];
  const lengthHtml = lengths.length > 1
    ? `<select class="ord-length-select form-input" aria-label="${esc(item.spec || '品目')}の長さ">${lengths.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('')}</select>`
    : `<span class="ord-item-fixed-length">${esc(lengths[0] || '')}</span>`;
  const isStainless = (item.materialType || 'steel') === 'stainless';
  const finishHtml = isStainless
    ? `<select class="ord-finish-select form-input" aria-label="${esc(item.spec || '品目')}の仕上げ"><option value="HL">HL</option><option value="#400">#400</option><option value="未研">未研</option></select>`
    : '';
  const isPinned = _pins.includes(id);
  return `
    <div class="ord-item-row" data-id="${esc(id)}">
      <button type="button" class="ord-pin-btn${isPinned ? ' pinned' : ''}" title="${isPinned ? 'よく使う品目から外す' : 'よく使う品目に登録'}" aria-label="${isPinned ? 'よく使う品目から外す' : 'よく使う品目に登録'}">
        <i class="${isPinned ? 'fa-solid' : 'fa-regular'} fa-star"></i>
      </button>
      <input type="checkbox" class="ord-item-check" id="ord-chk-${esc(id)}">
      <label for="ord-chk-${esc(id)}" class="ord-item-label">
        <span class="ord-item-name">${esc(item.itemCategory || item.name || '鋼材')}</span>
        <span class="ord-item-spec">${esc(item.spec || '規格なし')}</span>
      </label>
      ${finishHtml}
      ${lengthHtml}
      <label class="ord-item-qty"><span>数量</span><input type="number" class="ord-qty-input form-input" value="${item.defaultQty || 1}" min="1" step="1" aria-label="${esc(item.spec || '品目')}の数量"></label>
    </div>`;
}

function switchMaterialFilter(type) {
  _materialFilter = type;
  _categoryFilter = 'all';
  document.querySelectorAll('#ord-material-tabs .ord-material-tab').forEach(btn => {
    const active = btn.dataset.type === type;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderCategoryTabs();
  renderOrderItemList();
}

function getOrderEmptyFilterLabels(q) {
  const labels = [_orderType === 'site' ? '現場名発注' : '工場在庫'];
  if (_materialFilter !== 'all') labels.push(_materialFilter === 'stainless' ? 'ステンレス' : 'スチール');
  if (_categoryFilter !== 'all') labels.push(_categoryFilter);
  if (q) labels.push(`検索: ${q}`);
  if (_showSelectedOnly) labels.push('選択済みのみ');
  return labels;
}

function resetOrderItemFilters() {
  _materialFilter = 'all';
  _categoryFilter = 'all';
  _searchQuery = '';
  _showSelectedOnly = false;
  const searchEl = document.getElementById('ord-search-input');
  if (searchEl) searchEl.value = '';
  document.getElementById('ord-search-clear')?.toggleAttribute('hidden', true);
  const selectedToggle = document.getElementById('ord-show-selected');
  if (selectedToggle) selectedToggle.checked = false;
  document.querySelectorAll('#ord-material-tabs .ord-material-tab').forEach(btn => {
    const active = btn.dataset.type === 'all';
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderCategoryTabs();
  const catSel = document.getElementById('ord-cat-select');
  if (catSel) catSel.value = 'all';
  renderOrderItemList();
}

function buildOrderEmptyState(q) {
  const labels = getOrderEmptyFilterLabels(q);
  const actionButtons = [
    q ? '<button type="button" class="btn-modal-secondary ord-empty-action" data-ord-empty-action="clear-search">検索をクリア</button>' : '',
    _categoryFilter !== 'all' ? '<button type="button" class="btn-modal-secondary ord-empty-action" data-ord-empty-action="clear-category">カテゴリを解除</button>' : '',
    _materialFilter !== 'all' ? '<button type="button" class="btn-modal-secondary ord-empty-action" data-ord-empty-action="all-material">素材をすべて表示</button>' : '',
    _showSelectedOnly ? '<button type="button" class="btn-modal-secondary ord-empty-action" data-ord-empty-action="show-all">すべて表示</button>' : '',
    '<button type="button" class="btn-modal-secondary ord-empty-action" data-ord-empty-action="reset">条件をリセット</button>',
    '<button type="button" class="btn-modal-primary ord-empty-action" data-ord-empty-action="admin">鋼材マスタを開く</button>',
  ].filter(Boolean).join('');
  return `
    <div class="ord-empty ord-empty--actionable">
      <strong>該当する鋼材が見つかりません</strong>
      <p>現在の条件: ${labels.map(esc).join(' / ')}</p>
      <div class="ord-empty-actions">${actionButtons}</div>
    </div>`;
}

function buildOrderFilteredList(filtered, q) {
  const useFlatList = q.length > 0 || _categoryFilter !== 'all' || _showSelectedOnly;
  if (useFlatList) {
    const heading = _categoryFilter !== 'all'
      ? `${esc(_categoryFilter)} / ${filtered.length}件`
      : `検索結果 / ${filtered.length}件`;
    return `
      <div class="ord-filter-result-meta">${heading}</div>
      <div class="ord-cat-items ord-cat-items--flat">
        ${filtered.map(buildItemRow).join('')}
      </div>`;
  }

  const grouped = {};
  filtered.forEach(item => {
    const cat = item.itemCategory || item.name || '鋼材';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });
  return Object.entries(grouped).map(([cat, items]) => `
    <div class="ord-cat-group">
      <div class="ord-cat-header">
        <span class="ord-cat-name">${esc(cat)}</span>
        <span class="ord-cat-count">${items.length}種</span>
      </div>
      <div class="ord-cat-items">
        ${items.map(buildItemRow).join('')}
      </div>
    </div>`).join('');
}

function renderOrderItemList() {
  const listEl = document.getElementById('ord-item-list');
  if (!listEl) return;
  renderSelectedSummary();

  const q = _searchQuery.toLowerCase().trim();

  // ── フィルタ適用 ──
  let filtered = _items.filter(it => {
    if (it.active === false) return false;
    if (!matchesOrderType(it)) return false;
    if (_materialFilter !== 'all' && (it.materialType || 'steel') !== _materialFilter) return false;
    if (_categoryFilter !== 'all' && (it.itemCategory || '') !== _categoryFilter) return false;
    if (q && !`${it.itemCategory || ''} ${it.spec || ''}`.toLowerCase().includes(q)) return false;
    if (_showSelectedOnly && !_checkedItems.get(it.id)?.checked) return false;
    return true;
  });

  // ── スペシャルセクション（検索・カテゴリ絞り・選択済みモード中は非表示）──
  const showSpecial = !q && _categoryFilter === 'all' && !_showSelectedOnly;
  const pinnedItems = showSpecial
    ? _pins.map(id => _items.find(it => it.id === id)).filter(Boolean)
        .filter(it => it.active !== false && matchesOrderType(it) &&
          (_materialFilter === 'all' || (it.materialType || 'steel') === _materialFilter))
    : [];
  const pinnedIds = new Set(pinnedItems.map(it => it.id));
  const recentItems = showSpecial
    ? _recent.map(id => _items.find(it => it.id === id)).filter(Boolean)
        .filter(it => it.active !== false && !pinnedIds.has(it.id) && matchesOrderType(it) &&
          (_materialFilter === 'all' || (it.materialType || 'steel') === _materialFilter))
    : [];
  const specialIds = new Set([...pinnedIds, ...recentItems.map(it => it.id)]);
  filtered = filtered.filter(it => !specialIds.has(it.id));

  if (!filtered.length && !pinnedItems.length && !recentItems.length) {
    listEl.innerHTML = buildOrderEmptyState(q);
    return;
  }

  let html = '';

  // ── ⭐ よく使う品目 ──
  if (pinnedItems.length) {
    html += `<div class="ord-special-section">
      <div class="ord-special-header"><i class="fa-solid fa-star"></i> よく使う品目</div>
      ${pinnedItems.map(buildItemRow).join('')}
    </div>`;
  }

  // ── 🕐 最近使った品目 ──
  if (recentItems.length) {
    html += `<div class="ord-special-section">
      <div class="ord-special-header"><i class="fa-solid fa-clock-rotate-left"></i> 最近使った品目</div>
      ${recentItems.map(buildItemRow).join('')}
    </div>`;
  }

  // ── カテゴリグループ ──
  if (filtered.length) {
    html += buildOrderFilteredList(filtered, q);
  }
  listEl.innerHTML = html;

  // チェック状態復元 + 変更イベント
  listEl.querySelectorAll('.ord-item-row[data-id]').forEach(row => {
    const id = row.dataset.id;
    const saved = _checkedItems.get(id);
    const chk = row.querySelector('.ord-item-check');
    const qtyEl = row.querySelector('.ord-qty-input');
    const lenEl = row.querySelector('.ord-length-select');
    const fixedLen = row.querySelector('.ord-item-fixed-length');
    const finEl = row.querySelector('.ord-finish-select');
    if (saved) {
      if (chk) chk.checked = saved.checked;
      if (qtyEl && saved.qty != null) qtyEl.value = saved.qty;
      if (lenEl && saved.length) lenEl.value = saved.length;
      if (finEl && saved.finish) finEl.value = saved.finish;
    }
    const sync = () => {
      _checkedItems.set(id, {
        checked: chk?.checked || false,
        qty: parseInt(qtyEl?.value, 10) || 1,
        length: lenEl?.value || fixedLen?.textContent?.trim() || '',
        finish: finEl?.value || ''
      });
      renderSelectedSummary();
      if (_showSelectedOnly) renderOrderItemList();
    };
    chk?.addEventListener('change', sync);
    qtyEl?.addEventListener('change', sync);
    lenEl?.addEventListener('change', sync);
    finEl?.addEventListener('change', sync);
    // ピンボタン
    row.querySelector('.ord-pin-btn')?.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); togglePin(id);
    });
  });
}

// ===== 発注モーダル =====
function renderSupplierSelect(preferredId = '') {
  const sel = document.getElementById('ord-supplier-select');
  if (!sel) return;
  const nextValue = preferredId || sel.value;
  sel.innerHTML = _suppliers.length
    ? _suppliers.map(s => `<option value="${esc(s.id)}">${esc(s.name)}　${esc(s.email)}</option>`).join('')
    : '<option value="">発注先が登録されていません</option>';
  if (nextValue && _suppliers.some(s => s.id === nextValue)) {
    sel.value = nextValue;
  }
}

export async function openOrderModal() {
  await loadMasters();
  loadPins();
  loadRecent();

  const modal = document.getElementById('ord-modal');
  if (!modal) return;

  // 発注先プルダウンを構築
  renderSupplierSelect();

  // フィルタ・検索・選択状態をリセット
  _materialFilter = 'all';
  _categoryFilter = 'all';
  _searchQuery = '';
  _showSelectedOnly = false;
  _checkedItems.clear();
  _customItems = [];
  const searchEl = document.getElementById('ord-search-input');
  if (searchEl) searchEl.value = '';
  document.getElementById('ord-search-clear')?.toggleAttribute('hidden', true);
  const selectedToggle = document.getElementById('ord-show-selected');
  if (selectedToggle) selectedToggle.checked = false;
  document.querySelectorAll('#ord-material-tabs .ord-material-tab').forEach(btn => {
    const active = btn.dataset.type === 'all';
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderCategoryTabs();
  const catSel = document.getElementById('ord-cat-select');
  if (catSel) catSel.value = 'all';
  switchOrderType('factory');

  const siteNameEl = document.getElementById('ord-site-name');
  if (siteNameEl) siteNameEl.value = '';

  const projectKeyEl = document.getElementById('ord-project-key');
  if (projectKeyEl) projectKeyEl.value = '';

  const noteEl = document.getElementById('ord-note');
  if (noteEl) noteEl.value = '';

  modal.classList.add('visible');
  setOrderWorkspaceView('compose', { focus: false });
  renderSelectedSummary();
}

export function closeOrderModal() {
  const modal = document.getElementById('ord-modal');
  if (modal) modal.classList.remove('visible');
}

// 発注データを画面から収集して返す（バリデーション込み）
function collectOrderData() {
  const username = state.currentUsername || '未設定';
  const siteName = (document.getElementById('ord-site-name')?.value || '').trim();
  if (_orderType === 'site' && !siteName) {
    alert('現場名を入力してください。');
    document.getElementById('ord-site-name')?.focus();
    return null;
  }

  const selectedItems = [];

  // _checkedItems からマスタ品目を収集（フィルタ非表示の品目も取得できる）
  _checkedItems.forEach((saved, itemId) => {
    if (!saved.checked) return;
    const item = _items.find(it => it.id === itemId);
    if (!item) return;
    const length = saved.length || (item.availableLengths?.[0] || '');
    selectedItems.push({
      itemId, category: item.itemCategory || item.name || '',
      spec: item.spec, unit: '本', qty: saved.qty || 1,
      length, finish: saved.finish || ''
    });
  });

  const invalidCustom = _customItems.find(item => !`${item.name || ''}`.trim());
  if (invalidCustom) {
    alert('追加した品目の品名を入力してください。');
    setOrderWorkspaceView('compose', { focus: false });
    document.querySelector(`[data-custom-id="${invalidCustom.id}"] [data-ord-custom-field="name"]`)?.focus();
    return null;
  }
  _customItems.forEach(item => {
    selectedItems.push({
      itemId: null,
      category: `${item.name || ''}`.trim(),
      spec: `${item.spec || ''}`.trim(),
      unit: `${item.unit || ''}`.trim() || '本',
      qty: Number.parseInt(item.qty, 10) || 1,
      length: '',
      finish: '',
    });
  });

  if (selectedItems.length === 0) {
    alert('発注する鋼材を1つ以上選択してください。');
    return null;
  }

  const selEl = document.getElementById('ord-supplier-select');
  const supplier = _suppliers.find(s => s.id === selEl?.value) || _suppliers[0] || { id: '', name: '土屋鋼材株式会社', email: 'info@tsuchiyakouzai.com' };
  const projectKey = normalizeProjectKey(document.getElementById('ord-project-key')?.value || '');
  const note = document.getElementById('ord-note')?.value.trim() || '';

  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierEmail: supplier.email,
    orderType: _orderType,
    siteName: _orderType === 'site' ? siteName : null,
    projectKey,
    items: selectedItems,
    orderedBy: username,
    note,
    _localNow: new Date()
  };
}

// 送信内容の確認画面を開く
function buildOrderPreviewSummary(data) {
  const totalQty = data.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const destination = data.orderType === 'site' ? `現場名発注: ${data.siteName || '-'}` : '工場在庫';
  const project = data.projectKey || '-';
  const itemChips = data.items.map(item => {
    const sub = [item.category, item.length, item.finish].filter(Boolean).join(' / ');
    return `
      <span class="ord-preview-item-chip">
        <strong>${esc(item.spec || item.category || '品目')}</strong>
        <small>${esc(sub || '鋼材')}</small>
        <em>${esc(item.qty)}${esc(item.unit || '本')}</em>
      </span>`;
  }).join('');

  return `
    <div class="ord-preview-summary-grid">
      <div><span>発注先</span><strong>${esc(data.supplierName || '-')}</strong></div>
      <div><span>区分</span><strong>${esc(destination)}</strong></div>
      <div><span>物件No</span><strong>${esc(project)}</strong></div>
      <div><span>品目</span><strong>${data.items.length}品目 / 合計${totalQty}本</strong></div>
    </div>
    <div class="ord-preview-item-chips">${itemChips}</div>`;
}

let _pendingOrderData = null;
async function openPreviewModal() {
  const data = collectOrderData();
  if (!data) return;
  _pendingOrderData = data;

  const { subject, body, toEmail } = buildEmailContent({ ...data, orderedAt: data._localNow });

  document.getElementById('ord-preview-subject').textContent = subject;
  document.getElementById('ord-preview-to').textContent = toEmail;
  document.getElementById('ord-preview-summary').innerHTML = buildOrderPreviewSummary(data);
  document.getElementById('ord-preview-body').textContent = body;

  setOrderWorkspaceView('preview');
}

function closePreviewModal() {
  setOrderWorkspaceView('compose');
}

// プレビューから実際に送信
async function submitFromPreview() {
  if (!_pendingOrderData) return;
  const data = _pendingOrderData;
  const nowLocal = data._localNow;
  const localOrderData = { ...data, orderedAt: nowLocal };
  const btn = document.getElementById('ord-preview-send');

  try {
    if (btn) { btn.disabled = true; btn.textContent = '送信中...'; }
    const ok = await sendOrderEmail(localOrderData);
    if (!ok) return;

    if (isSupabaseSharedCoreEnabled()) {
      await createOrderInSupabase({
        ...buildStoredOrderData(data, { emailSent: true }),
        orderedAt: nowLocal.toISOString(),
        emailSentAt: nowLocal.toISOString(),
      });
    } else {
      await addDoc(collection(db, 'orders'), buildStoredOrderData(data, { emailSent: true }));
    }

    const usedIds = data.items.filter(it => it.itemId).map(it => it.itemId);
    if (usedIds.length) saveRecent(usedIds);
    alert('メールを送信しました。');
    _pendingOrderData = null;
    await openOrderHistoryModal();
  } catch (err) {
    console.error('order: submitFromPreview error', err);
    _pendingOrderData = null;
    alert('メール送信後の履歴保存に失敗しました。\n履歴に残っていない可能性があります。\n' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> この内容で送信';
    }
  }
}

function printDraftOrder() {
  const data = collectOrderData();
  if (!data) return;
  printOrder({ ...data, orderedAt: data._localNow });
}

// ===== 履歴モーダル =====
// 1年以上古い履歴と、30日を過ぎた削除済み履歴を自動削除（バックグラウンド実行）
async function purgeOldOrders() {
  if (isSupabaseSharedCoreEnabled()) return; // Runtime APIでは自動パージ未実装
  try {
    const orderCutoff = new Date();
    orderCutoff.setFullYear(orderCutoff.getFullYear() - 1);
    const deletedCutoff = new Date();
    deletedCutoff.setDate(deletedCutoff.getDate() - 30);
    const snap = await getDocs(query(collection(db, 'orders'), where('orderedBy', '==', state.currentUsername)));
    const old = snap.docs.filter(d => {
      const data = d.data();
      const orderedAt = toDateValue(data.orderedAt);
      const deletedAt = toDateValue(data.deletedAt);
      if (deletedAt) return deletedAt < deletedCutoff;
      return orderedAt ? orderedAt < orderCutoff : false;
    });
    await Promise.all(old.map(d => deleteDoc(doc(db, 'orders', d.id))));
    if (old.length > 0) console.log(`order: ${old.length}件の期限切れ履歴を削除しました`);
  } catch (err) {
    console.warn('order: purgeOldOrders error', err);
  }
}

export async function openOrderHistoryModal(initialProjectKey = '') {
  _historyOffset = 0;
  state.orderHistoryProjectKeyFilter = normalizeProjectKey(initialProjectKey || '');
  await loadMasters();
  const modal = document.getElementById('ord-modal');
  if (!modal) return;
  modal.classList.add('visible');
  setOrderWorkspaceView('history', { focus: false });
  updateOrderHistoryFilterUi(0, 0);
  purgeOldOrders(); // バックグラウンドで古いデータを削除（完了を待たない）
  await renderHistory();
}

export function closeOrderHistoryModal() {
  setOrderWorkspaceView('compose');
}

async function renderHistory() {
  const period = getPeriod(_historyOffset);
  const labelEl = document.getElementById('ord-period-label');
  if (labelEl) labelEl.textContent = fmtPeriodLabel(period);

  const listEl = document.getElementById('ord-history-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="ord-loading">読み込み中...</p>';

  try {
    const username = state.currentUsername;
    let allOrders;
    if (isSupabaseSharedCoreEnabled()) {
      allOrders = await fetchOrdersFromSupabase(
        state.isAdmin ? null : username,
        { includeDeleted: true }
      );
    } else {
      let q = state.isAdmin
        ? query(collection(db, 'orders'))
        : query(collection(db, 'orders'), where('orderedBy', '==', username));
      const snap = await getDocs(q);
      allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const orders = allOrders
      .filter(o => {
        const t = toDateValue(o.orderedAt);
        if (!t) return false;
        return t >= period.start && t <= period.end;
      })
      .sort((a, b) => {
        const ta = toDateValue(a.orderedAt) || new Date(0);
        const tb = toDateValue(b.orderedAt) || new Date(0);
        return tb - ta; // 新しい順
      });

    _historyOrders = orders.filter(order => !isOrderDeleted(order));
    _deletedHistoryOrders = orders
      .filter(order => isOrderDeleted(order))
      .sort((a, b) => {
        const ta = toDateValue(a.deletedAt) || new Date(0);
        const tb = toDateValue(b.deletedAt) || new Date(0);
        return tb - ta;
      });

    if (_historyOrders.length === 0 && _deletedHistoryOrders.length === 0) {
      listEl.innerHTML = '<p class="ord-empty">この期間の発注はありません</p>';
      return;
    }

    const grouped = {};
    _historyOrders.forEach(o => {
      const key = o.supplierName || '不明';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(o);
    });

    const activeHtml = _historyOrders.length > 0
      ? Object.entries(grouped).map(([supplierName, supplierOrders]) => `
          <div class="ord-history-group">
            <div class="ord-history-group-header">
              <i class="fa-solid fa-building"></i> ${esc(supplierName)}
              <span class="ord-history-count">${supplierOrders.length}件</span>
            </div>
            ${supplierOrders.map(order => renderHistoryItem(order)).join('')}
          </div>`).join('')
      : '<p class="ord-empty">この期間の表示中履歴はありません</p>';

    const deletedHtml = _deletedHistoryOrders.length > 0
      ? `
          <details class="ord-history-deleted-details">
            <summary class="ord-history-deleted-summary">
              <i class="fa-solid fa-trash-can-arrow-up"></i> 削除済み履歴（${_deletedHistoryOrders.length}件）
            </summary>
            <div class="ord-history-deleted-help">
              誤って削除した履歴はここから元に戻せます。削除済み履歴は30日後に自動で完全削除されます。
            </div>
            <div class="ord-history-deleted-list">
              ${_deletedHistoryOrders.map(order => renderHistoryItem(order, { deleted: true })).join('')}
            </div>
          </details>`
      : '';

    renderHistoryList();
  } catch (err) {
    console.error('order: renderHistory error', err);
    listEl.innerHTML = '<p class="ord-empty">読み込みに失敗しました</p>';
  }
}

// ===== 発注詳細モーダル =====
function renderHistoryList() {
  const listEl = document.getElementById('ord-history-list');
  if (!listEl) return;

  const totalCount = _historyOrders.length + _deletedHistoryOrders.length;
  const filteredActiveOrders = filterOrdersByProjectKey(_historyOrders);
  const filteredDeletedOrders = filterOrdersByProjectKey(_deletedHistoryOrders);
  const filteredCount = filteredActiveOrders.length + filteredDeletedOrders.length;
  updateOrderHistoryFilterUi(totalCount, filteredCount);

  if (totalCount === 0) {
    listEl.innerHTML = '<p class="ord-empty">この期間の発注はありません</p>';
    return;
  }
  if (filteredCount === 0) {
    listEl.innerHTML = '<p class="ord-empty">物件Noに一致する履歴はありません</p>';
    return;
  }

  const grouped = {};
  filteredActiveOrders.forEach(order => {
    const key = order.supplierName || '不明';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(order);
  });

  const activeHtml = filteredActiveOrders.length > 0
    ? Object.entries(grouped).map(([supplierName, supplierOrders]) => `
        <div class="ord-history-group">
          <div class="ord-history-group-header">
            <i class="fa-solid fa-building"></i> ${esc(supplierName)}
            <span class="ord-history-count">${supplierOrders.length}件</span>
          </div>
          ${supplierOrders.map(order => renderHistoryItem(order)).join('')}
        </div>`).join('')
    : '<p class="ord-empty">この条件の表示中履歴はありません</p>';

  const deletedHtml = filteredDeletedOrders.length > 0
    ? `
        <details class="ord-history-deleted-details">
          <summary class="ord-history-deleted-summary">
            <i class="fa-solid fa-trash-can-arrow-up"></i> 削除済み履歴（${filteredDeletedOrders.length}件）
          </summary>
          <div class="ord-history-deleted-help">
            誤って削除した履歴はここから元に戻せます。削除済み履歴は30日後に自動で完全削除されます。
          </div>
          <div class="ord-history-deleted-list">
            ${filteredDeletedOrders.map(order => renderHistoryItem(order, { deleted: true })).join('')}
          </div>
        </details>`
    : '';

  listEl.innerHTML = buildHistoryOverview(filteredActiveOrders, filteredDeletedOrders) + activeHtml + deletedHtml;
}

function openOrderDetailModal(orderId) {
  const order = findOrderById(orderId);
  if (!order) return;
  const modal = document.getElementById('ord-detail-modal');
  const content = document.getElementById('ord-detail-content');
  if (!modal || !content) return;

  const now = toDateValue(order.orderedAt) || new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const orderNo = `ORD-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${orderId.slice(-4).toUpperCase()}`;
  const supplier = _suppliers.find(s => s.id === order.supplierId) || { name: order.supplierName || '', address: '', tel: '' };
  const typeLabel = (!order.orderType || order.orderType === 'factory') ? '工場在庫' : (order.siteName || '現場名発注');
  const noteText = (order.note || '').trim() || '（なし）';
  const { itemCount, totalQty } = getOrderItemStats(order);
  const deletedInfo = isOrderDeleted(order)
    ? `<div class="ord-detail-deleted-banner"><i class="fa-solid fa-trash-can-arrow-up"></i> この履歴は削除済みです。${fmtDatetime(order.deletedAt)} に ${esc(order.deletedBy || '不明')} が削除しました。</div>`
    : '';
  const itemRows = (order.items || []).map((item, i) => {
    const nm = item.category || item.name || '';
    const fin = item.finish ? `　${item.finish}` : '';
    const len = item.length ? `　L=${item.length}` : '';
    return `<tr><td>${i+1}</td><td>${esc(nm)}　${esc(item.spec || '')}${fin}${len}</td><td>${item.qty}${esc(item.unit || '本')}</td></tr>`;
  }).join('');

  content.innerHTML = `
    <div class="ord-detail-doc">
      <div class="ord-detail-title">鋼 材 発 注 書</div>
      ${deletedInfo}
      <div class="ord-detail-summary-grid">
        <div><span>発注先</span><strong>${esc(supplier.name || order.supplierName || '-')}</strong></div>
        <div><span>発注区分</span><strong>${esc(typeLabel)}</strong></div>
        <div><span>品目</span><strong>${itemCount}品目 / 合計${totalQty}本</strong></div>
        <div><span>送信状態</span><strong>${order.emailSent ? '送信済み' : '未送信'}</strong></div>
      </div>
      <table class="ord-detail-meta">
        <tr><th>発注日時</th><td>${dateStr}</td></tr>
        <tr><th>発注番号</th><td>${orderNo}</td></tr>
        <tr><th>発注者</th><td>${esc(order.orderedBy || '')}（日建フレメックス株式会社 生産管理課）</td></tr>
        <tr><th>発注区分</th><td>${typeLabel}</td></tr>
        ${order.projectKey ? `<tr><th>物件No</th><td><span class="ord-project-key-chip">${esc(order.projectKey)}</span></td></tr>` : ''}
        <tr><th>メール送信</th><td>${order.emailSent ? `<span style="color:var(--accent-cyan)"><i class="fa-solid fa-envelope-circle-check"></i> 送信済み</span>` : `<span style="color:var(--accent-orange)"><i class="fa-solid fa-envelope"></i> 未送信（メール未送信）</span>`}</td></tr>
        ${isOrderDeleted(order) ? `<tr><th>削除状態</th><td>${fmtDatetime(order.deletedAt)} / ${esc(order.deletedBy || '不明')}</td></tr>` : ''}
      </table>
      <div class="ord-detail-section">【発注先】</div>
      <div class="ord-detail-supplier">
        <div>${esc(supplier.name)}</div>
        ${supplier.address ? `<div>${esc(supplier.address)}</div>` : ''}
        ${supplier.tel ? `<div>TEL: ${esc(supplier.tel)}</div>` : ''}
      </div>
      <div class="ord-detail-section">【発注明細】</div>
      <table class="ord-detail-items">
        <thead><tr><th>No.</th><th>品名・規格</th><th>数量</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="ord-detail-section">【備考】</div>
      <div class="ord-detail-note">${esc(noteText)}</div>
      <div class="ord-detail-footer">日建フレメックス株式会社 生産管理課</div>
    </div>`;

  setOrderWorkspaceView('detail');
  document.getElementById('ord-detail-print-btn')?.setAttribute('data-id', orderId);
  const deleteBtn = document.getElementById('ord-detail-delete-btn');
  const restoreBtn = document.getElementById('ord-detail-restore-btn');
  if (deleteBtn) {
    deleteBtn.dataset.id = orderId;
    deleteBtn.hidden = isOrderDeleted(order);
  }
  if (restoreBtn) {
    restoreBtn.dataset.id = orderId;
    restoreBtn.hidden = !isOrderDeleted(order);
  }
}

function closeOrderDetailModal() {
  setOrderWorkspaceView('history');
}

async function deleteOrderHistory(orderId) {
  const order = findOrderById(orderId);
  if (!order || isOrderDeleted(order)) return;
  const summary = getOrderItemsSummary(order) || '発注明細';
  const ok = confirm(`この履歴を削除しますか？\n\n${summary}\n\n削除後も「削除済み履歴」から元に戻せます。`);
  if (!ok) return;

  try {
    if (isSupabaseSharedCoreEnabled()) {
      await updateOrderInSupabase(orderId, {
        deletedAt: new Date().toISOString(),
        deletedBy: state.currentUsername || '不明',
      });
    } else {
      await updateDoc(doc(db, 'orders', orderId), {
        deletedAt: serverTimestamp(),
        deletedBy: state.currentUsername || '不明'
      });
    }
    closeOrderDetailModal();
    await renderHistory();
    alert('履歴を削除しました。誤って削除した場合は「削除済み履歴」から元に戻せます。');
  } catch (err) {
    console.error('order: deleteOrderHistory error', err);
    alert('履歴の削除に失敗しました。\n' + err.message);
  }
}

async function restoreOrderHistory(orderId) {
  const order = findOrderById(orderId);
  if (!order || !isOrderDeleted(order)) return;

  try {
    if (isSupabaseSharedCoreEnabled()) {
      await updateOrderInSupabase(orderId, { deletedAt: null, deletedBy: null });
    } else {
      await updateDoc(doc(db, 'orders', orderId), {
        deletedAt: null,
        deletedBy: null
      });
    }
    closeOrderDetailModal();
    await renderHistory();
    alert('履歴を元に戻しました。');
  } catch (err) {
    console.error('order: restoreOrderHistory error', err);
    alert('履歴の復元に失敗しました。\n' + err.message);
  }
}

// ===== 管理モーダル =====
export async function openOrderAdminModal() {
  const modal = document.getElementById('ord-admin-modal');
  if (!modal) return;
  await loadMasters();
  resetSupplierForm();
  switchOrderAdminTab('items');
  document.getElementById('ord-modal')?.classList.add('visible');
  setOrderWorkspaceView('admin');
}

export function closeOrderAdminModal() {
  setOrderWorkspaceView('compose');
}

async function openOrderAdminPanel() {
  await loadMasters();
  resetSupplierForm();
  switchOrderAdminTab('items');
}

export function switchOrderAdminTab(tab) {
  ['items', 'suppliers', 'gas'].forEach(t => {
    const btn = document.getElementById(`ord-admin-tab-${t}`);
    const panel = document.getElementById(`ord-admin-panel-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (btn) btn.setAttribute('aria-selected', String(t === tab));
    if (panel) panel.hidden = (t !== tab);
  });
  if (tab === 'items') renderAdminItems();
  if (tab === 'suppliers') renderAdminSuppliers();
  if (tab === 'gas') renderAdminGas();
}

// --- 鋼材マスタ ---
function renderAdminItems() {
  const listEl = document.getElementById('ord-admin-items-list');
  if (!listEl) return;
  const visibleItems = _items.filter(it => it.active !== false);
  if (visibleItems.length === 0) {
    listEl.innerHTML = '<p class="ord-empty">登録なし</p>';
    return;
  }
  const matMap = { steel: 'S', stainless: 'SUS' };
  // カテゴリ別グループ表示
  const grouped = {};
  visibleItems.forEach(it => {
    const cat = it.itemCategory || it.name || '鋼材';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(it);
  });
  listEl.innerHTML = Object.entries(grouped).map(([cat, items]) => `
    <div class="ord-admin-cat-group">
      <div class="ord-admin-cat-header">${esc(cat)} <span class="ord-category-count">${items.length}件</span></div>
      ${items.map(item => `
        <div class="ord-admin-row" data-id="${esc(item.id)}">
          <span class="ord-admin-item-info">
            <strong>${esc(item.spec)}</strong>
            <span class="ord-mat-badge">${matMap[item.materialType || 'steel'] || 'S'}</span>
            <span class="ord-lengths-tag">${(item.availableLengths || []).join(' / ')}</span>
          </span>
          <div class="ord-admin-actions">
            <button class="btn-modal-secondary ord-admin-edit-item" data-id="${esc(item.id)}">編集</button>
            <button class="btn-modal-danger ord-admin-del-item" data-id="${esc(item.id)}">削除</button>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

function setItemFormMode(item = null) {
  _editingItemId = item?.id || null;
  const titleEl = document.getElementById('ord-item-form-title');
  const noteEl = document.getElementById('ord-item-edit-note');
  const addBtn = document.getElementById('ord-item-add-btn');
  const cancelBtn = document.getElementById('ord-item-edit-cancel');
  const categoryEl = document.getElementById('ord-item-add-category');
  const specEl = document.getElementById('ord-item-add-spec');
  const materialEl = document.getElementById('ord-item-add-material');
  const lengthsEl = document.getElementById('ord-item-add-lengths');
  const typeEl = document.getElementById('ord-item-add-type');

  if (titleEl) titleEl.textContent = item ? '鋼材を編集' : '新規追加';
  if (noteEl) {
    noteEl.hidden = !item;
    noteEl.textContent = item ? `${item.itemCategory || item.name || '鋼材'} / ${item.spec || ''} を編集中` : '';
  }
  if (addBtn) addBtn.textContent = item ? '更新' : '追加';
  if (cancelBtn) cancelBtn.hidden = !item;
  if (categoryEl) categoryEl.value = item ? (item.itemCategory || item.name || '') : '';
  if (specEl) specEl.value = item ? (item.spec || '') : '';
  if (materialEl) materialEl.value = item ? (item.materialType || 'steel') : 'steel';
  if (lengthsEl) lengthsEl.value = item ? (item.availableLengths || []).join(',') : '';
  if (typeEl) typeEl.value = item ? normalizeOrderItemType(item) : 'both';
}

function resetItemForm() {
  setItemFormMode(null);
}

async function addOrUpdateItem(id, data) {
  try {
    const sharedData = normalizeSharedOrderItem(data);
    if (isSupabaseSharedCoreEnabled()) {
      // 既存データとマージしてupsert（sortOrder・defaultQty等を保持）
      const existing = id ? _items.find(it => it.id === id) : null;
      await upsertOrderItemInSupabase({ ...(existing || {}), ...sharedData, ...(id ? { id } : {}) });
    } else if (id) {
      await updateDoc(doc(db, 'order_items', id), sharedData);
    } else {
      await addDoc(collection(db, 'order_items'), { ...sharedData, active: true });
    }
    await loadMasters();
    renderAdminItems();
    renderCategoryTabs();
    renderOrderItemList();
  } catch (err) {
    alert('保存に失敗しました: ' + err.message);
  }
}

async function deleteItem(id) {
  if (!confirm('この鋼材を削除しますか？')) return;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await deactivateOrderItemInSupabase(id);
    } else {
      await updateDoc(doc(db, 'order_items', id), { active: false });
    }
    if (_editingItemId === id) resetItemForm();
    await loadMasters();
    renderAdminItems();
    renderCategoryTabs();
    renderOrderItemList();
  } catch (err) {
    alert('削除に失敗しました: ' + err.message);
  }
}

// --- 発注先 ---
function setSupplierFormMode(supplier = null) {
  _editingSupplierId = supplier?.id || null;
  const isEditing = Boolean(supplier);
  const title = document.getElementById('ord-supp-form-title');
  const note = document.getElementById('ord-supp-edit-note');
  const addBtn = document.getElementById('ord-supp-add-btn');
  const cancelBtn = document.getElementById('ord-supp-edit-cancel');
  const nameEl = document.getElementById('ord-supp-add-name');
  const emailEl = document.getElementById('ord-supp-add-email');
  const telEl = document.getElementById('ord-supp-add-tel');
  const addrEl = document.getElementById('ord-supp-add-addr');

  if (title) title.textContent = isEditing ? '発注先を編集' : '新規追加';
  if (note) {
    note.hidden = !isEditing;
    note.textContent = isEditing ? `${supplier.name || '発注先'} を編集中` : '';
  }
  if (addBtn) addBtn.textContent = isEditing ? '更新' : '追加';
  if (cancelBtn) cancelBtn.hidden = !isEditing;
  if (nameEl) nameEl.value = supplier?.name || '';
  if (emailEl) emailEl.value = supplier?.email || '';
  if (telEl) telEl.value = supplier?.tel || '';
  if (addrEl) addrEl.value = supplier?.address || '';
}

function resetSupplierForm() {
  setSupplierFormMode(null);
}

function renderAdminSuppliers() {
  const listEl = document.getElementById('ord-admin-suppliers-list');
  if (!listEl) return;
  if (_suppliers.length === 0) {
    listEl.innerHTML = '<p class="ord-empty">登録なし</p>';
    return;
  }
  listEl.innerHTML = _suppliers.map(s => `
    <div class="ord-admin-row" data-id="${esc(s.id)}">
      <span class="ord-admin-item-info">
        <strong>${esc(s.name)}</strong>　${esc(s.email)}　${esc(s.tel || '')}
      </span>
      <div class="ord-admin-actions">
        <button class="btn-modal-secondary ord-admin-edit-supp" data-id="${esc(s.id)}">編集</button>
      </div>
    </div>`).join('');
}

// --- GAS設定 ---
function renderAdminGas() {
  const input = document.getElementById('ord-gas-url-input');
  if (input) input.value = _gasUrl;
  renderGasStatus();
}

function renderGasStatus() {
  const status = document.getElementById('ord-gas-status');
  if (!status) return;
  const configured = Boolean(_gasUrl);
  status.className = `ord-gas-status ${configured ? 'ord-gas-status--ready' : 'ord-gas-status--missing'}`;
  status.innerHTML = configured
    ? '<i class="fa-solid fa-circle-check"></i><div><strong>メール送信設定済み</strong><span>プレビュー画面から発注メールを送信できます。</span></div>'
    : '<i class="fa-solid fa-triangle-exclamation"></i><div><strong>メール送信は未設定</strong><span>GAS Webアプリ URLを保存するまで、発注メールは送信できません。</span></div>';
}

async function saveGasUrl() {
  const input = document.getElementById('ord-gas-url-input');
  if (!input) return;
  const url = input.value.trim();
  if (url && !/^https:\/\/script\.google\.com\/macros\/s\//.test(url)) {
    alert('GAS Webアプリ URLを入力してください。URLは https://script.google.com/macros/s/... で始まる形式です。');
    input.focus();
    return;
  }
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await savePortalConfigToSupabase({ gasOrderUrl: url });
    } else {
      await setDoc(doc(db, 'portal', 'config'), { gasOrderUrl: url }, { merge: true });
    }
    _gasUrl = url;
    renderGasStatus();
    alert('GAS URLを保存しました。');
  } catch (err) {
    alert('保存に失敗しました: ' + err.message);
  }
}

// ===== イベントハンドラ登録 =====
function bindOrderEvents() {
  // 発注モーダル
  document.getElementById('ord-modal-close')?.addEventListener('click', closeOrderModal);
  document.getElementById('ord-btn-cancel')?.addEventListener('click', closeOrderModal);
  document.getElementById('ord-btn-history')?.addEventListener('click', () => {
    void openOrderHistoryModal();
  });
  document.getElementById('ord-nav-compose')?.addEventListener('click', () => setOrderWorkspaceView('compose'));
  document.getElementById('ord-btn-email')?.addEventListener('click', openPreviewModal);
  document.getElementById('ord-btn-print')?.addEventListener('click', printDraftOrder);
  document.getElementById('ord-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('ord-modal')) closeOrderModal();
  });

  // 送信内容の確認
  document.getElementById('ord-preview-close')?.addEventListener('click', closePreviewModal);
  document.getElementById('ord-preview-back')?.addEventListener('click', closePreviewModal);
  document.getElementById('ord-preview-send')?.addEventListener('click', submitFromPreview);

  // 検索バー
  document.getElementById('ord-search-input')?.addEventListener('input', e => {
    _searchQuery = e.target.value;
    document.getElementById('ord-search-clear')?.toggleAttribute('hidden', !_searchQuery);
    renderOrderItemList();
  });
  document.getElementById('ord-search-clear')?.addEventListener('click', () => {
    _searchQuery = '';
    const el = document.getElementById('ord-search-input');
    if (el) { el.value = ''; el.focus(); }
    document.getElementById('ord-search-clear')?.toggleAttribute('hidden', true);
    renderOrderItemList();
  });

  // 選択済みのみ表示トグル
  document.getElementById('ord-show-selected')?.addEventListener('change', e => {
    _showSelectedOnly = e.target.checked;
    renderOrderItemList();
  });

  document.getElementById('ord-item-list')?.addEventListener('click', e => {
    const action = e.target.closest('[data-ord-empty-action]')?.dataset.ordEmptyAction;
    if (!action) return;
    if (action === 'clear-search') {
      _searchQuery = '';
      const el = document.getElementById('ord-search-input');
      if (el) el.value = '';
      document.getElementById('ord-search-clear')?.toggleAttribute('hidden', true);
      renderOrderItemList();
      return;
    }
    if (action === 'clear-category') {
      _categoryFilter = 'all';
      const sel = document.getElementById('ord-cat-select');
      if (sel) sel.value = 'all';
      renderOrderItemList();
      return;
    }
    if (action === 'all-material') {
      switchMaterialFilter('all');
      return;
    }
    if (action === 'show-all') {
      _showSelectedOnly = false;
      const selectedToggle = document.getElementById('ord-show-selected');
      if (selectedToggle) selectedToggle.checked = false;
      renderOrderItemList();
      return;
    }
    if (action === 'reset') {
      resetOrderItemFilters();
      return;
    }
    if (action === 'admin') {
      openOrderAdminModal();
    }
  });

  // カテゴリドロップダウン
  document.getElementById('ord-cat-select')?.addEventListener('change', e => {
    _categoryFilter = e.target.value;
    renderOrderItemList();
  });

  // 素材フィルタ
  document.getElementById('ord-material-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.ord-material-tab');
    if (btn) switchMaterialFilter(btn.dataset.type);
  });

  // 発注区分トグル
  document.getElementById('ord-type-factory')?.addEventListener('click', () => switchOrderType('factory'));
  document.getElementById('ord-type-site')?.addEventListener('click', () => switchOrderType('site'));

  // マスタにない品目を今回の発注へ追加
  document.getElementById('ord-add-custom-btn')?.addEventListener('click', () => {
    const item = { id: `custom-${Date.now()}-${++_customItemSeq}`, name: '', spec: '', unit: '本', qty: 1 };
    _customItems.push(item);
    renderSelectedSummary();
    document.querySelector(`[data-custom-id="${item.id}"] [data-ord-custom-field="name"]`)?.focus();
  });

  document.getElementById('ord-selected-summary')?.addEventListener('click', event => {
    const removeMaster = event.target.closest('[data-ord-remove-item]');
    if (removeMaster) {
      const id = removeMaster.dataset.ordRemoveItem;
      const saved = _checkedItems.get(id);
      if (saved) _checkedItems.set(id, { ...saved, checked: false });
      renderOrderItemList();
      return;
    }
    const removeCustom = event.target.closest('[data-ord-remove-custom]');
    if (removeCustom) {
      _customItems = _customItems.filter(item => item.id !== removeCustom.dataset.ordRemoveCustom);
      renderSelectedSummary();
    }
  });

  document.getElementById('ord-selected-summary')?.addEventListener('input', event => {
    const masterId = event.target.dataset.ordSelectedQty;
    if (masterId) {
      const saved = _checkedItems.get(masterId);
      if (saved) _checkedItems.set(masterId, { ...saved, qty: Number.parseInt(event.target.value, 10) || 1 });
      return;
    }
    const field = event.target.dataset.ordCustomField;
    const customRow = event.target.closest('[data-custom-id]');
    if (!field || !customRow) return;
    const item = _customItems.find(entry => entry.id === customRow.dataset.customId);
    if (!item) return;
    item[field] = field === 'qty' ? (Number.parseInt(event.target.value, 10) || 1) : event.target.value;
  });

  // 履歴詳細
  document.getElementById('ord-history-list')?.addEventListener('click', e => {
    const detailBtn = e.target.closest('.ord-history-detail-btn');
    if (detailBtn) {
      openOrderDetailModal(detailBtn.dataset.id);
      return;
    }
    const deleteBtn = e.target.closest('.ord-history-delete-btn');
    if (deleteBtn) {
      deleteOrderHistory(deleteBtn.dataset.id);
      return;
    }
    const restoreBtn = e.target.closest('.ord-history-restore-btn');
    if (restoreBtn) {
      restoreOrderHistory(restoreBtn.dataset.id);
    }
  });
  document.getElementById('ord-history-project-filter')?.addEventListener('input', e => {
    state.orderHistoryProjectKeyFilter = normalizeProjectKey(e.target.value || '');
    renderHistoryList();
  });
  document.getElementById('ord-history-project-filter-clear')?.addEventListener('click', () => {
    state.orderHistoryProjectKeyFilter = '';
    const input = document.getElementById('ord-history-project-filter');
    if (input) {
      input.value = '';
      input.focus();
    }
    renderHistoryList();
  });
  document.getElementById('ord-detail-close')?.addEventListener('click', closeOrderDetailModal);
  document.getElementById('ord-detail-close2')?.addEventListener('click', closeOrderDetailModal);
  document.getElementById('ord-detail-print-btn')?.addEventListener('click', () => {
    const orderId = document.getElementById('ord-detail-print-btn')?.dataset.id;
    const order = findOrderById(orderId);
    if (order) {
      const now = toDateValue(order.orderedAt) || new Date();
      printOrder({ ...order, orderedAt: now, orderId });
    }
  });
  document.getElementById('ord-detail-delete-btn')?.addEventListener('click', () => {
    const orderId = document.getElementById('ord-detail-delete-btn')?.dataset.id;
    if (orderId) deleteOrderHistory(orderId);
  });
  document.getElementById('ord-detail-restore-btn')?.addEventListener('click', () => {
    const orderId = document.getElementById('ord-detail-restore-btn')?.dataset.id;
    if (orderId) restoreOrderHistory(orderId);
  });

  // 履歴画面
  document.getElementById('ord-history-close')?.addEventListener('click', closeOrderHistoryModal);
  document.getElementById('ord-period-prev')?.addEventListener('click', async () => {
    _historyOffset--;
    await renderHistory();
  });
  document.getElementById('ord-period-next')?.addEventListener('click', async () => {
    _historyOffset++;
    await renderHistory();
  });

  // 管理画面
  document.getElementById('ord-admin-close')?.addEventListener('click', closeOrderAdminModal);

  // タブ切替
  ['items', 'suppliers', 'gas'].forEach(tab => {
    document.getElementById(`ord-admin-tab-${tab}`)?.addEventListener('click', () => switchOrderAdminTab(tab));
  });

  // 鋼材マスタ: 追加
  document.getElementById('ord-item-add-btn')?.addEventListener('click', async () => {
    const category = document.getElementById('ord-item-add-category')?.value.trim();
    const spec     = document.getElementById('ord-item-add-spec')?.value.trim() || '';
    const material = document.getElementById('ord-item-add-material')?.value || 'steel';
    const rawLen   = document.getElementById('ord-item-add-lengths')?.value.trim() || '';
    const lengths  = parseOrderLengths(rawLen);
    const ordType  = document.getElementById('ord-item-add-type')?.value || 'both';
    if (!category || !spec) { alert('品種とサイズは必須です。'); return; }
    const itemId = _editingItemId;
    const payload = {
      itemCategory: category, name: category, spec, materialType: material,
      availableLengths: lengths, unit: '本',
      orderType: ordType
    };
    if (!itemId) {
      payload.defaultQty = 1;
      payload.sortOrder = _items.length + 1;
    }
    await addOrUpdateItem(itemId, payload);
    resetItemForm();
  });
  document.getElementById('ord-item-edit-cancel')?.addEventListener('click', resetItemForm);

  // 鋼材マスタ: 編集・削除（委譲）
  document.getElementById('ord-admin-items-list')?.addEventListener('click', async e => {
    const editBtn = e.target.closest('.ord-admin-edit-item');
    const delBtn  = e.target.closest('.ord-admin-del-item');
    if (delBtn) {
      await deleteItem(delBtn.dataset.id);
    } else if (editBtn) {
      const id = editBtn.dataset.id;
      const item = _items.find(it => it.id === id);
      if (!item) return;
      setItemFormMode(item);
      document.querySelector('.ord-admin-add-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      document.getElementById('ord-item-add-category')?.focus();
    }
  });

  // 発注先: 編集（委譲）
  document.getElementById('ord-admin-suppliers-list')?.addEventListener('click', async e => {
    const editBtn = e.target.closest('.ord-admin-edit-supp');
    if (!editBtn) return;
    const id = editBtn.dataset.id;
    const supp = _suppliers.find(s => s.id === id);
    if (!supp) return;
    setSupplierFormMode(supp);
    document.getElementById('ord-supp-form-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('ord-supp-add-name')?.focus();
  });

  document.getElementById('ord-supp-edit-cancel')?.addEventListener('click', resetSupplierForm);

  // 発注先: 追加
  document.getElementById('ord-supp-add-btn')?.addEventListener('click', async () => {
    const name  = document.getElementById('ord-supp-add-name')?.value.trim();
    const email = document.getElementById('ord-supp-add-email')?.value.trim();
    const tel   = document.getElementById('ord-supp-add-tel')?.value.trim() || '';
    const addr  = document.getElementById('ord-supp-add-addr')?.value.trim() || '';
    if (!name || !email) { alert('会社名とメールアドレスは必須です。'); return; }
    const supplierId = _editingSupplierId;
    const payload = { name, email, tel, address: addr };
    try {
      if (supplierId) {
        if (isSupabaseSharedCoreEnabled()) {
          await updateOrderSupplierInSupabase(supplierId, payload);
        } else {
          await updateDoc(doc(db, 'order_suppliers', supplierId), payload);
        }
      } else {
        if (isSupabaseSharedCoreEnabled()) {
          await createOrderSupplierInSupabase(payload);
        } else {
          await addDoc(collection(db, 'order_suppliers'), {
            ...payload, active: true, createdAt: serverTimestamp()
          });
        }
      }
      await loadMasters();
      renderSupplierSelect(supplierId);
      renderAdminSuppliers();
      resetSupplierForm();
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
    }
  });

  // GAS URL保存
  document.getElementById('ord-gas-save-btn')?.addEventListener('click', saveGasUrl);
}
