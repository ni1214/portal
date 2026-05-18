import { state } from './state.js';
import { showToast } from './notify.js';
import { fetchPortalConfigFromSupabase, isSupabaseSharedCoreEnabled } from './supabase.js';
import { db, doc, getDoc } from './config.js';

let deps = {};
let geminiApiKey = '';
let geminiLoaded = false;
let isCreating = false;

const KNOWN_LINKS = [
  { keys: ['chatgpt', 'chat gpt', 'チャットgpt', 'チャットジーピーティー', 'openai'], label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { keys: ['claude', 'クロード', 'anthropic'], label: 'Claude', url: 'https://claude.ai/' },
  { keys: ['gemini', 'ジェミニ'], label: 'Gemini', url: 'https://gemini.google.com/' },
  { keys: ['notion', 'ノーション'], label: 'Notion', url: 'https://www.notion.so/' },
  { keys: ['slack', 'スラック'], label: 'Slack', url: 'https://slack.com/' },
  { keys: ['google drive', 'drive', 'グーグルドライブ', 'ドライブ'], label: 'Google Drive', url: 'https://drive.google.com/' },
  { keys: ['box', 'ボックス'], label: 'Box', url: 'https://www.box.com/' },
  { keys: ['notebooklm', 'notebook lm', 'ノートブックlm'], label: 'NotebookLM', url: 'https://notebooklm.google.com/' },
  { keys: ['github', 'ギットハブ'], label: 'GitHub', url: 'https://github.com/' },
  { keys: ['gmail', 'ジーメール'], label: 'Gmail', url: 'https://mail.google.com/' },
  { keys: ['teams', 'チームズ'], label: 'Teams', url: 'https://teams.microsoft.com/' },
  { keys: ['zoom', 'ズーム'], label: 'Zoom', url: 'https://zoom.us/' },
  { keys: ['dropbox', 'ドロップボックス'], label: 'Dropbox', url: 'https://www.dropbox.com/' },
  { keys: ['onedrive', 'ワンドライブ'], label: 'OneDrive', url: 'https://onedrive.live.com/' },
  { keys: ['sharepoint', 'シェアポイント'], label: 'SharePoint', url: 'https://www.sharepoint.com/' },
  { keys: ['perplexity', 'パープレキシティ'], label: 'Perplexity', url: 'https://www.perplexity.ai/' },
  { keys: ['genspark', 'ジェンスパーク'], label: 'Genspark', url: 'https://www.genspark.ai/' },
  { keys: ['manus', 'マナス'], label: 'Manus', url: 'https://manus.im/' },
];

export function initSharedLinkAi(d = {}) {
  deps = { ...deps, ...d };
  bindSharedLinkAiEvents();
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
      icon: 'fa-solid fa-link',
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
      reason: 'url',
    };
  }

  return null;
}

async function loadGeminiApiKey() {
  if (geminiLoaded) return geminiApiKey;
  geminiLoaded = true;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      const config = await fetchPortalConfigFromSupabase();
      geminiApiKey = config.geminiApiKey || '';
    } else {
      const snap = await getDoc(doc(db, 'portal', 'config'));
      geminiApiKey = snap.data()?.geminiApiKey || '';
    }
  } catch (err) {
    console.error('Gemini APIキーの読み込みに失敗しました:', err);
  }
  return geminiApiKey;
}

function parseJsonFromModel(text) {
  const cleaned = `${text || ''}`.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AIの応答を読み取れませんでした。');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function buildAiSuggestion(text) {
  const key = await loadGeminiApiKey();
  if (!key) return null;

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
  "icon": "Font Awesome class。迷ったら fa-solid fa-link"
}

条件:
- 公式URLが明確な有名サービスは公式トップかログイン入口にしてください。
- URLが不明な場合は空文字ではなく、最も妥当な公式URLを推定してください。
- 説明文やMarkdownは不要です。`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
      }),
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `AI生成に失敗しました。HTTP ${res.status}`);
  }
  const data = await res.json();
  return parseJsonFromModel(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

function sanitizeSuggestion(raw, sourceText) {
  const fallback = buildHeuristicSuggestion(sourceText);
  const categoryIds = new Set(getPublicCategories().map(category => category.id));
  const url = `${raw?.url || fallback?.url || extractUrl(sourceText) || ''}`.trim();
  const normalizedUrl = url && /^https?:\/\//i.test(url) ? url : (url ? `https://${url}` : '');
  const label = `${raw?.label || fallback?.label || guessLabelFromUrl(normalizedUrl)}`.trim().slice(0, 48);
  const category = categoryIds.has(raw?.category) ? raw.category : (fallback?.category || getDefaultCategoryId());
  const icon = `${raw?.icon || fallback?.icon || 'fa-solid fa-link'}`.trim();

  if (!label || !normalizedUrl) {
    throw new Error('リンク名またはURLを推定できませんでした。例: 「ChatGPTのリンクを作成して」');
  }

  return { label, url: normalizedUrl, category, icon };
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
  isCreating = isBusy;
  const button = document.getElementById('shared-link-ai-button');
  const input = document.getElementById('shared-link-ai-input');
  if (button) {
    button.disabled = isBusy;
    button.innerHTML = isBusy
      ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>作成中</span>'
      : '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>AIで追加</span>';
  }
  if (input) input.disabled = isBusy;
}

async function createSharedLinkFromAi() {
  if (isCreating) return;
  const input = document.getElementById('shared-link-ai-input');
  const text = input?.value.trim() || '';
  if (!text) {
    input?.focus();
    setAiStatus('追加したいリンクを入力してください。', 'warning');
    return;
  }

  setBusy(true);
  setAiStatus('リンク情報を推定しています...', '');
  try {
    await deps.ensureSharedCardsLoaded?.();
    const heuristic = buildHeuristicSuggestion(text);
    const rawSuggestion = heuristic || await buildAiSuggestion(text);
    if (!rawSuggestion) {
      throw new Error('Gemini APIキーが未設定です。URLを含めるか、メール生成AI側でGemini APIキーを設定してください。');
    }

    const suggestion = sanitizeSuggestion(rawSuggestion, text);
    const existing = findExistingCard(suggestion);
    if (existing) {
      state.sharedLinksCategory = existing.category || 'all';
      state.sharedLinksQuery = existing.label || suggestion.label;
      deps.renderSharedLinksBrowser?.();
      setAiStatus(`既に「${existing.label}」が登録されています。`, 'warning');
      showToast('同じリンクが既に登録されています。', 'warning');
      return;
    }

    await deps.addCard?.({
      label: suggestion.label,
      icon: suggestion.icon,
      url: suggestion.url,
      category: suggestion.category,
    });

    state.sharedLinksCategory = suggestion.category || 'all';
    state.sharedLinksFavoritesOnlyCategory = '';
    state.sharedLinksQuery = suggestion.label;
    deps.renderSharedLinksBrowser?.();
    if (input) input.value = '';
    setAiStatus(`「${suggestion.label}」を追加しました。`, 'success');
    showToast(`共有リンクに「${suggestion.label}」を追加しました。`, 'success');
  } catch (err) {
    console.error('共有リンクAI作成エラー:', err);
    setAiStatus(err?.message || 'AIリンク作成に失敗しました。', 'error');
    showToast(err?.message || 'AIリンク作成に失敗しました。', 'error');
  } finally {
    setBusy(false);
  }
}

function bindSharedLinkAiEvents() {
  const input = document.getElementById('shared-link-ai-input');
  const button = document.getElementById('shared-link-ai-button');
  if (button && !button.dataset.bound) {
    button.dataset.bound = '1';
    button.addEventListener('click', () => {
      void createSharedLinkFromAi();
    });
  }
  if (input && !input.dataset.bound) {
    input.dataset.bound = '1';
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void createSharedLinkFromAi();
      }
    });
  }
}
