import { state } from './state.js';
import { esc, normalizeProjectKey, _fmtTs } from './utils.js';
import {
  fetchAttendanceSitesFromSupabase,
  createAttendanceSiteInSupabase,
  updateAttendanceSiteInSupabase,
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
