// ========== ファイル転送モジュール (P2P + Drive シェア) ==========

import { db, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, collection, query, where, orderBy, serverTimestamp, onSnapshot, arrayUnion } from './config.js';
import { state, RTC_CONFIG, FILE_CHUNK_SIZE } from './state.js';
import { esc, getUserAvatarColor } from './utils.js';

// 他モジュールの関数を遅延注入するための依存オブジェクト
export const deps = {};

// ===== ユーティリティ =====

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024)             return bytes + ' B';
  if (bytes < 1024 * 1024)      return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

export function getFileIcon(mimeType) {
  if (!mimeType) return 'fa-file';
  if (mimeType.startsWith('image/')) return 'fa-file-image';
  if (mimeType.startsWith('video/')) return 'fa-file-video';
  if (mimeType.startsWith('audio/')) return 'fa-file-audio';
  if (mimeType.includes('pdf'))      return 'fa-file-pdf';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word';
  if (mimeType.includes('excel') || mimeType.includes('sheet'))   return 'fa-file-excel';
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) return 'fa-file-zipper';
  if (mimeType.startsWith('text/')) return 'fa-file-lines';
  return 'fa-file';
}

export function updateFileProgressUI(sessionId, pct) {
  const fill  = document.querySelector(`.ft-progress-fill[data-session="${sessionId}"]`);
  const label = document.querySelector(`.ft-pct[data-session="${sessionId}"]`);
  if (fill)  fill.style.width = Math.min(100, pct).toFixed(1) + '%';
  if (label) label.textContent = Math.round(Math.min(100, pct)) + '%';
}

export async function cleanupP2p(sessionId) {
  const conn = state._p2pConnections[sessionId];
  if (conn) {
    try { if (conn.unsub) conn.unsub(); } catch (_) {}
    try { if (conn.dc) conn.dc.close(); } catch (_) {}
    try { if (conn.pc) conn.pc.close(); } catch (_) {}
    delete state._p2pConnections[sessionId];
  }
  delete state._sendProgress[sessionId];
  delete state._receiveProgress[sessionId];
  try { await deleteDoc(doc(db, 'p2p_signals', sessionId)); } catch (_) {}
}

export async function sendFileChunks(dc, file, sessionId) {
  const buffer = await file.arrayBuffer();
  const total  = buffer.byteLength;
  // まずメタ情報を送信
  dc.send(JSON.stringify({ type: 'meta', totalSize: total, fileName: file.name, fileType: file.type || 'application/octet-stream' }));
  let sent = 0;
  const sendNext = () => {
    while (sent < total) {
      if (dc.bufferedAmount > FILE_CHUNK_SIZE * 16) {
        dc.bufferedAmountLowThreshold = FILE_CHUNK_SIZE * 4;
        dc.onbufferedamountlow = sendNext;
        return;
      }
      const end   = Math.min(sent + FILE_CHUNK_SIZE, total);
      dc.send(buffer.slice(sent, end));
      sent = end;
      const pct = (sent / total) * 100;
      state._sendProgress[sessionId] = pct;
      updateFileProgressUI(sessionId, pct);
    }
    dc.onbufferedamountlow = null;
    state._sendProgress[sessionId] = 100;
    updateFileProgressUI(sessionId, 100);
  };
  sendNext();
}

// ===== ファイル転送パネル UI =====

export function openFileTransferPanel() {
  state._ftPanelOpen = true;
  const panel = document.getElementById('ft-panel');
  panel.removeAttribute('hidden');

  // チャットパネルが開いているときは左横に動的配置
  const chatPanel = document.getElementById('chat-panel');
  if (chatPanel && chatPanel.classList.contains('open')) {
    const chatRect = chatPanel.getBoundingClientRect();
    const gap = 8;
    const panelWidth = 340;
    const leftEdge = chatRect.left - gap - panelWidth;
    if (leftEdge >= 8) {
      // 左に十分なスペースがある → チャットパネルの左横に配置
      panel.style.right  = 'auto';
      panel.style.left   = leftEdge + 'px';
      panel.style.bottom = (window.innerHeight - chatRect.bottom) + 'px';
    } else {
      // スペース不足時はチャットパネルの上に重ねる（フォールバック）
      panel.style.right  = 'auto';
      panel.style.left   = Math.max(8, chatRect.left) + 'px';
      panel.style.bottom = (window.innerHeight - chatRect.top + gap) + 'px';
    }
  } else {
    // チャットパネルが閉じている場合はデフォルト位置（CSS）
    panel.style.left   = '';
    panel.style.right  = '';
    panel.style.bottom = '';
  }

  setTimeout(() => panel.classList.add('open'), 10);
  // タブ状態を復元
  switchFtTab(state._ftCurrentTab);
  renderFtPanel();
  startFtListener();
}

export function closeFileTransferPanel() {
  state._ftPanelOpen = false;
  const panel = document.getElementById('ft-panel');
  panel.classList.remove('open');
  setTimeout(() => panel.setAttribute('hidden', ''), 200);
}

export function updateFtBadge() {
  const badge = document.getElementById('ft-badge');
  const fab   = document.getElementById('ft-fab');
  if (!badge || !fab) return;
  const p2pCount   = state._ftIncoming.filter(s => s.status === 'pending').length;
  const driveCount = state._driveIncoming.filter(s => s.status === 'pending').length;
  const count = p2pCount + driveCount;
  // Drive タブバッジ
  const driveBadge = document.getElementById('ft-drive-tab-badge');
  if (driveBadge) {
    driveBadge.hidden = driveCount === 0;
    driveBadge.textContent = driveCount > 99 ? '99+' : driveCount;
  }
  if (count > 0) {
    badge.textContent = count;
    badge.hidden = false;
    fab.classList.add('has-pending');
  } else {
    badge.hidden = true;
    fab.classList.remove('has-pending');
  }
  deps.updateLockNotifications?.();
}

export function renderFtPanel() {
  if (!state._ftPanelOpen) return;
  const loginEl    = document.getElementById('ft-login-required');
  const contentEl  = document.getElementById('ft-content');
  if (!state.currentUsername) {
    if (loginEl) loginEl.hidden = false;
    if (contentEl) contentEl.hidden = true;
    return;
  }
  if (loginEl) loginEl.hidden = true;
  if (contentEl) contentEl.hidden = false;

  const incomingEl    = document.getElementById('ft-incoming-list');
  const outgoingEl    = document.getElementById('ft-outgoing-list');
  const incomingTitle = document.getElementById('ft-incoming-title');
  const outgoingTitle = document.getElementById('ft-outgoing-title');
  const emptyEl       = document.getElementById('ft-empty');

  // 受信待ち（pending のみ表示）
  const pending = state._ftIncoming.filter(s => s.status === 'pending');
  if (incomingTitle) incomingTitle.hidden = pending.length === 0;
  if (incomingEl) {
    incomingEl.innerHTML = pending.map(s => {
      const icon = getFileIcon(s.fileType || '');
      return `<div class="ft-item">
        <div class="ft-item-top">
          <i class="fa-solid ${icon} ft-item-icon"></i>
          <div class="ft-item-meta">
            <div class="ft-item-name" title="${esc(s.fileName)}">${esc(s.fileName)}</div>
            <div class="ft-item-size">${formatFileSize(s.fileSize)} · 送信者: ${esc(s.from)}</div>
          </div>
        </div>
        <div class="ft-item-actions">
          <button class="btn-ft-accept" data-sid="${s.id}">受け取る</button>
          <button class="btn-ft-reject" data-sid="${s.id}">断る</button>
        </div>
      </div>`;
    }).join('');
    incomingEl.querySelectorAll('.btn-ft-accept').forEach(btn =>
      btn.addEventListener('click', () => acceptFtTransfer(btn.dataset.sid)));
    incomingEl.querySelectorAll('.btn-ft-reject').forEach(btn =>
      btn.addEventListener('click', () => rejectFtTransfer(btn.dataset.sid)));
  }

  // 送信中・受信完了
  const active = state._ftOutgoing.filter(s => ['pending','accepted','done'].includes(s.status));
  if (outgoingTitle) outgoingTitle.hidden = active.length === 0;
  if (outgoingEl) {
    outgoingEl.innerHTML = active.map(s => {
      const icon = getFileIcon(s.fileType || '');
      const pct  = state._sendProgress[s.sessionId] ?? 0;
      const received = state._receivedFiles[s.sessionId];
      let statusHtml = '';
      if (s.status === 'done' || received) {
        statusHtml = `<div class="ft-item-status done">✓ 転送完了</div>`;
        if (received) {
          statusHtml += `<div class="ft-item-actions">
            <a class="btn-ft-download" href="${received.url}" download="${esc(received.fileName)}">ダウンロード</a>
          </div>`;
        }
      } else if (s.status === 'rejected') {
        statusHtml = `<div class="ft-item-status rejected">辞退されました</div>`;
      } else if (s.status === 'accepted' || pct > 0) {
        statusHtml = `<div class="ft-progress-bar">
          <div class="ft-progress-fill" data-session="${s.sessionId}" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <div class="ft-item-status"><span class="ft-pct" data-session="${s.sessionId}">${Math.round(pct)}%</span></div>`;
      } else {
        statusHtml = `<div class="ft-item-status">相手の受け取り待ち…</div>`;
      }
      return `<div class="ft-item">
        <div class="ft-item-top">
          <i class="fa-solid ${icon} ft-item-icon"></i>
          <div class="ft-item-meta">
            <div class="ft-item-name" title="${esc(s.fileName)}">${esc(s.fileName)}</div>
            <div class="ft-item-size">${formatFileSize(s.fileSize)} → ${esc(s.to)}</div>
          </div>
        </div>
        ${statusHtml}
      </div>`;
    }).join('');
  }

  if (emptyEl) emptyEl.hidden = (pending.length + active.length) > 0;
}

export function startFtListener() {
  if (!state.currentUsername || state._ftIncomingSub) return;
  const q = query(collection(db, 'p2p_signals'), where('to', '==', state.currentUsername));
  state._ftIncomingSub = onSnapshot(q, snap => {
    state._ftIncoming = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateFtBadge();
    renderFtPanel();
  });
}

export function stopFtListener() {
  if (state._ftIncomingSub) { state._ftIncomingSub(); state._ftIncomingSub = null; }
  state._ftIncoming = [];
  state._ftOutgoing = [];
  updateFtBadge();
}

// ========== Drive シェア ==========

// --- 自分のDriveリンク 読み書き ---
export async function loadMyDriveUrl(username) {
  if (!username) return;
  try {
    const snap = await getDoc(doc(db, 'users', username, 'data', 'drive_link'));
    state._myDriveUrl = snap.exists() ? (snap.data().url || '') : '';
  } catch (_) { state._myDriveUrl = ''; }
}

export async function saveMyDriveUrl(url) {
  if (!state.currentUsername) return;
  state._myDriveUrl = url;
  await setDoc(doc(db, 'users', state.currentUsername, 'data', 'drive_link'), { url, updatedAt: serverTimestamp() });
}

// --- Firestoreリスナー ---
export function startDriveListeners(username) {
  if (!username) return;
  // 受信リスナー
  if (!state._driveIncomingSub) {
    const qIn = query(collection(db, 'drive_shares'), where('to', '==', username));
    state._driveIncomingSub = onSnapshot(qIn, snap => {
      // 受信した Drive 通知の送信者を「相手の Drive URL」で連絡先に自動保存
      // → これにより「開く」ボタンで相手のフォルダが開けるようになる
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.from && data.driveUrl && data.from !== state.currentUsername) {
            saveDriveContact(data.from, data.driveUrl);
          }
        }
      });
      state._driveIncoming = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateFtBadge();
      renderDrivePanel();
    });
  }
  // 送信リスナー
  if (!state._driveOutgoingSub) {
    const qOut = query(collection(db, 'drive_shares'), where('from', '==', username));
    state._driveOutgoingSub = onSnapshot(qOut, snap => {
      state._driveOutgoing = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderDrivePanel();
    });
  }
}

export function stopDriveListeners() {
  if (state._driveIncomingSub) { state._driveIncomingSub(); state._driveIncomingSub = null; }
  if (state._driveOutgoingSub) { state._driveOutgoingSub(); state._driveOutgoingSub = null; }
  state._driveIncoming = [];
  state._driveOutgoing = [];
  state._driveContacts = {};
}

// --- Drive 連絡先 読み込み ---
export async function loadDriveContacts(username) {
  if (!username) return;
  try {
    const snap = await getDoc(doc(db, 'users', username, 'data', 'drive_contacts'));
    state._driveContacts = snap.exists() ? (snap.data().contacts || {}) : {};
  } catch (_) { state._driveContacts = {}; }
}

// --- Drive 連絡先 保存（追加・更新） ---
export async function saveDriveContact(contactUsername, url) {
  if (!state.currentUsername || !contactUsername || !url) return;
  state._driveContacts[contactUsername] = { url, savedAt: Date.now() };
  try {
    await setDoc(
      doc(db, 'users', state.currentUsername, 'data', 'drive_contacts'),
      { contacts: state._driveContacts, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (err) { console.error('Drive連絡先保存エラー:', err); }
}

// --- Drive 連絡先 削除 ---
export async function deleteDriveContact(contactUsername) {
  if (!state.currentUsername || !contactUsername) return;
  delete state._driveContacts[contactUsername];
  try {
    await setDoc(
      doc(db, 'users', state.currentUsername, 'data', 'drive_contacts'),
      { contacts: state._driveContacts, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (err) { console.error('Drive連絡先削除エラー:', err); }
  renderDrivePanel();
}

// --- タブ切り替え ---
export function switchFtTab(tab) {
  state._ftCurrentTab = tab;
  document.querySelectorAll('.ft-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('ft-p2p-area').hidden   = (tab !== 'p2p');
  document.getElementById('ft-drive-area').hidden = (tab !== 'drive');
  if (tab === 'drive') renderDrivePanel();
}

// --- Drive パネル描画 ---
export function renderDrivePanel() {
  if (!state._ftPanelOpen || state._ftCurrentTab !== 'drive') return;
  const incomingEl    = document.getElementById('ft-drive-incoming-list');
  const outgoingEl    = document.getElementById('ft-drive-outgoing-list');
  const incomingTitle = document.getElementById('ft-drive-incoming-title');
  const outgoingTitle = document.getElementById('ft-drive-outgoing-title');
  const emptyEl       = document.getElementById('ft-drive-empty');
  const contactsEl    = document.getElementById('ft-contacts-list');
  const contactsTitle = document.getElementById('ft-contacts-title');
  if (!incomingEl) return;

  // ===== 登録済み連絡先 =====
  const contacts = Object.entries(state._driveContacts)
    .sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));
  if (contactsTitle) contactsTitle.hidden = contacts.length === 0;
  if (contactsEl) {
    contactsEl.innerHTML = contacts.map(([name, info]) => {
      const color = getUserAvatarColor(name);
      const initial = name.charAt(0).toUpperCase();
      const shortUrl = info.url.replace(/^https?:\/\/drive\.google\.com\//, '').slice(0, 30) + '…';
      return `<div class="ft-contact-item">
        <div class="ft-contact-avatar" style="background:${color}">${initial}</div>
        <div class="ft-contact-name" title="${esc(name)}">${esc(name)}</div>
        <button class="btn-ft-contact-send" data-name="${esc(name)}" data-url="${esc(info.url)}" title="${esc(name)}のDriveフォルダを開く">
          <i class="fa-solid fa-folder-open"></i> 開く
        </button>
        <button class="btn-ft-contact-del" data-name="${esc(name)}" title="連絡先を削除">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>`;
    }).join('');
    contactsEl.querySelectorAll('.btn-ft-contact-send').forEach(btn => {
      btn.addEventListener('click', () => window.open(btn.dataset.url, '_blank'));
    });
    contactsEl.querySelectorAll('.btn-ft-contact-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm(`「${btn.dataset.name}」の登録リンクを削除しますか？`)) {
          await deleteDriveContact(btn.dataset.name);
        }
      });
    });
  }

  // 受信（pending のみ表示）
  const pending = state._driveIncoming.filter(s => s.status === 'pending');
  if (incomingTitle) incomingTitle.hidden = pending.length === 0;
  incomingEl.innerHTML = pending.map(s => {
    const ts = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
    const msg = s.message ? `<div class="ft-drive-item-msg">${esc(s.message)}</div>` : '';
    return `<div class="ft-drive-item">
      <div class="ft-drive-item-header">
        <i class="fa-brands fa-google-drive ft-drive-item-icon"></i>
        <div class="ft-drive-item-meta">
          <div class="ft-drive-item-from"><i class="fa-solid fa-arrow-right" style="font-size:0.65rem;opacity:0.5"></i> ${esc(s.from)} から</div>
          <div class="ft-drive-item-time">${ts}</div>
        </div>
      </div>
      ${msg}
      <div class="ft-drive-item-actions">
        <button class="btn-ft-drive-open" data-id="${s.id}" data-url="${esc(s.driveUrl)}">
          <i class="fa-brands fa-google-drive"></i> Driveを開く
        </button>
        <button class="btn-ft-drive-dismiss" data-id="${s.id}" title="消去">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>`;
  }).join('');
  incomingEl.querySelectorAll('.btn-ft-drive-open').forEach(btn =>
    btn.addEventListener('click', () => openDriveShare(btn.dataset.id, btn.dataset.url)));
  incomingEl.querySelectorAll('.btn-ft-drive-dismiss').forEach(btn =>
    btn.addEventListener('click', () => dismissDriveShare(btn.dataset.id)));

  // 送信済み（直近10件）
  const sent = [...state._driveOutgoing]
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 10);
  if (outgoingTitle) outgoingTitle.hidden = sent.length === 0;
  outgoingEl.innerHTML = sent.map(s => {
    const ts = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
    const statusHtml = s.status === 'viewed'
      ? `<div class="ft-drive-status-viewed"><i class="fa-solid fa-check-double"></i> ${esc(s.to)} が確認済み</div>`
      : `<div class="ft-drive-status-pending">→ ${esc(s.to)} 未確認</div>`;
    return `<div class="ft-drive-item">
      <div class="ft-drive-item-header">
        <i class="fa-brands fa-google-drive ft-drive-item-icon"></i>
        <div class="ft-drive-item-meta">
          <div class="ft-drive-item-from">→ ${esc(s.to)}</div>
          <div class="ft-drive-item-time">${ts}</div>
        </div>
        <button class="btn-ft-drive-dismiss" data-id="${s.id}" title="消去" style="margin-left:auto">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      ${statusHtml}
    </div>`;
  }).join('');
  outgoingEl.querySelectorAll('.btn-ft-drive-dismiss').forEach(btn =>
    btn.addEventListener('click', () => dismissDriveShare(btn.dataset.id)));

  if (emptyEl) emptyEl.hidden = (pending.length + sent.length) > 0;

  // 登録済みDriveリンクがあればボタンラベルを更新
  const settingBtn = document.getElementById('ft-my-drive-link-btn');
  if (settingBtn) {
    settingBtn.innerHTML = state._myDriveUrl
      ? `<i class="fa-solid fa-check" style="color:#10b981"></i> Driveリンク登録済み（変更）`
      : `<i class="fa-solid fa-gear"></i> 自分のDriveリンクを登録`;
  }

  // 自分のDriveリンク表示エリアを更新
  const myDisplayEl  = document.getElementById('ft-my-drive-display');
  const myDisplayUrl = document.getElementById('ft-my-drive-display-url');
  const myDisplayCopy= document.getElementById('ft-my-drive-display-copy');
  const myDisplayOpen= document.getElementById('ft-my-drive-display-open');
  if (myDisplayEl) {
    if (state._myDriveUrl) {
      myDisplayEl.hidden = false;
      if (myDisplayUrl) myDisplayUrl.textContent = state._myDriveUrl;
      // コピーボタン（毎回付け直して重複防止）
      if (myDisplayCopy) {
        const newCopy = myDisplayCopy.cloneNode(true);
        myDisplayCopy.replaceWith(newCopy);
        newCopy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(state._myDriveUrl);
            newCopy.innerHTML = '<i class="fa-solid fa-check"></i>';
            setTimeout(() => { newCopy.innerHTML = '<i class="fa-solid fa-copy"></i>'; }, 1500);
          } catch (_) { alert(state._myDriveUrl); }
        });
      }
      // 開くボタン
      if (myDisplayOpen) {
        const newOpen = myDisplayOpen.cloneNode(true);
        myDisplayOpen.replaceWith(newOpen);
        newOpen.addEventListener('click', () => {
          window.open(state._myDriveUrl, '_blank', 'noopener,noreferrer');
        });
      }
    } else {
      myDisplayEl.hidden = true;
    }
  }
}

// --- Driveを開く（既読にする） ---
export async function openDriveShare(id, url) {
  if (!url) return;
  try {
    await updateDoc(doc(db, 'drive_shares', id), { status: 'viewed', viewedAt: serverTimestamp() });
  } catch (_) {}
  window.open(url, '_blank', 'noopener,noreferrer');
}

// --- 消去 ---
export async function dismissDriveShare(id) {
  try { await deleteDoc(doc(db, 'drive_shares', id)); } catch (_) {}
}

// --- Drive送信モーダル ---
// prefillUser / prefillUrl: 連絡先クイック送信ボタンから呼ぶとき指定
export async function openDriveSendModal(prefillUser = null, prefillUrl = null) {
  if (!state.currentUsername) { alert('ユーザーネームを設定してください'); return; }
  state._ftDriveSelectedUser = prefillUser || null;

  // モーダルを初期化
  document.getElementById('ft-drive-user-search').value = '';
  document.getElementById('ft-drive-message').value = '';
  document.getElementById('ft-drive-send-modal').classList.add('visible');

  // === 登録済み連絡先クイック選択エリアを構築 ===
  const contacts = Object.entries(state._driveContacts)
    .sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));
  const quickArea = document.getElementById('ft-drive-quick-contacts');
  const quickList = document.getElementById('ft-drive-quick-list');
  // 連絡先がある、または自分のDriveリンクが登録済みなら表示
  const showQuick = contacts.length > 0 || !!state._myDriveUrl;
  if (showQuick && quickArea && quickList) {
    // 連絡先がなく自分のURLのみの場合は「自分のURLをURLとして使用」アイテムを追加
    const ownItem = (state._myDriveUrl && contacts.length === 0)
      ? `<div class="ft-drive-quick-item" data-name="" data-url="${esc(state._myDriveUrl)}" style="border-color:rgba(52,168,83,0.35)">
          <div style="width:24px;height:24px;border-radius:50%;background:#34a853;display:flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:700;color:#fff;flex-shrink:0">自</div>
          <div style="flex:1;min-width:0">
            <div class="ft-drive-quick-item-name">自分のDriveリンクをURLとして使用</div>
            <div class="ft-drive-quick-item-url">${esc(state._myDriveUrl.length > 38 ? state._myDriveUrl.slice(0, 35) + '…' : state._myDriveUrl)}</div>
          </div>
          <i class="fa-brands fa-google-drive" style="color:#34a853;font-size:0.9rem;flex-shrink:0"></i>
        </div>`
      : '';
    quickList.innerHTML = ownItem + contacts.map(([name, info]) => {
      const color = getUserAvatarColor(name);
      const initial = name.charAt(0).toUpperCase();
      const shortUrl = info.url.length > 38 ? info.url.slice(0, 35) + '…' : info.url;
      return `<div class="ft-drive-quick-item" data-name="${esc(name)}" data-url="${esc(info.url)}">
        <div style="width:24px;height:24px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:700;color:#fff;flex-shrink:0">${initial}</div>
        <div style="flex:1;min-width:0">
          <div class="ft-drive-quick-item-name">${esc(name)}</div>
          <div class="ft-drive-quick-item-url">${esc(shortUrl)}</div>
        </div>
        <i class="fa-brands fa-google-drive" style="color:#34a853;font-size:0.9rem;flex-shrink:0"></i>
      </div>`;
    }).join('');
    quickArea.hidden = false;
    // クイック選択クリック時：フォームに自動入力して選択状態に
    quickList.querySelectorAll('.ft-drive-quick-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.name) {
          // 通常連絡先：名前＋URLをセット
          selectDriveSendTarget(item.dataset.name, item.dataset.url);
        } else {
          // 自分のURL候補：URLフィールドのみセット（名前は検索から選ぶ）
          const urlInput = document.getElementById('ft-drive-url-input');
          if (urlInput) urlInput.value = item.dataset.url;
        }
      });
    });
  } else {
    if (quickArea) quickArea.hidden = true;
  }

  // prefill が指定されている場合（クイック送信ボタンから）は即選択状態に
  if (prefillUser) {
    const url = prefillUrl || state._driveContacts[prefillUser]?.url || state._myDriveUrl;
    selectDriveSendTarget(prefillUser, url);
  } else {
    document.getElementById('ft-drive-form-group').hidden = true;
    document.getElementById('ft-drive-confirm-btn').hidden = true;
  }

  await deps.loadUsersForChatPicker?.('ft-drive-user-list', 'ft-drive-user-search', name => {
    const savedUrl = state._driveContacts[name]?.url || state._myDriveUrl;
    selectDriveSendTarget(name, savedUrl);
  }, true);
}

// 送信先決定時の共通処理（クイック選択 or 検索どちらからでも呼ばれる）
// url 引数は互換のため残すが使用せず、常に自分の Drive URL を入力する
export function selectDriveSendTarget(name, _url) {
  state._ftDriveSelectedUser = name;
  const urlInput   = document.getElementById('ft-drive-url-input');
  const badge      = document.getElementById('ft-drive-saved-badge');
  const formGroup  = document.getElementById('ft-drive-form-group');
  const confirmBtn = document.getElementById('ft-drive-confirm-btn');
  // 相手がすでに自分の URL を受け取ったことがあるなら「受信済み」バッジを表示
  const hasSaved   = !!state._driveContacts[name];

  urlInput.value = state._myDriveUrl || '';  // 送るのは常に自分の Drive URL
  if (badge)  badge.hidden = !hasSaved;
  formGroup.hidden  = false;
  confirmBtn.hidden = false;
}

export function closeDriveSendModal() {
  document.getElementById('ft-drive-send-modal').classList.remove('visible');
  state._ftDriveSelectedUser = null;
}

export async function confirmDriveSend() {
  const url = document.getElementById('ft-drive-url-input').value.trim();
  const msg = document.getElementById('ft-drive-message').value.trim();
  if (!state._ftDriveSelectedUser) { alert('送信先を選択してください'); return; }
  if (!url) {
    // 自分の Drive URL が未設定なら登録を促す
    alert('自分のDriveフォルダURLを設定してください。\n「自分のDriveリンクを登録」ボタンから設定できます。');
    return;
  }
  if (!url.startsWith('http')) { alert('正しいURLを入力してください'); return; }
  const btn = document.getElementById('ft-drive-confirm-btn');
  btn.disabled = true;
  btn.textContent = '送信中…';
  try {
    await addDoc(collection(db, 'drive_shares'), {
      from:      state.currentUsername,
      to:        state._ftDriveSelectedUser,
      driveUrl:  url,
      message:   msg,
      status:    'pending',
      createdAt: serverTimestamp(),
      viewedAt:  null,
    });
    // 自分のDriveリンク未登録なら今回のURLで初期設定
    if (!state._myDriveUrl && url) saveMyDriveUrl(url);
    // 注意: 連絡先への保存は「相手から受信したとき」に自動保存される
    //       (startDriveListeners の onSnapshot 内で saveDriveContact を呼ぶ)
    closeDriveSendModal();
    switchFtTab('drive');
    renderDrivePanel();
  } catch (err) {
    console.error('Drive送信エラー:', err);
    alert('送信に失敗しました');
  } finally {
    btn.disabled = false;
    btn.textContent = '送信する';
  }
}

// --- 自分のDriveリンク登録モーダル ---
export function openMyDriveLinkModal() {
  document.getElementById('ft-my-drive-url').value = state._myDriveUrl;
  document.getElementById('ft-my-drive-modal').classList.add('visible');
}

export function closeMyDriveLinkModal() {
  document.getElementById('ft-my-drive-modal').classList.remove('visible');
}

export async function saveMyDriveLinkFromModal() {
  const url = document.getElementById('ft-my-drive-url').value.trim();
  if (url && !url.startsWith('http')) { alert('正しいURLを入力してください'); return; }
  const btn = document.getElementById('ft-my-drive-save-btn');
  btn.disabled = true;
  btn.textContent = '保存中…';
  try {
    await saveMyDriveUrl(url);
    closeMyDriveLinkModal();
    // 登録ボタンのラベル更新
    const settingBtn = document.getElementById('ft-my-drive-link-btn');
    if (settingBtn) settingBtn.innerHTML = `<i class="fa-solid fa-check" style="color:#10b981"></i> Driveリンク登録済み`;
  } catch (err) {
    alert('保存に失敗しました');
  } finally {
    btn.disabled = false;
    btn.textContent = '保存する';
  }
}

// ===== ファイル送信モーダル =====

export async function openFtSendModal() {
  if (!state.currentUsername) { alert('ユーザーネームを設定してください'); return; }
  state._ftSelectedUser = null;
  state._ftSelectedFile = null;
  document.getElementById('ft-user-search').value = '';
  document.getElementById('ft-file-group').hidden = true;
  document.getElementById('ft-selected-file').hidden = true;
  document.getElementById('ft-confirm-btn').hidden = true;
  document.getElementById('ft-file-input').value = '';
  document.getElementById('ft-send-modal').classList.add('visible');
  await deps.loadUsersForChatPicker?.('ft-user-list', 'ft-user-search', (name) => {
    state._ftSelectedUser = name;
    document.getElementById('ft-target-label').textContent = `送信先：${name}`;
    document.getElementById('ft-file-group').hidden = false;
  }, true);
}

export function closeFtSendModal() {
  document.getElementById('ft-send-modal').classList.remove('visible');
  state._ftSelectedUser = null;
  state._ftSelectedFile = null;
}

export async function confirmFtSend() {
  if (!state._ftSelectedUser || !state._ftSelectedFile) return;
  const file      = state._ftSelectedFile;
  const recipient = state._ftSelectedUser;
  closeFtSendModal();
  await initiateFileTransfer(file, recipient);
}

// ===== P2P 転送コア =====

export async function initiateFileTransfer(file, recipientUsername) {
  if (!state.currentUsername || !recipientUsername) return;

  const sessionId  = `${state.currentUsername}_${recipientUsername}_${Date.now()}`;
  const signalRef  = doc(db, 'p2p_signals', sessionId);
  const pc         = new RTCPeerConnection(RTC_CONFIG);
  const dc         = pc.createDataChannel('file');
  const conn       = { pc, dc, role: 'sender', unsub: null, addedToIdx: 0 };
  state._p2pConnections[sessionId] = conn;
  state._sendProgress[sessionId]   = 0;

  // アウトゴーイングリストに追加
  state._ftOutgoing.push({ sessionId, to: recipientUsername, fileName: file.name, fileSize: file.size, fileType: file.type || '', status: 'pending' });
  if (!state._ftPanelOpen) openFileTransferPanel();
  renderFtPanel();

  pc.onicecandidate = async e => {
    if (e.candidate) {
      try { await updateDoc(signalRef, { fromCandidates: arrayUnion(JSON.stringify(e.candidate.toJSON())) }); } catch (_) {}
    }
  };

  dc.onopen  = () => sendFileChunks(dc, file, sessionId);
  dc.onerror = () => { cleanupP2p(sessionId); _updateOutgoing(sessionId, 'error'); renderFtPanel(); };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await setDoc(signalRef, {
    from: state.currentUsername, to: recipientUsername,
    fileName: file.name, fileSize: file.size,
    fileType: file.type || 'application/octet-stream',
    status: 'pending', offer: JSON.stringify(offer), answer: null,
    fromCandidates: [], toCandidates: [],
    createdAt: serverTimestamp()
  });

  // answer / toCandidates を監視
  conn.unsub = onSnapshot(signalRef, async snap => {
    if (!snap.exists()) { _updateOutgoing(sessionId, 'done'); renderFtPanel(); return; }
    const data = snap.data();
    const c = state._p2pConnections[sessionId];
    if (!c) return;
    _updateOutgoing(sessionId, data.status);
    renderFtPanel();
    if (data.answer && !c.pc.currentRemoteDescription) {
      try { await c.pc.setRemoteDescription(JSON.parse(data.answer)); } catch (e) { console.error('setRemoteDescription:', e); }
    }
    const toCands = data.toCandidates || [];
    for (let i = c.addedToIdx; i < toCands.length; i++) {
      try { await c.pc.addIceCandidate(JSON.parse(toCands[i])); c.addedToIdx = i + 1; } catch (_) {}
    }
    if (data.status === 'rejected') {
      cleanupP2p(sessionId);
      _updateOutgoing(sessionId, 'rejected');
      renderFtPanel();
    }
  });
}

function _updateOutgoing(sessionId, status) {
  const item = state._ftOutgoing.find(o => o.sessionId === sessionId);
  if (item) item.status = status;
}

export async function acceptFtTransfer(sessionId) {
  if (!state.currentUsername) return;
  const signalRef  = doc(db, 'p2p_signals', sessionId);
  let signalSnap;
  try { signalSnap = await getDoc(signalRef); } catch (_) { alert('転送セッションの取得に失敗しました。'); return; }
  if (!signalSnap.exists()) { alert('転送セッションが見つかりません。送信側がオフラインの可能性があります。'); return; }
  const signal = signalSnap.data();
  if (signal.status !== 'pending') return;

  const pc   = new RTCPeerConnection(RTC_CONFIG);
  const rcvd = { meta: null, buffers: [], receivedSize: 0 };
  const conn = { pc, dc: null, role: 'receiver', unsub: null, addedFromIdx: 0, rcvd };
  state._p2pConnections[sessionId] = conn;
  state._receiveProgress[sessionId] = 0;
  // 受信アイテムをアウトゴーイングリストに追加（進捗表示用）
  state._ftOutgoing.push({ sessionId, to: signal.from, fileName: signal.fileName, fileSize: signal.fileSize, fileType: signal.fileType || '', status: 'accepted' });
  // 受信待ちリストから除外
  state._ftIncoming = state._ftIncoming.filter(s => s.id !== sessionId);
  renderFtPanel();

  pc.onicecandidate = async e => {
    if (e.candidate) {
      try { await updateDoc(signalRef, { toCandidates: arrayUnion(JSON.stringify(e.candidate.toJSON())) }); } catch (_) {}
    }
  };

  pc.ondatachannel = e => {
    const dc = e.channel;
    conn.dc  = dc;
    dc.binaryType = 'arraybuffer';
    dc.onmessage  = async ev => {
      if (!state._p2pConnections[sessionId]) return;
      if (typeof ev.data === 'string') {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === 'meta') { conn.rcvd.meta = m; conn.rcvd.buffers = []; conn.rcvd.receivedSize = 0; }
        } catch (_) {}
      } else if (ev.data instanceof ArrayBuffer) {
        conn.rcvd.buffers.push(ev.data);
        conn.rcvd.receivedSize += ev.data.byteLength;
        if (conn.rcvd.meta) {
          const pct = (conn.rcvd.receivedSize / conn.rcvd.meta.totalSize) * 100;
          state._receiveProgress[sessionId] = pct;
          updateFileProgressUI(sessionId, pct);
          if (conn.rcvd.receivedSize >= conn.rcvd.meta.totalSize) {
            const blob = new Blob(conn.rcvd.buffers, { type: conn.rcvd.meta.fileType });
            state._receivedFiles[sessionId] = { url: URL.createObjectURL(blob), fileName: conn.rcvd.meta.fileName };
            try { await updateDoc(signalRef, { status: 'done' }); } catch (_) {}
            try { if (conn.unsub) conn.unsub(); } catch (_) {}
            try { dc.close(); } catch (_) {}
            try { pc.close(); } catch (_) {}
            delete state._p2pConnections[sessionId];
            delete state._receiveProgress[sessionId];
            try { await deleteDoc(signalRef); } catch (_) {}
            _updateOutgoing(sessionId, 'done');
            renderFtPanel();
          }
        }
      }
    };
    dc.onerror = () => cleanupP2p(sessionId);
  };

  await pc.setRemoteDescription(JSON.parse(signal.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await updateDoc(signalRef, { answer: JSON.stringify(answer), status: 'accepted' });

  for (const candStr of (signal.fromCandidates || [])) {
    try { await pc.addIceCandidate(JSON.parse(candStr)); conn.addedFromIdx++; } catch (_) {}
  }

  conn.unsub = onSnapshot(signalRef, async snap => {
    if (!snap.exists()) return;
    const c = state._p2pConnections[sessionId];
    if (!c) return;
    const froms = snap.data().fromCandidates || [];
    for (let i = c.addedFromIdx; i < froms.length; i++) {
      try { await c.pc.addIceCandidate(JSON.parse(froms[i])); c.addedFromIdx = i + 1; } catch (_) {}
    }
  });
}

export async function rejectFtTransfer(sessionId) {
  try {
    await updateDoc(doc(db, 'p2p_signals', sessionId), { status: 'rejected' });
    state._ftIncoming = state._ftIncoming.filter(s => s.id !== sessionId);
    updateFtBadge();
    renderFtPanel();
    setTimeout(() => cleanupP2p(sessionId), 1500);
  } catch (err) { console.error('rejectFtTransfer:', err); }
}
