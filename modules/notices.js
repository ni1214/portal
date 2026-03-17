// ========== お知らせ管理・リアクション ==========
import {
  db, collection, doc, getDocs, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  writeBatch, serverTimestamp, onSnapshot, arrayUnion, arrayRemove
} from './config.js';
import { state, REACTION_EMOJIS } from './state.js';
import { esc } from './utils.js';

// Cross-module function references
export const deps = {};

function normalizeTargetDepartments(departments) {
  if (!Array.isArray(departments)) return [];
  return [...new Set(
    departments
      .map(department => typeof department === 'string' ? department.trim() : '')
      .filter(Boolean)
  )];
}

function getNoticeTargetScope(notice) {
  const targetDepartments = normalizeTargetDepartments(notice?.targetDepartments);
  return notice?.targetScope === 'departments' && targetDepartments.length > 0 ? 'departments' : 'all';
}

function isNoticeVisibleForCurrentUser(notice) {
  if (!notice) return false;
  if (getNoticeTargetScope(notice) === 'all') return true;
  const department = state.userEmailProfile?.department?.trim() || '';
  if (!department) return false;
  return normalizeTargetDepartments(notice.targetDepartments).includes(department);
}

function getVisibleNoticesFromList(notices = state.allNotices) {
  return (Array.isArray(notices) ? notices : [])
    .filter(isNoticeVisibleForCurrentUser)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

function getVisibleUnreadCount() {
  return (state.visibleNotices || []).filter(n => !state.readNoticeIds.has(n.id)).length;
}

function buildAudienceBadgeHtml(notice) {
  const targetScope = getNoticeTargetScope(notice);
  if (targetScope === 'all') {
    return '<span class="notice-target-chip notice-target-chip--all">全体</span>';
  }
  return normalizeTargetDepartments(notice.targetDepartments).map(department => `
    <span class="notice-target-chip notice-target-chip--dept">${esc(department)}</span>
  `).join('');
}

function renderNoticeTargetDepartments(selectedDepartments = []) {
  const container = document.getElementById('notice-target-departments');
  if (!container) return;

  const selected = new Set(normalizeTargetDepartments(selectedDepartments));
  const departments = Array.isArray(state.currentDepartments) && state.currentDepartments.length > 0
    ? state.currentDepartments
    : state.DEFAULT_DEPARTMENTS;

  container.innerHTML = departments.map((department, index) => `
    <label class="notice-target-option" for="notice-target-dept-${index}">
      <input
        type="checkbox"
        id="notice-target-dept-${index}"
        class="notice-target-checkbox"
        value="${esc(department)}"
        ${selected.has(department) ? 'checked' : ''}
      >
      <span>${esc(department)}</span>
    </label>
  `).join('');
}

function getSelectedTargetDepartments() {
  return Array.from(document.querySelectorAll('.notice-target-checkbox:checked'))
    .map(input => input.value.trim())
    .filter(Boolean);
}

export function handleNoticeTargetScopeChange() {
  const scope = document.getElementById('notice-target-scope')?.value || 'all';
  const picker = document.getElementById('notice-target-picker');
  const hint = document.getElementById('notice-target-hint');
  if (picker) picker.hidden = scope !== 'departments';
  if (hint) {
    hint.textContent = scope === 'departments'
      ? '選んだ部署のユーザーにだけ表示されます。'
      : '全体に表示されます。';
  }
}

export function refreshNoticeVisibility() {
  state.visibleNotices = getVisibleNoticesFromList(state.allNotices);
  renderNotices(state.visibleNotices);
  updateNoticeBadge();
  setupNoticeObserver();
  deps.renderTodayDashboard?.();
}

// ========== お知らせ未読管理 ==========
export async function loadReadNotices(username) {
  if (!username) { state.readNoticeIds = new Set(); updateNoticeBadge(); return; }
  try {
    const snap = await getDocs(collection(db, 'users', username, 'read_notices'));
    state.readNoticeIds = new Set(snap.docs.map(d => d.id));
    updateNoticeBadge();
    renderNotices(state.visibleNotices);
    deps.renderTodayDashboard?.();
  } catch (err) {
    console.error('既読データ読み込みエラー:', err);
  }
}

export async function markAllNoticesRead() {
  if (!state.currentUsername || !state.visibleNotices.length) return;
  const batch = writeBatch(db);
  state.visibleNotices.forEach(n => {
    if (!state.readNoticeIds.has(n.id)) {
      batch.set(doc(db, 'users', state.currentUsername, 'read_notices', n.id), {
        readAt: serverTimestamp()
      });
    }
  });
  await batch.commit();
  state.visibleNotices.forEach(n => state.readNoticeIds.add(n.id));
  updateNoticeBadge();
  renderNotices(state.visibleNotices);
  deps.renderTodayDashboard?.();
}

export function updateNoticeBadge() {
  const badge = document.getElementById('notice-unread-badge');
  const bell  = document.getElementById('btn-notice-bell');
  if (!badge || !bell) return;
  const unreadCount = getVisibleUnreadCount();
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
  if (!board || !state.currentUsername || !(state.visibleNotices || []).length) return;
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
    renderNotices(state.visibleNotices);
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
  renderNotices(state.visibleNotices);
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
      refreshNoticeVisibility();
    }
  );
}

export async function saveNotice(data) {
  const normalizedData = {
    ...data,
    targetScope: data?.targetScope === 'departments' && normalizeTargetDepartments(data?.targetDepartments).length > 0
      ? 'departments'
      : 'all',
    targetDepartments: normalizeTargetDepartments(data?.targetDepartments),
  };
  if (state.editingNoticeId) {
    await updateDoc(doc(db, 'notices', state.editingNoticeId), normalizedData);
  } else {
    await addDoc(collection(db, 'notices'), { ...normalizedData, createdAt: serverTimestamp() });
  }
}

export async function addNotice(data) {
  await addDoc(collection(db, 'notices'), {
    ...data,
    targetScope: data?.targetScope === 'departments' && normalizeTargetDepartments(data?.targetDepartments).length > 0
      ? 'departments'
      : 'all',
    targetDepartments: normalizeTargetDepartments(data?.targetDepartments),
    createdAt: serverTimestamp()
  });
}

export async function deleteNotice(id) {
  await deleteDoc(doc(db, 'notices', id));
}

// ========== お知らせ描画 ==========
export function renderNotices(notices) {
  const board = document.getElementById('notice-board');
  if (!board) return;

  const visibleNotices = getVisibleNoticesFromList(Array.isArray(notices) ? notices : state.allNotices);
  state.visibleNotices = visibleNotices;

  if (!visibleNotices.length && !state.isEditMode) {
    board.innerHTML = '';
    return;
  }

  const addBtn = state.isEditMode
    ? `<button class="btn-add-notice"><i class="fa-solid fa-plus"></i> お知らせを追加</button>`
    : '';

  const unreadCount = getVisibleUnreadCount();
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
  visibleNotices.forEach(n => {
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
      <div class="notice-targets">${buildAudienceBadgeHtml(n)}</div>
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
  const targetDepartments = normalizeTargetDepartments(notice?.targetDepartments);
  const targetScope = getNoticeTargetScope(notice);
  document.getElementById('notice-modal-title').textContent = notice ? 'お知らせを編集' : 'お知らせを追加';
  document.getElementById('notice-priority').value = notice?.priority || 'normal';
  document.getElementById('notice-target-scope').value = targetScope;
  renderNoticeTargetDepartments(targetDepartments);
  handleNoticeTargetScopeChange();
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
