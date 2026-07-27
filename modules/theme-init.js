(function applyInitialAppearance() {
  let theme = 'dark';
  let fontSize = 'font-md';
  try {
    theme = localStorage.getItem('portal-theme') || theme;
    fontSize = localStorage.getItem('portal-font-size') || fontSize;
  } catch (_) {
    // Storageが使えない環境でも既定値で描画する。
  }

  const safeTheme = theme === 'light' ? 'light' : 'dark';
  const safeFontSize = ['font-sm', 'font-md', 'font-lg', 'font-xl'].includes(fontSize)
    ? fontSize
    : 'font-md';
  document.documentElement.classList.add(safeFontSize);
  document.documentElement.setAttribute('data-theme', safeTheme);

  document.addEventListener('DOMContentLoaded', function syncAppearanceToBody() {
    document.body.setAttribute('data-theme', safeTheme);
    document.documentElement.removeAttribute('data-theme');
  }, { once: true });
})();
