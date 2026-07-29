import { state } from './state.js';
import { WEATHER_LAT, WEATHER_LON } from './config.js';
import { esc } from './utils.js';

const SOLAR_MONITOR_URL = 'https://mierukaweb.energymntr.com/48429893PZ';
const RAIN_RADAR_URL = `https://embed.windy.com/embed2.html?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&detailLat=${WEATHER_LAT}&detailLon=${WEATHER_LON}&zoom=9&level=surface&overlay=rain&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;
const WEATHER_CACHE_MS = 5 * 60 * 1000;
const WEATHER_REFRESH_MS = 10 * 60 * 1000;

const WEATHER_ICONS = Object.freeze({
  '01d': '☀️',
  '01n': '🌙',
  '02d': '🌤️',
  '02n': '🌤️',
  '03d': '☁️',
  '03n': '☁️',
  '04d': '☁️',
  '04n': '☁️',
  '09d': '🌧️',
  '09n': '🌧️',
  '10d': '🌦️',
  '10n': '🌦️',
  '11d': '⛈️',
  '11n': '⛈️',
  '13d': '❄️',
  '13n': '❄️',
  '50d': '🌫️',
  '50n': '🌫️',
});

let deps = {};
let refreshTimer = null;
let refreshPromise = null;
let cachedWeather = null;
let cachedAt = 0;

export function initWeatherSolar(d = {}) {
  deps = d;
  ensureWorkspace();
}

function ensureWorkspace() {
  let workspace = document.getElementById('env-workspace');
  if (workspace) return workspace;

  workspace = document.createElement('section');
  workspace.id = 'env-workspace';
  workspace.className = 'env-workspace';
  workspace.hidden = true;
  workspace.innerHTML = `
    <div class="env-toolbar">
      <p class="env-updated" id="env-updated" role="status">データを読み込んでいません</p>
      <button class="env-refresh-btn" id="env-refresh" type="button">
        <i class="material-symbols-rounded" aria-hidden="true">refresh</i>
        <span>最新に更新</span>
      </button>
    </div>

    <section class="env-today" aria-labelledby="env-today-heading">
      <div class="env-section-heading">
        <div>
          <p class="env-section-kicker">今日の状況</p>
          <h2 id="env-today-heading">高崎市の天気と安全情報</h2>
        </div>
      </div>

      <div class="env-summary-grid">
        <article class="env-summary-card env-current-card" id="env-current">
          <div class="env-loading"><i class="material-symbols-rounded" aria-hidden="true">progress_activity</i> 天気を取得しています</div>
        </article>

        <article class="env-summary-card env-sun-card" id="env-sun">
          <div class="env-loading"><i class="material-symbols-rounded" aria-hidden="true">light_mode</i> 日の出・日没を取得しています</div>
        </article>

        <article class="env-summary-card env-heat-card" id="env-heat" data-level="unknown">
          <div class="env-loading"><i class="material-symbols-rounded" aria-hidden="true">health_and_safety</i> 暑さ指数を取得しています</div>
        </article>
      </div>

      <div class="env-forecast-block">
        <div class="env-forecast-heading">
          <h3>これから24時間</h3>
          <span>3時間ごとの予報</span>
        </div>
        <div class="env-forecast" id="env-forecast"></div>
      </div>
    </section>

    <section class="env-monitor-card" aria-labelledby="env-solar-heading">
      <div class="env-monitor-heading">
        <div>
          <p class="env-section-kicker">発電状況</p>
          <h2 id="env-solar-heading">八幡工場 太陽光発電モニター</h2>
        </div>
        <div class="env-monitor-actions">
          <button class="env-frame-reload" id="env-solar-reload" type="button">
            <i class="material-symbols-rounded" aria-hidden="true">refresh</i>
            <span>再読み込み</span>
          </button>
          <a class="env-external-link" href="${SOLAR_MONITOR_URL}" target="_blank" rel="noopener noreferrer">
            <span>別タブで開く</span>
            <i class="material-symbols-rounded" aria-hidden="true">open_in_new</i>
          </a>
        </div>
      </div>
      <div class="env-frame-wrap env-solar-frame-wrap">
        <iframe
          id="env-solar-frame"
          title="日建フレメックス八幡工場 太陽光発電状況"
          loading="eager"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen
        ></iframe>
      </div>
      <p class="env-frame-note">発電モニターが表示されない場合は「別タブで開く」を使用してください。</p>
    </section>

    <section class="env-monitor-card" aria-labelledby="env-radar-heading">
      <div class="env-monitor-heading">
        <div>
          <p class="env-section-kicker">降雨確認</p>
          <h2 id="env-radar-heading">高崎市周辺の雨雲レーダー</h2>
        </div>
        <div class="env-monitor-actions">
          <button class="env-frame-reload" id="env-radar-reload" type="button">
            <i class="material-symbols-rounded" aria-hidden="true">refresh</i>
            <span>再読み込み</span>
          </button>
          <a class="env-external-link" href="${RAIN_RADAR_URL}" target="_blank" rel="noopener noreferrer">
            <span>別タブで開く</span>
            <i class="material-symbols-rounded" aria-hidden="true">open_in_new</i>
          </a>
        </div>
      </div>
      <div class="env-frame-wrap env-radar-frame-wrap">
        <iframe
          id="env-radar-frame"
          title="高崎市周辺の雨雲レーダー"
          loading="eager"
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen
        ></iframe>
      </div>
      <p class="env-frame-note">雨雲レーダー提供: Windy.com</p>
    </section>
  `;
  document.body.appendChild(workspace);

  document.getElementById('env-refresh')?.addEventListener('click', () => {
    void refreshWeatherSolar({ force: true });
  });
  document.getElementById('env-solar-reload')?.addEventListener('click', () => {
    reloadFrame('env-solar-frame', SOLAR_MONITOR_URL);
  });
  document.getElementById('env-radar-reload')?.addEventListener('click', () => {
    reloadFrame('env-radar-frame', RAIN_RADAR_URL);
  });
  return workspace;
}

function reloadFrame(frameId, url) {
  const frame = document.getElementById(frameId);
  if (!frame) return;
  frame.removeAttribute('src');
  window.requestAnimationFrame(() => {
    frame.setAttribute('src', url);
  });
}

function activateFrames() {
  const solarFrame = document.getElementById('env-solar-frame');
  const radarFrame = document.getElementById('env-radar-frame');
  if (solarFrame && solarFrame.getAttribute('src') !== SOLAR_MONITOR_URL) {
    solarFrame.setAttribute('src', SOLAR_MONITOR_URL);
  }
  if (radarFrame && radarFrame.getAttribute('src') !== RAIN_RADAR_URL) {
    radarFrame.setAttribute('src', RAIN_RADAR_URL);
  }
}

function releaseFrames() {
  document.getElementById('env-solar-frame')?.removeAttribute('src');
  document.getElementById('env-radar-frame')?.removeAttribute('src');
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatJapanTime(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatObservation(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '更新時刻なし';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatDaylight(secondsValue) {
  const seconds = numberOrNull(secondsValue);
  if (seconds == null || seconds < 0) return '--';
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}

export function getWbgtLevel(value) {
  const wbgt = numberOrNull(value);
  if (wbgt == null) {
    return {
      key: 'unknown',
      label: '取得待ち',
      guidance: '期間外または取得できない場合は、現場の温湿度計と体調を優先してください。',
    };
  }
  if (wbgt >= 31) {
    return {
      key: 'danger',
      label: '危険',
      guidance: '屋外での運動や激しい作業は原則中止し、涼しい場所へ移動してください。',
    };
  }
  if (wbgt >= 28) {
    return {
      key: 'severe',
      label: '厳重警戒',
      guidance: '激しい作業を避け、こまめに休憩して水分・塩分を補給してください。',
    };
  }
  if (wbgt >= 25) {
    return {
      key: 'warning',
      label: '警戒',
      guidance: '積極的に休憩を取り、水分・塩分を補給してください。',
    };
  }
  if (wbgt >= 21) {
    return {
      key: 'attention',
      label: '注意',
      guidance: '作業中は積極的に水分を補給し、体調変化に注意してください。',
    };
  }
  return {
    key: 'safe',
    label: 'ほぼ安全',
    guidance: '通常は危険性が低い状態ですが、重労働時は水分補給を続けてください。',
  };
}

function renderCurrent(weather) {
  const current = weather?.current || {};
  const temperature = numberOrNull(current.temperature);
  const feelsLike = numberOrNull(current.feelsLike);
  const humidity = numberOrNull(current.humidity);
  const windSpeed = numberOrNull(current.windSpeed);
  if ([temperature, feelsLike, humidity, windSpeed].some(value => value == null)) {
    throw new Error('天気情報の形式が正しくありません。');
  }
  const icon = WEATHER_ICONS[`${current.icon || ''}`] || '🌡️';
  document.getElementById('env-current').innerHTML = `
    <div class="env-card-label"><i class="material-symbols-rounded" aria-hidden="true">partly_cloudy_day</i> 今日の天気</div>
    <div class="env-current-main">
      <span class="env-weather-icon" aria-hidden="true">${icon}</span>
      <strong>${Math.round(temperature)}<small>°C</small></strong>
      <span>${esc(`${current.description || '天気情報'}`.slice(0, 80))}</span>
    </div>
    <dl class="env-detail-list">
      <div><dt>体感</dt><dd>${Math.round(feelsLike)}°C</dd></div>
      <div><dt>湿度</dt><dd>${Math.round(humidity)}%</dd></div>
      <div><dt>風速</dt><dd>${Math.max(0, windSpeed).toFixed(1)}m/s</dd></div>
    </dl>
  `;
}

function renderSun(weather) {
  const today = weather?.today || {};
  document.getElementById('env-sun').innerHTML = `
    <div class="env-card-label"><i class="material-symbols-rounded" aria-hidden="true">wb_twilight</i> 日の出・日没</div>
    <div class="env-sun-times">
      <div>
        <span class="material-symbols-rounded" aria-hidden="true">wb_sunny</span>
        <small>日の出</small>
        <strong>${formatJapanTime(today.sunrise)}</strong>
      </div>
      <div>
        <span class="material-symbols-rounded" aria-hidden="true">nights_stay</span>
        <small>日没</small>
        <strong>${formatJapanTime(today.sunset)}</strong>
      </div>
    </div>
    <dl class="env-detail-list">
      <div><dt>昼の長さ</dt><dd>${formatDaylight(today.daylightSeconds)}</dd></div>
      <div><dt>紫外線</dt><dd>${numberOrNull(today.uvIndexMax)?.toFixed(1) ?? '--'}</dd></div>
    </dl>
  `;
}

function renderHeatStress(weather) {
  const heatStress = weather?.heatStress || {};
  const current = numberOrNull(heatStress.current);
  const todayMax = numberOrNull(heatStress.todayMax);
  const level = getWbgtLevel(current);
  const container = document.getElementById('env-heat');
  container.dataset.level = level.key;
  container.innerHTML = `
    <div class="env-card-label"><i class="material-symbols-rounded" aria-hidden="true">health_and_safety</i> 暑さ指数（WBGT）</div>
    <div class="env-heat-main">
      <strong>${current == null ? '--' : current.toFixed(1)}<small>${current == null ? '' : '°C'}</small></strong>
      <span class="env-heat-level">${level.label}</span>
    </div>
    <p class="env-heat-guidance">${esc(level.guidance)}</p>
    <div class="env-heat-meta">
      <span>今日の最高 ${todayMax == null ? '--' : `${todayMax.toFixed(1)}°C`}</span>
      <span>${esc(heatStress.observedAt ? `${formatObservation(heatStress.observedAt)}現在` : '更新データなし')}</span>
    </div>
    <a class="env-source-link" href="${esc(`${heatStress.sourceUrl || 'https://www.wbgt.env.go.jp/'}`)}" target="_blank" rel="noopener noreferrer">
      ${esc(`${heatStress.source || '環境省 熱中症予防情報サイト'}`)}・${esc(`${heatStress.station || '前橋'}`)}
      <i class="material-symbols-rounded" aria-hidden="true">open_in_new</i>
    </a>
  `;
}

function renderForecast(weather) {
  const forecast = Array.isArray(weather?.forecast) ? weather.forecast : [];
  const container = document.getElementById('env-forecast');
  container.replaceChildren();
  forecast.slice(0, 8).forEach(item => {
    const temperature = numberOrNull(item?.temperature);
    const humidity = numberOrNull(item?.humidity);
    const at = new Date(item?.at || '');
    if (temperature == null || humidity == null || Number.isNaN(at.getTime())) return;
    const card = document.createElement('article');
    card.className = 'env-forecast-item';
    card.innerHTML = `
      <time datetime="${esc(at.toISOString())}">${formatJapanTime(at.toISOString())}</time>
      <span class="env-forecast-icon" aria-hidden="true">${WEATHER_ICONS[`${item?.icon || ''}`] || '🌡️'}</span>
      <strong>${Math.round(temperature)}°</strong>
      <span><i class="material-symbols-rounded" aria-hidden="true">humidity_percentage</i>${Math.round(humidity)}%</span>
    `;
    container.appendChild(card);
  });
}

function renderWeather(weather) {
  renderCurrent(weather);
  renderSun(weather);
  renderHeatStress(weather);
  renderForecast(weather);
  const updatedAt = new Date(weather?.updatedAt || Date.now());
  document.getElementById('env-updated').textContent = Number.isNaN(updatedAt.getTime())
    ? '更新しました'
    : `${formatObservation(updatedAt.toISOString())} 更新`;
}

function renderWeatherError(error) {
  const message = error?.status === 401
    ? 'Googleログインを確認してください。'
    : '天気・安全情報を取得できませんでした。少し待ってから更新してください。';
  document.getElementById('env-updated').textContent = message;
  ['env-current', 'env-sun', 'env-heat'].forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;
    element.innerHTML = `
      <div class="env-error">
        <i class="material-symbols-rounded" aria-hidden="true">error</i>
        <span>${esc(message)}</span>
      </div>
    `;
  });
  document.getElementById('env-forecast')?.replaceChildren();
}

export async function refreshWeatherSolar({ force = false } = {}) {
  ensureWorkspace();
  if (!state.currentUsername) {
    renderWeatherError({ status: 401 });
    return null;
  }
  if (!force && cachedWeather && Date.now() - cachedAt < WEATHER_CACHE_MS) {
    renderWeather(cachedWeather);
    return cachedWeather;
  }
  if (refreshPromise) return refreshPromise;

  const button = document.getElementById('env-refresh');
  button?.setAttribute('aria-busy', 'true');
  if (button) button.disabled = true;
  document.getElementById('env-updated').textContent = '最新データを取得しています';

  refreshPromise = Promise.resolve()
    .then(() => deps.fetchWeatherFromApi?.())
    .then(weather => {
      if (!weather) throw new Error('天気データがありません。');
      cachedWeather = weather;
      cachedAt = Date.now();
      renderWeather(weather);
      return weather;
    })
    .catch(error => {
      console.error('天気・太陽光ワークスペースの更新に失敗しました:', error);
      renderWeatherError(error);
      return null;
    })
    .finally(() => {
      refreshPromise = null;
      button?.removeAttribute('aria-busy');
      if (button) button.disabled = false;
    });
  return refreshPromise;
}

export function openWeatherSolarView() {
  ensureWorkspace();
  activateFrames();
  void refreshWeatherSolar();
  clearInterval(refreshTimer);
  refreshTimer = window.setInterval(() => {
    void refreshWeatherSolar({ force: true });
  }, WEATHER_REFRESH_MS);
  return true;
}

export function closeWeatherSolarView() {
  clearInterval(refreshTimer);
  refreshTimer = null;
  releaseFrames();
}
