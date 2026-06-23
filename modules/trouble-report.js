import { state } from './state.js';
import { esc, normalizeProjectKey, _fmtTs } from './utils.js';
import {
  fetchAttendanceSitesFromSupabase,
  createAttendanceSiteInSupabase,
  updateAttendanceSiteInSupabase,
  fetchPortalConfigFromSupabase,
  fetchTroubleReportsFromSupabase,
  createTroubleReportInSupabase,
  updateTroubleReportInSupabase,
} from './supabase.js';
import { showToast } from './notify.js';

export let deps = {};

const MISTAKE_TYPE_OPTIONS = [
  { value: '現場ミス', label: '現場ミス' },
  { value: '設計ミス', label: '設計ミス' },
  { value: '展開ミス', label: '展開ミス' },
  { value: '工場ミス', label: '工場ミス' },
  { value: '工事ミス', label: '工事ミス' },
  { value: '外注ミス', label: '外注ミス' },
  { value: 'その他', label: 'その他' },
];

const STATUS_LABELS = {
  submitted: { label: '受付', cls: 'trouble-status--submitted' },
  reviewing: { label: '確認中', cls: 'trouble-status--reviewing' },
  done: { label: '完了', cls: 'trouble-status--done' },
  archived: { label: '保管', cls: 'trouble-status--archived' },
};

const KEYWORD_STOP_WORDS = new Set([
  'こと', 'ため', 'よう', 'あり', 'なし', 'する', 'した', 'です', 'ます',
  'これ', 'それ', 'どこ', 'なぜ', 'どう', '対応', '対処', '原因',
  '確認', '入力', '現場', '発生', 'トラブル',
]);

const KNOWN_KEYWORD_TERMS = [
  '焼付', '付枠', '図面', '変更図', '施工図', '製作図', '承認図', '現寸',
  '色違い', '寸法違い', '数量違い', '手配漏れ', '確認漏れ', '伝達漏れ',
  '納期', '短納期', '再製作', '差し替え', '外注', '工場', '現場',
  '符号', '取付', '加工', '塗装', '曲げ', '切断', '穴あけ',
];

const TROUBLE_NATURAL_EXAMPLES = [
  {
    key: 'factory',
    label: '工場ミス例',
    text: '物件No 6320、吉野伊勢工網戸。1SD-14A-S棟-1Fの付枠で、焼付色が図面指定と違う状態で製作されていました。原因は変更図の色指定を工場へ伝えた後、製作図の差し替え確認が漏れたためです。現場には再製作で対応予定です。再発防止として変更図受領時に色指定をチェックリスト化し、工場連絡後に製作図の版数確認をします。',
  },
  {
    key: 'design',
    label: '設計ミス例',
    text: '物件No 6320、吉野伊勢工場。2F南面のAW-12で、施工図の開口寸法が構造図と合っておらず、現場確認時に納まりが取れないことが分かりました。原因は最新構造図への差し替え後に、展開図側の寸法確認が不足していたためです。対処は設計で施工図を修正し、関係者へ差し替え連絡を行います。再発防止として図面改訂時に開口寸法の突合せ欄を追加します。',
  },
  {
    key: 'site',
    label: '現場ミス例',
    text: '物件No 70021、東京第3倉庫。3F北側のSD-08で、取付位置を1スパン間違えて施工してしまいました。原因は現場の墨出し確認と図面照合を作業前に行っていなかったことです。対処として本日中に取付位置を修正し、監督へ報告します。再発防止として施工前に符号、通り芯、階を2名で読み合わせます。',
  },
];

const TROUBLE_FIELD_LABELS = [
  '発生日', '日付', '部署', 'ミス先', '分類', '物件No', '物件Ｎｏ', '物件番号',
  '現場名', '現場', '件名', '符号', '発生場所', '場所', '事象', '内容',
  '原因', '原因分析', '対処', '対応', '対処策', '是正', '再発防止', '防止策',
];

let troubleGeminiLoaded = false;
let troubleGeminiApiKey = '';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function optionMarkup(options, selected = '') {
  return options.map(option => (
    `<option value="${esc(option.value)}"${option.value === selected ? ' selected' : ''}>${esc(option.label)}</option>`
  )).join('');
}

function statusBadge(status) {
  const meta = STATUS_LABELS[status] || STATUS_LABELS.submitted;
  return `<span class="trouble-status ${meta.cls}">${esc(meta.label)}</span>`;
}

function mistakeTypeLabel(value) {
  return MISTAKE_TYPE_OPTIONS.find(option => option.value === value)?.label || 'その他';
}

function getActiveSites() {
  return [...(state.attendanceSites || [])]
    .filter(site => site.active !== false)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || `${a.code || ''}`.localeCompare(`${b.code || ''}`, 'ja'));
}

function findSiteByProjectKey(projectKey) {
  const normalized = normalizeProjectKey(projectKey);
  if (!normalized) return null;
  return getActiveSites().find(site => normalizeProjectKey(site.code || '') === normalized) || null;
}

function findSiteByTitle(title) {
  const normalized = normalizeProjectKey(title);
  if (!normalized) return null;
  return getActiveSites().find(site => normalizeProjectKey(site.name || '') === normalized) || null;
}

async function ensureProjectSites(force = false) {
  if (state.troubleProjectSitesLoading) return;
  if (!force && state.troubleProjectSitesLoaded) return;
  state.troubleProjectSitesLoading = true;
  try {
    state.attendanceSites = await fetchAttendanceSitesFromSupabase();
    state.troubleProjectSitesLoaded = true;
  } catch (err) {
    console.error('Trouble project sites load error:', err);
    showToast('物件Noマスタの読み込みに失敗しました。', 'error');
  } finally {
    state.troubleProjectSitesLoading = false;
  }
}

function projectOptionMarkup() {
  return getActiveSites().map(site => (
    `<option value="${esc(site.code || '')}" label="${esc(site.name || '')}"></option>`
  )).join('');
}

function siteNameOptionMarkup() {
  return getActiveSites().map(site => (
    `<option value="${esc(site.name || '')}" label="${esc(site.code || '')}"></option>`
  )).join('');
}

function keywordTokenize(value) {
  return `${value || ''}`
    .replace(/[。、，,;；:：/／|｜()[\]【】「」『』"'!?！？\n\r\t]+/g, ' ')
    .split(/\s+/)
    .map(token => token.trim().replace(/^#+/, ''))
    .filter(token => token.length >= 2 && !KEYWORD_STOP_WORDS.has(token));
}

function generateKeywords(data = {}) {
  const priority = [
    data.projectKey,
    data.title,
    data.mistakeType,
    data.occurrenceLocation,
    data.department,
    data.detail,
    data.cause,
    data.correctiveAction,
    data.preventionAction,
  ];
  const tags = [];
  const seen = new Set();
  const joinedText = priority.filter(Boolean).join(' ');
  const knownTerms = KNOWN_KEYWORD_TERMS.filter(term => joinedText.includes(term));
  [...keywordTokenize(data.projectKey), ...keywordTokenize(data.title), ...knownTerms, ...priority.flatMap(keywordTokenize)].forEach(token => {
    const normalized = token.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    tags.push(`#${token}`);
  });
  return tags.slice(0, 12).join(' ');
}

function compactText(value = '') {
  return `${value || ''}`.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function splitSentences(text = '') {
  return compactText(text)
    .split(/(?<=[。！？!?])|\n+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function extractLabeledValue(text, labels) {
  const labelPattern = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const allLabelPattern = TROUBLE_FIELD_LABELS.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(?:${labelPattern})\\s*[：:]\\s*([\\s\\S]*?)(?=\\n\\s*(?:${allLabelPattern})\\s*[：:]|$)`, 'i');
  const match = text.match(re);
  return match ? compactText(match[1]).replace(/[。．.]+$/, '').slice(0, 500) : '';
}

function findSentence(text, keywords = [], exclude = new Set()) {
  return splitSentences(text).find(sentence => (
    !exclude.has(sentence) && keywords.some(keyword => sentence.includes(keyword))
  )) || '';
}

function inferMistakeType(text = '') {
  const rules = [
    ['設計ミス', ['設計', '構造図', '施工図', '承認図']],
    ['展開ミス', ['展開', '現寸', 'ばらし']],
    ['工場ミス', ['工場', '製作', '加工', '焼付', '塗装', '切断', '穴あけ']],
    ['工事ミス', ['工事', '施工', '取付', '建方']],
    ['外注ミス', ['外注', '協力会社']],
    ['現場ミス', ['現場', '墨出し', '搬入', '取付位置']],
  ];
  return rules.find(([, terms]) => terms.some(term => text.includes(term)))?.[0] || 'その他';
}

function findSiteInText(text = '') {
  const normalizedText = normalizeProjectKey(text);
  return getActiveSites().find(site => {
    const code = normalizeProjectKey(site.code || '');
    const name = `${site.name || ''}`.trim();
    return (code && normalizedText.includes(code)) || (name && text.includes(name));
  }) || null;
}

function inferProjectKey(text = '', site = null) {
  if (site?.code) return normalizeProjectKey(site.code);
  const patterns = [
    /物件\s*(?:No|NO|Ｎｏ|ＮＯ|番号)?[.．]?\s*[：:]?\s*([A-Za-z0-9_-]{3,24})/i,
    /(?:^|[\s、,])No[.．]?\s*([A-Za-z0-9_-]{3,24})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeProjectKey(match[1]);
  }
  return '';
}

function inferTitle(text = '', projectKey = '', site = null) {
  if (site?.name) return `${site.name}`.trim();
  const labeled = extractLabeledValue(text, ['現場名', '現場', '件名']);
  if (labeled) return labeled.slice(0, 120);
  if (projectKey) {
    const escapedKey = projectKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escapedKey}[、,\\s]+([^。\\n]{2,80})`));
    if (match?.[1]) return compactText(match[1]).replace(/^(で|にて|の)/, '').slice(0, 120);
  }
  return '';
}

function inferLocation(text = '') {
  const labeled = extractLabeledValue(text, ['符号', '発生場所', '場所']);
  if (labeled) return labeled.slice(0, 160);
  const match = text.match(/(?:[A-Z0-9]*[A-Z][A-Z0-9]*)[-_ ]?\d{1,4}[A-Z]?(?:[-_][A-Z0-9一-龠ぁ-んァ-ヶー]+){0,4}/i);
  return match?.[0] || '';
}

function buildHeuristicTroubleAnalysis(text = '') {
  const source = compactText(text);
  const site = findSiteInText(source);
  const projectKey = inferProjectKey(source, site);
  const title = inferTitle(source, projectKey, site);
  const occurrenceLocation = inferLocation(source);
  const used = new Set();
  const cause = extractLabeledValue(source, ['原因', '原因分析']) || findSentence(source, ['原因', 'ため', '確認不足', '漏れ'], used);
  if (cause) used.add(cause);
  const correctiveAction = extractLabeledValue(source, ['対処', '対応', '対処策', '是正'])
    || findSentence(source, ['対処', '対応', '修正', '再製作', '交換', '差し替え', '報告'], used);
  if (correctiveAction) used.add(correctiveAction);
  const preventionAction = extractLabeledValue(source, ['再発防止', '防止策'])
    || findSentence(source, ['再発防止', '防止', '次回', 'チェックリスト', '読み合わせ', 'ルール'], used);
  if (preventionAction) used.add(preventionAction);
  const detail = extractLabeledValue(source, ['事象', '内容'])
    || findSentence(source, ['違い', '間違', '漏れ', '不足', '合って', '発生', '分かりました', 'できない'], used)
    || splitSentences(source).find(sentence => !used.has(sentence)) || source;

  return {
    reportDate: '',
    department: '',
    mistakeType: inferMistakeType(source),
    projectKey,
    title,
    occurrenceLocation,
    detail: detail.slice(0, 800),
    cause: cause.slice(0, 600),
    correctiveAction: correctiveAction.slice(0, 600),
    preventionAction: preventionAction.slice(0, 600),
  };
}

async function loadTroubleGeminiApiKey() {
  if (state.geminiApiKey) return state.geminiApiKey;
  if (troubleGeminiLoaded) return troubleGeminiApiKey;
  troubleGeminiLoaded = true;
  try {
    const config = await fetchPortalConfigFromSupabase();
    troubleGeminiApiKey = config.geminiApiKey || '';
    state.geminiApiKey = troubleGeminiApiKey;
  } catch (err) {
    console.error('Trouble Gemini API key load error:', err);
  }
  return troubleGeminiApiKey;
}

function parseJsonFromModel(text) {
  const cleaned = `${text || ''}`.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AIの応答を読み取れませんでした。');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function sanitizeTroubleAnalysis(raw = {}, sourceText = '') {
  const fallback = buildHeuristicTroubleAnalysis(sourceText);
  const validTypes = new Set(MISTAKE_TYPE_OPTIONS.map(option => option.value));
  const pick = (key, max = 600) => compactText(raw?.[key] || fallback[key] || '').slice(0, max);
  return {
    reportDate: /^\d{4}-\d{2}-\d{2}$/.test(raw?.reportDate || '') ? raw.reportDate : fallback.reportDate,
    department: pick('department', 80),
    mistakeType: validTypes.has(raw?.mistakeType) ? raw.mistakeType : fallback.mistakeType,
    projectKey: normalizeProjectKey(raw?.projectKey || fallback.projectKey || ''),
    title: pick('title', 120),
    occurrenceLocation: pick('occurrenceLocation', 160),
    detail: pick('detail', 800),
    cause: pick('cause', 600),
    correctiveAction: pick('correctiveAction', 600),
    preventionAction: pick('preventionAction', 600),
  };
}

async function buildAiTroubleAnalysis(text) {
  const key = await loadTroubleGeminiApiKey();
  if (!key) return null;
  const sites = getActiveSites().slice(0, 200).map(site => ({
    code: site.code || '',
    name: site.name || '',
  }));
  const prompt = `トラブル報告フォームへ転記するため、入力文から必要項目を抽出してください。

入力文:
${text}

既存の物件Noマスタ:
${JSON.stringify(sites, null, 2)}

必ず次のJSONだけを返してください。分からない項目は空文字にしてください。
{
  "reportDate": "YYYY-MM-DD。明記がなければ空文字",
  "department": "部署。明記がなければ空文字",
  "mistakeType": "現場ミス / 設計ミス / 展開ミス / 工場ミス / 工事ミス / 外注ミス / その他 のいずれか",
  "projectKey": "物件No。既存マスタのcodeと合う場合はそれを優先",
  "title": "現場名または件名。既存マスタのnameと合う場合はそれを優先",
  "occurrenceLocation": "符号と発生場所",
  "detail": "事象。何が起きたか",
  "cause": "原因分析。なぜ起きたか",
  "correctiveAction": "対処策。どう対処したか",
  "preventionAction": "再発防止策"
}

条件:
- 入力文にない事実は作らないでください。
- 文章は現場でそのまま読める短い日本語に整えてください。
- 説明文やMarkdownは不要です。`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
      }),
    }
  );
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `AI解析に失敗しました。HTTP ${res.status}`);
  }
  const data = await res.json();
  return sanitizeTroubleAnalysis(parseJsonFromModel(data.candidates?.[0]?.content?.parts?.[0]?.text || ''), text);
}

function collectFormValues() {
  return {
    reportDate: document.getElementById('trouble-report-date')?.value || todayKey(),
    department: document.getElementById('trouble-department')?.value.trim() || state.userEmailProfile?.department || '',
    mistakeType: document.getElementById('trouble-mistake-type')?.value || 'その他',
    projectKey: normalizeProjectKey(document.getElementById('trouble-project-key')?.value || ''),
    siteId: document.getElementById('trouble-site-id')?.value || '',
    title: document.getElementById('trouble-title')?.value.trim() || '',
    occurrenceLocation: document.getElementById('trouble-location')?.value.trim() || '',
    detail: document.getElementById('trouble-detail')?.value.trim() || '',
    cause: document.getElementById('trouble-cause')?.value.trim() || '',
    correctiveAction: document.getElementById('trouble-corrective-action')?.value.trim() || '',
    preventionAction: document.getElementById('trouble-prevention-action')?.value.trim() || '',
  };
}

function setProjectStatus(message = '', type = 'info') {
  const el = document.getElementById('trouble-project-status');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function updateProjectLinkFromKey() {
  const keyInput = document.getElementById('trouble-project-key');
  const titleInput = document.getElementById('trouble-title');
  const siteIdInput = document.getElementById('trouble-site-id');
  const site = findSiteByProjectKey(keyInput?.value || '');
  if (!site) {
    if (siteIdInput) siteIdInput.value = '';
    setProjectStatus(keyInput?.value ? '未登録の物件Noです。現場名を入れて登録できます。' : '', 'info');
    return;
  }
  if (siteIdInput) siteIdInput.value = site.id || '';
  if (titleInput && !titleInput.value.trim()) titleInput.value = site.name || '';
  setProjectStatus(`リンク中: ${site.code || ''} / ${site.name || ''}`, 'success');
}

function updateProjectLinkFromTitle() {
  const keyInput = document.getElementById('trouble-project-key');
  const titleInput = document.getElementById('trouble-title');
  const siteIdInput = document.getElementById('trouble-site-id');
  const site = findSiteByTitle(titleInput?.value || '');
  if (!site) return;
  if (siteIdInput) siteIdInput.value = site.id || '';
  if (keyInput && !keyInput.value.trim()) keyInput.value = site.code || '';
  setProjectStatus(`リンク中: ${site.code || ''} / ${site.name || ''}`, 'success');
}

function updateKeywordsFromForm(force = false) {
  const checkbox = document.getElementById('trouble-keywords-auto');
  const input = document.getElementById('trouble-keywords');
  if (!input) return;
  if (!force && checkbox && !checkbox.checked) return;
  input.value = generateKeywords(collectFormValues());
}

function setNaturalStatus(message = '', type = 'info') {
  const el = document.getElementById('trouble-natural-status');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function setNaturalBusy(isBusy) {
  const btn = document.getElementById('trouble-ai-fill-btn');
  const textarea = document.getElementById('trouble-natural-text');
  if (btn) {
    btn.disabled = isBusy;
    btn.innerHTML = isBusy
      ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>解析中</span>'
      : '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>AIで項目に反映</span>';
  }
  if (textarea) textarea.disabled = isBusy;
}

function setFormValue(id, value) {
  const el = document.getElementById(id);
  if (!el || value == null || value === '') return false;
  el.value = value;
  return true;
}

function applyTroubleAnalysis(analysis = {}) {
  setFormValue('trouble-report-date', analysis.reportDate);
  setFormValue('trouble-department', analysis.department);
  setFormValue('trouble-mistake-type', analysis.mistakeType);
  setFormValue('trouble-project-key', analysis.projectKey);
  setFormValue('trouble-title', analysis.title);
  updateProjectLinkFromKey();
  updateProjectLinkFromTitle();
  setFormValue('trouble-location', analysis.occurrenceLocation);
  setFormValue('trouble-detail', analysis.detail);
  setFormValue('trouble-cause', analysis.cause);
  setFormValue('trouble-corrective-action', analysis.correctiveAction);
  setFormValue('trouble-prevention-action', analysis.preventionAction);
  const keywordAuto = document.getElementById('trouble-keywords-auto');
  if (keywordAuto) keywordAuto.checked = true;
  updateKeywordsFromForm(true);
}

async function fillTroubleFormFromNaturalText() {
  const textarea = document.getElementById('trouble-natural-text');
  const text = textarea?.value.trim() || '';
  if (!text) {
    textarea?.focus();
    setNaturalStatus('まず報告内容を文章で入力してください。', 'error');
    return;
  }
  setNaturalBusy(true);
  setNaturalStatus('入力文を解析しています...', 'info');
  try {
    let usedAi = false;
    let analysis = null;
    try {
      analysis = await buildAiTroubleAnalysis(text);
      usedAi = !!analysis;
    } catch (err) {
      console.warn('Trouble AI analysis fallback:', err);
    }
    if (!analysis) analysis = sanitizeTroubleAnalysis({}, text);
    applyTroubleAnalysis(analysis);
    setNaturalStatus(usedAi ? 'AI解析で項目へ反映しました。必要なら各欄を修正してください。' : 'AI設定が未使用のため、入力文から分かる範囲で反映しました。', usedAi ? 'success' : 'info');
    showToast('入力文をトラブル報告へ反映しました。', 'success');
  } finally {
    setNaturalBusy(false);
  }
}

function setActiveTab(tab) {
  state.troubleReportActiveTab = tab || 'new';
  document.querySelectorAll('[data-trouble-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.troubleTab === state.troubleReportActiveTab);
  });
}

function renderForm() {
  const profile = state.googleAuthProfile || {};
  const department = state.userEmailProfile?.department || '';
  const projectOptions = projectOptionMarkup();
  const siteOptions = siteNameOptionMarkup();
  return `
    <form class="trouble-form" id="trouble-report-form">
      <datalist id="trouble-project-options">${projectOptions}</datalist>
      <datalist id="trouble-site-options">${siteOptions}</datalist>
      <input type="hidden" id="trouble-site-id" value="">
      <section class="trouble-natural-panel">
        <div class="trouble-natural-head">
          <div>
            <label class="form-label" for="trouble-natural-text">まとめて入力</label>
            <p>文章で書いてから、AIで各項目へ反映できます。</p>
          </div>
          <button type="button" class="btn-modal-primary" id="trouble-ai-fill-btn">
            <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
            <span>AIで項目に反映</span>
          </button>
        </div>
        <textarea id="trouble-natural-text" class="form-input" rows="5" placeholder="例：物件No 61065、信越化学S棟。1SD-14A-S棟-1Fの付枠で、焼付色が図面指定と違う状態で製作されていました。原因は変更図の色指定を工場へ伝えた後、製作図の差し替え確認が漏れたためです。現場には再製作で対応予定です。再発防止として変更図受領時に色指定をチェックリスト化します。"></textarea>
        <div class="trouble-natural-examples">
          ${TROUBLE_NATURAL_EXAMPLES.map(example => `
            <button type="button" class="trouble-example-btn" data-trouble-example="${esc(example.key)}">
              <i class="fa-regular fa-clipboard" aria-hidden="true"></i>
              <span>${esc(example.label)}</span>
            </button>
          `).join('')}
        </div>
        <p id="trouble-natural-status" class="trouble-natural-status"></p>
      </section>
      <div class="trouble-form-grid">
        <div class="form-group form-group-inline">
          <input type="date" id="trouble-report-date" class="date-icon-only" value="${todayKey()}">
          <label class="form-label" for="trouble-report-date">発生日</label>
        </div>
        <div class="form-group">
          <label class="form-label" for="trouble-department">部署</label>
          <input type="text" id="trouble-department" class="form-input" value="${esc(department)}" placeholder="例：生産管理">
        </div>
        <div class="form-group">
          <label class="form-label" for="trouble-mistake-type">ミス先</label>
          <select id="trouble-mistake-type" class="form-input">${optionMarkup(MISTAKE_TYPE_OPTIONS, '工場ミス')}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="trouble-project-key">物件No</label>
          <input type="text" id="trouble-project-key" class="form-input" maxlength="80" list="trouble-project-options" placeholder="例：61065">
        </div>
        <div class="form-group trouble-form-wide">
          <label class="form-label" for="trouble-title">現場名（件名）</label>
          <input type="text" id="trouble-title" class="form-input" maxlength="120" list="trouble-site-options" placeholder="例：信越化学S棟">
        </div>
        <div class="trouble-project-tools trouble-form-wide">
          <button type="button" class="btn-modal-secondary" id="trouble-save-project-btn">
            <i class="fa-solid fa-link" aria-hidden="true"></i>
            <span>物件Noを登録/更新</span>
          </button>
          <span id="trouble-project-status" class="trouble-project-status"></span>
        </div>
        <div class="form-group trouble-form-wide">
          <label class="form-label" for="trouble-location">符号と発生場所</label>
          <input type="text" id="trouble-location" class="form-input" maxlength="160" placeholder="例：1SD-14A-S棟-1F">
        </div>
        <div class="form-group trouble-form-wide">
          <label class="form-label" for="trouble-detail">事象（何が起きたか）</label>
          <textarea id="trouble-detail" class="form-input" rows="4" placeholder="起きたこと、影響、確認した事実を入力"></textarea>
        </div>
        <div class="form-group trouble-form-wide">
          <label class="form-label" for="trouble-cause">原因分析（なぜ起きたか）</label>
          <textarea id="trouble-cause" class="form-input" rows="3" placeholder="原因、確認不足、伝達漏れなど"></textarea>
        </div>
        <div class="form-group trouble-form-wide">
          <label class="form-label" for="trouble-corrective-action">対処策（どう対処したか）</label>
          <textarea id="trouble-corrective-action" class="form-input" rows="3" placeholder="実施済み、または予定している対処"></textarea>
        </div>
        <div class="form-group trouble-form-wide">
          <label class="form-label" for="trouble-prevention-action">再発防止策</label>
          <textarea id="trouble-prevention-action" class="form-input" rows="3" placeholder="同じミスを防ぐための対策"></textarea>
        </div>
        <div class="form-group trouble-form-wide">
          <div class="trouble-keyword-label-row">
            <label class="form-label" for="trouble-keywords">キーワード</label>
            <label class="trouble-keyword-toggle">
              <input type="checkbox" id="trouble-keywords-auto" checked>
              <span>自動生成</span>
            </label>
          </div>
          <div class="trouble-keyword-input-row">
            <input type="text" id="trouble-keywords" class="form-input" maxlength="240" placeholder="入力内容から自動生成。手入力で編集もできます。">
            <button type="button" class="btn-modal-secondary" id="trouble-keywords-regenerate">
              <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
              <span>再生成</span>
            </button>
          </div>
        </div>
      </div>
      <div class="trouble-form-footer">
        <span class="trouble-reporter">報告者: ${esc(state.currentUsername || '')}${profile.email ? ` / ${esc(profile.email)}` : ''}</span>
        <button type="submit" class="btn-modal-primary" id="trouble-submit-btn">
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          <span>報告を送信</span>
        </button>
      </div>
    </form>
  `;
}

function renderFilters() {
  return `
    <div class="trouble-filter-row">
      <select id="trouble-status-filter" class="form-input">
        <option value="open"${state.troubleReportStatusFilter === 'open' ? ' selected' : ''}>未完了</option>
        <option value="all"${state.troubleReportStatusFilter === 'all' ? ' selected' : ''}>すべて</option>
        <option value="submitted"${state.troubleReportStatusFilter === 'submitted' ? ' selected' : ''}>受付</option>
        <option value="reviewing"${state.troubleReportStatusFilter === 'reviewing' ? ' selected' : ''}>確認中</option>
        <option value="done"${state.troubleReportStatusFilter === 'done' ? ' selected' : ''}>完了</option>
      </select>
      <input type="text" id="trouble-project-filter" class="form-input" value="${esc(state.troubleReportProjectFilter)}" placeholder="物件No・現場名で絞り込み">
      <button type="button" class="btn-modal-secondary" id="trouble-refresh-btn">
        <i class="fa-solid fa-rotate" aria-hidden="true"></i>
        <span>更新</span>
      </button>
    </div>
  `;
}

function renderList() {
  if (state.troubleReportsLoading) {
    return `${renderFilters()}<div class="trouble-empty"><span class="spinner"></span><p>読み込み中です...</p></div>`;
  }
  if (!state.troubleReports.length) {
    return `${renderFilters()}<div class="trouble-empty"><i class="fa-regular fa-circle-check"></i><p>該当する報告はありません</p></div>`;
  }
  const items = state.troubleReports.map(report => `
    <article class="trouble-item" data-trouble-id="${esc(report.id)}">
      <div class="trouble-item-head">
        <div>
          <div class="trouble-item-title">${esc(report.title || '件名未設定')}</div>
          <div class="trouble-item-meta">
            ${esc(report.reportDate || '')}
            ${report.projectKey ? ` / 物件No: ${esc(report.projectKey)}` : ''}
            / ${esc(mistakeTypeLabel(report.mistakeType))}
            ${report.occurrenceLocation ? ` / ${esc(report.occurrenceLocation)}` : ''}
          </div>
        </div>
        ${statusBadge(report.status)}
      </div>
      <p class="trouble-item-body">${esc(report.detail || '')}</p>
      ${report.keywords ? `<p class="trouble-item-tags">${esc(report.keywords)}</p>` : ''}
      <div class="trouble-item-foot">
        <span>${esc(report.reporterUsername || '報告者未設定')} / ${esc(report.department || '部署未設定')}</span>
        <span>${esc(_fmtTs(report.createdAt))}</span>
      </div>
      <div class="trouble-item-actions">
        ${report.projectKey ? `<button type="button" class="btn-modal-secondary" data-trouble-project="${esc(report.projectKey)}">物件Noまとめ</button>` : ''}
        <button type="button" class="btn-modal-secondary" data-trouble-status="reviewing">確認中</button>
        <button type="button" class="btn-modal-primary" data-trouble-status="done">完了</button>
      </div>
    </article>
  `).join('');
  return `${renderFilters()}<div class="trouble-list">${items}</div>`;
}

function renderContent() {
  const content = document.getElementById('trouble-report-content');
  if (!content) return;
  setActiveTab(state.troubleReportActiveTab);
  content.innerHTML = state.troubleReportActiveTab === 'list' ? renderList() : renderForm();
}

async function loadReports(force = false) {
  if (state.troubleReportsLoading) return;
  if (!force && state.troubleReportsLoaded) return;
  state.troubleReportsLoading = true;
  renderContent();
  try {
    state.troubleReports = await fetchTroubleReportsFromSupabase({
      status: state.troubleReportStatusFilter,
      title: state.troubleReportProjectFilter.trim(),
    });
    state.troubleReportsLoaded = true;
  } catch (err) {
    console.error('Trouble reports load error:', err);
    showToast('トラブル報告の読み込みに失敗しました。', 'error');
  } finally {
    state.troubleReportsLoading = false;
    renderContent();
  }
}

async function submitReport(event) {
  event.preventDefault();
  if (!state.currentUsername) {
    deps.promptUsernameFor?.('トラブル報告');
    return;
  }
  const title = document.getElementById('trouble-title')?.value.trim();
  const occurrenceLocation = document.getElementById('trouble-location')?.value.trim();
  const detail = document.getElementById('trouble-detail')?.value.trim();
  const projectKey = normalizeProjectKey(document.getElementById('trouble-project-key')?.value || '');
  if (!title) { document.getElementById('trouble-title')?.focus(); return; }
  if (!occurrenceLocation) { document.getElementById('trouble-location')?.focus(); return; }
  if (!detail) { document.getElementById('trouble-detail')?.focus(); return; }
  updateKeywordsFromForm(false);
  const btn = document.getElementById('trouble-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>送信中...</span>';
  }
  try {
    await createTroubleReportInSupabase({
      reportDate: document.getElementById('trouble-report-date')?.value || todayKey(),
      reporterUsername: state.currentUsername,
      reporterEmail: state.googleAuthProfile?.email || state.userEmailProfile?.email || '',
      department: document.getElementById('trouble-department')?.value.trim() || state.userEmailProfile?.department || '',
      mistakeType: document.getElementById('trouble-mistake-type')?.value || 'その他',
      projectKey,
      siteId: document.getElementById('trouble-site-id')?.value || findSiteByProjectKey(projectKey)?.id || '',
      title,
      occurrenceLocation,
      detail,
      cause: document.getElementById('trouble-cause')?.value.trim() || '',
      correctiveAction: document.getElementById('trouble-corrective-action')?.value.trim() || '',
      preventionAction: document.getElementById('trouble-prevention-action')?.value.trim() || '',
      keywords: document.getElementById('trouble-keywords')?.value.trim() || '',
    });
    showToast('トラブル報告を送信しました。', 'success');
    state.troubleReportsLoaded = false;
    state.troubleReportActiveTab = 'list';
    await loadReports(true);
  } catch (err) {
    console.error('Trouble report save error:', err);
    showToast('トラブル報告の送信に失敗しました。', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span>報告を送信</span>';
    }
  }
}

async function saveProjectSiteFromForm() {
  const projectKey = normalizeProjectKey(document.getElementById('trouble-project-key')?.value || '');
  const title = document.getElementById('trouble-title')?.value.trim() || '';
  if (!projectKey) {
    document.getElementById('trouble-project-key')?.focus();
    setProjectStatus('物件Noを入力してください。', 'error');
    return;
  }
  if (!title) {
    document.getElementById('trouble-title')?.focus();
    setProjectStatus('現場名を入力してください。', 'error');
    return;
  }
  const btn = document.getElementById('trouble-save-project-btn');
  if (btn) btn.disabled = true;
  try {
    await ensureProjectSites(true);
    const existing = findSiteByProjectKey(projectKey);
    let savedSiteId = '';
    let savedMessage = '';
    if (existing) {
      await updateAttendanceSiteInSupabase(existing.id, {
        code: projectKey,
        name: title,
        active: true,
        updatedBy: state.currentUsername || '',
      });
      state.attendanceSites = (state.attendanceSites || []).map(site =>
        site.id === existing.id ? { ...site, code: projectKey, name: title, active: true, updatedBy: state.currentUsername || '' } : site
      );
      savedSiteId = existing.id;
      savedMessage = '物件Noと現場名を更新しました。';
    } else {
      const sortOrder = (state.attendanceSites || []).reduce((max, site) => Math.max(max, Number(site.sortOrder) || 0), 0) + 10;
      const id = await createAttendanceSiteInSupabase({
        code: projectKey,
        name: title,
        sortOrder,
        updatedBy: state.currentUsername || '',
      });
      state.attendanceSites = [...(state.attendanceSites || []), { id, code: projectKey, name: title, sortOrder, active: true, updatedBy: state.currentUsername || '' }];
      savedSiteId = id;
      savedMessage = '物件Noと現場名を登録しました。';
    }
    state.troubleProjectSitesLoaded = true;
    const projectOptionsEl = document.getElementById('trouble-project-options');
    const siteOptionsEl = document.getElementById('trouble-site-options');
    if (projectOptionsEl) projectOptionsEl.innerHTML = projectOptionMarkup();
    if (siteOptionsEl) siteOptionsEl.innerHTML = siteNameOptionMarkup();
    const keyInput = document.getElementById('trouble-project-key');
    const titleInput = document.getElementById('trouble-title');
    const siteIdInput = document.getElementById('trouble-site-id');
    if (keyInput) keyInput.value = projectKey;
    if (titleInput) titleInput.value = title;
    if (siteIdInput) siteIdInput.value = savedSiteId;
    setProjectStatus(savedMessage, 'success');
    updateKeywordsFromForm(true);
  } catch (err) {
    console.error('Trouble project site save error:', err);
    setProjectStatus('物件Noの登録に失敗しました。', 'error');
    showToast('物件Noの登録に失敗しました。', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function updateStatus(reportId, status) {
  if (!reportId || !status) return;
  try {
    await updateTroubleReportInSupabase(reportId, { status });
    const target = state.troubleReports.find(report => report.id === reportId);
    if (target) target.status = status;
    showToast('対応状況を更新しました。', 'success');
    renderContent();
  } catch (err) {
    console.error('Trouble status update error:', err);
    showToast('対応状況の更新に失敗しました。', 'error');
  }
}

export function initTroubleReport(d = {}) {
  deps = { ...deps, ...d };
  const modal = document.getElementById('trouble-report-modal');
  if (!modal || modal.dataset.bound === '1') return;
  modal.dataset.bound = '1';
  document.getElementById('trouble-report-close')?.addEventListener('click', closeTroubleReportModal);
  modal.addEventListener('click', event => {
    if (event.target === modal) closeTroubleReportModal();
  });
  modal.addEventListener('click', event => {
    const tab = event.target.closest('[data-trouble-tab]')?.dataset.troubleTab;
    if (tab) {
      state.troubleReportActiveTab = tab;
      renderContent();
      if (tab === 'list') void loadReports();
      return;
    }
    const statusBtn = event.target.closest('[data-trouble-status]');
    if (statusBtn) {
      const item = statusBtn.closest('[data-trouble-id]');
      void updateStatus(item?.dataset.troubleId, statusBtn.dataset.troubleStatus);
      return;
    }
    const projectBtn = event.target.closest('[data-trouble-project]');
    if (projectBtn) {
      deps.openPropertySummary?.(projectBtn.dataset.troubleProject || '');
      return;
    }
    if (event.target.closest('#trouble-save-project-btn')) {
      void saveProjectSiteFromForm();
      return;
    }
    if (event.target.closest('#trouble-keywords-regenerate')) {
      const checkbox = document.getElementById('trouble-keywords-auto');
      if (checkbox) checkbox.checked = true;
      updateKeywordsFromForm(true);
      return;
    }
    const exampleBtn = event.target.closest('[data-trouble-example]');
    if (exampleBtn) {
      const example = TROUBLE_NATURAL_EXAMPLES.find(item => item.key === exampleBtn.dataset.troubleExample);
      const textarea = document.getElementById('trouble-natural-text');
      if (example && textarea) {
        textarea.value = example.text;
        textarea.focus();
        setNaturalStatus('例文を入れました。必要に応じて書き換えてください。', 'info');
      }
      return;
    }
    if (event.target.closest('#trouble-ai-fill-btn')) {
      void fillTroubleFormFromNaturalText();
      return;
    }
  });
  modal.addEventListener('submit', event => {
    if (event.target?.id === 'trouble-report-form') void submitReport(event);
  });
  modal.addEventListener('change', event => {
    if (event.target?.id === 'trouble-status-filter') {
      state.troubleReportStatusFilter = event.target.value || 'open';
      state.troubleReportsLoaded = false;
      void loadReports(true);
      return;
    }
    if (event.target?.id === 'trouble-project-key') {
      updateProjectLinkFromKey();
      updateKeywordsFromForm(false);
      return;
    }
    if (event.target?.id === 'trouble-title') {
      updateProjectLinkFromTitle();
      updateKeywordsFromForm(false);
      return;
    }
    if (event.target?.id === 'trouble-keywords-auto') {
      updateKeywordsFromForm(true);
    }
  });
  modal.addEventListener('input', event => {
    if (event.target?.id === 'trouble-keywords') {
      const checkbox = document.getElementById('trouble-keywords-auto');
      if (checkbox) checkbox.checked = false;
      return;
    }
    if (event.target?.closest('#trouble-report-form')) {
      if (event.target?.id === 'trouble-project-key') updateProjectLinkFromKey();
      if (event.target?.id === 'trouble-title') updateProjectLinkFromTitle();
      updateKeywordsFromForm(false);
    }
  });
  modal.addEventListener('click', event => {
    if (event.target.closest('#trouble-refresh-btn')) {
      state.troubleReportProjectFilter = document.getElementById('trouble-project-filter')?.value.trim() || '';
      state.troubleReportsLoaded = false;
      void loadReports(true);
    }
  });
}

export function openTroubleReportModal(initialTab = 'new') {
  state.troubleReportActiveTab = initialTab || 'new';
  document.getElementById('trouble-report-modal')?.classList.add('visible');
  renderContent();
  void ensureProjectSites().then(() => {
    if (state.troubleReportActiveTab === 'new') renderContent();
  });
  if (state.troubleReportActiveTab === 'list') void loadReports();
}

export function closeTroubleReportModal() {
  document.getElementById('trouble-report-modal')?.classList.remove('visible');
}
