// modules/home-dashboard.js
// ホームダッシュボード — サマリーカード＋クイックアクセスの初期化・更新

import { state } from './state.js';

let deps = {};

export function initHomeDashboard(d = {}) {
  deps = d;
  updateSummaryCards();
  bindQuickAccess();
  observeBadges();
}

// ===== サマリーカード更新 =====
export function updateSummaryCards() {
  updateTaskCard();
  updateNoticeCard();
  updateReqCard();
  updateAttendanceCard();
}

function updateTaskCard() {
  const badge = document.getElementById('task-badge');
  const el    = document.getElementById('hcard-task-count');
  if (!el) return;
  const n = getBadgeCount(badge);
  el.textContent = n > 0 ? `${n}件 未対応` : '0件';
  el.style.color = n > 0 ? 'var(--portal-home-danger)' : '';
}

function updateNoticeCard() {
  const badge = document.getElementById('notice-unread-badge');
  const el    = document.getElementById('hcard-notice-count');
  if (!el) return;
  const n = getBadgeCount(badge);
  el.textContent = n > 0 ? `${n}件 未読` : '0件';
  el.style.color = n > 0 ? 'var(--portal-home-danger)' : '';
}

function updateReqCard() {
  const badge = document.getElementById('req-badge');
  const el    = document.getElementById('hcard-req-count');
  if (!el) return;
  const n = getBadgeCount(badge);
  el.textContent = n > 0 ? `${n}件 未対応` : '0件';
  el.style.color = n > 0 ? 'var(--portal-home-danger)' : '';
}

function updateAttendanceCard() {
  const el = document.getElementById('hcard-attendance-status');
  if (!el) return;
  const today = state.todayAttendance;
  if (!today) {
    el.textContent = '未入力';
    el.style.color = 'var(--portal-home-copy)';
    return;
  }
  const type = today.type || null;
  const hayade = today.hayade || null;
  const zangyo = today.zangyo || null;

  let label = '通常出勤';
  if (type === '有給') label = '有給休暇';
  else if (type === '半休午前') label = '半休（午前）';
  else if (type === '半休午後') label = '半休（午後）';
  else if (type === '欠勤') label = '欠勤';
  else if (hayade) label = `早出 ${hayade}`;
  else if (zangyo) label = `残業 〜${zangyo}`;

  el.textContent = label;
  el.style.color = type === '欠勤' ? 'var(--portal-home-danger)' : 'var(--portal-home-success)';
}

// ===== バッジ数取得ユーティリティ =====
function getBadgeCount(badge) {
  if (!badge || badge.hidden) return 0;
  return parseInt(badge.textContent) || 0;
}

// ===== クイックアクセス ボタン接続 =====
function bindQuickAccess() {
  // サマリーカード クリック
  on('hcard-tasks',    () => click('btn-task'));
  on('hcard-notices',  () => click('btn-notice-bell'));
  on('hcard-requests', () => click('btn-reqboard'));
  on('hcard-attendance', () => click('btn-calendar'));

  // クイックアクセスボタン
  on('hqa-calendar', () => click('btn-calendar'));
  on('hqa-task',     () => click('btn-task'));
  on('hqa-order',    () => click('btn-order-launch'));
  on('hqa-email',    () => click('btn-email-assist'));
  on('hqa-file',     () => click('ft-fab'));
  on('hqa-req',      () => click('btn-reqboard'));
  on('hqa-chat',     () => click('chat-fab'));
  on('hqa-property', () => click('btn-property-summary'));
}

function on(id, fn) {
  document.getElementById(id)?.addEventListener('click', fn);
}

function click(id) {
  document.getElementById(id)?.click();
}

// ===== MutationObserver でバッジ変化を監視 =====
function observeBadges() {
  const targets = [
    { id: 'task-badge',           update: updateTaskCard },
    { id: 'notice-unread-badge',  update: updateNoticeCard },
    { id: 'req-badge',            update: updateReqCard },
  ];

  const obs = new MutationObserver(() => updateSummaryCards());

  targets.forEach(({ id }) => {
    const el = document.getElementById(id);
    if (el) obs.observe(el, {
      childList: true, characterData: true,
      subtree: true, attributes: true,
      attributeFilter: ['hidden'],
    });
  });
}
