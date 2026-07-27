import { state } from './state.js';

const DEFAULT_TIMEOUT_MS = 20000;
const API_TIMEOUT_MS = Object.freeze({
  ai: 70_000,
  weather: 55_000,
  orderEmail: 75_000,
  orderEmailReconcile: 55_000,
});
const API_PATHS = Object.freeze({
  ai: '/api/ai',
  weather: '/api/weather',
  orderEmail: '/api/order-email',
  orderEmailReconcile: '/api/order-email-reconcile',
});

export class SecureApiError extends Error {
  constructor(message, { status = 0, code = '', cause = null } = {}) {
    super(message);
    this.name = 'SecureApiError';
    this.status = status;
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function getAccessToken() {
  const token = `${state.googleAuthSession?.access_token || ''}`.trim();
  if (!token) {
    throw new SecureApiError('Googleログインが必要です。', {
      status: 401,
      code: 'AUTH_REQUIRED',
    });
  }
  return token;
}

function getSameOriginUrl(path) {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    throw new SecureApiError('許可されていないAPIです。', { code: 'INVALID_API_PATH' });
  }
  return url;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  const text = await response.text().catch(() => '');
  return text ? { text } : null;
}

function getErrorDetails(payload, status) {
  const error = payload?.error;
  if (error && typeof error === 'object') {
    return {
      code: `${error.code || ''}`,
      message: `${error.message || ''}`.trim(),
    };
  }
  return {
    code: '',
    message: typeof error === 'string'
      ? error.trim()
      : (typeof payload?.message === 'string' ? payload.message.trim() : `APIエラー (${status})`),
  };
}

export async function requestSecureApi(path, {
  method = 'GET',
  body = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(getSameOriginUrl(path), {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
        ...(body == null ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const details = getErrorDetails(payload, response.status);
      throw new SecureApiError(details.message || `APIエラー (${response.status})`, {
        status: response.status,
        code: details.code,
      });
    }
    return payload;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new SecureApiError('処理がタイムアウトしました。もう一度お試しください。', {
        status: 408,
        code: 'CLIENT_TIMEOUT',
        cause: err,
      });
    }
    if (err instanceof SecureApiError) throw err;
    throw new SecureApiError('サーバーへ接続できませんでした。', {
      code: 'NETWORK_ERROR',
      cause: err,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestAi(feature, prompt) {
  const normalizedFeature = `${feature || ''}`.trim();
  const normalizedPrompt = `${prompt || ''}`.trim();
  if (!['email', 'shared-link', 'trouble-report'].includes(normalizedFeature)) {
    throw new SecureApiError('AI機能の指定が正しくありません。', { code: 'INVALID_FEATURE' });
  }
  if (!normalizedPrompt) {
    throw new SecureApiError('AIへ送る内容がありません。', { code: 'EMPTY_PROMPT' });
  }
  const payload = await requestSecureApi(API_PATHS.ai, {
    method: 'POST',
    body: { feature: normalizedFeature, prompt: normalizedPrompt },
    timeoutMs: API_TIMEOUT_MS.ai,
  });
  const text = `${payload?.text || ''}`.trim();
  if (!text) throw new SecureApiError('AIの応答が空でした。', { code: 'EMPTY_RESPONSE' });
  return text;
}

export function fetchWeatherFromApi() {
  return requestSecureApi(API_PATHS.weather, { timeoutMs: API_TIMEOUT_MS.weather });
}

export function sendOrderEmailFromApi(orderId) {
  const normalizedOrderId = `${orderId || ''}`.trim();
  if (!normalizedOrderId) {
    throw new SecureApiError('発注IDがありません。', { code: 'INVALID_ORDER_ID' });
  }
  return requestSecureApi(API_PATHS.orderEmail, {
    method: 'POST',
    body: { orderId: normalizedOrderId },
    timeoutMs: API_TIMEOUT_MS.orderEmail,
  });
}

export function reconcileOrderEmailFromApi(orderId, attemptId, resolution) {
  const normalizedOrderId = `${orderId || ''}`.trim();
  const normalizedAttemptId = `${attemptId || ''}`.trim();
  const normalizedResolution = `${resolution || ''}`.trim();
  if (!normalizedOrderId || !normalizedAttemptId) {
    throw new SecureApiError('送信状態を確認できません。', {
      code: 'INVALID_ORDER_EMAIL_STATE',
    });
  }
  if (!['sent', 'not_sent'].includes(normalizedResolution)) {
    throw new SecureApiError('確認結果が正しくありません。', {
      code: 'INVALID_ORDER_EMAIL_RESOLUTION',
    });
  }
  return requestSecureApi(API_PATHS.orderEmailReconcile, {
    method: 'POST',
    body: {
      orderId: normalizedOrderId,
      attemptId: normalizedAttemptId,
      resolution: normalizedResolution,
    },
    timeoutMs: API_TIMEOUT_MS.orderEmailReconcile,
  });
}
