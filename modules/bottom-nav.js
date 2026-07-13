/**
 * Mobile bottom navigation and the More drawer.
 */

export function initBottomNav() {
  const bnavHome = document.getElementById('bnav-home');
  const bnavTask = document.getElementById('bnav-task');
  const bnavRequest = document.getElementById('bnav-request') || document.getElementById('bnav-chat');
  const bnavNotice = document.getElementById('bnav-notice');
  const bnavMore = document.getElementById('bnav-more');

  const moreDrawer = document.getElementById('more-drawer');
  const moreDrawerBackdrop = document.getElementById('more-drawer-backdrop');
  const moreDrawerClose = document.getElementById('more-drawer-close');

  if (!bnavHome) return;

  normalizeBottomNav(bnavRequest, bnavNotice, bnavTask);
  configureMoreDrawerItems();

  bnavHome.addEventListener('click', () => {
    document.getElementById('sidebar-home-btn')?.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActive(bnavHome);
  });

  if (bnavTask) {
    bnavTask.addEventListener('click', () => {
      document.getElementById('btn-task')?.click();
      setActive(bnavTask);
    });
  }

  if (bnavRequest) {
    bnavRequest.addEventListener('click', event => {
      event?.stopPropagation?.();
      document.getElementById('btn-reqboard')?.click();
      setActive(bnavRequest);
    });
  }

  if (bnavMore) {
    bnavMore.addEventListener('click', () => {
      if (moreDrawer) {
        moreDrawer.hidden = false;
        document.body.style.overflow = 'hidden';
      }
      setActive(bnavMore);
    });
  }

  moreDrawerClose?.addEventListener('click', closeMoreDrawer);
  moreDrawerBackdrop?.addEventListener('click', closeMoreDrawer);

  document.querySelectorAll('.more-drawer-item[data-target]').forEach(item => {
    item.addEventListener('click', () => {
      const target = document.getElementById(item.dataset.target);
      if (!target) return;
      closeMoreDrawer();
      setTimeout(() => target.click(), 50);
    });
  });

  syncBadges();

  function closeMoreDrawer() {
    if (moreDrawer) {
      moreDrawer.hidden = true;
      document.body.style.overflow = '';
    }
    if (bnavMore) clearActive(bnavMore);
  }

  function setActive(btn) {
    if (!btn) return;
    document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function clearActive(btn) {
    btn?.classList.remove('active');
  }
}

function normalizeBottomNav(bnavRequest, bnavNotice, bnavTask) {
  if (bnavRequest) {
    bnavRequest.id = 'bnav-request';
    bnavRequest.setAttribute('aria-label', '部門間依頼を開く');
    bnavRequest.innerHTML = `
      <span class="bnav-icon-wrap">
        <i class="material-symbols-rounded" aria-hidden="true">swap_horiz</i>
        <span id="bnav-request-badge" class="bnav-badge" hidden></span>
      </span>
      <span>依頼</span>
    `;
    bnavTask?.after(bnavRequest);
  }

  if (bnavNotice) {
    bnavNotice.hidden = true;
  }
}

function configureMoreDrawerItems() {
  const grid = document.querySelector('#more-drawer .more-drawer-grid');
  if (!grid || grid.dataset.drawerConfigured === 'true') return;
  grid.dataset.drawerConfigured = 'true';

  const favoritesItem = grid.querySelector('.more-drawer-item[data-target="btn-favorites-only"]');
  if (favoritesItem) favoritesItem.hidden = true;
  const requestItem = grid.querySelector('.more-drawer-item[data-target="btn-reqboard"]');
  if (requestItem) requestItem.hidden = true;

  const firstItem = grid.querySelector('.more-drawer-item');
  ensureDrawerItem(grid, {
    target: 'chat-fab',
    icon: 'chat',
    label: 'チャット',
    badgeId: 'mdr-chat-badge',
    before: firstItem?.nextElementSibling || firstItem,
  });
  ensureDrawerItem(grid, {
    target: 'btn-notice-bell',
    icon: 'notifications',
    label: 'お知らせ',
    badgeId: 'mdr-notice-badge',
    before: grid.querySelector('.more-drawer-item[data-target="btn-calendar"]'),
  });
}

function ensureDrawerItem(grid, { target, icon, label, badgeId, before }) {
  if (grid.querySelector(`.more-drawer-item[data-target="${target}"]`)) return;
  const button = document.createElement('button');
  button.className = 'more-drawer-item';
  button.dataset.target = target;
  button.innerHTML = `
    <span class="mdr-icon-wrap">
      <i class="material-icons-round">${icon}</i>
      ${badgeId ? `<span id="${badgeId}" class="mdr-badge" hidden></span>` : ''}
    </span>
    <span>${label}</span>
  `;
  grid.insertBefore(button, before || null);
}

function syncBadges() {
  syncBadge('chat-unread-badge', 'mdr-chat-badge');
  syncBadge('notice-unread-badge', 'mdr-notice-badge');
  syncBadge('task-badge', 'bnav-task-badge');
  syncBadge('task-badge', 'mdr-task-badge');
  syncBadge('req-badge', 'bnav-request-badge');
  syncBadge('req-badge', 'mdr-req-badge');
  syncLockItem();
}

function syncBadge(sourceId, targetId) {
  const source = document.getElementById(sourceId);
  const target = document.getElementById(targetId);
  if (!source || !target) return;

  const apply = () => {
    target.hidden = source.hidden;
    target.textContent = source.textContent;
  };
  apply();
  new MutationObserver(apply).observe(source, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function syncLockItem() {
  const lockBtnSrc = document.getElementById('btn-lock-header');
  const mdrLockItem = document.querySelector('.mdr-lock-item');
  if (!lockBtnSrc || !mdrLockItem) return;

  const apply = () => {
    mdrLockItem.hidden = lockBtnSrc.hidden;
  };
  apply();
  new MutationObserver(apply).observe(lockBtnSrc, { attributes: true });
}
