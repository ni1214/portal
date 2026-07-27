import domPurifyExport from 'dompurify';

document.documentElement.dataset.portalSecurity = 'initializing';

// The browser bundle exports an initialized instance; non-browser bundlers may
// expose the factory instead. Support both without weakening the policy.
const DOMPurify = typeof domPurifyExport?.sanitize === 'function'
  ? domPurifyExport
  : domPurifyExport(window);
document.documentElement.dataset.portalSecurity = 'purifier-ready';

const HTML_SANITIZE_CONFIG = Object.freeze({
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  ALLOW_ARIA_ATTR: true,
  ALLOW_DATA_ATTR: true,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'style'],
  FORBID_ATTR: ['srcdoc'],
  RETURN_TRUSTED_TYPE: false,
});

const PRINT_SANITIZE_CONFIG = Object.freeze({
  USE_PROFILES: { html: true },
  WHOLE_DOCUMENT: true,
  ALLOW_ARIA_ATTR: true,
  ALLOW_DATA_ATTR: true,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'style'],
  FORBID_ATTR: ['srcdoc'],
  RETURN_TRUSTED_TYPE: false,
});

let sanitizeDepth = 0;
function sanitizeHtml(value) {
  sanitizeDepth += 1;
  try {
    return DOMPurify.sanitize(String(value ?? ''), HTML_SANITIZE_CONFIG);
  } finally {
    sanitizeDepth -= 1;
  }
}

function sanitizePrintHtml(value) {
  sanitizeDepth += 1;
  try {
    return DOMPurify.sanitize(String(value ?? ''), PRINT_SANITIZE_CONFIG);
  } finally {
    sanitizeDepth -= 1;
  }
}

const purifierBootstrapProbe = sanitizeHtml('<b data-probe="ok">ok</b>');
if (!purifierBootstrapProbe.includes('data-probe="ok"')) {
  document.documentElement.dataset.portalSecurity = 'purifier-self-test-failed';
  throw new Error('Portal HTML purifier initialization failed.');
}

let createPrintHtml = sanitizePrintHtml;
let defaultPolicy = null;
if (window.trustedTypes) {
  defaultPolicy = window.trustedTypes.createPolicy('default', {
    createHTML: sanitizeHtml,
    createScript() {
      throw new TypeError('Dynamic script text is not permitted.');
    },
    createScriptURL() {
      throw new TypeError('Dynamic script URLs are not permitted.');
    },
  });
  const printPolicy = window.trustedTypes.createPolicy('portal-print', {
    createHTML: sanitizePrintHtml,
  });
  createPrintHtml = value => printPolicy.createHTML(String(value ?? ''));
}
document.documentElement.dataset.portalSecurity = 'policies-ready';

function sanitizeForHtmlSink(value) {
  if (typeof value !== 'string' || sanitizeDepth > 0) return value;
  return defaultPolicy ? defaultPolicy.createHTML(value) : sanitizeHtml(value);
}

function installSanitizingSetter(prototype, propertyName) {
  const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, propertyName);
  if (!descriptor?.get || !descriptor?.set || descriptor.configurable === false) return;
  Object.defineProperty(prototype, propertyName, {
    ...descriptor,
    set(value) {
      descriptor.set.call(this, sanitizeForHtmlSink(value));
    },
  });
}

installSanitizingSetter(window.Element?.prototype, 'innerHTML');
installSanitizingSetter(window.Element?.prototype, 'outerHTML');
installSanitizingSetter(window.ShadowRoot?.prototype, 'innerHTML');

const nativeInsertAdjacentHTML = window.Element?.prototype?.insertAdjacentHTML;
if (typeof nativeInsertAdjacentHTML === 'function') {
  Object.defineProperty(window.Element.prototype, 'insertAdjacentHTML', {
    configurable: true,
    enumerable: false,
    writable: true,
    value(position, value) {
      return nativeInsertAdjacentHTML.call(this, position, sanitizeForHtmlSink(value));
    },
  });
}

const sanitizerSelfTest = document.createElement('div');
sanitizerSelfTest.innerHTML = '<span data-portal-test="ok" aria-label="ok"><svg viewBox="0 0 1 1"><circle cx="0" cy="0" r="1"></circle></svg></span><a href="javascript:alert(1)">x</a><script>window.__portalUnsafe=1</script>';
const selfTestSpan = sanitizerSelfTest.querySelector('span');
const selfTestLink = sanitizerSelfTest.querySelector('a');
const selfTestFailures = [
  sanitizerSelfTest.querySelector('script') ? 'script' : '',
  selfTestLink?.hasAttribute('href') ? 'url' : '',
  selfTestSpan?.dataset.portalTest !== 'ok' ? 'data' : '',
  selfTestSpan?.getAttribute('aria-label') !== 'ok' ? 'aria' : '',
  !selfTestSpan?.querySelector('svg circle') ? 'svg' : '',
].filter(Boolean);
if (selfTestFailures.length) {
  document.documentElement.dataset.portalSecurity = `self-test-failed-${selfTestFailures.join('-')}`;
  throw new Error('Portal HTML sanitizer self-test failed.');
}

Object.defineProperty(window, 'DOMPurify', {
  value: DOMPurify,
  configurable: false,
  enumerable: false,
  writable: false,
});
Object.defineProperty(window, 'portalSecurity', {
  value: Object.freeze({ sanitizeHtml, createPrintHtml }),
  configurable: false,
  enumerable: false,
  writable: false,
});
document.documentElement.dataset.portalSecurity = 'ready';
