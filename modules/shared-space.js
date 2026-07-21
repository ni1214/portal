import { state } from './state.js';
import {
  esc,
  inferSharedLinkType,
  getSharedLinkTypeMeta,
  isSafeSharedLinkUrl,
  isSafeWebUrl,
  sanitizeIconIdentifier,
} from './utils.js';
import { CATEGORY_COLORS, SVG_ICONS } from './config.js';
import { getBrandIconHtmlForCard, shouldPreferBrandIcon } from './brand-icons.js';

export let deps = {};

const ALL_CATEGORY_ID = 'all';
const MANAGE_SCOPE = 'manage';
const FAVORITES_SCOPE = 'favorites';
const CATEGORY_PREVIEW_LIMIT = 6;

let sharedLinksScope = MANAGE_SCOPE;

function renderHomeIcon(icon, className = '') {
  if (!icon) return '';
  const iconName = sanitizeIconIdentifier(icon, 'link');
  const classAttr = className ? ` ${esc(className)}` : '';
  const isMaterialSymbol = !iconName.includes(' ') && !iconName.startsWith('fa-') && !iconName.startsWith('svg:');
  if (isMaterialSymbol) {
    return `<span class="material-symbols-rounded${classAttr}" aria-hidden="true">${esc(iconName)}</span>`;
  }
  if (iconName.startsWith('svg:')) return SVG_ICONS[iconName] || renderHomeIcon('link', className);
  return `<i class="${esc(iconName)}${classAttr}" aria-hidden="true"></i>`;
}

function getPublicCategories() {
  return (Array.isArray(state.allCategories) ? state.allCategories : [])
    .filter(category => !category?.isPrivate)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function getVisibleSharedCards() {
  const hiddenIds = new Set(Array.isArray(state.hiddenCards) ? state.hiddenCards : []);
  return (Array.isArray(state.allCards) ? state.allCards : [])
    .filter(card => card?.id && !hiddenIds.has(card.id));
}

function normalizeSearch(value) {
  return `${value || ''}`.normalize('NFKC').toLowerCase().trim();
}

function getEffectiveLinkType(card) {
  return card?.linkType && card.linkType !== 'other'
    ? card.linkType
    : inferSharedLinkType(card?.url || '', card?.label || '');
}

function getSharedLinkTypeBadge(card) {
  const type = getEffectiveLinkType(card);
  return { ...getSharedLinkTypeMeta(type), type };
}

function hasUsableUrl(card) {
  return isSafeSharedLinkUrl(card?.url || '', { allowEmpty: false });
}

function getSharedLinkHost(card) {
  const rawUrl = `${card?.url || ''}`.trim();
  if (!isSafeWebUrl(rawUrl)) return '';
  try {
    return new URL(rawUrl).host || '';
  } catch (_) {
    return '';
  }
}

function getSharedLinkDisplayMeta(card) {
  if (!hasUsableUrl(card)) return 'URL未設定';
  if (card?.url === 'solar:open') return '天気パネル';
  if (card?.url === 'portal:trouble-report') return 'ポータル内機能';
  return card?.description || getSharedLinkHost(card) || getSharedLinkTypeBadge(card).label || '共有リンク';
}

function getSharedLinkCategoryTone(category) {
  if (category?.isExternal) return CATEGORY_COLORS[2]?.gradient || CATEGORY_COLORS[0]?.gradient || 'var(--gradient-action-primary)';
  return CATEGORY_COLORS.find(item => item.index === category?.colorIndex)?.gradient
    || CATEGORY_COLORS[0]?.gradient
    || 'var(--gradient-action-primary)';
}

function collectSharedLinkSearchCards(cards, queryText) {
  const query = normalizeSearch(queryText);
  if (!query) return cards;
  return cards.filter(card => {
    const haystack = [
      card.label,
      card.url,
      card.description,
      card.linkType,
      ...(Array.isArray(card.tags) ? card.tags : []),
    ].map(normalizeSearch).join(' ');
    return haystack.includes(query);
  });
}

function sortSharedLinkCards(cards = []) {
  const mode = ['category', 'name'].includes(state.sharedLinksSortMode)
    ? state.sharedLinksSortMode
    : 'category';
  const list = [...cards];
  return list.sort((a, b) => {
    const usableDiff = Number(hasUsableUrl(b)) - Number(hasUsableUrl(a));
    if (usableDiff) return usableDiff;
    if (mode === 'name') return `${a.label || ''}`.localeCompare(`${b.label || ''}`, 'ja');
    return (a.order ?? 0) - (b.order ?? 0)
      || `${a.label || ''}`.localeCompare(`${b.label || ''}`, 'ja');
  });
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
}

export function openSharedLinksModal(options = {}) {
  const modal = document.getElementById('shared-links-modal');
  if (!modal) return false;

  sharedLinksScope = options.mode === FAVORITES_SCOPE ? FAVORITES_SCOPE : MANAGE_SCOPE;
  applySharedLinksMode();
  modal.classList.add('visible');
  renderSharedLinksBrowser();

  if (!state.sharedCardsLoaded && !state.sharedCardsLoading) {
    void Promise.resolve(deps.ensureSharedCardsLoaded?.()).catch(err => {
      console.error('Shared links load error:', err);
    });
  }
  requestAnimationFrame(() => {
    if (!modal.classList.contains('visible')) return;
    modal.querySelector('.shared-links-glass')?.focus({ preventScroll: true });
  });
  return true;
}

export function openFavoriteSharedLinksModal(categoryId = '') {
  sharedLinksScope = FAVORITES_SCOPE;
  state.sharedLinksCategory = categoryId || ALL_CATEGORY_ID;
  state.sharedLinksQuery = '';
  return openSharedLinksModal({ mode: FAVORITES_SCOPE });
}

export function closeSharedLinksModal() {
  const modal = document.getElementById('shared-links-modal');
  if (!modal) return;
  modal.classList.remove('visible');
  document.getElementById('shared-links-create-menu')?.removeAttribute('open');
  sharedLinksScope = MANAGE_SCOPE;
  applySharedLinksMode();
}

function applySharedLinksMode() {
  const modal = document.getElementById('shared-links-modal');
  if (!modal) return;
  modal.dataset.sharedLinksMode = sharedLinksScope;
  modal.querySelectorAll('[data-shared-links-scope]').forEach(button => {
    const active = button.dataset.sharedLinksScope === sharedLinksScope;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const createMenu = document.getElementById('shared-links-create-menu');
  if (createMenu) createMenu.hidden = !state.isEditMode;
}

function renderSharedLinksCreateMenu() {
  const host = document.getElementById('shared-links-create-category-list');
  const addCategoryButton = document.getElementById('shared-links-add-category-top');
  const openAiButton = document.getElementById('shared-links-open-ai');
  const aiBox = document.getElementById('shared-link-ai-box');
  if (!host) return;

  const categories = getPublicCategories();
  host.innerHTML = categories.length
    ? categories.map(category => `
        <button type="button" class="shared-links-create-category" data-shared-create-category="${esc(category.id || '')}">
          <span class="shared-links-create-category-icon${Number(category.colorIndex) === 8 ? ' shared-links-create-category-icon--dark' : ''}" style="--shared-link-tone:${esc(getSharedLinkCategoryTone(category))}">
            ${renderHomeIcon(category.icon || 'folder')}
          </span>
          <span>${esc(category.label || '共有リンク')}</span>
        </button>
      `).join('')
    : '<p class="shared-links-create-empty">先にカテゴリを作成してください。</p>';

  host.querySelectorAll('[data-shared-create-category]').forEach(button => {
    button.addEventListener('click', () => {
      document.getElementById('shared-links-create-menu')?.removeAttribute('open');
      deps.openCardModal?.(null, button.dataset.sharedCreateCategory || null);
    });
  });

  if (addCategoryButton) addCategoryButton.hidden = !state.isEditMode;
  if (openAiButton) openAiButton.hidden = !state.isEditMode;
  if (aiBox) aiBox.hidden = !state.isEditMode;
}

function renderSharedLinksOverview(host) {
  if (!host) return;
  const categories = getPublicCategories();
  const cards = getVisibleSharedCards();
  const favoriteIds = new Set(Array.isArray(state.personalFavorites) ? state.personalFavorites : []);
  const favoriteCount = cards.filter(card => favoriteIds.has(card.id)).length;
  const invalidCount = cards.filter(card => !hasUsableUrl(card)).length;

  const items = sharedLinksScope === FAVORITES_SCOPE
    ? [`${favoriteCount}件のお気に入り`]
    : [`${cards.length}件`, `${categories.length}カテゴリ`];
  if (state.isEditMode && invalidCount > 0) items.push(`URL未設定 ${invalidCount}件`);

  host.innerHTML = items.map(item => `<span>${esc(item)}</span>`).join('');
}

function renderSharedLinksViewbar() {
  const host = document.getElementById('shared-links-viewbar');
  if (!host) return;

  const viewMode = state.sharedLinksViewMode === 'list' ? 'list' : 'grid';
  const thumbnailsOn = state.sharedLinksThumbnailMode !== false;
  const sortMode = ['category', 'name'].includes(state.sharedLinksSortMode)
    ? state.sharedLinksSortMode
    : 'category';
  if (state.sharedLinksSortMode !== sortMode) state.sharedLinksSortMode = sortMode;

  host.innerHTML = `
    <div class="shared-links-viewbar-group" role="group" aria-label="表示形式">
      <button type="button" class="shared-links-view-btn${viewMode === 'grid' ? ' active' : ''}" data-shared-view-mode="grid" aria-pressed="${viewMode === 'grid'}" title="グリッド表示">
        ${renderHomeIcon('grid_view')}<span>グリッド</span>
      </button>
      <button type="button" class="shared-links-view-btn${viewMode === 'list' ? ' active' : ''}" data-shared-view-mode="list" aria-pressed="${viewMode === 'list'}" title="リスト表示">
        ${renderHomeIcon('view_list')}<span>リスト</span>
      </button>
    </div>
    <button type="button" class="shared-links-view-btn${thumbnailsOn ? ' active' : ''}" data-shared-thumb-toggle aria-pressed="${thumbnailsOn}" title="サムネイル表示を切り替え">
      ${renderHomeIcon(thumbnailsOn ? 'image' : 'hide_image')}<span>画像</span>
    </button>
    <label class="shared-links-sort-select">
      <span>並び順</span>
      <select id="shared-links-sort-mode" aria-label="共有リンクの並び順">
        <option value="category"${sortMode === 'category' ? ' selected' : ''}>登録順</option>
        <option value="name"${sortMode === 'name' ? ' selected' : ''}>名前順</option>
      </select>
    </label>
  `;

  host.querySelectorAll('[data-shared-view-mode]').forEach(button => {
    button.addEventListener('click', () => {
      const nextMode = button.dataset.sharedViewMode === 'list' ? 'list' : 'grid';
      state.sharedLinksViewMode = nextMode;
      deps.saveSharedLinkPrefs?.();
      renderSharedLinksBrowser();
      requestAnimationFrame(() => {
        document.querySelector(`[data-shared-view-mode="${nextMode}"]`)?.focus({ preventScroll: true });
      });
    });
  });
  host.querySelector('[data-shared-thumb-toggle]')?.addEventListener('click', () => {
    state.sharedLinksThumbnailMode = state.sharedLinksThumbnailMode === false;
    deps.saveSharedLinkPrefs?.();
    renderSharedLinksBrowser();
    requestAnimationFrame(() => {
      document.querySelector('[data-shared-thumb-toggle]')?.focus({ preventScroll: true });
    });
  });
  host.querySelector('#shared-links-sort-mode')?.addEventListener('change', event => {
    state.sharedLinksSortMode = event.target.value === 'name' ? 'name' : 'category';
    deps.saveSharedLinkPrefs?.();
    renderSharedLinksBrowser();
    requestAnimationFrame(() => {
      document.getElementById('shared-links-sort-mode')?.focus({ preventScroll: true });
    });
  });
}

function renderSharedLinkCategoryChips() {
  const host = document.getElementById('shared-links-chip-list');
  if (!host) return;

  const favoriteIds = new Set(Array.isArray(state.personalFavorites) ? state.personalFavorites : []);
  const cards = getVisibleSharedCards();
  const categories = getPublicCategories();
  const scopeCards = sharedLinksScope === FAVORITES_SCOPE
    ? cards.filter(card => favoriteIds.has(card.id))
    : cards;
  const options = [
    { id: ALL_CATEGORY_ID, label: 'すべて', count: scopeCards.length },
    ...categories.map(category => ({
      id: category.id,
      label: category.label,
      count: scopeCards.filter(card => card.category === category.id).length,
    })),
  ];

  if (!options.some(option => option.id === state.sharedLinksCategory)) {
    state.sharedLinksCategory = ALL_CATEGORY_ID;
  }

  host.innerHTML = options.map(option => {
    const active = state.sharedLinksCategory === option.id;
    return `
      <button type="button" class="shared-links-chip${active ? ' active' : ''}" data-shared-link-cat="${esc(option.id)}" aria-pressed="${active}">
        <span>${esc(option.label || 'カテゴリ')}</span><small>${option.count}</small>
      </button>
    `;
  }).join('');

  host.querySelectorAll('[data-shared-link-cat]').forEach(button => {
    button.addEventListener('click', () => {
      const nextCategory = button.dataset.sharedLinkCat || ALL_CATEGORY_ID;
      state.sharedLinksCategory = nextCategory;
      renderSharedLinksBrowser();
      requestAnimationFrame(() => {
        [...document.querySelectorAll('[data-shared-link-cat]')]
          .find(item => item.dataset.sharedLinkCat === nextCategory)
          ?.focus({ preventScroll: true });
      });
    });
  });
}

function renderSharedLinkCardIcon(card, fallbackIcon = 'fa-solid fa-link') {
  if (shouldPreferBrandIcon(card)) {
    const brandIcon = getBrandIconHtmlForCard(card, 'shared-link-app-brand');
    if (brandIcon) return brandIcon;
  }
  const icon = sanitizeIconIdentifier(
    card?.url === 'solar:open' ? 'fa-solid fa-solar-panel' : card?.icon,
    fallbackIcon,
  );
  if (icon.startsWith('svg:')) return SVG_ICONS[icon] || renderHomeIcon('link');
  return renderHomeIcon(icon);
}

function renderSharedLinkPreview(card) {
  const typeMeta = getSharedLinkTypeBadge(card);
  const thumbnailUrl = `${card?.thumbnailUrl || ''}`.trim();
  const showThumbnail = state.sharedLinksThumbnailMode !== false
    && isSafeWebUrl(thumbnailUrl)
    && !`${card?.url || ''}`.startsWith('portal:');
  if (showThumbnail) {
    return `
      <span class="shared-link-app-preview shared-link-app-preview--image">
        <img src="${esc(thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      </span>
    `;
  }
  return `
    <span class="shared-link-app-preview shared-link-app-preview--${esc(typeMeta.tone || 'neutral')}">
      <span class="shared-link-app-type-icon">${renderSharedLinkCardIcon(card, typeMeta.icon)}</span>
      <span class="shared-link-app-type-label">${esc(typeMeta.label)}</span>
    </span>
  `;
}

function configureSharedLinkAnchor(link, card, { readonly = false } = {}) {
  const url = `${card?.url || ''}`.trim();
  if (url === 'solar:open') {
    link.href = '#';
    link.dataset.solarOpen = '1';
    return;
  }
  if (url === 'portal:trouble-report') {
    link.href = '#';
    link.dataset.portalAction = 'trouble-report';
    link.addEventListener('click', event => {
      event.preventDefault();
      deps.openPortalAction?.('trouble-report');
    });
    return;
  }
  if (isSafeWebUrl(url)) {
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return;
  }

  link.href = '#';
  link.addEventListener('click', event => {
    event.preventDefault();
    if (!readonly && state.isEditMode) deps.openCardModal?.(card.id);
  });
}

function buildSharedLinkCardMenu(card, category) {
  const menu = document.createElement('details');
  menu.className = 'shared-link-card-menu';
  menu.innerHTML = `
    <summary title="その他の操作" aria-label="${esc(card.label || '共有リンク')}のその他の操作">${renderHomeIcon('more_vert')}</summary>
    <div class="shared-link-card-menu-panel">
      <button type="button" data-shared-card-action="edit">${renderHomeIcon('edit')}<span>編集</span></button>
      <button type="button" data-shared-card-action="child">${renderHomeIcon('account_tree')}<span>関連リンクを追加</span></button>
    </div>
  `;
  menu.addEventListener('click', event => event.stopPropagation());
  menu.querySelector('[data-shared-card-action="edit"]')?.addEventListener('click', () => {
    menu.open = false;
    deps.openCardModal?.(card.id);
  });
  menu.querySelector('[data-shared-card-action="child"]')?.addEventListener('click', () => {
    menu.open = false;
    deps.openCardModal?.(null, category?.id || null, false, null, card.id);
  });
  return menu;
}

function buildSharedLinkActions(card, category, { readonly = false } = {}) {
  const row = document.createElement('div');
  row.className = 'shared-link-app-actions';
  if (!card?.id || readonly) return row;

  const favoriteIds = Array.isArray(state.personalFavorites) ? state.personalFavorites : [];
  const isFavorite = favoriteIds.includes(card.id);
  const favoriteButton = document.createElement('button');
  favoriteButton.type = 'button';
  favoriteButton.className = `shared-link-app-favorite${isFavorite ? ' active' : ''}`;
  favoriteButton.title = isFavorite ? 'お気に入り解除' : 'お気に入りに追加';
  favoriteButton.setAttribute('aria-label', favoriteButton.title);
  favoriteButton.setAttribute('aria-pressed', String(isFavorite));
  favoriteButton.innerHTML = `<i class="fa-${isFavorite ? 'solid' : 'regular'} fa-star" aria-hidden="true"></i>`;
  favoriteButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    deps.toggleFavorite?.(card.id);
  });
  row.appendChild(favoriteButton);

  if (state.isEditMode) row.appendChild(buildSharedLinkCardMenu(card, category));
  return row;
}

function buildSharedLinkAppTile(card, allCategoryCards, category, options = {}) {
  const readonly = Boolean(options.readonly);
  const flatMode = Boolean(options.flatMode);
  const tile = document.createElement('article');
  tile.className = 'shared-link-app-tile'
    + (options.isChild ? ' shared-link-app-tile--child' : '')
    + (readonly ? ' shared-link-app-tile--readonly' : '')
    + (!hasUsableUrl(card) ? ' shared-link-app-tile--invalid' : '');
  tile.dataset.docId = card.id || '';

  const children = flatMode || options.isChild
    ? []
    : sortSharedLinkCards(allCategoryCards.filter(child => child.parentId === card.id));
  const typeMeta = getSharedLinkTypeBadge(card);
  const link = document.createElement('a');
  link.className = 'shared-link-app-link'
    + (!hasUsableUrl(card) ? ' shared-link-app-link--empty' : '')
    + (state.sharedLinksThumbnailMode === false ? ' shared-link-app-link--no-thumbnail' : '');
  link.title = card.label || '共有リンク';
  configureSharedLinkAnchor(link, card, { readonly });
  link.innerHTML = `
    <span class="shared-link-app-type-badge shared-link-app-type-badge--${esc(typeMeta.tone || 'neutral')}">${renderHomeIcon(typeMeta.icon)}${esc(typeMeta.label)}</span>
    ${renderSharedLinkPreview(card)}
    <span class="shared-link-app-label">${esc(card.label || '共有リンク')}</span>
    <span class="shared-link-app-meta">${esc(getSharedLinkDisplayMeta(card))}</span>
  `;
  tile.appendChild(link);
  tile.appendChild(buildSharedLinkActions(card, category, { readonly }));

  if (children.length > 0) {
    const trayId = `shared-link-children-${String(card.id || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'shared-link-app-children-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', trayId);
    toggle.setAttribute('aria-label', `関連リンク${children.length}件を表示`);
    toggle.innerHTML = `${renderHomeIcon('account_tree')}<span>${children.length}</span>`;

    const tray = document.createElement('div');
    tray.id = trayId;
    tray.className = 'shared-link-children-tray';
    tray.hidden = true;
    children.forEach(child => {
      tray.appendChild(buildSharedLinkAppTile(child, allCategoryCards, category, {
        isChild: true,
        readonly,
      }));
    });
    if (state.isEditMode && !readonly) tray.appendChild(buildSharedLinkAddTile(category, card.id, true));

    toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const expanded = !tile.classList.contains('expanded');
      tile.classList.toggle('expanded', expanded);
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', expanded ? '関連リンクを閉じる' : `関連リンク${children.length}件を表示`);
      tray.hidden = !expanded;
    });
    tile.appendChild(toggle);
    tile.appendChild(tray);
  }

  if (!readonly) {
    tile.addEventListener('contextmenu', event => {
      if (!card.id || typeof deps.showContextMenu !== 'function') return;
      event.preventDefault();
      event.stopPropagation();
      deps.showContextMenu(event, card);
    });
  }
  return tile;
}

function buildSharedLinkListRow(card, allCategoryCards, category, options = {}) {
  const readonly = Boolean(options.readonly);
  const flatMode = Boolean(options.flatMode);
  const row = document.createElement('div');
  row.className = 'shared-link-list-row'
    + (options.isChild ? ' shared-link-list-row--child' : '')
    + (readonly ? ' shared-link-list-row--readonly' : '')
    + (!hasUsableUrl(card) ? ' shared-link-list-row--invalid' : '');
  row.dataset.docId = card.id || '';

  const children = flatMode || options.isChild
    ? []
    : sortSharedLinkCards(allCategoryCards.filter(child => child.parentId === card.id));
  const typeMeta = getSharedLinkTypeBadge(card);
  const link = document.createElement('a');
  link.className = 'shared-link-list-main' + (!hasUsableUrl(card) ? ' shared-link-list-main--empty' : '');
  configureSharedLinkAnchor(link, card, { readonly });
  link.innerHTML = `
    <span class="shared-link-list-icon shared-link-list-icon--${esc(typeMeta.tone || 'neutral')}">${renderHomeIcon(typeMeta.icon)}</span>
    <span class="shared-link-list-copy">
      <strong>${esc(card.label || '共有リンク')}</strong>
      <small>${esc(getSharedLinkDisplayMeta(card))}</small>
    </span>
  `;
  row.appendChild(link);

  const side = document.createElement('div');
  side.className = 'shared-link-list-side';
  side.innerHTML = `<span class="shared-link-list-type">${esc(typeMeta.label)}</span>`;
  side.appendChild(buildSharedLinkActions(card, category, { readonly }));
  row.appendChild(side);

  if (!readonly) {
    row.addEventListener('contextmenu', event => {
      if (!card.id || typeof deps.showContextMenu !== 'function') return;
      event.preventDefault();
      deps.showContextMenu(event, card);
    });
  }

  const fragment = document.createDocumentFragment();
  fragment.appendChild(row);
  children.forEach(child => {
    fragment.appendChild(buildSharedLinkListRow(child, allCategoryCards, category, {
      isChild: true,
      readonly,
    }));
  });
  return fragment;
}

function buildSharedLinkAddTile(category, parentId = null, compact = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'shared-link-add-tile' + (compact ? ' shared-link-add-tile--compact' : '');
  button.innerHTML = `${renderHomeIcon('add')}<span>${compact ? '関連リンクを追加' : 'リンクを追加'}</span>`;
  button.addEventListener('click', () => {
    deps.openCardModal?.(null, category?.id || null, false, null, parentId);
  });
  return button;
}

function buildSharedLinkSection(category, displayCards, allCategoryCards, options = {}) {
  const listMode = state.sharedLinksViewMode === 'list';
  const flatMode = Boolean(options.flatMode);
  const section = document.createElement('section');
  section.className = `shared-link-app-section${listMode ? ' shared-link-app-section--list' : ''}`;
  section.dataset.categoryId = category.id || '';
  const tone = getSharedLinkCategoryTone(category);
  const invalidCount = allCategoryCards.filter(card => !hasUsableUrl(card)).length;

  section.innerHTML = `
    <header class="shared-link-app-section-head">
      <div class="shared-link-app-section-title">
        <span class="shared-link-app-section-icon${Number(category.colorIndex) === 8 ? ' shared-link-app-section-icon--dark' : ''}" style="--shared-link-tone:${esc(tone)}">${renderHomeIcon(category.icon || 'folder')}</span>
        <span>
          <strong>${esc(category.label || '共有リンク')}</strong>
          <small>${allCategoryCards.length}件${state.isEditMode && invalidCount ? `・URL未設定 ${invalidCount}件` : ''}</small>
        </span>
      </div>
      ${state.isEditMode ? `
        <button type="button" class="shared-link-section-edit" title="カテゴリを編集" aria-label="${esc(category.label || 'カテゴリ')}を編集">
          ${renderHomeIcon('more_horiz')}
        </button>
      ` : ''}
    </header>
    <div class="${listMode ? 'shared-link-list' : 'shared-link-app-grid'}"></div>
    <footer class="shared-link-app-section-footer"></footer>
  `;

  section.querySelector('.shared-link-section-edit')?.addEventListener('click', () => {
    const categoryObject = (state.allCategories || []).find(item =>
      (category.docId && item.docId === category.docId)
      || (category.id && item.id === category.id)
    ) || category;
    deps.openCategoryModal?.(categoryObject);
  });

  const content = section.querySelector(listMode ? '.shared-link-list' : '.shared-link-app-grid');
  if (!displayCards.length) {
    const empty = document.createElement('div');
    empty.className = 'shared-link-app-empty';
    empty.textContent = options.searchMode ? 'このカテゴリに一致するリンクはありません。' : 'まだリンクがありません。';
    content.appendChild(empty);
  } else {
    displayCards.forEach(card => {
      content.appendChild(listMode
        ? buildSharedLinkListRow(card, allCategoryCards, category, { flatMode })
        : buildSharedLinkAppTile(card, allCategoryCards, category, { flatMode }));
    });
  }

  const footer = section.querySelector('.shared-link-app-section-footer');
  if (options.previewHiddenCount > 0) {
    const moreButton = document.createElement('button');
    moreButton.type = 'button';
    moreButton.className = 'shared-link-section-more';
    moreButton.innerHTML = `<span>このカテゴリをすべて表示</span>${renderHomeIcon('chevron_right')}`;
    moreButton.addEventListener('click', () => {
      state.sharedLinksCategory = category.id || ALL_CATEGORY_ID;
      renderSharedLinksBrowser();
    });
    footer.appendChild(moreButton);
  } else if (state.isEditMode && !options.searchMode && sharedLinksScope === MANAGE_SCOPE) {
    footer.appendChild(buildSharedLinkAddTile(category));
  }
  if (!footer.childElementCount) footer.remove();
  return section;
}

function renderLoadState(body, status) {
  if (state.sharedCardsLoading) {
    status.textContent = '共有リンクを読み込み中';
    body.innerHTML = `
      <div class="shared-links-loading">
        <div class="shared-links-spinner"></div>
        <p>共有リンクを読み込んでいます…</p>
      </div>
    `;
    return true;
  }

  if (state.sharedCardsLoadError) {
    status.textContent = '共有リンクを読み込めませんでした';
    body.innerHTML = `
      <div class="shared-links-empty-state shared-links-empty-state--error">
        <div class="shared-links-empty-icon">${renderHomeIcon('cloud_off')}</div>
        <h3>通信エラーが発生しました</h3>
        <p>${esc(state.sharedCardsLoadError)}</p>
        <button type="button" class="btn-modal-primary" id="shared-links-retry-btn">再読み込み</button>
      </div>
    `;
    body.querySelector('#shared-links-retry-btn')?.addEventListener('click', () => {
      void deps.ensureSharedCardsLoaded?.(true).catch(err => console.error('Shared links retry error:', err));
    });
    return true;
  }

  if (!state.sharedCardsLoaded) {
    status.textContent = '共有リンクは未読込です';
    body.innerHTML = `
      <div class="shared-links-empty-state">
        <div class="shared-links-empty-icon">${renderHomeIcon('link')}</div>
        <h3>共有リンクを読み込みます</h3>
        <p>必要な時だけ取得するため、ホーム画面を軽く保てます。</p>
        <button type="button" class="btn-modal-primary" id="shared-links-load-btn">読み込む</button>
      </div>
    `;
    body.querySelector('#shared-links-load-btn')?.addEventListener('click', () => {
      void deps.ensureSharedCardsLoaded?.().catch(err => console.error('Shared links load error:', err));
    });
    return true;
  }
  return false;
}

export function renderSharedLinksBrowser() {
  const body = document.getElementById('shared-links-browser-body');
  const status = document.getElementById('shared-links-status');
  const overview = document.getElementById('shared-links-overview');
  const searchInput = document.getElementById('shared-links-search');
  const searchClear = document.getElementById('shared-links-search-clear');
  if (!body || !status) return;

  if (searchInput && searchInput.value !== state.sharedLinksQuery) searchInput.value = state.sharedLinksQuery || '';
  if (searchClear) searchClear.hidden = !`${state.sharedLinksQuery || ''}`.trim();
  applySharedLinksMode();
  renderSharedLinksCreateMenu();
  renderSharedLinkCategoryChips();
  renderSharedLinksViewbar();
  renderSharedLinksOverview(overview);

  if (renderLoadState(body, status)) return;

  const favoriteIds = new Set(Array.isArray(state.personalFavorites) ? state.personalFavorites : []);
  const allVisibleCards = getVisibleSharedCards();
  const scopedCards = sharedLinksScope === FAVORITES_SCOPE
    ? allVisibleCards.filter(card => favoriteIds.has(card.id))
    : allVisibleCards;
  const query = normalizeSearch(state.sharedLinksQuery);
  const categoryFilter = state.sharedLinksCategory || ALL_CATEGORY_ID;
  const categories = getPublicCategories();
  const sections = [];
  let resultCount = 0;

  categories.forEach(category => {
    if (categoryFilter !== ALL_CATEGORY_ID && categoryFilter !== category.id) return;
    const categoryCards = scopedCards.filter(card => card.category === category.id);
    const filteredCards = sortSharedLinkCards(collectSharedLinkSearchCards(categoryCards, query));
    const flatMode = Boolean(query) || sharedLinksScope === FAVORITES_SCOPE;
    const categoryCardIds = new Set(categoryCards.map(card => card.id));
    const topLevelCards = flatMode
      ? filteredCards
      : filteredCards.filter(card => !card.parentId || !categoryCardIds.has(card.parentId));
    if ((query || sharedLinksScope === FAVORITES_SCOPE) && topLevelCards.length === 0) return;

    const previewMode = categoryFilter === ALL_CATEGORY_ID && !query && sharedLinksScope === MANAGE_SCOPE;
    const displayCards = previewMode ? topLevelCards.slice(0, CATEGORY_PREVIEW_LIMIT) : topLevelCards;
    resultCount += flatMode ? filteredCards.length : topLevelCards.length;
    sections.push(buildSharedLinkSection(category, displayCards, categoryCards, {
      flatMode,
      searchMode: Boolean(query),
      previewHiddenCount: Math.max(0, topLevelCards.length - displayCards.length),
    }));
  });

  const scopeLabel = sharedLinksScope === FAVORITES_SCOPE ? 'お気に入り' : '共有リンク';
  status.textContent = query
    ? `「${state.sharedLinksQuery.trim()}」の検索結果 ${resultCount}件`
    : categoryFilter === ALL_CATEGORY_ID
    ? `${scopeLabel} ${scopedCards.length}件`
    : `${categories.find(category => category.id === categoryFilter)?.label || 'カテゴリ'} ${resultCount}件`;

  body.innerHTML = '';
  if (!sections.length) {
    body.innerHTML = `
      <div class="shared-links-empty-state">
        <div class="shared-links-empty-icon">${renderHomeIcon(sharedLinksScope === FAVORITES_SCOPE ? 'star' : 'search')}</div>
        <h3>${sharedLinksScope === FAVORITES_SCOPE ? 'お気に入りはまだありません' : 'リンクが見つかりません'}</h3>
        <p>${sharedLinksScope === FAVORITES_SCOPE ? 'よく使うリンクの星を押すと、ここへまとめられます。' : '検索語またはカテゴリを変更してください。'}</p>
      </div>
    `;
    return;
  }
  sections.forEach(section => body.appendChild(section));
}

function bindSharedSpaceEvents() {
  const modal = document.getElementById('shared-links-modal');
  const closeButton = document.getElementById('shared-links-close');
  const searchInput = document.getElementById('shared-links-search');
  const searchClear = document.getElementById('shared-links-search-clear');
  const addCategoryButton = document.getElementById('shared-links-add-category-top');
  const openAiButton = document.getElementById('shared-links-open-ai');

  if (modal && !modal.dataset.bound) {
    modal.dataset.bound = '1';
    modal.addEventListener('click', event => {
      if (event.target === modal) closeSharedLinksModal();
      const createMenu = document.getElementById('shared-links-create-menu');
      if (createMenu?.open && !event.target.closest('#shared-links-create-menu')) createMenu.open = false;
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
      if (event.key !== 'Escape') return;
      state.sharedLinksQuery = '';
      searchInput.value = '';
      renderSharedLinksBrowser();
    });
  }
  if (searchClear && !searchClear.dataset.bound) {
    searchClear.dataset.bound = '1';
    searchClear.addEventListener('click', () => {
      state.sharedLinksQuery = '';
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      renderSharedLinksBrowser();
    });
  }
  document.querySelectorAll('[data-shared-links-scope]').forEach(button => {
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => {
      sharedLinksScope = button.dataset.sharedLinksScope === FAVORITES_SCOPE ? FAVORITES_SCOPE : MANAGE_SCOPE;
      state.sharedLinksCategory = ALL_CATEGORY_ID;
      renderSharedLinksBrowser();
    });
  });
  if (addCategoryButton && !addCategoryButton.dataset.bound) {
    addCategoryButton.dataset.bound = '1';
    addCategoryButton.addEventListener('click', () => {
      document.getElementById('shared-links-create-menu')?.removeAttribute('open');
      deps.openCategoryModal?.(null);
    });
  }
  if (openAiButton && !openAiButton.dataset.bound) {
    openAiButton.dataset.bound = '1';
    openAiButton.addEventListener('click', () => {
      document.getElementById('shared-links-create-menu')?.removeAttribute('open');
      const aiPanel = document.getElementById('shared-link-ai-box');
      if (aiPanel) aiPanel.open = true;
      setTimeout(() => document.getElementById('shared-link-ai-input')?.focus(), 0);
    });
  }
}
