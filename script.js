// ========== Portal エントリポインチE==========
// 全モジュールめEimport し、依存関係を注入して初期化すめE

// ===== Foundation =====
import {
  db, doc, documentId, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
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
  ensureInviteAccess, submitInviteCode, loadInviteCodeConfig, saveInviteCode, clearInviteCode, openInviteCodeModal,
  loginExistingUsername, restoreStoredUsernameSession,
  loadLockSettings, saveLockSettings,
  startActivityTracking, stopActivityTracking, resetActivityTimer, checkAutoLock,
  setLockPin, removeLockPin,
  lockPortal, updateLockNotifications,
  lockSwitchUser, updateLockClock,
  handleLockKeyPress, handleLockDelete, updateLockDots, verifyLockPin,
  submitPreloginPin, cancelPreloginPin,
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
  updateChatFtButton,
  formatFileSize as ftFormatFileSize,
  getFileIcon as ftGetFileIcon
} from './modules/file-transfer.js';

import {
  deps as noticeDeps,
  loadReadNotices, markAllNoticesRead, updateNoticeBadge, setupNoticeObserver,
  subscribeNotices, saveNotice as moduleSaveNotice, addNotice as moduleAddNotice, deleteNotice as moduleDeleteNotice,
  renderNotices, openNoticeModal, closeNoticeModal, refreshNoticeVisibility, handleNoticeTargetScopeChange
} from './modules/notices.js';

import {
  deps as taskDeps,
  startTaskListeners, updateTaskBadge,
  openTaskModal, closeTaskModal, switchTaskTab, renderTaskTabContent,
  renderEmbeddedTaskWorkspace, refreshEmbeddedTaskWorkspaces,
  openTaskUserPicker, submitNewTask, createTaskRecord,
  acceptTask, completeTask, acknowledgeTask, deleteTask,
  openTaskEditModal, closeTaskEditModal, submitTaskEdit,
  openTaskSharePicker, closeTaskSharePicker, submitTaskShare,
  filterShareUserList, renderSharePickerUsers,
  acceptSharedTask, declineSharedTask
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
  openReqTaskifyModal, closeReqTaskifyModal, openReqTaskifyUserPicker, submitRequestTaskify,
  submitSuggestion, openSuggReplyModal, sendSuggReply,
  _markSuggestionsViewed,
  renderAdminSuggBoxSection, addSuggBoxViewer,
  _renderSuggestionPanel
} from './modules/reqboard.js';

import {
  initEmail,
  loadUserEmailProfile,
  saveGeminiApiKey, saveNewContact,
  generateEmail, copyEmailOutput, resetEmailOutput,
  setEmailMode, resetEmailMode, selectTone,
  saveUserEmailProfile, resetSignatureTemplate, updateSignaturePreview,
  openEmailModal, closeEmailModal,
  openProfileModal, closeProfileModal
} from './modules/email.js';

import {
  initCalendar,
  openCalendarModal, closeCalendarModal,
  calPrevMonth, calNextMonth, calGoToday,
  openDayPanel, closeDayPanel, saveDayAttendance, deleteAttendance,
  switchCalTab, renderCalendar, updateCalendarSummary,
  subscribeTodayAttendance
} from './modules/calendar.js';

import {
  initCompanyCalendar,
  subscribeCompanyCalConfig, unsubscribeCompanyCalConfig,
  renderSharedCalendar,
  writePublicAttendance, removePublicAttendance,
  openCompanyCalSettings,
  getDateInfo,
  initCompanyCalSettingsForms
} from './modules/company-calendar.js';

import {
  initAttendanceWork,
  bindAttendanceWorkEvents,
  switchCalPersonalTab,
  onCalendarModalOpen,
  onCalendarModalClose,
  onCalendarMonthChanged,
  markWorkSummaryStale
} from './modules/attendance-work.js';

import { initBottomNav } from './modules/bottom-nav.js';

import { initHomeDashboard, setHomeWorkspaceTarget, updateSummaryCards, renderHomeMySpacePanel } from './modules/home-workspace.js?v=20260325a';

import {
  initOrder,
  openOrderModal, closeOrderModal,
  openOrderHistoryModal, closeOrderHistoryModal,
  openOrderAdminModal, closeOrderAdminModal
} from './modules/order.js';

import {
  initPropertySummary,
  openPropertySummaryModal,
} from './modules/property-summary.js';

import {
  initTodayDashboard,
  renderTodayDashboard,
} from './modules/dashboard.js';

import {
  initReadDiagnostics,
  openReadDiagnosticsModal,
  recordGetDocsRead,
  recordListenerStart,
  recordListenerSnapshot,
  wrapTrackedListenerUnsubscribe,
} from './modules/read-diagnostics.js';

import {
  deps as sharedSpaceDeps,
  initSharedSpace,
  renderSharedHome,
  renderSharedLinksBrowser,
  openSharedLinksModal,
  closeSharedLinksModal,
} from './modules/shared-space.js';

import {
  isSupabaseSharedCoreEnabled,
  applySupabaseRuntimeConfig,
  loadSupabaseConfigFromStorage,
  renderSupabaseAdminState,
  saveSupabaseRuntimeConfig,
  fetchSharedCategoriesFromSupabase,
  fetchSharedCardsFromSupabase,
  fetchSharedCardsByIdsFromSupabase,
  createSharedCategoryInSupabase,
  updateSharedCategoryInSupabase,
  deleteSharedCategoryInSupabase,
  createSharedCardInSupabase,
  updateSharedCardInSupabase,
  deleteSharedCardInSupabase,
  createSupabaseClientId,
  // Step 4: 個人チE�Eタ
  fetchUserPreferencesFromSupabase,
  saveUserPreferencesToSupabase,
  fetchSectionOrderFromSupabase,
  saveSectionOrderToSupabase,
  fetchPrivateSectionsFromSupabase,
  fetchPrivateCardsFromSupabase,
  createPrivateSectionInSupabase,
  updatePrivateSectionInSupabase,
  deletePrivateSectionInSupabase,
  createPrivateCardInSupabase,
  updatePrivateCardInSupabase,
  deletePrivateCardInSupabase,
  // Step 4殁E user_todos
  fetchUserTodosFromSupabase,
  createUserTodoInSupabase,
  updateUserTodoInSupabase,
  deleteUserTodoInSupabase,
  // ユーザー一覧・ポ�Eタル設宁E
  fetchAllUserAccountsFromSupabase,
  savePortalConfigToSupabase,
} from './modules/supabase.js';

const initialSupabaseConfig = loadSupabaseConfigFromStorage();
if (initialSupabaseConfig) {
  applySupabaseRuntimeConfig(initialSupabaseConfig);
}
import { showToast, showConfirm } from './modules/notify.js';


// ========== 依存注入 ==========
// 吁E��ジュールが忁E��とするクロスモジュール関数を注入

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
  updateSummaryCards,
  confirmDelete,
  loadUsersForChatPicker
});

Object.assign(ftDeps, {
  updateLockNotifications,
  loadUsersForChatPicker
});

Object.assign(noticeDeps, {
  updateLockNotifications,
  renderTodayDashboard,
  renderSharedHome,
  updateSummaryCards,
});

Object.assign(taskDeps, {
  updateLockNotifications,
  renderTodayDashboard,
  updateSummaryCards,
  refreshEmbeddedTaskWorkspaces,
  loadUsersForChatPicker,
  renderTodoSection,
  // 共有ピチE��ー用: users_list を取得して renderSharePickerUsers に渡ぁE
  loadUsersForSharePicker: async (alreadyShared, assignedTo, assignedBy) => {
    try {
      const accounts = await fetchAllUserAccountsFromSupabase();
      const allUsers = accounts.map(a => a.username);
      renderSharePickerUsers(allUsers, alreadyShared, assignedTo, assignedBy);
    } catch (err) {
      console.error('共有ピチE��ーのユーザー取得エラー:', err);
      const listEl = document.getElementById('task-share-user-list');
      if (listEl) listEl.innerHTML = '<p class="task-share-empty">読み込みに失敗しました</p>';
    }
  },
});

Object.assign(reqDeps, {
  loadUsersForChatPicker,
  createTaskRecord,
  renderTodayDashboard,
  updateSummaryCards,
});

initEmail({
  confirmDelete,
  afterUserProfileSaved: async () => {
    if (!state.currentUsername) return;
    refreshNoticeVisibility();
    stopRequestListeners();
    startRequestListeners(state.currentUsername);
    updateReqBadge();
    if (state.reqModalOpen) renderReqContent();
    renderTodayDashboard();
  },
});

// 鋼材発注モジュール初期匁E
initOrder({});

// ボトムナビ初期化（スマ�E用�E�E
initBottomNav();

// 会社カレンダーモジュール初期匁E
initCompanyCalendar({
  renderCalendar,
  onCompanyCalConfigChanged: () => {
    void onCalendarMonthChanged();
  },
});

// カレンダーモジュールに会社カレンダー関数を注入
initCalendar({
  writePublicAttendance,
  removePublicAttendance,
  renderSharedCalendar,
  renderTodayDashboard,
  updateSummaryCards,
  markWorkSummaryStale,
  subscribeCompanyCalConfig,
  unsubscribeCompanyCalConfig,
  getDateInfo,
});

initAttendanceWork({
  renderCalendar,
  updateCalendarSummary,
  getDateInfo,
});

bindAttendanceWorkEvents();

function buildTodayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function openTodayAttendanceFromHome() {
  await openCalendarModal();
  if (!document.getElementById('cal-modal')?.classList.contains('visible')) return;
  await onCalendarModalOpen();
  openDayPanel(buildTodayDateKey());
}

function openTaskModalFromHome() {
  state.taskProjectKeyFilter = '';
  state.activeTaskTab = 'received';
  openTaskModal();
}

function openTaskNewFromHome() {
  state.taskProjectKeyFilter = '';
  state.activeTaskTab = 'new';
  openTaskModal();
}

function openRequestModalFromHome() {
  state.reqProjectKeyFilter = '';
  state.activeReqTab = 'request';
  state.activeReqSubTab = 'received';
  openReqModal('request');
}

function openRequestNewFromHome() {
  state.reqProjectKeyFilter = '';
  state.activeReqTab = 'request';
  state.activeReqSubTab = 'new';
  openReqModal('request');
}

function openNoticeCreateFromHome() {
  openNoticeModal(null);
}

function openGuideModalFromHome() {
  document.getElementById('guide-modal')?.classList.add('visible');
}

function openSettingsPanelFromHome() {
  openSettingsPanel();
}

function openReadDiagnosticsFromHome() {
  openReadDiagnosticsModal();
}

function openPropertySummaryFromHome() {
  openPropertySummaryModal();
}

function openInviteCodeModalFromHome() {
  void loadInviteCodeConfig()
    .catch(err => {
      console.error('招待コード設定の読込に失敗しました:', err);
    })
    .finally(() => openInviteCodeModal());
}

function focusNoticeBoardFromDashboard() {
  focusHomeWorkspace('notice', 'sidebar-home-btn', { scrollToNoticeBoard: true });
}

function focusHomeWorkspace(target = 'notice', activeButtonId = 'sidebar-home-btn', options = {}) {
  const { scrollToTop = false, closeOnMobile = false, scrollToNoticeBoard = false } = options;
  setHomeWorkspaceTarget(target, activeButtonId);
  if (scrollToTop) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (scrollToNoticeBoard) {
    setTimeout(() => {
      document.getElementById('notice-board')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
  if (closeOnMobile && isMobile()) {
    closeSidebar();
  }
}

function focusWeatherWidget() {
  const widget = document.getElementById('weather-widget');
  if (!widget) return;

  if (widget.hidden) {
    widget.hidden = false;
  }

  const headerOffset = window.innerWidth <= 768 ? 76 : 92;
  const targetTop = Math.max(0, window.scrollY + widget.getBoundingClientRect().top - headerOffset);
  window.scrollTo({ top: targetTop, behavior: 'smooth' });
}

function bindProfileQuickActions() {
  const renameBtn = document.getElementById('ep-edit-username');
  if (!renameBtn) return;
  renameBtn.onclick = () => {
    closeProfileModal();
    showUsernameModal(true);
  };
}

initTodayDashboard({
  openProfileSettings: () => {
    openProfileModal();
  },
  openReceivedTasks: () => {
    state.taskProjectKeyFilter = '';
    state.activeTaskTab = 'received';
    openTaskModal();
  },
  openSentTasks: () => {
    state.taskProjectKeyFilter = '';
    state.activeTaskTab = 'sent';
    openTaskModal();
  },
  openReceivedRequests: () => {
    state.reqProjectKeyFilter = '';
    state.activeReqTab = 'request';
    state.activeReqSubTab = 'received';
    openReqModal('request');
  },
  openSentRequests: () => {
    state.reqProjectKeyFilter = '';
    state.activeReqTab = 'request';
    state.activeReqSubTab = 'sent';
    openReqModal('request');
  },
  openTodayAttendance: openTodayAttendanceFromHome,
  openNoticeBoard: () => {
    focusNoticeBoardFromDashboard();
  },
  openFavorites: () => {
    setHomeWorkspaceTarget('favorites', 'btn-favorites-only');
  },
  openInviteCode: openInviteCodeModalFromHome,
  /* openInviteCode: async () => {
    try {
      await loadInviteCodeConfig();
    } catch (err) {
      console.error('招征E��ード設定�E読込に失敗しました:', err);
    }
    openInviteCodeModal();
  },
  */
});
initHomeDashboard({
  focusNoticeBoard: () => {
    focusNoticeBoardFromDashboard();
  },
  renderEmbeddedTaskWorkspace,
  openNoticeModal: openNoticeCreateFromHome,
  openTodayAttendance: openTodayAttendanceFromHome,
  openCalendarModal: async () => {
    await openCalendarModal();
    if (document.getElementById('cal-modal')?.classList.contains('visible')) {
      await onCalendarModalOpen();
    }
  },
  openTaskModal: openTaskModalFromHome,
  openTaskNew: openTaskNewFromHome,
  openRequestModal: openRequestModalFromHome,
  openRequestNew: openRequestNewFromHome,
  openOrderModal,
  openOrderHistoryModal,
  openEmailModal,
  openProfileModal,
  openChatPanel,
  openNewDmModal,
  openFileTransferPanel,
  openFtSendModal,
  openPropertySummaryModal: openPropertySummaryFromHome,
  openSettingsPanel: openSettingsPanelFromHome,
  openGuideModal: openGuideModalFromHome,
  openReadDiagnosticsModal: openReadDiagnosticsFromHome,
  openInviteCodeModal: openInviteCodeModalFromHome,
  getRoomUnread,
  renderMySpacePanel: renderHomeMySpacePanel,
  buildLinkCard,
});
initReadDiagnostics();

Object.assign(sharedSpaceDeps, {
  ensureSharedCardsLoaded,
  buildSection,
  openCategoryModal,
  normalizeForSearch,
  focusNoticeBoard: () => {
    focusNoticeBoardFromDashboard();
  },
  focusWeatherWidget,
  openCalendarModal: async () => {
    await openCalendarModal();
    if (document.getElementById('cal-modal')?.classList.contains('visible')) {
      await onCalendarModalOpen();
    }
  },
  openTaskModal: () => {
    state.taskProjectKeyFilter = '';
    state.activeTaskTab = 'received';
    openTaskModal();
  },
  openPropertySummary: () => openPropertySummaryModal(),
  openOrderModal,
  openReqModal: () => {
    state.reqProjectKeyFilter = '';
    state.activeReqTab = 'request';
    state.activeReqSubTab = 'received';
    openReqModal('request');
  },
  openEmailModal,
});

initSharedSpace(sharedSpaceDeps);

initPropertySummary({
  openRequests: projectKey => {
    state.reqProjectKeyFilter = projectKey;
    state.activeReqTab = 'request';
    state.activeReqSubTab = 'received';
    openReqModal('request');
  },
  openTasks: projectKey => {
    state.taskProjectKeyFilter = projectKey;
    state.activeTaskTab = 'received';
    openTaskModal();
  },
  openOrders: async projectKey => {
    await openOrderHistoryModal(projectKey);
  },
  openWork: async projectKey => {
    state.attendanceWorkProjectKeyFilter = projectKey;
    state.calPersonalTab = 'work';
    await openCalendarModal();
    if (document.getElementById('cal-modal')?.classList.contains('visible')) {
      await onCalendarModalOpen();
      await switchCalPersonalTab('work');
    }
  },
});


// ========== 個人TODO ==========
function loadTodos(username) {
  if (state._todoUnsubscribe) { state._todoUnsubscribe(); state._todoUnsubscribe = null; }
  if (!username) { state.personalTodos = []; renderTodoSection(); return; }
  fetchUserTodosFromSupabase(username).then(todos => {
    state.personalTodos = todos;
    renderTodoSection();
  }).catch(err => console.error('Supabase TODO読み込みエラー:', err));
}

async function addTodo(text, dueDate) {
  if (!state.currentUsername || !text.trim()) return;
  const id = await createUserTodoInSupabase(state.currentUsername, {
    text: text.trim(),
    dueDate: dueDate || null,
  });
  state.personalTodos = [...state.personalTodos, { id, text: text.trim(), done: false, dueDate: dueDate || null }];
  renderTodoSection();
}

async function toggleTodo(todoId, currentDone) {
  if (!state.currentUsername) return;
  const newDone = !currentDone;
  await updateUserTodoInSupabase(todoId, { done: newDone });
  state.personalTodos = state.personalTodos.map(t => t.id === todoId ? { ...t, done: newDone } : t);
  renderTodoSection();
}

async function deleteTodo(todoId) {
  if (!state.currentUsername) return;
  await deleteUserTodoInSupabase(todoId);
  state.personalTodos = state.personalTodos.filter(t => t.id !== todoId);
  renderTodoSection();
}

function renderTodoSection() {
  const section      = document.getElementById('todo-section');
  const list         = document.getElementById('todo-list');
  const assignedList = document.getElementById('todo-assigned-list');
  const countEl      = document.getElementById('todo-count');
  const body         = document.getElementById('todo-body');
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

  // ===== 割り振りタスク�E�Eending / accepted のみ�E�E====
  const activeTasks = (state.receivedTasks || []).filter(t => t.status === 'pending' || t.status === 'accepted');
  if (assignedList) {
    assignedList.innerHTML = '';
    activeTasks.forEach(task => {
      const li = document.createElement('li');
      li.className = 'todo-item todo-item--assigned';
      const statusCls  = task.status === 'pending' ? 'task-status-pending' : 'task-status-accepted';
      const statusText = task.status === 'pending' ? '承諾征E��' : '進行中';
      const due = task.dueDate ? `<span class="todo-due todo-due--assigned">${esc(task.dueDate)}</span>` : '';
      li.innerHTML = `
        <span class="todo-assigned-badge ${statusCls}">${statusText}</span>
        <span class="todo-text todo-text--assigned">${esc(task.title)}</span>
        ${due}
        <span class="todo-assigned-from">依頼: ${esc(task.assignedBy)}</span>
      `;
      li.title = '???????????';
      li.addEventListener('click', () => {
        openTaskModal();
        setTimeout(() => switchTaskTab('received'), 50);
      });
      assignedList.appendChild(li);
    });
    if (activeTasks.length > 0) {
      const divider = document.createElement('li');
      divider.className = 'todo-divider';
      assignedList.appendChild(divider);
    }
  }

  // ===== 個人TODO =====
  const total  = state.personalTodos.length;
  const doneN  = state.personalTodos.filter(t => t.done).length;
  if (countEl) {
    const parts = [];
    if (activeTasks.length) parts.push(`依頼 ${activeTasks.length} 件`);
    if (total) parts.push(`?? ${doneN}/${total} ??`);
    countEl.textContent = parts.join(' · ');
    countEl.className   = 'todo-count' + (doneN === total && total > 0 && activeTasks.length === 0 ? ' todo-count--all-done' : '');
  }

  const sorted = [
    ...state.personalTodos.filter(t => !t.done),
    ...state.personalTodos.filter(t =>  t.done),
  ];

  list.innerHTML = '';
  if (sorted.length === 0 && activeTasks.length === 0) {
    list.innerHTML = '<li class="todo-empty"><i class="fa-regular fa-circle-check"></i> タスクはありません</li>';
  } else {
    sorted.forEach(todo => {
      const li = document.createElement('li');
      li.className = 'todo-item' + (todo.done ? ' todo-item--done' : '');
      li.dataset.id = todo.id;

      let dueBadge = '';
      if (todo.dueDate) {
        const today    = new Date(); today.setHours(0,0,0,0);
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const due      = new Date(todo.dueDate + 'T00:00:00');
        let label, cls;
        if (due.getTime() === today.getTime())    { label = '今日';  cls = 'today'; }
        else if (due.getTime() === tomorrow.getTime()) { label = '明日'; cls = 'tomorrow'; }
        else if (due < today) { label = `${due.getMonth()+1}/${due.getDate()}`; cls = 'overdue'; }
        else                  { label = `${due.getMonth()+1}/${due.getDate()}`; cls = 'future'; }
        dueBadge = `<span class="todo-due todo-due--${cls}">${label}</span>`;
      }

      li.innerHTML = `
        <button class="todo-check" title="${todo.done ? '??????' : '?????'}">
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


// ========== 個人設定保存（デバウンス付き�E�E==========
let _prefSaveTimer = null;
function savePreferencesToSupabase() {
  const targetUsername = state.currentUsername;
  if (!targetUsername) return;
  clearTimeout(_prefSaveTimer);
  _prefSaveTimer = setTimeout(async () => {
    if (state.currentUsername !== targetUsername) return;
    try {
      const theme    = localStorage.getItem('portal-theme')     || 'dark';
      const fontSize = localStorage.getItem('portal-font-size') || 'font-md';
      const prefs = {
        theme,
        fontSize,
        favOnly:           state.favoritesOnlyMode,
        favorites:         state.personalFavorites,
        collapsedSections: state.collapsedSections,
        collapseSeeded:    state._collapseSeeded,
        hiddenCards:       state.hiddenCards,
        missionBannerHidden: state.missionBannerHidden,
      };
      await saveUserPreferencesToSupabase(targetUsername, prefs);
    } catch (err) {
      console.error('設定保存エラー:', err);
    }
  }, 600);
}

async function loadPersonalData(username, lockOnSwitch = false) {
  if (!username) return;
  try {
    await registerUserLogin(username);
    if (lockOnSwitch) {
      stopChatListeners();
      stopFtListener();
      stopDriveListeners();
      state.dmRooms = [];
      state.groupRooms = [];
      state.chatReadTimes = {};
      state._ftIncoming = [];
      state._ftOutgoing = [];
      state._driveIncoming = [];
      state._driveOutgoing = [];
      state._myDriveUrl = '';
      state._driveContacts = {};
      updateChatBadge();
      updateFtBadge();
    }

    if (isSupabaseSharedCoreEnabled()) {
      // Supabase モーチE 個人チE�Eタを並行取征E
      const [sbOrder, sbPrefs, sbSections, sbCards] = await Promise.all([
        fetchSectionOrderFromSupabase(username).catch(err => { console.warn('sectionOrder fallback:', err); return null; }),
        fetchUserPreferencesFromSupabase(username).catch(err => { console.warn('prefs fallback:', err); return null; }),
        fetchPrivateSectionsFromSupabase(username).catch(err => { console.warn('privSections fallback:', err); return null; }),
        fetchPrivateCardsFromSupabase(username).catch(err => { console.warn('privCards fallback:', err); return null; }),
      ]);

      // section_order
      state.personalSectionOrder = Array.isArray(sbOrder) ? sbOrder : [];

      // preferences
      if (sbPrefs) {
        state.personalFavorites   = sbPrefs.favorites;
        state.favoritesOnlyMode   = sbPrefs.favOnly;
        state._collapseSeeded     = sbPrefs.collapseSeeded;
        state.collapsedSections   = sbPrefs.collapsedSections;
        state.hiddenCards         = sbPrefs.hiddenCards;
        state.missionBannerHidden = sbPrefs.missionBannerHidden;
        if (sbPrefs.theme)    applyTheme(sbPrefs.theme, false);
        if (sbPrefs.fontSize) applyFontSize(sbPrefs.fontSize, false);
        if (sbPrefs.lastViewedSuggestionsAt) {
          state.lastViewedSuggestionsAt = sbPrefs.lastViewedSuggestionsAt;
        }
      } else {
        const localFavs = (() => { try { return JSON.parse(localStorage.getItem('portal-favorites') || '[]'); } catch { return []; } })();
        state.personalFavorites = localFavs;
        state.favoritesOnlyMode = localStorage.getItem('portal-fav-only') === '1';
        savePreferencesToSupabase();
      }

      // private sections / cards
      if (Array.isArray(sbSections)) {
        state.privateCategories = sbSections;
      }
      if (Array.isArray(sbCards)) {
        state.privateCards = sbCards;
      }
    }
    await ensureFavoritePublicCardsLoaded();

    renderAllSections();
    // 初回ログイン時：�Eセクションをデフォルト折りたたみにする
    if (!state._collapseSeeded) _seedDefaultCollapse();
    renderFavorites();
    applyFavoritesOnlyMode();
    renderMissionBanner();
    loadTodos(username);
    await loadReadNotices(username);
    await loadChatReadTimes(username);
    setupNoticeObserver();
    startTaskListeners(username);
    startChatListeners(username);
    await loadUserEmailProfile(username);
    subscribeTodayAttendance(username);
    refreshNoticeVisibility();
    await loadConfigDepartmentsAndViewers();
    renderMissionBanner(); // ミッションチE��ストが読み込まれた後に再描画
    startRequestListeners(username);
    await loadLockSettings(username, lockOnSwitch);
    renderTodayDashboard();
  } catch (err) {
    console.error('個人チE�Eタ読み込みエラー:', err);
  }
}

async function savePersonalSectionOrder(username, order) {
  if (!username) return;
  await saveSectionOrderToSupabase(username, order);
}


// ========== プライベ�Eトセクション CRUD ==========
async function addPrivateSection(data) {
  if (!state.currentUsername) return;
  const id = await createPrivateSectionInSupabase(state.currentUsername, data);
  state.privateCategories.push({ docId: id, id, isPrivate: true, ...data });
}

async function updatePrivateSection(docId, data) {
  if (!state.currentUsername) return;
  await updatePrivateSectionInSupabase(docId, data);
  const idx = state.privateCategories.findIndex(c => c.docId === docId);
  if (idx !== -1) state.privateCategories[idx] = { ...state.privateCategories[idx], ...data };
}

async function deletePrivateSection(docId) {
  if (!state.currentUsername) return;
  await deletePrivateSectionInSupabase(docId);
  state.privateCategories = state.privateCategories.filter(c => c.docId !== docId);
}

async function addPrivateCard(data) {
  if (!state.currentUsername) return;
  const siblings = data.parentId
    ? state.privateCards.filter(c => c.parentId === data.parentId)
    : state.privateCards.filter(c => c.sectionId === data.sectionId && !c.parentId);
  const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order || 0)) + 1 : 0;
  const newData = { ...data, parentId: data.parentId || null, order: maxOrder };
  const id = await createPrivateCardInSupabase(state.currentUsername, newData);
  state.privateCards.push({ id, isPrivate: true, ...newData });
  renderAllSections();
  restoreChildPopupAfterMutation(data.parentId);
}

async function savePrivateCard(cardId, data) {
  if (!state.currentUsername) return;
  await updatePrivateCardInSupabase(cardId, data);
  const idx = state.privateCards.findIndex(c => c.id === cardId);
  if (idx !== -1) state.privateCards[idx] = { ...state.privateCards[idx], ...data };
  renderAllSections();
}

async function deletePrivateCard(cardId) {
  if (!state.currentUsername) return;
  await deletePrivateCardInSupabase(cardId);
  state.privateCards = state.privateCards.filter(c => c.id !== cardId);
  renderAllSections();
}


// ========== 個人セクション頁E��E==========
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


// ========== セクション ドラチE��&ドロチE�E ==========
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


// ========== プライベ�Eトセクション管琁E��ーダル ==========
function openPrivateSectionModal(cat) {
  state.editingPrivateSectionId = cat?.docId || null;
  state.privateSectionColorIndex = cat?.colorIndex || 1;
  document.getElementById('private-section-modal-title').innerHTML = cat ? '<i class="fa-solid fa-lock"></i> ?????????' : '<i class="fa-solid fa-lock"></i> ?????????';


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


// ========== �J�[�h CRUD ==========
async function migrateIfNeeded() {
  void INITIAL_CARDS;
}

async function migrateAddBox() {
  return;
}

async function migrateCategories() {
  return;
}

async function loadCategories() {
  try {
    const categories = await fetchSharedCategoriesFromSupabase();
    if (categories.length > 0) {
      state.allCategories = categories;
      // Supabaseに存在しないデフォルトカテゴリがあれば自動でINSERT
      const existingIds = new Set(categories.map(c => c.id));
      for (const cat of DEFAULT_CATEGORIES) {
        if (!existingIds.has(cat.id)) {
          try {
            await createSharedCategoryInSupabase({ id: cat.id, ...cat });
            state.allCategories.push({ docId: cat.id, ...cat });
          } catch (_) { /* 重複エラーは無視 */ }
        }
      }
    } else {
      // カテゴリが1件もない場合はデフォルトカテゴリを全件INSERT
      state.allCategories = [...DEFAULT_CATEGORIES];
      for (const cat of DEFAULT_CATEGORIES) {
        try {
          await createSharedCategoryInSupabase({ id: cat.id, ...cat });
        } catch (_) { /* 重複エラーは無視 */ }
      }
    }
  } catch (err) {
    console.error('Supabase category load error:', err);
    state.allCategories = [...DEFAULT_CATEGORIES];
  }
}

function sortCards(cards = []) {
  return [...cards].sort((a, b) =>
    (a.categoryOrder ?? 0) - (b.categoryOrder ?? 0) ||
    (a.order ?? 0) - (b.order ?? 0)
  );
}

let _sharedCardsLoadPromise = null;

function rerenderCards() {
  renderAllSections();
  renderFavorites();
  renderSharedLinksBrowser();
}

async function reloadSharedCoreData() {
  const hadSharedCards = state.sharedCardsLoaded || (state.allCards || []).length > 0;
  state.sharedCardsLoaded = false;
  state.sharedCardsLoading = false;
  state.allCards = [];
  await loadCategories();
  if (hadSharedCards) {
    await ensureSharedCardsLoaded(true);
  } else {
    renderAllSections();
    renderFavorites();
    renderSharedHome();
    renderSharedLinksBrowser();
  }
}

async function ensureSharedCardsLoaded(force = false) {
  if (state.sharedCardsLoaded && !force) {
    renderSharedHome();
    renderSharedLinksBrowser();
    return state.allCards;
  }
  if (_sharedCardsLoadPromise && !force) return _sharedCardsLoadPromise;

  state.sharedCardsLoading = true;
  renderSharedHome();
  renderSharedLinksBrowser();

  _sharedCardsLoadPromise = (async () => {
    let loadedSuccessfully = false;
    try {
      const cards = await fetchSharedCardsFromSupabase();
      state.allCards = sortCards(cards);
      loadedSuccessfully = true;
    } catch (err) {
      console.error('Supabase shared card load error:', err);
    }
    state.sharedCardsLoaded = loadedSuccessfully;
    rerenderCards();
    renderSharedHome();
    return state.allCards;
  })();

  try {
    return await _sharedCardsLoadPromise;
  } finally {
    state.sharedCardsLoading = false;
    _sharedCardsLoadPromise = null;
    renderSharedHome();
    renderSharedLinksBrowser();
  }
}

async function ensureFavoritePublicCardsLoaded() {
  const favIds = getFavorites();
  if (!favIds.length) return;

  const privateCardIds = new Set((state.privateCards || []).map(card => card.id));
  const knownCardIds = new Set((state.allCards || []).map(card => card.id));
  const targetIds = favIds.filter(id => !privateCardIds.has(id) && !knownCardIds.has(id));
  if (!targetIds.length) return;

  const loadedCards = [];
  try {
    loadedCards.push(...await fetchSharedCardsByIdsFromSupabase(targetIds));
  } catch (err) {
    console.error('Supabase favorite card load error:', err);
  }

  if (!loadedCards.length) return;
  const remainingCards = (state.allCards || []).filter(card => !targetIds.includes(card.id));
  state.allCards = sortCards([...remainingCards, ...loadedCards]);
}

async function saveCard(docId, data) {
  await updateSharedCardInSupabase(docId, data);
  const idx = state.allCards.findIndex(c => c.id === docId);
  if (idx !== -1) {
    state.allCards[idx] = { ...state.allCards[idx], ...data };
    state.allCards = sortCards(state.allCards);
    rerenderCards();
  }
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
  };
  const supabaseData = { ...newData, id: createSupabaseClientId('card') };
  await createSharedCardInSupabase(supabaseData);
  state.allCards = sortCards([...state.allCards, supabaseData]);
  rerenderCards();
  restoreChildPopupAfterMutation(data.parentId);
}

async function deleteCard(docId) {
  await deleteSharedCardInSupabase(docId);
  state.allCards = state.allCards.filter(c => c.id !== docId);
  rerenderCards();
}


// ========== �J�e�S�� CRUD ==========
async function addCategoryToSupabase(data) {
  await createSharedCategoryInSupabase(data);
  state.allCategories.push({ docId: data.id, ...data });
}

async function updateCategoryToSupabase(docId, data) {
  await updateSharedCategoryInSupabase(docId, data);
  const idx = state.allCategories.findIndex(c => c.docId === docId);
  if (idx !== -1) state.allCategories[idx] = { ...state.allCategories[idx], ...data };
}

async function deleteCategoryFromSupabase(docId) {
  await deleteSharedCategoryInSupabase(docId);
  state.allCategories = state.allCategories.filter(c => c.docId !== docId);
}


// ========== DOM 描画 ==========
function getCategoryGradient(cat) {
  if (cat.isExternal) return 'linear-gradient(135deg, #6c5ce7, #a29bfe)';
  const color = CATEGORY_COLORS.find(c => c.index === cat.colorIndex);
  return color ? color.gradient : CATEGORY_COLORS[0].gradient;
}

// ===== ミッションバナー =====
function renderMissionBanner() {
  const banner = document.getElementById('mission-banner');
  const textEl = document.getElementById('mission-banner-text');
  const body   = document.getElementById('mission-banner-body');
  const toggle = document.getElementById('mission-banner-toggle');
  if (!banner || !textEl) return;

  if (!state.missionText) {
    banner.hidden = true;
    return;
  }

  // 改行をHTMLに変換
  textEl.innerHTML = esc(state.missionText).replace(/\n/g, '<br>');
  banner.hidden = false;

  const collapsed = state.missionBannerHidden;
  body.classList.toggle('mission-banner-body--collapsed', collapsed);
  if (toggle) {
    toggle.classList.toggle('collapsed', collapsed);
    toggle.title = collapsed ? '展開' : '折り畳む';
  }
}

function toggleMissionBanner() {
  state.missionBannerHidden = !state.missionBannerHidden;
  renderMissionBanner();
  savePreferencesToSupabase();
}

async function saveMissionText() {
  const text = document.getElementById('admin-mission-input')?.value.trim() ?? '';
  const btn  = document.getElementById('admin-mission-save-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
  try {
    await savePortalConfigToSupabase({ missionText: text });
    state.missionText = text;
    renderMissionBanner();
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-check"></i> 保存しました'; }
    setTimeout(() => { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ??'; } }, 1500);
  } catch (err) {
    console.error('ミッションチE��スト保存エラー:', err);
    showToast('保存に失敗しました', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ??'; }
  }
}

function renderAllSections() {
  closeChildPopup();
  updateSummaryCards();
  const personalBody = document.getElementById('personal-space-body');
  const sharedBody   = document.getElementById('shared-space-body');

  // 既存�E動的セクション・ボタンを削除
  personalBody.querySelectorAll('.category-section:not(#favorites-section), .external-tools, .btn-add-category-wrap').forEach(el => el.remove());
  sharedBody.querySelectorAll('.category-section, .external-tools, .btn-add-category-wrap').forEach(el => el.remove());

  const publicSorted  = [...state.allCategories].sort((a, b) => a.order - b.order);
  const privateSorted = [...state.privateCategories].sort((a, b) => (a.order || 0) - (b.order || 0));

  // personalSectionOrder を適用しつつ公閁E個人で振り�EぁE
  let orderedPublic  = publicSorted;
  let orderedPrivate = privateSorted;
  if (state.personalSectionOrder.length) {
    const orderedAll = applyPersonalOrder([...publicSorted, ...privateSorted]);
    orderedPublic  = orderedAll.filter(c => !c.isPrivate);
    orderedPrivate = orderedAll.filter(c =>  c.isPrivate);
  }

  // マイカチE��リ ↁE個人スペ�Eスへ
  orderedPrivate.forEach(cat => {
    const catCards = state.privateCards.filter(c => c.sectionId === cat.docId).sort((a, b) => (a.order || 0) - (b.order || 0));
    personalBody.appendChild(buildSection(cat, catCards));
  });

  // 「�EイカチE��リを追加」�E 個人スペ�Eス末尾
  if (state.currentUsername) {
    const privateAddWrap = document.createElement('div');
    privateAddWrap.className = 'btn-add-category-wrap';
    privateAddWrap.innerHTML = `
      <div class="add-btn-group">
        <button class="btn-add-private-section"><i class="fa-solid fa-lock"></i> マイカテゴリを追加</button>
        <p class="add-btn-desc add-btn-desc--private"><i class="fa-solid fa-user-secret"></i> 自分だけに表示されます</p>
      </div>`;
    privateAddWrap.querySelector('.btn-add-private-section').addEventListener('click', () => openPrivateSectionModal(null));
    personalBody.appendChild(privateAddWrap);
  }

  renderSharedHome();
  renderSharedLinksBrowser();
}

// ===== セクション折り畳み =====
function toggleSectionCollapse(sectionId) {
  const idx = state.collapsedSections.indexOf(sectionId);
  if (idx >= 0) {
    state.collapsedSections.splice(idx, 1);
  } else {
    state.collapsedSections.push(sectionId);
  }
  const collapsed = state.collapsedSections.includes(sectionId);
  // DOM直接更新�E��E描画なし！E
  const sectionEl = document.getElementById(`section-${sectionId}`)
    || document.getElementById(`section-priv-${sectionId.replace('priv:', '')}`);
  if (sectionEl) {
    sectionEl.classList.toggle('collapsed', collapsed);
    const btn = sectionEl.querySelector('.btn-collapse-section');
    if (btn) {
      btn.classList.toggle('collapsed', collapsed);
      btn.title = collapsed ? '展開' : '折り畳む';
    }
    // 展開時にポップアニメを発火
    if (!collapsed) {
      sectionEl.classList.add('expanding');
      setTimeout(() => sectionEl.classList.remove('expanding'), 700);
    }
  }
  savePreferencesToSupabase();
}

// ===== カード非表示 =====
let _pendingHideCardId = null;

function hideCard(cardId) {
  if (!state.currentUsername) return;
  if (state.hiddenCards.includes(cardId)) return;

  // カード名を取征E
  const allCardPool = [...state.allCards, ...state.privateCards];
  const card = allCardPool.find(c => c.id === cardId);
  const label = card ? card.label : cardId;

  // 確認モーダルを表示
  const modal = document.getElementById('hide-card-confirm-modal');
  const nameEl = document.getElementById('hide-card-confirm-name');
  if (modal && nameEl) {
    nameEl.textContent = `、E{label}」`;
    _pendingHideCardId = cardId;
    modal.classList.add('visible');
  }
}

function _doHideCard(cardId) {
  if (!state.hiddenCards.includes(cardId)) {
    state.hiddenCards.push(cardId);
    savePreferencesToSupabase();
    renderAllSections();
    renderFavorites();
    _renderHiddenCardsList();
  }
}

function unhideCard(cardId) {
  if (!state.currentUsername) return;
  state.hiddenCards = state.hiddenCards.filter(id => id !== cardId);
  savePreferencesToSupabase();
  renderAllSections();
  renderFavorites();
  _renderHiddenCardsList();
}

function _renderHiddenCardsList() {
  const container = document.getElementById('hidden-cards-list');
  if (!container) return;
  const hiddenCount = document.getElementById('hidden-cards-count');
  if (hiddenCount) hiddenCount.textContent = state.hiddenCards.length;
  if (state.hiddenCards.length === 0) {
    container.innerHTML = '<p class="hidden-cards-empty">非表示にしたカード�Eありません</p>';
    return;
  }
  // カード名を取得して表示
  const allCardPool = [...state.allCards, ...state.privateCards];
  container.innerHTML = state.hiddenCards.map(id => {
    const card = allCardPool.find(c => c.id === id);
    const label = card ? esc(card.label) : `�E�ED: ${id}�E�`;
    return `<div class="hidden-card-row">
      <span class="hidden-card-label">${label}</span>
      <button class="btn-unhide-card" data-id="${id}" title="再表示"><i class="fa-solid fa-eye"></i> 再表示</button>
    </div>`;
  }).join('');
  container.querySelectorAll('.btn-unhide-card').forEach(btn => {
    btn.addEventListener('click', () => unhideCard(btn.dataset.id));
  });
}

// ===== チE��ォルト�E折りたたみ�E��E回ログイン時！E=====
function _seedDefaultCollapse() {
  const allIds = Array.from(
    document.querySelectorAll('.category-section[id], .external-tools[id]')
  ).map(el => {
    if (el.id.startsWith('section-priv-')) return `priv:${el.id.replace('section-priv-', '')}`;
    return el.id.replace('section-', '');
  }).filter(Boolean);
  state.collapsedSections = allIds;
  state._collapseSeeded = true;
  savePreferencesToSupabase();
  renderAllSections(); // 折りたたんだ状態で再描画
}


function buildSection(cat, cards, options = {}) {
  const searchMode = !!options.searchMode;
  const section = document.createElement('section');
  const gradient = getCategoryGradient(cat);
  const sectionId = cat.isPrivate ? `priv:${cat.docId}` : cat.id;
  // 非表示カードをフィルタリング�E�個人設定！E
  const visibleCards = cards.filter(c => !state.hiddenCards.includes(c.id));
  cards = visibleCards;
  const isCollapsed = state.collapsedSections.includes(sectionId);

  if (cat.isExternal) {
    section.className = 'external-tools' + (isCollapsed ? ' collapsed' : '');
    section.id = `section-${cat.id}`;
    const editBtns = state.isEditMode
      ? `<button class="btn-edit-category" data-docid="${cat.docId || ''}" title="カテゴリ編集"><i class="fa-solid fa-pen"></i></button>`
      : '';
    section.innerHTML = `
      <div class="category-header">
        <div class="category-icon" style="background:${gradient}"><i class="${cat.icon}"></i></div>
        <h2 class="category-title">${esc(cat.label)}</h2>
        ${editBtns}
        <button class="btn-collapse-section${isCollapsed ? ' collapsed' : ''}" data-section-id="${sectionId}" title="${isCollapsed ? '展開' : '折り畳む'}">
          <i class="fa-solid fa-chevron-up"></i>
        </button>
      </div>
      <div class="external-grid"></div>
    `;
    section.querySelector('.category-header').addEventListener('click', e => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      toggleSectionCollapse(sectionId);
    });
    section.querySelector('.btn-collapse-section').addEventListener('click', e => {
      e.stopPropagation();
      toggleSectionCollapse(sectionId);
    });
    const grid = section.querySelector('.external-grid');
    grid.appendChild(buildSolarIconWrap());
    const externalCards = searchMode
      ? cards.filter(c => c.url !== 'solar:open')
      : cards.filter(c => !c.parentId && c.url !== 'solar:open');
    externalCards.forEach(c => grid.appendChild(buildExternalCard(c, cards)));
    if (state.isEditMode && !searchMode) {
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
    section.className = 'category-section private-section' + (isCollapsed ? ' collapsed' : '');
    section.id = `section-priv-${cat.docId}`;
    const color = CATEGORY_COLORS.find(c => c.index === cat.colorIndex);
    const privGradient = color ? color.gradient : CATEGORY_COLORS[0].gradient;
    section.innerHTML = `
      <div class="category-header">
        <div class="category-icon" style="background:${privGradient}"><i class="${cat.icon || 'fa-solid fa-star'}"></i></div>
        <h2 class="category-title">${esc(cat.label)}<span class="private-badge"><i class="fa-solid fa-lock"></i></span></h2>
        <span class="category-count">${cards.length} 件</span>
        <button class="btn-edit-category" data-docid="${cat.docId}" title="マイカテゴリを編集"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-collapse-section${isCollapsed ? ' collapsed' : ''}" data-section-id="${sectionId}" title="${isCollapsed ? '展開' : '折り畳む'}">
          <i class="fa-solid fa-chevron-up"></i>
        </button>
      </div>
      <div class="card-grid"></div>
    `;
    const grid = section.querySelector('.card-grid');
    const privCards = searchMode ? cards : cards.filter(c => !c.parentId);
    privCards.forEach(c => grid.appendChild(buildCardNode(c, cards, privGradient, true)));
    if (state.isEditMode && !searchMode) grid.appendChild(buildAddButton(null, true, cat.docId));
    section.querySelector('.btn-edit-category').addEventListener('click', () => openPrivateSectionModal(cat));
    section.querySelector('.category-header').addEventListener('click', e => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      toggleSectionCollapse(sectionId);
    });
    section.querySelector('.btn-collapse-section').addEventListener('click', e => {
      e.stopPropagation();
      toggleSectionCollapse(sectionId);
    });

    const favs = getFavorites();
    const allFaved = cards.length > 0 && cards.every(c => favs.includes(c.id));
    const sBtn = document.createElement('button');
    sBtn.className = 'btn-section-favorite' + (allFaved ? ' active' : '');
    sBtn.title = allFaved ? '??????' : '??????????????';
    sBtn.innerHTML = `<i class="fa-${allFaved ? 'solid' : 'regular'} fa-star"></i>`;
    sBtn.addEventListener('click', () => toggleSectionFavorite(cat.docId, true));
    section.querySelector('.category-header').appendChild(sBtn);

  } else {
    section.className = 'category-section' + (isCollapsed ? ' collapsed' : '');
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
        <button class="btn-collapse-section${isCollapsed ? ' collapsed' : ''}" data-section-id="${sectionId}" title="${isCollapsed ? '展開' : '折り畳む'}">
          <i class="fa-solid fa-chevron-up"></i>
        </button>
      </div>
      <div class="card-grid"></div>
    `;
    const grid = section.querySelector('.card-grid');
    const sectionCards = searchMode ? cards : cards.filter(c => !c.parentId);
    sectionCards.forEach(c => grid.appendChild(buildCardNode(c, cards, gradient, false)));
    if (state.isEditMode && !searchMode) grid.appendChild(buildAddButton(cat.id));

    section.querySelector('.category-header').addEventListener('click', e => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      toggleSectionCollapse(sectionId);
    });
    section.querySelector('.btn-collapse-section').addEventListener('click', e => {
      e.stopPropagation();
      toggleSectionCollapse(sectionId);
    });

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
    sBtn.title = allFaved ? '??????' : '??????????????';
    sBtn.innerHTML = `<i class="fa-${allFaved ? 'solid' : 'regular'} fa-star"></i>`;
    sBtn.addEventListener('click', () => toggleSectionFavorite(cat.id, false));
    section.querySelector('.category-header').appendChild(sBtn);
  }

  if (state.currentUsername) {
    const handle = document.createElement('div');
    handle.className = 'section-drag-handle';
    handle.title = '????????????????';
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

  a.addEventListener('contextmenu', e => {
    e.preventDefault();
    showContextMenu(e, card);
  });
  if (!isFav) {
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

function buildExternalCard(card, allCatCards = []) {
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

  // 非表示ボタン�E��Eバ�E時表示�E�E
  const children = Array.isArray(allCatCards)
    ? allCatCards.filter(c => c.parentId === card.id)
    : [];
  if (children.length > 0) {
    wrap.classList.add('ext-icon-has-children');

    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'card-children-badge ext-card-children-badge';
    badge.innerHTML = `<i class="fa-solid fa-layer-group"></i><span>${children.length}</span>`;
    badge.title = `${children.length}件の子カードを表示`;
    badge.setAttribute('aria-label', `${children.length}件の子カードを表示`);
    badge.setAttribute('aria-haspopup', 'dialog');
    badge.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (state.activeChildPopup && state.activeChildPopup.dataset.parentId === card.id) {
        closeChildPopup();
        return;
      }
      openChildPopup(card, children, allCatCards, '', false, a);
    });
    wrap.appendChild(badge);
  }

  const hideBtn = document.createElement('button');
  hideBtn.type = 'button';
  hideBtn.className = 'btn-hide-ext-card';
  hideBtn.title = 'こ�Eアイコンを非表示にする';
  hideBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
  hideBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    hideCard(card.id);
  });
  wrap.appendChild(hideBtn);

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
    if (await confirmDelete(`?${card.label}?????????`)) {
      await deleteCard(card.id);
    }
  });
  return overlay;
}

function buildAddButton(categoryId, isPrivate = false, privateSectionDocId = null, parentId = null) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-add-card';
  btn.innerHTML = '<i class="fa-solid fa-plus"></i><span>カードを追加</span>';
  btn.addEventListener('click', () => openCardModal(null, categoryId, isPrivate, privateSectionDocId, parentId));
  return btn;
}


// ========== カード階層: ノ�Eド構篁E==========
function buildCardNode(card, allCatCards, gradient, isPrivate) {
  const children = allCatCards.filter(c => c.parentId === card.id);
  const a = buildLinkCard(card, false, gradient);

  if (children.length === 0) return a;

  a.classList.add('card-has-children');

  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'card-children-badge';
  badge.innerHTML = `<i class="fa-solid fa-layer-group"></i><span>${children.length}</span>`;
  badge.title = `${children.length}件の子カードを表示`;
  badge.setAttribute('aria-label', `${children.length}件の子カードを表示`);
  badge.setAttribute('aria-haspopup', 'dialog');
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
    <button type="button" class="card-child-popup__close" title="閉じる" aria-label="閉じる"><i class="fa-solid fa-xmark"></i></button>
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

function restoreChildPopupAfterMutation(parentId) {
  if (!parentId) return;

  const parentCard = state.allCards.find(c => c.id === parentId)
    || state.privateCards.find(c => c.id === parentId);
  if (!parentCard) return;

  const isPrivate = !!parentCard.isPrivate;
  const pool = isPrivate
    ? [...state.privateCards]
        .filter(c => c.sectionId === parentCard.sectionId)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
    : [...state.allCards]
        .filter(c => c.category === parentCard.category)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
  const visiblePool = pool.filter(c => !state.hiddenCards.includes(c.id));
  const children = visiblePool.filter(c => c.parentId === parentId);
  if (!children.length) return;

  const escapedId = window.CSS && typeof window.CSS.escape === 'function'
    ? window.CSS.escape(parentId)
    : parentId.replace(/"/g, '\\"');
  const anchorEl = document.querySelector(`[data-doc-id="${escapedId}"]`);
  if (!anchorEl) return;

  openChildPopup(parentCard, children, visiblePool, _getCardGradient(parentCard), isPrivate, anchorEl);
}


// ========== お気に入めE==========
function getFavorites() {
  return [...state.personalFavorites];
}

function setFavorites(ids) {
  state.personalFavorites = [...ids];
  savePreferencesToSupabase();
}

function toggleFavorite(docId) {
  const favs = getFavorites();
  const idx = favs.indexOf(docId);
  if (idx === -1) favs.push(docId); else favs.splice(idx, 1);
  setFavorites(favs);
  renderFavorites();
  const homePanel = document.getElementById('home-stage-myspace-panel');
  if (homePanel) renderHomeMySpacePanel(homePanel);
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

  const cardPool = [...(state.allCards || []), ...(state.privateCards || [])];
  const cards = favIds.map(id => cardPool.find(c => c.id === id)).filter(Boolean);

  if (!cards.length) {
    if (state.favoritesOnlyMode) {
      section.hidden = false;
      grid.innerHTML = '<p class="fav-empty"><i class="fa-regular fa-star"></i> お気に入りが未登録です。カードを右クリック → 編集、またはカードの ☆ をクリックして登録してください。</p>';
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


// ========== カチE��リ管琁E==========
function openCategoryModal(cat) {
  state.editingCategoryId = cat?.docId || null;
  document.getElementById('category-modal-title').textContent = cat ? '???????' : '???????';
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


// ========== ドラチE��&ドロチE�E ==========
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

  await Promise.all(catCards.map((c, i) => updateSharedCardInSupabase(c.id, { order: i })));
  const reordered = catCards.map((c, i) => ({ ...c, order: i }));
  const otherCards = state.allCards.filter(c => c.category !== src.category);
  state.allCards = sortCards([...otherCards, ...reordered]);
  rerenderCards();
}


// ========== 編雁E��ーチE==========
function enterEditMode() {
  state.isEditMode = true;
  document.body.classList.add('edit-mode');
  document.getElementById('edit-banner').hidden = false;
  const fab = document.getElementById('admin-fab');
  fab.innerHTML = '<i class="fa-solid fa-lock-open"></i>';
  fab.classList.add('active');
  fab.title = '????????';
  renderAllSections();
  refreshNoticeVisibility();
}

function exitEditMode() {
  state.isEditMode = false;
  document.body.classList.remove('edit-mode');
  document.getElementById('edit-banner').hidden = true;
  const fab = document.getElementById('admin-fab');
  fab.innerHTML = '<i class="fa-solid fa-lock"></i>';
  fab.classList.remove('active');
  fab.title = '管琁E��E��グイン';
  renderAllSections();
  refreshNoticeVisibility();
}


// ========== カード編雁E��ーダル ==========
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

  document.getElementById('card-modal-title').textContent = docId ? '??????' : '??????';
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
  document.getElementById('pin-modal-title').textContent = isSetup ? '?? PIN ??' : '?????';
  document.getElementById('pin-modal-desc').textContent  = isSetup ? '????4??PIN?????????' : '4??PIN?????????';
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
        ${isAdded ? '<span class="svc-added-badge">追加渁E/span>' : ''}
      </button>`;
  }).join('') + `
    <button class="svc-pick-btn svc-pick-custom" id="svc-custom-btn">
      <div class="svc-pick-icon svc-pick-custom-icon"><i class="fa-solid fa-pen-to-square"></i></div>
      <span class="svc-pick-label">カスタム</span>
    </button>`;

  grid.querySelectorAll('.svc-pick-btn:not([disabled]):not(.svc-pick-custom)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { url, icon, label } = btn.dataset;
      btn.disabled = true;
      try {
        await addCard({ label, icon, url, category: 'external', isExternalTool: true, categoryOrder: 0 });
        closeServicePicker();
      } catch (err) {
        console.error('外部ツール追加エラー:', err);
        showToast('追加に失敗しました: ' + (err?.message || '不明なエラー'), 'error');
        btn.disabled = false;
      }
    });
  });

  document.getElementById('svc-custom-btn')?.addEventListener('click', () => {
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


// ========== 天氁E==========
function calcHeatIndex(tempC, humidity) {
  if (tempC < 27) return tempC;
  const T = tempC, RH = humidity;
  return -8.78469475556 + 1.61139411*T + 2.33854883889*RH
    - 0.14611605*T*RH - 0.012308094*T*T - 0.0164248277778*RH*RH
    + 0.002211732*T*T*RH + 0.00072546*T*RH*RH - 0.000003582*T*T*RH*RH;
}

function getHeatLevel(hi) {
  if (hi >= 40) return { level: 'danger', label: '危険', icon: '🔥', color: '#c0392b', glow: 'rgba(255,94,160,0.55)', textColor: '#fff' };
  if (hi >= 35) return { level: 'warning', label: '厳重警戒', icon: '🥵', color: '#d35400', glow: 'rgba(255,140,66,0.55)', textColor: '#fff' };
  if (hi >= 31) return { level: 'caution', label: '警戒', icon: '🌡️', color: '#d4ac00', glow: 'rgba(230,200,0,0.4)', textColor: '#1a1a00' };
  if (hi >= 28) return { level: 'attention', label: '注意', icon: '🌤️', color: '#00a888', glow: 'rgba(0,212,170,0.4)', textColor: '#fff' };
  return { level: 'safe', label: '安全', icon: '🙂', color: 'rgba(255,255,255,0.12)', glow: 'transparent', textColor: 'var(--text-secondary)' };
}

const OWM_ICON_MAP = {
  '01d': '☀️',
  '01n': '🌙',
  '02d': '🌤️',
  '02n': '🌤️',
  '03d': '⛅',
  '03n': '⛅',
  '04d': '☁️',
  '04n': '☁️',
  '09d': '🌧️',
  '09n': '🌧️',
  '10d': '🌦️',
  '10n': '🌦️',
  '11d': '⛈️',
  '11n': '⛈️',
  '13d': '❄️',
  '13n': '❄️',
  '50d': '🌫️',
  '50n': '🌫️'
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
          <span class="heat-badge-title">熱中痁E��険度</span>
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
          <div class="forecast-time">${m}/${d} ${h}晁E/div>
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


// ========== コンチE��ストメニュー ==========
let activeContextMenu = null;

function showContextMenu(e, card) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'card-context-menu';
  const x = Math.min(e.clientX, window.innerWidth - 170);
  const y = Math.min(e.clientY, window.innerHeight - 90);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  const hideItemHtml = !card.isPrivate
    ? `<button type="button" class="ctx-item ctx-hide"><i class="fa-solid fa-eye-slash"></i> 非表示にする</button>`
    : '';
  menu.innerHTML = `
    <button type="button" class="ctx-item ctx-edit"><i class="fa-solid fa-pen"></i> 編集</button>
    <button type="button" class="ctx-item ctx-add-child"><i class="fa-solid fa-sitemap"></i> 子カードを追加</button>
    ${hideItemHtml}
    <button type="button" class="ctx-item ctx-delete"><i class="fa-solid fa-trash"></i> 削除</button>
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
  const ctxHide = menu.querySelector('.ctx-hide');
  if (ctxHide) {
    ctxHide.addEventListener('click', e => {
      e.stopPropagation();
      closeContextMenu();
      hideCard(card.id);
    });
  }
  menu.querySelector('.ctx-delete').addEventListener('click', async e => {
    e.stopPropagation();
    closeContextMenu();
    if (await confirmDelete(`?${card.label}?????????`)) {
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


// ========== お気に入り�Eみ表示 ==========
function applyFavoritesOnlyMode() {
  document.getElementById('app-main')?.classList.toggle('favorites-only', state.favoritesOnlyMode);
  renderFavorites();
  const btn = document.getElementById('btn-favorites-only');
  if (!btn) return;
  if (state.favoritesOnlyMode) {
    btn.classList.add('active');
    btn.title = 'すべて表示';
    // サイドバー構造に対応！Eidebar-item-icon / sidebar-item-label�E�E
    const iconEl = btn.querySelector('.app-sidebar-icon i') || btn.querySelector('i');
    const labelEl = btn.querySelector('.sidebar-item-label') || btn.querySelector('.btn-fav-label');
    if (iconEl) {
      iconEl.className = 'material-symbols-rounded';
      iconEl.textContent = 'star';
      iconEl.style.fontVariationSettings = "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24";
    }
    if (labelEl) { labelEl.textContent = 'すべて表示'; }
  } else {
    btn.classList.remove('active');
    btn.title = '?????????????????????';
    const iconEl = btn.querySelector('.app-sidebar-icon i') || btn.querySelector('i');
    const labelEl = btn.querySelector('.sidebar-item-label') || btn.querySelector('.btn-fav-label');
    if (iconEl) {
      iconEl.className = 'material-symbols-rounded';
      iconEl.textContent = 'star';
      iconEl.style.fontVariationSettings = "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";
    }
    if (labelEl) { labelEl.textContent = 'お気に入り�Eみ'; }
  }
  renderFavorites();
}

function toggleFavoritesOnly() {
  state.favoritesOnlyMode = !state.favoritesOnlyMode;
  savePreferencesToSupabase();
  applyFavoritesOnlyMode();
}


// ========== セクションまとめてお気に入めE==========
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
      sBtn.title = nowAllFaved ? '??????' : '??????????????';
      sBtn.innerHTML = `<i class="fa-${nowAllFaved ? 'solid' : 'regular'} fa-star"></i>`;
    }
  }
}


// ========== 検索 ==========
function normalizeForSearch(s) {
  return (s || '').normalize('NFKC').toLowerCase();
}

function _getCardGradient(card) {
  if (card.isPrivate) {
    const sec = state.privateCategories.find(c => c.docId === card.sectionId);
    if (sec) {
      const color = CATEGORY_COLORS.find(c => c.index === sec.colorIndex);
      return color ? color.gradient : CATEGORY_COLORS[0].gradient;
    }
    return CATEGORY_COLORS[0].gradient;
  }
  const cat = state.allCategories.find(c => c.id === card.category);
  if (!cat) return CATEGORY_COLORS[0].gradient;
  return getCategoryGradient(cat);
}

function _buildSearchBreadcrumb(card, allData) {
  const parts = [];
  // カチE��リ吁E
  if (card.isPrivate) {
    const sec = state.privateCategories.find(c => c.docId === card.sectionId);
    if (sec) parts.push(`<span class="srb-cat">${esc(sec.label)}</span>`);
  } else {
    const cat = state.allCategories.find(c => c.id === card.category);
    if (cat) parts.push(`<span class="srb-cat">${esc(cat.label)}</span>`);
  }
  // 親カード名�E�あれ�E�E�E
  if (card.parentId) {
    const parent = allData.find(c => c.id === card.parentId);
    if (parent) parts.push(`<span class="srb-parent">${esc(parent.label)}</span>`);
  }
  return parts.join('<i class="fa-solid fa-chevron-right srb-arrow"></i>');
}

function _clearSearchResults() {
  const resultsSection = document.getElementById('search-results-section');
  const noResults      = document.getElementById('no-results');
  if (resultsSection) { resultsSection.hidden = true; resultsSection.innerHTML = ''; }
  if (noResults) noResults.classList.remove('visible');
  document.querySelectorAll('.category-section, .external-tools, .btn-add-category-wrap, .area-header, .shared-home-shell, .portal-shared-shell, .portal-rail-shell')
    .forEach(el => el.classList.remove('search-hidden'));
}

function initSearch() {
  const searchInput    = document.getElementById('search-input');
  const container      = searchInput.closest('.search-container, .app-search-wrap');
  const noResults      = document.getElementById('no-results');
  const resultsSection = document.getElementById('search-results-section');

  if (container) container.addEventListener('click', () => searchInput.focus());

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchInput.blur();
      searchInput.dispatchEvent(new Event('input'));
    }
  });

  searchInput.addEventListener('input', async () => {
    const raw = searchInput.value.trim();
    const q   = normalizeForSearch(raw);
    if (container) container.classList.toggle('has-value', raw.length > 0);

    if (!q) {
      _clearSearchResults();
      return;
    }

    // 検索中はすべてのセクションとエリアヘッダーを隠ぁE
    document.querySelectorAll('.category-section, .external-tools, .btn-add-category-wrap, .area-header, .shared-home-shell, .portal-shared-shell, .portal-rail-shell')
      .forEach(el => el.classList.add('search-hidden'));

    if (!state.sharedCardsLoaded && !state.sharedCardsLoading) {
      resultsSection.hidden = false;
      resultsSection.innerHTML = `
        <div class="search-results-header">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>共有リンクを検索するために一覧を読み込んでぁE��ぁE..</span>
        </div>
      `;
      noResults.classList.remove('visible');
      try {
        await ensureSharedCardsLoaded();
      } catch (err) {
        console.error('共有リンク検索の読み込みエラー:', err);
      }
    }

    // 全カードから�EチE��するも�Eを直接探す（非表示カード�E除く！E
    const allData = [...(state.allCards || []), ...(state.privateCards || [])];
    const matches = allData.filter(card =>
      !state.hiddenCards.includes(card.id) &&
      normalizeForSearch(card.label).includes(q)
    );

    if (matches.length === 0) {
      resultsSection.hidden = true;
      resultsSection.innerHTML = '';
      noResults.classList.add('visible');
      return;
    }

    noResults.classList.remove('visible');
    resultsSection.hidden = false;
    resultsSection.innerHTML = `
      <div class="search-results-header">
        <i class="fa-solid fa-magnifying-glass"></i>
        <span><strong>${matches.length}</strong> 件見つかりました</span>
      </div>
      <div class="search-results-grid" id="search-results-grid"></div>
    `;
    const grid = document.getElementById('search-results-grid');

    matches.forEach(card => {
      const wrap = document.createElement('div');
      wrap.className = 'search-result-wrap';

      const crumbEl = document.createElement('div');
      crumbEl.className = 'search-result-breadcrumb';
      crumbEl.innerHTML = _buildSearchBreadcrumb(card, allData);
      wrap.appendChild(crumbEl);

      const cardEl = buildLinkCard(card, false, _getCardGradient(card));
      wrap.appendChild(cardEl);
      grid.appendChild(wrap);
    });
  });
}


// ========== 時訁E==========
function updateClock() {
  const now = new Date();
  const clockEl = document.getElementById('header-clock');
  if (clockEl) {
    clockEl.textContent =
      now.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }) +
      ' ' + now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}


// ========== PIN 送信処琁E==========
async function handlePinSubmit() {
  const now = Date.now();
  if (now < state.lockoutUntil) {
    document.getElementById('pin-error').textContent = `${Math.ceil((state.lockoutUntil - now) / 1000)}秒後に再試行してください`;
    return;
  }

  const digits = [...document.querySelectorAll('.pin-digit')].map(el => el.value).join('');
  if (digits.length !== 4) {
    document.getElementById('pin-error').textContent = '4桁�EPINを�E力してください';
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
          document.getElementById('pin-error').textContent = '3回失敗、E0秒後に再試行してください';
        } else {
          document.getElementById('pin-error').textContent = `PINが違ぁE��す（残り${3 - state.failedAttempts}回）`;
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


// ========== 表示設定（テーマ�E斁E��サイズ�E�E==========
const THEMES     = ['dark', 'light'];
const FONTSIZES  = ['font-sm', 'font-md', 'font-lg', 'font-xl'];

function applyTheme(theme, save = true) {
  const t = THEMES.includes(theme) ? theme : 'dark';
  document.body.setAttribute('data-theme', t);
  document.querySelectorAll('#theme-grid .theme-card').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === t);
  });
  localStorage.setItem('portal-theme', t);
  if (save) savePreferencesToSupabase();
}

function applyFontSize(sizeClass, save = true) {
  const s = sizeClass || 'font-md';
  FONTSIZES.forEach(c => document.documentElement.classList.remove(c));
  document.documentElement.classList.add(s);
  document.querySelectorAll('#fontsize-grid .fontsize-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === s);
  });
  localStorage.setItem('portal-font-size', s);
  if (save) savePreferencesToSupabase();
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
  _renderHiddenCardsList();
}

function closeSettingsPanel() {
  document.getElementById('settings-panel').setAttribute('hidden', '');
  document.getElementById('settings-fab').classList.remove('active');
}

// ===== Dialog accessibility helper =====
const DIALOG_ROOT_SELECTOR = [
  '.modal-overlay',
  '#chat-panel',
  '#ft-panel',
  '#settings-panel',
  '#more-drawer',
  '#weather-panel',
].join(', ');

const DIALOG_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const dialogRestoreFocus = new WeakMap();
let dialogA11yStarted = false;

function initDialogAccessibility() {
  if (dialogA11yStarted) return;
  dialogA11yStarted = true;

  const roots = new Set();

  const attachRoot = root => {
    if (!root || roots.has(root) || !(root instanceof HTMLElement)) return;
    roots.add(root);
    enhanceDialogRoot(root);
    const rootObserver = new MutationObserver(() => trackDialogState(root));
    rootObserver.observe(root, { attributes: true, attributeFilter: ['hidden', 'class'] });
    root.__dialogObserver = rootObserver;
    trackDialogState(root);
  };

  document.querySelectorAll(DIALOG_ROOT_SELECTOR).forEach(attachRoot);

  document.addEventListener('keydown', handleDialogKeydown, true);
  document.addEventListener('focusin', handleDialogFocusIn, true);
}

function enhanceDialogRoot(root) {
  if (!root.hasAttribute('role')) {
    root.setAttribute('role', 'dialog');
  }
  root.setAttribute('aria-modal', 'true');
  if (!root.hasAttribute('tabindex')) {
    root.tabIndex = -1;
  }

  const titleEl = root.querySelector('.modal-title, .guide-title, .settings-panel-header span, .chat-sidebar-header span, .ft-panel-header span, .more-drawer-header span, .weather-panel-title, h1, h2, h3, h4');
  if (titleEl) {
    if (!titleEl.id) {
      titleEl.id = `${root.id || 'dialog'}-label`;
    }
    root.setAttribute('aria-labelledby', titleEl.id);
  }

  root.querySelectorAll('button').forEach(btn => {
    const label = `${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''} ${btn.textContent || ''}`.replace(/\s+/g, ' ').trim();
    if (/(閉じる|close|xmark)/i.test(label) || /close/i.test(btn.className || '')) {
      btn.setAttribute('aria-label', '閉じる');
    }
    if (!btn.getAttribute('type')) {
      btn.setAttribute('type', 'button');
    }
  });
}

function trackDialogState(root) {
  const visible = isDialogVisible(root);
  root.dataset.dialogVisible = visible ? '1' : '0';
  if (visible) {
    if (!dialogRestoreFocus.has(root)) {
      const active = document.activeElement;
      dialogRestoreFocus.set(root, active instanceof HTMLElement ? active : null);
    }
    requestAnimationFrame(() => focusFirstDialogControl(root));
  } else if (dialogRestoreFocus.has(root)) {
    const restoreTarget = dialogRestoreFocus.get(root);
    dialogRestoreFocus.delete(root);
    if (restoreTarget instanceof HTMLElement && restoreTarget.isConnected) {
      setTimeout(() => {
        try {
          restoreTarget.focus({ preventScroll: true });
        } catch (_) {}
      }, 0);
    }
  }
}

function isDialogVisible(root) {
  if (!root) return false;
  if (root.hidden) return false;
  if (root.id === 'rd-modal') return root.classList.contains('visible') || root.classList.contains('open');
  if (root.classList.contains('modal-overlay')) {
    return root.classList.contains('visible') || root.classList.contains('open');
  }
  if (root.id === 'settings-panel') return !root.hasAttribute('hidden');
  if (root.id === 'more-drawer') return !root.hasAttribute('hidden');
  if (root.id === 'chat-panel' || root.id === 'ft-panel' || root.id === 'weather-panel') {
    return !root.hasAttribute('hidden');
  }
  if (root.classList.contains('visible') || root.classList.contains('open')) return true;
  return !root.hasAttribute('hidden');
}

function getVisibleDialogRoots() {
  return [...document.querySelectorAll(DIALOG_ROOT_SELECTOR)].filter(isDialogVisible);
}

function getActiveDialogRoot() {
  const roots = getVisibleDialogRoots();
  return roots.length > 0 ? roots[roots.length - 1] : null;
}

function getDialogFocusables(root) {
  if (!root) return [];
  return [...root.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR)]
    .filter(el => el instanceof HTMLElement && isElementVisible(el));
}

function isElementVisible(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
}

function focusFirstDialogControl(root) {
  const focusables = getDialogFocusables(root);
  const target = focusables[0] || root;
  if (target instanceof HTMLElement) {
    try {
      target.focus({ preventScroll: true });
    } catch (_) {}
  }
}

function findDialogCloseButton(root) {
  if (!root) return null;
  const buttons = [...root.querySelectorAll('button')];
  return buttons.find(btn => {
    const label = `${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''} ${btn.textContent || ''}`.replace(/\s+/g, ' ').trim();
    const cls = `${btn.className || ''}`;
    return /(閉じる|close|xmark)/i.test(label) || /close/i.test(cls);
  }) || null;
}

function handleDialogKeydown(event) {
  const root = getActiveDialogRoot();
  if (!root) return;

  if (event.key === 'Escape') {
    const closeBtn = findDialogCloseButton(root);
    if (closeBtn) {
      event.preventDefault();
      event.stopPropagation();
      closeBtn.click();
    }
    return;
  }

  if (event.key !== 'Tab') return;

  const focusables = getDialogFocusables(root);
  if (!focusables.length) {
    event.preventDefault();
    focusFirstDialogControl(root);
    return;
  }

  const current = document.activeElement;
  const currentIndex = focusables.indexOf(current);
  if (currentIndex === -1) {
    event.preventDefault();
    focusables[0].focus({ preventScroll: true });
    return;
  }

  event.preventDefault();
  const nextIndex = event.shiftKey
    ? (currentIndex - 1 + focusables.length) % focusables.length
    : (currentIndex + 1) % focusables.length;
  focusables[nextIndex].focus({ preventScroll: true });
}

function handleDialogFocusIn(event) {
  const root = getActiveDialogRoot();
  if (!root || root.contains(event.target)) return;
  const focusables = getDialogFocusables(root);
  const target = focusables[0] || root;
  if (target instanceof HTMLElement) {
    try {
      target.focus({ preventScroll: true });
    } catch (_) {}
  }
}

function syncAccessibleButtonLabels(root = document) {
  if (!root) return;
  root.querySelectorAll('button, a[role="button"], [role="button"]').forEach(el => {
    const title = (el.getAttribute('title') || '').trim();
    if (title && !el.hasAttribute('aria-label')) {
      el.setAttribute('aria-label', title);
    }
    el.querySelectorAll('i, svg, .material-symbols-rounded').forEach(icon => {
      icon.setAttribute('aria-hidden', 'true');
    });
  });
}


// ========== 初期匁E==========
document.addEventListener('DOMContentLoaded', async () => {
  // 最初に設定を適用�E�フラチE��ュ防止�E�E
  loadSettings();
  initDialogAccessibility();

  updateClock();
  setInterval(updateClock, 1000);
  const storedUsername = state.currentUsername;
  if (storedUsername) {
    state.currentUsername = null;
  }

  // 常に編雁E��ーチE
  document.body.classList.add('edit-mode');

  // 公開リンクは忁E��な時だけ読み込む。�E有�Eームは軽ぁE��態で先に描画する、E
  state.allCards = [];
  renderAllSections();
  initSearch();
  renderFavorites();
  syncAccessibleButtonLabels();

  // お知らせリアクションを�E行読み込み

  // 天気�E即時取得！E0刁E��と更新�E�E
  fetchAndRenderWeather();
  setInterval(fetchAndRenderWeather, 30 * 60 * 1000);

  // ===== 天気パネル =====
  document.getElementById('wpanel-close')?.addEventListener('click', closeWeatherPanel);
  document.getElementById('tab-radar')?.addEventListener('click', () => switchWeatherTab('radar'));
  document.getElementById('tab-solar')?.addEventListener('click', () => switchWeatherTab('solar'));

  // ===== 太陽光発電カーチE=====
  document.addEventListener('click', e => {
    const card = e.target.closest('[data-solar-open]');
    if (card) {
      e.preventDefault();
      openWeatherPanel('solar');
    }
  });

  // ===== サイドバートグル =====
  (function() {
    const layout   = document.getElementById('app-layout');
    const toggle   = document.getElementById('sidebar-toggle');
    const overlay  = document.getElementById('sidebar-overlay');
    const isMobile = () => window.innerWidth <= 768;
    const STORAGE_KEY = 'portal-sidebar-collapsed';

    function openSidebar() {
      if (isMobile()) {
        layout.classList.add('sidebar-open');
        layout.classList.remove('sidebar-collapsed');
      } else {
        layout.classList.remove('sidebar-collapsed');
        localStorage.setItem(STORAGE_KEY, '0');
      }
    }
    function closeSidebar() {
      if (isMobile()) {
        layout.classList.remove('sidebar-open');
      } else {
        layout.classList.add('sidebar-collapsed');
        localStorage.setItem(STORAGE_KEY, '1');
      }
    }
    function toggleSidebar() {
      if (isMobile()) {
        layout.classList.contains('sidebar-open') ? closeSidebar() : openSidebar();
      } else {
        layout.classList.contains('sidebar-collapsed') ? openSidebar() : closeSidebar();
      }
    }

    if (toggle) toggle.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // チE��クトップ：前回�E状態を復允E
    if (!isMobile() && localStorage.getItem(STORAGE_KEY) === '1') {
      layout.classList.add('sidebar-collapsed');
    }

    // ホ�Eムボタン
    // 検索クリアボタン
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('app-search-clear');
    if (searchInput && searchClear) {
      searchInput.addEventListener('input', () => {
        searchClear.hidden = !searchInput.value;
      });
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.hidden = true;
        searchInput.dispatchEvent(new Event('input'));
        searchInput.focus();
      });
    }

    // モバイル�E�サイドバー冁E��イチE��をタチE�E→�E動閉ぁE
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) {
      // サイドバーボタン → 直接モーダル/パネルを開く（ステージ切り替えなし）
      const sidebarDirectActions = {
        'sidebar-home-btn':     () => window.scrollTo({ top: 0, behavior: 'smooth' }),
        'btn-calendar':         async () => {
          await openCalendarModal();
          if (document.getElementById('cal-modal')?.classList.contains('visible')) {
            await onCalendarModalOpen();
          }
        },
        'btn-task':             () => openTaskModalFromHome(),
        'btn-notice-bell':      () => openNoticeModal(null),
        'btn-reqboard':         () => openRequestModalFromHome(),
        'chat-fab':             () => state.chatPanelOpen ? closeChatPanel() : openChatPanel(),
        'ft-fab':               () => state._ftPanelOpen ? closeFileTransferPanel() : openFileTransferPanel(),
        'btn-order-launch':     () => openOrderModal(),
        'btn-property-summary': () => openPropertySummaryFromHome(),
        'btn-email-assist':     () => openEmailModal(),
        'btn-favorites-only':   () => toggleFavoritesOnly(),
        'btn-shared-links':     () => { state.sharedLinksCategory = 'all'; void openSharedLinksModal(); },
        'btn-my-category':      () => openPrivateSectionModal(null),
        'settings-fab':         () => openSettingsPanelFromHome(),
        'help-fab':             () => openGuideModalFromHome(),
        'btn-read-diagnostics': () => openReadDiagnosticsFromHome(),
        'home-invite-btn':      () => openInviteCodeModalFromHome(),
      };
      sidebar.addEventListener('click', e => {
        const button = e.target.closest('[data-home-target]');
        if (!button || !sidebar.contains(button)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const action = sidebarDirectActions[button.id];
        if (action) void action();
        if (isMobile()) setTimeout(closeSidebar, 80);
      }, true);
    }

  })();

  // ===== 使ぁE��ガイチE=====
  document.getElementById('help-fab')?.addEventListener('click', () => {
    document.getElementById('guide-modal').classList.add('visible');
  });
  // ヘッダーのヘルプ�Eタン�E�ECスマ�E共通！E
  document.getElementById('header-help-btn')?.addEventListener('click', () => {
    document.getElementById('guide-modal').classList.add('visible');
  });
  document.getElementById('header-notice-btn')?.addEventListener('click', () => {
    focusNoticeBoardFromDashboard();
  });
  document.getElementById('header-home-btn')?.addEventListener('click', () => {
    focusHomeWorkspace('notice', 'sidebar-home-btn', { scrollToTop: true });
  });
  document.getElementById('header-shared-btn')?.addEventListener('click', () => {
    state.sharedLinksCategory = 'all';
    void openSharedLinksModal();
  });
  document.getElementById('header-dashboard-btn')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('header-manual-btn')?.addEventListener('click', () => {
    document.getElementById('guide-modal').classList.add('visible');
  });
  document.getElementById('guide-close')?.addEventListener('click', () => {
    document.getElementById('guide-modal').classList.remove('visible');
  });
  document.getElementById('guide-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('guide-modal').classList.remove('visible');
  });

  // ===== サービスピッカー =====
  document.getElementById('service-picker-cancel')?.addEventListener('click', closeServicePicker);
  document.getElementById('service-picker-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeServicePicker();
  });

  // ===== ニックネ�Eム / プロフィール =====
  document.getElementById('btn-user')?.addEventListener('click', () => {
    if (state.currentUsername) {
      openProfileModal();
      bindProfileQuickActions();
      return;
    }
    showUsernameModal(true);
  });
  updateUsernameDisplay();

  document.getElementById('auth-invite-submit')?.addEventListener('click', async () => {
    await submitInviteCode(document.getElementById('auth-invite-input').value);
  });
  document.getElementById('auth-invite-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('auth-invite-submit').click();
  });
  document.getElementById('home-invite-btn')?.addEventListener('click', async () => {
    try {
      await loadInviteCodeConfig();
    } catch (err) {
      console.error('招征E��ード設定�E読込に失敗しました:', err);
    }
    openInviteCodeModal();
  });

  document.getElementById('auth-prelogin-submit')?.addEventListener('click', async () => {
    await submitPreloginPin(document.getElementById('auth-prelogin-input').value);
  });
  document.getElementById('auth-prelogin-input')?.addEventListener('keydown', e => {
    if (/^[0-9]$/.test(e.key) || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.stopPropagation();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('auth-prelogin-submit').click();
    }
  });
  document.getElementById('auth-prelogin-cancel')?.addEventListener('click', async () => {
    await cancelPreloginPin();
  });

  document.getElementById('username-submit')?.addEventListener('click', () => {
    const name = document.getElementById('username-input').value.trim();
    if (!name) { document.getElementById('username-input').focus(); return; }
    saveUsername(name);
  });
  document.getElementById('username-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('username-submit').click();
  });
  document.getElementById('username-input')?.addEventListener('input', hideUsernameError);
  document.getElementById('username-reclaim')?.addEventListener('click', async () => {
    const name = document.getElementById('username-input').value.trim();
    if (name) await loginExistingUsername(name);
  });
  document.getElementById('username-skip')?.addEventListener('click', () => {
    closeUsernameModal();
    // スキチE�E後：ユーザーネ�Eム未設定バナ�Eを表示
    if (!state.currentUsername) {
      const hint = document.getElementById('area-personal-hint');
      if (hint) hint.hidden = false;
    }
  });

  void ensureInviteAccess();

  void Promise.all([loadCategories(), subscribeNotices()])
    .then(() => {
      renderAllSections();
      renderFavorites();
    })
    .catch(err => {
      console.error('Supabase ?????????????????:', err);
    });

  applyFavoritesOnlyMode();

  // ===== ロチE��ボタン =====
  document.getElementById('btn-lock-header')?.addEventListener('click', lockPortal);

  // ロチE��画面チE��キー
  document.querySelectorAll('.lock-key[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => handleLockKeyPress(btn.dataset.digit));
  });
  document.getElementById('lock-key-del')?.addEventListener('click', handleLockDelete);
  document.getElementById('btn-lock-switch-user')?.addEventListener('click', lockSwitchUser);

  // キーボ�EドでもPIN入劁E
  document.addEventListener('keydown', e => {
    if (document.getElementById('lock-screen').hidden) return;
    if (/^[0-9]$/.test(e.key)) handleLockKeyPress(e.key);
    if (e.key === 'Backspace') handleLockDelete();
  });

  // セキュリチE��設宁E
  document.getElementById('btn-open-security')?.addEventListener('click', () => {
    closeUsernameModal();
    openSecurityModal();
  });
  document.getElementById('security-cancel')?.addEventListener('click', closeSecurityModal);

  // ロチE��機�E ON/OFF トグル
  document.getElementById('lock-enabled-toggle')?.addEventListener('change', async e => {
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

  // 自動ロチE��時間
  document.getElementById('autolock-time-grid')?.addEventListener('click', async e => {
    const btn = e.target.closest('.autolock-time-btn');
    if (!btn) return;
    state.autoLockMinutes = parseInt(btn.dataset.minutes);
    document.querySelectorAll('.autolock-time-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.lastActivityAt = Date.now();
    await saveLockSettings();
  });

  // 管琁E��E��ネル
  document.getElementById('btn-open-admin')?.addEventListener('click', () => {
    closeSettingsPanel();
    openAdminModal();
  });
  document.getElementById('admin-cancel')?.addEventListener('click', closeAdminModal);
  document.getElementById('admin-close')?.addEventListener('click', closeAdminModal);
  document.getElementById('admin-auth-btn')?.addEventListener('click', async () => {
    const pin   = document.getElementById('admin-pin-input').value;
    const errEl = document.getElementById('admin-auth-error');
    errEl.hidden = true;
    const ok = await verifyPIN(pin);
    if (ok) {
      state.isAdmin = true;
      document.getElementById('admin-auth-area').hidden  = true;
      document.getElementById('admin-panel-area').hidden = false;
      await loadInviteCodeConfig();
      loadUsersForAdmin();
      renderAdminSuggBoxSection();
      // ミッションチE��ストを入力欁E��反映
      const mInput = document.getElementById('admin-mission-input');
      if (mInput) mInput.value = state.missionText || '';
      renderSupabaseAdminState();
    } else {
      errEl.hidden = false;
    }
  });
  document.getElementById('admin-pin-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('admin-auth-btn').click();
  });

  // 管琁E��EIN初回設宁E
  document.getElementById('admin-setup-btn')?.addEventListener('click', async () => {
    const pin     = document.getElementById('admin-new-pin').value;
    const confirm = document.getElementById('admin-new-pin-confirm').value;
    const errEl   = document.getElementById('admin-setup-error');
    errEl.hidden  = true;
    if (!/^\d{4,6}$/.test(pin))  { errEl.textContent = '4、E桁�E数字を入力してください'; errEl.hidden = false; return; }
    if (pin !== confirm)          { errEl.textContent = 'PINが一致しません';               errEl.hidden = false; return; }
    await setPIN(pin);
    document.getElementById('admin-setup-area').hidden = true;
    document.getElementById('admin-panel-area').hidden = false;
    await loadInviteCodeConfig();
    loadUsersForAdmin();
    renderAdminSuggBoxSection();
    const mInput = document.getElementById('admin-mission-input');
    if (mInput) mInput.value = state.missionText || '';
    renderSupabaseAdminState();
  });
  document.getElementById('admin-setup-cancel')?.addEventListener('click', closeAdminModal);
  document.getElementById('admin-invite-save-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('admin-invite-input');
    const msgEl = document.getElementById('admin-invite-error');
    msgEl.hidden = true;
    try {
      await saveInviteCode(input.value);
    } catch (err) {
      msgEl.textContent = err?.message || '????????????????';
      msgEl.hidden = false;
    }
  });
  document.getElementById('admin-invite-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('admin-invite-save-btn').click();
  });
  document.getElementById('admin-invite-clear-btn')?.addEventListener('click', async () => {
    const msgEl = document.getElementById('admin-invite-error');
    msgEl.hidden = true;
    if (!await showConfirm('????????????????????', { danger: true })) return;
    try {
      await clearInviteCode();
    } catch (err) {
      msgEl.textContent = err?.message || '????????????????';
      msgEl.hidden = false;
    }
  });

  // PIN設宁E
  document.getElementById('admin-supabase-save-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('admin-supabase-save-btn');
    const errEl = document.getElementById('admin-supabase-error');
    const urlEl = document.getElementById('admin-supabase-url');
    const keyEl = document.getElementById('admin-supabase-key');
    errEl.hidden = true;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      await saveSupabaseRuntimeConfig({
        url: urlEl?.value || '',
        apiKey: keyEl?.value || '',
      });
      await reloadSharedCoreData();
      renderSupabaseAdminState('???????Supabase ??????????');
      btn.innerHTML = '<i class="fa-solid fa-check"></i> ????';
    } catch (err) {
      errEl.textContent = err?.message || 'Supabase ?????????????';
      errEl.hidden = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ??';
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ??';
      }, errEl.hidden ? 1200 : 0);
    }
  });

  // カチE��リ修復ボタン�E�Eupabase 上�EカチE��リラベルが文字化けしてぁE��場合に修復�E�E
  const repairCategoriesBtn = document.getElementById('admin-repair-categories-btn');
  repairCategoriesBtn?.addEventListener('click', async () => {
    const btn = repairCategoriesBtn;
    const errEl = document.getElementById('admin-supabase-error');
    errEl.hidden = true;
    if (!isSupabaseSharedCoreEnabled()) {
      showToast('Supabase ??????????', 'warning');
      return;
    }
    if (!await showConfirm('Supabase ??????????????????????????', { danger: true })) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      for (const cat of DEFAULT_CATEGORIES) {
        await updateSharedCategoryInSupabase(cat.id, {
          label: cat.label,
          icon: cat.icon,
          colorIndex: cat.colorIndex,
          order: cat.order,
          isExternal: cat.isExternal ?? false,
        });
      }
      await reloadSharedCoreData();
      showToast('????????????', 'success');
      btn.innerHTML = '<i class="fa-solid fa-check"></i> ????';
    } catch (err) {
      errEl.textContent = err?.message || '???????????????';
      errEl.hidden = false;
      btn.innerHTML = '<i class="fa-solid fa-wrench"></i> ??????';
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-wrench"></i> ??????';
      }, errEl.hidden ? 1500 : 0);
    }
  });

  document.getElementById('btn-set-pin')?.addEventListener('click', async () => {
    const newPin  = document.getElementById('new-pin-input').value;
    const confirm = document.getElementById('confirm-pin-input').value;
    const errEl   = document.getElementById('security-pin-error');
    errEl.hidden  = true;
    if (!/^\d{4}$/.test(newPin))   { errEl.textContent = '4桁�E数字を入力してください'; errEl.hidden = false; return; }
    if (newPin !== confirm)         { errEl.textContent = 'PINが一致しません';           errEl.hidden = false; return; }
    if (!state.currentUsername)     { errEl.textContent = 'ユーザーネ�Eムを設定してください'; errEl.hidden = false; return; }
    try {
      await setLockPin(newPin);
      closeSecurityModal();
      const btn = document.getElementById('btn-lock-header');
      btn.classList.add('lock-set-flash');
      setTimeout(() => btn.classList.remove('lock-set-flash'), 1000);
    } catch (_) { errEl.textContent = '設定に失敗しました'; errEl.hidden = false; }
  });

  // PIN変更
  document.getElementById('btn-change-pin')?.addEventListener('click', async () => {
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
  document.getElementById('btn-remove-pin')?.addEventListener('click', async () => {
    const cur    = document.getElementById('current-pin-input').value;
    const errEl  = document.getElementById('security-current-error');
    errEl.hidden = true;
    const hash   = await hashPIN(cur);
    if (hash !== state.lockPinHash) { errEl.textContent = 'PINが正しくありません'; errEl.hidden = false; return; }
    await removeLockPin();
    closeSecurityModal();
  });

  // 初回訪問時にニックネ�Eムモーダル
  if (!storedUsername) {
    setTimeout(() => showUsernameModal(false), 600);
    renderTodoSection();
  } else {
    const restored = await restoreStoredUsernameSession(storedUsername);
    if (!restored && !state.currentUsername) {
      renderTodoSection();
    }
  }

  // ===== TODO パネル =====
  document.getElementById('todo-toggle-btn')?.addEventListener('click', () => {
    state.todoCollapsed = !state.todoCollapsed;
    renderTodoSection();
  });

  // �E�追加ボタン ↁE入力行を展開
  document.getElementById('todo-open-btn')?.addEventListener('click', () => {
    const row = document.getElementById('todo-add-row');
    const openBtn = document.getElementById('todo-open-btn');
    row.hidden = false;
    openBtn.hidden = true;
    document.getElementById('todo-input').focus();
  });

  // キャンセルボタン ↁE入力行を閉じめE
  function closeTodoRow() {
    const row = document.getElementById('todo-add-row');
    const openBtn = document.getElementById('todo-open-btn');
    row.hidden = true;
    openBtn.hidden = false;
    document.getElementById('todo-input').value = '';
    document.getElementById('todo-due-select').value = '';
  }
  document.getElementById('todo-cancel-btn')?.addEventListener('click', closeTodoRow);

  document.getElementById('todo-add-btn')?.addEventListener('click', async () => {
    const input  = document.getElementById('todo-input');
    const due    = document.getElementById('todo-due-select');
    const text   = input.value.trim();
    if (!text) { input.focus(); return; }
    await addTodo(text, due.value);
    closeTodoRow();
  });

  document.getElementById('todo-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('todo-add-btn').click();
    if (e.key === 'Escape') closeTodoRow();
  });

  // ===== 鋼材発注 =====
  document.getElementById('btn-order-launch')?.addEventListener('click', openOrderModal);
  document.getElementById('btn-property-summary')?.addEventListener('click', () => openPropertySummaryModal());
  document.getElementById('ord-open-admin-btn')?.addEventListener('click', () => {
    document.getElementById('ord-modal').classList.remove('visible');
    openOrderAdminModal();
  });

  // ===== メールアシスタンチE=====
  document.getElementById('btn-email-assist')?.addEventListener('click', () => {
    openEmailModal();
  });
  document.getElementById('email-modal-close')?.addEventListener('click', closeEmailModal);
  document.getElementById('email-modal')?.addEventListener('click', e => {
    if (e.target.id === 'email-modal') closeEmailModal();
  });
  document.getElementById('profile-modal-close')?.addEventListener('click', closeProfileModal);
  document.getElementById('profile-modal')?.addEventListener('click', e => {
    if (e.target.id === 'profile-modal') closeProfileModal();
  });
  document.getElementById('email-open-profile-btn')?.addEventListener('click', () => {
    closeEmailModal();
    openProfileModal();
  });
  // 新要E返信選抁E
  document.getElementById('email-type-new')?.addEventListener('click', () => setEmailMode('new'));
  document.getElementById('email-type-reply')?.addEventListener('click', () => setEmailMode('reply'));
  document.getElementById('email-back-btn')?.addEventListener('click', resetEmailMode);
  // 連絡允E
  document.getElementById('email-contact-add-btn')?.addEventListener('click', () => {
    const newContact = document.getElementById('email-new-contact');
    newContact.hidden = !newContact.hidden;
  });
  document.getElementById('email-contact-save-btn')?.addEventListener('click', saveNewContact);
  document.getElementById('email-contact-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('email-new-contact').hidden = true;
  });
  // 斁E��選抁E
  document.getElementById('email-tone-btns')?.addEventListener('click', e => {
    const btn = e.target.closest('.email-tone-btn');
    if (btn) selectTone(btn.dataset.tone);
  });
  // 生�E・コピ�E・リセチE��
  document.getElementById('email-generate')?.addEventListener('click', generateEmail);
  document.getElementById('btn-copy-output')?.addEventListener('click', copyEmailOutput);
  document.getElementById('btn-reset-output')?.addEventListener('click', resetEmailOutput);
  document.getElementById('email-api-key-save')?.addEventListener('click', saveGeminiApiKey);
  // タチE
  // プロフィール
  document.getElementById('ep-save')?.addEventListener('click', saveUserEmailProfile);
  document.getElementById('ep-reset-sig')?.addEventListener('click', resetSignatureTemplate);
  document.getElementById('ep-signature')?.addEventListener('input', e => updateSignaturePreview(e.target.value));
  bindProfileQuickActions();

  // ===== チャチE��FAB =====
  document.getElementById('chat-fab')?.addEventListener('click', () => {
    state.chatPanelOpen ? closeChatPanel() : openChatPanel();
  });
  document.getElementById('chat-panel-close')?.addEventListener('click', closeChatPanel);
  document.getElementById('chat-room-close')?.addEventListener('click', closeChatPanel);
  document.addEventListener('click', e => {
    if (window.innerWidth > 768) return;
    const panel = document.getElementById('chat-panel');
    const fab = document.getElementById('chat-fab');
    if (!panel || panel.hasAttribute('hidden') || !state.chatPanelOpen) return;
    if (panel.contains(e.target)) return;
    if (fab && (e.target === fab || fab.contains(e.target))) return;
    closeChatPanel();
  });
  initChatResize();
  document.getElementById('chat-tab-dm')?.addEventListener('click', () => switchChatSidebarTab('dm'));
  document.getElementById('chat-tab-group')?.addEventListener('click', () => switchChatSidebarTab('group'));
  document.getElementById('chat-send-btn')?.addEventListener('click', sendChatMessage);
  document.getElementById('chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // ===== チャットショートカット =====
  document.getElementById('chat-launch-task')?.addEventListener('click', openTaskModal);
  document.getElementById('chat-launch-ft')?.addEventListener('click', () => {
    // 個別チャットの場合は相手を自動選択してFT送信モーダルを開く
    if (state.currentRoomType === 'dm' && state.currentRoomId) {
      const partner = state.currentRoomId.split('_').find(u => u !== state.currentUsername);
      if (partner) {
        openFileTransferPanel();
        openFtSendModal(partner);
        return;
      }
    }
    openFileTransferPanel();
  });

  // ===== 説明文折りたたみ�E�E2P / Drive�E�E=====
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

  // ===== ファイル転送E=====
  document.getElementById('ft-fab')?.addEventListener('click', () => {
    state._ftPanelOpen ? closeFileTransferPanel() : openFileTransferPanel();
  });
  document.getElementById('ft-panel-close')?.addEventListener('click', closeFileTransferPanel);
  document.addEventListener('click', e => {
    if (window.innerWidth > 768) return;
    const panel = document.getElementById('ft-panel');
    const fab = document.getElementById('ft-fab');
    if (!panel || panel.hasAttribute('hidden') || !state._ftPanelOpen) return;
    if (panel.contains(e.target)) return;
    if (fab && (e.target === fab || fab.contains(e.target))) return;
    closeFileTransferPanel();
  });
  document.getElementById('ft-new-btn')?.addEventListener('click', openFtSendModal);
  document.getElementById('ft-cancel-btn')?.addEventListener('click', closeFtSendModal);
  document.getElementById('ft-confirm-btn')?.addEventListener('click', confirmFtSend);

  // ===== Drive シェア =====
  document.querySelectorAll('.ft-tab').forEach(btn =>
    btn.addEventListener('click', () => switchFtTab(btn.dataset.tab)));
  document.getElementById('ft-drive-send-btn')?.addEventListener('click', openDriveSendModal);
  document.getElementById('ft-drive-cancel-btn')?.addEventListener('click', closeDriveSendModal);
  document.getElementById('ft-drive-confirm-btn')?.addEventListener('click', confirmDriveSend);
  // インラインDriveリンクウィジェチE��初期化！EoadPersonalData完亁E��に呼ばれる�E�E
  initDriveLinkWidget();

  // ファイル送信モーダル: ファイル選抁E
  document.getElementById('ft-file-input')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    state._ftSelectedFile = file;
    const selEl = document.getElementById('ft-selected-file');
    selEl.innerHTML = `<i class="fa-solid ${getFileIcon(file.type)}"></i> ${esc(file.name)} <span style="color:var(--text-muted)">(${formatFileSize(file.size)})</span>`;
    selEl.hidden = false;
    document.getElementById('ft-confirm-btn').hidden = false;
  });

  // ドラチE��&ドロチE�E
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

  // ===== 個別チャット/グループ =====
  document.getElementById('btn-new-dm')?.addEventListener('click', openNewDmModal);
  document.getElementById('new-dm-cancel')?.addEventListener('click', () => {
    document.getElementById('new-dm-modal').classList.remove('visible');
  });
  document.getElementById('btn-new-group')?.addEventListener('click', openNewGroupModal);
  document.getElementById('new-group-cancel')?.addEventListener('click', () => {
    document.getElementById('new-group-modal').classList.remove('visible');
  });
  document.getElementById('new-group-create')?.addEventListener('click', createGroupRoom);

  // ===== 部門間依頼・目安箱 =====
  document.getElementById('btn-reqboard')?.addEventListener('click', () => openReqModal());
  document.getElementById('reqboard-modal-close')?.addEventListener('click', closeReqModal);
  document.querySelectorAll('.reqboard-tab').forEach(btn => {
    btn.addEventListener('click', () => switchReqTab(btn.dataset.tab));
  });
  document.querySelectorAll('.reqboard-subtab').forEach(btn => {
    btn.addEventListener('click', () => switchReqSubTab(btn.dataset.subtab));
  });
  document.getElementById('req-status-cancel')?.addEventListener('click', () => {
    document.getElementById('req-status-modal').classList.remove('visible');
    state._pendingStatusChange = null;
  });
  document.getElementById('req-status-ok')?.addEventListener('click', updateRequestStatus);
  document.getElementById('req-taskify-cancel')?.addEventListener('click', closeReqTaskifyModal);
  document.getElementById('req-taskify-pick-user')?.addEventListener('click', openReqTaskifyUserPicker);
  document.getElementById('req-taskify-confirm')?.addEventListener('click', submitRequestTaskify);
  document.getElementById('req-taskify-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeReqTaskifyModal();
  });
  document.getElementById('sugg-reply-cancel')?.addEventListener('click', () => {
    document.getElementById('sugg-reply-modal').classList.remove('visible');
    state._pendingSuggReply = null;
  });
  document.getElementById('sugg-reply-ok')?.addEventListener('click', sendSuggReply);
  document.getElementById('admin-suggbox-add-btn')?.addEventListener('click', addSuggBoxViewer);
  document.getElementById('admin-suggbox-add-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addSuggBoxViewer();
  });

  // ミッションバナー
  document.getElementById('mission-banner-toggle')?.addEventListener('click', toggleMissionBanner);
  document.getElementById('admin-mission-save-btn')?.addEventListener('click', saveMissionText);

  // ===== カード非表示確認モーダル =====
  document.getElementById('hide-card-confirm-cancel')?.addEventListener('click', () => {
    document.getElementById('hide-card-confirm-modal').classList.remove('visible');
    _pendingHideCardId = null;
  });
  document.getElementById('hide-card-confirm-ok')?.addEventListener('click', () => {
    document.getElementById('hide-card-confirm-modal').classList.remove('visible');
    if (_pendingHideCardId) {
      _doHideCard(_pendingHideCardId);
      _pendingHideCardId = null;
    }
  });
  document.getElementById('hide-card-confirm-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.remove('visible');
      _pendingHideCardId = null;
    }
  });

  // ===== カレンダー =====
  document.getElementById('btn-calendar')?.addEventListener('click', async () => {
    await openCalendarModal();
    if (document.getElementById('cal-modal')?.classList.contains('visible')) {
      await onCalendarModalOpen();
    }
  });
  document.getElementById('cal-close-btn')?.addEventListener('click', () => {
    closeCalendarModal();
    onCalendarModalClose();
  });
  document.getElementById('cal-prev-btn')?.addEventListener('click', async () => {
    calPrevMonth();
    await onCalendarMonthChanged();
  });
  document.getElementById('cal-next-btn')?.addEventListener('click', async () => {
    calNextMonth();
    await onCalendarMonthChanged();
  });
  document.getElementById('cal-today-btn')?.addEventListener('click', async () => {
    calGoToday();
    await onCalendarMonthChanged();
  });
  document.getElementById('cal-day-cancel-btn')?.addEventListener('click', closeDayPanel);
  document.getElementById('cal-day-save-btn')?.addEventListener('click', saveDayAttendance);
  document.getElementById('cal-day-delete-btn')?.addEventListener('click', () => {
    const { calendarSelectedDate } = state;
    if (calendarSelectedDate) deleteAttendance(calendarSelectedDate);
  });
  // タブ�E替
  document.getElementById('cal-tab-personal')?.addEventListener('click', async () => {
    switchCalTab('personal');
    await switchCalPersonalTab(state.calPersonalTab || 'calendar');
  });
  document.getElementById('cal-tab-shared')?.addEventListener('click',   () => switchCalTab('shared'));
  // 管琁E��E��定�Eタン�E��E有カレンダータブ�E  Eイベントデリゲーション�E�E
  document.getElementById('cal-modal')?.addEventListener('click', e => {
    if (e.target.closest('#btn-company-cal-settings')) openCompanyCalSettings();
  });
  // モーダル外クリチE��で閉じめE
  document.getElementById('cal-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      closeCalendarModal();
      onCalendarModalClose();
    }
  });
  // 会社カレンダー設定フォーム初期化！E回限り！E
  initCompanyCalSettingsForms();

  // ===== タスク =====
  document.getElementById('btn-task')?.addEventListener('click', openTaskModal);
  document.getElementById('task-modal-close')?.addEventListener('click', closeTaskModal);
  document.querySelectorAll('.task-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTaskTab(btn.dataset.tab));
  });
  document.getElementById('task-user-picker-cancel')?.addEventListener('click', () => {
    document.getElementById('task-user-picker-modal').classList.remove('visible');
  });
  document.getElementById('task-user-picker-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('task-user-picker-modal').classList.remove('visible');
  });

  // タスク編雁E��ーダル
  document.getElementById('task-edit-cancel-btn')?.addEventListener('click', closeTaskEditModal);
  document.getElementById('task-edit-save-btn')?.addEventListener('click', submitTaskEdit);
  document.getElementById('task-edit-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeTaskEditModal();
  });

  // タスク共有ピチE��ー
  document.getElementById('task-share-cancel-btn')?.addEventListener('click', closeTaskSharePicker);
  document.getElementById('task-share-confirm-btn')?.addEventListener('click', submitTaskShare);
  document.getElementById('task-share-picker-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeTaskSharePicker();
  });
  document.getElementById('task-share-search')?.addEventListener('input', e => {
    filterShareUserList(e.target.value);
  });

  // ===== ベル通知ボタン�E�お知らせ追加モーダルを開く！E=====
  document.getElementById('btn-notice-bell')?.addEventListener('click', () => {
    openNoticeModal(null);
  });

  // ===== プライベ�Eトセクションモーダル =====
  document.getElementById('private-section-cancel')?.addEventListener('click', closePrivateSectionModal);

  document.getElementById('private-section-icon')?.addEventListener('input', e => {
    const prev = document.getElementById('private-section-icon-preview');
    if (prev) prev.innerHTML = `<i class="${e.target.value.trim()}"></i>`;
  });

  document.getElementById('private-section-save')?.addEventListener('click', async () => {
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
      console.error('マイカチE��リ保存エラー:', err);
      showToast('?????????', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '??';
    }
  });

  document.getElementById('private-section-delete')?.addEventListener('click', async () => {
    if (!state.editingPrivateSectionId) return;
    const cat = state.privateCategories.find(c => c.docId === state.editingPrivateSectionId);
    if (await confirmDelete(`?${cat?.label}?????????????????????????`)) {
      const sectionCards = state.privateCards.filter(c => c.sectionId === state.editingPrivateSectionId);
      await Promise.all(sectionCards.map(c => deletePrivateCard(c.id)));
      await deletePrivateSection(state.editingPrivateSectionId);
      closePrivateSectionModal();
      renderAllSections();
    }
  });

  // コンチE��ストメニュー
  document.addEventListener('click', closeContextMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeContextMenu(); });

  // ===== PIN 入力フィールチE=====
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

  document.getElementById('pin-cancel')?.addEventListener('click', closePinModal);
  document.getElementById('pin-submit')?.addEventListener('click', handlePinSubmit);

  // ===== カード編雁E��ーダル =====
  document.getElementById('card-cancel')?.addEventListener('click', closeCardModal);
  document.getElementById('edit-icon')?.addEventListener('input', e => {
    const val = e.target.value.trim();
    updateIconPreview(val);
    document.querySelectorAll('#icon-picker .icon-picker-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.querySelector('i')?.className === val);
    });
  });

  document.getElementById('card-save')?.addEventListener('click', async () => {
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
      showToast('?????????', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '??';
    }
  });

  document.getElementById('card-delete')?.addEventListener('click', async () => {
    if (state.editingIsPrivate) {
      const card = state.privateCards.find(c => c.id === state.editingDocId);
      if (!card) return;
      if (await confirmDelete(`?${card.label}?????????`)) {
        await deletePrivateCard(state.editingDocId);
        closeCardModal();
      }
    } else {
      const card = state.allCards.find(c => c.id === state.editingDocId);
      if (!card) return;
      if (await confirmDelete(`?${card.label}?????????`)) {
        await deleteCard(state.editingDocId);
        closeCardModal();
      }
    }
  });

  // ===== お知らせモーダル =====
  document.getElementById('notice-cancel')?.addEventListener('click', closeNoticeModal);
  document.getElementById('notice-target-scope')?.addEventListener('change', handleNoticeTargetScopeChange);

  document.getElementById('notice-save')?.addEventListener('click', async () => {
    const title = document.getElementById('notice-title').value.trim();
    const body  = document.getElementById('notice-body').value.trim();
    const priority = document.getElementById('notice-priority').value;
    const requireAcknowledgement = document.getElementById('notice-require-ack').checked;
    const targetScope = document.getElementById('notice-target-scope').value;
    const targetDepartments = Array.from(document.querySelectorAll('.notice-target-checkbox:checked'))
      .map(input => input.value.trim())
      .filter(Boolean);
    if (!title) { document.getElementById('notice-title').focus(); return; }
    if (targetScope === 'departments' && targetDepartments.length === 0) {
      showToast('??????1??????????', 'warning');
      document.querySelector('.notice-target-checkbox')?.focus();
      return;
    }

    const btn = document.getElementById('notice-save');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      await moduleSaveNotice({
        title,
        body,
        priority,
        requireAcknowledgement,
        targetScope,
        targetDepartments,
        createdBy: state.currentUsername,
        updatedAt: serverTimestamp()
      });
      closeNoticeModal();
      refreshNoticeVisibility();
    } catch (err) {
      console.error('お知らせ保存エラー:', err);
      showToast('?????????', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '??';
    }
  });

  document.getElementById('notice-delete')?.addEventListener('click', async () => {
    if (!state.editingNoticeId) return;
    const n = state.allNotices.find(x => x.id === state.editingNoticeId);
    if (await confirmDelete(`?${n?.title}?????????`)) {
      await moduleDeleteNotice(state.editingNoticeId);
      closeNoticeModal();
      refreshNoticeVisibility();
    }
  });

  // ===== カチE��リモーダル =====
  document.getElementById('cat-cancel')?.addEventListener('click', closeCategoryModal);

  document.getElementById('cat-icon')?.addEventListener('input', e => {
    updateCatIconPreview(e.target.value.trim());
  });

  document.getElementById('cat-save')?.addEventListener('click', async () => {
    const label = document.getElementById('cat-label').value.trim();
    const icon  = document.getElementById('cat-icon').value.trim() || 'fa-solid fa-star';
    if (!label) { document.getElementById('cat-label').focus(); return; }

    const btn = document.getElementById('cat-save');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      if (state.editingCategoryId) {
        await updateCategoryToSupabase(state.editingCategoryId, { label, icon, colorIndex: state.selectedColorIndex });
      } else {
        const maxOrder = state.allCategories.length > 0 ? Math.max(...state.allCategories.map(c => c.order)) + 1 : 10;
        const newId = label.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') + '-' + Date.now();
        await addCategoryToSupabase({ id: newId, label, icon, colorIndex: state.selectedColorIndex, order: maxOrder, isExternal: false });
      }
      closeCategoryModal();
      renderAllSections();
    } catch (err) {
      console.error('カチE��リ保存エラー:', err);
      showToast('?????????', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '??';
    }
  });

  document.getElementById('cat-delete')?.addEventListener('click', async () => {
    if (!state.editingCategoryId) return;
    const cat = state.allCategories.find(c => c.docId === state.editingCategoryId);
    const hasCards = state.allCards.some(c => c.category === cat?.id);
    if (hasCards) {
      showToast('????????????????????????????????????', 'warning');
      return;
    }
    if (await confirmDelete(`?${cat?.label}?????????????????????????`)) {
      await deleteCategoryFromSupabase(state.editingCategoryId);
      closeCategoryModal();
      renderAllSections();
    }
  });

  // ===== 設定パネル =====
  document.getElementById('settings-fab')?.addEventListener('click', () => {
    const panel = document.getElementById('settings-panel');
    if (panel.hasAttribute('hidden')) {
      openSettingsPanel();
    } else {
      closeSettingsPanel();
    }
  });

  document.getElementById('settings-panel-close')?.addEventListener('click', closeSettingsPanel);

  // チE�Eマ選抁E
  document.querySelectorAll('#theme-grid .theme-card').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
    });
  });

  // 斁E��サイズ選抁E
  document.querySelectorAll('#fontsize-grid .fontsize-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyFontSize(btn.dataset.size);
    });
  });

  // パネル外クリチE��で閉じめE
  document.addEventListener('click', e => {
    const panel = document.getElementById('settings-panel');
    const fab   = document.getElementById('settings-fab');
    if (!panel.hasAttribute('hidden') && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
      closeSettingsPanel();
    }
  });

  // ===== モーダル開閉時に body スクロールをロチE�� =====
  const _modalScrollObserver = new MutationObserver(() => {
    const anyVisible = document.querySelector('.modal-overlay.visible') !== null;
    document.body.style.overflow = anyVisible ? 'hidden' : '';
  });
  document.querySelectorAll('.modal-overlay').forEach(el => {
    _modalScrollObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
  });

  // ===== ファイル転送中のペ�Eジ離脱警呁E=====
  window.addEventListener('beforeunload', e => {
    const pendingOut = state._ftOutgoing.filter(s => s.status === 'pending' || s.status === 'accepted');
    const pendingIn  = state._ftIncoming.filter(s => s.status === 'pending');
    if (pendingOut.length > 0 || pendingIn.length > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
});
