import { state, TASK_STATUS_LABEL, USER_ROLE_LABELS } from './state.js';
import { esc } from './utils.js';
import { getBrandIconHtmlForCard } from './brand-icons.js';

let deps = {};

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const DASH_LIST_LIMIT = 3;
const DASH_FAVORITE_LIMIT = 6;
const ATTENDANCE_TYPE_LABELS = {
  normal: '通常',
  有給: '有給',
  半休午前: '半休 午前',
  半休午後: '半休 午後',
  欠勤: '欠勤',
};

const DASH_TARGETS = Object.freeze({
  PROFILE: 'profile',
  TASK_RECEIVED: 'task-received',
  TASK_SENT: 'task-sent',
  REQUEST_RECEIVED: 'request-received',
  REQUEST_SENT: 'request-sent',
  ATTENDANCE: 'attendance',
  NOTICE: 'notice',
  SHARED_LINKS: 'shared-links',
  FAVORITES: 'favorites',
  INVITE: 'invite',
});

export function initTodayDashboard(d = {}) {
  deps = d;
  renderTodayDashboard();
}

export function renderTodayDashboard() {
  const section = document.getElementById('dash-today-section');
  const heroHost = document.getElementById('home-dashboard');
  if (!section) return;
  bindDashboardEvents(section);
  bindDashboardEvents(heroHost);

  const today = new Date();
  const todayKey = buildDateKey(today);
  const profile = getDashboardProfile();
  const username = state.currentUsername || '名前を設定してください';
  const taskCard = buildTaskCard(todayKey);
  const attendanceCard = buildAttendanceCard(todayKey);
  const noticeCard = buildNoticeCard();
  const focusCard = buildFocusCard(todayKey);
  const favoriteCount = Array.isArray(state.personalFavorites) ? state.personalFavorites.length : 0;
  const personalMeta = buildPersonalMeta(profile);
  const primaryTarget = state.currentUsername ? (focusCard.target || DASH_TARGETS.PROFILE) : DASH_TARGETS.PROFILE;
  const attendanceTarget = state.currentUsername ? DASH_TARGETS.ATTENDANCE : DASH_TARGETS.PROFILE;
  const taskTarget = state.currentUsername ? DASH_TARGETS.TASK_RECEIVED : DASH_TARGETS.PROFILE;
  const favoritesTarget = state.currentUsername ? DASH_TARGETS.FAVORITES : DASH_TARGETS.PROFILE;
  const personalSignals = [
    profile.department || 'プロフィール未設定',
    profile.roleLabel || (state.currentUsername ? '共通ビュー' : '設定が必要です'),
    state.currentUsername ? '個人スペースは保存されます' : 'ユーザーネーム設定で有効化',
  ];

  renderHomeHero(heroHost, {
    today,
    username,
    profile,
    taskCard,
    attendanceCard,
    noticeCard,
    focusCard,
    favoriteCount,
  });

  section.hidden = true;
  section.innerHTML = '';
  return;

  section.hidden = false;
  section.innerHTML = `
    <div class="portal-rail-shell home-m3-workspace home-m3-workspace--personal">
      <header class="home-m3-workspace__header">
        <div>
          <p class="home-m3-workspace__eyebrow">Personal Workspace</p>
          <h2 class="home-m3-workspace__title">${esc(state.currentUsername ? `${username} の個人スペース` : '個人スペースを設定')}</h2>
          <p class="home-m3-workspace__copy">${esc(state.currentUsername ? personalMeta : 'プロフィールを設定すると個人向けの保存とショートカットが使えるようになります。')}</p>
        </div>
        <button type="button" class="home-m3-inline-action" data-dash-target="${esc(DASH_TARGETS.PROFILE)}">プロフィール</button>
      </header>

      <div class="home-m3-pill-row">
        ${personalSignals.map(signal => `<span class="home-m3-pill home-m3-pill--soft">${esc(signal)}</span>`).join('')}
      </div>

      <div class="home-m3-workspace__grid home-m3-workspace__grid--personal">
        <button
          type="button"
          class="home-m3-workspace__card home-m3-workspace__card--wide home-m3-workspace__card--accent"
          data-dash-target="${esc(primaryTarget)}"
        >
          <div class="home-m3-workspace__card-head">
            <span class="home-m3-workspace__card-icon">
              <span class="material-symbols-rounded" aria-hidden="true">person_raised_hand</span>
            </span>
            <div>
              <span class="home-m3-workspace__card-label">${esc(focusCard.title || '今日のフォーカス')}</span>
              <strong class="home-m3-workspace__card-value">${esc(state.currentUsername ? (focusCard.value || '確認') : '設定が必要です')}</strong>
            </div>
          </div>
          <p class="home-m3-workspace__card-meta">${esc(state.currentUsername ? (focusCard.meta || '最初に確認したい内容をここから開けます。') : 'プロフィールを設定すると個人向けの優先事項が表示されます。')}</p>
          ${renderPersonalList(focusCard.items, focusCard.emptyText)}
        </button>

        <button
          type="button"
          class="home-m3-workspace__card"
          data-dash-target="${esc(taskTarget)}"
        >
          <div class="home-m3-workspace__card-head">
            <span class="home-m3-workspace__card-icon">
              <span class="material-symbols-rounded" aria-hidden="true">task_alt</span>
            </span>
            <div>
              <span class="home-m3-workspace__card-label">タスク</span>
              <strong class="home-m3-workspace__card-value">${esc(state.currentUsername ? taskCard.value : '設定待ち')}</strong>
            </div>
          </div>
          <p class="home-m3-workspace__card-meta">${esc(state.currentUsername ? (taskCard.meta || '受信タスクを確認できます。') : 'プロフィール設定後に有効になります。')}</p>
          ${renderPersonalChips(taskCard.chips)}
        </button>

        <button
          type="button"
          class="home-m3-workspace__card"
          data-dash-target="${esc(attendanceTarget)}"
        >
          <div class="home-m3-workspace__card-head">
            <span class="home-m3-workspace__card-icon">
              <span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>
            </span>
            <div>
              <span class="home-m3-workspace__card-label">勤怠</span>
              <strong class="home-m3-workspace__card-value">${esc(buildAttendanceValueLabel(attendanceCard, Boolean(state.currentUsername)))}</strong>
            </div>
          </div>
          <p class="home-m3-workspace__card-meta">${esc(attendanceCard.meta || '今日の勤怠を確認できます。')}</p>
          ${renderPersonalChips(attendanceCard.chips)}
        </button>

        <button
          type="button"
          class="home-m3-workspace__card"
          data-dash-target="${esc(favoritesTarget)}"
        >
          <div class="home-m3-workspace__card-head">
            <span class="home-m3-workspace__card-icon">
              <span class="material-symbols-rounded" aria-hidden="true">star</span>
            </span>
            <div>
              <span class="home-m3-workspace__card-label">お気に入り</span>
              <strong class="home-m3-workspace__card-value">${esc(state.currentUsername ? `${favoriteCount}件` : '設定待ち')}</strong>
            </div>
          </div>
          <p class="home-m3-workspace__card-meta">${esc(state.currentUsername ? 'よく使う導線をまとめて開けます。' : '個人設定後に保存されます。')}</p>
          <div class="home-m3-pill-row home-m3-pill-row--compact">
            <span class="home-m3-pill ${favoriteCount > 0 ? 'home-m3-pill--active' : 'home-m3-pill--soft'}">${esc(favoriteCount > 0 ? '保存済み' : '未登録')}</span>
            <span class="home-m3-pill ${noticeCard.tone ? `home-m3-pill--${noticeCard.tone}` : 'home-m3-pill--soft'}">${esc(noticeCard.value || '0件')}</span>
          </div>
        </button>
      </div>
    </div>
  `;
  return;

  section.hidden = false;
  section.innerHTML = `
    <div class="portal-rail-shell portal-rail-shell--clean">
      <section
        class="portal-personal-card portal-personal-card--profile portal-personal-card--${focusCard.tone || 'idle'}"
        data-dash-target="${esc(state.currentUsername ? focusCard.target : DASH_TARGETS.PROFILE)}"
        tabindex="0"
        role="button"
        aria-label="プロフィールと今日のフォーカスを開く"
      >
        <div class="portal-personal-card-head">
          <div>
            <p class="portal-personal-kicker">個人スペース</p>
            <h2 class="portal-personal-title">${esc(username)}</h2>
            <p class="portal-personal-meta">${esc(personalMeta)}</p>
          </div>
          <span class="portal-personal-badge">${esc(focusCard.value || '確認')}</span>
        </div>

        <div class="portal-personal-focus">
          <div class="portal-personal-focus-label">${esc(focusCard.title || '今日のフォーカス')}</div>
          <p class="portal-personal-focus-copy">${esc(focusCard.meta || focusCard.emptyText || 'プロフィールを設定すると個人スペースが使えます。')}</p>
        </div>

        <div class="portal-personal-focus-list">
          ${renderPersonalList(focusCard.items, focusCard.emptyText)}
        </div>

        <div class="portal-personal-inline-metrics">
          <button type="button" class="portal-personal-inline-metric" data-dash-target="${esc(attendanceTarget)}">
            <span class="portal-personal-inline-label">勤怠</span>
            <strong class="portal-personal-inline-value">${esc(buildAttendanceValueLabel(attendanceCard, Boolean(state.currentUsername)))}</strong>
          </button>
          <button type="button" class="portal-personal-inline-metric" data-dash-target="${esc(favoritesTarget)}">
            <span class="portal-personal-inline-label">お気に入り</span>
            <strong class="portal-personal-inline-value">${state.currentUsername ? esc(favoriteCount > 0 ? `${favoriteCount}件` : '開く') : '要設定'}</strong>
          </button>
        </div>
      </section>

      <section
        class="portal-personal-card portal-personal-card--task portal-personal-card--${taskCard.tone || 'idle'}"
        data-dash-target="${esc(taskTarget)}"
        tabindex="0"
        role="button"
        aria-label="マイタスクを開く"
      >
        <div class="portal-personal-card-head">
          <div>
            <h3 class="portal-personal-section-title">マイタスク</h3>
            <p class="portal-personal-section-copy">${esc(taskCard.meta || '受信したタスクを確認')}</p>
          </div>
          <span class="portal-personal-count">${esc(state.currentUsername ? taskCard.value : '要設定')}</span>
        </div>

        <div class="portal-personal-card-list">
          ${renderPersonalList(taskCard.items, taskCard.emptyText)}
        </div>

        ${renderPersonalChips(taskCard.chips)}
      </section>

      <section
        class="portal-personal-card portal-personal-card--attendance portal-personal-card--${attendanceCard.tone || 'idle'}"
        data-dash-target="${esc(attendanceTarget)}"
        tabindex="0"
        role="button"
        aria-label="勤怠を開く"
      >
        <div class="portal-personal-card-head">
          <div>
            <h3 class="portal-personal-section-title">勤怠サマリー</h3>
            <p class="portal-personal-section-copy">${esc(attendanceCard.meta || '今日の勤怠を確認')}</p>
          </div>
          <span class="portal-personal-count">${esc(state.currentUsername ? attendanceCard.value : '要設定')}</span>
        </div>

        <div class="portal-personal-card-list">
          ${renderPersonalList(attendanceCard.items, attendanceCard.emptyText)}
        </div>

        ${renderPersonalChips(attendanceCard.chips)}
      </section>

      <div class="portal-personal-mini-grid">
        <section
          class="portal-personal-card portal-personal-card--mini"
          data-dash-target="${esc(favoritesTarget)}"
          tabindex="0"
          role="button"
          aria-label="お気に入りを開く"
        >
          <div class="portal-personal-mini-label">お気に入り</div>
          <div class="portal-personal-mini-value">${state.currentUsername ? esc(favoriteCount > 0 ? `${favoriteCount}件` : '開く') : '要設定'}</div>
          <p class="portal-personal-mini-copy">${state.currentUsername ? 'よく使う個人リンクへ移動' : 'プロフィール設定後に利用できます'}</p>
        </section>

        <section
          class="portal-personal-card portal-personal-card--mini portal-personal-card--${noticeCard.tone || 'idle'}"
          data-dash-target="${esc(DASH_TARGETS.NOTICE)}"
          tabindex="0"
          role="button"
          aria-label="通知を開く"
        >
          <div class="portal-personal-mini-label">通知</div>
          <div class="portal-personal-mini-value">${esc(noticeCard.value || '0件')}</div>
          <p class="portal-personal-mini-copy">${esc(noticeCard.meta || '共有トピックを確認')}</p>
        </section>
      </div>
    </div>
  `;
}

function renderHomeHero(host, {
  today,
  username,
  profile,
  taskCard,
  attendanceCard,
  noticeCard,
  focusCard,
  favoriteCount,
}) {
  if (!host) return;

  const publicLinkCount = Array.isArray(state.allCategories)
    ? state.allCategories.filter(category => !category?.isPrivate).length
    : 0;
  const favoriteLinks = getFavoriteSharedLinks();
  const favoriteCountLabel = state.currentUsername ? `${favoriteCount}件` : '設定してください';
  const favoriteActionTarget = state.currentUsername
    ? (favoriteCount > 0 ? DASH_TARGETS.FAVORITES : DASH_TARGETS.SHARED_LINKS)
    : DASH_TARGETS.PROFILE;
  const primaryTarget = state.currentUsername ? (focusCard.target || DASH_TARGETS.PROFILE) : DASH_TARGETS.PROFILE;
  const primaryLabel = state.currentUsername ? '今日の優先事項へ' : 'プロフィールを設定';
  const summaryCopy = state.currentUsername
    ? (focusCard.meta || '今日の優先度が高い導線をここから開けます。')
    : 'ユーザーネームを設定すると、個人スペースと保存系の機能が使えるようになります。';
  const chips = [
    formatDateLabel(today),
    profile.department || 'プロフィール未設定',
    profile.roleLabel || (state.currentUsername ? '共通ビュー' : '設定が必要です'),
  ];
  const stats = [
    {
      target: DASH_TARGETS.NOTICE,
      tone: noticeCard.tone || 'clear',
      symbol: 'notifications',
      label: 'お知らせ',
      value: noticeCard.value || '0件',
      meta: noticeCard.meta || '確認事項はありません',
    },
    {
      target: state.currentUsername ? DASH_TARGETS.TASK_RECEIVED : DASH_TARGETS.PROFILE,
      tone: taskCard.tone || 'clear',
      symbol: 'task_alt',
      label: 'タスク',
      value: state.currentUsername ? taskCard.value : '設定待ち',
      meta: state.currentUsername ? (taskCard.meta || '今日のタスクを確認') : 'プロフィール設定後に有効になります',
    },
    {
      target: DASH_TARGETS.SHARED_LINKS,
      tone: 'clear',
      symbol: 'dashboard_customize',
      label: '共有リンク',
      value: `${publicLinkCount}カテゴリ`,
      meta: publicLinkCount > 0 ? '必要なリンクへすぐ移動できます' : '共有カテゴリを準備中です',
    },
    {
      target: state.currentUsername ? DASH_TARGETS.FAVORITES : DASH_TARGETS.PROFILE,
      tone: favoriteCount > 0 ? 'active' : 'idle',
      symbol: 'star',
      label: 'お気に入り',
      value: state.currentUsername ? `${favoriteCount}件` : '設定待ち',
      meta: state.currentUsername ? 'よく使う導線をまとめて開けます' : '個人設定後に保存されます',
    },
  ];
  const quickActions = [
    {
      target: state.currentUsername ? DASH_TARGETS.TASK_RECEIVED : DASH_TARGETS.PROFILE,
      tone: taskCard.tone || 'clear',
      symbol: 'task_alt',
      label: 'タスク',
      value: state.currentUsername ? taskCard.value : '設定',
      meta: state.currentUsername ? (taskCard.meta || '受信タスク') : 'プロフィール',
    },
    {
      target: state.currentUsername ? DASH_TARGETS.ATTENDANCE : DASH_TARGETS.PROFILE,
      tone: attendanceCard.tone || 'clear',
      symbol: 'calendar_month',
      label: '勤怠',
      value: buildAttendanceValueLabel(attendanceCard, Boolean(state.currentUsername)),
      meta: attendanceCard.meta || '今日の勤怠',
    },
    {
      target: DASH_TARGETS.NOTICE,
      tone: noticeCard.tone || 'clear',
      symbol: 'notifications',
      label: 'お知らせ',
      value: noticeCard.value || '0件',
      meta: noticeCard.meta || '未読なし',
    },
    {
      target: DASH_TARGETS.SHARED_LINKS,
      tone: 'clear',
      symbol: 'grid_view',
      label: '共有リンク',
      value: `${publicLinkCount}カテゴリ`,
      meta: 'リンク集',
    },
    {
      target: favoriteActionTarget,
      tone: favoriteLinks.length > 0 ? 'active' : 'idle',
      symbol: 'star',
      label: 'お気に入り',
      value: favoriteCountLabel,
      meta: favoriteLinks.length > 0 ? 'すぐ開く' : '未登録',
    },
    {
      target: DASH_TARGETS.PROFILE,
      tone: state.currentUsername ? 'clear' : 'active',
      symbol: 'person',
      label: 'プロフィール',
      value: profile.department || (state.currentUsername ? '共通' : '未設定'),
      meta: profile.roleLabel || 'ユーザー設定',
    },
  ];
  const favoritePreview = favoriteLinks.slice(0, DASH_FAVORITE_LIMIT);
  const favoriteOverflowCount = Math.max(0, favoriteLinks.length - favoritePreview.length);

  host.innerHTML = `
    <section class="home-simple-shell" aria-label="ホーム">
      <header class="home-simple-header">
        <div class="home-simple-heading">
          <p class="home-simple-kicker">HOME</p>
          <h1 class="home-simple-title">${esc(state.currentUsername ? `${username} さん` : 'ホーム')}</h1>
        </div>
        <div class="home-simple-chip-row">
          ${chips.map(chip => `<span class="home-simple-chip">${esc(chip)}</span>`).join('')}
        </div>
      </header>

      <div class="home-simple-main">
        <button
          type="button"
          class="home-simple-focus home-simple-focus--${esc(focusCard.tone || 'idle')}"
          data-dash-target="${esc(primaryTarget)}"
        >
          <span class="home-simple-focus__icon">
            <span class="material-symbols-rounded" aria-hidden="true">flag</span>
          </span>
          <span class="home-simple-focus__body">
            <span class="home-simple-label">${esc(focusCard.title || '今日の確認')}</span>
            <strong class="home-simple-focus__value">${esc(state.currentUsername ? (focusCard.value || '確認') : 'プロフィール設定')}</strong>
            <span class="home-simple-meta">${esc(state.currentUsername ? (focusCard.meta || '最初に見る内容') : '個人スペースを有効にします')}</span>
            ${renderHomeSimpleList(focusCard.items, focusCard.emptyText)}
          </span>
          <span class="material-symbols-rounded home-simple-arrow" aria-hidden="true">arrow_forward</span>
        </button>

        <div class="home-simple-actions" aria-label="主要メニュー">
          ${quickActions.map(action => `
            <button
              type="button"
              class="home-simple-action home-simple-action--${esc(action.tone || 'clear')}"
              data-dash-target="${esc(action.target)}"
            >
              <span class="home-simple-action__icon">
                <span class="material-symbols-rounded" aria-hidden="true">${esc(action.symbol)}</span>
              </span>
              <span class="home-simple-action__body">
                <span class="home-simple-action__label">${esc(action.label)}</span>
                <strong class="home-simple-action__value">${esc(action.value)}</strong>
                <span class="home-simple-action__meta">${esc(action.meta)}</span>
              </span>
            </button>
          `).join('')}
        </div>

        <section class="home-simple-favorites" aria-label="お気に入り共有リンク">
          <div class="home-simple-section-head">
            <div>
              <p class="home-simple-section-kicker">SHORTCUTS</p>
              <h2 class="home-simple-section-title">お気に入り共有リンク</h2>
            </div>
            <button
              type="button"
              class="home-simple-text-action"
              data-dash-target="${esc(favoriteActionTarget)}"
            >
              <span>${esc(state.currentUsername ? (favoriteCount > 0 ? '一覧' : '共有リンク') : '設定')}</span>
              <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            </button>
          </div>

          <div class="home-simple-favorite-grid${favoritePreview.length === 0 ? ' home-simple-favorite-grid--empty' : ''}">
            ${renderHomeSimpleFavoriteLinks(favoritePreview, Boolean(state.currentUsername))}
            ${favoriteOverflowCount > 0 ? `
              <button
                type="button"
                class="home-simple-favorite-more"
                data-dash-target="${esc(DASH_TARGETS.FAVORITES)}"
              >
                <span class="home-simple-favorite-more__icon material-symbols-rounded" aria-hidden="true">more_horiz</span>
                <span>他 ${esc(String(favoriteOverflowCount))} 件</span>
              </button>
            ` : ''}
          </div>
        </section>
      </div>
    </section>
  `;
  return;

  host.innerHTML = `
    <section class="home-m3-hero">
      <div class="home-m3-hero__top">
        <div class="home-m3-hero__copy">
          <p class="home-m3-hero__eyebrow">Portal Home</p>
          <h1 class="home-m3-hero__title">${esc(state.currentUsername ? `${username} さんのホーム` : 'ホームを整える')}</h1>
          <p class="home-m3-hero__subtitle">${esc(state.currentUsername ? 'Material You の落ち着いた面構成で、次に見るべき導線をすぐ判断できるホームです。' : 'プロフィールを設定すると個人向けの保存や優先事項が使えるようになります。')}</p>
        </div>

        <div class="home-m3-hero__actions">
          <button
            type="button"
            class="home-m3-button home-m3-button--primary"
            data-dash-target="${esc(primaryTarget)}"
          >
            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            <span>${esc(state.currentUsername ? '今日の優先事項へ' : 'プロフィールを設定')}</span>
          </button>
          <button
            type="button"
            class="home-m3-button"
            data-dash-target="${esc(DASH_TARGETS.SHARED_LINKS)}"
          >
            <span class="material-symbols-rounded" aria-hidden="true">grid_view</span>
            <span>共有リンクを見る</span>
          </button>
        </div>
      </div>

      <div class="home-m3-chip-row">
        ${chips.map(chip => `<span class="home-m3-chip">${esc(chip)}</span>`).join('')}
      </div>

      <div class="home-m3-overview-grid">
        <button
          type="button"
          class="home-m3-overview-card home-m3-overview-card--wide home-m3-overview-card--accent"
          data-dash-target="${esc(primaryTarget)}"
        >
          <div class="home-m3-overview-card__head">
            <span class="home-m3-overview-card__icon">
              <span class="material-symbols-rounded" aria-hidden="true">explore</span>
            </span>
            <div>
              <span class="home-m3-overview-card__label">${esc(focusCard.title || '今日の優先事項')}</span>
              <strong class="home-m3-overview-card__value">${esc(state.currentUsername ? (focusCard.value || '確認') : '設定から開始')}</strong>
            </div>
          </div>
          <p class="home-m3-overview-card__meta">${esc(state.currentUsername ? (focusCard.meta || '優先事項からすぐに作業を始められます。') : '個人スペースの設定を済ませると、ここに最初の導線が表示されます。')}</p>
          ${renderPersonalList(focusCard.items, focusCard.emptyText)}
        </button>

        ${stats.map(stat => `
          <button
            type="button"
            class="home-m3-overview-card home-m3-overview-card--${esc(stat.tone || 'soft')}"
            data-dash-target="${esc(stat.target)}"
          >
            <div class="home-m3-overview-card__head">
              <span class="home-m3-overview-card__icon">
                <span class="material-symbols-rounded" aria-hidden="true">${esc(stat.symbol)}</span>
              </span>
              <div>
                <span class="home-m3-overview-card__label">${esc(stat.label)}</span>
                <strong class="home-m3-overview-card__value">${esc(stat.value)}</strong>
              </div>
            </div>
            <p class="home-m3-overview-card__meta">${esc(stat.meta)}</p>
          </button>
        `).join('')}
      </div>
    </section>
  `;

  const overviewCards = host.querySelectorAll('.home-m3-overview-card:not(.home-m3-overview-card--wide)');
  const favoriteCard = overviewCards[overviewCards.length - 1];
  if (favoriteCard) {
    favoriteCard.replaceWith(buildFavoriteOverviewCard({
      favoriteLinks,
      favoriteCountLabel,
      favoriteActionTarget,
      isProfileReady: Boolean(state.currentUsername),
    }));
  }
  return;

  host.innerHTML = `
    <section class="portal-home-command-surface">
      <div class="portal-home-command-top">
        <div class="portal-home-command-copy">
          <p class="portal-home-command-kicker">Portal Home</p>
          <h1 class="portal-home-command-title">${esc(state.currentUsername ? `${username} さんのホーム` : 'ホームを整える')}</h1>
          <p class="portal-home-command-subtitle">${esc(summaryCopy)}</p>
        </div>

        <div class="portal-home-command-actions">
          <button
            type="button"
            class="portal-home-command-btn portal-home-command-btn--primary"
            data-dash-target="${esc(primaryTarget)}"
          >
            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            <span>${esc(primaryLabel)}</span>
          </button>
          <button
            type="button"
            class="portal-home-command-btn"
            data-dash-target="${esc(DASH_TARGETS.SHARED_LINKS)}"
          >
            <span class="material-symbols-rounded" aria-hidden="true">grid_view</span>
            <span>共有リンクを見る</span>
          </button>
        </div>
      </div>

      <div class="portal-home-command-chip-row">
        ${chips.map(chip => `
          <span class="portal-home-command-chip">${esc(chip)}</span>
        `).join('')}
      </div>

      <div class="portal-home-command-grid">
        ${stats.map(stat => `
          <button
            type="button"
            class="portal-home-command-stat portal-home-command-stat--${esc(stat.tone || 'clear')}"
            data-dash-target="${esc(stat.target)}"
          >
            <span class="portal-home-command-stat-icon">
              <span class="material-symbols-rounded" aria-hidden="true">${esc(stat.symbol)}</span>
            </span>
            <span class="portal-home-command-stat-copy">
              <span class="portal-home-command-stat-label">${esc(stat.label)}</span>
              <strong class="portal-home-command-stat-value">${esc(stat.value)}</strong>
              <span class="portal-home-command-stat-meta">${esc(stat.meta)}</span>
            </span>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function renderHomeSimpleList(items, emptyText) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<span class="home-simple-list home-simple-list--empty">${esc(emptyText || '表示できる項目はありません')}</span>`;
  }

  return `
    <span class="home-simple-list">
      ${items.slice(0, DASH_LIST_LIMIT).map(item => `
        <span class="home-simple-list__item">
          <strong>${esc(item.title || '名称未設定')}</strong>
          ${item.meta ? `<span>${esc(item.meta)}</span>` : ''}
        </span>
      `).join('')}
    </span>
  `;
}

function renderHomeSimpleFavoriteLinks(links, isProfileReady) {
  if (!isProfileReady) {
    return '<div class="home-simple-empty">プロフィール未設定</div>';
  }

  if (!Array.isArray(links) || links.length === 0) {
    return '<div class="home-simple-empty">お気に入り未登録</div>';
  }

  return links.map(link => `
    <button
      type="button"
      class="home-simple-favorite-link"
      data-favorite-card-id="${esc(link.id)}"
      aria-label="${esc(`${link.label}を開く`)}"
      title="${esc(link.meta || link.label)}"
    >
      <span class="home-simple-favorite-link__icon">
        ${link.brandIconHtml || `<span class="material-symbols-rounded" aria-hidden="true">${esc(link.symbol)}</span>`}
      </span>
      <span class="home-simple-favorite-link__body">
        <strong>${esc(link.label)}</strong>
      </span>
    </button>
  `).join('');
}

function renderPersonalList(items, emptyText) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="portal-personal-empty">${esc(emptyText || '表示できる項目はありません')}</div>`;
  }

  return items.map(item => `
    <div class="portal-personal-list-item">
      <strong class="portal-personal-list-title">${esc(item.title || '名称未設定')}</strong>
      ${item.meta ? `<span class="portal-personal-list-meta">${esc(item.meta)}</span>` : ''}
    </div>
  `).join('');
}

function renderPersonalChips(chips) {
  if (!Array.isArray(chips) || chips.length === 0) return '';
  return `
    <div class="portal-personal-chip-row">
      ${chips.map(chip => `
        <span class="portal-personal-chip${chip.tone ? ` portal-personal-chip--${chip.tone}` : ''}">${esc(chip.text)}</span>
      `).join('')}
    </div>
  `;
}

function buildFavoriteOverviewCard({
  favoriteLinks,
  favoriteCountLabel,
  favoriteActionTarget,
  isProfileReady,
}) {
  const card = document.createElement('section');
  card.className = `home-m3-overview-card home-m3-overview-card--${favoriteLinks.length > 0 ? 'active' : 'idle'} home-m3-overview-card--favorite`;

  const actionLabel = isProfileReady
    ? (favoriteLinks.length > 0 ? '一覧を見る' : '共有リンクを見る')
    : 'プロフィール設定';
  const actionMeta = isProfileReady
    ? 'よく使う共有リンクをホームから直接開けます'
    : 'ユーザー名を設定するとお気に入りを表示できます';
  const previewLinks = favoriteLinks.slice(0, DASH_LIST_LIMIT);
  const overflowCount = Math.max(0, favoriteLinks.length - previewLinks.length);

  card.innerHTML = `
    <div class="home-m3-overview-card__head">
      <span class="home-m3-overview-card__icon">
        <span class="material-symbols-rounded" aria-hidden="true">star</span>
      </span>
      <div>
        <span class="home-m3-overview-card__label">お気に入り</span>
        <strong class="home-m3-overview-card__value">${esc(favoriteCountLabel)}</strong>
      </div>
    </div>
    <p class="home-m3-overview-card__meta">${esc(actionMeta)}</p>
    <div class="home-m3-favorite-links${previewLinks.length === 0 ? ' home-m3-favorite-links--empty' : ''}">
      ${renderFavoriteLinkButtons(previewLinks, isProfileReady)}
      ${overflowCount > 0 ? `
        <div class="home-m3-pill-row home-m3-pill-row--compact">
          <span class="home-m3-pill home-m3-pill--soft">他 ${esc(String(overflowCount))} 件</span>
        </div>
      ` : ''}
    </div>
    <button
      type="button"
      class="home-m3-inline-action home-m3-inline-action--compact home-m3-favorite-links__action"
      data-dash-target="${esc(favoriteActionTarget)}"
    >${esc(actionLabel)}</button>
  `;

  return card;
}

function renderFavoriteLinkButtons(links, isProfileReady) {
  if (!isProfileReady) {
    return '<div class="home-m3-empty">ホームのお気に入り表示はログイン後に有効になります。</div>';
  }

  if (!Array.isArray(links) || links.length === 0) {
    return '<div class="home-m3-empty">共有リンクで星を付けると、ここから直接開けます。</div>';
  }

  return links.map(link => `
    <button
      type="button"
      class="home-m3-favorite-link"
      data-favorite-card-id="${esc(link.id)}"
      aria-label="${esc(`${link.label}を開く`)}"
    >
      <span class="home-m3-favorite-link__icon">
        ${link.brandIconHtml || `<span class="material-symbols-rounded" aria-hidden="true">${esc(link.symbol)}</span>`}
      </span>
      <span class="home-m3-favorite-link__body">
        <strong class="home-m3-favorite-link__label">${esc(link.label)}</strong>
        <span class="home-m3-favorite-link__meta">${esc(link.meta)}</span>
      </span>
      <span class="material-symbols-rounded home-m3-favorite-link__arrow" aria-hidden="true">${esc(link.arrow)}</span>
    </button>
  `).join('');
}

function getFavoriteSharedLinks() {
  const favoriteIds = Array.isArray(state.personalFavorites) ? state.personalFavorites : [];
  if (!favoriteIds.length) return [];

  const publicCardsById = new Map(
    (Array.isArray(state.allCards) ? state.allCards : []).map(card => [card.id, card])
  );
  const publicCategoriesById = new Map(
    (Array.isArray(state.allCategories) ? state.allCategories : [])
      .filter(category => !category?.isPrivate)
      .map(category => [category.id || category.docId, category.label || '共有リンク'])
  );

  return favoriteIds
    .map(id => publicCardsById.get(id))
    .filter(Boolean)
    .map(card => ({
      id: card.id,
      label: card.label || '共有リンク',
      meta: buildFavoriteLinkMeta(card, publicCategoriesById),
      brandIconHtml: getBrandIconHtmlForCard(card),
      symbol: card.url === 'solar:open' ? 'wb_sunny' : 'link',
      arrow: card.url === 'solar:open' ? 'arrow_forward' : 'open_in_new',
    }));
}

function buildFavoriteLinkMeta(card, publicCategoriesById) {
  const categoryLabel = publicCategoriesById.get(card.category) || '共有リンク';
  if (card.url === 'solar:open') return `${categoryLabel} / 天気パネル`;

  const rawUrl = `${card.url || ''}`.trim();
  if (!rawUrl || rawUrl === '#') return `${categoryLabel} / URL未設定`;

  try {
    const parsed = new URL(rawUrl, window.location.href);
    const host = parsed.host || parsed.pathname || '共有リンク';
    return `${categoryLabel} / ${host}`;
  } catch (_) {
    return categoryLabel;
  }
}

function buildPersonalMeta(profile) {
  if (!state.currentUsername) {
    return 'プロフィールを設定すると個人スペースが使えます';
  }
  const tokens = [profile.department, profile.roleLabel].filter(Boolean);
  return tokens.length > 0 ? tokens.join(' / ') : formatDateLabel(new Date());
}

function buildAttendanceValueLabel(card, isProfileReady) {
  if (!isProfileReady) return '要設定';
  if (!card) return '確認';
  if (card.value === '未入力') return '未入力';
  if (card.value === '通常') return '出勤中';
  return card.value;
}

function bindDashboardEvents(section) {
  if (!section || section.dataset.dashBound === 'true') return;
  section.dataset.dashBound = 'true';

  section.addEventListener('click', event => {
    const favoriteLink = event.target.closest('[data-favorite-card-id]');
    if (favoriteLink && section.contains(favoriteLink)) {
      event.preventDefault();
      void deps.openFavoriteLink?.(favoriteLink.dataset.favoriteCardId || '');
      return;
    }
    const card = event.target.closest('[data-dash-target]');
    if (!card || !section.contains(card)) return;
    void openDashboardTarget(card.dataset.dashTarget || '');
  });

  section.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-dash-target]');
    if (!card || !section.contains(card)) return;
    event.preventDefault();
    void openDashboardTarget(card.dataset.dashTarget || '');
  });
}

async function openDashboardTarget(target) {
  try {
    switch (target) {
      case DASH_TARGETS.PROFILE:
        await deps.openProfileSettings?.();
        return;
      case DASH_TARGETS.TASK_RECEIVED:
        await deps.openReceivedTasks?.();
        return;
      case DASH_TARGETS.TASK_SENT:
        await deps.openSentTasks?.();
        return;
      case DASH_TARGETS.REQUEST_RECEIVED:
        await deps.openReceivedRequests?.();
        return;
      case DASH_TARGETS.REQUEST_SENT:
        await deps.openSentRequests?.();
        return;
      case DASH_TARGETS.ATTENDANCE:
        await deps.openTodayAttendance?.();
        return;
      case DASH_TARGETS.SEARCH:
        await deps.focusSearch?.();
        return;
      case DASH_TARGETS.NOTICE:
        await deps.openNoticeBoard?.();
        return;
      case DASH_TARGETS.SHARED_LINKS:
        await deps.openSharedLinks?.();
        return;
      case DASH_TARGETS.SERVICE_PICKER:
        await deps.openServicePicker?.();
        return;
      case DASH_TARGETS.FAVORITES:
        await deps.openFavorites?.();
        return;
      case DASH_TARGETS.INVITE:
        await deps.openInviteCode?.();
        return;
      default:
        return;
    }
  } catch (err) {
    console.error('Dashboard navigation error:', err);
  }
}

function getDashboardActionLabel(target) {
  switch (target) {
    case DASH_TARGETS.PROFILE:
      return 'プロフィールを開く';
    case DASH_TARGETS.TASK_RECEIVED:
      return '受信タスクを開く';
    case DASH_TARGETS.TASK_SENT:
      return '依頼タスクを開く';
    case DASH_TARGETS.REQUEST_RECEIVED:
      return '受信依頼を開く';
    case DASH_TARGETS.REQUEST_SENT:
      return '送信依頼を開く';
    case DASH_TARGETS.ATTENDANCE:
      return '勤怠を開く';
    case DASH_TARGETS.SEARCH:
      return '検索バーに移動';
    case DASH_TARGETS.NOTICE:
      return '通知を開く';
    case DASH_TARGETS.SHARED_LINKS:
      return '共有リンクを開く';
    case DASH_TARGETS.SERVICE_PICKER:
      return 'サービスを追加';
    case DASH_TARGETS.FAVORITES:
      return 'お気に入りを開く';
    case DASH_TARGETS.INVITE:
      return '招待コードを開く';
    default:
      return '画面を開く';
  }
}

function buildTaskCard(todayKey) {
  const activeTasks = getActiveReceivedTasks(todayKey);
  const pendingCount = activeTasks.filter(task => task.status === 'pending').length;
  const acceptedCount = activeTasks.filter(task => task.status === 'accepted').length;
  const overdueCount = activeTasks.filter(task => task.dueDate && task.dueDate < todayKey).length;
  const todayCount = activeTasks.filter(task => task.dueDate === todayKey).length;

  return {
    title: '今日のタスク',
    value: `${activeTasks.length}件`,
    meta: activeTasks.length > 0
      ? `承諾待ち ${pendingCount}件 / 進行中 ${acceptedCount}件`
      : '受信タスクはありません',
    tone: overdueCount > 0 ? 'alert' : (pendingCount > 0 || todayCount > 0 ? 'active' : 'clear'),
    chips: [
      overdueCount > 0 ? { text: `期限超過 ${overdueCount}件`, tone: 'alert' } : null,
      todayCount > 0 ? { text: `今日期限 ${todayCount}件`, tone: 'active' } : null,
      acceptedCount > 0 ? { text: `進行中 ${acceptedCount}件`, tone: 'clear' } : null,
    ].filter(Boolean),
    items: activeTasks.slice(0, DASH_LIST_LIMIT).map(task => ({
      title: task.title || '名称未設定',
      meta: [
        TASK_STATUS_LABEL[task.status]?.text || task.status || '',
        task.assignedBy ? `依頼 ${task.assignedBy}` : '',
        formatDueLabel(task.dueDate, todayKey),
      ].filter(Boolean).join(' / '),
    })),
    emptyText: '受信タスクはありません',
    target: DASH_TARGETS.TASK_RECEIVED,
    actionLabel: getDashboardActionLabel(DASH_TARGETS.TASK_RECEIVED),
  };
}

function buildAttendanceCard(todayKey) {
  const attendance = state.todayAttendanceDate === todayKey
    ? (state.todayAttendance || null)
    : (state.attendanceData?.[todayKey] || null);
  const siteMap = new Map((state.attendanceSites || []).map(site => [site.id, site]));

  if (!attendance) {
    return {
      title: '勤怠サマリー',
      value: '未入力',
      meta: '今日の勤怠がまだ登録されていません',
      tone: 'alert',
      chips: [],
      items: [],
      emptyText: 'カレンダーから今日の勤怠を入力してください',
      target: DASH_TARGETS.ATTENDANCE,
      actionLabel: getDashboardActionLabel(DASH_TARGETS.ATTENDANCE),
    };
  }

  const typeKey = attendance.type || 'normal';
  const typeLabel = ATTENDANCE_TYPE_LABELS[typeKey] || typeKey;
  const siteEntries = buildAttendanceSiteEntries(attendance, siteMap);
  const totalHours = siteEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const value = typeKey !== 'normal'
    ? typeLabel
    : (siteEntries.length > 0 ? `${siteEntries.length}現場` : '通常');
  const meta = typeKey !== 'normal'
    ? `勤務区分 ${typeLabel}`
    : (siteEntries.length > 0 ? `合計 ${fmtHours(totalHours)}h` : '今日の勤務内容を確認');

  return {
    title: '勤怠サマリー',
    value,
    meta,
    tone: typeKey !== 'normal' ? 'clear' : (siteEntries.length > 0 ? 'active' : 'idle'),
    chips: [
      siteEntries.length > 0 ? { text: `${siteEntries.length}現場`, tone: 'clear' } : null,
      attendance.hayade ? { text: `早出 ${attendance.hayade}`, tone: 'active' } : null,
      attendance.zangyo ? { text: `残業 ${attendance.zangyo}`, tone: 'active' } : null,
    ].filter(Boolean),
    items: siteEntries.slice(0, DASH_LIST_LIMIT).map(entry => ({
      title: [entry.code, entry.name].filter(Boolean).join(' '),
      meta: `${fmtHours(entry.hours)}h`,
    })),
    emptyText: attendance.note ? `メモ: ${attendance.note}` : '今日の勤務内容はありません',
    target: DASH_TARGETS.ATTENDANCE,
    actionLabel: getDashboardActionLabel(DASH_TARGETS.ATTENDANCE),
  };
}

function buildNoticeCard() {
  const noticeSource = Array.isArray(state.visibleNotices)
    ? state.visibleNotices
    : (state.allNotices || []);
  const pendingAck = getPendingAckNotices();
  const unread = noticeSource.filter(notice =>
    !state.readNoticeIds.has(notice.id) && !notice?.requireAcknowledgement
  );
  const urgentUnread = unread.filter(notice => notice.priority === 'urgent');
  const listSource = (pendingAck.length > 0 ? pendingAck : (urgentUnread.length > 0 ? urgentUnread : unread))
    .slice()
    .sort((a, b) => compareTimestamp(b.createdAt, a.createdAt));

  return {
    title: pendingAck.length > 0 ? '確認待ちのお知らせ' : '未読のお知らせ',
    value: `${pendingAck.length > 0 ? pendingAck.length : urgentUnread.length || unread.length}件`,
    meta: pendingAck.length > 0
      ? `要確認 ${pendingAck.length}件 / 未読 ${unread.length}件`
      : (unread.length > 0 ? `未読 ${unread.length}件` : '未読はありません'),
    tone: pendingAck.length > 0 ? 'alert' : (urgentUnread.length > 0 ? 'alert' : (unread.length > 0 ? 'active' : 'clear')),
    chips: [
      pendingAck.length > 0 ? { text: `確認待ち ${pendingAck.length}件`, tone: 'alert' } : null,
      urgentUnread.length > 0 ? { text: `重要 ${urgentUnread.length}件`, tone: 'alert' } : null,
    ].filter(Boolean),
    items: listSource.slice(0, DASH_LIST_LIMIT).map(notice => ({
      title: notice.title || '名称未設定',
      meta: [
        notice.requireAcknowledgement ? '確認必須' : (notice.priority === 'urgent' ? '重要' : '通常'),
        formatNoticeDate(notice.createdAt),
      ].filter(Boolean).join(' / '),
    })),
    emptyText: '確認待ちのお知らせはありません',
    target: DASH_TARGETS.NOTICE,
    actionLabel: getDashboardActionLabel(DASH_TARGETS.NOTICE),
  };
}

function buildFocusCard(todayKey) {
  const profile = getDashboardProfile();
  if (!profile.department) {
    return {
      title: '今日のフォーカス',
      value: '要設定',
      meta: '所属部署と役割を設定すると今日の優先事項を表示できます。',
      tone: 'idle',
      chips: [],
      items: [],
      emptyText: 'プロフィール設定から所属部署と役割を設定してください',
      target: DASH_TARGETS.PROFILE,
      actionLabel: getDashboardActionLabel(DASH_TARGETS.PROFILE),
    };
  }

  const pendingAck = getPendingAckNotices();
  const activeTasks = getActiveReceivedTasks(todayKey);
  const overdueTasks = activeTasks.filter(task => task.dueDate && task.dueDate < todayKey);
  const todayTasks = activeTasks.filter(task => task.dueDate === todayKey);
  const openRequests = getOpenDepartmentRequests();
  const requestReplies = (state.sentRequests || []).filter(req => req.notifyCreator === true && !req.archived);
  const doneNotifies = (state.sentTasks || []).filter(task => task.status === 'done' && !task.notifiedDone);
  const attendanceInfo = getAttendanceFocusInfo(todayKey);
  const departmentKey = resolveDepartmentKey(profile.department);
  const candidates = [];

  const addCandidate = (priority, title, meta, target) => {
    candidates.push({ priority, title, meta, target });
  };

  if (profile.roleType === 'leader' || profile.roleType === 'manager') {
    if (openRequests.length > 0) {
      addCandidate(0, `自部署待ち依頼 ${openRequests.length}件`, '部署内で優先して確認したい依頼です', DASH_TARGETS.REQUEST_RECEIVED);
    }
    if (doneNotifies.length > 0) {
      addCandidate(1, `完了報告 ${doneNotifies.length}件`, '依頼したタスクの完了連絡です', DASH_TARGETS.TASK_SENT);
    }
  }

  switch (departmentKey) {
    case 'sales':
      if (requestReplies.length > 0) addCandidate(0, `返答待ち依頼 ${requestReplies.length}件`, '他部署へ出した依頼の返答待ちです', DASH_TARGETS.REQUEST_SENT);
      if (pendingAck.length > 0) addCandidate(1, `確認待ちのお知らせ ${pendingAck.length}件`, '重要なお知らせがあります', DASH_TARGETS.NOTICE);
      break;
    case 'design':
      if (pendingAck.length > 0) addCandidate(0, `確認待ちのお知らせ ${pendingAck.length}件`, '設計関連のお知らせを確認してください', DASH_TARGETS.NOTICE);
      if (openRequests.length > 0) addCandidate(1, `未対応依頼 ${openRequests.length}件`, '部門間依頼の確認が必要です', DASH_TARGETS.REQUEST_RECEIVED);
      break;
    case 'production':
    case 'factory':
    case 'construction':
      if (attendanceInfo.summary) addCandidate(attendanceInfo.priority, attendanceInfo.summary, attendanceInfo.meta, DASH_TARGETS.ATTENDANCE);
      if (openRequests.length > 0) addCandidate(1, `自部署待ち依頼 ${openRequests.length}件`, '部門間依頼の確認が必要です', DASH_TARGETS.REQUEST_RECEIVED);
      if (pendingAck.length > 0) addCandidate(1, `確認待ちのお知らせ ${pendingAck.length}件`, '重要なお知らせがあります', DASH_TARGETS.NOTICE);
      break;
    default:
      if (openRequests.length > 0) addCandidate(0, `自部署待ち依頼 ${openRequests.length}件`, '部門間依頼の確認が必要です', DASH_TARGETS.REQUEST_RECEIVED);
      if (pendingAck.length > 0) addCandidate(1, `確認待ちのお知らせ ${pendingAck.length}件`, '重要なお知らせがあります', DASH_TARGETS.NOTICE);
      break;
  }

  if (todayTasks.length > 0 || overdueTasks.length > 0) {
    addCandidate(overdueTasks.length > 0 ? 0 : 2, `受信タスク ${activeTasks.length}件`, buildTaskFocusMeta(overdueTasks.length, todayTasks.length), DASH_TARGETS.TASK_RECEIVED);
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.title.localeCompare(b.title, 'ja');
  });

  const focusTarget = candidates[0]?.target || resolveFocusFallbackTarget(profile);
  const topPriority = candidates[0]?.priority ?? 3;

  return {
    title: profile.roleType === 'manager'
      ? '部門フォーカス'
      : (profile.roleType === 'leader' ? 'リーダーフォーカス' : `${profile.department}フォーカス`),
    value: candidates.length > 0 ? `${candidates.length}件` : '安定',
    meta: buildFocusSummary(profile, candidates.length),
    tone: topPriority === 0 ? 'alert' : (topPriority === 1 ? 'active' : (candidates.length > 0 ? 'clear' : 'idle')),
    chips: [
      openRequests.length > 0 ? { text: `依頼 ${openRequests.length}件`, tone: 'alert' } : null,
      pendingAck.length > 0 ? { text: `通知 ${pendingAck.length}件`, tone: 'alert' } : null,
      attendanceInfo.chip ? { text: attendanceInfo.chip, tone: attendanceInfo.chipTone } : null,
    ].filter(Boolean),
    items: candidates.slice(0, DASH_LIST_LIMIT).map(item => ({
      title: item.title,
      meta: item.meta,
    })),
    emptyText: '今日の優先事項はありません',
    target: focusTarget,
    actionLabel: getDashboardActionLabel(focusTarget),
  };
}

function getDashboardProfile() {
  const department = `${state.userEmailProfile?.department || ''}`.trim();
  const roleType = state.userEmailProfile?.roleType || 'member';
  const roleLabel = USER_ROLE_LABELS[roleType] || '';
  return { department, roleType, roleLabel };
}

function resolveFocusFallbackTarget(profile) {
  if (!profile.department) return DASH_TARGETS.PROFILE;
  if (profile.roleType === 'manager' || profile.roleType === 'leader') return DASH_TARGETS.REQUEST_RECEIVED;
  const departmentKey = resolveDepartmentKey(profile.department);
  if (departmentKey === 'production' || departmentKey === 'factory' || departmentKey === 'construction') {
    return DASH_TARGETS.ATTENDANCE;
  }
  return DASH_TARGETS.TASK_RECEIVED;
}

function getActiveReceivedTasks(todayKey) {
  return (state.receivedTasks || [])
    .filter(task => task.status === 'pending' || task.status === 'accepted')
    .sort((a, b) => compareTaskPriority(a, b, todayKey));
}

function getOpenDepartmentRequests() {
  return (state.receivedRequests || [])
    .filter(req => !req.archived && (req.status === 'submitted' || req.status === 'reviewing'))
    .sort((a, b) => compareTimestamp(b.updatedAt || b.createdAt, a.updatedAt || a.createdAt));
}

function getPendingAckNotices() {
  const noticeSource = Array.isArray(state.visibleNotices)
    ? state.visibleNotices
    : (state.allNotices || []);
  return noticeSource.filter(notice => {
    if (!notice?.requireAcknowledgement || !state.currentUsername) return false;
    const acknowledgedBy = Array.isArray(notice.acknowledgedBy) ? notice.acknowledgedBy : [];
    return !acknowledgedBy.includes(state.currentUsername);
  });
}

function getAttendanceFocusInfo(todayKey) {
  const attendance = state.todayAttendanceDate === todayKey
    ? (state.todayAttendance || null)
    : (state.attendanceData?.[todayKey] || null);
  const siteMap = new Map((state.attendanceSites || []).map(site => [site.id, site]));

  if (!attendance) {
    return {
      priority: 0,
      summary: '今日の勤怠が未入力',
      meta: 'カレンダーから入力してください',
      chip: '勤怠未入力',
      chipTone: 'alert',
    };
  }

  const siteEntries = buildAttendanceSiteEntries(attendance, siteMap);
  const totalHours = siteEntries.reduce((sum, entry) => sum + entry.hours, 0);

  if (siteEntries.length > 0) {
    return {
      priority: 2,
      summary: [siteEntries[0].code, siteEntries[0].name].filter(Boolean).join(' '),
      meta: `合計 ${fmtHours(totalHours)}h / ${siteEntries.length}現場`,
      chip: `${siteEntries.length}現場`,
      chipTone: 'clear',
    };
  }

  const typeKey = attendance.type || 'normal';
  if (typeKey !== 'normal') {
    const typeLabel = ATTENDANCE_TYPE_LABELS[typeKey] || typeKey;
    return {
      priority: 2,
      summary: `勤務区分 ${typeLabel}`,
      meta: attendance.note ? `メモ: ${attendance.note}` : '今日の勤怠区分が登録されています',
      chip: typeLabel,
      chipTone: 'active',
    };
  }

  return {
    priority: 3,
    summary: '今日の勤怠は通常です',
    meta: '大きな変更はありません',
    chip: '通常',
    chipTone: 'clear',
  };
}

function buildAttendanceSiteEntries(attendance, siteMap) {
  const workSiteHours = (attendance.workSiteHours && typeof attendance.workSiteHours === 'object')
    ? attendance.workSiteHours
    : {};

  return Object.entries(workSiteHours)
    .map(([siteId, hours]) => {
      const numericHours = Number(hours);
      if (!Number.isFinite(numericHours) || numericHours <= 0) return null;
      const site = siteMap.get(siteId);
      return {
        siteId,
        code: site?.code || '',
        name: site?.name || `未登録現場(${siteId})`,
        hours: numericHours,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.hours - a.hours);
}

function resolveDepartmentKey(department) {
  const value = `${department || ''}`;
  if (value.includes('営業')) return 'sales';
  if (value.includes('設計')) return 'design';
  if (value.includes('生産管理')) return 'production';
  if (value.includes('工場')) return 'factory';
  if (value.includes('施工')) return 'construction';
  return 'general';
}

function buildTaskFocusMeta(overdueCount, todayCount) {
  const parts = [];
  if (overdueCount > 0) parts.push(`期限超過 ${overdueCount}件`);
  if (todayCount > 0) parts.push(`今日期限 ${todayCount}件`);
  return parts.length > 0 ? parts.join(' / ') : '進行中のタスク';
}

function buildFocusSummary(profile, itemCount) {
  if (itemCount === 0) {
    return profile.roleType === 'manager' || profile.roleType === 'leader'
      ? '部門内に大きな確認事項は見当たりません'
      : '今日は大きな確認事項はありません';
  }
  if (profile.roleType === 'manager') return '部門全体で先に見ておきたい事項です';
  if (profile.roleType === 'leader') return '今日の優先対応を上から確認できます';
  return 'あなたの部門で今日見ておきたい事項です';
}

function compareTaskPriority(a, b, todayKey) {
  const aRank = getDueRank(a.dueDate, todayKey);
  const bRank = getDueRank(b.dueDate, todayKey);
  if (aRank !== bRank) return aRank - bRank;

  const aStatus = a.status === 'pending' ? 0 : 1;
  const bStatus = b.status === 'pending' ? 0 : 1;
  if (aStatus !== bStatus) return aStatus - bStatus;

  const aDue = a.dueDate || '9999-12-31';
  const bDue = b.dueDate || '9999-12-31';
  if (aDue !== bDue) return aDue.localeCompare(bDue);

  return compareTimestamp(b.createdAt, a.createdAt);
}

function getDueRank(dueDate, todayKey) {
  if (!dueDate) return 4;
  if (dueDate < todayKey) return 0;
  if (dueDate === todayKey) return 1;
  const tomorrow = new Date(`${todayKey}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dueDate === buildDateKey(tomorrow)) return 2;
  return 3;
}

function formatDueLabel(dueDate, todayKey) {
  if (!dueDate) return '';
  if (dueDate < todayKey) return `期限超過 ${dueDate.slice(5).replace('-', '/')}`;
  if (dueDate === todayKey) return '今日期限';
  const tomorrow = new Date(`${todayKey}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dueDate === buildDateKey(tomorrow)) return '明日期限';
  return `期限 ${dueDate.slice(5).replace('-', '/')}`;
}

function formatNoticeDate(value) {
  const ms = toMillis(value);
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function compareTimestamp(a, b) {
  return toMillis(a) - toMillis(b);
}

function toMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function buildDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日 (${DOW_LABELS[date.getDay()]})`;
}

function fmtHours(hours) {
  if (!Number.isFinite(hours)) return '0';
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0$/, '');
}
