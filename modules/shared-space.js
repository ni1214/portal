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
const ALL_SCOPE = 'all';
const FAVORITES_SCOPE = 'favorites';

let sharedLinksScope = ALL_SCOPE;
let sharedLinksManageMode = false;

function renderHomeIcon(icon, className = '') {
  if (!icon) return '';
  const iconName = sanitizeIconIdentifier(icon, 'link');
  const classAttr = className ? ` ${esc(className)}` : '';
  const isMaterialSymbol = !iconName.includes(' ')
    && !iconName.startsWith('fa-')
    && !iconName.startsWith('svg:');
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

function getCategoryById(categoryId) {
  return getPublicCategories().find(category => category.id === categoryId) || null;
}

function getPreferredCategoryId() {
  if (state.sharedLinksCategory !== ALL_CATEGORY_ID && getCategoryById(state.sharedLinksCategory)) {
    return state.sharedLinksCategory;
  }
  return getPublicCategories()[0]?.id || null;
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
  if (card?.url === 'solar:open') return '天気・太陽光発電';
  if (card?.url === 'portal:trouble-report') return 'ポータル内機能';
  return card?.description || getSharedLinkHost(card) || getSharedLinkTypeBadge(card).label || '共有リンク';
}

function getSharedLinkCategoryTone(category) {
  if (category?.isExternal) {
    return CATEGORY_COLORS[2]?.gradient
      || CATEGORY_COLORS[0]?.gradient
      || 'var(--gradient-action-primary)';
  }
  return CATEGORY_COLORS.find(item => item.index === category?.colorIndex)?.gradient
    || CATEGORY_COLORS[0]?.gradient
    || 'var(--gradient-action-primary)';
}

function collectSharedLinkSearchCards(cards, queryText) {
  const query = normalizeSearch(queryText);
  if (!query) return cards;
  const categoryMap = new Map(getPublicCategories().map(category => [category.id, category]));
  return cards.filter(card => {
    const haystack = [
      card.label,
      card.url,
      card.description,
      card.linkType,
      categoryMap.get(card.category)?.label,
      ...(Array.isArray(card.tags) ? card.tags : []),
    ].map(normalizeSearch).join(' ');
    return haystack.includes(query);
  });
}

function sortSharedLinkCards(cards = []) {
  const mode = ['category', 'name'].includes(state.sharedLinksSortMode)
    ? state.sharedLinksSortMode
    : 'category';
  const categoryOrder = new Map(getPublicCategories().map((category, index) => [
    category.id,
    Number.isFinite(category.order) ? category.order : index,
  ]));
  return [...cards].sort((a, b) => {
    const usableDiff = Number(hasUsableUrl(b)) - Number(hasUsableUrl(a));
    if (usableDiff) return usableDiff;
    if (mode === 'name') return `${a.label || ''}`.localeCompare(`${b.label || ''}`, 'ja');
    const aCategoryOrder = categoryOrder.get(a.category) ?? a.categoryOrder ?? 999;
    const bCategoryOrder = categoryOrder.get(b.category) ?? b.categoryOrder ?? 999;
    return aCategoryOrder - bCategoryOrder
      || (a.order ?? 0) - (b.order ?? 0)
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

  sharedLinksScope = options.mode === FAVORITES_SCOPE ? FAVORITES_SCOPE : ALL_SCOPE;
  sharedLinksManageMode = false;
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
    document.getElementById('shared-links-search')?.focus({ preventScroll: true });
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
  document.getElementById('shared-links-actions-menu')?.removeAttribute('open');
  sharedLinksScope = ALL_SCOPE;
  sharedLinksManageMode = false;
  applySharedLinksMode();
}

function applySharedLinksMode() {
  const modal = document.getElementById('shared-links-modal');
  if (!modal) return;
  modal.dataset.sharedLinksMode = sharedLinksScope;
  modal.classList.toggle('shared-links-manage-mode', sharedLinksManageMode);

  const addLinkButton = document.getElementById('shared-links-add-link');
  const actionsMenu = document.getElementById('shared-links-actions-menu');
  const manageButton = document.getElementById('shared-links-manage-toggle');
  if (addLinkButton) addLinkButton.hidden = !state.isEditMode;
  if (actionsMenu) {
    actionsMenu.hidden = !state.isEditMode;
    if (!state.isEditMode) actionsMenu.open = false;
  }
  if (manageButton) {
    manageButton.setAttribute('aria-pressed', String(sharedLinksManageMode));
    manageButton.classList.toggle('active', sharedLinksManageMode);
    const label = manageButton.querySelector('span');
    const icon = manageButton.querySelector('.material-symbols-rounded');
    if (label) label.textContent = sharedLinksManageMode ? '整理を終了' : 'リンクを整理';
    if (icon) icon.textContent = sharedLinksManageMode ? 'done' : 'edit';
  }
}

function setSharedLinksNavigation(nextValue) {
  if (nextValue === FAVORITES_SCOPE) {
    sharedLinksScope = FAVORITES_SCOPE;
    state.sharedLinksCategory = ALL_CATEGORY_ID;
  } else if (nextValue === ALL_SCOPE) {
    sharedLinksScope = ALL_SCOPE;
    state.sharedLinksCategory = ALL_CATEGORY_ID;
  } else {
    sharedLinksScope = ALL_SCOPE;
    state.sharedLinksCategory = getCategoryById(nextValue)?.id || ALL_CATEGORY_ID;
  }
  renderSharedLinksBrowser();
}

function getActiveNavigationValue() {
  if (sharedLinksScope === FAVORITES_SCOPE) return FAVORITES_SCOPE;
  return state.sharedLinksCategory === ALL_CATEGORY_ID
    ? ALL_SCOPE
    : state.sharedLinksCategory;
}

function renderSharedLinksNavigation() {
  const host = document.getElementById('shared-links-chip-list');
  const select = document.getElementById('shared-links-category-select');
  if (!host || !select) return;

  const categories = getPublicCategories();
  if (
    state.sharedLinksCategory !== ALL_CATEGORY_ID
    && !categories.some(category => category.id === state.sharedLinksCategory)
  ) {
    state.sharedLinksCategory = ALL_CATEGORY_ID;
  }

  const cards = getVisibleSharedCards();
  const favoriteIds = new Set(Array.isArray(state.personalFavorites) ? state.personalFavorites : []);
  const favoriteCount = cards.filter(card => favoriteIds.has(card.id)).length;
  const activeValue = getActiveNavigationValue();

  const makeNavButton = ({ value, icon, label, count, tone = '' }) => {
    const active = activeValue === value;
    return `
      <button type="button" class="shared-links-nav-item${active ? ' active' : ''}" data-shared-nav="${esc(value)}" aria-pressed="${active}"${active ? ' aria-current="page"' : ''}>
        <span class="shared-links-nav-icon"${tone ? ` style="--shared-link-tone:${esc(tone)}"` : ''}>${renderHomeIcon(icon)}</span>
        <span class="shared-links-nav-label">${esc(label)}</span>
        <small>${count}</small>
      </button>
    `;
  };

  host.innerHTML = `
    <div class="shared-links-nav-primary">
      ${makeNavButton({ value: ALL_SCOPE, icon: 'apps', label: 'すべてのリンク', count: cards.length })}
      ${makeNavButton({ value: FAVORITES_SCOPE, icon: 'star', label: 'お気に入り', count: favoriteCount })}
    </div>
    <p class="shared-links-nav-heading">カテゴリ</p>
    <div class="shared-links-nav-categories">
      ${categories.map(category => makeNavButton({
        value: category.id,
        icon: category.icon || 'folder',
        label: category.label || 'カテゴリ',
        count: cards.filter(card => card.category === category.id).length,
        tone: getSharedLinkCategoryTone(category),
      })).join('')}
    </div>
  `;

  select.innerHTML = `
    <option value="${ALL_SCOPE}">すべてのリンク（${cards.length}）</option>
    <option value="${FAVORITES_SCOPE}">お気に入り（${favoriteCount}）</option>
    <optgroup label="カテゴリ">
      ${categories.map(category => `
        <option value="${esc(category.id)}">${esc(category.label || 'カテゴリ')}（${cards.filter(card => card.category === category.id).length}）</option>
      `).join('')}
    </optgroup>
  `;
  select.value = activeValue;

  host.querySelectorAll('[data-shared-nav]').forEach(button => {
    button.addEventListener('click', () => {
      const nextValue = button.dataset.sharedNav || ALL_SCOPE;
      setSharedLinksNavigation(nextValue);
      requestAnimationFrame(() => {
        document.querySelector(`[data-shared-nav="${CSS.escape(nextValue)}"]`)?.focus({ preventScroll: true });
      });
    });
  });

  const editCategoryButton = document.getElementById('shared-links-edit-category');
  const selectedCategory = sharedLinksScope === ALL_SCOPE
    ? getCategoryById(state.sharedLinksCategory)
    : null;
  if (editCategoryButton) {
    editCategoryButton.hidden = !selectedCategory;
    editCategoryButton.dataset.categoryId = selectedCategory?.id || '';
    const label = editCategoryButton.querySelector('span');
    if (label && selectedCategory) label.textContent = `「${selectedCategory.label || 'カテゴリ'}」を編集`;
  }
}

function renderSharedLinksOverview(host) {
  if (!host) return;
  host.hidden = true;
  host.textContent = '';
}

function renderSharedLinksViewbar() {
  const host = document.getElementById('shared-links-viewbar');
  if (!host) return;

  const menuWasOpen = Boolean(host.querySelector('details')?.open);
  const viewMode = state.sharedLinksViewMode === 'list' ? 'list' : 'grid';
  const thumbnailsOn = state.sharedLinksThumbnailMode !== false;
  const sortMode = ['category', 'name'].includes(state.sharedLinksSortMode)
    ? state.sharedLinksSortMode
    : 'category';
  if (state.sharedLinksSortMode !== sortMode) state.sharedLinksSortMode = sortMode;

  host.innerHTML = `
    <details class="shared-links-display-menu"${menuWasOpen ? ' open' : ''}>
      <summary>
        ${renderHomeIcon('tune')}
        <span>表示</span>
      </summary>
      <div class="shared-links-display-panel">
        <p>表示形式</p>
        <div class="shared-links-viewbar-group" role="group" aria-label="表示形式">
          <button type="button" class="shared-links-view-btn${viewMode === 'grid' ? ' active' : ''}" data-shared-view-mode="grid" aria-pressed="${viewMode === 'grid'}">
            ${renderHomeIcon('grid_view')}<span>グリッド</span>
          </button>
          <button type="button" class="shared-links-view-btn${viewMode === 'list' ? ' active' : ''}" data-shared-view-mode="list" aria-pressed="${viewMode === 'list'}">
            ${renderHomeIcon('view_list')}<span>一覧</span>
          </button>
        </div>
        <button type="button" class="shared-links-thumb-toggle${thumbnailsOn ? ' active' : ''}" data-shared-thumb-toggle aria-pressed="${thumbnailsOn}">
          ${renderHomeIcon(thumbnailsOn ? 'image' : 'hide_image')}
          <span>登録画像を表示</span>
          <span class="shared-links-toggle-mark" aria-hidden="true"></span>
        </button>
        <label class="shared-links-sort-select">
          <span>並び順</span>
          <select id="shared-links-sort-mode" aria-label="共有リンクの並び順">
            <option value="category"${sortMode === 'category' ? ' selected' : ''}>カテゴリ・登録順</option>
            <option value="name"${sortMode === 'name' ? ' selected' : ''}>名前順</option>
          </select>
        </label>
      </div>
    </details>
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
      <span class="shared-link-app-icon shared-link-app-icon--image">
        <img src="${esc(thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      </span>
    `;
  }
  return `
    <span class="shared-link-app-icon shared-link-app-icon--${esc(typeMeta.tone || 'neutral')}">
      ${renderSharedLinkCardIcon(card, typeMeta.icon)}
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
    if (!readonly && state.isEditMode && sharedLinksManageMode) deps.openCardModal?.(card.id);
  });
}

function buildSharedLinkCardMenu(card, category) {
  const allowRelatedLink = !card?.parentId;
  const menu = document.createElement('details');
  menu.className = 'shared-link-card-menu';
  menu.innerHTML = `
    <summary title="その他の操作" aria-label="${esc(card.label || '共有リンク')}のその他の操作">${renderHomeIcon('more_vert')}</summary>
    <div class="shared-link-card-menu-panel">
      <button type="button" data-shared-card-action="edit">${renderHomeIcon('edit')}<span>編集</span></button>
      ${allowRelatedLink
        ? `<button type="button" data-shared-card-action="child">${renderHomeIcon('account_tree')}<span>関連リンクを追加</span></button>`
        : ''}
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

  if (state.isEditMode && sharedLinksManageMode) {
    row.appendChild(buildSharedLinkCardMenu(card, category));
  }
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
  tile.setAttribute('role', 'listitem');

  const children = flatMode || options.isChild
    ? []
    : sortSharedLinkCards(allCategoryCards.filter(child => child.parentId === card.id));
  const link = document.createElement('a');
  link.className = 'shared-link-app-link' + (!hasUsableUrl(card) ? ' shared-link-app-link--empty' : '');
  link.title = card.label || '共有リンク';
  configureSharedLinkAnchor(link, card, { readonly });
  link.innerHTML = `
    ${renderSharedLinkPreview(card)}
    <span class="shared-link-app-copy">
      <strong class="shared-link-app-label">${esc(card.label || '共有リンク')}</strong>
      <small class="shared-link-app-meta">${esc(getSharedLinkDisplayMeta(card))}</small>
      <span class="shared-link-app-category">${esc(category?.label || '未分類')}</span>
    </span>
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
    toggle.innerHTML = `${renderHomeIcon('account_tree')}<span>関連リンク ${children.length}</span>${renderHomeIcon('expand_more', 'shared-link-children-chevron')}`;

    const tray = document.createElement('div');
    tray.id = trayId;
    tray.className = 'shared-link-children-tray';
    tray.setAttribute('role', 'list');
    tray.hidden = true;
    children.forEach(child => {
      tray.appendChild(buildSharedLinkAppTile(child, allCategoryCards, category, {
        isChild: true,
        readonly,
      }));
    });

    toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const expanded = !tile.classList.contains('expanded');
      tile.classList.toggle('expanded', expanded);
      toggle.setAttribute('aria-expanded', String(expanded));
      tray.hidden = !expanded;
    });
    tile.appendChild(toggle);
    tile.appendChild(tray);
  }

  if (!readonly && sharedLinksManageMode) {
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
  row.setAttribute('role', 'listitem');

  const children = flatMode || options.isChild
    ? []
    : sortSharedLinkCards(allCategoryCards.filter(child => child.parentId === card.id));
  const link = document.createElement('a');
  link.className = 'shared-link-list-main' + (!hasUsableUrl(card) ? ' shared-link-list-main--empty' : '');
  configureSharedLinkAnchor(link, card, { readonly });
  link.innerHTML = `
    ${renderSharedLinkPreview(card)}
    <span class="shared-link-list-copy">
      <strong>${esc(card.label || '共有リンク')}</strong>
      <small>${esc(getSharedLinkDisplayMeta(card))}</small>
    </span>
  `;
  row.appendChild(link);

  const side = document.createElement('div');
  side.className = 'shared-link-list-side';
  side.innerHTML = `<span class="shared-link-list-category">${esc(category?.label || '未分類')}</span>`;
  side.appendChild(buildSharedLinkActions(card, category, { readonly }));
  row.appendChild(side);

  if (!readonly && sharedLinksManageMode) {
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

function renderLoadState(body, status) {
  if (state.sharedCardsLoadError) {
    status.textContent = '共有リンクを読み込めませんでした';
    body.innerHTML = `
      <div class="shared-links-empty-state shared-links-empty-state--error">
        <div class="shared-links-empty-icon">${renderHomeIcon('cloud_off')}</div>
        <h3>共有リンクを読み込めませんでした</h3>
        <p>${esc(state.sharedCardsLoadError)}</p>
        <button type="button" class="btn-modal-primary" id="shared-links-retry-btn">再試行</button>
      </div>
    `;
    body.querySelector('#shared-links-retry-btn')?.addEventListener('click', () => {
      void deps.ensureSharedCardsLoaded?.(true).catch(err => console.error('Shared links retry error:', err));
    });
    return true;
  }

  if (state.sharedCardsLoading || !state.sharedCardsLoaded) {
    status.textContent = '共有リンクを読み込み中';
    body.innerHTML = `
      <div class="shared-links-skeleton" aria-label="共有リンクを読み込み中">
        ${Array.from({ length: 8 }, (_, index) => `
          <div class="shared-links-skeleton-item" style="--skeleton-index:${index}">
            <span></span><div><strong></strong><small></small></div>
          </div>
        `).join('')}
      </div>
    `;
    return true;
  }
  return false;
}

function renderSharedLinksEmptyState(body, {
  query = '',
  category = null,
  isFavorites = false,
  hasAnyCards = false,
} = {}) {
  let icon = 'search';
  let title = 'リンクが見つかりません';
  let message = '検索語またはカテゴリを変更してください。';
  let action = '';

  if (isFavorites) {
    icon = 'star';
    if (category) {
      title = `「${esc(category.label || 'カテゴリ')}」のお気に入りはありません`;
      message = 'このカテゴリでよく使うリンクの星を押すと、ここに表示されます。';
      action = '<button type="button" class="btn-modal-secondary" data-shared-empty-action="favorites-all">すべてのお気に入りを見る</button>';
    } else {
      title = 'お気に入りはまだありません';
      message = 'よく使うリンクの星を押すと、ここにまとめられます。';
      action = '<button type="button" class="btn-modal-secondary" data-shared-empty-action="all">すべてのリンクを見る</button>';
    }
  } else if (query) {
    message = `「${esc(query)}」に一致する共有リンクはありません。`;
    action = '<button type="button" class="btn-modal-secondary" data-shared-empty-action="clear">検索をクリア</button>';
  } else if (category) {
    icon = 'folder_open';
    title = 'このカテゴリにはリンクがありません';
    message = '必要な業務リンクをこのカテゴリへ追加できます。';
    if (state.isEditMode) {
      action = '<button type="button" class="btn-modal-primary" data-shared-empty-action="add">リンクを追加</button>';
    }
  } else if (!hasAnyCards) {
    icon = 'add_link';
    title = 'まだ共有リンクがありません';
    message = '最初の業務リンクを登録すると、ここからすぐに開けます。';
    if (state.isEditMode) {
      action = '<button type="button" class="btn-modal-primary" data-shared-empty-action="add">最初のリンクを追加</button>';
    }
  }

  body.innerHTML = `
    <div class="shared-links-empty-state">
      <div class="shared-links-empty-icon">${renderHomeIcon(icon)}</div>
      <h3>${title}</h3>
      <p>${message}</p>
      ${action}
    </div>
  `;
  body.querySelector('[data-shared-empty-action="all"]')?.addEventListener('click', () => {
    setSharedLinksNavigation(ALL_SCOPE);
  });
  body.querySelector('[data-shared-empty-action="favorites-all"]')?.addEventListener('click', () => {
    sharedLinksScope = FAVORITES_SCOPE;
    state.sharedLinksCategory = ALL_CATEGORY_ID;
    renderSharedLinksBrowser();
  });
  body.querySelector('[data-shared-empty-action="clear"]')?.addEventListener('click', () => {
    state.sharedLinksQuery = '';
    const input = document.getElementById('shared-links-search');
    if (input) input.value = '';
    renderSharedLinksBrowser();
    requestAnimationFrame(() => input?.focus({ preventScroll: true }));
  });
  body.querySelector('[data-shared-empty-action="add"]')?.addEventListener('click', () => {
    deps.openCardModal?.(null, getPreferredCategoryId());
  });
}

export function renderSharedLinksBrowser() {
  const body = document.getElementById('shared-links-browser-body');
  const status = document.getElementById('shared-links-status');
  const overview = document.getElementById('shared-links-overview');
  const searchInput = document.getElementById('shared-links-search');
  const searchClear = document.getElementById('shared-links-search-clear');
  if (!body || !status) return;

  if (searchInput && searchInput.value !== state.sharedLinksQuery) {
    searchInput.value = state.sharedLinksQuery || '';
  }
  if (searchClear) searchClear.hidden = !`${state.sharedLinksQuery || ''}`.trim();

  applySharedLinksMode();
  renderSharedLinksNavigation();
  renderSharedLinksViewbar();
  renderSharedLinksOverview(overview);

  if (renderLoadState(body, status)) return;

  const favoriteIds = new Set(Array.isArray(state.personalFavorites) ? state.personalFavorites : []);
  const allVisibleCards = getVisibleSharedCards();
  const scopedCards = sharedLinksScope === FAVORITES_SCOPE
    ? allVisibleCards.filter(card => favoriteIds.has(card.id))
    : allVisibleCards;
  const categoryFilter = state.sharedLinksCategory || ALL_CATEGORY_ID;
  const category = categoryFilter === ALL_CATEGORY_ID ? null : getCategoryById(categoryFilter);
  const categoryCards = category
    ? scopedCards.filter(card => card.category === category.id)
    : scopedCards;
  const query = normalizeSearch(state.sharedLinksQuery);
  const filteredCards = sortSharedLinkCards(collectSharedLinkSearchCards(categoryCards, query));
  const flatMode = Boolean(query) || sharedLinksScope === FAVORITES_SCOPE;
  const categoryCardIds = new Set(categoryCards.map(card => card.id));
  const topLevelCards = flatMode
    ? filteredCards
    : filteredCards.filter(card => !card.parentId || !categoryCardIds.has(card.parentId));
  const scopeLabel = sharedLinksScope === FAVORITES_SCOPE
    ? (category ? `お気に入り・${category.label || 'カテゴリ'}` : 'お気に入り')
    : category?.label || 'すべてのリンク';

  status.textContent = query
    ? `「${state.sharedLinksQuery.trim()}」の検索結果 ${filteredCards.length}件`
    : `${scopeLabel} ${filteredCards.length}件`;

  body.innerHTML = '';
  body.dataset.viewMode = state.sharedLinksViewMode === 'list' ? 'list' : 'grid';
  body.dataset.manageMode = String(sharedLinksManageMode);
  if (!topLevelCards.length) {
    renderSharedLinksEmptyState(body, {
      query: state.sharedLinksQuery.trim(),
      category,
      isFavorites: sharedLinksScope === FAVORITES_SCOPE,
      hasAnyCards: allVisibleCards.length > 0,
    });
    return;
  }

  const categoryMap = new Map(getPublicCategories().map(item => [item.id, item]));
  const collection = document.createElement('div');
  collection.className = state.sharedLinksViewMode === 'list'
    ? 'shared-link-list'
    : 'shared-link-app-grid';
  collection.setAttribute('role', 'list');
  topLevelCards.forEach(card => {
    const cardCategory = categoryMap.get(card.category) || {
      id: card.category || '',
      label: '未分類',
      icon: 'folder',
    };
    const relatedSource = categoryCards.filter(item => item.category === card.category);
    collection.appendChild(
      state.sharedLinksViewMode === 'list'
        ? buildSharedLinkListRow(card, relatedSource, cardCategory, { flatMode })
        : buildSharedLinkAppTile(card, relatedSource, cardCategory, { flatMode }),
    );
  });
  body.appendChild(collection);
}

function bindSharedSpaceEvents() {
  const modal = document.getElementById('shared-links-modal');
  const closeButton = document.getElementById('shared-links-close');
  const searchInput = document.getElementById('shared-links-search');
  const searchClear = document.getElementById('shared-links-search-clear');
  const addLinkButton = document.getElementById('shared-links-add-link');
  const manageButton = document.getElementById('shared-links-manage-toggle');
  const addCategoryButton = document.getElementById('shared-links-add-category-top');
  const editCategoryButton = document.getElementById('shared-links-edit-category');
  const categorySelect = document.getElementById('shared-links-category-select');

  if (modal && !modal.dataset.bound) {
    modal.dataset.bound = '1';
    modal.addEventListener('click', event => {
      if (event.target === modal) closeSharedLinksModal();
      const actionsMenu = document.getElementById('shared-links-actions-menu');
      if (actionsMenu?.open && !event.target.closest('#shared-links-actions-menu')) actionsMenu.open = false;
      const displayMenu = document.querySelector('.shared-links-display-menu');
      if (displayMenu?.open && !event.target.closest('.shared-links-display-menu')) displayMenu.open = false;
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
  if (addLinkButton && !addLinkButton.dataset.bound) {
    addLinkButton.dataset.bound = '1';
    addLinkButton.addEventListener('click', () => {
      const categoryId = getPreferredCategoryId();
      if (categoryId) {
        deps.openCardModal?.(null, categoryId);
      } else {
        deps.openCategoryModal?.(null);
      }
    });
  }
  if (manageButton && !manageButton.dataset.bound) {
    manageButton.dataset.bound = '1';
    manageButton.addEventListener('click', () => {
      sharedLinksManageMode = !sharedLinksManageMode;
      document.getElementById('shared-links-actions-menu')?.removeAttribute('open');
      renderSharedLinksBrowser();
    });
  }
  if (addCategoryButton && !addCategoryButton.dataset.bound) {
    addCategoryButton.dataset.bound = '1';
    addCategoryButton.addEventListener('click', () => {
      document.getElementById('shared-links-actions-menu')?.removeAttribute('open');
      deps.openCategoryModal?.(null);
    });
  }
  if (editCategoryButton && !editCategoryButton.dataset.bound) {
    editCategoryButton.dataset.bound = '1';
    editCategoryButton.addEventListener('click', () => {
      const category = getCategoryById(editCategoryButton.dataset.categoryId || '');
      if (!category) return;
      document.getElementById('shared-links-actions-menu')?.removeAttribute('open');
      deps.openCategoryModal?.(category);
    });
  }
  if (categorySelect && !categorySelect.dataset.bound) {
    categorySelect.dataset.bound = '1';
    categorySelect.addEventListener('change', event => {
      setSharedLinksNavigation(event.target.value || ALL_SCOPE);
      requestAnimationFrame(() => categorySelect.focus({ preventScroll: true }));
    });
  }
}
