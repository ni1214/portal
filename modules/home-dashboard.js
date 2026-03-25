import { state } from './state.js';

let deps = {};

const CARD_CONFIG = Object.freeze({
  tasks: {
    triggerId: 'btn-task',
    icon: 'fa-solid fa-list-check',
    label: '受信タスク',
    tone: 'primary',
  },
  notices: {
    triggerId: 'btn-notice-bell',
    icon: 'fa-solid fa-bell',
    label: '要確認のお知らせ',
    tone: 'danger',
  },
  requests: {
    triggerId: 'btn-reqboard',
    icon: 'fa-solid fa-arrows-left-right',
    label: '受信依頼',
    tone: 'tertiary',
  },
  attendance: {
    triggerId: 'btn-calendar',
    icon: 'fa-regular fa-calendar-check',
    label: '勤怠状況',
    tone: 'neutral',
  },
});

export function initHomeDashboard(d = {}) {
  deps = d;
  document.getElementById('app-main')?.classList.add('home-compact');
  renderHomeDashboard();
  bindSummaryCards();
  updateSummaryCards();
}

export function updateSummaryCards() {
  ensureHomeDashboardShell();
  updateTaskCard();
  updateNoticeCard();
  updateReqCard();
  updateAttendanceCard();
}

function renderHomeDashboard() {
  const host = document.getElementById('home-dashboard');
  if (!host) return;

  host.innerHTML = `
    <section class="portal-summary-shell" aria-label="ホームサマリー">
      <div class="portal-summary-grid">
        ${renderSummaryCard('tasks')}
        ${renderSummaryCard('notices')}
        ${renderSummaryCard('requests')}
        ${renderSummaryCard('attendance')}
      </div>
    </section>
  `;
}

function ensureHomeDashboardShell() {
  const host = document.getElementById('home-dashboard');
  if (!host) return null;
  if (!host.querySelector('.portal-summary-shell')) {
    renderHomeDashboard();
    bindSummaryCards();
  }
  return host;
}

function renderSummaryCard(key) {
  const config = CARD_CONFIG[key];
  const valueId = key === 'attendance' ? 'hcard-attendance-status' : `hcard-${key === 'notices' ? 'notice' : key === 'requests' ? 'req' : 'task'}-count`;
  const metaId = `hcard-${key}-meta`;

  return `
    <button type="button" class="portal-summary-card portal-summary-card--${config.tone}" id="hcard-${key}">
      <span class="portal-summary-icon">
        <i class="${config.icon}"></i>
      </span>
      <span class="portal-summary-copy">
        <span class="portal-summary-label">${config.label}</span>
        <strong class="portal-summary-value" id="${valueId}">--</strong>
        <span class="portal-summary-meta" id="${metaId}">確認する</span>
      </span>
    </button>
  `;
}

function bindSummaryCards() {
  Object.entries(CARD_CONFIG).forEach(([key, config]) => {
    const card = document.getElementById(`hcard-${key}`);
    if (!card || card.dataset.bound === 'true') return;
    card.dataset.bound = 'true';
    card.addEventListener('click', () => {
      document.getElementById(config.triggerId)?.click();
    });
  });
}

function updateTaskCard() {
  const snapshot = getTaskSummarySnapshot();
  const value = document.getElementById('hcard-task-count');
  const meta = document.getElementById('hcard-tasks-meta');
  const card = document.getElementById('hcard-tasks');
  if (!value || !meta || !card) return;

  value.textContent = snapshot.value;
  meta.textContent = snapshot.meta;
  card.dataset.state = snapshot.state;
}

function updateNoticeCard() {
  const snapshot = getNoticeSummarySnapshot();
  const value = document.getElementById('hcard-notice-count');
  const meta = document.getElementById('hcard-notices-meta');
  const card = document.getElementById('hcard-notices');
  if (!value || !meta || !card) return;

  value.textContent = snapshot.value;
  meta.textContent = snapshot.meta;
  card.dataset.state = snapshot.state;
}

function updateReqCard() {
  const snapshot = getRequestSummarySnapshot();
  const value = document.getElementById('hcard-req-count');
  const meta = document.getElementById('hcard-requests-meta');
  const card = document.getElementById('hcard-requests');
  if (!value || !meta || !card) return;

  value.textContent = snapshot.value;
  meta.textContent = snapshot.meta;
  card.dataset.state = snapshot.state;
}

function updateAttendanceCard() {
  const value = document.getElementById('hcard-attendance-status');
  const meta = document.getElementById('hcard-attendance-meta');
  const card = document.getElementById('hcard-attendance');
  if (!value || !meta || !card) return;

  const snapshot = getAttendanceSummarySnapshot();
  value.textContent = snapshot.value;
  meta.textContent = snapshot.meta;
  card.dataset.state = snapshot.state;
}

function getTaskSummarySnapshot() {
  const receivedTasks = Array.isArray(state.receivedTasks) ? state.receivedTasks : [];
  const activeTasks = receivedTasks.filter(task => task.status === 'pending' || task.status === 'accepted');
  const pendingCount = activeTasks.filter(task => task.status === 'pending').length;
  const acceptedCount = activeTasks.length - pendingCount;
  const overdueCount = activeTasks.filter(task => task.dueDate && task.dueDate < buildDateKey(new Date())).length;

  return {
    value: activeTasks.length > 0 ? `${activeTasks.length}件` : '0件',
    meta: activeTasks.length > 0
      ? (overdueCount > 0
        ? `期限超過 ${overdueCount}件 / 承諾待ち ${pendingCount}件`
        : `承諾待ち ${pendingCount}件 / 進行中 ${acceptedCount}件`)
      : '受信タスクはありません',
    state: activeTasks.length === 0 ? 'idle' : (pendingCount > 0 || overdueCount > 0 ? 'alert' : 'active'),
  };
}

function getRequestSummarySnapshot() {
  const receivedRequests = Array.isArray(state.receivedRequests) ? state.receivedRequests : [];
  const openRequests = receivedRequests.filter(req => !req.archived && (req.status === 'submitted' || req.status === 'reviewing'));
  const submittedCount = openRequests.filter(req => req.status === 'submitted').length;
  const reviewingCount = openRequests.length - submittedCount;

  return {
    value: openRequests.length > 0 ? `${openRequests.length}件` : '0件',
    meta: openRequests.length > 0
      ? `提出 ${submittedCount}件 / 確認中 ${reviewingCount}件`
      : '受信依頼はありません',
    state: openRequests.length > 0 ? 'active' : 'idle',
  };
}

function getNoticeSummarySnapshot() {
  const notices = Array.isArray(state.visibleNotices)
    ? state.visibleNotices
    : (Array.isArray(state.allNotices) ? state.allNotices : []);
  const readNoticeIds = state.readNoticeIds instanceof Set ? state.readNoticeIds : new Set();
  const currentUsername = state.currentUsername || '';
  const pendingAck = notices.filter(notice => {
    if (!notice?.requireAcknowledgement || !currentUsername) return false;
    const acknowledgedBy = Array.isArray(notice.acknowledgedBy) ? notice.acknowledgedBy : [];
    return !acknowledgedBy.includes(currentUsername);
  });
  const unread = notices.filter(notice => !readNoticeIds.has(notice.id) && !notice?.requireAcknowledgement);
  const count = pendingAck.length + unread.length;

  return {
    value: `${count}件`,
    meta: pendingAck.length > 0
      ? `確認待ち ${pendingAck.length}件 / 未読 ${unread.length}件`
      : (unread.length > 0 ? `未読 ${unread.length}件` : '未読はありません'),
    state: count > 0 ? (pendingAck.length > 0 ? 'alert' : 'active') : 'clear',
  };
}

function getAttendanceSummarySnapshot() {
  const today = getTodayAttendance();
  if (!today) {
    return {
      value: '未入力',
      meta: '今日の勤怠を登録',
      state: 'alert',
    };
  }

  const label = getAttendanceLabel(today);
  return {
    value: label,
    meta: getAttendanceMeta(today),
    state: today.type === '欠勤' ? 'alert' : 'clear',
  };
}

function getTodayAttendance() {
  const todayKey = buildDateKey(new Date());
  if (state.todayAttendanceDate === todayKey && state.todayAttendance) {
    return state.todayAttendance;
  }
  return state.attendanceData?.[todayKey] || state.todayAttendance || null;
}

function getAttendanceLabel(attendance) {
  if (!attendance) return '未入力';
  if (attendance.type === '有給') return '有給';
  if (attendance.type === '半休午前') return '半休 午前';
  if (attendance.type === '半休午後') return '半休 午後';
  if (attendance.type === '欠勤') return '欠勤';
  if (attendance.hayade) return `早出 ${attendance.hayade}`;
  if (attendance.zangyo) return `残業 ${attendance.zangyo}`;

  const siteCount = Object.values(attendance.workSiteHours || {}).filter(hours => Number(hours) > 0).length;
  return siteCount > 0 ? `${siteCount}現場` : '出勤中';
}

function getAttendanceMeta(attendance) {
  if (!attendance) return '今日の勤怠を登録';
  if (attendance.note) return attendance.note;
  const siteHours = Object.values(attendance.workSiteHours || {})
    .map(hours => Number(hours))
    .filter(hours => Number.isFinite(hours) && hours > 0);
  if (siteHours.length > 0) {
    const total = siteHours.reduce((sum, hours) => sum + hours, 0);
    return `現場工数 ${formatHours(total)}h`;
  }
  return '勤務内容を更新';
}

function formatHours(hours) {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`.replace(/\.0$/, '');
}

function buildDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
