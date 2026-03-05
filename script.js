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

// ========== SVG アイコンマッピング ==========
const SVG_ICONS = {
  'svg:notion': `<svg viewBox="0 0 100 100" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.017 4.313l55.333 -4.087c6.797 -0.583 8.543 -0.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277 -1.553 6.807 -6.99 7.193L24.467 99.967c-4.08 0.193 -6.023 -0.39 -8.16 -3.113L3.3 79.94c-2.333 -3.113 -3.3 -5.443 -3.3 -8.167V11.113c0 -3.497 1.553 -6.413 6.017 -6.8z" fill="#fff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M61.35 0.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.723 0.967 5.053 3.3 8.167l12.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257 -3.89c5.433 -0.387 6.99 -2.917 6.99 -7.193V20.64c0 -2.21 -0.873 -2.847 -3.443 -4.733L74.167 3.143C69.893 0.037 68.147 -0.357 61.35 0.227zM25.505 19.463c-5.357 0.388 -6.57 0.477 -9.61 -1.853l-6.423 -5.053c-0.97 -0.78 -0.453 -1.747 1.167 -1.94l52.55 -3.887c4.857 -0.387 7.3 1.167 9.053 2.527l7.88 5.733c0.387 0.387 1.36 1.36 0.193 1.36l-54.42 3.307 -0.39 -0.193zM19.803 88.3V30.367c0 -2.53 0.777 -3.697 3.103 -3.893L86 23.127c2.14 -0.193 3.107 1.167 3.107 3.693v57.547c0 2.53 -0.39 4.667 -3.883 4.857l-60.377 3.5c-3.493 0.193 -5.043 -0.97 -5.043 -4.423zM78.96 33.667c0.387 1.75 0 3.5 -1.75 3.7l-2.917 0.577v42.773c-2.527 1.36 -4.853 2.14 -6.797 2.14 -3.107 0 -3.883 -0.973 -6.21 -3.887l-19.03 -29.94v28.967l6.077 1.36s0 3.5 -4.853 3.5l-13.39 0.777c-0.39 -0.78 0 -2.723 1.357 -3.11l3.497 -0.97v-38.3L30.48 40.667c-0.39 -1.75 0.58 -4.277 3.3 -4.473l14.367 -0.967 19.8 30.327v-26.83l-5.047 -0.58c-0.39 -2.143 1.163 -3.7 3.103 -3.89l13.957 -0.587z" fill="#000"/></svg>`,
  'svg:slack': `<svg viewBox="0 0 127 127" width="40" height="40" xmlns="http://www.w3.org/2000/svg"><path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A"/><path d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36C5F0"/><path d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z" fill="#2EB67D"/><path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E"/></svg>`,
  'svg:gdrive': `<svg viewBox="0 0 87.3 78" width="40" height="40" xmlns="http://www.w3.org/2000/svg"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-20.4 35.3c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-10.1-17.5c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 23.8h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>`
};

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
    allCategories = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
  }
}

function subscribeCards() {
  if (unsubscribeCards) unsubscribeCards();
  const q = query(collection(db, 'cards'), orderBy('categoryOrder'), orderBy('order'));
  unsubscribeCards = onSnapshot(q, snapshot => {
    allCards = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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
    cards.forEach(c => grid.appendChild(buildExternalCard(c)));
    if (isEditMode) grid.appendChild(buildAddButton(cat.id));
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
  a.href = isEditMode ? '#' : (card.url || '#');
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

function buildExternalCard(card) {
  const a = document.createElement('a');

  if (card.url === 'solar:open') {
    a.href = '#';
    a.addEventListener('click', e => { e.preventDefault(); openSolarOverlay(); });
  } else {
    a.href = isEditMode ? '#' : (card.url || '#');
    if (!isEditMode) a.target = '_blank';
  }

  const specificClass = {
    'svg:notion': 'external-notion',
    'svg:slack':  'external-slack',
    'svg:gdrive': 'external-gdrive'
  }[card.icon] || '';
  a.className = `external-card ${specificClass}`.trim();
  a.dataset.docId = card.id;

  const iconHtml = card.icon && card.icon.startsWith('svg:')
    ? (SVG_ICONS[card.icon] || '')
    : `<i class="${card.icon || 'fa-solid fa-link'}" style="font-size:2rem"></i>`;

  a.innerHTML = `<div class="external-icon">${iconHtml}</div><span class="external-label">${esc(card.label)}</span>`;

  if (isEditMode) {
    a.appendChild(buildEditOverlay(card));
    a.addEventListener('click', e => e.preventDefault());
  }
  return a;
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
  document.getElementById('edit-icon-group').style.display = isSVG ? 'none' : '';

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
  el.innerHTML = iconClass.startsWith('svg:')
    ? '<span style="font-size:0.65rem;opacity:0.5">SVG</span>'
    : `<i class="${iconClass}"></i>`;
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

// ========== 太陽光オーバーレイ ==========
function openSolarOverlay() {
  const overlay = document.getElementById('solar-overlay');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeSolarOverlay() {
  document.getElementById('solar-overlay').hidden = true;
  document.body.style.overflow = '';
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
  if (hi >= 40) return { level: 'danger',    label: '危険',    color: '#ff5ea0' };
  if (hi >= 35) return { level: 'warning',   label: '厳重警戒', color: '#ff8c42' };
  if (hi >= 31) return { level: 'caution',   label: '警戒',    color: '#e6c800' };
  if (hi >= 28) return { level: 'attention', label: '注意',    color: '#00d4aa' };
  return { level: 'safe', label: 'ほぼ安全', color: 'rgba(255,255,255,0.3)' };
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
      <div class="heat-badge" style="background:${heat.color};color:${heat.level==='caution'?'#333':'#fff'}">
        <i class="fa-solid fa-sun"></i> 熱中症危険度: ${heat.label}
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

  // 雨雲レーダーボタン
  document.getElementById('toggle-radar')?.addEventListener('click', () => {
    const wrap = document.getElementById('weather-radar');
    const btn = document.getElementById('toggle-radar');
    const frame = document.getElementById('windy-frame');
    if (wrap.hidden) {
      if (!frame.src) {
        frame.src = `https://embed.windy.com/embed2.html?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&detailLat=${WEATHER_LAT}&detailLon=${WEATHER_LON}&zoom=9&level=surface&overlay=rain&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;
      }
      wrap.hidden = false;
      btn.innerHTML = '<i class="fa-solid fa-map"></i> 雨雲レーダーを非表示';
    } else {
      wrap.hidden = true;
      btn.innerHTML = '<i class="fa-solid fa-map"></i> 雨雲レーダーを表示';
    }
  });

  // 太陽光オーバーレイ閉じる
  document.getElementById('solar-close')?.addEventListener('click', closeSolarOverlay);
  document.getElementById('solar-overlay')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSolarOverlay();
  });

  // Firestore 読み込み
  try {
    await migrateIfNeeded();
    await migrateCategories();
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
  document.getElementById('card-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCardModal();
  });
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
