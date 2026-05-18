import { state } from './state.js';
import { esc } from './utils.js';
import { CATEGORY_COLORS, SVG_ICONS } from './config.js';
import { getBrandIconHtmlForCard, shouldPreferBrandIcon } from './brand-icons.js';

export let deps = {};

function renderHomeIcon(icon, className = '') {
  if (!icon) return '';
  const iconName = String(icon).trim();
  if (!iconName) return '';
  const classAttr = className ? ` ${className}` : '';
  const isMaterialSymbol = !iconName.includes(' ') && !iconName.startsWith('fa-');
  if (isMaterialSymbol) {
    return `<span class="material-symbols-rounded${classAttr}" aria-hidden="true">${esc(iconName)}</span>`;
  }
  return `<i class="${esc(iconName)}${classAttr}" aria-hidden="true"></i>`;
}

export function initSharedSpace(d = {}) {
  deps = { ...deps, ...d };
  bindSharedSpaceEvents();
  renderSharedHome();
  renderSharedLinksBrowser();
}

export function renderSharedHome() {
  const host = document.getElementById('shared-home-panel');
  if (!host) return;
  host.hidden = true;
  host.innerHTML = '';
  return;

  const noticeSummary = getNoticeSummary();
  const requestSummary = getRequestSummary();
  const taskSummary = getTaskSummary();
  const publicCategories = getPublicCategories();
  const linksSummary = getLinksSummary(publicCategories);
  const overviewCopy = buildSharedWorkspaceCopy(noticeSummary, requestSummary, taskSummary, linksSummary);
  const metrics = buildSharedWorkspaceMetrics(noticeSummary, requestSummary, taskSummary, linksSummary);
  const actionItems = buildSharedActionItems(requestSummary, taskSummary, linksSummary);
  const quickLinks = getHomeQuickLinks(publicCategories, linksSummary, requestSummary);
  const primaryCategory = quickLinks[0]?.category || 'all';

  host.innerHTML = `
    <section class="shared-home-shell shared-home-shell--clean">
      <header class="shared-home-head">
        <div class="shared-home-head-copy">
          <p class="shared-home-kicker">共有ワークスペース</p>
          <h2 class="shared-home-title">必要な情報だけを、ひと目で。</h2>
          <p class="shared-home-copy">${esc(overviewCopy)}</p>
          <button
            type="button"
            class="shared-home-inline-link"
            data-shared-home-action="links"
            data-shared-home-category="${esc(primaryCategory)}"
          >
            共有リンクを開く
          </button>
        </div>

        <div class="shared-home-metrics">
          ${metrics.map(metric => `
            <div class="shared-home-metric">
              <span class="shared-home-metric-label">${esc(metric.label)}</span>
              <strong class="shared-home-metric-value">${esc(metric.value)}</strong>
              <span class="shared-home-metric-meta">${esc(metric.meta)}</span>
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
            <button type="button" class="shared-home-inline-link" data-shared-home-action="notice">一覧を見る</button>
          </div>

          <div class="shared-home-notice-list">
            ${noticeSummary.items.map(item => renderSharedNoticeItem(item)).join('')}
          </div>
        </section>

        <div class="shared-home-lower-grid">
          <section class="shared-home-card shared-home-card--actions">
            <div class="shared-home-card-head">
              <div>
                <h3 class="shared-home-card-title">主要アクション</h3>
                <p class="shared-home-card-copy">迷いやすい操作だけを、すぐ開ける位置にまとめています。</p>
              </div>
            </div>

            <div class="shared-home-action-grid">
              ${actionItems.map(item => renderSharedActionItem(item)).join('')}
            </div>
          </section>

          <section class="shared-home-card shared-home-card--links">
            <div class="shared-home-card-head">
              <div>
                <h3 class="shared-home-card-title">共有リンク</h3>
                <p class="shared-home-card-copy">${esc(linksSummary.description)}</p>
              </div>
              <button type="button" class="shared-home-inline-link" data-shared-home-action="links">カテゴリ一覧</button>
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
        state.sharedLinksFavoritesOnlyCategory = '';
        state.sharedLinksQuery = '';
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
    return `${linksSummary.count}カテゴリの共有リンクと主要導線をひとつにまとめています。`;
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
      meta: noticeSummary.visibleCount > 0 ? `${noticeSummary.visibleCount}件表示` : '表示なし',
    },
    {
      label: '依頼',
      value: requestSummary.activeCount > 0 ? `${requestSummary.activeCount}件` : '新着なし',
      meta: requestSummary.activeCount > 0 ? '進行中' : '落ち着いています',
    },
    {
      label: 'リンク',
      value: `${linksSummary.count}カテゴリ`,
      meta: linksSummary.count > 0 ? '整理済み' : '未設定',
    },
    {
      label: 'タスク',
      value: taskSummary.count > 0 ? `${taskSummary.count}件` : '落ち着いています',
      meta: taskSummary.count > 0 ? '対応中あり' : '進行中なし',
    },
  ];
}

function buildSharedActionItems(requestSummary, taskSummary, linksSummary) {
  return [
    {
      action: 'request',
      icon: 'swap_horiz',
      label: '部門間依頼',
      meta: requestSummary.activeCount > 0 ? `${requestSummary.activeCount}件を確認` : '新規作成',
    },
    {
      action: 'task',
      icon: 'task_alt',
      label: 'タスク',
      meta: taskSummary.count > 0 ? taskSummary.primaryTitle : '一覧を開く',
    },
    {
      action: 'links',
      icon: 'link',
      label: '共有リンク',
      meta: linksSummary.headline,
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
      ${renderHomeIcon('chevron_right', 'shared-home-notice-chevron')}
    </button>
  `;
}

function renderSharedActionItem(item) {
  return `
    <button type="button" class="shared-home-action-item" data-shared-home-action="${esc(item.action)}">
      <span class="shared-home-action-icon">${renderHomeIcon(item.icon)}</span>
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
      <span class="shared-home-link-icon">${renderHomeIcon(link.icon)}</span>
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
    meta: metaTokens.join(' / ') || '新しいタスクが入るとここに表示されます。',
    description: activeTasks.length > 0
      ? `承認待ち ${pendingTasks.length}件 / 進行中 ${acceptedTasks.length}件`
      : '落ち着いています',
    badgeText: primaryTask ? (primaryTask.status === 'pending' ? '承認待ち' : '進行中') : 'クリア',
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

function getHomeQuickLinks(publicCategories, linksSummary, requestSummary) {
  const primaryCategory = publicCategories[0]?.id || 'all';
  return [
    {
      action: 'links',
      category: primaryCategory,
      icon: 'link',
      label: '共有リンク',
      meta: linksSummary.headline,
    },
    {
      action: 'request',
      icon: 'swap_horiz',
      label: '部門間依頼',
      meta: requestSummary.activeCount > 0 ? `${requestSummary.activeCount}件` : '開く',
    },
    {
      action: 'property',
      icon: 'folder_open',
      label: '物件Noまとめ',
      meta: '横断検索',
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
    meta: '部門間の相談や依頼をここから始められます。',
  };

  return {
    activeCount,
    primaryTitle: primary.title,
    primaryMeta: primary.meta,
    headline: activeCount > 0 ? `${activeCount}件 進行中` : '新着なし',
    description: activeCount > 0
      ? `受信 ${receivedCount}件 / 送信 ${sentCount}件`
      : '落ち着いています',
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
  return cards.filter(card => {
    const haystack = [
      card.label,
      card.url,
      card.icon,
    ].map(value => normalizeSearch(value)).join(' ');
    return haystack.includes(normalizedQuery);
  });
}

function getSharedLinkCategoryTone(cat) {
  if (cat?.isExternal) return 'linear-gradient(135deg, #6c5ce7, #a29bfe)';
  const color = CATEGORY_COLORS.find(item => item.index === cat?.colorIndex);
  return color ? color.gradient : CATEGORY_COLORS[0].gradient;
}

function getSharedLinkHost(card) {
  const rawUrl = `${card?.url || ''}`.trim();
  if (!rawUrl || rawUrl === '#' || rawUrl === 'solar:open') return '';
  try {
    return new URL(rawUrl, window.location.href).host || '';
  } catch (_) {
    return rawUrl.replace(/^https?:\/\//i, '').split('/')[0] || '';
  }
}

function hasUsableUrl(card) {
  const rawUrl = `${card?.url || ''}`.trim();
  return rawUrl === 'solar:open' || (!!rawUrl && rawUrl !== '#');
}

function renderSharedLinkCardIcon(card, tone = '') {
  if (shouldPreferBrandIcon(card)) {
    const brandIcon = getBrandIconHtmlForCard(card, 'shared-link-app-brand');
    if (brandIcon) return brandIcon;
  }

  if (card?.icon && card.icon.startsWith('svg:')) {
    return SVG_ICONS[card.icon] || renderHomeIcon('link');
  }

  const icon = card?.url === 'solar:open'
    ? 'fa-solid fa-solar-panel'
    : (card?.icon || 'fa-solid fa-link');
  const style = tone && !icon.startsWith('fa-brands') ? ` style="color: transparent; background: ${tone}; -webkit-background-clip: text; background-clip: text;"` : '';
  return `<i class="${esc(icon)}"${style} aria-hidden="true"></i>`;
}

function buildSharedLinkAppTile(card, allCategoryCards, cat, options = {}) {
  const tile = document.createElement('div');
  tile.className = 'shared-link-app-tile' + (options.isChild ? ' shared-link-app-tile--child' : '');
  tile.dataset.docId = card.id || '';

  const children = allCategoryCards
    .filter(child => child.parentId === card.id && !state.hiddenCards.includes(child.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const urlReady = hasUsableUrl(card);
  const tone = getSharedLinkCategoryTone(cat);
  const isFavorite = Array.isArray(state.personalFavorites) && state.personalFavorites.includes(card.id);
  const favoriteLabel = isFavorite ? 'お気に入り解除' : 'お気に入りに追加';
  const host = getSharedLinkHost(card);
  const meta = card.url === 'solar:open'
    ? '天気パネル'
    : (host || (urlReady ? '共有リンク' : 'URL未設定'));

  const link = document.createElement('a');
  link.className = 'shared-link-app-link' + (!urlReady ? ' shared-link-app-link--empty' : '');
  link.title = card.label || '共有リンク';
  if (card.url === 'solar:open') {
    link.href = '#';
    link.dataset.solarOpen = '1';
  } else if (urlReady) {
    link.href = card.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  } else {
    link.href = '#';
    link.addEventListener('click', event => {
      event.preventDefault();
      if (state.isEditMode && typeof deps.openCardModal === 'function') {
        deps.openCardModal(card.id);
      }
    });
  }

  link.innerHTML = `
    <span class="shared-link-app-icon">${renderSharedLinkCardIcon(card, tone)}</span>
    <span class="shared-link-app-label">${esc(card.label || '共有リンク')}</span>
    <span class="shared-link-app-meta">${esc(meta)}</span>
  `;
  tile.appendChild(link);

  if (card.id) {
    const actionRow = document.createElement('div');
    actionRow.className = 'shared-link-app-actions';

    const favoriteButton = document.createElement('button');
    favoriteButton.type = 'button';
    favoriteButton.className = `shared-link-app-favorite${isFavorite ? ' active' : ''}`;
    favoriteButton.dataset.id = card.id || '';
    favoriteButton.title = favoriteLabel;
    favoriteButton.setAttribute('aria-label', favoriteLabel);
    favoriteButton.innerHTML = `<i class="fa-${isFavorite ? 'solid' : 'regular'} fa-star" aria-hidden="true"></i>`;
    favoriteButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      deps.toggleFavorite?.(card.id);
    });
    actionRow.appendChild(favoriteButton);

    if (state.isEditMode) {
      const childAddButton = document.createElement('button');
      childAddButton.type = 'button';
      childAddButton.className = 'shared-link-app-child-add';
      childAddButton.title = '子アイコンを追加';
      childAddButton.setAttribute('aria-label', '子アイコンを追加');
      childAddButton.innerHTML = '<i class="fa-solid fa-sitemap" aria-hidden="true"></i>';
      childAddButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        deps.openCardModal?.(null, cat?.id || null, false, null, card.id);
      });
      actionRow.appendChild(childAddButton);
    }

    tile.appendChild(actionRow);
  }

  if (state.isEditMode && card.id) {
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'shared-link-app-edit';
    editButton.title = '編集';
    editButton.setAttribute('aria-label', '編集');
    editButton.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
    editButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      deps.openCardModal?.(card.id);
    });
    tile.appendChild(editButton);
  }

  if (children.length > 0 && !options.isChild) {
    const childButton = document.createElement('button');
    childButton.type = 'button';
    childButton.className = 'shared-link-app-children-toggle';
    childButton.title = '関連リンクを表示';
    childButton.innerHTML = `<i class="fa-solid fa-layer-group" aria-hidden="true"></i><span>${children.length}</span>`;
    childButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      tile.classList.toggle('expanded');
    });
    tile.appendChild(childButton);

    const tray = document.createElement('div');
    tray.className = 'shared-link-children-tray';
    children.forEach(child => {
      tray.appendChild(buildSharedLinkAppTile(child, allCategoryCards, cat, { isChild: true }));
    });
    if (state.isEditMode) {
      tray.appendChild(buildSharedLinkAddTile(cat, card.id, true));
    }
    tile.appendChild(tray);
  }

  tile.addEventListener('contextmenu', event => {
    if (typeof deps.showContextMenu !== 'function' || !card.id) return;
    event.preventDefault();
    deps.showContextMenu(event, card);
  });

  return tile;
}

function buildSharedLinkAddTile(cat, parentId = null, compact = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'shared-link-add-tile' + (compact ? ' shared-link-add-tile--compact' : '');
  button.innerHTML = `
    <span class="shared-link-add-icon">${renderHomeIcon('add')}</span>
    <span>${compact ? '追加' : 'リンク追加'}</span>
  `;
  button.addEventListener('click', () => {
    deps.openCardModal?.(null, cat?.id || null, false, null, parentId);
  });
  return button;
}

function buildSharedLinkAppSection(cat, cards, allCategoryCards, options = {}) {
  const section = document.createElement('section');
  section.className = 'shared-link-app-section';
  section.dataset.categoryId = cat.id || '';

  const tone = getSharedLinkCategoryTone(cat);
  const favoriteIds = Array.isArray(state.personalFavorites) ? state.personalFavorites : [];
  const sectionCardsForFavorite = allCategoryCards.filter(card => card.id);
  const allFavorited = sectionCardsForFavorite.length > 0 && sectionCardsForFavorite.every(card => favoriteIds.includes(card.id));
  const visibleCards = options.searchMode ? cards : cards.filter(card => !card.parentId);

  section.innerHTML = `
    <header class="shared-link-app-section-head">
      <div class="shared-link-app-section-title">
        <span class="shared-link-app-section-icon" style="--shared-link-tone:${esc(tone)}">${renderHomeIcon(cat.icon || 'folder')}</span>
        <span>
          <strong>${esc(cat.label || '共有リンク')}</strong>
          <small>${cards.length}件${allCategoryCards.length !== cards.length ? ` / 全${allCategoryCards.length}件` : ''}</small>
        </span>
      </div>
      <div class="shared-link-app-section-actions">
        <button type="button" class="shared-link-section-favorite${allFavorited ? ' active' : ''}" title="${allFavorited ? 'カテゴリのお気に入りを解除' : 'カテゴリをまとめてお気に入り'}" aria-label="${allFavorited ? 'カテゴリのお気に入りを解除' : 'カテゴリをまとめてお気に入り'}">
          <i class="fa-${allFavorited ? 'solid' : 'regular'} fa-star" aria-hidden="true"></i>
        </button>
        ${state.isEditMode ? `
          <button type="button" class="shared-link-section-edit" title="カテゴリ編集" aria-label="カテゴリ編集">
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
        ` : ''}
      </div>
    </header>
    <div class="shared-link-app-grid"></div>
  `;

  section.querySelector('.shared-link-section-favorite')?.addEventListener('click', event => {
    event.preventDefault();
    deps.toggleSectionFavorite?.(cat.id, false);
  });
  section.querySelector('.shared-link-section-edit')?.addEventListener('click', event => {
    event.preventDefault();
    const catObj = (state.allCategories || []).find(item => item.docId === cat.docId || item.id === cat.id) || cat;
    deps.openCategoryModal?.(catObj);
  });

  const grid = section.querySelector('.shared-link-app-grid');
  if (visibleCards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'shared-link-app-empty';
    empty.textContent = options.searchMode ? 'このカテゴリには一致するリンクがありません。' : 'まだリンクがありません。';
    grid.appendChild(empty);
  } else {
    visibleCards.forEach(card => {
      grid.appendChild(buildSharedLinkAppTile(card, allCategoryCards, cat));
    });
  }
  if (state.isEditMode && !options.searchMode) {
    grid.appendChild(buildSharedLinkAddTile(cat));
  }

  return section;
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
        <div class="shared-links-empty-icon">${renderHomeIcon('grid_view')}</div>
        <h3>共有リンクを読み込むとここに表示されます</h3>
        <p>この画面を開いたタイミングで共有リンクを取得します。必要な時だけ読み込むので軽く保てます。</p>
        <button type="button" class="btn-modal-primary" id="shared-links-load-btn">
          ${renderHomeIcon('download')} 共有リンクを読み込む
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
  const favoriteOnlyCategory = state.sharedLinksFavoritesOnlyCategory || '';
  const favoriteIds = new Set(Array.isArray(state.personalFavorites) ? state.personalFavorites : []);
  const publicCategories = getPublicCategories();
  const cards = (Array.isArray(state.allCards) ? state.allCards : [])
    .filter(card => !state.hiddenCards.includes(card.id));
  const sections = [];

  publicCategories.forEach(cat => {
    if (categoryFilter !== 'all' && categoryFilter !== cat.id) return;
    const categoryCards = cards.filter(card => card.category === cat.id);
    const sourceCards = favoriteOnlyCategory === cat.id
      ? categoryCards.filter(card => favoriteIds.has(card.id))
      : categoryCards;
    const catCards = collectSharedLinkSearchCards(sourceCards, queryText)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (queryText && catCards.length === 0) return;
    const section = buildSharedLinkAppSection(cat, catCards, sourceCards, {
      searchMode: !!queryText,
      queryText,
    });
    if (section) sections.push(section);
  });

  status.textContent = favoriteOnlyCategory
    ? `${publicCategories.find(cat => cat.id === favoriteOnlyCategory)?.label || 'カテゴリ'} のお気に入り ${sections.length}カテゴリ`
    : queryText
    ? `「${state.sharedLinksQuery.trim()}」 の検索結果 ${sections.length}カテゴリ`
    : `共有リンク ${cards.length}件 / ${publicCategories.length}カテゴリ`;

  body.innerHTML = '';
  if (!sections.length) {
    body.innerHTML = `
      <div class="shared-links-empty-state">
        <div class="shared-links-empty-icon">${renderHomeIcon('search')}</div>
        <h3>見つかりませんでした</h3>
        <p>${favoriteOnlyCategory ? 'このカテゴリのお気に入りはありません。' : '検索条件を変えるか、カテゴリを切り替えて確認してください。'}</p>
      </div>
    `;
  } else {
    if (favoriteOnlyCategory) {
      const hint = document.createElement('div');
      hint.className = 'shared-links-favorite-hint';
      hint.innerHTML = `
        <i class="material-symbols-rounded" aria-hidden="true">star</i>
        <span>このカテゴリでお気に入り登録したリンクだけを表示しています。</span>
      `;
      body.appendChild(hint);
    }
    if (categoryFilter === 'external' || sections.some(section => section.dataset?.categoryId === 'external')) {
      const hint = document.createElement('div');
      hint.className = 'shared-links-favorite-hint';
      hint.innerHTML = `
        <i class="material-symbols-rounded" aria-hidden="true">star</i>
        <span>各アイコン下の星でお気に入り保存、ツリーアイコンで関連アイコンを作成できます。</span>
      `;
      body.appendChild(hint);
    }
    sections.forEach(section => body.appendChild(section));
  }

  if (state.isEditMode) {
    const manageWrap = document.createElement('div');
    manageWrap.className = 'shared-links-manage';
    manageWrap.innerHTML = `
      <button type="button" class="btn-modal-secondary shared-links-manage-btn" id="shared-links-add-category">
        ${renderHomeIcon('add')} 共有カテゴリを追加
      </button>
      <p class="shared-links-manage-note">共有リンクの追加や編集は、この画面からまとめて行えます。</p>
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
      state.sharedLinksFavoritesOnlyCategory = '';
      renderSharedLinksBrowser();
    });
  });
}

async function handleSharedHomeAction(action) {
  switch (action) {
    case 'links':
      state.sharedLinksQuery = '';
      await openSharedLinksModal();
      return;
    case 'notice':
      deps.focusNoticeBoard?.();
      return;
    case 'request':
      deps.openReqModal?.();
      return;
    case 'task':
      deps.openTaskModal?.();
      return;
    case 'property':
      deps.openPropertySummary?.();
      return;
    default:
      return;
  }
}

function getNoticeSummary() {
  const visible = Array.isArray(state.visibleNotices) ? state.visibleNotices : [];
  const items = visible.slice(0, 2).map(notice => ({
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
      ? `要確認 ${pendingAckCount}件`
      : (unreadCount > 0 ? `未読 ${unreadCount}件` : '安定しています'),
    description: pendingAckCount > 0
      ? '重要なお知らせがあります。'
      : (unreadCount > 0 ? 'まだ読んでいないお知らせがあります。' : '大きな更新はありません。'),
    items: items.length > 0 ? items : [{
      title: 'お知らせはありません',
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
