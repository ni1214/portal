/**
 * bottom-nav.js
 * スマホ用ボトムナビ・その他ドロワーのイベント管理
 * （個人ドロワーは廃止 → その他ドロワーに統合済み）
 */

export function initBottomNav() {
  // ボトムナビ各ボタン
  const bnavHome   = document.getElementById('bnav-home');
  const bnavTask   = document.getElementById('bnav-task');
  const bnavChat   = document.getElementById('bnav-chat');
  const bnavNotice = document.getElementById('bnav-notice');
  const bnavMore   = document.getElementById('bnav-more');

  // ドロワー
  const moreDrawer         = document.getElementById('more-drawer');
  const moreDrawerBackdrop = document.getElementById('more-drawer-backdrop');
  const moreDrawerClose    = document.getElementById('more-drawer-close');

  // ボトムナビが存在しない場合はスキップ
  if (!bnavHome) return;

  // ---- ホーム ----
  bnavHome.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActive(bnavHome);
  });

  // ---- タスク ----
  if (bnavTask) {
    bnavTask.addEventListener('click', () => {
      const taskBtn = document.getElementById('btn-task');
      if (taskBtn) taskBtn.click();
      setActive(bnavTask);
    });
  }

  // ---- チャット ----
  bnavChat.addEventListener('click', () => {
    const chatFab = document.getElementById('chat-fab');
    if (chatFab) chatFab.click();
    setActive(bnavChat);
  });

  // ---- お知らせ（スクロール表示） ----
  bnavNotice.addEventListener('click', () => {
    closeMoreDrawer();
    // お知らせボードにスムーズスクロール
    const noticeBoard = document.getElementById('notice-board');
    if (noticeBoard) {
      noticeBoard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActive(bnavNotice);
    // アクティブ表示は一時的（スクロール後に解除）
    setTimeout(() => clearActive(bnavNotice), 1500);
  });

  // ---- その他 ----
  bnavMore.addEventListener('click', () => {
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

  // ---- バッジ同期（チャット・お知らせ・タスク） ----
  syncBadges();

  function closeMoreDrawer() {
    if (moreDrawer) {
      moreDrawer.hidden = true;
      document.body.style.overflow = '';
    }
    clearActive(bnavMore);
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
      bnavChatBadge.hidden = chatBadgeSrc.hidden;
      bnavChatBadge.textContent = chatBadgeSrc.textContent;
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

  // タスクバッジ同期（ボトムナビ + ドロワー内）
  const taskBadgeSrc  = document.getElementById('task-badge');
  const bnavTaskBadge = document.getElementById('bnav-task-badge');
  const mdrTaskBadge  = document.getElementById('mdr-task-badge');
  if (taskBadgeSrc) {
    const syncTask = () => {
      if (bnavTaskBadge) {
        bnavTaskBadge.hidden = taskBadgeSrc.hidden;
        bnavTaskBadge.textContent = taskBadgeSrc.textContent;
      }
      if (mdrTaskBadge) {
        mdrTaskBadge.hidden = taskBadgeSrc.hidden;
        mdrTaskBadge.textContent = taskBadgeSrc.textContent;
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
  const lockBtnSrc  = document.getElementById('btn-lock-header');
  const mdrLockItem = document.querySelector('.mdr-lock-item');
  if (lockBtnSrc && mdrLockItem) {
    const syncLock = () => {
      mdrLockItem.hidden = lockBtnSrc.hidden;
    };
    syncLock();
    new MutationObserver(syncLock).observe(lockBtnSrc, { attributes: true });
  }
}
