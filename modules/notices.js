// ========== お知らせ管理・リアクション ==========
import {
  db, collection, doc, getDocs, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  writeBatch, serverTimestamp, onSnapshot, arrayUnion, arrayRemove
} from './config.js';
import { state, REACTION_EMOJIS } from './state.js';
import { esc } from './utils.js';
import {
  recordGetDocsRead,
  recordListenerStart,
  recordListenerSnapshot,
  wrapTrackedListenerUnsubscribe,
} from './read-diagnostics.js';
import {
  isSupabaseSharedCoreEnabled,
  createSupabaseClientId,
  fetchNoticesFromSupabase,
  createNoticeInSupabase,
  updateNoticeInSupabase,
  deleteNoticeInSupabase,
  acknowledgeNoticeInSupabase,
  fetchReadNoticeIdsFromSupabase,
  markNoticesReadInSupabase,
  fetchNoticeReactionsFromSupabase,
  addNoticeReactionInSupabase,
  removeNoticeReactionInSupabase,
} from './supabase.js';

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

function normalizeAcknowledgedUsers(users) {
  if (!Array.isArray(users)) return [];
  return [...new Set(
    users
      .map(username => typeof username === 'string' ? username.trim() : '')
      .filter(Boolean)
  )];
}

function noticeRequiresAcknowledgement(notice) {
  return !!notice?.requireAcknowledgement;
}

function isNoticeAcknowledgedByCurrentUser(notice) {
  if (!state.currentUsername || !noticeRequiresAcknowledgement(notice)) return false;
  return normalizeAcknowledgedUsers(notice.acknowledgedBy).includes(state.currentUsername);
}

function getPendingAcknowledgementNotices(notices = state.visibleNotices) {
  if (!state.currentUsername) return [];
  return (Array.isArray(notices) ? notices : []).filter(notice =>
    noticeRequiresAcknowledgement(notice) && !isNoticeAcknowledgedByCurrentUser(notice)
  );
}

function getVisibleUnreadCount() {
  return (state.visibleNotices || []).filter(n => !state.readNoticeIds.has(n.id)).length;
}

function getVisibleUnreadNoticeCount() {
  return (state.visibleNotices || []).filter(notice =>
    !state.readNoticeIds.has(notice.id) && !noticeRequiresAcknowledgement(notice)
  ).length;
}

function getVisibleNoticeActionCount() {
  return getPendingAcknowledgementNotices().length + getVisibleUnreadNoticeCount();
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

function buildAcknowledgementHtml(notice) {
  if (!noticeRequiresAcknowledgement(notice)) return '';
  const acknowledgedUsers = normalizeAcknowledgedUsers(notice.acknowledgedBy);
  const acknowledged = isNoticeAcknowledgedByCurrentUser(notice);
  const statusChip = acknowledged
    ? '<span class="notice-ack-chip notice-ack-chip--done"><i class="fa-solid fa-circle-check"></i> 確認済み</span>'
    : '<span class="notice-ack-chip notice-ack-chip--pending"><i class="fa-solid fa-circle-exclamation"></i> 確認必須</span>';
  const actionButton = state.currentUsername && !acknowledged
    ? `<button class="btn-notice-ack" data-notice-ack="${notice.id}"><i class="fa-solid fa-check"></i> 確認した</button>`
    : '';
  const confirmedBy = acknowledgedUsers.length > 0
    ? `<div class="notice-ack-users">確認済み: ${acknowledgedUsers.map(username => esc(username)).join(' / ')}</div>`
    : '<div class="notice-ack-users">まだ確認者はいません</div>';

  return `
    <div class="notice-ack-row">
      <div class="notice-ack-head">
        ${statusChip}
        <span class="notice-ack-count">${acknowledgedUsers.length}名確認</span>
        ${actionButton}
      </div>
      ${confirmedBy}
    </div>
  `;
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
  deps.renderSharedHome?.();
}

// ========== お知らせ未読管理 ==========
export async function loadReadNotices(username) {
  if (!username) { state.readNoticeIds = new Set(); updateNoticeBadge(); return; }
  try {
    if (isSupabaseSharedCoreEnabled()) {
      state.readNoticeIds = await fetchReadNoticeIdsFromSupabase(username);
    } else {
      const snap = await getDocs(collection(db, 'users', username, 'read_notices'));
      recordGetDocsRead('notice.read-notices', '既読お知らせ', `users/${username}/read_notices`, snap.size, snap.docs);
      state.readNoticeIds = new Set(snap.docs.map(d => d.id));
    }
    updateNoticeBadge();
    renderNotices(state.visibleNotices);
    deps.renderTodayDashboard?.();
    deps.renderSharedHome?.();
  } catch (err) {
    console.error('既読データ読み込みエラー:', err);
  }
}

export async function markAllNoticesRead() {
  if (!state.currentUsername || !state.visibleNotices.length) return;
  const unreadIds = state.visibleNotices.filter(n => !state.readNoticeIds.has(n.id)).map(n => n.id);
  if (!unreadIds.length) return;
  if (isSupabaseSharedCoreEnabled()) {
    await markNoticesReadInSupabase(state.currentUsername, unreadIds);
  } else {
    const batch = writeBatch(db);
    unreadIds.forEach(id => {
      batch.set(doc(db, 'users', state.currentUsername, 'read_notices', id), {
        readAt: serverTimestamp()
      });
    });
    await batch.commit();
  }
  state.visibleNotices.forEach(n => state.readNoticeIds.add(n.id));
  updateNoticeBadge();
  renderNotices(state.visibleNotices);
  deps.renderTodayDashboard?.();
  deps.renderSharedHome?.();
}

export async function acknowledgeNotice(noticeId) {
  if (!state.currentUsername || !noticeId) return;
  const notice = (state.allNotices || []).find(item => item.id === noticeId);
  if (!notice || !noticeRequiresAcknowledgement(notice) || isNoticeAcknowledgedByCurrentUser(notice)) return;

  const previousAcknowledgedBy = normalizeAcknowledgedUsers(notice.acknowledgedBy);
  notice.acknowledgedBy = [...previousAcknowledgedBy, state.currentUsername];
  state.readNoticeIds.add(noticeId);
  updateNoticeBadge();
  renderNotices(state.visibleNotices);
  deps.renderTodayDashboard?.();
  deps.renderSharedHome?.();

  try {
    if (isSupabaseSharedCoreEnabled()) {
      await Promise.all([
        acknowledgeNoticeInSupabase(noticeId, notice.acknowledgedBy),
        markNoticesReadInSupabase(state.currentUsername, [noticeId]),
      ]);
    } else {
      const batch = writeBatch(db);
      batch.update(doc(db, 'notices', noticeId), {
        acknowledgedBy: arrayUnion(state.currentUsername),
      });
      batch.set(doc(db, 'users', state.currentUsername, 'read_notices', noticeId), {
        readAt: serverTimestamp(),
      }, { merge: true });
      await batch.commit();
    }
  } catch (err) {
    notice.acknowledgedBy = previousAcknowledgedBy;
    state.readNoticeIds.delete(noticeId);
    updateNoticeBadge();
    renderNotices(state.visibleNotices);
    deps.renderTodayDashboard?.();
    deps.renderSharedHome?.();
    console.error('お知らせ確認の保存に失敗しました:', err);
    alert('確認の保存に失敗しました。時間をおいてもう一度お試しください。');
  }
}

export function updateNoticeBadge() {
  const badge = document.getElementById('notice-unread-badge');
  const bell  = document.getElementById('btn-notice-bell');
  if (!badge || !bell) return;
  const actionCount = getVisibleNoticeActionCount();
  if (actionCount > 0) {
    badge.textContent = actionCount > 99 ? '99+' : actionCount;
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

function stopNoticeReactionObserver() {
  if (state._noticeReactionObserver) {
    state._noticeReactionObserver.disconnect();
    state._noticeReactionObserver = null;
  }
}

export async function ensureNoticeReactionsLoaded(force = false) {
  if (state.noticeReactionsLoading) return;
  if (state.noticeReactionsLoaded && !force) return;
  await loadAllNoticeReactions();
}

export function setupNoticeReactionLoader() {
  stopNoticeReactionObserver();
  if (state.noticeReactionsLoaded || state.noticeReactionsLoading) return;
  if (!(state.visibleNotices || []).length) return;
  const board = document.getElementById('notice-board');
  if (!board) return;
  state._noticeReactionObserver = new IntersectionObserver(entries => {
    if (!entries[0]?.isIntersecting) return;
    stopNoticeReactionObserver();
    ensureNoticeReactionsLoaded();
  }, {
    threshold: 0.1,
    rootMargin: '240px 0px',
  });
  state._noticeReactionObserver.observe(board);
}

// ========== お知らせリアクション ==========
export async function loadAllNoticeReactions() {
  if (state.noticeReactionsLoading) return;
  state.noticeReactionsLoading = true;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      state.noticeReactions = await fetchNoticeReactionsFromSupabase();
    } else {
      const snap = await getDocs(collection(db, 'notice_reactions'));
      recordGetDocsRead('notice.reactions', 'お知らせリアクション', 'notice_reactions', snap.size, snap.docs);
      state.noticeReactions = {};
      snap.docs.forEach(d => { state.noticeReactions[d.id] = d.data(); });
    }
    state.noticeReactionsLoaded = true;
    renderNotices(state.visibleNotices);
  } catch (err) {
    state.noticeReactionsLoaded = false;
    console.error('リアクション読み込みエラー:', err);
  } finally {
    state.noticeReactionsLoading = false;
  }
}

export async function toggleReaction(noticeId, emoji) {
  if (!state.currentUsername) return;
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
    if (isSupabaseSharedCoreEnabled()) {
      if (alreadyReacted) {
        await removeNoticeReactionInSupabase(noticeId, emoji, state.currentUsername);
      } else {
        await addNoticeReactionInSupabase(noticeId, emoji, state.currentUsername);
      }
    } else {
      const ref = doc(db, 'notice_reactions', noticeId);
      if (alreadyReacted) {
        await updateDoc(ref, { [emoji]: arrayRemove(state.currentUsername) });
      } else {
        await setDoc(ref, { [emoji]: arrayUnion(state.currentUsername) }, { merge: true });
      }
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

// ========== CRUD ==========
export async function subscribeNotices() {
  if (isSupabaseSharedCoreEnabled()) {
    // Supabase モード: realtime なし、一回読み込み
    try {
      const notices = await fetchNoticesFromSupabase();
      state.allNotices = notices;
      refreshNoticeVisibility();
    } catch (err) {
      console.error('Supabase お知らせ読み込みエラー:', err);
    }
    return;
  }
  // Firebase モード: onSnapshot
  recordListenerStart('notice.list', 'お知らせ一覧', 'notices');
  state._noticeUnsub = wrapTrackedListenerUnsubscribe('notice.list', onSnapshot(
    collection(db, 'notices'),
    snap => {
      recordListenerSnapshot('notice.list', snap.size, 'notices', snap.docs);
      state.allNotices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      state.allNotices.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      refreshNoticeVisibility();
    }
  ));
}

export async function saveNotice(data) {
  const existingNotice = state.editingNoticeId
    ? (state.allNotices || []).find(notice => notice.id === state.editingNoticeId)
    : null;
  const normalizedData = {
    ...data,
    targetScope: data?.targetScope === 'departments' && normalizeTargetDepartments(data?.targetDepartments).length > 0
      ? 'departments'
      : 'all',
    targetDepartments: normalizeTargetDepartments(data?.targetDepartments),
    requireAcknowledgement: !!data?.requireAcknowledgement,
    acknowledgedBy: normalizeAcknowledgedUsers(existingNotice?.acknowledgedBy),
  };
  if (isSupabaseSharedCoreEnabled()) {
    if (state.editingNoticeId) {
      await updateNoticeInSupabase(state.editingNoticeId, normalizedData);
    } else {
      const newId = await createNoticeInSupabase(normalizedData);
      // 楽観的更新: ローカル state にも追加（次の subscribeNotices 呼出しまでの暫定）
      state.allNotices = [
        { id: newId, ...normalizedData, createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } },
        ...(state.allNotices || []),
      ];
      refreshNoticeVisibility();
    }
  } else if (state.editingNoticeId) {
    await updateDoc(doc(db, 'notices', state.editingNoticeId), normalizedData);
  } else {
    await addDoc(collection(db, 'notices'), { ...normalizedData, createdAt: serverTimestamp() });
  }
}

export async function addNotice(data) {
  const normalizedData = {
    ...data,
    targetScope: data?.targetScope === 'departments' && normalizeTargetDepartments(data?.targetDepartments).length > 0
      ? 'departments'
      : 'all',
    targetDepartments: normalizeTargetDepartments(data?.targetDepartments),
    requireAcknowledgement: !!data?.requireAcknowledgement,
    acknowledgedBy: [],
  };
  if (isSupabaseSharedCoreEnabled()) {
    await createNoticeInSupabase(normalizedData);
  } else {
    await addDoc(collection(db, 'notices'), { ...normalizedData, createdAt: serverTimestamp() });
  }
}

export async function deleteNotice(id) {
  if (isSupabaseSharedCoreEnabled()) {
    await deleteNoticeInSupabase(id);
    state.allNotices = (state.allNotices || []).filter(n => n.id !== id);
    refreshNoticeVisibility();
  } else {
    await deleteDoc(doc(db, 'notices', id));
  }
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
  const unreadNoticeCount = getVisibleUnreadNoticeCount();
  const pendingAckCount = getPendingAcknowledgementNotices(visibleNotices).length;
  const readAllBtn = (state.currentUsername && unreadCount > 0)
    ? `<button class="btn-read-all" id="btn-read-all"><i class="fa-solid fa-check-double"></i> 全て既読</button>`
    : '';

  board.innerHTML = `
    <div class="notice-header">
      <i class="fa-solid fa-bullhorn"></i>
      <span>お知らせ</span>
      ${pendingAckCount > 0 ? `<span class="notice-unread-label notice-unread-label--ack">${pendingAckCount}件 確認待ち</span>` : ''}
      ${unreadNoticeCount > 0 ? `<span class="notice-unread-label">${unreadNoticeCount}件 未読</span>` : ''}
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
  setupNoticeReactionLoader();
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
      ${buildAcknowledgementHtml(n)}
      ${buildReactionBar(n.id)}
    `;
    if (state.isEditMode) {
      item.querySelector('.btn-notice-edit').addEventListener('click', () => openNoticeModal(n));
    }
    list.appendChild(item);
  });

  // リアクションボタン（イベントデリゲーション）
  list.addEventListener('click', async e => {
    const ackBtn = e.target.closest('[data-notice-ack]');
    if (ackBtn) {
      if (!state.currentUsername) { alert('確認するにはユーザーネームを設定してください'); return; }
      ackBtn.disabled = true;
      try {
        await acknowledgeNotice(ackBtn.dataset.noticeAck);
      } finally {
        ackBtn.disabled = false;
      }
      return;
    }
    const btn = e.target.closest('.reaction-btn');
    if (!btn) return;
    if (!state.currentUsername) { alert('リアクションするにはユーザーネームを設定してください'); return; }
    btn.disabled = true;
    try {
      await ensureNoticeReactionsLoaded();
      await toggleReaction(btn.dataset.noticeId, btn.dataset.emoji);
    } finally {
      btn.disabled = false;
    }
  });
}

export function openNoticeModal(notice) {
  state.editingNoticeId = notice ? notice.id : null;
  const targetDepartments = normalizeTargetDepartments(notice?.targetDepartments);
  const targetScope = getNoticeTargetScope(notice);
  document.getElementById('notice-modal-title').textContent = notice ? 'お知らせを編集' : 'お知らせを追加';
  document.getElementById('notice-priority').value = notice?.priority || 'normal';
  document.getElementById('notice-require-ack').checked = !!notice?.requireAcknowledgement;
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
