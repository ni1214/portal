import { state } from './state.js';
import { showToast } from './notify.js';
import { isSafeWebUrl, sanitizeIconIdentifier } from './utils.js';
import { requestAi } from './secure-api.js';

let deps = {};
let assistRequestSequence = 0;

const KNOWN_LINKS = [
  { keys: ['chatgpt', 'chat gpt', 'チャットgpt', 'チャットジーピーティー', 'openai'], label: 'ChatGPT', url: 'https://chatgpt.com/', icon: 'fa-solid fa-link' },
  { keys: ['claude', 'クロード', 'anthropic'], label: 'Claude', url: 'https://claude.ai/', icon: 'fa-solid fa-link' },
  { keys: ['gemini', 'ジェミニ'], label: 'Gemini', url: 'https://gemini.google.com/', icon: 'fa-solid fa-link' },
  { keys: ['notion', 'ノーション'], label: 'Notion', url: 'https://www.notion.so/', icon: 'svg:notion' },
  { keys: ['slack', 'スラック'], label: 'Slack', url: 'https://slack.com/', icon: 'svg:slack' },
  { keys: ['google drive', 'drive', 'グーグルドライブ', 'ドライブ'], label: 'Google Drive', url: 'https://drive.google.com/', icon: 'svg:gdrive' },
  { keys: ['box', 'ボックス'], label: 'Box', url: 'https://www.box.com/', icon: 'svg:box' },
  { keys: ['notebooklm', 'notebook lm', 'ノートブックlm'], label: 'NotebookLM', url: 'https://notebooklm.google.com/', icon: 'fa-solid fa-link' },
  { keys: ['github', 'ギットハブ'], label: 'GitHub', url: 'https://github.com/', icon: 'svg:github' },
  { keys: ['gmail', 'ジーメール'], label: 'Gmail', url: 'https://mail.google.com/', icon: 'svg:gmail' },
  { keys: ['teams', 'チームズ'], label: 'Teams', url: 'https://teams.microsoft.com/', icon: 'svg:teams' },
  { keys: ['zoom', 'ズーム'], label: 'Zoom', url: 'https://zoom.us/', icon: 'svg:zoom' },
  { keys: ['dropbox', 'ドロップボックス'], label: 'Dropbox', url: 'https://www.dropbox.com/', icon: 'svg:dropbox' },
  { keys: ['onedrive', 'ワンドライブ'], label: 'OneDrive', url: 'https://onedrive.live.com/', icon: 'svg:onedrive' },
  { keys: ['sharepoint', 'シェアポイント'], label: 'SharePoint', url: 'https://www.sharepoint.com/', icon: 'svg:sharepoint' },
  { keys: ['perplexity', 'パープレキシティ'], label: 'Perplexity', url: 'https://www.perplexity.ai/', icon: 'fa-solid fa-link' },
  { keys: ['genspark', 'ジェンスパーク'], label: 'Genspark', url: 'https://www.genspark.ai/', icon: 'fa-solid fa-link' },
  { keys: ['manus', 'マナス'], label: 'Manus', url: 'https://manus.im/', icon: 'fa-solid fa-link' },
];

export function initSharedLinkAi(d = {}) {
  deps = { ...deps, ...d };
  bindSharedLinkAiEvents();
}

export function resetSharedLinkAiAssist() {
  assistRequestSequence += 1;
  setBusy(false);
  setAiStatus();
}

function normalizeText(value) {
  return `${value || ''}`.normalize('NFKC').toLowerCase().trim();
}

function getPublicCategories() {
  return (state.allCategories || [])
    .filter(category => !category?.isPrivate)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function getDefaultCategoryId() {
  const categories = getPublicCategories();
  const selectedCategory = document.getElementById('shared-links-edit-category-select')?.value || '';
  if (categories.some(category => category.id === selectedCategory)) return selectedCategory;
  return categories.find(category => category.id === 'external')?.id || categories[0]?.id || 'external';
}

function extractUrl(text) {
  const match = `${text || ''}`.match(/https?:\/\/[^\s　"'<>]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s　"'<>]*)?/i);
  if (!match) return '';
  const raw = match[0].replace(/[、。),，）]+$/g, '');
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function findKnownLink(text) {
  const normalized = normalizeText(text).replace(/\s+/g, ' ');
  return KNOWN_LINKS.find(item => item.keys.some(key => normalized.includes(normalizeText(key)))) || null;
}

function guessLabelFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const first = host.split('.')[0] || '共有リンク';
    return first.charAt(0).toUpperCase() + first.slice(1);
  } catch (_) {
    return '共有リンク';
  }
}

function buildHeuristicSuggestion(text) {
  const known = findKnownLink(text);
  if (known) {
    return {
      label: known.label,
      url: known.url,
      category: getDefaultCategoryId(),
      icon: known.icon || 'fa-solid fa-link',
      description: '',
      reason: 'known',
    };
  }

  const url = extractUrl(text);
  if (url) {
    return {
      label: guessLabelFromUrl(url),
      url,
      category: getDefaultCategoryId(),
      icon: 'fa-solid fa-link',
      description: '',
      reason: 'url',
    };
  }

  return null;
}

function parseJsonFromModel(text) {
  const cleaned = `${text || ''}`.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AIの応答を読み取れませんでした。');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function buildAiSuggestion(text) {
  const categories = getPublicCategories().map(category => ({
    id: category.id,
    label: category.label,
  }));
  const prompt = `共有リンクを1件作成するため、入力文からリンク情報を推定してください。

入力文:
${text}

利用可能カテゴリ:
${JSON.stringify(categories, null, 2)}

必ず次のJSONだけを返してください。
{
  "label": "表示名。短く自然な名前",
  "url": "公式URL。https:// で始める",
  "category": "利用可能カテゴリのid。迷ったら external",
  "icon": "Font Awesome class。迷ったら fa-solid fa-link",
  "description": "用途が分かる短い日本語。20文字程度"
}

条件:
- 公式URLが明確な有名サービスは公式トップかログイン入口にしてください。
- URLが不明な場合は空文字ではなく、最も妥当な公式URLを推定してください。
- 説明文やMarkdownは不要です。`;

  return parseJsonFromModel(await requestAi('shared-link', prompt));
}

function sanitizeSuggestion(raw, sourceText) {
  const fallback = buildHeuristicSuggestion(sourceText);
  const categoryIds = new Set(getPublicCategories().map(category => category.id));
  const url = `${raw?.url || fallback?.url || extractUrl(sourceText) || ''}`.trim();
  const normalizedUrl = url && /^https?:\/\//i.test(url) ? url : (url ? `https://${url}` : '');
  const label = `${raw?.label || fallback?.label || guessLabelFromUrl(normalizedUrl)}`.trim().slice(0, 48);
  const category = categoryIds.has(raw?.category) ? raw.category : (fallback?.category || getDefaultCategoryId());
  const icon = sanitizeIconIdentifier(raw?.icon || fallback?.icon || 'fa-solid fa-link', 'fa-solid fa-link');
  const description = `${raw?.description || fallback?.description || ''}`.trim().slice(0, 80);

  if (!label || !isSafeWebUrl(normalizedUrl)) {
    throw new Error('リンク名またはURLを推定できませんでした。例: 「ChatGPTのリンクを作成して」');
  }

  return { label, url: normalizedUrl, category, icon, description };
}

function findExistingCard(suggestion) {
  const normalizedUrl = normalizeText(suggestion.url).replace(/\/$/, '');
  const normalizedLabel = normalizeText(suggestion.label);
  return (state.allCards || []).find(card => {
    const cardUrl = normalizeText(card.url).replace(/\/$/, '');
    return cardUrl === normalizedUrl || normalizeText(card.label) === normalizedLabel;
  }) || null;
}

function setAiStatus(message = '', type = '') {
  const status = document.getElementById('shared-link-ai-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
}

function setBusy(isBusy) {
  const button = document.getElementById('shared-link-ai-button');
  const input = document.getElementById('shared-link-ai-input');
  if (button) {
    button.disabled = isBusy;
    button.innerHTML = isBusy
      ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>確認中</span>'
      : '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>候補を入力</span>';
  }
  if (input) input.disabled = isBusy;
}

function fillSharedLinkForm(suggestion) {
  const labelInput = document.getElementById('edit-label');
  const urlInput = document.getElementById('edit-url');
  const categorySelect = document.getElementById('shared-links-edit-category-select');
  const iconInput = document.getElementById('edit-icon');
  const descriptionInput = document.getElementById('edit-description');

  if (labelInput) labelInput.value = suggestion.label;
  if (urlInput) {
    urlInput.value = suggestion.url;
    urlInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (
    categorySelect
    && !categorySelect.disabled
    && [...categorySelect.options].some(option => option.value === suggestion.category)
  ) {
    categorySelect.value = suggestion.category;
    categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (iconInput) {
    iconInput.value = suggestion.icon;
    iconInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (descriptionInput && suggestion.description && !descriptionInput.value.trim()) {
    descriptionInput.value = suggestion.description;
  }
}

async function assistSharedLinkForm() {
  const input = document.getElementById('shared-link-ai-input');
  const text = input?.value.trim() || '';
  if (!text) {
    input?.focus();
    setAiStatus('入力を手伝ってほしいサービス名やURLを入力してください。', 'warning');
    return;
  }

  const requestId = ++assistRequestSequence;
  const cardModal = document.getElementById('card-modal');
  const editSession = cardModal?.dataset.editSession || '';
  const isCurrentRequest = () =>
    requestId === assistRequestSequence
    && Boolean(editSession)
    && cardModal?.dataset.editSession === editSession
    && cardModal.classList.contains('visible')
    && !state.editingDocId
    && !state.editingIsPrivate;

  setBusy(true);
  setAiStatus('リンク情報を推定しています...', '');
  try {
    await deps.ensureSharedCardsLoaded?.();
    const heuristic = buildHeuristicSuggestion(text);
    const rawSuggestion = heuristic || await buildAiSuggestion(text);
    if (!isCurrentRequest()) return;
    if (!rawSuggestion) {
      throw new Error('リンク情報を推定できませんでした。URLを含めてもう一度お試しください。');
    }

    const suggestion = sanitizeSuggestion(rawSuggestion, text);
    const existing = findExistingCard(suggestion);
    if (existing) {
      setAiStatus(`既に「${existing.label}」が登録されています。`, 'warning');
      showToast('同じリンクが既に登録されています。', 'warning');
      return;
    }

    fillSharedLinkForm(suggestion);
    if (input) input.value = '';
    setAiStatus('候補を入力しました。内容を確認して「保存」を押してください。', 'success');
    showToast('リンク情報の候補を入力しました。', 'success');
  } catch (err) {
    if (!isCurrentRequest()) return;
    console.error('共有リンクAI入力補助エラー:', err);
    setAiStatus(err?.message || 'リンク情報を入力できませんでした。', 'error');
    showToast(err?.message || 'リンク情報を入力できませんでした。', 'error');
  } finally {
    if (requestId === assistRequestSequence) setBusy(false);
  }
}

function bindSharedLinkAiEvents() {
  const input = document.getElementById('shared-link-ai-input');
  const button = document.getElementById('shared-link-ai-button');
  if (button && !button.dataset.bound) {
    button.dataset.bound = '1';
    button.addEventListener('click', () => {
      void assistSharedLinkForm();
    });
  }
  if (input && !input.dataset.bound) {
    input.dataset.bound = '1';
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void assistSharedLinkForm();
      }
    });
  }
}
