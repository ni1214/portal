import { optionalEnv, requiredEnv } from './env.mjs';
import { HttpError } from './http.mjs';

const WEATHER_TIMEOUT_MS = 10_000;
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';

function readCoordinate(name, fallback, min, max) {
  const raw = optionalEnv(name, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(500, 'server_misconfigured', 'サーバー設定を確認できませんでした。');
  }
  return value;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new HttpError(502, 'invalid_weather_response', `天気情報の${label}を確認できませんでした。`);
  }
  return number;
}

function boundedText(value, maxLength = 100) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeWeatherItem(item) {
  return {
    at: new Date(finiteNumber(item?.dt, '日時') * 1000).toISOString(),
    temperature: finiteNumber(item?.main?.temp, '気温'),
    humidity: finiteNumber(item?.main?.humidity, '湿度'),
    description: boundedText(item?.weather?.[0]?.description),
    icon: boundedText(item?.weather?.[0]?.icon, 8),
  };
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
  // The previously exposed browser key must never be reused here. Deployment
  // remains fail-closed until a newly rotated server-only key is configured.
  const apiKey = requiredEnv('OPENWEATHER_API_KEY');
  const latitude = readCoordinate('WEATHER_LAT', 36.3219, -90, 90);
  const longitude = readCoordinate('WEATHER_LON', 139.0033, -180, 180);
  const commonParams = {
    lat: String(latitude),
    lon: String(longitude),
    appid: apiKey,
    units: 'metric',
    lang: 'ja',
  };
  const currentUrl = new URL(`${OPENWEATHER_BASE_URL}/weather`);
  currentUrl.search = new URLSearchParams(commonParams).toString();
  const forecastUrl = new URL(`${OPENWEATHER_BASE_URL}/forecast`);
  forecastUrl.search = new URLSearchParams({ ...commonParams, cnt: '9' }).toString();

  const [current, forecast] = await Promise.all([
    fetchWeatherJson(currentUrl),
    fetchWeatherJson(forecastUrl),
  ]);
  if (!Array.isArray(forecast?.list) || forecast.list.length < 2) {
    throw new HttpError(502, 'invalid_weather_response', '天気予報の応答を確認できませんでした。');
  }

  return {
    location: boundedText(current?.name) || '高崎市',
    current: {
      temperature: finiteNumber(current?.main?.temp, '気温'),
      feelsLike: finiteNumber(current?.main?.feels_like, '体感温度'),
      humidity: finiteNumber(current?.main?.humidity, '湿度'),
      windSpeed: finiteNumber(current?.wind?.speed, '風速'),
      description: boundedText(current?.weather?.[0]?.description),
      icon: boundedText(current?.weather?.[0]?.icon, 8),
    },
    forecast: forecast.list.slice(1, 9).map(normalizeWeatherItem),
    updatedAt: new Date().toISOString(),
  };
}
