// ========== company-calendar.js — 会社カレンダー & 共有勤怠表示 ==========
import { state } from './state.js';
import {
  db, doc, setDoc, getDoc, onSnapshot, updateDoc, deleteField
} from './config.js';
import {
  isSupabaseSharedCoreEnabled,
  fetchCompanyCalSettingsFromSupabase,
  saveCompanyCalSettingsToSupabase,
  fetchPublicAttendanceFromSupabase,
  writePublicAttendanceToSupabase,
  removePublicAttendanceFromSupabase,
} from './supabase.js';
import { esc } from './utils.js';
import { verifyPIN } from './auth.js';

let deps = {};
export function initCompanyCalendar(d) { deps = d; }

const DOW_LABELS = ['日','月','火','水','木','金','土'];

// ===== 日本国民の祝日計算 =====
const _jpHolidayCache = {};

export function getJpNationalHolidays(year) {
  if (_jpHolidayCache[year]) return _jpHolidayCache[year];

  const h = {};
  const pad = n => String(n).padStart(2, '0');
  const key = (m, d) => `${year}-${pad(m)}-${pad(d)}`;

  // n番目の曜日(dow: 0=日,1=月...)を返す
  const nthWeekday = (m, nth, dow) => {
    const firstDow = new Date(year, m - 1, 1).getDay();
    return 1 + ((dow - firstDow + 7) % 7) + (nth - 1) * 7;
  };

  // 春分・秋分の日計算（1980〜2099）
  const shunbunDay = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  const shubunDay  = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));

  // ── 固定祝日 ──
  h[key(1, 1)]  = '元旦';
  h[key(2, 11)] = '建国記念の日';
  if (year >= 2020) h[key(2, 23)] = '天皇誕生日';
  h[key(3, shunbunDay)] = '春分の日';
  h[key(4, 29)] = '昭和の日';
  h[key(5, 3)]  = '憲法記念日';
  h[key(5, 4)]  = 'みどりの日';
  h[key(5, 5)]  = 'こどもの日';
  if (year >= 2016) h[key(8, 11)] = '山の日';
  h[key(9, shubunDay)] = '秋分の日';
  h[key(11, 3)]  = '文化の日';
  h[key(11, 23)] = '勤労感謝の日';
  if (year >= 1989 && year <= 2018) h[key(12, 23)] = '天皇誕生日';

  // ── ハッピーマンデー ──
  h[key(1, nthWeekday(1, 2, 1))]  = '成人の日';
  h[key(7, nthWeekday(7, 3, 1))]  = '海の日';
  h[key(9, nthWeekday(9, 3, 1))]  = '敬老の日';
  h[key(10, nthWeekday(10, 2, 1))] = 'スポーツの日';

  // ── 国民の休日（祝日に挟まれた平日） ──
  for (let m = 1; m <= 12; m++) {
    const lastD = new Date(year, m, 0).getDate();
    for (let d = 2; d < lastD; d++) {
      const prev = key(m, d - 1);
      const cur  = key(m, d);
      const next = key(m, d + 1);
      const dow  = new Date(year, m - 1, d).getDay();
      if (h[prev] && h[next] && !h[cur] && dow !== 0 && dow !== 6) {
        h[cur] = '国民の休日';
      }
    }
  }

  // ── 振替休日（日曜の祝日 → 翌以降の最初の非祝日平日） ──
  const snapshot = { ...h };
  Object.keys(snapshot).forEach(dateStr => {
    const d = new Date(dateStr);
    if (d.getDay() !== 0) return; // 日曜日の祝日のみ
    let sub = new Date(d);
    sub.setDate(sub.getDate() + 1);
    while (sub.getDay() === 0 || h[sub.toISOString().slice(0, 10)]) {
      sub.setDate(sub.getDate() + 1);
    }
    if (sub.getFullYear() === year) {
      h[sub.toISOString().slice(0, 10)] = '振替休日';
    }
  });

  _jpHolidayCache[year] = h;
  return h;
}

// ===== Firestore パス =====
const companyCalRef = () => doc(db, 'company_calendar', 'config');
const publicAttRef = (ym) => doc(db, 'public_attendance', ym);

// ===== 年間カレンダーモーダル内部状態 =====
let _ccsMode      = 'ws';       // 'ws' | 'holiday' | 'event'
let _ccsFiscalYear = null;      // 現在表示中の年度開始年（4月）
let _pendingHolidayStart = null; // 会社休日モードで1回目クリックした日付

// ===== 会社カレンダー設定の購読 =====
const EMPTY_CAL_CONFIG = Object.freeze({ workSaturdays: [], plannedLeaveSaturdays: [], holidayRanges: [], events: [] });

function _applyCompanyCalConfig(cfg) {
  state.companyCalConfig = cfg || EMPTY_CAL_CONFIG;
  if (typeof deps.renderCalendar === 'function') deps.renderCalendar();
  deps.onCompanyCalConfigChanged?.();
  if (state.calTab === 'shared') renderSharedCalendar();
  const body = document.getElementById('ccs-body');
  if (body && !body.hidden) _renderAnnualGrid();
}

export function subscribeCompanyCalConfig() {
  if (state._companyCalUnsub) { state._companyCalUnsub(); state._companyCalUnsub = null; }
  if (isSupabaseSharedCoreEnabled()) {
    fetchCompanyCalSettingsFromSupabase()
      .then(cfg => _applyCompanyCalConfig(cfg))
      .catch(err => {
        console.warn('Supabase 会社カレンダー読み込みエラー:', err);
        _applyCompanyCalConfig(null);
      });
    return;
  }
  state._companyCalUnsub = onSnapshot(companyCalRef(), snap => {
    _applyCompanyCalConfig(snap.exists() ? snap.data() : null);
  }, err => {
    console.warn('会社カレンダー読み込みエラー:', err);
    _applyCompanyCalConfig(null);
  });
}

export function unsubscribeCompanyCalConfig() {
  if (state._companyCalUnsub) { state._companyCalUnsub(); state._companyCalUnsub = null; }
}

async function _refreshCompanyCalIfSupabase() {
  if (!isSupabaseSharedCoreEnabled()) return;
  try {
    const cfg = await fetchCompanyCalSettingsFromSupabase();
    _applyCompanyCalConfig(cfg);
  } catch (_) {}
}

// ===== 公開出席への書き込み =====
export async function writePublicAttendance(dateStr, username, type) {
  if (!dateStr || !username || !type) return;
  const ym  = dateStr.slice(0, 7);
  const day = dateStr.slice(8, 10);
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await writePublicAttendanceToSupabase(ym, day, username, type);
    } else {
      await setDoc(publicAttRef(ym), { [day]: { [username]: type } }, { merge: true });
    }
  } catch (err) { console.warn('公開出席書込みエラー:', err); }
}

export async function removePublicAttendance(dateStr, username) {
  if (!dateStr || !username) return;
  const ym  = dateStr.slice(0, 7);
  const day = dateStr.slice(8, 10);
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await removePublicAttendanceFromSupabase(ym, day, username);
    } else {
      await updateDoc(publicAttRef(ym), { [`${day}.${username}`]: deleteField() });
    }
  } catch (_) {}
}

// ===== 公開出席の月単位取得 =====
export async function fetchPublicAttendance(ym) {
  try {
    if (isSupabaseSharedCoreEnabled()) {
      state.publicAttendance[ym] = await fetchPublicAttendanceFromSupabase(ym);
    } else {
      const snap = await getDoc(publicAttRef(ym));
      state.publicAttendance[ym] = snap.exists() ? snap.data() : {};
    }
  } catch (err) {
    console.warn('公開出席取得エラー:', err);
    state.publicAttendance[ym] = {};
  }
}

// ===== 日付情報の判定ユーティリティ =====
export function getDateInfo(dateStr) {
  const cfg = state.companyCalConfig;
  if (!cfg) return { isWorkSaturday: false, isPlannedLeave: false, isHoliday: false, holidayLabel: '', events: [], jpHolidayName: '' };

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

  // 日本の祝祭日
  const year = parseInt(dateStr.slice(0, 4), 10);
  const jpHolidays = getJpNationalHolidays(year);
  const jpHolidayName = jpHolidays[dateStr] || '';

  return { isWorkSaturday, isPlannedLeave, isHoliday, holidayLabel, events, jpHolidayName };
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
    if (info.jpHolidayName && dow !== 0) cellCls += ' cal-jp-holiday'; // 祝祭日（日曜以外）
    if (info.isHoliday) cellCls += ' cal-company-holiday';

    let companyBadges = '';
    if (info.jpHolidayName) {
      companyBadges += `<span class="cal-company-badge jp-holiday-badge" title="${esc(info.jpHolidayName)}">${esc(info.jpHolidayName)}</span>`;
    }
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
      if (info.jpHolidayName && dow !== 0) cls += ' ccs-jp-holiday'; // 日曜以外の祝祭日は赤
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
      if (info.jpHolidayName) title += ` ★${info.jpHolidayName}`;
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
    if (isSupabaseSharedCoreEnabled()) {
      await saveCompanyCalSettingsToSupabase({ workSaturdays: newWs, plannedLeaveSaturdays: newPl });
      await _refreshCompanyCalIfSupabase();
    } else {
      await setDoc(companyCalRef(), { workSaturdays: newWs, plannedLeaveSaturdays: newPl }, { merge: true });
    }
  } else if (ws.includes(dateStr)) {
    // 出勤土曜 → 計画付与に昇格
    const newPl = [...pl, dateStr].sort();
    if (isSupabaseSharedCoreEnabled()) {
      await saveCompanyCalSettingsToSupabase({ plannedLeaveSaturdays: newPl });
      await _refreshCompanyCalIfSupabase();
    } else {
      await setDoc(companyCalRef(), { plannedLeaveSaturdays: newPl }, { merge: true });
    }
  } else {
    // 未登録 → 出勤土曜に追加
    const newWs = [...new Set([...ws, dateStr])].sort();
    if (isSupabaseSharedCoreEnabled()) {
      await saveCompanyCalSettingsToSupabase({ workSaturdays: newWs });
      await _refreshCompanyCalIfSupabase();
    } else {
      await setDoc(companyCalRef(), { workSaturdays: newWs }, { merge: true });
    }
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
  if (isSupabaseSharedCoreEnabled()) {
    await saveCompanyCalSettingsToSupabase({ holidayRanges: ranges });
    await _refreshCompanyCalIfSupabase();
  } else {
    await setDoc(companyCalRef(), { holidayRanges: ranges }, { merge: true });
  }
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
  if (isSupabaseSharedCoreEnabled()) {
    await saveCompanyCalSettingsToSupabase({ events });
    await _refreshCompanyCalIfSupabase();
  } else {
    await setDoc(companyCalRef(), { events }, { merge: true });
  }
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
