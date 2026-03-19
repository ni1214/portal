// ===== notify.js — ポータル内通知システム =====
// alert() → showToast()  /  confirm() → showConfirm()

let _toastContainer = null;

function getToastContainer() {
  if (!_toastContainer || !document.body.contains(_toastContainer)) {
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'notify-toast-container';
    document.body.appendChild(_toastContainer);
  }
  return _toastContainer;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function removeToast(toast) {
  toast.classList.remove('notify-toast--show');
  toast.classList.add('notify-toast--hide');
  setTimeout(() => toast.remove(), 300);
}

const ICONS = {
  info:    'circle-info',
  success: 'circle-check',
  error:   'circle-xmark',
  warning: 'triangle-exclamation',
};

/**
 * トースト通知を表示する（alert() の代替）
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} type
 * @param {number} duration - ms (0 = 手動閉じのみ)
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `notify-toast notify-toast--${type}`;
  toast.innerHTML = `
    <i class="fa-solid fa-${ICONS[type] || ICONS.info} notify-toast-icon"></i>
    <span class="notify-toast-msg">${escHtml(message)}</span>
    <button class="notify-toast-close" aria-label="閉じる"><i class="fa-solid fa-xmark"></i></button>
  `;
  toast.querySelector('.notify-toast-close').addEventListener('click', () => removeToast(toast));
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('notify-toast--show'));
  if (duration > 0) setTimeout(() => removeToast(toast), duration);
  return toast;
}

/**
 * 確認ダイアログを表示する（confirm() の代替）
 * @param {string} message
 * @param {{ okLabel?: string, cancelLabel?: string, danger?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, { okLabel = 'OK', cancelLabel = 'キャンセル', danger = false } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'notify-confirm-overlay';
    overlay.innerHTML = `
      <div class="notify-confirm-dialog modal-glass" role="dialog" aria-modal="true">
        <div class="notify-confirm-msg">${escHtml(message)}</div>
        <div class="notify-confirm-btns">
          <button class="btn-modal-secondary notify-confirm-cancel">${escHtml(cancelLabel)}</button>
          <button class="${danger ? 'btn-modal-danger' : 'btn-modal-primary'} notify-confirm-ok">${escHtml(okLabel)}</button>
        </div>
      </div>
    `;

    const closeWith = result => {
      overlay.classList.remove('notify-confirm-overlay--show');
      setTimeout(() => { overlay.remove(); resolve(result); }, 200);
    };

    overlay.querySelector('.notify-confirm-ok').addEventListener('click', () => closeWith(true));
    overlay.querySelector('.notify-confirm-cancel').addEventListener('click', () => closeWith(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) closeWith(false); });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('notify-confirm-overlay--show'));
  });
}
