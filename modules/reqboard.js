// ========== 部門間依頼・目安箱 ==========
import { db, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, collection, query, where, orderBy, serverTimestamp, onSnapshot, getDocs } from './config.js';
import { state, REQ_STATUS_LABEL } from './state.js';
import { esc, escHtml, getUserAvatarColor, _fmtTs } from './utils.js';
export const deps = {};

export async function loadConfigDepartmentsAndViewers() {
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

export function startRequestListeners(username) {
  if (!username) return;
  if (state._reqReceivedUnsub) { state._reqReceivedUnsub(); state._reqReceivedUnsub = null; }
  if (state._reqSentUnsub)     { state._reqSentUnsub();     state._reqSentUnsub = null; }
  if (state._suggUnsub)        { state._suggUnsub();         state._suggUnsub = null; }

  // 自分の部署宛て依頼を監視
  const myDept = state.userEmailProfile ? state.userEmailProfile.department : null;
  if (myDept) {
    const rQ = query(collection(db, 'cross_dept_requests'), where('toDept', '==', myDept));
    state._reqReceivedUnsub = onSnapshot(rQ, snap => {
      state.receivedRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      updateReqBadge();
      if (state.reqModalOpen && state.activeReqTab === 'request' && state.activeReqSubTab === 'received') renderReqContent();
    }, err => console.error('receivedRequests listener error:', err));
  }

  // 自分が送信した依頼を監視
  const sQ = query(collection(db, 'cross_dept_requests'), where('createdBy', '==', username));
  state._reqSentUnsub = onSnapshot(sQ, snap => {
    state.sentRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    updateReqBadge();
    if (state.reqModalOpen && state.activeReqTab === 'request' && state.activeReqSubTab === 'sent') renderReqContent();
  }, err => console.error('sentRequests listener error:', err));

  // 目安箱（閲覧権限あり）
  if (state.isSuggestionBoxViewer) {
    const suggQ = query(collection(db, 'suggestion_box'), orderBy('createdAt', 'desc'));
    state._suggUnsub = onSnapshot(suggQ, snap => {
      state.suggestionList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateReqBadge();
      if (state.reqModalOpen && state.activeReqTab === 'suggestion') renderReqContent();
    }, err => console.error('suggestion_box listener error:', err));
  }
}

export function stopRequestListeners() {
  if (state._reqReceivedUnsub) { state._reqReceivedUnsub(); state._reqReceivedUnsub = null; }
  if (state._reqSentUnsub)     { state._reqSentUnsub();     state._reqSentUnsub = null; }
  if (state._suggUnsub)        { state._suggUnsub();         state._suggUnsub = null; }
  state.receivedRequests = [];
  state.sentRequests = [];
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
}

export function openReqModal(initialTab) {
  state.reqModalOpen = true;
  if (initialTab) state.activeReqTab = initialTab;
  document.getElementById('reqboard-modal').classList.add('visible');
  _syncReqTabUI();
  renderReqContent();
}

export function closeReqModal() {
  state.reqModalOpen = false;
  document.getElementById('reqboard-modal').classList.remove('visible');
}

export function switchReqTab(tab) {
  state.activeReqTab = tab;
  if (tab === 'suggestion') {
    _markSuggestionsViewed();
  }
  _syncReqTabUI();
  renderReqContent();
}

export function switchReqSubTab(subtab) {
  state.activeReqSubTab = subtab;
  // 自分の依頼タブを開いたら notifyCreator=true のものをクリア
  if (subtab === 'sent') {
    state.sentRequests.filter(r => r.notifyCreator).forEach(r => markRequestSeen(r.id));
  }
  _syncReqSubTabUI();
  renderReqContent();
}

// ===== アーカイブ・削除 =====
export async function archiveRequest(id) {
  try {
    await updateDoc(doc(db, 'cross_dept_requests', id), { archived: true, updatedAt: serverTimestamp() });
  } catch (err) { console.error('アーカイブエラー:', err); alert('アーカイブに失敗しました'); }
}

export async function unarchiveRequest(id) {
  try {
    await updateDoc(doc(db, 'cross_dept_requests', id), { archived: false, updatedAt: serverTimestamp() });
  } catch (err) { console.error('アーカイブ解除エラー:', err); alert('解除に失敗しました'); }
}

export async function deleteRequest(id) {
  if (!confirm('この依頼を完全に削除しますか？この操作は取り消せません。')) return;
  try {
    await deleteDoc(doc(db, 'cross_dept_requests', id));
  } catch (err) { console.error('削除エラー:', err); alert('削除に失敗しました'); }
}

export async function archiveSuggestion(id) {
  try {
    await updateDoc(doc(db, 'suggestion_box', id), { archived: true });
  } catch (err) { console.error('アーカイブエラー:', err); alert('アーカイブに失敗しました'); }
}

export async function unarchiveSuggestion(id) {
  try {
    await updateDoc(doc(db, 'suggestion_box', id), { archived: false });
  } catch (err) { console.error('アーカイブ解除エラー:', err); alert('解除に失敗しました'); }
}

export async function deleteSuggestion(id) {
  if (!confirm('この投稿を完全に削除しますか？この操作は取り消せません。')) return;
  try {
    await deleteDoc(doc(db, 'suggestion_box', id));
  } catch (err) { console.error('削除エラー:', err); alert('削除に失敗しました'); }
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

function _reqStatusHtml(status) {
  const s = REQ_STATUS_LABEL[status] || { text: status, cls: '' };
  return `<span class="req-status-badge ${s.cls}">${s.text}</span>`;
}

export function _renderReceivedRequests(container) {
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
  container.innerHTML = list.map(r => `
    <div class="req-item">
      <div class="req-item-header">
        ${_reqStatusHtml(r.status)}
        <span class="req-dept-badge from">${escHtml(r.fromDept || r.createdBy)}</span>
        <span class="req-arrow">→</span>
        <span class="req-dept-badge to">${escHtml(r.toDept)}</span>
        <span class="req-date">${_fmtTs(r.createdAt)}</span>
      </div>
      <div class="req-item-title">${escHtml(r.title)}</div>
      <div class="req-item-body">${escHtml(r.content)}</div>
      ${r.proposal ? `<div class="req-item-sub"><span class="req-sub-label">対策・提案</span>${escHtml(r.proposal)}</div>` : ''}
      ${r.remarks  ? `<div class="req-item-sub"><span class="req-sub-label">備考</span>${escHtml(r.remarks)}</div>` : ''}
      ${r.statusNote ? `<div class="req-item-sub"><span class="req-sub-label">コメント</span>${escHtml(r.statusNote)}</div>` : ''}
      <div class="req-item-actions">
        <button class="btn-req-status" data-id="${r.id}"><i class="fa-solid fa-pen-to-square"></i> ステータス変更</button>
        <button class="btn-req-archive" data-id="${r.id}" title="アーカイブに移動"><i class="fa-solid fa-box-archive"></i> アーカイブ</button>
        <button class="btn-req-delete" data-id="${r.id}" title="削除"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('');
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

export function _renderSentRequests(container) {
  const list = state.sentRequests.filter(r => !r.archived);
  if (list.length === 0) {
    container.innerHTML = `<div class="req-empty"><i class="fa-solid fa-paper-plane"></i><p>投稿した依頼はありません</p></div>`;
    return;
  }
  container.innerHTML = list.map(r => `
    <div class="req-item${r.notifyCreator ? ' req-item--notify' : ''}">
      <div class="req-item-header">
        ${_reqStatusHtml(r.status)}
        <span class="req-dept-badge to">${escHtml(r.toDept)}</span>
        <span class="req-date">${_fmtTs(r.createdAt)}</span>
        ${r.notifyCreator ? '<span class="req-notify-dot" title="ステータスが変更されました">●</span>' : ''}
      </div>
      <div class="req-item-title">${escHtml(r.title)}</div>
      <div class="req-item-body">${escHtml(r.content)}</div>
      ${r.statusNote ? `<div class="req-item-sub"><span class="req-sub-label">コメント</span>${escHtml(r.statusNote)}</div>` : ''}
      <div class="req-item-actions">
        <button class="btn-req-status" data-id="${r.id}"><i class="fa-solid fa-pen-to-square"></i> ステータス変更</button>
        <button class="btn-req-archive" data-id="${r.id}" title="アーカイブに移動"><i class="fa-solid fa-box-archive"></i> アーカイブ</button>
        <button class="btn-req-delete" data-id="${r.id}" title="削除"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('');
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
  // 自分が関わるアーカイブ済み依頼をまとめて表示
  const myDept = state.userEmailProfile ? state.userEmailProfile.department : null;
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
  container.innerHTML = `<div class="req-archive-note"><i class="fa-solid fa-circle-info"></i> アーカイブ済みの依頼です。元に戻すか完全削除できます。</div>` +
    list.map(r => {
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
          <div class="req-item-body">${escHtml(r.content)}</div>
          <div class="req-item-actions">
            <button class="btn-req-unarchive" data-id="${r.id}"><i class="fa-solid fa-rotate-left"></i> 元に戻す</button>
            <button class="btn-req-delete" data-id="${r.id}" title="完全削除"><i class="fa-solid fa-trash"></i> 削除</button>
          </div>
        </div>
      `;
    }).join('');
  container.querySelectorAll('.btn-req-unarchive').forEach(btn => {
    btn.addEventListener('click', () => unarchiveRequest(btn.dataset.id));
  });
  container.querySelectorAll('.btn-req-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteRequest(btn.dataset.id));
  });
}

export async function submitRequest() {
  const title    = document.getElementById('req-new-title')?.value.trim();
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
    await addDoc(collection(db, 'cross_dept_requests'), {
      title,
      toDept,
      fromDept: state.userEmailProfile?.department || '',
      content,
      proposal: proposal || '',
      remarks:  remarks  || '',
      status: 'submitted',
      createdBy: state.currentUsername,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      statusNote: '',
      statusUpdatedBy: state.currentUsername,
      notifyCreator: false,
    });
    switchReqSubTab('sent');
  } catch (err) {
    console.error('依頼投稿エラー:', err);
    alert('投稿に失敗しました。もう一度お試しください。');
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
    alert('ステータスを選択してください');
    return;
  }
  const { reqId, status } = state._pendingStatusChange;
  const note = document.getElementById('req-status-note').value.trim();
  try {
    const isCreator = state.sentRequests.some(r => r.id === reqId);
    await updateDoc(doc(db, 'cross_dept_requests', reqId), {
      status,
      statusNote: note,
      statusUpdatedBy: state.currentUsername,
      updatedAt: serverTimestamp(),
      notifyCreator: !isCreator, // 自分以外が変更したら通知
    });
    document.getElementById('req-status-modal').classList.remove('visible');
    state._pendingStatusChange = null;
  } catch (err) {
    console.error('ステータス更新エラー:', err);
    alert('更新に失敗しました');
  }
}

export async function markRequestSeen(reqId) {
  try {
    await updateDoc(doc(db, 'cross_dept_requests', reqId), { notifyCreator: false });
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
    alert('投稿しました。ありがとうございます！');
  } catch (err) {
    console.error('目安箱投稿エラー:', err);
    alert('投稿に失敗しました。もう一度お試しください。');
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
    await updateDoc(doc(db, 'suggestion_box', state._pendingSuggReply), {
      adminReply: text,
      repliedAt: serverTimestamp(),
      repliedBy: state.currentUsername,
    });
    document.getElementById('sugg-reply-modal').classList.remove('visible');
    state._pendingSuggReply = null;
  } catch (err) {
    console.error('返信エラー:', err);
    alert('返信に失敗しました');
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
  const snap = await getDoc(doc(db, 'portal', 'config'));
  const viewers = snap.exists() ? (snap.data().suggestionBoxViewers || []) : [];
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
        await setDoc(doc(db, 'portal', 'config'), { suggestionBoxViewers: newList }, { merge: true });
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
  const snap = await getDoc(doc(db, 'portal', 'config'));
  const current = snap.exists() ? (snap.data().suggestionBoxViewers || []) : [];
  if (current.includes(name)) { alert('すでに登録されています'); return; }
  const newList = [...current, name];
  await setDoc(doc(db, 'portal', 'config'), { suggestionBoxViewers: newList }, { merge: true });
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
    if (state.suggestionList.length === 0) {
      listHtml = `<div class="req-empty"><i class="fa-solid fa-box-open"></i><p>まだ投稿はありません</p></div>`;
    } else {
      const SUGG_CAT_LABEL = { work: '業務改善', facility: '設備・環境', safety: '安全', other: 'その他' };
      listHtml = `<div class="sugg-list-section">
        <h4 class="sugg-form-title"><i class="fa-solid fa-list"></i> 投稿一覧（管理者のみ閲覧）</h4>
        ${state.suggestionList.map(s => `
          <div class="sugg-item">
            <div class="sugg-item-header">
              <span class="req-category-badge cat-${escHtml(s.category)}">${escHtml(SUGG_CAT_LABEL[s.category] || s.category)}</span>
              <span class="sugg-author">${escHtml(s.isAnonymous ? '匿名' : (s.author || '匿名'))}</span>
              <span class="req-date">${_fmtTs(s.createdAt)}</span>
            </div>
            <div class="sugg-item-content">${escHtml(s.content)}</div>
            ${s.adminReply ? `
              <div class="sugg-reply-box">
                <span class="sugg-reply-label"><i class="fa-solid fa-reply"></i> 管理者より</span>
                <div>${escHtml(s.adminReply)}</div>
              </div>
            ` : ''}
            <div class="req-item-actions">
              <button class="btn-sugg-reply" data-id="${s.id}"><i class="fa-solid fa-reply"></i> 返信</button>
            </div>
          </div>
        `).join('')}
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
}
