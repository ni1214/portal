// ========== タスク割り振り ==========
import { db, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, collection, serverTimestamp } from './config.js';
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
  updateCrossDeptRequestInSupabase,
  fetchTaskCommentsFromSupabase,
  addTaskCommentInSupabase,
  deleteTaskCommentInSupabase,
} from './supabase.js';
import { state, TASK_STATUS_LABEL } from './state.js';
import { esc, getUserAvatarColor, normalizeProjectKey } from './utils.js';
import { showToast, showConfirm } from './notify.js';
export const deps = {};

const ACTIVE_TASK_STATUSES = ['pending', 'accepted'];
const TASK_TAB_META = Object.freeze({
  received: {
    label: '受信',
    title: '受け取ったタスク',
    description: '自分に届いたタスクを確認し、承諾・完了報告します。',
    icon: 'move_to_inbox',
  },
  sent: {
    label: '自分の依頼',
    title: '自分の依頼',
    description: '依頼したタスクの進み具合と完了報告を確認します。',
    icon: 'outbox',
  },
  shared: {
    label: '共有',
    title: '共有されたタスク',
    description: '共有依頼に返事し、必要な内容を確認します。',
    icon: 'groups',
  },
  new: {
    label: 'タスクを作成',
    title: 'タスクを作成',
    description: 'タスク名と担当者を決めて依頼します。',
    icon: 'edit_square',
  },
});

let liveReceivedTasks = [];
let liveSentTasks = [];
let liveSentDoneNotifyTasks = [];
let liveSharedTasks = [];
const TASK_SUPABASE_IDLE_REFRESH_MS = 60000;
const TASK_SUPABASE_MODAL_REFRESH_MS = 20000;
let taskSupabaseRefreshTimer = null;
let taskSupabaseRefreshPromise = null;
let taskSupabaseRefreshPromiseKey = '';
let taskSupabaseRefreshVersion = 0;
let taskSupabaseRefreshUsername = '';
let taskSupabaseFocusHandler = null;
let taskSupabaseVisibilityHandler = null;
let taskDraftUsername = '';
const taskHistoryMutationRevision = {
  received: 0,
  sent: 0,
  shared: 0,
};
const taskUiRenderPending = {
  received: false,
  sent: false,
  shared: false,
  new: false,
};

function getTaskListForTab(tab) {
  if (tab === 'received') return state.receivedTasks || [];
  if (tab === 'sent') return state.sentTasks || [];
  if (tab === 'shared') return state.sharedTasks || [];
  return [];
}

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
  if (isSupabaseSharedCoreEnabled()) {
    const task = await getAssignedTaskFromSupabase(taskId);
    if (!task?.sourceRequestId) return task;
    // Legacy timestamp sentinel をISO文字列に変換
    const isoUpdates = Object.fromEntries(
      Object.entries(updates).map(([k, v]) =>
        [k, (v && typeof v === 'object' && '_methodName' in v) ? new Date().toISOString() : v]
      )
    );
    await updateCrossDeptRequestInSupabase(task.sourceRequestId, {
      ...isoUpdates,
      updatedAt: new Date().toISOString(),
      notifyCreator: true,
    });
    return task;
  }
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
  const safeTaskId = String(taskId || '').replace(/[^a-zA-Z0-9_-]/g, '-');
  const areaId = `task-comment-area-${safeTaskId}`;

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
            ? `<button type="button" class="tc-del" data-cid="${c.id}" data-task-id="${taskId}" title="コメントを削除" aria-label="コメントを削除"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>`
            : ''}
        </div>
      `).join('');
      inner = `
        <div class="tc-list">${list || '<div class="tc-empty">コメントはまだありません</div>'}</div>
        <div class="tc-input-row">
          <input type="text" class="tc-input form-input" placeholder="コメントを入力…" data-task-id="${taskId}" autocomplete="off">
          <button type="button" class="tc-send btn-modal-primary" data-task-id="${taskId}" aria-label="コメントを送信"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
        </div>
      `;
    }
  }

  return `
    <div class="tc-wrapper">
      <button type="button" class="tc-toggle${isExpanded ? ' tc-toggle--open' : ''}" data-task-id="${taskId}" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-controls="${areaId}">
        <i class="fa-regular fa-comment${isExpanded ? '-dots' : ''}" aria-hidden="true"></i>
        コメント${count ? ` <span class="tc-count">${count}</span>` : ''}
      </button>
      ${isExpanded ? `<div class="tc-area" id="${areaId}">${inner}</div>` : ''}
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
        const comment = await addTaskCommentInSupabase({ taskId: id, username: state.currentUsername, body });
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
      const caret = e.target.selectionStart ?? e.target.value.length;
      state.taskProjectKeyFilter = normalizeProjectKey(e.target.value || '');
      renderTaskTabContent();
      requestAnimationFrame(() => {
        const nextInput = document.getElementById('task-project-filter-input');
        if (!nextInput) return;
        nextInput.focus();
        const nextCaret = Math.min(caret, nextInput.value.length);
        nextInput.setSelectionRange?.(nextCaret, nextCaret);
      });
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

function _todayTaskDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function _taskDueTone(task) {
  if (!task?.dueDate || task.status === 'done') return 'none';
  const today = _todayTaskDateKey();
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
}

function _taskDueHtml(task) {
  if (!task?.dueDate) return '<span class="task-due task-due--none"><i class="fa-regular fa-calendar"></i> 期限なし</span>';
  const tone = _taskDueTone(task);
  const label = tone === 'overdue' ? '期限超過' : tone === 'today' ? '今日まで' : '期限';
  return `<span class="task-due task-due--${tone}"><i class="fa-regular fa-calendar"></i> ${label}: ${esc(task.dueDate)}</span>`;
}

function _taskDecision(task, view) {
  if (view === 'received') {
    if (task.status === 'pending') return { tone: 'warning', icon: 'rule', text: '承諾するか判断' };
    if (task.status === 'accepted') return { tone: 'info', icon: 'flag', text: '完了したら報告' };
    return { tone: 'success', icon: 'check_circle', text: '完了済み' };
  }
  if (view === 'sent') {
    if (task.status === 'done' && !task.notifiedDone) return { tone: 'warning', icon: 'priority_high', text: '完了内容を確認' };
    if (task.status === 'pending') return { tone: 'muted', icon: 'hourglass_top', text: '相手の承諾待ち' };
    if (task.status === 'accepted') return { tone: 'info', icon: 'sync', text: '進行中を見守る' };
    return { tone: 'success', icon: 'task_alt', text: '確認済み' };
  }
  const response = task.sharedResponses?.[state.currentUsername] || 'pending';
  if (response === 'pending') return { tone: 'warning', icon: 'how_to_reg', text: '受け取るか返事' };
  if (response === 'accepted') return { tone: 'success', icon: 'check_circle', text: '受取済み' };
  return { tone: 'muted', icon: 'block', text: '辞退済み' };
}

function _taskDecisionRank(task, view) {
  const dueTone = _taskDueTone(task);
  const dueRank = dueTone === 'overdue' ? 0 : dueTone === 'today' ? 1 : task?.dueDate ? 2 : 3;
  let actionRank = 4;
  if (view === 'received') {
    actionRank = task.status === 'pending' ? 0 : task.status === 'accepted' ? 1 : 3;
  } else if (view === 'sent') {
    actionRank = task.status === 'done' && !task.notifiedDone ? 0 : task.status === 'pending' ? 1 : task.status === 'accepted' ? 2 : 3;
  } else if (view === 'shared') {
    const response = task.sharedResponses?.[state.currentUsername] || 'pending';
    actionRank = response === 'pending' ? 0 : response === 'accepted' ? 2 : 3;
  }
  return actionRank * 10 + dueRank;
}

function _sortTasksForDecision(list, view) {
  return [...list].sort((a, b) => {
    const rankDiff = _taskDecisionRank(a, view) - _taskDecisionRank(b, view);
    if (rankDiff !== 0) return rankDiff;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
  });
}

function _taskProjectKeyChipHtml(task) {
  if (!task.projectKey) return '';
  return `<span class="task-project-key-chip"><span>物件No</span>${esc(task.projectKey)}</span>`;
}

function _taskDetailsHtml(task) {
  if (!task.description) return '';
  return `
    <details class="task-item-details">
      <summary>詳細を見る</summary>
      <p>${esc(task.description)}</p>
    </details>
  `;
}

function _taskItemHtml(task, {
  view,
  partnerLabel,
  partnerName,
  partnerIcon,
  actions = '',
  extra = '',
  className = '',
}) {
  const status = TASK_STATUS_LABEL[task.status] || TASK_STATUS_LABEL.pending;
  const decision = _taskDecision(task, view);
  const actionHtml = actions ? `<div class="task-item-actions">${actions}</div>` : '';
  return `
    <article class="task-item task-item--${esc(task.status || 'pending')} ${esc(className)}">
      <div class="task-item-main">
        <div class="task-item-topline">
          <span class="task-status-badge ${status.cls}">${status.text}</span>
          <span class="task-next-chip task-next-chip--${decision.tone}">
            <span class="material-symbols-rounded" aria-hidden="true">${decision.icon}</span>
            ${esc(decision.text)}
          </span>
        </div>
        <div class="task-item-title-row">
          <h3 class="task-item-title">${esc(task.title)}</h3>
          ${_taskDueHtml(task)}
        </div>
        <div class="task-item-facts">
          <span class="task-partner"><i class="${esc(partnerIcon)}"></i> ${esc(partnerLabel)}: ${esc(partnerName || '')}</span>
          ${_taskProjectKeyChipHtml(task)}
        </div>
        ${_taskDetailsHtml(task)}
        ${extra}
      </div>
      ${actionHtml}
      ${_taskCommentSectionHtml(task.id)}
    </article>
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

function _taskListRenderSignature(tab) {
  return JSON.stringify(getTaskListForTab(tab).map(task => ({
    id: task.id,
    title: task.title,
    description: task.description,
    assignedBy: task.assignedBy,
    assignedTo: task.assignedTo,
    status: task.status,
    dueDate: task.dueDate,
    projectKey: task.projectKey,
    notifiedDone: task.notifiedDone,
    sharedWith: task.sharedWith,
    sharedResponses: task.sharedResponses,
  })));
}

function _taskWorkspaceInteractionInProgress() {
  const modal = document.getElementById('task-modal');
  if (!modal) return false;
  const activeElement = document.activeElement;
  const isEditingField = activeElement
    && modal.contains(activeElement)
    && activeElement.matches('input, textarea, select, [contenteditable="true"]');
  const hasUnsentComment = Array.from(modal.querySelectorAll('.tc-input'))
    .some(input => input.value.trim());
  const hasOpenDetails = !!modal.querySelector('.task-item-details[open]');
  return !!(isEditingField || hasUnsentComment || hasOpenDetails);
}

function _renderTaskTabContentWhenSafe(tab) {
  if (!state.taskModalOpen || state.activeTaskTab !== tab) return;
  if (_taskWorkspaceInteractionInProgress()) {
    taskUiRenderPending[tab] = true;
    return;
  }
  taskUiRenderPending[tab] = false;
  renderTaskTabContent();
}

function _refreshTaskUi({ renderIfOpen = true } = {}) {
  const activeTab = state.activeTaskTab || 'received';
  const beforeSignature = activeTab === 'new' ? '' : _taskListRenderSignature(activeTab);
  _syncAllTaskLists();
  const afterSignature = activeTab === 'new' ? '' : _taskListRenderSignature(activeTab);
  updateTaskBadge();
  deps.renderTodoSection?.();
  const contentChanged = beforeSignature !== afterSignature || taskUiRenderPending[activeTab];
  if (!renderIfOpen || !state.taskModalOpen || activeTab === 'new' || !contentChanged) return;
  if (_taskWorkspaceInteractionInProgress()) {
    taskUiRenderPending[activeTab] = true;
  } else {
    taskUiRenderPending[activeTab] = false;
    renderTaskTabContent();
  }
}

function _getTaskSupabaseRefreshDelay() {
  return state.taskModalOpen ? TASK_SUPABASE_MODAL_REFRESH_MS : TASK_SUPABASE_IDLE_REFRESH_MS;
}

function _clearTaskSupabaseRefreshTimer() {
  if (!taskSupabaseRefreshTimer) return;
  clearTimeout(taskSupabaseRefreshTimer);
  taskSupabaseRefreshTimer = null;
}

function _stopTaskSupabaseAutoRefresh() {
  _clearTaskSupabaseRefreshTimer();
  if (taskSupabaseFocusHandler) {
    window.removeEventListener('focus', taskSupabaseFocusHandler);
    taskSupabaseFocusHandler = null;
  }
  if (taskSupabaseVisibilityHandler) {
    document.removeEventListener('visibilitychange', taskSupabaseVisibilityHandler);
    taskSupabaseVisibilityHandler = null;
  }
  taskSupabaseRefreshUsername = '';
  taskSupabaseRefreshPromise = null;
  taskSupabaseRefreshPromiseKey = '';
  taskSupabaseRefreshVersion += 1;
}

function _scheduleTaskSupabaseRefresh(username, delay = _getTaskSupabaseRefreshDelay()) {
  if (!isSupabaseSharedCoreEnabled() || !username) return;
  _clearTaskSupabaseRefreshTimer();
  taskSupabaseRefreshTimer = setTimeout(() => {
    taskSupabaseRefreshTimer = null;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      _scheduleTaskSupabaseRefresh(username);
      return;
    }
    void refreshSupabaseTaskLiveData(username).catch(() => {});
  }, delay);
}

function _bindTaskSupabaseAutoRefresh(username) {
  if (!isSupabaseSharedCoreEnabled() || !username) return;
  taskSupabaseRefreshUsername = username;
  if (!taskSupabaseFocusHandler) {
    taskSupabaseFocusHandler = () => {
      if (!taskSupabaseRefreshUsername) return;
      void refreshSupabaseTaskLiveData(taskSupabaseRefreshUsername).catch(() => {});
    };
    window.addEventListener('focus', taskSupabaseFocusHandler);
  }
  if (!taskSupabaseVisibilityHandler) {
    taskSupabaseVisibilityHandler = () => {
      if (document.visibilityState !== 'visible' || !taskSupabaseRefreshUsername) return;
      void refreshSupabaseTaskLiveData(taskSupabaseRefreshUsername).catch(() => {});
    };
    document.addEventListener('visibilitychange', taskSupabaseVisibilityHandler);
  }
  _scheduleTaskSupabaseRefresh(username);
}

async function refreshSupabaseTaskLiveData(username = state.currentUsername, { renderIfOpen = true } = {}) {
  if (!isSupabaseSharedCoreEnabled() || !username) return null;
  const refreshVersion = taskSupabaseRefreshVersion;
  const refreshKey = `${username}:${refreshVersion}`;
  if (taskSupabaseRefreshPromise && taskSupabaseRefreshPromiseKey === refreshKey) {
    return taskSupabaseRefreshPromise;
  }

  taskSupabaseRefreshUsername = username;
  const refreshPromise = Promise.all([
    fetchReceivedTasksFromSupabase(username),
    fetchSentTasksFromSupabase(username),
    fetchSentDoneNotifyTasksFromSupabase(username),
    fetchSharedTasksFromSupabase(username),
  ]).then(([received, sent, sentDone, shared]) => {
    if (refreshVersion !== taskSupabaseRefreshVersion || username !== state.currentUsername) return null;
    liveReceivedTasks = received;
    liveSentTasks = sent;
    liveSentDoneNotifyTasks = sentDone;
    liveSharedTasks = shared;
    _refreshTaskUi({ renderIfOpen });
    return { received, sent, sentDone, shared };
  }).catch(err => {
    if (refreshVersion === taskSupabaseRefreshVersion) {
      console.error('Supabase タスク同期エラー:', err);
    }
    throw err;
  }).finally(() => {
    if (taskSupabaseRefreshPromise === refreshPromise) {
      taskSupabaseRefreshPromise = null;
      taskSupabaseRefreshPromiseKey = '';
    }
    if (refreshVersion === taskSupabaseRefreshVersion && username === taskSupabaseRefreshUsername) {
      _scheduleTaskSupabaseRefresh(username);
    }
  });

  taskSupabaseRefreshPromise = refreshPromise;
  taskSupabaseRefreshPromiseKey = refreshKey;
  return refreshPromise;
}

function _resetTaskHistoryState() {
  if (state._receivedTasksUnsub) { state._receivedTasksUnsub(); state._receivedTasksUnsub = null; }
  if (state._sentTasksUnsub) { state._sentTasksUnsub(); state._sentTasksUnsub = null; }
  if (state._sentTaskDoneNotifyUnsub) { state._sentTaskDoneNotifyUnsub(); state._sentTaskDoneNotifyUnsub = null; }
  if (state._sharedTasksUnsub) { state._sharedTasksUnsub(); state._sharedTasksUnsub = null; }
  _stopTaskSupabaseAutoRefresh();
  liveReceivedTasks = [];
  liveSentTasks = [];
  liveSentDoneNotifyTasks = [];
  liveSharedTasks = [];
  Object.keys(taskHistoryMutationRevision).forEach(tab => {
    taskHistoryMutationRevision[tab] += 1;
  });
  Object.keys(taskUiRenderPending).forEach(tab => {
    taskUiRenderPending[tab] = false;
  });
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
  _refreshTaskUi({ renderIfOpen: false });
}

function _upsertTaskHistory(tab, task) {
  if (!task?.id) return;
  taskHistoryMutationRevision[tab] += 1;
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
  _refreshTaskUi();
}

function _removeTaskFromAllCaches(taskId) {
  if (!taskId) return;
  Object.keys(taskHistoryMutationRevision).forEach(tab => {
    taskHistoryMutationRevision[tab] += 1;
  });
  liveReceivedTasks = liveReceivedTasks.filter(task => task.id !== taskId);
  liveSentTasks = liveSentTasks.filter(task => task.id !== taskId);
  liveSentDoneNotifyTasks = liveSentDoneNotifyTasks.filter(task => task.id !== taskId);
  liveSharedTasks = liveSharedTasks.filter(task => task.id !== taskId);
  state.taskHistoryCache = {
    received: state.taskHistoryCache.received.filter(task => task.id !== taskId),
    sent: state.taskHistoryCache.sent.filter(task => task.id !== taskId),
    shared: state.taskHistoryCache.shared.filter(task => task.id !== taskId),
  };
  _refreshTaskUi();
}

async function _loadTaskHistory(tab, force = false) {
  if (!state.currentUsername) return;
  if (!force && state.taskHistoryLoaded[tab]) return;
  if (state.taskHistoryLoading[tab]) return;

  state.taskHistoryLoading = { ...state.taskHistoryLoading, [tab]: true };
  const requestMutationRevision = taskHistoryMutationRevision[tab];
  const requestUsername = state.currentUsername;
  let shouldRetry = false;
  if (state.taskModalOpen && state.activeTaskTab === tab) {
    _renderTaskTabContentWhenSafe(tab);
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
      if (requestUsername !== state.currentUsername || requestMutationRevision !== taskHistoryMutationRevision[tab]) {
        shouldRetry = true;
      } else {
        state.taskHistoryCache = { ...state.taskHistoryCache, [tab]: historyOnly };
        state.taskHistoryLoaded = { ...state.taskHistoryLoaded, [tab]: true };
        _syncAllTaskLists();
      }
    } catch (err) {
      console.error(`Supabase task history error (${tab}):`, err);
    } finally {
      state.taskHistoryLoading = { ...state.taskHistoryLoading, [tab]: false };
      _renderTaskTabContentWhenSafe(tab);
      if (shouldRetry) void _loadTaskHistory(tab, true);
    }
    return;
  }

  state.taskHistoryCache = { ...state.taskHistoryCache, [tab]: [] };
  state.taskHistoryLoaded = { ...state.taskHistoryLoaded, [tab]: true };
  state.taskHistoryLoading = { ...state.taskHistoryLoading, [tab]: false };
  _syncAllTaskLists();
  _renderTaskTabContentWhenSafe(tab);
}

function _ensureTaskHistoryForActiveTab() {
  if (state.activeTaskTab === 'received' || state.activeTaskTab === 'sent' || state.activeTaskTab === 'shared') {
    void _loadTaskHistory(state.activeTaskTab);
  }
}

export function startTaskListeners(username) {
  if (taskDraftUsername !== username) {
    state.newTaskAssignee = '';
    state.newTaskDraft = {
      title: '',
      projectKey: '',
      dueDate: '',
      description: '',
    };
  }
  taskDraftUsername = username || '';
  if (!username) return;
  _resetTaskHistoryState();

  if (isSupabaseSharedCoreEnabled()) {
    _bindTaskSupabaseAutoRefresh(username);
    void refreshSupabaseTaskLiveData(username).catch(() => {});
  } else {
    _refreshTaskUi();
  }
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

function ensureTaskModalScaffold() {
  const modalInner = document.querySelector('#task-modal .task-modal-inner');

  if (modalInner) {
    modalInner.setAttribute('aria-labelledby', 'task-modal-title');
  }

  const tabList = document.querySelector('#task-modal .task-tabs');
  if (tabList) {
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'タスク管理タブ');
  }

  document.querySelectorAll('#task-modal .task-tab').forEach(button => {
    if (button.dataset.enhanced === '1') return;
    const tab = button.dataset.tab || 'received';
    const meta = TASK_TAB_META[tab] || TASK_TAB_META.received;
    const badge = button.querySelector('.task-tab-badge');
    button.innerHTML = `
      <span class="material-symbols-rounded task-tab-icon" aria-hidden="true">${meta.icon}</span>
      <span class="task-tab-label">${esc(meta.label)}</span>
    `;
    if (badge) button.appendChild(badge);
    button.dataset.enhanced = '1';
    button.type = 'button';
    button.id = `task-tab-button-${tab}`;
    button.setAttribute('aria-controls', 'task-tab-content');
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', button.classList.contains('active') ? 'true' : 'false');
    button.setAttribute('tabindex', button.classList.contains('active') ? '0' : '-1');
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = Array.from(document.querySelectorAll('#task-modal .task-tab'));
      const currentIndex = tabs.indexOf(button);
      if (currentIndex < 0) return;
      let nextIndex = currentIndex;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      event.preventDefault();
      const nextTab = tabs[nextIndex];
      switchTaskTab(nextTab.dataset.tab || 'received');
      nextTab.focus();
    });
  });
}

function renderTaskModalChrome() {
  ensureTaskModalScaffold();

  const activeTab = state.activeTaskTab || 'received';
  const activeMeta = TASK_TAB_META[activeTab] || TASK_TAB_META.received;
  const modal = document.getElementById('task-modal');
  const metricsEl = document.getElementById('task-modal-metrics');
  const contextEl = document.getElementById('task-tab-context');
  const viewTitleEl = document.getElementById('task-view-title');
  const viewDescriptionEl = document.getElementById('task-view-description');
  const viewCountEl = document.getElementById('task-view-count');
  const total = getTaskListForTab(activeTab).length;
  const filtered = activeTab === 'new' ? 0 : _filterTasksByProjectKey(getTaskListForTab(activeTab)).length;

  if (metricsEl) {
    metricsEl.hidden = true;
    metricsEl.innerHTML = '';
  }

  if (modal) modal.dataset.taskWorkspaceView = activeTab;
  if (viewTitleEl) viewTitleEl.textContent = activeMeta.title;
  if (viewDescriptionEl) viewDescriptionEl.textContent = activeMeta.description;
  if (viewCountEl) {
    viewCountEl.hidden = activeTab === 'new';
    viewCountEl.textContent = state.taskProjectKeyFilter && filtered !== total
      ? `${filtered} / ${total}件`
      : `${total}件`;
  }
  if (contextEl) {
    contextEl.hidden = false;
  }
}

export function openTaskModal() {
  const activeTab = TASK_TAB_META[state.activeTaskTab] ? state.activeTaskTab : 'received';
  state.taskModalOpen = true;
  document.getElementById('task-modal').classList.add('visible');
  document.querySelector('.task-modal-inner')?.setAttribute('data-task-active-tab', activeTab);
  if (isSupabaseSharedCoreEnabled()) {
    _scheduleTaskSupabaseRefresh(state.currentUsername, TASK_SUPABASE_MODAL_REFRESH_MS);
    void refreshSupabaseTaskLiveData(state.currentUsername).catch(() => {});
  }
  switchTaskTab(activeTab);
  _ensureTaskHistoryForActiveTab();
  requestAnimationFrame(() => {
    document.querySelector(`.task-tab[data-tab="${state.activeTaskTab}"]`)?.focus();
  });
}

export function closeTaskModal() {
  state.taskModalOpen = false;
  document.getElementById('task-modal').classList.remove('visible');
  if (isSupabaseSharedCoreEnabled()) {
    _scheduleTaskSupabaseRefresh(state.currentUsername);
  }
}

export function switchTaskTab(tab) {
  const nextTab = TASK_TAB_META[tab] ? tab : 'received';
  state.activeTaskTab = nextTab;
  document.querySelector('.task-modal-inner')?.setAttribute('data-task-active-tab', nextTab);
  document.querySelectorAll('.task-tab').forEach(b => {
    const isActive = b.dataset.tab === nextTab;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    b.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  renderTaskTabContent();
  const content = document.getElementById('task-tab-content');
  if (content) content.scrollTop = 0;
  _ensureTaskHistoryForActiveTab();
}

export function renderTaskTabContent() {
  const content = document.getElementById('task-tab-content');
  if (!content) return;
  taskUiRenderPending[state.activeTaskTab] = false;
  renderTaskModalChrome();
  content.dataset.taskView = state.activeTaskTab;
  content.setAttribute('role', 'tabpanel');
  content.setAttribute('tabindex', '0');
  const activeButton = document.querySelector(`.task-tab[data-tab="${state.activeTaskTab}"]`);
  if (activeButton?.id) {
    content.setAttribute('aria-labelledby', activeButton.id);
  }
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
  container.innerHTML = _taskFilterBarHtml(state.receivedTasks.length, filtered.length) + _sortTasksForDecision(filtered, 'received').map(t => {
    let actions = '';
    if (t.status === 'pending') {
      actions = `<button class="task-action-btn task-action-accept" data-id="${t.id}"><i class="fa-solid fa-check"></i> 承諾する</button>`;
    } else if (t.status === 'accepted') {
      actions = `<button class="task-action-btn task-action-done" data-id="${t.id}"><i class="fa-solid fa-flag-checkered"></i> 完了報告</button>`;
    } else {
      actions = `<span class="task-done-stamp"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> 完了済み</span>`;
    }
    return _taskItemHtml(t, {
      view: 'received',
      partnerLabel: '依頼',
      partnerName: t.assignedBy,
      partnerIcon: 'fa-solid fa-arrow-right-to-bracket',
      actions,
    });
  }).join('');

  _bindTaskProjectFilterEvents();
  _bindTaskCommentEvents(container);
  container.querySelectorAll('.task-action-accept').forEach(btn =>
    btn.addEventListener('click', () => acceptTask(btn.dataset.id)));
  container.querySelectorAll('.task-action-done').forEach(btn =>
    btn.addEventListener('click', () => completeTask(btn.dataset.id)));
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
  container.innerHTML = _taskFilterBarHtml(state.sentTasks.length, filtered.length) + _sortTasksForDecision(filtered, 'sent').map(t => {
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

    return _taskItemHtml(t, {
      view: 'sent',
      partnerLabel: '担当',
      partnerName: t.assignedTo,
      partnerIcon: 'fa-solid fa-arrow-right-from-bracket',
      actions: `${editBtn}${shareBtn}${statusActions}`,
      extra: sharedBadges,
      className: isNewDone ? 'task-item--alert' : '',
    });
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
  container.innerHTML = _taskFilterBarHtml(state.sharedTasks.length, filtered.length) + _sortTasksForDecision(filtered, 'shared').map(t => {
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

    return _taskItemHtml(t, {
      view: 'shared',
      partnerLabel: '依頼',
      partnerName: t.assignedBy,
      partnerIcon: 'fa-solid fa-arrow-right-to-bracket',
      actions,
      className: 'task-item--shared',
    });
  }).join('');

  _bindTaskProjectFilterEvents();
  _bindTaskCommentEvents(container);
  container.querySelectorAll('.task-action-share-accept').forEach(btn =>
    btn.addEventListener('click', () => acceptSharedTask(btn.dataset.id)));
  container.querySelectorAll('.task-action-share-decline').forEach(btn =>
    btn.addEventListener('click', () => declineSharedTask(btn.dataset.id)));
}

export function _renderNewTaskForm(container) {
  const draft = state.newTaskDraft || {
    title: '',
    projectKey: '',
    dueDate: '',
    description: '',
  };
  state.newTaskDraft = draft;
  const assigneeName = state.newTaskAssignee || '';
  container.innerHTML = `
    <div class="task-composer-shell">
      <form class="task-new-form" id="task-new-form">
        <div class="form-group">
          <label class="form-label" for="new-task-title">タスク名 <span class="required-mark">*</span></label>
          <input type="text" id="new-task-title" class="form-input" placeholder="例：見積資料を確認する" maxlength="60" autocomplete="off" value="${esc(draft.title)}" required aria-required="true">
        </div>
        <div class="form-group">
          <span class="form-label" id="new-task-assignee-label">担当者 <span class="required-mark">*</span></span>
          <div class="task-assignee-row" aria-labelledby="new-task-assignee-label">
            <span class="task-assignee-display${assigneeName ? ' selected' : ''}" id="new-task-assignee-display">${assigneeName ? esc(assigneeName) : '未選択'}</span>
            <button type="button" class="task-pick-btn" id="task-pick-user"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> 担当者を選ぶ</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="new-task-project-key">物件No（省略可）</label>
          <input type="text" id="new-task-project-key" class="form-input" placeholder="例：61065" maxlength="80" autocomplete="off" value="${esc(draft.projectKey)}">
        </div>
        <details class="task-new-options"${draft.dueDate || draft.description ? ' open' : ''}>
          <summary>期限・詳細を追加</summary>
          <div class="task-new-options-body">
            <div class="form-group form-group-inline task-new-due-field">
              <input type="date" id="new-task-due" class="date-icon-only" value="${esc(draft.dueDate)}">
              <label class="form-label" for="new-task-due">期限入力（省略可）</label>
              <button type="button" id="new-task-due-trigger" hidden tabindex="-1" aria-hidden="true"></button>
              <span id="new-task-due-display" hidden></span>
            </div>
            <div class="form-group">
              <label class="form-label" for="new-task-desc">詳細（省略可）</label>
              <textarea id="new-task-desc" class="form-input" rows="3" placeholder="補足や注意点を入力">${esc(draft.description)}</textarea>
            </div>
          </div>
        </details>
        <button type="submit" class="btn-modal-primary" id="new-task-submit">
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i> タスクを依頼する
        </button>
      </form>
    </div>`;

  document.getElementById('task-pick-user')?.addEventListener('click', openTaskUserPicker);
  document.getElementById('task-new-form')?.addEventListener('submit', submitNewTask);
  const draftFields = {
    'new-task-title': 'title',
    'new-task-project-key': 'projectKey',
    'new-task-due': 'dueDate',
    'new-task-desc': 'description',
  };
  Object.entries(draftFields).forEach(([id, key]) => {
    const input = document.getElementById(id);
    const saveDraft = () => {
      state.newTaskDraft = {
        ...(state.newTaskDraft || {}),
        [key]: input?.value || '',
      };
    };
    input?.addEventListener('input', saveDraft);
    input?.addEventListener('change', saveDraft);
  });
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

export async function submitNewTask(event) {
  event?.preventDefault?.();
  if (!state.newTaskAssignee) { showToast('担当者を選択してください。', 'warning'); return; }
  const title = document.getElementById('new-task-title')?.value.trim();
  if (!title) {
    showToast('タスク名を入力してください。', 'warning');
    document.getElementById('new-task-title')?.focus();
    return;
  }
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
    if (isSupabaseSharedCoreEnabled()) {
      await refreshSupabaseTaskLiveData(state.currentUsername, { renderIfOpen: false });
    }
    showToast('タスクを送信しました', 'success');
    state.newTaskAssignee = '';
    state.newTaskDraft = {
      title: '',
      projectKey: '',
      dueDate: '',
      description: '',
    };
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
    if (isSupabaseSharedCoreEnabled()) {
      await refreshSupabaseTaskLiveData(state.currentUsername);
    }
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
    if (isSupabaseSharedCoreEnabled()) {
      await refreshSupabaseTaskLiveData(state.currentUsername);
    }
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
    if (isSupabaseSharedCoreEnabled()) {
      await refreshSupabaseTaskLiveData(state.currentUsername);
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
      if (isSupabaseSharedCoreEnabled()) {
        await updateCrossDeptRequestInSupabase(task.sourceRequestId, {
          linkedTaskId: null,
          linkedTaskStatus: task.status === 'done' ? 'done' : 'cancelled',
          linkedTaskAssignedTo: task.assignedTo || null,
          linkedTaskClosedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notifyCreator: true,
        });
      } else {
        await updateDoc(doc(db, 'cross_dept_requests', task.sourceRequestId), {
          linkedTaskId: null,
          linkedTaskStatus: task.status === 'done' ? 'done' : 'cancelled',
          linkedTaskAssignedTo: task.assignedTo || null,
          linkedTaskClosedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          notifyCreator: true,
        });
      }
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
    if (isSupabaseSharedCoreEnabled()) {
      await refreshSupabaseTaskLiveData(state.currentUsername);
    }
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
    if (isSupabaseSharedCoreEnabled()) {
      await refreshSupabaseTaskLiveData(state.currentUsername);
    }
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
    if (isSupabaseSharedCoreEnabled()) {
      await refreshSupabaseTaskLiveData(state.currentUsername);
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
    if (isSupabaseSharedCoreEnabled()) {
      await refreshSupabaseTaskLiveData(state.currentUsername);
    }
  } catch (err) { console.error('共有タスク拒否エラー:', err); }
}
