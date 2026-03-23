// ========== タスク割り振り ==========
import { db, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, collection, query, where, orderBy, serverTimestamp, onSnapshot } from './config.js';
import {
  isSupabaseSharedCoreEnabled,
  fetchReceivedTasksFromSupabase,
  fetchSentTasksFromSupabase,
  fetchSentDoneNotifyTasksFromSupabase,
  fetchSharedTasksFromSupabase,
  fetchTaskHistoryFromSupabase,
  getAssignedTaskFromSupabase,
  createAssignedTaskInSupabase,
  updateAssignedTaskInSupabase,
  deleteAssignedTaskInSupabase,
  fetchTaskCommentsFromSupabase,
  addTaskCommentInSupabase,
  deleteTaskCommentInSupabase,
} from './supabase.js';
import { state, TASK_STATUS_LABEL } from './state.js';
import { esc, getUserAvatarColor, normalizeProjectKey } from './utils.js';
import {
  recordGetDocsRead,
  recordListenerStart,
  recordListenerSnapshot,
  wrapTrackedListenerUnsubscribe,
} from './read-diagnostics.js';
import { showToast, showConfirm } from './notify.js';
export const deps = {};

const ACTIVE_TASK_STATUSES = ['pending', 'accepted'];

let liveReceivedTasks = [];
let liveSentTasks = [];
let liveSentDoneNotifyTasks = [];
let liveSharedTasks = [];

function buildTaskPayload({
  title,
  description = '',
  assignedBy,
  assignedTo,
  status = 'pending',
  dueDate = '',
  projectKey = '',
  sourceType = 'manual',
  sourceRequestId = null,
  sourceRequestFromDept = null,
  sourceRequestToDept = null,
}) {
  return {
    title,
    description,
    assignedBy,
    assignedTo,
    status,
    createdAt: serverTimestamp(),
    acceptedAt: null,
    doneAt: null,
    dueDate,
    projectKey,
    notifiedDone: false,
    sharedWith: [],
    sharedResponses: {},
    sourceType,
    sourceRequestId,
    sourceRequestFromDept,
    sourceRequestToDept,
  };
}

export async function createTaskRecord(taskInput) {
  if (isSupabaseSharedCoreEnabled()) {
    const id = await createAssignedTaskInSupabase(buildTaskPayload(taskInput));
    return { id };  // DocumentReference 互換 ( .id プロパティ )
  }
  return addDoc(collection(db, 'assigned_tasks'), buildTaskPayload(taskInput));
}

async function syncRequestLink(taskId, updates) {
  const taskSnap = await getDoc(doc(db, 'assigned_tasks', taskId));
  if (!taskSnap.exists()) return null;
  const task = { id: taskSnap.id, ...taskSnap.data() };
  if (!task.sourceRequestId) return task;
  await updateDoc(doc(db, 'cross_dept_requests', task.sourceRequestId), {
    ...updates,
    updatedAt: serverTimestamp(),
    notifyCreator: true,
  });
  return task;
}

function _taskProjectKeyFilterValue() {
  return normalizeProjectKey(state.taskProjectKeyFilter || '').toLowerCase();
}

function _filterTasksByProjectKey(list) {
  const filter = _taskProjectKeyFilterValue();
  if (!filter) return list;
  return list.filter(task =>
    normalizeProjectKey(task.projectKey || '').toLowerCase().includes(filter)
  );
}

// ===== タスクコメント =====
function _taskCommentSectionHtml(taskId) {
  if (!isSupabaseSharedCoreEnabled()) return '';
  const isExpanded = state.expandedTaskCommentId === taskId;
  const comments   = state.taskComments[taskId] || [];
  const isLoading  = state.taskCommentsLoading[taskId] || false;
  const count      = comments.length;

  let inner = '';
  if (isExpanded) {
    if (isLoading) {
      inner = '<div class="tc-loading"><span class="spinner"></span></div>';
    } else {
      const list = comments.map(c => `
        <div class="tc-item">
          <span class="tc-author" style="color:${getUserAvatarColor(c.username)}">${esc(c.username)}</span>
          <span class="tc-body">${esc(c.body)}</span>
          ${c.username === state.currentUsername
            ? `<button class="tc-del" data-cid="${c.id}" data-task-id="${taskId}" title="削除"><i class="fa-solid fa-trash-can"></i></button>`
            : ''}
        </div>
      `).join('');
      inner = `
        <div class="tc-list">${list || '<div class="tc-empty">コメントはまだありません</div>'}</div>
        <div class="tc-input-row">
          <input type="text" class="tc-input form-input" placeholder="コメントを入力…" data-task-id="${taskId}" autocomplete="off">
          <button class="tc-send btn-modal-primary" data-task-id="${taskId}"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      `;
    }
  }

  return `
    <div class="tc-wrapper">
      <button class="tc-toggle${isExpanded ? ' tc-toggle--open' : ''}" data-task-id="${taskId}">
        <i class="fa-regular fa-comment${isExpanded ? '-dots' : ''}"></i>
        コメント${count ? ` <span class="tc-count">${count}</span>` : ''}
      </button>
      ${isExpanded ? `<div class="tc-area">${inner}</div>` : ''}
    </div>
  `;
}

async function _loadTaskComments(taskId) {
  state.taskCommentsLoading = { ...state.taskCommentsLoading, [taskId]: true };
  renderTaskTabContent();
  try {
    const comments = await fetchTaskCommentsFromSupabase(taskId);
    state.taskComments = { ...state.taskComments, [taskId]: comments };
  } catch (e) {
    showToast('コメントの読み込みに失敗しました', 'error');
  } finally {
    state.taskCommentsLoading = { ...state.taskCommentsLoading, [taskId]: false };
    renderTaskTabContent();
  }
}

function _bindTaskCommentEvents(container) {
  // トグル
  container.querySelectorAll('.tc-toggle[data-task-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.taskId;
      if (state.expandedTaskCommentId === id) {
        state.expandedTaskCommentId = null;
        renderTaskTabContent();
        return;
      }
      state.expandedTaskCommentId = id;
      if (!state.taskComments[id]) {
        void _loadTaskComments(id);
      } else {
        renderTaskTabContent();
      }
    });
  });

  // 送信ボタン
  container.querySelectorAll('.tc-send[data-task-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.taskId;
      const input = container.querySelector(`.tc-input[data-task-id="${id}"]`);
      const body = (input?.value || '').trim();
      if (!body) return;
      input.value = '';
      try {
        const comment = await addTaskCommentInSupabase(id, state.currentUsername, body);
        state.taskComments = {
          ...state.taskComments,
          [id]: [...(state.taskComments[id] || []), comment],
        };
        renderTaskTabContent();
      } catch (e) {
        showToast('コメントの送信に失敗しました', 'error');
      }
    });
  });

  // Enterキー送信
  container.querySelectorAll('.tc-input[data-task-id]').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        container.querySelector(`.tc-send[data-task-id="${input.dataset.taskId}"]`)?.click();
      }
    });
  });

  // 削除ボタン
  container.querySelectorAll('.tc-del[data-cid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cid = btn.dataset.cid;
      const taskId = btn.dataset.taskId;
      try {
        await deleteTaskCommentInSupabase(cid);
        state.taskComments = {
          ...state.taskComments,
          [taskId]: (state.taskComments[taskId] || []).filter(c => c.id !== cid),
        };
        renderTaskTabContent();
      } catch (e) {
        showToast('削除に失敗しました', 'error');
      }
    });
  });
}

function _taskFilterBarHtml(totalCount, filteredCount) {
  const currentValue = esc(state.taskProjectKeyFilter || '');
  const countLabel = state.taskProjectKeyFilter
    ? `${filteredCount} / ${totalCount}件`
    : `${totalCount}件`;
  return `
    <div class="task-project-filter-row">
      <div class="task-project-filter-input-wrap">
        <i class="fa-solid fa-magnifying-glass task-project-filter-icon"></i>
        <input
          type="text"
          id="task-project-filter-input"
          class="form-input task-project-filter-input"
          placeholder="物件Noで絞り込み"
          value="${currentValue}"
          autocomplete="off"
        >
        <button
          type="button"
          class="task-project-filter-clear"
          id="task-project-filter-clear"
          ${state.taskProjectKeyFilter ? '' : 'hidden'}
          title="検索をクリア"
        ><i class="fa-solid fa-xmark"></i></button>
      </div>
      <span class="task-project-filter-count">${countLabel}</span>
    </div>
  `;
}

function _bindTaskProjectFilterEvents() {
  const input = document.getElementById('task-project-filter-input');
  const clearBtn = document.getElementById('task-project-filter-clear');
  if (input) {
    if (input._taskFilterHandler) input.removeEventListener('input', input._taskFilterHandler);
    input._taskFilterHandler = e => {
      state.taskProjectKeyFilter = normalizeProjectKey(e.target.value || '');
      renderTaskTabContent();
    };
    input.addEventListener('input', input._taskFilterHandler);
  }
  if (clearBtn) {
    if (clearBtn._taskFilterClearHandler) clearBtn.removeEventListener('click', clearBtn._taskFilterClearHandler);
    clearBtn._taskFilterClearHandler = () => {
      state.taskProjectKeyFilter = '';
      renderTaskTabContent();
    };
    clearBtn.addEventListener('click', clearBtn._taskFilterClearHandler);
  }
}

function _taskProjectKeyHtml(task) {
  if (!task.projectKey) return '';
  return `
    <div class="task-project-key">
      <span class="task-project-key-label">物件No</span>
      <span class="task-project-key-chip">${esc(task.projectKey)}</span>
    </div>
  `;
}

function _sortTasks(list) {
  return [...list].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

function _mergeTaskLists(...lists) {
  const merged = new Map();
  lists.flat().forEach(task => {
    if (task?.id) merged.set(task.id, task);
  });
  return _sortTasks([...merged.values()]);
}

function _isReceivedTaskLive(task) {
  return ACTIVE_TASK_STATUSES.includes(task?.status);
}

function _isSentTaskLive(task) {
  return ACTIVE_TASK_STATUSES.includes(task?.status) || (task?.status === 'done' && !task?.notifiedDone);
}

function _isSharedTaskLive(task) {
  const response = task?.sharedResponses?.[state.currentUsername] || 'pending';
  return response === 'pending';
}

function _syncReceivedTasks() {
  state.receivedTasks = _mergeTaskLists(state.taskHistoryCache.received, liveReceivedTasks);
}

function _syncSentTasks() {
  state.sentTasks = _mergeTaskLists(state.taskHistoryCache.sent, liveSentTasks, liveSentDoneNotifyTasks);
}

function _syncSharedTasks() {
  state.sharedTasks = _mergeTaskLists(state.taskHistoryCache.shared, liveSharedTasks);
}

function _syncAllTaskLists() {
  _syncReceivedTasks();
  _syncSentTasks();
  _syncSharedTasks();
}

function _resetTaskHistoryState() {
  if (state._receivedTasksUnsub) { state._receivedTasksUnsub(); state._receivedTasksUnsub = null; }
  if (state._sentTasksUnsub) { state._sentTasksUnsub(); state._sentTasksUnsub = null; }
  if (state._sentTaskDoneNotifyUnsub) { state._sentTaskDoneNotifyUnsub(); state._sentTaskDoneNotifyUnsub = null; }
  if (state._sharedTasksUnsub) { state._sharedTasksUnsub(); state._sharedTasksUnsub = null; }
  liveReceivedTasks = [];
  liveSentTasks = [];
  liveSentDoneNotifyTasks = [];
  liveSharedTasks = [];
  state.taskHistoryCache = {
    received: [],
    sent: [],
    shared: [],
  };
  state.taskHistoryLoaded = {
    received: false,
    sent: false,
    shared: false,
  };
  state.taskHistoryLoading = {
    received: false,
    sent: false,
    shared: false,
  };
  _syncAllTaskLists();
}

function _upsertTaskHistory(tab, task) {
  if (!task?.id) return;
  const current = Array.isArray(state.taskHistoryCache[tab]) ? state.taskHistoryCache[tab] : [];
  const withoutCurrent = current.filter(item => item.id !== task.id);
  const shouldStayInHistory =
    (tab === 'received' && !_isReceivedTaskLive(task)) ||
    (tab === 'sent' && !_isSentTaskLive(task)) ||
    (tab === 'shared' && !_isSharedTaskLive(task));

  state.taskHistoryCache = {
    ...state.taskHistoryCache,
    [tab]: shouldStayInHistory ? _sortTasks([...withoutCurrent, task]) : withoutCurrent,
  };
  _syncAllTaskLists();
}

function _removeTaskFromAllCaches(taskId) {
  if (!taskId) return;
  liveReceivedTasks = liveReceivedTasks.filter(task => task.id !== taskId);
  liveSentTasks = liveSentTasks.filter(task => task.id !== taskId);
  liveSentDoneNotifyTasks = liveSentDoneNotifyTasks.filter(task => task.id !== taskId);
  liveSharedTasks = liveSharedTasks.filter(task => task.id !== taskId);
  state.taskHistoryCache = {
    received: state.taskHistoryCache.received.filter(task => task.id !== taskId),
    sent: state.taskHistoryCache.sent.filter(task => task.id !== taskId),
    shared: state.taskHistoryCache.shared.filter(task => task.id !== taskId),
  };
  _syncAllTaskLists();
}

async function _loadTaskHistory(tab, force = false) {
  if (!state.currentUsername) return;
  if (!force && state.taskHistoryLoaded[tab]) return;
  if (state.taskHistoryLoading[tab]) return;

  state.taskHistoryLoading = { ...state.taskHistoryLoading, [tab]: true };
  if (state.taskModalOpen && state.activeTaskTab === tab) {
    renderTaskTabContent();
  }

  if (isSupabaseSharedCoreEnabled()) {
    try {
      const all = await fetchTaskHistoryFromSupabase(tab, state.currentUsername);
      // live のものは除外
      const historyOnly = all.filter(t =>
        tab === 'received' ? !_isReceivedTaskLive(t) :
        tab === 'sent'     ? !_isSentTaskLive(t) :
        !_isSharedTaskLive(t)
      );
      state.taskHistoryCache = { ...state.taskHistoryCache, [tab]: historyOnly };
      state.taskHistoryLoaded = { ...state.taskHistoryLoaded, [tab]: true };
      _syncAllTaskLists();
    } catch (err) {
      console.error(`Supabase task history error (${tab}):`, err);
    } finally {
      state.taskHistoryLoading = { ...state.taskHistoryLoading, [tab]: false };
      if (state.taskModalOpen) renderTaskTabContent();
    }
    return;
  }

  // Firestore の既存コード...
  try {
    let historyQuery = null;
    if (tab === 'received') {
      historyQuery = query(collection(db, 'assigned_tasks'), where('assignedTo', '==', state.currentUsername));
    } else if (tab === 'sent') {
      historyQuery = query(collection(db, 'assigned_tasks'), where('assignedBy', '==', state.currentUsername));
    } else if (tab === 'shared') {
      historyQuery = query(collection(db, 'assigned_tasks'), where('sharedWith', 'array-contains', state.currentUsername));
    }
    if (!historyQuery) return;

    const snap = await getDocs(historyQuery);
    recordGetDocsRead(`task.history.${tab}`, `タスク履歴:${tab}`, `assigned_tasks:${state.currentUsername}`, snap.size, snap.docs);
    const allTasks = _sortTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    const historyOnly = allTasks.filter(task => {
      if (tab === 'received') return !_isReceivedTaskLive(task);
      if (tab === 'sent') return !_isSentTaskLive(task);
      return !_isSharedTaskLive(task);
    });

    state.taskHistoryCache = {
      ...state.taskHistoryCache,
      [tab]: historyOnly,
    };
    state.taskHistoryLoaded = {
      ...state.taskHistoryLoaded,
      [tab]: true,
    };
    _syncAllTaskLists();
  } catch (err) {
    console.error(`task history load error (${tab}):`, err);
  } finally {
    state.taskHistoryLoading = { ...state.taskHistoryLoading, [tab]: false };
    if (state.taskModalOpen && state.activeTaskTab === tab) {
      renderTaskTabContent();
    }
  }
}

function _ensureTaskHistoryForActiveTab() {
  if (state.activeTaskTab === 'received' || state.activeTaskTab === 'sent' || state.activeTaskTab === 'shared') {
    void _loadTaskHistory(state.activeTaskTab);
  }
}

export function startTaskListeners(username) {
  if (!username) return;
  _resetTaskHistoryState();

  if (isSupabaseSharedCoreEnabled()) {
    Promise.all([
      fetchReceivedTasksFromSupabase(username),
      fetchSentTasksFromSupabase(username),
      fetchSentDoneNotifyTasksFromSupabase(username),
      fetchSharedTasksFromSupabase(username),
    ]).then(([received, sent, sentDone, shared]) => {
      liveReceivedTasks = received;
      liveSentTasks = sent;
      liveSentDoneNotifyTasks = sentDone;
      liveSharedTasks = shared;
      _syncReceivedTasks();
      _syncSentTasks();
      _syncSharedTasks();
      updateTaskBadge();
      deps.renderTodoSection?.();
      if (state.taskModalOpen) renderTaskTabContent();
    }).catch(err => console.error('Supabase タスク初期取得エラー:', err));
    return;
  }

  // Firestore の既存コード（onSnapshot 4つ）はそのまま残す
  // orderBy を外してクライアント側でソート（複合インデックス不要）
  const rQ = query(
    collection(db, 'assigned_tasks'),
    where('assignedTo', '==', username),
    where('status', 'in', ACTIVE_TASK_STATUSES),
  );
  recordListenerStart('task.received', '受け取ったタスク', `assigned_tasks:${username}`);
  state._receivedTasksUnsub = wrapTrackedListenerUnsubscribe('task.received', onSnapshot(rQ, snap => {
    recordListenerSnapshot('task.received', snap.size, username, snap.docs);
    liveReceivedTasks = _sortTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    _syncReceivedTasks();
    updateTaskBadge();
    deps.renderTodoSection?.();   // 自分のタスクウィジェットも更新
    if (state.taskModalOpen && state.activeTaskTab === 'received') renderTaskTabContent();
  }, err => console.error('receivedTasks listener error:', err)));

  const sQ = query(
    collection(db, 'assigned_tasks'),
    where('assignedBy', '==', username),
    where('status', 'in', ACTIVE_TASK_STATUSES),
  );
  recordListenerStart('task.sent', '依頼したタスク', `assigned_tasks:${username}`);
  state._sentTasksUnsub = wrapTrackedListenerUnsubscribe('task.sent', onSnapshot(sQ, snap => {
    recordListenerSnapshot('task.sent', snap.size, username, snap.docs);
    liveSentTasks = _sortTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    _syncSentTasks();
    updateTaskBadge();
    if (state.taskModalOpen && state.activeTaskTab === 'sent') renderTaskTabContent();
  }, err => console.error('sentTasks listener error:', err)));

  // 共有されたタスク（自分が sharedWith に含まれる）
  const sentDoneNotifyQ = query(
    collection(db, 'assigned_tasks'),
    where('assignedBy', '==', username),
    where('status', '==', 'done'),
    where('notifiedDone', '==', false),
  );
  recordListenerStart('task.sent-done', '未確認の完了タスク', `assigned_tasks:${username}`);
  state._sentTaskDoneNotifyUnsub = wrapTrackedListenerUnsubscribe('task.sent-done', onSnapshot(sentDoneNotifyQ, snap => {
    recordListenerSnapshot('task.sent-done', snap.size, username, snap.docs);
    liveSentDoneNotifyTasks = _sortTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    _syncSentTasks();
    updateTaskBadge();
    if (state.taskModalOpen && state.activeTaskTab === 'sent') renderTaskTabContent();
  }, err => console.error('sentTasks done listener error:', err)));

  const shareQ = query(
    collection(db, 'assigned_tasks'),
    where('sharedWith', 'array-contains', username),
    where(`sharedResponses.${username}`, '==', 'pending'),
  );
  recordListenerStart('task.shared', '共有されたタスク', `assigned_tasks:${username}`);
  state._sharedTasksUnsub = wrapTrackedListenerUnsubscribe('task.shared', onSnapshot(shareQ, snap => {
    recordListenerSnapshot('task.shared', snap.size, username, snap.docs);
    liveSharedTasks = _sortTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    _syncSharedTasks();
    updateTaskBadge();
    if (state.taskModalOpen && state.activeTaskTab === 'shared') renderTaskTabContent();
  }, err => console.error('sharedTasks listener error:', err)));
}

export function updateTaskBadge() {
  const badge = document.getElementById('task-badge');
  const btn   = document.getElementById('btn-task');
  if (!badge || !btn) return;
  const incoming    = state.receivedTasks.filter(t => t.status === 'pending').length;
  const completions = state.sentTasks.filter(t => t.status === 'done' && !t.notifiedDone).length;
  const sharedPending = state.sharedTasks.filter(t => {
    const resp = t.sharedResponses?.[state.currentUsername];
    return !resp || resp === 'pending';
  }).length;
  const count = incoming + completions + sharedPending;

  // タブバッジも更新
  const rBadge  = document.getElementById('task-tab-received-badge');
  const sBadge  = document.getElementById('task-tab-sent-badge');
  const shBadge = document.getElementById('task-tab-shared-badge');
  if (rBadge)  { rBadge.textContent  = incoming;      rBadge.hidden  = incoming === 0; }
  if (sBadge)  { sBadge.textContent  = completions;   sBadge.hidden  = completions === 0; }
  if (shBadge) { shBadge.textContent = sharedPending; shBadge.hidden = sharedPending === 0; }

  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.hidden = false;
    btn.classList.add('has-badge');
  } else {
    badge.hidden = true;
    btn.classList.remove('has-badge');
  }
  deps.updateLockNotifications?.();
  deps.renderTodayDashboard?.();
}

export function openTaskModal() {
  state.taskModalOpen = true;
  document.getElementById('task-modal').classList.add('visible');
  switchTaskTab(state.activeTaskTab);
  _ensureTaskHistoryForActiveTab();
}

export function closeTaskModal() {
  state.taskModalOpen = false;
  document.getElementById('task-modal').classList.remove('visible');
}

export function switchTaskTab(tab) {
  state.activeTaskTab = tab;
  document.querySelectorAll('.task-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderTaskTabContent();
  _ensureTaskHistoryForActiveTab();
}

export function renderTaskTabContent() {
  const content = document.getElementById('task-tab-content');
  if (!content) return;
  if (!state.currentUsername) {
    content.innerHTML = '<div class="task-empty"><i class="fa-solid fa-user-slash"></i><p>ユーザーネームを設定してください</p></div>';
    return;
  }
  if      (state.activeTaskTab === 'received') _renderReceivedTasks(content);
  else if (state.activeTaskTab === 'sent')     _renderSentTasks(content);
  else if (state.activeTaskTab === 'shared')   _renderSharedTasks(content);
  else                                          _renderNewTaskForm(content);
}

export function _renderReceivedTasks(container) {
  if (state.taskHistoryLoading.received && !state.receivedTasks.length) {
    container.innerHTML = '<div class="task-empty"><span class="spinner"></span><p>履歴を読み込み中です...</p></div>';
    return;
  }
  if (!state.receivedTasks.length) {
    container.innerHTML = '<div class="task-empty"><i class="fa-solid fa-inbox"></i><p>受け取ったタスクはありません</p></div>';
    return;
  }
  const filtered = _filterTasksByProjectKey(state.receivedTasks);
  if (!filtered.length) {
    container.innerHTML = `
      ${_taskFilterBarHtml(state.receivedTasks.length, filtered.length)}
      <div class="task-empty"><i class="fa-solid fa-magnifying-glass"></i><p>物件Noに一致するタスクはありません</p></div>
    `;
    _bindTaskProjectFilterEvents();
    return;
  }
  container.innerHTML = _taskFilterBarHtml(state.receivedTasks.length, filtered.length) + filtered.map(t => {
    const s = TASK_STATUS_LABEL[t.status] || TASK_STATUS_LABEL.pending;
    const due = t.dueDate ? `<span class="task-due"><i class="fa-regular fa-calendar"></i> ${esc(t.dueDate)}</span>` : '';
    let actions = '';
    if (t.status === 'pending') {
      actions = `<button class="task-action-btn task-action-accept" data-id="${t.id}"><i class="fa-solid fa-check"></i> 承諾する</button>`;
    } else if (t.status === 'accepted') {
      actions = `<button class="task-action-btn task-action-done" data-id="${t.id}"><i class="fa-solid fa-flag-checkered"></i> 完了報告</button>`;
    } else {
      actions = `<span class="task-done-stamp"><i class="fa-solid fa-circle-check"></i> 完了済み</span>
        <button class="task-action-btn task-action-delete" data-id="${t.id}" title="削除"><i class="fa-solid fa-trash"></i> 削除</button>`;
    }
    return `
      <div class="task-item task-item--${t.status}">
        <div class="task-item-meta">
          <span class="task-status-badge ${s.cls}">${s.text}</span>
          <span class="task-partner"><i class="fa-solid fa-arrow-right-to-bracket"></i> 依頼: ${esc(t.assignedBy)}</span>
          ${due}
        </div>
        <div class="task-item-title">${esc(t.title)}</div>
        ${_taskProjectKeyHtml(t)}
        ${t.description ? `<div class="task-item-desc">${esc(t.description)}</div>` : ''}
        <div class="task-item-actions">${actions}</div>
        ${_taskCommentSectionHtml(t.id)}
      </div>`;
  }).join('');

  _bindTaskProjectFilterEvents();
  _bindTaskCommentEvents(container);
  container.querySelectorAll('.task-action-accept').forEach(btn =>
    btn.addEventListener('click', () => acceptTask(btn.dataset.id)));
  container.querySelectorAll('.task-action-done').forEach(btn =>
    btn.addEventListener('click', () => completeTask(btn.dataset.id)));
  container.querySelectorAll('.task-action-delete').forEach(btn =>
    btn.addEventListener('click', () => deleteTask(btn.dataset.id, 'この完了タスクを削除しますか？')));
}

export function _renderSentTasks(container) {
  if (state.taskHistoryLoading.sent && !state.sentTasks.length) {
    container.innerHTML = '<div class="task-empty"><span class="spinner"></span><p>履歴を読み込み中です...</p></div>';
    return;
  }
  if (!state.sentTasks.length) {
    container.innerHTML = '<div class="task-empty"><i class="fa-solid fa-paper-plane"></i><p>依頼したタスクはありません</p></div>';
    return;
  }
  const filtered = _filterTasksByProjectKey(state.sentTasks);
  if (!filtered.length) {
    container.innerHTML = `
      ${_taskFilterBarHtml(state.sentTasks.length, filtered.length)}
      <div class="task-empty"><i class="fa-solid fa-magnifying-glass"></i><p>物件Noに一致するタスクはありません</p></div>
    `;
    _bindTaskProjectFilterEvents();
    return;
  }
  container.innerHTML = _taskFilterBarHtml(state.sentTasks.length, filtered.length) + filtered.map(t => {
    const s = TASK_STATUS_LABEL[t.status] || TASK_STATUS_LABEL.pending;
    const due = t.dueDate ? `<span class="task-due"><i class="fa-regular fa-calendar"></i> ${esc(t.dueDate)}</span>` : '';
    const isNewDone = t.status === 'done' && !t.notifiedDone;

    // 編集・共有ボタン（完了前のみ）
    const editBtn  = (t.status !== 'done')
      ? `<button class="task-action-btn task-action-edit" data-id="${t.id}"><i class="fa-solid fa-pen"></i> 編集</button>`
      : '';
    const shareBtn = (t.status !== 'done')
      ? `<button class="task-action-btn task-action-share" data-id="${t.id}"><i class="fa-solid fa-share-nodes"></i> 共有</button>`
      : '';

    let statusActions = '';
    if (isNewDone) {
      statusActions = `<button class="task-action-btn task-action-ack" data-id="${t.id}"><i class="fa-solid fa-circle-check"></i> 完了を確認した</button>
        <button class="task-action-btn task-action-delete" data-id="${t.id}" title="削除"><i class="fa-solid fa-trash"></i> 削除</button>`;
    } else if (t.status === 'done') {
      statusActions = `<button class="task-action-btn task-action-delete" data-id="${t.id}" title="削除"><i class="fa-solid fa-trash"></i> 削除</button>`;
    } else if (t.status === 'pending') {
      statusActions = `<button class="task-action-btn task-action-cancel" data-id="${t.id}" title="依頼を取り消す"><i class="fa-solid fa-xmark"></i> 取り消す</button>`;
    }

    // 共有済みユーザーの一覧バッジ
    const sharedWith = t.sharedWith || [];
    const sharedResponses = t.sharedResponses || {};
    const sharedBadges = sharedWith.length
      ? `<div class="task-shared-with-list">${sharedWith.map(u => {
          const resp = sharedResponses[u] || 'pending';
          const cls  = resp === 'accepted' ? 'sh-accepted' : resp === 'declined' ? 'sh-declined' : 'sh-pending';
          const icon = resp === 'accepted' ? '✓' : resp === 'declined' ? '✗' : '…';
          return `<span class="task-shared-user-badge ${cls}" title="${esc(u)}: ${resp === 'accepted' ? '受取済' : resp === 'declined' ? '断った' : '未応答'}">${icon} ${esc(u)}</span>`;
        }).join('')}</div>`
      : '';

    return `
      <div class="task-item task-item--${t.status}${isNewDone ? ' task-item--alert' : ''}">
        <div class="task-item-meta">
          <span class="task-status-badge ${s.cls}">${s.text}</span>
          <span class="task-partner"><i class="fa-solid fa-arrow-right-from-bracket"></i> 担当: ${esc(t.assignedTo)}</span>
          ${due}
        </div>
        <div class="task-item-title">${esc(t.title)}</div>
        ${_taskProjectKeyHtml(t)}
        ${t.description ? `<div class="task-item-desc">${esc(t.description)}</div>` : ''}
        ${sharedBadges}
        ${(editBtn || shareBtn || statusActions) ? `<div class="task-item-actions">${editBtn}${shareBtn}${statusActions}</div>` : ''}
        ${_taskCommentSectionHtml(t.id)}
      </div>`;
  }).join('');

  _bindTaskProjectFilterEvents();
  _bindTaskCommentEvents(container);
  container.querySelectorAll('.task-action-edit').forEach(btn =>
    btn.addEventListener('click', () => openTaskEditModal(btn.dataset.id)));
  container.querySelectorAll('.task-action-share').forEach(btn =>
    btn.addEventListener('click', () => openTaskSharePicker(btn.dataset.id)));
  container.querySelectorAll('.task-action-ack').forEach(btn =>
    btn.addEventListener('click', () => acknowledgeTask(btn.dataset.id)));
  container.querySelectorAll('.task-action-delete').forEach(btn =>
    btn.addEventListener('click', () => deleteTask(btn.dataset.id, 'この完了タスクを削除しますか？')));
  container.querySelectorAll('.task-action-cancel').forEach(btn =>
    btn.addEventListener('click', () => deleteTask(btn.dataset.id, 'この依頼を取り消しますか？相手側からも消えます。')));
}

export function _renderSharedTasks(container) {
  if (state.taskHistoryLoading.shared && !state.sharedTasks.length) {
    container.innerHTML = '<div class="task-empty"><span class="spinner"></span><p>履歴を読み込み中です...</p></div>';
    return;
  }
  if (!state.sharedTasks.length) {
    container.innerHTML = '<div class="task-empty"><i class="fa-solid fa-share-nodes"></i><p>共有されたタスクはありません</p></div>';
    return;
  }
  const filtered = _filterTasksByProjectKey(state.sharedTasks);
  if (!filtered.length) {
    container.innerHTML = `
      ${_taskFilterBarHtml(state.sharedTasks.length, filtered.length)}
      <div class="task-empty"><i class="fa-solid fa-magnifying-glass"></i><p>物件Noに一致するタスクはありません</p></div>
    `;
    _bindTaskProjectFilterEvents();
    return;
  }
  container.innerHTML = _taskFilterBarHtml(state.sharedTasks.length, filtered.length) + filtered.map(t => {
    const s   = TASK_STATUS_LABEL[t.status] || TASK_STATUS_LABEL.pending;
    const due = t.dueDate ? `<span class="task-due"><i class="fa-regular fa-calendar"></i> ${esc(t.dueDate)}</span>` : '';
    const resp = t.sharedResponses?.[state.currentUsername] || 'pending';

    let actions = '';
    if (resp === 'pending') {
      actions = `<button class="task-action-btn task-action-share-accept" data-id="${t.id}"><i class="fa-solid fa-check"></i> 受け取る</button>
        <button class="task-action-btn task-action-share-decline" data-id="${t.id}"><i class="fa-solid fa-xmark"></i> 断る</button>`;
    } else {
      const labelCls  = resp === 'accepted' ? 'sh-accepted' : 'sh-declined';
      const labelText = resp === 'accepted' ? '<i class="fa-solid fa-circle-check"></i> 受取済み' : '<i class="fa-solid fa-circle-xmark"></i> 断った';
      actions = `<span class="task-shared-response-label ${labelCls}">${labelText}</span>`;
    }

    return `
      <div class="task-item task-item--${t.status} task-item--shared">
        <div class="task-item-meta">
          <span class="task-status-badge ${s.cls}">${s.text}</span>
          <span class="task-partner"><i class="fa-solid fa-arrow-right-to-bracket"></i> 依頼: ${esc(t.assignedBy)}</span>
          ${due}
        </div>
        <div class="task-item-title">${esc(t.title)}</div>
        ${_taskProjectKeyHtml(t)}
        ${t.description ? `<div class="task-item-desc">${esc(t.description)}</div>` : ''}
        <div class="task-item-actions">${actions}</div>
        ${_taskCommentSectionHtml(t.id)}
      </div>`;
  }).join('');

  _bindTaskProjectFilterEvents();
  _bindTaskCommentEvents(container);
  container.querySelectorAll('.task-action-share-accept').forEach(btn =>
    btn.addEventListener('click', () => acceptSharedTask(btn.dataset.id)));
  container.querySelectorAll('.task-action-share-decline').forEach(btn =>
    btn.addEventListener('click', () => declineSharedTask(btn.dataset.id)));
}

export function _renderNewTaskForm(container) {
  state.newTaskAssignee = '';
  container.innerHTML = `
    <div class="task-new-form">
      <div class="form-group">
        <label class="form-label">担当者 <span class="required-mark">*</span></label>
        <div class="task-assignee-row">
          <span class="task-assignee-display" id="new-task-assignee-display">未選択</span>
          <button class="task-pick-btn" id="task-pick-user"><i class="fa-solid fa-user-plus"></i> 選択</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">タスク名 <span class="required-mark">*</span></label>
        <input type="text" id="new-task-title" class="form-input" placeholder="例：〇〇の資料作成" maxlength="60" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">物件No（任意）</label>
        <input type="text" id="new-task-project-key" class="form-input" placeholder="物件No（現場コード） 例：61065" maxlength="80" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">詳細（省略可）</label>
        <textarea id="new-task-desc" class="form-input" rows="3" placeholder="詳しい説明や注意点..."></textarea>
      </div>
      <div class="form-group form-group-inline">
        <input type="date" id="new-task-due" class="date-icon-only">
        <label class="form-label" for="new-task-due">期限入力（省略可）</label>
      </div>
      <button class="btn-modal-primary" id="new-task-submit" style="width:100%;margin-top:4px">
        <i class="fa-solid fa-paper-plane"></i> タスクを依頼する
      </button>
    </div>`;

  document.getElementById('task-pick-user').addEventListener('click', openTaskUserPicker);
  document.getElementById('new-task-submit').addEventListener('click', submitNewTask);
}

export async function openTaskUserPicker() {
  document.getElementById('task-user-picker-modal').classList.add('visible');
  document.getElementById('task-user-search').value = '';
  await deps.loadUsersForChatPicker?.('task-user-list', 'task-user-search', (name) => {
    state.newTaskAssignee = name;
    const el = document.getElementById('new-task-assignee-display');
    if (el) { el.textContent = name; el.classList.add('selected'); }
    document.getElementById('task-user-picker-modal').classList.remove('visible');
  }, true);
}

export async function submitNewTask() {
  if (!state.newTaskAssignee) { showToast('担当者を選択してください。', 'warning'); return; }
  const title = document.getElementById('new-task-title')?.value.trim();
  if (!title) { document.getElementById('new-task-title')?.focus(); return; }
  const description = document.getElementById('new-task-desc')?.value.trim() || '';
  const dueDate = document.getElementById('new-task-due')?.value || '';
  const projectKey = normalizeProjectKey(document.getElementById('new-task-project-key')?.value || '');

  const btn = document.getElementById('new-task-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 送信中...';
  try {
    await createTaskRecord({
      title,
      description,
      assignedBy: state.currentUsername,
      assignedTo: state.newTaskAssignee,
      dueDate,
      projectKey,
      sourceType: 'manual',
    });
    // Supabase モードは onSnapshot がないため liveSentTasks を手動更新
    if (isSupabaseSharedCoreEnabled()) {
      const refreshed = await fetchSentTasksFromSupabase(state.currentUsername);
      liveSentTasks = refreshed;
      // 履歴キャッシュをリセットして次回タブ切替時に再取得させる
      state.taskHistoryLoaded = { ...state.taskHistoryLoaded, sent: false };
      state.taskHistoryCache  = { ...state.taskHistoryCache,  sent: [] };
      _syncSentTasks();
    }
    // フォームをリセット
    state.newTaskAssignee = '';
    const titleEl = document.getElementById('new-task-title');
    const projectKeyEl = document.getElementById('new-task-project-key');
    const descEl  = document.getElementById('new-task-desc');
    const dueEl   = document.getElementById('new-task-due');
    if (titleEl) titleEl.value = '';
    if (projectKeyEl) projectKeyEl.value = '';
    if (descEl)  descEl.value  = '';
    if (dueEl)   dueEl.value   = '';
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> タスクを依頼する';
    switchTaskTab('sent');
  } catch (err) {
    console.error('タスク作成エラー:', err);
    showToast('送信に失敗しました: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> タスクを依頼する';
  }
}

export async function acceptTask(taskId) {
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await updateAssignedTaskInSupabase(taskId, {
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
      });
    } else {
      await updateDoc(doc(db, 'assigned_tasks', taskId), {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
      });
    }
    await syncRequestLink(taskId, {
      linkedTaskStatus: 'accepted',
      linkedTaskClosedAt: null,
    });
  } catch (err) { console.error('タスク承諾エラー:', err); }
}

export async function completeTask(taskId) {
  if (!await showConfirm('このタスクを完了として報告しますか？')) return;
  try {
    const current = state.receivedTasks.find(task => task.id === taskId);
    if (isSupabaseSharedCoreEnabled()) {
      await updateAssignedTaskInSupabase(taskId, {
        status: 'done',
        doneAt: new Date().toISOString(),
      });
    } else {
      await updateDoc(doc(db, 'assigned_tasks', taskId), {
        status: 'done',
        doneAt: serverTimestamp(),
      });
    }
    if (current) {
      _upsertTaskHistory('received', {
        ...current,
        status: 'done',
        doneAt: { seconds: Math.floor(Date.now() / 1000) },
      });
    }
    await syncRequestLink(taskId, {
      linkedTaskStatus: 'done',
      linkedTaskClosedAt: serverTimestamp(),
    });
  } catch (err) { console.error('タスク完了エラー:', err); }
}

export async function acknowledgeTask(taskId) {
  try {
    const current = state.sentTasks.find(task => task.id === taskId);
    if (isSupabaseSharedCoreEnabled()) {
      await updateAssignedTaskInSupabase(taskId, { notifiedDone: true });
    } else {
      await updateDoc(doc(db, 'assigned_tasks', taskId), { notifiedDone: true });
    }
    if (current) {
      _upsertTaskHistory('sent', {
        ...current,
        notifiedDone: true,
      });
    }
  } catch (err) { console.error('タスク確認エラー:', err); }
}

export async function deleteTask(taskId, confirmMsg) {
  if (!await showConfirm(confirmMsg, { danger: true })) return;
  try {
    let task;
    if (isSupabaseSharedCoreEnabled()) {
      task = await getAssignedTaskFromSupabase(taskId);
      await deleteAssignedTaskInSupabase(taskId);
    } else {
      const taskSnap = await getDoc(doc(db, 'assigned_tasks', taskId));
      task = taskSnap.exists() ? { id: taskSnap.id, ...taskSnap.data() } : null;
      await deleteDoc(doc(db, 'assigned_tasks', taskId));
    }
    _removeTaskFromAllCaches(taskId);
    if (task?.sourceRequestId) {
      await updateDoc(doc(db, 'cross_dept_requests', task.sourceRequestId), {
        linkedTaskId: null,
        linkedTaskStatus: task.status === 'done' ? 'done' : 'cancelled',
        linkedTaskAssignedTo: task.assignedTo || null,
        linkedTaskClosedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        notifyCreator: true,
      });
    }
  } catch (err) { console.error('タスク削除エラー:', err); }
}

// ==================== 編集機能 ====================

export function openTaskEditModal(taskId) {
  const task = state.sentTasks.find(t => t.id === taskId);
  if (!task) return;
  state._editingTaskId = taskId;
  const titleEl = document.getElementById('task-edit-title');
  const projectKeyEl = document.getElementById('task-edit-project-key');
  const descEl  = document.getElementById('task-edit-desc');
  const dueEl   = document.getElementById('task-edit-due');
  if (titleEl) titleEl.value = task.title || '';
  if (projectKeyEl) projectKeyEl.value = task.projectKey || '';
  if (descEl)  descEl.value  = task.description || '';
  if (dueEl)   dueEl.value   = task.dueDate || '';
  document.getElementById('task-edit-modal').classList.add('visible');
}

export function closeTaskEditModal() {
  document.getElementById('task-edit-modal').classList.remove('visible');
  state._editingTaskId = null;
}

export async function submitTaskEdit() {
  const taskId = state._editingTaskId;
  if (!taskId) return;
  const title = document.getElementById('task-edit-title')?.value.trim();
  if (!title) { document.getElementById('task-edit-title')?.focus(); return; }
  const btn = document.getElementById('task-edit-save-btn');
  btn.disabled = true;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await updateAssignedTaskInSupabase(taskId, {
        title,
        projectKey: normalizeProjectKey(document.getElementById('task-edit-project-key')?.value || ''),
        description: document.getElementById('task-edit-desc')?.value.trim() || '',
        dueDate: document.getElementById('task-edit-due')?.value || '',
      });
    } else {
      await updateDoc(doc(db, 'assigned_tasks', taskId), {
        title,
        projectKey: normalizeProjectKey(document.getElementById('task-edit-project-key')?.value || ''),
        description: document.getElementById('task-edit-desc')?.value.trim() || '',
        dueDate:     document.getElementById('task-edit-due')?.value || '',
      });
    }
    closeTaskEditModal();
  } catch (err) {
    console.error('タスク編集エラー:', err);
    showToast('保存に失敗しました: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ==================== 共有機能 ====================

// 共有ピッカー内のユーザーリスト（全ユーザー）
let _sharePickerAllUsers = [];

export async function openTaskSharePicker(taskId) {
  const task = state.sentTasks.find(t => t.id === taskId);
  if (!task) return;
  state._editingTaskId = taskId;

  const modal = document.getElementById('task-share-picker-modal');
  modal.classList.add('visible');

  // 検索クリア
  const searchEl = document.getElementById('task-share-search');
  if (searchEl) searchEl.value = '';

  // 既存共有先の表示
  const alreadyShared = task.sharedWith || [];
  const responses     = task.sharedResponses || {};
  const alreadyEl = document.getElementById('task-share-already');
  if (alreadyEl) {
    if (alreadyShared.length) {
      alreadyEl.innerHTML = `<p class="task-share-already-label">共有済み:</p>`
        + alreadyShared.map(u => {
          const resp = responses[u] || 'pending';
          const cls  = resp === 'accepted' ? 'sh-accepted' : resp === 'declined' ? 'sh-declined' : 'sh-pending';
          const label = resp === 'accepted' ? '受取済' : resp === 'declined' ? '断った' : '未応答';
          return `<span class="task-shared-user-badge ${cls}">${esc(u)}: ${label}</span>`;
        }).join('');
    } else {
      alreadyEl.innerHTML = '';
    }
  }

  // ユーザーリストをロード（chat と同じ loadUsersForChatPicker を流用）
  _sharePickerAllUsers = [];
  const listEl = document.getElementById('task-share-user-list');
  if (listEl) listEl.innerHTML = '<div class="task-share-loading"><span class="spinner"></span></div>';

  if (deps.loadUsersForSharePicker) {
    await deps.loadUsersForSharePicker(alreadyShared, task.assignedTo, task.assignedBy);
  }
}

// ユーザーリストを描画（loadUsersForSharePicker から呼ばれる）
export function renderSharePickerUsers(users, alreadyShared, assignedTo, assignedBy) {
  _sharePickerAllUsers = users;
  _filterShareUserList('');
}

function _renderShareUserList(users, alreadyShared) {
  const task = state.sentTasks.find(t => t.id === state._editingTaskId);
  const alreadyArr = task?.sharedWith || alreadyShared || [];
  const listEl = document.getElementById('task-share-user-list');
  if (!listEl) return;

  // 自分・担当者・すでに共有済みは表示から除外
  const excludes = new Set([
    state.currentUsername,
    task?.assignedTo,
    ...alreadyArr,
  ]);
  const filtered = users.filter(u => !excludes.has(u));

  if (!filtered.length) {
    listEl.innerHTML = '<p class="task-share-empty">追加できるユーザーがいません</p>';
    return;
  }
  listEl.innerHTML = filtered.map(u => `
    <label class="task-share-user-item">
      <input type="checkbox" value="${esc(u)}">
      <span class="task-share-user-name">${esc(u)}</span>
    </label>`).join('');
}

export function filterShareUserList(query) {
  _filterShareUserList(query);
}

function _filterShareUserList(q) {
  const task = state.sentTasks.find(t => t.id === state._editingTaskId);
  const alreadyArr = task?.sharedWith || [];
  const lower = (q || '').toLowerCase();
  const filtered = lower
    ? _sharePickerAllUsers.filter(u => u.toLowerCase().includes(lower))
    : _sharePickerAllUsers;
  _renderShareUserList(filtered, alreadyArr);
}

export function closeTaskSharePicker() {
  document.getElementById('task-share-picker-modal').classList.remove('visible');
  state._editingTaskId = null;
}

export async function submitTaskShare() {
  const taskId = state._editingTaskId;
  if (!taskId) return;
  const task = state.sentTasks.find(t => t.id === taskId);
  if (!task) return;

  const selected = Array.from(
    document.querySelectorAll('#task-share-user-list input[type=checkbox]:checked')
  ).map(cb => cb.value);

  if (!selected.length) { showToast('共有する相手を選択してください。', 'warning'); return; }

  const alreadyShared   = task.sharedWith || [];
  const alreadyResponses = task.sharedResponses || {};
  const newUsers = selected.filter(u => !alreadyShared.includes(u));
  if (!newUsers.length) { closeTaskSharePicker(); return; }

  const newSharedWith = [...alreadyShared, ...newUsers];
  const newResponses  = { ...alreadyResponses };
  newUsers.forEach(u => { newResponses[u] = 'pending'; });

  const btn = document.getElementById('task-share-confirm-btn');
  btn.disabled = true;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await updateAssignedTaskInSupabase(taskId, {
        sharedWith: newSharedWith,
        sharedResponses: newResponses,
      });
    } else {
      await updateDoc(doc(db, 'assigned_tasks', taskId), {
        sharedWith:      newSharedWith,
        sharedResponses: newResponses,
      });
    }
    closeTaskSharePicker();
  } catch (err) {
    console.error('タスク共有エラー:', err);
    showToast('共有に失敗しました: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

export async function acceptSharedTask(taskId) {
  try {
    const current = state.sharedTasks.find(task => task.id === taskId);
    if (isSupabaseSharedCoreEnabled()) {
      const newResponses = { ...(current?.sharedResponses || {}), [state.currentUsername]: 'accepted' };
      await updateAssignedTaskInSupabase(taskId, { sharedResponses: newResponses });
    } else {
      await updateDoc(doc(db, 'assigned_tasks', taskId), {
        [`sharedResponses.${state.currentUsername}`]: 'accepted',
      });
    }
    if (current) {
      _upsertTaskHistory('shared', {
        ...current,
        sharedResponses: {
          ...(current.sharedResponses || {}),
          [state.currentUsername]: 'accepted',
        },
      });
    }
  } catch (err) { console.error('共有タスク承諾エラー:', err); }
}

export async function declineSharedTask(taskId) {
  try {
    const current = state.sharedTasks.find(task => task.id === taskId);
    if (isSupabaseSharedCoreEnabled()) {
      const newResponses = { ...(current?.sharedResponses || {}), [state.currentUsername]: 'declined' };
      await updateAssignedTaskInSupabase(taskId, { sharedResponses: newResponses });
    } else {
      await updateDoc(doc(db, 'assigned_tasks', taskId), {
        [`sharedResponses.${state.currentUsername}`]: 'declined',
      });
    }
    if (current) {
      _upsertTaskHistory('shared', {
        ...current,
        sharedResponses: {
          ...(current.sharedResponses || {}),
          [state.currentUsername]: 'declined',
        },
      });
    }
  } catch (err) { console.error('共有タスク拒否エラー:', err); }
}
