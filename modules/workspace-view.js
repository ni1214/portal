import { state } from './state.js';

// Shared home workspace mount for primary portal tools.
const workspaceMeta = new WeakMap();
let activeWorkspaceElement = null;
const BACK_TO_HOME_LABEL = '\u30db\u30fc\u30e0\u3078\u623b\u308b';
const HOME_BUTTON_ID = 'sidebar-home-btn';

const WORKSPACE_HOME_META = {
  route: 'home',
  title: 'ホーム',
  subtitle: '',
  icon: 'home',
  sourceButtonId: HOME_BUTTON_ID,
};

const BOTTOM_NAV_BY_SOURCE = {
  [HOME_BUTTON_ID]: 'bnav-home',
  'btn-task': 'bnav-task',
  'btn-shared-links': 'bnav-more',
  'btn-notice-bell': 'bnav-more',
  'chat-fab': 'bnav-more',
  'ft-fab': 'bnav-more',
  'btn-calendar': 'bnav-more',
  'btn-reqboard': 'bnav-request',
  'btn-trouble-report': 'bnav-more',
  'btn-order-launch': 'bnav-more',
  'btn-property-summary': 'bnav-more',
  'btn-email-assist': 'bnav-more',
};

function getElement(target) {
  if (!target) return null;
  if (typeof target === 'string') return document.getElementById(target);
  return target;
}

function ensureHost() {
  let host = document.getElementById('portal-workspace-host');
  if (host) {
    ensureHostMarkup(host);
    return host;
  }

  const dashboard = document.getElementById('home-dashboard');
  const appMain = document.getElementById('app-main');
  if (!dashboard || !appMain) return null;

  host = document.createElement('section');
  host.id = 'portal-workspace-host';
  host.className = 'portal-workspace-shell';
  host.hidden = true;
  ensureHostMarkup(host);
  dashboard.after(host);
  return host;
}

function ensureHostMarkup(host) {
  if (!host.querySelector('.portal-workspace-chrome')) {
    host.insertAdjacentHTML('afterbegin', `
      <header class="portal-workspace-chrome" aria-live="polite">
        <button class="portal-workspace-home-btn" id="portal-workspace-home-btn" type="button">
          <i class="material-symbols-rounded" aria-hidden="true">home</i>
          <span>ホーム</span>
        </button>
        <div class="portal-workspace-title-block">
          <p class="portal-workspace-kicker" id="portal-workspace-kicker">ワークスペース</p>
          <div class="portal-workspace-title-row">
            <span class="portal-workspace-title-icon">
              <i class="material-symbols-rounded" id="portal-workspace-title-icon" aria-hidden="true">home</i>
            </span>
            <h1 class="portal-workspace-title" id="portal-workspace-title">ホーム</h1>
          </div>
          <p class="portal-workspace-subtitle" id="portal-workspace-subtitle" hidden></p>
        </div>
      </header>
    `);
  }

  if (!host.querySelector('#portal-workspace-mount')) {
    host.insertAdjacentHTML('beforeend', '<div class="portal-workspace-mount" id="portal-workspace-mount"></div>');
  }

  const homeButton = host.querySelector('#portal-workspace-home-btn');
  if (homeButton && homeButton.dataset.workspaceHomeBound !== '1') {
    homeButton.dataset.workspaceHomeBound = '1';
    homeButton.addEventListener('click', () => closeWorkspaceView(activeWorkspaceElement));
  }
}

function normalizeWorkspaceMeta(options = {}) {
  return {
    route: options.route || options.workspaceRoute || 'workspace',
    title: options.title || options.workspaceTitle || 'ワークスペース',
    subtitle: options.subtitle || options.workspaceSubtitle || '',
    icon: options.icon || options.workspaceIcon || 'space_dashboard',
    sourceButtonId: options.sourceButtonId || options.activeButtonId || '',
  };
}

function setElementText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function updateWorkspaceChrome(meta) {
  const host = document.getElementById('portal-workspace-host');
  if (!host) return;

  host.dataset.workspaceRoute = meta.route || 'workspace';
  setElementText('portal-workspace-kicker', meta.route === 'home' ? 'ポータル' : 'ワークスペース');
  setElementText('portal-workspace-title', meta.title || 'ワークスペース');

  const subtitle = document.getElementById('portal-workspace-subtitle');
  if (subtitle) {
    subtitle.textContent = meta.subtitle || '';
    subtitle.hidden = !meta.subtitle;
  }

  const icon = document.getElementById('portal-workspace-title-icon');
  if (icon) icon.textContent = meta.icon || 'home';
}

function setActiveNavigation(sourceButtonId = HOME_BUTTON_ID) {
    document
    .querySelectorAll('.app-sidebar-item.active, .app-sidebar-util.active, .bottom-nav-item.active')
    .forEach(element => element.classList.remove('active'));

  const source = document.getElementById(sourceButtonId);
  source?.classList.add('active');

  const bottomId = BOTTOM_NAV_BY_SOURCE[sourceButtonId];
  if (bottomId) {
    document.getElementById(bottomId)?.classList.add('active');
  }
}

export function setWorkspaceNavigationState(options = {}) {
  const meta = { ...WORKSPACE_HOME_META, ...normalizeWorkspaceMeta(options) };
  state.activeWorkspaceRoute = meta.route;
  state.activeWorkspaceButtonId = meta.sourceButtonId || HOME_BUTTON_ID;
  state.activeWorkspaceTitle = meta.title;
  state.activeWorkspaceSubtitle = meta.subtitle;
  updateWorkspaceChrome(meta);
  setActiveNavigation(state.activeWorkspaceButtonId);
}

export function resetWorkspaceNavigationState() {
  state.activeWorkspaceRoute = WORKSPACE_HOME_META.route;
  state.activeWorkspaceButtonId = WORKSPACE_HOME_META.sourceButtonId;
  state.activeWorkspaceTitle = WORKSPACE_HOME_META.title;
  state.activeWorkspaceSubtitle = WORKSPACE_HOME_META.subtitle;
  updateWorkspaceChrome(WORKSPACE_HOME_META);
  setActiveNavigation(HOME_BUTTON_ID);
}

function scrollAppMainToTop(behavior = 'auto') {
  const appMain = document.getElementById('app-main');
  appMain?.scrollTo({ top: 0, left: 0, behavior });
  window.scrollTo({ top: 0, left: 0, behavior });
}

function setCloseButtonMode(element, meta, toWorkspace) {
  const button = meta.closeSelector ? element.querySelector(meta.closeSelector) : null;
  if (!button) return;

  const icon = button.querySelector('.material-symbols-rounded, .fa-solid, i');
  if (toWorkspace) {
    if (!meta.closeTitle) meta.closeTitle = button.getAttribute('title') || button.getAttribute('aria-label') || '';
    if (!meta.closeIconText && icon?.classList?.contains('material-symbols-rounded')) {
      meta.closeIconText = icon.textContent || '';
    }
    if (!meta.closeIconClass && icon && !icon.classList.contains('material-symbols-rounded')) {
      meta.closeIconClass = icon.getAttribute('class') || '';
    }
    button.setAttribute('title', BACK_TO_HOME_LABEL);
    button.setAttribute('aria-label', BACK_TO_HOME_LABEL);
    if (icon?.classList?.contains('material-symbols-rounded')) {
      icon.textContent = 'home';
    } else if (icon) {
      icon.setAttribute('class', 'fa-solid fa-house');
    }
    return;
  }

  if (meta.closeTitle) {
    button.setAttribute('title', meta.closeTitle);
    button.setAttribute('aria-label', meta.closeTitle);
  }
  if (icon?.classList?.contains('material-symbols-rounded')) {
    icon.textContent = meta.closeIconText || 'close';
  } else if (icon && meta.closeIconClass) {
    icon.setAttribute('class', meta.closeIconClass);
  }
}

function setWorkspaceSemantics(element, meta, toWorkspace) {
  if (toWorkspace) {
    const surface = element.matches('[role="dialog"]')
      ? element
      : element.querySelector('[role="dialog"]');
    if (!surface) return;
    if (!meta.semanticSurface) {
      meta.semanticSurface = surface;
      meta.semanticRole = surface.getAttribute('role');
      meta.semanticAriaModal = surface.getAttribute('aria-modal');
      meta.semanticAriaLabelledby = surface.getAttribute('aria-labelledby');
    }
    surface.setAttribute('role', 'region');
    surface.removeAttribute('aria-modal');
    surface.setAttribute('aria-labelledby', 'portal-workspace-title');
    return;
  }

  const surface = meta.semanticSurface;
  if (!surface) return;
  if (meta.semanticRole === null || meta.semanticRole === undefined) surface.removeAttribute('role');
  else surface.setAttribute('role', meta.semanticRole);
  if (meta.semanticAriaModal === null || meta.semanticAriaModal === undefined) surface.removeAttribute('aria-modal');
  else surface.setAttribute('aria-modal', meta.semanticAriaModal);
  if (meta.semanticAriaLabelledby === null || meta.semanticAriaLabelledby === undefined) surface.removeAttribute('aria-labelledby');
  else surface.setAttribute('aria-labelledby', meta.semanticAriaLabelledby);
}

function attachCloseInterceptor(element, meta) {
  if (meta.clickHandler) return;
  meta.clickHandler = event => {
    if (!isWorkspaceViewOpen(element)) return;
    const closeHit = meta.closeSelector && event.target.closest(meta.closeSelector);
    const backdropHit = meta.closeOnBackdrop !== false && event.target === element;
    if (!closeHit && !backdropHit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeWorkspaceView(element);
  };
  element.addEventListener('click', meta.clickHandler, true);
}

function detachCloseInterceptor(element, meta) {
  if (!meta?.clickHandler) return;
  element.removeEventListener('click', meta.clickHandler, true);
  meta.clickHandler = null;
}

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!activeWorkspaceElement) return;
  if (!isWorkspaceViewOpen(activeWorkspaceElement)) return;
  const sharedLinksSearch = event.target?.closest?.('#shared-links-search');
  if (sharedLinksSearch?.value) return;
  const secondaryModalOpen = Array.from(document.querySelectorAll('.modal-overlay.visible'))
    .some(modal => modal !== activeWorkspaceElement && !activeWorkspaceElement.contains(modal));
  if (secondaryModalOpen) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeWorkspaceView(activeWorkspaceElement);
}, true);

export function isWorkspaceViewOpen(target = activeWorkspaceElement) {
  const element = getElement(target);
  return !!element && element.classList.contains('portal-workspace-mode');
}

export function getActiveWorkspaceElement() {
  return activeWorkspaceElement;
}

export function openWorkspaceView(options = {}) {
  const element = getElement(options.element || options.elementId);
  const host = ensureHost();
  const appMain = document.getElementById('app-main');
  if (!element || !host || !appMain) return false;

  if (activeWorkspaceElement && activeWorkspaceElement !== element) {
    closeWorkspaceView(activeWorkspaceElement);
  }

  let meta = workspaceMeta.get(element);
  if (!meta) {
    meta = {
      originalParent: element.parentNode,
      originalNextSibling: element.nextSibling,
      originalStyle: element.getAttribute('style'),
      hadHidden: element.hasAttribute('hidden'),
    };
    workspaceMeta.set(element, meta);
  }

  meta.closeAction = options.closeAction || meta.closeAction;
  meta.closeSelector = options.closeSelector || meta.closeSelector;
  meta.closeOnBackdrop = options.closeOnBackdrop;
  meta.hideOnClose = !!options.hideOnClose;
  meta.extraClass = options.extraClass || '';

  const mount = host.querySelector('#portal-workspace-mount') || host;
  mount.innerHTML = '';
  mount.appendChild(element);

  element.classList.add('portal-workspace-mode');
  if (meta.extraClass) element.classList.add(...meta.extraClass.split(/\s+/).filter(Boolean));
  element.classList.add('visible');
  element.removeAttribute('hidden');
  host.hidden = false;
  appMain.classList.add('portal-workspace-active', 'home-compact');
  activeWorkspaceElement = element;
  setWorkspaceNavigationState(options);

  setCloseButtonMode(element, meta, true);
  setWorkspaceSemantics(element, meta, true);
  attachCloseInterceptor(element, meta);

  scrollAppMainToTop('auto');
  return true;
}

export function closeWorkspaceView(target = activeWorkspaceElement) {
  const element = getElement(target);
  if (!element || !element.classList.contains('portal-workspace-mode')) return false;

  const meta = workspaceMeta.get(element) || {};
  try {
    meta.closeAction?.();
  } catch (err) {
    console.error('Workspace close action failed:', err);
  }

  detachCloseInterceptor(element, meta);
  setCloseButtonMode(element, meta, false);
  setWorkspaceSemantics(element, meta, false);
  element.classList.remove('portal-workspace-mode');
  if (meta.extraClass) element.classList.remove(...meta.extraClass.split(/\s+/).filter(Boolean));
  element.classList.remove('visible');
  element.classList.remove('open');
  if (meta.hideOnClose || meta.hadHidden) element.setAttribute('hidden', '');

  if (meta.originalStyle === null || meta.originalStyle === undefined) {
    element.removeAttribute('style');
  } else {
    element.setAttribute('style', meta.originalStyle);
  }

  if (meta.originalParent) {
    meta.originalParent.insertBefore(element, meta.originalNextSibling || null);
  }

  const host = document.getElementById('portal-workspace-host');
  const mount = host?.querySelector('#portal-workspace-mount');
  if (mount) mount.innerHTML = '';
  if (host) host.hidden = true;
  document.getElementById('app-main')?.classList.remove('portal-workspace-active');
  resetWorkspaceNavigationState();

  if (activeWorkspaceElement === element) activeWorkspaceElement = null;
  scrollAppMainToTop('auto');
  return true;
}

export function closeActiveWorkspaceView() {
  return closeWorkspaceView(activeWorkspaceElement);
}
