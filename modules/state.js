// ========== 共有アプリケーション状態 ==========
// 全モジュールが import { state } from './state.js' で参照する
// 値の読み書きは state.xxx で行う

import { DEFAULT_CATEGORIES } from './config.js';

const DEFAULT_DEPARTMENTS = ['営業', '設計', '生産管理（バラ図）', '工場', '工事課'];

export const REQ_STATUS_LABEL = {
  submitted: { text: '提出済み', cls: 'status-submitted' },
  reviewing: { text: '検討中',   cls: 'status-reviewing' },
  accepted:  { text: '対応する', cls: 'status-accepted' },
  rejected:  { text: '見送り',   cls: 'status-rejected' },
};

export const CHAT_MSG_MAX = 200;

export const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};
export const FILE_CHUNK_SIZE = 16384; // 16 KB

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const TASK_STATUS_LABEL = {
  pending:  { text: '承諾待ち', cls: 'task-status-pending'  },
  accepted: { text: '進行中',   cls: 'task-status-accepted' },
  done:     { text: '完了',     cls: 'task-status-done'     },
};

export const state = {
  // カード・カテゴリ
  allCards: [],
  allCategories: [...DEFAULT_CATEGORIES],
  allNotices: [],
  _noticeUnsub: null,
  isEditMode: true,
  editingDocId: null,
  editingCategory: null,
  editingNoticeId: null,
  editingCategoryId: null,
  selectedColorIndex: 1,
  failedAttempts: 0,
  lockoutUntil: 0,
  unsubscribeCards: null,

  // ドラッグ&ドロップ
  dragSrcId: null,
  dragSrcSectionId: null,

  // お気に入り
  favoritesOnlyMode: false,
  personalFavorites: [],

  // セクション折り畳み・カード非表示
  collapsedSections: [],   // 折り畳まれたセクションID配列
  hiddenCards: [],         // 非表示にしたカードID配列
  _collapseSeeded: false,  // 初回デフォルト全折りたたみ適用済みフラグ

  // ミッションバナー
  missionText: '',         // portal/config.missionText
  missionBannerHidden: true,  // ユーザー個人の折り畳み状態（デフォルト：折りたたみ）

  // ニックネーム・個人データ
  currentUsername: localStorage.getItem('portal-username') || null,
  personalSectionOrder: [],
  privateCategories: [],
  privateCards: [],
  editingIsPrivate: false,
  editingPrivateSectionDocId: null,
  editingPrivateSectionId: null,
  privateSectionColorIndex: 1,

  // カード階層
  activeChildPopup: null,
  editingParentId: null,

  // 個人TODO
  personalTodos: [],
  todoCollapsed: false,
  _todoUnsubscribe: null,

  // お知らせ未読管理
  readNoticeIds: new Set(),
  _noticeObserver: null,

  // お知らせリアクション
  noticeReactions: {},

  // チャット（DM + グループ）
  chatPanelOpen: false,
  dmRooms: [],
  groupRooms: [],
  currentRoomId: null,
  currentRoomType: null,
  currentRoomMessages: [],
  _dmRoomsUnsubscribe: null,
  _groupRoomsUnsubscribe: null,
  _roomMsgUnsubscribe: null,
  chatReadTimes: {},
  _knownUsernames: null,
  _usersListUnsub: null,

  // P2P ファイル転送
  _p2pConnections: {},
  _receivedFiles: {},
  _sendProgress: {},
  _receiveProgress: {},
  _ftPanelOpen: false,
  _ftIncomingSub: null,
  _ftIncoming: [],
  _ftOutgoing: [],
  _ftSelectedUser: null,
  _ftSelectedFile: null,

  // Drive シェア
  _myDriveUrl: '',
  _driveIncoming: [],
  _driveOutgoing: [],
  _driveIncomingSub: null,
  _driveOutgoingSub: null,
  _ftCurrentTab: 'p2p',
  _ftDriveSelectedUser: null,
  _driveContacts: {},

  // タスク割り振り
  receivedTasks: [],
  sentTasks: [],
  sharedTasks: [],             // 自分が sharedWith に含まれるタスク
  _receivedTasksUnsub: null,
  _sentTasksUnsub: null,
  _sharedTasksUnsub: null,     // sharedWith クエリのリスナー
  taskModalOpen: false,
  activeTaskTab: 'received',
  newTaskAssignee: '',
  _editingTaskId: null,        // 編集中 or 共有操作中のタスクID

  // 部門間依頼・目安箱
  DEFAULT_DEPARTMENTS,
  currentDepartments: [...DEFAULT_DEPARTMENTS],
  reqModalOpen: false,
  activeReqTab: 'request',
  activeReqSubTab: 'received',
  receivedRequests: [],
  sentRequests: [],
  suggestionList: [],
  _reqReceivedUnsub: null,
  _reqSentUnsub: null,
  _suggUnsub: null,
  isSuggestionBoxViewer: false,
  suggestionBoxViewers: [],
  _pendingStatusChange: null,
  _pendingSuggReply: null,
  lastViewedSuggestionsAt: 0,

  // メール返信AI
  DEFAULT_EMAIL_PROFILES: null,  // emailモジュールで初期化
  emailProfiles: [],
  selectedEmailProfileId: null,
  geminiApiKey: '',
  userEmailProfile: { name: '', department: '', position: '' },
  DEFAULT_SIGNATURE_TEMPLATE: '',

  // カレンダー・勤怠管理
  calendarYear:    new Date().getFullYear(),
  calendarMonth:   new Date().getMonth(),   // 0-indexed
  attendanceData:  {},   // { 'YYYY-MM-DD': { type, hayade, zangyo, note } }
  _attendanceSub:  null,
  calendarSelectedDate: null,

  // 会社カレンダー（company-calendar.js）
  companyCalConfig: null,          // company_calendar/config のデータ
  _companyCalUnsub: null,          // onSnapshot unsubscriber
  publicAttendance: {},            // { 'YYYY-MM': { '03': { alice:'有給', ... }, ... } }
  _publicAttSub: null,             // onSnapshot unsubscriber for public_attendance

  // カレンダーUIタブ
  calTab: 'personal',              // 'personal' | 'shared'

  // 集計用
  prevMonthAttendance: {},         // { 'YYYY-MM-DD': {...} } 前月データ（締め計算用）
  fiscalYearPaidLeave: 0,          // 年度累計有給消化日数（カレンダーモーダルを開いたとき更新）

  // 管理者認証
  isAdmin: false,   // 管理者PIN認証済みフラグ

  // PIN ロック
  lockPinHash: null,
  lockPinEnabled: false,
  lockEnabled: false,
  autoLockMinutes: 0,
  lockCurrentInput: '',
  lastActivityAt: Date.now(),
  _autoLockInterval: null,
};
