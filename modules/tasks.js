// ========== タスク割り振り ==========
import { db, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, collection, query, where, orderBy, serverTimestamp, onSnapshot } from './config.js';
import { state, TASK_STATUS_LABEL } from './state.js';
import { esc, getUserAvatarColor } from './utils.js';
export const deps = {};

export function startTaskListeners(username) {
  if (!username) return;
  if (state._receivedTasksUnsub) { state._receivedTasksUnsub(); state._receivedTasksUnsub = null; }
  if (state._sentTasksUnsub)     { state._sentTasksUnsub();     state._sentTasksUnsub = null; }

  // orderBy を外してクライアント側でソート（複合インデックス不要）
  const rQ = query(collection(db, 'assigned_tasks'), where('assignedTo', '==', username));
  state._receivedTasksUnsub = onSnapshot(rQ, snap => {
    state.receivedTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    updateTaskBadge();
    if (state.taskModalOpen && state.activeTaskTab === 'received') renderTaskTabContent();
  }, err => console.error('receivedTasks listener error:', err));

  const sQ = query(collection(db, 'assigned_tasks'), where('assignedBy', '==', username));
  state._sentTasksUnsub = onSnapshot(sQ, snap => {
    state.sentTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    updateTaskBadge();
    if (state.taskModalOpen && state.activeTaskTab === 'sent') renderTaskTabContent();
  }, err => console.error('sentTasks listener error:', err));
}

export function updateTaskBadge() {
  const badge = document.getElementById('task-badge');
  const btn   = document.getElementById('btn-task');
  if (!badge || !btn) return;
  const incoming   = state.receivedTasks.filter(t => t.status === 'pending').length;
  const completions = state.sentTasks.filter(t => t.status === 'done' && !t.notifiedDone).length;
  const count = incoming + completions;

  // タブバッジも更新
  const rBadge = document.getElementById('task-tab-received-badge');
  const sBadge = document.getElementById('task-tab-sent-badge');
  if (rBadge) { rBadge.textContent = incoming; rBadge.hidden = incoming === 0; }
  if (sBadge) { sBadge.textContent = completions; sBadge.hidden = completions === 0; }

  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.hidden = false;
    btn.classList.add('has-badge');
  } else {
    badge.hidden = true;
    btn.classList.remove('has-badge');
  }
  deps.updateLockNotifications?.();
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
  if (state.activeTaskTab === 'received') _renderReceivedTasks(content);
  else if (state.activeTaskTab === 'sent') _renderSentTasks(content);
  else _renderNewTaskForm(content);
}

export function _renderReceivedTasks(container) {
  if (!state.receivedTasks.length) {
    container.innerHTML = '<div class="task-empty"><i class="fa-solid fa-inbox"></i><p>受け取ったタスクはありません</p></div>';
    return;
  }
  container.innerHTML = state.receivedTasks.map(t => {
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
        ${t.description ? `<div class="task-item-desc">${esc(t.description)}</div>` : ''}
        <div class="task-item-actions">${actions}</div>
      </div>`;
  }).join('');

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
  container.innerHTML = state.sentTasks.map(t => {
    const s = TASK_STATUS_LABEL[t.status] || TASK_STATUS_LABEL.pending;
    const due = t.dueDate ? `<span class="task-due"><i class="fa-regular fa-calendar"></i> ${esc(t.dueDate)}</span>` : '';
    const isNewDone = t.status === 'done' && !t.notifiedDone;
    let actions = '';
    if (isNewDone) {
      actions = `<button class="task-action-btn task-action-ack" data-id="${t.id}"><i class="fa-solid fa-circle-check"></i> 完了を確認した</button>
        <button class="task-action-btn task-action-delete" data-id="${t.id}" title="削除"><i class="fa-solid fa-trash"></i> 削除</button>`;
    } else if (t.status === 'done') {
      actions = `<button class="task-action-btn task-action-delete" data-id="${t.id}" title="削除"><i class="fa-solid fa-trash"></i> 削除</button>`;
    } else if (t.status === 'pending') {
      actions = `<button class="task-action-btn task-action-cancel" data-id="${t.id}" title="依頼を取り消す"><i class="fa-solid fa-xmark"></i> 取り消す</button>`;
    }
    return `
      <div class="task-item task-item--${t.status}${isNewDone ? ' task-item--alert' : ''}">
        <div class="task-item-meta">
          <span class="task-status-badge ${s.cls}">${s.text}</span>
          <span class="task-partner"><i class="fa-solid fa-arrow-right-from-bracket"></i> 担当: ${esc(t.assignedTo)}</span>
          ${due}
        </div>
        <div class="task-item-title">${esc(t.title)}</div>
        ${t.description ? `<div class="task-item-desc">${esc(t.description)}</div>` : ''}
        ${actions ? `<div class="task-item-actions">${actions}</div>` : ''}
      </div>`;
  }).join('');

  container.querySelectorAll('.task-action-ack').forEach(btn =>
    btn.addEventListener('click', () => acknowledgeTask(btn.dataset.id)));
  container.querySelectorAll('.task-action-delete').forEach(btn =>
    btn.addEventListener('click', () => deleteTask(btn.dataset.id, 'この完了タスクを削除しますか？')));
  container.querySelectorAll('.task-action-cancel').forEach(btn =>
    btn.addEventListener('click', () => deleteTask(btn.dataset.id, 'この依頼を取り消しますか？相手側からも消えます。')));
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

  const btn = document.getElementById('new-task-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 送信中...';
  try {
    await addDoc(collection(db, 'assigned_tasks'), {
      title, description,
      assignedBy: state.currentUsername,
      assignedTo: state.newTaskAssignee,
      status: 'pending',
      createdAt: serverTimestamp(),
      acceptedAt: null,
      doneAt: null,
      dueDate,
      notifiedDone: false,
    });
    // フォームをリセット
    state.newTaskAssignee = '';
    const titleEl = document.getElementById('new-task-title');
    const descEl  = document.getElementById('new-task-desc');
    const dueEl   = document.getElementById('new-task-due');
    if (titleEl) titleEl.value = '';
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
  } catch (err) { console.error('タスク承諾エラー:', err); }
}

export async function completeTask(taskId) {
  if (!confirm('このタスクを完了として報告しますか？')) return;
  try {
    await updateDoc(doc(db, 'assigned_tasks', taskId), {
      status: 'done',
      doneAt: serverTimestamp(),
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
    await deleteDoc(doc(db, 'assigned_tasks', taskId));
  } catch (err) { console.error('タスク削除エラー:', err); }
}
