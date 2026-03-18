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

export const USER_ROLE_OPTIONS = Object.freeze([
  { value: 'member',  label: '一般' },
  { value: 'leader',  label: 'リーダー' },
  { value: 'manager', label: '管理者' },
]);

export const USER_ROLE_LABELS = Object.freeze(
  USER_ROLE_OPTIONS.reduce((acc, option) => {
    acc[option.value] = option.label;
    return acc;
  }, {})
);

export const state = {
  // カード・カテゴリ
  allCards: [],
  allCategories: [...DEFAULT_CATEGORIES],
  sharedCardsLoaded: false,
  sharedCardsLoading: false,
  sharedLinksModalOpen: false,
  sharedLinksQuery: '',
  sharedLinksCategory: 'all',
  allNotices: [],
  visibleNotices: [],
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
  inviteCodeHash: null,
  inviteCodePlain: '',
  inviteCodeRequired: false,
  inviteCodeVerified: sessionStorage.getItem('portal-invite-ok') === '1',
  adminInviteConfigured: false,
  pendingLoginUsername: '',
  pendingLoginHash: null,
  pendingLoginFromStored: false,
  lockRecommendationPending: false,
  lockRecommendationMessage: '',
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
  noticeReactionsLoaded: false,
  noticeReactionsLoading: false,
  _noticeReactionObserver: null,

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
  taskHistoryCache: {
    received: [],
    sent: [],
    shared: [],
  },
  taskHistoryLoaded: {
    received: false,
    sent: false,
    shared: false,
  },
  taskHistoryLoading: {
    received: false,
    sent: false,
    shared: false,
  },
  _receivedTasksUnsub: null,
  _sentTasksUnsub: null,
  _sentTaskDoneNotifyUnsub: null,
  _sharedTasksUnsub: null,     // sharedWith クエリのリスナー
  taskModalOpen: false,
  activeTaskTab: 'received',
  taskProjectKeyFilter: '',
  orderHistoryProjectKeyFilter: '',
  propertySummaryModalOpen: false,
  propertySummaryQuery: '',
  propertySummaryResults: null,
  propertySummaryLoading: false,
  propertySummaryError: '',
  propertySummarySiteCandidates: [],
  propertySummaryResolvedSite: null,
  readDiagModalOpen: false,
  readDiagnostics: {
    sessionStartedAt: Date.now(),
    estimatedTransferBytes: 0,
    estimatedItems: 0,
    listenerStarts: 0,
    listenerSnapshots: 0,
    getDocsCalls: 0,
    activeListenerCount: 0,
    sources: {},
    events: [],
  },
  newTaskAssignee: '',
  _editingTaskId: null,        // 編集中 or 共有操作中のタスクID

  // 部門間依頼・目安箱
  DEFAULT_DEPARTMENTS,
  currentDepartments: [...DEFAULT_DEPARTMENTS],
  reqModalOpen: false,
  activeReqTab: 'request',
  activeReqSubTab: 'received',
  reqProjectKeyFilter: '',
  receivedRequests: [],
  sentRequests: [],
  reqHistoryCache: {
    received: [],
    sent: [],
  },
  reqHistoryLoaded: {
    received: false,
    sent: false,
  },
  reqHistoryLoading: {
    received: false,
    sent: false,
  },
  suggestionList: [],
  _reqReceivedUnsub: null,
  _reqSentUnsub: null,
  _suggUnsub: null,
  isSuggestionBoxViewer: false,
  suggestionBoxViewers: [],
  _pendingStatusChange: null,
  _pendingReqTaskify: null,
  reqTaskifyAssignee: '',
  _pendingSuggReply: null,
  lastViewedSuggestionsAt: 0,

  // メール返信AI
  DEFAULT_EMAIL_PROFILES: null,  // emailモジュールで初期化
  emailProfiles: [],
  selectedEmailProfileId: null,
  geminiApiKey: '',
  userEmailProfile: {
    name: '',
    realName: '',
    department: '',
    roleType: 'member',
    email: '',
    phone: '',
    signatureTemplate: '',
  },
  DEFAULT_SIGNATURE_TEMPLATE: '',

  // カレンダー・勤怠管理
  calendarYear:    new Date().getFullYear(),
  calendarMonth:   new Date().getMonth(),   // 0-indexed
  attendanceData:  {},   // { 'YYYY-MM-DD': { type, hayade, zangyo, note, workSiteHours, projectKeys } }
  todayAttendance: null,
  todayAttendanceDate: '',
  _attendanceSub:  null,
  _todayAttendanceSub: null,
  calendarSelectedDate: null,
  calendarAutoProjectKeys: [],

  // 会社カレンダー（company-calendar.js）
  companyCalConfig: null,          // company_calendar/config のデータ
  _companyCalUnsub: null,          // onSnapshot unsubscriber
  publicAttendance: {},            // { 'YYYY-MM': { '03': { alice:'有給', ... }, ... } }
  _publicAttSub: null,             // onSnapshot unsubscriber for public_attendance

  // カレンダーUIタブ
  calTab: 'personal',              // 'personal' | 'shared'
  calPersonalTab: 'calendar',      // 'calendar' | 'work' | 'summary' | 'sites'

  // 集計用
  prevMonthAttendance: {},         // { 'YYYY-MM-DD': {...} } 前月データ（締め計算用）
  fiscalYearPaidLeave: 0,          // 年度累計有給消化日数（カレンダーモーダルを開いたとき更新）

  // 勤務内容表
  attendanceSites: [],             // [{ id, code, name, active, sortOrder, ... }]
  _attendanceSitesSub: null,       // onSnapshot unsubscriber for attendance_sites
  attendanceWorkProjectKeyFilter: '',
  workPeriodAttendance: {},        // { 'YYYY-MM-DD': attendanceDocData }
  workSummaryPeriodLabel: '',      // 集計対象期間ラベル
  workSummaryPeriodKey: '',        // 集計済みキャッシュの期間キー
  workSummaryLoaded: false,        // 現期間で集計実行済みか
  workSummaryNeedsRefresh: true,   // 再集計が必要か
  workSummaryLoading: false,       // 集計処理中か
  workSummaryRows: [],             // 集計表表示用キャッシュ
  workSummaryNeedsRefresh: true,   // 再集計が必要か
  workSummaryLoading: false,       // 集計処理中か
  workSummaryRows: [],             // 集計表表示用キャッシュ
  workSummaryUsers: [],            // 集計表ユーザー列
  workSummaryPeriodLabel: '',      // 集計対象期間ラベル

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
