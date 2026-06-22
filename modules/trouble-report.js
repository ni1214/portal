import { state } from './state.js';
import { esc, _fmtTs } from './utils.js';
import {
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

function setActiveTab(tab) {
  state.troubleReportActiveTab = tab || 'new';
  document.querySelectorAll('[data-trouble-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.troubleTab === state.troubleReportActiveTab);
  });
}

function renderForm() {
  const profile = state.googleAuthProfile || {};
  const department = state.userEmailProfile?.department || '';
  return `
    <form class="trouble-form" id="trouble-report-form">
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
        <div class="form-group trouble-form-wide">
          <label class="form-label" for="trouble-title">件名（現場名）</label>
          <input type="text" id="trouble-title" class="form-input" maxlength="120" placeholder="例：信越化学S棟">
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
          <label class="form-label" for="trouble-keywords">キーワード</label>
          <input type="text" id="trouble-keywords" class="form-input" maxlength="240" placeholder="例：#焼付 #付枠 #図面の整合性 #短納期">
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
      <input type="text" id="trouble-project-filter" class="form-input" value="${esc(state.troubleReportProjectFilter)}" placeholder="件名（現場名）で絞り込み">
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
  if (!title) { document.getElementById('trouble-title')?.focus(); return; }
  if (!occurrenceLocation) { document.getElementById('trouble-location')?.focus(); return; }
  if (!detail) { document.getElementById('trouble-detail')?.focus(); return; }
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
  if (state.troubleReportActiveTab === 'list') void loadReports();
}

export function closeTroubleReportModal() {
  document.getElementById('trouble-report-modal')?.classList.remove('visible');
}
