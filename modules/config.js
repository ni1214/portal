// ========== Firebase Imports ==========
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, doc,
  getDocs, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  query, where, orderBy, limit, writeBatch, serverTimestamp, onSnapshot,
  arrayUnion, arrayRemove, deleteField
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
export const db = getFirestore(app);

// Re-export Firestore functions for use by all modules
export {
  collection, doc,
  getDocs, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  query, where, orderBy, limit, writeBatch, serverTimestamp, onSnapshot,
  arrayUnion, arrayRemove, deleteField
};

// ========== 天気設定 ==========
export const WEATHER_API_KEY = '4131c5bca956c19b2b60b014b4045c12';
export const WEATHER_LAT = 36.3219;
export const WEATHER_LON = 139.0033;

// ========== アイコン: Google ファビコン API で公式ブランドアイコンを取得 ==========
const _fav = d =>
  `<img src="https://www.google.com/s2/favicons?domain=${d}&sz=128" loading="lazy" alt="${d}">`;

export const SVG_ICONS = {
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
export const PRESET_SERVICES = [
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
export const CATEGORY_COLORS = [
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
export const ICON_PICKER_LIST = [
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
  { icon: 'fa-solid fa-print',               label: '印刷' },
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
export const DEFAULT_CATEGORIES = [
  { id: 'external',    label: '外部ツール', icon: 'fa-solid fa-arrow-up-right-from-square', colorIndex: 0, order: 0, isExternal: true },
  { id: 'management',  label: '管理・報告', icon: 'fa-solid fa-clipboard-check',            colorIndex: 1, order: 1 },
  { id: 'arrangement', label: '手配・製作', icon: 'fa-solid fa-gears',                      colorIndex: 2, order: 2 },
  { id: 'hardware',    label: '金物・在庫', icon: 'fa-solid fa-cubes',                      colorIndex: 3, order: 3 },
  { id: 'materials',   label: '資材・設計', icon: 'fa-solid fa-drafting-compass',           colorIndex: 4, order: 4 },
  { id: 'others',      label: 'その他',     icon: 'fa-solid fa-ellipsis',                   colorIndex: 5, order: 5 },
];

// ========== 初期データ（Firestore 読み込み前の表示用） ==========
export const INITIAL_CARDS = [
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
