// ========== タスク割り振り ==========
import { db, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, collection, query, where, orderBy, serverTimestamp, onSnapshot } from './config.js';
import { state, TASK_STATUS_LABEL } from './state.js';
import { esc, getUserAvatarColor, normalizeProjectKey } from './utils.js';
import {
  recordListenerStart,
  recordListenerSnapshot,
  wrapTrackedListenerUnsubscribe,
} from './read-diagnostics.js';
export const deps = {};

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
    input.addEventListener('input', e => {
      state.taskProjectKeyFilter = normalizeProjectKey(e.target.value || '');
      renderTaskTabContent();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.taskProjectKeyFilter = '';
      renderTaskTabContent();
    });
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

export function startTaskListeners(username) {
  if (!username) return;
  if (state._receivedTasksUnsub) { state._receivedTasksUnsub(); state._receivedTasksUnsub = null; }
  if (state._sentTasksUnsub)     { state._sentTasksUnsub();     state._sentTasksUnsub = null; }
  if (state._sharedTasksUnsub)   { state._sharedTasksUnsub();   state._sharedTasksUnsub = null; }

  // orderBy を外してクライアント側でソート（複合インデックス不要）
  const rQ = query(collection(db, 'assigned_tasks'), where('assignedTo', '==', username));
  recordListenerStart('task.received', '受け取ったタスク', `assigned_tasks:${username}`);
  state._receivedTasksUnsub = wrapTrackedListenerUnsubscribe('task.received', onSnapshot(rQ, snap => {
    recordListenerSnapshot('task.received', snap.size, username);
    state.receivedTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    updateTaskBadge();
    deps.renderTodoSection?.();   // 自分のタスクウィジェットも更新
    if (state.taskModalOpen && state.activeTaskTab === 'received') renderTaskTabContent();
  }, err => console.error('receivedTasks listener error:', err)));

  const sQ = query(collection(db, 'assigned_tasks'), where('assignedBy', '==', username));
  recordListenerStart('task.sent', '依頼したタスク', `assigned_tasks:${username}`);
  state._sentTasksUnsub = wrapTrackedListenerUnsubscribe('task.sent', onSnapshot(sQ, snap => {
    recordListenerSnapshot('task.sent', snap.size, username);
    state.sentTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    updateTaskBadge();
    if (state.taskModalOpen && state.activeTaskTab === 'sent') renderTaskTabContent();
  }, err => console.error('sentTasks listener error:', err)));

  // 共有されたタスク（自分が sharedWith に含まれる）
  const shareQ = query(collection(db, 'assigned_tasks'), where('sharedWith', 'array-contains', username));
  recordListenerStart('task.shared', '共有されたタスク', `assigned_tasks:${username}`);
  state._sharedTasksUnsub = wrapTrackedListenerUnsubscribe('task.shared', onSnapshot(shareQ, snap => {
    recordListenerSnapshot('task.shared', snap.size, username);
    state.sharedTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
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
}

export function closeTaskModal() {
  state.taskModalOpen = false;
  document.getElementById('task-modal').classList.remove('visible');
}

export function switchTaskTab(tab) {
  state.activeTaskTab = tab;
  document.querySelectorAll('.task-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderTaskTabContent();
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
      </div>`;
  }).join('');

  _bindTaskProjectFilterEvents();
  container.querySelectorAll('.task-action-accept').forEach(btn =>
    btn.addEventListener('click', () => acceptTask(btn.dataset.id)));
  container.querySelectorAll('.task-action-done').forEach(btn =>
    btn.addEventListener('click', () => completeTask(btn.dataset.id)));
  container.querySelectorAll('.task-action-delete').forEach(btn =>
    btn.addEventListener('click', () => deleteTask(btn.dataset.id, 'この完了タスクを削除しますか？')));
}

export function _renderSentTasks(container) {
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
      </div>`;
  }).join('');

  _bindTaskProjectFilterEvents();
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
      </div>`;
  }).join('');

  _bindTaskProjectFilterEvents();
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
  if (!state.newTaskAssignee) { alert('担当者を選択してください。'); return; }
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
    alert('送信に失敗しました: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> タスクを依頼する';
  }
}

export async function acceptTask(taskId) {
  try {
    await updateDoc(doc(db, 'assigned_tasks', taskId), {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
    });
    await syncRequestLink(taskId, {
      linkedTaskStatus: 'accepted',
      linkedTaskClosedAt: null,
    });
  } catch (err) { console.error('タスク承諾エラー:', err); }
}

export async function completeTask(taskId) {
  if (!confirm('このタスクを完了として報告しますか？')) return;
  try {
    await updateDoc(doc(db, 'assigned_tasks', taskId), {
      status: 'done',
      doneAt: serverTimestamp(),
    });
    await syncRequestLink(taskId, {
      linkedTaskStatus: 'done',
      linkedTaskClosedAt: serverTimestamp(),
    });
  } catch (err) { console.error('タスク完了エラー:', err); }
}

export async function acknowledgeTask(taskId) {
  try {
    await updateDoc(doc(db, 'assigned_tasks', taskId), { notifiedDone: true });
  } catch (err) { console.error('タスク確認エラー:', err); }
}

export async function deleteTask(taskId, confirmMsg) {
  if (!confirm(confirmMsg)) return;
  try {
    const taskSnap = await getDoc(doc(db, 'assigned_tasks', taskId));
    const task = taskSnap.exists() ? { id: taskSnap.id, ...taskSnap.data() } : null;
    await deleteDoc(doc(db, 'assigned_tasks', taskId));
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
    await updateDoc(doc(db, 'assigned_tasks', taskId), {
      title,
      projectKey: normalizeProjectKey(document.getElementById('task-edit-project-key')?.value || ''),
      description: document.getElementById('task-edit-desc')?.value.trim() || '',
      dueDate:     document.getElementById('task-edit-due')?.value || '',
    });
    closeTaskEditModal();
  } catch (err) {
    console.error('タスク編集エラー:', err);
    alert('保存に失敗しました: ' + err.message);
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

  if (!selected.length) { alert('共有する相手を選択してください。'); return; }

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
    await updateDoc(doc(db, 'assigned_tasks', taskId), {
      sharedWith:      newSharedWith,
      sharedResponses: newResponses,
    });
    closeTaskSharePicker();
  } catch (err) {
    console.error('タスク共有エラー:', err);
    alert('共有に失敗しました: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

export async function acceptSharedTask(taskId) {
  try {
    await updateDoc(doc(db, 'assigned_tasks', taskId), {
      [`sharedResponses.${state.currentUsername}`]: 'accepted',
    });
  } catch (err) { console.error('共有タスク承諾エラー:', err); }
}

export async function declineSharedTask(taskId) {
  try {
    await updateDoc(doc(db, 'assigned_tasks', taskId), {
      [`sharedResponses.${state.currentUsername}`]: 'declined',
    });
  } catch (err) { console.error('共有タスク拒否エラー:', err); }
}
