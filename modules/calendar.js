// ========== calendar.js — カレンダー & 個人勤怠管理 ==========
import { state } from './state.js';
import {
  db, collection, doc, setDoc, deleteDoc, getDocs, query, where, onSnapshot, serverTimestamp
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

let deps = {};
export function initCalendar(d) { deps = d; }

// ===== Firestore helpers =====
function attendancePath(username, dateStr) {
  return doc(db, 'users', username, 'attendance', dateStr);
}

export async function saveAttendance(dateStr, data) {
  if (!state.currentUsername) return;
  const yearMonth = dateStr.slice(0, 7);
  try {
    await setDoc(attendancePath(state.currentUsername, dateStr), {
      ...data,
      yearMonth,
      updatedAt: serverTimestamp(),
    });
    // 公開出席への同期
    if (data.type && data.type !== 'normal' && data.type !== null) {
      await deps.writePublicAttendance?.(dateStr, state.currentUsername, data.type);
    } else {
      await deps.removePublicAttendance?.(dateStr, state.currentUsername);
    }
  } catch (err) { console.error('勤怠保存エラー:', err); alert('保存に失敗しました'); }
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
    const info = deps.getDateInfo ? deps.getDateInfo(dateStr) : { isWorkSaturday: false, isPlannedLeave: false, isHoliday: false, holidayLabel: '', events: [] };

    let cellCls = 'cal-cell';
    if (isToday)   cellCls += ' cal-today';
    if (dow === 0) cellCls += ' cal-sun';
    if (dow === 6 && !info.isWorkSaturday) cellCls += ' cal-sat';
    if (info.isHoliday) cellCls += ' cal-company-holiday';

    // 勤怠タイプ背景色
    if (att?.type && att.type !== 'normal') cellCls += ` cal-att-${att.type === '有給' ? 'yukyu' : att.type.startsWith('半休') ? 'hankyu' : 'kekkin'}`;

    // 会社カレンダーバッジ（個人カレンダーにも表示）
    let companyBadges = '';
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

  const btn = document.getElementById('cal-day-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }

  await saveAttendance(dateStr, {
    type:   type === 'normal' ? null : type,
    hayade: hayade || null,
    zangyo: zangyo || null,
    note:   note   || null,
  });

  if (btn) { btn.disabled = false; btn.textContent = '保存'; }
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
