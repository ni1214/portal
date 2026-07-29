import { optionalEnv } from './env.mjs';
import { HttpError } from './http.mjs';

const WEATHER_TIMEOUT_MS = 10_000;
const WBGT_TIMEOUT_MS = 5_000;
const WBGT_CACHE_MS = 10 * 60 * 1000;
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const WBGT_DATA_BASE_URL = 'https://www.wbgt.env.go.jp/est15WG/dl';
const WBGT_SOURCE_URL = 'https://www.wbgt.env.go.jp/wbgt_data.php?region=01';
const WBGT_STATION_ID = '42251';
const WBGT_STATION_NAME = '前橋';
const FORECAST_SAMPLE_INDEXES = Object.freeze([3, 6, 9, 12, 15, 18, 21, 24]);
let wbgtCache = {
  key: '',
  expiresAt: 0,
  value: null,
};
const WMO_WEATHER = Object.freeze({
  0: { description: '晴れ', icon: '01' },
  1: { description: '晴れ', icon: '02' },
  2: { description: '晴れ時々くもり', icon: '03' },
  3: { description: 'くもり', icon: '04' },
  45: { description: '霧', icon: '50' },
  48: { description: '着氷性の霧', icon: '50' },
  51: { description: '弱い霧雨', icon: '09' },
  53: { description: '霧雨', icon: '09' },
  55: { description: '強い霧雨', icon: '09' },
  56: { description: '弱い着氷性の霧雨', icon: '09' },
  57: { description: '強い着氷性の霧雨', icon: '09' },
  61: { description: '小雨', icon: '10' },
  63: { description: '雨', icon: '10' },
  65: { description: '強い雨', icon: '10' },
  66: { description: '弱い着氷性の雨', icon: '10' },
  67: { description: '強い着氷性の雨', icon: '10' },
  71: { description: '小雪', icon: '13' },
  73: { description: '雪', icon: '13' },
  75: { description: '大雪', icon: '13' },
  77: { description: '霧雪', icon: '13' },
  80: { description: 'にわか雨', icon: '09' },
  81: { description: '強いにわか雨', icon: '09' },
  82: { description: '激しいにわか雨', icon: '09' },
  85: { description: 'にわか雪', icon: '13' },
  86: { description: '強いにわか雪', icon: '13' },
  95: { description: '雷雨', icon: '11' },
  96: { description: '雷雨（ひょう）', icon: '11' },
  99: { description: '激しい雷雨（ひょう）', icon: '11' },
});

function readCoordinate(name, fallback, min, max) {
  const raw = optionalEnv(name, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(500, 'server_misconfigured', 'サーバー設定を確認できませんでした。');
  }
  return value;
}

function finiteNumber(value, label) {
  if (value === null || value === undefined || value === '') {
    throw new HttpError(502, 'invalid_weather_response', `天気情報の${label}を確認できませんでした。`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new HttpError(502, 'invalid_weather_response', `天気情報の${label}を確認できませんでした。`);
  }
  return number;
}

function boundedText(value, maxLength = 100) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function weatherDetails(codeValue, isDayValue) {
  const code = finiteNumber(codeValue, '天候');
  const isDay = finiteNumber(isDayValue, '昼夜');
  const details = WMO_WEATHER[code] || { description: '天気情報', icon: '03' };
  return {
    description: details.description,
    // Keep the existing OpenWeather-style icon code contract used by the UI.
    icon: `${details.icon}${isDay === 0 ? 'n' : 'd'}`,
  };
}

function unixSecondsToIso(value, label) {
  const date = new Date(finiteNumber(value, label) * 1000);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(502, 'invalid_weather_response', `天気情報の${label}を確認できませんでした。`);
  }
  return date.toISOString();
}

function readHourlySeries(hourly, name) {
  const values = hourly?.[name];
  if (!Array.isArray(values) || values.length <= FORECAST_SAMPLE_INDEXES.at(-1)) {
    throw new HttpError(502, 'invalid_weather_response', '天気予報の応答を確認できませんでした。');
  }
  return values;
}

function readDailyValue(daily, name, label) {
  const values = daily?.[name];
  if (!Array.isArray(values) || values.length === 0) {
    throw new HttpError(502, 'invalid_weather_response', `天気情報の${label}を確認できませんでした。`);
  }
  return values[0];
}

function normalizeToday(daily) {
  return {
    sunrise: unixSecondsToIso(readDailyValue(daily, 'sunrise', '日の出'), '日の出'),
    sunset: unixSecondsToIso(readDailyValue(daily, 'sunset', '日没'), '日没'),
    daylightSeconds: finiteNumber(readDailyValue(daily, 'daylight_duration', '昼の長さ'), '昼の長さ'),
    uvIndexMax: finiteNumber(readDailyValue(daily, 'uv_index_max', '紫外線指数'), '紫外線指数'),
  };
}

function normalizeForecast(hourly) {
  const times = readHourlySeries(hourly, 'time');
  const temperatures = readHourlySeries(hourly, 'temperature_2m');
  const humidities = readHourlySeries(hourly, 'relative_humidity_2m');
  const weatherCodes = readHourlySeries(hourly, 'weather_code');
  const daylight = readHourlySeries(hourly, 'is_day');

  return FORECAST_SAMPLE_INDEXES.map(index => {
    const details = weatherDetails(weatherCodes[index], daylight[index]);
    return {
      at: unixSecondsToIso(times[index], '日時'),
      temperature: finiteNumber(temperatures[index], '気温'),
      humidity: finiteNumber(humidities[index], '湿度'),
      description: boundedText(details.description),
      icon: boundedText(details.icon, 8),
    };
  });
}

function getTokyoDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = type => Number(parts.find(part => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
  };
}

function toObservationIso(year, month, day, timeText) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(`${timeText || ''}`.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  const observedAt = new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
  return Number.isNaN(observedAt.getTime()) ? null : observedAt.toISOString();
}

function unavailableWbgt() {
  return {
    station: WBGT_STATION_NAME,
    current: null,
    todayMax: null,
    observedAt: null,
    source: '環境省 熱中症予防情報サイト',
    sourceUrl: WBGT_SOURCE_URL,
  };
}

async function fetchLatestWbgt(now = new Date()) {
  const { year, month, day } = getTokyoDateParts(now);
  const monthKey = `${year}${String(month).padStart(2, '0')}`;
  const cacheKey = `${monthKey}-${day}`;
  if (wbgtCache.key === cacheKey && wbgtCache.expiresAt > Date.now() && wbgtCache.value) {
    return wbgtCache.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WBGT_TIMEOUT_MS);
  let value = unavailableWbgt();
  try {
    const response = await fetch(
      `${WBGT_DATA_BASE_URL}/wbgt_${WBGT_STATION_ID}_${monthKey}.csv`,
      {
        method: 'GET',
        headers: { Accept: 'text/csv' },
        signal: controller.signal,
      },
    );
    if (!response.ok) return value;
    const csv = await response.text();
    const expectedDate = `${year}/${month}/${day}`;
    const observations = csv
      .split(/\r?\n/)
      .map(line => line.split(','))
      .filter(columns => (
        columns[0] === expectedDate
        && `${columns[2] ?? ''}`.trim() !== ''
        && Number.isFinite(Number(columns[2]))
      ))
      .map(columns => ({
        value: Number(columns[2]),
        observedAt: toObservationIso(year, month, day, columns[1]),
      }))
      .filter(observation => observation.observedAt);
    if (observations.length > 0) {
      const latest = observations.at(-1);
      value = {
        ...unavailableWbgt(),
        current: latest.value,
        todayMax: Math.max(...observations.map(observation => observation.value)),
        observedAt: latest.observedAt,
      };
    }
  } catch {
    // WBGT is supplemental. Keep the weather response available when the official feed is unavailable.
  } finally {
    clearTimeout(timeout);
    wbgtCache = {
      key: cacheKey,
      expiresAt: Date.now() + (value.current == null ? 2 * 60 * 1000 : WBGT_CACHE_MS),
      value,
    };
  }
  return value;
}

async function fetchWeatherJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new HttpError(502, 'weather_request_failed', '天気情報を取得できませんでした。');
    }
    try {
      return await response.json();
    } catch {
      throw new HttpError(502, 'invalid_weather_response', '天気情報の応答を確認できませんでした。');
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error?.name === 'AbortError') {
      throw new HttpError(504, 'weather_timeout', '天気情報の取得がタイムアウトしました。');
    }
    throw new HttpError(502, 'weather_unavailable', '天気情報へ接続できませんでした。');
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchNormalizedWeather() {
  const latitude = readCoordinate('WEATHER_LAT', 36.3219, -90, 90);
  const longitude = readCoordinate('WEATHER_LON', 139.0033, -180, 180);
  const forecastUrl = new URL(OPEN_METEO_FORECAST_URL);
  forecastUrl.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'wind_speed_10m',
      'weather_code',
      'is_day',
    ].join(','),
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'weather_code',
      'is_day',
    ].join(','),
    daily: [
      'sunrise',
      'sunset',
      'daylight_duration',
      'uv_index_max',
    ].join(','),
    forecast_hours: '25',
    forecast_days: '1',
    temperature_unit: 'celsius',
    wind_speed_unit: 'ms',
    timeformat: 'unixtime',
    timezone: 'Asia/Tokyo',
  }).toString();

  const [weather, heatStress] = await Promise.all([
    fetchWeatherJson(forecastUrl),
    fetchLatestWbgt(),
  ]);
  if (!weather?.current || !weather?.hourly || !weather?.daily) {
    throw new HttpError(502, 'invalid_weather_response', '天気予報の応答を確認できませんでした。');
  }
  const currentDetails = weatherDetails(weather.current.weather_code, weather.current.is_day);

  return {
    location: '高崎市',
    current: {
      temperature: finiteNumber(weather.current.temperature_2m, '気温'),
      feelsLike: finiteNumber(weather.current.apparent_temperature, '体感温度'),
      humidity: finiteNumber(weather.current.relative_humidity_2m, '湿度'),
      windSpeed: finiteNumber(weather.current.wind_speed_10m, '風速'),
      description: boundedText(currentDetails.description),
      icon: boundedText(currentDetails.icon, 8),
    },
    forecast: normalizeForecast(weather.hourly),
    today: normalizeToday(weather.daily),
    heatStress,
    updatedAt: new Date().toISOString(),
  };
}
