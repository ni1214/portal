import { state, REQ_STATUS_LABEL, TASK_STATUS_LABEL, USER_ROLE_LABELS } from './state.js';
import { esc } from './utils.js';

let deps = {};

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const DASH_LIST_LIMIT = 3;
const ATTENDANCE_TYPE_LABELS = {
  normal: '通常',
  有給: '有給',
  半休午前: '半休(午前)',
  半休午後: '半休(午後)',
  欠勤: '欠勤',
};

export function initTodayDashboard(d = {}) {
  deps = d;
  renderTodayDashboard();
}

export function renderTodayDashboard() {
  const section = document.getElementById('dash-today-section');
  if (!section) return;

  if (!state.currentUsername) {
    section.hidden = true;
    section.innerHTML = '';
    return;
  }

  const today = new Date();
  const todayKey = buildDateKey(today);
  const cards = [
    buildTaskCard(todayKey),
    buildRequestCard(),
    buildAttendanceCard(todayKey),
    buildNoticeCard(),
  ];

  section.hidden = false;
  section.innerHTML = `
    <div class="dash-section-header">
      <div>
        <div class="dash-section-kicker">Today</div>
        <h2 class="dash-section-title">今日の自分ダッシュボード</h2>
      </div>
      <div class="dash-section-date">${esc(formatDateLabel(today))}</div>
    </div>
    <div class="dash-card-grid">
      ${cards.map(renderCard).join('')}
    </div>
  `;
}

function renderCard(card) {
  const chips = Array.isArray(card.chips) && card.chips.length > 0
    ? `<div class="dash-card-chips">${card.chips.map(chip => `
        <span class="dash-chip ${chip.tone ? `dash-chip--${chip.tone}` : ''}">${esc(chip.text)}</span>
      `).join('')}</div>`
    : '';

  const items = Array.isArray(card.items) && card.items.length > 0
    ? `<div class="dash-card-list">${card.items.map(item => `
        <div class="dash-card-item">
          <div class="dash-card-item-title">${esc(item.title)}</div>
          ${item.meta ? `<div class="dash-card-item-meta">${esc(item.meta)}</div>` : ''}
        </div>
      `).join('')}</div>`
    : `<div class="dash-card-empty">${esc(card.emptyText || '対象はありません')}</div>`;

  return `
    <section class="dash-card dash-card--${card.tone || 'idle'}">
      <div class="dash-card-head">
        <div class="dash-card-icon"><i class="${card.icon}"></i></div>
        <div class="dash-card-heading">
          <div class="dash-card-title">${esc(card.title)}</div>
          ${card.subtitle ? `<div class="dash-card-subtitle">${esc(card.subtitle)}</div>` : ''}
        </div>
        <div class="dash-card-value">${esc(card.value)}</div>
      </div>
      ${card.meta ? `<div class="dash-card-meta">${esc(card.meta)}</div>` : ''}
      ${chips}
      ${items}
    </section>
  `;
}

function buildTaskCard(todayKey) {
  const activeTasks = (state.receivedTasks || [])
    .filter(task => task.status === 'pending' || task.status === 'accepted')
    .sort((a, b) => compareTaskPriority(a, b, todayKey));

  const pendingCount = activeTasks.filter(task => task.status === 'pending').length;
  const acceptedCount = activeTasks.filter(task => task.status === 'accepted').length;
  const overdueCount = activeTasks.filter(task => task.dueDate && task.dueDate < todayKey).length;
  const todayCount = activeTasks.filter(task => task.dueDate === todayKey).length;

  return {
    title: '今日のタスク',
    subtitle: '受け取り分',
    icon: 'fa-solid fa-list-check',
    value: `${activeTasks.length}件`,
    meta: activeTasks.length > 0
      ? `承諾待ち ${pendingCount}件 / 進行中 ${acceptedCount}件`
      : '受け取ったタスクはありません',
    tone: overdueCount > 0 ? 'alert' : (pendingCount > 0 || todayCount > 0 ? 'active' : 'clear'),
    chips: [
      overdueCount > 0 ? { text: `期限超過 ${overdueCount}件`, tone: 'alert' } : null,
      todayCount > 0 ? { text: `今日期限 ${todayCount}件`, tone: 'active' } : null,
      acceptedCount > 0 ? { text: `進行中 ${acceptedCount}件`, tone: 'clear' } : null,
    ].filter(Boolean),
    items: activeTasks.slice(0, DASH_LIST_LIMIT).map(task => ({
      title: task.title || '名称未設定',
      meta: [
        TASK_STATUS_LABEL[task.status]?.text || task.status || '',
        task.assignedBy ? `依頼 ${task.assignedBy}` : '',
        formatDueLabel(task.dueDate, todayKey),
      ].filter(Boolean).join(' / '),
    })),
    emptyText: '受け取りタスクはありません',
  };
}

function buildRequestCard() {
  const department = state.userEmailProfile?.department || '';
  const roleLabel = USER_ROLE_LABELS[state.userEmailProfile?.roleType] || '';
  if (!department) {
    return {
      title: '自分待ちの部門間依頼',
      subtitle: '受信一覧ベース',
      icon: 'fa-solid fa-clipboard-list',
      value: '要設定',
      meta: 'プロフィールに部署を入れると表示されます',
      tone: 'idle',
      chips: [],
      items: [],
      emptyText: '部署設定後に依頼が表示されます',
    };
  }

  const openRequests = (state.receivedRequests || [])
    .filter(req => !req.archived && (req.status === 'submitted' || req.status === 'reviewing'))
    .sort((a, b) => compareTimestamp(b.updatedAt || b.createdAt, a.updatedAt || a.createdAt));

  const submittedCount = openRequests.filter(req => req.status === 'submitted').length;
  const reviewingCount = openRequests.filter(req => req.status === 'reviewing').length;

  return {
    title: '自分待ちの部門間依頼',
    subtitle: [department, roleLabel].filter(Boolean).join(' / '),
    icon: 'fa-solid fa-building-user',
    value: `${openRequests.length}件`,
    meta: openRequests.length > 0
      ? `未対応 ${submittedCount}件 / 確認中 ${reviewingCount}件`
      : '自部署待ちの依頼はありません',
    tone: submittedCount > 0 ? 'active' : (reviewingCount > 0 ? 'clear' : 'idle'),
    chips: [
      submittedCount > 0 ? { text: `未対応 ${submittedCount}件`, tone: 'active' } : null,
      reviewingCount > 0 ? { text: `確認中 ${reviewingCount}件`, tone: 'clear' } : null,
    ].filter(Boolean),
    items: openRequests.slice(0, DASH_LIST_LIMIT).map(req => ({
      title: req.title || '件名未設定',
      meta: [
        req.fromDept || req.createdBy || '',
        REQ_STATUS_LABEL[req.status]?.text || req.status || '',
      ].filter(Boolean).join(' / '),
    })),
    emptyText: '自部署待ちの依頼はありません',
  };
}

function buildAttendanceCard(todayKey) {
  const attendance = state.attendanceData?.[todayKey] || null;
  const siteMap = new Map((state.attendanceSites || []).map(site => [site.id, site]));

  if (!attendance) {
    return {
      title: '今日の現場 / 勤怠',
      subtitle: '本日分',
      icon: 'fa-regular fa-calendar',
      value: '未入力',
      meta: '今日の勤怠はまだ保存されていません',
      tone: 'alert',
      chips: [],
      items: [],
      emptyText: 'カレンダーから今日の入力ができます',
    };
  }

  const typeKey = attendance.type || 'normal';
  const typeLabel = ATTENDANCE_TYPE_LABELS[typeKey] || typeKey;
  const workSiteHours = (attendance.workSiteHours && typeof attendance.workSiteHours === 'object')
    ? attendance.workSiteHours
    : {};
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
    .sort((a, b) => b.hours - a.hours);

  const totalHours = siteEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const value = typeKey !== 'normal'
    ? typeLabel
    : (siteEntries.length > 0 ? `${siteEntries.length}現場` : '通常');
  const meta = typeKey !== 'normal'
    ? `勤務区分 ${typeLabel}`
    : (siteEntries.length > 0 ? `合計 ${fmtHours(totalHours)}h` : '今日はまだ現場入力がありません');

  return {
    title: '今日の現場 / 勤怠',
    subtitle: '本日分',
    icon: 'fa-solid fa-helmet-safety',
    value,
    meta,
    tone: typeKey !== 'normal' ? 'clear' : (siteEntries.length > 0 ? 'active' : 'idle'),
    chips: [
      siteEntries.length > 0 ? { text: `${siteEntries.length}現場`, tone: 'clear' } : null,
      attendance.hayade ? { text: `早出 ${attendance.hayade}`, tone: 'active' } : null,
      attendance.zangyo ? { text: `残業 ${attendance.zangyo}`, tone: 'active' } : null,
    ].filter(Boolean),
    items: siteEntries.slice(0, DASH_LIST_LIMIT).map(entry => ({
      title: [entry.code, entry.name].filter(Boolean).join(' '),
      meta: `${fmtHours(entry.hours)}h`,
    })),
    emptyText: attendance.note
      ? `メモ: ${attendance.note}`
      : '今日の現場入力はまだありません',
  };
}

function buildNoticeCard() {
  const noticeSource = Array.isArray(state.visibleNotices)
    ? state.visibleNotices
    : (state.allNotices || []);
  const unread = noticeSource.filter(notice => !state.readNoticeIds.has(notice.id));
  const urgentUnread = unread.filter(notice => notice.priority === 'urgent');
  const listSource = (urgentUnread.length > 0 ? urgentUnread : unread)
    .slice()
    .sort((a, b) => compareTimestamp(b.createdAt, a.createdAt));

  return {
    title: '未読の重要通知',
    subtitle: 'お知らせ',
    icon: 'fa-solid fa-bell',
    value: `${urgentUnread.length}件`,
    meta: unread.length > 0
      ? `未読全体 ${unread.length}件`
      : '未読のお知らせはありません',
    tone: urgentUnread.length > 0 ? 'alert' : (unread.length > 0 ? 'active' : 'clear'),
    chips: [
      urgentUnread.length > 0 ? { text: `重要 ${urgentUnread.length}件`, tone: 'alert' } : null,
      unread.length > urgentUnread.length ? { text: `通常 ${unread.length - urgentUnread.length}件`, tone: 'clear' } : null,
    ].filter(Boolean),
    items: listSource.slice(0, DASH_LIST_LIMIT).map(notice => ({
      title: notice.title || '件名未設定',
      meta: [
        notice.priority === 'urgent' ? '重要' : '通常',
        formatNoticeDate(notice.createdAt),
      ].filter(Boolean).join(' / '),
    })),
    emptyText: '重要通知はありません',
  };
}

function compareTaskPriority(a, b, todayKey) {
  const aRank = getDueRank(a.dueDate, todayKey);
  const bRank = getDueRank(b.dueDate, todayKey);
  if (aRank !== bRank) return aRank - bRank;

  const aStatus = a.status === 'pending' ? 0 : 1;
  const bStatus = b.status === 'pending' ? 0 : 1;
  if (aStatus !== bStatus) return aStatus - bStatus;

  const aDue = a.dueDate || '9999-12-31';
  const bDue = b.dueDate || '9999-12-31';
  if (aDue !== bDue) return aDue.localeCompare(bDue);

  return compareTimestamp(b.createdAt, a.createdAt);
}

function getDueRank(dueDate, todayKey) {
  if (!dueDate) return 4;
  if (dueDate < todayKey) return 0;
  if (dueDate === todayKey) return 1;
  const tomorrow = new Date(`${todayKey}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dueDate === buildDateKey(tomorrow)) return 2;
  return 3;
}

function formatDueLabel(dueDate, todayKey) {
  if (!dueDate) return '';
  if (dueDate < todayKey) return `期限超過 ${dueDate.slice(5).replace('-', '/')}`;
  if (dueDate === todayKey) return '今日期限';
  const tomorrow = new Date(`${todayKey}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dueDate === buildDateKey(tomorrow)) return '明日期限';
  return `期限 ${dueDate.slice(5).replace('-', '/')}`;
}

function formatNoticeDate(value) {
  const ms = toMillis(value);
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function compareTimestamp(a, b) {
  return toMillis(a) - toMillis(b);
}

function toMillis(value) {
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

function buildDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日（${DOW_LABELS[date.getDay()]}）`;
}

function fmtHours(hours) {
  if (!Number.isFinite(hours)) return '0';
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0$/, '');
}
