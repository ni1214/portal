import { optionalEnv } from './env.mjs';
import { HttpError } from './http.mjs';

const WEATHER_TIMEOUT_MS = 10_000;
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const FORECAST_SAMPLE_INDEXES = Object.freeze([3, 6, 9, 12, 15, 18, 21, 24]);
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
    forecast_hours: '25',
    temperature_unit: 'celsius',
    wind_speed_unit: 'ms',
    timeformat: 'unixtime',
    timezone: 'Asia/Tokyo',
  }).toString();

  const weather = await fetchWeatherJson(forecastUrl);
  if (!weather?.current || !weather?.hourly) {
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
    updatedAt: new Date().toISOString(),
  };
}
