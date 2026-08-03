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

const NOTICE_FILTERS = [
  { id: 'action', label: '要対応' },
  { id: 'unread', label: '未読' },
  { id: 'urgent', label: '重要' },
  { id: 'all', label: 'すべて' },
  { id: 'mine', label: '自分の投稿' },
];

let noticeCenterReturnParent = null;
let noticeWorkspaceFilter = '';
let noticeWorkspaceQuery = '';
let noticeSearchComposing = false;
let selectedNoticeId = '';
let noticeDetailOpen = false;
let noticeModalReturnFocus = null;
const noticeReadRequests = new Set();

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

// 現行RLSはログイン済み利用者へ全件を返すため、部署指定は表示上の対象情報としてのみ扱う。
function isNoticeVisibleForCurrentUser(notice) {
  return !!notice;
}

function getNoticeTimestamp(notice) {
  const raw = notice?.createdAt;
  if (!raw) return 0;
  if (typeof raw.toMillis === 'function') return raw.toMillis();
  if (typeof raw.toDate === 'function') return raw.toDate().getTime();
  if (Number.isFinite(raw.seconds)) return raw.seconds * 1000;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getVisibleNoticesFromList(notices = state.allNotices) {
  return (Array.isArray(notices) ? notices : [])
    .filter(isNoticeVisibleForCurrentUser)
    .sort((a, b) => getNoticeTimestamp(b) - getNoticeTimestamp(a));
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

function canManageNotice(notice) {
  return !!notice && (state.isAdmin === true || isNoticeCreatedByCurrentUser(notice));
}

function isNoticeAcknowledgedByCurrentUser(notice) {
  if (!state.currentUsername || !noticeRequiresAcknowledgement(notice)) return false;
  return normalizeAcknowledgedUsers(notice.acknowledgedBy).includes(state.currentUsername);
}

function isNoticeUnread(notice) {
  return !!state.currentUsername
    && !isNoticeCreatedByCurrentUser(notice)
    && !isNoticeAcknowledgedByCurrentUser(notice)
    && !state.readNoticeIds.has(notice.id);
}

function isNoticePendingAcknowledgement(notice) {
  return !!state.currentUsername
    && !isNoticeCreatedByCurrentUser(notice)
    && noticeRequiresAcknowledgement(notice)
    && !isNoticeAcknowledgedByCurrentUser(notice);
}

function isNoticeActionable(notice) {
  return isNoticePendingAcknowledgement(notice) || isNoticeUnread(notice);
}

function getVisibleUnreadCount() {
  if (!state.currentUsername) return 0;
  return (state.visibleNotices || []).filter(isNoticeUnread).length;
}

function getVisibleNoticeActionCount() {
  return (state.visibleNotices || []).filter(isNoticeActionable).length;
}

function toNoticeDate(notice) {
  const timestamp = getNoticeTimestamp(notice);
  return timestamp > 0 ? new Date(timestamp) : null;
}

function formatNoticeDate(notice, detailed = false) {
  const date = toNoticeDate(notice);
  if (!date || Number.isNaN(date.getTime())) return '日時不明';
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString('ja-JP', detailed
    ? {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }
    : {
        ...(sameYear ? {} : { year: 'numeric' }),
        month: 'numeric', day: 'numeric',
      });
}

function getAudienceLabel(notice) {
  if (getNoticeTargetScope(notice) === 'all') return '全社';
  const departments = normalizeTargetDepartments(notice.targetDepartments);
  if (departments.length <= 2) return departments.join('・');
  return `${departments[0]} ほか${departments.length - 1}部署`;
}

function buildAudienceBadgeHtml(notice) {
  if (getNoticeTargetScope(notice) === 'all') {
    return '<span class="notice-target-chip notice-target-chip--all">全社</span>';
  }
  return normalizeTargetDepartments(notice.targetDepartments).map(department => `
    <span class="notice-target-chip notice-target-chip--dept">${esc(department)}</span>
  `).join('');
}

function getNoticeExcerpt(notice) {
  const source = `${notice?.body || ''}`.replace(/\s+/g, ' ').trim();
  if (!source) return '本文はありません。';
  return source.length > 92 ? `${source.slice(0, 92)}…` : source;
}

function buildAcknowledgementHtml(notice) {
  if (!noticeRequiresAcknowledgement(notice)) return '';
  const acknowledgedUsers = normalizeAcknowledgedUsers(notice.acknowledgedBy);
  if (isNoticeCreatedByCurrentUser(notice)) {
    const confirmedBy = acknowledgedUsers.length > 0
      ? `<div class="notice-ack-users">確認済み: ${acknowledgedUsers.map(username => esc(username)).join(' / ')}</div>`
      : '<div class="notice-ack-users">まだ確認者はいません</div>';
    return `
      <div class="notice-ack-row notice-detail-confirmation">
        <div class="notice-ack-head">
          <span class="notice-ack-chip notice-ack-chip--done"><i class="fa-solid fa-circle-check"></i> 確認状況</span>
          <span class="notice-ack-count">${acknowledgedUsers.length}名確認</span>
        </div>
        ${confirmedBy}
      </div>
    `;
  }

  const adminSummary = state.isAdmin
    ? `<div class="notice-ack-users">全体の確認状況: ${acknowledgedUsers.length > 0
      ? acknowledgedUsers.map(username => esc(username)).join(' / ')
      : 'まだ確認者はいません'}</div>`
    : '';

  const acknowledged = isNoticeAcknowledgedByCurrentUser(notice);
  if (acknowledged) {
    return `
      <div class="notice-ack-row notice-detail-confirmation notice-detail-confirmation--done">
        <div class="notice-ack-head">
          <span class="notice-ack-chip notice-ack-chip--done"><i class="fa-solid fa-circle-check"></i> 確認済み</span>
        </div>
        <div class="notice-ack-users">このお知らせは確認済みです。</div>
        ${adminSummary}
      </div>
    `;
  }

  return `
    <div class="notice-ack-row notice-detail-confirmation notice-detail-confirmation--pending">
      <div class="notice-ack-head">
        <div>
          <span class="notice-ack-chip notice-ack-chip--pending"><i class="fa-solid fa-circle-exclamation"></i> 確認が必要</span>
          <p class="notice-ack-prompt">内容を確認したら、確認ボタンを押してください。</p>
        </div>
        ${state.currentUsername ? `
          <button class="btn-notice-ack" type="button" data-notice-ack="${esc(notice.id)}">
            <i class="fa-solid fa-check"></i> 確認しました
          </button>
        ` : ''}
      </div>
      ${adminSummary}
    </div>
  `;
}

function renderNoticeTargetDepartments(selectedDepartments = []) {
  const container = document.getElementById('notice-target-departments');
  if (!container) return;

  const selected = new Set(normalizeTargetDepartments(selectedDepartments));
  const currentDepartments = Array.isArray(state.currentDepartments) && state.currentDepartments.length > 0
    ? state.currentDepartments
    : state.DEFAULT_DEPARTMENTS;
  const departments = [...new Set([...currentDepartments, ...selected])];

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

export function getNoticeTargetFormValues() {
  const requestedScope = document.getElementById('notice-target-scope')?.value || 'all';
  const targetDepartments = getSelectedTargetDepartments();
  const targetScope = requestedScope === 'departments' && targetDepartments.length > 0
    ? 'departments'
    : 'all';
  return {
    targetScope,
    targetDepartments: targetScope === 'departments' ? targetDepartments : [],
  };
}

export function handleNoticeTargetScopeChange() {
  const scope = document.getElementById('notice-target-scope')?.value || 'all';
  const picker = document.getElementById('notice-target-picker');
  const hint = document.getElementById('notice-target-hint');
  if (picker) picker.hidden = scope !== 'departments';
  if (hint) {
    hint.textContent = scope === 'departments'
      ? '配信対象として記録されている部署です。'
      : '全社向けのお知らせとして配信します。';
  }
}

function getNoticeFilterCounts(notices) {
  return {
    action: notices.filter(isNoticeActionable).length,
    unread: notices.filter(isNoticeUnread).length,
    urgent: notices.filter(notice => notice.priority === 'urgent').length,
    all: notices.length,
    mine: notices.filter(isNoticeCreatedByCurrentUser).length,
  };
}

function ensureNoticeWorkspaceFilter(notices) {
  if (NOTICE_FILTERS.some(filter => filter.id === noticeWorkspaceFilter)) return;
  if (!notices.length) return;
  noticeWorkspaceFilter = notices.some(isNoticeActionable) ? 'action' : 'all';
}

function matchesNoticeFilter(notice) {
  switch (noticeWorkspaceFilter) {
    case 'action': return isNoticeActionable(notice);
    case 'unread': return isNoticeUnread(notice);
    case 'urgent': return notice.priority === 'urgent';
    case 'mine': return isNoticeCreatedByCurrentUser(notice);
    default: return true;
  }
}

function getNoticeActionRank(notice) {
  if (isNoticePendingAcknowledgement(notice)) return 0;
  if (isNoticeUnread(notice) && notice.priority === 'urgent') return 1;
  if (isNoticeUnread(notice)) return 2;
  if (notice.priority === 'urgent') return 3;
  return 4;
}

function getFilteredNotices(notices) {
  const query = noticeWorkspaceQuery.trim().toLocaleLowerCase('ja-JP');
  return notices
    .filter(matchesNoticeFilter)
    .filter(notice => {
      if (!query) return true;
      const haystack = [
        notice.title,
        notice.body,
        notice.createdBy,
        getAudienceLabel(notice),
        ...normalizeTargetDepartments(notice.targetDepartments),
      ].join(' ').toLocaleLowerCase('ja-JP');
      return haystack.includes(query);
    })
    .sort((a, b) => {
      const rankDiff = getNoticeActionRank(a) - getNoticeActionRank(b);
      return rankDiff || getNoticeTimestamp(b) - getNoticeTimestamp(a);
    });
}

function getTotalReactionCount(noticeId) {
  return Object.values(state.noticeReactions[noticeId] || {})
    .reduce((sum, users) => sum + (Array.isArray(users) ? users.length : 0), 0);
}

function buildNoticeFilterBar(counts) {
  return NOTICE_FILTERS.map(filter => {
    const active = filter.id === noticeWorkspaceFilter;
    return `
      <button
        type="button"
        class="notice-filter-button${active ? ' active' : ''}"
        data-notice-filter="${filter.id}"
        aria-pressed="${active ? 'true' : 'false'}"
      >
        <span>${filter.label}</span>
        <span class="notice-filter-count">${counts[filter.id] || 0}</span>
      </button>
    `;
  }).join('');
}

function buildNoticeInboxItem(notice) {
  const unread = isNoticeUnread(notice);
  const pending = isNoticePendingAcknowledgement(notice);
  const urgent = notice.priority === 'urgent';
  const selected = noticeDetailOpen && notice.id === selectedNoticeId;
  const reactionCount = getTotalReactionCount(notice.id);
  const stateLabel = pending
    ? '<span class="notice-list-state notice-list-state--pending"><i class="material-symbols-rounded" aria-hidden="true">task_alt</i>確認が必要</span>'
    : urgent
      ? '<span class="notice-list-state notice-list-state--urgent"><i class="material-symbols-rounded" aria-hidden="true">priority_high</i>重要</span>'
      : '';

  return `
    <button
      type="button"
      class="notice-inbox-item${unread ? ' is-unread' : ''}${urgent ? ' is-urgent' : ''}${selected ? ' is-selected' : ''}"
      data-notice-select="${esc(notice.id)}"
      aria-current="${selected ? 'true' : 'false'}"
    >
      <span class="notice-inbox-leading" aria-hidden="true">
        ${unread ? '<span class="notice-unread-dot"></span>' : '<span class="notice-read-dot"></span>'}
      </span>
      <span class="notice-inbox-content">
        <span class="notice-inbox-topline">
          <span class="notice-inbox-title">${esc(notice.title || '無題のお知らせ')}</span>
          <time class="notice-inbox-date">${esc(formatNoticeDate(notice))}</time>
        </span>
        <span class="notice-inbox-excerpt">${esc(getNoticeExcerpt(notice))}</span>
        <span class="notice-inbox-meta">
          ${stateLabel}
          <span><i class="material-symbols-rounded" aria-hidden="true">groups</i>${esc(getAudienceLabel(notice))}</span>
          ${notice.createdBy ? `<span><i class="material-symbols-rounded" aria-hidden="true">person</i>${esc(notice.createdBy)}</span>` : ''}
          ${reactionCount > 0 ? `<span><i class="material-symbols-rounded" aria-hidden="true">mood</i>${reactionCount}</span>` : ''}
        </span>
      </span>
      <i class="material-symbols-rounded notice-inbox-arrow" aria-hidden="true">chevron_right</i>
    </button>
  `;
}

function buildNoticeListEmptyHtml() {
  const hasQuery = !!noticeWorkspaceQuery.trim();
  const filterLabel = NOTICE_FILTERS.find(filter => filter.id === noticeWorkspaceFilter)?.label || 'お知らせ';
  const title = hasQuery
    ? '一致するお知らせはありません'
    : noticeWorkspaceFilter === 'action'
      ? '対応が必要なお知らせはありません'
      : `${filterLabel}のお知らせはありません`;
  const copy = hasQuery
    ? '検索語を短くするか、別の絞り込みを選んでください。'
    : noticeWorkspaceFilter === 'action'
      ? '必要な確認はすべて完了しています。'
      : '別の絞り込みを選ぶと、お知らせを確認できます。';
  return `
    <div class="notice-list-empty">
      <i class="material-symbols-rounded" aria-hidden="true">${noticeWorkspaceFilter === 'action' ? 'done_all' : 'inbox'}</i>
      <strong>${title}</strong>
      <span>${copy}</span>
    </div>
  `;
}

function buildNoticeDetailHtml(notice) {
  if (!notice) {
    return `
      <div class="notice-detail-empty">
        <span class="notice-detail-empty-icon"><i class="material-symbols-rounded" aria-hidden="true">campaign</i></span>
        <strong>お知らせを選択してください</strong>
        <span>左の一覧から選ぶと、内容と必要な操作をここで確認できます。</span>
      </div>
    `;
  }

  const unread = isNoticeUnread(notice);
  const pending = isNoticePendingAcknowledgement(notice);
  const urgent = notice.priority === 'urgent';
  const statusLabel = pending
    ? '<span class="notice-detail-status notice-detail-status--pending"><i class="material-symbols-rounded" aria-hidden="true">task_alt</i>確認が必要</span>'
    : unread
      ? '<span class="notice-detail-status notice-detail-status--unread"><i class="material-symbols-rounded" aria-hidden="true">mark_email_unread</i>未読</span>'
      : '<span class="notice-detail-status"><i class="material-symbols-rounded" aria-hidden="true">done</i>確認済み</span>';

  return `
    <div class="notice-detail-document">
      <button type="button" class="notice-detail-back" data-notice-back data-workspace-back>
        <i class="material-symbols-rounded" aria-hidden="true">arrow_back</i>
        一覧へ戻る
      </button>

      <header class="notice-detail-header">
        <div class="notice-detail-statuses">
          ${statusLabel}
          ${urgent ? '<span class="notice-detail-status notice-detail-status--urgent"><i class="material-symbols-rounded" aria-hidden="true">priority_high</i>重要</span>' : ''}
        </div>
        ${canManageNotice(notice) ? `
          <button type="button" class="notice-detail-edit" data-notice-edit="${esc(notice.id)}">
            <i class="material-symbols-rounded" aria-hidden="true">edit</i>
            編集
          </button>
        ` : ''}
      </header>

      <h2 class="notice-detail-title">${esc(notice.title || '無題のお知らせ')}</h2>
      <div class="notice-detail-meta">
        <span><i class="material-symbols-rounded" aria-hidden="true">schedule</i>${esc(formatNoticeDate(notice, true))}</span>
        ${notice.createdBy ? `<span><i class="material-symbols-rounded" aria-hidden="true">person</i>${esc(notice.createdBy)}</span>` : ''}
      </div>
      <div class="notice-detail-targets" aria-label="配信対象">${buildAudienceBadgeHtml(notice)}</div>

      <div class="notice-detail-body${notice.body ? '' : ' is-empty'}">
        ${notice.body ? esc(notice.body) : '本文はありません。'}
      </div>

      ${buildAcknowledgementHtml(notice)}

      <section class="notice-detail-reactions" aria-label="リアクション">
        <div class="notice-detail-section-title">リアクション</div>
        ${buildReactionBar(notice.id)}
      </section>
    </div>
  `;
}

function focusNoticeListItem(noticeId) {
  const board = document.getElementById('notice-board');
  const target = [...(board?.querySelectorAll('[data-notice-select]') || [])]
    .find(element => element.dataset.noticeSelect === noticeId);
  if (!target) return false;
  target.focus({ preventScroll: true });
  return true;
}

function focusNoticeReaction(noticeId, emoji) {
  const board = document.getElementById('notice-board');
  const target = [...(board?.querySelectorAll('.reaction-btn') || [])]
    .find(element => element.dataset.noticeId === noticeId && element.dataset.emoji === emoji);
  target?.focus({ preventScroll: true });
}

async function persistNoticeRead(noticeId) {
  if (!state.currentUsername || !noticeId || noticeReadRequests.has(noticeId)) return;
  noticeReadRequests.add(noticeId);
  try {
    await markNoticesReadInSupabase(state.currentUsername, [noticeId]);
  } catch (err) {
    state.readNoticeIds.delete(noticeId);
    updateNoticeBadge();
    renderNotices(state.visibleNotices);
    deps.renderTodayDashboard?.();
    deps.renderSharedHome?.();
    console.error('お知らせ既読保存エラー:', err);
    showToast('既読状態を保存できませんでした。', 'error');
  } finally {
    noticeReadRequests.delete(noticeId);
  }
}

function selectNotice(noticeId) {
  const notice = (state.visibleNotices || []).find(item => item.id === noticeId);
  if (!notice) return;
  selectedNoticeId = noticeId;
  noticeDetailOpen = true;
  const shouldMarkRead = isNoticeUnread(notice);
  if (shouldMarkRead) state.readNoticeIds.add(noticeId);
  updateNoticeBadge();
  renderNotices(state.visibleNotices);
  deps.renderTodayDashboard?.();
  deps.renderSharedHome?.();
  if (shouldMarkRead) void persistNoticeRead(noticeId);

  window.requestAnimationFrame(() => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      document.querySelector('#notice-detail .notice-detail-back')?.focus({ preventScroll: true });
    } else if (!focusNoticeListItem(noticeId)) {
      document.getElementById('notice-detail')?.focus({ preventScroll: true });
    }
  });
}

function bindNoticeWorkspace(board) {
  const searchInput = board.querySelector('#notice-workspace-search');
  const commitSearch = (value, caret) => {
    noticeWorkspaceQuery = value;
    noticeDetailOpen = false;
    selectedNoticeId = '';
    renderNotices(state.visibleNotices);
    window.requestAnimationFrame(() => {
      const nextInput = document.getElementById('notice-workspace-search');
      nextInput?.focus({ preventScroll: true });
      nextInput?.setSelectionRange(caret, caret);
    });
  };
  searchInput?.addEventListener('compositionstart', () => {
    noticeSearchComposing = true;
  });
  searchInput?.addEventListener('compositionend', event => {
    noticeSearchComposing = false;
    const value = event.currentTarget.value;
    const caret = event.currentTarget.selectionStart ?? value.length;
    noticeWorkspaceQuery = value;
    window.setTimeout(() => {
      if (document.getElementById('notice-workspace-search') === searchInput) {
        commitSearch(value, caret);
      }
    }, 0);
  });
  searchInput?.addEventListener('input', event => {
    noticeWorkspaceQuery = event.target.value;
    if (event.isComposing || noticeSearchComposing) return;
    const caret = event.target.selectionStart ?? noticeWorkspaceQuery.length;
    commitSearch(noticeWorkspaceQuery, caret);
  });

  board.querySelector('[data-notice-search-clear]')?.addEventListener('click', () => {
    noticeWorkspaceQuery = '';
    noticeDetailOpen = false;
    selectedNoticeId = '';
    renderNotices(state.visibleNotices);
    document.getElementById('notice-workspace-search')?.focus({ preventScroll: true });
  });

  board.querySelectorAll('[data-notice-filter]').forEach(button => {
    button.addEventListener('click', () => {
      noticeWorkspaceFilter = button.dataset.noticeFilter || 'all';
      noticeDetailOpen = false;
      selectedNoticeId = '';
      renderNotices(state.visibleNotices);
      document.querySelector(`[data-notice-filter="${noticeWorkspaceFilter}"]`)?.focus({ preventScroll: true });
    });
  });

  board.querySelector('[data-notice-create]')?.addEventListener('click', () => openNoticeModal(null));
  board.querySelector('[data-notice-mark-all]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await markAllNoticesRead();
    } catch (err) {
      console.error('お知らせ一括既読エラー:', err);
      showToast('既読状態を保存できませんでした。', 'error');
      button.disabled = false;
    }
  });

  board.querySelectorAll('[data-notice-select]').forEach(button => {
    button.addEventListener('click', () => selectNotice(button.dataset.noticeSelect));
  });

  board.querySelector('[data-notice-back]')?.addEventListener('click', () => {
    const previousNoticeId = selectedNoticeId;
    noticeDetailOpen = false;
    selectedNoticeId = '';
    renderNotices(state.visibleNotices);
    window.requestAnimationFrame(() => {
      if (!focusNoticeListItem(previousNoticeId)) {
        board.querySelector('[data-notice-select]')?.focus({ preventScroll: true });
      }
    });
  });

  board.querySelector('[data-notice-edit]')?.addEventListener('click', event => {
    const notice = (state.allNotices || []).find(item => item.id === event.currentTarget.dataset.noticeEdit);
    if (notice) openNoticeModal(notice);
  });

  board.querySelector('[data-notice-ack]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    await acknowledgeNotice(button.dataset.noticeAck);
    window.requestAnimationFrame(() => document.getElementById('notice-detail')?.focus({ preventScroll: true }));
  });

  board.querySelectorAll('.reaction-btn').forEach(button => {
    button.addEventListener('click', async () => {
      if (!state.currentUsername) {
        showToast('リアクションするにはログインが必要です。', 'warning');
        return;
      }
      const { noticeId, emoji } = button.dataset;
      if (!noticeId || !emoji) return;
      button.disabled = true;
      try {
        await ensureNoticeReactionsLoaded();
        await toggleReaction(noticeId, emoji);
      } catch (err) {
        console.error('リアクション保存エラー:', err);
        showToast('リアクションを保存できませんでした。', 'error');
      } finally {
        window.requestAnimationFrame(() => focusNoticeReaction(noticeId, emoji));
      }
    });
  });
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
  if (!username) {
    state.readNoticeIds = new Set();
    updateNoticeBadge();
    renderNotices(state.visibleNotices);
    return;
  }
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
  const unreadIds = state.visibleNotices.filter(isNoticeUnread).map(notice => notice.id);
  if (!unreadIds.length) return;
  await markNoticesReadInSupabase(state.currentUsername, unreadIds);
  unreadIds.forEach(id => state.readNoticeIds.add(id));
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
  const wasRead = state.readNoticeIds.has(noticeId);
  notice.acknowledgedBy = [...previousAcknowledgedBy, state.currentUsername];
  state.readNoticeIds.add(noticeId);
  updateNoticeBadge();
  renderNotices(state.visibleNotices);
  deps.renderTodayDashboard?.();
  deps.renderSharedHome?.();

  try {
    await acknowledgeNoticeInSupabase(noticeId);
  } catch (err) {
    notice.acknowledgedBy = previousAcknowledgedBy;
    if (!wasRead) state.readNoticeIds.delete(noticeId);
    updateNoticeBadge();
    renderNotices(state.visibleNotices);
    deps.renderTodayDashboard?.();
    deps.renderSharedHome?.();
    console.error('お知らせ確認の保存に失敗しました:', err);
    showToast('確認の保存に失敗しました。時間をおいてもう一度お試しください。', 'error');
    return;
  }

  try {
    await markNoticesReadInSupabase(state.currentUsername, [noticeId]);
  } catch (err) {
    console.warn('お知らせ確認後の既読履歴保存に失敗しました:', err);
  }
  showToast('確認済みにしました。', 'success');
}

export function updateNoticeBadge() {
  const badge = document.getElementById('notice-unread-badge');
  const bell = document.getElementById('btn-notice-bell');
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

// 自動一括既読は行わない。既読化は通知を選ぶか「すべて既読」の明示操作だけで行う。
export function setupNoticeObserver() {
  if (state._noticeObserver) {
    state._noticeObserver.disconnect();
    state._noticeObserver = null;
  }
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
    void ensureNoticeReactionsLoaded();
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
  if (!state.noticeReactions[noticeId]) state.noticeReactions[noticeId] = {};
  state.noticeReactions[noticeId][emoji] = alreadyReacted
    ? current.filter(username => username !== state.currentUsername)
    : [...current, state.currentUsername];
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
    throw err;
  }
}

export function buildReactionBar(noticeId) {
  const reactions = state.noticeReactions[noticeId] || {};
  const buttons = REACTION_EMOJIS.map(emoji => {
    const users = reactions[emoji] || [];
    const count = users.length;
    const active = !!state.currentUsername && users.includes(state.currentUsername);
    const title = users.length > 0 ? users.join(', ') : `${emoji}でリアクション`;
    return `
      <button
        type="button"
        class="reaction-btn${active ? ' active' : ''}"
        data-notice-id="${esc(noticeId)}"
        data-emoji="${esc(emoji)}"
        title="${esc(title)}"
        aria-pressed="${active ? 'true' : 'false'}"
      >
        <span aria-hidden="true">${esc(emoji)}</span>
        ${count > 0 ? `<span class="reaction-count">${count}</span>` : ''}
      </button>
    `;
  }).join('');
  return `<div class="notice-reactions">${buttons}</div>`;
}

// ========== CRUD ==========
export async function subscribeNotices() {
  try {
    state.allNotices = await fetchNoticesFromSupabase();
    if (!NOTICE_FILTERS.some(filter => filter.id === noticeWorkspaceFilter)) {
      noticeWorkspaceFilter = state.allNotices.some(isNoticeActionable) ? 'action' : 'all';
    }
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
    const index = (state.allNotices || []).findIndex(notice => notice.id === state.editingNoticeId);
    if (index >= 0) state.allNotices[index] = { ...state.allNotices[index], ...normalizedData };
    selectedNoticeId = state.editingNoticeId;
    noticeDetailOpen = true;
    noticeWorkspaceFilter = isNoticeCreatedByCurrentUser(state.allNotices[index]) ? 'mine' : 'all';
  } else {
    const newId = await createNoticeInSupabase(normalizedData);
    state.allNotices = [
      { id: newId, ...normalizedData, createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } },
      ...(state.allNotices || []),
    ];
    selectedNoticeId = newId;
    noticeDetailOpen = true;
    noticeWorkspaceFilter = 'mine';
  }
  noticeWorkspaceQuery = '';

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
  state.allNotices = (state.allNotices || []).filter(notice => notice.id !== id);
  if (selectedNoticeId === id) {
    selectedNoticeId = '';
    noticeDetailOpen = false;
  }
  refreshNoticeVisibility();
}

// ========== お知らせ描画 ==========
export function renderNotices(notices) {
  const board = document.getElementById('notice-board');
  if (!board) return;
  if (noticeSearchComposing && document.activeElement?.id === 'notice-workspace-search') return;

  const visibleNotices = getVisibleNoticesFromList(Array.isArray(notices) ? notices : state.allNotices);
  state.visibleNotices = visibleNotices;
  ensureNoticeWorkspaceFilter(visibleNotices);

  const filterCounts = getNoticeFilterCounts(visibleNotices);
  const filteredNotices = getFilteredNotices(visibleNotices);
  const selectedVisibleNotice = visibleNotices.find(notice => notice.id === selectedNoticeId) || null;
  if (selectedNoticeId && !selectedVisibleNotice) {
    selectedNoticeId = '';
    noticeDetailOpen = false;
  }
  const selectedNotice = noticeDetailOpen ? selectedVisibleNotice : null;
  const unreadCount = getVisibleUnreadCount();
  const resultCountLabel = `${filteredNotices.length}件${noticeWorkspaceQuery ? 'の検索結果' : ''}`;

  board.classList.add('notice-ui-v2');
  board.innerHTML = `
    <div class="notice-workspace-toolbar">
      <div class="notice-workspace-search">
        <i class="material-symbols-rounded" aria-hidden="true">search</i>
        <input
          type="search"
          id="notice-workspace-search"
          aria-label="お知らせを検索"
          value="${esc(noticeWorkspaceQuery)}"
          placeholder="件名・本文・投稿者を検索"
          autocomplete="off"
        >
        ${noticeWorkspaceQuery ? `
          <button type="button" data-notice-search-clear aria-label="検索をクリア">
            <i class="material-symbols-rounded" aria-hidden="true">close</i>
          </button>
        ` : ''}
      </div>
      <div class="notice-workspace-actions">
        ${state.currentUsername && unreadCount > 0 ? `
          <button type="button" class="notice-secondary-action" data-notice-mark-all aria-label="すべて既読にする">
            <i class="material-symbols-rounded" aria-hidden="true">done_all</i>
            <span>すべて既読</span>
          </button>
        ` : ''}
        ${state.isEditMode ? `
          <button type="button" class="notice-primary-action" data-notice-create>
            <i class="material-symbols-rounded" aria-hidden="true">add</i>
            <span>新しいお知らせ</span>
          </button>
        ` : ''}
      </div>
    </div>

    <nav class="notice-filter-bar" aria-label="お知らせの絞り込み">
      ${buildNoticeFilterBar(filterCounts)}
    </nav>

    <div class="notice-workspace-layout${noticeDetailOpen ? ' show-detail' : ''}">
      <section class="notice-inbox-pane" aria-labelledby="notice-inbox-heading">
        <div class="notice-inbox-heading-row">
          <div>
            <h2 id="notice-inbox-heading">${esc(NOTICE_FILTERS.find(filter => filter.id === noticeWorkspaceFilter)?.label || 'お知らせ')}</h2>
            <p>${resultCountLabel}</p>
          </div>
          ${filterCounts.action > 0 ? `<span class="notice-action-summary">要対応 ${filterCounts.action}件</span>` : ''}
        </div>
        <div class="notice-inbox-list" id="notice-inbox-list">
          ${filteredNotices.length > 0
            ? filteredNotices.map(buildNoticeInboxItem).join('')
            : buildNoticeListEmptyHtml()}
        </div>
      </section>

      <article
        class="notice-detail-pane"
        id="notice-detail"
        tabindex="-1"
        ${noticeDetailOpen ? 'data-workspace-subview' : ''}
        aria-label="お知らせの詳細"
      >
        ${buildNoticeDetailHtml(selectedNotice)}
      </article>
    </div>
  `;

  bindNoticeWorkspace(board);
  setupNoticeReactionLoader();
}

function ensureNoticeCenterModal() {
  let modal = document.getElementById('notice-center-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'notice-center-modal';
  modal.className = 'notice-center-modal notice-ui-v2';
  modal.innerHTML = `
    <div class="notice-center-backdrop" data-notice-center-close></div>
    <section class="notice-center-panel" role="dialog" aria-modal="true" aria-label="お知らせ">
      <button type="button" class="notice-center-close" data-notice-center-close aria-label="閉じる">
        <i class="material-symbols-rounded" aria-hidden="true">close</i>
      </button>
      <div class="notice-center-body" id="notice-center-body"></div>
    </section>
  `;
  modal.addEventListener('click', event => {
    if (event.target.closest('[data-notice-center-close]')) closeNoticeCenter();
  });
  document.body.appendChild(modal);
  return modal;
}

export function openNoticeCenter() {
  const board = document.getElementById('notice-board');
  if (!board) return false;

  const modal = ensureNoticeCenterModal();
  const body = modal.querySelector('#notice-center-body');
  if (!body) return false;

  if (!noticeCenterReturnParent && board.parentElement !== body) {
    noticeCenterReturnParent = board.parentElement;
  }

  body.appendChild(board);
  refreshNoticeVisibility();
  modal.classList.add('visible');
  document.body.classList.add('notice-center-open');
  void ensureNoticeReactionsLoaded();
  window.setTimeout(() => board.querySelector('#notice-workspace-search')?.focus({ preventScroll: true }), 80);
  return true;
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

function getNoticeModalFocusable(modal) {
  return [...modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(element => !element.closest('[hidden], [inert]') && element.getClientRects().length > 0);
}

function ensureNoticeModalAccessibility(modal) {
  if (!modal || modal.dataset.noticeA11yBound === '1') return;
  modal.dataset.noticeA11yBound = '1';
  modal.addEventListener('click', event => {
    if (event.target === modal) closeNoticeModal();
  });
  modal.addEventListener('keydown', event => {
    if (!modal.classList.contains('visible')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeNoticeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getNoticeModalFocusable(modal);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

export function openNoticeModal(notice) {
  if (notice && !canManageNotice(notice)) {
    showToast('このお知らせを編集できるのは投稿者または管理者です。', 'warning');
    return false;
  }

  const modal = document.getElementById('notice-modal');
  if (!modal) return false;
  ensureNoticeModalAccessibility(modal);
  noticeModalReturnFocus = document.activeElement;
  state.editingNoticeId = notice ? notice.id : null;
  const targetDepartments = normalizeTargetDepartments(notice?.targetDepartments);
  const targetScope = getNoticeTargetScope(notice);
  document.getElementById('notice-modal-title').textContent = notice ? 'お知らせを編集' : '新しいお知らせ';
  document.getElementById('notice-priority').value = notice?.priority || 'normal';
  document.getElementById('notice-require-ack').checked = !!notice?.requireAcknowledgement;
  document.getElementById('notice-target-scope').value = targetScope;
  renderNoticeTargetDepartments(targetDepartments);
  handleNoticeTargetScopeChange();
  document.getElementById('notice-target-scope')?.closest('.form-group')?.setAttribute('hidden', '');
  document.getElementById('notice-title').value = notice?.title || '';
  document.getElementById('notice-body').value = notice?.body || '';
  document.getElementById('notice-delete').style.display = notice ? 'inline-flex' : 'none';
  modal.removeAttribute('hidden');
  modal.removeAttribute('inert');
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('visible');
  window.setTimeout(() => document.getElementById('notice-title')?.focus(), 100);
  return true;
}

export function closeNoticeModal() {
  const modal = document.getElementById('notice-modal');
  if (!modal) return;
  modal.classList.remove('visible');
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('inert', '');
  modal.setAttribute('hidden', '');
  state.editingNoticeId = null;
  const returnTarget = noticeModalReturnFocus;
  noticeModalReturnFocus = null;
  window.setTimeout(() => {
    const focusTarget = returnTarget?.isConnected
      ? returnTarget
      : document.querySelector('#notice-detail, #notice-workspace-search, .portal-workspace-home-btn');
    focusTarget?.focus({ preventScroll: true });
  }, 0);
}
