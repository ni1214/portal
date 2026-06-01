// ========== お知らせ管理・リアクション ==========
import { state, REACTION_EMOJIS } from './state.js';
import { esc } from './utils.js';
import { showToast } from './notify.js';
import {
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
  return !!notice;
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

function isNoticeCreatedByCurrentUser(notice) {
  return !!state.currentUsername && !!notice?.createdBy && notice.createdBy === state.currentUsername;
}

function isNoticeAcknowledgedByCurrentUser(notice) {
  if (!state.currentUsername || !noticeRequiresAcknowledgement(notice)) return false;
  return normalizeAcknowledgedUsers(notice.acknowledgedBy).includes(state.currentUsername);
}

function getPendingAcknowledgementNotices(notices = state.visibleNotices) {
  if (!state.currentUsername) return [];
  return (Array.isArray(notices) ? notices : []).filter(notice =>
    !isNoticeCreatedByCurrentUser(notice) && noticeRequiresAcknowledgement(notice) && !isNoticeAcknowledgedByCurrentUser(notice)
  );
}

function getVisibleUnreadCount() {
  return (state.visibleNotices || []).filter(n => !isNoticeCreatedByCurrentUser(n) && !state.readNoticeIds.has(n.id)).length;
}

function formatNoticeDate(notice) {
  const raw = notice?.createdAt;
  const date = raw
    ? (raw.toDate ? raw.toDate() : new Date((raw.seconds || 0) * 1000))
    : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' });
}

function getVisibleUnreadNoticeCount() {
  return (state.visibleNotices || []).filter(notice =>
    !isNoticeCreatedByCurrentUser(notice) && !state.readNoticeIds.has(notice.id) && !noticeRequiresAcknowledgement(notice)
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
  if (isNoticeCreatedByCurrentUser(notice)) {
    const confirmedBy = acknowledgedUsers.length > 0
      ? `<div class="notice-ack-users">確認済み: ${acknowledgedUsers.map(username => esc(username)).join(' / ')}</div>`
      : '<div class="notice-ack-users">まだ確認者はいません</div>';
    return `
      <div class="notice-ack-row">
        <div class="notice-ack-head">
          <span class="notice-ack-chip notice-ack-chip--done"><i class="fa-solid fa-circle-check"></i> 投稿済み</span>
          <span class="notice-ack-count">${acknowledgedUsers.length}名確認</span>
        </div>
        ${confirmedBy}
      </div>
    `;
  }
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

function buildNoticeComposerHtml() {
  if (!state.isEditMode) return '';
  return `
    <form class="notice-composer" id="notice-composer">
      <div class="notice-composer-head">
        <div>
          <div class="notice-composer-kicker">Post</div>
          <h3 class="notice-composer-title">全社員へ周知する</h3>
        </div>
        <span class="notice-composer-scope"><i class="fa-solid fa-building"></i> 全社員</span>
      </div>
      <input type="text" id="notice-quick-title" class="notice-composer-input" placeholder="件名: 社内行事・予定変更・共有事項" maxlength="80" autocomplete="off">
      <textarea id="notice-quick-body" class="notice-composer-textarea" rows="3" placeholder="本文: 日時、対象、対応してほしいことを短く入力"></textarea>
      <div class="notice-composer-actions">
        <select id="notice-quick-priority" class="notice-composer-select" aria-label="お知らせ種別">
          <option value="normal">通常</option>
          <option value="urgent">重要</option>
        </select>
        <label class="notice-composer-check" for="notice-quick-ack">
          <input type="checkbox" id="notice-quick-ack">
          <span>確認必須</span>
        </label>
        <button type="submit" class="notice-composer-submit" id="notice-quick-submit">
          <i class="fa-solid fa-paper-plane"></i> 投稿
        </button>
      </div>
    </form>
  `;
}

function buildNoticeEmptyHtml() {
  return `
    <div class="notice-empty-state">
      <i class="fa-solid fa-bullhorn"></i>
      <strong>まだお知らせはありません</strong>
      <span>社内行事や全社員への共有事項を投稿できます。</span>
    </div>
  `;
}

function bindNoticeComposer(board) {
  const form = board.querySelector('#notice-composer');
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const titleEl = board.querySelector('#notice-quick-title');
    const bodyEl = board.querySelector('#notice-quick-body');
    const priorityEl = board.querySelector('#notice-quick-priority');
    const ackEl = board.querySelector('#notice-quick-ack');
    const submitBtn = board.querySelector('#notice-quick-submit');
    const title = titleEl?.value.trim() || '';
    const body = bodyEl?.value.trim() || '';
    if (!title) {
      titleEl?.focus();
      return;
    }
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>';
    try {
      state.editingNoticeId = null;
      await saveNotice({
        title,
        body,
        priority: priorityEl?.value || 'normal',
        requireAcknowledgement: !!ackEl?.checked,
        targetScope: 'all',
        targetDepartments: [],
        createdBy: state.currentUsername || '',
      });
      if (titleEl) titleEl.value = '';
      if (bodyEl) bodyEl.value = '';
      if (priorityEl) priorityEl.value = 'normal';
      if (ackEl) ackEl.checked = false;
      showToast('全社員向けのお知らせを投稿しました。', 'success');
    } catch (err) {
      console.error('お知らせ投稿エラー:', err);
      showToast('お知らせを投稿できませんでした。時間をおいて再度お試しください。', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 投稿';
    }
  });
}

let noticeCenterReturnParent = null;

function ensureNoticeCenterModal() {
  let modal = document.getElementById('notice-center-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'notice-center-modal';
  modal.className = 'notice-center-modal';
  modal.innerHTML = `
    <div class="notice-center-backdrop" data-notice-center-close></div>
    <section class="notice-center-panel" role="dialog" aria-modal="true" aria-labelledby="notice-center-title">
      <div class="notice-center-header">
        <div>
          <p class="notice-center-kicker">Notice</p>
          <h2 id="notice-center-title">お知らせセンター</h2>
        </div>
        <button type="button" class="notice-center-close" data-notice-center-close aria-label="閉じる">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="notice-center-body" id="notice-center-body"></div>
    </section>
  `;
  modal.addEventListener('click', event => {
    if (event.target.closest('[data-notice-center-close]')) {
      closeNoticeCenter();
    }
  });
  document.body.appendChild(modal);
  return modal;
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
    state.readNoticeIds = await fetchReadNoticeIdsFromSupabase(username);
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
  await markNoticesReadInSupabase(state.currentUsername, unreadIds);
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
    await Promise.all([
      acknowledgeNoticeInSupabase(noticeId, notice.acknowledgedBy),
      markNoticesReadInSupabase(state.currentUsername, [noticeId]),
    ]);
  } catch (err) {
    notice.acknowledgedBy = previousAcknowledgedBy;
    state.readNoticeIds.delete(noticeId);
    updateNoticeBadge();
    renderNotices(state.visibleNotices);
    deps.renderTodayDashboard?.();
    deps.renderSharedHome?.();
    console.error('お知らせ確認の保存に失敗しました:', err);
    showToast('確認の保存に失敗しました。時間をおいてもう一度お試しください。', 'error');
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
  deps.updateSummaryCards?.();
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
    state.noticeReactions = await fetchNoticeReactionsFromSupabase();
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
    if (alreadyReacted) {
      await removeNoticeReactionInSupabase(noticeId, emoji, state.currentUsername);
    } else {
      await addNoticeReactionInSupabase(noticeId, emoji, state.currentUsername);
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
  // Runtime: realtime なし、一回読み込み
  try {
    const notices = await fetchNoticesFromSupabase();
    state.allNotices = notices;
    refreshNoticeVisibility();
  } catch (err) {
    console.error('Supabase お知らせ読み込みエラー:', err);
  }
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
  if (state.editingNoticeId) {
    delete normalizedData.createdBy;
  } else if (!normalizedData.createdBy) {
    normalizedData.createdBy = state.currentUsername || '';
  }

  if (state.editingNoticeId) {
    await updateNoticeInSupabase(state.editingNoticeId, normalizedData);
    const idx = (state.allNotices || []).findIndex(notice => notice.id === state.editingNoticeId);
    if (idx >= 0) {
      state.allNotices[idx] = { ...state.allNotices[idx], ...normalizedData };
    }
  } else {
    const newId = await createNoticeInSupabase(normalizedData);
    state.allNotices = [
      { id: newId, ...normalizedData, createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } },
      ...(state.allNotices || []),
    ];
  }

  refreshNoticeVisibility();
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
    createdBy: data?.createdBy || state.currentUsername || '',
  };
  await createNoticeInSupabase(normalizedData);
}

export async function deleteNotice(id) {
  await deleteNoticeInSupabase(id);
  state.allNotices = (state.allNotices || []).filter(n => n.id !== id);
  refreshNoticeVisibility();
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

  const unreadCount = getVisibleUnreadCount();
  const unreadNoticeCount = getVisibleUnreadNoticeCount();
  const pendingAckCount = getPendingAcknowledgementNotices(visibleNotices).length;
  const readAllBtn = (state.currentUsername && unreadCount > 0)
    ? `<button class="btn-read-all" id="btn-read-all"><i class="fa-solid fa-check-double"></i> すべて既読</button>`
    : '';

  board.innerHTML = `
    <div class="notice-board-header">
      <div class="notice-board-title-block">
        <span class="notice-board-icon"><i class="fa-solid fa-bullhorn"></i></span>
        <div>
          <h2 class="notice-board-title">全社員へ共有</h2>
          <p class="notice-board-copy">社内行事・予定変更・全員に周知したいことを共有します。</p>
        </div>
      </div>
      <div class="notice-board-actions">
        ${pendingAckCount > 0 ? `<span class="notice-unread-label notice-unread-label--ack">${pendingAckCount}件 確認待ち</span>` : ''}
        ${unreadNoticeCount > 0 ? `<span class="notice-unread-label">${unreadNoticeCount}件 未読</span>` : ''}
        ${readAllBtn}
      </div>
    </div>
    ${buildNoticeComposerHtml()}
    <div class="notice-list" id="notice-list"></div>
  `;

  if (state.currentUsername && unreadCount > 0) {
    board.querySelector('#btn-read-all')?.addEventListener('click', markAllNoticesRead);
  }
  bindNoticeComposer(board);

  const list = board.querySelector('#notice-list');
  setupNoticeReactionLoader();

  if (!visibleNotices.length) {
    list.innerHTML = buildNoticeEmptyHtml();
    return;
  }

  visibleNotices.forEach(n => {
    const isOwnNotice = isNoticeCreatedByCurrentUser(n);
    const isUnread = state.currentUsername && !isOwnNotice && !state.readNoticeIds.has(n.id);
    const item = document.createElement('div');
    item.className = `notice-item${n.priority === 'urgent' ? ' urgent' : ''}${isUnread ? ' notice-unread' : ''}`;
    const dateStr = formatNoticeDate(n);
    const newBadge = isUnread
      ? `<span class="notice-new-badge">NEW</span>`
      : (isOwnNotice ? `<span class="notice-new-badge notice-new-badge--posted">投稿済み</span>` : '');
    const editBtns = state.isEditMode
      ? `<button class="btn-notice-edit" data-id="${n.id}" aria-label="お知らせを編集"><i class="fa-solid fa-pen"></i></button>`
      : '';
    const iconClass = n.priority === 'urgent' ? 'fa-triangle-exclamation' : 'fa-bullhorn';
    const iconMod = n.priority === 'urgent' ? 'urgent' : 'normal';
    const badgeText = n.priority === 'urgent' ? '重要' : '周知';
    item.innerHTML = `
      <div class="notice-card-icon notice-card-icon--${iconMod}">
        <i class="fa-solid ${iconClass}"></i>
      </div>
      <div class="notice-card-body">
        <div class="notice-item-header">
          ${newBadge}
          <span class="notice-badge ${n.priority === 'urgent' ? 'badge-urgent' : 'badge-normal'}">${badgeText}</span>
          <span class="notice-date">${dateStr}</span>
          ${editBtns}
        </div>
        <div class="notice-title">${esc(n.title || '')}</div>
        ${n.body ? `<div class="notice-body">${esc(n.body)}</div>` : ''}
        <div class="notice-targets"><span class="notice-target-chip notice-target-chip--all">全社員</span></div>
        ${buildAcknowledgementHtml(n)}
        ${buildReactionBar(n.id)}
      </div>
    `;
    if (state.isEditMode) {
      item.querySelector('.btn-notice-edit')?.addEventListener('click', () => openNoticeModal(n));
    }
    list.appendChild(item);
  });

  list.addEventListener('click', async e => {
    const ackBtn = e.target.closest('[data-notice-ack]');
    if (ackBtn) {
      const id = ackBtn.dataset.noticeAck;
      ackBtn.disabled = true;
      try {
        await acknowledgeNotice(id);
      } catch (err) {
        console.error('お知らせ確認エラー:', err);
        showToast('確認状態を保存できませんでした。', 'error');
        ackBtn.disabled = false;
      }
      return;
    }

    const btn = e.target.closest('.reaction-btn');
    if (!btn || btn.disabled) return;
    if (!state.currentUsername) {
      showToast('リアクションするにはユーザーネームを設定してください。', 'warning');
      return;
    }
    const { noticeId, emoji } = btn.dataset;
    if (!noticeId || !emoji) return;

    btn.disabled = true;
    const bar = btn.closest('.notice-reactions');
    bar?.classList.add('loading');
    try {
      await ensureNoticeReactionsLoaded();
      await toggleReaction(noticeId, emoji);
    } catch (err) {
      console.error('リアクション保存エラー:', err);
      showToast('リアクションを保存できませんでした。', 'error');
    } finally {
      bar?.classList.remove('loading');
      btn.disabled = false;
    }
  });
}

export function openNoticeCenter() {
  const board = document.getElementById('notice-board');
  if (!board) return;

  const modal = ensureNoticeCenterModal();
  const body = modal.querySelector('#notice-center-body');
  if (!body) return;

  if (!noticeCenterReturnParent && board.parentElement !== body) {
    noticeCenterReturnParent = board.parentElement;
  }

  body.appendChild(board);
  refreshNoticeVisibility();
  modal.classList.add('visible');
  document.body.classList.add('notice-center-open');
  window.setTimeout(() => {
    board.querySelector('#notice-quick-title')?.focus();
  }, 80);
}

export function closeNoticeCenter() {
  const modal = document.getElementById('notice-center-modal');
  const board = document.getElementById('notice-board');
  if (board && noticeCenterReturnParent && board.parentElement !== noticeCenterReturnParent) {
    noticeCenterReturnParent.appendChild(board);
  }
  modal?.classList.remove('visible');
  document.body.classList.remove('notice-center-open');
}

export function openNoticeModal(notice) {
  state.editingNoticeId = notice ? notice.id : null;
  const targetDepartments = [];
  const targetScope = 'all';
  document.getElementById('notice-modal-title').textContent = notice ? 'お知らせを編集' : 'お知らせを追加';
  document.getElementById('notice-priority').value = notice?.priority || 'normal';
  document.getElementById('notice-require-ack').checked = !!notice?.requireAcknowledgement;
  document.getElementById('notice-target-scope').value = targetScope;
  renderNoticeTargetDepartments(targetDepartments);
  handleNoticeTargetScopeChange();
  document.getElementById('notice-target-scope')?.closest('.form-group')?.setAttribute('hidden', '');
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
