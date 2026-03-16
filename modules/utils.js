// ========== 共通ユーティリティ関数 ==========
// 全モジュールから利用される汎用関数

// HTML エスケープ
export function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// HTML エスケープ（null/undefined 対応版）
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 案件キー入力を軽く正規化（前後空白除去 + 連続空白を1つに統一）
export function normalizeProjectKey(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

// Firestore Timestamp をフォーマット
export function _fmtTs(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  const y = d.getFullYear(), mo = d.getMonth() + 1, day = d.getDate();
  const h = String(d.getHours()).padStart(2, '0'), mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${mo}/${day} ${h}:${mi}`;
}

// ユーザー名の頭文字から一貫したアバターカラーを生成
export function getUserAvatarColor(name) {
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

// getUserColor の別名（後方互換性用）
export const getUserColor = getUserAvatarColor;

// ファイルサイズの書式化
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let size = bytes;
  while (size >= 1024 && idx < units.length - 1) { size /= 1024; idx++; }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

// ファイルアイコン取得
export function getFileIcon(type) {
  if (!type) return 'fa-solid fa-file';
  if (type.startsWith('image/'))       return 'fa-solid fa-file-image';
  if (type.startsWith('video/'))       return 'fa-solid fa-file-video';
  if (type.startsWith('audio/'))       return 'fa-solid fa-file-audio';
  if (type.includes('pdf'))            return 'fa-solid fa-file-pdf';
  if (type.includes('zip') || type.includes('rar') || type.includes('tar'))
    return 'fa-solid fa-file-zipper';
  if (type.includes('word') || type.includes('document'))
    return 'fa-solid fa-file-word';
  if (type.includes('excel') || type.includes('sheet') || type.includes('csv'))
    return 'fa-solid fa-file-excel';
  if (type.includes('powerpoint') || type.includes('presentation'))
    return 'fa-solid fa-file-powerpoint';
  if (type.startsWith('text/'))        return 'fa-solid fa-file-lines';
  return 'fa-solid fa-file';
}

// 削除確認モーダル（Promise-based）
export function confirmDelete(message) {
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
