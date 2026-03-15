/**
 * bottom-nav.js
 * スマホ用ボトムナビ・その他ドロワー・個人ドロワーのイベント管理
 */

export function initBottomNav() {
  // ボトムナビ各ボタン
  const bnavHome     = document.getElementById('bnav-home');
  const bnavChat     = document.getElementById('bnav-chat');
  const bnavNotice   = document.getElementById('bnav-notice');
  const bnavPersonal = document.getElementById('bnav-personal');
  const bnavMore     = document.getElementById('bnav-more');

  // ドロワー
  const moreDrawer          = document.getElementById('more-drawer');
  const moreDrawerBackdrop  = document.getElementById('more-drawer-backdrop');
  const moreDrawerClose     = document.getElementById('more-drawer-close');
  const personalDrawer      = document.getElementById('personal-drawer');
  const personalDrawerBackdrop = document.getElementById('personal-drawer-backdrop');
  const personalDrawerClose = document.getElementById('personal-drawer-close');

  // ボトムナビが存在しない場合はスキップ
  if (!bnavHome) return;

  // ---- ホーム ----
  bnavHome.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActive(bnavHome);
  });

  // ---- チャット ----
  bnavChat.addEventListener('click', () => {
    const chatFab = document.getElementById('chat-fab');
    if (chatFab) chatFab.click();
    setActive(bnavChat);
  });

  // ---- お知らせ ----
  bnavNotice.addEventListener('click', () => {
    const noticeBell = document.getElementById('btn-notice-bell');
    if (noticeBell) noticeBell.click();
    setActive(bnavNotice);
  });

  // ---- 個人 ----
  bnavPersonal.addEventListener('click', () => {
    closeMoreDrawer();
    if (personalDrawer) {
      personalDrawer.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    setActive(bnavPersonal);
  });

  // ---- その他 ----
  bnavMore.addEventListener('click', () => {
    closePersonalDrawer();
    if (moreDrawer) {
      moreDrawer.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    setActive(bnavMore);
  });

  // ---- その他ドロワー 閉じる ----
  if (moreDrawerClose) {
    moreDrawerClose.addEventListener('click', closeMoreDrawer);
  }
  if (moreDrawerBackdrop) {
    moreDrawerBackdrop.addEventListener('click', closeMoreDrawer);
  }

  // ---- 個人ドロワー 閉じる ----
  if (personalDrawerClose) {
    personalDrawerClose.addEventListener('click', closePersonalDrawer);
  }
  if (personalDrawerBackdrop) {
    personalDrawerBackdrop.addEventListener('click', closePersonalDrawer);
  }

  // ---- その他ドロワーのアイテムクリック ----
  document.querySelectorAll('.more-drawer-item[data-target]').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.target;
      const target = document.getElementById(targetId);
      if (target) {
        closeMoreDrawer();
        // 少し遅延してから発火（ドロワーが閉じてから）
        setTimeout(() => target.click(), 50);
      }
    });
  });

  // ---- 個人ドロワーのアイテムクリック ----
  document.querySelectorAll('.personal-drawer-item[data-target]').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.target;
      const target = document.getElementById(targetId);
      if (target) {
        closePersonalDrawer();
        setTimeout(() => target.click(), 50);
      }
    });
  });

  // ---- バッジ同期（チャット・お知らせ） ----
  syncBadges();

  function closeMoreDrawer() {
    if (moreDrawer) {
      moreDrawer.hidden = true;
      document.body.style.overflow = '';
    }
    clearActive(bnavMore);
  }

  function closePersonalDrawer() {
    if (personalDrawer) {
      personalDrawer.hidden = true;
      document.body.style.overflow = '';
    }
    clearActive(bnavPersonal);
  }

  function setActive(btn) {
    document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function clearActive(btn) {
    btn.classList.remove('active');
  }
}

/**
 * バッジ数値をボトムナビ・ドロワーに同期する
 * ヘッダー/サイドバー側のバッジを監視してボトムナビに反映
 */
function syncBadges() {
  // チャットバッジ同期
  const chatBadgeSrc  = document.getElementById('chat-unread-badge');
  const bnavChatBadge = document.getElementById('bnav-chat-badge');
  if (chatBadgeSrc && bnavChatBadge) {
    const syncChat = () => {
      const hidden = chatBadgeSrc.hidden;
      const count  = chatBadgeSrc.textContent;
      bnavChatBadge.hidden = hidden;
      bnavChatBadge.textContent = count;
    };
    syncChat();
    new MutationObserver(syncChat).observe(chatBadgeSrc, { attributes: true, childList: true, characterData: true, subtree: true });
  }

  // お知らせバッジ同期
  const noticeBadgeSrc  = document.getElementById('notice-unread-badge');
  const bnavNoticeBadge = document.getElementById('bnav-notice-badge');
  if (noticeBadgeSrc && bnavNoticeBadge) {
    const syncNotice = () => {
      bnavNoticeBadge.hidden = noticeBadgeSrc.hidden;
      bnavNoticeBadge.textContent = noticeBadgeSrc.textContent;
    };
    syncNotice();
    new MutationObserver(syncNotice).observe(noticeBadgeSrc, { attributes: true, childList: true, characterData: true, subtree: true });
  }

  // タスクバッジ同期（ドロワー内）
  const taskBadgeSrc = document.getElementById('task-badge');
  const mdrTaskBadge = document.getElementById('mdr-task-badge');
  const pdrTaskBadge = document.getElementById('pdr-task-badge');
  if (taskBadgeSrc) {
    const syncTask = () => {
      if (mdrTaskBadge) {
        mdrTaskBadge.hidden = taskBadgeSrc.hidden;
        mdrTaskBadge.textContent = taskBadgeSrc.textContent;
      }
      if (pdrTaskBadge) {
        pdrTaskBadge.hidden = taskBadgeSrc.hidden;
        pdrTaskBadge.textContent = taskBadgeSrc.textContent;
      }
    };
    syncTask();
    new MutationObserver(syncTask).observe(taskBadgeSrc, { attributes: true, childList: true, characterData: true, subtree: true });
  }

  // 部門間依頼バッジ同期（ドロワー内）
  const reqBadgeSrc = document.getElementById('req-badge');
  const mdrReqBadge = document.getElementById('mdr-req-badge');
  if (reqBadgeSrc && mdrReqBadge) {
    const syncReq = () => {
      mdrReqBadge.hidden = reqBadgeSrc.hidden;
      mdrReqBadge.textContent = reqBadgeSrc.textContent;
    };
    syncReq();
    new MutationObserver(syncReq).observe(reqBadgeSrc, { attributes: true, childList: true, characterData: true, subtree: true });
  }

  // ロックボタン表示状態の同期（スマホその他ドロワーの「ロック」）
  const lockBtnSrc = document.getElementById('btn-lock-header');
  const mdrLockItem = document.querySelector('.mdr-lock-item');
  if (lockBtnSrc && mdrLockItem) {
    const syncLock = () => {
      mdrLockItem.hidden = lockBtnSrc.hidden;
    };
    syncLock();
    new MutationObserver(syncLock).observe(lockBtnSrc, { attributes: true });
  }
}
