import { state, TASK_STATUS_LABEL } from './state.js';
import { esc } from './utils.js';

export let deps = {};

const DEFAULT_TARGET = 'notice';

function ensureHomeCompactMode() {
  document.getElementById('app-main')?.classList.add('home-compact');
}

export function initHomeDashboard(d = {}) {
  deps = { ...deps, ...d };
  if (!state.homeWorkspaceTarget) state.homeWorkspaceTarget = DEFAULT_TARGET;
  if (!state.homeWorkspaceActiveButtonId) state.homeWorkspaceActiveButtonId = 'sidebar-home-btn';
  bindWorkspaceHost();
  ensureHomeCompactMode();
  renderHomeWorkspace();
}

// サイドバーはステージを切り替えなくなったためこの関数は後方互換用のみ
export function setHomeWorkspaceTarget(target = DEFAULT_TARGET, activeButtonId = '') {
  state.homeWorkspaceTarget = target || DEFAULT_TARGET;
  if (activeButtonId) {
    state.homeWorkspaceActiveButtonId = activeButtonId;
  } else if (!state.homeWorkspaceActiveButtonId) {
    state.homeWorkspaceActiveButtonId = 'sidebar-home-btn';
  }
  // no-op: ステージは常に Today's Focus 固定
}

export function updateSummaryCards() {
  ensureHomeCompactMode();
  renderHomeWorkspaceTop();
  renderHomeWorkspaceStage();
}

export function renderHomeWorkspace() {
  ensureHomeCompactMode();
  const host = document.getElementById('home-dashboard');
  if (!host) return;

  const overviewTitle = buildOverviewTitle();
  const overviewSubtitle = buildOverviewSubtitle();
  const taskOverview = buildTaskOverviewCard();
  const noticeOverview = buildHomeNotificationOverview();
  const companyOverview = buildCompanyNoticeOverviewCard();

  host.innerHTML = `
    <section class="home-workspace-shell" aria-live="polite" role="region" aria-labelledby="home-overview-title">
      <!-- 上部固定ゾーン -->
      <div class="home-workspace-top" data-home-workspace-top>
        <header class="home-workspace-header">
          <div class="home-workspace-header-copy">
            <p class="home-workspace-kicker">ホーム</p>
            <h2 class="home-workspace-title" id="home-overview-title">${esc(overviewTitle)}</h2>
            <p class="home-workspace-copy">${esc(overviewSubtitle)}</p>
          </div>
        </header>
        <div class="home-overview-grid">
          ${renderOverviewCard(noticeOverview)}
          ${renderOverviewCard(taskOverview)}
          ${renderOverviewCard(companyOverview)}
        </div>
      </div>

      <!-- マイスペース: お気に入り + マイカテゴリー -->
      <section class="home-workspace-stage home-workspace-stage--flat" data-home-workspace-stage aria-labelledby="home-workspace-stage-title">
        <div class="home-workspace-stage-head">
          <div>
            <p class="home-workspace-card-kicker">マイスペース</p>
            <h3 class="home-workspace-stage-title" id="home-workspace-stage-title">お気に入り・よく使うカテゴリ</h3>
            <p class="home-workspace-stage-copy">よく使うカードとカテゴリをまとめて確認できます。</p>
          </div>
        </div>
        <div class="home-workspace-stage-body" id="home-stage-myspace-panel"></div>
      </section>
    </section>
  `;
  const panel = host.querySelector('#home-stage-myspace-panel');
  deps.renderMySpacePanel?.(panel);
}

function renderHomeWorkspaceTop() {
  const host = document.getElementById('home-dashboard');
  if (!host) return;

  const overviewTitle = buildOverviewTitle();
  const overviewSubtitle = buildOverviewSubtitle();
  const taskOverview = buildTaskOverviewCard();
  const noticeOverview = buildHomeNotificationOverview();
  const companyOverview = buildCompanyNoticeOverviewCard();

  const topMarkup = `
      <div class="home-workspace-top" data-home-workspace-top>
        <header class="home-workspace-header">
          <div class="home-workspace-header-copy">
            <p class="home-workspace-kicker">ホーム</p>
            <h2 class="home-workspace-title" id="home-overview-title">${esc(overviewTitle)}</h2>
            <p class="home-workspace-copy">${esc(overviewSubtitle)}</p>
          </div>
        </header>
      <div class="home-overview-grid">
        ${renderOverviewCard(noticeOverview)}
        ${renderOverviewCard(taskOverview)}
        ${renderOverviewCard(companyOverview)}
      </div>
    </div>
  `;

  const shell = host.querySelector('.home-workspace-shell');
  if (!shell) {
    renderHomeWorkspace();
    return;
  }

  const top = shell.querySelector('[data-home-workspace-top]');
  if (top) {
    top.outerHTML = topMarkup;
  } else {
    const stage = shell.querySelector('[data-home-workspace-stage]');
    if (stage) {
      stage.insertAdjacentHTML('beforebegin', topMarkup);
    } else {
      shell.insertAdjacentHTML('afterbegin', topMarkup);
    }
  }
}

function renderHomeWorkspaceStage() {
  const host = document.getElementById('home-dashboard');
  if (!host) return;

  const shell = host.querySelector('.home-workspace-shell');
  if (!shell) {
    renderHomeWorkspace();
    return;
  }

  const stage = shell.querySelector('[data-home-workspace-stage]');
  if (!stage) return;

  stage.removeAttribute('data-tone');
  stage.innerHTML = `
    <div class="home-workspace-stage-head">
      <div>
        <p class="home-workspace-card-kicker">マイスペース</p>
        <h3 class="home-workspace-stage-title" id="home-workspace-stage-title">お気に入り・よく使うカテゴリ</h3>
        <p class="home-workspace-stage-copy">よく使うカードとカテゴリをまとめて確認できます。</p>
      </div>
    </div>
    <div class="home-workspace-stage-body" id="home-stage-myspace-panel"></div>
  `;
  const panel = stage.querySelector('#home-stage-myspace-panel');
  deps.renderMySpacePanel?.(panel);
}

function buildOverviewTitle() {
  const username = state.currentUsername || 'ユーザー名未設定';
  return `おかえり、${username}`;
}

function buildOverviewSubtitle() {
  if (!state.currentUsername) {
    return 'ユーザー名を設定すると、あなたのタスクやチャット・お知らせが表示されます。';
  }
  return 'サイドバーのボタンで各画面が開きます。まずは上のチャット・お知らせを確認してください。';
}


function renderOverviewCard(snapshot) {
  const ariaLabel = esc(snapshot.ariaLabel || snapshot.title || 'Open');
  const cardClasses = ['home-workspace-card', 'home-overview-card'];
  if (snapshot.primary) {
    cardClasses.push('home-overview-card--primary');
  }
  const actionAttrs = snapshot.action
    ? ` data-home-action="${esc(snapshot.action)}" data-home-card-action="true" role="button" tabindex="0" aria-label="${ariaLabel}"`
    : '';
  const actionLabel = snapshot.action
    ? esc(snapshot.actionLabel || '開く')
    : '';
  return `
    <article class="${cardClasses.join(' ')}" data-tone="${esc(snapshot.tone)}"${actionAttrs}>
      <div class="home-workspace-card-head">
        <div>
          <p class="home-workspace-card-kicker">${esc(snapshot.kicker)}</p>
          <h3 class="home-workspace-card-title">${esc(snapshot.title)}</h3>
        </div>
        <span class="home-workspace-card-pill">${esc(snapshot.value)}</span>
      </div>

      <p class="home-workspace-copy">${esc(snapshot.meta)}</p>
      ${renderOverviewList(snapshot.items)}
      ${snapshot.action ? `
        <div class="home-overview-action-row" aria-hidden="true">
          <span class="home-workspace-action home-workspace-action--compact">
            <span class="home-workspace-action-label">${actionLabel}</span>
            <i class="material-symbols-rounded" aria-hidden="true">arrow_forward</i>
          </span>
        </div>
      ` : ''}
    </article>
  `;
}

function renderOverviewList(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  return `
    <ul class="home-workspace-note-list">
      ${items.map(item => `
        <li class="home-workspace-note-item">
          <i class="material-symbols-rounded" aria-hidden="true">check_circle</i>
          <span>
            <strong>${esc(item.title || '')}</strong>
            ${item.meta ? `<span class="home-workspace-note-meta">${esc(item.meta)}</span>` : ''}
          </span>
        </li>
      `).join('')}
    </ul>
  `;
}

function buildTaskOverview() {
  const tasks = collectActiveTasks();
  const pending = tasks.filter(task => task.status === 'pending').length;
  const accepted = tasks.filter(task => task.status === 'accepted').length;
  const overdue = tasks.filter(task => task.dueDate && task.dueDate < buildDateKey(new Date())).length;

  return {
    kicker: '自分の仕事',
    title: '自分のタスク',
    value: `${tasks.length}件`,
    meta: tasks.length > 0
      ? `未対応 ${pending}件 / 進行中 ${accepted}件`
      : '自分宛てのタスクはありません',
    tone: overdue > 0 ? 'notice' : (pending > 0 ? 'task' : 'settings'),
    items: tasks.slice(0, 2).map(task => ({
      title: task.title || '名称未設定',
      meta: [
        TASK_STATUS_LABEL[task.status]?.text || task.status || '',
        task.assignedBy ? `依頼 ${task.assignedBy}` : '',
        formatDueLabel(task.dueDate),
      ].filter(Boolean).join(' / '),
    })),
    emptyText: '自分宛てのタスクはまだありません',
  };
}

function buildNoticeOverview() {
  const stats = buildNoticeStats();
  return {
    kicker: '自分向け',
    title: 'チャット・お知らせ',
    value: `${stats.totalCount}件`,
    meta: stats.pendingAckCount > 0
      ? `確認待ち ${stats.pendingAckCount}件 / 未読 ${stats.unreadCount}件`
      : (stats.unreadCount > 0 ? `未読 ${stats.unreadCount}件` : 'お知らせはありません'),
    tone: stats.pendingAckCount > 0 ? 'notice' : (stats.unreadCount > 0 ? 'task' : 'settings'),
    items: stats.items,
    emptyText: 'お知らせはまだありません',
  };
}

function buildCompanyNoticeOverview() {
  const stats = buildNoticeStats();
  return {
    kicker: '社内',
    title: '社内のお知らせ',
    value: `${stats.totalNoticeCount}件`,
    meta: stats.latestNotice
      ? `最新: ${stats.latestNotice.title || '名称未設定'}`
      : '社内のお知らせはありません',
    tone: stats.latestNotice?.priority === 'urgent' ? 'notice' : 'help',
    items: stats.items,
    emptyText: '社内のお知らせはまだありません',
  };
}

function buildNoticeStats() {
  const notices = collectNoticeSource();
  const currentUsername = state.currentUsername || '';
  const readIds = state.readNoticeIds instanceof Set ? state.readNoticeIds : new Set();

  const pendingAck = notices.filter(notice => {
    if (!notice?.requireAcknowledgement || !currentUsername) return false;
    const acknowledgedBy = Array.isArray(notice.acknowledgedBy) ? notice.acknowledgedBy : [];
    return !acknowledgedBy.includes(currentUsername);
  });

  const unread = notices.filter(notice => !readIds.has(notice.id) && !notice?.requireAcknowledgement);
  const latestNotice = notices[0] || null;

  return {
    notices,
    pendingAck,
    unread,
    latestNotice,
    totalNoticeCount: notices.length,
    totalCount: pendingAck.length + unread.length,
    pendingAckCount: pendingAck.length,
    unreadCount: unread.length,
    items: notices.slice(0, 2).map(notice => ({
      title: notice.title || '名称未設定',
      meta: [
        notice.requireAcknowledgement ? '確認が必要' : (notice.priority === 'urgent' ? '重要' : '通常'),
        formatNoticeDate(notice.createdAt),
      ].filter(Boolean).join(' / '),
    })),
  };
}

function buildHomeNotificationOverview() {
  const noticeStats = buildNoticeStats();
  const chatStats = buildChatStats();
  const totalCount = chatStats.unreadCount + noticeStats.pendingAckCount + noticeStats.unreadCount;
  const metaParts = [];
  const hasChatUnread = chatStats.unreadCount > 0;

  if (hasChatUnread) metaParts.push(`チャット未読 ${chatStats.unreadCount}件`);
  if (noticeStats.pendingAckCount > 0) metaParts.push(`確認待ち ${noticeStats.pendingAckCount}件`);
  if (noticeStats.unreadCount > 0) metaParts.push(`お知らせ ${noticeStats.unreadCount}件`);

  return {
    kicker: '自分向け',
    title: 'お知らせ',
    value: `${totalCount}件`,
    meta: metaParts.length > 0 ? metaParts.join(' / ') : 'チャット / お知らせはありません',
    tone: noticeStats.pendingAckCount > 0 ? 'notice' : (hasChatUnread ? 'request' : (noticeStats.unreadCount > 0 ? 'task' : 'settings')),
    items: buildNotificationItems(chatStats, noticeStats),
    emptyText: 'チャット / お知らせはありません',
    action: hasChatUnread ? 'open-chat-panel' : 'focus-notice',
    actionLabel: hasChatUnread ? 'チャットを開く' : 'お知らせを開く',
    ariaLabel: hasChatUnread ? 'チャットを開く' : 'お知らせを開く',
    primary: true,
  };
}

function buildTaskOverviewCard() {
  return {
    ...buildTaskOverview(),
    action: 'open-task-modal',
    actionLabel: 'タスクを開く',
    ariaLabel: 'タスクを開く',
  };
}

function buildCompanyNoticeOverviewCard() {
  return {
    ...buildCompanyNoticeOverview(),
    action: 'focus-notice',
    actionLabel: 'お知らせを見る',
    ariaLabel: 'お知らせを見る',
  };
}

function buildChatStats() {
  const rooms = collectVisibleChatRooms();
  const unreadRooms = rooms
    .map(room => ({ room, unread: getRoomUnreadCount(room) }))
    .filter(entry => entry.unread > 0)
    .sort((a, b) => toMillis(b.room?.lastAt) - toMillis(a.room?.lastAt));

  return {
    unreadCount: unreadRooms.reduce((sum, entry) => sum + entry.unread, 0),
    unreadRooms,
  };
}

function buildNotificationItems(chatStats, noticeStats) {
  const items = [];
  const maxItems = 2;

  chatStats.unreadRooms.slice(0, maxItems).forEach(({ room, unread }) => {
    items.push({
      title: getChatRoomLabel(room),
      meta: [
        `チャット未読 ${unread}件`,
        formatNoticeDate(room?.lastAt),
      ].filter(Boolean).join(' / '),
    });
  });

  const remaining = Math.max(0, maxItems - items.length);
  if (remaining > 0) {
    getNotificationNoticeItems(noticeStats).slice(0, remaining).forEach(item => items.push(item));
  }

  return items;
}

function getNotificationNoticeItems(noticeStats) {
  const actionableNotices = [
    ...(Array.isArray(noticeStats.pendingAck) ? noticeStats.pendingAck : []),
    ...(Array.isArray(noticeStats.unread) ? noticeStats.unread : []),
  ];
  const seen = new Set();

  return actionableNotices
    .filter(notice => {
      const key = notice?.id || '';
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2)
    .map(notice => ({
      title: notice.title || '名称未設定',
      meta: [
        notice.requireAcknowledgement ? '確認が必要' : '未読',
        formatNoticeDate(notice.createdAt),
      ].filter(Boolean).join(' / '),
    }));
}

function collectVisibleChatRooms() {
  const knownUsers = state._knownUsernames;
  const dmRooms = Array.isArray(state.dmRooms) ? state.dmRooms : [];
  const groupRooms = Array.isArray(state.groupRooms) ? state.groupRooms : [];
  const visibleDmRooms = knownUsers
    ? dmRooms.filter(room => {
        const other = (room.members || []).find(member => member !== state.currentUsername);
        return !other || knownUsers.has(other);
      })
    : dmRooms;

  return [...visibleDmRooms, ...groupRooms];
}

function getRoomUnreadCount(room) {
  if (typeof deps.getRoomUnread === 'function') {
    return deps.getRoomUnread(room) || 0;
  }
  if (!room?.lastAt || !room?.lastSender || room.lastSender === state.currentUsername) return 0;
  const lastAt = toMillis(room.lastAt);
  const readTime = toMillis(state.chatReadTimes?.[room.id]);
  if (!lastAt) return 0;
  return (!readTime || lastAt > readTime) ? 1 : 0;
}

function getChatRoomLabel(room) {
  if (!room) return 'チャット';
  if (room.type === 'group' || room.name) return room.name || 'グループ';
  const members = Array.isArray(room.members) ? room.members : [];
  return members.find(member => member !== state.currentUsername) || '個別チャット';
}

function bindWorkspaceHost() {
  const host = document.getElementById('home-dashboard');
  if (!host || host.dataset.workspaceBound === '1') return;

  host.dataset.workspaceBound = '1';
  host.addEventListener('click', event => {
    const button = event.target.closest('[data-home-action]');
    if (!button || !host.contains(button)) return;
    const action = button.dataset.homeAction || '';
    if (!action) return;
    event.preventDefault();
    handleWorkspaceAction(action);
  });
  host.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const button = event.target.closest('[data-home-action]');
    if (!button || !host.contains(button)) return;
    const action = button.dataset.homeAction || '';
    if (!action) return;
    event.preventDefault();
    handleWorkspaceAction(action);
  });
}

function handleWorkspaceAction(action) {
  switch (action) {
    case 'focus-notice':
      deps.focusNoticeBoard?.();
      return;
    case 'open-notice-modal':
      deps.openNoticeModal?.(null);
      return;
    case 'open-today-attendance':
      void deps.openTodayAttendance?.();
      return;
    case 'open-calendar-modal':
      void deps.openCalendarModal?.();
      return;
    case 'open-task-modal':
      deps.openTaskModal?.();
      return;
    case 'open-task-new':
      deps.openTaskNew?.();
      return;
    case 'open-request-modal':
      deps.openRequestModal?.();
      return;
    case 'open-request-new':
      deps.openRequestNew?.();
      return;
    case 'open-order-modal':
      deps.openOrderModal?.();
      return;
    case 'open-order-history':
      deps.openOrderHistoryModal?.();
      return;
    case 'open-email-modal':
      deps.openEmailModal?.();
      return;
    case 'open-profile-modal':
      deps.openProfileModal?.();
      return;
    case 'open-chat-panel':
      deps.openChatPanel?.();
      return;
    case 'open-new-dm':
      deps.openNewDmModal?.();
      return;
    case 'open-file-panel':
      deps.openFileTransferPanel?.();
      return;
    case 'open-file-send':
      deps.openFtSendModal?.();
      return;
    case 'open-property-summary':
      deps.openPropertySummaryModal?.();
      return;
    case 'focus-favorites':
    case 'toggle-favorites':
      setHomeWorkspaceTarget('favorites', 'btn-favorites-only');
      return;
    case 'open-settings':
      deps.openSettingsPanel?.();
      return;
    case 'open-guide':
    case 'open-help':
      deps.openGuideModal?.();
      return;
    case 'open-diagnostics':
      deps.openReadDiagnosticsModal?.();
      return;
    case 'open-invite':
      deps.openInviteCodeModal?.();
      return;
    default:
      return;
  }
}

function collectNoticeSource() {
  const visible = Array.isArray(state.visibleNotices) && state.visibleNotices.length > 0
    ? state.visibleNotices
    : (Array.isArray(state.allNotices) ? state.allNotices : []);
  return visible.slice().sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

function collectActiveTasks() {
  const buckets = [
    ...(Array.isArray(state.receivedTasks) ? state.receivedTasks : []),
    ...(Array.isArray(state.sharedTasks) ? state.sharedTasks : []),
  ];
  const seen = new Set();
  return buckets
    .filter(task => task && ['pending', 'accepted'].includes(task.status))
    .filter(task => {
      const key = task.id || `${task.title || ''}-${task.assignedBy || ''}-${task.assignedTo || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => compareTaskPriority(a, b));
}


function compareTaskPriority(a, b) {
  const aDue = toMillis(a.dueDate) || Number.POSITIVE_INFINITY;
  const bDue = toMillis(b.dueDate) || Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;

  const aStatus = a.status === 'pending' ? 0 : 1;
  const bStatus = b.status === 'pending' ? 0 : 1;
  if (aStatus !== bStatus) return aStatus - bStatus;

  return String(a.title || '').localeCompare(String(b.title || ''), 'ja');
}

function buildDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getAttendanceLabel(attendance) {
  if (!attendance) return '未入力';
  if (attendance.type === '有給') return '有給';
  if (attendance.type === '半休午前') return '半休 午前';
  if (attendance.type === '半休午後') return '半休 午後';
  if (attendance.type === '欠勤') return '欠勤';
  if (attendance.type === 'normal' || !attendance.type) return '通常';
  if (attendance.hayade) return `早出 ${attendance.hayade}`;
  if (attendance.zangyo) return `残業 ${attendance.zangyo}`;
  return attendance.type;
}

function formatDueLabel(dueDate) {
  if (!dueDate) return '';
  const todayKey = buildDateKey(new Date());
  if (dueDate < todayKey) return `期限超過 ${dueDate.slice(5).replace('-', '/')}`;
  if (dueDate === todayKey) return '期限 今日';
  return `期限 ${dueDate.slice(5).replace('-', '/')}`;
}

function formatNoticeDate(value) {
  const ms = toMillis(value);
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
}

// ===== ホーム マイスペースパネル =====
export function renderHomeMySpacePanel(el) {
  if (!el) return;
  el.innerHTML = '';

  // First-time + language support: quick actions and a tiny glossary.
  const helpSection = document.createElement('section');
  helpSection.className = 'home-myspace-section home-myspace-section--help';

  const helpHeader = document.createElement('h4');
  helpHeader.className = 'home-myspace-section-title home-myspace-section-title--help';
  helpHeader.innerHTML = '<i class="material-symbols-rounded" aria-hidden="true">info</i> はじめに';
  helpSection.appendChild(helpHeader);

  const helpCopy = document.createElement('p');
  helpCopy.className = 'home-help-copy';
  helpCopy.textContent = '迷ったら「ガイド」。よく使う入口と用語の意味をまとめました。';
  helpSection.appendChild(helpCopy);

  const actions = document.createElement('div');
  actions.className = 'home-help-actions';

  const actionDefs = [
    { action: 'open-guide', icon: 'help', label: 'ガイド', aria: '使い方ガイドを開く' },
    { action: 'open-chat-panel', icon: 'chat', label: 'チャット', aria: 'チャットを開く' },
    { action: 'focus-notice', icon: 'notifications', label: 'お知らせ', aria: 'お知らせを表示する' },
    { action: 'open-task-modal', icon: 'checklist', label: 'タスク', aria: 'タスク管理を開く' },
  ];

  actionDefs.forEach(def => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'home-help-chip';
    btn.dataset.homeAction = def.action;
    btn.setAttribute('aria-label', def.aria);
    btn.innerHTML = `<i class="material-symbols-rounded" aria-hidden="true">${esc(def.icon)}</i><span>${esc(def.label)}</span>`;
    actions.appendChild(btn);
  });
  helpSection.appendChild(actions);

  const glossary = document.createElement('details');
  glossary.className = 'home-help-glossary home-help-glossary-details';
  const glossarySummary = document.createElement('summary');
  glossarySummary.className = 'home-help-glossary-summary';
  glossarySummary.innerHTML = '<i class="material-symbols-rounded" aria-hidden="true">library_books</i><span>用語を確認</span>';
  glossary.appendChild(glossarySummary);
  const glossaryList = document.createElement('div');
  glossaryList.className = 'home-help-glossary-list';
  const glossaryItems = [
    { term: 'お知らせ', desc: '社内のお知らせ。確認が必要なものは「確認した」まで対応します。 (Thong bao)' },
    { term: '個別チャット', desc: '1対1のチャットです。 (Tin nhan rieng)' },
    { term: '物件No', desc: '現場の番号（コード）。検索や「物件Noまとめ」で使います。 (Ma cong trinh)' },
    { term: 'ファイル転送', desc: 'ファイルを送る機能。P2P=直接送信、Drive=リンク共有。 (Chuyen tep)' },
    { term: '招待コード', desc: '初回端末の承認に使う4桁コードです。 (Ma moi)' },
  ];

  glossaryItems.forEach(item => {
    const row = document.createElement('div');
    row.className = 'home-help-glossary-item';
    row.innerHTML = `
      <span class="home-help-term">${esc(item.term)}</span>
      <span class="home-help-desc">${esc(item.desc)}</span>
    `;
    glossaryList.appendChild(row);
  });
  glossary.appendChild(glossaryList);
  helpSection.appendChild(glossary);

  const helpNote = document.createElement('p');
  helpNote.className = 'home-help-copy';
  helpNote.textContent = '※ まずは「お知らせ」「チャット」「タスク」の3つだけ覚えれば使えます。';
  helpSection.appendChild(helpNote);

  el.appendChild(helpSection);

  const allCards = [...(state.allCards || []), ...(state.privateCards || [])];
  const favIds = state.personalFavorites || [];
  const favCards = favIds.map(id => allCards.find(c => c.id === id)).filter(Boolean);

  // お気に入りセクション
  const favSection = document.createElement('div');
  favSection.className = 'home-myspace-section';

  const favHeader = document.createElement('h4');
  favHeader.className = 'home-myspace-section-title';
  favHeader.innerHTML = '<i class="material-symbols-rounded" aria-hidden="true">star</i> お気に入り';
  favSection.appendChild(favHeader);

  if (favCards.length) {
    const grid = document.createElement('div');
    grid.className = 'card-grid home-myspace-grid';
    favCards.forEach(card => grid.appendChild(deps.buildLinkCard(card, true)));
    favSection.appendChild(grid);
  } else {
    const empty = document.createElement('p');
    empty.className = 'home-myspace-empty';
    empty.textContent = 'お気に入りがありません。カードの星を押して追加できます。';
    favSection.appendChild(empty);
  }
  el.appendChild(favSection);

  // マイカテゴリーセクション
  const categories = [...(state.privateCategories || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (categories.length) {
    const catTitleEl = document.createElement('h4');
    catTitleEl.className = 'home-myspace-section-title home-myspace-section-title--cat';
    catTitleEl.innerHTML = '<i class="material-symbols-rounded" aria-hidden="true">folder</i> 自分のカテゴリ';
    el.appendChild(catTitleEl);

    categories.forEach(cat => {
      const catCards = (state.privateCards || []).filter(c => c.sectionId === cat.docId);

      const catSection = document.createElement('div');
      catSection.className = 'home-myspace-cat-section';

      const catHeader = document.createElement('div');
      catHeader.className = 'home-myspace-cat-header';
      const iconHtml = cat.icon
        ? (cat.icon.startsWith('fa-') || cat.icon.startsWith('fas ') || cat.icon.includes('fa-')
          ? `<i class="${esc(cat.icon)}"></i>`
          : esc(cat.icon))
        : '<i class="fa-solid fa-folder"></i>';
      catHeader.innerHTML = `<span class="home-myspace-cat-icon">${iconHtml}</span><span class="home-myspace-cat-label">${esc(cat.label || '')}</span>`;
      catSection.appendChild(catHeader);

      if (catCards.length) {
        const grid = document.createElement('div');
        grid.className = 'card-grid home-myspace-grid';
        catCards.forEach(card => grid.appendChild(deps.buildLinkCard(card, false)));
        catSection.appendChild(grid);
      } else {
        const empty = document.createElement('p');
        empty.className = 'home-myspace-empty';
        empty.textContent = 'このカテゴリーにはカードがありません。';
        catSection.appendChild(empty);
      }
      el.appendChild(catSection);
    });
  }
}
