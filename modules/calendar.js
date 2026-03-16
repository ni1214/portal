// ========== calendar.js — カレンダー & 個人勤怠管理 ==========
import { state } from './state.js';
import {
  db, collection, doc, setDoc, deleteDoc, getDocs, query, where, onSnapshot, serverTimestamp, deleteField
} from './config.js';
import { esc } from './utils.js';

const DOW_LABELS  = ['日','月','火','水','木','金','土'];
const TYPE_LABELS = {
  normal:    { text: '通常',   cls: 'cal-type-normal'   },
  '有給':    { text: '有給',   cls: 'cal-type-yukyu'    },
  '半休午前':{ text: '半休(午前)', cls: 'cal-type-hankyu' },
  '半休午後':{ text: '半休(午後)', cls: 'cal-type-hankyu' },
  '欠勤':    { text: '欠勤',   cls: 'cal-type-kekkin'   },
};
const TYPE_KEYS = ['normal', '有給', '半休午前', '半休午後', '欠勤'];
const RECENT_WORK_SITE_LIMIT = 8;
const RECENT_WORK_SITE_MONTH_SPAN = 4;

let deps = {};
let recentWorkSiteCache = {
  username: '',
  loaded: false,
  items: [],
  promise: null,
};
export function initCalendar(d) { deps = d; }

// ===== Firestore helpers =====
function attendancePath(username, dateStr) {
  return doc(db, 'users', username, 'attendance', dateStr);
}

export async function saveAttendance(dateStr, data) {
  if (!state.currentUsername) return;
  const yearMonth = dateStr.slice(0, 7);
  try {
    const payload = {
      ...data,
      yearMonth,
      updatedAt: serverTimestamp(),
    };
    if ('workSiteHours' in payload) {
      const map = payload.workSiteHours;
      payload.workSiteHours = (map && typeof map === 'object' && Object.keys(map).length > 0)
        ? map
        : deleteField();
    }
    await setDoc(attendancePath(state.currentUsername, dateStr), payload, { merge: true });
    // 公開出席への同期
    if (data.type && data.type !== 'normal' && data.type !== null) {
      await deps.writePublicAttendance?.(dateStr, state.currentUsername, data.type);
    } else {
      await deps.removePublicAttendance?.(dateStr, state.currentUsername);
    }
    return true;
  } catch (err) {
    console.error('勤怠保存エラー:', err);
    alert('保存に失敗しました');
    return false;
  }
}

export async function deleteAttendance(dateStr) {
  if (!state.currentUsername) return;
  try {
    await deleteDoc(attendancePath(state.currentUsername, dateStr));
    delete state.attendanceData[dateStr];
    // 公開出席からも削除
    await deps.removePublicAttendance?.(dateStr, state.currentUsername);
    renderCalendar();
  } catch (err) { console.error('勤怠削除エラー:', err); }
}

// ===== 月ごとのリスナー =====
function buildYearMonth(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function subscribeAttendance(username) {
  if (!username) return;
  if (state._attendanceSub) { state._attendanceSub(); state._attendanceSub = null; }
  // 月が変わったら前月データをリセット
  state.prevMonthAttendance = {};
  const ym  = buildYearMonth(state.calendarYear, state.calendarMonth);
  const q   = query(
    collection(db, 'users', username, 'attendance'),
    where('yearMonth', '==', ym)
  );
  state._attendanceSub = onSnapshot(q, snap => {
    state.attendanceData = {};
    snap.docs.forEach(d => { state.attendanceData[d.id] = d.data(); });
    renderCalendar();
    updateCalendarSummary();
  });
}

export function unsubscribeAttendance() {
  if (state._attendanceSub) { state._attendanceSub(); state._attendanceSub = null; }
  state.attendanceData = {};
}

// ===== 前月データを一回だけ取得（締め計算用） =====
async function fetchPrevMonthAttendance() {
  if (!state.currentUsername) return;
  // 前月の yearMonth を計算
  let y = state.calendarYear;
  let m = state.calendarMonth - 1;
  if (m < 0) { m = 11; y--; }
  const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', state.currentUsername, 'attendance'),
            where('yearMonth', '==', ym))
    );
    state.prevMonthAttendance = { _fetched: true };
    snap.docs.forEach(d => { state.prevMonthAttendance[d.id] = d.data(); });
  } catch (err) {
    console.warn('前月勤怠取得エラー:', err);
    state.prevMonthAttendance = { _fetched: true };
  }
}

// ===== 年度累計有給を取得（カレンダーモーダルを開いたとき） =====
export async function fetchFiscalYearPaidLeave() {
  if (!state.currentUsername) return;
  const today = new Date();
  // 年度は4月始まり
  const fiscalYear  = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const fiscalStart = `${fiscalYear}-04`;
  const fiscalEnd   = `${fiscalYear + 1}-03`;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', state.currentUsername, 'attendance'),
            where('yearMonth', '>=', fiscalStart),
            where('yearMonth', '<=', fiscalEnd))
    );
    let total = 0;
    snap.docs.forEach(d => {
      const att = d.data();
      if (att.type === '有給') total += 1;
      if (att.type === '半休午前' || att.type === '半休午後') total += 0.5;
    });
    state.fiscalYearPaidLeave = total;
    // 集計表示を更新
    _updateFiscalDisplay();
  } catch (err) {
    console.warn('年度有給取得エラー:', err);
    state.fiscalYearPaidLeave = 0;
    _updateFiscalDisplay();
  }
}

function _updateFiscalDisplay() {
  const el = document.getElementById('cal-cnt-fiscal-paid');
  if (el) el.textContent = state.fiscalYearPaidLeave % 1 === 0
    ? `${state.fiscalYearPaidLeave}日`
    : `${state.fiscalYearPaidLeave}日`;
}

// ===== カレンダー描画 =====
export function renderCalendar() {
  const el = document.getElementById('cal-grid-container');
  if (!el) return;

  const year  = state.calendarYear;
  const month = state.calendarMonth;
  const today = new Date();
  const firstDay = new Date(year, month, 1);
  const lastDate  = new Date(year, month + 1, 0).getDate();
  const startDow  = firstDay.getDay(); // 0=Sun

  // タイトル更新
  const titleEl = document.getElementById('cal-title');
  if (titleEl) titleEl.textContent = `${year}年 ${month + 1}月`;

  // タスクを期限日別にマップ化
  const taskMap = buildTaskMap(year, month);

  let html = '';

  // 曜日ヘッダー
  html += '<div class="cal-dow-row">';
  DOW_LABELS.forEach((d, i) => {
    html += `<div class="cal-dow-cell${i === 0 ? ' cal-sun-label' : i === 6 ? ' cal-sat-label' : ''}">${d}</div>`;
  });
  html += '</div>';

  // 日付グリッド
  html += '<div class="cal-cells">';

  // 空白セル
  for (let i = 0; i < startDow; i++) {
    html += '<div class="cal-cell cal-cell-empty"></div>';
  }

  for (let d = 1; d <= lastDate; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(year, month, d).getDay();
    const isToday = (year === today.getFullYear() && month === today.getMonth() && d === today.getDate());
    const att     = state.attendanceData[dateStr];
    const tasks   = taskMap[dateStr] || [];

    // 会社カレンダー情報
    const info = deps.getDateInfo
      ? deps.getDateInfo(dateStr)
      : { isWorkSaturday: false, isPlannedLeave: false, isHoliday: false, holidayLabel: '', events: [], jpHolidayName: '' };

    let cellCls = 'cal-cell';
    if (isToday)   cellCls += ' cal-today';
    if (dow === 0) cellCls += ' cal-sun';
    if (dow === 6 && !info.isWorkSaturday) cellCls += ' cal-sat';
    if (info.jpHolidayName && dow !== 0) cellCls += ' cal-jp-holiday';
    if (info.isHoliday) cellCls += ' cal-company-holiday';

    // 勤怠タイプ背景色
    if (att?.type && att.type !== 'normal') cellCls += ` cal-att-${att.type === '有給' ? 'yukyu' : att.type.startsWith('半休') ? 'hankyu' : 'kekkin'}`;

    // 会社カレンダーバッジ（個人カレンダーにも表示）
    let companyBadges = '';
    if (info.jpHolidayName) {
      companyBadges += `<span class="cal-company-badge jp-holiday-badge">${esc(info.jpHolidayName)}</span>`;
    }
    if (info.isPlannedLeave) {
      companyBadges += `<span class="cal-company-badge planned-lv">計画付与</span>`;
    } else if (info.isWorkSaturday) {
      companyBadges += `<span class="cal-company-badge work-sat">出勤</span>`;
    }
    if (info.isHoliday) {
      companyBadges += `<span class="cal-company-badge holiday-rng">${esc(info.holidayLabel)}</span>`;
    }
    info.events.forEach(ev => {
      const color = ev.color || 'var(--accent-cyan)';
      companyBadges += `<span class="cal-company-badge event-badge" style="background:${color}20;color:${color}">${esc(ev.label)}</span>`;
    });

    // 勤怠バッジ
    let attHtml = '';
    if (att) {
      if (att.type && att.type !== 'normal') {
        attHtml += `<div class="cal-att-badge cal-att-${att.type === '有給' ? 'yukyu' : att.type.startsWith('半休') ? 'hankyu' : 'kekkin'}">${att.type}</div>`;
      }
      if (att.hayade) attHtml += `<div class="cal-att-badge cal-att-hayade">早出 ${att.hayade}h</div>`;
      if (att.zangyo) attHtml += `<div class="cal-att-badge cal-att-zangyo">残業 ${att.zangyo}h</div>`;
    }

    // タスクドット
    let taskHtml = '';
    if (tasks.length > 0) {
      const receivedCount = tasks.filter(t => t.assignedTo === state.currentUsername).length;
      const sentCount     = tasks.filter(t => t.assignedBy === state.currentUsername).length;
      if (receivedCount > 0) taskHtml += `<span class="cal-task-dot cal-task-received" title="受け取ったタスク ${receivedCount}件">${receivedCount}</span>`;
      if (sentCount > 0)     taskHtml += `<span class="cal-task-dot cal-task-sent" title="依頼したタスク ${sentCount}件">${sentCount}</span>`;
    }

    html += `<div class="${cellCls}" data-date="${dateStr}">
      <div class="cal-day-num">${d}</div>
      <div class="cal-day-content">
        ${companyBadges}
        ${attHtml}
        ${taskHtml ? `<div class="cal-task-dots">${taskHtml}</div>` : ''}
      </div>
    </div>`;
  }
  html += '</div>';
  el.innerHTML = html;

  // クリックイベント
  el.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => openDayPanel(cell.dataset.date));
  });

  updateCalendarSummary();
}

// ===== タスクマップ構築（期限日 → タスク配列） =====
function buildTaskMap(year, month) {
  const map = {};
  const allTasks = [...(state.receivedTasks || []), ...(state.sentTasks || [])];
  allTasks.forEach(t => {
    if (!t.dueDate) return;
    const d = new Date(t.dueDate);
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!map[key]) map[key] = [];
    // 重複排除
    if (!map[key].find(x => x.id === t.id)) map[key].push(t);
  });
  return map;
}

// ===== 月間サマリー更新（月計 + 締め計 + 年度累計） =====
export async function updateCalendarSummary() {
  const year  = state.calendarYear;
  const month = state.calendarMonth;
  const data  = state.attendanceData;

  // --- 月計（1〜月末） ---
  let yukyu = 0, hankyu = 0, hayadeH = 0, zangyoH = 0;
  Object.entries(data).forEach(([dateStr, att]) => {
    if (att.type === '有給') yukyu++;
    if (att.type === '半休午前' || att.type === '半休午後') hankyu++;
    if (att.hayade) hayadeH += parseFloat(att.hayade);
    if (att.zangyo) zangyoH += parseFloat(att.zangyo);
  });

  // --- 締め計（前月21〜当月20） ---
  if (!state.prevMonthAttendance._fetched) {
    await fetchPrevMonthAttendance();
  }
  let hayadeShime = 0, zangyoShime = 0;
  // 前月の21日〜末日
  Object.entries(state.prevMonthAttendance).forEach(([dateStr, att]) => {
    if (dateStr === '_fetched') return;
    const day = parseInt(dateStr.slice(8, 10), 10);
    if (day >= 21) {
      if (att.hayade) hayadeShime += parseFloat(att.hayade);
      if (att.zangyo) zangyoShime += parseFloat(att.zangyo);
    }
  });
  // 当月の1日〜20日
  Object.entries(data).forEach(([dateStr, att]) => {
    const day = parseInt(dateStr.slice(8, 10), 10);
    if (day <= 20) {
      if (att.hayade) hayadeShime += parseFloat(att.hayade);
      if (att.zangyo) zangyoShime += parseFloat(att.zangyo);
    }
  });

  // --- DOM 更新 ---
  const fmt = v => v % 1 === 0 ? `${v}` : `${v}`;
  const set = (id, html, isHtml = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isHtml) el.innerHTML = html;
    else el.textContent = html;
  };

  set('cal-cnt-yukyu',  yukyu);
  set('cal-cnt-hankyu', hankyu);
  set('cal-cnt-hayade', `${fmt(hayadeH)}h<small class="cal-shime-label">締:${fmt(hayadeShime)}h</small>`, true);
  set('cal-cnt-zangyo', `${fmt(zangyoH)}h<small class="cal-shime-label">締:${fmt(zangyoShime)}h</small>`, true);

  // 年度累計はすでに fetchFiscalYearPaidLeave() で更新されているのでそのまま表示
  _updateFiscalDisplay();
}

// ===== タブ切替 =====
export function switchCalTab(tab) {
  state.calTab = tab;
  document.getElementById('cal-tab-personal')?.classList.toggle('active', tab === 'personal');
  document.getElementById('cal-tab-shared')?.classList.toggle('active', tab === 'shared');
  const personalEl = document.getElementById('cal-personal-container');
  const sharedEl   = document.getElementById('cal-shared-container');
  if (personalEl) personalEl.style.display = tab === 'personal' ? '' : 'none';
  if (sharedEl)   sharedEl.style.display   = tab === 'shared'   ? '' : 'none';
  if (tab === 'shared') {
    deps.renderSharedCalendar?.();
  } else {
    renderCalendar();
  }
}

// ===== モーダル開閉 =====
export async function openCalendarModal() {
  if (!state.currentUsername) { alert('ユーザーネームを設定してください'); return; }
  document.getElementById('cal-modal').classList.add('visible');
  // タブをリセット
  state.calTab = 'personal';
  document.getElementById('cal-tab-personal')?.classList.add('active');
  document.getElementById('cal-tab-shared')?.classList.remove('active');
  const personalEl = document.getElementById('cal-personal-container');
  const sharedEl   = document.getElementById('cal-shared-container');
  if (personalEl) personalEl.style.display = '';
  if (sharedEl)   sharedEl.style.display   = 'none';
  // 購読開始
  subscribeAttendance(state.currentUsername);
  deps.subscribeCompanyCalConfig?.();
  renderCalendar();
  void loadRecentWorkSites(true);
  // 年度累計を非同期で取得（UIをブロックしない）
  fetchFiscalYearPaidLeave();
}

export function closeCalendarModal() {
  document.getElementById('cal-modal').classList.remove('visible');
  closeDayPanel();
  unsubscribeAttendance();
  deps.unsubscribeCompanyCalConfig?.();
}

// ===== 前月・次月 =====
export function calPrevMonth() {
  state.calendarMonth--;
  if (state.calendarMonth < 0) { state.calendarMonth = 11; state.calendarYear--; }
  subscribeAttendance(state.currentUsername);
  closeDayPanel();
  renderCalendar();
  // 共有タブが開いていれば再描画
  if (state.calTab === 'shared') deps.renderSharedCalendar?.();
}

export function calNextMonth() {
  state.calendarMonth++;
  if (state.calendarMonth > 11) { state.calendarMonth = 0; state.calendarYear++; }
  subscribeAttendance(state.currentUsername);
  closeDayPanel();
  renderCalendar();
  if (state.calTab === 'shared') deps.renderSharedCalendar?.();
}

function buildSharedDayInfoText(dateStr) {
  const info = deps.getDateInfo ? deps.getDateInfo(dateStr) : null;
  if (!info) return '';

  const parts = [];
  if (info.jpHolidayName) parts.push(`祝日: ${info.jpHolidayName}`);
  if (info.isHoliday) parts.push(`会社休日: ${info.holidayLabel || '会社休日'}`);
  if (info.isPlannedLeave) parts.push('計画付与日');
  else {
    const dow = new Date(`${dateStr}T00:00:00`).getDay();
    if (dow === 6) parts.push(info.isWorkSaturday ? '土曜出勤日' : '土曜休');
  }
  if (info.events?.length) {
    const labels = info.events.map(e => e.label).filter(Boolean);
    if (labels.length) parts.push(`行事: ${labels.join(' / ')}`);
  }

  return parts.join(' ｜ ');
}

function normalizeWorkHours(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 2) / 2;
}

function sanitizeWorkSiteHours(src) {
  if (!src || typeof src !== 'object') return {};
  const out = {};
  Object.entries(src).forEach(([siteId, val]) => {
    const h = normalizeWorkHours(val);
    if (h > 0) out[siteId] = h;
  });
  return out;
}

function getSortedActiveSites() {
  return [...(state.attendanceSites || [])]
    .filter(site => site.active !== false)
    .sort((a, b) => {
      const ao = Number(a.sortOrder) || 0;
      const bo = Number(b.sortOrder) || 0;
      if (ao !== bo) return ao - bo;
      return (a.code || '').localeCompare(b.code || '', 'ja');
    });
}

function getSiteById(siteId) {
  return (state.attendanceSites || []).find(site => site.id === siteId) || null;
}

function formatSiteLabel(site) {
  if (!site) return '';
  return [site.code || '', site.name || ''].filter(Boolean).join(' ');
}

function normalizeSiteSearchText(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[０-９]/g, ch => String(ch.charCodeAt(0) - 0xFF10))
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function matchesSiteQuery(site, queryText) {
  const token = normalizeSiteSearchText(queryText);
  if (!token) return true;
  const code = normalizeSiteSearchText(site?.code || '');
  const name = normalizeSiteSearchText(site?.name || '');
  return code.includes(token) || name.includes(token) || `${code}${name}`.includes(token);
}

function getRecentWorkSiteYearMonthRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - (RECENT_WORK_SITE_MONTH_SPAN - 1), 1);
  return {
    startYm: buildYearMonth(start.getFullYear(), start.getMonth()),
    endYm: buildYearMonth(end.getFullYear(), end.getMonth()),
  };
}

function sortRecentWorkSiteItems(items) {
  return [...items].sort((a, b) => {
    if (a.lastDate !== b.lastDate) return b.lastDate.localeCompare(a.lastDate);
    if ((a.usedCount || 0) !== (b.usedCount || 0)) return (b.usedCount || 0) - (a.usedCount || 0);
    return (b.totalHours || 0) - (a.totalHours || 0);
  });
}

function setRecentWorkSiteCache(items, username = state.currentUsername || '') {
  recentWorkSiteCache = {
    username,
    loaded: true,
    items: sortRecentWorkSiteItems(items).slice(0, RECENT_WORK_SITE_LIMIT),
    promise: null,
  };
}

function getRecentWorkSiteEntries() {
  const siteMap = new Map(getSortedActiveSites().map(site => [site.id, site]));
  return (recentWorkSiteCache.items || [])
    .map(item => {
      const site = siteMap.get(item.siteId);
      if (!site) return null;
      return { ...item, site, label: formatSiteLabel(site) };
    })
    .filter(Boolean)
    .slice(0, RECENT_WORK_SITE_LIMIT);
}

async function loadRecentWorkSites(force = false) {
  const username = state.currentUsername || '';
  if (!username) {
    setRecentWorkSiteCache([], '');
    return [];
  }

  if (!force && recentWorkSiteCache.loaded && recentWorkSiteCache.username === username) {
    return recentWorkSiteCache.items;
  }
  if (!force && recentWorkSiteCache.promise && recentWorkSiteCache.username === username) {
    return recentWorkSiteCache.promise;
  }

  recentWorkSiteCache.username = username;
  recentWorkSiteCache.promise = (async () => {
    try {
      const { startYm, endYm } = getRecentWorkSiteYearMonthRange();
      const snap = await getDocs(query(
        collection(db, 'users', username, 'attendance'),
        where('yearMonth', '>=', startYm),
        where('yearMonth', '<=', endYm)
      ));
      const activeSiteIds = new Set(getSortedActiveSites().map(site => site.id));
      const usageMap = new Map();

      snap.docs
        .map(d => ({ dateStr: d.id, data: d.data() }))
        .sort((a, b) => b.dateStr.localeCompare(a.dateStr))
        .forEach(({ dateStr, data }) => {
          const workMap = sanitizeWorkSiteHours(data.workSiteHours);
          Object.entries(workMap).forEach(([siteId, hours]) => {
            if (!activeSiteIds.has(siteId)) return;
            const prev = usageMap.get(siteId) || {
              siteId,
              lastDate: dateStr,
              usedCount: 0,
              totalHours: 0,
            };
            if (dateStr > prev.lastDate) prev.lastDate = dateStr;
            prev.usedCount += 1;
            prev.totalHours += Number(hours) || 0;
            usageMap.set(siteId, prev);
          });
        });

      setRecentWorkSiteCache([...usageMap.values()], username);
      return recentWorkSiteCache.items;
    } catch (err) {
      console.warn('最近使った現場の取得エラー:', err);
      setRecentWorkSiteCache([], username);
      return [];
    } finally {
      recentWorkSiteCache.promise = null;
      if (state.calendarSelectedDate && !document.getElementById('cal-day-panel')?.hidden) {
        renderDayWorkInputs(state.calendarSelectedDate, null, getDayWorkRowsFromDom());
      }
    }
  })();

  return recentWorkSiteCache.promise;
}

function updateRecentWorkSiteCacheFromMap(workSiteHours, dateStr) {
  const siteIds = Object.keys(workSiteHours || {}).filter(Boolean);
  if (siteIds.length === 0) return;

  const existing = recentWorkSiteCache.username === (state.currentUsername || '')
    ? [...(recentWorkSiteCache.items || [])]
    : [];
  const byId = new Map(existing.map(item => [item.siteId, item]));

  siteIds.forEach(siteId => {
    const prev = byId.get(siteId) || { siteId, usedCount: 0, totalHours: 0 };
    byId.set(siteId, {
      siteId,
      lastDate: dateStr,
      usedCount: (prev.usedCount || 0) + 1,
      totalHours: (prev.totalHours || 0) + (Number(workSiteHours[siteId]) || 0),
    });
  });

  setRecentWorkSiteCache([...byId.values()], state.currentUsername || '');
}

function getDayWorkRowsFromDom() {
  const container = document.getElementById('cal-day-worksites');
  if (!container) return [];
  return [...container.querySelectorAll('.cal-day-work-row')].map(row => {
    const siteId = row.querySelector('.cal-day-work-site')?.value || '';
    const hoursRaw = row.querySelector('.cal-day-work-hours')?.value || '';
    const search = row.querySelector('.cal-day-work-search')?.value || '';
    return { siteId, hours: hoursRaw, search };
  });
}

function getPreferredWorkRowIndex(rows) {
  const activeRow = document.activeElement?.closest?.('.cal-day-work-row');
  if (activeRow) {
    const activeIndex = Number(activeRow.dataset.index || -1);
    if (activeIndex >= 0 && activeIndex < rows.length) return activeIndex;
  }
  const emptyIndex = rows.findIndex(row => !row.siteId);
  return emptyIndex >= 0 ? emptyIndex : rows.length;
}

function buildInitialDayWorkRows(workSiteHours) {
  const srcMap = sanitizeWorkSiteHours(workSiteHours);
  if (Object.keys(srcMap).length === 0) {
    return [{ siteId: '', hours: '', search: '' }];
  }
  return Object.entries(srcMap).map(([siteId, hours]) => ({
    siteId,
    hours: String(hours),
    search: formatSiteLabel(getSiteById(siteId)),
  }));
}

function buildWorkSiteMapFromDom() {
  const map = {};
  getDayWorkRowsFromDom().forEach(row => {
    const siteId = row.siteId || '';
    const hours = normalizeWorkHours(row.hours);
    if (!siteId || hours <= 0) return;
    map[siteId] = (map[siteId] || 0) + hours;
  });
  return map;
}

function renderDayWorkInputs(dateStr, workSiteHours, preservedRows = null) {
  const container = document.getElementById('cal-day-worksites');
  const addBtn = document.getElementById('cal-day-work-add-btn');
  if (!container || !addBtn) return;

  const sites = getSortedActiveSites();
  const siteMap = new Map(sites.map(site => [site.id, site]));
  if (sites.length === 0) {
    container.innerHTML = '<div class="cal-day-work-empty">登録現場がありません。先に「登録現場」タブで追加してください。</div>';
    addBtn.disabled = true;
    addBtn.onclick = null;
    return;
  }

  addBtn.disabled = false;
  const initialRows = (Array.isArray(preservedRows) && preservedRows.length > 0
    ? preservedRows
    : buildInitialDayWorkRows(workSiteHours)
  ).map(row => ({
    siteId: row.siteId || '',
    hours: row.hours || '',
    search: typeof row.search === 'string'
      ? row.search
      : formatSiteLabel(siteMap.get(row.siteId || '')),
  }));

  const renderRows = (rows) => {
    const buildOptionsHtml = (filteredSites) => [
      '<option value="">現場を選択</option>',
      ...filteredSites.map(site => `<option value="${site.id}">${esc(formatSiteLabel(site))}</option>`)
    ].join('');

    const getFilteredSites = (queryText, selectedSiteId = '') => {
      const filtered = sites.filter(site => matchesSiteQuery(site, queryText));
      if (selectedSiteId && !filtered.some(site => site.id === selectedSiteId)) {
        const selectedSite = siteMap.get(selectedSiteId);
        if (selectedSite) filtered.unshift(selectedSite);
      }
      return filtered;
    };

    const findAutoSelectSite = (queryText, filteredSites) => {
      const token = normalizeSiteSearchText(queryText);
      if (!token) return null;
      const exactCodeMatches = sites.filter(site => normalizeSiteSearchText(site.code || '') === token);
      if (exactCodeMatches.length === 1) return exactCodeMatches[0];
      return filteredSites.length === 1 ? filteredSites[0] : null;
    };

    const recentSites = getRecentWorkSiteEntries();
    const recentHtml = recentSites.length > 0
      ? `
          <div class="cal-day-work-recent">
            <div class="cal-day-work-recent-title"><i class="fa-solid fa-clock-rotate-left"></i> 最近やった現場</div>
            <div class="cal-day-work-recent-list">
              ${recentSites.map(item => `
                <button type="button" class="cal-day-work-recent-btn" data-site-id="${item.site.id}">
                  <span class="cal-day-work-recent-code">${esc(item.site.code || '-')}</span>
                  <span class="cal-day-work-recent-name">${esc(item.site.name || '')}</span>
                </button>
              `).join('')}
            </div>
          </div>`
      : (recentWorkSiteCache.promise
        ? '<div class="cal-day-work-recent-loading">最近使った現場を読み込み中...</div>'
        : '');

    container.innerHTML = recentHtml + rows.map((row, idx) => `
      <div class="cal-day-work-row" data-index="${idx}">
        <input
          type="search"
          class="form-input cal-day-work-search"
          placeholder="番号/現場名で検索"
          value="${esc(row.search || '')}"
        >
        <select class="form-input cal-day-work-site">
          ${buildOptionsHtml(getFilteredSites(row.search || '', row.siteId || ''))}
        </select>
        <input
          type="number"
          class="form-input cal-day-work-hours"
          min="0"
          step="0.5"
          inputmode="decimal"
          placeholder="時間"
          value="${esc(row.hours || '')}"
        >
        <button type="button" class="btn-modal-danger cal-day-work-del-btn" data-index="${idx}">削除</button>
      </div>
    `).join('');

    [...container.querySelectorAll('.cal-day-work-row')].forEach((rowEl, idx) => {
      const searchInput = rowEl.querySelector('.cal-day-work-search');
      const select = rowEl.querySelector('.cal-day-work-site');
      const current = rows[idx] || { siteId: '', search: '' };

      const applySelectOptions = (queryText, selectedSiteId = '') => {
        if (!select) return [];
        const filteredSites = getFilteredSites(queryText, selectedSiteId);
        select.innerHTML = buildOptionsHtml(filteredSites);
        if (selectedSiteId) select.value = selectedSiteId;
        return filteredSites;
      };

      const syncSelectFromSearch = (normalizeSearch = false) => {
        const queryText = searchInput?.value || '';
        const selectedSiteId = select?.value || current.siteId || '';
        const filteredSites = applySelectOptions(queryText, selectedSiteId);
        const autoSite = findAutoSelectSite(queryText, filteredSites);
        if (select && autoSite) {
          select.value = autoSite.id;
          if (normalizeSearch && searchInput) {
            searchInput.value = formatSiteLabel(autoSite);
          }
          return { filteredSites, autoSite };
        }
        if (select && queryText.trim() && selectedSiteId) {
          const selectedSite = siteMap.get(selectedSiteId);
          if (!matchesSiteQuery(selectedSite, queryText)) {
            select.value = '';
          }
        }
        return { filteredSites, autoSite: null };
      };

      if (searchInput && current.search == null && current.siteId) {
        searchInput.value = formatSiteLabel(siteMap.get(current.siteId));
      }
      syncSelectFromSearch();

      searchInput?.addEventListener('input', () => {
        syncSelectFromSearch();
      });

      searchInput?.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const { autoSite } = syncSelectFromSearch(true);
        if (select && autoSite) {
          rowEl.querySelector('.cal-day-work-hours')?.focus();
          return;
        }
        select?.focus();
      });

      select?.addEventListener('change', () => {
        const site = siteMap.get(select.value || '');
        if (searchInput && site) searchInput.value = formatSiteLabel(site);
      });
    });

    container.querySelectorAll('.cal-day-work-recent-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const siteId = btn.dataset.siteId || '';
        const next = getDayWorkRowsFromDom();
        let targetIndex = getPreferredWorkRowIndex(next);
        if (targetIndex >= next.length) next.push({ siteId: '', hours: '', search: '' });
        next[targetIndex] = {
          ...next[targetIndex],
          siteId,
          search: formatSiteLabel(siteMap.get(siteId)),
        };
        renderRows(next);
        const targetRow = container.querySelector(`.cal-day-work-row[data-index="${targetIndex}"]`);
        const hoursInput = targetRow?.querySelector('.cal-day-work-hours');
        if (hoursInput && !next[targetIndex].hours) {
          hoursInput.focus();
        } else {
          targetRow?.querySelector('.cal-day-work-site')?.focus();
        }
      });
    });

    container.querySelectorAll('.cal-day-work-del-btn').forEach(btn => {
      btn.onclick = () => {
        const index = Number(btn.dataset.index || -1);
        const next = getDayWorkRowsFromDom();
        if (index >= 0) next.splice(index, 1);
        if (next.length === 0) next.push({ siteId: '', hours: '', search: '' });
        renderRows(next);
      };
    });
  };

  addBtn.onclick = () => {
    const next = getDayWorkRowsFromDom();
    next.push({ siteId: '', hours: '', search: '' });
    renderRows(next);
  };

  renderRows(initialRows);
}

// ===== 日付詳細パネル =====
export function openDayPanel(dateStr) {
  state.calendarSelectedDate = dateStr;
  const panel = document.getElementById('cal-day-panel');
  if (!panel) return;

  const d    = new Date(dateStr + 'T00:00:00');
  const dow  = DOW_LABELS[d.getDay()];
  const att  = state.attendanceData[dateStr] || {};

  // タイトル
  const titleEl = document.getElementById('cal-day-title');
  if (titleEl) titleEl.textContent = `${d.getMonth()+1}月${d.getDate()}日（${dow}）`;
  const sharedInfoEl = document.getElementById('cal-day-shared-info');
  if (sharedInfoEl) {
    const sharedText = buildSharedDayInfoText(dateStr);
    sharedInfoEl.textContent = sharedText;
    sharedInfoEl.hidden = !sharedText;
  }

  // 勤務区分ボタン
  const typeBtnsEl = document.getElementById('cal-type-btns');
  if (typeBtnsEl) {
    const currentType = att.type || 'normal';
    typeBtnsEl.innerHTML = TYPE_KEYS.map(k =>
      `<button class="cal-type-btn${currentType === k ? ' active' : ''}" data-type="${k}">
        ${TYPE_LABELS[k].text}
      </button>`
    ).join('');
    typeBtnsEl.querySelectorAll('.cal-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        typeBtnsEl.querySelectorAll('.cal-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  // 早出・残業（プルダウン）
  const hayadeInput = document.getElementById('cal-hayade-time');
  const zangyoInput = document.getElementById('cal-zangyo-time');
  if (hayadeInput) hayadeInput.value = att.hayade || '';
  if (zangyoInput) zangyoInput.value = att.zangyo || '';

  // 合計表示を更新
  updateTimeTotal();

  // プルダウン変更時に合計を再計算
  if (hayadeInput) hayadeInput.onchange = updateTimeTotal;
  if (zangyoInput) zangyoInput.onchange = updateTimeTotal;

  // メモ
  const noteInput = document.getElementById('cal-note');
  if (noteInput) noteInput.value = att.note || '';

  // 作業現場入力（その日の内訳）
  renderDayWorkInputs(dateStr, att.workSiteHours);

  // 削除ボタン（記録がある場合のみ表示）
  const delBtn = document.getElementById('cal-day-delete-btn');
  if (delBtn) delBtn.hidden = Object.keys(att).length === 0;

  // タスク一覧
  renderDayTasks(dateStr);

  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===== 早出・残業 合計表示 =====
function updateTimeTotal() {
  const totalEl  = document.getElementById('cal-time-total');
  if (!totalEl) return;
  const hayade = parseFloat(document.getElementById('cal-hayade-time')?.value) || 0;
  const zangyo = parseFloat(document.getElementById('cal-zangyo-time')?.value) || 0;
  const total  = hayade + zangyo;
  if (total === 0) {
    totalEl.hidden = true;
    return;
  }
  totalEl.hidden = false;
  const parts = [];
  if (hayade > 0) parts.push(`早出 ${hayade}時間`);
  if (zangyo > 0) parts.push(`残業 ${zangyo}時間`);
  totalEl.innerHTML = `<i class="fa-solid fa-clock"></i> ${parts.join('　')}　<strong>計 ${total}時間</strong>`;
}

export function closeDayPanel() {
  const panel = document.getElementById('cal-day-panel');
  if (panel) panel.hidden = true;
  state.calendarSelectedDate = null;
}

// ===== 日のタスク一覧 =====
function renderDayTasks(dateStr) {
  const el = document.getElementById('cal-day-tasks');
  if (!el) return;
  const taskMap = buildTaskMap(state.calendarYear, state.calendarMonth);
  const tasks   = taskMap[dateStr] || [];
  if (tasks.length === 0) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = `<div class="cal-day-tasks-title"><i class="fa-solid fa-list-check"></i> この日のタスク</div>` +
    tasks.map(t => {
      const isMine = t.assignedTo === state.currentUsername;
      const statusCls = t.status === 'done' ? 'cal-task-done' : t.status === 'accepted' ? 'cal-task-accepted' : 'cal-task-pending';
      return `<div class="cal-day-task-item ${statusCls}">
        <span class="cal-day-task-dir">${isMine ? '← 受取' : '→ 依頼'}</span>
        <span class="cal-day-task-title" title="${esc(t.title)}">${esc(t.title)}</span>
        <span class="cal-day-task-who">${esc(isMine ? t.assignedBy : t.assignedTo)}</span>
      </div>`;
    }).join('');
}

// ===== 保存処理 =====
export async function saveDayAttendance() {
  const dateStr = state.calendarSelectedDate;
  if (!dateStr) return;

  const typeBtn = document.querySelector('#cal-type-btns .cal-type-btn.active');
  const type    = typeBtn?.dataset.type || 'normal';
  const hayade  = document.getElementById('cal-hayade-time')?.value || null;
  const zangyo  = document.getElementById('cal-zangyo-time')?.value || null;
  const note    = document.getElementById('cal-note')?.value.trim() || null;
  const workSiteHours = buildWorkSiteMapFromDom();

  const btn = document.getElementById('cal-day-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }

  const saved =
    await saveAttendance(dateStr, {
    type:   type === 'normal' ? null : type,
    hayade: hayade || null,
    zangyo: zangyo || null,
    note:   note   || null,
    workSiteHours,
  });

  if (btn) { btn.disabled = false; btn.textContent = '保存'; }
  if (!saved) return;
  updateRecentWorkSiteCacheFromMap(workSiteHours, dateStr);
  closeDayPanel();
}

// ===== 今月に戻る =====
export function calGoToday() {
  const t = new Date();
  state.calendarYear  = t.getFullYear();
  state.calendarMonth = t.getMonth();
  subscribeAttendance(state.currentUsername);
  closeDayPanel();
  renderCalendar();
  if (state.calTab === 'shared') deps.renderSharedCalendar?.();
}
