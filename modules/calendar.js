// ========== calendar.js — カレンダー & 個人勤怠管理 ==========
import { state } from './state.js';
import {
  db, collection, doc, setDoc, deleteDoc, getDocs, query, where, onSnapshot, serverTimestamp, deleteField
} from './config.js';
import { esc, normalizeProjectKeys } from './utils.js';
import { showToast } from './notify.js';
import {
  recordGetDocsRead,
  recordListenerStart,
  recordListenerSnapshot,
  wrapTrackedListenerUnsubscribe,
} from './read-diagnostics.js';
import {
  isSupabaseSharedCoreEnabled,
  fetchAttendanceEntriesFromSupabase,
  upsertAttendanceEntryInSupabase,
  deleteAttendanceEntryInSupabase,
} from './supabase.js';

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
const REGULAR_WORK_HOURS = 8;
const EXTRA_HOURS_SELECT_MAX = 8;

let deps = {};
let recentWorkSiteCache = {
  username: '',
  loaded: false,
  items: [],
  promise: null,
};
let attendanceLoadSeq = 0;
let todayAttendanceLoadSeq = 0;
let prevMonthAttendanceLoadSeq = 0;
let fiscalYearLoadSeq = 0;
export function initCalendar(d) { deps = d; }

// ===== Supabase helpers =====
function attendancePath(username, dateStr) {
  return doc(db, 'users', username, 'attendance', dateStr);
}

function getTodayDateStr() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function buildAttendanceStateForStore(dateStr, data) {
  const record = {
    type: data.type || null,
    hayade: data.hayade || null,
    zangyo: data.zangyo || null,
    note: data.note || null,
    yearMonth: dateStr.slice(0, 7),
  };
  const workSiteHours = data.workSiteHours && typeof data.workSiteHours === 'object'
    ? Object.fromEntries(Object.entries(data.workSiteHours).filter(([, hours]) => Number(hours) > 0))
    : {};
  const projectKeys = normalizeProjectKeys(data.projectKeys);
  if (Object.keys(workSiteHours).length > 0) record.workSiteHours = workSiteHours;
  if (projectKeys.length > 0) record.projectKeys = projectKeys;
  return record;
}

function syncTodayAttendanceState(dateStr, data) {
  state.todayAttendanceDate = dateStr;
  state.todayAttendance = data ? { ...data } : null;
}

function refreshTodayDashboard() {
  deps.renderTodayDashboard?.();
  deps.updateSummaryCards?.();
}

async function syncPublicAttendanceForDate(dateStr, username, type) {
  try {
    if (type && type !== 'normal' && type !== null) {
      return (await deps.writePublicAttendance?.(dateStr, username, type)) !== false;
    }
    return (await deps.removePublicAttendance?.(dateStr, username)) !== false;
  } catch (err) {
    console.warn('Public attendance sync failed:', err);
    return false;
  }
}

export function subscribeTodayAttendance(username) {
  const loadSeq = ++todayAttendanceLoadSeq;
  if (state._todayAttendanceSub) {
    state._todayAttendanceSub();
    state._todayAttendanceSub = null;
  }
  if (!username) {
    syncTodayAttendanceState('', null);
    refreshTodayDashboard();
    return;
  }

  const todayStr = getTodayDateStr();
  state.todayAttendanceDate = todayStr;
  if (isSupabaseSharedCoreEnabled()) {
    fetchAttendanceEntriesFromSupabase(username, [todayStr.slice(0, 7)]).then(entries => {
      if (loadSeq !== todayAttendanceLoadSeq || state.currentUsername !== username) return;
      const todayEntry = (entries || []).find(entry => (entry?.date || entry?.dateStr) === todayStr) || null;
      syncTodayAttendanceState(todayStr, todayEntry ? buildAttendanceStateForStore(todayStr, todayEntry) : null);
      refreshTodayDashboard();
    }).catch(err => {
      if (loadSeq !== todayAttendanceLoadSeq || state.currentUsername !== username) return;
      console.warn('Today attendance load failed (Supabase):', err);
      syncTodayAttendanceState(todayStr, null);
      refreshTodayDashboard();
    });
    return;
  }
  recordListenerStart('cal.today', '今日の勤怠', `attendance:${username}`);
  state._todayAttendanceSub = wrapTrackedListenerUnsubscribe('cal.today', onSnapshot(attendancePath(username, todayStr), snap => {
    if (loadSeq !== todayAttendanceLoadSeq || state.currentUsername !== username) return;
    recordListenerSnapshot('cal.today', snap.exists() ? 1 : 0, todayStr, snap.exists() ? [{ id: snap.id, ...snap.data() }] : []);
    syncTodayAttendanceState(todayStr, snap.exists() ? snap.data() : null);
    refreshTodayDashboard();
  }));
}

export function unsubscribeTodayAttendance() {
  todayAttendanceLoadSeq += 1;
  if (state._todayAttendanceSub) {
    state._todayAttendanceSub();
    state._todayAttendanceSub = null;
  }
  syncTodayAttendanceState('', null);
  refreshTodayDashboard();
}

export async function saveAttendance(dateStr, data) {
  if (!state.currentUsername) return;
  const yearMonth = dateStr.slice(0, 7);
  const todayStr = getTodayDateStr();
  const isToday = dateStr === todayStr;

  const applyLocalSave = async () => {
    const publicSyncOk = await syncPublicAttendanceForDate(dateStr, state.currentUsername, data.type);
    deps.markWorkSummaryStale?.();
    state.attendanceData[dateStr] = { ...data, yearMonth };
    if (isToday) {
      syncTodayAttendanceState(dateStr, buildAttendanceStateForStore(dateStr, data));
    }
    renderCalendar();
    updateCalendarSummary();
    refreshTodayDashboard();
    if (!publicSyncOk) {
      showToast('Shared calendar sync failed. Personal attendance was saved.', 'warning');
    }
    await fetchFiscalYearPaidLeave();
    return true;
  };

  if (isSupabaseSharedCoreEnabled()) {
    try {
      const map = data.workSiteHours;
      const workSiteHours = (map && typeof map === 'object' && Object.keys(map).length > 0) ? map : {};
      const projectKeys = normalizeProjectKeys(data.projectKeys || []);
      await upsertAttendanceEntryInSupabase(state.currentUsername, dateStr, {
        type: data.type ?? null,
        hayade: data.hayade ?? null,
        zangyo: data.zangyo ?? null,
        note: data.note ?? null,
        yearMonth,
        workSiteHours,
        projectKeys,
      });
      return await applyLocalSave();
    } catch (err) {
      console.error('Attendance save failed (Supabase):', err);
      showToast('勤怠の保存に失敗しました。', 'error');
      return false;
    }
  }

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
    if ('projectKeys' in payload) {
      const keys = normalizeProjectKeys(payload.projectKeys);
      payload.projectKeys = keys.length > 0 ? keys : deleteField();
    }
    await setDoc(attendancePath(state.currentUsername, dateStr), payload, { merge: true });
    return await applyLocalSave();
  } catch (err) {
    console.error('Attendance save failed:', err);
    showToast('勤怠の保存に失敗しました。', 'error');
    return false;
  }
}

export async function deleteAttendance(dateStr) {
  if (!state.currentUsername) return;
  const todayStr = getTodayDateStr();
  const isToday = dateStr === todayStr;

  const applyLocalDelete = async () => {
    delete state.attendanceData[dateStr];
    if (isToday) {
      syncTodayAttendanceState(dateStr, null);
    }
    const publicSyncOk = await syncPublicAttendanceForDate(dateStr, state.currentUsername, null);
    deps.markWorkSummaryStale?.();
    renderCalendar();
    refreshTodayDashboard();
    if (!publicSyncOk) {
      showToast('Shared calendar sync failed. Personal attendance was deleted.', 'warning');
    }
    await fetchFiscalYearPaidLeave();
  };

  if (isSupabaseSharedCoreEnabled()) {
    try {
      await deleteAttendanceEntryInSupabase(state.currentUsername, dateStr);
      await applyLocalDelete();
    } catch (err) {
      console.error('Attendance delete failed (Supabase):', err);
      showToast('勤怠の削除に失敗しました。', 'error');
    }
    return;
  }

  try {
    await deleteDoc(attendancePath(state.currentUsername, dateStr));
    await applyLocalDelete();
  } catch (err) {
    console.error('Attendance delete failed:', err);
    showToast('勤怠の削除に失敗しました。', 'error');
  }
}

function buildYearMonth(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function buildYearMonthRange(startYm, endYm) {
  if (!startYm || !endYm) return [];
  const [startYear, startMonth] = startYm.split('-').map(Number);
  const [endYear, endMonth] = endYm.split('-').map(Number);
  if (!Number.isFinite(startYear) || !Number.isFinite(startMonth) || !Number.isFinite(endYear) || !Number.isFinite(endMonth)) {
    return [];
  }

  const items = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    items.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return items;
}

function indexAttendanceEntriesByDate(entries = []) {
  const map = {};
  (entries || []).forEach(entry => {
    const dateStr = entry?.date || entry?.dateStr || '';
    if (!dateStr) return;
    map[dateStr] = entry;
  });
  return map;
}

export function subscribeAttendance(username) {
  if (!username) return;
  const loadSeq = ++attendanceLoadSeq;
  prevMonthAttendanceLoadSeq += 1;
  if (state._attendanceSub) { state._attendanceSub(); state._attendanceSub = null; }
  // 月が変わったら前月データをリセット
  state.prevMonthAttendance = {};
  const ym = buildYearMonth(state.calendarYear, state.calendarMonth);
  if (isSupabaseSharedCoreEnabled()) {
    fetchAttendanceEntriesFromSupabase(username, [ym]).then(entries => {
      if (loadSeq !== attendanceLoadSeq || state.currentUsername !== username) return;
      state.attendanceData = indexAttendanceEntriesByDate(entries);
      renderCalendar();
      updateCalendarSummary();
      refreshTodayDashboard();
    }).catch(err => {
      if (loadSeq !== attendanceLoadSeq || state.currentUsername !== username) return;
      console.error('Attendance load failed (Supabase):', err);
      state.attendanceData = {};
      renderCalendar();
      updateCalendarSummary();
      refreshTodayDashboard();
      showToast('勤怠データの取得に失敗しました。', 'warning');
    });
    return;
  }
  const q = query(
    collection(db, 'users', username, 'attendance'),
    where('yearMonth', '==', ym)
  );
  recordListenerStart('cal.month', '月次勤怠', `attendance:${ym}`);
  state._attendanceSub = wrapTrackedListenerUnsubscribe('cal.month', onSnapshot(q, snap => {
    if (loadSeq !== attendanceLoadSeq || state.currentUsername !== username) return;
    recordListenerSnapshot('cal.month', snap.size, ym, snap.docs);
    state.attendanceData = {};
    snap.docs.forEach(d => { state.attendanceData[d.id] = d.data(); });
    renderCalendar();
    updateCalendarSummary();
    refreshTodayDashboard();
  }));
}

export function unsubscribeAttendance() {
  attendanceLoadSeq += 1;
  prevMonthAttendanceLoadSeq += 1;
  if (state._attendanceSub) { state._attendanceSub(); state._attendanceSub = null; }
  state.attendanceData = {};
  refreshTodayDashboard();
}

// ===== 前月データを一回だけ取得（締め計算用） =====
async function fetchPrevMonthAttendance() {
  if (!state.currentUsername) return;
  // 前月の yearMonth を計算
  let y = state.calendarYear;
  let m = state.calendarMonth - 1;
  if (m < 0) { m = 11; y--; }
  const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
  const loadSeq = ++prevMonthAttendanceLoadSeq;
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const entries = await fetchAttendanceEntriesFromSupabase(state.currentUsername, [ym]);
      if (loadSeq !== prevMonthAttendanceLoadSeq) return;
      state.prevMonthAttendance = { _fetched: true, ...indexAttendanceEntriesByDate(entries) };
    } catch (err) {
      console.warn('前月勤怠取得エラー(Supabase):', err);
      state.prevMonthAttendance = { _fetched: true };
    }
    return;
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'users', state.currentUsername, 'attendance'),
            where('yearMonth', '==', ym))
    );
    recordGetDocsRead('cal.prev-month', '前月勤怠取得', `attendance:${ym}`, snap.size, snap.docs);
    if (loadSeq !== prevMonthAttendanceLoadSeq) return;
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
  const loadSeq = ++fiscalYearLoadSeq;
  const username = state.currentUsername;
  const today = new Date();
  // 年度は4月始まり
  const fiscalYear  = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const fiscalStart = `${fiscalYear}-04`;
  const fiscalEnd   = `${fiscalYear + 1}-03`;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      const entries = await fetchAttendanceEntriesFromSupabase(
        username,
        buildYearMonthRange(fiscalStart, fiscalEnd)
      );
      if (loadSeq !== fiscalYearLoadSeq || username !== state.currentUsername) return;
      let total = 0;
      entries.forEach(att => {
        if (att.type === '有給') total += 1;
        if (att.type === '半休午前' || att.type === '半休午後') total += 0.5;
      });
      state.fiscalYearPaidLeave = total;
      _updateFiscalDisplay();
      return;
    }
    const snap = await getDocs(
      query(collection(db, 'users', username, 'attendance'),
            where('yearMonth', '>=', fiscalStart),
            where('yearMonth', '<=', fiscalEnd))
    );
    if (loadSeq !== fiscalYearLoadSeq || username !== state.currentUsername) return;
    recordGetDocsRead('cal.fiscal-paid', '年度有給集計', `${fiscalStart}..${fiscalEnd}`, snap.size, snap.docs);
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
    showToast('Annual paid leave count could not be refreshed.', 'warning');
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
  if (!state.currentUsername) { showToast('ユーザーネームを設定してください', 'warning'); return; }
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

function formatHourValue(hours) {
  const normalized = normalizeWorkHours(hours);
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
}

function formatHourLabel(hours) {
  const value = formatHourValue(hours);
  return value === '0.5' ? '0.5時間（30分）' : `${value}時間`;
}

function ensureHourSelectOptions(selectEl, maxHours = EXTRA_HOURS_SELECT_MAX) {
  if (!selectEl) return;
  const existingValues = new Set([...selectEl.options].map(option => option.value));
  for (let hours = 0.5; hours <= maxHours + 0.001; hours += 0.5) {
    const value = formatHourValue(hours);
    if (existingValues.has(value)) continue;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = formatHourLabel(hours);
    selectEl.append(option);
  }
}

function setHourSelectValue(selectEl, hours) {
  if (!selectEl) return;
  const normalized = normalizeWorkHours(hours);
  if (normalized <= 0) {
    selectEl.value = '';
    return;
  }
  ensureHourSelectOptions(selectEl, Math.max(EXTRA_HOURS_SELECT_MAX, normalized));
  selectEl.value = formatHourValue(normalized);
}

function getSelectedHourValue(selectEl) {
  return normalizeWorkHours(selectEl?.value || 0);
}

function splitOverflowHours(hours) {
  const normalized = normalizeWorkHours(hours);
  const hayade = Math.floor(normalized) / 2;
  return {
    hayade: normalizeWorkHours(hayade),
    zangyo: normalizeWorkHours(normalized - hayade),
  };
}

function getCurrentWorkSiteTotalHours() {
  return Object.values(buildWorkSiteMapFromDom()).reduce((sum, hours) => sum + (Number(hours) || 0), 0);
}

function applyOverflowAllocation(mode, overflowHours) {
  const hayadeSelect = document.getElementById('cal-hayade-time');
  const zangyoSelect = document.getElementById('cal-zangyo-time');
  if (!hayadeSelect || !zangyoSelect) return;

  let hayadeHours = 0;
  let zangyoHours = 0;

  if (mode === 'hayade') {
    hayadeHours = overflowHours;
  } else if (mode === 'zangyo') {
    zangyoHours = overflowHours;
  } else {
    const split = splitOverflowHours(overflowHours);
    hayadeHours = split.hayade;
    zangyoHours = split.zangyo;
  }

  setHourSelectValue(hayadeSelect, hayadeHours);
  setHourSelectValue(zangyoSelect, zangyoHours);
  updateTimeTotal();
}

function updateWorkOverflowHelper() {
  const helperEl = document.getElementById('cal-work-overflow-helper');
  if (!helperEl) return;

  const totalHours = normalizeWorkHours(getCurrentWorkSiteTotalHours());
  const overflowHours = normalizeWorkHours(totalHours - REGULAR_WORK_HOURS);
  if (overflowHours <= 0) {
    helperEl.hidden = true;
    helperEl.innerHTML = '';
    return;
  }

  const hayadeHours = getSelectedHourValue(document.getElementById('cal-hayade-time'));
  const zangyoHours = getSelectedHourValue(document.getElementById('cal-zangyo-time'));
  const assignedHours = normalizeWorkHours(hayadeHours + zangyoHours);
  const split = splitOverflowHours(overflowHours);
  const splitButtonHtml = overflowHours >= 1
    ? `
      <button type="button" class="btn-modal-secondary cal-work-overflow-btn" data-mode="split">
        早出 ${formatHourValue(split.hayade)}h / 残業 ${formatHourValue(split.zangyo)}h
      </button>
    `
    : '';

  helperEl.hidden = false;
  helperEl.innerHTML = `
    <div class="cal-work-overflow-title">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      現場時間が ${formatHourValue(totalHours)} 時間なので、定時 ${REGULAR_WORK_HOURS} 時間を ${formatHourValue(overflowHours)} 時間超えています。
    </div>
    <div class="cal-work-overflow-status">
      現在の割り振り: 早出 ${formatHourValue(hayadeHours)}h / 残業 ${formatHourValue(zangyoHours)}h
      ${assignedHours === overflowHours ? '<span class="cal-work-overflow-match">超過分と一致しています</span>' : ''}
    </div>
    <div class="cal-work-overflow-actions">
      <button type="button" class="btn-modal-secondary cal-work-overflow-btn" data-mode="hayade">
        超過 ${formatHourValue(overflowHours)}h を早出へ
      </button>
      <button type="button" class="btn-modal-secondary cal-work-overflow-btn" data-mode="zangyo">
        超過 ${formatHourValue(overflowHours)}h を残業へ
      </button>
      ${splitButtonHtml}
    </div>
  `;

  helperEl.querySelectorAll('.cal-work-overflow-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyOverflowAllocation(btn.dataset.mode || '', overflowHours);
    });
  });
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

function sanitizeProjectKeys(src) {
  return normalizeProjectKeys(src);
}

function formatProjectKeysInput(src) {
  return sanitizeProjectKeys(src).join(', ');
}

function renderProjectKeyPreview(value = null) {
  const preview = document.getElementById('cal-project-key-preview');
  const input = document.getElementById('cal-project-keys');
  if (!preview || !input) return;
  const keys = sanitizeProjectKeys(value === null ? input.value : value);
  if (keys.length === 0) {
    preview.hidden = true;
    preview.innerHTML = '';
    return;
  }
  preview.hidden = false;
  preview.innerHTML = keys.map(key => `<span class="cal-project-key-chip">${esc(key)}</span>`).join('');
}

function getSelectedSiteProjectKeys(rows = getDayWorkRowsFromDom()) {
  return sanitizeProjectKeys(rows.map(row => getSiteById(row.siteId || '')?.code || ''));
}

function syncProjectKeysFromSelectedSites({ preserveManual = true } = {}) {
  const input = document.getElementById('cal-project-keys');
  if (!input) return [];
  const autoKeys = getSelectedSiteProjectKeys();
  const prevAutoKeys = Array.isArray(state.calendarAutoProjectKeys) ? state.calendarAutoProjectKeys : [];
  const manualKeys = preserveManual
    ? sanitizeProjectKeys(input.value).filter(key => !prevAutoKeys.includes(key))
    : [];
  const nextKeys = sanitizeProjectKeys([...autoKeys, ...manualKeys]);
  input.value = formatProjectKeysInput(nextKeys);
  state.calendarAutoProjectKeys = autoKeys;
  renderProjectKeyPreview(nextKeys);
  return nextKeys;
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
      const activeSiteIds = new Set(getSortedActiveSites().map(site => site.id));
      const usageMap = new Map();

      let attendanceRows = [];
      if (isSupabaseSharedCoreEnabled()) {
        const entries = await fetchAttendanceEntriesFromSupabase(username, buildYearMonthRange(startYm, endYm));
        attendanceRows = entries.map(entry => ({
          dateStr: entry?.date || entry?.dateStr || '',
          data: entry,
        }));
      } else {
        const snap = await getDocs(query(
          collection(db, 'users', username, 'attendance'),
          where('yearMonth', '>=', startYm),
          where('yearMonth', '<=', endYm)
        ));
        attendanceRows = snap.docs.map(d => ({ dateStr: d.id, data: d.data() }));
      }

      attendanceRows
        .filter(row => !!row.dateStr)
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
        syncProjectKeysFromSelectedSites();
        updateWorkOverflowHelper();
      });

      searchInput?.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const { autoSite } = syncSelectFromSearch(true);
        if (select && autoSite) {
          syncProjectKeysFromSelectedSites();
          rowEl.querySelector('.cal-day-work-hours')?.focus();
          return;
        }
        select?.focus();
      });

      select?.addEventListener('change', () => {
        const site = siteMap.get(select.value || '');
        if (searchInput && site) searchInput.value = formatSiteLabel(site);
        syncProjectKeysFromSelectedSites();
        updateWorkOverflowHelper();
      });

      rowEl.querySelector('.cal-day-work-hours')?.addEventListener('input', updateWorkOverflowHelper);
      rowEl.querySelector('.cal-day-work-hours')?.addEventListener('change', updateWorkOverflowHelper);
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
        updateWorkOverflowHelper();
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
        updateWorkOverflowHelper();
      };
    });

    syncProjectKeysFromSelectedSites();
  };

  addBtn.onclick = () => {
    const next = getDayWorkRowsFromDom();
    next.push({ siteId: '', hours: '', search: '' });
    renderRows(next);
    updateWorkOverflowHelper();
  };

  renderRows(initialRows);
  updateWorkOverflowHelper();
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
  ensureHourSelectOptions(hayadeInput);
  ensureHourSelectOptions(zangyoInput);
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

  const projectKeysInput = document.getElementById('cal-project-keys');
  if (projectKeysInput) {
    projectKeysInput.value = formatProjectKeysInput(att.projectKeys);
    projectKeysInput.oninput = () => renderProjectKeyPreview();
  }
  renderProjectKeyPreview();
  state.calendarAutoProjectKeys = [];

  // 作業現場入力（その日の内訳）
  renderDayWorkInputs(dateStr, att.workSiteHours);
  syncProjectKeysFromSelectedSites();
  updateTimeTotal();

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
  if (!totalEl) {
    updateWorkOverflowHelper();
    return;
  }
  const hayade = parseFloat(document.getElementById('cal-hayade-time')?.value) || 0;
  const zangyo = parseFloat(document.getElementById('cal-zangyo-time')?.value) || 0;
  const total  = hayade + zangyo;
  if (total === 0) {
    totalEl.hidden = true;
    updateWorkOverflowHelper();
    return;
  }
  totalEl.hidden = false;
  const parts = [];
  if (hayade > 0) parts.push(`早出 ${hayade}時間`);
  if (zangyo > 0) parts.push(`残業 ${zangyo}時間`);
  totalEl.innerHTML = `<i class="fa-solid fa-clock"></i> ${parts.join('　')}　<strong>計 ${total}時間</strong>`;
  updateWorkOverflowHelper();
}

export function closeDayPanel() {
  const panel = document.getElementById('cal-day-panel');
  if (panel) panel.hidden = true;
  state.calendarSelectedDate = null;
  state.calendarAutoProjectKeys = [];
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
  syncProjectKeysFromSelectedSites();
  const projectKeys = sanitizeProjectKeys(document.getElementById('cal-project-keys')?.value || '');
  const workSiteHours = buildWorkSiteMapFromDom();

  const btn = document.getElementById('cal-day-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }

  const saved =
    await saveAttendance(dateStr, {
    type:   type === 'normal' ? null : type,
    hayade: hayade || null,
    zangyo: zangyo || null,
    note:   note   || null,
    projectKeys,
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
