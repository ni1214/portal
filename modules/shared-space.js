import { state } from './state.js';
import { esc } from './utils.js';

export let deps = {};

export function initSharedSpace(d = {}) {
  deps = { ...deps, ...d };
  bindSharedSpaceEvents();
  renderSharedHome();
  renderSharedLinksBrowser();
}

export function renderSharedHome() {
  const host = document.getElementById('shared-home-panel');
  if (!host) return;

  const noticeSummary = getNoticeSummary();
  const requestSummary = getRequestSummary();
  const taskSummary = getTaskSummary();
  const publicCategories = getPublicCategories();
  const linksSummary = getLinksSummary(publicCategories);
  const quickLinks = getHomeQuickLinks(publicCategories, linksSummary, requestSummary, taskSummary);

  host.innerHTML = `
    <section class="shared-home-shell shared-home-shell--clean">
      <header class="shared-home-head">
        <div class="shared-home-head-copy">
          <p class="shared-home-kicker">共有スペース</p>
          <h2 class="shared-home-title">共有ワークスペース</h2>
          <p class="shared-home-copy">${esc(buildSharedWorkspaceCopy(noticeSummary, requestSummary, taskSummary, linksSummary))}</p>
        </div>
        <div class="shared-home-metrics">
          ${buildSharedWorkspaceMetrics(noticeSummary, requestSummary, taskSummary, linksSummary).map(metric => `
            <div class="shared-home-metric">
              <span class="shared-home-metric-label">${esc(metric.label)}</span>
              <strong class="shared-home-metric-value">${esc(metric.value)}</strong>
            </div>
          `).join('')}
        </div>
      </header>

      <div class="shared-home-layout">
        <section class="shared-home-card shared-home-card--notice">
          <div class="shared-home-card-head">
            <div>
              <h3 class="shared-home-card-title">お知らせ</h3>
              <p class="shared-home-card-copy">${esc(noticeSummary.headline)}</p>
            </div>
            <button type="button" class="shared-home-inline-link" data-shared-home-action="notice">すべて見る</button>
          </div>

          <div class="shared-home-notice-list">
            ${noticeSummary.items.map(item => renderSharedNoticeItem(item)).join('')}
          </div>
        </section>

        <div class="shared-home-lower-grid">
          <section class="shared-home-card shared-home-card--actions">
            <div class="shared-home-card-head">
              <div>
                <h3 class="shared-home-card-title">クイックアクション</h3>
                <p class="shared-home-card-copy">よく使う操作へそのまま移動できます。</p>
              </div>
            </div>

            <div class="shared-home-action-grid">
              ${buildSharedActionItems(requestSummary, taskSummary).map(item => renderSharedActionItem(item)).join('')}
            </div>
          </section>

          <section class="shared-home-card shared-home-card--links">
            <div class="shared-home-card-head">
              <div>
                <h3 class="shared-home-card-title">共有リンク</h3>
                <p class="shared-home-card-copy">${esc(linksSummary.description)}</p>
              </div>
              <button type="button" class="shared-home-inline-link" data-shared-home-action="links">一覧を開く</button>
            </div>

            <div class="shared-home-link-grid">
              ${quickLinks.map(link => renderSharedQuickLink(link)).join('')}
            </div>
          </section>
        </div>
      </div>
    </section>
  `;

  host.querySelectorAll('[data-shared-home-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.sharedHomeAction || '';
      const category = button.dataset.sharedHomeCategory || '';
      if (action === 'links') {
        state.sharedLinksCategory = category || 'all';
      }
      void handleSharedHomeAction(action);
    });
  });
}

function buildSharedWorkspaceCopy(noticeSummary, requestSummary, taskSummary, linksSummary) {
  const parts = [];
  if (noticeSummary.pendingAckCount > 0) parts.push(`確認待ちのお知らせ ${noticeSummary.pendingAckCount}件`);
  if (requestSummary.activeCount > 0) parts.push(`進行中の依頼 ${requestSummary.activeCount}件`);
  if (taskSummary.count > 0) parts.push(`関連タスク ${taskSummary.count}件`);
  if (parts.length === 0) {
    return `${linksSummary.count}カテゴリの共有リンクと主要導線をここにまとめています。`;
  }
  return `${parts.join(' / ')} をすぐ確認できます。`;
}

function buildSharedWorkspaceMetrics(noticeSummary, requestSummary, taskSummary, linksSummary) {
  return [
    {
      label: 'お知らせ',
      value: noticeSummary.pendingAckCount > 0
        ? `要確認 ${noticeSummary.pendingAckCount}件`
        : (noticeSummary.unreadCount > 0 ? `未読 ${noticeSummary.unreadCount}件` : '安定'),
    },
    {
      label: '依頼',
      value: requestSummary.activeCount > 0 ? `${requestSummary.activeCount}件` : '新着なし',
    },
    {
      label: 'リンク',
      value: `${linksSummary.count}カテゴリ`,
    },
    {
      label: 'タスク',
      value: taskSummary.count > 0 ? `${taskSummary.count}件` : '落ち着いています',
    },
  ];
}

function buildSharedActionItems(requestSummary, taskSummary) {
  return [
    {
      action: 'request',
      icon: 'fa-solid fa-arrows-left-right',
      label: '部門間依頼',
      meta: requestSummary.activeCount > 0 ? `${requestSummary.activeCount}件を確認` : '新規作成',
    },
    {
      action: 'task',
      icon: 'fa-solid fa-list-check',
      label: 'タスク',
      meta: taskSummary.count > 0 ? taskSummary.primaryTitle : '一覧を開く',
    },
    {
      action: 'calendar',
      icon: 'fa-regular fa-calendar',
      label: '勤怠カレンダー',
      meta: '今日の入力を確認',
    },
    {
      action: 'email',
      icon: 'fa-solid fa-wand-magic-sparkles',
      label: 'メールAI',
      meta: '下書きを作成',
    },
    {
      action: 'order',
      icon: 'fa-solid fa-boxes-stacked',
      label: '鋼材発注',
      meta: '履歴と新規発注',
    },
    {
      action: 'property',
      icon: 'fa-solid fa-box-archive',
      label: '物件Noまとめ',
      meta: '横断して確認',
    },
  ];
}

function renderSharedNoticeItem(item) {
  return `
    <button type="button" class="shared-home-notice-item" data-shared-home-action="notice">
      <span class="shared-home-notice-date">${esc(item.date)}</span>
      <span class="shared-home-notice-main">
        <strong class="shared-home-notice-title">${esc(item.title || 'お知らせ')}</strong>
        <span class="shared-home-notice-meta">${esc(item.meta || '')}</span>
      </span>
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
    </button>
  `;
}

function renderSharedActionItem(item) {
  return `
    <button type="button" class="shared-home-action-item" data-shared-home-action="${esc(item.action)}">
      <span class="shared-home-action-icon"><i class="${item.icon}"></i></span>
      <span class="shared-home-action-main">
        <strong class="shared-home-action-label">${esc(item.label)}</strong>
        <span class="shared-home-action-meta">${esc(item.meta)}</span>
      </span>
    </button>
  `;
}

function renderSharedQuickLink(link) {
  const categoryAttr = link.category ? ` data-shared-home-category="${esc(link.category)}"` : '';
  return `
    <button
      type="button"
      class="shared-home-link-item"
      data-shared-home-action="${esc(link.action)}"${categoryAttr}
    >
      <span class="shared-home-link-icon"><i class="${link.icon}"></i></span>
      <span class="shared-home-link-main">
        <strong class="shared-home-link-label">${esc(link.label)}</strong>
        <span class="shared-home-link-meta">${esc(link.meta || '開く')}</span>
      </span>
    </button>
  `;
}

function getTaskSummary() {
  const activeTasks = collectActiveTasks();
  const acceptedTasks = activeTasks.filter(task => task.status === 'accepted');
  const pendingTasks = activeTasks.filter(task => task.status === 'pending');
  const primaryTask = acceptedTasks[0] || pendingTasks[0] || null;
  const metaTokens = [
    primaryTask?.assignedBy ? `${primaryTask.assignedBy}から` : '',
    primaryTask?.dueDate ? `期限 ${primaryTask.dueDate}` : '',
  ].filter(Boolean);

  return {
    count: activeTasks.length,
    primaryTitle: primaryTask?.title || '進行中のタスクはありません',
    meta: metaTokens.join(' / ') || '新しいタスクが入るとここに表示されます',
    description: activeTasks.length > 0
      ? `承諾待ち ${pendingTasks.length}件 / 進行中 ${acceptedTasks.length}件`
      : '落ち着いています',
    badgeText: primaryTask ? (primaryTask.status === 'pending' ? '承諾待ち' : '進行中') : 'クリア',
    badgeTone: primaryTask ? (primaryTask.status === 'pending' ? 'alert' : 'success') : 'neutral',
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

function getHomeQuickLinks(publicCategories, linksSummary, requestSummary, taskSummary) {
  const primaryCategory = publicCategories[0]?.id || 'all';
  return [
    {
      action: 'links',
      category: primaryCategory,
      icon: 'fa-solid fa-link',
      label: '共有リンク',
      meta: linksSummary.headline,
    },
    {
      action: 'request',
      icon: 'fa-solid fa-arrows-left-right',
      label: '部門間依頼',
      meta: requestSummary.activeCount > 0 ? `${requestSummary.activeCount}件` : '開く',
    },
    {
      action: 'property',
      icon: 'fa-solid fa-folder-open',
      label: '物件Noまとめ',
      meta: '横断検索',
    },
    {
      action: 'order',
      icon: 'fa-solid fa-box-open',
      label: '鋼材発注',
      meta: taskSummary.count > 0 ? '確認' : '作成',
    },
  ];
}

function getLinksSummary(categories) {
  return {
    count: categories.length,
    headline: `${categories.length}カテゴリ`,
    description: categories.length > 0
      ? 'よく使う共有リンクをカテゴリごとに整理しています。'
      : '共有リンクを追加するとここに表示されます。',
  };
}

function getRequestSummary() {
  const received = Array.isArray(state.receivedRequests) ? state.receivedRequests : [];
  const sent = Array.isArray(state.sentRequests) ? state.sentRequests : [];
  const receivedCount = received.length;
  const sentCount = sent.length;
  const activeCount = receivedCount + sentCount;
  const items = [
    ...received.slice(0, 2).map(request => ({
      title: request.title || '受信依頼',
      meta: request.fromDept ? `${request.fromDept}から` : '受信依頼',
    })),
    ...sent.slice(0, 1).map(request => ({
      title: request.title || '送信依頼',
      meta: request.toDept ? `${request.toDept}へ` : '送信依頼',
    })),
  ].slice(0, 3);
  const primary = items[0] || {
    title: '新しい依頼を作成',
    meta: '部門間の連携や相談をここから開けます',
  };

  return {
    activeCount,
    primaryTitle: primary.title,
    primaryMeta: primary.meta,
    headline: activeCount > 0 ? `${activeCount}件 進行中` : '新着なし',
    description: activeCount > 0
      ? `受信 ${receivedCount}件 / 送信 ${sentCount}件 を確認できます。`
      : '連携や依頼を行うとここに表示されます。',
    items: items.length > 0 ? items : [primary],
    tone: receivedCount > 0 ? 'active' : 'neutral',
  };
}

export async function openSharedLinksModal() {
  const modal = document.getElementById('shared-links-modal');
  if (!modal) return;
  state.sharedLinksModalOpen = true;
  modal.classList.add('visible');
  renderSharedLinksBrowser();
  if (!state.sharedCardsLoaded) {
    try {
      await deps.ensureSharedCardsLoaded?.();
    } catch (err) {
      console.error('Shared links load error:', err);
    }
  }
  renderSharedLinksBrowser();
  const input = document.getElementById('shared-links-search');
  setTimeout(() => input?.focus(), 30);
}

export function closeSharedLinksModal() {
  const modal = document.getElementById('shared-links-modal');
  if (!modal) return;
  state.sharedLinksModalOpen = false;
  modal.classList.remove('visible');
}

function collectSharedLinkSearchCards(cards, queryText) {
  if (!queryText) return cards;

  const normalizedQuery = normalizeSearch(queryText);
  if (!normalizedQuery) return cards;

  return cards.filter(card => normalizeSearch(card.label).includes(normalizedQuery));
}

export function renderSharedLinksBrowser() {
  const body = document.getElementById('shared-links-browser-body');
  const chips = document.getElementById('shared-links-chip-list');
  const status = document.getElementById('shared-links-status');
  const input = document.getElementById('shared-links-search');
  if (!body || !chips || !status) return;

  if (input && input.value !== state.sharedLinksQuery) {
    input.value = state.sharedLinksQuery;
  }

  renderSharedLinkCategoryChips();

  if (state.sharedCardsLoading) {
    status.textContent = '共有リンクを読み込み中です...';
    body.innerHTML = `
      <div class="shared-links-loading">
        <div class="shared-links-spinner"></div>
        <p>共有リンクを読み込み中です...</p>
      </div>
    `;
    return;
  }

  if (!state.sharedCardsLoaded) {
    status.textContent = '共有リンクはまだ読み込まれていません';
    body.innerHTML = `
      <div class="shared-links-empty-state">
        <div class="shared-links-empty-icon"><i class="fa-solid fa-grid-2"></i></div>
        <h3>共有リンクをまだ読み込んでいません</h3>
        <p>この画面を開いたときだけ共有リンクを取得して、起動時の読み取りを抑えています。</p>
        <button type="button" class="btn-modal-primary" id="shared-links-load-btn">
          <i class="fa-solid fa-download"></i> 共有リンクを読み込む
        </button>
      </div>
    `;
    body.querySelector('#shared-links-load-btn')?.addEventListener('click', () => {
      void deps.ensureSharedCardsLoaded?.().catch(err => {
        console.error('Shared links load error:', err);
      });
    });
    return;
  }

  const queryText = normalizeSearch(state.sharedLinksQuery);
  const categoryFilter = state.sharedLinksCategory || 'all';
  const publicCategories = getPublicCategories();
  const cards = Array.isArray(state.allCards) ? state.allCards : [];
  const sections = [];

  publicCategories.forEach(cat => {
    if (categoryFilter !== 'all' && categoryFilter !== cat.id) return;
    const categoryCards = cards.filter(card => card.category === cat.id);
    const catCards = collectSharedLinkSearchCards(categoryCards, queryText)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (queryText && catCards.length === 0) return;
    const section = deps.buildSection?.(cat, catCards, {
      searchMode: !!queryText,
      queryText,
    });
    if (section) sections.push(section);
  });

  status.textContent = queryText
    ? `「${state.sharedLinksQuery.trim()}」の検索結果 ${sections.length}カテゴリ`
    : `共有リンク ${cards.length}件 / ${publicCategories.length}カテゴリ`;

  body.innerHTML = '';
  if (!sections.length) {
    body.innerHTML = `
      <div class="shared-links-empty-state">
        <div class="shared-links-empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
        <h3>一致する共有リンクがありません</h3>
        <p>検索語を変えるか、カテゴリを「すべて」に戻して確認してください。</p>
      </div>
    `;
  } else {
    sections.forEach(section => body.appendChild(section));
  }

  if (state.isEditMode) {
    const manageWrap = document.createElement('div');
    manageWrap.className = 'shared-links-manage';
    manageWrap.innerHTML = `
      <button type="button" class="btn-modal-secondary shared-links-manage-btn" id="shared-links-add-category">
        <i class="fa-solid fa-plus"></i> 共有カテゴリを追加
      </button>
      <p class="shared-links-manage-note">共有リンクの追加や編集はこの画面の一覧から続けて行えます。</p>
    `;
    manageWrap.querySelector('#shared-links-add-category')?.addEventListener('click', () => {
      deps.openCategoryModal?.(null);
    });
    body.appendChild(manageWrap);
  }
}

function bindSharedSpaceEvents() {
  const modal = document.getElementById('shared-links-modal');
  const closeButton = document.getElementById('shared-links-close');
  const searchInput = document.getElementById('shared-links-search');

  if (modal && !modal.dataset.bound) {
    modal.dataset.bound = '1';
    modal.addEventListener('click', event => {
      if (event.target === modal) closeSharedLinksModal();
    });
  }

  if (closeButton && !closeButton.dataset.bound) {
    closeButton.dataset.bound = '1';
    closeButton.addEventListener('click', closeSharedLinksModal);
  }

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = '1';
    searchInput.addEventListener('input', event => {
      state.sharedLinksQuery = event.target.value || '';
      renderSharedLinksBrowser();
    });
    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        state.sharedLinksQuery = '';
        searchInput.value = '';
        renderSharedLinksBrowser();
      }
    });
  }
}

function renderSharedLinkCategoryChips() {
  const chips = document.getElementById('shared-links-chip-list');
  if (!chips) return;

  const publicCategories = getPublicCategories();
  const options = [
    { id: 'all', label: 'すべて' },
    ...publicCategories.map(cat => ({ id: cat.id, label: cat.label })),
  ];

  chips.innerHTML = options.map(option => `
    <button
      type="button"
      class="shared-links-chip${state.sharedLinksCategory === option.id ? ' active' : ''}"
      data-shared-link-cat="${esc(option.id)}"
    >${esc(option.label)}</button>
  `).join('');

  chips.querySelectorAll('[data-shared-link-cat]').forEach(button => {
    button.addEventListener('click', () => {
      state.sharedLinksCategory = button.dataset.sharedLinkCat || 'all';
      renderSharedLinksBrowser();
    });
  });
}

async function handleSharedHomeAction(action) {
  switch (action) {
    case 'links':
      await openSharedLinksModal();
      return;
    case 'notice':
      deps.focusNoticeBoard?.();
      return;
    case 'weather':
      deps.focusWeatherWidget?.();
      return;
    case 'calendar':
      await deps.openCalendarModal?.();
      return;
    case 'task':
      deps.openTaskModal?.();
      return;
    case 'property':
      deps.openPropertySummary?.();
      return;
    case 'order':
      await deps.openOrderModal?.();
      return;
    case 'request':
      deps.openReqModal?.();
      return;
    case 'email':
      deps.openEmailModal?.();
      return;
    default:
      return;
  }
}

function getNoticeSummary() {
  const visible = Array.isArray(state.visibleNotices) ? state.visibleNotices : [];
  const items = visible.slice(0, 3).map(notice => ({
    title: notice.title || 'お知らせ',
    meta: notice.priority === 'urgent' ? '重要なお知らせ' : 'お知らせ',
    date: formatCompactDate(notice.createdAt),
  }));

  const pendingAckCount = visible.filter(notice => {
    if (!notice?.requireAcknowledgement || !state.currentUsername) return false;
    const acknowledgedBy = Array.isArray(notice.acknowledgedBy) ? notice.acknowledgedBy : [];
    return !acknowledgedBy.includes(state.currentUsername);
  }).length;

  const unreadCount = visible.filter(notice => !state.readNoticeIds.has(notice.id)).length;

  return {
    visibleCount: visible.length,
    pendingAckCount,
    unreadCount,
    headline: pendingAckCount > 0
      ? `確認待ち ${pendingAckCount}件`
      : (unreadCount > 0 ? `未読 ${unreadCount}件` : '安定しています'),
    description: pendingAckCount > 0
      ? '重要なお知らせの確認が必要です。'
      : (unreadCount > 0 ? 'まだ読んでいないお知らせがあります。' : '大きな確認待ちはありません。'),
    items: items.length > 0 ? items : [{
      title: 'お知らせを確認',
      meta: '未読のお知らせはありません',
      date: 'Portal',
    }],
  };
}

function getPublicCategories() {
  return [...(state.allCategories || [])]
    .filter(cat => !cat.isPrivate)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function formatCompactDate(value) {
  const date = coerceDate(value);
  if (!date) return 'Portal';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value?.toDate === 'function') {
    const next = value.toDate();
    return next instanceof Date && !Number.isNaN(next.getTime()) ? next : null;
  }
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000);
  if (typeof value === 'string' || typeof value === 'number') {
    const next = new Date(value);
    return Number.isNaN(next.getTime()) ? null : next;
  }
  return null;
}

function normalizeSearch(value) {
  if (typeof deps.normalizeForSearch === 'function') {
    return deps.normalizeForSearch(value || '');
  }
  return `${value || ''}`.trim().toLowerCase();
}
