import {
  db, collection, getDocs, query, where,
} from './config.js';
import { state, REQ_STATUS_LABEL, TASK_STATUS_LABEL } from './state.js';
import { esc, normalizeProjectKey, _fmtTs } from './utils.js';

let deps = {};
let eventsBound = false;

const ATTENDANCE_FALLBACK_MONTHS = 4;

export function initPropertySummary(d = {}) {
  deps = d;
  bindPropertySummaryEvents();
}

export function openPropertySummaryModal(initialProjectKey = '') {
  const modal = document.getElementById('prop-summary-modal');
  const input = document.getElementById('prop-summary-search-input');
  if (!modal || !input) return;

  state.propertySummaryModalOpen = true;
  modal.classList.add('visible');

  const normalized = normalizeProjectKey(initialProjectKey || '');
  if (normalized) {
    state.propertySummaryQuery = normalized;
    input.value = normalized;
    void searchPropertySummary(normalized);
    return;
  }

  input.value = state.propertySummaryQuery || '';
  renderPropertySummary();
  setTimeout(() => input.focus(), 30);
}

export function closePropertySummaryModal() {
  const modal = document.getElementById('prop-summary-modal');
  if (modal) modal.classList.remove('visible');
  state.propertySummaryModalOpen = false;
}

async function searchPropertySummary(rawValue = null) {
  const input = document.getElementById('prop-summary-search-input');
  const projectKey = normalizeProjectKey(rawValue ?? input?.value ?? '');

  state.propertySummaryQuery = projectKey;
  state.propertySummaryError = '';
  updateSearchControls();

  if (!projectKey) {
    state.propertySummaryResults = null;
    state.propertySummaryLoading = false;
    renderPropertySummary();
    input?.focus();
    return;
  }

  state.propertySummaryLoading = true;
  state.propertySummaryResults = null;
  renderPropertySummary();

  try {
    const [requestSnap, taskSnap, orderSnap, siteMap] = await Promise.all([
      getDocs(query(collection(db, 'cross_dept_requests'), where('projectKey', '==', projectKey))),
      getDocs(query(collection(db, 'assigned_tasks'), where('projectKey', '==', projectKey))),
      getDocs(query(collection(db, 'orders'), where('projectKey', '==', projectKey))),
      loadAttendanceSiteMap(),
    ]);

    let attendanceRecords = await loadAttendanceByProjectKey(state.currentUsername, projectKey, siteMap);
    let attendanceFallbackUsed = false;
    if (attendanceRecords.length === 0) {
      attendanceRecords = await loadAttendanceBySiteCode(state.currentUsername, projectKey, siteMap);
      attendanceFallbackUsed = attendanceRecords.length > 0;
    }

    const currentUser = state.currentUsername || '';
    const myDept = state.userEmailProfile?.department || '';

    const requests = requestSnap.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .filter(item => item.createdBy === currentUser || (myDept && item.toDept === myDept))
      .sort((a, b) => getDateValue(b.updatedAt || b.createdAt) - getDateValue(a.updatedAt || a.createdAt));

    const tasks = taskSnap.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .filter(item =>
        item.assignedBy === currentUser ||
        item.assignedTo === currentUser ||
        (Array.isArray(item.sharedWith) && item.sharedWith.includes(currentUser))
      )
      .sort((a, b) => getDateValue(b.doneAt || b.acceptedAt || b.createdAt) - getDateValue(a.doneAt || a.acceptedAt || a.createdAt));

    const orders = orderSnap.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .filter(item => state.isAdmin || item.orderedBy === currentUser)
      .sort((a, b) => getDateValue(b.orderedAt) - getDateValue(a.orderedAt));

    const siteMatch = [...siteMap.values()].find(site => normalizeProjectKey(site.code || '') === projectKey) || null;

    state.propertySummaryResults = {
      projectKey,
      siteMatch,
      requests,
      tasks,
      orders,
      attendance: attendanceRecords,
      attendanceFallbackUsed,
      counts: {
        requests: requests.length,
        tasks: tasks.length,
        orders: orders.length,
        attendance: attendanceRecords.length,
      },
      searchedAt: new Date(),
    };
  } catch (err) {
    console.error('property summary search error:', err);
    state.propertySummaryError = '物件Noの検索に失敗しました。時間をおいてもう一度お試しください。';
  } finally {
    state.propertySummaryLoading = false;
    renderPropertySummary();
  }
}

async function loadAttendanceSiteMap() {
  const existing = Array.isArray(state.attendanceSites) ? state.attendanceSites : [];
  if (existing.length > 0) {
    return new Map(existing.map(site => [site.id, site]));
  }
  const snap = await getDocs(query(collection(db, 'attendance_sites')));
  const sites = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  return new Map(sites.map(site => [site.id, site]));
}

async function loadAttendanceByProjectKey(username, projectKey, siteMap) {
  if (!username) return [];
  const snap = await getDocs(
    query(collection(db, 'users', username, 'attendance'), where('projectKeys', 'array-contains', projectKey))
  );
  return snap.docs
    .map(docSnap => mapAttendanceDoc(docSnap, siteMap, username))
    .filter(Boolean)
    .sort((a, b) => b.sortKey - a.sortKey);
}

async function loadAttendanceBySiteCode(username, projectKey, siteMap) {
  if (!username) return [];
  const months = getRecentYearMonths(ATTENDANCE_FALLBACK_MONTHS);
  if (months.length === 0) return [];
  const snap = await getDocs(
    query(collection(db, 'users', username, 'attendance'), where('yearMonth', 'in', months))
  );
  return snap.docs
    .map(docSnap => mapAttendanceDoc(docSnap, siteMap, username))
    .filter(record => record && record.siteEntries.some(entry => normalizeProjectKey(entry.code || '') === projectKey))
    .sort((a, b) => b.sortKey - a.sortKey);
}

function mapAttendanceDoc(docSnap, siteMap, username) {
  const data = docSnap.data() || {};
  const workSiteHours = (data.workSiteHours && typeof data.workSiteHours === 'object') ? data.workSiteHours : {};
  const siteEntries = Object.entries(workSiteHours)
    .map(([siteId, hours]) => {
      const numericHours = Number(hours);
      if (!Number.isFinite(numericHours) || numericHours <= 0) return null;
      const site = siteMap.get(siteId);
      return {
        siteId,
        code: site?.code || '',
        name: site?.name || `未登録現場(${siteId})`,
        hours: numericHours,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const codeA = Number(a.code || 0);
      const codeB = Number(b.code || 0);
      return codeA - codeB;
    });

  if (siteEntries.length === 0) return null;

  const dateStr = docSnap.id;
  const sortKey = getDateValue(dateStr ? new Date(`${dateStr}T00:00:00`) : data.updatedAt);
  return {
    id: docSnap.ref.path,
    username: username || '不明',
    dateStr,
    type: data.type || null,
    hayade: data.hayade || null,
    zangyo: data.zangyo || null,
    note: data.note || '',
    siteEntries,
    totalHours: siteEntries.reduce((sum, entry) => sum + entry.hours, 0),
    sortKey,
  };
}

function getRecentYearMonths(monthCount) {
  const months = [];
  const base = new Date();
  base.setDate(1);
  for (let i = 0; i < monthCount; i += 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(ym);
  }
  return months;
}

function getDateValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatDateLabel(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()}(${dow})`;
  }
  if (value instanceof Date) {
    return `${value.getMonth() + 1}/${value.getDate()}`;
  }
  return _fmtTs(value);
}

function formatTimestampLike(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const y = value.getFullYear();
    const mo = value.getMonth() + 1;
    const day = value.getDate();
    const h = String(value.getHours()).padStart(2, '0');
    const mi = String(value.getMinutes()).padStart(2, '0');
    return `${y}/${mo}/${day} ${h}:${mi}`;
  }
  return _fmtTs(value);
}

function fmtHours(hours) {
  if (!Number.isFinite(hours)) return '0';
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0$/, '');
}

function updateSearchControls() {
  const input = document.getElementById('prop-summary-search-input');
  const clearBtn = document.getElementById('prop-summary-search-clear');
  if (input && input.value !== (state.propertySummaryQuery || '')) {
    input.value = state.propertySummaryQuery || '';
  }
  if (clearBtn) clearBtn.hidden = !(state.propertySummaryQuery || '');
}

function renderPropertySummary() {
  updateSearchControls();

  const container = document.getElementById('prop-summary-content');
  if (!container) return;

  if (state.propertySummaryLoading) {
    container.innerHTML = `
      <div class="prop-summary-empty">
        <div class="spinner"></div>
        <p>物件Noを横断検索しています...</p>
      </div>
    `;
    return;
  }

  if (state.propertySummaryError) {
    container.innerHTML = `
      <div class="prop-summary-empty">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>${esc(state.propertySummaryError)}</p>
      </div>
    `;
    return;
  }

  const results = state.propertySummaryResults;
  if (!state.propertySummaryQuery) {
    container.innerHTML = `
      <div class="prop-summary-empty">
        <i class="fa-solid fa-magnifying-glass-chart"></i>
        <p>物件Noを入れると、依頼・タスク・鋼材発注・作業記録をまとめて確認できます。</p>
      </div>
    `;
    return;
  }

  if (!results) {
    container.innerHTML = `
      <div class="prop-summary-empty">
        <i class="fa-solid fa-magnifying-glass"></i>
        <p>検索ボタンで物件Noを横断検索します。</p>
      </div>
    `;
    return;
  }

  const totalHits = Object.values(results.counts).reduce((sum, count) => sum + count, 0);
  const siteLabel = results.siteMatch
    ? `<div class="prop-summary-context"><span class="prop-summary-context-label">登録現場</span><strong>${esc(results.siteMatch.code)} ${esc(results.siteMatch.name || '')}</strong></div>`
    : '';
  const searchedAt = results.searchedAt
    ? `<div class="prop-summary-context"><span class="prop-summary-context-label">検索時刻</span><strong>${esc(formatTimestampLike(results.searchedAt))}</strong></div>`
    : '';
  const fallbackNote = results.attendanceFallbackUsed
    ? `<div class="prop-summary-fallback"><i class="fa-solid fa-clock-rotate-left"></i> 作業記録は旧データ補完のため直近${ATTENDANCE_FALLBACK_MONTHS}か月分の現場コードも確認しました。</div>`
    : '';

  container.innerHTML = `
    <div class="prop-summary-overview">
      <div class="prop-summary-overview-header">
        <div>
          <div class="prop-summary-kicker">物件Noまとめ</div>
          <h3 class="prop-summary-title">${esc(results.projectKey)}</h3>
        </div>
        <div class="prop-summary-total">${totalHits}件ヒット</div>
      </div>
      <div class="prop-summary-contexts">
        ${siteLabel}
        ${searchedAt}
      </div>
      ${fallbackNote}
      <div class="prop-summary-stats">
        ${renderStatCard('部署間依頼', results.counts.requests, 'fa-solid fa-clipboard-list')}
        ${renderStatCard('タスク', results.counts.tasks, 'fa-solid fa-list-check')}
        ${renderStatCard('鋼材発注', results.counts.orders, 'fa-solid fa-boxes-stacked')}
        ${renderStatCard('作業記録', results.counts.attendance, 'fa-regular fa-calendar')}
      </div>
    </div>

    <div class="prop-summary-sections">
      ${renderRequestSection(results.requests)}
      ${renderTaskSection(results.tasks)}
      ${renderOrderSection(results.orders)}
      ${renderAttendanceSection(results.attendance)}
    </div>
  `;
}

function renderStatCard(label, count, icon) {
  return `
    <div class="prop-summary-stat-card">
      <div class="prop-summary-stat-icon"><i class="${icon}"></i></div>
      <div class="prop-summary-stat-value">${count}</div>
      <div class="prop-summary-stat-label">${label}</div>
    </div>
  `;
}

function renderRequestSection(requests) {
  const items = requests.length > 0
    ? requests.map(req => {
      const status = REQ_STATUS_LABEL[req.status] || { text: req.status || '不明', cls: '' };
      const linkedTask = req.linkedTaskStatus
        ? `<span class="prop-summary-mini-badge prop-summary-mini-badge--task"><i class="fa-solid fa-link"></i> タスク:${esc(req.linkedTaskStatus)}</span>`
        : '';
      const archived = req.archived
        ? '<span class="prop-summary-mini-badge"><i class="fa-solid fa-box-archive"></i> アーカイブ</span>'
        : '';
      return `
        <article class="prop-summary-item">
          <div class="prop-summary-item-head">
            <div class="prop-summary-item-title">${esc(req.title || '（件名なし）')}</div>
            <span class="req-status-badge ${status.cls}">${esc(status.text)}</span>
          </div>
          <div class="prop-summary-item-meta">${esc(req.fromDept || req.createdBy || '不明')} → ${esc(req.toDept || '不明')} / ${esc(_fmtTs(req.createdAt))}</div>
          <div class="prop-summary-item-body">${esc(req.content || '')}</div>
          <div class="prop-summary-item-tags">
            ${linkedTask}
            ${archived}
          </div>
        </article>
      `;
    }).join('')
    : '<div class="prop-summary-empty prop-summary-empty--section"><p>一致する部署間依頼はありません。</p></div>';

  return renderSection('部署間依頼', `${requests.length}件`, 'requests', 'fa-solid fa-clipboard-list', items);
}

function renderTaskSection(tasks) {
  const items = tasks.length > 0
    ? tasks.map(task => {
      const status = TASK_STATUS_LABEL[task.status] || { text: task.status || '不明', cls: '' };
      const dueDate = task.dueDate
        ? `<span class="prop-summary-mini-badge"><i class="fa-regular fa-calendar"></i> 期限 ${esc(task.dueDate)}</span>`
        : '';
      const sharedWith = Array.isArray(task.sharedWith) && task.sharedWith.length > 0
        ? `<span class="prop-summary-mini-badge"><i class="fa-solid fa-share-nodes"></i> 共有 ${task.sharedWith.length}人</span>`
        : '';
      return `
        <article class="prop-summary-item">
          <div class="prop-summary-item-head">
            <div class="prop-summary-item-title">${esc(task.title || '（件名なし）')}</div>
            <span class="task-status-badge ${status.cls}">${esc(status.text)}</span>
          </div>
          <div class="prop-summary-item-meta">${esc(task.assignedBy || '不明')} → ${esc(task.assignedTo || '不明')} / ${esc(_fmtTs(task.createdAt))}</div>
          ${task.description ? `<div class="prop-summary-item-body">${esc(task.description)}</div>` : ''}
          <div class="prop-summary-item-tags">
            ${dueDate}
            ${sharedWith}
          </div>
        </article>
      `;
    }).join('')
    : '<div class="prop-summary-empty prop-summary-empty--section"><p>一致するタスクはありません。</p></div>';

  return renderSection('タスク', `${tasks.length}件`, 'tasks', 'fa-solid fa-list-check', items);
}

function renderOrderSection(orders) {
  const items = orders.length > 0
    ? orders.map(order => {
      const emailStatus = order.emailSent
        ? '<span class="prop-summary-mini-badge prop-summary-mini-badge--done"><i class="fa-solid fa-envelope-circle-check"></i> 送信済み</span>'
        : '<span class="prop-summary-mini-badge prop-summary-mini-badge--warn"><i class="fa-solid fa-envelope"></i> 未送信</span>';
      const deleted = order.deletedAt
        ? '<span class="prop-summary-mini-badge"><i class="fa-solid fa-trash-can"></i> 削除済み</span>'
        : '';
      const typeLabel = order.orderType === 'site'
        ? `現場名発注 ${order.siteName ? `(${order.siteName})` : ''}`
        : '工場在庫';
      const itemCount = Array.isArray(order.items) ? order.items.length : 0;
      return `
        <article class="prop-summary-item">
          <div class="prop-summary-item-head">
            <div class="prop-summary-item-title">${esc(order.supplierName || '発注先未設定')}</div>
            <div class="prop-summary-item-date">${esc(_fmtTs(order.orderedAt))}</div>
          </div>
          <div class="prop-summary-item-meta">${esc(typeLabel)} / ${itemCount}明細 / 発注者 ${esc(order.orderedBy || '不明')}</div>
          <div class="prop-summary-item-tags">
            ${emailStatus}
            ${deleted}
          </div>
        </article>
      `;
    }).join('')
    : '<div class="prop-summary-empty prop-summary-empty--section"><p>一致する鋼材発注はありません。</p></div>';

  return renderSection('鋼材発注', `${orders.length}件`, 'orders', 'fa-solid fa-boxes-stacked', items);
}

function renderAttendanceSection(attendance) {
  const userCount = new Set(attendance.map(item => item.username)).size;
  const countText = attendance.length > 0 ? `${attendance.length}日 / ${userCount}人` : '0件';
  const items = attendance.length > 0
    ? attendance.map(record => {
      const typeLabel = record.type || '通常';
      const note = record.note
        ? `<div class="prop-summary-item-body prop-summary-item-body--note">メモ: ${esc(record.note)}</div>`
        : '';
      const timeBadges = [
        record.hayade ? `<span class="prop-summary-mini-badge"><i class="fa-solid fa-sun"></i> 早出 ${esc(record.hayade)}</span>` : '',
        record.zangyo ? `<span class="prop-summary-mini-badge"><i class="fa-solid fa-moon"></i> 残業 ${esc(record.zangyo)}</span>` : '',
      ].filter(Boolean).join('');
      return `
        <article class="prop-summary-item">
          <div class="prop-summary-item-head">
            <div class="prop-summary-item-title">${esc(record.username)}</div>
            <div class="prop-summary-item-date">${esc(formatDateLabel(record.dateStr))}</div>
          </div>
          <div class="prop-summary-item-meta">${esc(typeLabel)} / 合計 ${fmtHours(record.totalHours)}h</div>
          <div class="prop-summary-site-list">
            ${record.siteEntries.map(entry => `
              <div class="prop-summary-site-row">
                <span class="prop-summary-site-name">${esc(entry.code)} ${esc(entry.name)}</span>
                <span class="prop-summary-site-hours">${fmtHours(entry.hours)}h</span>
              </div>
            `).join('')}
          </div>
          ${note}
          <div class="prop-summary-item-tags">
            ${timeBadges}
          </div>
        </article>
      `;
    }).join('')
    : '<div class="prop-summary-empty prop-summary-empty--section"><p>一致する作業記録はありません。</p></div>';

  return renderSection('作業記録', countText, 'work', 'fa-regular fa-calendar', items);
}

function renderSection(title, countLabel, actionType, icon, bodyHtml) {
  const actionLabel = getActionLabel(actionType);
  return `
    <section class="prop-summary-section">
      <div class="prop-summary-section-header">
        <div class="prop-summary-section-title-wrap">
          <div class="prop-summary-section-icon"><i class="${icon}"></i></div>
          <div>
            <div class="prop-summary-section-title">${title}</div>
            <div class="prop-summary-section-count">${countLabel}</div>
          </div>
        </div>
        <button
          type="button"
          class="btn-modal-secondary prop-summary-open-btn"
          data-prop-summary-open="${actionType}"
        >${actionLabel}</button>
      </div>
      <div class="prop-summary-section-body">
        ${bodyHtml}
      </div>
    </section>
  `;
}

function getActionLabel(actionType) {
  switch (actionType) {
    case 'requests': return '依頼画面へ';
    case 'tasks': return 'タスク画面へ';
    case 'orders': return '履歴へ';
    case 'work': return '勤務内容表へ';
    default: return '開く';
  }
}

function bindPropertySummaryEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById('prop-summary-close')?.addEventListener('click', closePropertySummaryModal);
  document.getElementById('prop-summary-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closePropertySummaryModal();
  });

  document.getElementById('prop-summary-search-btn')?.addEventListener('click', () => {
    void searchPropertySummary();
  });
  document.getElementById('prop-summary-search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void searchPropertySummary();
    }
  });
  document.getElementById('prop-summary-search-input')?.addEventListener('input', e => {
    const nextValue = normalizeProjectKey(e.target.value || '');
    state.propertySummaryQuery = nextValue;
    if (state.propertySummaryResults?.projectKey !== nextValue) {
      state.propertySummaryResults = null;
      state.propertySummaryError = '';
      renderPropertySummary();
    }
    updateSearchControls();
  });
  document.getElementById('prop-summary-search-clear')?.addEventListener('click', () => {
    state.propertySummaryQuery = '';
    state.propertySummaryResults = null;
    state.propertySummaryError = '';
    state.propertySummaryLoading = false;
    updateSearchControls();
    renderPropertySummary();
    document.getElementById('prop-summary-search-input')?.focus();
  });

  document.getElementById('prop-summary-content')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-prop-summary-open]');
    if (!btn || !state.propertySummaryQuery) return;

    const queryValue = state.propertySummaryQuery;
    const actionType = btn.dataset.propSummaryOpen;
    closePropertySummaryModal();

    if (actionType === 'requests') {
      deps.openRequests?.(queryValue);
    } else if (actionType === 'tasks') {
      deps.openTasks?.(queryValue);
    } else if (actionType === 'orders') {
      deps.openOrders?.(queryValue);
    } else if (actionType === 'work') {
      deps.openWork?.(queryValue);
    }
  });
}
