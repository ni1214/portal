import { state, TASK_STATUS_LABEL, USER_ROLE_LABELS } from './state.js';
import { esc, formatFileSize } from './utils.js';

export let deps = {};

const DEFAULT_TARGET = 'notice';

const TARGET_META = {
  notice: {
    title: '通知',
    detailTitle: '通知を確認する',
    copy: '未読と確認待ちをまとめて確認できます。ホームの中心になる場所です。',
    kicker: 'ホームの中心',
    tone: 'notice',
  },
  calendar: {
    title: '勤怠・カレンダー',
    detailTitle: '今日の勤怠を開く',
    copy: '今日の勤怠入力とカレンダーを素早く開けます。',
    kicker: '今日の入口',
    tone: 'calendar',
  },
  task: {
    title: 'タスク管理',
    detailTitle: '受信・依頼・共有タスク',
    copy: '自分に関するタスクをまとめて確認して、必要なら新規依頼も起票できます。',
    kicker: '作業の起点',
    tone: 'task',
  },
  request: {
    title: '部門間依頼',
    detailTitle: '依頼と目安箱',
    copy: '依頼の受信と送信、新規投稿までをここからまとめて進めます。',
    kicker: '部門連携',
    tone: 'request',
  },
  order: {
    title: '鋼材発注',
    detailTitle: '発注フォームと履歴',
    copy: '発注フォーム、履歴、管理設定をひとまとめに開けます。',
    kicker: '発注の入口',
    tone: 'order',
  },
  email: {
    title: 'メールアシスタント',
    detailTitle: 'メール作成とプロフィール',
    copy: 'メール作成と署名設定をまとめて開けます。',
    kicker: 'メール導線',
    tone: 'email',
  },
  chat: {
    title: 'チャット',
    detailTitle: 'DM とグループ',
    copy: 'DM とグループを開き、必要なら新規ルームも作成できます。',
    kicker: '会話の入口',
    tone: 'chat',
  },
  file: {
    title: 'ファイル転送',
    detailTitle: 'ファイル送信と Drive 共有',
    copy: 'ファイル転送パネルと送信画面を素早く開けます。',
    kicker: '転送の入口',
    tone: 'file',
  },
  property: {
    title: '物件Noまとめ',
    detailTitle: '物件No の横断検索',
    copy: '依頼・タスク・発注を物件Noでまとめて確認します。',
    kicker: '横串の入口',
    tone: 'property',
  },
  favorites: {
    title: 'お気に入り',
    detailTitle: 'お気に入りの表示',
    copy: 'お気に入り表示を切り替えて、よく使うカードへ戻れます。',
    kicker: 'よく使う導線',
    tone: 'favorites',
  },
  settings: {
    title: '表示設定',
    detailTitle: 'テーマとフォント',
    copy: 'テーマ、フォントサイズ、編集モードを確認できます。',
    kicker: '見た目の設定',
    tone: 'settings',
  },
  help: {
    title: '使い方ガイド',
    detailTitle: 'ホームの使い方',
    copy: 'このホームは、上が固定の要約、下がサイドバー連動のワークスペースです。',
    kicker: '初見向け',
    tone: 'help',
  },
  diagnostics: {
    title: '転送診断',
    detailTitle: '読み込み量の確認',
    copy: 'どの画面がどれだけ読んだかを確認して、転送量の増えすぎを防ぎます。',
    kicker: '軽量化の確認',
    tone: 'diagnostics',
  },
  invite: {
    title: '招待コード',
    detailTitle: '招待コードの確認',
    copy: '招待コードの入力と再表示をまとめて扱えます。',
    kicker: 'アクセス管理',
    tone: 'invite',
  },
};

export function initHomeDashboard(d = {}) {
  deps = { ...deps, ...d };
  if (!state.homeWorkspaceTarget) state.homeWorkspaceTarget = DEFAULT_TARGET;
  if (!state.homeWorkspaceActiveButtonId) state.homeWorkspaceActiveButtonId = 'sidebar-home-btn';
  bindWorkspaceHost();
  renderHomeWorkspace();
}

export function setHomeWorkspaceTarget(target = DEFAULT_TARGET, activeButtonId = '') {
  state.homeWorkspaceTarget = normalizeTarget(target);
  if (activeButtonId) {
    state.homeWorkspaceActiveButtonId = activeButtonId;
  }
  renderHomeWorkspace();
}

export function updateSummaryCards() {
  renderHomeWorkspace();
}

export function renderHomeWorkspace() {
  const host = document.getElementById('home-dashboard');
  if (!host) return;

  const targetKey = normalizeTarget(state.homeWorkspaceTarget);
  const target = buildTargetConfig(targetKey);
  const stageBodyId = `home-workspace-stage-body-${targetKey}`;
  const overviewTitle = buildOverviewTitle();
  const overviewSubtitle = buildOverviewSubtitle();
  const taskOverview = buildTaskOverview();
  const noticeOverview = buildNoticeOverview();
  const companyOverview = buildCompanyNoticeOverview();

  host.innerHTML = `
    <section class="home-workspace-shell" data-tone="${esc(target.tone)}" aria-live="polite" role="region" aria-labelledby="home-overview-title">
      <header class="home-workspace-header">
        <div class="home-workspace-header-copy">
          <p class="home-workspace-kicker">ホーム</p>
          <h2 class="home-workspace-title" id="home-overview-title">${esc(overviewTitle)}</h2>
          <p class="home-workspace-copy">${esc(overviewSubtitle)}</p>
        </div>
        <div class="home-workspace-badge">
          <span class="home-workspace-badge-label">現在の表示</span>
          <strong class="home-workspace-badge-value">${esc(target.title)}</strong>
        </div>
      </header>

      <div class="home-overview-grid">
        ${renderOverviewCard(taskOverview)}
        ${renderOverviewCard(noticeOverview)}
        ${renderOverviewCard(companyOverview)}
      </div>

      <section class="home-workspace-stage home-workspace-panel" data-tone="${esc(target.tone)}" aria-labelledby="home-workspace-stage-title">
        <div class="home-workspace-stage-head">
          <div>
            <p class="home-workspace-card-kicker">${esc(target.kicker)}</p>
            <h3 class="home-workspace-stage-title" id="home-workspace-stage-title">${esc(target.detailTitle)}</h3>
            <p class="home-workspace-stage-copy">${esc(target.copy)}</p>
          </div>
          <span class="home-workspace-card-pill">${esc(target.badge || target.title)}</span>
        </div>

        <div class="home-workspace-stage-body" id="${stageBodyId}">
          ${renderStageContent(targetKey, target)}
        </div>
      </section>
    </section>
  `;

  syncSidebarSelection();
  hydrateStageContent(targetKey, stageBodyId, target);
}

function buildOverviewTitle() {
  const username = state.currentUsername || 'ユーザー名未設定';
  return `おかえり、${username}`;
}

function buildOverviewSubtitle() {
  if (!state.currentUsername) {
    return 'ユーザー名を設定すると、自分のタスクや通知が表示されます。';
  }
  return '上部はタスク・通知・社内のお知らせだけ。下のエリアはサイドバーで切り替える試作です。';
}

function renderOverviewCard(snapshot) {
  return `
    <article class="home-workspace-card home-overview-card" data-tone="${esc(snapshot.tone)}">
      <div class="home-workspace-card-head">
        <div>
          <p class="home-workspace-card-kicker">${esc(snapshot.kicker)}</p>
          <h3 class="home-workspace-card-title">${esc(snapshot.title)}</h3>
        </div>
        <span class="home-workspace-card-pill">${esc(snapshot.value)}</span>
      </div>

      <p class="home-workspace-copy">${esc(snapshot.meta)}</p>
      ${renderOverviewList(snapshot.items, snapshot.emptyText)}
    </article>
  `;
}

function renderOverviewList(items = [], emptyText = '') {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  return `
    <ul class="home-workspace-note-list">
      ${items.map(item => `
        <li class="home-workspace-note-item">
          <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
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
      ? `承諾待ち ${pending}件 / 進行中 ${accepted}件`
      : '受信タスクはありません',
    tone: overdue > 0 ? 'notice' : (pending > 0 ? 'task' : 'settings'),
    items: tasks.slice(0, 2).map(task => ({
      title: task.title || '名称未設定',
      meta: [
        TASK_STATUS_LABEL[task.status]?.text || task.status || '',
        task.assignedBy ? `依頼 ${task.assignedBy}` : '',
        formatDueLabel(task.dueDate),
      ].filter(Boolean).join(' / '),
    })),
    emptyText: '受信タスクはまだありません',
  };
}

function buildNoticeOverview() {
  const stats = buildNoticeStats();
  return {
    kicker: '自分向け',
    title: '通知',
    value: `${stats.totalCount}件`,
    meta: stats.pendingAckCount > 0
      ? `確認待ち ${stats.pendingAckCount}件 / 未読 ${stats.unreadCount}件`
      : (stats.unreadCount > 0 ? `未読 ${stats.unreadCount}件` : '通知はありません'),
    tone: stats.pendingAckCount > 0 ? 'notice' : (stats.unreadCount > 0 ? 'task' : 'settings'),
    items: stats.items,
    emptyText: '通知はまだありません',
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
        notice.requireAcknowledgement ? '確認必須' : (notice.priority === 'urgent' ? '重要' : '通常'),
        formatNoticeDate(notice.createdAt),
      ].filter(Boolean).join(' / '),
    })),
  };
}

function buildTargetConfig(targetKey) {
  switch (targetKey) {
    case 'calendar':
      return buildCalendarConfig();
    case 'task':
      return buildTaskConfig();
    case 'request':
      return buildRequestConfig();
    case 'order':
      return buildOrderConfig();
    case 'email':
      return buildEmailConfig();
    case 'chat':
      return buildChatConfig();
    case 'file':
      return buildFileConfig();
    case 'property':
      return buildPropertyConfig();
    case 'favorites':
      return buildFavoritesConfig();
    case 'settings':
      return buildSettingsConfig();
    case 'help':
      return buildHelpConfig();
    case 'diagnostics':
      return buildDiagnosticsConfig();
    case 'invite':
      return buildInviteConfig();
    case 'notice':
    default:
      return buildNoticeConfig();
  }
}

function buildNoticeConfig() {
  const stats = buildNoticeStats();
  return {
    title: '通知',
    detailTitle: '通知を確認する',
    copy: '未読と確認待ちをまとめて確認できます。ここがホームの中心です。',
    kicker: 'ホームの中心',
    tone: 'notice',
    value: `${stats.totalCount}件`,
    badge: `${stats.totalCount}件`,
    metrics: [
      { label: '未読', value: `${stats.unreadCount}件` },
      { label: '確認待ち', value: `${stats.pendingAckCount}件` },
      { label: '最新', value: stats.latestNotice ? (stats.latestNotice.title || '名称未設定') : 'なし' },
    ],
    bullets: [
      '重要なお知らせを優先して確認',
      '確認必須の通知を見落とさない',
      '必要なら新規通知の投稿へ進む',
    ],
    actions: [
      { label: 'お知らせを投稿', action: 'open-notice-modal', variant: 'primary', show: () => state.isEditMode === true },
      { label: '使い方ガイド', action: 'open-help', variant: 'secondary' },
    ],
  };
}

function buildCalendarConfig() {
  const attendance = buildAttendanceSnapshot();
  return {
    title: '勤怠・カレンダー',
    detailTitle: '今日の勤怠を開く',
    copy: '今日の勤怠入力とカレンダーを開きます。必要なら日付をまたいで確認できます。',
    kicker: '今日の入口',
    tone: 'calendar',
    value: attendance.value,
    badge: attendance.value,
    metrics: [
      { label: '今日', value: attendance.value },
      { label: 'メモ', value: attendance.noteLabel },
      { label: '今月', value: attendance.monthLabel },
    ],
    bullets: [
      '今日の勤怠をすぐ入力',
      'カレンダーから過去日を確認',
      '共有カレンダーも同じ導線で開ける',
    ],
    actions: [
      { label: '今日の勤怠を開く', action: 'open-today-attendance', variant: 'primary' },
      { label: 'カレンダーを開く', action: 'open-calendar-modal', variant: 'secondary' },
    ],
  };
}

function buildTaskConfig() {
  const stats = buildTaskSnapshot();
  return {
    title: 'タスク管理',
    detailTitle: '受信・依頼・共有タスク',
    copy: '自分に関するタスクをここから確認して、新規依頼もすぐ起票できます。',
    kicker: '作業の起点',
    tone: 'task',
    value: stats.countLabel,
    badge: stats.countLabel,
    metrics: [
      { label: '受信', value: stats.receivedLabel },
      { label: '共有', value: stats.sharedLabel },
      { label: '期限超過', value: stats.overdueLabel },
    ],
    bullets: [
      '受信タスクをひと目で確認',
      '共有タスクも合わせて追跡',
      '新規依頼の起票へそのまま進む',
    ],
    actions: [
      { label: 'タスク管理を開く', action: 'open-task-modal', variant: 'primary' },
      { label: '新規依頼を作成', action: 'open-task-new', variant: 'secondary' },
    ],
  };
}

function buildRequestConfig() {
  const stats = buildRequestSnapshot();
  return {
    title: '部門間依頼',
    detailTitle: '依頼と目安箱',
    copy: '受信した依頼、送信した依頼、新規投稿までをまとめて扱います。',
    kicker: '部門連携',
    tone: 'request',
    value: stats.countLabel,
    badge: stats.countLabel,
    metrics: [
      { label: '受信', value: stats.receivedLabel },
      { label: '送信', value: stats.sentLabel },
      { label: '進行中', value: stats.openLabel },
    ],
    bullets: [
      '部門間の依頼をまとめて確認',
      '新規投稿から依頼を起票',
      '状況の更新を追える',
    ],
    actions: [
      { label: '依頼を開く', action: 'open-request-modal', variant: 'primary' },
      { label: '新規投稿を作成', action: 'open-request-new', variant: 'secondary' },
    ],
  };
}

function buildOrderConfig() {
  return {
    title: '鋼材発注',
    detailTitle: '発注フォームと履歴',
    copy: '発注フォーム、履歴、管理設定をひとまとめに開けます。',
    kicker: '発注の入口',
    tone: 'order',
    value: '発注',
    badge: '発注',
    metrics: [
      { label: 'フォーム', value: '開く' },
      { label: '履歴', value: '確認' },
      { label: '管理', value: '設定' },
    ],
    bullets: [
      '鋼材発注フォームへ移動',
      '過去の発注履歴を確認',
      '必要なら管理設定へ進む',
    ],
    actions: [
      { label: '発注を開く', action: 'open-order-modal', variant: 'primary' },
      { label: '履歴を見る', action: 'open-order-history', variant: 'secondary' },
    ],
  };
}

function buildEmailConfig() {
  const profile = state.userEmailProfile || {};
  return {
    title: 'メールアシスタント',
    detailTitle: 'メール作成とプロフィール',
    copy: 'メール作成と署名設定をまとめて開けます。',
    kicker: 'メール導線',
    tone: 'email',
    value: profile.department || '未設定',
    badge: profile.department || '未設定',
    metrics: [
      { label: '部署', value: profile.department || '未設定' },
      { label: '役割', value: USER_ROLE_LABELS[profile.roleType] || '未設定' },
      { label: '署名', value: profile.signatureTemplate ? '設定済み' : '未設定' },
    ],
    bullets: [
      'メールアシスタントを開く',
      'プロフィール設定で署名を整える',
      '必要な連絡先を確認',
    ],
    actions: [
      { label: 'メールアシスタントを開く', action: 'open-email-modal', variant: 'primary' },
      { label: 'プロフィール設定', action: 'open-profile-modal', variant: 'secondary' },
    ],
  };
}

function buildChatConfig() {
  const dmCount = Array.isArray(state.dmRooms) ? state.dmRooms.length : 0;
  const groupCount = Array.isArray(state.groupRooms) ? state.groupRooms.length : 0;
  const messageCount = Array.isArray(state.currentRoomMessages) ? state.currentRoomMessages.length : 0;
  return {
    title: 'チャット',
    detailTitle: 'DM とグループ',
    copy: 'チャットパネルを開いて、DM とグループを切り替えます。',
    kicker: '会話の入口',
    tone: 'chat',
    value: `${dmCount + groupCount}室`,
    badge: `${dmCount + groupCount}室`,
    metrics: [
      { label: 'DM', value: `${dmCount}室` },
      { label: 'グループ', value: `${groupCount}室` },
      { label: '表示中', value: `${messageCount}件` },
    ],
    bullets: [
      'DM とグループを切り替え',
      '新規 DM を作成',
      '必要な会話へすぐ戻る',
    ],
    actions: [
      { label: 'チャットを開く', action: 'open-chat-panel', variant: 'primary' },
      { label: '新規 DM を作成', action: 'open-new-dm', variant: 'secondary' },
    ],
  };
}

function buildFileConfig() {
  const incoming = Array.isArray(state._ftIncoming) ? state._ftIncoming.length : 0;
  const outgoing = Array.isArray(state._ftOutgoing) ? state._ftOutgoing.length : 0;
  const driveIncoming = Array.isArray(state._driveIncoming) ? state._driveIncoming.length : 0;
  const driveOutgoing = Array.isArray(state._driveOutgoing) ? state._driveOutgoing.length : 0;
  return {
    title: 'ファイル転送',
    detailTitle: 'ファイル送信と Drive 共有',
    copy: 'ファイル転送パネルを開いて、送受信と Drive 共有を扱います。',
    kicker: '転送の入口',
    tone: 'file',
    value: `${incoming + outgoing + driveIncoming + driveOutgoing}件`,
    badge: `${incoming + outgoing + driveIncoming + driveOutgoing}件`,
    metrics: [
      { label: '送信中', value: `${outgoing}件` },
      { label: '受信中', value: `${incoming}件` },
      { label: 'Drive', value: `${driveIncoming + driveOutgoing}件` },
    ],
    bullets: [
      'ファイル転送パネルを開く',
      'P2P の送受信を管理',
      'Drive 共有の流れも確認',
    ],
    actions: [
      { label: 'ファイル転送を開く', action: 'open-file-panel', variant: 'primary' },
      { label: '送信を開始', action: 'open-file-send', variant: 'secondary' },
    ],
  };
}

function buildPropertyConfig() {
  const requests = Array.isArray(state.receivedRequests) ? state.receivedRequests.length : 0;
  const tasks = Array.isArray(state.receivedTasks) ? state.receivedTasks.length : 0;
  const sharedTasks = Array.isArray(state.sharedTasks) ? state.sharedTasks.length : 0;
  return {
    title: '物件Noまとめ',
    detailTitle: '物件No の横断検索',
    copy: '依頼・タスク・発注を物件Noでまとめて確認します。',
    kicker: '横串の入口',
    tone: 'property',
    value: '検索',
    badge: '検索',
    metrics: [
      { label: '依頼', value: `${requests}件` },
      { label: 'タスク', value: `${tasks + sharedTasks}件` },
      { label: '発注', value: '横断' },
    ],
    bullets: [
      '物件Noで依頼・タスク・発注を横断検索',
      '入力後に結果をまとめて確認',
      '必要な連携画面へそのまま進める',
    ],
    actions: [
      { label: '物件Noまとめを開く', action: 'open-property-summary', variant: 'primary' },
    ],
  };
}

function buildFavoritesConfig() {
  const count = Array.isArray(state.personalFavorites) ? state.personalFavorites.length : 0;
  const hiddenCount = Array.isArray(state.hiddenCards) ? state.hiddenCards.length : 0;
  return {
    title: 'お気に入り',
    detailTitle: 'お気に入りの表示',
    copy: 'お気に入りのカードをまとめて確認して、よく使う導線を開けます。',
    kicker: 'よく使う導線',
    tone: 'favorites',
    value: `${count}件`,
    badge: state.favoritesOnlyMode ? '表示中' : '通常',
    metrics: [
      { label: '登録数', value: `${count}件` },
      { label: '表示', value: state.favoritesOnlyMode ? '表示中' : '通常' },
      { label: '非表示', value: `${hiddenCount}件` },
    ],
    bullets: [
      'お気に入りカードをまとめて確認',
      'よく使う導線へすぐ開く',
      '下のワークスペースで詳細を開く',
    ],
    actions: [
      { label: 'お気に入りを開く', action: 'focus-favorites', variant: 'primary' },
    ],
  };
}

function buildSettingsConfig() {
  const theme = localStorage.getItem('portal-theme') || 'dark';
  const fontSize = localStorage.getItem('portal-font-size') || 'font-md';
  return {
    title: '表示設定',
    detailTitle: 'テーマとフォント',
    copy: 'テーマ、フォントサイズ、編集モードを確認できます。',
    kicker: '見た目の設定',
    tone: 'settings',
    value: theme === 'light' ? 'ライト' : 'ダーク',
    badge: theme === 'light' ? 'ライト' : 'ダーク',
    metrics: [
      { label: 'テーマ', value: theme === 'light' ? 'ライト' : 'ダーク' },
      { label: '文字サイズ', value: fontSize.replace('font-', '') || 'md' },
      { label: '編集', value: state.isEditMode ? '常時ON' : 'OFF' },
    ],
    bullets: [
      'テーマを切り替える',
      'フォントサイズを調整',
      '編集モードの状態を確認',
    ],
    actions: [
      { label: '設定を開く', action: 'open-settings', variant: 'primary' },
      { label: 'ガイドを見る', action: 'open-help', variant: 'secondary' },
    ],
  };
}

function buildHelpConfig() {
  return {
    title: '使い方ガイド',
    detailTitle: 'ホームの使い方',
    copy: '上部は固定の要約、下部はサイドバーで切り替える試作です。',
    kicker: '初見向け',
    tone: 'help',
    value: '案内',
    badge: '案内',
    metrics: [
      { label: 'ホーム', value: '固定' },
      { label: 'サイドバー', value: '切替' },
      { label: 'モーダル', value: '流用' },
    ],
    bullets: [
      '上部はタスク・通知・社内のお知らせだけ',
      '左のサイドバーで下の領域を切り替える',
      '必要な入力は既存モーダルをそのまま開く',
    ],
    actions: [
      { label: 'ガイドを開く', action: 'open-help', variant: 'primary' },
      { label: '通知へ移動', action: 'focus-notice', variant: 'secondary' },
    ],
  };
}

function buildDiagnosticsConfig() {
  const diag = state.readDiagnostics || {};
  return {
    title: '転送診断',
    detailTitle: '読み込み量の確認',
    copy: 'どの画面がどれだけ読んだかを確認して、無駄な読み込みを追いやすくします。',
    kicker: '軽量化の確認',
    tone: 'diagnostics',
    value: formatFileSize(diag.estimatedTransferBytes || 0),
    badge: formatFileSize(diag.estimatedTransferBytes || 0),
    metrics: [
      { label: '推定転送', value: formatFileSize(diag.estimatedTransferBytes || 0) },
      { label: 'API', value: `${Number(diag.apiCalls || 0)}回` },
      { label: 'リスナー', value: `${Number(diag.listenerStarts || 0)}回` },
    ],
    bullets: [
      'どの画面が重いかを把握',
      '起動時の読み込み量を確認',
      '必要なら後で絞り込みを見直す',
    ],
    actions: [
      { label: '診断を開く', action: 'open-diagnostics', variant: 'primary' },
      { label: 'ガイドを見る', action: 'open-help', variant: 'secondary' },
    ],
  };
}

function buildInviteConfig() {
  return {
    title: '招待コード',
    detailTitle: '招待コードの確認',
    copy: '招待コードの入力と再表示をまとめて扱えます。',
    kicker: 'アクセス管理',
    tone: 'invite',
    value: state.inviteCodeVerified ? '確認済み' : '未確認',
    badge: state.inviteCodeRequired ? '必要' : '不要',
    metrics: [
      { label: '必要', value: state.inviteCodeRequired ? '必要' : '不要' },
      { label: '確認', value: state.inviteCodeVerified ? '確認済み' : '未確認' },
      { label: '管理', value: state.adminInviteConfigured ? 'あり' : '未設定' },
    ],
    bullets: [
      '招待コードが必要か確認',
      '管理画面から再表示',
      '入力前に状態を見られる',
    ],
    actions: [
      { label: '招待コードを開く', action: 'open-invite', variant: 'primary' },
    ],
  };
}

function renderMetricGrid(metrics = []) {
  if (!Array.isArray(metrics) || metrics.length === 0) return '';
  return `
    <div class="home-workspace-metric-grid">
      ${metrics.map(metric => `
        <div class="home-workspace-metric">
          <span class="home-workspace-metric-label">${esc(metric.label || '')}</span>
          <strong class="home-workspace-metric-value">${esc(metric.value || '')}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderBulletList(items = []) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return `
    <ul class="home-workspace-note-list">
      ${items.map(item => `
        <li class="home-workspace-note-item">
          <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
          <span>${esc(item)}</span>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderActionRow(actions = []) {
  if (!Array.isArray(actions) || actions.length === 0) return '';
  const visibleActions = actions.filter(action => {
    if (!action) return false;
    if (typeof action.show === 'function') return !!action.show();
    if (action.show === false) return false;
    return true;
  });
  if (!visibleActions.length) return '';

  return `
    <div class="home-workspace-actions">
      ${visibleActions.map((action, index) => renderActionButton(action, index === 0)).join('')}
    </div>
  `;
}

function renderStageContent(targetKey, target) {
  const fallback = renderDefaultStageContent(target);

  switch (targetKey) {
    case 'task':
      return renderTaskStageContent(target, fallback);
    case 'notice':
      return renderNoticeStageContent(target);
    case 'request':
      return renderRequestStageContent(target);
    case 'calendar':
      return renderCalendarStageContent(target);
    case 'favorites':
      return renderFavoritesStageContent(target);
    default:
      return fallback;
  }
}

function renderDefaultStageContent(target) {
  return `
    ${renderMetricGrid(target.metrics)}
    ${renderBulletList(target.bullets)}
    ${renderActionRow(target.actions)}
  `;
}

function renderTaskStageContent(target, fallbackContent) {
  const stats = buildTaskSnapshot();
  const activeTasks = collectActiveTasks();
  const focusTasks = activeTasks.slice(0, 4);
  const embedAvailable = typeof deps.renderEmbeddedTaskWorkspace === 'function';

  return `
    <div class="home-workspace-grid home-workspace-top-grid">
      <article class="home-workspace-card home-workspace-card--main">
        <div class="home-workspace-card-head">
          <div>
            <p class="home-workspace-card-kicker">フォーカス</p>
            <h4 class="home-workspace-card-title">自分のタスクを常設表示</h4>
          </div>
          <span class="home-workspace-card-pill">${esc(stats.countLabel)}</span>
        </div>
        <div class="home-workspace-notice-summary">
          <div class="home-workspace-notice-stat">
            <span>受信</span>
            <strong>${esc(stats.receivedLabel)}</strong>
          </div>
          <div class="home-workspace-notice-stat">
            <span>共有</span>
            <strong>${esc(stats.sharedLabel)}</strong>
          </div>
          <div class="home-workspace-notice-stat">
            <span>進行中</span>
            <strong>${esc(stats.sentLabel)}</strong>
          </div>
          <div class="home-workspace-notice-stat">
            <span>期限超過</span>
            <strong>${esc(stats.overdueLabel)}</strong>
          </div>
        </div>
        ${focusTasks.length ? `
          <div class="home-workspace-notice-preview">
            <div class="home-workspace-notice-list">
              ${focusTasks.map(task => `
                <div class="home-workspace-notice-item">
                  <strong class="home-workspace-notice-title">${esc(task.title || 'タスク')}</strong>
                  <span class="home-workspace-notice-meta">${esc(buildTaskMetaLine(task))}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : '<p class="home-workspace-empty">進行中のタスクはありません。</p>'}
      </article>
      <aside class="home-workspace-card home-workspace-card--aside">
        <div class="home-workspace-card-head">
          <div>
            <p class="home-workspace-card-kicker">操作</p>
            <h4 class="home-workspace-card-title">すぐ始める</h4>
          </div>
        </div>
        ${renderBulletList(target.bullets)}
        <div class="home-workspace-side-actions">
          ${renderActionButton(target.actions[0], true)}
        </div>
        ${target.actions[1] ? `
          <div class="home-workspace-side-actions">
            ${renderActionButton(target.actions[1], false)}
          </div>
        ` : ''}
        <p class="home-workspace-side-note">
          ${embedAvailable ? '下のエリアにタスク管理の実ビューを展開しています。' : '埋め込み API が未接続のため、この画面では要約表示を出しています。'}
        </p>
      </aside>
    </div>
    <div class="home-workspace-embed" id="home-task-embed" data-home-embed="task">
      ${embedAvailable ? '' : fallbackContent}
    </div>
  `;
}

function renderNoticeStageContent(target) {
  const stats = buildNoticeStats();

  return `
    <div class="home-workspace-grid home-workspace-top-grid">
      <article class="home-workspace-card home-workspace-card--main">
        <div class="home-workspace-card-head">
          <div>
            <p class="home-workspace-card-kicker">通知トレイ</p>
            <h4 class="home-workspace-card-title">未読と確認待ちをここで把握</h4>
          </div>
          <span class="home-workspace-card-pill">${esc(target.badge || target.title)}</span>
        </div>
        <div class="home-workspace-notice-summary">
          <div class="home-workspace-notice-stat">
            <span>未読</span>
            <strong>${esc(`${stats.unreadCount}件`)}</strong>
          </div>
          <div class="home-workspace-notice-stat">
            <span>確認待ち</span>
            <strong>${esc(`${stats.pendingAckCount}件`)}</strong>
          </div>
        </div>
        ${stats.notices.length ? `
          <div class="home-workspace-notice-preview">
            <div class="home-workspace-notice-list">
              ${stats.notices.slice(0, 4).map(notice => `
                <div class="home-workspace-notice-item">
                  <strong class="home-workspace-notice-title">${esc(notice.title || 'お知らせ')}</strong>
                  <span class="home-workspace-notice-meta">${esc(buildNoticeMetaLine(notice))}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : '<p class="home-workspace-empty">表示できるお知らせはありません。</p>'}
      </article>
      <aside class="home-workspace-card home-workspace-card--aside">
        <div class="home-workspace-card-head">
          <div>
            <p class="home-workspace-card-kicker">次の操作</p>
            <h4 class="home-workspace-card-title">通知の流れ</h4>
          </div>
        </div>
        ${renderBulletList(target.bullets)}
        ${renderActionRow(target.actions)}
      </aside>
    </div>
  `;
}

function renderRequestStageContent(target) {
  const receivedRequests = Array.isArray(state.receivedRequests) ? state.receivedRequests : [];
  const sentRequests = Array.isArray(state.sentRequests) ? state.sentRequests : [];
  const recentRequests = [...receivedRequests, ...sentRequests]
    .sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt))
    .slice(0, 4);

  return `
    <div class="home-workspace-grid home-workspace-top-grid">
      <article class="home-workspace-card home-workspace-card--main">
        <div class="home-workspace-card-head">
          <div>
            <p class="home-workspace-card-kicker">依頼ボード</p>
            <h4 class="home-workspace-card-title">受信と送信の流れを一画面で確認</h4>
          </div>
          <span class="home-workspace-card-pill">${esc(target.badge || target.title)}</span>
        </div>
        ${renderMetricGrid(target.metrics)}
        ${recentRequests.length ? `
          <div class="home-workspace-notice-preview">
            <div class="home-workspace-notice-list">
              ${recentRequests.map(request => `
                <div class="home-workspace-notice-item">
                  <strong class="home-workspace-notice-title">${esc(request.title || '依頼')}</strong>
                  <span class="home-workspace-notice-meta">${esc(buildRequestMetaLine(request))}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : '<p class="home-workspace-empty">進行中の依頼はありません。</p>'}
      </article>
      <aside class="home-workspace-card home-workspace-card--aside">
        <div class="home-workspace-card-head">
          <div>
            <p class="home-workspace-card-kicker">進め方</p>
            <h4 class="home-workspace-card-title">依頼からタスク化へ</h4>
          </div>
        </div>
        ${renderBulletList(target.bullets)}
        ${renderActionRow(target.actions)}
      </aside>
    </div>
  `;
}

function renderCalendarStageContent(target) {
  const attendance = buildAttendanceSnapshot();

  return `
    <div class="home-workspace-grid home-workspace-top-grid">
      <article class="home-workspace-card home-workspace-card--main">
        <div class="home-workspace-card-head">
          <div>
            <p class="home-workspace-card-kicker">今日の勤怠</p>
            <h4 class="home-workspace-card-title">当日の入力状況を確認</h4>
          </div>
          <span class="home-workspace-card-pill">${esc(attendance.value)}</span>
        </div>
        ${renderMetricGrid(target.metrics)}
        <div class="home-workspace-notice-preview">
          <div class="home-workspace-notice-list">
            <div class="home-workspace-notice-item">
              <strong class="home-workspace-notice-title">入力メモ</strong>
              <span class="home-workspace-notice-meta">${esc(attendance.noteLabel || '未入力')}</span>
            </div>
            <div class="home-workspace-notice-item">
              <strong class="home-workspace-notice-title">対象月</strong>
              <span class="home-workspace-notice-meta">${esc(attendance.monthLabel)}</span>
            </div>
          </div>
        </div>
      </article>
      <aside class="home-workspace-card home-workspace-card--aside">
        <div class="home-workspace-card-head">
          <div>
            <p class="home-workspace-card-kicker">操作</p>
            <h4 class="home-workspace-card-title">今日の記録を開く</h4>
          </div>
        </div>
        ${renderBulletList(target.bullets)}
        ${renderActionRow(target.actions)}
      </aside>
    </div>
  `;
}

function renderFavoritesStageContent(target) {
  const count = Array.isArray(state.personalFavorites) ? state.personalFavorites.length : 0;
  const favoritesLabel = state.favoritesOnlyMode ? 'お気に入り表示に固定中です。' : '必要なカードだけに絞り込めます。';

  return `
    <div class="home-workspace-grid home-workspace-top-grid">
      <article class="home-workspace-card home-workspace-card--main">
        <div class="home-workspace-card-head">
          <div>
            <p class="home-workspace-card-kicker">ショートカット</p>
            <h4 class="home-workspace-card-title">よく使うカードをすぐ開く</h4>
          </div>
          <span class="home-workspace-card-pill">${esc(`${count}件`)}</span>
        </div>
        ${renderMetricGrid(target.metrics)}
        <p class="home-workspace-copy">${esc(favoritesLabel)}</p>
      </article>
      <aside class="home-workspace-card home-workspace-card--aside">
        <div class="home-workspace-card-head">
          <div>
            <p class="home-workspace-card-kicker">表示</p>
            <h4 class="home-workspace-card-title">お気に入りビュー</h4>
          </div>
        </div>
        ${renderBulletList(target.bullets)}
        ${renderActionRow(target.actions)}
      </aside>
    </div>
  `;
}

function hydrateStageContent(targetKey, stageBodyId, target) {
  if (targetKey !== 'task' || typeof deps.renderEmbeddedTaskWorkspace !== 'function') {
    return;
  }

  const mountPoint = document.getElementById('home-task-embed');
  if (!mountPoint) return;

  try {
    deps.renderEmbeddedTaskWorkspace(mountPoint, {
      targetKey,
      stageBodyId,
      title: target.detailTitle,
      badge: target.badge || target.title,
    });
  } catch (error) {
    console.error('task workspace embed failed:', error);
    mountPoint.innerHTML = renderDefaultStageContent(target);
  }
}

function buildTaskMetaLine(task) {
  return [
    TASK_STATUS_LABEL[task.status]?.text || task.status || '',
    task.assignedBy ? `依頼: ${task.assignedBy}` : '',
    task.assignedTo ? `担当: ${task.assignedTo}` : '',
    formatDueLabel(task.dueDate),
    task.projectKey ? `物件No ${task.projectKey}` : '',
  ].filter(Boolean).join(' / ');
}

function buildNoticeMetaLine(notice) {
  const acknowledgedBy = Array.isArray(notice.acknowledgedBy) ? notice.acknowledgedBy : [];
  return [
    notice.requireAcknowledgement ? '確認必須' : '通常',
    notice.priority === 'urgent' ? '重要' : '通常優先度',
    acknowledgedBy.length > 0 ? `${acknowledgedBy.length}人確認` : '',
    formatNoticeDate(notice.createdAt),
  ].filter(Boolean).join(' / ');
}

function buildRequestMetaLine(request) {
  return [
    request.status || '',
    request.fromDept ? `元: ${request.fromDept}` : '',
    request.toDept ? `先: ${request.toDept}` : '',
    request.projectKey ? `物件No ${request.projectKey}` : '',
  ].filter(Boolean).join(' / ');
}

function renderActionButton(action, primary = false) {
  if (!action?.action) return '';
  const variant = action.variant || (primary ? 'primary' : 'secondary');
  return `
    <button
      type="button"
      class="home-workspace-action home-workspace-action--${variant}"
      data-home-action="${esc(action.action)}"
    >
      ${action.icon ? `<i class="${esc(action.icon)}" aria-hidden="true"></i>` : ''}
      <span>${esc(action.label || '開く')}</span>
    </button>
  `;
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

function syncSidebarSelection() {
  const activeButtonId = state.homeWorkspaceActiveButtonId || '';
  document.querySelectorAll('[data-home-target]').forEach(button => {
    const isActive = button.id === activeButtonId;
    button.classList.toggle('home-nav-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function normalizeTarget(target) {
  return Object.prototype.hasOwnProperty.call(TARGET_META, target) ? target : DEFAULT_TARGET;
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

function buildTaskSnapshot() {
  const activeTasks = collectActiveTasks();
  const pendingCount = activeTasks.filter(task => task.status === 'pending').length;
  const acceptedCount = activeTasks.filter(task => task.status === 'accepted').length;
  const overdueCount = activeTasks.filter(task => task.dueDate && task.dueDate < buildDateKey(new Date())).length;

  return {
    countLabel: `${activeTasks.length}件`,
    receivedLabel: `${pendingCount}件`,
    sentLabel: `${acceptedCount}件`,
    sharedLabel: `${Array.isArray(state.sharedTasks) ? state.sharedTasks.length : 0}件`,
    overdueLabel: `${overdueCount}件`,
  };
}

function buildRequestSnapshot() {
  const receivedRequests = Array.isArray(state.receivedRequests) ? state.receivedRequests : [];
  const sentRequests = Array.isArray(state.sentRequests) ? state.sentRequests : [];
  const openReceived = receivedRequests.filter(req => !req.archived && (req.status === 'submitted' || req.status === 'reviewing'));

  return {
    countLabel: `${openReceived.length + sentRequests.length}件`,
    receivedLabel: `${openReceived.length}件`,
    sentLabel: `${sentRequests.length}件`,
    openLabel: `${openReceived.length}件`,
  };
}

function buildAttendanceSnapshot() {
  const todayKey = buildDateKey(new Date());
  const attendance = state.todayAttendanceDate === todayKey
    ? (state.todayAttendance || null)
    : (state.attendanceData?.[todayKey] || null);
  const monthLabel = todayKey.slice(0, 7);

  if (!attendance) {
    return {
      value: '未入力',
      noteLabel: '今日の勤怠は未入力',
      monthLabel,
    };
  }

  const label = getAttendanceLabel(attendance);
  return {
    value: label,
    noteLabel: attendance.note || 'メモなし',
    monthLabel,
  };
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
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
}
