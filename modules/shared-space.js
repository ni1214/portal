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
  const publicCategories = getPublicCategories().slice(0, 6);
  const weatherSummary = getWeatherSummary();

  host.innerHTML = `
    <section class="portal-shared-shell">
      <section class="portal-home-section">
        <div class="portal-home-section-head">
          <h2 class="portal-home-section-title portal-home-section-title--primary">
            <span class="portal-home-section-bar"></span>
            共有ダッシュボード
          </h2>
        </div>

        <div class="portal-dashboard-grid">
          ${renderSharedDashboardCard({
            action: 'links',
            icon: 'fa-solid fa-link',
            title: '共有リンクを開く',
            desc: '頻繁に使用するツールへ移動',
            tone: 'primary',
          })}
          ${renderSharedDashboardCard({
            action: 'notice',
            icon: 'fa-solid fa-circle-exclamation',
            title: '重要通知を見る',
            desc: noticeSummary.pendingAckCount > 0
              ? `${noticeSummary.pendingAckCount}件の確認待ちがあります`
              : (noticeSummary.unreadCount > 0
                ? `${noticeSummary.unreadCount}件の未読があります`
                : '未確認事項はありません'),
            tone: noticeSummary.pendingAckCount > 0 ? 'alert' : 'neutral',
          })}
          <button type="button" class="portal-dashboard-card portal-dashboard-card--weather" data-shared-home-action="weather">
            <div class="portal-dashboard-card-body">
              <div class="portal-weather-copy">
                <span class="portal-weather-kicker">${esc(weatherSummary.label)}</span>
                <strong class="portal-weather-value">${esc(weatherSummary.value)}</strong>
                <span class="portal-weather-meta">${esc(weatherSummary.meta)}</span>
              </div>
              <div class="portal-weather-icon">
                <i class="${weatherSummary.icon}"></i>
              </div>
            </div>
          </button>
        </div>
      </section>

      <section class="portal-home-section">
        <div class="portal-home-section-head">
          <h2 class="portal-home-section-title portal-home-section-title--secondary">
            <span class="portal-home-section-bar"></span>
            共有リンク
          </h2>
          <button type="button" class="portal-home-section-link" data-shared-home-action="links" data-shared-home-category="all">すべて表示</button>
        </div>

        <div class="portal-links-grid">
          ${publicCategories.length > 0
            ? publicCategories.map((category, index) => renderSharedLinkTile(category, index)).join('')
            : `
              <div class="portal-link-card portal-link-card--empty">
                <div class="portal-link-card-title">共有カテゴリがまだありません</div>
                <p class="portal-link-card-copy">共有リンクモーダルからカテゴリを追加できます。</p>
              </div>
            `}
        </div>
      </section>
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

function renderSharedDashboardCard({ action, icon, title, desc, tone = 'neutral' }) {
  return `
    <button type="button" class="portal-dashboard-card portal-dashboard-card--${tone}" data-shared-home-action="${esc(action)}">
      <div class="portal-dashboard-card-icon">
        <i class="${icon}"></i>
      </div>
      <div class="portal-dashboard-card-body">
        <h3 class="portal-dashboard-card-title">${esc(title)}</h3>
        <p class="portal-dashboard-card-copy">${esc(desc)}</p>
      </div>
    </button>
  `;
}

function renderSharedLinkTile(category, index) {
  const snapshot = getCategorySnapshot(category, index);
  return `
    <button type="button" class="portal-link-card" data-shared-home-action="links" data-shared-home-category="${esc(category.id || '')}">
      <div class="portal-link-card-head">
        <span class="portal-link-card-icon"><i class="${snapshot.icon}"></i></span>
        <span class="portal-link-card-title">${esc(category.label || '共有カテゴリ')}</span>
      </div>
      <div class="portal-link-card-progress">
        <span style="width:${snapshot.progress}%"></span>
      </div>
      <p class="portal-link-card-copy">${esc(snapshot.copy)}</p>
    </button>
  `;
}

function getWeatherSummary() {
  const current = document.getElementById('weather-current');
  const temp = current?.querySelector('.weather-temp')?.textContent?.trim();
  const desc = current?.querySelector('.weather-desc')?.textContent?.trim();
  if (temp) {
    return {
      label: 'TAKASAKI, JP',
      value: temp,
      meta: desc || '現在の天気',
      icon: temp.includes('°') ? 'fa-solid fa-sun' : 'fa-solid fa-cloud-sun',
    };
  }
  return {
    label: 'TAKASAKI, JP',
    value: '天気',
    meta: '高崎の天気を確認',
    icon: 'fa-solid fa-cloud-sun',
  };
}

function getCategorySnapshot(category, index) {
  const cards = Array.isArray(state.allCards)
    ? state.allCards.filter(card => card.category === category.id)
    : [];
  const previewLabels = cards
    .slice(0, 3)
    .map(card => `${card.label || ''}`.trim())
    .filter(Boolean);
  const preset = resolveCategoryPresentation(category.label || '', index);
  return {
    icon: preset.icon,
    progress: cards.length > 0
      ? Math.min(88, 22 + cards.length * 14)
      : preset.progress,
    copy: previewLabels.length > 0
      ? `${previewLabels.join(', ')}${cards.length > previewLabels.length ? '...' : ''}`
      : preset.copy,
  };
}

function resolveCategoryPresentation(label, index) {
  const text = `${label || ''}`.toLowerCase();
  const presets = [
    { icon: 'fa-solid fa-arrow-up-right-from-square', copy: 'Slack, Zoom, GitHub...', progress: 52, match: /外部|tool|github|slack|zoom/ },
    { icon: 'fa-solid fa-shield-halved', copy: '経費精算, 日報システム', progress: 66, match: /管理|報告|admin|総務/ },
    { icon: 'fa-solid fa-screwdriver-wrench', copy: '外注管理, 製作スケジュール', progress: 24, match: /手配|製作|制作|工場|施工/ },
    { icon: 'fa-solid fa-boxes-stacked', copy: '部品カタログ, 在庫照会', progress: 74, match: /在庫|金物|倉庫|物流/ },
    { icon: 'fa-solid fa-drafting-compass', copy: 'CADデータ, 資材規格', progress: 36, match: /設計|資材|cad|図面/ },
  ];
  const preset = presets.find(item => item.match.test(text));
  if (preset) return preset;
  const fallbackProgress = [48, 60, 30, 72, 40, 12][index % 6];
  return {
    icon: 'fa-solid fa-ellipsis',
    copy: '共有リンクをまとめて確認',
    progress: fallbackProgress,
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
