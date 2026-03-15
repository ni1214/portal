// ========== 鋼材発注 (order.js) ==========
import {
  db, doc, getDoc, setDoc, addDoc, getDocs, updateDoc, deleteDoc,
  collection, query, where, orderBy,
  serverTimestamp
} from './config.js';
import { state } from './state.js';
import { esc } from './utils.js';

// ===== 内部状態 =====
let _suppliers = [];   // order_suppliers
let _items = [];       // order_items
let _historyOffset = 0; // 履歴期間オフセット（0=今期）
let _gasUrl = '';
let _orderType = 'factory'; // 現在選択中の発注区分

// ===== Firestore 初期データ投入 =====
async function seedInitialData() {
  try {
    const suppSnap = await getDocs(collection(db, 'order_suppliers'));
    let suppId;
    if (suppSnap.empty) {
      const suppRef = await addDoc(collection(db, 'order_suppliers'), {
        name: '土屋鋼材株式会社',
        email: 'info@tsuchiyakouzai.com',
        tel: '027-346-4700',
        address: '〒370-1201 群馬県高崎市倉賀野町2459-11',
        active: true,
        createdAt: serverTimestamp()
      });
      suppId = suppRef.id;
    } else {
      suppId = suppSnap.docs[0].id;
    }

    const itemSnap = await getDocs(collection(db, 'order_items'));
    if (itemSnap.empty) {
      await addDoc(collection(db, 'order_items'), {
        name: 'FB（ミガキ）',
        spec: '６x30　L＝4m',
        unit: '本',
        defaultQty: 1,
        supplierId: suppId,
        sortOrder: 1,
        orderType: 'factory',
        active: true
      });
    }
  } catch (err) {
    console.error('order: seedInitialData error', err);
  }
}

// ===== マスタ読み込み =====
async function loadMasters() {
  try {
    const [suppSnap, itemSnap, configSnap] = await Promise.all([
      getDocs(query(collection(db, 'order_suppliers'), where('active', '==', true))),
      getDocs(query(collection(db, 'order_items'), orderBy('sortOrder'))),
      getDoc(doc(db, 'portal', 'config'))
    ]);
    _suppliers = suppSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    _items = itemSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  await seedInitialData();
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
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const wd = WEEK_DAYS[d.getDay()];
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${wd}）${pad(d.getHours())}時${pad(d.getMinutes())}分`;
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

  const typeLabel = orderData.orderType === 'site' ? '現場向け' : '工場在庫';
  const siteInfo  = orderData.orderType === 'site' && orderData.siteName
    ? `現場名　：${orderData.siteName}\n` : '';

  const subject = `【鋼材発注・${typeLabel}】${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 - 日建フレメックス株式会社 生産管理課`;

  const itemLines = orderData.items.map((item, i) => {
    const no = String(i + 1).padStart(2, ' ');
    const label = `${item.name}　${item.spec}`;
    return `${no}    ${label}      ${item.qty}${item.unit}`;
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
${siteInfo}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
生産管理課
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  return { subject, body, toEmail: supplier.email || orderData.supplierEmail };
}

// ===== メール送信 =====
async function sendOrderEmail(orderData, orderId) {
  if (!_gasUrl) {
    alert('GAS URLが設定されていません。管理者に設定を依頼してください。');
    return false;
  }

  const { subject, body, toEmail } = buildEmailContent(orderData);

  try {
    await fetch(_gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toEmail, subject, body })
    });

    if (orderId) {
      await updateDoc(doc(db, 'orders', orderId), {
        emailSent: true,
        emailSentAt: serverTimestamp()
      });
    }
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
      <td>${esc(item.name)}　${esc(item.spec)}</td>
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
        <tr><th>発注区分</th><td>${orderData.orderType === 'site' ? '現場向け' : '工場在庫'}${orderData.siteName ? `　現場名：${esc(orderData.siteName)}` : ''}</td></tr>
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
    document.getElementById(`ord-type-${t}`)?.classList.toggle('active', t === type);
  });
  const siteGroup = document.getElementById('ord-site-name-group');
  if (siteGroup) siteGroup.hidden = (type !== 'site');
  renderOrderItemList();
}

function renderOrderItemList() {
  const listEl = document.getElementById('ord-item-list');
  if (!listEl) return;
  const filtered = _items.filter(it =>
    it.active !== false &&
    (it.orderType === _orderType || it.orderType === 'both' || !it.orderType)
  );
  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="ord-empty">この区分の鋼材が登録されていません<br><small>⚙設定 → 鋼材マスタで追加できます</small></p>`;
    return;
  }
  listEl.innerHTML = filtered.map(item => `
    <div class="ord-item-row" data-id="${esc(item.id)}">
      <input type="checkbox" class="ord-item-check" id="ord-chk-${esc(item.id)}" checked>
      <label for="ord-chk-${esc(item.id)}" class="ord-item-label">
        <span class="ord-item-name">${esc(item.name)}</span>
        <span class="ord-item-spec">${esc(item.spec)}</span>
      </label>
      <span class="ord-item-unit">${esc(item.unit)}</span>
      <input type="number" class="ord-qty-input form-input" value="${item.defaultQty || 1}" min="1" step="1">
    </div>`).join('');
}

// ===== 発注モーダル =====
export async function openOrderModal() {
  await loadMasters();

  const modal = document.getElementById('ord-modal');
  if (!modal) return;

  // 発注先プルダウンを構築
  const sel = document.getElementById('ord-supplier-select');
  if (sel) {
    sel.innerHTML = _suppliers.length
      ? _suppliers.map(s => `<option value="${esc(s.id)}">${esc(s.name)}　${esc(s.email)}</option>`).join('')
      : '<option value="">（発注先が登録されていません）</option>';
  }

  // 区分を工場在庫にリセット
  switchOrderType('factory');

  const siteNameEl = document.getElementById('ord-site-name');
  if (siteNameEl) siteNameEl.value = '';

  const noteEl = document.getElementById('ord-note');
  if (noteEl) noteEl.value = '';

  modal.classList.add('visible');
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

  const rows = document.querySelectorAll('#ord-item-list .ord-item-row');
  const selectedItems = [];
  rows.forEach(row => {
    const chk = row.querySelector('.ord-item-check');
    if (!chk || !chk.checked) return;
    if (row.dataset.id) {
      const item = _items.find(it => it.id === row.dataset.id);
      if (!item) return;
      const qty = parseInt(row.querySelector('.ord-qty-input').value, 10) || 1;
      selectedItems.push({ itemId: row.dataset.id, name: item.name, spec: item.spec, unit: item.unit, qty });
    } else {
      const name = row.querySelector('.ord-custom-name')?.value.trim();
      const spec = row.querySelector('.ord-custom-spec')?.value.trim() || '';
      const unit = row.querySelector('.ord-custom-unit')?.value.trim() || '';
      const qty  = parseInt(row.querySelector('.ord-qty-input')?.value, 10) || 1;
      if (name) selectedItems.push({ itemId: null, name, spec, unit, qty });
    }
  });

  if (selectedItems.length === 0) {
    alert('発注する鋼材を1つ以上選択してください。');
    return null;
  }

  const selEl = document.getElementById('ord-supplier-select');
  const supplier = _suppliers.find(s => s.id === selEl?.value) || _suppliers[0] || { id: '', name: '土屋鋼材株式会社', email: 'info@tsuchiyakouzai.com' };
  const note = document.getElementById('ord-note')?.value.trim() || '';

  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierEmail: supplier.email,
    orderType: _orderType,
    siteName: _orderType === 'site' ? siteName : null,
    items: selectedItems,
    orderedBy: username,
    note,
    _localNow: new Date()
  };
}

// プレビューモーダルを開く
let _pendingOrderData = null;
async function openPreviewModal() {
  const data = collectOrderData();
  if (!data) return;
  _pendingOrderData = data;

  const { subject, body, toEmail } = buildEmailContent({ ...data, orderedAt: data._localNow });

  document.getElementById('ord-preview-subject').textContent = subject;
  document.getElementById('ord-preview-to').textContent = toEmail;
  document.getElementById('ord-preview-body').textContent = body;

  document.getElementById('ord-modal').classList.remove('visible');
  document.getElementById('ord-preview-modal').classList.add('visible');
}

function closePreviewModal() {
  document.getElementById('ord-preview-modal').classList.remove('visible');
  document.getElementById('ord-modal').classList.add('visible');
}

// プレビューから実際に送信
async function submitFromPreview() {
  if (!_pendingOrderData) return;
  const data = _pendingOrderData;
  const nowLocal = data._localNow;

  const orderData = {
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    supplierEmail: data.supplierEmail,
    orderType: data.orderType,
    siteName: data.siteName,
    items: data.items,
    orderedBy: data.orderedBy,
    note: data.note,
    orderedAt: serverTimestamp(),
    emailSent: false,
    emailSentAt: null
  };

  try {
    const ref = await addDoc(collection(db, 'orders'), orderData);
    const orderId = ref.id;
    const localOrderData = { ...orderData, orderedAt: nowLocal, orderId };

    const btn = document.getElementById('ord-preview-send');
    if (btn) { btn.disabled = true; btn.textContent = '送信中...'; }
    const ok = await sendOrderEmail(localOrderData, orderId);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> この内容で送信'; }

    if (ok) {
      alert('メールを送信しました。');
      document.getElementById('ord-preview-modal').classList.remove('visible');
      _pendingOrderData = null;
    }
  } catch (err) {
    console.error('order: submitFromPreview error', err);
    alert('送信に失敗しました。\n' + err.message);
  }
}

async function submitOrder(sendEmail) {
  const data = collectOrderData();
  if (!data) return;
  const nowLocal = data._localNow;

  const orderData = {
    supplierId: data.supplierId, supplierName: data.supplierName,
    supplierEmail: data.supplierEmail, orderType: data.orderType,
    siteName: data.siteName, items: data.items, orderedBy: data.orderedBy,
    note: data.note, orderedAt: serverTimestamp(), emailSent: false, emailSentAt: null
  };

  try {
    const ref = await addDoc(collection(db, 'orders'), orderData);
    printOrder({ ...orderData, orderedAt: nowLocal, orderId: ref.id });
    closeOrderModal();
  } catch (err) {
    console.error('order: submitOrder error', err);
    alert('発注の保存に失敗しました。\n' + err.message);
  }
}

// ===== 履歴モーダル =====
// 1年以上古い発注データを自動削除（バックグラウンド実行）
async function purgeOldOrders() {
  try {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const snap = await getDocs(query(collection(db, 'orders'), where('orderedBy', '==', state.currentUsername)));
    const old = snap.docs.filter(d => {
      const t = d.data().orderedAt?.toDate?.() || new Date(d.data().orderedAt || 0);
      return t < cutoff;
    });
    await Promise.all(old.map(d => deleteDoc(doc(db, 'orders', d.id))));
    if (old.length > 0) console.log(`order: ${old.length}件の古い発注データを削除しました`);
  } catch (err) {
    console.warn('order: purgeOldOrders error', err);
  }
}

export async function openOrderHistoryModal() {
  _historyOffset = 0;
  await loadMasters();
  const modal = document.getElementById('ord-history-modal');
  if (!modal) return;
  modal.classList.add('visible');
  purgeOldOrders(); // バックグラウンドで古いデータを削除（完了を待たない）
  await renderHistory();
}

export function closeOrderHistoryModal() {
  const modal = document.getElementById('ord-history-modal');
  if (modal) modal.classList.remove('visible');
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
    // 複合インデックス不要: whereのみで取得し、ソート・期間フィルタはクライアントで実施
    let q;
    if (state.isAdmin) {
      q = query(collection(db, 'orders'));
    } else {
      q = query(collection(db, 'orders'), where('orderedBy', '==', username));
    }

    const snap = await getDocs(q);
    const orders = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => {
        if (!o.orderedAt) return false;
        const t = o.orderedAt.toDate ? o.orderedAt.toDate() : new Date(o.orderedAt);
        return t >= period.start && t <= period.end;
      })
      .sort((a, b) => {
        const ta = a.orderedAt.toDate ? a.orderedAt.toDate() : new Date(a.orderedAt);
        const tb = b.orderedAt.toDate ? b.orderedAt.toDate() : new Date(b.orderedAt);
        return tb - ta; // 新しい順
      });

    if (orders.length === 0) {
      listEl.innerHTML = '<p class="ord-empty">この期間の発注はありません</p>';
      return;
    }

    // 発注業者ごとにグループ化
    const grouped = {};
    orders.forEach(o => {
      const key = o.supplierName || '不明';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(o);
    });

    listEl.innerHTML = Object.entries(grouped).map(([supplierName, supplierOrders]) => {
      const rows = supplierOrders.map(o => {
        const itemsSummary = o.items.map(it => `${it.name}${it.spec ? ' ' + it.spec : ''} ${it.qty}${it.unit}`).join('、');
        // 工場在庫 or 現場名を表示
        const isFactory = !o.orderType || o.orderType === 'factory';
        const typeLabel = isFactory ? '工場在庫' : (o.siteName || '現場向け');
        const typeCls   = isFactory ? 'ord-type-badge--factory' : 'ord-type-badge--site';
        return `
          <div class="ord-history-item">
            <div class="ord-history-header">
              <span class="ord-history-date">${fmtDatetime(o.orderedAt)}</span>
              <span class="ord-type-badge ${typeCls}">${esc(typeLabel)}</span>
              <span class="ord-history-by">${esc(o.orderedBy)}</span>
            </div>
            <div class="ord-history-items">${esc(itemsSummary)}</div>
            ${o.note ? `<div class="ord-history-note">備考: ${esc(o.note)}</div>` : ''}
          </div>`;
      }).join('');

      return `
        <div class="ord-history-group">
          <div class="ord-history-group-header">
            <i class="fa-solid fa-building"></i> ${esc(supplierName)}
            <span class="ord-history-count">${supplierOrders.length}件</span>
          </div>
          ${rows}
        </div>`;
    }).join('');
  } catch (err) {
    console.error('order: renderHistory error', err);
    listEl.innerHTML = '<p class="ord-empty">読み込みに失敗しました</p>';
  }
}

// ===== 管理モーダル =====
export async function openOrderAdminModal() {
  const modal = document.getElementById('ord-admin-modal');
  if (!modal) return;
  await loadMasters();
  switchOrderAdminTab('items');
  modal.classList.add('visible');
}

export function closeOrderAdminModal() {
  const modal = document.getElementById('ord-admin-modal');
  if (modal) modal.classList.remove('visible');
}

async function openOrderAdminPanel() {
  await loadMasters();
  switchOrderAdminTab('items');
}

export function switchOrderAdminTab(tab) {
  ['items', 'suppliers', 'gas'].forEach(t => {
    const btn = document.getElementById(`ord-admin-tab-${t}`);
    const panel = document.getElementById(`ord-admin-panel-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
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
  const typeMap = { factory: '工場在庫', site: '現場向け', both: '両方' };
  listEl.innerHTML = visibleItems.map(item => `
    <div class="ord-admin-row" data-id="${esc(item.id)}">
      <span class="ord-admin-item-info">
        <strong>${esc(item.name)}</strong>　${esc(item.spec)}　単位:${esc(item.unit)}　デフォルト:${item.defaultQty}
        <span class="ord-type-badge ord-type-badge--${esc(item.orderType || 'factory')}">${typeMap[item.orderType] || '工場在庫'}</span>
      </span>
      <div class="ord-admin-actions">
        <button class="btn-modal-secondary ord-admin-edit-item" data-id="${esc(item.id)}">編集</button>
        <button class="btn-modal-danger ord-admin-del-item" data-id="${esc(item.id)}">削除</button>
      </div>
    </div>`).join('');
}

async function addOrUpdateItem(id, data) {
  try {
    if (id) {
      await updateDoc(doc(db, 'order_items', id), data);
    } else {
      await addDoc(collection(db, 'order_items'), { ...data, active: true });
    }
    await loadMasters();
    renderAdminItems();
  } catch (err) {
    alert('保存に失敗しました: ' + err.message);
  }
}

async function deleteItem(id) {
  if (!confirm('この鋼材を削除しますか？')) return;
  try {
    await updateDoc(doc(db, 'order_items', id), { active: false });
    await loadMasters();
    renderAdminItems();
  } catch (err) {
    alert('削除に失敗しました: ' + err.message);
  }
}

// --- 発注先 ---
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
}

async function saveGasUrl() {
  const input = document.getElementById('ord-gas-url-input');
  if (!input) return;
  const url = input.value.trim();
  try {
    await setDoc(doc(db, 'portal', 'config'), { gasOrderUrl: url }, { merge: true });
    _gasUrl = url;
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
    closeOrderModal();
    openOrderHistoryModal();
  });
  document.getElementById('ord-btn-email')?.addEventListener('click', openPreviewModal);
  document.getElementById('ord-btn-print')?.addEventListener('click', () => submitOrder(false));
  document.getElementById('ord-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('ord-modal')) closeOrderModal();
  });

  // プレビューモーダル
  document.getElementById('ord-preview-close')?.addEventListener('click', closePreviewModal);
  document.getElementById('ord-preview-back')?.addEventListener('click', closePreviewModal);
  document.getElementById('ord-preview-send')?.addEventListener('click', submitFromPreview);
  document.getElementById('ord-preview-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('ord-preview-modal')) closePreviewModal();
  });

  // 発注区分トグル
  document.getElementById('ord-type-factory')?.addEventListener('click', () => switchOrderType('factory'));
  document.getElementById('ord-type-site')?.addEventListener('click', () => switchOrderType('site'));

  // この発注に品目追加
  document.getElementById('ord-add-custom-btn')?.addEventListener('click', () => {
    const listEl = document.getElementById('ord-item-list');
    if (!listEl) return;
    const row = document.createElement('div');
    row.className = 'ord-item-row ord-item-row--custom';
    row.innerHTML = `
      <input type="checkbox" class="ord-item-check" checked>
      <div class="ord-custom-inputs">
        <input type="text" class="form-input ord-custom-name" placeholder="品名" maxlength="40">
        <input type="text" class="form-input ord-custom-spec" placeholder="規格" maxlength="40">
        <input type="text" class="form-input ord-custom-unit" placeholder="単位" maxlength="10" style="width:60px">
      </div>
      <input type="number" class="ord-qty-input form-input" value="1" min="1" step="1">
      <button class="ord-custom-del-btn" title="削除"><i class="fa-solid fa-xmark"></i></button>
    `;
    row.querySelector('.ord-custom-del-btn').addEventListener('click', () => row.remove());
    listEl.appendChild(row);
    row.querySelector('.ord-custom-name').focus();
  });

  // 履歴モーダル
  const backToOrder = () => { closeOrderHistoryModal(); openOrderModal(); };
  document.getElementById('ord-history-close')?.addEventListener('click', backToOrder);
  document.getElementById('ord-history-cancel')?.addEventListener('click', backToOrder);
  document.getElementById('ord-history-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('ord-history-modal')) backToOrder();
  });
  document.getElementById('ord-period-prev')?.addEventListener('click', async () => {
    _historyOffset--;
    await renderHistory();
  });
  document.getElementById('ord-period-next')?.addEventListener('click', async () => {
    _historyOffset++;
    await renderHistory();
  });

  // 管理モーダル
  document.getElementById('ord-admin-close')?.addEventListener('click', closeOrderAdminModal);
  document.getElementById('ord-admin-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('ord-admin-modal')) closeOrderAdminModal();
  });

  // タブ切替
  ['items', 'suppliers', 'gas'].forEach(tab => {
    document.getElementById(`ord-admin-tab-${tab}`)?.addEventListener('click', () => switchOrderAdminTab(tab));
  });

  // 鋼材マスタ: 追加
  document.getElementById('ord-item-add-btn')?.addEventListener('click', async () => {
    const name    = document.getElementById('ord-item-add-name')?.value.trim();
    const spec    = document.getElementById('ord-item-add-spec')?.value.trim() || '';
    const unit    = document.getElementById('ord-item-add-unit')?.value.trim();
    const qty     = parseInt(document.getElementById('ord-item-add-qty')?.value, 10) || 1;
    const ordType = document.getElementById('ord-item-add-type')?.value || 'factory';
    const suppId  = _suppliers[0]?.id || '';
    if (!name || !unit) { alert('品名と単位は必須です。'); return; }
    await addOrUpdateItem(null, { name, spec, unit, defaultQty: qty, orderType: ordType, supplierId: suppId, sortOrder: _items.length + 1 });
    ['ord-item-add-name', 'ord-item-add-spec', 'ord-item-add-unit'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const qtyEl = document.getElementById('ord-item-add-qty');
    if (qtyEl) qtyEl.value = '1';
  });

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
      const newName = prompt('品名:', item.name);
      if (newName === null) return;
      const newSpec = prompt('規格:', item.spec || '');
      if (newSpec === null) return;
      const newUnit = prompt('単位:', item.unit);
      if (newUnit === null) return;
      const newQty  = prompt('デフォルト数量:', String(item.defaultQty || 1));
      if (newQty === null) return;
      const newType = prompt('区分 (factory=工場在庫 / site=現場向け / both=両方):', item.orderType || 'factory');
      if (newType === null) return;
      const validType = ['factory', 'site', 'both'].includes(newType) ? newType : 'factory';
      await addOrUpdateItem(id, { name: newName, spec: newSpec, unit: newUnit, defaultQty: parseInt(newQty, 10) || 1, orderType: validType });
    }
  });

  // 発注先: 編集（委譲）
  document.getElementById('ord-admin-suppliers-list')?.addEventListener('click', async e => {
    const editBtn = e.target.closest('.ord-admin-edit-supp');
    if (!editBtn) return;
    const id = editBtn.dataset.id;
    const supp = _suppliers.find(s => s.id === id);
    if (!supp) return;
    const newName  = prompt('会社名:', supp.name);
    if (newName === null) return;
    const newEmail = prompt('メールアドレス:', supp.email);
    if (newEmail === null) return;
    const newTel   = prompt('電話番号:', supp.tel || '');
    if (newTel === null) return;
    const newAddr  = prompt('住所:', supp.address || '');
    if (newAddr === null) return;
    try {
      await updateDoc(doc(db, 'order_suppliers', id), { name: newName, email: newEmail, tel: newTel, address: newAddr });
      await loadMasters();
      renderAdminSuppliers();
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
    }
  });

  // 発注先: 追加
  document.getElementById('ord-supp-add-btn')?.addEventListener('click', async () => {
    const name  = document.getElementById('ord-supp-add-name')?.value.trim();
    const email = document.getElementById('ord-supp-add-email')?.value.trim();
    const tel   = document.getElementById('ord-supp-add-tel')?.value.trim() || '';
    const addr  = document.getElementById('ord-supp-add-addr')?.value.trim() || '';
    if (!name || !email) { alert('会社名とメールアドレスは必須です。'); return; }
    try {
      await addDoc(collection(db, 'order_suppliers'), {
        name, email, tel, address: addr, active: true, createdAt: serverTimestamp()
      });
      await loadMasters();
      renderAdminSuppliers();
      ['ord-supp-add-name','ord-supp-add-email','ord-supp-add-tel','ord-supp-add-addr'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
    }
  });

  // GAS URL保存
  document.getElementById('ord-gas-save-btn')?.addEventListener('click', saveGasUrl);
}
