// ========== チャット（個別チャット + グループ）モジュール ==========
import { state, CHAT_MSG_MAX } from './state.js';
import { getUserAvatarColor } from './auth.js';
import { esc } from './utils.js';
import { showToast, showConfirm } from './notify.js';
import {
  recordGetDocsRead,
  recordListenerStart,
  recordListenerSnapshot,
  wrapTrackedListenerUnsubscribe,
} from './read-diagnostics.js';
import {
  fetchChatRoomsFromSupabase,
  getChatRoomFromSupabase,
  upsertDmRoomInSupabase,
  ensureDmMembersInSupabase,
  removeSelfFromDmRoomInSupabase,
  createGroupRoomInSupabase,
  updateChatRoomLastInSupabase,
  fetchChatMessagesFromSupabase,
  addChatMessageInSupabase,
  deleteOldestChatMessageInSupabase,
  deleteChatMessageInSupabase,
  fetchChatReadTimesFromSupabase,
  markChatRoomReadInSupabase,
  fetchAllUserAccountsFromSupabase,
} from './supabase.js';

// 他モジュールへの依存（循環参照回避）
export const deps = {};

// ===== ルームID生成 =====
export function getDmRoomId(a, b) {
  return [a, b].sort().join('_');
}

// ===== チャットパネルのリサイズ =====
export function initChatResize() {
  const panel = document.getElementById('chat-panel');
  const handle = document.getElementById('chat-resize-handle');
  if (!handle || !panel) return;

  let resizing = false, startX, startY, startW, startH;

  const onStart = (cx, cy) => {
    resizing = true;
    startX = cx; startY = cy;
    startW = panel.offsetWidth; startH = panel.offsetHeight;
    document.body.style.cursor = 'sw-resize';
    document.body.style.userSelect = 'none';
  };
  const onMove = (cx, cy) => {
    if (!resizing) return;
    // 左下ハンドル: 幅は左に伸びる、高さは下に伸びる
    const newW = Math.max(460, Math.min(window.innerWidth  - 40, startW + (startX - cx)));
    const newH = Math.max(340, Math.min(window.innerHeight - 100, startH + (cy - startY)));
    panel.style.width  = newW + 'px';
    panel.style.height = newH + 'px';
    // ft-panel がチャット横配置中なら追従させる
    const ftPanel = document.getElementById('ft-panel');
    if (ftPanel && ftPanel.style.left) {
      const chatRect = panel.getBoundingClientRect();
      const gap = 8;
      const ftWidth = 340;
      const leftEdge = chatRect.left - gap - ftWidth;
      if (leftEdge >= 8) {
        ftPanel.style.right = 'auto';
        ftPanel.style.left  = leftEdge + 'px';
        ftPanel.style.top   = chatRect.top + 'px';
        ftPanel.style.bottom = '';
      }
    }
  };
  const onEnd = () => {
    if (!resizing) return;
    resizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  handle.addEventListener('mousedown', e => { e.preventDefault(); onStart(e.clientX, e.clientY); });
  document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', onEnd);

  handle.addEventListener('touchstart', e => { e.preventDefault(); onStart(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  document.addEventListener('touchmove', e => { if (resizing) { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  document.addEventListener('touchend', onEnd);
}

// ===== チャットパネル開閉 =====
let chatReadTimesLoadedFor = '';

function ensureChatReadState() {
  if (chatReadTimesLoadedFor === state.currentUsername) return;
  state.chatReadTimes = {};
  chatReadTimesLoadedFor = state.currentUsername || '';
}

async function ensureChatReady() {
  if (!state.currentUsername) return;
  if (!state._dmRoomsUnsubscribe && !state._groupRoomsUnsubscribe) {
    startChatListeners(state.currentUsername);
  }
  if (chatReadTimesLoadedFor !== state.currentUsername) {
    ensureChatReadState();
    await loadChatReadTimes(state.currentUsername);
  }
}

export async function openChatPanel() {
  state.chatPanelOpen = true;
  const panel = document.getElementById('chat-panel');
  panel.removeAttribute('hidden');
  setTimeout(() => panel.classList.add('open'), 10);
  renderChatSidebar();
  await ensureChatReady();
  renderChatSidebar();
}

export function closeChatPanel() {
  state.chatPanelOpen = false;
  const panel = document.getElementById('chat-panel');
  panel.classList.remove('open');
  setTimeout(() => panel.setAttribute('hidden', ''), 280);
  // ft-panel がチャット横に配置されていた場合は位置リセット
  const ftPanel = document.getElementById('ft-panel');
  if (ftPanel && (ftPanel.style.left || ftPanel.style.bottom)) {
    ftPanel.style.left   = '';
    ftPanel.style.right  = '';
    ftPanel.style.bottom = '';
  }
  stopChatListeners();
}

// ===== チャットリスナー =====
export function startChatListeners(username) {
  if (!username) return;
  stopChatListeners();
  subscribeUsersList();

  {
    const poll = async () => {
      try {
        const [dm, grp] = await Promise.all([
          fetchChatRoomsFromSupabase(username, 'dm'),
          fetchChatRoomsFromSupabase(username, 'group'),
        ]);
        state.dmRooms    = dm;
        state.groupRooms = grp;
        if (state.chatPanelOpen) renderChatSidebar();
        updateChatBadge();
      } catch (_) {}
    };
    poll();
    state._dmRoomsUnsubscribe = setInterval(poll, 10000);
  }
  recordListenerStart('chat.dm-rooms', '個別チャット一覧', `dm_rooms:${username}`);

    recordListenerStart('chat.group-rooms', 'グループ一覧', `chat_rooms:${username}`);
}

export function stopChatListeners() {
  if (state._dmRoomsUnsubscribe) { clearInterval(state._dmRoomsUnsubscribe); state._dmRoomsUnsubscribe = null; }
  if (state._roomMsgUnsubscribe) { clearInterval(state._roomMsgUnsubscribe); state._roomMsgUnsubscribe = null; }
  state._groupRoomsUnsubscribe = null;
  state.currentRoomId = null;
  state.currentRoomType = null;
  state.currentRoomMessages = [];
  stopUsersListListener();
  updateChatBadge();
}

// ===== ユーザーリスト監視 =====
export function subscribeUsersList() {
  if (state._usersListUnsub) return;
  if (true) {
    // Supabase: 一度だけ取得（ユーザー一覧は頻繁に変わらない）
    state._usersListUnsub = true; // フラグとして使う
    fetchAllUserAccountsFromSupabase().then(users => {
      state._knownUsernames = new Set(users.map(u => u.username));
      if (state.chatPanelOpen) renderChatSidebar();
      updateChatBadge();
    }).catch(() => {});
  } else {
    recordListenerStart('chat.users-list', 'ユーザー一覧', 'users_list');
    state._usersListUnsub = wrapTrackedListenerUnsubscribe('chat.users-list', onSnapshot(collection(db, 'users_list'), snap => {
      recordListenerSnapshot('chat.users-list', snap.size, 'users_list', snap.docs);
      state._knownUsernames = new Set(snap.docs.map(d => d.id));
      if (state.currentRoomId && state.currentRoomType === 'dm') {
        const room = state.dmRooms.find(r => r.id === state.currentRoomId);
        if (room) {
          const other = (room.members || []).find(m => m !== state.currentUsername);
          if (other && !state._knownUsernames.has(other)) {
            state.currentRoomId = null;
            state.currentRoomType = null;
            const roomView = document.getElementById('chat-room-view');
            if (roomView) roomView.setAttribute('hidden', '');
          }
        }
      }
      if (state.chatPanelOpen) renderChatSidebar();
      updateChatBadge();
    }));
  }
}

export function stopUsersListListener() {
  if (state._usersListUnsub) {
    if (typeof state._usersListUnsub === 'function') state._usersListUnsub();
    state._usersListUnsub = null;
  }
  state._knownUsernames = null;
}

// ===== 既読管理 =====
export async function loadChatReadTimes(username) {
  if (!username) return;
  try {
    if (true) {
      state.chatReadTimes = await fetchChatReadTimesFromSupabase(username);
    } else {
      const snap = await getDoc(doc(db, 'users', username, 'data', 'chat_reads'));
      if (snap.exists()) {
        state.chatReadTimes = {};
        Object.entries(snap.data()).forEach(([roomId, ts]) => {
          state.chatReadTimes[roomId] = ts?.toDate?.() || null;
        });
      }
    }
    chatReadTimesLoadedFor = state.currentUsername || username || '';
    updateChatBadge();
  } catch (_) {}
}

export async function markRoomRead(roomId) {
  state.chatReadTimes[roomId] = new Date();
  updateChatBadge();
  if (state.chatPanelOpen) renderChatSidebar();
  if (!state.currentUsername) return;
  try {
    if (true) {
      await markChatRoomReadInSupabase(state.currentUsername, roomId);
    } else {
      await setDoc(
        doc(db, 'users', state.currentUsername, 'data', 'chat_reads'),
        { [roomId]: serverTimestamp() },
        { merge: true }
      );
    }
  } catch (_) {}
}

export function getRoomUnread(room) {
  if (!room.lastAt || !room.lastSender || room.lastSender === state.currentUsername) return 0;
  const lastAt = typeof room.lastAt === 'string' ? new Date(room.lastAt) : (room.lastAt?.toDate?.() || null);
  if (!lastAt) return 0;
  const readTime = state.chatReadTimes[room.id] || null;
  return (!readTime || lastAt > readTime) ? 1 : 0;
}

export function updateChatBadge() {
  const badge = document.getElementById('chat-unread-badge');
  const fab   = document.getElementById('chat-fab');
  // _knownUsernames でフィルタした DM ルームのみカウント（リスト表示と整合）
  const visibleDm = state._knownUsernames
    ? state.dmRooms.filter(room => {
        const other = (room.members || []).find(m => m !== state.currentUsername);
        return !other || state._knownUsernames.has(other);
      })
    : state.dmRooms;
  const total = [...visibleDm, ...state.groupRooms].reduce((sum, r) => sum + getRoomUnread(r), 0);
  if (badge && fab) {
    if (total > 0) {
      badge.textContent = total > 99 ? '99+' : total;
      badge.hidden = false;
      fab.classList.add('has-unread');
    } else {
      badge.hidden = true;
      fab.classList.remove('has-unread');
    }
  }
  deps.updateLockNotifications?.();
  deps.updateSummaryCards?.();
}

// ===== サイドバータブ切替 =====
export function switchChatSidebarTab(tab) {
  document.getElementById('chat-tab-dm').classList.toggle('active', tab === 'dm');
  document.getElementById('chat-tab-group').classList.toggle('active', tab === 'group');
  document.getElementById('chat-panel-dm').hidden = (tab !== 'dm');
  document.getElementById('chat-panel-group').hidden = (tab !== 'group');
}

// ===== サイドバー描画 =====
export function renderChatSidebar() {
  _renderRoomList('dm');
  _renderRoomList('group');
}

function _renderRoomList(type) {
  const listEl = document.getElementById(type === 'dm' ? 'dm-room-list' : 'group-room-list');
  if (!listEl) return;
  const rooms = type === 'dm' ? state.dmRooms : state.groupRooms;

  let filtered = [...rooms];
  // DM: users_listに存在しないユーザーとのルームを非表示
  if (type === 'dm' && state._knownUsernames) {
    filtered = filtered.filter(room => {
      const other = (room.members || []).find(m => m !== state.currentUsername);
      return !other || state._knownUsernames.has(other);
    });
  }

  if (!filtered.length) {
    listEl.innerHTML = `<div class="chat-room-empty">${type === 'dm'
      ? '上の「＋ 新規チャット」ボタンから<br>話しかけてみましょう'
      : '上の「＋ グループ作成」ボタンから<br>グループを作りましょう'
    }</div>`;
    return;
  }

  const sorted = filtered.sort((a, b) => {
    const ta = a.lastAt ? (typeof a.lastAt === 'string' ? new Date(a.lastAt) : a.lastAt.toDate?.() || new Date(0)) : new Date(0);
    const tb = b.lastAt ? (typeof b.lastAt === 'string' ? new Date(b.lastAt) : b.lastAt.toDate?.() || new Date(0)) : new Date(0);
    return tb - ta;
  });

  listEl.innerHTML = sorted.map(room => {
    const unread = getRoomUnread(room);
    const isActive = room.id === state.currentRoomId;
    const name = type === 'dm'
      ? (room.members || []).find(m => m !== state.currentUsername) || '?'
      : (room.name || 'グループ');
    const lastMsg = room.lastMessage
      ? esc(room.lastMessage).slice(0, 22) + (room.lastMessage.length > 22 ? '…' : '')
      : '';
    const color = getUserAvatarColor(name);
    const initial = name.charAt(0).toUpperCase();
    const unreadHtml = unread > 0 ? `<span class="chat-room-unread">${unread}</span>` : '';
    const deleteBtn = type === 'dm'
      ? `<button class="chat-room-delete-btn" data-room-id="${room.id}" title="個別チャットを削除">🗑</button>`
      : '';
    return `
      <div class="chat-room-item${isActive ? ' active' : ''}" data-room-id="${room.id}" data-room-type="${type}">
        <div class="chat-room-item-avatar" style="background:${color}">${initial}</div>
        <div class="chat-room-item-body">
          <div class="chat-room-item-name">${esc(name)}</div>
          ${lastMsg ? `<div class="chat-room-item-preview">${lastMsg}</div>` : ''}
        </div>
        ${unreadHtml}
        ${deleteBtn}
      </div>`;
  }).join('');

  listEl.querySelectorAll('.chat-room-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.chat-room-delete-btn')) return;
      openRoom(el.dataset.roomId, el.dataset.roomType);
    });
  });
  listEl.querySelectorAll('.chat-room-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDmRoom(btn.dataset.roomId);
    });
  });
}

// ===== ルーム表示 =====
export async function openRoom(roomId, type) {
  if (state._roomMsgUnsubscribe) {
    if (typeof state._roomMsgUnsubscribe === 'function') state._roomMsgUnsubscribe();
    else clearInterval(state._roomMsgUnsubscribe);
    state._roomMsgUnsubscribe = null;
  }
  state.currentRoomId = roomId;
  state.currentRoomType = type;
  state.currentRoomMessages = [];
  // 対応するタブに自動切り替え
  switchChatSidebarTab(type === 'dm' ? 'dm' : 'group');

  document.getElementById('chat-no-room').hidden = true;
  const roomView = document.getElementById('chat-room-view');
  roomView.removeAttribute('hidden');

  const room = type === 'dm'
    ? state.dmRooms.find(r => r.id === roomId)
    : state.groupRooms.find(r => r.id === roomId);

  const titleEl = document.getElementById('chat-room-title');
  const membersEl = document.getElementById('chat-room-members');
  if (room) {
    if (type === 'dm') {
      titleEl.textContent = (room.members || []).find(m => m !== state.currentUsername) || '?';
      membersEl.textContent = '';
    } else {
      titleEl.textContent = room.name || 'グループ';
      membersEl.textContent = (room.members || []).join(' · ');
    }
  }

  const loginReq = document.getElementById('chat-login-required');
  const inputRow = document.getElementById('chat-input-row');
  const fileBtn = document.getElementById('chat-file-btn');
  if (state.currentUsername) {
    loginReq.hidden = true;
    inputRow.hidden = false;
    setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
  } else {
    loginReq.hidden = false;
    inputRow.hidden = true;
    if (fileBtn) fileBtn.hidden = true;
  }

  if (true) {
    const pollMsg = async () => {
      try {
        state.currentRoomMessages = await fetchChatMessagesFromSupabase(roomId, CHAT_MSG_MAX);
        renderChatMessages();
        scrollChatToBottom();
        markRoomRead(roomId);
      } catch (_) {}
    };
    pollMsg();
    state._roomMsgUnsubscribe = setInterval(pollMsg, 5000);
  } else {
    const colRef = type === 'dm'
      ? collection(db, 'dm_rooms', roomId, 'messages')
      : collection(db, 'chat_rooms', roomId, 'messages');
    const msgQ = query(colRef, orderBy('createdAt', 'asc'), limit(CHAT_MSG_MAX));
    state._roomMsgUnsubscribe = onSnapshot(msgQ, snap => {
      state.currentRoomMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderChatMessages();
      scrollChatToBottom();
      markRoomRead(roomId);
    });
  }

  renderChatSidebar();
}

// ===== メッセージ送信 =====
export async function sendChatMessage() {
  if (!state.currentUsername || !state.currentRoomId) return;
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  try {
    if (true) {
      if (state.currentRoomMessages.length >= CHAT_MSG_MAX) {
        await deleteOldestChatMessageInSupabase(state.currentRoomId);
      }
      const lastAt = new Date().toISOString();
      const msg = await addChatMessageInSupabase({
        roomId: state.currentRoomId,
        username: state.currentUsername,
        text,
      });
      if (msg) {
        state.currentRoomMessages = [...state.currentRoomMessages.slice(-(CHAT_MSG_MAX - 1)), msg];
      }
      await updateChatRoomLastInSupabase(state.currentRoomId, {
        lastMessage: text,
        lastAt,
        lastSender: state.currentUsername,
      });
      // ローカル状態に即時反映
      const room = [...state.dmRooms, ...state.groupRooms].find(r => r.id === state.currentRoomId);
      if (room) { room.lastMessage = text; room.lastAt = lastAt; room.lastSender = state.currentUsername; }
      renderChatMessages();
      scrollChatToBottom();
      markRoomRead(state.currentRoomId);
    } else {
      const colRef = state.currentRoomType === 'dm'
        ? collection(db, 'dm_rooms', state.currentRoomId, 'messages')
        : collection(db, 'chat_rooms', state.currentRoomId, 'messages');
      const roomRef = state.currentRoomType === 'dm'
        ? doc(db, 'dm_rooms', state.currentRoomId)
        : doc(db, 'chat_rooms', state.currentRoomId);
      if (state.currentRoomMessages.length >= CHAT_MSG_MAX) {
        const oldest = state.currentRoomMessages[0];
        const oldRef = state.currentRoomType === 'dm'
          ? doc(db, 'dm_rooms', state.currentRoomId, 'messages', oldest.id)
          : doc(db, 'chat_rooms', state.currentRoomId, 'messages', oldest.id);
        await deleteDoc(oldRef);
      }
      await addDoc(colRef, { username: state.currentUsername, text, createdAt: serverTimestamp() });
      await setDoc(roomRef, { lastMessage: text, lastAt: serverTimestamp(), lastSender: state.currentUsername }, { merge: true });
    }
  } catch (err) { console.error('チャット送信エラー:', err); }
}

// ===== メッセージ削除 =====
export async function deleteChatMessage(msgId) {
  if (!state.currentRoomId) return;
  const ok = await deps.confirmDelete?.('このメッセージを削除しますか？');
  if (!ok) return;
  try {
    if (true) {
      await deleteChatMessageInSupabase(msgId);
      state.currentRoomMessages = state.currentRoomMessages.filter(m => m.id !== msgId);
      renderChatMessages();
    } else {
      const msgRef = state.currentRoomType === 'dm'
        ? doc(db, 'dm_rooms', state.currentRoomId, 'messages', msgId)
        : doc(db, 'chat_rooms', state.currentRoomId, 'messages', msgId);
      await deleteDoc(msgRef);
    }
  } catch (err) { console.error('メッセージ削除エラー:', err); }
}

// ===== メッセージ描画 =====
export function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  if (!state.currentRoomMessages.length) {
    container.innerHTML = '<div class="chat-empty">まだメッセージはありません。<br>最初のメッセージを送ってみましょう！</div>';
    return;
  }
  container.innerHTML = '';
  let lastDate = '';
  state.currentRoomMessages.forEach(msg => {
    const isOwn = msg.username === state.currentUsername;
    const ts = msg.createdAt ? (typeof msg.createdAt === 'string' ? new Date(msg.createdAt) : msg.createdAt.toDate?.() || new Date()) : new Date();
    const dateStr = ts.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
    const timeStr = ts.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    if (dateStr !== lastDate) {
      const sep = document.createElement('div');
      sep.className = 'chat-date-sep';
      sep.textContent = dateStr;
      container.appendChild(sep);
      lastDate = dateStr;
    }
    const color = getUserAvatarColor(msg.username);
    const initial = msg.username.charAt(0).toUpperCase();
    const el = document.createElement('div');
    el.className = `chat-msg${isOwn ? ' chat-msg--own' : ''}`;

    // ===== テキストバブル =====
    if (msg.type === 'file') return; // 旧形式は無視
    el.innerHTML = `
      ${!isOwn ? `<div class="chat-avatar" style="background:${color}">${initial}</div>` : ''}
      <div class="chat-msg-body">
        ${!isOwn ? `<div class="chat-msg-name">${esc(msg.username)}</div>` : ''}
        <div class="chat-bubble">
          ${esc(msg.text)}
          ${isOwn ? `<button class="chat-msg-delete" data-id="${msg.id}" title="削除"><i class="fa-solid fa-trash-can"></i></button>` : ''}
        </div>
        <div class="chat-msg-time">${timeStr}</div>
      </div>
      ${isOwn ? `<div class="chat-avatar" style="background:${color}">${initial}</div>` : ''}
    `;
    if (isOwn) {
      el.querySelector('.chat-msg-delete').addEventListener('click', () => deleteChatMessage(msg.id));
    }
    container.appendChild(el);
  });
}

export function scrollChatToBottom() {
  const c = document.getElementById('chat-messages');
  if (c) c.scrollTop = c.scrollHeight;
}

// ===== 個別チャット作成モーダル =====
export async function openNewDmModal() {
  if (!state.currentUsername) { showToast('チャットするにはユーザーネームを設定してください。', 'warning'); return; }
  const modal = document.getElementById('new-dm-modal');
  modal.classList.add('visible');
  document.getElementById('new-dm-search').value = '';
  await loadUsersForChatPicker('new-dm-user-list', 'new-dm-search', async (name) => {
    modal.classList.remove('visible');
    await openOrCreateDm(name);
  }, true);
}

export async function deleteDmRoom(roomId) {
  if (!state.currentUsername || !roomId) return;
  if (!await showConfirm('このチャットを削除しますか？（自分の一覧からのみ消えます）', { danger: true })) return;
  try {
    if (true) {
      const room = state.dmRooms.find(r => r.id === roomId);
      await removeSelfFromDmRoomInSupabase(roomId, state.currentUsername, room?.members || []);
      state.dmRooms = state.dmRooms.filter(r => r.id !== roomId);
    } else {
      const roomRef = doc(db, 'dm_rooms', roomId);
      await updateDoc(roomRef, { members: arrayRemove(state.currentUsername) });
    }
    if (state.currentRoomId === roomId) {
      state.currentRoomId = null;
      state.currentRoomType = null;
      if (true) {
        if (state._roomMsgUnsubscribe) { clearInterval(state._roomMsgUnsubscribe); state._roomMsgUnsubscribe = null; }
      } else {
        if (state._roomMsgUnsubscribe) { state._roomMsgUnsubscribe(); state._roomMsgUnsubscribe = null; }
      }
      document.getElementById('chat-no-room').hidden = false;
      const roomView = document.getElementById('chat-room-view');
      if (roomView) roomView.setAttribute('hidden', '');
    }
    if (state.chatPanelOpen) renderChatSidebar();
    updateChatBadge();
  } catch (e) {
    console.error('個別チャット削除失敗:', e);
    showToast('削除に失敗しました', 'error');
  }
}

export async function openOrCreateDm(targetUser) {
  if (!state.currentUsername || !targetUser) return;
  const existingRoom = state.dmRooms.find(r =>
    Array.isArray(r.members) &&
    r.members.includes(state.currentUsername) &&
    r.members.includes(targetUser)
  );
  let roomId;
  if (existingRoom) {
    roomId = existingRoom.id;
  } else {
    roomId = getDmRoomId(state.currentUsername, targetUser);
    if (true) {
      const existing = await getChatRoomFromSupabase(roomId);
      if (!existing) {
        await upsertDmRoomInSupabase(roomId, {
          members: [state.currentUsername, targetUser].sort(),
          createdBy: state.currentUsername,
          lastMessage: '',
          lastAt: null,
          lastSender: '',
        });
      } else {
        // どちらかが削除していた場合は再追加
        const members = [...new Set([...existing.members, state.currentUsername, targetUser])];
        await ensureDmMembersInSupabase(roomId, members);
      }
    } else {
      const roomRef = doc(db, 'dm_rooms', roomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        await setDoc(roomRef, {
          members: [state.currentUsername, targetUser].sort(),
          createdAt: serverTimestamp(),
          lastMessage: '',
          lastAt: null,
          lastSender: ''
        });
      } else {
        await updateDoc(roomRef, { members: arrayUnion(state.currentUsername, targetUser) });
      }
    }
  }
  if (!state.chatPanelOpen) {
    await openChatPanel();
  }
  await openRoom(roomId, 'dm');
}

// ===== グループ作成モーダル =====
let _newGroupSelected = [];

export async function openNewGroupModal() {
  if (!state.currentUsername) { showToast('チャットするにはユーザーネームを設定してください。', 'warning'); return; }
  _newGroupSelected = [];
  document.getElementById('new-group-name').value = '';
  document.getElementById('new-group-member-search').value = '';
  renderNewGroupSelected();
  document.getElementById('new-group-modal').classList.add('visible');
  await loadUsersForChatPicker('new-group-member-list', 'new-group-member-search', (name) => {
    if (!_newGroupSelected.includes(name)) {
      _newGroupSelected.push(name);
      renderNewGroupSelected();
    }
  }, false);
}

export function renderNewGroupSelected() {
  const el = document.getElementById('new-group-selected');
  if (!el) return;
  if (!_newGroupSelected.length) {
    el.innerHTML = '<span class="group-no-member">まだ選択されていません</span>';
    return;
  }
  el.innerHTML = _newGroupSelected.map(name =>
    `<span class="group-member-chip">${esc(name)}<button class="group-chip-rm" data-name="${esc(name)}">×</button></span>`
  ).join('');
  el.querySelectorAll('.group-chip-rm').forEach(btn => {
    btn.addEventListener('click', () => {
      _newGroupSelected = _newGroupSelected.filter(m => m !== btn.dataset.name);
      renderNewGroupSelected();
    });
  });
}

export async function createGroupRoom() {
  const name = document.getElementById('new-group-name').value.trim();
  if (!name) { document.getElementById('new-group-name').focus(); return; }
  if (!_newGroupSelected.length) { showToast('メンバーを1人以上選んでください。', 'warning'); return; }
  const members = [...new Set([state.currentUsername, ..._newGroupSelected])];
  try {
    let roomId;
    if (true) {
      roomId = await createGroupRoomInSupabase({
        name,
        members,
        createdBy: state.currentUsername,
      });
    } else {
      const roomRef = await addDoc(collection(db, 'chat_rooms'), {
        name, members, createdBy: state.currentUsername,
        createdAt: serverTimestamp(), lastMessage: '', lastAt: null, lastSender: ''
      });
      roomId = roomRef.id;
    }
    document.getElementById('new-group-modal').classList.remove('visible');
    if (!state.chatPanelOpen) {
      await openChatPanel();
    }
    await openRoom(roomId, 'group');
  } catch (err) { console.error('グループ作成エラー:', err); showToast('作成に失敗しました。', 'error'); }
}

// ===== ユーザーピッカー（個別チャット/グループ共通）=====
export async function loadUsersForChatPicker(listElId, searchElId, onSelect, excludeSelf) {
  const listEl = document.getElementById(listElId);
  if (!listEl) return;
  listEl.innerHTML = '<div class="new-dm-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>';
  let users = [];
  try {
    if (true) {
      const accounts = await fetchAllUserAccountsFromSupabase();
      users = accounts.map(a => a.username);
    } else {
      const snap = await getDocs(collection(db, 'users_list'));
      recordGetDocsRead('chat.user-picker', 'ユーザーピッカー', 'users_list', snap.size, snap.docs);
      users = snap.docs.map(d => d.id);
    }
    if (excludeSelf) users = users.filter(u => u !== state.currentUsername);
  } catch (_) {
    listEl.innerHTML = '<div class="new-dm-empty">読み込み失敗</div>';
    return;
  }
  const searchEl = document.getElementById(searchElId);
  const render = (filter = '') => {
    const list = filter ? users.filter(u => u.toLowerCase().includes(filter.toLowerCase())) : users;
    if (!list.length) {
      listEl.innerHTML = '<div class="new-dm-empty">ユーザーが見つかりません</div>';
      return;
    }
    listEl.innerHTML = list.map(name => {
      const color = getUserAvatarColor(name);
      const initial = name.charAt(0).toUpperCase();
      return `<div class="new-dm-user-item" data-name="${esc(name)}">
        <div class="chat-avatar" style="background:${color};width:30px;height:30px;font-size:0.75rem">${initial}</div>
        <span>${esc(name)}</span>
      </div>`;
    }).join('');
    listEl.querySelectorAll('.new-dm-user-item').forEach(el => {
      el.addEventListener('click', () => onSelect(el.dataset.name));
    });
  };
  render();
  if (searchEl) {
    if (searchEl._chatPickerHandler) searchEl.removeEventListener('input', searchEl._chatPickerHandler);
    searchEl._chatPickerHandler = e => render(e.target.value);
    searchEl.addEventListener('input', searchEl._chatPickerHandler);
  }
}
