// ========== company-calendar.js — 会社カレンダー & 共有勤怠表示 ==========
import { state } from './state.js';
import {
  db, doc, setDoc, getDoc, onSnapshot, updateDoc, deleteField
} from './config.js';
import { esc } from './utils.js';
import { verifyPIN } from './auth.js';

let deps = {};
export function initCompanyCalendar(d) { deps = d; }

const DOW_LABELS = ['日','月','火','水','木','金','土'];

// ===== Firestore パス =====
const companyCalRef = () => doc(db, 'company_calendar', 'config');
const publicAttRef = (ym) => doc(db, 'public_attendance', ym);

// ===== 年間カレンダーモーダル内部状態 =====
let _ccsMode      = 'ws';       // 'ws' | 'holiday' | 'event'
let _ccsFiscalYear = null;      // 現在表示中の年度開始年（4月）
let _pendingHolidayStart = null; // 会社休日モードで1回目クリックした日付

// ===== 会社カレンダー設定の購読 =====
export function subscribeCompanyCalConfig() {
  if (state._companyCalUnsub) { state._companyCalUnsub(); state._companyCalUnsub = null; }
  state._companyCalUnsub = onSnapshot(companyCalRef(), snap => {
    state.companyCalConfig = snap.exists() ? snap.data() : {
      workSaturdays: [],
      plannedLeaveSaturdays: [],
      holidayRanges: [],
      events: [],
    };
    // 再描画
    if (typeof deps.renderCalendar === 'function') deps.renderCalendar();
    if (state.calTab === 'shared') renderSharedCalendar();
    // 設定モーダルが開いていれば更新
    const body = document.getElementById('ccs-body');
    if (body && !body.hidden) _renderAnnualGrid();
  }, err => {
    console.warn('会社カレンダー読み込みエラー:', err);
    state.companyCalConfig = { workSaturdays: [], plannedLeaveSaturdays: [], holidayRanges: [], events: [] };
  });
}

export function unsubscribeCompanyCalConfig() {
  if (state._companyCalUnsub) { state._companyCalUnsub(); state._companyCalUnsub = null; }
}

// ===== 公開出席への書き込み =====
export async function writePublicAttendance(dateStr, username, type) {
  if (!dateStr || !username || !type) return;
  const ym  = dateStr.slice(0, 7);
  const day = dateStr.slice(8, 10);
  try {
    await setDoc(publicAttRef(ym), {
      [day]: { [username]: type }
    }, { merge: true });
  } catch (err) { console.warn('公開出席書込みエラー:', err); }
}

export async function removePublicAttendance(dateStr, username) {
  if (!dateStr || !username) return;
  const ym  = dateStr.slice(0, 7);
  const day = dateStr.slice(8, 10);
  try {
    await updateDoc(publicAttRef(ym), {
      [`${day}.${username}`]: deleteField()
    });
  } catch (_) {}
}

// ===== 公開出席の月単位取得 =====
export async function fetchPublicAttendance(ym) {
  try {
    const snap = await getDoc(publicAttRef(ym));
    state.publicAttendance[ym] = snap.exists() ? snap.data() : {};
  } catch (err) {
    console.warn('公開出席取得エラー:', err);
    state.publicAttendance[ym] = {};
  }
}

// ===== 日付情報の判定ユーティリティ =====
export function getDateInfo(dateStr) {
  const cfg = state.companyCalConfig;
  if (!cfg) return { isWorkSaturday: false, isPlannedLeave: false, isHoliday: false, holidayLabel: '', events: [] };

  const isWorkSaturday = (cfg.workSaturdays || []).includes(dateStr);
  const isPlannedLeave = (cfg.plannedLeaveSaturdays || []).includes(dateStr);

  let isHoliday   = false;
  let holidayLabel = '';
  for (const range of (cfg.holidayRanges || [])) {
    if (dateStr >= range.start && dateStr <= range.end) {
      isHoliday    = true;
      holidayLabel = range.label || '会社休日';
      break;
    }
  }

  const events = (cfg.events || []).filter(e => e.date === dateStr);

  return { isWorkSaturday, isPlannedLeave, isHoliday, holidayLabel, events };
}

// ===== 共有カレンダー描画 =====
export async function renderSharedCalendar() {
  const el = document.getElementById('cal-shared-container');
  if (!el) return;

  const year  = state.calendarYear;
  const month = state.calendarMonth;
  const ym    = `${year}-${String(month + 1).padStart(2, '0')}`;
  const today = new Date();

  if (!state.publicAttendance[ym]) {
    await fetchPublicAttendance(ym);
  }
  const pubAtt = state.publicAttendance[ym] || {};

  const firstDay = new Date(year, month, 1);
  const lastDate  = new Date(year, month + 1, 0).getDate();
  const startDow  = firstDay.getDay();

  // 設定ボタンは常に表示（クリック時にPINゲートを出す）
  let html = `<div class="cal-shared-header">
    <span class="cal-shared-title"><i class="fa-solid fa-users"></i> 共有カレンダー</span>
    <button class="btn-company-cal-settings" id="btn-company-cal-settings" title="会社カレンダー設定"><i class="fa-solid fa-gear"></i> 設定</button>
  </div>`;

  html += '<div class="cal-dow-row">';
  DOW_LABELS.forEach((d, i) => {
    html += `<div class="cal-dow-cell${i === 0 ? ' cal-sun-label' : i === 6 ? ' cal-sat-label' : ''}">${d}</div>`;
  });
  html += '</div>';

  html += '<div class="cal-cells cal-shared-cells">';

  for (let i = 0; i < startDow; i++) {
    html += '<div class="cal-cell cal-cell-empty"></div>';
  }

  for (let d = 1; d <= lastDate; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow     = new Date(year, month, d).getDay();
    const isToday = (year === today.getFullYear() && month === today.getMonth() && d === today.getDate());
    const info    = getDateInfo(dateStr);

    const dayKey  = String(d).padStart(2, '0');
    const dayAtt  = pubAtt[dayKey] || {};

    let cellCls = 'cal-cell cal-shared-cell';
    if (isToday)   cellCls += ' cal-today';
    if (dow === 0) cellCls += ' cal-sun';
    if (dow === 6 && !info.isWorkSaturday) cellCls += ' cal-sat';
    if (info.isHoliday) cellCls += ' cal-company-holiday';

    let companyBadges = '';
    if (info.isPlannedLeave) {
      companyBadges += `<span class="cal-company-badge planned-lv" title="計画的付与">計画付与</span>`;
    } else if (info.isWorkSaturday) {
      companyBadges += `<span class="cal-company-badge work-sat" title="出勤土曜">出勤</span>`;
    }
    if (info.isHoliday) {
      companyBadges += `<span class="cal-company-badge holiday-rng" title="${esc(info.holidayLabel)}">${esc(info.holidayLabel)}</span>`;
    }
    info.events.forEach(ev => {
      const color = ev.color || 'var(--accent-cyan)';
      companyBadges += `<span class="cal-company-badge event-badge" style="background:${color}20;color:${color}" title="${esc(ev.label)}">${esc(ev.label)}</span>`;
    });

    let userBadges = '';
    Object.entries(dayAtt).forEach(([username, type]) => {
      let cls = '';
      if (type === '有給') cls = 'yukyu';
      else if (type?.startsWith('半休')) cls = 'hankyu';
      else if (type === '欠勤') cls = 'kekkin';
      const shortType = type === '半休午前' ? '午前休' : type === '半休午後' ? '午後休' : type;
      userBadges += `<span class="cal-shared-user-badge ${cls}" title="${esc(username)}: ${esc(shortType)}">${esc(username)}</span>`;
    });

    html += `<div class="${cellCls}" data-date="${dateStr}">
      <div class="cal-day-num">${d}</div>
      <div class="cal-day-content">
        ${companyBadges}
        ${userBadges}
      </div>
    </div>`;
  }

  html += '</div>';
  el.innerHTML = html;
}

// ===== 設定モーダルを開く（PIN認証ゲートを表示） =====
export function openCompanyCalSettings() {
  const modal = document.getElementById('company-cal-settings-modal');
  if (!modal) return;

  // 初期化
  _pendingHolidayStart = null;
  const pinGate = document.getElementById('ccs-pin-gate');
  const body    = document.getElementById('ccs-body');
  const pinInput = document.getElementById('ccs-pin-input');
  const pinError = document.getElementById('ccs-pin-error');

  // 既に管理者認証済みならそのまま本体を表示
  if (state.isAdmin) {
    if (pinGate) pinGate.hidden = true;
    if (body) body.hidden = false;
    _initFiscalYear();
    _renderAnnualGrid();
  } else {
    if (pinGate) pinGate.hidden = false;
    if (body) body.hidden = true;
    if (pinInput) { pinInput.value = ''; setTimeout(() => pinInput.focus(), 100); }
    if (pinError) pinError.hidden = true;
  }

  modal.classList.add('visible');
}

export function closeCompanyCalSettings() {
  const modal = document.getElementById('company-cal-settings-modal');
  if (modal) modal.classList.remove('visible');
  _pendingHolidayStart = null;
  _updateModeHint();
}

// ===== 現在の年度を初期設定 =====
function _initFiscalYear() {
  if (_ccsFiscalYear !== null) return;
  const now = new Date();
  // 4月以降は今年度、3月以前は前年度
  _ccsFiscalYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

// ===== 年度ラベル更新 =====
function _updateFyLabel() {
  const el = document.getElementById('ccs-fy-label');
  if (el) {
    const wareki = _ccsFiscalYear - 2018; // 令和元年=2019
    el.textContent = `${_ccsFiscalYear}年度（令和${wareki}年度）`;
  }
}

// ===== モードヒント更新 =====
function _updateModeHint() {
  const el = document.getElementById('ccs-mode-hint');
  if (!el) return;
  if (_ccsMode === 'ws') {
    el.innerHTML = '<i class="fa-solid fa-hand-pointer"></i> 土曜日をクリックで出勤日を登録/解除。登録済みをもう一度クリックで計画付与に切り替え。';
  } else if (_ccsMode === 'holiday') {
    if (_pendingHolidayStart) {
      el.innerHTML = `<i class="fa-solid fa-calendar-check" style="color:#fb923c"></i> 開始日: <b>${_pendingHolidayStart}</b> ─ 次に終了日をクリックしてください（同じ日でも可）`;
    } else {
      el.innerHTML = '<i class="fa-solid fa-hand-pointer"></i> 開始日をクリック → 終了日をクリック → ラベルを入力して登録。';
    }
  } else if (_ccsMode === 'event') {
    el.innerHTML = '<i class="fa-solid fa-hand-pointer"></i> 行事を追加したい日をクリックしてください。';
  }
}

// ===== 年間グリッド描画 =====
function _renderAnnualGrid() {
  const grid = document.getElementById('ccs-annual-grid');
  if (!grid) return;

  _updateFyLabel();
  _updateModeHint();

  const cfg = state.companyCalConfig || { workSaturdays: [], plannedLeaveSaturdays: [], holidayRanges: [], events: [] };
  const fy  = _ccsFiscalYear; // 4月スタート年

  let html = '';
  for (let mi = 0; mi < 12; mi++) {
    const monthIdx = (3 + mi) % 12; // 0=Jan ... 3=Apr
    const year     = mi < 9 ? fy : fy + 1; // Apr〜Dec: fy, Jan〜Mar: fy+1
    const ym       = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const firstDay = new Date(year, monthIdx, 1);
    const lastDate = new Date(year, monthIdx + 1, 0).getDate();
    const startDow = firstDay.getDay();
    const monthName = `${year}年${monthIdx + 1}月`;

    html += `<div class="ccs-mini-cal">
      <div class="ccs-mini-cal-title">${monthName}</div>
      <div class="ccs-mini-dow-row">`;
    DOW_LABELS.forEach((d, i) => {
      html += `<div class="ccs-mini-dow${i===0?' ccs-sun':i===6?' ccs-sat':''}">${d}</div>`;
    });
    html += '</div><div class="ccs-mini-days">';

    for (let i = 0; i < startDow; i++) {
      html += '<div class="ccs-mini-day ccs-mini-empty"></div>';
    }

    for (let d = 1; d <= lastDate; d++) {
      const dateStr = `${year}-${String(monthIdx + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dow     = new Date(year, monthIdx, d).getDay();
      const info    = getDateInfo(dateStr);

      let cls = 'ccs-mini-day';
      if (dow === 0) cls += ' ccs-sun';
      if (dow === 6) cls += ' ccs-sat-day';
      if (info.isWorkSaturday && info.isPlannedLeave) cls += ' ccs-day-planned';
      else if (info.isWorkSaturday) cls += ' ccs-day-worksat';
      if (info.isHoliday) cls += ' ccs-day-holiday';
      if (info.events.length) cls += ' ccs-day-event';
      if (dateStr === _pendingHolidayStart) cls += ' ccs-day-pending';

      // クリック可否
      const isClickable = _isDayClickable(dow, info);
      if (isClickable) cls += ' ccs-day-clickable';

      // ツールチップ
      let title = dateStr;
      if (info.isWorkSaturday) title += info.isPlannedLeave ? ' [計画付与]' : ' [出勤土曜]';
      if (info.isHoliday) title += ` [${info.holidayLabel}]`;
      info.events.forEach(ev => { title += ` [${ev.label}]`; });

      // 行事の色ドット
      let dotHtml = '';
      if (info.events.length) {
        const color = info.events[0].color || '#a78bfa';
        dotHtml = `<span class="ccs-event-dot" style="background:${color}"></span>`;
      }

      html += `<div class="${cls}" data-date="${dateStr}" title="${title}">${d}${dotHtml}</div>`;
    }

    html += '</div></div>';
  }

  grid.innerHTML = html;

  // クリックイベント
  grid.querySelectorAll('.ccs-day-clickable').forEach(cell => {
    cell.addEventListener('click', () => _onDayClick(cell.dataset.date));
  });
}

// ===== クリック可否判定 =====
function _isDayClickable(dow, info) {
  if (_ccsMode === 'ws') {
    return dow === 6; // 土曜のみ
  }
  if (_ccsMode === 'holiday') {
    return true; // すべての日
  }
  if (_ccsMode === 'event') {
    return true; // すべての日
  }
  return false;
}

// ===== 日付クリック処理 =====
async function _onDayClick(dateStr) {
  if (_ccsMode === 'ws') {
    await _toggleWorkSaturday(dateStr);
  } else if (_ccsMode === 'holiday') {
    await _handleHolidayClick(dateStr);
  } else if (_ccsMode === 'event') {
    await _handleEventClick(dateStr);
  }
}

// ===== 出勤土曜トグル =====
async function _toggleWorkSaturday(dateStr) {
  const cfg = state.companyCalConfig || {};
  const ws  = cfg.workSaturdays || [];
  const pl  = cfg.plannedLeaveSaturdays || [];

  if (pl.includes(dateStr)) {
    // 計画付与 → 削除
    const newWs = ws.filter(d => d !== dateStr);
    const newPl = pl.filter(d => d !== dateStr);
    await setDoc(companyCalRef(), { workSaturdays: newWs, plannedLeaveSaturdays: newPl }, { merge: true });
  } else if (ws.includes(dateStr)) {
    // 出勤土曜 → 計画付与に昇格
    const newPl = [...pl, dateStr].sort();
    await setDoc(companyCalRef(), { plannedLeaveSaturdays: newPl }, { merge: true });
  } else {
    // 未登録 → 出勤土曜に追加
    const newWs = [...new Set([...ws, dateStr])].sort();
    await setDoc(companyCalRef(), { workSaturdays: newWs }, { merge: true });
  }
}

// ===== 会社休日クリック処理 =====
async function _handleHolidayClick(dateStr) {
  if (!_pendingHolidayStart) {
    // 1回目: 開始日を選択
    _pendingHolidayStart = dateStr;
    _updateModeHint();
    _renderAnnualGrid();
    return;
  }

  // 2回目: 終了日が決まったのでラベル入力
  const start = _pendingHolidayStart <= dateStr ? _pendingHolidayStart : dateStr;
  const end   = _pendingHolidayStart <= dateStr ? dateStr : _pendingHolidayStart;
  _pendingHolidayStart = null;

  const label = prompt(`${start}〜${end} の休日ラベルを入力してください\n（例：GW、夏期休暇）`);
  if (!label || !label.trim()) {
    _updateModeHint();
    _renderAnnualGrid();
    return;
  }

  const cfg    = state.companyCalConfig || {};
  const ranges = [...(cfg.holidayRanges || []), { start, end, label: label.trim() }];
  await setDoc(companyCalRef(), { holidayRanges: ranges }, { merge: true });
}

// ===== 行事クリック処理 =====
async function _handleEventClick(dateStr) {
  const label = prompt(`${dateStr} の行事名を入力してください`);
  if (!label || !label.trim()) return;

  const color = _showColorPicker(label.trim());
  // color は同期的に返せないので、ここでは prompt で簡易的に色を選ぶ
  // 実際には後続の実装でカラーピッカーUIに置き換え可能
  const cfg    = state.companyCalConfig || {};
  const events = [...(cfg.events || []), { date: dateStr, label: label.trim(), color: color || '#a78bfa' }];
  await setDoc(companyCalRef(), { events }, { merge: true });
}

// ===== 簡易カラー選択（prompt fallback） =====
function _showColorPicker(label) {
  // inline color picker を表示する代わりに、選択肢から選ばせる
  const colors = ['#a78bfa（紫）','#60a5fa（青）','#34d399（緑）','#fb923c（オレンジ）','#f87171（赤）','#fbbf24（黄）'];
  const choice = prompt(`「${label}」の色を選んでください:\n${colors.map((c,i)=>`${i+1}: ${c}`).join('\n')}\n番号を入力（省略可）`);
  const idx = parseInt(choice) - 1;
  const hexMap = ['#a78bfa','#60a5fa','#34d399','#fb923c','#f87171','#fbbf24'];
  return hexMap[idx] || '#a78bfa';
}

// ===== 設定モーダルのフォームイベント初期化（script.js から一度だけ呼ぶ） =====
export function initCompanyCalSettingsForms() {
  // PIN認証
  const pinSubmit = document.getElementById('ccs-pin-submit');
  const pinInput  = document.getElementById('ccs-pin-input');
  if (pinSubmit && pinInput) {
    const doAuth = async () => {
      const pin = pinInput.value.trim();
      if (!pin) return;
      pinSubmit.disabled = true;
      pinSubmit.textContent = '確認中…';
      const ok = await verifyPIN(pin);
      pinSubmit.disabled = false;
      pinSubmit.textContent = '認証';
      const errEl = document.getElementById('ccs-pin-error');
      if (ok) {
        state.isAdmin = true;
        document.getElementById('ccs-pin-gate').hidden = true;
        const body = document.getElementById('ccs-body');
        body.hidden = false;
        _initFiscalYear();
        _renderAnnualGrid();
        if (errEl) errEl.hidden = true;
      } else {
        if (errEl) { errEl.hidden = false; errEl.textContent = 'PINが違います'; }
        pinInput.value = '';
        pinInput.focus();
      }
    };
    pinSubmit.addEventListener('click', doAuth);
    pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
  }

  // 年度ナビ
  document.getElementById('ccs-prev-fy')?.addEventListener('click', () => {
    _ccsFiscalYear--;
    _renderAnnualGrid();
  });
  document.getElementById('ccs-next-fy')?.addEventListener('click', () => {
    _ccsFiscalYear++;
    _renderAnnualGrid();
  });

  // モード切替
  document.getElementById('ccs-mode-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.ccs-mode-btn');
    if (!btn) return;
    _ccsMode = btn.dataset.mode;
    _pendingHolidayStart = null;
    document.querySelectorAll('#ccs-mode-tabs .ccs-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _renderAnnualGrid();
  });

  // 閉じるボタン
  document.getElementById('ccs-close-btn')?.addEventListener('click', closeCompanyCalSettings);

  // モーダル外クリックで閉じる
  const modal = document.getElementById('company-cal-settings-modal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeCompanyCalSettings();
    });
  }
}
