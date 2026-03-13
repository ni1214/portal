// ========== company-calendar.js — 会社カレンダー & 共有勤怠表示 ==========
import { state } from './state.js';
import {
  db, doc, setDoc, getDoc, onSnapshot, updateDoc, deleteField
} from './config.js';
import { esc } from './utils.js';

let deps = {};
export function initCompanyCalendar(d) { deps = d; }

const DOW_LABELS = ['日','月','火','水','木','金','土'];

// ===== Firestore パス =====
const companyCalRef = () => doc(db, 'company_calendar', 'config');
const publicAttRef = (ym) => doc(db, 'public_attendance', ym);

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
  const ym  = dateStr.slice(0, 7);   // 'YYYY-MM'
  const day = dateStr.slice(8, 10);  // '03'
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
    // フィールドパスを使って該当ユーザーのエントリだけ削除
    await updateDoc(publicAttRef(ym), {
      [`${day}.${username}`]: deleteField()
    });
  } catch (_) {
    // ドキュメント自体が存在しない場合は無視
  }
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
// returns: { isWorkSaturday, isPlannedLeave, isHoliday, holidayLabel, events[] }
export function getDateInfo(dateStr) {
  const cfg = state.companyCalConfig;
  if (!cfg) return { isWorkSaturday: false, isPlannedLeave: false, isHoliday: false, holidayLabel: '', events: [] };

  const isWorkSaturday    = (cfg.workSaturdays || []).includes(dateStr);
  const isPlannedLeave    = (cfg.plannedLeaveSaturdays || []).includes(dateStr);

  // 休日範囲チェック
  let isHoliday   = false;
  let holidayLabel = '';
  for (const range of (cfg.holidayRanges || [])) {
    if (dateStr >= range.start && dateStr <= range.end) {
      isHoliday    = true;
      holidayLabel = range.label || '会社休日';
      break;
    }
  }

  // 会社行事チェック
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

  // 公開出席データを取得
  if (!state.publicAttendance[ym]) {
    await fetchPublicAttendance(ym);
  }
  const pubAtt = state.publicAttendance[ym] || {};

  const firstDay = new Date(year, month, 1);
  const lastDate  = new Date(year, month + 1, 0).getDate();
  const startDow  = firstDay.getDay();

  let html = `<div class="cal-shared-header">
    <span class="cal-shared-title"><i class="fa-solid fa-users"></i> 共有カレンダー</span>
    ${state.isAdmin ? `<button class="btn-company-cal-settings" id="btn-company-cal-settings" title="会社カレンダー設定"><i class="fa-solid fa-gear"></i> 設定</button>` : ''}
  </div>`;

  // 曜日ヘッダー
  html += '<div class="cal-dow-row">';
  DOW_LABELS.forEach((d, i) => {
    html += `<div class="cal-dow-cell${i === 0 ? ' cal-sun-label' : i === 6 ? ' cal-sat-label' : ''}">${d}</div>`;
  });
  html += '</div>';

  // グリッド
  html += '<div class="cal-cells cal-shared-cells">';

  for (let i = 0; i < startDow; i++) {
    html += '<div class="cal-cell cal-cell-empty"></div>';
  }

  for (let d = 1; d <= lastDate; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow     = new Date(year, month, d).getDay();
    const isToday = (year === today.getFullYear() && month === today.getMonth() && d === today.getDate());
    const info    = getDateInfo(dateStr);

    // 曜日名
    const dayKey  = String(d).padStart(2, '0');
    const dayAtt  = pubAtt[dayKey] || {};   // { alice: '有給', bob: '半休午前' }

    let cellCls = 'cal-cell cal-shared-cell';
    if (isToday)   cellCls += ' cal-today';
    if (dow === 0) cellCls += ' cal-sun';
    if (dow === 6 && !info.isWorkSaturday) cellCls += ' cal-sat';   // 休日土曜
    if (info.isHoliday) cellCls += ' cal-company-holiday';

    // 会社情報バッジ
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

    // 休暇者バッジ
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

// ===== 管理者設定モーダルを開く =====
export function openCompanyCalSettings() {
  const modal = document.getElementById('company-cal-settings-modal');
  if (!modal) return;
  _renderSettingsModal();
  modal.classList.add('visible');
}

export function closeCompanyCalSettings() {
  const modal = document.getElementById('company-cal-settings-modal');
  if (modal) modal.classList.remove('visible');
}

// ===== 設定モーダルの描画 =====
function _renderSettingsModal() {
  const cfg = state.companyCalConfig || { workSaturdays: [], plannedLeaveSaturdays: [], holidayRanges: [], events: [] };

  // 出勤土曜リスト
  const wsEl = document.getElementById('ccs-work-saturdays');
  if (wsEl) {
    const sorted = [...(cfg.workSaturdays || [])].sort();
    wsEl.innerHTML = sorted.length === 0
      ? '<p class="ccs-empty">登録なし</p>'
      : sorted.map(d => `
        <div class="ccs-list-item">
          <span>${d}${(cfg.plannedLeaveSaturdays || []).includes(d) ? ' <span class="ccs-planned-tag">計画付与</span>' : ''}</span>
          <div class="ccs-item-actions">
            <button class="btn-ccs-toggle-planned" data-date="${d}" title="${(cfg.plannedLeaveSaturdays || []).includes(d) ? '計画付与を外す' : '計画付与にする'}">${(cfg.plannedLeaveSaturdays || []).includes(d) ? '✓計画付与' : '計画付与'}</button>
            <button class="btn-ccs-remove-ws" data-date="${d}" title="削除"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`).join('');

    // イベント
    wsEl.querySelectorAll('.btn-ccs-remove-ws').forEach(btn => {
      btn.addEventListener('click', () => _removeWorkSaturday(btn.dataset.date));
    });
    wsEl.querySelectorAll('.btn-ccs-toggle-planned').forEach(btn => {
      btn.addEventListener('click', () => _togglePlannedLeave(btn.dataset.date));
    });
  }

  // 会社休日リスト
  const hrEl = document.getElementById('ccs-holiday-ranges');
  if (hrEl) {
    const ranges = cfg.holidayRanges || [];
    hrEl.innerHTML = ranges.length === 0
      ? '<p class="ccs-empty">登録なし</p>'
      : ranges.map((r, i) => `
        <div class="ccs-list-item">
          <span>${r.start} 〜 ${r.end}　<b>${esc(r.label)}</b></span>
          <button class="btn-ccs-remove-hr" data-index="${i}" title="削除"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('');
    hrEl.querySelectorAll('.btn-ccs-remove-hr').forEach(btn => {
      btn.addEventListener('click', () => _removeHolidayRange(parseInt(btn.dataset.index)));
    });
  }

  // 会社行事リスト
  const evEl = document.getElementById('ccs-events');
  if (evEl) {
    const events = cfg.events || [];
    evEl.innerHTML = events.length === 0
      ? '<p class="ccs-empty">登録なし</p>'
      : events.map((ev, i) => `
        <div class="ccs-list-item">
          <span style="color:${ev.color || 'inherit'}">● ${ev.date}　${esc(ev.label)}</span>
          <button class="btn-ccs-remove-ev" data-index="${i}" title="削除"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('');
    evEl.querySelectorAll('.btn-ccs-remove-ev').forEach(btn => {
      btn.addEventListener('click', () => _removeEvent(parseInt(btn.dataset.index)));
    });
  }
}

// ===== 出勤土曜を追加 =====
async function _addWorkSaturday(dateStr) {
  if (!dateStr) return;
  // 土曜日かチェック
  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDay() !== 6) { alert('土曜日の日付を選択してください'); return; }

  const cfg = state.companyCalConfig || {};
  const ws  = [...new Set([...(cfg.workSaturdays || []), dateStr])].sort();
  await setDoc(companyCalRef(), { workSaturdays: ws }, { merge: true });
}

// ===== 出勤土曜を削除 =====
async function _removeWorkSaturday(dateStr) {
  const cfg = state.companyCalConfig || {};
  const ws  = (cfg.workSaturdays || []).filter(d => d !== dateStr);
  const pl  = (cfg.plannedLeaveSaturdays || []).filter(d => d !== dateStr);
  await setDoc(companyCalRef(), { workSaturdays: ws, plannedLeaveSaturdays: pl }, { merge: true });
}

// ===== 計画的付与トグル =====
async function _togglePlannedLeave(dateStr) {
  const cfg = state.companyCalConfig || {};
  const pl  = cfg.plannedLeaveSaturdays || [];
  const newPl = pl.includes(dateStr)
    ? pl.filter(d => d !== dateStr)
    : [...pl, dateStr].sort();
  await setDoc(companyCalRef(), { plannedLeaveSaturdays: newPl }, { merge: true });
}

// ===== 会社休日範囲を追加 =====
async function _addHolidayRange(start, end, label) {
  if (!start || !end || !label) { alert('開始日・終了日・ラベルを入力してください'); return; }
  if (start > end) { alert('開始日は終了日より前にしてください'); return; }
  const cfg    = state.companyCalConfig || {};
  const ranges = [...(cfg.holidayRanges || []), { start, end, label }];
  await setDoc(companyCalRef(), { holidayRanges: ranges }, { merge: true });
}

// ===== 会社休日範囲を削除 =====
async function _removeHolidayRange(index) {
  const cfg    = state.companyCalConfig || {};
  const ranges = [...(cfg.holidayRanges || [])];
  ranges.splice(index, 1);
  await setDoc(companyCalRef(), { holidayRanges: ranges }, { merge: true });
}

// ===== 会社行事を追加 =====
async function _addEvent(date, label, color) {
  if (!date || !label) { alert('日付とラベルを入力してください'); return; }
  const cfg    = state.companyCalConfig || {};
  const events = [...(cfg.events || []), { date, label, color: color || '#4a9eff' }];
  await setDoc(companyCalRef(), { events }, { merge: true });
}

// ===== 会社行事を削除 =====
async function _removeEvent(index) {
  const cfg    = state.companyCalConfig || {};
  const events = [...(cfg.events || [])];
  events.splice(index, 1);
  await setDoc(companyCalRef(), { events }, { merge: true });
}

// ===== 設定モーダルのフォームイベント初期化（script.js から一度だけ呼ぶ） =====
export function initCompanyCalSettingsForms() {
  // 出勤土曜追加
  const addWsBtn = document.getElementById('ccs-btn-add-ws');
  if (addWsBtn) {
    addWsBtn.addEventListener('click', async () => {
      const val = document.getElementById('ccs-input-ws')?.value;
      await _addWorkSaturday(val);
      if (document.getElementById('ccs-input-ws')) document.getElementById('ccs-input-ws').value = '';
    });
  }

  // 会社休日範囲追加
  const addHrBtn = document.getElementById('ccs-btn-add-hr');
  if (addHrBtn) {
    addHrBtn.addEventListener('click', async () => {
      const start = document.getElementById('ccs-input-hr-start')?.value;
      const end   = document.getElementById('ccs-input-hr-end')?.value;
      const label = document.getElementById('ccs-input-hr-label')?.value.trim();
      await _addHolidayRange(start, end, label);
      ['ccs-input-hr-start','ccs-input-hr-end','ccs-input-hr-label'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    });
  }

  // 会社行事追加
  const addEvBtn = document.getElementById('ccs-btn-add-ev');
  if (addEvBtn) {
    addEvBtn.addEventListener('click', async () => {
      const date  = document.getElementById('ccs-input-ev-date')?.value;
      const label = document.getElementById('ccs-input-ev-label')?.value.trim();
      const color = document.getElementById('ccs-input-ev-color')?.value;
      await _addEvent(date, label, color);
      ['ccs-input-ev-date','ccs-input-ev-label'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    });
  }

  // 閉じるボタン
  const closeBtn = document.getElementById('ccs-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeCompanyCalSettings);

  // モーダル外クリックで閉じる
  const modal = document.getElementById('company-cal-settings-modal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeCompanyCalSettings();
    });
  }
}
