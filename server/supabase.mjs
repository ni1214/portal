import { optionalEnv, requiredEnv, parseHttpsUrl } from './env.mjs';
import { getRequestHeader, HttpError } from './http.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;
const PRODUCTION_SUPABASE_HOST = 'ydcxgxzeavumvubrqmlq.supabase.co';
const MAX_JWT_PAYLOAD_BYTES = 16_384;
const SERVICE_RPC_NAMES = new Set([
  'consume_portal_rate_limit',
  'claim_order_email_send',
  'finish_order_email_send',
  'authorize_order_email_resolution',
  'resolve_order_email_send',
]);

function getSupabaseConfig() {
  const url = parseHttpsUrl(requiredEnv('SUPABASE_URL'), 'SUPABASE_URL', { allowLocalHttp: true });
  if (
    optionalEnv('VERCEL_ENV').toLowerCase() === 'preview'
    && url.hostname.toLowerCase() === PRODUCTION_SUPABASE_HOST
  ) {
    throw new Error('Vercel Preview must use an isolated Supabase project.');
  }
  const publishableKey = requiredEnv('SUPABASE_PUBLISHABLE_KEY');
  return {
    baseUrl: url.href.replace(/\/+$/, ''),
    publishableKey,
  };
}

function getSupabaseServiceConfig() {
  const config = getSupabaseConfig();
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceRoleKey === config.publishableKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must not be the publishable key.');
  }
  return { ...config, serviceRoleKey };
}

function extractBearerToken(request) {
  const authorization = getRequestHeader(request, 'authorization');
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match || match[1].length > 8192) {
    throw new HttpError(401, 'authentication_required', 'Googleログインが必要です。', {
      'WWW-Authenticate': 'Bearer',
    });
  }
  return match[1];
}

function invalidSessionError() {
  return new HttpError(401, 'invalid_session', 'ログイン情報を確認できませんでした。', {
    'WWW-Authenticate': 'Bearer',
  });
}

function decodeVerifiedJwtPayload(token) {
  const parts = token.split('.');
  const encodedPayload = parts[1] || '';
  if (
    parts.length !== 3
    || !encodedPayload
    || encodedPayload.length % 4 === 1
    || !/^[A-Za-z0-9_-]+$/.test(encodedPayload)
  ) {
    throw invalidSessionError();
  }

  let buffer;
  try {
    buffer = Buffer.from(encodedPayload, 'base64url');
  } catch {
    throw invalidSessionError();
  }
  if (!buffer.length || buffer.length > MAX_JWT_PAYLOAD_BYTES) {
    throw invalidSessionError();
  }

  let payload;
  try {
    payload = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw invalidSessionError();
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw invalidSessionError();
  }
  return payload;
}

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new HttpError(504, 'upstream_timeout', '認証基盤からの応答がありません。');
    }
    throw new HttpError(502, 'upstream_unavailable', '認証基盤へ接続できません。');
  } finally {
    clearTimeout(timeout);
  }
}

export async function authenticateSupabaseRequest(request) {
  const token = extractBearerToken(request);
  const { baseUrl, publishableKey } = getSupabaseConfig();
  const response = await fetchWithTimeout(`${baseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new HttpError(401, 'invalid_session', 'ログインの有効期限が切れています。', {
      'WWW-Authenticate': 'Bearer',
    });
  }

  let user;
  try {
    user = await response.json();
  } catch {
    throw new HttpError(502, 'invalid_auth_response', '認証情報を確認できませんでした。');
  }
  if (!user?.id || typeof user.id !== 'string') {
    throw invalidSessionError();
  }
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  // /auth/v1/user has already verified this exact bearer token. Only after that
  // remote verification is it safe to use the signed payload for session-method
  // checks that are not included in the user response.
  const jwtPayload = decodeVerifiedJwtPayload(token);
  const jwtSubject = typeof jwtPayload.sub === 'string' ? jwtPayload.sub.trim() : '';
  const jwtEmail = typeof jwtPayload.email === 'string'
    ? jwtPayload.email.trim().toLowerCase()
    : '';
  if (jwtSubject !== user.id || jwtEmail !== email) {
    throw invalidSessionError();
  }
  if (!/^[^@\s]+@framex\.co\.jp$/.test(email)) {
    throw new HttpError(403, 'account_not_allowed', 'この会社アカウントではポータルを利用できません。');
  }
  const provider = typeof user.app_metadata?.provider === 'string'
    ? user.app_metadata.provider.trim().toLowerCase()
    : '';
  const hasOauthAmr = Array.isArray(jwtPayload.amr)
    && jwtPayload.amr.some(entry => (
      entry
      && typeof entry === 'object'
      && !Array.isArray(entry)
      && `${entry.method || ''}`.trim().toLowerCase() === 'oauth'
    ));
  if (provider !== 'google' || !hasOauthAmr) {
    throw new HttpError(403, 'google_account_required', 'Google会社アカウントでログインしてください。');
  }
  return { user: { id: user.id, email } };
}

export async function callSupabaseServiceRpc(name, params, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!SERVICE_RPC_NAMES.has(name)) {
    throw new Error('Invalid RPC name.');
  }
  const { baseUrl, serviceRoleKey } = getSupabaseServiceConfig();
  const response = await fetchWithTimeout(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  }, timeoutMs);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(403, 'operation_not_allowed', 'この操作を実行する権限がありません。');
    }
    throw new HttpError(503, 'database_operation_failed', '安全な処理を開始できませんでした。');
  }

  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new HttpError(502, 'invalid_database_response', 'データベースの応答を確認できませんでした。');
  }
}

function firstRpcRow(value) {
  return Array.isArray(value) ? value[0] : value;
}

export async function consumePortalRateLimit(userId, userEmail, feature, {
  limit,
  windowSeconds,
} = {}) {
  const result = await callSupabaseServiceRpc('consume_portal_rate_limit', {
    p_user_id: userId,
    p_user_email: userEmail,
    p_feature: feature,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  const row = firstRpcRow(result);
  const allowed = typeof row === 'boolean' ? row : row?.allowed;
  if (allowed !== true) {
    const retryAfter = Number(row?.retry_after_seconds || windowSeconds || 60);
    throw new HttpError(429, 'rate_limit_exceeded', '操作が集中しています。少し待ってから再度お試しください。', {
      'Retry-After': String(Math.max(1, Math.min(3600, Math.ceil(retryAfter)))),
    });
  }
}
