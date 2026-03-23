// ========== 部門間依頼・目安箱 ==========
import { db, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, collection, query, where, orderBy, serverTimestamp, onSnapshot, getDocs } from './config.js';
import { state, REQ_STATUS_LABEL } from './state.js';
import { esc, escHtml, getUserAvatarColor, normalizeProjectKey, _fmtTs } from './utils.js';
import {
  isSupabaseSharedCoreEnabled,
  applySupabaseRuntimeConfig,
  fetchPortalConfigFromSupabase,
  savePortalConfigToSupabase,
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

const LINKED_TASK_STATUS_LABEL = {
  pending:   { text: '承諾待ち', cls: 'req-task-link--pending' },
  accepted:  { text: '進行中',   cls: 'req-task-link--accepted' },
  done:      { text: '完了',     cls: 'req-task-link--done' },
  cancelled: { text: '取消',     cls: 'req-task-link--cancelled' },
};

export async function loadConfigDepartmentsAndViewers() {
  // Supabase接続済みならportal_configをSupabaseから読む
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const data = await fetchPortalConfigFromSupabase();
      if (Array.isArray(data.departments) && data.departments.length > 0) {
        state.currentDepartments = data.departments;
      }
      state.suggestionBoxViewers = Array.isArray(data.suggestionBoxViewers) ? data.suggestionBoxViewers : [];
      state.isSuggestionBoxViewer = state.currentUsername ? state.suggestionBoxViewers.includes(state.currentUsername) : false;
      state.missionText = data.missionText || '';
      return;
    } catch (err) { console.error('Supabase config読み込みエラー:', err); }
  }
  // フォールバック: Firebase
  try {
    const snap = await getDoc(doc(db, 'portal', 'config'));
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.departments) && data.departments.length > 0) {
        state.currentDepartments = data.departments;
      }
      state.suggestionBoxViewers = Array.isArray(data.suggestionBoxViewers) ? data.suggestionBoxViewers : [];
      state.isSuggestionBoxViewer = state.currentUsername ? state.suggestionBoxViewers.includes(state.currentUsername) : false;
      state.missionText = data.missionText || '';
    }
  } catch (err) { console.error('config読み込みエラー:', err); }
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

async function _loadRequestHistory(side, force = false) {
  if (!state.currentUsername) return;
  if (!force && state.reqHistoryLoaded[side]) return;
  if (state.reqHistoryLoading[side]) return;

  const myDept = state.userEmailProfile ? state.userEmailProfile.department : '';
  if (side === 'received' && !myDept) return;

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
      state.reqHistoryCache = { ...state.reqHistoryCache, [side]: historyOnly };
      state.reqHistoryLoaded = { ...state.reqHistoryLoaded, [side]: true };
      _syncAllRequests();
    } catch (err) {
      console.error(`Supabase request history error (${side}):`, err);
    } finally {
      state.reqHistoryLoading = { ...state.reqHistoryLoading, [side]: false };
      if (state.reqModalOpen && state.activeReqTab === 'request') renderReqContent();
    }
    return;
  }

  // Firestore の既存コード
  try {
    const historyQuery = side === 'received'
      ? query(collection(db, 'cross_dept_requests'), where('toDept', '==', myDept))
      : query(collection(db, 'cross_dept_requests'), where('createdBy', '==', state.currentUsername));
    const snap = await getDocs(historyQuery);
    recordGetDocsRead(`req.history.${side}`, `部門間依頼履歴:${side}`, side === 'received' ? myDept : state.currentUsername, snap.size, snap.docs);
    const allRequests = _sortRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    const historyOnly = allRequests.filter(req => side === 'received' ? !_isReceivedRequestLive(req) : !_isSentRequestLive(req));

    state.reqHistoryCache = {
      ...state.reqHistoryCache,
      [side]: historyOnly,
    };
    state.reqHistoryLoaded = {
      ...state.reqHistoryLoaded,
      [side]: true,
    };
    _syncAllRequests();
  } catch (err) {
    console.error(`request history load error (${side}):`, err);
  } finally {
    state.reqHistoryLoading = { ...state.reqHistoryLoading, [side]: false };
    if (state.reqModalOpen && state.activeReqTab === 'request') {
      renderReqContent();
    }
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
        }));
        updateReqBadge();
        if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
      }).catch(err => console.error('Supabase 目安箱取得エラー:', err));
    }
    return;
  }

  // Firestore の既存コード（onSnapshot 3つ）
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
  state.suggestionList = [];
}

export function updateReqBadge() {
  const badge = document.getElementById('req-badge');
  if (!badge) return;
  const myDept = state.userEmailProfile ? state.userEmailProfile.department : null;
  // 受け取った依頼のうち「提出済み（未対応）」
  const recvCount = myDept ? state.receivedRequests.filter(r => r.status === 'submitted').length : 0;
  // 自分の依頼でステータス変更通知
  const sentCount = state.sentRequests.filter(r => r.notifyCreator === true).length;
  // 目安箱の未読
  let suggCount = 0;
  if (state.isSuggestionBoxViewer) {
    const lastViewed = state.lastViewedSuggestionsAt;
    suggCount = state.suggestionList.filter(s => (s.createdAt?.seconds ?? 0) > lastViewed).length;
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
        _removeRequestFromAllCaches(id);
        const updated = { ...current, archived: true, updatedAt: { seconds: Math.floor(Date.now() / 1000) } };
        const myDept = state.userEmailProfile ? state.userEmailProfile.department : '';
        if (current.toDept === myDept) _upsertRequestHistory('received', updated);
        if (current.createdBy === state.currentUsername) _upsertRequestHistory('sent', updated);
      }
      return;
    }
    await updateDoc(doc(db, 'cross_dept_requests', id), { archived: true, updatedAt: serverTimestamp() });
    if (current) {
      _removeRequestFromAllCaches(id);
      const updated = { ...current, archived: true, updatedAt: { seconds: Math.floor(Date.now() / 1000) } };
      const myDept = state.userEmailProfile ? state.userEmailProfile.department : '';
      if (current.toDept === myDept) _upsertRequestHistory('received', updated);
      if (current.createdBy === state.currentUsername) _upsertRequestHistory('sent', updated);
    }
  } catch (err) { console.error('アーカイブエラー:', err); showToast('アーカイブに失敗しました', 'error'); }
}

export async function unarchiveRequest(id) {
  try {
    const current = _getRequestById(id);
    if (isSupabaseSharedCoreEnabled()) {
      await updateCrossDeptRequestInSupabase(id, { archived: false });
      if (current) {
        _removeRequestFromAllCaches(id);
        const updated = { ...current, archived: false, updatedAt: { seconds: Math.floor(Date.now() / 1000) } };
        const myDept = state.userEmailProfile ? state.userEmailProfile.department : '';
        if (current.toDept === myDept) _upsertRequestHistory('received', updated);
        if (current.createdBy === state.currentUsername) _upsertRequestHistory('sent', updated);
      }
      return;
    }
    await updateDoc(doc(db, 'cross_dept_requests', id), { archived: false, updatedAt: serverTimestamp() });
    if (current) {
      _removeRequestFromAllCaches(id);
      const updated = { ...current, archived: false, updatedAt: { seconds: Math.floor(Date.now() / 1000) } };
      const myDept = state.userEmailProfile ? state.userEmailProfile.department : '';
      if (current.toDept === myDept) _upsertRequestHistory('received', updated);
      if (current.createdBy === state.currentUsername) _upsertRequestHistory('sent', updated);
    }
  } catch (err) { console.error('アーカイブ解除エラー:', err); showToast('解除に失敗しました', 'error'); }
}

export async function deleteRequest(id) {
  if (!await showConfirm('この依頼を完全に削除しますか？この操作は取り消せません。', { danger: true })) return;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await deleteCrossDeptRequestInSupabase(id);
      _removeRequestFromAllCaches(id);
      return;
    }
    await deleteDoc(doc(db, 'cross_dept_requests', id));
    _removeRequestFromAllCaches(id);
  } catch (err) { console.error('削除エラー:', err); showToast('削除に失敗しました', 'error'); }
}

export async function archiveSuggestion(id) {
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await updateSuggestionInSupabase(id, { archived: true });
      const s = state.suggestionList.find(x => x.id === id);
      if (s) s.archived = true;
    } else {
      await updateDoc(doc(db, 'suggestion_box', id), { archived: true });
    }
    if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
  } catch (err) { console.error('アーカイブエラー:', err); showToast('アーカイブに失敗しました', 'error'); }
}

export async function unarchiveSuggestion(id) {
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await updateSuggestionInSupabase(id, { archived: false });
      const s = state.suggestionList.find(x => x.id === id);
      if (s) s.archived = false;
    } else {
      await updateDoc(doc(db, 'suggestion_box', id), { archived: false });
    }
    if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
  } catch (err) { console.error('アーカイブ解除エラー:', err); showToast('解除に失敗しました', 'error'); }
}

export async function deleteSuggestion(id) {
  if (!await showConfirm('この投稿を完全に削除しますか？この操作は取り消せません。', { danger: true })) return;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await deleteSuggestionInSupabase(id);
      state.suggestionList = (state.suggestionList || []).filter(s => s.id !== id);
      updateReqBadge();
      if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
      return;
    }
    await deleteDoc(doc(db, 'suggestion_box', id));
  } catch (err) { console.error('削除エラー:', err); showToast('削除に失敗しました', 'error'); }
}

function _syncReqTabUI() {
  document.querySelectorAll('.reqboard-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === state.activeReqTab);
  });
  document.getElementById('reqboard-request-area').hidden    = state.activeReqTab !== 'request';
  document.getElementById('reqboard-suggestion-area').hidden = state.activeReqTab !== 'suggestion';
}

function _syncReqSubTabUI() {
  document.querySelectorAll('.reqboard-subtab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.subtab === state.activeReqSubTab);
  });
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
            ? `<button class="rc-del" data-cid="${c.id}" data-req-id="${requestId}" title="削除"><i class="fa-solid fa-trash-can"></i></button>`
            : ''}
        </div>
      `).join('');
      inner = `
        <div class="tc-list">${list || '<div class="tc-empty">コメントはまだありません</div>'}</div>
        <div class="tc-input-row">
          <input type="text" class="rc-input form-input" placeholder="コメントを入力…" data-req-id="${requestId}" autocomplete="off">
          <button class="rc-send btn-modal-primary" data-req-id="${requestId}"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      `;
    }
  }

  return `
    <div class="tc-wrapper">
      <button class="rc-toggle${isExpanded ? ' tc-toggle--open' : ''}" data-req-id="${requestId}">
        <i class="fa-regular fa-comment${isExpanded ? '-dots' : ''}"></i>
        コメント${count ? ` <span class="tc-count">${count}</span>` : ''}
      </button>
      ${isExpanded ? `<div class="tc-area">${inner}</div>` : ''}
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
        const comment = await addRequestCommentInSupabase(id, state.currentUsername, body);
        state.requestComments = {
          ...state.requestComments,
          [id]: [...(state.requestComments[id] || []), comment],
        };
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
    input.addEventListener('input', e => {
      state.reqProjectKeyFilter = normalizeProjectKey(e.target.value || '');
      renderReqContent();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.reqProjectKeyFilter = '';
      renderReqContent();
    });
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
        <button class="btn-req-delete" data-id="${r.id}" title="削除"><i class="fa-solid fa-trash"></i></button>
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
  container.querySelectorAll('.btn-req-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteRequest(btn.dataset.id));
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
        <button class="btn-req-delete" data-id="${r.id}" title="削除"><i class="fa-solid fa-trash"></i></button>
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
  container.querySelectorAll('.btn-req-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteRequest(btn.dataset.id));
  });
}

export function _renderNewRequestForm(container) {
  const deptOptions = state.currentDepartments.map(d =>
    `<option value="${escHtml(d)}">${escHtml(d)}</option>`
  ).join('');
  container.innerHTML = `
    <div class="req-form">
      <div class="form-group">
        <label class="form-label">件名 <span class="req-required">*</span></label>
        <input type="text" id="req-new-title" class="form-input" placeholder="例：押し緑の向きについて" maxlength="60">
      </div>
      <div class="form-group">
        <label class="form-label">物件No（任意）</label>
        <input type="text" id="req-new-project-key" class="form-input" placeholder="物件No（現場コード） 例：61065" maxlength="80" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">依頼先部署 <span class="req-required">*</span></label>
        <select id="req-new-todept" class="form-input">
          <option value="">選択してください</option>
          ${deptOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">内容 <span class="req-required">*</span></label>
        <textarea id="req-new-content" class="form-input" rows="4" placeholder="具体的な内容を記入してください"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">対策・提案（任意）</label>
        <textarea id="req-new-proposal" class="form-input" rows="2" placeholder="改善案や提案があれば"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">備考（任意）</label>
        <input type="text" id="req-new-remarks" class="form-input" placeholder="その他補足">
      </div>
      <div class="req-form-footer">
        <span class="req-from-label">投稿者部署：<strong>${escHtml(state.userEmailProfile?.department || '未設定')}</strong></span>
        <button class="btn-modal-primary" id="req-submit-btn"><i class="fa-solid fa-paper-plane"></i> 投稿する</button>
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
    + `<div class="req-archive-note"><i class="fa-solid fa-circle-info"></i> アーカイブ済みの依頼です。元に戻すか完全削除できます。</div>`
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
            <button class="btn-req-delete" data-id="${r.id}" title="完全削除"><i class="fa-solid fa-trash"></i> 削除</button>
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
  if (!title)   { document.getElementById('req-new-title').focus(); return; }
  if (!toDept)  { document.getElementById('req-new-todept').focus(); return; }
  if (!content) { document.getElementById('req-new-content').focus(); return; }
  const btn = document.getElementById('req-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await createCrossDeptRequestInSupabase({
        title,
        projectKey,
        toDept,
        fromDept: state.userEmailProfile?.department || '',
        content,
        proposal: proposal || '',
        remarks:  remarks  || '',
        createdBy: state.currentUsername,
      });
      // 送信タブを表示
      switchReqSubTab('sent');
      // 履歴をリフレッシュ
      _resetRequestHistoryState();
      void _loadRequestHistory('sent');
      return;
    }
    // Firestore の既存コード
    await addDoc(collection(db, 'cross_dept_requests'), {
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
    switchReqSubTab('sent');
  } catch (err) {
    console.error('依頼投稿エラー:', err);
    showToast('投稿に失敗しました。もう一度お試しください。', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 投稿する';
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
    const isCreator = state.sentRequests.some(r => r.id === reqId);
    if (isSupabaseSharedCoreEnabled()) {
      await updateCrossDeptRequestInSupabase(reqId, {
        status,
        statusNote: note,
        statusUpdatedBy: state.currentUsername,
        notifyCreator: !isCreator,
      });
      if (current) {
        _removeRequestFromAllCaches(reqId);
        const updated = { ...current, status, statusNote: note, statusUpdatedBy: state.currentUsername, updatedAt: { seconds: Math.floor(Date.now() / 1000) }, notifyCreator: !isCreator };
        const myDept = state.userEmailProfile ? state.userEmailProfile.department : '';
        if (current.toDept === myDept) _upsertRequestHistory('received', updated);
        if (current.createdBy === state.currentUsername) _upsertRequestHistory('sent', updated);
      }
      document.getElementById('req-status-modal').classList.remove('visible');
      state._pendingStatusChange = null;
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
      _removeRequestFromAllCaches(reqId);
      const updated = {
        ...current,
        status,
        statusNote: note,
        statusUpdatedBy: state.currentUsername,
        updatedAt: { seconds: Math.floor(Date.now() / 1000) },
        notifyCreator: !isCreator,
      };
      const myDept = state.userEmailProfile ? state.userEmailProfile.department : '';
      if (current.toDept === myDept) _upsertRequestHistory('received', updated);
      if (current.createdBy === state.currentUsername) _upsertRequestHistory('sent', updated);
    }
    document.getElementById('req-status-modal').classList.remove('visible');
    state._pendingStatusChange = null;
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
        _removeRequestFromAllCaches(reqId);
        _upsertRequestHistory('sent', { ...current, notifyCreator: false });
      }
      return;
    }
    await updateDoc(doc(db, 'cross_dept_requests', reqId), { notifyCreator: false });
    if (current) {
      _removeRequestFromAllCaches(reqId);
      _upsertRequestHistory('sent', {
        ...current,
        notifyCreator: false,
      });
    }
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
      await createSuggestionInSupabase({
        content,
        createdBy: state.currentUsername || 'anonymous',
        isAnonymous: anonymous,
      });
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
    await setDoc(
      doc(db, 'users', state.currentUsername, 'data', 'preferences'),
      { lastViewedSuggestionsAt: now },
      { merge: true }
    );
    state.lastViewedSuggestionsAt = Math.floor(now.getTime() / 1000);
    updateReqBadge();
  } catch (_) { /* silent */ }
}

// 管理者パネル：目安箱閲覧者管理
export async function renderAdminSuggBoxSection() {
  let viewers = [];
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const data = await fetchPortalConfigFromSupabase();
      viewers = Array.isArray(data.suggestionBoxViewers) ? data.suggestionBoxViewers : [];
    } catch (_) {
      const snap = await getDoc(doc(db, 'portal', 'config'));
      viewers = snap.exists() ? (snap.data().suggestionBoxViewers || []) : [];
    }
  } else {
    const snap = await getDoc(doc(db, 'portal', 'config'));
    viewers = snap.exists() ? (snap.data().suggestionBoxViewers || []) : [];
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
        if (isSupabaseSharedCoreEnabled()) {
          try {
            await savePortalConfigToSupabase({ suggestionBoxViewers: newList });
          } catch (_) {
            await setDoc(doc(db, 'portal', 'config'), { suggestionBoxViewers: newList }, { merge: true });
          }
        } else {
          await setDoc(doc(db, 'portal', 'config'), { suggestionBoxViewers: newList }, { merge: true });
        }
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
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const data = await fetchPortalConfigFromSupabase();
      current = Array.isArray(data.suggestionBoxViewers) ? data.suggestionBoxViewers : [];
    } catch (_) {
      const snap = await getDoc(doc(db, 'portal', 'config'));
      current = snap.exists() ? (snap.data().suggestionBoxViewers || []) : [];
    }
  } else {
    const snap = await getDoc(doc(db, 'portal', 'config'));
    current = snap.exists() ? (snap.data().suggestionBoxViewers || []) : [];
  }
  if (current.includes(name)) { showToast('すでに登録されています', 'warning'); return; }
  const newList = [...current, name];
  if (isSupabaseSharedCoreEnabled()) {
    try {
      await savePortalConfigToSupabase({ suggestionBoxViewers: newList });
    } catch (_) {
      await setDoc(doc(db, 'portal', 'config'), { suggestionBoxViewers: newList }, { merge: true });
    }
  } else {
    await setDoc(doc(db, 'portal', 'config'), { suggestionBoxViewers: newList }, { merge: true });
  }
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
