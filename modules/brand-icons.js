const BRAND_ICON_SERVICES = Object.freeze([
  {
    key: 'notebooklm',
    label: 'NotebookLM',
    faviconDomain: 'notebooklm.google.com',
    domains: ['notebooklm.google.com', 'notebooklm.google'],
    keywords: ['notebooklm', 'notebook lm', 'notebook-lm'],
  },
  {
    key: 'claude',
    label: 'Claude',
    faviconDomain: 'claude.ai',
    domains: ['claude.ai', 'claude.com', 'anthropic.com'],
    keywords: ['claude', 'anthropic', '\u30af\u30ed\u30fc\u30c9'],
  },
  {
    key: 'gemini',
    label: 'Gemini',
    faviconDomain: 'gemini.google.com',
    domains: ['gemini.google.com', 'gemini.google', 'bard.google.com', 'ai.google.dev'],
    keywords: ['gemini', '\u30b8\u30a7\u30df\u30cb'],
  },
  {
    key: 'manus',
    label: 'Manus',
    faviconDomain: 'manus.im',
    domains: ['manus.im', 'manus.is'],
    keywords: ['manus', '\u30de\u30ca\u30b9'],
  },
  {
    key: 'genspark',
    label: 'Genspark',
    faviconDomain: 'genspark.ai',
    domains: ['genspark.ai', 'genspark.im'],
    keywords: ['genspark', 'gen spark'],
  },
  {
    key: 'ledge-ai',
    label: 'Ledge.ai',
    faviconDomain: 'ledge.ai',
    domains: ['ledge.ai'],
    keywords: ['ledge.ai', 'ledge ai'],
  },
  {
    key: 'chatgpt',
    label: 'ChatGPT',
    faviconDomain: 'chatgpt.com',
    domains: ['chatgpt.com', 'chat.openai.com', 'openai.com'],
    keywords: ['chatgpt', 'chat gpt', 'openai'],
  },
  {
    key: 'github',
    label: 'GitHub',
    faviconDomain: 'github.com',
    domains: ['github.com'],
    keywords: ['github', 'git hub', '\u30ae\u30c3\u30c8\u30cf\u30d6'],
  },
  {
    key: 'slack',
    label: 'Slack',
    faviconDomain: 'slack.com',
    domains: ['slack.com'],
    keywords: ['slack', '\u30b9\u30e9\u30c3\u30af'],
  },
  {
    key: 'google-drive',
    label: 'Google Drive',
    faviconDomain: 'drive.google.com',
    domains: ['drive.google.com'],
    keywords: ['google drive', '\u30b0\u30fc\u30b0\u30eb\u30c9\u30e9\u30a4\u30d6'],
  },
  {
    key: 'box',
    label: 'Box',
    faviconDomain: 'box.com',
    domains: ['box.com'],
    keywords: ['box', '\u30dc\u30c3\u30af\u30b9'],
  },
  {
    key: 'perplexity',
    label: 'Perplexity',
    faviconDomain: 'perplexity.ai',
    domains: ['perplexity.ai'],
    keywords: ['perplexity', '\u30d1\u30fc\u30d7\u30ec\u30ad\u30b7\u30c6\u30a3'],
  },
  {
    key: 'copilot',
    label: 'Copilot',
    faviconDomain: 'copilot.microsoft.com',
    domains: ['copilot.microsoft.com', 'bing.com'],
    keywords: ['copilot', 'microsoft copilot'],
  },
]);

const GENERIC_ICON_CLASSES = new Set([
  '',
  'fa-solid fa-link',
  'fa-solid fa-star',
  'fa-regular fa-star',
  'fa-solid fa-globe',
  'fa-solid fa-arrow-up-right-from-square',
]);

function escapeAttr(value) {
  return `${value ?? ''}`.replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function normalizeText(value) {
  return `${value || ''}`.normalize('NFKC').toLowerCase().trim();
}

function normalizeHost(value) {
  return `${value || ''}`.toLowerCase().replace(/^www\./, '');
}

function hostMatches(host, domain) {
  const normalizedHost = normalizeHost(host);
  const normalizedDomain = normalizeHost(domain);
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function getCardUrl(card) {
  return `${card?.url || ''}`.trim();
}

function getCardHost(card) {
  const rawUrl = getCardUrl(card);
  if (!rawUrl || rawUrl === '#' || rawUrl === 'solar:open') return '';

  try {
    return normalizeHost(new URL(rawUrl).hostname);
  } catch (_) {
    try {
      return normalizeHost(new URL(rawUrl, 'https://portal.local').hostname);
    } catch (__) {
      return normalizeHost(rawUrl.replace(/^https?:\/\//i, '').split('/')[0]);
    }
  }
}

export function getBrandIconService(card) {
  const host = getCardHost(card);
  const label = normalizeText(card?.label);
  const icon = normalizeText(card?.icon);
  const url = normalizeText(getCardUrl(card));
  const haystack = `${label} ${icon} ${url}`;

  return BRAND_ICON_SERVICES.find(service => {
    if (host && service.domains.some(domain => hostMatches(host, domain))) return true;
    return service.keywords.some(keyword => haystack.includes(normalizeText(keyword)));
  }) || null;
}

export function isGenericIcon(icon) {
  return GENERIC_ICON_CLASSES.has(normalizeText(icon));
}

export function shouldPreferBrandIcon(card) {
  if (!card) return false;
  const service = getBrandIconService(card);
  if (!service) return false;
  return isGenericIcon(card.icon) || `${card.icon || ''}`.startsWith('svg:') || Boolean(card.isExternalTool);
}

export function buildBrandIconHtml(service, className = 'brand-icon-img') {
  if (!service) return '';
  const domain = escapeAttr(service.faviconDomain);
  const label = escapeAttr(service.label);
  const cls = escapeAttr(className);
  return `<img class="${cls}" src="https://www.google.com/s2/favicons?domain=${domain}&sz=128" loading="lazy" alt="${label}">`;
}

export function getBrandIconHtmlForCard(card, className = 'brand-icon-img') {
  const service = getBrandIconService(card);
  return service ? buildBrandIconHtml(service, className) : '';
}

export function getAutoIconForCard(card) {
  const service = getBrandIconService(card);
  return service ? `brand:${service.key}` : '';
}
