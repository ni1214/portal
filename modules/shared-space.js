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
  const visibleCategoryLabels = publicCategories.slice(0, 6);
  const hiddenCategoryCount = Math.max(publicCategories.length - visibleCategoryLabels.length, 0);
  const linkStatusText = state.sharedCardsLoaded
    ? `${(state.allCards || []).length}件 読込済み`
    : '未読込';
  const linkSummaryText = state.sharedCardsLoaded
    ? '共有リンクは準備済みです。カテゴリからすぐ探せます。'
    : '共有リンクは必要になった時だけ読み込む構成です。';

  host.innerHTML = `
    <section class="shared-home-shell">
      <div class="shared-home-hero">
        <div class="shared-home-hero-main">
          <div class="shared-home-kicker">Shared Hub</div>
          <h2 class="shared-home-title">チームが同じ画面から動ける共有ホーム</h2>
          <p class="shared-home-desc">
            共有リンク、お知らせ、共通導線を一枚で見渡しつつ、重い一覧は必要な時だけ開く Stitch 風のホーム構成です。
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

        <div class="shared-home-metric-grid">
          ${renderSharedHomeMetric('共有カテゴリ', `${publicCategories.length}`, '公開ナビゲーションの入口数', 'accent')}
          ${renderSharedHomeMetric('リンク状態', linkStatusText, state.sharedCardsLoaded ? '一覧は開いた瞬間に使えます' : '起動時は読まずに軽く保ちます', 'calm')}
          ${renderSharedHomeMetric('お知らせ', noticeSummary.headline, `${noticeSummary.actionLabel} / 表示中 ${noticeSummary.visibleCount}件`, noticeSummary.pendingAckCount > 0 ? 'alert' : 'default')}
        </div>
      </div>

      <div class="shared-home-layout">
        <article class="shared-home-board shared-home-board--primary">
          <div class="shared-home-board-head">
            <span class="shared-home-board-label">Shared Links</span>
            <span class="shared-home-board-chip">${esc(linkStatusText)}</span>
          </div>
          <div class="shared-home-board-value">${publicCategories.length}カテゴリの共有ナビ</div>
          <p class="shared-home-board-text">${esc(linkSummaryText)}</p>
          <div class="shared-home-tag-cloud">
            ${visibleCategoryLabels.map(cat => `<span class="shared-home-tag">${esc(cat.label)}</span>`).join('')}
            ${hiddenCategoryCount > 0 ? `<span class="shared-home-tag shared-home-tag--muted">+${hiddenCategoryCount}カテゴリ</span>` : ''}
            ${visibleCategoryLabels.length === 0 ? `<span class="shared-home-tag shared-home-tag--muted">カテゴリ未登録</span>` : ''}
          </div>
          <button type="button" class="shared-home-inline-action" data-shared-home-action="links">
            <span>共有リンク一覧を開く</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </article>

        <article class="shared-home-board">
          <div class="shared-home-board-head">
            <span class="shared-home-board-label">Topics</span>
            <span class="shared-home-board-chip">${esc(noticeSummary.actionLabel)}</span>
          </div>
          <div class="shared-home-board-value">${esc(noticeSummary.headline)}</div>
          <p class="shared-home-board-text">${esc(noticeSummary.description)}</p>
          <ul class="shared-home-list">
            <li>確認待ち ${noticeSummary.pendingAckCount}件</li>
            <li>未読のお知らせ ${noticeSummary.unreadCount}件</li>
            <li>表示中のお知らせ ${noticeSummary.visibleCount}件</li>
          </ul>
          <button type="button" class="shared-home-inline-action shared-home-inline-action--subtle" data-shared-home-action="notice">
            <span>通知ボードへ移動</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </article>

        <article class="shared-home-board">
          <div class="shared-home-board-head">
            <span class="shared-home-board-label">Common Actions</span>
            <span class="shared-home-board-chip">よく使う入口</span>
          </div>
          <div class="shared-home-shortcuts">
            ${renderSharedShortcut('property', 'fa-solid fa-magnifying-glass-chart', '物件Noまとめ', '横断状況をまとめて確認')}
            ${renderSharedShortcut('order', 'fa-solid fa-boxes-stacked', '鋼材発注', '発注作成と履歴確認')}
            ${renderSharedShortcut('request', 'fa-solid fa-clipboard-list', '部門間依頼', '依頼の受付と進捗確認')}
            ${renderSharedShortcut('email', 'fa-solid fa-envelope-open-text', 'メール生成AI', '文面作成をすぐ開始')}
          </div>
        </article>

        <article class="shared-home-board">
          <div class="shared-home-board-head">
            <span class="shared-home-board-label">Home Rules</span>
            <span class="shared-home-board-chip">Lightweight</span>
          </div>
          <div class="shared-home-board-value">必要な時だけ深く開くホーム</div>
          <p class="shared-home-board-text">
            ホームでは状況把握を優先し、一覧や集計はアクション後に開くことで、PC とスマホのどちらでも軽さを保ちます。
          </p>
          <ul class="shared-home-list">
            <li>ホーム: 状況把握と最短導線に集中</li>
            <li>共有リンク: 一覧モーダルを開いた時だけ読込</li>
            <li>編集: 一覧モーダルからそのまま継続可能</li>
          </ul>
          <div class="shared-home-inline-actions">
            <button type="button" class="shared-home-inline-action shared-home-inline-action--subtle" data-shared-home-action="weather">
              <span>天気を見る</span>
              <i class="fa-solid fa-arrow-right"></i>
            </button>
            <button type="button" class="shared-home-inline-action shared-home-inline-action--subtle" data-shared-home-action="email">
              <span>メール生成AIを開く</span>
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
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

function renderSharedHomeMetric(label, value, meta, tone = 'default') {
  return `
    <article class="shared-home-metric shared-home-metric--${tone}">
      <div class="shared-home-metric-label">${esc(label)}</div>
      <div class="shared-home-metric-value">${esc(value)}</div>
      <div class="shared-home-metric-meta">${esc(meta)}</div>
    </article>
  `;
}

function renderSharedShortcut(action, icon, label, meta) {
  return `
    <button type="button" class="shared-home-shortcut" data-shared-home-action="${esc(action)}">
      <span class="shared-home-shortcut-icon"><i class="${icon}"></i></span>
      <span class="shared-home-shortcut-copy">
        <span class="shared-home-shortcut-label">${esc(label)}</span>
        <span class="shared-home-shortcut-meta">${esc(meta)}</span>
      </span>
    </button>
  `;
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
