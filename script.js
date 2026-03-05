// ========== Firebase Imports ==========
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, doc,
  getDocs, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  query, orderBy, writeBatch, serverTimestamp, onSnapshot
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
let isEditMode = false;
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
  const catCards = allCards.filter(c => c.category === data.category);
  const maxOrder = catCards.length > 0 ? Math.max(...catCards.map(c => c.order)) + 1 : 0;
  const catDef = allCategories.find(c => c.id === data.category);
  const newData = {
    ...data,
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
  const main = document.querySelector('.main');
  const noResults = document.getElementById('no-results');
  main.querySelectorAll('.category-section:not(#favorites-section), .external-tools, .btn-add-category-wrap').forEach(el => el.remove());

  const sorted = [...allCategories].sort((a, b) => a.order - b.order);
  sorted.forEach(cat => {
    const catCards = allCards
      .filter(c => c.category === cat.id)
      .sort((a, b) => a.order - b.order);
    main.insertBefore(buildSection(cat, catCards), noResults);
  });

  if (isEditMode) {
    const addCatBtn = document.createElement('div');
    addCatBtn.className = 'btn-add-category-wrap';
    addCatBtn.innerHTML = '<button class="btn-add-category"><i class="fa-solid fa-plus"></i> カテゴリを追加</button>';
    addCatBtn.querySelector('button').addEventListener('click', () => openCategoryModal(null));
    main.insertBefore(addCatBtn, noResults);
  }
}

function buildSection(cat, cards) {
  const section = document.createElement('section');
  const gradient = getCategoryGradient(cat);

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
    // 太陽光カードは常に先頭固定（Firestoreのsolar:openカードは除外して重複を防ぐ）
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
  } else {
    section.className = `category-section`;
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
    cards.forEach(c => grid.appendChild(buildLinkCard(c, false, gradient)));
    if (isEditMode) grid.appendChild(buildAddButton(cat.id));
  }

  if (isEditMode) {
    const editBtn = section.querySelector('.btn-edit-category');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const catObj = allCategories.find(c => c.docId === editBtn.dataset.docid || c.id === cat.id);
        openCategoryModal(catObj);
      });
    }
  }

  return section;
}

function buildLinkCard(card, isFav = false, gradient = '') {
  const a = document.createElement('a');
  if (card.url === 'solar:open') {
    a.href = '#';
    a.dataset.solarOpen = '1';
  } else {
    a.href = isEditMode ? '#' : (card.url || '#');
    if (!isEditMode) a.target = '_blank';
  }
  a.className = 'link-card';
  a.dataset.docId = card.id;

  const iconHtml = card.icon && card.icon.startsWith('svg:')
    ? (SVG_ICONS[card.icon] || '')
    : `<i class="${card.icon || 'fa-solid fa-link'}"></i>`;

  const favs = getFavorites();
  const isFavorited = favs.includes(card.id);
  const starBtn = `<button class="btn-favorite${isFavorited ? ' active' : ''}" data-id="${card.id}" title="お気に入り"><i class="fa-${isFavorited ? 'solid' : 'regular'} fa-star"></i></button>`;

  a.innerHTML = `
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

  if (isEditMode && !isFav) {
    a.appendChild(buildEditOverlay(card));
    a.addEventListener('click', e => e.preventDefault());
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
  } else if (isEditMode) {
    a.href = '#';
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

  if (isEditMode) {
    const edit = document.createElement('button');
    edit.className = 'ext-icon-edit';
    edit.title = '編集';
    edit.innerHTML = '<i class="fa-solid fa-pen"></i>';
    edit.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openCardModal(card.id);
    });
    wrap.appendChild(edit);

    const del = document.createElement('button');
    del.className = 'ext-icon-delete';
    del.title = '削除';
    del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm(`「${card.label}」を削除しますか？`)) await deleteCard(card.id);
    });
    wrap.appendChild(del);
  }
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
    if (confirm(`「${card.label}」を削除しますか？`)) {
      await deleteCard(card.id);
    }
  });
  return overlay;
}

function buildAddButton(categoryId) {
  const btn = document.createElement('button');
  btn.className = 'btn-add-card';
  btn.innerHTML = '<i class="fa-solid fa-plus"></i><span>カードを追加</span>';
  btn.addEventListener('click', () => openCardModal(null, categoryId));
  return btn;
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
  try { return JSON.parse(localStorage.getItem('portal-favorites') || '[]'); }
  catch { return []; }
}

function setFavorites(ids) {
  localStorage.setItem('portal-favorites', JSON.stringify(ids));
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
  if (!favIds.length) { section.hidden = true; return; }
  const cards = favIds.map(id => allCards.find(c => c.id === id)).filter(Boolean);
  if (!cards.length) { section.hidden = true; return; }
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

  board.innerHTML = `
    <div class="notice-header">
      <i class="fa-solid fa-bullhorn"></i>
      <span>お知らせ</span>
      ${addBtn}
    </div>
    <div class="notice-list" id="notice-list"></div>
  `;

  if (isEditMode) {
    board.querySelector('.btn-add-notice').addEventListener('click', () => openNoticeModal(null));
  }

  const list = board.querySelector('#notice-list');
  notices.forEach(n => {
    const item = document.createElement('div');
    item.className = `notice-item${n.priority === 'urgent' ? ' urgent' : ''}`;
    const dateStr = n.createdAt?.toDate
      ? n.createdAt.toDate().toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
      : '';
    const editBtns = isEditMode
      ? `<button class="btn-notice-edit" data-id="${n.id}"><i class="fa-solid fa-pen"></i></button>`
      : '';
    item.innerHTML = `
      <div class="notice-item-header">
        <span class="notice-badge ${n.priority === 'urgent' ? 'badge-urgent' : 'badge-normal'}">${n.priority === 'urgent' ? '重要' : 'お知らせ'}</span>
        <span class="notice-title">${esc(n.title || '')}</span>
        <span class="notice-date">${dateStr}</span>
        ${editBtns}
      </div>
      ${n.body ? `<div class="notice-body">${esc(n.body)}</div>` : ''}
    `;
    if (isEditMode) {
      item.querySelector('.btn-notice-edit').addEventListener('click', () => openNoticeModal(n));
    }
    list.appendChild(item);
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
function openCardModal(docId, categoryId = null) {
  editingDocId = docId;
  editingCategory = categoryId;

  const card = docId ? allCards.find(c => c.id === docId) : null;
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

// ========== 初期化 ==========
document.addEventListener('DOMContentLoaded', async () => {
  updateClock();
  setInterval(updateClock, 1000);

  // まず初期データで即時描画
  allCards = INITIAL_CARDS.map((c, i) => ({ id: `init-${i}`, ...c }));
  renderAllSections();
  initSearch();
  renderFavorites();

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

  // ===== FAB ボタン =====
  document.getElementById('admin-fab').addEventListener('click', async () => {
    if (isEditMode) { exitEditMode(); return; }
    const pinSet = await isPINConfigured();
    openPinModal(!pinSet);
  });

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
        });
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
    const card = allCards.find(c => c.id === editingDocId);
    if (!card) return;
    if (confirm(`「${card.label}」を削除しますか？`)) {
      await deleteCard(editingDocId);
      closeCardModal();
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
    if (confirm(`「${n?.title}」を削除しますか？`)) {
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
    if (confirm(`「${cat?.label}」を削除しますか？`)) {
      await deleteCategoryFromFirestore(editingCategoryId);
      closeCategoryModal();
      renderAllSections();
    }
  });
});
