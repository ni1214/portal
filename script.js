// ========== Portal エントリポイント ==========
// 全モジュールを import し、依存関係を注入して初期化する

// ===== Foundation =====
import {
  db, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
  collection, query, where, orderBy, limit, writeBatch, serverTimestamp, onSnapshot,
  arrayUnion, arrayRemove,
  WEATHER_API_KEY, WEATHER_LAT, WEATHER_LON,
  SVG_ICONS, PRESET_SERVICES, CATEGORY_COLORS, ICON_PICKER_LIST,
  DEFAULT_CATEGORIES, INITIAL_CARDS
} from './modules/config.js';

import { state } from './modules/state.js';

import { esc, escHtml, _fmtTs, getUserAvatarColor, formatFileSize, getFileIcon, confirmDelete } from './modules/utils.js';

// ===== Feature modules =====
import {
  deps as authDeps,
  hashPIN, verifyPIN, setPIN, isPINConfigured,
  migrateToNewUsername,
  showUsernameModal, closeUsernameModal, showUsernameError, hideUsernameError,
  applyUsername, saveUsername,
  loadLockSettings, saveLockSettings,
  startActivityTracking, stopActivityTracking, resetActivityTimer, checkAutoLock,
  setLockPin, removeLockPin,
  lockPortal, updateLockNotifications,
  lockSwitchUser, updateLockClock,
  handleLockKeyPress, handleLockDelete, updateLockDots, verifyLockPin,
  openSecurityModal, openAdminModal, closeAdminModal, deleteUserData, loadUsersForAdmin,
  closeSecurityModal,
  updateUsernameDisplay, registerUserLogin
} from './modules/auth.js';

import {
  deps as chatDeps,
  getDmRoomId, initChatResize,
  openChatPanel, closeChatPanel,
  startChatListeners, stopChatListeners,
  subscribeUsersList, stopUsersListListener,
  loadChatReadTimes, markRoomRead, getRoomUnread, updateChatBadge,
  switchChatSidebarTab, renderChatSidebar,
  openRoom, sendChatMessage, deleteChatMessage,
  renderChatMessages, scrollChatToBottom,
  openNewDmModal, deleteDmRoom, openOrCreateDm,
  openNewGroupModal, renderNewGroupSelected, createGroupRoom,
  loadUsersForChatPicker
} from './modules/chat.js';

import {
  deps as ftDeps,
  openFileTransferPanel, closeFileTransferPanel,
  updateFtBadge, renderFtPanel,
  startFtListener, stopFtListener,
  loadMyDriveUrl, saveMyDriveUrl,
  startDriveListeners, stopDriveListeners,
  loadDriveContacts, saveDriveContact, deleteDriveContact,
  switchFtTab, renderDrivePanel,
  openDriveShare, dismissDriveShare,
  openDriveSendModal, selectDriveSendTarget, closeDriveSendModal, confirmDriveSend,
  initDriveLinkWidget,
  openFtSendModal, closeFtSendModal, confirmFtSend,
  initiateFileTransfer, acceptFtTransfer, rejectFtTransfer,
  formatFileSize as ftFormatFileSize,
  getFileIcon as ftGetFileIcon
} from './modules/file-transfer.js';

import {
  deps as noticeDeps,
  loadReadNotices, markAllNoticesRead, updateNoticeBadge, setupNoticeObserver,
  loadAllNoticeReactions, toggleReaction, buildReactionBar,
  subscribeNotices, saveNotice as moduleSaveNotice, addNotice as moduleAddNotice, deleteNotice as moduleDeleteNotice,
  renderNotices, openNoticeModal, closeNoticeModal
} from './modules/notices.js';

import {
  deps as taskDeps,
  startTaskListeners, updateTaskBadge,
  openTaskModal, closeTaskModal, switchTaskTab, renderTaskTabContent,
  openTaskUserPicker, submitNewTask,
  acceptTask, completeTask, acknowledgeTask, deleteTask
} from './modules/tasks.js';

import {
  deps as reqDeps,
  loadConfigDepartmentsAndViewers,
  startRequestListeners, stopRequestListeners,
  updateReqBadge,
  openReqModal, closeReqModal,
  switchReqTab, switchReqSubTab,
  renderReqContent,
  submitRequest, openStatusModal, updateRequestStatus,
  markRequestSeen,
  submitSuggestion, openSuggReplyModal, sendSuggReply,
  _markSuggestionsViewed,
  renderAdminSuggBoxSection, addSuggBoxViewer,
  _renderSuggestionPanel
} from './modules/reqboard.js';

import {
  initEmail,
  loadEmailData, renderEmailProfileList, selectEmailProfile,
  saveEmailProfile, addEmailProfile, deleteEmailProfile,
  saveGeminiApiKey,
  generateEmailReply, copyEmailOutput, resetEmailOutput,
  saveUserEmailProfile, resetSignatureTemplate, updateSignaturePreview,
  switchEmailTab, openEmailModal, closeEmailModal
} from './modules/email.js';

import {
  initCalendar,
  openCalendarModal, closeCalendarModal,
  calPrevMonth, calNextMonth, calGoToday,
  closeDayPanel, saveDayAttendance, deleteAttendance
} from './modules/calendar.js';


// ========== 依存注入 ==========
// 各モジュールが必要とするクロスモジュール関数を注入

Object.assign(authDeps, {
  loadPersonalData,
  renderAllSections,
  esc,
  getRoomUnread
});

Object.assign(chatDeps, {
  stopFtListener,
  stopDriveListeners,
  updateLockNotifications,
  confirmDelete,
  loadUsersForChatPicker
});

Object.assign(ftDeps, {
  updateLockNotifications,
  loadUsersForChatPicker
});

Object.assign(noticeDeps, {
  updateLockNotifications
});

Object.assign(taskDeps, {
  updateLockNotifications,
  loadUsersForChatPicker
});

Object.assign(reqDeps, {
  // reqboard は現在 deps なし
});

initEmail({ confirmDelete });
initCalendar({});


// ========== 個人TODO ==========
function loadTodos(username) {
  if (state._todoUnsubscribe) { state._todoUnsubscribe(); state._todoUnsubscribe = null; }
  if (!username) { state.personalTodos = []; renderTodoSection(); return; }

  const q = query(
    collection(db, 'users', username, 'todos'),
    orderBy('createdAt', 'asc')
  );
  state._todoUnsubscribe = onSnapshot(q, snap => {
    state.personalTodos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTodoSection();
  }, err => console.error('TODO読み込みエラー:', err));
}

async function addTodo(text, dueDate) {
  if (!state.currentUsername || !text.trim()) return;
  await addDoc(collection(db, 'users', state.currentUsername, 'todos'), {
    text:      text.trim(),
    done:      false,
    dueDate:   dueDate || null,
    createdAt: serverTimestamp(),
  });
}

async function toggleTodo(todoId, currentDone) {
  if (!state.currentUsername) return;
  await updateDoc(doc(db, 'users', state.currentUsername, 'todos', todoId), {
    done: !currentDone,
  });
}

async function deleteTodo(todoId) {
  if (!state.currentUsername) return;
  await deleteDoc(doc(db, 'users', state.currentUsername, 'todos', todoId));
}

function renderTodoSection() {
  const section = document.getElementById('todo-section');
  const list    = document.getElementById('todo-list');
  const countEl = document.getElementById('todo-count');
  const body    = document.getElementById('todo-body');
  if (!section || !list) return;

  if (!state.currentUsername) { section.hidden = true; return; }
  section.hidden = false;

  body.classList.toggle('todo-body--collapsed', state.todoCollapsed);
  const toggleBtn = document.getElementById('todo-toggle-btn');
  if (toggleBtn) {
    toggleBtn.querySelector('i').className = state.todoCollapsed
      ? 'fa-solid fa-chevron-down'
      : 'fa-solid fa-chevron-up';
    toggleBtn.title = state.todoCollapsed ? '展開する' : '折りたたむ';
  }

  const total  = state.personalTodos.length;
  const doneN  = state.personalTodos.filter(t => t.done).length;
  if (countEl) {
    countEl.textContent = total ? `${doneN}/${total} 完了` : '';
    countEl.className   = 'todo-count' + (doneN === total && total > 0 ? ' todo-count--all-done' : '');
  }

  const sorted = [
    ...state.personalTodos.filter(t => !t.done),
    ...state.personalTodos.filter(t =>  t.done),
  ];

  list.innerHTML = '';
  if (sorted.length === 0) {
    list.innerHTML = '<li class="todo-empty"><i class="fa-regular fa-circle-check"></i> タスクはありません</li>';
  } else {
    sorted.forEach(todo => {
      const li = document.createElement('li');
      li.className = 'todo-item' + (todo.done ? ' todo-item--done' : '');
      li.dataset.id = todo.id;

      const dueBadge = todo.dueDate
        ? `<span class="todo-due todo-due--${todo.dueDate === '今日' ? 'today' : 'tomorrow'}">${esc(todo.dueDate)}</span>`
        : '';

      li.innerHTML = `
        <button class="todo-check" title="${todo.done ? '未完了に戻す' : '完了にする'}">
          <i class="fa-${todo.done ? 'solid' : 'regular'} fa-circle-check"></i>
        </button>
        <span class="todo-text">${esc(todo.text)}</span>
        ${dueBadge}
        <button class="todo-delete-btn" title="削除"><i class="fa-solid fa-xmark"></i></button>
      `;

      li.querySelector('.todo-check').addEventListener('click', () => toggleTodo(todo.id, todo.done));
      li.querySelector('.todo-delete-btn').addEventListener('click', () => deleteTodo(todo.id));

      list.appendChild(li);
    });
  }
}


// ========== 個人設定 Firestore 保存（デバウンス付き） ==========
let _prefSaveTimer = null;
function savePreferencesToFirestore() {
  if (!state.currentUsername) return;
  clearTimeout(_prefSaveTimer);
  _prefSaveTimer = setTimeout(async () => {
    try {
      const theme    = localStorage.getItem('portal-theme')     || 'dark';
      const fontSize = localStorage.getItem('portal-font-size') || 'font-md';
      await setDoc(
        doc(db, 'users', state.currentUsername, 'data', 'preferences'),
        {
          theme,
          fontSize,
          favOnly:   state.favoritesOnlyMode,
          favorites: state.personalFavorites,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      console.error('設定保存エラー:', err);
    }
  }, 600);
}

async function loadPersonalData(username, lockOnSwitch = false) {
  if (!username) return;
  try {
    registerUserLogin(username);

    const [orderSnap, prefSnap, privSecSnap, privCardSnap] = await Promise.all([
      getDoc(doc(db, 'users', username, 'data', 'section_order')),
      getDoc(doc(db, 'users', username, 'data', 'preferences')),
      getDocs(collection(db, 'users', username, 'private_sections')),
      getDocs(collection(db, 'users', username, 'private_cards')),
    ]);

    state.personalSectionOrder = orderSnap.exists() ? (orderSnap.data().order || []) : [];

    if (prefSnap.exists()) {
      const p = prefSnap.data();
      state.personalFavorites = Array.isArray(p.favorites) ? p.favorites : [];
      state.favoritesOnlyMode = !!p.favOnly;
      if (p.theme)    applyTheme(p.theme, false);
      if (p.fontSize) applyFontSize(p.fontSize, false);
      if (p.lastViewedSuggestionsAt) {
        state.lastViewedSuggestionsAt = p.lastViewedSuggestionsAt.seconds ?? Math.floor(p.lastViewedSuggestionsAt / 1000);
      }
    } else {
      const localFavs = (() => {
        try { return JSON.parse(localStorage.getItem('portal-favorites') || '[]'); } catch { return []; }
      })();
      const localFavOnly = localStorage.getItem('portal-fav-only') === '1';
      state.personalFavorites = localFavs;
      state.favoritesOnlyMode = localFavOnly;
      savePreferencesToFirestore();
    }

    state.privateCategories = privSecSnap.docs.map(d => ({ docId: d.id, isPrivate: true, ...d.data() }));
    state.privateCards      = privCardSnap.docs.map(d => ({ id: d.id, isPrivate: true, ...d.data() }));

    renderAllSections();
    renderFavorites();
    applyFavoritesOnlyMode();
    loadTodos(username);
    await loadReadNotices(username);
    setupNoticeObserver();
    loadChatReadTimes(username);
    startChatListeners(username);
    startTaskListeners(username);
    startFtListener();
    await loadMyDriveUrl(username);
    await loadDriveContacts(username);
    startDriveListeners(username);
    await loadConfigDepartmentsAndViewers();
    startRequestListeners(username);
    await loadLockSettings(username, lockOnSwitch);
  } catch (err) {
    console.error('個人データ読み込みエラー:', err);
  }
}

async function savePersonalSectionOrder(username, order) {
  if (!username) return;
  await setDoc(doc(db, 'users', username, 'data', 'section_order'), { order, updatedAt: serverTimestamp() });
}


// ========== プライベートセクション CRUD ==========
async function addPrivateSection(data) {
  if (!state.currentUsername) return;
  const ref = await addDoc(collection(db, 'users', state.currentUsername, 'private_sections'), { ...data, createdAt: serverTimestamp() });
  state.privateCategories.push({ docId: ref.id, isPrivate: true, ...data });
}

async function updatePrivateSection(docId, data) {
  if (!state.currentUsername) return;
  await updateDoc(doc(db, 'users', state.currentUsername, 'private_sections', docId), { ...data, updatedAt: serverTimestamp() });
  const idx = state.privateCategories.findIndex(c => c.docId === docId);
  if (idx !== -1) state.privateCategories[idx] = { ...state.privateCategories[idx], ...data };
}

async function deletePrivateSection(docId) {
  if (!state.currentUsername) return;
  await deleteDoc(doc(db, 'users', state.currentUsername, 'private_sections', docId));
  state.privateCategories = state.privateCategories.filter(c => c.docId !== docId);
}

async function addPrivateCard(data) {
  if (!state.currentUsername) return;
  const siblings = data.parentId
    ? state.privateCards.filter(c => c.parentId === data.parentId)
    : state.privateCards.filter(c => c.sectionId === data.sectionId && !c.parentId);
  const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order || 0)) + 1 : 0;
  const newData = { ...data, parentId: data.parentId || null, order: maxOrder, updatedAt: serverTimestamp() };
  const ref = await addDoc(collection(db, 'users', state.currentUsername, 'private_cards'), newData);
  state.privateCards.push({ id: ref.id, isPrivate: true, ...newData });
  renderAllSections();
}

async function savePrivateCard(cardId, data) {
  if (!state.currentUsername) return;
  await updateDoc(doc(db, 'users', state.currentUsername, 'private_cards', cardId), { ...data, updatedAt: serverTimestamp() });
  const idx = state.privateCards.findIndex(c => c.id === cardId);
  if (idx !== -1) state.privateCards[idx] = { ...state.privateCards[idx], ...data };
  renderAllSections();
}

async function deletePrivateCard(cardId) {
  if (!state.currentUsername) return;
  await deleteDoc(doc(db, 'users', state.currentUsername, 'private_cards', cardId));
  state.privateCards = state.privateCards.filter(c => c.id !== cardId);
  renderAllSections();
}


// ========== 個人セクション順序 ==========
function applyPersonalOrder(cats) {
  const result = [];
  state.personalSectionOrder.forEach(sid => {
    const cat = cats.find(c =>
      sid.startsWith('priv:')
        ? c.isPrivate && c.docId === sid.slice(5)
        : !c.isPrivate && c.id === sid
    );
    if (cat) result.push(cat);
  });
  cats.forEach(cat => {
    const sid = cat.isPrivate ? `priv:${cat.docId}` : cat.id;
    if (!state.personalSectionOrder.includes(sid)) result.push(cat);
  });
  return result;
}

async function reorderSections(srcId, targetId) {
  const publicCats = [...state.allCategories].sort((a, b) => a.order - b.order);
  const privCats = [...state.privateCategories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const allCats = [...publicCats, ...privCats];

  let currentIds;
  if (state.personalSectionOrder.length) {
    currentIds = [...state.personalSectionOrder];
    allCats.forEach(cat => {
      const sid = cat.isPrivate ? `priv:${cat.docId}` : cat.id;
      if (!currentIds.includes(sid)) currentIds.push(sid);
    });
  } else {
    currentIds = allCats.map(cat => cat.isPrivate ? `priv:${cat.docId}` : cat.id);
  }

  const srcIdx = currentIds.indexOf(srcId);
  const tgtIdx = currentIds.indexOf(targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;

  currentIds.splice(srcIdx, 1);
  currentIds.splice(tgtIdx, 0, srcId);
  state.personalSectionOrder = currentIds;

  if (state.currentUsername) await savePersonalSectionOrder(state.currentUsername, currentIds);
  renderAllSections();
}


// ========== セクション ドラッグ&ドロップ ==========
function setupSectionDraggable(section, sectionId) {
  const handle = section.querySelector('.section-drag-handle');
  if (!handle) return;

  handle.addEventListener('dragstart', e => {
    state.dragSrcSectionId = sectionId;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => section.classList.add('section-dragging'), 0);
  });

  handle.addEventListener('dragend', () => {
    section.classList.remove('section-dragging');
    document.querySelectorAll('.section-drag-over').forEach(el => el.classList.remove('section-drag-over'));
    state.dragSrcSectionId = null;
  });

  section.addEventListener('dragover', e => {
    if (!state.dragSrcSectionId || state.dragSrcSectionId === sectionId) return;
    e.preventDefault();
    section.classList.add('section-drag-over');
  });

  section.addEventListener('dragleave', e => {
    if (!section.contains(e.relatedTarget)) section.classList.remove('section-drag-over');
  });

  section.addEventListener('drop', async e => {
    e.preventDefault();
    section.classList.remove('section-drag-over');
    if (!state.dragSrcSectionId || state.dragSrcSectionId === sectionId) return;
    const src = state.dragSrcSectionId;
    state.dragSrcSectionId = null;
    await reorderSections(src, sectionId);
  });
}


// ========== プライベートセクション管理モーダル ==========
function openPrivateSectionModal(cat) {
  state.editingPrivateSectionId = cat?.docId || null;
  state.privateSectionColorIndex = cat?.colorIndex || 1;
  document.getElementById('private-section-modal-title').innerHTML = cat
    ? '<i class="fa-solid fa-lock"></i> マイセクションを編集'
    : '<i class="fa-solid fa-lock"></i> マイセクションを追加';
  document.getElementById('private-section-label').value = cat?.label || '';
  document.getElementById('private-section-icon').value = cat?.icon || 'fa-solid fa-star';
  document.getElementById('private-section-delete').style.display = cat ? 'inline-flex' : 'none';
  const prev = document.getElementById('private-section-icon-preview');
  if (prev) prev.innerHTML = `<i class="${cat?.icon || 'fa-solid fa-star'}"></i>`;
  const grid = document.getElementById('private-section-color-grid');
  grid.innerHTML = '';
  CATEGORY_COLORS.forEach(({ index, label, gradient }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `color-swatch${index === state.privateSectionColorIndex ? ' selected' : ''}`;
    btn.style.background = gradient;
    btn.title = label;
    btn.addEventListener('click', () => {
      state.privateSectionColorIndex = index;
      grid.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    grid.appendChild(btn);
  });
  document.getElementById('private-section-modal').classList.add('visible');
  setTimeout(() => document.getElementById('private-section-label').focus(), 100);
}

function closePrivateSectionModal() {
  document.getElementById('private-section-modal').classList.remove('visible');
  state.editingPrivateSectionId = null;
}


// ========== Firestore CRUD (カード) ==========
async function migrateIfNeeded() {
  const configRef = doc(db, 'portal', 'config');
  const configSnap = await getDoc(configRef);
  if (configSnap.exists() && configSnap.data().migrated) return;

  const batch = writeBatch(db);
  INITIAL_CARDS.forEach(card => {
    batch.set(doc(collection(db, 'cards')), { ...card, updatedAt: serverTimestamp() });
  });
  batch.set(configRef, { migrated: true, pinHash: '', createdAt: serverTimestamp() }, { merge: true });
  await batch.commit();
}

async function migrateAddBox() {
  const configRef = doc(db, 'portal', 'config');
  const configSnap = await getDoc(configRef);
  if (configSnap.exists() && configSnap.data().boxAdded) return;
  const cardsSnap = await getDocs(collection(db, 'cards'));
  const hasBox = cardsSnap.docs.some(d => d.data().url === 'https://www.box.com/');
  if (!hasBox) {
    await addDoc(collection(db, 'cards'), {
      label: 'Box', icon: 'svg:box', url: 'https://www.box.com/',
      category: 'external', categoryOrder: 0, order: 4,
      isExternalTool: true, updatedAt: serverTimestamp()
    });
  }
  await setDoc(configRef, { boxAdded: true }, { merge: true });
}

async function migrateCategories() {
  const configRef = doc(db, 'portal', 'config');
  const configSnap = await getDoc(configRef);
  if (configSnap.exists() && configSnap.data().categoriesMigrated) return;

  const batch = writeBatch(db);
  DEFAULT_CATEGORIES.forEach(cat => {
    batch.set(doc(collection(db, 'categories')), { ...cat, updatedAt: serverTimestamp() });
  });
  batch.set(configRef, { categoriesMigrated: true }, { merge: true });
  await batch.commit();
}

async function loadCategories() {
  const q = query(collection(db, 'categories'), orderBy('order'));
  const snap = await getDocs(q);
  if (snap.docs.length > 0) {
    state.allCategories = snap.docs.map(d => {
      const data = d.data();
      return {
        docId: d.id,
        ...data,
        isExternal: data.isExternal ?? (data.id === 'external')
      };
    });
  }
}

function subscribeCards() {
  if (state.unsubscribeCards) state.unsubscribeCards();
  const q = query(collection(db, 'cards'), orderBy('categoryOrder'));
  state.unsubscribeCards = onSnapshot(q, snapshot => {
    state.allCards = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.categoryOrder ?? 0) - (b.categoryOrder ?? 0) || (a.order ?? 0) - (b.order ?? 0));
    renderAllSections();
    renderFavorites();
  }, err => console.error('onSnapshot エラー:', err));
}

async function saveCard(docId, data) {
  await updateDoc(doc(db, 'cards', docId), { ...data, updatedAt: serverTimestamp() });
  const idx = state.allCards.findIndex(c => c.id === docId);
  if (idx !== -1) state.allCards[idx] = { ...state.allCards[idx], ...data };
}

async function addCard(data) {
  const siblings = data.parentId
    ? state.allCards.filter(c => c.parentId === data.parentId)
    : state.allCards.filter(c => c.category === data.category && !c.parentId);
  const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
  const catDef = state.allCategories.find(c => c.id === data.category);
  const newData = {
    ...data,
    parentId: data.parentId || null,
    order: maxOrder,
    categoryOrder: catDef ? catDef.order : 99,
    isExternalTool: data.category === 'external',
    updatedAt: serverTimestamp()
  };
  await addDoc(collection(db, 'cards'), newData);
}

async function deleteCard(docId) {
  await deleteDoc(doc(db, 'cards', docId));
  state.allCards = state.allCards.filter(c => c.id !== docId);
}


// ========== Firestore CRUD (カテゴリ) ==========
async function addCategoryToFirestore(data) {
  const ref = await addDoc(collection(db, 'categories'), { ...data, updatedAt: serverTimestamp() });
  state.allCategories.push({ docId: ref.id, ...data });
}

async function updateCategoryInFirestore(docId, data) {
  await updateDoc(doc(db, 'categories', docId), { ...data, updatedAt: serverTimestamp() });
  const idx = state.allCategories.findIndex(c => c.docId === docId);
  if (idx !== -1) state.allCategories[idx] = { ...state.allCategories[idx], ...data };
}

async function deleteCategoryFromFirestore(docId) {
  await deleteDoc(doc(db, 'categories', docId));
  state.allCategories = state.allCategories.filter(c => c.docId !== docId);
}


// ========== DOM 描画 ==========
function getCategoryGradient(cat) {
  if (cat.isExternal) return 'linear-gradient(135deg, #6c5ce7, #a29bfe)';
  const color = CATEGORY_COLORS.find(c => c.index === cat.colorIndex);
  return color ? color.gradient : CATEGORY_COLORS[0].gradient;
}

function renderAllSections() {
  closeChildPopup();
  const main = document.querySelector('.main');
  const noResults = document.getElementById('no-results');
  main.querySelectorAll('.category-section:not(#favorites-section), .external-tools, .btn-add-category-wrap').forEach(el => el.remove());

  const publicSorted = [...state.allCategories].sort((a, b) => a.order - b.order);
  const privateSorted = [...state.privateCategories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const allCats = [...publicSorted, ...privateSorted];
  const sorted = state.personalSectionOrder.length ? applyPersonalOrder(allCats) : allCats;

  sorted.forEach(cat => {
    let catCards;
    if (cat.isPrivate) {
      catCards = state.privateCards.filter(c => c.sectionId === cat.docId).sort((a, b) => (a.order || 0) - (b.order || 0));
    } else {
      catCards = state.allCards.filter(c => c.category === cat.id).sort((a, b) => a.order - b.order);
    }
    main.insertBefore(buildSection(cat, catCards), noResults);
  });

  const addWrap = document.createElement('div');
  addWrap.className = 'btn-add-category-wrap';
  let btnsHtml = `
    <div class="add-btn-group">
      <button class="btn-add-category"><i class="fa-solid fa-plus"></i> カテゴリを追加</button>
      <p class="add-btn-desc"><i class="fa-solid fa-users"></i> 全社員に共有されます</p>
    </div>`;
  if (state.currentUsername) btnsHtml += `
    <div class="add-btn-group">
      <button class="btn-add-private-section"><i class="fa-solid fa-lock"></i> マイセクションを追加</button>
      <p class="add-btn-desc add-btn-desc--private"><i class="fa-solid fa-user-secret"></i> 自分だけに表示されます</p>
    </div>`;
  addWrap.innerHTML = btnsHtml;
  addWrap.querySelector('.btn-add-category').addEventListener('click', () => openCategoryModal(null));
  if (state.currentUsername) addWrap.querySelector('.btn-add-private-section').addEventListener('click', () => openPrivateSectionModal(null));
  main.insertBefore(addWrap, noResults);
}

function buildSection(cat, cards) {
  const section = document.createElement('section');
  const gradient = getCategoryGradient(cat);
  const sectionId = cat.isPrivate ? `priv:${cat.docId}` : cat.id;

  if (cat.isExternal) {
    section.className = 'external-tools';
    section.id = `section-${cat.id}`;
    const editBtns = state.isEditMode
      ? `<button class="btn-edit-category" data-docid="${cat.docId || ''}" title="カテゴリ編集"><i class="fa-solid fa-pen"></i></button>`
      : '';
    section.innerHTML = `
      <div class="category-header">
        <div class="category-icon" style="background:${gradient}"><i class="${cat.icon}"></i></div>
        <h2 class="category-title">${esc(cat.label)}</h2>
        ${editBtns}
      </div>
      <div class="external-grid"></div>
    `;
    const grid = section.querySelector('.external-grid');
    grid.appendChild(buildSolarIconWrap());
    cards.filter(c => c.url !== 'solar:open').forEach(c => grid.appendChild(buildExternalCard(c)));
    if (state.isEditMode) {
      const addWrap = document.createElement('div');
      addWrap.className = 'ext-icon-wrap';
      const addBtn = document.createElement('button');
      addBtn.className = 'ext-icon-btn ext-icon-add-btn';
      addBtn.innerHTML = `<div class="ext-icon-img ext-icon-add-img"><i class="fa-solid fa-plus"></i></div><span class="ext-icon-label">追加</span>`;
      addBtn.addEventListener('click', openServicePicker);
      addWrap.appendChild(addBtn);
      grid.appendChild(addWrap);
    }
    if (state.isEditMode) {
      const editBtn = section.querySelector('.btn-edit-category');
      if (editBtn) editBtn.addEventListener('click', () => {
        const catObj = state.allCategories.find(c => c.docId === editBtn.dataset.docid || c.id === cat.id);
        openCategoryModal(catObj);
      });
    }

  } else if (cat.isPrivate) {
    section.className = 'category-section private-section';
    section.id = `section-priv-${cat.docId}`;
    const color = CATEGORY_COLORS.find(c => c.index === cat.colorIndex);
    const privGradient = color ? color.gradient : CATEGORY_COLORS[0].gradient;
    section.innerHTML = `
      <div class="category-header">
        <div class="category-icon" style="background:${privGradient}"><i class="${cat.icon || 'fa-solid fa-star'}"></i></div>
        <h2 class="category-title">${esc(cat.label)}<span class="private-badge"><i class="fa-solid fa-lock"></i></span></h2>
        <span class="category-count">${cards.length} 件</span>
        <button class="btn-edit-category" data-docid="${cat.docId}" title="マイセクションを編集"><i class="fa-solid fa-pen"></i></button>
      </div>
      <div class="card-grid"></div>
    `;
    const grid = section.querySelector('.card-grid');
    const privRootCards = cards.filter(c => !c.parentId);
    privRootCards.forEach(c => grid.appendChild(buildCardNode(c, cards, privGradient, true)));
    grid.appendChild(buildAddButton(null, true, cat.docId));
    section.querySelector('.btn-edit-category').addEventListener('click', () => openPrivateSectionModal(cat));

    const favs = getFavorites();
    const allFaved = cards.length > 0 && cards.every(c => favs.includes(c.id));
    const sBtn = document.createElement('button');
    sBtn.className = 'btn-section-favorite' + (allFaved ? ' active' : '');
    sBtn.title = allFaved ? 'まとめて解除' : 'セクションをまとめてお気に入り';
    sBtn.innerHTML = `<i class="fa-${allFaved ? 'solid' : 'regular'} fa-star"></i>`;
    sBtn.addEventListener('click', () => toggleSectionFavorite(cat.docId, true));
    section.querySelector('.category-header').appendChild(sBtn);

  } else {
    section.className = 'category-section';
    section.id = `section-${cat.id}`;
    const editBtns = state.isEditMode
      ? `<button class="btn-edit-category" data-docid="${cat.docId || ''}" title="カテゴリ編集"><i class="fa-solid fa-pen"></i></button>`
      : '';
    section.innerHTML = `
      <div class="category-header">
        <div class="category-icon" style="background:${gradient}"><i class="${cat.icon}"></i></div>
        <h2 class="category-title">${esc(cat.label)}</h2>
        <span class="category-count">${cards.length} 件</span>
        ${editBtns}
      </div>
      <div class="card-grid"></div>
    `;
    const grid = section.querySelector('.card-grid');
    const rootCards = cards.filter(c => !c.parentId);
    rootCards.forEach(c => grid.appendChild(buildCardNode(c, cards, gradient, false)));
    if (state.isEditMode) grid.appendChild(buildAddButton(cat.id));

    if (state.isEditMode) {
      const editBtn = section.querySelector('.btn-edit-category');
      if (editBtn) editBtn.addEventListener('click', () => {
        const catObj = state.allCategories.find(c => c.docId === editBtn.dataset.docid || c.id === cat.id);
        openCategoryModal(catObj);
      });
    }

    const favs = getFavorites();
    const catCardsForFav = state.allCards.filter(c => c.category === cat.id);
    const allFaved = catCardsForFav.length > 0 && catCardsForFav.every(c => favs.includes(c.id));
    const sBtn = document.createElement('button');
    sBtn.className = 'btn-section-favorite' + (allFaved ? ' active' : '');
    sBtn.title = allFaved ? 'まとめて解除' : 'セクションをまとめてお気に入り';
    sBtn.innerHTML = `<i class="fa-${allFaved ? 'solid' : 'regular'} fa-star"></i>`;
    sBtn.addEventListener('click', () => toggleSectionFavorite(cat.id, false));
    section.querySelector('.category-header').appendChild(sBtn);
  }

  if (state.currentUsername) {
    const handle = document.createElement('div');
    handle.className = 'section-drag-handle';
    handle.title = 'ドラッグしてセクションを並び替え';
    handle.setAttribute('draggable', 'true');
    handle.innerHTML = '<i class="fa-solid fa-grip-lines"></i>';
    section.querySelector('.category-header').prepend(handle);
    setupSectionDraggable(section, sectionId);
  }

  return section;
}

function buildLinkCard(card, isFav = false, gradient = '') {
  const a = document.createElement('a');
  if (card.url === 'solar:open') {
    a.href = '#';
    a.dataset.solarOpen = '1';
  } else {
    a.href = card.url || '#';
    if (card.url && card.url !== '#') {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  }
  const hasNoUrl = card.url !== 'solar:open' && (!card.url || card.url.trim() === '' || card.url === '#');
  a.className = 'link-card' + (hasNoUrl ? ' link-card--no-url' : '');
  a.dataset.docId = card.id;

  const iconHtml = card.icon && card.icon.startsWith('svg:')
    ? (SVG_ICONS[card.icon] || '')
    : `<i class="${card.icon || 'fa-solid fa-link'}"></i>`;

  const favs = getFavorites();
  const isFavorited = favs.includes(card.id);
  const starBtn = `<button class="btn-favorite${isFavorited ? ' active' : ''}" data-id="${card.id}" title="お気に入り"><i class="fa-${isFavorited ? 'solid' : 'regular'} fa-star"></i></button>`;
  const noUrlBadge = hasNoUrl
    ? `<span class="no-url-badge"><i class="fa-solid fa-triangle-exclamation"></i> URL未設定</span>`
    : '';

  a.innerHTML = `
    ${noUrlBadge}
    <div class="card-icon" style="color: inherit">${iconHtml}</div>
    <span class="card-label">${esc(card.label)}</span>
    ${starBtn}
  `;

  if (gradient) {
    const iconEl = a.querySelector('.card-icon');
    if (iconEl) {
      if (!card.icon?.startsWith('svg:')) {
        iconEl.style.background = gradient;
        iconEl.style.webkitBackgroundClip = 'text';
        iconEl.style.webkitTextFillColor = 'transparent';
        iconEl.style.backgroundClip = 'text';
      }
    }
  }

  a.querySelector('.btn-favorite').addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(card.id);
  });

  if (!isFav) {
    a.addEventListener('contextmenu', e => {
      e.preventDefault();
      showContextMenu(e, card);
    });
    setupDraggable(a, card);
  }
  return a;
}

function buildSolarIconWrap() {
  const wrap = document.createElement('div');
  wrap.className = 'ext-icon-wrap ext-icon-solar-pinned';

  const a = document.createElement('a');
  a.className = 'ext-icon-btn';
  a.href = '#';
  a.setAttribute('data-solar-open', '1');
  a.innerHTML = `
    <div class="ext-icon-img ext-icon-solar-img">
      <i class="fa-solid fa-solar-panel" style="font-size:2rem;color:#f9a825"></i>
    </div>
    <span class="ext-icon-label">太陽光発電</span>`;
  wrap.appendChild(a);
  return wrap;
}

function buildExternalCard(card) {
  const wrap = document.createElement('div');
  wrap.className = 'ext-icon-wrap';
  wrap.dataset.docId = card.id;

  const a = document.createElement('a');
  a.className = 'ext-icon-btn';
  if (card.url === 'solar:open') {
    a.href = '#';
    a.dataset.solarOpen = '1';
  } else {
    a.href = card.url || '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }

  const iconHtml = card.icon?.startsWith('svg:')
    ? (SVG_ICONS[card.icon] || `<i class="fa-solid fa-globe" style="font-size:2rem;color:var(--accent-cyan)"></i>`)
    : `<i class="${card.icon || 'fa-solid fa-link'}" style="font-size:2rem;color:var(--accent-cyan)"></i>`;

  a.innerHTML = `<div class="ext-icon-img">${iconHtml}</div><span class="ext-icon-label">${esc(card.label)}</span>`;
  wrap.appendChild(a);

  wrap.addEventListener('contextmenu', e => {
    e.preventDefault();
    showContextMenu(e, card);
  });
  return wrap;
}

function buildEditOverlay(card) {
  const overlay = document.createElement('div');
  overlay.className = 'card-edit-overlay';
  overlay.innerHTML = `
    <button class="btn-edit-card" title="編集"><i class="fa-solid fa-pen"></i></button>
    <button class="btn-delete-card" title="削除"><i class="fa-solid fa-trash"></i></button>
  `;
  overlay.querySelector('.btn-edit-card').addEventListener('click', e => {
    e.preventDefault();
    openCardModal(card.id);
  });
  overlay.querySelector('.btn-delete-card').addEventListener('click', async e => {
    e.preventDefault();
    if (await confirmDelete(`「${card.label}」を削除しますか？`)) {
      await deleteCard(card.id);
    }
  });
  return overlay;
}

function buildAddButton(categoryId, isPrivate = false, privateSectionDocId = null, parentId = null) {
  const btn = document.createElement('button');
  btn.className = 'btn-add-card';
  btn.innerHTML = '<i class="fa-solid fa-plus"></i><span>カードを追加</span>';
  btn.addEventListener('click', () => openCardModal(null, categoryId, isPrivate, privateSectionDocId, parentId));
  return btn;
}


// ========== カード階層: ノード構築 ==========
function buildCardNode(card, allCatCards, gradient, isPrivate) {
  const children = allCatCards.filter(c => c.parentId === card.id);
  const a = buildLinkCard(card, false, gradient);

  if (children.length === 0) return a;

  a.classList.add('card-has-children');

  const badge = document.createElement('button');
  badge.className = 'card-children-badge';
  badge.innerHTML = `<i class="fa-solid fa-layer-group"></i><span>${children.length}</span>`;
  badge.title = `${children.length}件の子カードを表示`;
  badge.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (state.activeChildPopup && state.activeChildPopup.dataset.parentId === card.id) {
      closeChildPopup();
      return;
    }
    openChildPopup(card, children, allCatCards, gradient, isPrivate, a);
  });
  a.appendChild(badge);

  return a;
}

function openChildPopup(parentCard, children, allCatCards, gradient, isPrivate, anchorEl) {
  closeChildPopup();

  const popup = document.createElement('div');
  popup.className = 'card-child-popup';
  popup.dataset.parentId = parentCard.id;

  const iconHtml = parentCard.icon && parentCard.icon.startsWith('svg:')
    ? (SVG_ICONS[parentCard.icon] || '')
    : `<i class="${parentCard.icon || 'fa-solid fa-star'}"></i>`;

  const header = document.createElement('div');
  header.className = 'card-child-popup__header';
  header.innerHTML = `
    <div class="card-child-popup__title">
      <span class="card-child-popup__icon">${iconHtml}</span>
      <span>${esc(parentCard.label)}</span>
    </div>
    <button class="card-child-popup__close" title="閉じる"><i class="fa-solid fa-xmark"></i></button>
  `;
  popup.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'card-child-popup__grid';
  children.forEach((child, i) => {
    const node = buildCardNode(child, allCatCards, gradient, isPrivate);
    node.style.animationDelay = `${i * 0.04}s`;
    grid.appendChild(node);
  });

  const catId = parentCard.category || parentCard.sectionId;
  const addBtn = buildAddButton(catId, isPrivate, isPrivate ? parentCard.sectionId : null, parentCard.id);
  addBtn.style.animationDelay = `${children.length * 0.04}s`;
  grid.appendChild(addBtn);

  popup.appendChild(grid);
  document.body.appendChild(popup);

  positionChildPopup(popup, anchorEl);

  header.querySelector('.card-child-popup__close').addEventListener('click', e => {
    e.stopPropagation();
    closeChildPopup();
  });

  state.activeChildPopup = popup;

  setTimeout(() => {
    document.addEventListener('click', closeChildPopupOnOutside);
  }, 30);
}

function positionChildPopup(popup, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const maxW = Math.min(540, vw - 32);
  popup.style.maxWidth = maxW + 'px';

  popup.style.visibility = 'hidden';
  popup.style.left = '0px';
  popup.style.top = '0px';
  const popupH = popup.offsetHeight || 300;

  let top = rect.bottom + scrollY + 8;
  if (rect.bottom + popupH + 8 > vh) {
    top = rect.top + scrollY - popupH - 8;
  }

  let left = rect.left + scrollX;
  if (left + maxW > vw + scrollX - 16) {
    left = vw + scrollX - maxW - 16;
  }
  if (left < scrollX + 8) left = scrollX + 8;

  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  popup.style.visibility = '';
}

function closeChildPopupOnOutside(e) {
  if (state.activeChildPopup && !state.activeChildPopup.contains(e.target)) {
    closeChildPopup();
  }
}

function closeChildPopup() {
  if (state.activeChildPopup) {
    state.activeChildPopup.classList.add('closing');
    const el = state.activeChildPopup;
    state.activeChildPopup = null;
    setTimeout(() => el.remove(), 180);
  }
  document.removeEventListener('click', closeChildPopupOnOutside);
}


// ========== お気に入り ==========
function getFavorites() {
  return [...state.personalFavorites];
}

function setFavorites(ids) {
  state.personalFavorites = [...ids];
  savePreferencesToFirestore();
}

function toggleFavorite(docId) {
  const favs = getFavorites();
  const idx = favs.indexOf(docId);
  if (idx === -1) favs.push(docId); else favs.splice(idx, 1);
  setFavorites(favs);
  renderFavorites();
  document.querySelectorAll(`.btn-favorite[data-id="${docId}"]`).forEach(b => {
    const active = favs.includes(docId);
    b.classList.toggle('active', active);
    b.innerHTML = `<i class="fa-${active ? 'solid' : 'regular'} fa-star"></i>`;
  });
}

function renderFavorites() {
  const favIds = getFavorites();
  const section = document.getElementById('favorites-section');
  const grid = document.getElementById('favorites-grid');
  const count = document.getElementById('favorites-count');

  const cards = favIds.map(id => state.allCards.find(c => c.id === id)).filter(Boolean);

  if (!cards.length) {
    if (state.favoritesOnlyMode) {
      section.hidden = false;
      grid.innerHTML = '<p class="fav-empty"><i class="fa-regular fa-star"></i> お気に入りが未登録です。カードを右クリック → 編集 または各カードの ☆ をクリックして登録してください。</p>';
      if (count) count.textContent = '0 件';
    } else {
      section.hidden = true;
    }
    return;
  }

  section.hidden = false;
  grid.innerHTML = '';
  if (count) count.textContent = `${cards.length} 件`;
  cards.forEach(card => grid.appendChild(buildLinkCard(card, true)));
}


// ========== カテゴリ管理 ==========
function openCategoryModal(cat) {
  state.editingCategoryId = cat?.docId || null;
  document.getElementById('category-modal-title').textContent = cat ? 'カテゴリを編集' : 'カテゴリを追加';
  document.getElementById('cat-label').value = cat?.label || '';
  document.getElementById('cat-icon').value = cat?.icon || 'fa-solid fa-star';
  document.getElementById('cat-delete').style.display = (cat && !cat.isExternal) ? 'inline-flex' : 'none';
  state.selectedColorIndex = cat?.colorIndex || 1;
  updateCatIconPreview(cat?.icon || 'fa-solid fa-star');
  buildColorPicker();
  document.getElementById('category-modal').classList.add('visible');
  setTimeout(() => document.getElementById('cat-label').focus(), 100);
}

function closeCategoryModal() {
  document.getElementById('category-modal').classList.remove('visible');
  state.editingCategoryId = null;
}

function updateCatIconPreview(iconClass) {
  const el = document.getElementById('cat-icon-preview');
  if (!el) return;
  el.innerHTML = iconClass ? `<i class="${iconClass}"></i>` : '';
}

function buildColorPicker() {
  const grid = document.getElementById('color-picker-grid');
  if (!grid) return;
  grid.innerHTML = '';
  CATEGORY_COLORS.forEach(({ index, label, gradient }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `color-swatch${index === state.selectedColorIndex ? ' selected' : ''}`;
    btn.style.background = gradient;
    btn.title = label;
    btn.addEventListener('click', () => {
      state.selectedColorIndex = index;
      grid.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    grid.appendChild(btn);
  });
}


// ========== ドラッグ&ドロップ ==========
function setupDraggable(el, card) {
  el.setAttribute('draggable', 'true');

  el.addEventListener('dragstart', e => {
    state.dragSrcId = card.id;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => el.classList.add('dragging'), 0);
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(d => d.classList.remove('drag-over'));
  });

  el.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (state.dragSrcId !== card.id) el.classList.add('drag-over');
  });

  el.addEventListener('dragleave', () => {
    el.classList.remove('drag-over');
  });

  el.addEventListener('drop', async e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (!state.dragSrcId || state.dragSrcId === card.id) return;
    await reorderCards(state.dragSrcId, card.id);
    state.dragSrcId = null;
  });
}

async function reorderCards(srcId, targetId) {
  const src = state.allCards.find(c => c.id === srcId);
  const target = state.allCards.find(c => c.id === targetId);
  if (!src || !target || src.category !== target.category) return;

  const catCards = state.allCards
    .filter(c => c.category === src.category)
    .sort((a, b) => a.order - b.order);

  const srcIdx = catCards.findIndex(c => c.id === srcId);
  const tgtIdx = catCards.findIndex(c => c.id === targetId);
  catCards.splice(srcIdx, 1);
  catCards.splice(tgtIdx, 0, src);

  const batch = writeBatch(db);
  catCards.forEach((c, i) => {
    batch.update(doc(db, 'cards', c.id), { order: i, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}


// ========== 編集モード ==========
function enterEditMode() {
  state.isEditMode = true;
  document.body.classList.add('edit-mode');
  document.getElementById('edit-banner').hidden = false;
  const fab = document.getElementById('admin-fab');
  fab.innerHTML = '<i class="fa-solid fa-lock-open"></i>';
  fab.classList.add('active');
  fab.title = '編集モードを終了';
  renderAllSections();
  renderNotices(state.allNotices);
}

function exitEditMode() {
  state.isEditMode = false;
  document.body.classList.remove('edit-mode');
  document.getElementById('edit-banner').hidden = true;
  const fab = document.getElementById('admin-fab');
  fab.innerHTML = '<i class="fa-solid fa-lock"></i>';
  fab.classList.remove('active');
  fab.title = '管理者ログイン';
  renderAllSections();
  renderNotices(state.allNotices);
}


// ========== カード編集モーダル ==========
function openCardModal(docId, categoryId = null, isPrivate = false, privateSectionDocId = null, parentId = null) {
  state.editingDocId = docId;
  state.editingCategory = categoryId;
  state.editingIsPrivate = isPrivate;
  state.editingPrivateSectionDocId = privateSectionDocId;
  state.editingParentId = parentId;

  const card = docId
    ? (isPrivate ? state.privateCards.find(c => c.id === docId) : state.allCards.find(c => c.id === docId))
    : null;
  const isSVG = card?.icon?.startsWith('svg:');

  document.getElementById('card-modal-title').textContent = docId ? 'カードを編集' : 'カードを追加';
  document.getElementById('card-delete').style.display = docId ? 'inline-flex' : 'none';
  document.getElementById('edit-icon-group').style.display = '';
  document.getElementById('icon-picker').style.display = isSVG ? 'none' : '';

  const currentIcon = card ? card.icon : 'fa-solid fa-star';
  document.getElementById('edit-label').value = card ? card.label : '';
  document.getElementById('edit-icon').value  = currentIcon;
  document.getElementById('edit-url').value   = card ? card.url   : '';
  updateIconPreview(currentIcon);
  if (!isSVG) buildIconPicker(currentIcon);

  document.getElementById('card-modal').classList.add('visible');
  setTimeout(() => document.getElementById('edit-label').focus(), 100);
}

function closeCardModal() {
  document.getElementById('card-modal').classList.remove('visible');
  state.editingDocId = null;
  state.editingCategory = null;
  state.editingIsPrivate = false;
  state.editingPrivateSectionDocId = null;
  state.editingParentId = null;
}

function updateIconPreview(iconClass) {
  const el = document.getElementById('icon-preview');
  if (!iconClass) { el.innerHTML = ''; return; }
  if (iconClass.startsWith('svg:')) {
    const imgHtml = SVG_ICONS[iconClass] || '';
    el.innerHTML = imgHtml
      ? `<div style="width:32px;height:32px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.15)">${imgHtml}</div>`
      : '<span style="font-size:0.65rem;opacity:0.5">SVG</span>';
  } else {
    el.innerHTML = `<i class="${iconClass}"></i>`;
  }
}

function buildIconPicker(selectedIcon) {
  const picker = document.getElementById('icon-picker');
  picker.innerHTML = '';

  ICON_PICKER_LIST.forEach(({ icon, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-picker-btn' + (icon === selectedIcon ? ' selected' : '');
    btn.innerHTML = `<i class="${icon}"></i>`;
    btn.dataset.label = label;
    btn.title = label;

    btn.addEventListener('click', () => {
      picker.querySelectorAll('.icon-picker-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('edit-icon').value = icon;
      updateIconPreview(icon);
    });

    picker.appendChild(btn);
  });

  const selected = picker.querySelector('.selected');
  if (selected) selected.scrollIntoView({ block: 'nearest' });
}


// ========== PIN モーダル ==========
function openPinModal(isSetup) {
  const modal = document.getElementById('pin-modal');
  modal.dataset.mode = isSetup ? 'setup' : 'login';
  document.getElementById('pin-modal-title').textContent = isSetup ? '初回 PIN 設定' : '管理者認証';
  document.getElementById('pin-modal-desc').textContent  = isSetup ? '使用する4桁のPINを設定してください' : '4桁のPINを入力してください';
  document.getElementById('pin-confirm-group').style.display = isSetup ? '' : 'none';
  document.querySelectorAll('.pin-digit, .pin-digit-confirm').forEach(el => {
    el.value = '';
    el.classList.remove('error');
  });
  document.getElementById('pin-error').textContent = '';
  modal.classList.add('visible');
  setTimeout(() => document.querySelector('.pin-digit').focus(), 100);
}

function closePinModal() {
  document.getElementById('pin-modal').classList.remove('visible');
}


// ========== サービスピッカー ==========
function openServicePicker() {
  const grid = document.getElementById('service-picker-grid');
  const addedUrls = new Set(
    state.allCards.filter(c => c.isExternalTool || c.category === 'external').map(c => c.url)
  );

  grid.innerHTML = PRESET_SERVICES.map(svc => {
    const isAdded = addedUrls.has(svc.url);
    const iconHtml = svc.icon.startsWith('svg:')
      ? (SVG_ICONS[svc.icon] || '')
      : `<i class="${svc.icon}" style="font-size:1.8rem;color:var(--accent-cyan)"></i>`;
    return `
      <button class="svc-pick-btn${isAdded ? ' svc-added' : ''}"
        data-url="${esc(svc.url)}" data-icon="${esc(svc.icon)}" data-label="${esc(svc.label)}"
        ${isAdded ? 'disabled' : ''}>
        <div class="svc-pick-icon">${iconHtml}</div>
        <span class="svc-pick-label">${svc.label}</span>
        ${isAdded ? '<span class="svc-added-badge">追加済</span>' : ''}
      </button>`;
  }).join('') + `
    <button class="svc-pick-btn svc-pick-custom" id="svc-custom-btn">
      <div class="svc-pick-icon svc-pick-custom-icon"><i class="fa-solid fa-pen-to-square"></i></div>
      <span class="svc-pick-label">カスタム</span>
    </button>`;

  grid.querySelectorAll('.svc-pick-btn:not([disabled]):not(.svc-pick-custom)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { url, icon, label } = btn.dataset;
      await addCard({ label, icon, url, category: 'external', isExternalTool: true, categoryOrder: 0 });
      closeServicePicker();
    });
  });

  document.getElementById('svc-custom-btn').addEventListener('click', () => {
    closeServicePicker();
    openCardModal(null, 'external');
  });

  document.getElementById('service-picker-modal').classList.add('visible');
}

function closeServicePicker() {
  document.getElementById('service-picker-modal').classList.remove('visible');
}


// ========== 天気パネル ==========
const WINDY_URL = `https://embed.windy.com/embed2.html?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&detailLat=${WEATHER_LAT}&detailLon=${WEATHER_LON}&zoom=9&level=surface&overlay=rain&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;
const SOLAR_SRC = 'https://mierukaweb.energymntr.com/48429893PZ';

function openWeatherPanel(tab) {
  const widget = document.getElementById('weather-widget');
  const panel  = document.getElementById('weather-panel');
  if (!widget || !panel) return;
  widget.removeAttribute('hidden');
  panel.removeAttribute('hidden');
  switchWeatherTab(tab);
  const current = document.getElementById('weather-current');
  if (current && !current.innerHTML.trim()) fetchAndRenderWeather();
  setTimeout(() => widget.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function closeWeatherPanel() {
  const panel   = document.getElementById('weather-panel');
  const content = document.getElementById('wpanel-content');
  const widget  = document.getElementById('weather-widget');
  if (panel)   panel.setAttribute('hidden', '');
  if (content) content.innerHTML = '';
  if (widget)  widget.setAttribute('hidden', '');
}

function switchWeatherTab(tab) {
  document.querySelectorAll('.wpanel-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  const src = tab === 'radar' ? WINDY_URL : SOLAR_SRC;
  document.getElementById('wpanel-external').href = src;
  document.getElementById('wpanel-content').innerHTML =
    `<iframe src="${src}" class="wpanel-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" allowfullscreen></iframe>`;
}


// ========== 天気 ==========
function calcHeatIndex(tempC, humidity) {
  if (tempC < 27) return tempC;
  const T = tempC, RH = humidity;
  return -8.78469475556 + 1.61139411*T + 2.33854883889*RH
    - 0.14611605*T*RH - 0.012308094*T*T - 0.0164248277778*RH*RH
    + 0.002211732*T*T*RH + 0.00072546*T*RH*RH - 0.000003582*T*T*RH*RH;
}

function getHeatLevel(hi) {
  if (hi >= 40) return { level: 'danger',    label: '危険',    icon: '🔴', color: '#c0392b', glow: 'rgba(255,94,160,0.55)', textColor: '#fff' };
  if (hi >= 35) return { level: 'warning',   label: '厳重警戒', icon: '🟠', color: '#d35400', glow: 'rgba(255,140,66,0.55)', textColor: '#fff' };
  if (hi >= 31) return { level: 'caution',   label: '警戒',    icon: '🟡', color: '#d4ac00', glow: 'rgba(230,200,0,0.4)',  textColor: '#1a1a00' };
  if (hi >= 28) return { level: 'attention', label: '注意',    icon: '🟢', color: '#00a888', glow: 'rgba(0,212,170,0.4)',  textColor: '#fff' };
  return { level: 'safe', label: 'ほぼ安全', icon: '✅', color: 'rgba(255,255,255,0.12)', glow: 'transparent', textColor: 'var(--text-secondary)' };
}

const OWM_ICON_MAP = {
  '01d':'☀️','01n':'🌙','02d':'🌤','02n':'🌤',
  '03d':'☁️','03n':'☁️','04d':'☁️','04n':'☁️',
  '09d':'🌧','09n':'🌧','10d':'🌦','10n':'🌦',
  '11d':'⛈','11n':'⛈','13d':'❄️','13n':'❄️',
  '50d':'🌫','50n':'🌫'
};

async function fetchAndRenderWeather() {
  const currentEl = document.getElementById('weather-current');
  const forecastEl = document.getElementById('weather-forecast');
  const updatedEl = document.getElementById('weather-updated');
  if (!currentEl) return;

  try {
    const [curRes, frcRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&appid=${WEATHER_API_KEY}&units=metric&lang=ja`),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&appid=${WEATHER_API_KEY}&units=metric&lang=ja&cnt=9`)
    ]);

    if (!curRes.ok || !frcRes.ok) throw new Error('API エラー');

    const cur = await curRes.json();
    const frc = await frcRes.json();

    const temp = Math.round(cur.main.temp);
    const feels = Math.round(cur.main.feels_like);
    const humidity = cur.main.humidity;
    const wind = (cur.wind.speed).toFixed(1);
    const desc = cur.weather[0].description;
    const iconCode = cur.weather[0].icon;
    const emoji = OWM_ICON_MAP[iconCode] || '🌡';
    const hi = calcHeatIndex(cur.main.temp, humidity);
    const heat = getHeatLevel(hi);

    currentEl.innerHTML = `
      <div class="weather-main">
        <div class="weather-emoji">${emoji}</div>
        <div class="weather-temp">${temp}<span class="weather-unit">°C</span></div>
        <div class="weather-desc">${desc}</div>
      </div>
      <div class="weather-details">
        <div class="weather-detail-item"><i class="fa-solid fa-droplet"></i> ${humidity}%</div>
        <div class="weather-detail-item"><i class="fa-solid fa-wind"></i> ${wind}m/s</div>
        <div class="weather-detail-item"><i class="fa-solid fa-temperature-half"></i> 体感 ${feels}°C</div>
      </div>
      <div class="heat-badge level-${heat.level}"
           style="background:${heat.color};color:${heat.textColor};--heat-glow:${heat.glow}">
        <span class="heat-badge-icon">${heat.icon}</span>
        <div class="heat-badge-body">
          <span class="heat-badge-title">熱中症危険度</span>
          <span class="heat-badge-level">${heat.label}</span>
        </div>
      </div>
    `;

    if (forecastEl) {
      forecastEl.innerHTML = '';
      frc.list.slice(1, 9).forEach(item => {
        const dt = new Date(item.dt * 1000);
        const h = dt.getHours().toString().padStart(2, '0');
        const m = dt.getMonth() + 1;
        const d = dt.getDate();
        const ico = OWM_ICON_MAP[item.weather[0].icon] || '🌡';
        const t = Math.round(item.main.temp);
        const fItem = document.createElement('div');
        fItem.className = 'forecast-item';
        fItem.innerHTML = `
          <div class="forecast-time">${m}/${d} ${h}時</div>
          <div class="forecast-icon">${ico}</div>
          <div class="forecast-temp">${t}°</div>
          <div class="forecast-hum"><i class="fa-solid fa-droplet" style="font-size:0.6rem"></i>${item.main.humidity}%</div>
        `;
        forecastEl.appendChild(fItem);
      });
    }

    if (updatedEl) {
      const now = new Date();
      updatedEl.textContent = `${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')} 更新`;
    }

  } catch (err) {
    console.error('天気取得エラー:', err);
    currentEl.innerHTML = '<div class="weather-error"><i class="fa-solid fa-circle-exclamation"></i> 天気情報を取得できませんでした</div>';
  }
}


// ========== コンテキストメニュー ==========
let activeContextMenu = null;

function showContextMenu(e, card) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'card-context-menu';
  const x = Math.min(e.clientX, window.innerWidth - 170);
  const y = Math.min(e.clientY, window.innerHeight - 90);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.innerHTML = `
    <button class="ctx-item ctx-edit"><i class="fa-solid fa-pen"></i> 編集</button>
    <button class="ctx-item ctx-add-child"><i class="fa-solid fa-sitemap"></i> 子カードを追加</button>
    <button class="ctx-item ctx-delete"><i class="fa-solid fa-trash"></i> 削除</button>
  `;
  menu.querySelector('.ctx-edit').addEventListener('click', e => {
    e.stopPropagation();
    closeContextMenu();
    if (card.isPrivate) {
      openCardModal(card.id, null, true, card.sectionId);
    } else {
      openCardModal(card.id);
    }
  });
  menu.querySelector('.ctx-add-child').addEventListener('click', e => {
    e.stopPropagation();
    closeContextMenu();
    if (card.isPrivate) {
      openCardModal(null, null, true, card.sectionId, card.id);
    } else {
      openCardModal(null, card.category, false, null, card.id);
    }
  });
  menu.querySelector('.ctx-delete').addEventListener('click', async e => {
    e.stopPropagation();
    closeContextMenu();
    if (await confirmDelete(`「${card.label}」を削除しますか？`)) {
      if (card.isPrivate) {
        await deletePrivateCard(card.id);
      } else {
        await deleteCard(card.id);
      }
    }
  });
  document.body.appendChild(menu);
  activeContextMenu = menu;
}

function closeContextMenu() {
  if (activeContextMenu) { activeContextMenu.remove(); activeContextMenu = null; }
}


// ========== お気に入りのみ表示 ==========
function applyFavoritesOnlyMode() {
  document.querySelector('.main').classList.toggle('favorites-only', state.favoritesOnlyMode);
  const btn = document.getElementById('btn-favorites-only');
  if (!btn) return;
  if (state.favoritesOnlyMode) {
    btn.classList.add('active');
    btn.title = 'すべて表示';
    btn.innerHTML = '<i class="fa-solid fa-star"></i><span class="btn-fav-label">すべて表示</span>';
  } else {
    btn.classList.remove('active');
    btn.title = 'お気に入りのみ表示';
    btn.innerHTML = '<i class="fa-regular fa-star"></i><span class="btn-fav-label">お気に入りのみ</span>';
  }
  renderFavorites();
}

function toggleFavoritesOnly() {
  state.favoritesOnlyMode = !state.favoritesOnlyMode;
  savePreferencesToFirestore();
  applyFavoritesOnlyMode();
}


// ========== セクションまとめてお気に入り ==========
function toggleSectionFavorite(catId, isPrivate = false) {
  const catCards = isPrivate
    ? state.privateCards.filter(c => c.sectionId === catId)
    : state.allCards.filter(c => c.category === catId);
  if (!catCards.length) return;
  const favs = getFavorites();
  const allFaved = catCards.every(c => favs.includes(c.id));
  let newFavs;
  if (allFaved) {
    newFavs = favs.filter(id => !catCards.some(c => c.id === id));
  } else {
    newFavs = [...new Set([...favs, ...catCards.map(c => c.id)])];
  }
  setFavorites(newFavs);
  renderFavorites();
  catCards.forEach(card => {
    document.querySelectorAll(`.btn-favorite[data-id="${card.id}"]`).forEach(b => {
      const active = newFavs.includes(card.id);
      b.classList.toggle('active', active);
      b.innerHTML = `<i class="fa-${active ? 'solid' : 'regular'} fa-star"></i>`;
    });
  });
  const sectionEl = isPrivate
    ? document.getElementById(`section-priv-${catId}`)
    : document.getElementById(`section-${catId}`);
  if (sectionEl) {
    const sBtn = sectionEl.querySelector('.btn-section-favorite');
    if (sBtn) {
      const nowAllFaved = catCards.every(c => newFavs.includes(c.id));
      sBtn.classList.toggle('active', nowAllFaved);
      sBtn.title = nowAllFaved ? 'まとめて解除' : 'セクションをまとめてお気に入り';
      sBtn.innerHTML = `<i class="fa-${nowAllFaved ? 'solid' : 'regular'} fa-star"></i>`;
    }
  }
}


// ========== 検索 ==========
function normalizeForSearch(s) {
  return (s || '').normalize('NFKC').toLowerCase();
}

function initSearch() {
  const searchInput = document.getElementById('search-input');
  const container   = searchInput.closest('.search-container');
  const noResults   = document.getElementById('no-results');

  container.addEventListener('click', () => searchInput.focus());

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchInput.blur();
      searchInput.dispatchEvent(new Event('input'));
    }
  });

  searchInput.addEventListener('input', () => {
    const raw = searchInput.value.trim();
    const q = normalizeForSearch(raw);
    container.classList.toggle('has-value', raw.length > 0);
    let total = 0;

    const directRootIds  = new Set();
    const childOnlyRootIds = new Set();

    if (q) {
      const allData = [...(state.allCards || []), ...(state.privateCards || [])];
      allData.forEach(card => {
        if (!normalizeForSearch(card.label).includes(q)) return;
        if (!card.parentId) {
          directRootIds.add(card.id);
        } else {
          let cur = card;
          while (cur && cur.parentId) {
            cur = allData.find(c => c.id === cur.parentId) || null;
          }
          if (cur && !cur.parentId) {
            if (!directRootIds.has(cur.id)) childOnlyRootIds.add(cur.id);
          }
        }
      });
    }

    document.querySelectorAll('.category-section:not(#favorites-section)').forEach(section => {
      let visible = 0;
      section.querySelectorAll('.link-card').forEach(cardEl => {
        const cardId = cardEl.dataset.docId;
        let match, isChildOnly = false;
        if (!q) {
          match = true;
        } else if (directRootIds.has(cardId)) {
          match = true;
        } else if (childOnlyRootIds.has(cardId)) {
          match = true;
          isChildOnly = true;
        } else {
          match = false;
        }
        cardEl.classList.toggle('hidden', !match);
        cardEl.classList.toggle('search-child-match', isChildOnly);
        if (match) visible++;
      });
      const countEl = section.querySelector('.category-count');
      if (countEl) countEl.textContent = `${visible} 件`;
      section.classList.toggle('hidden', visible === 0 && !!q);
      total += visible;
    });

    document.querySelectorAll('.external-card').forEach(card => {
      const match = !q || normalizeForSearch(card.querySelector('.external-label')?.textContent).includes(q);
      card.classList.toggle('hidden', !match);
    });

    noResults.classList.toggle('visible', total === 0 && !!q);
  });
}


// ========== 時計 ==========
function updateClock() {
  const now = new Date();
  const clockEl = document.getElementById('header-clock');
  if (clockEl) {
    clockEl.textContent =
      now.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }) +
      ' ' + now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}


// ========== PIN 送信処理 ==========
async function handlePinSubmit() {
  const now = Date.now();
  if (now < state.lockoutUntil) {
    document.getElementById('pin-error').textContent = `${Math.ceil((state.lockoutUntil - now) / 1000)}秒後に再試行してください`;
    return;
  }

  const digits = [...document.querySelectorAll('.pin-digit')].map(el => el.value).join('');
  if (digits.length !== 4) {
    document.getElementById('pin-error').textContent = '4桁のPINを入力してください';
    return;
  }

  const mode = document.getElementById('pin-modal').dataset.mode;

  if (mode === 'setup') {
    const confirm2 = [...document.querySelectorAll('.pin-digit-confirm')].map(el => el.value).join('');
    if (digits !== confirm2) {
      document.getElementById('pin-error').textContent = 'PINが一致しません';
      document.querySelectorAll('.pin-digit-confirm').forEach(el => {
        el.value = '';
        el.classList.add('error');
        setTimeout(() => el.classList.remove('error'), 500);
      });
      return;
    }
    await setPIN(digits);
    closePinModal();
    enterEditMode();
  } else {
    const btn = document.getElementById('pin-submit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      const ok = await verifyPIN(digits);
      if (ok) {
        state.failedAttempts = 0;
        closePinModal();
        enterEditMode();
      } else {
        state.failedAttempts++;
        if (state.failedAttempts >= 3) {
          state.lockoutUntil = Date.now() + 30000;
          state.failedAttempts = 0;
          document.getElementById('pin-error').textContent = '3回失敗。30秒後に再試行してください';
        } else {
          document.getElementById('pin-error').textContent = `PINが違います（残り${3 - state.failedAttempts}回）`;
        }
        document.querySelectorAll('.pin-digit').forEach(el => {
          el.value = '';
          el.classList.add('error');
          setTimeout(() => el.classList.remove('error'), 500);
        });
        document.querySelector('.pin-digit').focus();
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '認証';
    }
  }
}


// ========== 表示設定（テーマ・文字サイズ） ==========
const THEMES     = ['dark', 'light', 'warm'];
const FONTSIZES  = ['font-sm', 'font-md', 'font-lg', 'font-xl'];

function applyTheme(theme, save = true) {
  const t = THEMES.includes(theme) ? theme : 'dark';
  document.body.setAttribute('data-theme', t);
  document.querySelectorAll('#theme-grid .theme-card').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === t);
  });
  localStorage.setItem('portal-theme', t);
  if (save) savePreferencesToFirestore();
}

function applyFontSize(sizeClass, save = true) {
  const s = sizeClass || 'font-md';
  FONTSIZES.forEach(c => document.documentElement.classList.remove(c));
  document.documentElement.classList.add(s);
  document.querySelectorAll('#fontsize-grid .fontsize-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === s);
  });
  localStorage.setItem('portal-font-size', s);
  if (save) savePreferencesToFirestore();
}

function loadSettings() {
  const theme    = localStorage.getItem('portal-theme')     || 'dark';
  const fontSize = localStorage.getItem('portal-font-size') || 'font-md';
  applyTheme(theme);
  applyFontSize(fontSize);
}

function openSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  panel.removeAttribute('hidden');
  document.getElementById('settings-fab').classList.add('active');
}

function closeSettingsPanel() {
  document.getElementById('settings-panel').setAttribute('hidden', '');
  document.getElementById('settings-fab').classList.remove('active');
}


// ========== 初期化 ==========
document.addEventListener('DOMContentLoaded', async () => {
  // 最初に設定を適用（フラッシュ防止）
  loadSettings();

  updateClock();
  setInterval(updateClock, 1000);

  // 常に編集モード
  document.body.classList.add('edit-mode');

  // まず初期データで即時描画
  state.allCards = INITIAL_CARDS.map((c, i) => ({ id: `init-${i}`, ...c }));
  renderAllSections();
  initSearch();
  renderFavorites();

  // お知らせリアクションを先行読み込み
  loadAllNoticeReactions();

  // 天気は即時取得（30分ごと更新）
  fetchAndRenderWeather();
  setInterval(fetchAndRenderWeather, 30 * 60 * 1000);

  // ===== 天気パネル =====
  document.getElementById('wpanel-close').addEventListener('click', closeWeatherPanel);
  document.getElementById('tab-radar').addEventListener('click', () => switchWeatherTab('radar'));
  document.getElementById('tab-solar').addEventListener('click', () => switchWeatherTab('solar'));

  // ===== 太陽光発電カード =====
  document.addEventListener('click', e => {
    const card = e.target.closest('[data-solar-open]');
    if (card) {
      e.preventDefault();
      openWeatherPanel('solar');
    }
  });

  // ===== 使い方ガイド =====
  document.getElementById('help-fab').addEventListener('click', () => {
    document.getElementById('guide-modal').classList.add('visible');
  });
  document.getElementById('guide-close').addEventListener('click', () => {
    document.getElementById('guide-modal').classList.remove('visible');
  });
  document.getElementById('guide-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('guide-modal').classList.remove('visible');
  });

  // ===== サービスピッカー =====
  document.getElementById('service-picker-cancel').addEventListener('click', closeServicePicker);
  document.getElementById('service-picker-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeServicePicker();
  });

  // Firestore 読み込み
  try {
    await migrateIfNeeded();
    await migrateCategories();
    await migrateAddBox();
    await loadCategories();
    subscribeNotices();
    subscribeCards();
  } catch (err) {
    console.error('Firestore エラー:', err);
  }

  // お気に入りのみ表示ボタン
  document.getElementById('btn-favorites-only').addEventListener('click', toggleFavoritesOnly);
  applyFavoritesOnlyMode();

  // ===== ニックネーム =====
  document.getElementById('btn-user').addEventListener('click', () => showUsernameModal(true));
  updateUsernameDisplay();

  document.getElementById('username-submit').addEventListener('click', () => {
    const name = document.getElementById('username-input').value.trim();
    if (!name) { document.getElementById('username-input').focus(); return; }
    saveUsername(name);
  });
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('username-submit').click();
  });
  document.getElementById('username-input').addEventListener('input', hideUsernameError);
  document.getElementById('username-reclaim').addEventListener('click', async () => {
    const name = document.getElementById('username-input').value.trim();
    if (name) await applyUsername(name);
  });
  document.getElementById('username-skip').addEventListener('click', closeUsernameModal);

  // ===== ロックボタン =====
  document.getElementById('btn-lock-header').addEventListener('click', lockPortal);

  // ロック画面テンキー
  document.querySelectorAll('.lock-key[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => handleLockKeyPress(btn.dataset.digit));
  });
  document.getElementById('lock-key-del').addEventListener('click', handleLockDelete);
  document.getElementById('btn-lock-switch-user').addEventListener('click', lockSwitchUser);

  // キーボードでもPIN入力
  document.addEventListener('keydown', e => {
    if (document.getElementById('lock-screen').hidden) return;
    if (/^[0-9]$/.test(e.key)) handleLockKeyPress(e.key);
    if (e.key === 'Backspace') handleLockDelete();
  });

  // セキュリティ設定
  document.getElementById('btn-open-security').addEventListener('click', () => {
    closeUsernameModal();
    openSecurityModal();
  });
  document.getElementById('security-cancel').addEventListener('click', closeSecurityModal);

  // ロック機能 ON/OFF トグル
  document.getElementById('lock-enabled-toggle').addEventListener('change', async e => {
    state.lockEnabled = e.target.checked;
    document.getElementById('security-autolock-section').hidden = !state.lockEnabled;
    document.getElementById('btn-lock-header').hidden = !(state.lockEnabled && state.lockPinEnabled && state.currentUsername);
    if (state.lockEnabled && state.lockPinEnabled) {
      startActivityTracking();
    } else {
      stopActivityTracking();
    }
    await saveLockSettings();
  });

  // 自動ロック時間
  document.getElementById('autolock-time-grid').addEventListener('click', async e => {
    const btn = e.target.closest('.autolock-time-btn');
    if (!btn) return;
    state.autoLockMinutes = parseInt(btn.dataset.minutes);
    document.querySelectorAll('.autolock-time-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.lastActivityAt = Date.now();
    await saveLockSettings();
  });

  // 管理者パネル
  document.getElementById('btn-open-admin').addEventListener('click', () => {
    closeSettingsPanel();
    openAdminModal();
  });
  document.getElementById('admin-cancel').addEventListener('click', closeAdminModal);
  document.getElementById('admin-close').addEventListener('click', closeAdminModal);
  document.getElementById('admin-auth-btn').addEventListener('click', async () => {
    const pin   = document.getElementById('admin-pin-input').value;
    const errEl = document.getElementById('admin-auth-error');
    errEl.hidden = true;
    const ok = await verifyPIN(pin);
    if (ok) {
      document.getElementById('admin-auth-area').hidden  = true;
      document.getElementById('admin-panel-area').hidden = false;
      loadUsersForAdmin();
      renderAdminSuggBoxSection();
    } else {
      errEl.hidden = false;
    }
  });
  document.getElementById('admin-pin-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('admin-auth-btn').click();
  });

  // 管理者PIN初回設定
  document.getElementById('admin-setup-btn').addEventListener('click', async () => {
    const pin     = document.getElementById('admin-new-pin').value;
    const confirm = document.getElementById('admin-new-pin-confirm').value;
    const errEl   = document.getElementById('admin-setup-error');
    errEl.hidden  = true;
    if (!/^\d{4,6}$/.test(pin))  { errEl.textContent = '4〜6桁の数字を入力してください'; errEl.hidden = false; return; }
    if (pin !== confirm)          { errEl.textContent = 'PINが一致しません';               errEl.hidden = false; return; }
    await setPIN(pin);
    document.getElementById('admin-setup-area').hidden = true;
    document.getElementById('admin-panel-area').hidden = false;
    loadUsersForAdmin();
    renderAdminSuggBoxSection();
  });
  document.getElementById('admin-setup-cancel').addEventListener('click', closeAdminModal);

  // PIN設定
  document.getElementById('btn-set-pin').addEventListener('click', async () => {
    const newPin  = document.getElementById('new-pin-input').value;
    const confirm = document.getElementById('confirm-pin-input').value;
    const errEl   = document.getElementById('security-pin-error');
    errEl.hidden  = true;
    if (!/^\d{4}$/.test(newPin))   { errEl.textContent = '4桁の数字を入力してください'; errEl.hidden = false; return; }
    if (newPin !== confirm)         { errEl.textContent = 'PINが一致しません';           errEl.hidden = false; return; }
    if (!state.currentUsername)     { errEl.textContent = 'ユーザーネームを設定してください'; errEl.hidden = false; return; }
    try {
      await setLockPin(newPin);
      closeSecurityModal();
      const btn = document.getElementById('btn-lock-header');
      btn.classList.add('lock-set-flash');
      setTimeout(() => btn.classList.remove('lock-set-flash'), 1000);
    } catch (_) { errEl.textContent = '設定に失敗しました'; errEl.hidden = false; }
  });

  // PIN変更
  document.getElementById('btn-change-pin').addEventListener('click', async () => {
    const cur    = document.getElementById('current-pin-input').value;
    const errEl  = document.getElementById('security-current-error');
    errEl.hidden = true;
    const hash   = await hashPIN(cur);
    if (hash !== state.lockPinHash) { errEl.textContent = 'PINが正しくありません'; errEl.hidden = false; return; }
    document.getElementById('security-manage-area').hidden = true;
    document.getElementById('security-setup-area').hidden  = false;
    document.getElementById('new-pin-input').value    = '';
    document.getElementById('confirm-pin-input').value = '';
    document.getElementById('security-pin-error').hidden = true;
    document.getElementById('new-pin-input').focus();
  });

  // PIN解除
  document.getElementById('btn-remove-pin').addEventListener('click', async () => {
    const cur    = document.getElementById('current-pin-input').value;
    const errEl  = document.getElementById('security-current-error');
    errEl.hidden = true;
    const hash   = await hashPIN(cur);
    if (hash !== state.lockPinHash) { errEl.textContent = 'PINが正しくありません'; errEl.hidden = false; return; }
    await removeLockPin();
    closeSecurityModal();
  });

  // 初回訪問時にニックネームモーダル
  if (!state.currentUsername) {
    setTimeout(() => showUsernameModal(false), 600);
    renderTodoSection();
  } else {
    loadPersonalData(state.currentUsername);
  }

  // ===== TODO パネル =====
  document.getElementById('todo-toggle-btn').addEventListener('click', () => {
    state.todoCollapsed = !state.todoCollapsed;
    renderTodoSection();
  });

  document.getElementById('todo-add-btn').addEventListener('click', async () => {
    const input  = document.getElementById('todo-input');
    const due    = document.getElementById('todo-due-select');
    const text   = input.value.trim();
    if (!text) { input.focus(); return; }
    await addTodo(text, due.value);
    input.value = '';
    due.value   = '';
    input.focus();
  });

  document.getElementById('todo-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('todo-add-btn').click();
  });

  // ===== メール返信アシスタント =====
  document.getElementById('btn-email-assist').addEventListener('click', openEmailModal);
  document.getElementById('email-modal-close').addEventListener('click', closeEmailModal);
  document.getElementById('email-profile-save').addEventListener('click', saveEmailProfile);
  document.getElementById('email-profile-delete').addEventListener('click', deleteEmailProfile);
  document.getElementById('email-profile-add').addEventListener('click', addEmailProfile);
  document.getElementById('email-generate').addEventListener('click', generateEmailReply);
  document.getElementById('btn-copy-output').addEventListener('click', copyEmailOutput);
  document.getElementById('btn-reset-output').addEventListener('click', resetEmailOutput);
  document.getElementById('email-api-key-save').addEventListener('click', saveGeminiApiKey);
  document.querySelectorAll('.email-tab').forEach(btn => {
    btn.addEventListener('click', () => switchEmailTab(btn.dataset.tab));
  });
  document.getElementById('ep-save').addEventListener('click', saveUserEmailProfile);
  document.getElementById('ep-reset-sig').addEventListener('click', resetSignatureTemplate);
  document.getElementById('ep-signature').addEventListener('input', e => updateSignaturePreview(e.target.value));

  // ===== チャットFAB =====
  document.getElementById('chat-fab').addEventListener('click', () => {
    state.chatPanelOpen ? closeChatPanel() : openChatPanel();
  });
  document.getElementById('chat-panel-close').addEventListener('click', closeChatPanel);
  initChatResize();
  document.getElementById('chat-tab-dm').addEventListener('click', () => switchChatSidebarTab('dm'));
  document.getElementById('chat-tab-group').addEventListener('click', () => switchChatSidebarTab('group'));
  document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // ===== チャット内ショートカット =====
  document.getElementById('chat-launch-task').addEventListener('click', openTaskModal);
  document.getElementById('chat-launch-ft').addEventListener('click', openFileTransferPanel);

  // ===== 説明文折りたたみ（P2P / Drive） =====
  ['p2p', 'drive'].forEach(type => {
    const btn  = document.getElementById(`ft-${type}-desc-toggle`);
    const desc = document.getElementById(`ft-${type}-desc`);
    if (!btn || !desc) return;
    const lsKey = `ft-${type}-desc-collapsed`;
    if (localStorage.getItem(lsKey) === '1') desc.classList.add('collapsed');
    btn.addEventListener('click', () => {
      const collapsed = desc.classList.toggle('collapsed');
      localStorage.setItem(lsKey, collapsed ? '1' : '0');
    });
  });

  // ===== ファイル転送 =====
  document.getElementById('ft-fab').addEventListener('click', () => {
    state._ftPanelOpen ? closeFileTransferPanel() : openFileTransferPanel();
  });
  document.getElementById('ft-panel-close').addEventListener('click', closeFileTransferPanel);
  document.getElementById('ft-new-btn').addEventListener('click', openFtSendModal);
  document.getElementById('ft-cancel-btn').addEventListener('click', closeFtSendModal);
  document.getElementById('ft-confirm-btn').addEventListener('click', confirmFtSend);

  // ===== Drive シェア =====
  document.querySelectorAll('.ft-tab').forEach(btn =>
    btn.addEventListener('click', () => switchFtTab(btn.dataset.tab)));
  document.getElementById('ft-drive-send-btn').addEventListener('click', openDriveSendModal);
  document.getElementById('ft-drive-cancel-btn').addEventListener('click', closeDriveSendModal);
  document.getElementById('ft-drive-confirm-btn').addEventListener('click', confirmDriveSend);
  // インラインDriveリンクウィジェット初期化（loadPersonalData完了後に呼ばれる）
  initDriveLinkWidget();

  // ファイル送信モーダル: ファイル選択
  document.getElementById('ft-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    state._ftSelectedFile = file;
    const selEl = document.getElementById('ft-selected-file');
    selEl.innerHTML = `<i class="fa-solid ${getFileIcon(file.type)}"></i> ${esc(file.name)} <span style="color:var(--text-muted)">(${formatFileSize(file.size)})</span>`;
    selEl.hidden = false;
    document.getElementById('ft-confirm-btn').hidden = false;
  });

  // ドラッグ&ドロップ
  const dropZone = document.getElementById('ft-file-drop');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      state._ftSelectedFile = file;
      const selEl = document.getElementById('ft-selected-file');
      selEl.innerHTML = `<i class="fa-solid ${getFileIcon(file.type)}"></i> ${esc(file.name)} <span style="color:var(--text-muted)">(${formatFileSize(file.size)})</span>`;
      selEl.hidden = false;
      document.getElementById('ft-confirm-btn').hidden = false;
    });
  }

  // ===== 新規DM/グループ =====
  document.getElementById('btn-new-dm').addEventListener('click', openNewDmModal);
  document.getElementById('new-dm-cancel').addEventListener('click', () => {
    document.getElementById('new-dm-modal').classList.remove('visible');
  });
  document.getElementById('btn-new-group').addEventListener('click', openNewGroupModal);
  document.getElementById('new-group-cancel').addEventListener('click', () => {
    document.getElementById('new-group-modal').classList.remove('visible');
  });
  document.getElementById('new-group-create').addEventListener('click', createGroupRoom);

  // ===== 部門間依頼・目安箱 =====
  document.getElementById('btn-reqboard').addEventListener('click', () => openReqModal());
  document.getElementById('reqboard-modal-close').addEventListener('click', closeReqModal);
  document.querySelectorAll('.reqboard-tab').forEach(btn => {
    btn.addEventListener('click', () => switchReqTab(btn.dataset.tab));
  });
  document.querySelectorAll('.reqboard-subtab').forEach(btn => {
    btn.addEventListener('click', () => switchReqSubTab(btn.dataset.subtab));
  });
  document.getElementById('req-status-cancel').addEventListener('click', () => {
    document.getElementById('req-status-modal').classList.remove('visible');
    state._pendingStatusChange = null;
  });
  document.getElementById('req-status-ok').addEventListener('click', updateRequestStatus);
  document.getElementById('sugg-reply-cancel').addEventListener('click', () => {
    document.getElementById('sugg-reply-modal').classList.remove('visible');
    state._pendingSuggReply = null;
  });
  document.getElementById('sugg-reply-ok').addEventListener('click', sendSuggReply);
  document.getElementById('admin-suggbox-add-btn').addEventListener('click', addSuggBoxViewer);
  document.getElementById('admin-suggbox-add-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSuggBoxViewer();
  });

  // ===== カレンダー =====
  document.getElementById('btn-calendar').addEventListener('click', openCalendarModal);
  document.getElementById('cal-close-btn').addEventListener('click', closeCalendarModal);
  document.getElementById('cal-prev-btn').addEventListener('click', calPrevMonth);
  document.getElementById('cal-next-btn').addEventListener('click', calNextMonth);
  document.getElementById('cal-today-btn').addEventListener('click', calGoToday);
  document.getElementById('cal-day-cancel-btn').addEventListener('click', closeDayPanel);
  document.getElementById('cal-day-save-btn').addEventListener('click', saveDayAttendance);
  document.getElementById('cal-day-delete-btn').addEventListener('click', () => {
    const { calendarSelectedDate } = state;
    if (calendarSelectedDate) deleteAttendance(calendarSelectedDate);
  });
  // モーダル外クリックで閉じる
  document.getElementById('cal-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCalendarModal();
  });

  // ===== タスク =====
  document.getElementById('btn-task').addEventListener('click', openTaskModal);
  document.getElementById('task-modal-close').addEventListener('click', closeTaskModal);
  document.querySelectorAll('.task-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTaskTab(btn.dataset.tab));
  });
  document.getElementById('task-user-picker-cancel').addEventListener('click', () => {
    document.getElementById('task-user-picker-modal').classList.remove('visible');
  });
  document.getElementById('task-user-picker-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('task-user-picker-modal').classList.remove('visible');
  });

  // ===== ベル通知ボタン =====
  document.getElementById('btn-notice-bell').addEventListener('click', () => {
    const board = document.getElementById('notice-board');
    if (board) board.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (state.currentUsername) markAllNoticesRead();
  });

  // ===== プライベートセクションモーダル =====
  document.getElementById('private-section-cancel').addEventListener('click', closePrivateSectionModal);

  document.getElementById('private-section-icon').addEventListener('input', e => {
    const prev = document.getElementById('private-section-icon-preview');
    if (prev) prev.innerHTML = `<i class="${e.target.value.trim()}"></i>`;
  });

  document.getElementById('private-section-save').addEventListener('click', async () => {
    const label = document.getElementById('private-section-label').value.trim();
    const icon = document.getElementById('private-section-icon').value.trim() || 'fa-solid fa-star';
    if (!label) { document.getElementById('private-section-label').focus(); return; }

    const btn = document.getElementById('private-section-save');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      if (state.editingPrivateSectionId) {
        await updatePrivateSection(state.editingPrivateSectionId, { label, icon, colorIndex: state.privateSectionColorIndex });
      } else {
        await addPrivateSection({ label, icon, colorIndex: state.privateSectionColorIndex, order: state.privateCategories.length });
      }
      closePrivateSectionModal();
      renderAllSections();
    } catch (err) {
      console.error('マイセクション保存エラー:', err);
      alert('保存に失敗しました。');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存';
    }
  });

  document.getElementById('private-section-delete').addEventListener('click', async () => {
    if (!state.editingPrivateSectionId) return;
    const cat = state.privateCategories.find(c => c.docId === state.editingPrivateSectionId);
    if (await confirmDelete(`「${cat?.label}」を削除しますか？（中のカードも全て削除されます）`)) {
      const sectionCards = state.privateCards.filter(c => c.sectionId === state.editingPrivateSectionId);
      await Promise.all(sectionCards.map(c => deletePrivateCard(c.id)));
      await deletePrivateSection(state.editingPrivateSectionId);
      closePrivateSectionModal();
      renderAllSections();
    }
  });

  // コンテキストメニュー
  document.addEventListener('click', closeContextMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeContextMenu(); });

  // ===== PIN 入力フィールド =====
  const pinDigits    = [...document.querySelectorAll('.pin-digit')];
  const confirmDigits = [...document.querySelectorAll('.pin-digit-confirm')];

  [...pinDigits, ...confirmDigits].forEach(input => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      const isConfirm = input.classList.contains('pin-digit-confirm');
      const group = isConfirm ? confirmDigits : pinDigits;
      const idx = group.indexOf(input);
      if (input.value && idx < group.length - 1) group[idx + 1].focus();
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !input.value) {
        const isConfirm = input.classList.contains('pin-digit-confirm');
        const group = isConfirm ? confirmDigits : pinDigits;
        const idx = group.indexOf(input);
        if (idx > 0) group[idx - 1].focus();
      }
    });
  });

  document.getElementById('pin-cancel').addEventListener('click', closePinModal);
  document.getElementById('pin-submit').addEventListener('click', handlePinSubmit);

  // ===== カード編集モーダル =====
  document.getElementById('card-cancel').addEventListener('click', closeCardModal);
  document.getElementById('edit-icon').addEventListener('input', e => {
    const val = e.target.value.trim();
    updateIconPreview(val);
    document.querySelectorAll('#icon-picker .icon-picker-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.querySelector('i')?.className === val);
    });
  });

  document.getElementById('card-save').addEventListener('click', async () => {
    const label = document.getElementById('edit-label').value.trim();
    const icon  = document.getElementById('edit-icon').value.trim();
    const url   = document.getElementById('edit-url').value.trim();
    if (!label) { document.getElementById('edit-label').focus(); return; }

    const btn = document.getElementById('card-save');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      if (state.editingIsPrivate) {
        if (state.editingDocId) {
          await savePrivateCard(state.editingDocId, { label, icon: icon || 'fa-solid fa-star', url: url || '#' });
        } else {
          await addPrivateCard({
            label,
            icon: icon || 'fa-solid fa-star',
            url: url || '#',
            sectionId: state.editingPrivateSectionDocId,
            parentId: state.editingParentId || null,
          });
        }
      } else {
        const isStatic = !state.editingDocId || state.editingDocId.startsWith('init-');
        if (!isStatic) {
          const card = state.allCards.find(c => c.id === state.editingDocId);
          const updateData = { label, url };
          if (!card?.isExternalTool) updateData.icon = icon;
          await saveCard(state.editingDocId, updateData);
        } else {
          await addCard({
            label,
            icon:     icon || 'fa-solid fa-star',
            url:      url  || '#',
            category: state.editingCategory,
            parentId: state.editingParentId || null,
          });
        }
      }
      closeCardModal();
    } catch (err) {
      console.error('保存エラー:', err);
      alert('保存に失敗しました。もう一度お試しください。');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存';
    }
  });

  document.getElementById('card-delete').addEventListener('click', async () => {
    if (state.editingIsPrivate) {
      const card = state.privateCards.find(c => c.id === state.editingDocId);
      if (!card) return;
      if (await confirmDelete(`「${card.label}」を削除しますか？`)) {
        await deletePrivateCard(state.editingDocId);
        closeCardModal();
      }
    } else {
      const card = state.allCards.find(c => c.id === state.editingDocId);
      if (!card) return;
      if (await confirmDelete(`「${card.label}」を削除しますか？`)) {
        await deleteCard(state.editingDocId);
        closeCardModal();
      }
    }
  });

  // ===== お知らせモーダル =====
  document.getElementById('notice-cancel').addEventListener('click', closeNoticeModal);

  document.getElementById('notice-save').addEventListener('click', async () => {
    const title = document.getElementById('notice-title').value.trim();
    const body  = document.getElementById('notice-body').value.trim();
    const priority = document.getElementById('notice-priority').value;
    if (!title) { document.getElementById('notice-title').focus(); return; }

    const btn = document.getElementById('notice-save');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      await moduleSaveNotice({ title, body, priority, updatedAt: serverTimestamp() });
      closeNoticeModal();
      renderNotices(state.allNotices);
    } catch (err) {
      console.error('お知らせ保存エラー:', err);
      alert('保存に失敗しました。');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存';
    }
  });

  document.getElementById('notice-delete').addEventListener('click', async () => {
    if (!state.editingNoticeId) return;
    const n = state.allNotices.find(x => x.id === state.editingNoticeId);
    if (await confirmDelete(`「${n?.title}」を削除しますか？`)) {
      await moduleDeleteNotice(state.editingNoticeId);
      closeNoticeModal();
      renderNotices(state.allNotices);
    }
  });

  // ===== カテゴリモーダル =====
  document.getElementById('cat-cancel').addEventListener('click', closeCategoryModal);

  document.getElementById('cat-icon').addEventListener('input', e => {
    updateCatIconPreview(e.target.value.trim());
  });

  document.getElementById('cat-save').addEventListener('click', async () => {
    const label = document.getElementById('cat-label').value.trim();
    const icon  = document.getElementById('cat-icon').value.trim() || 'fa-solid fa-star';
    if (!label) { document.getElementById('cat-label').focus(); return; }

    const btn = document.getElementById('cat-save');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      if (state.editingCategoryId) {
        await updateCategoryInFirestore(state.editingCategoryId, { label, icon, colorIndex: state.selectedColorIndex });
      } else {
        const maxOrder = state.allCategories.length > 0 ? Math.max(...state.allCategories.map(c => c.order)) + 1 : 10;
        const newId = label.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') + '-' + Date.now();
        await addCategoryToFirestore({ id: newId, label, icon, colorIndex: state.selectedColorIndex, order: maxOrder, isExternal: false });
      }
      closeCategoryModal();
      renderAllSections();
    } catch (err) {
      console.error('カテゴリ保存エラー:', err);
      alert('保存に失敗しました。');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存';
    }
  });

  document.getElementById('cat-delete').addEventListener('click', async () => {
    if (!state.editingCategoryId) return;
    const cat = state.allCategories.find(c => c.docId === state.editingCategoryId);
    const hasCards = state.allCards.some(c => c.category === cat?.id);
    if (hasCards) {
      alert('このカテゴリにはカードがあります。先にカードを削除または移動してください。');
      return;
    }
    if (await confirmDelete(`「${cat?.label}」を削除しますか？`)) {
      await deleteCategoryFromFirestore(state.editingCategoryId);
      closeCategoryModal();
      renderAllSections();
    }
  });

  // ===== 設定パネル =====
  document.getElementById('settings-fab').addEventListener('click', () => {
    const panel = document.getElementById('settings-panel');
    if (panel.hasAttribute('hidden')) {
      openSettingsPanel();
    } else {
      closeSettingsPanel();
    }
  });

  document.getElementById('settings-panel-close').addEventListener('click', closeSettingsPanel);

  // テーマ選択
  document.querySelectorAll('#theme-grid .theme-card').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
    });
  });

  // 文字サイズ選択
  document.querySelectorAll('#fontsize-grid .fontsize-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyFontSize(btn.dataset.size);
    });
  });

  // パネル外クリックで閉じる
  document.addEventListener('click', e => {
    const panel = document.getElementById('settings-panel');
    const fab   = document.getElementById('settings-fab');
    if (!panel.hasAttribute('hidden') && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
      closeSettingsPanel();
    }
  });

  // ===== モーダル開閉時に body スクロールをロック =====
  const _modalScrollObserver = new MutationObserver(() => {
    const anyVisible = document.querySelector('.modal-overlay.visible') !== null;
    document.body.style.overflow = anyVisible ? 'hidden' : '';
  });
  document.querySelectorAll('.modal-overlay').forEach(el => {
    _modalScrollObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
  });

  // ===== ファイル転送中のページ離脱警告 =====
  window.addEventListener('beforeunload', e => {
    const pendingOut = state._ftOutgoing.filter(s => s.status === 'pending' || s.status === 'accepted');
    const pendingIn  = state._ftIncoming.filter(s => s.status === 'pending');
    if (pendingOut.length > 0 || pendingIn.length > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
});
