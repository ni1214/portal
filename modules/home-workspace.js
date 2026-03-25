import { state, TASK_STATUS_LABEL, USER_ROLE_LABELS } from './state.js';
import { esc, formatFileSize } from './utils.js';

export let deps = {};

const DEFAULT_TARGET = 'notice';

const TARGET_LABELS = {
  notice: '通知',
  calendar: '勤怠・カレンダー',
  task: 'タスク管理',
  request: '部門間依頼',
  order: '鋼材発注',
  email: 'メールアシスタント',
  chat: 'チャット',
  file: 'ファイル転送',
  property: '物件Noまとめ',
  favorites: 'お気に入り',
  settings: '表示設定',
  help: '使い方ガイド',
  diagnostics: '転送診断',
  invite: '招待コード',
};

const TARGET_TONES = {
  notice: 'danger',
  calendar: 'info',
  task: 'violet',
  request: 'cyan',
  order: 'orange',
  email: 'success',
  chat: 'sky',
  file: 'green',
  property: 'neutral',
  favorites: 'warning',
  settings: 'neutral',
  help: 'info',
  diagnostics: 'purple',
  invite: 'success',
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
  const notice = buildNoticeSnapshot();

  host.innerHTML = `
    <section class="home-workspace-shell" data-tone="${esc(target.tone)}" aria-live="polite" role="region" aria-labelledby="home-workspace-title">
      <header class="home-workspace-header">
        <div class="home-workspace-header-copy">
          <p class="home-workspace-kicker">サイドバー連動</p>
          <h2 class="home-workspace-title" id="home-workspace-title">${esc(target.title)}</h2>
          <p class="home-workspace-copy">${esc(target.copy)}</p>
        </div>
        <div class="home-workspace-badge">
          <span class="home-workspace-badge-label">現在の項目</span>
          <strong class="home-workspace-badge-value">${esc(target.badge || target.title)}</strong>
        </div>
      </header>

      <div class="home-workspace-grid">
        <article class="home-workspace-card home-workspace-card--main">
          <div class="home-workspace-card-head">
            <div>
              <p class="home-workspace-card-kicker">${esc(target.kicker || '入力エリア')}</p>
              <h3 class="home-workspace-card-title">${esc(target.detailTitle || target.title)}</h3>
            </div>
            <span class="home-workspace-card-pill">${esc(target.value || '開く')}</span>
          </div>

          ${renderMetricGrid(target.metrics)}
          ${renderBulletList(target.bullets)}
          ${renderActionRow(target.actions)}
        </article>

        <aside class="home-workspace-card home-workspace-card--aside">
          <div class="home-workspace-card-head">
            <div>
              <p class="home-workspace-card-kicker">通知</p>
              <h3 class="home-workspace-card-title">確認待ちと未読</h3>
            </div>
            <span class="home-workspace-card-pill">${esc(notice.totalLabel)}</span>
          </div>

          <div class="home-workspace-notice-summary">
            <div class="home-workspace-notice-stat">
              <span>未読</span>
              <strong>${esc(notice.unreadLabel)}</strong>
            </div>
            <div class="home-workspace-notice-stat">
              <span>確認待ち</span>
              <strong>${esc(notice.pendingLabel)}</strong>
            </div>
          </div>

          <div class="home-workspace-notice-preview">
            ${renderNoticePreview(notice.items)}
          </div>

          <div class="home-workspace-side-actions">
            ${renderActionButton({
              label: '通知ボードへ',
              action: 'focus-notice',
              variant: 'secondary',
            })}
          </div>

          <p class="home-workspace-side-note">左のサイドバーを押すと、この上段が切り替わります。</p>
        </aside>
      </div>
    </section>
  `;

  syncSidebarSelection();
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
  const notice = buildNoticeSnapshot();
  return {
    title: '通知',
    detailTitle: '通知を確認する',
    copy: '通知だけを残したホームです。未読と確認待ちをここで素早く確認できます。',
    kicker: 'ホームの中心',
    tone: TARGET_TONES.notice,
    value: notice.totalLabel,
    badge: notice.totalLabel,
    metrics: [
      { label: '未読', value: notice.unreadLabel },
      { label: '確認待ち', value: notice.pendingLabel },
      { label: '最新', value: notice.latestLabel },
    ],
    bullets: [
      '重要なお知らせを優先表示',
      '確認ボードへすぐ移動',
      '必要なら新規通知の作成にも進める',
    ],
    actions: [
      { label: '通知ボードへ移動', action: 'focus-notice', variant: 'primary' },
      { label: 'お知らせを投稿', action: 'open-notice-modal', variant: 'secondary', show: () => state.isEditMode === true },
    ],
  };
}

function buildCalendarConfig() {
  const snapshot = buildAttendanceSnapshot();
  return {
    title: '勤怠・カレンダー',
    detailTitle: '今日の勤怠を開く',
    copy: '今日の勤怠入力へ進みます。カレンダーを見ながら、そのまま保存できます。',
    kicker: '日々の入力',
    tone: TARGET_TONES.calendar,
    value: snapshot.value,
    badge: snapshot.badge,
    metrics: [
      { label: '今日の状態', value: snapshot.value },
      { label: 'メモ', value: snapshot.noteLabel },
      { label: '年度有給', value: snapshot.fiscalLabel },
    ],
    bullets: [
      '個人勤怠',
      '勤務内容表',
      '共有カレンダー',
    ],
    actions: [
      { label: '今日の勤怠を開く', action: 'open-today-attendance', variant: 'primary' },
      { label: 'カレンダーを開く', action: 'open-calendar-modal', variant: 'secondary' },
    ],
  };
}

function buildTaskConfig() {
  const snapshot = buildTaskSnapshot();
  return {
    title: 'タスク管理',
    detailTitle: '受信・依頼・共有タスク',
    copy: '受け取ったタスクや依頼中のタスクをここから開きます。新規依頼もすぐ起票できます。',
    kicker: '作業の起点',
    tone: TARGET_TONES.task,
    value: snapshot.countLabel,
    badge: snapshot.countLabel,
    metrics: [
      { label: '受信', value: snapshot.receivedLabel },
      { label: '依頼', value: snapshot.sentLabel },
      { label: '共有', value: snapshot.sharedLabel },
    ],
    bullets: [
      '新規依頼',
      '受け取ったタスク',
      '共有されたタスク',
    ],
    actions: [
      { label: 'タスク管理を開く', action: 'open-task-modal', variant: 'primary' },
      { label: '新規依頼を作成', action: 'open-task-new', variant: 'secondary' },
    ],
  };
}

function buildRequestConfig() {
  const snapshot = buildRequestSnapshot();
  return {
    title: '部門間依頼',
    detailTitle: '依頼と目安箱',
    copy: '部門間依頼と目安箱をまとめて開きます。新規投稿もここから始められます。',
    kicker: '部門連携',
    tone: TARGET_TONES.request,
    value: snapshot.countLabel,
    badge: snapshot.countLabel,
    metrics: [
      { label: '受信', value: snapshot.receivedLabel },
      { label: '送信', value: snapshot.sentLabel },
      { label: '下書き', value: snapshot.draftLabel },
    ],
    bullets: [
      '受け取った依頼',
      '自分の依頼',
      '新規投稿',
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
    copy: '鋼材発注の入力画面と履歴を切り替えます。設定画面にもすぐ進めます。',
    kicker: '発注の入口',
    tone: TARGET_TONES.order,
    value: '入力',
    badge: '発注',
    metrics: [
      { label: '新規', value: '作成' },
      { label: '履歴', value: '確認' },
      { label: '管理', value: '設定' },
    ],
    bullets: [
      '発注フォーム',
      '発注履歴',
      '管理設定',
    ],
    actions: [
      { label: '発注を開く', action: 'open-order-modal', variant: 'primary' },
      { label: '履歴を見る', action: 'open-order-history', variant: 'secondary' },
    ],
  };
}

function buildEmailConfig() {
  const snapshot = buildEmailSnapshot();
  return {
    title: 'メールアシスタント',
    detailTitle: 'メール作成とプロフィール',
    copy: 'メール作成専用です。所属部署や署名はプロフィール設定から編集できます。',
    kicker: 'メール導線',
    tone: TARGET_TONES.email,
    value: snapshot.departmentLabel,
    badge: snapshot.roleLabel,
    metrics: [
      { label: '所属', value: snapshot.departmentLabel },
      { label: '役割', value: snapshot.roleLabel },
      { label: '署名', value: snapshot.signatureLabel },
    ],
    bullets: [
      '新規メール',
      '返信メール',
      'プロフィール設定',
    ],
    actions: [
      { label: 'メールアシスタントを開く', action: 'open-email-modal', variant: 'primary' },
      { label: 'プロフィール設定', action: 'open-profile-modal', variant: 'secondary' },
    ],
  };
}

function buildChatConfig() {
  const snapshot = buildChatSnapshot();
  return {
    title: 'チャット',
    detailTitle: 'DM とグループ',
    copy: 'チャットパネルを開いて、DM とグループを切り替えます。新規 DM の作成もここから進めます。',
    kicker: '会話の入口',
    tone: TARGET_TONES.chat,
    value: snapshot.countLabel,
    badge: snapshot.countLabel,
    metrics: [
      { label: 'DM', value: snapshot.dmLabel },
      { label: 'グループ', value: snapshot.groupLabel },
      { label: '状態', value: snapshot.statusLabel },
    ],
    bullets: [
      'DM ルーム',
      'グループルーム',
      '新規ルーム作成',
    ],
    actions: [
      { label: 'チャットを開く', action: 'open-chat-panel', variant: 'primary' },
      { label: '新規 DM を作成', action: 'open-new-dm', variant: 'secondary' },
    ],
  };
}

function buildFileConfig() {
  const snapshot = buildFileSnapshot();
  return {
    title: 'ファイル転送',
    detailTitle: 'ファイル送信と Drive 共有',
    copy: 'ファイル転送パネルを開いて、送信中・受信中の流れをひと目で追えます。',
    kicker: '転送の入口',
    tone: TARGET_TONES.file,
    value: snapshot.countLabel,
    badge: snapshot.countLabel,
    metrics: [
      { label: 'P2P 受信', value: snapshot.p2pIncomingLabel },
      { label: 'Drive 受信', value: snapshot.driveIncomingLabel },
      { label: '送信', value: snapshot.outgoingLabel },
    ],
    bullets: [
      'P2P 送受信',
      'Drive 共有',
      'ファイル送信',
    ],
    actions: [
      { label: 'ファイル転送を開く', action: 'open-file-panel', variant: 'primary' },
      { label: '送信を開始', action: 'open-file-send', variant: 'secondary' },
    ],
  };
}

function buildPropertyConfig() {
  const snapshot = buildPropertySnapshot();
  return {
    title: '物件Noまとめ',
    detailTitle: '物件No の横断検索',
    copy: '物件Noを軸に、依頼・タスク・発注・勤怠を横断検索します。',
    kicker: '横串の入口',
    tone: TARGET_TONES.property,
    value: snapshot.valueLabel,
    badge: snapshot.valueLabel,
    metrics: [
      { label: '依頼', value: snapshot.requestLabel },
      { label: 'タスク', value: snapshot.taskLabel },
      { label: '発注', value: snapshot.orderLabel },
    ],
    bullets: [
      '依頼の関連付け',
      'タスクの横断確認',
      '発注・勤怠の検索',
    ],
    actions: [
      { label: '物件Noまとめを開く', action: 'open-property-summary', variant: 'primary' },
    ],
  };
}

function buildFavoritesConfig() {
  const snapshot = buildFavoritesSnapshot();
  return {
    title: 'お気に入り',
    detailTitle: 'お気に入りを切り替える',
    copy: 'お気に入りだけを表示して、よく使うカードへすぐ戻れます。',
    kicker: 'よく使う導線',
    tone: TARGET_TONES.favorites,
    value: snapshot.countLabel,
    badge: snapshot.modeLabel,
    metrics: [
      { label: '登録数', value: snapshot.countLabel },
      { label: '表示', value: snapshot.modeLabel },
      { label: '状態', value: snapshot.stateLabel },
    ],
    bullets: [
      'お気に入りのみ表示',
      '通常表示へ戻す切替',
      'よく使うカードの整理',
    ],
    actions: [
      { label: 'お気に入り表示を切り替える', action: 'toggle-favorites', variant: 'primary' },
    ],
  };
}

function buildSettingsConfig() {
  const snapshot = buildSettingsSnapshot();
  return {
    title: '表示設定',
    detailTitle: 'テーマとフォント',
    copy: 'テーマ、フォントサイズ、表示の好みをまとめて確認できます。',
    kicker: '見た目の設定',
    tone: TARGET_TONES.settings,
    value: snapshot.themeLabel,
    badge: snapshot.fontLabel,
    metrics: [
      { label: 'テーマ', value: snapshot.themeLabel },
      { label: 'フォント', value: snapshot.fontLabel },
      { label: '編集モード', value: snapshot.editModeLabel },
    ],
    bullets: [
      'テーマ切替',
      'フォントサイズ',
      '表示設定',
    ],
    actions: [
      { label: '設定を開く', action: 'open-settings', variant: 'primary' },
      { label: 'ガイドを見る', action: 'open-help', variant: 'secondary' },
    ],
  };
}

function buildHelpConfig() {
  const snapshot = buildHelpSnapshot();
  return {
    title: '使い方ガイド',
    detailTitle: 'ホームの使い方',
    copy: 'このホームでは、左のサイドバーで機能を選び、上段のワークスペースから各入力画面へ進みます。',
    kicker: '初見向け',
    tone: TARGET_TONES.help,
    value: snapshot.valueLabel,
    badge: snapshot.valueLabel,
    metrics: [
      { label: 'ホーム', value: snapshot.homeLabel },
      { label: '通知', value: snapshot.noticeLabel },
      { label: '導線', value: snapshot.routeLabel },
    ],
    bullets: [
      'サイドバーで切り替え',
      'ワークスペースから入力画面へ',
      '通知は常時確認',
    ],
    actions: [
      { label: 'ガイドを開く', action: 'open-guide', variant: 'primary' },
      { label: '通知へ移動', action: 'focus-notice', variant: 'secondary' },
    ],
  };
}

function buildDiagnosticsConfig() {
  const snapshot = buildDiagnosticsSnapshot();
  return {
    title: '転送診断',
    detailTitle: '読み込み量の確認',
    copy: 'どの画面がどれだけ読んだかを確認して、Supabase Free の転送量を守ります。',
    kicker: '軽量化の確認',
    tone: TARGET_TONES.diagnostics,
    value: snapshot.transferLabel,
    badge: snapshot.transferLabel,
    metrics: [
      { label: '推定転送', value: snapshot.transferLabel },
      { label: 'API', value: snapshot.apiLabel },
      { label: 'Listener', value: snapshot.listenerLabel },
    ],
    bullets: [
      '重い取得の確認',
      '月 5GB 対策',
      'どの画面が重いかの把握',
    ],
    actions: [
      { label: '診断を開く', action: 'open-diagnostics', variant: 'primary' },
      { label: 'ガイドを見る', action: 'open-guide', variant: 'secondary' },
    ],
  };
}

function buildInviteConfig() {
  const snapshot = buildInviteSnapshot();
  return {
    title: '招待コード',
    detailTitle: '招待コードの確認',
    copy: '招待コードの入力と確認をまとめて開けます。必要に応じて再表示にも進めます。',
    kicker: 'アクセス管理',
    tone: TARGET_TONES.invite,
    value: snapshot.statusLabel,
    badge: snapshot.requiredLabel,
    metrics: [
      { label: '必要', value: snapshot.requiredLabel },
      { label: '確認', value: snapshot.verifiedLabel },
      { label: '管理', value: snapshot.adminLabel },
    ],
    bullets: [
      '招待コードの入力',
      '現在の設定確認',
      '管理画面からの再表示',
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
          <strong class="home-workspace-metric-value">${esc(metric.value || '-')}</strong>
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

function renderNoticePreview(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="home-workspace-empty">表示中のお知らせはありません。</div>`;
  }

  return `
    <div class="home-workspace-notice-list">
      ${items.map(item => `
        <div class="home-workspace-notice-item">
          <strong class="home-workspace-notice-title">${esc(item.title)}</strong>
          <span class="home-workspace-notice-meta">${esc(item.meta || '')}</span>
        </div>
      `).join('')}
    </div>
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
      void deps.openOrderHistoryModal?.();
      return;
    case 'open-email-modal':
      deps.openEmailModal?.();
      return;
    case 'open-profile-modal':
      deps.openProfileModal?.();
      return;
    case 'open-chat-panel':
      void deps.openChatPanel?.();
      return;
    case 'open-new-dm':
      void deps.openNewDmModal?.();
      return;
    case 'open-file-panel':
      deps.openFileTransferPanel?.();
      return;
    case 'open-file-send':
      void deps.openFtSendModal?.();
      return;
    case 'open-property-summary':
      void deps.openPropertySummaryModal?.();
      return;
    case 'toggle-favorites':
      deps.toggleFavoritesOnly?.();
      setHomeWorkspaceTarget(state.favoritesOnlyMode ? 'favorites' : 'notice', state.favoritesOnlyMode ? 'btn-favorites-only' : 'sidebar-home-btn');
      return;
    case 'open-settings':
      deps.openSettingsPanel?.();
      return;
    case 'open-guide':
      deps.openGuideModal?.();
      return;
    case 'open-diagnostics':
      deps.openReadDiagnosticsModal?.();
      return;
    case 'open-invite':
      void deps.openInviteCodeModal?.();
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
  return Object.prototype.hasOwnProperty.call(TARGET_LABELS, target) ? target : DEFAULT_TARGET;
}

function buildNoticeSnapshot() {
  const notices = Array.isArray(state.visibleNotices) ? state.visibleNotices : [];
  const currentUsername = state.currentUsername || '';
  const readIds = state.readNoticeIds instanceof Set ? state.readNoticeIds : new Set();

  const pendingAck = notices.filter(notice => {
    if (!notice?.requireAcknowledgement || !currentUsername) return false;
    const acknowledgedBy = Array.isArray(notice.acknowledgedBy) ? notice.acknowledgedBy : [];
    return !acknowledgedBy.includes(currentUsername);
  });

  const unread = notices.filter(notice => !notice?.requireAcknowledgement && !readIds.has(notice.id));
  const latest = notices[0] || null;

  return {
    total: pendingAck.length + unread.length,
    totalLabel: `${pendingAck.length + unread.length}件`,
    unreadLabel: `${unread.length}件`,
    pendingLabel: `${pendingAck.length}件`,
    latestLabel: latest ? (latest.title || '最新') : 'なし',
    items: notices.slice(0, 3).map(notice => ({
      title: notice.title || 'お知らせ',
      meta: [
        notice.requireAcknowledgement ? '確認待ち' : (notice.priority === 'urgent' ? '緊急' : '通常'),
        formatNoticeDate(notice.createdAt),
      ].filter(Boolean).join(' / '),
    })),
  };
}

function buildAttendanceSnapshot() {
  const todayKey = buildDateKey(new Date());
  const attendance = state.todayAttendanceDate === todayKey
    ? (state.todayAttendance || null)
    : (state.attendanceData?.[todayKey] || null);

  if (!attendance) {
    return {
      value: '未入力',
      badge: state.currentUsername ? '今日' : '未設定',
      noteLabel: '今日の勤怠を入力',
      fiscalLabel: `${Number(state.fiscalYearPaidLeave || 0)}日`,
    };
  }

  const workSiteHours = Object.values(attendance.workSiteHours || {})
    .map(hours => Number(hours))
    .filter(hours => Number.isFinite(hours) && hours > 0);
  const totalHours = workSiteHours.reduce((sum, hours) => sum + hours, 0);
  const typeLabel = attendance.type && attendance.type !== 'normal'
    ? attendance.type
    : (attendance.hayade ? `早出 ${attendance.hayade}` : (attendance.zangyo ? `残業 ${attendance.zangyo}` : (workSiteHours.length > 0 ? `${workSiteHours.length}現場` : '通常')));

  return {
    value: typeLabel,
    badge: state.currentUsername ? '今日' : '未設定',
    noteLabel: attendance.note || (workSiteHours.length > 0 ? `${formatHours(totalHours)}h` : '入力済み'),
    fiscalLabel: `${Number(state.fiscalYearPaidLeave || 0)}日`,
  };
}

function buildTaskSnapshot() {
  const activeTasks = collectActiveTasks();
  const pendingCount = activeTasks.filter(task => task.status === 'pending').length;
  const acceptedCount = activeTasks.filter(task => task.status === 'accepted').length;
  const overdueCount = activeTasks.filter(task => task.dueDate && task.dueDate < buildDateKey(new Date())).length;

  return {
    countLabel: `${activeTasks.length}件`,
    receivedLabel: `${pendingCount}件`,
    sentLabel: `${Math.max(0, acceptedCount)}件`,
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
    draftLabel: `${Math.max(0, sentRequests.length - openReceived.length)}件`,
  };
}

function buildEmailSnapshot() {
  const profile = state.userEmailProfile || {};
  return {
    departmentLabel: profile.department || '未設定',
    roleLabel: USER_ROLE_LABELS[profile.roleType] || '未設定',
    signatureLabel: profile.signatureTemplate ? '設定済み' : '未設定',
  };
}

function buildChatSnapshot() {
  const dmCount = Array.isArray(state.dmRooms) ? state.dmRooms.length : 0;
  const groupCount = Array.isArray(state.groupRooms) ? state.groupRooms.length : 0;
  return {
    countLabel: `${dmCount + groupCount}件`,
    dmLabel: `${dmCount}件`,
    groupLabel: `${groupCount}件`,
    statusLabel: state.chatPanelOpen ? '開いています' : '未表示',
  };
}

function buildFileSnapshot() {
  const p2pIncoming = Array.isArray(state._ftIncoming) ? state._ftIncoming.length : 0;
  const p2pOutgoing = Array.isArray(state._ftOutgoing) ? state._ftOutgoing.length : 0;
  const driveIncoming = Array.isArray(state._driveIncoming) ? state._driveIncoming.length : 0;
  const driveOutgoing = Array.isArray(state._driveOutgoing) ? state._driveOutgoing.length : 0;
  return {
    countLabel: `${p2pIncoming + p2pOutgoing + driveIncoming + driveOutgoing}件`,
    p2pIncomingLabel: `${p2pIncoming}件`,
    driveIncomingLabel: `${driveIncoming}件`,
    outgoingLabel: `${p2pOutgoing + driveOutgoing}件`,
  };
}

function buildPropertySnapshot() {
  const query = (state.propertySummaryQuery || '').trim();
  const resultCount = state.propertySummaryResults
    ? Object.keys(state.propertySummaryResults).length
    : 0;
  return {
    valueLabel: query ? `検索中: ${query}` : '横断検索',
    requestLabel: `${Array.isArray(state.receivedRequests) ? state.receivedRequests.length : 0}件`,
    taskLabel: `${Array.isArray(state.receivedTasks) ? state.receivedTasks.length : 0}件`,
    orderLabel: `${resultCount}件`,
  };
}

function buildFavoritesSnapshot() {
  const count = Array.isArray(state.personalFavorites) ? state.personalFavorites.length : 0;
  return {
    countLabel: `${count}件`,
    modeLabel: state.favoritesOnlyMode ? '表示中' : '通常',
    stateLabel: count > 0 ? '登録済み' : '空',
  };
}

function buildSettingsSnapshot() {
  const theme = localStorage.getItem('portal-theme') || 'dark';
  const fontSize = localStorage.getItem('portal-font-size') || 'font-md';
  return {
    themeLabel: theme === 'light' ? 'ライト' : 'ダーク',
    fontLabel: fontSize.replace('font-', ''),
    editModeLabel: state.isEditMode ? '常時ON' : 'OFF',
  };
}

function buildHelpSnapshot() {
  return {
    valueLabel: '案内',
    homeLabel: 'ワークスペース',
    noticeLabel: '通知',
    routeLabel: '入力画面',
  };
}

function buildDiagnosticsSnapshot() {
  const diag = state.readDiagnostics || {};
  return {
    transferLabel: formatFileSize(diag.estimatedTransferBytes || 0),
    apiLabel: `${Number(diag.apiCalls || 0)}回`,
    listenerLabel: `${Number(diag.listenerStarts || 0)}回`,
  };
}

function buildInviteSnapshot() {
  return {
    requiredLabel: state.inviteCodeRequired ? '必要' : '不要',
    verifiedLabel: state.inviteCodeVerified ? '確認済み' : '未確認',
    adminLabel: state.adminInviteConfigured ? '管理あり' : '未設定',
    statusLabel: state.inviteCodeVerified ? '認証済み' : '未確認',
  };
}

function collectActiveTasks() {
  const buckets = [
    ...(Array.isArray(state.receivedTasks) ? state.receivedTasks : []),
    ...(Array.isArray(state.sentTasks) ? state.sentTasks : []),
    ...(Array.isArray(state.sharedTasks) ? state.sharedTasks : []),
  ];
  const seen = new Set();
  return buckets.filter(task => {
    if (!task || !['pending', 'accepted'].includes(task.status)) return false;
    const key = task.id || `${task.title || ''}-${task.assignedBy || ''}-${task.assignedTo || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderNoticeItem(item) {
  return `
    <div class="home-workspace-notice-item">
      <strong class="home-workspace-notice-title">${esc(item.title || 'お知らせ')}</strong>
      <span class="home-workspace-notice-meta">${esc(item.meta || '')}</span>
    </div>
  `;
}

function formatNoticeDate(createdAt) {
  if (!createdAt) return '';
  const date = createdAt?.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function formatHours(hours) {
  const rounded = Math.round(Number(hours || 0) * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`.replace(/\.0$/, '');
}

function buildDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
