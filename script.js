// ========== Firebase Imports ==========
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, doc,
  getDocs, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  query, orderBy, limit, writeBatch, serverTimestamp, onSnapshot,
  arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ========== Firebase 設定 ==========
const firebaseConfig = {
  apiKey: "AIzaSyBDrBUN2elbCAdxfbnTFWQNWF4xhz9yaJ0",
  authDomain: "kategu-sys-v15.firebaseapp.com",
  projectId: "kategu-sys-v15",
  storageBucket: "kategu-sys-v15.firebasestorage.app",
  messagingSenderId: "992448511434",
  appId: "1:992448511434:web:ef53560b55264f1e656333"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ========== 天気設定 ==========
const WEATHER_API_KEY = '4131c5bca956c19b2b60b014b4045c12';
const WEATHER_LAT = 36.3219;
const WEATHER_LON = 139.0033;

// ========== アイコン: Google ファビコン API で公式ブランドアイコンを取得 ==========
const _fav = d =>
  `<img src="https://www.google.com/s2/favicons?domain=${d}&sz=128" loading="lazy" alt="${d}">`;

const SVG_ICONS = {
  'svg:notion':     _fav('notion.so'),
  'svg:slack':      _fav('slack.com'),
  'svg:gdrive':     _fav('drive.google.com'),
  'svg:box':        _fav('box.com'),
  'svg:teams':      _fav('teams.microsoft.com'),
  'svg:onedrive':   _fav('onedrive.live.com'),
  'svg:sharepoint': _fav('sharepoint.com'),
  'svg:dropbox':    _fav('dropbox.com'),
  'svg:gmail':      _fav('mail.google.com'),
  'svg:zoom':       _fav('zoom.us'),
  'svg:github':     _fav('github.com'),
  'svg:kintone':    _fav('kintone.com'),
  'svg:trello':     _fav('trello.com'),
};

// ========== 外部ツール プリセットサービス ==========
const PRESET_SERVICES = [
  { label: 'Notion',       icon: 'svg:notion',     url: 'https://www.notion.so/' },
  { label: 'Slack',        icon: 'svg:slack',      url: 'https://slack.com/' },
  { label: 'Google Drive', icon: 'svg:gdrive',     url: 'https://drive.google.com/' },
  { label: 'Box',          icon: 'svg:box',        url: 'https://www.box.com/' },
  { label: 'Teams',        icon: 'svg:teams',      url: 'https://teams.microsoft.com/' },
  { label: 'OneDrive',     icon: 'svg:onedrive',   url: 'https://onedrive.live.com/' },
  { label: 'SharePoint',   icon: 'svg:sharepoint', url: 'https://www.sharepoint.com/' },
  { label: 'Dropbox',      icon: 'svg:dropbox',    url: 'https://www.dropbox.com/' },
  { label: 'Gmail',        icon: 'svg:gmail',      url: 'https://mail.google.com/' },
  { label: 'Zoom',         icon: 'svg:zoom',       url: 'https://zoom.us/' },
  { label: 'GitHub',       icon: 'svg:github',     url: 'https://github.com/' },
  { label: 'kintone',      icon: 'svg:kintone',    url: 'https://kintone.cybozu.co.jp/' },
  { label: 'Trello',       icon: 'svg:trello',     url: 'https://trello.com/' },
  { label: '太陽光発電',   icon: 'fa-solid fa-solar-panel', url: 'solar:open' },
];

// ========== カテゴリカラープリセット ==========
const CATEGORY_COLORS = [
  { index: 1, label: 'ブルー',   gradient: 'linear-gradient(135deg, #4a9eff, #3a7cd9)' },
  { index: 2, label: 'シアン',   gradient: 'linear-gradient(135deg, #00d4aa, #00a888)' },
  { index: 3, label: 'パープル', gradient: 'linear-gradient(135deg, #7c5cff, #5a3fd9)' },
  { index: 4, label: 'オレンジ', gradient: 'linear-gradient(135deg, #ff8c42, #e67530)' },
  { index: 5, label: 'ピンク',   gradient: 'linear-gradient(135deg, #ff5ea0, #d94080)' },
  { index: 6, label: 'レッド',   gradient: 'linear-gradient(135deg, #ff4444, #cc2222)' },
  { index: 7, label: 'グリーン', gradient: 'linear-gradient(135deg, #44cc44, #228822)' },
  { index: 8, label: 'ゴールド', gradient: 'linear-gradient(135deg, #ffcc00, #dd9900)' },
];

// ========== アイコンピッカー用アイコン一覧 ==========
const ICON_PICKER_LIST = [
  { icon: 'fa-solid fa-folder-open',          label: 'フォルダ(開)' },
  { icon: 'fa-solid fa-folder',               label: 'フォルダ' },
  { icon: 'fa-solid fa-file-lines',           label: 'ファイル' },
  { icon: 'fa-solid fa-file-circle-plus',     label: 'ファイル追加' },
  { icon: 'fa-solid fa-file-circle-check',    label: 'ファイル確認' },
  { icon: 'fa-solid fa-file-invoice',         label: '請求書' },
  { icon: 'fa-solid fa-file-contract',        label: '契約書' },
  { icon: 'fa-solid fa-box-archive',          label: 'アーカイブ' },
  { icon: 'fa-solid fa-clipboard',            label: 'クリップボード' },
  { icon: 'fa-solid fa-clipboard-check',      label: 'チェック' },
  { icon: 'fa-solid fa-clipboard-list',       label: 'リスト' },
  { icon: 'fa-solid fa-book',                 label: 'ブック' },
  { icon: 'fa-solid fa-book-open',            label: '開いた本' },
  { icon: 'fa-solid fa-bookmark',             label: 'ブックマーク' },
  { icon: 'fa-solid fa-paperclip',            label: 'クリップ' },
  { icon: 'fa-solid fa-print',                label: '印刷' },
  { icon: 'fa-solid fa-calendar-days',        label: 'カレンダー' },
  { icon: 'fa-solid fa-calendar-check',       label: '確認' },
  { icon: 'fa-solid fa-calendar-plus',        label: '追加' },
  { icon: 'fa-solid fa-calendar-xmark',       label: '削除' },
  { icon: 'fa-solid fa-clock',                label: '時計' },
  { icon: 'fa-solid fa-stopwatch',            label: 'ストップウォッチ' },
  { icon: 'fa-solid fa-hourglass-half',       label: '砂時計' },
  { icon: 'fa-solid fa-business-time',        label: '業務時間' },
  { icon: 'fa-solid fa-bars-progress',        label: '進捗' },
  { icon: 'fa-solid fa-chart-bar',            label: '棒グラフ' },
  { icon: 'fa-solid fa-chart-line',           label: '折れ線' },
  { icon: 'fa-solid fa-chart-pie',            label: '円グラフ' },
  { icon: 'fa-solid fa-chart-column',         label: '縦棒グラフ' },
  { icon: 'fa-solid fa-list-check',           label: 'チェックリスト' },
  { icon: 'fa-solid fa-table',                label: '表' },
  { icon: 'fa-solid fa-table-list',           label: 'テーブル' },
  { icon: 'fa-solid fa-database',             label: 'DB' },
  { icon: 'fa-solid fa-magnifying-glass-chart', label: '分析' },
  { icon: 'fa-solid fa-industry',             label: '工場' },
  { icon: 'fa-solid fa-gears',                label: 'ギア複数' },
  { icon: 'fa-solid fa-gear',                 label: 'ギア' },
  { icon: 'fa-solid fa-screwdriver-wrench',   label: '工具' },
  { icon: 'fa-solid fa-hammer',               label: 'ハンマー' },
  { icon: 'fa-solid fa-wrench',               label: 'レンチ' },
  { icon: 'fa-solid fa-screwdriver',          label: 'ドライバー' },
  { icon: 'fa-solid fa-toolbox',              label: 'ツールボックス' },
  { icon: 'fa-solid fa-warehouse',            label: '倉庫' },
  { icon: 'fa-solid fa-cubes',                label: '在庫(複数)' },
  { icon: 'fa-solid fa-cube',                 label: 'キューブ' },
  { icon: 'fa-solid fa-drafting-compass',     label: 'コンパス' },
  { icon: 'fa-solid fa-ruler-combined',       label: '定規' },
  { icon: 'fa-solid fa-ruler',                label: 'ルーラー' },
  { icon: 'fa-solid fa-calculator',           label: '計算機' },
  { icon: 'fa-solid fa-microscope',           label: '顕微鏡' },
  { icon: 'fa-solid fa-flask',                label: 'フラスコ' },
  { icon: 'fa-solid fa-hard-hat',             label: 'ヘルメット' },
  { icon: 'fa-solid fa-cart-shopping',        label: 'カート' },
  { icon: 'fa-solid fa-truck',                label: 'トラック' },
  { icon: 'fa-solid fa-truck-fast',           label: '急配' },
  { icon: 'fa-solid fa-box',                  label: '箱' },
  { icon: 'fa-solid fa-boxes-stacked',        label: '積み箱' },
  { icon: 'fa-solid fa-pallet',               label: 'パレット' },
  { icon: 'fa-solid fa-dolly',                label: 'ドーリー' },
  { icon: 'fa-solid fa-handshake',            label: '取引' },
  { icon: 'fa-solid fa-receipt',              label: 'レシート' },
  { icon: 'fa-solid fa-tags',                 label: 'タグ複数' },
  { icon: 'fa-solid fa-tag',                  label: 'タグ' },
  { icon: 'fa-solid fa-barcode',              label: 'バーコード' },
  { icon: 'fa-solid fa-qrcode',               label: 'QRコード' },
  { icon: 'fa-solid fa-door-open',            label: 'ドア(開)' },
  { icon: 'fa-solid fa-door-closed',          label: 'ドア(閉)' },
  { icon: 'fa-solid fa-building',             label: 'ビル' },
  { icon: 'fa-solid fa-house',                label: '家' },
  { icon: 'fa-solid fa-stairs',               label: '階段' },
  { icon: 'fa-solid fa-users',                label: 'ユーザー複数' },
  { icon: 'fa-solid fa-user',                 label: 'ユーザー' },
  { icon: 'fa-solid fa-user-tie',             label: 'スタッフ' },
  { icon: 'fa-solid fa-user-gear',            label: '管理者' },
  { icon: 'fa-solid fa-address-book',         label: 'アドレス帳' },
  { icon: 'fa-solid fa-comment-dots',         label: 'コメント' },
  { icon: 'fa-solid fa-comments',             label: '会話' },
  { icon: 'fa-solid fa-envelope',             label: 'メール' },
  { icon: 'fa-solid fa-phone',                label: '電話' },
  { icon: 'fa-solid fa-headset',              label: 'ヘッドセット' },
  { icon: 'fa-solid fa-bell',                 label: '通知' },
  { icon: 'fa-solid fa-bullhorn',             label: 'アナウンス' },
  { icon: 'fa-solid fa-triangle-exclamation', label: '警告' },
  { icon: 'fa-solid fa-circle-check',         label: 'OK' },
  { icon: 'fa-solid fa-circle-xmark',         label: 'NG' },
  { icon: 'fa-solid fa-circle-info',          label: 'インフォ' },
  { icon: 'fa-solid fa-flag',                 label: 'フラグ' },
  { icon: 'fa-solid fa-shield-halved',        label: 'シールド' },
  { icon: 'fa-solid fa-thumbs-up',            label: 'いいね' },
  { icon: 'fa-solid fa-check',                label: 'チェック' },
  { icon: 'fa-solid fa-bolt',                 label: '電気' },
  { icon: 'fa-solid fa-fill-drip',            label: '充填' },
  { icon: 'fa-solid fa-bars',                 label: '鋼材' },
  { icon: 'fa-solid fa-fire',                 label: '炎' },
  { icon: 'fa-solid fa-water',                label: '水' },
  { icon: 'fa-solid fa-wind',                 label: '風' },
  { icon: 'fa-solid fa-plug',                 label: 'プラグ' },
  { icon: 'fa-solid fa-battery-full',         label: 'バッテリー' },
  { icon: 'fa-solid fa-solar-panel',          label: '太陽光' },
  { icon: 'fa-solid fa-download',             label: 'ダウンロード' },
  { icon: 'fa-solid fa-upload',               label: 'アップロード' },
  { icon: 'fa-solid fa-share-nodes',          label: '共有' },
  { icon: 'fa-solid fa-link',                 label: 'リンク' },
  { icon: 'fa-solid fa-arrow-up-right-from-square', label: '外部リンク' },
  { icon: 'fa-solid fa-desktop',              label: 'PC' },
  { icon: 'fa-solid fa-laptop',               label: 'ノートPC' },
  { icon: 'fa-solid fa-mobile',               label: 'スマホ' },
  { icon: 'fa-solid fa-server',               label: 'サーバー' },
  { icon: 'fa-solid fa-wifi',                 label: 'Wi-Fi' },
  { icon: 'fa-solid fa-network-wired',        label: 'ネットワーク' },
  { icon: 'fa-solid fa-sitemap',              label: '組織図' },
  { icon: 'fa-solid fa-cloud',                label: 'クラウド' },
  { icon: 'fa-solid fa-star',                 label: 'スター' },
  { icon: 'fa-solid fa-heart',                label: 'ハート' },
  { icon: 'fa-solid fa-key',                  label: 'キー' },
  { icon: 'fa-solid fa-lock',                 label: '鍵' },
  { icon: 'fa-solid fa-sliders',              label: '設定' },
  { icon: 'fa-solid fa-square-poll-vertical', label: 'アンケート' },
  { icon: 'fa-solid fa-newspaper',            label: 'ニュース' },
  { icon: 'fa-solid fa-map',                  label: 'マップ' },
  { icon: 'fa-solid fa-location-dot',         label: '場所' },
  { icon: 'fa-solid fa-ellipsis',             label: 'その他' },
];

// ========== デフォルトカテゴリ定義 ==========
const DEFAULT_CATEGORIES = [
  { id: 'external',    label: '外部ツール', icon: 'fa-solid fa-arrow-up-right-from-square', colorIndex: 0, order: 0, isExternal: true },
  { id: 'management',  label: '管理・報告', icon: 'fa-solid fa-clipboard-check',            colorIndex: 1, order: 1 },
  { id: 'arrangement', label: '手配・製作', icon: 'fa-solid fa-gears',                      colorIndex: 2, order: 2 },
  { id: 'hardware',    label: '金物・在庫', icon: 'fa-solid fa-cubes',                      colorIndex: 3, order: 3 },
  { id: 'materials',   label: '資材・設計', icon: 'fa-solid fa-drafting-compass',           colorIndex: 4, order: 4 },
  { id: 'others',      label: 'その他',     icon: 'fa-solid fa-ellipsis',                   colorIndex: 5, order: 5 },
];

// ========== 初期データ（Firestore 読み込み前の表示用） ==========
const INITIAL_CARDS = [
  { label: 'Notion',          icon: 'svg:notion', url: 'https://www.notion.so/',    category: 'external',    categoryOrder: 0, order: 0, isExternalTool: true },
  { label: 'Slack',           icon: 'svg:slack',  url: 'https://slack.com/',        category: 'external',    categoryOrder: 0, order: 1, isExternalTool: true },
  { label: 'Google Drive',    icon: 'svg:gdrive', url: 'https://drive.google.com/', category: 'external',    categoryOrder: 0, order: 2, isExternalTool: true },
  { label: '太陽光発電',       icon: 'fa-solid fa-solar-panel', url: 'solar:open',   category: 'external',    categoryOrder: 0, order: 3, isExternalTool: true },
  { label: '工程管理',         icon: 'fa-solid fa-bars-progress',        url: '#', category: 'management',  categoryOrder: 1, order: 0, isExternalTool: false },
  { label: '図面保管庫',        icon: 'fa-solid fa-folder-open',          url: '#', category: 'management',  categoryOrder: 1, order: 1, isExternalTool: false },
  { label: 'アドレス帳',        icon: 'fa-solid fa-address-book',         url: '#', category: 'management',  categoryOrder: 1, order: 2, isExternalTool: false },
  { label: 'トラブル報告',      icon: 'fa-solid fa-triangle-exclamation', url: '#', category: 'management',  categoryOrder: 1, order: 3, isExternalTool: false },
  { label: 'トラブル回答',      icon: 'fa-solid fa-comment-dots',         url: '#', category: 'management',  categoryOrder: 1, order: 4, isExternalTool: false },
  { label: '手配書作成',        icon: 'fa-solid fa-file-circle-plus',     url: '#', category: 'arrangement', categoryOrder: 2, order: 0, isExternalTool: false },
  { label: '手配書リスト',      icon: 'fa-solid fa-list-check',           url: '#', category: 'arrangement', categoryOrder: 2, order: 1, isExternalTool: false },
  { label: '工場予定表',        icon: 'fa-solid fa-calendar-days',        url: '#', category: 'arrangement', categoryOrder: 2, order: 2, isExternalTool: false },
  { label: '外注製作',          icon: 'fa-solid fa-handshake',            url: '#', category: 'arrangement', categoryOrder: 2, order: 3, isExternalTool: false },
  { label: '建具管理',          icon: 'fa-solid fa-door-open',            url: '#', category: 'arrangement', categoryOrder: 2, order: 4, isExternalTool: false },
  { label: '標準金物',          icon: 'fa-solid fa-screwdriver-wrench',   url: '#', category: 'hardware',    categoryOrder: 3, order: 0, isExternalTool: false },
  { label: '金物資料',          icon: 'fa-solid fa-file-lines',           url: '#', category: 'hardware',    categoryOrder: 3, order: 1, isExternalTool: false },
  { label: '工場在庫',          icon: 'fa-solid fa-warehouse',            url: '#', category: 'hardware',    categoryOrder: 3, order: 2, isExternalTool: false },
  { label: '電気代',            icon: 'fa-solid fa-bolt',                 url: '#', category: 'hardware',    categoryOrder: 3, order: 3, isExternalTool: false },
  { label: '充填材',            icon: 'fa-solid fa-fill-drip',            url: '#', category: 'materials',   categoryOrder: 4, order: 0, isExternalTool: false },
  { label: '鋼材',              icon: 'fa-solid fa-bars',                 url: '#', category: 'materials',   categoryOrder: 4, order: 1, isExternalTool: false },
  { label: '鋼材注文',          icon: 'fa-solid fa-cart-shopping',        url: '#', category: 'materials',   categoryOrder: 4, order: 2, isExternalTool: false },
  { label: '図面保管庫',        icon: 'fa-solid fa-box-archive',          url: '#', category: 'materials',   categoryOrder: 4, order: 3, isExternalTool: false },
  { label: '金型シミュレーター', icon: 'fa-solid fa-calculator',          url: '#', category: 'materials',   categoryOrder: 4, order: 4, isExternalTool: false },
  { label: 'マニュアル',        icon: 'fa-solid fa-book',                 url: '#', category: 'others',      categoryOrder: 5, order: 0, isExternalTool: false },
  { label: '資料ダウンロード',   icon: 'fa-solid fa-download',            url: '#', category: 'others',      categoryOrder: 5, order: 1, isExternalTool: false },
  { label: '基準図',            icon: 'fa-solid fa-ruler-combined',       url: '#', category: 'others',      categoryOrder: 5, order: 2, isExternalTool: false },
  { label: 'アンケート(回答)',   icon: 'fa-solid fa-square-poll-vertical', url: '#', category: 'others',     categoryOrder: 5, order: 3, isExternalTool: false },
  { label: '運行作業日報',       icon: 'fa-solid fa-truck',               url: '#', category: 'others',      categoryOrder: 5, order: 4, isExternalTool: false },
];

// ========== アプリ状態 ==========
let allCards = [];
let allCategories = [...DEFAULT_CATEGORIES];
let allNotices = [];
let isEditMode = true;
let editingDocId = null;
let editingCategory = null;
let editingNoticeId = null;
let editingCategoryId = null;
let selectedColorIndex = 1;
let failedAttempts = 0;
let lockoutUntil = 0;
let unsubscribeCards = null;

// ドラッグ&ドロップ状態
let dragSrcId = null;
let dragSrcSectionId = null;

// お気に入りのみ表示モード（Firestoreから読み込む。初回はfalse）
let favoritesOnlyMode = false;

// お気に入りリスト（Firestoreから読み込むメモリキャッシュ）
let personalFavorites = [];

// ニックネーム・個人データ
let currentUsername = localStorage.getItem('portal-username') || null;
let personalSectionOrder = [];
let privateCategories = [];
let privateCards = [];
let editingIsPrivate = false;
let editingPrivateSectionDocId = null;
let editingPrivateSectionId = null; // for private section modal
let privateSectionColorIndex = 1;

// カード階層
let activeChildPopup = null;
let editingParentId = null;

// 個人TODO
let personalTodos = [];
let todoCollapsed = false;
let _todoUnsubscribe = null; // onSnapshot の解除用

// お知らせ未読管理
let readNoticeIds = new Set();
let _noticeObserver = null; // IntersectionObserver

// お知らせリアクション { [noticeId]: { '👍': ['user1', 'user2'], ... } }
let noticeReactions = {};

// 全社チャット
let chatMessages = [];
let _chatUnsubscribe = null;
let chatLastReadAt = null;
let chatPanelOpen = false;

// ========== PIN 認証 ==========
const PIN_SALT = 'seisan-portal-v1';

async function hashPIN(pin) {
  const data = new TextEncoder().encode(pin + PIN_SALT);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPIN(pin) {
  const snap = await getDoc(doc(db, 'portal', 'config'));
  if (!snap.exists() || !snap.data().pinHash) return false;
  return (await hashPIN(pin)) === snap.data().pinHash;
}

async function setPIN(pin) {
  await setDoc(doc(db, 'portal', 'config'), { pinHash: await hashPIN(pin) }, { merge: true });
}

async function isPINConfigured() {
  const snap = await getDoc(doc(db, 'portal', 'config'));
  return snap.exists() && !!snap.data().pinHash;
}

// ========== ユーザー（ニックネーム）管理 ==========
function showUsernameModal(isEdit = false) {
  const input = document.getElementById('username-input');
  input.value = (isEdit && currentUsername) ? currentUsername : '';
  document.getElementById('username-modal').classList.add('visible');
  setTimeout(() => input.focus(), 100);
}

function closeUsernameModal() {
  document.getElementById('username-modal').classList.remove('visible');
}

function saveUsername(name) {
  currentUsername = name;
  localStorage.setItem('portal-username', name);
  updateUsernameDisplay();
  registerUserLogin(name);   // users_list に記録
  loadPersonalData(name);
  renderAllSections();
}

// ユーザー名の頭文字から一貫したアバターカラーを生成
function getUserAvatarColor(name) {
  const colors = [
    'linear-gradient(135deg,#6366f1,#8b5cf6)',
    'linear-gradient(135deg,#0ea5e9,#06b6d4)',
    'linear-gradient(135deg,#10b981,#059669)',
    'linear-gradient(135deg,#f59e0b,#d97706)',
    'linear-gradient(135deg,#ef4444,#dc2626)',
    'linear-gradient(135deg,#ec4899,#db2777)',
    'linear-gradient(135deg,#14b8a6,#0d9488)',
    'linear-gradient(135deg,#f97316,#ea580c)',
  ];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length];
}

function updateUsernameDisplay() {
  const nameEl    = document.getElementById('username-display');
  const greetEl   = document.getElementById('user-greeting');
  const avatarEl  = document.getElementById('user-avatar');
  const btnEl     = document.getElementById('btn-user');

  if (currentUsername) {
    const initial = currentUsername.charAt(0).toUpperCase();
    if (avatarEl) {
      avatarEl.textContent = initial;
      avatarEl.style.background = getUserAvatarColor(currentUsername);
    }
    if (nameEl)  nameEl.textContent  = currentUsername;
    if (greetEl) greetEl.textContent = 'こんにちは';
    if (btnEl)   btnEl.classList.add('btn-user--active');
  } else {
    if (avatarEl) {
      avatarEl.innerHTML = '<i class="fa-solid fa-user"></i>';
      avatarEl.style.background = '';
    }
    if (nameEl)  nameEl.textContent  = '';
    if (greetEl) greetEl.textContent = '名前を設定してください';
    if (btnEl)   btnEl.classList.remove('btn-user--active');
  }
}

// Firestore の users_list にログイン記録（管理者が全員を把握できる）
async function registerUserLogin(username) {
  if (!username) return;
  try {
    const ref  = doc(db, 'users_list', username);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        displayName: username,
        createdAt:   serverTimestamp(),
        lastLogin:   serverTimestamp(),
      });
    } else {
      await updateDoc(ref, { lastLogin: serverTimestamp() });
    }
  } catch (err) {
    console.error('ユーザー登録エラー:', err);
  }
}

// ========== 個人データ（Firestore） ==========
// ========== お知らせ未読管理 ==========
async function loadReadNotices(username) {
  if (!username) { readNoticeIds = new Set(); updateNoticeBadge(); return; }
  try {
    const snap = await getDocs(collection(db, 'users', username, 'read_notices'));
    readNoticeIds = new Set(snap.docs.map(d => d.id));
    updateNoticeBadge();
    renderNotices(allNotices); // 既読状態を反映して再描画
  } catch (err) {
    console.error('既読データ読み込みエラー:', err);
  }
}

async function markAllNoticesRead() {
  if (!currentUsername || !allNotices.length) return;
  const batch = writeBatch(db);
  allNotices.forEach(n => {
    if (!readNoticeIds.has(n.id)) {
      batch.set(doc(db, 'users', currentUsername, 'read_notices', n.id), {
        readAt: serverTimestamp()
      });
    }
  });
  await batch.commit();
  allNotices.forEach(n => readNoticeIds.add(n.id));
  updateNoticeBadge();
  renderNotices(allNotices);
}

function updateNoticeBadge() {
  const badge = document.getElementById('notice-unread-badge');
  const bell  = document.getElementById('btn-notice-bell');
  if (!badge || !bell) return;
  const unreadCount = allNotices.filter(n => !readNoticeIds.has(n.id)).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.hidden = false;
    bell.classList.add('has-unread');
  } else {
    badge.hidden = true;
    bell.classList.remove('has-unread');
  }
}

// お知らせボードが画面内に入ったら自動既読
function setupNoticeObserver() {
  if (_noticeObserver) { _noticeObserver.disconnect(); _noticeObserver = null; }
  const board = document.getElementById('notice-board');
  if (!board || !currentUsername) return;
  _noticeObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) markAllNoticesRead();
  }, { threshold: 0.3 });
  _noticeObserver.observe(board);
}

// ========== お知らせリアクション ==========
const REACTION_EMOJIS = ['👍', '✅', '👀', '😊', '🙏'];

async function loadAllNoticeReactions() {
  try {
    const snap = await getDocs(collection(db, 'notice_reactions'));
    noticeReactions = {};
    snap.docs.forEach(d => { noticeReactions[d.id] = d.data(); });
    renderNotices(allNotices);
  } catch (err) {
    console.error('リアクション読み込みエラー:', err);
  }
}

async function toggleReaction(noticeId, emoji) {
  if (!currentUsername) return;
  const ref = doc(db, 'notice_reactions', noticeId);
  const current = (noticeReactions[noticeId] || {})[emoji] || [];
  const alreadyReacted = current.includes(currentUsername);
  // 楽観的UI更新
  if (!noticeReactions[noticeId]) noticeReactions[noticeId] = {};
  if (alreadyReacted) {
    noticeReactions[noticeId][emoji] = current.filter(u => u !== currentUsername);
  } else {
    noticeReactions[noticeId][emoji] = [...current, currentUsername];
  }
  renderNotices(allNotices);
  try {
    if (alreadyReacted) {
      await updateDoc(ref, { [emoji]: arrayRemove(currentUsername) });
    } else {
      await setDoc(ref, { [emoji]: arrayUnion(currentUsername) }, { merge: true });
    }
  } catch (err) {
    console.error('リアクション更新エラー:', err);
    // ロールバック
    await loadAllNoticeReactions();
  }
}

function buildReactionBar(noticeId) {
  const reactions = noticeReactions[noticeId] || {};
  const btns = REACTION_EMOJIS.map(emoji => {
    const users = reactions[emoji] || [];
    const count = users.length;
    const active = currentUsername && users.includes(currentUsername) ? ' active' : '';
    const countHtml = count > 0 ? `<span class="reaction-count">${count}</span>` : '';
    return `<button class="reaction-btn${active}" data-notice-id="${noticeId}" data-emoji="${emoji}" title="${users.join(', ') || ''}">${emoji}${countHtml}</button>`;
  }).join('');
  return `<div class="notice-reactions">${btns}</div>`;
}

// ========== 全社チャット ==========
const CHAT_MAX = 100;

function openChatPanel() {
  chatPanelOpen = true;
  const panel = document.getElementById('chat-panel');
  panel.removeAttribute('hidden');
  setTimeout(() => panel.classList.add('open'), 10);
  if (!_chatUnsubscribe) startChatListener();
  else { renderChatMessages(); scrollChatToBottom(); }
  setTimeout(markChatAsRead, 400);
}

function closeChatPanel() {
  chatPanelOpen = false;
  const panel = document.getElementById('chat-panel');
  panel.classList.remove('open');
  setTimeout(() => panel.setAttribute('hidden', ''), 280);
  updateChatBadge();
}

function startChatListener() {
  const q = query(collection(db, 'chat_messages'), orderBy('createdAt', 'asc'), limit(CHAT_MAX));
  _chatUnsubscribe = onSnapshot(q, snap => {
    chatMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (chatPanelOpen) {
      renderChatMessages();
      scrollChatToBottom();
      markChatAsRead();
    }
    updateChatBadge();
  }, err => console.error('チャット受信エラー:', err));
}

async function sendChatMessage() {
  if (!currentUsername) return;
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    await addDoc(collection(db, 'chat_messages'), {
      username: currentUsername,
      text,
      createdAt: serverTimestamp()
    });
  } catch (err) { console.error('チャット送信エラー:', err); }
}

async function deleteChatMessage(id) {
  const ok = await confirmDelete('このメッセージを削除しますか？');
  if (!ok) return;
  try { await deleteDoc(doc(db, 'chat_messages', id)); }
  catch (err) { console.error('チャット削除エラー:', err); }
}

async function markChatAsRead() {
  if (!currentUsername) return;
  chatLastReadAt = new Date();
  updateChatBadge();
  try {
    await setDoc(
      doc(db, 'users', currentUsername, 'data', 'chat_last_read'),
      { readAt: serverTimestamp() }, { merge: true }
    );
  } catch (_) {}
}

async function loadChatLastRead(username) {
  if (!username) return;
  try {
    const snap = await getDoc(doc(db, 'users', username, 'data', 'chat_last_read'));
    chatLastReadAt = snap.exists() ? snap.data().readAt?.toDate?.() || null : null;
    updateChatBadge();
  } catch (_) {}
}

function updateChatBadge() {
  const badge = document.getElementById('chat-unread-badge');
  const fab   = document.getElementById('chat-fab');
  if (!badge || !fab) return;
  if (!currentUsername || chatPanelOpen) {
    badge.hidden = true;
    fab.classList.remove('has-unread');
    return;
  }
  const unread = chatMessages.filter(m =>
    m.username !== currentUsername &&
    m.createdAt?.toDate &&
    (!chatLastReadAt || m.createdAt.toDate() > chatLastReadAt)
  ).length;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.hidden = false;
    fab.classList.add('has-unread');
  } else {
    badge.hidden = true;
    fab.classList.remove('has-unread');
  }
}

function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const loginReq = document.getElementById('chat-login-required');
  const inputRow = document.getElementById('chat-input-row');
  if (currentUsername) {
    loginReq.hidden = true;
    inputRow.hidden = false;
  } else {
    loginReq.hidden = false;
    inputRow.hidden = true;
  }
  if (!chatMessages.length) {
    container.innerHTML = '<div class="chat-empty">まだメッセージはありません。<br>最初のメッセージを送ってみましょう！</div>';
    return;
  }
  container.innerHTML = '';
  let lastDate = '';
  chatMessages.forEach(msg => {
    const isOwn = msg.username === currentUsername;
    const ts = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date();
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
    const del = isOwn
      ? `<button class="chat-msg-delete" data-id="${msg.id}" title="削除"><i class="fa-solid fa-trash-can"></i></button>`
      : '';
    const el = document.createElement('div');
    el.className = `chat-msg${isOwn ? ' chat-msg--own' : ''}`;
    el.innerHTML = `
      ${!isOwn ? `<div class="chat-avatar" style="background:${color}">${initial}</div>` : ''}
      <div class="chat-msg-body">
        ${!isOwn ? `<div class="chat-msg-name">${esc(msg.username)}</div>` : ''}
        <div class="chat-bubble">${esc(msg.text)}${del}</div>
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

function scrollChatToBottom() {
  const c = document.getElementById('chat-messages');
  if (c) c.scrollTop = c.scrollHeight;
}

// ========== メール返信アシスタント ==========
const DEFAULT_EMAIL_PROFILES = [
  {
    id: 'internal',
    name: '社内向け',
    prompt: '社内の同僚へのメールです。敬語は使いますが堅すぎず、簡潔で分かりやすい文体で返信を作成してください。要点は箇条書きにしても構いません。件名・宛名・署名は含めないでください。'
  },
  {
    id: 'drawing',
    name: '作図業者',
    prompt: '外部の作図業者へのメールです。発注者として丁寧かつ明確に、作業内容・納期・注意点を具体的に伝える文体で返信を作成してください。件名・宛名・署名は含めないでください。'
  },
  {
    id: 'subcontractor',
    name: '下請け業者',
    prompt: '下請け業者（協力会社）へのメールです。発注者として丁寧に、工程・品質・安全に関する指示や依頼を明確に伝える文体で返信を作成してください。件名・宛名・署名は含めないでください。'
  },
  {
    id: 'client',
    name: 'ゼネコン（お客様）',
    prompt: '元請けゼネコン・お客様へのメールです。最上級の敬語を使い、丁寧かつ誠実な文体で返信を作成してください。懸念事項には真摯に対応する姿勢を示してください。件名・宛名・署名は含めないでください。'
  }
];

let emailProfiles = [];
let selectedEmailProfileId = 'internal';
let geminiApiKey = null;
let emailModalLoaded = false;
let userEmailProfile = { realName: '', department: '', email: '', phone: '', signatureTemplate: '' };

const DEFAULT_SIGNATURE_TEMPLATE =
`━━━━━━━━━━━━━━━━━━━━━━
{realName}　{department}
日建フレメックス株式会社
TEL：{phone}
E-mail：{email}
━━━━━━━━━━━━━━━━━━━━━━`;

async function loadEmailData() {
  // APIキーをFirestoreから取得
  try {
    const snap = await getDoc(doc(db, 'portal', 'config'));
    geminiApiKey = snap.data()?.geminiApiKey || null;
  } catch (_) {}

  // ユーザーのカスタムプロファイルを取得
  let userProfiles = [];
  if (currentUsername) {
    try {
      const snap = await getDocs(
        query(collection(db, 'users', currentUsername, 'email_profiles'), orderBy('createdAt', 'asc'))
      );
      userProfiles = snap.docs.map(d => ({ id: d.id, isCustom: true, ...d.data() }));
    } catch (_) {}
  }

  // デフォルトにユーザーのカスタマイズをマージ
  const mergedDefaults = DEFAULT_EMAIL_PROFILES.map(p => {
    const override = userProfiles.find(u => u.id === p.id);
    return override ? { ...p, ...override, isDefault: true } : { ...p, isDefault: true };
  });
  const onlyCustom = userProfiles.filter(u => !DEFAULT_EMAIL_PROFILES.find(d => d.id === u.id));
  emailProfiles = [...mergedDefaults, ...onlyCustom];

  // ユーザープロフィール（名前・所属・署名）を読み込み
  if (currentUsername) {
    try {
      const profSnap = await getDoc(doc(db, 'users', currentUsername, 'data', 'email_profile'));
      if (profSnap.exists()) {
        userEmailProfile = { ...userEmailProfile, ...profSnap.data() };
      }
    } catch (_) {}
  }

  updateApiKeyUI();
  renderEmailProfileList();
  selectEmailProfile(selectedEmailProfileId);
  renderProfileTab();
  emailModalLoaded = true;
}

function updateApiKeyUI() {
  const area = document.getElementById('email-api-key-area');
  if (!area) return;
  area.hidden = !!geminiApiKey;
}

function renderEmailProfileList() {
  const list = document.getElementById('email-profile-list');
  if (!list) return;
  list.innerHTML = '';
  emailProfiles.forEach(p => {
    const btn = document.createElement('button');
    btn.className = `email-profile-item${p.id === selectedEmailProfileId ? ' active' : ''}`;
    btn.dataset.id = p.id;
    btn.innerHTML = `<span>${esc(p.name)}</span>${p.isDefault ? '' : '<span class="email-custom-tag">カスタム</span>'}`;
    btn.addEventListener('click', () => selectEmailProfile(p.id));
    list.appendChild(btn);
  });
}

function selectEmailProfile(id) {
  const profile = emailProfiles.find(p => p.id === id);
  if (!profile) return;
  selectedEmailProfileId = id;
  document.querySelectorAll('.email-profile-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  document.getElementById('email-selected-profile-name').textContent = profile.name;
  document.getElementById('email-profile-name').value = profile.name;
  document.getElementById('email-profile-prompt').value = profile.prompt;
  const delBtn = document.getElementById('email-profile-delete');
  delBtn.style.display = profile.isDefault ? 'none' : 'inline-flex';
}

async function saveEmailProfile() {
  if (!currentUsername) { alert('ニックネームを設定してください'); return; }
  const name   = document.getElementById('email-profile-name').value.trim();
  const prompt = document.getElementById('email-profile-prompt').value.trim();
  if (!name || !prompt) return;
  try {
    await setDoc(
      doc(db, 'users', currentUsername, 'email_profiles', selectedEmailProfileId),
      { name, prompt, updatedAt: serverTimestamp() }, { merge: true }
    );
    const idx = emailProfiles.findIndex(p => p.id === selectedEmailProfileId);
    if (idx !== -1) { emailProfiles[idx].name = name; emailProfiles[idx].prompt = prompt; }
    document.getElementById('email-selected-profile-name').textContent = name;
    renderEmailProfileList();
    // フィードバック
    const btn = document.getElementById('email-profile-save');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> 保存しました';
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  } catch (err) { console.error('プロファイル保存エラー:', err); }
}

async function addEmailProfile() {
  if (!currentUsername) { alert('ニックネームを設定してください'); return; }
  const id = `custom_${Date.now()}`;
  const newProfile = { id, name: '新しいパターン', prompt: '丁寧な文体でメールの返信を作成してください。件名・宛名・署名は含めないでください。', isCustom: true };
  try {
    await setDoc(
      doc(db, 'users', currentUsername, 'email_profiles', id),
      { name: newProfile.name, prompt: newProfile.prompt, createdAt: serverTimestamp() }
    );
    emailProfiles.push(newProfile);
    renderEmailProfileList();
    selectEmailProfile(id);
    // 詳細を開いてパターン名にフォーカス
    document.getElementById('email-prompt-details').open = true;
    setTimeout(() => {
      const nameInput = document.getElementById('email-profile-name');
      nameInput.select();
      nameInput.focus();
    }, 50);
  } catch (err) { console.error('プロファイル追加エラー:', err); }
}

async function deleteEmailProfile() {
  const profile = emailProfiles.find(p => p.id === selectedEmailProfileId);
  if (!profile || profile.isDefault) return;
  const ok = await confirmDelete(`「${profile.name}」を削除しますか？`);
  if (!ok) return;
  try {
    await deleteDoc(doc(db, 'users', currentUsername, 'email_profiles', selectedEmailProfileId));
    emailProfiles = emailProfiles.filter(p => p.id !== selectedEmailProfileId);
    selectedEmailProfileId = emailProfiles[0]?.id || 'internal';
    renderEmailProfileList();
    selectEmailProfile(selectedEmailProfileId);
  } catch (err) { console.error('プロファイル削除エラー:', err); }
}

async function saveGeminiApiKey() {
  const key = document.getElementById('email-api-key-input').value.trim();
  if (!key) return;
  try {
    await setDoc(doc(db, 'portal', 'config'), { geminiApiKey: key }, { merge: true });
    geminiApiKey = key;
    document.getElementById('email-api-key-input').value = '';
    updateApiKeyUI();
  } catch (err) { console.error('APIキー保存エラー:', err); }
}

async function generateEmailReply() {
  if (!geminiApiKey) {
    document.getElementById('email-api-key-area').hidden = false;
    document.getElementById('email-api-key-input').focus();
    return;
  }
  const received = document.getElementById('email-received').value.trim();
  if (!received) { document.getElementById('email-received').focus(); return; }
  const profile = emailProfiles.find(p => p.id === selectedEmailProfileId);
  if (!profile) return;

  const btn = document.getElementById('email-generate');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 生成中...';
  const outputArea = document.getElementById('email-output-area');
  outputArea.hidden = true;

  const senderName = userEmailProfile.realName ? `日建フレメックスの${userEmailProfile.realName}` : '日建フレメックスの担当者';
  const sigTemplate = userEmailProfile.signatureTemplate || DEFAULT_SIGNATURE_TEMPLATE;
  const filledSig   = fillSignature(sigTemplate);

  const fullPrompt = `あなたは日本の建設会社「日建フレメックス」の社員（${senderName}）です。以下の受信メールに対する返信文を作成してください。

【返信パターン：${profile.name}】
${profile.prompt}

【必須ルール】
- 返信文の書き出しは必ず「${senderName}です。」から始めてください
- 件名・宛名は含めないでください
- 返信本文の最後に、以下の署名をそのまま追加してください（改変不可）：

${filledSig}

【受信したメール】
${received}

返信文：`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        })
      }
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '（生成結果が空でした）';
    document.getElementById('email-output').textContent = text;
    outputArea.hidden = false;
    outputArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    document.getElementById('email-output').textContent = `エラー: ${err.message}`;
    outputArea.hidden = false;
    console.error('Gemini APIエラー:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 返信を生成する';
  }
}

function copyEmailOutput() {
  const text = document.getElementById('email-output').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy-output');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> コピーしました！';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  });
}

// プロフィールタブを描画
function renderProfileTab() {
  document.getElementById('ep-real-name').value   = userEmailProfile.realName   || '';
  document.getElementById('ep-department').value  = userEmailProfile.department  || '';
  document.getElementById('ep-email').value        = userEmailProfile.email        || '';
  document.getElementById('ep-phone').value        = userEmailProfile.phone        || '';
  const sig = userEmailProfile.signatureTemplate || DEFAULT_SIGNATURE_TEMPLATE;
  document.getElementById('ep-signature').value = sig;
  updateSignaturePreview(sig);
}

function fillSignature(template) {
  return template
    .replace(/\{realName\}/g,   userEmailProfile.realName   || '（名前未設定）')
    .replace(/\{department\}/g, userEmailProfile.department  || '（所属未設定）')
    .replace(/\{email\}/g,      userEmailProfile.email        || '（メール未設定）')
    .replace(/\{phone\}/g,      userEmailProfile.phone        || '（電話未設定）');
}

function updateSignaturePreview(template) {
  const el = document.getElementById('ep-signature-preview');
  if (el) el.textContent = fillSignature(template || DEFAULT_SIGNATURE_TEMPLATE);
}

async function saveUserEmailProfile() {
  userEmailProfile.realName          = document.getElementById('ep-real-name').value.trim();
  userEmailProfile.department        = document.getElementById('ep-department').value.trim();
  userEmailProfile.email             = document.getElementById('ep-email').value.trim();
  userEmailProfile.phone             = document.getElementById('ep-phone').value.trim();
  userEmailProfile.signatureTemplate = document.getElementById('ep-signature').value;

  if (currentUsername) {
    try {
      await setDoc(
        doc(db, 'users', currentUsername, 'data', 'email_profile'),
        { ...userEmailProfile, updatedAt: serverTimestamp() }, { merge: true }
      );
    } catch (err) { console.error('プロフィール保存エラー:', err); }
  }
  // フィードバック
  const btn = document.getElementById('ep-save');
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> 保存しました';
  setTimeout(() => { btn.innerHTML = orig; }, 1500);
  updateSignaturePreview(userEmailProfile.signatureTemplate);
}

function resetSignatureTemplate() {
  document.getElementById('ep-signature').value = DEFAULT_SIGNATURE_TEMPLATE;
  updateSignaturePreview(DEFAULT_SIGNATURE_TEMPLATE);
}

// タブ切り替え
function switchEmailTab(tabId) {
  document.querySelectorAll('.email-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.email-tab-content').forEach(el => {
    el.hidden = el.id !== `email-tab-${tabId}`;
  });
}

function openEmailModal() {
  document.getElementById('email-modal').classList.add('visible');
  if (!emailModalLoaded) loadEmailData();
}

function closeEmailModal() {
  document.getElementById('email-modal').classList.remove('visible');
}

// ========== 個人TODO ==========
function loadTodos(username) {
  // 既存リスナーを解除
  if (_todoUnsubscribe) { _todoUnsubscribe(); _todoUnsubscribe = null; }
  if (!username) { personalTodos = []; renderTodoSection(); return; }

  const q = query(
    collection(db, 'users', username, 'todos'),
    orderBy('createdAt', 'asc')
  );
  _todoUnsubscribe = onSnapshot(q, snap => {
    personalTodos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTodoSection();
  }, err => console.error('TODO読み込みエラー:', err));
}

async function addTodo(text, dueDate) {
  if (!currentUsername || !text.trim()) return;
  await addDoc(collection(db, 'users', currentUsername, 'todos'), {
    text:      text.trim(),
    done:      false,
    dueDate:   dueDate || null,
    createdAt: serverTimestamp(),
  });
}

async function toggleTodo(todoId, currentDone) {
  if (!currentUsername) return;
  await updateDoc(doc(db, 'users', currentUsername, 'todos', todoId), {
    done: !currentDone,
  });
}

async function deleteTodo(todoId) {
  if (!currentUsername) return;
  await deleteDoc(doc(db, 'users', currentUsername, 'todos', todoId));
}

function renderTodoSection() {
  const section = document.getElementById('todo-section');
  const list    = document.getElementById('todo-list');
  const countEl = document.getElementById('todo-count');
  const body    = document.getElementById('todo-body');
  if (!section || !list) return;

  // ニックネーム未設定なら非表示
  if (!currentUsername) { section.hidden = true; return; }
  section.hidden = false;

  // 折りたたみ状態
  body.classList.toggle('todo-body--collapsed', todoCollapsed);
  const toggleBtn = document.getElementById('todo-toggle-btn');
  if (toggleBtn) {
    toggleBtn.querySelector('i').className = todoCollapsed
      ? 'fa-solid fa-chevron-down'
      : 'fa-solid fa-chevron-up';
    toggleBtn.title = todoCollapsed ? '展開する' : '折りたたむ';
  }

  // カウント表示
  const total  = personalTodos.length;
  const doneN  = personalTodos.filter(t => t.done).length;
  if (countEl) {
    countEl.textContent = total ? `${doneN}/${total} 完了` : '';
    countEl.className   = 'todo-count' + (doneN === total && total > 0 ? ' todo-count--all-done' : '');
  }

  // リスト描画（未完了→完了の順）
  const sorted = [
    ...personalTodos.filter(t => !t.done),
    ...personalTodos.filter(t =>  t.done),
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
  if (!currentUsername) return;
  clearTimeout(_prefSaveTimer);
  _prefSaveTimer = setTimeout(async () => {
    try {
      const theme    = localStorage.getItem('portal-theme')     || 'dark';
      const fontSize = localStorage.getItem('portal-font-size') || 'font-md';
      await setDoc(
        doc(db, 'users', currentUsername, 'data', 'preferences'),
        {
          theme,
          fontSize,
          favOnly:   favoritesOnlyMode,
          favorites: personalFavorites,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      console.error('設定保存エラー:', err);
    }
  }, 600);
}

async function loadPersonalData(username) {
  if (!username) return;
  try {
    // ログイン記録を更新（並列で実行、失敗しても続行）
    registerUserLogin(username);

    const [orderSnap, prefSnap, privSecSnap, privCardSnap] = await Promise.all([
      getDoc(doc(db, 'users', username, 'data', 'section_order')),
      getDoc(doc(db, 'users', username, 'data', 'preferences')),
      getDocs(collection(db, 'users', username, 'private_sections')),
      getDocs(collection(db, 'users', username, 'private_cards')),
    ]);

    personalSectionOrder = orderSnap.exists() ? (orderSnap.data().order || []) : [];

    if (prefSnap.exists()) {
      // Firestore から設定を復元
      const p = prefSnap.data();
      personalFavorites = Array.isArray(p.favorites) ? p.favorites : [];
      favoritesOnlyMode = !!p.favOnly;
      if (p.theme)    applyTheme(p.theme, false);       // save=false: 読み込み時は保存しない
      if (p.fontSize) applyFontSize(p.fontSize, false); // save=false: 読み込み時は保存しない
    } else {
      // 初回ログイン：localStorage に残っているデータがあれば Firestore へ移行
      const localFavs = (() => {
        try { return JSON.parse(localStorage.getItem('portal-favorites') || '[]'); } catch { return []; }
      })();
      const localFavOnly = localStorage.getItem('portal-fav-only') === '1';
      personalFavorites = localFavs;
      favoritesOnlyMode = localFavOnly;
      // Firestore へ保存（移行）
      savePreferencesToFirestore();
    }

    privateCategories = privSecSnap.docs.map(d => ({ docId: d.id, isPrivate: true, ...d.data() }));
    privateCards      = privCardSnap.docs.map(d => ({ id: d.id, isPrivate: true, ...d.data() }));

    renderAllSections();
    renderFavorites();
    applyFavoritesOnlyMode();
    loadTodos(username);
    await loadReadNotices(username);
    setupNoticeObserver();
    loadChatLastRead(username);
  } catch (err) {
    console.error('個人データ読み込みエラー:', err);
  }
}

async function savePersonalSectionOrder(username, order) {
  if (!username) return;
  await setDoc(doc(db, 'users', username, 'data', 'section_order'), { order, updatedAt: serverTimestamp() });
}

async function addPrivateSection(data) {
  if (!currentUsername) return;
  const ref = await addDoc(collection(db, 'users', currentUsername, 'private_sections'), { ...data, createdAt: serverTimestamp() });
  privateCategories.push({ docId: ref.id, isPrivate: true, ...data });
}

async function updatePrivateSection(docId, data) {
  if (!currentUsername) return;
  await updateDoc(doc(db, 'users', currentUsername, 'private_sections', docId), { ...data, updatedAt: serverTimestamp() });
  const idx = privateCategories.findIndex(c => c.docId === docId);
  if (idx !== -1) privateCategories[idx] = { ...privateCategories[idx], ...data };
}

async function deletePrivateSection(docId) {
  if (!currentUsername) return;
  await deleteDoc(doc(db, 'users', currentUsername, 'private_sections', docId));
  privateCategories = privateCategories.filter(c => c.docId !== docId);
}

async function addPrivateCard(data) {
  if (!currentUsername) return;
  const siblings = data.parentId
    ? privateCards.filter(c => c.parentId === data.parentId)
    : privateCards.filter(c => c.sectionId === data.sectionId && !c.parentId);
  const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order || 0)) + 1 : 0;
  const newData = { ...data, parentId: data.parentId || null, order: maxOrder, updatedAt: serverTimestamp() };
  const ref = await addDoc(collection(db, 'users', currentUsername, 'private_cards'), newData);
  privateCards.push({ id: ref.id, isPrivate: true, ...newData });
  renderAllSections();
}

async function savePrivateCard(cardId, data) {
  if (!currentUsername) return;
  await updateDoc(doc(db, 'users', currentUsername, 'private_cards', cardId), { ...data, updatedAt: serverTimestamp() });
  const idx = privateCards.findIndex(c => c.id === cardId);
  if (idx !== -1) privateCards[idx] = { ...privateCards[idx], ...data };
  renderAllSections();
}

async function deletePrivateCard(cardId) {
  if (!currentUsername) return;
  await deleteDoc(doc(db, 'users', currentUsername, 'private_cards', cardId));
  privateCards = privateCards.filter(c => c.id !== cardId);
  renderAllSections();
}

// ========== 個人セクション順序 ==========
function applyPersonalOrder(cats) {
  const result = [];
  personalSectionOrder.forEach(sid => {
    const cat = cats.find(c =>
      sid.startsWith('priv:')
        ? c.isPrivate && c.docId === sid.slice(5)
        : !c.isPrivate && c.id === sid
    );
    if (cat) result.push(cat);
  });
  cats.forEach(cat => {
    const sid = cat.isPrivate ? `priv:${cat.docId}` : cat.id;
    if (!personalSectionOrder.includes(sid)) result.push(cat);
  });
  return result;
}

async function reorderSections(srcId, targetId) {
  const publicCats = [...allCategories].sort((a, b) => a.order - b.order);
  const privCats = [...privateCategories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const allCats = [...publicCats, ...privCats];

  let currentIds;
  if (personalSectionOrder.length) {
    currentIds = [...personalSectionOrder];
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
  personalSectionOrder = currentIds;

  if (currentUsername) await savePersonalSectionOrder(currentUsername, currentIds);
  renderAllSections();
}

// ========== セクション ドラッグ&ドロップ ==========
function setupSectionDraggable(section, sectionId) {
  const handle = section.querySelector('.section-drag-handle');
  if (!handle) return;

  handle.addEventListener('dragstart', e => {
    dragSrcSectionId = sectionId;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => section.classList.add('section-dragging'), 0);
  });

  handle.addEventListener('dragend', () => {
    section.classList.remove('section-dragging');
    document.querySelectorAll('.section-drag-over').forEach(el => el.classList.remove('section-drag-over'));
    dragSrcSectionId = null;
  });

  section.addEventListener('dragover', e => {
    if (!dragSrcSectionId || dragSrcSectionId === sectionId) return;
    e.preventDefault();
    section.classList.add('section-drag-over');
  });

  section.addEventListener('dragleave', e => {
    if (!section.contains(e.relatedTarget)) section.classList.remove('section-drag-over');
  });

  section.addEventListener('drop', async e => {
    e.preventDefault();
    section.classList.remove('section-drag-over');
    if (!dragSrcSectionId || dragSrcSectionId === sectionId) return;
    const src = dragSrcSectionId;
    dragSrcSectionId = null;
    await reorderSections(src, sectionId);
  });
}

// ========== プライベートセクション管理モーダル ==========
function openPrivateSectionModal(cat) {
  editingPrivateSectionId = cat?.docId || null;
  privateSectionColorIndex = cat?.colorIndex || 1;
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
    btn.className = `color-swatch${index === privateSectionColorIndex ? ' selected' : ''}`;
    btn.style.background = gradient;
    btn.title = label;
    btn.addEventListener('click', () => {
      privateSectionColorIndex = index;
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
  editingPrivateSectionId = null;
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
    allCategories = snap.docs.map(d => {
      const data = d.data();
      return {
        docId: d.id,
        ...data,
        // Firestore に isExternal が未保存の場合は id で判定
        isExternal: data.isExternal ?? (data.id === 'external')
      };
    });
  }
}

function subscribeCards() {
  if (unsubscribeCards) unsubscribeCards();
  const q = query(collection(db, 'cards'), orderBy('categoryOrder'));
  unsubscribeCards = onSnapshot(q, snapshot => {
    allCards = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.categoryOrder ?? 0) - (b.categoryOrder ?? 0) || (a.order ?? 0) - (b.order ?? 0));
    renderAllSections();
    renderFavorites();
  }, err => console.error('onSnapshot エラー:', err));
}

async function saveCard(docId, data) {
  await updateDoc(doc(db, 'cards', docId), { ...data, updatedAt: serverTimestamp() });
  const idx = allCards.findIndex(c => c.id === docId);
  if (idx !== -1) allCards[idx] = { ...allCards[idx], ...data };
}

async function addCard(data) {
  // parentId がある場合はその子カード群の中での最大 order を取得
  const siblings = data.parentId
    ? allCards.filter(c => c.parentId === data.parentId)
    : allCards.filter(c => c.category === data.category && !c.parentId);
  const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
  const catDef = allCategories.find(c => c.id === data.category);
  const newData = {
    ...data,
    parentId: data.parentId || null,
    order: maxOrder,
    categoryOrder: catDef ? catDef.order : 99,
    isExternalTool: data.category === 'external',
    updatedAt: serverTimestamp()
  };
  await addDoc(collection(db, 'cards'), newData);
  // onSnapshot が自動で再描画するため手動追加不要
}

async function deleteCard(docId) {
  await deleteDoc(doc(db, 'cards', docId));
  allCards = allCards.filter(c => c.id !== docId);
}

// ========== Firestore CRUD (お知らせ) ==========
async function loadNotices() {
  const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  allNotices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function saveNotice(id, data) {
  await updateDoc(doc(db, 'notices', id), { ...data, updatedAt: serverTimestamp() });
  const idx = allNotices.findIndex(n => n.id === id);
  if (idx !== -1) allNotices[idx] = { ...allNotices[idx], ...data };
}

async function addNotice(data) {
  const ref = await addDoc(collection(db, 'notices'), { ...data, createdAt: serverTimestamp() });
  allNotices.unshift({ id: ref.id, ...data });
}

async function deleteNotice(id) {
  await deleteDoc(doc(db, 'notices', id));
  allNotices = allNotices.filter(n => n.id !== id);
}

// ========== Firestore CRUD (カテゴリ) ==========
async function addCategoryToFirestore(data) {
  const ref = await addDoc(collection(db, 'categories'), { ...data, updatedAt: serverTimestamp() });
  allCategories.push({ docId: ref.id, ...data });
}

async function updateCategoryInFirestore(docId, data) {
  await updateDoc(doc(db, 'categories', docId), { ...data, updatedAt: serverTimestamp() });
  const idx = allCategories.findIndex(c => c.docId === docId);
  if (idx !== -1) allCategories[idx] = { ...allCategories[idx], ...data };
}

async function deleteCategoryFromFirestore(docId) {
  await deleteDoc(doc(db, 'categories', docId));
  allCategories = allCategories.filter(c => c.docId !== docId);
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

  const publicSorted = [...allCategories].sort((a, b) => a.order - b.order);
  const privateSorted = [...privateCategories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const allCats = [...publicSorted, ...privateSorted];
  const sorted = personalSectionOrder.length ? applyPersonalOrder(allCats) : allCats;

  sorted.forEach(cat => {
    let catCards;
    if (cat.isPrivate) {
      catCards = privateCards.filter(c => c.sectionId === cat.docId).sort((a, b) => (a.order || 0) - (b.order || 0));
    } else {
      catCards = allCards.filter(c => c.category === cat.id).sort((a, b) => a.order - b.order);
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
  if (currentUsername) btnsHtml += `
    <div class="add-btn-group">
      <button class="btn-add-private-section"><i class="fa-solid fa-lock"></i> マイセクションを追加</button>
      <p class="add-btn-desc add-btn-desc--private"><i class="fa-solid fa-user-secret"></i> 自分だけに表示されます</p>
    </div>`;
  addWrap.innerHTML = btnsHtml;
  addWrap.querySelector('.btn-add-category').addEventListener('click', () => openCategoryModal(null));
  if (currentUsername) addWrap.querySelector('.btn-add-private-section').addEventListener('click', () => openPrivateSectionModal(null));
  main.insertBefore(addWrap, noResults);
}

function buildSection(cat, cards) {
  const section = document.createElement('section');
  const gradient = getCategoryGradient(cat);
  const sectionId = cat.isPrivate ? `priv:${cat.docId}` : cat.id;

  if (cat.isExternal) {
    section.className = 'external-tools';
    section.id = `section-${cat.id}`;
    const editBtns = isEditMode
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
    if (isEditMode) {
      const addWrap = document.createElement('div');
      addWrap.className = 'ext-icon-wrap';
      const addBtn = document.createElement('button');
      addBtn.className = 'ext-icon-btn ext-icon-add-btn';
      addBtn.innerHTML = `<div class="ext-icon-img ext-icon-add-img"><i class="fa-solid fa-plus"></i></div><span class="ext-icon-label">追加</span>`;
      addBtn.addEventListener('click', openServicePicker);
      addWrap.appendChild(addBtn);
      grid.appendChild(addWrap);
    }
    if (isEditMode) {
      const editBtn = section.querySelector('.btn-edit-category');
      if (editBtn) editBtn.addEventListener('click', () => {
        const catObj = allCategories.find(c => c.docId === editBtn.dataset.docid || c.id === cat.id);
        openCategoryModal(catObj);
      });
    }

  } else if (cat.isPrivate) {
    // プライベートセクション
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

    // セクションまとめてお気に入り
    const favs = getFavorites();
    const allFaved = cards.length > 0 && cards.every(c => favs.includes(c.id));
    const sBtn = document.createElement('button');
    sBtn.className = 'btn-section-favorite' + (allFaved ? ' active' : '');
    sBtn.title = allFaved ? 'まとめて解除' : 'セクションをまとめてお気に入り';
    sBtn.innerHTML = `<i class="fa-${allFaved ? 'solid' : 'regular'} fa-star"></i>`;
    sBtn.addEventListener('click', () => toggleSectionFavorite(cat.docId, true));
    section.querySelector('.category-header').appendChild(sBtn);

  } else {
    // 通常パブリックセクション
    section.className = 'category-section';
    section.id = `section-${cat.id}`;
    const editBtns = isEditMode
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
    if (isEditMode) grid.appendChild(buildAddButton(cat.id));

    if (isEditMode) {
      const editBtn = section.querySelector('.btn-edit-category');
      if (editBtn) editBtn.addEventListener('click', () => {
        const catObj = allCategories.find(c => c.docId === editBtn.dataset.docid || c.id === cat.id);
        openCategoryModal(catObj);
      });
    }

    // セクションまとめてお気に入り
    const favs = getFavorites();
    const catCardsForFav = allCards.filter(c => c.category === cat.id);
    const allFaved = catCardsForFav.length > 0 && catCardsForFav.every(c => favs.includes(c.id));
    const sBtn = document.createElement('button');
    sBtn.className = 'btn-section-favorite' + (allFaved ? ' active' : '');
    sBtn.title = allFaved ? 'まとめて解除' : 'セクションをまとめてお気に入り';
    sBtn.innerHTML = `<i class="fa-${allFaved ? 'solid' : 'regular'} fa-star"></i>`;
    sBtn.addEventListener('click', () => toggleSectionFavorite(cat.id, false));
    section.querySelector('.category-header').appendChild(sBtn);
  }

  // セクションドラッグハンドル（ニックネーム設定済みの場合）
  if (currentUsername) {
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

  // カードアイコンに動的カラー適用
  if (gradient) {
    const iconEl = a.querySelector('.card-icon');
    if (iconEl) {
      // SVGでなければ gradient を text-fill で適用
      if (!card.icon?.startsWith('svg:')) {
        iconEl.style.background = gradient;
        iconEl.style.webkitBackgroundClip = 'text';
        iconEl.style.webkitTextFillColor = 'transparent';
        iconEl.style.backgroundClip = 'text';
      }
    }
  }

  // お気に入りボタン
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
    // ドラッグ&ドロップ
    setupDraggable(a, card);
  }
  return a;
}

// 太陽光カード: 常に先頭固定・削除不可
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

// ========== カード階層: ノード構築（バッジ＋ポップアップ方式） ==========
function buildCardNode(card, allCatCards, gradient, isPrivate) {
  const children = allCatCards.filter(c => c.parentId === card.id);
  const a = buildLinkCard(card, false, gradient);

  if (children.length === 0) return a;

  // 子カードがある → スタックバッジを追加（カード本体はそのまま）
  a.classList.add('card-has-children');

  const badge = document.createElement('button');
  badge.className = 'card-children-badge';
  badge.innerHTML = `<i class="fa-solid fa-layer-group"></i><span>${children.length}</span>`;
  badge.title = `${children.length}件の子カードを表示`;
  badge.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    // 同じポップアップを再クリックで閉じる
    if (activeChildPopup && activeChildPopup.dataset.parentId === card.id) {
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

  // ヘッダー
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

  // 子カードグリッド
  const grid = document.createElement('div');
  grid.className = 'card-child-popup__grid';
  children.forEach((child, i) => {
    const node = buildCardNode(child, allCatCards, gradient, isPrivate);
    node.style.animationDelay = `${i * 0.04}s`;
    grid.appendChild(node);
  });

  // 子カード追加ボタン
  const catId = parentCard.category || parentCard.sectionId;
  const addBtn = buildAddButton(catId, isPrivate, isPrivate ? parentCard.sectionId : null, parentCard.id);
  addBtn.style.animationDelay = `${children.length * 0.04}s`;
  grid.appendChild(addBtn);

  popup.appendChild(grid);
  document.body.appendChild(popup);

  // ポップアップの位置を調整
  positionChildPopup(popup, anchorEl);

  header.querySelector('.card-child-popup__close').addEventListener('click', e => {
    e.stopPropagation();
    closeChildPopup();
  });

  activeChildPopup = popup;

  // 外側クリックで閉じる（少し遅延してバインド）
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

  // まず仮位置に配置してサイズ取得
  popup.style.visibility = 'hidden';
  popup.style.left = '0px';
  popup.style.top = '0px';
  const popupH = popup.offsetHeight || 300;

  // カードの下に出す。下に収まらない場合は上に
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
  if (activeChildPopup && !activeChildPopup.contains(e.target)) {
    closeChildPopup();
  }
}

function closeChildPopup() {
  if (activeChildPopup) {
    activeChildPopup.classList.add('closing');
    const el = activeChildPopup;
    activeChildPopup = null;
    setTimeout(() => el.remove(), 180);
  }
  document.removeEventListener('click', closeChildPopupOnOutside);
}

// ========== 削除確認モーダル（誤削除防止） ==========
function confirmDelete(message) {
  return new Promise(resolve => {
    const modal   = document.getElementById('delete-confirm-modal');
    const msgEl   = document.getElementById('delete-confirm-message');
    const okBtn   = document.getElementById('delete-confirm-ok');
    const cancelBtn = document.getElementById('delete-confirm-cancel');

    msgEl.textContent = message;
    okBtn.disabled = true;
    okBtn.innerHTML = '削除 (<span id="delete-confirm-count">2</span>)';
    modal.classList.add('visible');

    let count = 2;
    const iv = setInterval(() => {
      count--;
      const el = document.getElementById('delete-confirm-count');
      if (el) el.textContent = count;
      if (count <= 0) {
        clearInterval(iv);
        okBtn.disabled = false;
        okBtn.textContent = '削除する';
        okBtn.classList.add('ready');
      }
    }, 1000);

    function cleanup() {
      clearInterval(iv);
      modal.classList.remove('visible');
      okBtn.classList.remove('ready');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlay);
    }
    function onOk()      { cleanup(); resolve(true);  }
    function onCancel()  { cleanup(); resolve(false); }
    function onOverlay(e){ if (e.target === modal) { cleanup(); resolve(false); } }

    okBtn.addEventListener('click', onOk, { once: true });
    cancelBtn.addEventListener('click', onCancel, { once: true });
    modal.addEventListener('click', onOverlay);
  });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ========== お気に入り ==========
function getFavorites() {
  return [...personalFavorites];
}

function setFavorites(ids) {
  personalFavorites = [...ids];
  savePreferencesToFirestore();
}

function toggleFavorite(docId) {
  const favs = getFavorites();
  const idx = favs.indexOf(docId);
  if (idx === -1) favs.push(docId); else favs.splice(idx, 1);
  setFavorites(favs);
  renderFavorites();
  // 全カードの星ボタン更新
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

  const cards = favIds.map(id => allCards.find(c => c.id === id)).filter(Boolean);

  if (!cards.length) {
    if (favoritesOnlyMode) {
      // お気に入りのみモードでは空でもセクションを表示
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

// ========== お知らせ ==========
function renderNotices(notices) {
  const board = document.getElementById('notice-board');
  if (!board) return;

  if (!notices.length && !isEditMode) {
    board.innerHTML = '';
    return;
  }

  const addBtn = isEditMode
    ? `<button class="btn-add-notice"><i class="fa-solid fa-plus"></i> お知らせを追加</button>`
    : '';

  const unreadCount = allNotices.filter(n => !readNoticeIds.has(n.id)).length;
  const readAllBtn = (currentUsername && unreadCount > 0)
    ? `<button class="btn-read-all" id="btn-read-all"><i class="fa-solid fa-check-double"></i> 全て既読</button>`
    : '';

  board.innerHTML = `
    <div class="notice-header">
      <i class="fa-solid fa-bullhorn"></i>
      <span>お知らせ</span>
      ${unreadCount > 0 ? `<span class="notice-unread-label">${unreadCount}件 未読</span>` : ''}
      ${readAllBtn}
      ${addBtn}
    </div>
    <div class="notice-list" id="notice-list"></div>
  `;

  if (currentUsername && unreadCount > 0) {
    board.querySelector('#btn-read-all')?.addEventListener('click', markAllNoticesRead);
  }

  if (isEditMode) {
    board.querySelector('.btn-add-notice').addEventListener('click', () => openNoticeModal(null));
  }

  const list = board.querySelector('#notice-list');
  notices.forEach(n => {
    const isUnread = currentUsername && !readNoticeIds.has(n.id);
    const item = document.createElement('div');
    item.className = `notice-item${n.priority === 'urgent' ? ' urgent' : ''}${isUnread ? ' notice-unread' : ''}`;
    const dateStr = n.createdAt?.toDate
      ? n.createdAt.toDate().toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
      : '';
    const newBadge = isUnread ? `<span class="notice-new-badge">NEW</span>` : '';
    const editBtns = isEditMode
      ? `<button class="btn-notice-edit" data-id="${n.id}"><i class="fa-solid fa-pen"></i></button>`
      : '';
    item.innerHTML = `
      <div class="notice-item-header">
        ${newBadge}
        <span class="notice-badge ${n.priority === 'urgent' ? 'badge-urgent' : 'badge-normal'}">${n.priority === 'urgent' ? '重要' : 'お知らせ'}</span>
        <span class="notice-title">${esc(n.title || '')}</span>
        <span class="notice-date">${dateStr}</span>
        ${editBtns}
      </div>
      ${n.body ? `<div class="notice-body">${esc(n.body)}</div>` : ''}
      ${buildReactionBar(n.id)}
    `;
    if (isEditMode) {
      item.querySelector('.btn-notice-edit').addEventListener('click', () => openNoticeModal(n));
    }
    list.appendChild(item);
  });

  // リアクションボタン（イベントデリゲーション）
  list.addEventListener('click', e => {
    const btn = e.target.closest('.reaction-btn');
    if (!btn) return;
    if (!currentUsername) { alert('リアクションするにはニックネームを設定してください'); return; }
    toggleReaction(btn.dataset.noticeId, btn.dataset.emoji);
  });
}

function openNoticeModal(notice) {
  editingNoticeId = notice ? notice.id : null;
  document.getElementById('notice-modal-title').textContent = notice ? 'お知らせを編集' : 'お知らせを追加';
  document.getElementById('notice-priority').value = notice?.priority || 'normal';
  document.getElementById('notice-title').value = notice?.title || '';
  document.getElementById('notice-body').value = notice?.body || '';
  document.getElementById('notice-delete').style.display = notice ? 'inline-flex' : 'none';
  document.getElementById('notice-modal').classList.add('visible');
  setTimeout(() => document.getElementById('notice-title').focus(), 100);
}

function closeNoticeModal() {
  document.getElementById('notice-modal').classList.remove('visible');
  editingNoticeId = null;
}

// ========== カテゴリ管理 ==========
function openCategoryModal(cat) {
  editingCategoryId = cat?.docId || null;
  document.getElementById('category-modal-title').textContent = cat ? 'カテゴリを編集' : 'カテゴリを追加';
  document.getElementById('cat-label').value = cat?.label || '';
  document.getElementById('cat-icon').value = cat?.icon || 'fa-solid fa-star';
  document.getElementById('cat-delete').style.display = (cat && !cat.isExternal) ? 'inline-flex' : 'none';
  selectedColorIndex = cat?.colorIndex || 1;
  updateCatIconPreview(cat?.icon || 'fa-solid fa-star');
  buildColorPicker();
  document.getElementById('category-modal').classList.add('visible');
  setTimeout(() => document.getElementById('cat-label').focus(), 100);
}

function closeCategoryModal() {
  document.getElementById('category-modal').classList.remove('visible');
  editingCategoryId = null;
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
    btn.className = `color-swatch${index === selectedColorIndex ? ' selected' : ''}`;
    btn.style.background = gradient;
    btn.title = label;
    btn.addEventListener('click', () => {
      selectedColorIndex = index;
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
    dragSrcId = card.id;
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
    if (dragSrcId !== card.id) el.classList.add('drag-over');
  });

  el.addEventListener('dragleave', () => {
    el.classList.remove('drag-over');
  });

  el.addEventListener('drop', async e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (!dragSrcId || dragSrcId === card.id) return;
    await reorderCards(dragSrcId, card.id);
    dragSrcId = null;
  });
}

async function reorderCards(srcId, targetId) {
  const src = allCards.find(c => c.id === srcId);
  const target = allCards.find(c => c.id === targetId);
  if (!src || !target || src.category !== target.category) return;

  const catCards = allCards
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
  isEditMode = true;
  document.body.classList.add('edit-mode');
  document.getElementById('edit-banner').hidden = false;
  const fab = document.getElementById('admin-fab');
  fab.innerHTML = '<i class="fa-solid fa-lock-open"></i>';
  fab.classList.add('active');
  fab.title = '編集モードを終了';
  renderAllSections();
  renderNotices(allNotices);
}

function exitEditMode() {
  isEditMode = false;
  document.body.classList.remove('edit-mode');
  document.getElementById('edit-banner').hidden = true;
  const fab = document.getElementById('admin-fab');
  fab.innerHTML = '<i class="fa-solid fa-lock"></i>';
  fab.classList.remove('active');
  fab.title = '管理者ログイン';
  renderAllSections();
  renderNotices(allNotices);
}

// ========== カード編集モーダル ==========
function openCardModal(docId, categoryId = null, isPrivate = false, privateSectionDocId = null, parentId = null) {
  editingDocId = docId;
  editingCategory = categoryId;
  editingIsPrivate = isPrivate;
  editingPrivateSectionDocId = privateSectionDocId;
  editingParentId = parentId;

  const card = docId
    ? (isPrivate ? privateCards.find(c => c.id === docId) : allCards.find(c => c.id === docId))
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
  editingDocId = null;
  editingCategory = null;
  editingIsPrivate = false;
  editingPrivateSectionDocId = null;
  editingParentId = null;
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
    allCards.filter(c => c.isExternalTool || c.category === 'external').map(c => c.url)
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

// ========== 天気パネル（雨雲レーダー / 太陽光発電 タブ） ==========
const WINDY_URL = `https://embed.windy.com/embed2.html?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&detailLat=${WEATHER_LAT}&detailLon=${WEATHER_LON}&zoom=9&level=surface&overlay=rain&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;
const SOLAR_SRC = 'https://mierukaweb.energymntr.com/48429893PZ';

function openWeatherPanel(tab) {
  const widget = document.getElementById('weather-widget');
  const panel  = document.getElementById('weather-panel');
  if (!widget || !panel) return;
  widget.removeAttribute('hidden');
  panel.removeAttribute('hidden');
  switchWeatherTab(tab);
  // 天気データが未ロードなら取得
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

    // 予報
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
  // 画面端はみ出し防止
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
  document.querySelector('.main').classList.toggle('favorites-only', favoritesOnlyMode);
  const btn = document.getElementById('btn-favorites-only');
  if (!btn) return;
  if (favoritesOnlyMode) {
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
  favoritesOnlyMode = !favoritesOnlyMode;
  savePreferencesToFirestore();
  applyFavoritesOnlyMode();
}

// ========== セクションまとめてお気に入り ==========
function toggleSectionFavorite(catId, isPrivate = false) {
  const catCards = isPrivate
    ? privateCards.filter(c => c.sectionId === catId)
    : allCards.filter(c => c.category === catId);
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
  // セクション内の星ボタンと、セクション自体のまとめ星ボタンを更新
  catCards.forEach(card => {
    document.querySelectorAll(`.btn-favorite[data-id="${card.id}"]`).forEach(b => {
      const active = newFavs.includes(card.id);
      b.classList.toggle('active', active);
      b.innerHTML = `<i class="fa-${active ? 'solid' : 'regular'} fa-star"></i>`;
    });
  });
  // まとめ星ボタンの状態更新
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

// ========== 検索（イベント委任） ==========
function initSearch() {
  const searchInput = document.getElementById('search-input');
  const noResults   = document.getElementById('no-results');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    let total = 0;

    document.querySelectorAll('.category-section:not(#favorites-section)').forEach(section => {
      let visible = 0;
      section.querySelectorAll('.link-card').forEach(card => {
        const match = !q || card.querySelector('.card-label')?.textContent.toLowerCase().includes(q);
        card.classList.toggle('hidden', !match);
        if (match) visible++;
      });
      const countEl = section.querySelector('.category-count');
      if (countEl) countEl.textContent = `${visible} 件`;
      section.classList.toggle('hidden', visible === 0 && !!q);
      total += visible;
    });

    document.querySelectorAll('.external-card').forEach(card => {
      const match = !q || card.querySelector('.external-label')?.textContent.toLowerCase().includes(q);
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
  if (now < lockoutUntil) {
    document.getElementById('pin-error').textContent = `${Math.ceil((lockoutUntil - now) / 1000)}秒後に再試行してください`;
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
        failedAttempts = 0;
        closePinModal();
        enterEditMode();
      } else {
        failedAttempts++;
        if (failedAttempts >= 3) {
          lockoutUntil = Date.now() + 30000;
          failedAttempts = 0;
          document.getElementById('pin-error').textContent = '3回失敗。30秒後に再試行してください';
        } else {
          document.getElementById('pin-error').textContent = `PINが違います（残り${3 - failedAttempts}回）`;
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
const THEMES     = ['dark', 'glass', 'light', 'warm', 'night', 'wood'];
const FONTSIZES  = ['font-sm', 'font-md', 'font-lg', 'font-xl'];

function applyTheme(theme, save = true) {
  const t = theme || 'dark';
  document.body.setAttribute('data-theme', t);
  document.querySelectorAll('#theme-grid .theme-card').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === t);
  });
  // localStorage はフラッシュ防止キャッシュとして常に更新
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
  // localStorage はフラッシュ防止キャッシュとして常に更新
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
  allCards = INITIAL_CARDS.map((c, i) => ({ id: `init-${i}`, ...c }));
  renderAllSections();
  initSearch();
  renderFavorites();

  // お知らせリアクションを先行読み込み（ログイン不要）
  loadAllNoticeReactions();

  // 天気は即時取得（30分ごと更新）
  fetchAndRenderWeather();
  setInterval(fetchAndRenderWeather, 30 * 60 * 1000);

  // ===== 天気パネル タブ切り替え・閉じる =====
  document.getElementById('wpanel-close').addEventListener('click', closeWeatherPanel);
  document.getElementById('tab-radar').addEventListener('click', () => switchWeatherTab('radar'));
  document.getElementById('tab-solar').addEventListener('click', () => switchWeatherTab('solar'));

  // ===== 太陽光発電カード（イベント委譲） =====
  // data-solar-open 属性を持つ要素をどこでもクリックで天気パネルを開く
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

  // ===== サービスピッカー 閉じる =====
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
    await loadNotices();
    renderNotices(allNotices);
    subscribeCards(); // onSnapshot 開始（以降は自動更新）
  } catch (err) {
    console.error('Firestore エラー:', err);
  }

  // お気に入りのみ表示ボタン
  document.getElementById('btn-favorites-only').addEventListener('click', toggleFavoritesOnly);
  applyFavoritesOnlyMode();

  // ===== ニックネーム（ユーザー）モーダル =====
  document.getElementById('btn-user').addEventListener('click', () => showUsernameModal(true));
  updateUsernameDisplay();

  document.getElementById('username-submit').addEventListener('click', () => {
    const name = document.getElementById('username-input').value.trim();
    if (!name) { document.getElementById('username-input').focus(); return; }
    saveUsername(name);
    closeUsernameModal();
  });
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('username-submit').click();
  });
  document.getElementById('username-skip').addEventListener('click', closeUsernameModal);
  document.getElementById('username-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeUsernameModal();
  });

  // 初回訪問時にニックネームモーダルを表示
  if (!currentUsername) {
    setTimeout(() => showUsernameModal(false), 600);
    renderTodoSection(); // 非ログイン時は非表示にする
  } else {
    loadPersonalData(currentUsername);
  }

  // ===== TODO パネル =====
  document.getElementById('todo-toggle-btn').addEventListener('click', () => {
    todoCollapsed = !todoCollapsed;
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
  document.getElementById('email-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEmailModal();
  });
  document.getElementById('email-profile-save').addEventListener('click', saveEmailProfile);
  document.getElementById('email-profile-delete').addEventListener('click', deleteEmailProfile);
  document.getElementById('email-profile-add').addEventListener('click', addEmailProfile);
  document.getElementById('email-generate').addEventListener('click', generateEmailReply);
  document.getElementById('btn-copy-output').addEventListener('click', copyEmailOutput);
  document.getElementById('email-api-key-save').addEventListener('click', saveGeminiApiKey);
  // タブ切り替え
  document.querySelectorAll('.email-tab').forEach(btn => {
    btn.addEventListener('click', () => switchEmailTab(btn.dataset.tab));
  });
  // プロフィールタブ
  document.getElementById('ep-save').addEventListener('click', saveUserEmailProfile);
  document.getElementById('ep-reset-sig').addEventListener('click', resetSignatureTemplate);
  document.getElementById('ep-signature').addEventListener('input', e => updateSignaturePreview(e.target.value));

  // ===== チャットFAB =====
  document.getElementById('chat-fab').addEventListener('click', () => {
    chatPanelOpen ? closeChatPanel() : openChatPanel();
  });
  document.getElementById('chat-panel-close').addEventListener('click', closeChatPanel);
  document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // ===== ベル通知ボタン =====
  document.getElementById('btn-notice-bell').addEventListener('click', () => {
    const board = document.getElementById('notice-board');
    if (board) board.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (currentUsername) markAllNoticesRead();
  });

  // ===== プライベートセクションモーダル =====
  document.getElementById('private-section-cancel').addEventListener('click', closePrivateSectionModal);
  document.getElementById('private-section-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePrivateSectionModal();
  });

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
      if (editingPrivateSectionId) {
        await updatePrivateSection(editingPrivateSectionId, { label, icon, colorIndex: privateSectionColorIndex });
      } else {
        await addPrivateSection({ label, icon, colorIndex: privateSectionColorIndex, order: privateCategories.length });
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
    if (!editingPrivateSectionId) return;
    const cat = privateCategories.find(c => c.docId === editingPrivateSectionId);
    if (await confirmDelete(`「${cat?.label}」を削除しますか？（中のカードも全て削除されます）`)) {
      const sectionCards = privateCards.filter(c => c.sectionId === editingPrivateSectionId);
      await Promise.all(sectionCards.map(c => deletePrivateCard(c.id)));
      await deletePrivateSection(editingPrivateSectionId);
      closePrivateSectionModal();
      renderAllSections();
    }
  });

  // コンテキストメニューを閉じるグローバルリスナー
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
  document.getElementById('pin-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePinModal();
  });

  // ===== カード編集モーダル =====
  document.getElementById('card-cancel').addEventListener('click', closeCardModal);
  // 枠外クリックでは閉じない（意図しない操作防止）
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
      if (editingIsPrivate) {
        if (editingDocId) {
          await savePrivateCard(editingDocId, { label, icon: icon || 'fa-solid fa-star', url: url || '#' });
        } else {
          await addPrivateCard({
            label,
            icon: icon || 'fa-solid fa-star',
            url: url || '#',
            sectionId: editingPrivateSectionDocId,
            parentId: editingParentId || null,
          });
        }
      } else {
        const isStatic = !editingDocId || editingDocId.startsWith('init-');
        if (!isStatic) {
          const card = allCards.find(c => c.id === editingDocId);
          const updateData = { label, url };
          if (!card?.isExternalTool) updateData.icon = icon;
          await saveCard(editingDocId, updateData);
        } else {
          await addCard({
            label,
            icon:     icon || 'fa-solid fa-star',
            url:      url  || '#',
            category: editingCategory,
            parentId: editingParentId || null,
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
    if (editingIsPrivate) {
      const card = privateCards.find(c => c.id === editingDocId);
      if (!card) return;
      if (await confirmDelete(`「${card.label}」を削除しますか？`)) {
        await deletePrivateCard(editingDocId);
        closeCardModal();
      }
    } else {
      const card = allCards.find(c => c.id === editingDocId);
      if (!card) return;
      if (await confirmDelete(`「${card.label}」を削除しますか？`)) {
        await deleteCard(editingDocId);
        closeCardModal();
      }
    }
  });

  // ===== お知らせモーダル =====
  document.getElementById('notice-cancel').addEventListener('click', closeNoticeModal);
  document.getElementById('notice-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeNoticeModal();
  });

  document.getElementById('notice-save').addEventListener('click', async () => {
    const title = document.getElementById('notice-title').value.trim();
    const body  = document.getElementById('notice-body').value.trim();
    const priority = document.getElementById('notice-priority').value;
    if (!title) { document.getElementById('notice-title').focus(); return; }

    const btn = document.getElementById('notice-save');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      if (editingNoticeId) {
        await saveNotice(editingNoticeId, { title, body, priority });
      } else {
        await addNotice({ title, body, priority });
      }
      closeNoticeModal();
      renderNotices(allNotices);
    } catch (err) {
      console.error('お知らせ保存エラー:', err);
      alert('保存に失敗しました。');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存';
    }
  });

  document.getElementById('notice-delete').addEventListener('click', async () => {
    if (!editingNoticeId) return;
    const n = allNotices.find(x => x.id === editingNoticeId);
    if (await confirmDelete(`「${n?.title}」を削除しますか？`)) {
      await deleteNotice(editingNoticeId);
      closeNoticeModal();
      renderNotices(allNotices);
    }
  });

  // ===== カテゴリモーダル =====
  document.getElementById('cat-cancel').addEventListener('click', closeCategoryModal);
  document.getElementById('category-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCategoryModal();
  });

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
      if (editingCategoryId) {
        await updateCategoryInFirestore(editingCategoryId, { label, icon, colorIndex: selectedColorIndex });
      } else {
        const maxOrder = allCategories.length > 0 ? Math.max(...allCategories.map(c => c.order)) + 1 : 10;
        const newId = label.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') + '-' + Date.now();
        await addCategoryToFirestore({ id: newId, label, icon, colorIndex: selectedColorIndex, order: maxOrder, isExternal: false });
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
    if (!editingCategoryId) return;
    const cat = allCategories.find(c => c.docId === editingCategoryId);
    const hasCards = allCards.some(c => c.category === cat?.id);
    if (hasCards) {
      alert('このカテゴリにはカードがあります。先にカードを削除または移動してください。');
      return;
    }
    if (await confirmDelete(`「${cat?.label}」を削除しますか？`)) {
      await deleteCategoryFromFirestore(editingCategoryId);
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
});
