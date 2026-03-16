// ========== attendance-work.js — 勤務内容表 / 勤務内容集計表 / 登録現場 ==========
import { state } from './state.js';
import {
  db, collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, deleteField
} from './config.js';
import { esc } from './utils.js';

let deps = {};
let eventsBound = false;

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const PERSONAL_TABS = ['calendar', 'work', 'summary', 'sites'];

export function initAttendanceWork(d) {
  deps = d || {};
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toYearMonth(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function formatPeriodLabel(period) {
  const s = period.start;
  const e = period.end;
  return `${s.getFullYear()}年 ${pad2(s.getMonth() + 1)}月 ${pad2(s.getDate())}日 〜 ${pad2(e.getMonth() + 1)}月 ${pad2(e.getDate())}日`;
}

function getWorkPeriod() {
  // 既存仕様の「21日締め」を使用（前月21日〜当月20日）
  const start = new Date(state.calendarYear, state.calendarMonth - 1, 21);
  const end = new Date(state.calendarYear, state.calendarMonth, 20);
  return {
    start,
    end,
    startStr: toDateStr(start),
    endStr: toDateStr(end),
    label: formatPeriodLabel({ start, end }),
  };
}

function getPeriodDates(period) {
  const dates = [];
  const cur = new Date(period.start);
  while (cur <= period.end) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function getPeriodYearMonths(period) {
  const yms = new Set();
  const cur = new Date(period.start.getFullYear(), period.start.getMonth(), 1);
  const end = new Date(period.end.getFullYear(), period.end.getMonth(), 1);
  while (cur <= end) {
    yms.add(toYearMonth(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return [...yms];
}

function normalizeHours(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 2) / 2; // 0.5h 刻み
}

function fmtHours(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
}

function fmtYen(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return '0円';
  return `${Math.round(n).toLocaleString('ja-JP')}円`;
}

function getActiveSites() {
  return (state.attendanceSites || []).filter(s => s.active !== false);
}

function sanitizeWorkSiteHours(src) {
  if (!src || typeof src !== 'object') return {};
  const out = {};
  Object.entries(src).forEach(([siteId, val]) => {
    const h = normalizeHours(val);
    if (h > 0) out[siteId] = h;
  });
  return out;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderEmpty(containerId, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="calw-empty">${esc(message)}</div>`;
}

async function loadUserPeriodAttendance(username, period) {
  if (!username) return {};
  const yms = getPeriodYearMonths(period);
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

  const map = {};
  snaps.forEach(snap => {
    snap.docs.forEach(d => {
      const dateStr = d.id;
      if (dateStr >= period.startStr && dateStr <= period.endStr) {
        map[dateStr] = d.data();
      }
    });
  });
  return map;
}

async function loadCurrentUserPeriodAttendance(period) {
  if (!state.currentUsername) {
    state.workPeriodAttendance = {};
    return;
  }
  state.workPeriodAttendance = await loadUserPeriodAttendance(state.currentUsername, period);
}

async function saveWorkHoursForCell(dateStr, siteId, hours) {
  if (!state.currentUsername || !dateStr || !siteId) return;

  const ref = doc(db, 'users', state.currentUsername, 'attendance', dateStr);
  const prevDoc = state.workPeriodAttendance[dateStr] || {};
  const nextMap = sanitizeWorkSiteHours(prevDoc.workSiteHours);

  if (hours > 0) nextMap[siteId] = hours;
  else delete nextMap[siteId];

  const hasMainAttendanceValue = !!(
    prevDoc.type ||
    prevDoc.hayade ||
    prevDoc.zangyo ||
    prevDoc.note
  );

  if (Object.keys(nextMap).length === 0) {
    if (!prevDoc || Object.keys(prevDoc).length === 0) return;

    if (hasMainAttendanceValue) {
      await updateDoc(ref, {
        workSiteHours: deleteField(),
        yearMonth: dateStr.slice(0, 7),
        updatedAt: serverTimestamp(),
      });
      const nextDoc = { ...prevDoc };
      delete nextDoc.workSiteHours;
      state.workPeriodAttendance[dateStr] = nextDoc;
      if (state.attendanceData[dateStr]) {
        delete state.attendanceData[dateStr].workSiteHours;
      }
      return;
    }

    await deleteDoc(ref);
    delete state.workPeriodAttendance[dateStr];
    delete state.attendanceData[dateStr];
    return;
  }

  const payload = {
    workSiteHours: nextMap,
    yearMonth: dateStr.slice(0, 7),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
  state.workPeriodAttendance[dateStr] = { ...prevDoc, ...payload };
  state.attendanceData[dateStr] = { ...(state.attendanceData[dateStr] || {}), ...payload };
}

async function renderWorkTable() {
  const containerId = 'calw-work-table-container';
  const container = document.getElementById(containerId);
  if (!container) return;

  const period = getWorkPeriod();
  setText('calw-work-period-label', period.label);

  if (!state.currentUsername) {
    renderEmpty(containerId, 'ユーザー名を設定すると勤務内容表を利用できます。');
    return;
  }

  const sites = getActiveSites();
  if (sites.length === 0) {
    renderEmpty(containerId, '登録現場がありません。「登録現場」タブで現場を追加してください。');
    return;
  }

  container.innerHTML = '<div class="calw-loading">勤務内容表を読み込み中...</div>';

  try {
    await loadCurrentUserPeriodAttendance(period);
  } catch (err) {
    console.error('勤務内容表データ読み込みエラー:', err);
    renderEmpty(containerId, '勤務内容表の読み込みに失敗しました。');
    return;
  }

  const dates = getPeriodDates(period);
  const siteTotals = {};
  sites.forEach(s => { siteTotals[s.id] = 0; });
  let grandTotal = 0;

  const theadSiteCols = sites.map(site => `
      <th class="calw-site-head" title="${esc(site.name || '')}">
        <span>${esc(site.code || '-') }</span>
        <small>${esc(site.name || '現場') }</small>
      </th>
    `).join('');

  const bodyRows = dates.map(dateStr => {
    const dt = new Date(`${dateStr}T00:00:00`);
    const day = dt.getDate();
    const dow = DOW_LABELS[dt.getDay()];
    const weekendCls = dt.getDay() === 0 ? ' calw-sun' : dt.getDay() === 6 ? ' calw-sat' : '';

    const att = state.workPeriodAttendance[dateStr] || {};
    const workMap = sanitizeWorkSiteHours(att.workSiteHours);
    let dayTotal = 0;

    const siteInputs = sites.map(site => {
      const h = Number(workMap[site.id]) || 0;
      if (h > 0) {
        dayTotal += h;
        siteTotals[site.id] += h;
      }
      const valueAttr = h > 0 ? ` value="${fmtHours(h)}"` : '';
      return `<td>
        <input
          type="number"
          class="calw-hours-input"
          min="0"
          step="0.5"
          inputmode="decimal"
          data-date="${dateStr}"
          data-site-id="${esc(site.id)}"
          placeholder="0"${valueAttr}
        >
      </td>`;
    }).join('');

    grandTotal += dayTotal;
    const typeLabel = att.type || '通常';
    const hayade = att.hayade ? `${fmtHours(att.hayade)}h` : '-';
    const zangyo = att.zangyo ? `${fmtHours(att.zangyo)}h` : '-';

    return `<tr class="calw-day-row${weekendCls}">
      <td class="calw-date-cell">${day}</td>
      <td class="calw-dow-cell">${dow}</td>
      <td>${esc(typeLabel)}</td>
      <td>${esc(hayade)}</td>
      <td>${esc(zangyo)}</td>
      ${siteInputs}
      <td class="calw-day-total">${fmtHours(dayTotal)}</td>
    </tr>`;
  }).join('');

  const footerSiteTotals = sites.map(site => `<th>${fmtHours(siteTotals[site.id] || 0)}</th>`).join('');

  container.innerHTML = `
    <div class="calw-work-table-wrap">
      <table class="calw-work-table">
        <thead>
          <tr>
            <th>日</th>
            <th>曜</th>
            <th>勤務区分</th>
            <th>早出</th>
            <th>残業</th>
            ${theadSiteCols}
            <th>日計</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr>
            <th colspan="5">合計</th>
            ${footerSiteTotals}
            <th>${fmtHours(grandTotal)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

async function renderWorkSummary() {
  const containerId = 'calw-summary-table-container';
  const container = document.getElementById(containerId);
  if (!container) return;

  const period = getWorkPeriod();
  state.workSummaryPeriodLabel = period.label;
  setText('calw-summary-period-label', period.label);
  setText('calw-summary-total-amount', '月額合計: 0円');

  container.innerHTML = '<div class="calw-loading">勤務内容を集計中...</div>';

  try {
    const usersSnap = await getDocs(collection(db, 'users_list'));
    const users = usersSnap.docs.map(d => d.id).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja'));
    if (state.currentUsername && !users.includes(state.currentUsername)) users.unshift(state.currentUsername);
    state.workSummaryUsers = users;

    if (users.length === 0) {
      renderEmpty(containerId, '集計対象ユーザーがいません。');
      return;
    }

    const userEntries = await Promise.all(
      users.map(async username => {
        const map = await loadUserPeriodAttendance(username, period);
        return { username, map };
      })
    );

    const siteMetaMap = new Map((state.attendanceSites || []).map(s => [s.id, s]));
    const rowsMap = new Map();

    const ensureRow = (siteId) => {
      if (rowsMap.has(siteId)) return rowsMap.get(siteId);
      const meta = siteMetaMap.get(siteId);
      const row = {
        siteId,
        code: meta?.code || '',
        name: meta?.name || `未登録現場(${siteId})`,
        unitPrice: Number(meta?.unitPrice) || 0,
        sortOrder: Number(meta?.sortOrder) || 999999,
        userHours: {},
        totalHours: 0,
        amount: 0,
      };
      rowsMap.set(siteId, row);
      return row;
    };

    userEntries.forEach(({ username, map }) => {
      Object.values(map).forEach(att => {
        const workMap = sanitizeWorkSiteHours(att.workSiteHours);
        Object.entries(workMap).forEach(([siteId, hours]) => {
          if (hours <= 0) return;
          const row = ensureRow(siteId);
          row.userHours[username] = (row.userHours[username] || 0) + hours;
          row.totalHours += hours;
        });
      });
    });

    const rows = [...rowsMap.values()]
      .map(r => ({ ...r, amount: r.totalHours * r.unitPrice }))
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        const c = (a.code || '').localeCompare(b.code || '', 'ja');
        if (c !== 0) return c;
        return (a.name || '').localeCompare(b.name || '', 'ja');
      });

    state.workSummaryRows = rows;

    if (rows.length === 0) {
      renderEmpty(containerId, 'この期間の勤務内容データはありません。');
      return;
    }

    const userTotals = {};
    users.forEach(u => { userTotals[u] = 0; });
    let grandHours = 0;
    let grandAmount = 0;

    const userCols = users.map(u => `<th>${esc(u)}</th>`).join('');
    const bodyRows = rows.map((row, idx) => {
      const userCells = users.map(u => {
        const h = Number(row.userHours[u]) || 0;
        userTotals[u] += h;
        return `<td class="calw-num">${h > 0 ? fmtHours(h) : ''}</td>`;
      }).join('');
      grandHours += row.totalHours;
      grandAmount += row.amount;
      return `<tr>
        <td class="calw-num">${idx + 1}</td>
        <td>${esc(row.code || '-')}</td>
        <td>${esc(row.name || '')}</td>
        ${userCells}
        <td class="calw-num calw-strong">${fmtHours(row.totalHours)}</td>
        <td class="calw-num calw-strong">${fmtYen(row.amount)}</td>
      </tr>`;
    }).join('');

    const footerUserCols = users.map(u => `<th class="calw-num">${fmtHours(userTotals[u] || 0)}</th>`).join('');

    setText('calw-summary-total-amount', `月額合計: ${fmtYen(grandAmount)}`);

    container.innerHTML = `
      <div class="calw-summary-table-wrap">
        <table class="calw-summary-table">
          <thead>
            <tr>
              <th>No</th>
              <th>現場コード</th>
              <th>現場名</th>
              ${userCols}
              <th>合計h</th>
              <th>金額</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
          <tfoot>
            <tr>
              <th colspan="3">合計</th>
              ${footerUserCols}
              <th class="calw-num">${fmtHours(grandHours)}</th>
              <th class="calw-num">${fmtYen(grandAmount)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  } catch (err) {
    console.error('勤務内容集計エラー:', err);
    renderEmpty(containerId, '勤務内容集計に失敗しました。');
  }
}

function renderAttendanceSiteTable() {
  const tbody = document.getElementById('calw-site-table-body');
  if (!tbody) return;

  const rows = [...(state.attendanceSites || [])].sort((a, b) => {
    const ao = Number(a.sortOrder) || 0;
    const bo = Number(b.sortOrder) || 0;
    if (ao !== bo) return ao - bo;
    return (a.code || '').localeCompare(b.code || '', 'ja');
  });

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="calw-empty-row">登録現場はまだありません。</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(site => `
    <tr>
      <td>${esc(site.code || '-')}</td>
      <td>${esc(site.name || '')}</td>
      <td class="calw-num">${site.unitPrice ? Number(site.unitPrice).toLocaleString('ja-JP') : '0'}</td>
      <td class="calw-site-actions">
        <button class="btn-modal-secondary calw-site-edit-btn" data-action="edit" data-id="${esc(site.id)}">編集</button>
        <button class="btn-modal-danger calw-site-del-btn" data-action="delete" data-id="${esc(site.id)}">削除</button>
      </td>
    </tr>
  `).join('');
}

async function addAttendanceSiteFromForm() {
  const codeEl = document.getElementById('calw-site-code-input');
  const nameEl = document.getElementById('calw-site-name-input');
  const priceEl = document.getElementById('calw-site-unit-price-input');
  const btn = document.getElementById('calw-site-add-btn');
  if (!codeEl || !nameEl || !priceEl || !btn) return;

  const code = codeEl.value.trim();
  const name = nameEl.value.trim();
  const unitPrice = Math.max(0, Math.round(Number(priceEl.value || 0) || 0));

  if (!name) {
    nameEl.focus();
    alert('現場名を入力してください。');
    return;
  }

  const maxOrder = (state.attendanceSites || []).reduce((mx, s) => {
    const so = Number(s.sortOrder) || 0;
    return so > mx ? so : mx;
  }, 0);

  btn.disabled = true;
  try {
    await addDoc(collection(db, 'attendance_sites'), {
      code: code || '',
      name,
      unitPrice,
      active: true,
      sortOrder: maxOrder + 1,
      updatedBy: state.currentUsername || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    codeEl.value = '';
    nameEl.value = '';
    priceEl.value = '';
    nameEl.focus();
  } catch (err) {
    console.error('登録現場追加エラー:', err);
    alert('登録現場の追加に失敗しました。');
  } finally {
    btn.disabled = false;
  }
}

async function editAttendanceSite(siteId) {
  const site = (state.attendanceSites || []).find(s => s.id === siteId);
  if (!site) return;

  const nextCode = prompt('現場コードを入力してください。', site.code || '');
  if (nextCode === null) return;
  const nextName = prompt('現場名を入力してください。', site.name || '');
  if (nextName === null) return;
  const nextPriceRaw = prompt('単価（円/時間）を入力してください。', String(site.unitPrice || 0));
  if (nextPriceRaw === null) return;

  const code = nextCode.trim();
  const name = nextName.trim();
  const unitPrice = Math.max(0, Math.round(Number(nextPriceRaw || 0) || 0));
  if (!name) {
    alert('現場名は必須です。');
    return;
  }

  try {
    await updateDoc(doc(db, 'attendance_sites', siteId), {
      code: code || '',
      name,
      unitPrice,
      updatedBy: state.currentUsername || '',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('登録現場更新エラー:', err);
    alert('登録現場の更新に失敗しました。');
  }
}

async function deleteAttendanceSite(siteId) {
  const site = (state.attendanceSites || []).find(s => s.id === siteId);
  if (!site) return;
  const ok = confirm(`「${site.name || '現場'}」を削除しますか？\n既存の勤務内容データは未登録現場として集計されます。`);
  if (!ok) return;

  try {
    await deleteDoc(doc(db, 'attendance_sites', siteId));
  } catch (err) {
    console.error('登録現場削除エラー:', err);
    alert('登録現場の削除に失敗しました。');
  }
}

function subscribeAttendanceSites() {
  if (state._attendanceSitesSub) return;
  state._attendanceSitesSub = onSnapshot(
    query(collection(db, 'attendance_sites'), orderBy('sortOrder', 'asc')),
    snap => {
      state.attendanceSites = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (state.calTab !== 'personal') return;
      if (state.calPersonalTab === 'sites') renderAttendanceSiteTable();
      if (state.calPersonalTab === 'work') void renderWorkTable();
      if (state.calPersonalTab === 'summary') void renderWorkSummary();
    },
    err => {
      console.error('登録現場購読エラー:', err);
      state.attendanceSites = [];
      if (state.calPersonalTab === 'sites') renderAttendanceSiteTable();
    }
  );
}

function unsubscribeAttendanceSites() {
  if (state._attendanceSitesSub) {
    state._attendanceSitesSub();
    state._attendanceSitesSub = null;
  }
}

function updatePersonalTabUi(tab) {
  PERSONAL_TABS.forEach(name => {
    document.getElementById(`calw-tab-${name}`)?.classList.toggle('active', tab === name);
    const view = document.getElementById(`calw-view-${name}`);
    if (view) view.style.display = tab === name ? '' : 'none';
  });
}

export async function switchCalPersonalTab(tab) {
  const next = PERSONAL_TABS.includes(tab) ? tab : 'calendar';
  state.calPersonalTab = next;
  updatePersonalTabUi(next);

  if (next === 'calendar') {
    deps.renderCalendar?.();
    deps.updateCalendarSummary?.();
    return;
  }
  if (next === 'work') {
    await renderWorkTable();
    return;
  }
  if (next === 'summary') {
    await renderWorkSummary();
    return;
  }
  renderAttendanceSiteTable();
}

async function onWorkTableInputChange(input) {
  const dateStr = input.dataset.date;
  const siteId = input.dataset.siteId;
  if (!dateStr || !siteId) return;

  const hours = normalizeHours(input.value);
  input.value = hours > 0 ? fmtHours(hours) : '';
  input.disabled = true;
  try {
    await saveWorkHoursForCell(dateStr, siteId, hours);
    await renderWorkTable();
  } catch (err) {
    console.error('勤務内容保存エラー:', err);
    alert('勤務内容の保存に失敗しました。');
  } finally {
    input.disabled = false;
  }
}

export async function onCalendarModalOpen() {
  state.calPersonalTab = 'calendar';
  subscribeAttendanceSites();
  await switchCalPersonalTab('calendar');
}

export function onCalendarModalClose() {
  unsubscribeAttendanceSites();
}

export async function onCalendarMonthChanged() {
  const period = getWorkPeriod();
  setText('calw-work-period-label', period.label);
  setText('calw-summary-period-label', period.label);

  if (state.calTab !== 'personal') return;
  if (state.calPersonalTab === 'work') await renderWorkTable();
  if (state.calPersonalTab === 'summary') await renderWorkSummary();
}

export function bindAttendanceWorkEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.querySelectorAll('.calw-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      void switchCalPersonalTab(btn.dataset.tab || 'calendar');
    });
  });

  document.getElementById('calw-work-table-container')?.addEventListener('change', e => {
    const input = e.target.closest('.calw-hours-input');
    if (!input) return;
    void onWorkTableInputChange(input);
  });

  document.getElementById('calw-summary-refresh-btn')?.addEventListener('click', () => {
    void renderWorkSummary();
  });

  document.getElementById('calw-site-add-btn')?.addEventListener('click', () => {
    void addAttendanceSiteFromForm();
  });

  ['calw-site-code-input', 'calw-site-name-input', 'calw-site-unit-price-input'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void addAttendanceSiteFromForm();
      }
    });
  });

  document.getElementById('calw-site-table-body')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action][data-id]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!id) return;
    if (action === 'edit') void editAttendanceSite(id);
    if (action === 'delete') void deleteAttendanceSite(id);
  });
}
