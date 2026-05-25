// Shared home workspace mount for primary portal tools.
const workspaceMeta = new WeakMap();
let activeWorkspaceElement = null;
const BACK_TO_HOME_LABEL = '\u30db\u30fc\u30e0\u3078\u623b\u308b';

function getElement(target) {
  if (!target) return null;
  if (typeof target === 'string') return document.getElementById(target);
  return target;
}

function ensureHost() {
  let host = document.getElementById('portal-workspace-host');
  if (host) return host;

  const dashboard = document.getElementById('home-dashboard');
  const appMain = document.getElementById('app-main');
  if (!dashboard || !appMain) return null;

  host = document.createElement('section');
  host.id = 'portal-workspace-host';
  host.className = 'portal-workspace-shell';
  host.hidden = true;
  host.innerHTML = '<div class="portal-workspace-mount" id="portal-workspace-mount"></div>';
  dashboard.after(host);
  return host;
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

  setCloseButtonMode(element, meta, true);
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

  if (activeWorkspaceElement === element) activeWorkspaceElement = null;
  scrollAppMainToTop('auto');
  return true;
}

export function closeActiveWorkspaceView() {
  return closeWorkspaceView(activeWorkspaceElement);
}
