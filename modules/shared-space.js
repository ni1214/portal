import { state } from './state.js';
import { esc } from './utils.js';

export let deps = {};
const HOME_DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const HOME_SLOGAN_IMAGE = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBNsw4YWk756dZSe3D_1rn-X5tRXPygtsoiFi9Cfzkud2hoxOpo3qOjF1A0eRQgPyzYBR8NMnbmfRpy1S5_wuQ77yP5bX-tG1SkcIyGOOxn3CqR-x5KhBMQfBzfcx0cQbOAqdypEQQomPsGkn10M7LH0b9AWN-Rcai_s4Po4kUxtMf1XU8evBVBBaYh2a4NhniumLd8QDBPr0wRFv4vT4AcEterRUiSR8XqbbDe_6FSnwqRxjJqZsKoutXczye74bTX4s5pQGWhx7-V';

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
  const overview = getHomeOverview(noticeSummary, taskSummary, requestSummary, linksSummary);
  const scheduleItems = buildHomeSchedule(noticeSummary, taskSummary, requestSummary, linksSummary);
  const quickLinks = getHomeQuickLinks(publicCategories, linksSummary, requestSummary, taskSummary);
  const slogan = getHomeSlogan();

  host.innerHTML = `
    <section class="portal-home-shell">
      <header class="portal-home-hero">
        <div class="portal-home-hero-copy">
          <h1 class="portal-home-hero-title">${esc(overview.title)}</h1>
          <p class="portal-home-hero-subtitle">${esc(overview.subtitle)}</p>
        </div>
        <div class="portal-home-hero-meta">
          ${overview.meta.map(item => `
            <div class="portal-home-hero-chip">
              <span class="portal-home-hero-chip-label">${esc(item.label)}</span>
              <strong class="portal-home-hero-chip-value">${esc(item.value)}</strong>
            </div>
          `).join('')}
        </div>
      </header>

      <div class="portal-home-bento">
        <div class="portal-home-bento-main">
          <section class="portal-home-panel portal-home-panel--schedule">
            <div class="portal-home-panel-head">
              <div>
                <h2 class="portal-home-panel-title">本日のスケジュール</h2>
                <p class="portal-home-panel-copy">${esc(overview.scheduleCopy)}</p>
              </div>
              <span class="portal-home-panel-icon"><i class="fa-regular fa-calendar-days"></i></span>
            </div>

            <div class="portal-home-schedule-list">
              ${scheduleItems.map(item => renderScheduleItem(item)).join('')}
            </div>

            <button
              type="button"
              class="portal-home-panel-link"
              data-shared-home-action="calendar"
            >
              すべての予定を表示 <i class="fa-solid fa-arrow-right"></i>
            </button>
          </section>

          <div class="portal-home-feature-grid">
            <button
              type="button"
              class="portal-home-panel portal-home-panel--task"
              data-shared-home-action="task"
            >
              <div class="portal-home-feature-head">
                <span class="portal-home-feature-icon portal-home-feature-icon--success"><i class="fa-solid fa-circle-check"></i></span>
                <div class="portal-home-feature-heading">
                  <h3 class="portal-home-feature-title">進行中のタスク</h3>
                  <p class="portal-home-feature-copy">${esc(taskSummary.description)}</p>
                </div>
                <span class="portal-home-task-badge portal-home-task-badge--${esc(taskSummary.badgeTone)}">${esc(taskSummary.badgeText)}</span>
              </div>

              <div class="portal-home-task-title">${esc(taskSummary.primaryTitle)}</div>
              <div class="portal-home-task-meta">${esc(taskSummary.meta)}</div>
              <div class="portal-home-task-progress">
                <span style="width:${taskSummary.progress}%"></span>
              </div>
            </button>

            <button
              type="button"
              class="portal-home-panel portal-home-panel--ai"
              data-shared-home-action="email"
            >
              <div class="portal-home-feature-head">
                <span class="portal-home-feature-icon portal-home-feature-icon--accent"><i class="fa-solid fa-sparkles"></i></span>
                <div class="portal-home-feature-heading">
                  <h3 class="portal-home-feature-title">AI アシスタント</h3>
                </div>
              </div>

              <p class="portal-home-feature-copy portal-home-feature-copy--wide">${esc(overview.aiCopy)}</p>
              <span class="portal-home-primary-cta">ドラフトを確認</span>
            </button>
          </div>
        </div>

        <aside class="portal-home-bento-side">
          <section class="portal-home-panel portal-home-panel--notices">
            <div class="portal-home-panel-head">
              <div>
                <h2 class="portal-home-panel-title">社内のお知らせ</h2>
                <p class="portal-home-panel-copy">${esc(noticeSummary.headline)}</p>
              </div>
              <span class="portal-home-panel-icon portal-home-panel-icon--muted"><i class="fa-solid fa-bullhorn"></i></span>
            </div>

            <div class="portal-home-notice-list">
              ${noticeSummary.items.map(item => renderHomeNoticeItem(item)).join('')}
            </div>

            <button
              type="button"
              class="portal-home-panel-link"
              data-shared-home-action="notice"
            >
              お知らせを開く <i class="fa-solid fa-arrow-right"></i>
            </button>
          </section>

          <section class="portal-home-panel portal-home-panel--links">
            <div class="portal-home-panel-head">
              <div>
                <h2 class="portal-home-panel-title">クイックリンク</h2>
                <p class="portal-home-panel-copy">${esc(linksSummary.description)}</p>
              </div>
              <span class="portal-home-panel-icon portal-home-panel-icon--muted"><i class="fa-solid fa-link"></i></span>
            </div>

            <div class="portal-home-quick-grid">
              ${quickLinks.map(link => renderQuickLink(link)).join('')}
            </div>
          </section>

          <section class="portal-home-panel portal-home-panel--slogan">
            <div class="portal-home-slogan-media">
              <img src="${HOME_SLOGAN_IMAGE}" alt="モダンなオフィス空間" class="portal-home-slogan-image" loading="lazy">
              <div class="portal-home-slogan-overlay"></div>
            </div>
            <div class="portal-home-slogan-copy">
              <p class="portal-home-slogan-label">${esc(slogan.label)}</p>
              <h2 class="portal-home-slogan-text">${esc(slogan.text)}</h2>
            </div>
          </section>
        </aside>
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

function renderScheduleItem(item) {
  return `
    <article class="portal-home-schedule-item">
      <div class="portal-home-schedule-stamp">
        <span class="portal-home-schedule-period">${esc(item.period)}</span>
        <strong class="portal-home-schedule-time">${esc(item.time)}</strong>
      </div>
      <div class="portal-home-schedule-track portal-home-schedule-track--${esc(item.tone)}"></div>
      <div class="portal-home-schedule-content">
        <div class="portal-home-schedule-title">${esc(item.title)}</div>
        <div class="portal-home-schedule-meta">${esc(item.meta)}</div>
      </div>
    </article>
  `;
}

function renderHomeNoticeItem(item) {
  return `
    <article class="portal-home-notice-item">
      <div class="portal-home-notice-date">${esc(item.date)}</div>
      <div class="portal-home-notice-title">${esc(item.title || 'お知らせ')}</div>
    </article>
  `;
}

function renderQuickLink(link) {
  const categoryAttr = link.category ? ` data-shared-home-category="${esc(link.category)}"` : '';
  return `
    <button
      type="button"
      class="portal-home-quick-link"
      data-shared-home-action="${esc(link.action)}"${categoryAttr}
    >
      <span class="portal-home-quick-icon"><i class="${link.icon}"></i></span>
      <span class="portal-home-quick-label">${esc(link.label)}</span>
      ${link.meta ? `<span class="portal-home-quick-meta">${esc(link.meta)}</span>` : ''}
    </button>
  `;
}

function getHomeOverview(noticeSummary, taskSummary, requestSummary, linksSummary) {
  const now = new Date();
  const username = state.currentUsername ? `${state.currentUsername}さん` : 'みなさん';
  const actionCount = getHomeActionCount(noticeSummary, taskSummary, requestSummary);
  const actionText = actionCount > 0
    ? `${actionCount}件の確認項目があります。`
    : '落ち着いて進められる一日です。';
  return {
    title: `${getGreetingForHour(now.getHours())}、${username}`,
    subtitle: `今日は ${formatHomeDate(now)} です。${actionText}`,
    scheduleCopy: actionCount > 0
      ? '優先度の高い確認項目を先に並べています。'
      : '今日の確認ポイントをここからまとめて開けます。',
    aiCopy: taskSummary.count > 0
      ? '未返信や進行中案件の文面作成を AI が手伝います。確認や返信の下書きをすぐ作れます。'
      : '定型文、返信文、依頼文のたたき台をまとめて作れます。必要なときにすぐ使えます。',
    meta: [
      {
        label: 'お知らせ',
        value: noticeSummary.pendingAckCount > 0
          ? `要確認 ${noticeSummary.pendingAckCount}件`
          : (noticeSummary.unreadCount > 0 ? `未読 ${noticeSummary.unreadCount}件` : '安定'),
      },
      {
        label: 'タスク',
        value: taskSummary.count > 0 ? `${taskSummary.count}件 進行中` : '落ち着いています',
      },
      {
        label: '共有リンク',
        value: linksSummary.headline,
      },
    ],
  };
}

function getHomeActionCount(noticeSummary, taskSummary, requestSummary) {
  const noticeCount = (noticeSummary.pendingAckCount || 0) + (noticeSummary.unreadCount || 0);
  const taskCount = taskSummary.count || 0;
  const requestCount = requestSummary.activeCount || 0;
  return noticeCount + taskCount + requestCount;
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
      : '落ち着いて進められます',
    badgeText: primaryTask
      ? (primaryTask.status === 'pending' ? '承諾待ち' : '進行中')
      : 'クリア',
    badgeTone: primaryTask
      ? (primaryTask.status === 'pending' ? 'alert' : 'success')
      : 'neutral',
    progress: primaryTask
      ? (primaryTask.status === 'pending' ? 28 : 74)
      : 100,
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

function buildHomeSchedule(noticeSummary, taskSummary, requestSummary, linksSummary) {
  const items = [];

  if (noticeSummary.pendingAckCount > 0 || noticeSummary.unreadCount > 0) {
    items.push({
      tone: noticeSummary.pendingAckCount > 0 ? 'danger' : 'accent',
      title: noticeSummary.pendingAckCount > 0 ? '重要なお知らせを確認' : '未読のお知らせを確認',
      meta: noticeSummary.pendingAckCount > 0
        ? `確認待ち ${noticeSummary.pendingAckCount}件`
        : `未読 ${noticeSummary.unreadCount}件`,
    });
  }

  if (taskSummary.count > 0) {
    items.push({
      tone: taskSummary.badgeTone === 'alert' ? 'warning' : 'success',
      title: taskSummary.primaryTitle,
      meta: taskSummary.meta,
    });
  }

  if (requestSummary.activeCount > 0) {
    items.push({
      tone: requestSummary.tone === 'active' ? 'success' : 'accent',
      title: requestSummary.primaryTitle,
      meta: requestSummary.primaryMeta,
    });
  }

  if (items.length === 0) {
    items.push(
      {
        tone: 'accent',
        title: '共有リンクを整理',
        meta: `${linksSummary.headline} から必要な導線をすぐ開けます`,
      },
      {
        tone: 'success',
        title: '今日の予定を確認',
        meta: 'カレンダーと勤怠をまとめて確認できます',
      }
    );
  }

  return items.slice(0, 3).map((item, index) => {
    const presets = [
      { period: 'AM', time: '09:00' },
      { period: 'PM', time: '13:30' },
      { period: 'NEXT', time: '16:30' },
    ];
    return {
      ...presets[index],
      ...item,
    };
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
      label: '部署間依頼',
      meta: requestSummary.activeCount > 0 ? `${requestSummary.activeCount}件` : '開く',
    },
    {
      action: 'property',
      icon: 'fa-solid fa-folder-open',
      label: '物件Noまとめ',
      meta: '横断確認',
    },
    {
      action: 'order',
      icon: 'fa-solid fa-box-open',
      label: '鋼材発注',
      meta: taskSummary.count > 0 ? '確認' : '作成',
    },
  ];
}

function getHomeSlogan() {
  const text = `${state.missionText || ''}`.trim();
  return {
    label: text ? '今月のスローガン' : 'Portal Message',
    text: text || '革新を、日常に。',
  };
}

function getGreetingForHour(hour) {
  if (hour < 11) return 'おはようございます';
  if (hour < 18) return 'こんにちは';
  return 'おつかれさまです';
}

function formatHomeDate(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dow = HOME_DOW_LABELS[date.getDay()] || '';
  return `${date.getFullYear()}年${month}月${day}日 ${dow}曜日`;
}

function getLinksSummary(categories) {
  return {
    count: categories.length,
    headline: `${categories.length}カテゴリ`,
    description: categories.length > 0
      ? 'よく使う導線を先頭にまとめています。'
      : '主要導線をここからまとめて開けます。',
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
    meta: '部署間の相談・連携をここから開始',
  };

  return {
    activeCount,
    primaryTitle: primary.title,
    primaryMeta: primary.meta,
    headline: activeCount > 0 ? `${activeCount}件 進行中` : '新着なし',
    description: activeCount > 0
      ? `受信 ${receivedCount}件 / 送信 ${sentCount}件 の依頼を確認できます。`
      : '相談や依頼を必要な時にすぐ起票できます。',
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
      console.error('共有リンクの読み込みに失敗しました:', err);
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
    status.textContent = '共有リンクを読み込んでいます...';
    body.innerHTML = `
      <div class="shared-links-loading">
        <div class="shared-links-spinner"></div>
        <p>共有リンク一覧を読み込んでいます...</p>
      </div>
    `;
    return;
  }

  if (!state.sharedCardsLoaded) {
    status.textContent = '共有リンクはまだ読み込まれていません';
    body.innerHTML = `
      <div class="shared-links-empty-state">
        <div class="shared-links-empty-icon"><i class="fa-solid fa-grid-2"></i></div>
        <h3>共有リンクは必要な時だけ読み込みます</h3>
        <p>この画面を開いた時だけ共有リンク一覧を取得します。</p>
        <button type="button" class="btn-modal-primary" id="shared-links-load-btn">
          <i class="fa-solid fa-download"></i> 共有リンクを読み込む
        </button>
      </div>
    `;
    body.querySelector('#shared-links-load-btn')?.addEventListener('click', () => {
      void deps.ensureSharedCardsLoaded?.().catch(err => {
        console.error('共有リンクの再読み込みに失敗しました:', err);
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
    const catCards = cards
      .filter(card => card.category === cat.id)
      .filter(card => !queryText || normalizeSearch(card.label).includes(queryText))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (queryText && catCards.length === 0) return;
    const section = deps.buildSection?.(cat, catCards);
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
        <p>検索語を短くするか、カテゴリを「すべて」に戻してください。</p>
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
      <p class="shared-links-manage-note">共有リンクの追加・編集はこの画面内で行えます。</p>
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
    meta: notice.priority === 'urgent' ? '重要通知' : '共有通知',
    date: formatCompactDate(notice.createdAt),
  }));
  const pendingAckCount = visible.filter(notice => {
    if (!notice?.requireAcknowledgement || !state.currentUsername) return false;
    const acknowledgedBy = Array.isArray(notice.acknowledgedBy) ? notice.acknowledgedBy : [];
    return !acknowledgedBy.includes(state.currentUsername);
  }).length;
  const unreadCount = visible.filter(notice => !state.readNoticeIds.has(notice.id)).length;
  const actionCount = pendingAckCount + unreadCount;
  return {
    visibleCount: visible.length,
    pendingAckCount,
    unreadCount,
    actionLabel: actionCount > 0 ? `${actionCount}件 対応あり` : '落ち着いています',
    headline: pendingAckCount > 0
      ? `確認待ち ${pendingAckCount}件`
      : (unreadCount > 0 ? `未読 ${unreadCount}件` : '共有トピックは安定'),
    description: pendingAckCount > 0
      ? '重要通知の確認が必要です。'
      : (unreadCount > 0 ? 'まだ読んでいないお知らせがあります。' : '今は大きな確認待ちはありません。'),
    items: items.length > 0 ? items : [{
      title: '共有通知を確認',
      meta: '未読や重要通知をまとめて確認',
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
