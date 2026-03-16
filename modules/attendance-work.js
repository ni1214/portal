// ========== attendance-work.js — 勤務内容表 / 勤務内容集計表 / 登録現場 ==========
import { state } from './state.js';
import {
  db, collection, collectionGroup, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, writeBatch,
  query, where, orderBy, onSnapshot, serverTimestamp, deleteField
} from './config.js';
import { esc } from './utils.js';

let deps = {};
let eventsBound = false;

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const PERSONAL_TABS = ['calendar', 'work', 'summary', 'sites'];
const SITE_EXCLUDED_NAMES = new Set(['完成', 'その他', '工事No.コウジ']);
const ATTENDANCE_RETENTION_DAYS = 180;
const ATTENDANCE_CLEANUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 週1回
const ATTENDANCE_CLEANUP_KEY_PREFIX = 'portal-attendance-cleanup-last:';

let attendanceCleanupRunning = false;

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

function hasNonWorkSiteFields(docData) {
  if (!docData || typeof docData !== 'object') return false;
  // workSiteHours だけを消す操作で、他の将来フィールドまで消さないようにする
  return Object.keys(docData).some(k => (
    k !== 'workSiteHours' &&
    k !== 'yearMonth' &&
    k !== 'updatedAt'
  ));
}

function normalizeSiteCode(raw) {
  if (raw === null || raw === undefined) return '';
  const normalized = String(raw)
    .replace(/[０-９]/g, ch => String(ch.charCodeAt(0) - 0xFF10))
    .replace(/\s+/g, '')
    .trim();
  if (!normalized) return '';
  const onlyDigits = normalized.replace(/\D/g, '');
  if (!onlyDigits) return '';
  if (onlyDigits.length < 4 || onlyDigits.length > 6) return '';
  return onlyDigits;
}

function normalizeSiteName(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).replace(/\s+/g, ' ').trim();
}

function isExcludedSite(code, name) {
  if (!code || !name) return true;
  if (code === '0000' || code === '0') return true;
  if (SITE_EXCLUDED_NAMES.has(name)) return true;
  return false;
}

function parseSitesFromRows(rows) {
  const byCode = new Map();
  const conflicts = [];
  let candidateRows = 0;
  let excludedRows = 0;

  const addCandidate = (rowNo, source, codeRaw, nameRaw) => {
    const code = normalizeSiteCode(codeRaw);
    const name = normalizeSiteName(nameRaw);
    if (!code && !name) return;
    candidateRows += 1;
    if (isExcludedSite(code, name)) {
      excludedRows += 1;
      return;
    }

    const prev = byCode.get(code);
    if (!prev) {
      byCode.set(code, { code, name, source, rowNo });
      return;
    }
    if (prev.name !== name) {
      conflicts.push({ code, prevName: prev.name, newName: name, rowNo, source });
      // 名前の長い方を採用（略称より詳細名を優先）
      if (name.length > prev.name.length) {
        byCode.set(code, { code, name, source, rowNo });
      }
    }
  };

  rows.forEach((row, idx) => {
    if (!Array.isArray(row)) return;
    const rowNo = idx + 1;
    if (rowNo <= 1) return;
    // 現場名登録シートは A/B と D/G にコード/名称が混在
    addCandidate(rowNo, 'AB', row[0], row[1]);
    addCandidate(rowNo, 'DG', row[3], row[6]);
  });

  const sites = [...byCode.values()]
    .sort((a, b) => Number(a.code) - Number(b.code))
    .map((x, i) => ({
      code: x.code,
      name: x.name,
      sortOrder: i + 1,
    }));

  return {
    sites,
    totalRows: rows.length,
    candidateRows,
    excludedRows,
    uniqueSiteCount: sites.length,
    conflictCount: conflicts.length,
    conflicts,
  };
}

function parseWorkbookSites(workbook) {
  const sheetName = workbook.SheetNames.includes('現場名登録')
    ? '現場名登録'
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('シートを読み込めませんでした。');
  const rows = window.XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  const parsed = parseSitesFromRows(rows);
  return { sheetName, ...parsed };
}

function setImportStatus(message) {
  const el = document.getElementById('calw-site-import-status');
  if (el) el.textContent = message;
}

function updateSiteImportFileLabel() {
  const fileInput = document.getElementById('calw-site-import-file');
  const nameEl = document.getElementById('calw-site-import-filename');
  if (!(fileInput instanceof HTMLInputElement) || !nameEl) return;

  const file = fileInput.files?.[0] || null;
  nameEl.textContent = file ? file.name : '選択されていません';
  nameEl.title = file ? file.name : '';
}

async function commitSiteOpsInBatches(ops) {
  const chunkSize = 400; // Firestore 1バッチ上限500に余裕を持たせる
  for (let i = 0; i < ops.length; i += chunkSize) {
    const chunk = ops.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach(op => {
      if (op.type === 'set') batch.set(op.ref, op.data);
      if (op.type === 'update') batch.update(op.ref, op.data);
    });
    await batch.commit();
  }
}

async function importSitesToFirestore(parsed) {
  const existing = [...(state.attendanceSites || [])];
  const byCode = new Map();
  let maxOrder = 0;
  existing.forEach(site => {
    const code = normalizeSiteCode(site.code);
    if (code) byCode.set(code, site);
    const so = Number(site.sortOrder) || 0;
    if (so > maxOrder) maxOrder = so;
  });

  const ops = [];
  let inserted = 0;
  let updated = 0;

  parsed.sites.forEach(site => {
    const found = byCode.get(site.code);
    if (found) {
      const patch = {};
      if ((found.name || '') !== site.name) patch.name = site.name;
      if ((found.code || '') !== site.code) patch.code = site.code;
      if (found.active === false) patch.active = true;
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = serverTimestamp();
        patch.updatedBy = state.currentUsername || '';
        ops.push({
          type: 'update',
          ref: doc(db, 'attendance_sites', found.id),
          data: patch,
        });
        updated += 1;
      }
      return;
    }

    maxOrder += 1;
    const ref = doc(collection(db, 'attendance_sites'));
    ops.push({
      type: 'set',
      ref,
      data: {
        code: site.code,
        name: site.name,
        active: true,
        sortOrder: maxOrder,
        updatedBy: state.currentUsername || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    });
    inserted += 1;
  });

  if (ops.length > 0) {
    await commitSiteOpsInBatches(ops);
  }

  return { inserted, updated, touched: ops.length };
}

async function importSitesFromExcelFile() {
  const fileInput = document.getElementById('calw-site-import-file');
  const button = document.getElementById('calw-site-import-btn');
  if (!(fileInput instanceof HTMLInputElement) || !button) return;

  const file = fileInput.files?.[0];
  if (!file) {
    alert('Excelファイルを選択してください。');
    return;
  }
  if (!window.XLSX) {
    alert('Excel解析ライブラリの読み込みに失敗しました。ページを再読み込みしてください。');
    return;
  }

  button.disabled = true;
  setImportStatus('Excelを解析しています...');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
    const parsed = parseWorkbookSites(workbook);

    const summary = [
      `対象シート: ${parsed.sheetName}`,
      `全行: ${parsed.totalRows}行`,
      `候補行: ${parsed.candidateRows}行`,
      `除外行: ${parsed.excludedRows}行`,
      `有効な現場コード: ${parsed.uniqueSiteCount}件`,
      `重複コード（名称差異）: ${parsed.conflictCount}件`,
    ].join(' / ');
    setImportStatus(`解析完了: ${summary}`);

    if (parsed.uniqueSiteCount === 0) {
      alert('有効な現場データを検出できませんでした。');
      return;
    }

    const go = confirm(`${summary}\n\nこの内容で登録現場へ取り込みますか？`);
    if (!go) {
      setImportStatus('取込をキャンセルしました。');
      return;
    }

    setImportStatus('Firestoreへ取り込み中...');
    const result = await importSitesToFirestore(parsed);
    setImportStatus(`取込完了: 追加 ${result.inserted}件 / 更新 ${result.updated}件 / 解析 ${parsed.uniqueSiteCount}件`);
    alert(`登録現場の取込が完了しました。\n追加: ${result.inserted}件\n更新: ${result.updated}件`);
    fileInput.value = '';
    updateSiteImportFileLabel();
  } catch (err) {
    console.error('Excel取込エラー:', err);
    setImportStatus('取込に失敗しました。ファイル形式または内容を確認してください。');
    alert('Excel取込に失敗しました。');
  } finally {
    button.disabled = false;
  }
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

function getAttendanceCleanupStorageKey() {
  return `${ATTENDANCE_CLEANUP_KEY_PREFIX}${state.currentUsername || ''}`;
}

function getAttendanceCleanupLastAt() {
  try {
    const raw = localStorage.getItem(getAttendanceCleanupStorageKey());
    const parsed = Number(raw || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function setAttendanceCleanupLastAt(ts) {
  try {
    localStorage.setItem(getAttendanceCleanupStorageKey(), String(ts));
  } catch {
    // localStorage が使えない環境でも動作継続
  }
}

function getAttendanceCleanupCutoffDateStr() {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - ATTENDANCE_RETENTION_DAYS);
  return toDateStr(cutoff);
}

async function cleanupOldAttendanceForCurrentUser() {
  if (!state.currentUsername) return { deleted: 0 };

  const cutoffDateStr = getAttendanceCleanupCutoffDateStr();
  const cutoffYm = cutoffDateStr.slice(0, 7);
  const attendanceCol = collection(db, 'users', state.currentUsername, 'attendance');

  const [olderMonthsSnap, cutoffMonthSnap] = await Promise.all([
    getDocs(query(attendanceCol, where('yearMonth', '<', cutoffYm))),
    getDocs(query(attendanceCol, where('yearMonth', '==', cutoffYm))),
  ]);

  const deleteRefs = [];
  olderMonthsSnap.docs.forEach(d => deleteRefs.push(d.ref));
  cutoffMonthSnap.docs.forEach(d => {
    if (d.id < cutoffDateStr) deleteRefs.push(d.ref);
  });

  if (deleteRefs.length === 0) {
    return { deleted: 0, cutoffDateStr };
  }

  const chunkSize = 400;
  for (let i = 0; i < deleteRefs.length; i += chunkSize) {
    const batch = writeBatch(db);
    deleteRefs.slice(i, i + chunkSize).forEach(ref => {
      batch.delete(ref);
    });
    await batch.commit();
  }

  Object.keys(state.workPeriodAttendance || {}).forEach(dateStr => {
    if (dateStr < cutoffDateStr) delete state.workPeriodAttendance[dateStr];
  });
  Object.keys(state.attendanceData || {}).forEach(dateStr => {
    if (dateStr < cutoffDateStr) delete state.attendanceData[dateStr];
  });

  return { deleted: deleteRefs.length, cutoffDateStr };
}

async function runAttendanceCleanupIfNeeded() {
  if (!state.currentUsername || attendanceCleanupRunning) return;

  const now = Date.now();
  const lastAt = getAttendanceCleanupLastAt();
  if (lastAt > 0 && now - lastAt < ATTENDANCE_CLEANUP_INTERVAL_MS) return;

  attendanceCleanupRunning = true;
  try {
    const result = await cleanupOldAttendanceForCurrentUser();
    setAttendanceCleanupLastAt(now);
    if (result.deleted > 0) {
      console.info(`勤怠クリーンアップ実行: ${result.deleted}件削除（${result.cutoffDateStr}より前）`);
    }
  } catch (err) {
    console.warn('勤怠クリーンアップに失敗しました。次回起動時に再試行します。', err);
  } finally {
    attendanceCleanupRunning = false;
  }
}

async function saveWorkHoursForCell(dateStr, siteId, hours) {
  if (!state.currentUsername || !dateStr || !siteId) return;

  const ref = doc(db, 'users', state.currentUsername, 'attendance', dateStr);
  const prevDoc = state.workPeriodAttendance[dateStr] || {};
  const nextMap = sanitizeWorkSiteHours(prevDoc.workSiteHours);

  if (hours > 0) nextMap[siteId] = hours;
  else delete nextMap[siteId];

  const shouldKeepDoc = hasNonWorkSiteFields(prevDoc);

  if (Object.keys(nextMap).length === 0) {
    if (!prevDoc || Object.keys(prevDoc).length === 0) return;

    if (shouldKeepDoc) {
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
  setText('calw-summary-total-hours', '総稼働時間: 0h');

  container.innerHTML = '<div class="calw-loading">勤務内容を集計中...</div>';

  try {
    const usersSnap = await getDocs(collection(db, 'users_list'));
    const users = usersSnap.docs.map(d => d.id).filter(Boolean);
    const yms = getPeriodYearMonths(period);

    let attendanceRows = [];
    try {
      const attSnap = await getDocs(
        query(
          collectionGroup(db, 'attendance'),
          where('yearMonth', 'in', yms)
        )
      );
      attendanceRows = attSnap.docs
        .map(d => ({
          username: d.ref.parent?.parent?.id || '',
          dateStr: d.id,
          data: d.data(),
        }))
        .filter(row => (
          !!row.username &&
          row.dateStr >= period.startStr &&
          row.dateStr <= period.endStr
        ));
    } catch (err) {
      console.warn('勤務内容集計: collectionGroup取得失敗。ユーザー別取得へフォールバックします。', err);
      const userEntries = await Promise.all(
        users.map(async username => {
          const map = await loadUserPeriodAttendance(username, period);
          return { username, map };
        })
      );
      attendanceRows = [];
      userEntries.forEach(({ username, map }) => {
        Object.entries(map).forEach(([dateStr, data]) => {
          attendanceRows.push({ username, dateStr, data });
        });
      });
    }

    // users_list にないユーザーが混ざっていても表に出せるようにする
    const userSet = new Set(users);
    attendanceRows.forEach(row => {
      if (row.username && !userSet.has(row.username)) {
        users.push(row.username);
        userSet.add(row.username);
      }
    });

    users.sort((a, b) => a.localeCompare(b, 'ja'));
    if (state.currentUsername && users.includes(state.currentUsername)) {
      users.splice(users.indexOf(state.currentUsername), 1);
      users.unshift(state.currentUsername);
    }
    state.workSummaryUsers = users;

    if (users.length === 0) {
      renderEmpty(containerId, '集計対象ユーザーがいません。');
      return;
    }

    const siteMetaMap = new Map((state.attendanceSites || []).map(s => [s.id, s]));
    const rowsMap = new Map();

    const ensureRow = (siteId) => {
      if (rowsMap.has(siteId)) return rowsMap.get(siteId);
      const meta = siteMetaMap.get(siteId);
      const row = {
        siteId,
        code: meta?.code || '',
        name: meta?.name || `未登録現場(${siteId})`,
        sortOrder: Number(meta?.sortOrder) || 999999,
        userHours: {},
        totalHours: 0,
      };
      rowsMap.set(siteId, row);
      return row;
    };

    attendanceRows.forEach(({ username, data: att }) => {
      const workMap = sanitizeWorkSiteHours(att.workSiteHours);
      Object.entries(workMap).forEach(([siteId, hours]) => {
        if (hours <= 0) return;
        const row = ensureRow(siteId);
        row.userHours[username] = (row.userHours[username] || 0) + hours;
        row.totalHours += hours;
      });
    });

    const rows = [...rowsMap.values()]
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

    const userCols = users.map(u => `<th>${esc(u)}</th>`).join('');
    const bodyRows = rows.map((row, idx) => {
      const userCells = users.map(u => {
        const h = Number(row.userHours[u]) || 0;
        userTotals[u] += h;
        return `<td class="calw-num">${h > 0 ? fmtHours(h) : ''}</td>`;
      }).join('');
      grandHours += row.totalHours;
      return `<tr>
        <td class="calw-num">${idx + 1}</td>
        <td>${esc(row.code || '-')}</td>
        <td>${esc(row.name || '')}</td>
        ${userCells}
        <td class="calw-num calw-strong">${fmtHours(row.totalHours)}</td>
      </tr>`;
    }).join('');

    const footerUserCols = users.map(u => `<th class="calw-num">${fmtHours(userTotals[u] || 0)}</th>`).join('');

    setText('calw-summary-total-hours', `総稼働時間: ${fmtHours(grandHours)}h`);

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
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
          <tfoot>
            <tr>
              <th colspan="3">合計</th>
              ${footerUserCols}
              <th class="calw-num">${fmtHours(grandHours)}</th>
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
    tbody.innerHTML = '<tr><td colspan="3" class="calw-empty-row">登録現場はまだありません。</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(site => `
    <tr>
      <td>${esc(site.code || '-')}</td>
      <td>${esc(site.name || '')}</td>
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
  const btn = document.getElementById('calw-site-add-btn');
  if (!codeEl || !nameEl || !btn) return;

  const code = codeEl.value.trim();
  const name = nameEl.value.trim();

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
      active: true,
      sortOrder: maxOrder + 1,
      updatedBy: state.currentUsername || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    codeEl.value = '';
    nameEl.value = '';
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

  const code = nextCode.trim();
  const name = nextName.trim();
  if (!name) {
    alert('現場名は必須です。');
    return;
  }

  try {
    await updateDoc(doc(db, 'attendance_sites', siteId), {
      code: code || '',
      name,
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
  updateSiteImportFileLabel();
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
  void runAttendanceCleanupIfNeeded();
  updateSiteImportFileLabel();
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
  document.getElementById('calw-site-import-btn')?.addEventListener('click', () => {
    void importSitesFromExcelFile();
  });
  document.getElementById('calw-site-import-file')?.addEventListener('change', () => {
    updateSiteImportFileLabel();
  });

  ['calw-site-code-input', 'calw-site-name-input'].forEach(id => {
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

  updateSiteImportFileLabel();
}
