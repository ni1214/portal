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
  const publicCategories = getPublicCategories();
  const linkStatusText = state.sharedCardsLoaded
    ? `${(state.allCards || []).length}件 読込済み`
    : '未読込';

  host.innerHTML = `
    <section class="shared-home-shell">
      <div class="shared-home-hero">
        <div class="shared-home-kicker">Shared Hub</div>
        <h2 class="shared-home-title">共有ダッシュボード</h2>
        <p class="shared-home-desc">
          お知らせと共通導線だけを先に表示し、共有リンクは必要な時だけ読み込みます。
          ホームを軽くしたまま、必要な時だけ一覧を開ける構成です。
        </p>
        <div class="shared-home-actions">
          <button type="button" class="btn-modal-primary shared-home-primary-btn" data-shared-home-action="links">
            <i class="fa-solid fa-grid-2"></i> 共有リンクを開く
          </button>
          <button type="button" class="btn-modal-secondary shared-home-secondary-btn" data-shared-home-action="notice">
            <i class="fa-solid fa-bullhorn"></i> 重要通知を見る
          </button>
          <button type="button" class="btn-modal-secondary shared-home-secondary-btn" data-shared-home-action="weather">
            <i class="fa-solid fa-cloud-sun"></i> 天気を見る
          </button>
        </div>
      </div>

      <div class="shared-home-grid">
        <article class="shared-home-card shared-home-card--accent">
          <div class="shared-home-card-head">
            <span class="shared-home-card-label">共有リンク</span>
            <span class="shared-home-card-chip">${esc(linkStatusText)}</span>
          </div>
          <div class="shared-home-card-value">${publicCategories.length}カテゴリ</div>
          <p class="shared-home-card-text">
            一覧は起動時に出さず、このカードから必要な時だけ読み込みます。
          </p>
          <div class="shared-home-card-tags">
            ${publicCategories.map(cat => `<span class="shared-home-tag">${esc(cat.label)}</span>`).join('')}
          </div>
        </article>

        <article class="shared-home-card">
          <div class="shared-home-card-head">
            <span class="shared-home-card-label">共有トピック</span>
            <span class="shared-home-card-chip">${noticeSummary.actionLabel}</span>
          </div>
          <div class="shared-home-card-value">${noticeSummary.headline}</div>
          <p class="shared-home-card-text">${noticeSummary.description}</p>
          <ul class="shared-home-list">
            <li>確認待ち ${noticeSummary.pendingAckCount}件</li>
            <li>未読のお知らせ ${noticeSummary.unreadCount}件</li>
            <li>表示中のお知らせ ${noticeSummary.visibleCount}件</li>
          </ul>
        </article>

        <article class="shared-home-card">
          <div class="shared-home-card-head">
            <span class="shared-home-card-label">共通アクション</span>
            <span class="shared-home-card-chip">よく使う入口</span>
          </div>
          <div class="shared-home-shortcuts">
            <button type="button" class="shared-home-shortcut" data-shared-home-action="property">
              <i class="fa-solid fa-magnifying-glass-chart"></i><span>物件Noまとめ</span>
            </button>
            <button type="button" class="shared-home-shortcut" data-shared-home-action="order">
              <i class="fa-solid fa-boxes-stacked"></i><span>鋼材発注</span>
            </button>
            <button type="button" class="shared-home-shortcut" data-shared-home-action="request">
              <i class="fa-solid fa-clipboard-list"></i><span>部門間依頼</span>
            </button>
            <button type="button" class="shared-home-shortcut" data-shared-home-action="email">
              <i class="fa-solid fa-envelope-open-text"></i><span>メール生成AI</span>
            </button>
          </div>
        </article>

        <article class="shared-home-card">
          <div class="shared-home-card-head">
            <span class="shared-home-card-label">共有ホームの考え方</span>
            <span class="shared-home-card-chip">軽量化済み</span>
          </div>
          <div class="shared-home-card-value">起動時ドン読みを抑制</div>
          <p class="shared-home-card-text">
            共有リンクは一覧を開いた時だけ Firestore から読み込みます。ホームでは通知と共通導線に絞っています。
          </p>
          <ul class="shared-home-list">
            <li>ホーム: 軽い共有ダッシュボード</li>
            <li>共有リンク: 必要時だけ一覧表示</li>
            <li>編集: 一覧モーダルからそのまま可能</li>
          </ul>
        </article>
      </div>
    </section>
  `;

  host.querySelectorAll('[data-shared-home-action]').forEach(button => {
    button.addEventListener('click', () => {
      void handleSharedHomeAction(button.dataset.sharedHomeAction || '');
    });
  });
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
        <p>この画面を開いた時だけ Firestore から一覧を取得します。</p>
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
  };
}

function getPublicCategories() {
  return [...(state.allCategories || [])]
    .filter(cat => !cat.isPrivate)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function normalizeSearch(value) {
  if (typeof deps.normalizeForSearch === 'function') {
    return deps.normalizeForSearch(value || '');
  }
  return `${value || ''}`.trim().toLowerCase();
}
