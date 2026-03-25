import { state } from './state.js';

let deps = {};
let badgeObserver = null;

const CARD_CONFIG = Object.freeze({
  tasks: {
    triggerId: 'btn-task',
    icon: 'fa-solid fa-list-check',
    label: '今日のタスク',
    tone: 'primary',
  },
  notices: {
    triggerId: 'btn-notice-bell',
    icon: 'fa-solid fa-bell',
    label: '未読のお知らせ',
    tone: 'danger',
  },
  requests: {
    triggerId: 'btn-reqboard',
    icon: 'fa-solid fa-arrows-left-right',
    label: '進行中の依頼',
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
  renderHomeDashboard();
  bindSummaryCards();
  updateTaskCard();
  updateNoticeCard();
  updateReqCard();
  updateAttendanceCard();
  observeBadges();
}

export function updateSummaryCards() {
  renderHomeDashboard();
  bindSummaryCards(); // DOM再生成後にリスナーを再バインド
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
  const count = getBadgeCount(document.getElementById('task-badge'));
  const value = document.getElementById('hcard-task-count');
  const meta = document.getElementById('hcard-tasks-meta');
  const card = document.getElementById('hcard-tasks');
  if (!value || !meta || !card) return;

  value.textContent = `${count}件`;
  meta.textContent = count > 0 ? '承諾待ちや進行中を確認' : '新しいタスクはありません';
  card.dataset.state = count > 0 ? 'active' : 'idle';
}

function updateNoticeCard() {
  const count = getBadgeCount(document.getElementById('notice-unread-badge'));
  const value = document.getElementById('hcard-notice-count');
  const meta = document.getElementById('hcard-notices-meta');
  const card = document.getElementById('hcard-notices');
  if (!value || !meta || !card) return;

  value.textContent = `${count}件`;
  meta.textContent = count > 0 ? '重要なお知らせを確認' : '共有トピックは落ち着いています';
  card.dataset.state = count > 0 ? 'alert' : 'idle';
}

function updateReqCard() {
  const count = getBadgeCount(document.getElementById('req-badge'));
  const value = document.getElementById('hcard-req-count');
  const meta = document.getElementById('hcard-requests-meta');
  const card = document.getElementById('hcard-requests');
  if (!value || !meta || !card) return;

  value.textContent = `${count}件`;
  meta.textContent = count > 0 ? '部門間依頼を開く' : '新しい依頼はありません';
  card.dataset.state = count > 0 ? 'active' : 'idle';
}

function updateAttendanceCard() {
  const value = document.getElementById('hcard-attendance-status');
  const meta = document.getElementById('hcard-attendance-meta');
  const card = document.getElementById('hcard-attendance');
  if (!value || !meta || !card) return;

  const today = getTodayAttendance();
  if (!today) {
    value.textContent = '未入力';
    meta.textContent = '今日の勤怠を登録';
    card.dataset.state = 'alert';
    return;
  }

  const label = getAttendanceLabel(today);
  value.textContent = label;
  meta.textContent = getAttendanceMeta(today);
  card.dataset.state = today.type === '欠勤' ? 'alert' : 'clear';
}

function getBadgeCount(badge) {
  if (!badge || badge.hidden) return 0;
  return Number.parseInt(badge.textContent || '0', 10) || 0;
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

function observeBadges() {
  if (badgeObserver) return;

  badgeObserver = new MutationObserver(() => {
    updateSummaryCards();
  });

  ['task-badge', 'notice-unread-badge', 'req-badge'].forEach(id => {
    const target = document.getElementById(id);
    if (!target) return;
    badgeObserver.observe(target, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
  });
}
