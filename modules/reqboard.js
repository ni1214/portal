// ========== 部門間依頼・目安箱 ==========
import { db, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, collection, query, where, orderBy, serverTimestamp, onSnapshot, getDocs } from './config.js';
import { state, REQ_STATUS_LABEL } from './state.js';
import { esc, escHtml, getUserAvatarColor, normalizeProjectKey, _fmtTs } from './utils.js';
import {
  isSupabaseSharedCoreEnabled,
  applySupabaseRuntimeConfig,
  fetchPortalConfigFromSupabase,
  savePortalConfigToSupabase,
  saveUserPreferencesToSupabase,
  fetchReceivedRequestsFromSupabase,
  fetchSentRequestsFromSupabase,
  fetchRequestHistoryFromSupabase,
  createCrossDeptRequestInSupabase,
  updateCrossDeptRequestInSupabase,
  deleteCrossDeptRequestInSupabase,
  fetchSuggestionsFromSupabase,
  createSuggestionInSupabase,
  deleteSuggestionInSupabase,
  updateSuggestionInSupabase,
  fetchRequestCommentsFromSupabase,
  addRequestCommentInSupabase,
  deleteRequestCommentInSupabase,
} from './supabase.js';
import {
  recordGetDocsRead,
  recordListenerStart,
  recordListenerSnapshot,
  wrapTrackedListenerUnsubscribe,
} from './read-diagnostics.js';
import { showToast, showConfirm } from './notify.js';
export const deps = {};

let liveReceivedRequests = [];
let liveSentRequests = [];
let requestMutationRevision = { received: 0, sent: 0 };

const LINKED_TASK_STATUS_LABEL = {
  pending:   { text: '承諾待ち', cls: 'req-task-link--pending' },
  accepted:  { text: '進行中',   cls: 'req-task-link--accepted' },
  done:      { text: '完了',     cls: 'req-task-link--done' },
  cancelled: { text: '取消',     cls: 'req-task-link--cancelled' },
};

export async function loadConfigDepartmentsAndViewers() {
  try {
    const data = await fetchPortalConfigFromSupabase();
    if (Array.isArray(data.departments) && data.departments.length > 0) {
      state.currentDepartments = data.departments;
    }
    state.suggestionBoxViewers = Array.isArray(data.suggestionBoxViewers) ? data.suggestionBoxViewers : [];
    state.isSuggestionBoxViewer = state.currentUsername ? state.suggestionBoxViewers.includes(state.currentUsername) : false;
    state.missionText = data.missionText || '';
  } catch (err) {
    console.error('Supabase config load error:', err);
  }
}

function _sortRequests(list) {
  return [...list].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

function _mergeRequestLists(...lists) {
  const merged = new Map();
  lists.flat().forEach(req => {
    if (req?.id) merged.set(req.id, req);
  });
  return _sortRequests([...merged.values()]);
}

function _isReceivedRequestLive(req) {
  return !req?.archived && req?.status === 'submitted';
}

function _isSentRequestLive(req) {
  return !req?.archived && req?.notifyCreator === true;
}

function _syncReceivedRequests() {
  state.receivedRequests = _mergeRequestLists(state.reqHistoryCache.received, liveReceivedRequests);
}

function _syncSentRequests() {
  state.sentRequests = _mergeRequestLists(state.reqHistoryCache.sent, liveSentRequests);
}

function _syncAllRequests() {
  _syncReceivedRequests();
  _syncSentRequests();
}

function _bumpRequestMutationRevision(sides = ['received', 'sent']) {
  const next = { ...requestMutationRevision };
  sides.forEach(side => {
    if (side === 'received' || side === 'sent') next[side] += 1;
  });
  requestMutationRevision = next;
}

function _markRequestMutation(request) {
  if (!request) {
    _bumpRequestMutationRevision();
    return;
  }

  const sides = [];
  const myDept = state.userEmailProfile ? state.userEmailProfile.department : '';
  if (request.toDept === myDept) sides.push('received');
  if (request.createdBy === state.currentUsername) sides.push('sent');
  _bumpRequestMutationRevision(sides.length ? sides : ['received', 'sent']);
}

function _resetRequestHistoryState() {
  if (state._reqReceivedUnsub) { state._reqReceivedUnsub(); state._reqReceivedUnsub = null; }
  if (state._reqSentUnsub) { state._reqSentUnsub(); state._reqSentUnsub = null; }
  liveReceivedRequests = [];
  liveSentRequests = [];
  state.reqHistoryCache = {
    received: [],
    sent: [],
  };
  state.reqHistoryLoaded = {
    received: false,
    sent: false,
  };
  state.reqHistoryLoading = {
    received: false,
    sent: false,
  };
  _bumpRequestMutationRevision();
  _syncAllRequests();
}

function _upsertRequestHistory(side, req) {
  if (!req?.id) return;
  const current = Array.isArray(state.reqHistoryCache[side]) ? state.reqHistoryCache[side] : [];
  const withoutCurrent = current.filter(item => item.id !== req.id);
  const shouldStayInHistory = side === 'received' ? !_isReceivedRequestLive(req) : !_isSentRequestLive(req);

  state.reqHistoryCache = {
    ...state.reqHistoryCache,
    [side]: shouldStayInHistory ? _sortRequests([...withoutCurrent, req]) : withoutCurrent,
  };
  _syncAllRequests();
}

function _removeRequestFromAllCaches(reqId) {
  if (!reqId) return;
  liveReceivedRequests = liveReceivedRequests.filter(req => req.id !== reqId);
  liveSentRequests = liveSentRequests.filter(req => req.id !== reqId);
  state.reqHistoryCache = {
    received: state.reqHistoryCache.received.filter(req => req.id !== reqId),
    sent: state.reqHistoryCache.sent.filter(req => req.id !== reqId),
  };
  _syncAllRequests();
}

function _reconcileRequestCaches(request) {
  if (!request?.id) return;
  _markRequestMutation(request);
  _removeRequestFromAllCaches(request.id);
  const myDept = state.userEmailProfile ? state.userEmailProfile.department : '';

  if (request.toDept === myDept) {
    if (_isReceivedRequestLive(request)) {
      liveReceivedRequests = _mergeRequestLists(liveReceivedRequests, [request]);
    }
    _upsertRequestHistory('received', request);
  }

  if (request.createdBy === state.currentUsername) {
    if (_isSentRequestLive(request)) {
      liveSentRequests = _mergeRequestLists(liveSentRequests, [request]);
    }
    _upsertRequestHistory('sent', request);
  }

  _syncAllRequests();
}

function _refreshOpenRequestContent() {
  updateReqBadge();
  if (state.reqModalOpen && state.activeReqTab === 'request') renderReqContent();
}

async function _loadRequestHistory(side, force = false) {
  if (!state.currentUsername) return;
  if (!force && state.reqHistoryLoaded[side]) return;
  if (state.reqHistoryLoading[side]) return;

  const myDept = state.userEmailProfile ? state.userEmailProfile.department : '';
  if (side === 'received' && !myDept) return;
  const revisionAtStart = requestMutationRevision[side];
  let shouldRetry = false;

  state.reqHistoryLoading = { ...state.reqHistoryLoading, [side]: true };
  if (state.reqModalOpen && state.activeReqTab === 'request') {
    renderReqContent();
  }

  // Supabase 分岐
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const all = await fetchRequestHistoryFromSupabase(side, { myDept, username: state.currentUsername });
      // liveReceivedRequests / liveSentRequests に既にある id のものを除外
      const historyOnly = all.filter(req =>
        side === 'received' ? !_isReceivedRequestLive(req) : !_isSentRequestLive(req)
      );
      if (requestMutationRevision[side] !== revisionAtStart) {
        shouldRetry = true;
      } else {
        state.reqHistoryCache = { ...state.reqHistoryCache, [side]: historyOnly };
        state.reqHistoryLoaded = { ...state.reqHistoryLoaded, [side]: true };
        _syncAllRequests();
      }
    } catch (err) {
      console.error(`Supabase request history error (${side}):`, err);
    } finally {
      state.reqHistoryLoading = { ...state.reqHistoryLoading, [side]: false };
      if (state.reqModalOpen && state.activeReqTab === 'request') renderReqContent();
      if (shouldRetry) void _loadRequestHistory(side, true);
    }
    return;
  }

  // Supabase の既存コード
  try {
    const historyQuery = side === 'received'
      ? query(collection(db, 'cross_dept_requests'), where('toDept', '==', myDept))
      : query(collection(db, 'cross_dept_requests'), where('createdBy', '==', state.currentUsername));
    const snap = await getDocs(historyQuery);
    recordGetDocsRead(`req.history.${side}`, `部門間依頼履歴:${side}`, side === 'received' ? myDept : state.currentUsername, snap.size, snap.docs);
    const allRequests = _sortRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    const historyOnly = allRequests.filter(req => side === 'received' ? !_isReceivedRequestLive(req) : !_isSentRequestLive(req));

    if (requestMutationRevision[side] !== revisionAtStart) {
      shouldRetry = true;
    } else {
      state.reqHistoryCache = {
        ...state.reqHistoryCache,
        [side]: historyOnly,
      };
      state.reqHistoryLoaded = {
        ...state.reqHistoryLoaded,
        [side]: true,
      };
      _syncAllRequests();
    }
  } catch (err) {
    console.error(`request history load error (${side}):`, err);
  } finally {
    state.reqHistoryLoading = { ...state.reqHistoryLoading, [side]: false };
    if (state.reqModalOpen && state.activeReqTab === 'request') {
      renderReqContent();
    }
    if (shouldRetry) void _loadRequestHistory(side, true);
  }
}

function _ensureRequestHistoryForActiveTab() {
  if (!state.reqModalOpen || state.activeReqTab !== 'request') return;
  if (state.activeReqSubTab === 'received') {
    void _loadRequestHistory('received');
  } else if (state.activeReqSubTab === 'sent') {
    void _loadRequestHistory('sent');
  } else if (state.activeReqSubTab === 'archived') {
    void Promise.all([
      _loadRequestHistory('received'),
      _loadRequestHistory('sent'),
    ]);
  }
}

export function startRequestListeners(username) {
  if (!username) return;
  _resetRequestHistoryState();
  if (state._suggUnsub)        { state._suggUnsub();         state._suggUnsub = null; }

  // Supabase 分岐
  const myDept = state.userEmailProfile ? state.userEmailProfile.department : null;
  if (isSupabaseSharedCoreEnabled()) {
    // 受信依頼（自分の部署宛て, submitted, archived=false）
    if (myDept) {
      fetchReceivedRequestsFromSupabase(myDept).then(rows => {
        liveReceivedRequests = rows;
        _syncReceivedRequests();
        updateReqBadge();
        if (state.reqModalOpen && state.activeReqTab === 'request' && state.activeReqSubTab === 'received') renderReqContent();
      }).catch(err => console.error('Supabase 受信依頼取得エラー:', err));
    }
    // 送信依頼（notifyCreator=true, archived=false）
    fetchSentRequestsFromSupabase(username).then(rows => {
      liveSentRequests = rows;
      _syncSentRequests();
      updateReqBadge();
      if (state.reqModalOpen && state.activeReqTab === 'request' && state.activeReqSubTab === 'sent') renderReqContent();
    }).catch(err => console.error('Supabase 送信依頼取得エラー:', err));
    // 目安箱（Supabase: ポーリングなし・一度だけ取得）
    if (state.isSuggestionBoxViewer) {
      fetchSuggestionsFromSupabase().then(suggestions => {
        state.suggestionList = suggestions.map(s => ({
          id: s.id,
          content: s.content,
          author: s.isAnonymous ? '匿名' : s.createdBy,
          isAnonymous: s.isAnonymous,
          archived: s.archived,
          adminReply: s.adminReply,
          repliedBy: s.repliedBy,
          repliedAt: s.repliedAt,
          createdAt: s.createdAt,
          category: s.category || 'other',
        }));
        updateReqBadge();
        if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
      }).catch(err => console.error('Supabase 目安箱取得エラー:', err));
    }
    return;
  }

  // Supabase の既存コード（onSnapshot 3つ）
  if (myDept) {
    const rQ = query(
      collection(db, 'cross_dept_requests'),
      where('toDept', '==', myDept),
      where('status', '==', 'submitted'),
      where('archived', '==', false),
    );
    recordListenerStart('req.received', '受信部門間依頼', `cross_dept_requests:${myDept}`);
    state._reqReceivedUnsub = wrapTrackedListenerUnsubscribe('req.received', onSnapshot(rQ, snap => {
      recordListenerSnapshot('req.received', snap.size, myDept, snap.docs);
      liveReceivedRequests = _sortRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      _syncReceivedRequests();
      updateReqBadge();
      if (state.reqModalOpen && state.activeReqTab === 'request' && state.activeReqSubTab === 'received') renderReqContent();
    }, err => console.error('receivedRequests listener error:', err)));
  }

  // 自分が送信した依頼を監視

  const sQ = query(
    collection(db, 'cross_dept_requests'),
    where('createdBy', '==', username),
    where('notifyCreator', '==', true),
    where('archived', '==', false),
  );
  recordListenerStart('req.sent', '送信部門間依頼', `cross_dept_requests:${username}`);
  state._reqSentUnsub = wrapTrackedListenerUnsubscribe('req.sent', onSnapshot(sQ, snap => {
    recordListenerSnapshot('req.sent', snap.size, username, snap.docs);
    liveSentRequests = _sortRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    _syncSentRequests();
    updateReqBadge();
    if (state.reqModalOpen && state.activeReqTab === 'request' && state.activeReqSubTab === 'sent') renderReqContent();
  }, err => console.error('sentRequests listener error:', err)));

  // 目安箱（閲覧権限あり）

  if (state.isSuggestionBoxViewer) {
    const suggQ = query(collection(db, 'suggestion_box'), orderBy('createdAt', 'desc'));
    recordListenerStart('req.suggestion', '目安箱一覧', 'suggestion_box');
    state._suggUnsub = wrapTrackedListenerUnsubscribe('req.suggestion', onSnapshot(suggQ, snap => {
      recordListenerSnapshot('req.suggestion', snap.size, 'suggestion_box', snap.docs);
      state.suggestionList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateReqBadge();
      if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
    }, err => console.error('suggestion_box listener error:', err)));
  }
}  // end startRequestListeners

export function stopRequestListeners() {
  if (state._reqReceivedUnsub) { state._reqReceivedUnsub(); state._reqReceivedUnsub = null; }
  if (state._reqSentUnsub)     { state._reqSentUnsub();     state._reqSentUnsub = null; }
  if (state._suggUnsub)        { state._suggUnsub();         state._suggUnsub = null; }
  liveReceivedRequests = [];
  liveSentRequests = [];
  state.receivedRequests = [];
  state.sentRequests = [];
  state.reqHistoryCache = { received: [], sent: [] };
  state.reqHistoryLoaded = { received: false, sent: false };
  state.reqHistoryLoading = { received: false, sent: false };
  _bumpRequestMutationRevision();
  state.suggestionList = [];
}

export function updateReqBadge() {
  const badge = document.getElementById('req-badge');
  if (!badge) return;
  const myDept = state.userEmailProfile ? state.userEmailProfile.department : null;
  // 受け取った依頼のうち「提出済み（未対応）」
  const recvCount = myDept ? state.receivedRequests.filter(r => !r.archived && r.status === 'submitted').length : 0;
  // 自分の依頼でステータス変更通知
  const sentCount = state.sentRequests.filter(r => !r.archived && r.notifyCreator === true).length;
  // 目安箱の未読
  let suggCount = 0;
  if (state.isSuggestionBoxViewer) {
    const lastViewed = state.lastViewedSuggestionsAt;
    const _tsToSecs = (ts) => !ts ? 0 : ts instanceof Date ? Math.floor(ts.getTime() / 1000) : (ts.seconds ?? 0);
    suggCount = state.suggestionList.filter(s => !s.archived && _tsToSecs(s.createdAt) > lastViewed).length;
  }
  const total = recvCount + sentCount + suggCount;
  badge.hidden = total === 0;
  badge.textContent = total > 99 ? '99+' : String(total);

  // タブバッジ
  const reqTabBadge  = document.getElementById('req-tab-request-badge');
  const suggTabBadge = document.getElementById('req-tab-suggestion-badge');
  if (reqTabBadge) {
    const reqTotal = recvCount + sentCount;
    reqTabBadge.hidden = reqTotal === 0;
    reqTabBadge.textContent = reqTotal > 99 ? '99+' : String(reqTotal);
  }
  if (suggTabBadge) {
    suggTabBadge.hidden = suggCount === 0;
    suggTabBadge.textContent = suggCount > 99 ? '99+' : String(suggCount);
  }
  [
    ['req-workspace-received-badge', recvCount],
    ['req-workspace-sent-badge', sentCount],
    ['req-workspace-suggestion-badge', suggCount],
  ].forEach(([id, count]) => {
    const workspaceBadge = document.getElementById(id);
    if (!workspaceBadge) return;
    workspaceBadge.hidden = count === 0;
    workspaceBadge.textContent = count > 99 ? '99+' : String(count);
  });
  _syncReqWorkspaceContext();
  deps.updateSummaryCards?.();
  deps.renderTodayDashboard?.();
}

export function openReqModal(initialTab) {
  state.reqModalOpen = true;
  if (initialTab) state.activeReqTab = initialTab;
  document.getElementById('reqboard-modal').classList.add('visible');
  _syncReqTabUI();
  renderReqContent();
  _ensureRequestHistoryForActiveTab();
}

export function closeReqModal() {
  state.reqModalOpen = false;
  document.getElementById('reqboard-modal').classList.remove('visible');
  closeReqTaskifyModal();
}

export function initReqWorkspaceShortcuts() {
  const modal = document.getElementById('reqboard-modal');
  if (!modal || modal.dataset.reqWorkspaceShortcutsBound === '1') return;
  modal.dataset.reqWorkspaceShortcutsBound = '1';
  modal.addEventListener('click', event => {
    const action = event.target instanceof Element
      ? event.target.closest('[data-req-workspace-action]')
      : null;
    if (!action || !modal.contains(action)) return;

    const target = action.dataset.reqWorkspaceAction;
    if (target === 'suggestion') {
      switchReqTab('suggestion');
      return;
    }

    if (target === 'received' || target === 'sent' || target === 'new' || target === 'archived') {
      switchReqTab('request');
      switchReqSubTab(target);
    }
  });
}

export function switchReqTab(tab) {
  state.activeReqTab = tab;
  if (tab === 'suggestion') {
    _markSuggestionsViewed();
  }
  _syncReqTabUI();
  renderReqContent();
  _ensureRequestHistoryForActiveTab();
}

export function switchReqSubTab(subtab) {
  state.activeReqSubTab = subtab;
  // 自分の依頼タブを開いたら notifyCreator=true のものをクリア
  if (subtab === 'sent') {
    state.sentRequests.filter(r => r.notifyCreator).forEach(r => markRequestSeen(r.id));
  }
  _syncReqSubTabUI();
  renderReqContent();
  _ensureRequestHistoryForActiveTab();
}

// ===== アーカイブ・削除 =====
export async function archiveRequest(id) {
  try {
    const current = _getRequestById(id);
    if (isSupabaseSharedCoreEnabled()) {
      await updateCrossDeptRequestInSupabase(id, { archived: true });
      if (current) {
        const updated = { ...current, archived: true, updatedAt: { seconds: Math.floor(Date.now() / 1000) } };
        _reconcileRequestCaches(updated);
      }
      _refreshOpenRequestContent();
      return;
    }
    await updateDoc(doc(db, 'cross_dept_requests', id), { archived: true, updatedAt: serverTimestamp() });
    if (current) {
      const updated = { ...current, archived: true, updatedAt: { seconds: Math.floor(Date.now() / 1000) } };
      _reconcileRequestCaches(updated);
    }
    _refreshOpenRequestContent();
  } catch (err) { console.error('アーカイブエラー:', err); showToast('アーカイブに失敗しました', 'error'); }
}

export async function unarchiveRequest(id) {
  try {
    const current = _getRequestById(id);
    if (isSupabaseSharedCoreEnabled()) {
      await updateCrossDeptRequestInSupabase(id, { archived: false });
      if (current) {
        const updated = { ...current, archived: false, updatedAt: { seconds: Math.floor(Date.now() / 1000) } };
        _reconcileRequestCaches(updated);
      }
      _refreshOpenRequestContent();
      return;
    }
    await updateDoc(doc(db, 'cross_dept_requests', id), { archived: false, updatedAt: serverTimestamp() });
    if (current) {
      const updated = { ...current, archived: false, updatedAt: { seconds: Math.floor(Date.now() / 1000) } };
      _reconcileRequestCaches(updated);
    }
    _refreshOpenRequestContent();
  } catch (err) { console.error('アーカイブ解除エラー:', err); showToast('解除に失敗しました', 'error'); }
}

export async function deleteRequest(id) {
  if (!await showConfirm('この依頼を完全に削除しますか？この操作は取り消せません。', { danger: true })) return;
  try {
    const current = _getRequestById(id);
    if (isSupabaseSharedCoreEnabled()) {
      await deleteCrossDeptRequestInSupabase(id);
      _markRequestMutation(current);
      _removeRequestFromAllCaches(id);
      _refreshOpenRequestContent();
      return;
    }
    await deleteDoc(doc(db, 'cross_dept_requests', id));
    _markRequestMutation(current);
    _removeRequestFromAllCaches(id);
    _refreshOpenRequestContent();
  } catch (err) { console.error('削除エラー:', err); showToast('削除に失敗しました', 'error'); }
}

export async function archiveSuggestion(id) {
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await updateSuggestionInSupabase(id, { archived: true });
    } else {
      await updateDoc(doc(db, 'suggestion_box', id), { archived: true });
    }
    const s = state.suggestionList.find(x => x.id === id);
    if (s) s.archived = true;
    updateReqBadge();
    if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
  } catch (err) { console.error('アーカイブエラー:', err); showToast('アーカイブに失敗しました', 'error'); }
}

export async function unarchiveSuggestion(id) {
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await updateSuggestionInSupabase(id, { archived: false });
    } else {
      await updateDoc(doc(db, 'suggestion_box', id), { archived: false });
    }
    const s = state.suggestionList.find(x => x.id === id);
    if (s) s.archived = false;
    updateReqBadge();
    if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
  } catch (err) { console.error('アーカイブ解除エラー:', err); showToast('解除に失敗しました', 'error'); }
}

export async function deleteSuggestion(id) {
  if (!await showConfirm('この投稿を完全に削除しますか？この操作は取り消せません。', { danger: true })) return;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await deleteSuggestionInSupabase(id);
    } else {
      await deleteDoc(doc(db, 'suggestion_box', id));
    }
    state.suggestionList = (state.suggestionList || []).filter(s => s.id !== id);
    updateReqBadge();
    if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
  } catch (err) { console.error('削除エラー:', err); showToast('削除に失敗しました', 'error'); }
}

function _syncReqTabUI() {
  document.querySelectorAll('.reqboard-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === state.activeReqTab);
  });
  document.getElementById('reqboard-request-area').hidden    = state.activeReqTab !== 'request';
  document.getElementById('reqboard-suggestion-area').hidden = state.activeReqTab !== 'suggestion';
  _syncReqWorkspaceActions();
}

function _syncReqSubTabUI() {
  document.querySelectorAll('.reqboard-subtab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.subtab === state.activeReqSubTab);
  });
  _syncReqWorkspaceActions();
}

function _syncReqWorkspaceActions() {
  document.querySelectorAll('[data-req-workspace-action]').forEach(btn => {
    const action = btn.dataset.reqWorkspaceAction;
    const isActive = action === 'suggestion'
      ? state.activeReqTab === 'suggestion'
      : state.activeReqTab === 'request' && state.activeReqSubTab === action;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
  _syncReqWorkspaceContext();
}

function _getArchivedRequests() {
  const seen = new Set();
  return [
    ...state.receivedRequests.filter(request => request.archived),
    ...state.sentRequests.filter(request => request.archived),
  ].filter(request => {
    if (seen.has(request.id)) return false;
    seen.add(request.id);
    return true;
  });
}

function _syncReqWorkspaceContext() {
  const activeView = state.activeReqTab === 'suggestion'
    ? 'suggestion'
    : state.activeReqSubTab;
  const viewMeta = {
    received: {
      title: '受け取った依頼',
      description: '自部署に届いた依頼を確認し、対応状況を更新します。',
      count: state.receivedRequests.filter(request => !request.archived).length,
    },
    sent: {
      title: '自分の依頼',
      description: '送信した依頼の進み具合や、相手部署からの返信を確認します。',
      count: state.sentRequests.filter(request => !request.archived).length,
    },
    new: {
      title: '依頼を作成',
      description: '相手が判断しやすいよう、依頼先・内容・物件Noをまとめて送ります。',
      count: null,
    },
    archived: {
      title: 'アーカイブ',
      description: '保管した依頼を確認し、必要なものだけ元に戻せます。',
      count: _getArchivedRequests().length,
    },
    suggestion: {
      title: '目安箱',
      description: '業務改善や設備、安全に関する提案を匿名でも投稿できます。',
      count: state.isSuggestionBoxViewer
        ? state.suggestionList.filter(suggestion => !suggestion.archived).length
        : null,
    },
  }[activeView] || null;

  const modal = document.getElementById('reqboard-modal');
  if (modal) modal.dataset.reqWorkspaceView = activeView;
  if (!viewMeta) return;

  const title = document.getElementById('req-view-title');
  const description = document.getElementById('req-view-description');
  const count = document.getElementById('req-view-count');
  if (title) title.textContent = viewMeta.title;
  if (description) description.textContent = viewMeta.description;
  if (count) {
    count.hidden = viewMeta.count === null;
    count.textContent = viewMeta.count === null ? '' : `${viewMeta.count}件`;
  }
}

export function renderReqContent() {
  if (!state.reqModalOpen) return;
  if (state.activeReqTab === 'request') {
    _syncReqSubTabUI();
    const container = document.getElementById('reqboard-request-content');
    if (!container) return;
    if (state.activeReqSubTab === 'received')        _renderReceivedRequests(container);
    else if (state.activeReqSubTab === 'sent')       _renderSentRequests(container);
    else if (state.activeReqSubTab === 'new')        _renderNewRequestForm(container);
    else if (state.activeReqSubTab === 'archived')   _renderArchivedRequests(container);
  } else {
    const container = document.getElementById('reqboard-suggestion-content');
    if (!container) return;
    _renderSuggestionPanel(container);
  }
}

// ===== 部門間依頼コメント =====
function _requestCommentSectionHtml(requestId) {
  if (!isSupabaseSharedCoreEnabled()) return '';
  const isExpanded = state.expandedRequestCommentId === requestId;
  const comments   = state.requestComments[requestId] || [];
  const isLoading  = state.requestCommentsLoading[requestId] || false;
  const count      = comments.length;
  const commentAreaId = `req-comments-${String(requestId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  let inner = '';
  if (isExpanded) {
    if (isLoading) {
      inner = '<div class="tc-loading"><span class="spinner"></span></div>';
    } else {
      const list = comments.map(c => `
        <div class="tc-item">
          <span class="tc-author" style="color:${getUserAvatarColor(c.username)}">${escHtml(c.username)}</span>
          <span class="tc-body">${escHtml(c.body)}</span>
          ${c.username === state.currentUsername
            ? `<button type="button" class="rc-del tc-del" data-cid="${c.id}" data-req-id="${requestId}" title="コメントを削除" aria-label="コメントを削除"><i class="fa-solid fa-trash-can"></i></button>`
            : ''}
        </div>
      `).join('');
      inner = `
        <div class="tc-list">${list || '<div class="tc-empty">コメントはまだありません</div>'}</div>
        <div class="tc-input-row">
          <input type="text" class="rc-input form-input" placeholder="コメントを入力…" data-req-id="${requestId}" autocomplete="off">
          <button type="button" class="rc-send btn-modal-primary" data-req-id="${requestId}" title="コメントを送信" aria-label="コメントを送信"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      `;
    }
  }

  return `
    <div class="tc-wrapper">
      <button type="button" class="rc-toggle tc-toggle${isExpanded ? ' tc-toggle--open' : ''}" data-req-id="${requestId}" aria-expanded="${isExpanded}" aria-controls="${commentAreaId}">
        <i class="fa-regular fa-comment${isExpanded ? '-dots' : ''}"></i>
        コメント${count ? ` <span class="tc-count">${count}</span>` : ''}
      </button>
      ${isExpanded ? `<div class="tc-area" id="${commentAreaId}">${inner}</div>` : ''}
    </div>
  `;
}

async function _loadRequestComments(requestId) {
  state.requestCommentsLoading = { ...state.requestCommentsLoading, [requestId]: true };
  renderReqContent();
  try {
    const comments = await fetchRequestCommentsFromSupabase(requestId);
    state.requestComments = { ...state.requestComments, [requestId]: comments };
  } catch (e) {
    showToast('コメントの読み込みに失敗しました', 'error');
  } finally {
    state.requestCommentsLoading = { ...state.requestCommentsLoading, [requestId]: false };
    renderReqContent();
  }
}

function _bindRequestCommentEvents(container) {
  // トグル
  container.querySelectorAll('.rc-toggle[data-req-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.reqId;
      if (state.expandedRequestCommentId === id) {
        state.expandedRequestCommentId = null;
        renderReqContent();
        return;
      }
      state.expandedRequestCommentId = id;
      if (!state.requestComments[id]) {
        void _loadRequestComments(id);
      } else {
        renderReqContent();
      }
    });
  });

  // 送信ボタン
  container.querySelectorAll('.rc-send[data-req-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.reqId;
      const input = container.querySelector(`.rc-input[data-req-id="${id}"]`);
      const body = (input?.value || '').trim();
      if (!body) return;
      input.value = '';
      try {
        const comment = await addRequestCommentInSupabase({
          requestId: id,
          username: state.currentUsername,
          body,
        });
        if (comment) {
          state.requestComments = {
            ...state.requestComments,
            [id]: [...(state.requestComments[id] || []), comment],
          };
        }
        renderReqContent();
      } catch (e) {
        showToast('コメントの送信に失敗しました', 'error');
      }
    });
  });

  // Enterキー送信
  container.querySelectorAll('.rc-input[data-req-id]').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        container.querySelector(`.rc-send[data-req-id="${input.dataset.reqId}"]`)?.click();
      }
    });
  });

  // 削除ボタン
  container.querySelectorAll('.rc-del[data-cid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cid = btn.dataset.cid;
      const reqId = btn.dataset.reqId;
      try {
        await deleteRequestCommentInSupabase(cid);
        state.requestComments = {
          ...state.requestComments,
          [reqId]: (state.requestComments[reqId] || []).filter(c => c.id !== cid),
        };
        renderReqContent();
      } catch (e) {
        showToast('削除に失敗しました', 'error');
      }
    });
  });
}

function _reqStatusHtml(status) {
  const s = REQ_STATUS_LABEL[status] || { text: status, cls: '' };
  return `<span class="req-status-badge ${s.cls}">${s.text}</span>`;
}

function _requestProjectKeyFilterValue() {
  return normalizeProjectKey(state.reqProjectKeyFilter || '').toLowerCase();
}

function _filterRequestsByProjectKey(list) {
  const filter = _requestProjectKeyFilterValue();
  if (!filter) return list;
  return list.filter(req =>
    normalizeProjectKey(req.projectKey || '').toLowerCase().includes(filter)
  );
}

function _requestFilterBarHtml(totalCount, filteredCount) {
  const currentValue = escHtml(state.reqProjectKeyFilter || '');
  const countLabel = state.reqProjectKeyFilter
    ? `${filteredCount} / ${totalCount}件`
    : `${totalCount}件`;
  return `
    <div class="req-project-filter-row">
      <div class="req-project-filter-input-wrap">
        <i class="fa-solid fa-magnifying-glass req-project-filter-icon"></i>
        <input
          type="text"
          id="req-project-filter-input"
          class="form-input req-project-filter-input"
          placeholder="物件Noで絞り込み"
          value="${currentValue}"
          autocomplete="off"
        >
        <button
          type="button"
          class="req-project-filter-clear"
          id="req-project-filter-clear"
          ${state.reqProjectKeyFilter ? '' : 'hidden'}
          title="検索をクリア"
        ><i class="fa-solid fa-xmark"></i></button>
      </div>
      <span class="req-project-filter-count">${countLabel}</span>
    </div>
  `;
}

function _bindRequestProjectFilterEvents() {
  const input = document.getElementById('req-project-filter-input');
  const clearBtn = document.getElementById('req-project-filter-clear');
  if (input) {
    if (input._reqFilterHandler) input.removeEventListener('input', input._reqFilterHandler);
    input._reqFilterHandler = e => {
      const caret = e.target.selectionStart ?? e.target.value.length;
      state.reqProjectKeyFilter = normalizeProjectKey(e.target.value || '');
      renderReqContent();
      const nextInput = document.getElementById('req-project-filter-input');
      if (nextInput) {
        nextInput.focus({ preventScroll: true });
        nextInput.setSelectionRange(caret, caret);
      }
    };
    input.addEventListener('input', input._reqFilterHandler);
  }
  if (clearBtn) {
    if (clearBtn._reqFilterClearHandler) clearBtn.removeEventListener('click', clearBtn._reqFilterClearHandler);
    clearBtn._reqFilterClearHandler = () => {
      state.reqProjectKeyFilter = '';
      renderReqContent();
    };
    clearBtn.addEventListener('click', clearBtn._reqFilterClearHandler);
  }
}

function _getRequestById(reqId) {
  return [...state.receivedRequests, ...state.sentRequests].find(r => r.id === reqId) || null;
}

function _canCreateTaskFromRequest(req) {
  return !!req
    && !req.archived
    && req.status !== 'rejected'
    && (!req.linkedTaskStatus || req.linkedTaskStatus === 'cancelled');
}

function _requestTaskSummaryHtml(req) {
  const statusInfo = LINKED_TASK_STATUS_LABEL[req.linkedTaskStatus || ''] || null;
  if (!statusInfo && !req.linkedTaskAssignedTo) return '';
  const linkedBy = req.linkedTaskLinkedBy ? ` / 起票: ${escHtml(req.linkedTaskLinkedBy)}` : '';
  const linkedAt = req.linkedTaskLinkedAt ? ` / ${_fmtTs(req.linkedTaskLinkedAt)}` : '';
  return `
    <div class="req-linked-task">
      <div class="req-linked-task-header">
        <span class="req-sub-label">関連タスク</span>
        ${statusInfo ? `<span class="req-linked-task-badge ${statusInfo.cls}">${statusInfo.text}</span>` : ''}
      </div>
      <div class="req-linked-task-meta">
        ${req.linkedTaskAssignedTo ? `担当: ${escHtml(req.linkedTaskAssignedTo)}` : '担当未設定'}
        ${linkedBy}${linkedAt}
      </div>
    </div>
  `;
}

function _requestProjectKeyHtml(projectKey) {
  if (!projectKey) return '';
  return `
    <div class="req-item-sub req-item-sub--project">
      <span class="req-sub-label">物件No</span>
      <span class="req-project-key-chip">${escHtml(projectKey)}</span>
    </div>
  `;
}

function _buildRequestTaskDescription(req, extraNote = '') {
  const parts = [
    `【部門間依頼】${req.fromDept || '-'} → ${req.toDept || '-'}`,
    req.projectKey ? `物件No: ${req.projectKey}` : '',
    req.content || '',
    req.proposal ? `対策・提案: ${req.proposal}` : '',
    req.remarks ? `備考: ${req.remarks}` : '',
    extraNote ? `タスク化メモ: ${extraNote}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

function _setReqTaskifyAssignee(name = '') {
  state.reqTaskifyAssignee = name;
  const display = document.getElementById('req-taskify-assignee-display');
  if (!display) return;
  display.textContent = name || '未選択';
  display.classList.toggle('selected', !!name);
}

export async function openReqTaskifyModal(reqId) {
  const req = state.receivedRequests.find(r => r.id === reqId);
  if (!req) return;
  if (!_canCreateTaskFromRequest(req)) {
    showToast('この依頼は現在タスク化できません', 'warning');
    return;
  }
  state._pendingReqTaskify = { reqId };
  _setReqTaskifyAssignee('');
  const summary = document.getElementById('req-taskify-summary');
  if (summary) {
    summary.innerHTML = `
      <div class="req-taskify-summary-title">${escHtml(req.title)}</div>
      <div class="req-taskify-summary-meta">${escHtml(req.fromDept || req.createdBy || '')} → ${escHtml(req.toDept || '')}</div>
      ${req.projectKey ? `<div class="req-taskify-summary-project"><span>物件No</span><strong>${escHtml(req.projectKey)}</strong></div>` : ''}
      <div class="req-taskify-summary-body">${escHtml(req.content || '')}</div>
    `;
  }
  const dueEl = document.getElementById('req-taskify-due');
  const noteEl = document.getElementById('req-taskify-note');
  if (dueEl) dueEl.value = '';
  if (noteEl) noteEl.value = '';
  document.getElementById('req-taskify-modal')?.classList.add('visible');
}

export function closeReqTaskifyModal() {
  document.getElementById('req-taskify-modal')?.classList.remove('visible');
  state._pendingReqTaskify = null;
  _setReqTaskifyAssignee('');
  const dueEl = document.getElementById('req-taskify-due');
  const noteEl = document.getElementById('req-taskify-note');
  if (dueEl) dueEl.value = '';
  if (noteEl) noteEl.value = '';
}

export async function openReqTaskifyUserPicker() {
  document.getElementById('task-user-picker-modal')?.classList.add('visible');
  const searchEl = document.getElementById('task-user-search');
  if (searchEl) searchEl.value = '';
  await deps.loadUsersForChatPicker?.('task-user-list', 'task-user-search', (name) => {
    _setReqTaskifyAssignee(name);
    document.getElementById('task-user-picker-modal')?.classList.remove('visible');
  }, false);
}

export async function submitRequestTaskify() {
  const reqId = state._pendingReqTaskify?.reqId;
  const req = reqId ? _getRequestById(reqId) : null;
  if (!req) return;
  if (!_canCreateTaskFromRequest(req)) {
    showToast('この依頼は現在タスク化できません', 'warning');
    return;
  }
  if (!state.reqTaskifyAssignee) {
    showToast('担当者を選択してください', 'warning');
    return;
  }

  const dueDate = document.getElementById('req-taskify-due')?.value || '';
  const extraNote = document.getElementById('req-taskify-note')?.value.trim() || '';
  const btn = document.getElementById('req-taskify-confirm');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'タスク化中...';
  }
  try {
    const taskInput = {
      title: req.title,
      description: _buildRequestTaskDescription(req, extraNote),
      assignedBy: state.currentUsername,
      assignedTo: state.reqTaskifyAssignee,
      dueDate,
      projectKey: req.projectKey || '',
      sourceType: 'cross_dept_request',
      sourceRequestId: req.id,
      sourceRequestFromDept: req.fromDept || '',
      sourceRequestToDept: req.toDept || '',
    };
    const taskRef = deps.createTaskRecord
      ? await deps.createTaskRecord(taskInput)
      : await addDoc(collection(db, 'assigned_tasks'), {
          ...taskInput,
          status: 'pending',
          createdAt: serverTimestamp(),
          acceptedAt: null,
          doneAt: null,
          notifiedDone: false,
          sharedWith: [],
          sharedResponses: {},
        });

    if (isSupabaseSharedCoreEnabled()) {
      await updateCrossDeptRequestInSupabase(req.id, {
        status: 'accepted',
        statusUpdatedBy: state.currentUsername,
        notifyCreator: true,
        linkedTaskId: taskRef.id,
        linkedTaskStatus: 'pending',
        linkedTaskAssignedTo: state.reqTaskifyAssignee,
        linkedTaskLinkedAt: new Date().toISOString(),
        linkedTaskLinkedBy: state.currentUsername,
        linkedTaskClosedAt: null,
      });
    } else {
      await updateDoc(doc(db, 'cross_dept_requests', req.id), {
        status: 'accepted',
        statusUpdatedBy: state.currentUsername,
        updatedAt: serverTimestamp(),
        notifyCreator: true,
        linkedTaskId: taskRef.id,
        linkedTaskStatus: 'pending',
        linkedTaskAssignedTo: state.reqTaskifyAssignee,
        linkedTaskLinkedAt: serverTimestamp(),
        linkedTaskLinkedBy: state.currentUsername,
        linkedTaskClosedAt: null,
      });
    }
    _reconcileRequestCaches({
      ...req,
      status: 'accepted',
      statusUpdatedBy: state.currentUsername,
      notifyCreator: true,
      linkedTaskId: taskRef.id,
      linkedTaskStatus: 'pending',
      linkedTaskAssignedTo: state.reqTaskifyAssignee,
      linkedTaskLinkedAt: { seconds: Math.floor(Date.now() / 1000) },
      linkedTaskLinkedBy: state.currentUsername,
      linkedTaskClosedAt: null,
      updatedAt: { seconds: Math.floor(Date.now() / 1000) },
    });
    _refreshOpenRequestContent();
    closeReqTaskifyModal();
  } catch (err) {
    console.error('依頼タスク化エラー:', err);
    showToast('タスク化に失敗しました', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'タスク化する';
    }
  }
}

export function _renderReceivedRequests(container) {
  if (state.reqHistoryLoading.received && !state.receivedRequests.length) {
    container.innerHTML = '<div class="req-empty"><span class="spinner"></span><p>履歴を読み込み中です...</p></div>';
    return;
  }
  const myDept = state.userEmailProfile ? state.userEmailProfile.department : null;
  if (!myDept) {
    container.innerHTML = `<div class="req-empty"><i class="fa-solid fa-building"></i><p>まず設定から部署を登録してください</p></div>`;
    return;
  }
  const list = state.receivedRequests.filter(r => !r.archived);
  if (list.length === 0) {
    container.innerHTML = `<div class="req-empty"><i class="fa-solid fa-inbox"></i><p>受け取った依頼はありません</p></div>`;
    return;
  }
  const filtered = _filterRequestsByProjectKey(list);
  if (filtered.length === 0) {
    container.innerHTML = `
      ${_requestFilterBarHtml(list.length, filtered.length)}
      <div class="req-empty"><i class="fa-solid fa-magnifying-glass"></i><p>物件Noに一致する依頼はありません</p></div>
    `;
    _bindRequestProjectFilterEvents();
    return;
  }
  container.innerHTML = _requestFilterBarHtml(list.length, filtered.length) + filtered.map(r => `
    <div class="req-item">
      <div class="req-item-header">
        ${_reqStatusHtml(r.status)}
        <span class="req-dept-badge from">${escHtml(r.fromDept || r.createdBy)}</span>
        <span class="req-arrow">→</span>
        <span class="req-dept-badge to">${escHtml(r.toDept)}</span>
        <span class="req-date">${_fmtTs(r.createdAt)}</span>
      </div>
      <div class="req-item-title">${escHtml(r.title)}</div>
      ${_requestProjectKeyHtml(r.projectKey)}
      <div class="req-item-body">${escHtml(r.content)}</div>
      ${r.proposal ? `<div class="req-item-sub"><span class="req-sub-label">対策・提案</span>${escHtml(r.proposal)}</div>` : ''}
      ${r.remarks  ? `<div class="req-item-sub"><span class="req-sub-label">備考</span>${escHtml(r.remarks)}</div>` : ''}
      ${r.statusNote ? `<div class="req-item-sub"><span class="req-sub-label">コメント</span>${escHtml(r.statusNote)}</div>` : ''}
      ${_requestTaskSummaryHtml(r)}
      <div class="req-item-actions">
        ${_canCreateTaskFromRequest(r) ? `<button class="btn-req-taskify" data-id="${r.id}"><i class="fa-solid fa-list-check"></i> ${r.linkedTaskStatus === 'cancelled' ? '再タスク化' : 'タスク化'}</button>` : ''}
        <button class="btn-req-status" data-id="${r.id}"><i class="fa-solid fa-pen-to-square"></i> ステータス変更</button>
        <button class="btn-req-archive" data-id="${r.id}" title="アーカイブに移動"><i class="fa-solid fa-box-archive"></i> アーカイブ</button>
      </div>
      ${_requestCommentSectionHtml(r.id)}
    </div>
  `).join('');
  _bindRequestProjectFilterEvents();
  _bindRequestCommentEvents(container);
  container.querySelectorAll('.btn-req-status').forEach(btn => {
    btn.addEventListener('click', () => openStatusModal(btn.dataset.id));
  });
  container.querySelectorAll('.btn-req-taskify').forEach(btn => {
    btn.addEventListener('click', () => openReqTaskifyModal(btn.dataset.id));
  });
  container.querySelectorAll('.btn-req-archive').forEach(btn => {
    btn.addEventListener('click', () => archiveRequest(btn.dataset.id));
  });
}

export function _renderSentRequests(container) {
  if (state.reqHistoryLoading.sent && !state.sentRequests.length) {
    container.innerHTML = '<div class="req-empty"><span class="spinner"></span><p>履歴を読み込み中です...</p></div>';
    return;
  }
  const list = state.sentRequests.filter(r => !r.archived);
  if (list.length === 0) {
    container.innerHTML = `<div class="req-empty"><i class="fa-solid fa-paper-plane"></i><p>投稿した依頼はありません</p></div>`;
    return;
  }
  const filtered = _filterRequestsByProjectKey(list);
  if (filtered.length === 0) {
    container.innerHTML = `
      ${_requestFilterBarHtml(list.length, filtered.length)}
      <div class="req-empty"><i class="fa-solid fa-magnifying-glass"></i><p>物件Noに一致する依頼はありません</p></div>
    `;
    _bindRequestProjectFilterEvents();
    return;
  }
  container.innerHTML = _requestFilterBarHtml(list.length, filtered.length) + filtered.map(r => `
    <div class="req-item${r.notifyCreator ? ' req-item--notify' : ''}">
      <div class="req-item-header">
        ${_reqStatusHtml(r.status)}
        <span class="req-dept-badge to">${escHtml(r.toDept)}</span>
        <span class="req-date">${_fmtTs(r.createdAt)}</span>
        ${r.notifyCreator ? '<span class="req-notify-dot" title="ステータスが変更されました">●</span>' : ''}
      </div>
      <div class="req-item-title">${escHtml(r.title)}</div>
      ${_requestProjectKeyHtml(r.projectKey)}
      <div class="req-item-body">${escHtml(r.content)}</div>
      ${r.statusNote ? `<div class="req-item-sub"><span class="req-sub-label">コメント</span>${escHtml(r.statusNote)}</div>` : ''}
      ${_requestTaskSummaryHtml(r)}
      <div class="req-item-actions">
        <button class="btn-req-status" data-id="${r.id}"><i class="fa-solid fa-pen-to-square"></i> ステータス変更</button>
        <button class="btn-req-archive" data-id="${r.id}" title="アーカイブに移動"><i class="fa-solid fa-box-archive"></i> アーカイブ</button>
      </div>
      ${_requestCommentSectionHtml(r.id)}
    </div>
  `).join('');
  _bindRequestProjectFilterEvents();
  _bindRequestCommentEvents(container);
  container.querySelectorAll('.btn-req-status').forEach(btn => {
    btn.addEventListener('click', () => openStatusModal(btn.dataset.id));
  });
  container.querySelectorAll('.btn-req-archive').forEach(btn => {
    btn.addEventListener('click', () => archiveRequest(btn.dataset.id));
  });
}

export function _renderNewRequestForm(container) {
  const deptOptions = state.currentDepartments.map(d =>
    `<option value="${escHtml(d)}">${escHtml(d)}</option>`
  ).join('');
  container.innerHTML = `
    <div class="req-form">
      <div class="req-form-head">
        <div>
          <h3>依頼内容</h3>
          <p><span class="req-required">*</span> は入力必須です。相手部署が判断できる内容を簡潔に入力してください。</p>
        </div>
        <span class="req-from-label">依頼元：<strong>${escHtml(state.userEmailProfile?.department || '未設定')}</strong></span>
      </div>
      <div class="req-form-grid">
        <div class="form-group req-form-field--wide">
          <label class="form-label" for="req-new-title">件名 <span class="req-required">*</span></label>
          <input type="text" id="req-new-title" class="form-input" placeholder="例：図面の確認をお願いします" maxlength="60" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="req-new-todept">依頼先部署 <span class="req-required">*</span></label>
          <select id="req-new-todept" class="form-input" required>
            <option value="">選択してください</option>
            ${deptOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="req-new-project-key">物件No <span class="req-form-optional">任意</span></label>
          <input type="text" id="req-new-project-key" class="form-input" placeholder="例：61065" maxlength="80" autocomplete="off">
        </div>
        <div class="form-group req-form-field--wide">
          <label class="form-label" for="req-new-content">依頼内容 <span class="req-required">*</span></label>
          <textarea id="req-new-content" class="form-input" rows="5" placeholder="確認してほしいこと、希望する対応、期限などを入力" required></textarea>
        </div>
        <details class="req-form-optional-section req-form-field--wide">
          <summary>補足情報を追加</summary>
          <div class="req-form-optional-grid">
            <div class="form-group">
              <label class="form-label" for="req-new-proposal">対策・提案 <span class="req-form-optional">任意</span></label>
              <textarea id="req-new-proposal" class="form-input" rows="3" placeholder="改善案や提案があれば入力"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label" for="req-new-remarks">備考 <span class="req-form-optional">任意</span></label>
              <textarea id="req-new-remarks" class="form-input" rows="3" placeholder="その他の補足があれば入力"></textarea>
            </div>
          </div>
        </details>
      </div>
      <div class="req-form-footer">
        <span>入力内容は送信後に「自分の依頼」から確認できます。</span>
        <button type="button" class="btn-modal-primary" id="req-submit-btn"><i class="fa-solid fa-paper-plane"></i> 依頼を送信</button>
      </div>
    </div>
  `;
  document.getElementById('req-submit-btn').addEventListener('click', submitRequest);
}

function _renderArchivedRequests(container) {
  if ((state.reqHistoryLoading.received || state.reqHistoryLoading.sent) && !state.receivedRequests.length && !state.sentRequests.length) {
    container.innerHTML = '<div class="req-empty"><span class="spinner"></span><p>履歴を読み込み中です...</p></div>';
    return;
  }
  const archived = [
    ...state.receivedRequests.filter(r => r.archived),
    ...state.sentRequests.filter(r => r.archived),
  ];
  // 重複排除
  const seen = new Set();
  const list = archived.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));

  if (list.length === 0) {
    container.innerHTML = `<div class="req-empty"><i class="fa-solid fa-box-archive"></i><p>アーカイブされた依頼はありません</p></div>`;
    return;
  }
  const filtered = _filterRequestsByProjectKey(list);
  if (filtered.length === 0) {
    container.innerHTML = `
      ${_requestFilterBarHtml(list.length, filtered.length)}
      <div class="req-empty"><i class="fa-solid fa-magnifying-glass"></i><p>物件Noに一致する依頼はありません</p></div>
    `;
    _bindRequestProjectFilterEvents();
    return;
  }
  container.innerHTML = _requestFilterBarHtml(list.length, filtered.length)
    + `<div class="req-archive-note"><i class="fa-solid fa-circle-info"></i> アーカイブ済みの依頼です。自分が送信した依頼は、ここから完全削除できます。</div>`
    + filtered.map(r => {
      const isSent = r.createdBy === state.currentUsername;
      return `
        <div class="req-item req-item--archived">
          <div class="req-item-header">
            ${_reqStatusHtml(r.status)}
            ${isSent
              ? `<span class="req-dept-badge to">${escHtml(r.toDept)}</span>`
              : `<span class="req-dept-badge from">${escHtml(r.fromDept || r.createdBy)}</span>
                 <span class="req-arrow">→</span>
                 <span class="req-dept-badge to">${escHtml(r.toDept)}</span>`
            }
            <span class="req-date">${_fmtTs(r.createdAt)}</span>
            <span class="req-archived-badge"><i class="fa-solid fa-box-archive"></i> アーカイブ済み</span>
          </div>
          <div class="req-item-title">${escHtml(r.title)}</div>
          ${_requestProjectKeyHtml(r.projectKey)}
          <div class="req-item-body">${escHtml(r.content)}</div>
          <div class="req-item-actions">
            <button class="btn-req-unarchive" data-id="${r.id}"><i class="fa-solid fa-rotate-left"></i> 元に戻す</button>
            ${isSent ? `<button class="btn-req-delete" data-id="${r.id}" title="完全削除"><i class="fa-solid fa-trash"></i> 削除</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  _bindRequestProjectFilterEvents();
  container.querySelectorAll('.btn-req-unarchive').forEach(btn => {
    btn.addEventListener('click', () => unarchiveRequest(btn.dataset.id));
  });
  container.querySelectorAll('.btn-req-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteRequest(btn.dataset.id));
  });
}

export async function submitRequest() {
  const title    = document.getElementById('req-new-title')?.value.trim();
  const projectKey = normalizeProjectKey(document.getElementById('req-new-project-key')?.value || '');
  const toDept   = document.getElementById('req-new-todept')?.value;
  const content  = document.getElementById('req-new-content')?.value.trim();
  const proposal = document.getElementById('req-new-proposal')?.value.trim();
  const remarks  = document.getElementById('req-new-remarks')?.value.trim();
  if (!title)   { showToast('件名を入力してください', 'warning'); document.getElementById('req-new-title').focus(); return; }
  if (!toDept)  { showToast('依頼先部署を選択してください', 'warning'); document.getElementById('req-new-todept').focus(); return; }
  if (!content) { showToast('依頼内容を入力してください', 'warning'); document.getElementById('req-new-content').focus(); return; }
  const btn = document.getElementById('req-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    if (isSupabaseSharedCoreEnabled()) {
      const createdId = await createCrossDeptRequestInSupabase({
        title,
        projectKey,
        toDept,
        fromDept: state.userEmailProfile?.department || '',
        content,
        proposal: proposal || '',
        remarks:  remarks  || '',
        createdBy: state.currentUsername,
      });
      _reconcileRequestCaches({
        id: createdId,
        title,
        projectKey,
        toDept,
        fromDept: state.userEmailProfile?.department || '',
        content,
        proposal: proposal || '',
        remarks: remarks || '',
        status: 'submitted',
        createdBy: state.currentUsername,
        createdAt: { seconds: Math.floor(Date.now() / 1000) },
        updatedAt: { seconds: Math.floor(Date.now() / 1000) },
        archived: false,
        statusNote: '',
        statusUpdatedBy: state.currentUsername,
        notifyCreator: false,
      });
      // 送信タブを表示
      switchReqSubTab('sent');
      // 受信監視を維持したまま、送信履歴だけを最新化
      void _loadRequestHistory('sent', true);
      return;
    }
    // Supabase の既存コード
    const createdRef = await addDoc(collection(db, 'cross_dept_requests'), {
      title,
      projectKey,
      toDept,
      fromDept: state.userEmailProfile?.department || '',
      content,
      proposal: proposal || '',
      remarks:  remarks  || '',
      status: 'submitted',
      createdBy: state.currentUsername,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      archived: false,
      statusNote: '',
      statusUpdatedBy: state.currentUsername,
      notifyCreator: false,
      linkedTaskId: null,
      linkedTaskStatus: null,
      linkedTaskAssignedTo: null,
      linkedTaskLinkedAt: null,
      linkedTaskLinkedBy: null,
      linkedTaskClosedAt: null,
    });
    _reconcileRequestCaches({
      id: createdRef.id,
      title,
      projectKey,
      toDept,
      fromDept: state.userEmailProfile?.department || '',
      content,
      proposal: proposal || '',
      remarks: remarks || '',
      status: 'submitted',
      createdBy: state.currentUsername,
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
      updatedAt: { seconds: Math.floor(Date.now() / 1000) },
      archived: false,
      statusNote: '',
      statusUpdatedBy: state.currentUsername,
      notifyCreator: false,
    });
    switchReqSubTab('sent');
    void _loadRequestHistory('sent', true);
  } catch (err) {
    console.error('依頼投稿エラー:', err);
    showToast('投稿に失敗しました。もう一度お試しください。', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 依頼を送信';
  }
}

export function openStatusModal(reqId) {
  state._pendingStatusChange = { reqId, status: null };
  // 現在のステータスを取得
  const req = [...state.receivedRequests, ...state.sentRequests].find(r => r.id === reqId);
  const current = req?.status || 'submitted';
  const group = document.getElementById('req-status-select-group');
  group.innerHTML = Object.entries(REQ_STATUS_LABEL).map(([val, info]) => `
    <button class="req-status-option${current === val ? ' current' : ''}" data-status="${val}">
      <span class="req-status-badge ${info.cls}">${info.text}</span>
    </button>
  `).join('');
  group.querySelectorAll('.req-status-option').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.req-status-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state._pendingStatusChange.status = btn.dataset.status;
    });
  });
  document.getElementById('req-status-note').value = '';
  document.getElementById('req-status-modal').classList.add('visible');
}

export async function updateRequestStatus() {
  if (!state._pendingStatusChange?.status) {
    showToast('ステータスを選択してください', 'warning');
    return;
  }
  const { reqId, status } = state._pendingStatusChange;
  const note = document.getElementById('req-status-note').value.trim();
  try {
    const current = _getRequestById(reqId);
    const isCreator = current?.createdBy === state.currentUsername;
    if (isSupabaseSharedCoreEnabled()) {
      await updateCrossDeptRequestInSupabase(reqId, {
        status,
        statusNote: note,
        statusUpdatedBy: state.currentUsername,
        notifyCreator: !isCreator,
      });
      if (current) {
        const updated = { ...current, status, statusNote: note, statusUpdatedBy: state.currentUsername, updatedAt: { seconds: Math.floor(Date.now() / 1000) }, notifyCreator: !isCreator };
        _reconcileRequestCaches(updated);
      }
      document.getElementById('req-status-modal').classList.remove('visible');
      state._pendingStatusChange = null;
      _refreshOpenRequestContent();
      return;
    }
    await updateDoc(doc(db, 'cross_dept_requests', reqId), {
      status,
      statusNote: note,
      statusUpdatedBy: state.currentUsername,
      updatedAt: serverTimestamp(),
      notifyCreator: !isCreator, // 自分以外が変更したら通知
    });
    if (current) {
      const updated = {
        ...current,
        status,
        statusNote: note,
        statusUpdatedBy: state.currentUsername,
        updatedAt: { seconds: Math.floor(Date.now() / 1000) },
        notifyCreator: !isCreator,
      };
      _reconcileRequestCaches(updated);
    }
    document.getElementById('req-status-modal').classList.remove('visible');
    state._pendingStatusChange = null;
    _refreshOpenRequestContent();
  } catch (err) {
    console.error('ステータス更新エラー:', err);
    showToast('更新に失敗しました', 'error');
  }
}

export async function markRequestSeen(reqId) {
  try {
    const current = state.sentRequests.find(req => req.id === reqId);
    if (isSupabaseSharedCoreEnabled()) {
      await updateCrossDeptRequestInSupabase(reqId, { notifyCreator: false });
      if (current) {
        _reconcileRequestCaches({ ...current, notifyCreator: false });
      }
      _refreshOpenRequestContent();
      return;
    }
    await updateDoc(doc(db, 'cross_dept_requests', reqId), { notifyCreator: false });
    if (current) {
      _reconcileRequestCaches({
        ...current,
        notifyCreator: false,
      });
    }
    _refreshOpenRequestContent();
  } catch (_) { /* silent */ }
}

export async function submitSuggestion(category) {
  const content   = document.getElementById('sugg-content')?.value.trim();
  const anonymous = document.getElementById('sugg-anonymous')?.checked ?? true;
  if (!content) { document.getElementById('sugg-content').focus(); return; }
  const btn = document.getElementById('sugg-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    if (isSupabaseSharedCoreEnabled()) {
      const createdBy = state.currentUsername || 'anonymous';
      const createdId = await createSuggestionInSupabase({
        content,
        createdBy,
        isAnonymous: anonymous,
        category: category || 'other',
      });
      state.suggestionList = [{
        id: createdId,
        content,
        author: anonymous ? '匿名' : createdBy,
        isAnonymous: anonymous,
        archived: false,
        adminReply: null,
        repliedBy: null,
        repliedAt: null,
        createdAt: new Date(),
        category: category || 'other',
      }, ...(state.suggestionList || []).filter(s => s.id !== createdId)];
      updateReqBadge();
      if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
      document.getElementById('sugg-content').value = '';
      showToast('投稿しました。ありがとうございます！', 'success');
    } else {
      await addDoc(collection(db, 'suggestion_box'), {
        content,
        category: category || 'other',
        isAnonymous: anonymous,
        author: anonymous ? '匿名' : (state.currentUsername || '匿名'),
        createdAt: serverTimestamp(),
        adminReply: '',
        repliedAt: null,
        repliedBy: '',
      });
      document.getElementById('sugg-content').value = '';
      showToast('投稿しました。ありがとうございます！', 'success');
    }
  } catch (err) {
    console.error('目安箱投稿エラー:', err);
    showToast('投稿に失敗しました。もう一度お試しください。', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 投稿する';
  }
}

export function openSuggReplyModal(suggId) {
  state._pendingSuggReply = suggId;
  document.getElementById('sugg-reply-text').value = '';
  document.getElementById('sugg-reply-modal').classList.add('visible');
}

export async function sendSuggReply() {
  const text = document.getElementById('sugg-reply-text').value.trim();
  if (!text || !state._pendingSuggReply) return;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      const now = new Date().toISOString();
      await updateSuggestionInSupabase(state._pendingSuggReply, {
        adminReply: text,
        repliedAt: now,
        repliedBy: state.currentUsername,
      });
      const s = state.suggestionList.find(x => x.id === state._pendingSuggReply);
      if (s) { s.adminReply = text; s.repliedBy = state.currentUsername; s.repliedAt = new Date(now); }
    } else {
      await updateDoc(doc(db, 'suggestion_box', state._pendingSuggReply), {
        adminReply: text,
        repliedAt: serverTimestamp(),
        repliedBy: state.currentUsername,
      });
    }
    document.getElementById('sugg-reply-modal').classList.remove('visible');
    state._pendingSuggReply = null;
    if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
    showToast('返信を送信しました', 'success');
  } catch (err) {
    console.error('返信エラー:', err);
    showToast('返信に失敗しました', 'error');
  }
}

export async function _markSuggestionsViewed() {
  if (!state.currentUsername || !state.isSuggestionBoxViewer) return;
  try {
    const now = new Date();
    const unixSec = Math.floor(now.getTime() / 1000);
    await saveUserPreferencesToSupabase(state.currentUsername, { lastViewedSuggestionsAt: unixSec });
    state.lastViewedSuggestionsAt = unixSec;
    updateReqBadge();
  } catch (_) { /* silent */ }
}

// 管理者パネル：目安箱閲覧者管理
export async function renderAdminSuggBoxSection() {
  let viewers = [];
  try {
    const data = await fetchPortalConfigFromSupabase();
    viewers = Array.isArray(data.suggestionBoxViewers) ? data.suggestionBoxViewers : [];
  } catch (err) {
    console.error('suggestionBoxViewers load error:', err);
  }
  const container = document.getElementById('admin-suggbox-viewers');
  if (!container) return;
  if (viewers.length === 0) {
    container.innerHTML = '<div class="admin-loading">登録なし</div>';
  } else {
    container.innerHTML = viewers.map(v => `
      <div class="admin-suggbox-viewer-row">
        <span>${escHtml(v)}</span>
        <button class="btn-danger-sm admin-suggbox-remove" data-name="${escHtml(v)}">削除</button>
      </div>
    `).join('');
    container.querySelectorAll('.admin-suggbox-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const newList = viewers.filter(v => v !== name);
        await savePortalConfigToSupabase({ suggestionBoxViewers: newList });
        state.suggestionBoxViewers = newList;
        state.isSuggestionBoxViewer = state.currentUsername ? newList.includes(state.currentUsername) : false;
        renderAdminSuggBoxSection();
      });
    });
  }
}

export async function addSuggBoxViewer() {
  const input = document.getElementById('admin-suggbox-add-input');
  const name = input.value.trim();
  if (!name) return;
  let current = [];
  try {
    const data = await fetchPortalConfigFromSupabase();
    current = Array.isArray(data.suggestionBoxViewers) ? data.suggestionBoxViewers : [];
  } catch (err) {
    console.error('suggestionBoxViewers load error:', err);
  }
  if (current.includes(name)) { showToast('すでに登録されています', 'warning'); return; }
  const newList = [...current, name];
  await savePortalConfigToSupabase({ suggestionBoxViewers: newList });
  state.suggestionBoxViewers = newList;
  state.isSuggestionBoxViewer = state.currentUsername ? newList.includes(state.currentUsername) : false;
  input.value = '';
  renderAdminSuggBoxSection();
}

export function _renderSuggestionPanel(container) {
  const formHtml = `
    <div class="sugg-form-section">
      <h4 class="sugg-form-title"><i class="fa-solid fa-pen-to-square"></i> 投稿する</h4>
      <div class="form-group">
        <label class="form-label">カテゴリ</label>
        <div class="sugg-category-group">
          <button class="sugg-cat-btn active" data-cat="work">業務改善</button>
          <button class="sugg-cat-btn" data-cat="facility">設備・環境</button>
          <button class="sugg-cat-btn" data-cat="safety">安全</button>
          <button class="sugg-cat-btn" data-cat="other">その他</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">内容 <span class="req-required">*</span></label>
        <textarea id="sugg-content" class="form-input" rows="4" placeholder="提案・改善案・要望など、なんでもお気軽に。"></textarea>
      </div>
      <div class="sugg-form-footer">
        <label class="sugg-anon-label">
          <input type="checkbox" id="sugg-anonymous" checked>
          <span>匿名で投稿する</span>
        </label>
        <button class="btn-modal-primary" id="sugg-submit-btn"><i class="fa-solid fa-paper-plane"></i> 投稿する</button>
      </div>
    </div>
  `;

  let listHtml = '';
  if (state.isSuggestionBoxViewer) {
    const SUGG_CAT_LABEL = { work: '業務改善', facility: '設備・環境', safety: '安全', other: 'その他' };
    const active   = state.suggestionList.filter(s => !s.archived);
    const archived = state.suggestionList.filter(s =>  s.archived);

    const _suggItemHtml = (s, isArchived = false) => `
      <div class="sugg-item${isArchived ? ' req-item--archived' : ''}">
        <div class="sugg-item-header">
          <span class="req-category-badge cat-${escHtml(s.category)}">${escHtml(SUGG_CAT_LABEL[s.category] || s.category)}</span>
          <span class="sugg-author">${escHtml(s.isAnonymous ? '匿名' : (s.author || '匿名'))}</span>
          <span class="req-date">${_fmtTs(s.createdAt)}</span>
          ${isArchived ? '<span class="req-archived-badge"><i class="fa-solid fa-box-archive"></i> アーカイブ済み</span>' : ''}
        </div>
        <div class="sugg-item-content">${escHtml(s.content)}</div>
        ${s.adminReply ? `
          <div class="sugg-reply-box">
            <span class="sugg-reply-label"><i class="fa-solid fa-reply"></i> 管理者より</span>
            <div>${escHtml(s.adminReply)}</div>
          </div>
        ` : ''}
        <div class="req-item-actions">
          ${isArchived
            ? `<button class="btn-req-unarchive btn-sugg-unarchive" data-id="${s.id}"><i class="fa-solid fa-rotate-left"></i> 元に戻す</button>
               <button class="btn-req-delete btn-sugg-delete" data-id="${s.id}"><i class="fa-solid fa-trash"></i> 削除</button>`
            : `<button class="btn-sugg-reply" data-id="${s.id}"><i class="fa-solid fa-reply"></i> 返信</button>
               <button class="btn-req-archive btn-sugg-archive" data-id="${s.id}" title="アーカイブ"><i class="fa-solid fa-box-archive"></i> アーカイブ</button>
               <button class="btn-req-delete btn-sugg-delete" data-id="${s.id}" title="削除"><i class="fa-solid fa-trash"></i></button>`
          }
        </div>
      </div>
    `;

    if (active.length === 0 && archived.length === 0) {
      listHtml = `<div class="req-empty"><i class="fa-solid fa-box-open"></i><p>まだ投稿はありません</p></div>`;
    } else {
      const activeHtml = active.length === 0
        ? `<div class="req-empty" style="padding:12px 0"><i class="fa-solid fa-inbox"></i><p style="margin:0">アクティブな投稿はありません</p></div>`
        : active.map(s => _suggItemHtml(s, false)).join('');

      const archivedHtml = archived.length > 0
        ? `<details class="sugg-archived-details">
            <summary class="sugg-archived-summary">
              <i class="fa-solid fa-box-archive"></i> アーカイブ済み（${archived.length}件）
            </summary>
            <div class="req-archive-note"><i class="fa-solid fa-circle-info"></i> アーカイブ済みの投稿です。元に戻すか完全削除できます。</div>
            ${archived.map(s => _suggItemHtml(s, true)).join('')}
          </details>`
        : '';

      listHtml = `<div class="sugg-list-section">
        <h4 class="sugg-form-title"><i class="fa-solid fa-list"></i> 投稿一覧（管理者のみ閲覧）</h4>
        ${activeHtml}
        ${archivedHtml}
      </div>`;
    }
  }

  container.innerHTML = formHtml + listHtml;

  // カテゴリボタン
  let selectedCat = 'work';
  container.querySelectorAll('.sugg-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.sugg-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCat = btn.dataset.cat;
    });
  });

  // 投稿ボタン
  document.getElementById('sugg-submit-btn').addEventListener('click', () => submitSuggestion(selectedCat));

  // 返信ボタン
  container.querySelectorAll('.btn-sugg-reply').forEach(btn => {
    btn.addEventListener('click', () => openSuggReplyModal(btn.dataset.id));
  });

  // アーカイブ
  container.querySelectorAll('.btn-sugg-archive').forEach(btn => {
    btn.addEventListener('click', () => archiveSuggestion(btn.dataset.id));
  });

  // アーカイブ解除
  container.querySelectorAll('.btn-sugg-unarchive').forEach(btn => {
    btn.addEventListener('click', () => unarchiveSuggestion(btn.dataset.id));
  });

  // 削除
  container.querySelectorAll('.btn-sugg-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteSuggestion(btn.dataset.id));
  });
}
