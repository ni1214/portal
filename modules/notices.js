// ========== お知らせ管理・リアクション ==========
import {
  db, collection, doc, getDocs, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  writeBatch, serverTimestamp, onSnapshot, arrayUnion, arrayRemove
} from './config.js';
import { state, REACTION_EMOJIS } from './state.js';
import { esc } from './utils.js';

// Cross-module function references
export const deps = {};

// ========== お知らせ未読管理 ==========
export async function loadReadNotices(username) {
  if (!username) { state.readNoticeIds = new Set(); updateNoticeBadge(); return; }
  try {
    const snap = await getDocs(collection(db, 'users', username, 'read_notices'));
    state.readNoticeIds = new Set(snap.docs.map(d => d.id));
    updateNoticeBadge();
    renderNotices(state.allNotices);
  } catch (err) {
    console.error('既読データ読み込みエラー:', err);
  }
}

export async function markAllNoticesRead() {
  if (!state.currentUsername || !state.allNotices.length) return;
  const batch = writeBatch(db);
  state.allNotices.forEach(n => {
    if (!state.readNoticeIds.has(n.id)) {
      batch.set(doc(db, 'users', state.currentUsername, 'read_notices', n.id), {
        readAt: serverTimestamp()
      });
    }
  });
  await batch.commit();
  state.allNotices.forEach(n => state.readNoticeIds.add(n.id));
  updateNoticeBadge();
  renderNotices(state.allNotices);
}

export function updateNoticeBadge() {
  const badge = document.getElementById('notice-unread-badge');
  const bell  = document.getElementById('btn-notice-bell');
  if (!badge || !bell) return;
  const unreadCount = state.allNotices.filter(n => !state.readNoticeIds.has(n.id)).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.hidden = false;
    bell.classList.add('has-unread');
  } else {
    badge.hidden = true;
    bell.classList.remove('has-unread');
  }
  deps.updateLockNotifications?.();
}

export function setupNoticeObserver() {
  if (state._noticeObserver) { state._noticeObserver.disconnect(); state._noticeObserver = null; }
  const board = document.getElementById('notice-board');
  if (!board || !state.currentUsername) return;
  state._noticeObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) markAllNoticesRead();
  }, { threshold: 0.3 });
  state._noticeObserver.observe(board);
}

// ========== お知らせリアクション ==========
export async function loadAllNoticeReactions() {
  try {
    const snap = await getDocs(collection(db, 'notice_reactions'));
    state.noticeReactions = {};
    snap.docs.forEach(d => { state.noticeReactions[d.id] = d.data(); });
    renderNotices(state.allNotices);
  } catch (err) {
    console.error('リアクション読み込みエラー:', err);
  }
}

export async function toggleReaction(noticeId, emoji) {
  if (!state.currentUsername) return;
  const ref = doc(db, 'notice_reactions', noticeId);
  const current = (state.noticeReactions[noticeId] || {})[emoji] || [];
  const alreadyReacted = current.includes(state.currentUsername);
  // 楽観的UI更新
  if (!state.noticeReactions[noticeId]) state.noticeReactions[noticeId] = {};
  if (alreadyReacted) {
    state.noticeReactions[noticeId][emoji] = current.filter(u => u !== state.currentUsername);
  } else {
    state.noticeReactions[noticeId][emoji] = [...current, state.currentUsername];
  }
  renderNotices(state.allNotices);
  try {
    if (alreadyReacted) {
      await updateDoc(ref, { [emoji]: arrayRemove(state.currentUsername) });
    } else {
      await setDoc(ref, { [emoji]: arrayUnion(state.currentUsername) }, { merge: true });
    }
  } catch (err) {
    console.error('リアクション更新エラー:', err);
    await loadAllNoticeReactions();
  }
}

export function buildReactionBar(noticeId) {
  const reactions = state.noticeReactions[noticeId] || {};
  const btns = REACTION_EMOJIS.map(emoji => {
    const users = reactions[emoji] || [];
    const count = users.length;
    const active = state.currentUsername && users.includes(state.currentUsername) ? ' active' : '';
    const countHtml = count > 0 ? `<span class="reaction-count">${count}</span>` : '';
    return `<button class="reaction-btn${active}" data-notice-id="${noticeId}" data-emoji="${emoji}" title="${users.join(', ') || ''}">${emoji}${countHtml}</button>`;
  }).join('');
  return `<div class="notice-reactions">${btns}</div>`;
}

// ========== Firestore CRUD ==========
export function subscribeNotices() {
  state._noticeUnsub = onSnapshot(
    collection(db, 'notices'),
    snap => {
      state.allNotices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      state.allNotices.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      renderNotices(state.allNotices);
      updateNoticeBadge();
      setupNoticeObserver();
    }
  );
}

export async function saveNotice(data) {
  if (state.editingNoticeId) {
    await updateDoc(doc(db, 'notices', state.editingNoticeId), data);
  } else {
    await addDoc(collection(db, 'notices'), { ...data, createdAt: serverTimestamp() });
  }
}

export async function addNotice(data) {
  await addDoc(collection(db, 'notices'), { ...data, createdAt: serverTimestamp() });
}

export async function deleteNotice(id) {
  await deleteDoc(doc(db, 'notices', id));
}

// ========== お知らせ描画 ==========
export function renderNotices(notices) {
  const board = document.getElementById('notice-board');
  if (!board) return;

  if (!notices.length && !state.isEditMode) {
    board.innerHTML = '';
    return;
  }

  const addBtn = state.isEditMode
    ? `<button class="btn-add-notice"><i class="fa-solid fa-plus"></i> お知らせを追加</button>`
    : '';

  const unreadCount = state.allNotices.filter(n => !state.readNoticeIds.has(n.id)).length;
  const readAllBtn = (state.currentUsername && unreadCount > 0)
    ? `<button class="btn-read-all" id="btn-read-all"><i class="fa-solid fa-check-double"></i> 全て既読</button>`
    : '';

  board.innerHTML = `
    <div class="notice-header">
      <i class="fa-solid fa-bullhorn"></i>
      <span>お知らせ</span>
      ${unreadCount > 0 ? `<span class="notice-unread-label">${unreadCount}件 未読</span>` : ''}
      ${readAllBtn}
      ${addBtn}
    </div>
    <div class="notice-list" id="notice-list"></div>
  `;

  if (state.currentUsername && unreadCount > 0) {
    board.querySelector('#btn-read-all')?.addEventListener('click', markAllNoticesRead);
  }

  if (state.isEditMode) {
    board.querySelector('.btn-add-notice').addEventListener('click', () => openNoticeModal(null));
  }

  const list = board.querySelector('#notice-list');
  notices.forEach(n => {
    const isUnread = state.currentUsername && !state.readNoticeIds.has(n.id);
    const item = document.createElement('div');
    item.className = `notice-item${n.priority === 'urgent' ? ' urgent' : ''}${isUnread ? ' notice-unread' : ''}`;
    const dateStr = n.createdAt?.toDate
      ? n.createdAt.toDate().toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
      : '';
    const newBadge = isUnread ? `<span class="notice-new-badge">NEW</span>` : '';
    const editBtns = state.isEditMode
      ? `<button class="btn-notice-edit" data-id="${n.id}"><i class="fa-solid fa-pen"></i></button>`
      : '';
    item.innerHTML = `
      <div class="notice-item-header">
        ${newBadge}
        <span class="notice-badge ${n.priority === 'urgent' ? 'badge-urgent' : 'badge-normal'}">${n.priority === 'urgent' ? '重要' : 'お知らせ'}</span>
        <span class="notice-title">${esc(n.title || '')}</span>
        <span class="notice-date">${dateStr}</span>
        ${editBtns}
      </div>
      ${n.body ? `<div class="notice-body">${esc(n.body)}</div>` : ''}
      ${buildReactionBar(n.id)}
    `;
    if (state.isEditMode) {
      item.querySelector('.btn-notice-edit').addEventListener('click', () => openNoticeModal(n));
    }
    list.appendChild(item);
  });

  // リアクションボタン（イベントデリゲーション）
  list.addEventListener('click', e => {
    const btn = e.target.closest('.reaction-btn');
    if (!btn) return;
    if (!state.currentUsername) { alert('リアクションするにはユーザーネームを設定してください'); return; }
    toggleReaction(btn.dataset.noticeId, btn.dataset.emoji);
  });
}

export function openNoticeModal(notice) {
  state.editingNoticeId = notice ? notice.id : null;
  document.getElementById('notice-modal-title').textContent = notice ? 'お知らせを編集' : 'お知らせを追加';
  document.getElementById('notice-priority').value = notice?.priority || 'normal';
  document.getElementById('notice-title').value = notice?.title || '';
  document.getElementById('notice-body').value = notice?.body || '';
  document.getElementById('notice-delete').style.display = notice ? 'inline-flex' : 'none';
  document.getElementById('notice-modal').classList.add('visible');
  setTimeout(() => document.getElementById('notice-title').focus(), 100);
}

export function closeNoticeModal() {
  document.getElementById('notice-modal').classList.remove('visible');
  state.editingNoticeId = null;
}
