import { state, REQ_STATUS_LABEL, TASK_STATUS_LABEL, USER_ROLE_LABELS } from './state.js';
import { esc } from './utils.js';

let deps = {};

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const DASH_LIST_LIMIT = 3;
const PERSONAL_SPACE_IMAGE = 'https://lh3.googleusercontent.com/aida-public/AB6AXuB0yRE22oeu0OzCYIP9Tr6C1r_iBtg8cC5gyvleS6EfK4nHmKeH6nPLW6rnSA_eh8gOnWSCr7jx5z-90W6tGZ00giO8HjNQcn4NreAM4CdoBDonISBDsaI1k03_MY4JQaJqgKfux6peoJV-3A0NghYeE3i7O36gnUbkwfFr4cu47FNWY8vouldeH_Rw85R4399O3_YpLBownQ5IiSmgQTMhCbbrOz0Ou3jDC-9N_qbl4h-dKDyWQ8h0x2QqNPfthyTCHWI3TyclPAWE';
const ATTENDANCE_TYPE_LABELS = {
  normal: '通常',
  有給: '有給',
  半休午前: '半休(午前)',
  半休午後: '半休(午後)',
  欠勤: '欠勤',
};
const DASH_TARGETS = Object.freeze({
  PROFILE: 'profile',
  TASK_RECEIVED: 'task-received',
  TASK_SENT: 'task-sent',
  REQUEST_RECEIVED: 'request-received',
  REQUEST_SENT: 'request-sent',
  ATTENDANCE: 'attendance',
  NOTICE: 'notice',
  FAVORITES: 'favorites',
  INVITE: 'invite',
});

export function initTodayDashboard(d = {}) {
  deps = d;
  renderTodayDashboard();
}

export function renderTodayDashboard() {
  const section = document.getElementById('dash-today-section');
  if (!section) return;
  bindDashboardEvents(section);

  const today = new Date();
  const todayKey = buildDateKey(today);
  const profile = getDashboardProfile();
  const username = state.currentUsername || '名前を設定してください';
  const taskCard = buildTaskCard(todayKey);
  const attendanceCard = buildAttendanceCard(todayKey);
  const noticeCard = buildNoticeCard();
  const favoriteCount = Array.isArray(state.personalFavorites) ? state.personalFavorites.length : 0;
  const visibleNotices = Array.isArray(state.visibleNotices) ? state.visibleNotices : (state.allNotices || []);
  const unreadCount = visibleNotices.filter(notice => !state.readNoticeIds.has(notice.id)).length;
  const pendingAckCount = getPendingAckNotices().length;
  const isProfileReady = Boolean(state.currentUsername);
  const attendanceTarget = isProfileReady ? DASH_TARGETS.ATTENDANCE : DASH_TARGETS.PROFILE;
  const taskTarget = isProfileReady ? DASH_TARGETS.TASK_RECEIVED : DASH_TARGETS.PROFILE;
  const favoritesTarget = isProfileReady ? DASH_TARGETS.FAVORITES : DASH_TARGETS.PROFILE;
  const personalMeta = buildPersonalMeta(profile);
  const topicTone = pendingAckCount > 0 ? 'alert' : (unreadCount > 0 ? 'active' : 'stable');

  section.hidden = false;
  section.innerHTML = `
    <div class="portal-rail-shell">
      <section class="portal-rail-card portal-rail-card--personal">
        <div class="portal-rail-card-head">
          <h2 class="portal-rail-card-title"><i class="fa-solid fa-user"></i> 個人スペース</h2>
          <div class="portal-rail-user-block">
            <div class="portal-rail-user-name">${esc(username)}</div>
            <div class="portal-rail-user-meta">${esc(personalMeta)}</div>
          </div>
        </div>

        <div class="portal-rail-action-list">
          ${renderRailAction({
            target: attendanceTarget,
            icon: 'fa-regular fa-clock',
            label: '本日の勤怠',
            value: buildAttendanceValueLabel(attendanceCard, isProfileReady),
            tone: attendanceCard.tone || 'idle',
          })}
          ${renderRailAction({
            target: taskTarget,
            icon: 'fa-solid fa-circle-check',
            label: 'マイタスク',
            value: isProfileReady ? taskCard.value : '要設定',
            tone: taskCard.tone || 'idle',
          })}
          ${renderRailAction({
            target: favoritesTarget,
            icon: 'fa-regular fa-bookmark',
            label: 'お気に入り',
            value: isProfileReady
              ? (favoriteCount > 0 ? `${favoriteCount}件` : '開く')
              : '要設定',
            tone: favoriteCount > 0 ? 'active' : 'neutral',
            arrow: true,
          })}
        </div>

        <div class="portal-rail-image-wrap">
          <img
            class="portal-rail-image"
            src="${PERSONAL_SPACE_IMAGE}"
            alt="明るいワークスペースのイメージ"
            loading="lazy"
          >
        </div>
      </section>

      <section class="portal-rail-card portal-rail-card--topics portal-rail-card--${topicTone}" data-dash-target="${DASH_TARGETS.NOTICE}" tabindex="0" role="button" aria-label="共有トピックを開く">
        <div class="portal-rail-card-head">
          <h2 class="portal-rail-card-title"><i class="fa-solid fa-comments"></i> 共有トピック</h2>
        </div>

        <div class="portal-topic-status">
          <span class="portal-topic-status-dot"></span>
          <span>${esc(pendingAckCount > 0 ? '確認待ちの通知があります' : '共有トピックは安定')}</span>
        </div>

        <div class="portal-topic-grid">
          <div class="portal-topic-metric">
            <span class="portal-topic-label">確認待ち</span>
            <strong class="portal-topic-value">${pendingAckCount}<span>件</span></strong>
          </div>
          <div class="portal-topic-metric">
            <span class="portal-topic-label">未読</span>
            <strong class="portal-topic-value">${unreadCount}<span>件</span></strong>
          </div>
        </div>

        <p class="portal-topic-copy">${esc(noticeCard.meta || '最新のお知らせを確認できます。')}</p>
      </section>

      <section class="portal-invite-card">
        <div class="portal-invite-icon">
          <i class="fa-solid fa-qrcode"></i>
        </div>
        <div class="portal-invite-copy">
          <h3 class="portal-invite-title">招待コード</h3>
          <p class="portal-invite-text">新しいメンバーを招待</p>
        </div>
        <button type="button" class="portal-invite-btn" data-dash-target="${DASH_TARGETS.INVITE}">入力</button>
      </section>
    </div>
  `;
}

function renderRailAction({ target, icon, label, value, tone = 'neutral', arrow = false }) {
  return `
    <button type="button" class="portal-rail-action portal-rail-action--${tone}" data-dash-target="${esc(target)}">
      <span class="portal-rail-action-icon"><i class="${icon}"></i></span>
      <span class="portal-rail-action-copy">${esc(label)}</span>
      <span class="portal-rail-action-value${arrow ? ' portal-rail-action-value--arrow' : ''}">
        ${arrow ? '<i class="fa-solid fa-chevron-right"></i>' : esc(value)}
      </span>
    </button>
  `;
}

function buildPersonalMeta(profile) {
  if (!state.currentUsername) {
    return 'プロフィールを設定すると個人スペースが使えます';
  }
  const tokens = [profile.department, profile.roleLabel].filter(Boolean);
  return tokens.length > 0 ? tokens.join(' / ') : formatDateLabel(new Date());
}

function buildAttendanceValueLabel(card, isProfileReady) {
  if (!isProfileReady) return '要設定';
  if (!card) return '確認';
  if (card.value === '未入力') return '未入力';
  if (card.value === '通常') return '入力済み';
  return card.value;
}

function renderDashboardMetricCard(card) {
  if (!card) return '';
  const targetAttrs = buildDashboardTargetAttrs(card, { button: true });
  return `
    <button type="button" class="dash-metric-card dash-metric-card--${card.tone || 'idle'}"${targetAttrs}>
      <span class="dash-metric-label">${esc(card.title)}</span>
      <span class="dash-metric-value">${esc(card.value)}</span>
      <span class="dash-metric-meta">${esc(card.meta || card.subtitle || card.emptyText || '')}</span>
    </button>
  `;
}

function renderDashboardQuickAction(card) {
  if (!card?.target) return '';
  const actionLabel = card.actionLabel || getDashboardActionLabel(card.target);
  return `
    <button
      type="button"
      class="dash-quick-action dash-quick-action--${card.tone || 'idle'}"
      data-dash-target="${esc(card.target)}"
      aria-label="${esc(`${card.title} - ${actionLabel}`)}"
    >
      <span class="dash-quick-action-icon"><i class="${card.icon}"></i></span>
      <span class="dash-quick-action-copy">
        <span class="dash-quick-action-label">${esc(card.title)}</span>
        <span class="dash-quick-action-meta">${esc(actionLabel)}</span>
      </span>
      <span class="dash-quick-action-value">${esc(card.value)}</span>
    </button>
  `;
}

function renderDashboardFeatureCard(card, options = {}) {
  if (!card) return '';
  const actionLabel = card.actionLabel || getDashboardActionLabel(card.target || '');
  const targetAttrs = buildDashboardTargetAttrs(card);
  return `
    <section class="dash-feature-card dash-feature-card--${card.tone || 'idle'}${card.target ? ' dash-feature-card--interactive' : ''}"${targetAttrs}>
      <div class="dash-feature-card-head">
        <div>
          ${options.eyebrow ? `<div class="dash-feature-eyebrow">${esc(options.eyebrow)}</div>` : ''}
          <div class="dash-feature-title-row">
            <div class="dash-feature-icon"><i class="${card.icon}"></i></div>
            <div class="dash-feature-heading">
              <div class="dash-feature-title">${esc(card.title)}</div>
              ${card.subtitle ? `<div class="dash-feature-subtitle">${esc(card.subtitle)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="dash-feature-value">${esc(card.value)}</div>
      </div>
      ${card.meta ? `<div class="dash-feature-meta">${esc(card.meta)}</div>` : ''}
      ${renderDashboardCardChips(card)}
      ${renderDashboardCardItems(card, {
        listClassName: 'dash-feature-list',
        emptyClassName: 'dash-feature-empty',
      })}
      ${card.target ? `<div class="dash-feature-link"><span>${esc(actionLabel)}</span><i class="fa-solid fa-arrow-right"></i></div>` : ''}
    </section>
  `;
}

function renderDashboardCardChips(card) {
  if (!Array.isArray(card?.chips) || card.chips.length === 0) return '';
  return `
    <div class="dash-card-chips">
      ${card.chips.map(chip => `
        <span class="dash-chip ${chip.tone ? `dash-chip--${chip.tone}` : ''}">${esc(chip.text)}</span>
      `).join('')}
    </div>
  `;
}

function renderDashboardCardItems(card, options = {}) {
  const listClassName = options.listClassName || 'dash-feature-list';
  const emptyClassName = options.emptyClassName || 'dash-feature-empty';
  if (Array.isArray(card?.items) && card.items.length > 0) {
    return `
      <div class="${listClassName}">
        ${card.items.map(item => `
          <div class="dash-feature-item">
            <div class="dash-feature-item-title">${esc(item.title)}</div>
            ${item.meta ? `<div class="dash-feature-item-meta">${esc(item.meta)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }
  return `<div class="${emptyClassName}">${esc(card?.emptyText || '未対応の項目はありません')}</div>`;
}

function buildDashboardTargetAttrs(card, options = {}) {
  const target = card?.target || '';
  if (!target) return options.button ? ' disabled' : '';
  const actionLabel = card.actionLabel || getDashboardActionLabel(target);
  return options.button
    ? ` data-dash-target="${esc(target)}" aria-label="${esc(`${card.title} - ${actionLabel}`)}"`
    : ` data-dash-target="${esc(target)}" tabindex="0" role="button" aria-label="${esc(`${card.title} - ${actionLabel}`)}"`;
}

function getDashboardGreeting(today) {
  const hour = today.getHours();
  if (hour < 11) return 'おはようございます';
  if (hour < 18) return 'お疲れさまです';
  return 'こんばんは';
}

function buildDashboardHeroDescription(focusCard) {
  if (focusCard?.meta) return focusCard.meta;
  if (focusCard?.items?.[0]?.title) return `${focusCard.items[0].title} を起点に状況を確認できます。`;
  return '今日の優先事項と進行状況をここからまとめて確認できます。';
}

function bindDashboardEvents(section) {
  if (!section || section.dataset.dashBound === 'true') return;
  section.dataset.dashBound = 'true';

  section.addEventListener('click', event => {
    const card = event.target.closest('[data-dash-target]');
    if (!card || !section.contains(card)) return;
    void openDashboardTarget(card.dataset.dashTarget || '');
  });

  section.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-dash-target]');
    if (!card || !section.contains(card)) return;
    event.preventDefault();
    void openDashboardTarget(card.dataset.dashTarget || '');
  });
}

async function openDashboardTarget(target) {
  try {
    switch (target) {
      case DASH_TARGETS.PROFILE:
        await deps.openProfileSettings?.();
        return;
      case DASH_TARGETS.TASK_RECEIVED:
        await deps.openReceivedTasks?.();
        return;
      case DASH_TARGETS.TASK_SENT:
        await deps.openSentTasks?.();
        return;
      case DASH_TARGETS.REQUEST_RECEIVED:
        await deps.openReceivedRequests?.();
        return;
      case DASH_TARGETS.REQUEST_SENT:
        await deps.openSentRequests?.();
        return;
      case DASH_TARGETS.ATTENDANCE:
        await deps.openTodayAttendance?.();
        return;
      case DASH_TARGETS.NOTICE:
        await deps.openNoticeBoard?.();
        return;
      case DASH_TARGETS.FAVORITES:
        await deps.openFavorites?.();
        return;
      case DASH_TARGETS.INVITE:
        await deps.openInviteCode?.();
        return;
      default:
        return;
    }
  } catch (err) {
    console.error('ダッシュボード遷移エラー:', err);
  }
}

function getDashboardActionLabel(target) {
  switch (target) {
    case DASH_TARGETS.PROFILE:
      return 'プロフィールを開く';
    case DASH_TARGETS.TASK_RECEIVED:
      return '受け取りタスクを開く';
    case DASH_TARGETS.TASK_SENT:
      return '依頼したタスクを開く';
    case DASH_TARGETS.REQUEST_RECEIVED:
      return '受け取り依頼を開く';
    case DASH_TARGETS.REQUEST_SENT:
      return '自分の依頼を開く';
    case DASH_TARGETS.ATTENDANCE:
      return '今日の勤怠を開く';
    case DASH_TARGETS.NOTICE:
      return 'お知らせへ移動';
    case DASH_TARGETS.FAVORITES:
      return 'お気に入りへ移動';
    case DASH_TARGETS.INVITE:
      return '招待コードを入力';
    default:
      return '画面を開く';
  }
}

function buildTaskCard(todayKey) {
  const activeTasks = getActiveReceivedTasks(todayKey);
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
    target: DASH_TARGETS.TASK_RECEIVED,
    actionLabel: getDashboardActionLabel(DASH_TARGETS.TASK_RECEIVED),
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
      target: DASH_TARGETS.PROFILE,
      actionLabel: getDashboardActionLabel(DASH_TARGETS.PROFILE),
    };
  }

  const openRequests = getOpenDepartmentRequests();
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
    target: DASH_TARGETS.REQUEST_RECEIVED,
    actionLabel: getDashboardActionLabel(DASH_TARGETS.REQUEST_RECEIVED),
  };
}

function buildAttendanceCard(todayKey) {
  const attendance = state.todayAttendanceDate === todayKey
    ? (state.todayAttendance || null)
    : (state.attendanceData?.[todayKey] || null);
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
      target: DASH_TARGETS.ATTENDANCE,
      actionLabel: getDashboardActionLabel(DASH_TARGETS.ATTENDANCE),
    };
  }

  const typeKey = attendance.type || 'normal';
  const typeLabel = ATTENDANCE_TYPE_LABELS[typeKey] || typeKey;
  const siteEntries = buildAttendanceSiteEntries(attendance, siteMap);
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
    target: DASH_TARGETS.ATTENDANCE,
    actionLabel: getDashboardActionLabel(DASH_TARGETS.ATTENDANCE),
  };
}

function buildNoticeCard() {
  const noticeSource = Array.isArray(state.visibleNotices)
    ? state.visibleNotices
    : (state.allNotices || []);
  const pendingAck = getPendingAckNotices();
  const unread = noticeSource.filter(notice =>
    !state.readNoticeIds.has(notice.id) && !notice?.requireAcknowledgement
  );
  const urgentUnread = unread.filter(notice => notice.priority === 'urgent');
  const listSource = (pendingAck.length > 0 ? pendingAck : (urgentUnread.length > 0 ? urgentUnread : unread))
    .slice()
    .sort((a, b) => compareTimestamp(b.createdAt, a.createdAt));

  return {
    title: pendingAck.length > 0 ? '確認待ちのお知らせ' : '未読の重要通知',
    subtitle: 'お知らせ',
    icon: 'fa-solid fa-bell',
    value: `${pendingAck.length > 0 ? pendingAck.length : urgentUnread.length}件`,
    meta: pendingAck.length > 0
      ? `未確認 ${pendingAck.length}件 / 未読 ${unread.length}件`
      : (unread.length > 0 ? `未読全体 ${unread.length}件` : '未読のお知らせはありません'),
    tone: pendingAck.length > 0 ? 'alert' : (urgentUnread.length > 0 ? 'alert' : (unread.length > 0 ? 'active' : 'clear')),
    chips: [
      pendingAck.length > 0 ? { text: `確認待ち ${pendingAck.length}件`, tone: 'alert' } : null,
      urgentUnread.length > 0 ? { text: `重要 ${urgentUnread.length}件`, tone: 'alert' } : null,
      unread.length > urgentUnread.length ? { text: `通常 ${unread.length - urgentUnread.length}件`, tone: 'clear' } : null,
    ].filter(Boolean),
    items: listSource.slice(0, DASH_LIST_LIMIT).map(notice => ({
      title: notice.title || '件名未設定',
      meta: [
        notice.requireAcknowledgement ? '確認必須' : (notice.priority === 'urgent' ? '重要' : '通常'),
        formatNoticeDate(notice.createdAt),
      ].filter(Boolean).join(' / '),
    })),
    emptyText: '確認待ちや重要通知はありません',
    target: DASH_TARGETS.NOTICE,
    actionLabel: getDashboardActionLabel(DASH_TARGETS.NOTICE),
  };
}

function buildFocusCard(todayKey) {
  const profile = getDashboardProfile();
  if (!profile.department) {
    return {
      title: '今日のフォーカス',
      subtitle: 'プロフィール設定',
      icon: 'fa-solid fa-compass-drafting',
      value: '要設定',
      meta: '所属部署と役割を設定すると、今日優先したい内容を先頭に出します',
      tone: 'idle',
      chips: [],
      items: [],
      emptyText: 'プロフィールから所属部署と役割を設定してください',
      target: DASH_TARGETS.PROFILE,
      actionLabel: getDashboardActionLabel(DASH_TARGETS.PROFILE),
    };
  }

  const pendingAck = getPendingAckNotices();
  const activeTasks = getActiveReceivedTasks(todayKey);
  const overdueTasks = activeTasks.filter(task => task.dueDate && task.dueDate < todayKey);
  const todayTasks = activeTasks.filter(task => task.dueDate === todayKey);
  const openRequests = getOpenDepartmentRequests();
  const requestReplies = (state.sentRequests || []).filter(req => req.notifyCreator === true && !req.archived);
  const doneNotifies = (state.sentTasks || []).filter(task => task.status === 'done' && !task.notifiedDone);
  const attendanceInfo = getAttendanceFocusInfo(todayKey);
  const departmentKey = resolveDepartmentKey(profile.department);
  const candidates = [];

  const addCandidate = (priority, title, meta, target) => {
    candidates.push({ priority, title, meta, target });
  };

  if (profile.roleType === 'leader' || profile.roleType === 'manager') {
    if (openRequests.length > 0) {
      addCandidate(0, `自部署待ち依頼 ${openRequests.length}件`, '部署内で優先して確認したい依頼です', DASH_TARGETS.REQUEST_RECEIVED);
    }
    if (doneNotifies.length > 0) {
      addCandidate(1, `完了報告 ${doneNotifies.length}件`, '依頼したタスクの完了連絡です', DASH_TARGETS.TASK_SENT);
    }
  }

  switch (departmentKey) {
    case 'sales':
      if (requestReplies.length > 0) addCandidate(0, `返答待ち依頼 ${requestReplies.length}件`, '他部署へ出した依頼の返答待ちです', DASH_TARGETS.REQUEST_SENT);
      if (doneNotifies.length > 0) addCandidate(0, `完了連絡 ${doneNotifies.length}件`, '依頼したタスクの完了通知です', DASH_TARGETS.TASK_SENT);
      if (pendingAck.length > 0) addCandidate(1, `確認待ち通知 ${pendingAck.length}件`, '重要なお知らせがあります', DASH_TARGETS.NOTICE);
      if (todayTasks.length > 0 || overdueTasks.length > 0) {
        addCandidate(overdueTasks.length > 0 ? 1 : 2, `自分タスク ${activeTasks.length}件`, buildTaskFocusMeta(overdueTasks.length, todayTasks.length), DASH_TARGETS.TASK_RECEIVED);
      }
      break;
    case 'design':
      if (pendingAck.length > 0) addCandidate(0, `確認待ち通知 ${pendingAck.length}件`, '設計変更や重要通知の確認待ちです', DASH_TARGETS.NOTICE);
      if (openRequests.length > 0) addCandidate(0, `未対応依頼 ${openRequests.length}件`, '部署間依頼の確認が必要です', DASH_TARGETS.REQUEST_RECEIVED);
      if (todayTasks.length > 0 || overdueTasks.length > 0) {
        addCandidate(overdueTasks.length > 0 ? 1 : 2, `今日見るタスク ${activeTasks.length}件`, buildTaskFocusMeta(overdueTasks.length, todayTasks.length), DASH_TARGETS.TASK_RECEIVED);
      }
      break;
    case 'production':
      if (openRequests.length > 0) addCandidate(0, `自部署待ち依頼 ${openRequests.length}件`, '段取り確認を優先してください', DASH_TARGETS.REQUEST_RECEIVED);
      if (todayTasks.length > 0 || overdueTasks.length > 0) {
        addCandidate(overdueTasks.length > 0 ? 1 : 2, `進行タスク ${activeTasks.length}件`, buildTaskFocusMeta(overdueTasks.length, todayTasks.length), DASH_TARGETS.TASK_RECEIVED);
      }
      if (attendanceInfo.summary) addCandidate(attendanceInfo.priority, attendanceInfo.summary, attendanceInfo.meta, DASH_TARGETS.ATTENDANCE);
      if (pendingAck.length > 0) addCandidate(1, `確認待ち通知 ${pendingAck.length}件`, '重要なお知らせがあります', DASH_TARGETS.NOTICE);
      break;
    case 'factory':
      if (attendanceInfo.summary) addCandidate(attendanceInfo.priority, attendanceInfo.summary, attendanceInfo.meta, DASH_TARGETS.ATTENDANCE);
      if (todayTasks.length > 0 || overdueTasks.length > 0) {
        addCandidate(overdueTasks.length > 0 ? 0 : 1, `現場タスク ${activeTasks.length}件`, buildTaskFocusMeta(overdueTasks.length, todayTasks.length), DASH_TARGETS.TASK_RECEIVED);
      }
      if (openRequests.length > 0) addCandidate(1, `自部署待ち依頼 ${openRequests.length}件`, '確認が必要な依頼があります', DASH_TARGETS.REQUEST_RECEIVED);
      if (pendingAck.length > 0) addCandidate(1, `確認待ち通知 ${pendingAck.length}件`, '重要なお知らせがあります', DASH_TARGETS.NOTICE);
      break;
    case 'construction':
      if (attendanceInfo.summary) addCandidate(attendanceInfo.priority, attendanceInfo.summary, attendanceInfo.meta, DASH_TARGETS.ATTENDANCE);
      if (todayTasks.length > 0 || overdueTasks.length > 0) {
        addCandidate(overdueTasks.length > 0 ? 0 : 1, `現場タスク ${activeTasks.length}件`, buildTaskFocusMeta(overdueTasks.length, todayTasks.length), DASH_TARGETS.TASK_RECEIVED);
      }
      if (pendingAck.length > 0) addCandidate(0, `確認待ち通知 ${pendingAck.length}件`, '施工前に確認したい通知があります', DASH_TARGETS.NOTICE);
      if (openRequests.length > 0) addCandidate(1, `自部署待ち依頼 ${openRequests.length}件`, '部署間依頼の確認が必要です', DASH_TARGETS.REQUEST_RECEIVED);
      break;
    default:
      if (openRequests.length > 0) addCandidate(0, `自部署待ち依頼 ${openRequests.length}件`, '部署間依頼の確認が必要です', DASH_TARGETS.REQUEST_RECEIVED);
      if (todayTasks.length > 0 || overdueTasks.length > 0) {
        addCandidate(overdueTasks.length > 0 ? 1 : 2, `進行タスク ${activeTasks.length}件`, buildTaskFocusMeta(overdueTasks.length, todayTasks.length), DASH_TARGETS.TASK_RECEIVED);
      }
      if (pendingAck.length > 0) addCandidate(1, `確認待ち通知 ${pendingAck.length}件`, '重要なお知らせがあります', DASH_TARGETS.NOTICE);
      if (attendanceInfo.summary) addCandidate(attendanceInfo.priority, attendanceInfo.summary, attendanceInfo.meta, DASH_TARGETS.ATTENDANCE);
      break;
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.title.localeCompare(b.title, 'ja');
  });

  const topPriority = candidates[0]?.priority ?? 3;
  const focusTarget = candidates[0]?.target || resolveFocusFallbackTarget(profile);
  const tone = topPriority === 0 ? 'alert' : (topPriority === 1 ? 'active' : (candidates.length > 0 ? 'clear' : 'idle'));

  return {
    title: profile.roleType === 'manager'
      ? '部署フォーカス'
      : (profile.roleType === 'leader' ? 'リーダーフォーカス' : `${profile.department}フォーカス`),
    subtitle: [profile.department, profile.roleLabel].filter(Boolean).join(' / '),
    icon: 'fa-solid fa-compass-drafting',
    value: candidates.length > 0 ? `${candidates.length}項目` : '安定',
    meta: buildFocusSummary(profile, candidates.length),
    tone,
    chips: [
      openRequests.length > 0 ? { text: `自部署待ち ${openRequests.length}件`, tone: 'alert' } : null,
      doneNotifies.length > 0 ? { text: `完了連絡 ${doneNotifies.length}件`, tone: 'active' } : null,
      pendingAck.length > 0 ? { text: `確認待ち ${pendingAck.length}件`, tone: 'alert' } : null,
      attendanceInfo.chip ? { text: attendanceInfo.chip, tone: attendanceInfo.chipTone } : null,
    ].filter(Boolean),
    items: candidates.slice(0, DASH_LIST_LIMIT).map(item => ({
      title: item.title,
      meta: item.meta,
    })),
    emptyText: '今日は大きな詰まりはありません',
    target: focusTarget,
    actionLabel: getDashboardActionLabel(focusTarget),
  };
}

function buildSectionProfileChips() {
  const profile = getDashboardProfile();
  const chips = [profile.department, profile.roleLabel].filter(Boolean);
  if (!chips.length) return '';
  return `
    <div class="dash-section-profile">
      ${chips.map(chip => `<span class="dash-chip">${esc(chip)}</span>`).join('')}
    </div>
  `;
}

function getDashboardProfile() {
  const department = `${state.userEmailProfile?.department || ''}`.trim();
  const roleType = state.userEmailProfile?.roleType || 'member';
  const roleLabel = USER_ROLE_LABELS[roleType] || '';
  return { department, roleType, roleLabel };
}

function resolveFocusFallbackTarget(profile) {
  if (!profile.department) return DASH_TARGETS.PROFILE;
  if (profile.roleType === 'manager' || profile.roleType === 'leader') return DASH_TARGETS.REQUEST_RECEIVED;
  const departmentKey = resolveDepartmentKey(profile.department);
  if (departmentKey === 'production' || departmentKey === 'factory' || departmentKey === 'construction') {
    return DASH_TARGETS.ATTENDANCE;
  }
  return DASH_TARGETS.TASK_RECEIVED;
}

function getActiveReceivedTasks(todayKey) {
  return (state.receivedTasks || [])
    .filter(task => task.status === 'pending' || task.status === 'accepted')
    .sort((a, b) => compareTaskPriority(a, b, todayKey));
}

function getOpenDepartmentRequests() {
  return (state.receivedRequests || [])
    .filter(req => !req.archived && (req.status === 'submitted' || req.status === 'reviewing'))
    .sort((a, b) => compareTimestamp(b.updatedAt || b.createdAt, a.updatedAt || a.createdAt));
}

function getPendingAckNotices() {
  const noticeSource = Array.isArray(state.visibleNotices)
    ? state.visibleNotices
    : (state.allNotices || []);
  return noticeSource.filter(notice => {
    if (!notice?.requireAcknowledgement || !state.currentUsername) return false;
    const acknowledgedBy = Array.isArray(notice.acknowledgedBy) ? notice.acknowledgedBy : [];
    return !acknowledgedBy.includes(state.currentUsername);
  });
}

function getAttendanceFocusInfo(todayKey) {
  const attendance = state.todayAttendanceDate === todayKey
    ? (state.todayAttendance || null)
    : (state.attendanceData?.[todayKey] || null);
  const siteMap = new Map((state.attendanceSites || []).map(site => [site.id, site]));

  if (!attendance) {
    return {
      priority: 0,
      summary: '今日の勤務が未入力',
      meta: 'カレンダーから入力してください',
      chip: '勤務未入力',
      chipTone: 'alert',
    };
  }

  const siteEntries = buildAttendanceSiteEntries(attendance, siteMap);
  const totalHours = siteEntries.reduce((sum, entry) => sum + entry.hours, 0);

  if (siteEntries.length > 0) {
    return {
      priority: 2,
      summary: [siteEntries[0].code, siteEntries[0].name].filter(Boolean).join(' '),
      meta: `合計 ${fmtHours(totalHours)}h / ${siteEntries.length}現場`,
      chip: `${siteEntries.length}現場`,
      chipTone: 'clear',
    };
  }

  const typeKey = attendance.type || 'normal';
  if (typeKey !== 'normal') {
    const typeLabel = ATTENDANCE_TYPE_LABELS[typeKey] || typeKey;
    return {
      priority: 2,
      summary: `勤務区分 ${typeLabel}`,
      meta: attendance.note ? `メモ: ${attendance.note}` : '今日の勤務入力は済んでいます',
      chip: typeLabel,
      chipTone: 'active',
    };
  }

  return {
    priority: 3,
    summary: '今日の勤務入力は済んでいます',
    meta: '大きな入力漏れはありません',
    chip: '入力済み',
    chipTone: 'clear',
  };
}

function buildAttendanceSiteEntries(attendance, siteMap) {
  const workSiteHours = (attendance.workSiteHours && typeof attendance.workSiteHours === 'object')
    ? attendance.workSiteHours
    : {};

  return Object.entries(workSiteHours)
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
}

function resolveDepartmentKey(department) {
  const value = `${department || ''}`;
  if (value.includes('営業')) return 'sales';
  if (value.includes('設計')) return 'design';
  if (value.includes('生産管理')) return 'production';
  if (value.includes('工場')) return 'factory';
  if (value.includes('工事')) return 'construction';
  return 'general';
}

function buildTaskFocusMeta(overdueCount, todayCount) {
  const parts = [];
  if (overdueCount > 0) parts.push(`期限超過 ${overdueCount}件`);
  if (todayCount > 0) parts.push(`今日期限 ${todayCount}件`);
  return parts.length > 0 ? parts.join(' / ') : '進行中タスク';
}

function buildFocusSummary(profile, itemCount) {
  if (itemCount === 0) {
    return profile.roleType === 'manager' || profile.roleType === 'leader'
      ? '自部署に大きな詰まりは見えていません'
      : '今日は大きな詰まりはありません';
  }
  if (profile.roleType === 'manager') return '部署全体で先に見ておきたい項目です';
  if (profile.roleType === 'leader') return '今日の引き継ぎと確認を優先表示しています';
  return 'あなたの部署で今日優先したい項目です';
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
