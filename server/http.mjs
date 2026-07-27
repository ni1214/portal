import { getAllowedRequestOrigins } from './env.mjs';

export class HttpError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function getRequestHeader(request, name) {
  return `${firstHeader(request?.headers?.[name.toLowerCase()]) || ''}`.trim();
}

export function assertMethod(request, expectedMethod) {
  const method = `${request?.method || ''}`.toUpperCase();
  if (method !== expectedMethod) {
    throw new HttpError(405, 'method_not_allowed', '許可されていない操作です。', {
      Allow: expectedMethod,
    });
  }
}

export function assertRequestOrigin(request) {
  const allowedOrigins = getAllowedRequestOrigins();
  const origin = getRequestHeader(request, 'origin');
  if (!origin) return;

  if (!allowedOrigins.has(origin)) {
    throw new HttpError(403, 'origin_not_allowed', 'この送信元からの操作は許可されていません。');
  }
}

export function assertNoRequestBody(request) {
  const rawLength = getRequestHeader(request, 'content-length');
  const transferEncoding = getRequestHeader(request, 'transfer-encoding');
  if ((rawLength && Number(rawLength) > 0) || transferEncoding || request?.body != null) {
    throw new HttpError(400, 'unexpected_body', 'この操作に本文は指定できません。');
  }
}

export async function readJsonBody(request, { maxBytes = 16_384 } = {}) {
  const contentType = getRequestHeader(request, 'content-type').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'JSON形式で送信してください。');
  }

  const declaredLength = Number(getRequestHeader(request, 'content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, 'payload_too_large', '送信内容が大きすぎます。');
  }

  // Vercel may parse JSON before invoking the function. IncomingMessage still has
  // Symbol.asyncIterator in that case, so a present body must take precedence.
  if (request.body != null && typeof request.body !== 'function') {
    if (Buffer.isBuffer(request.body) || request.body instanceof Uint8Array) {
      const buffer = Buffer.from(request.body);
      if (buffer.length > maxBytes) {
        throw new HttpError(413, 'payload_too_large', '送信内容が大きすぎます。');
      }
      try {
        return JSON.parse(buffer.toString('utf8'));
      } catch {
        throw new HttpError(400, 'invalid_json', 'JSON形式が正しくありません。');
      }
    }

    if (typeof request.body === 'string') {
      if (Buffer.byteLength(request.body, 'utf8') > maxBytes) {
        throw new HttpError(413, 'payload_too_large', '送信内容が大きすぎます。');
      }
      try {
        return JSON.parse(request.body);
      } catch {
        throw new HttpError(400, 'invalid_json', 'JSON形式が正しくありません。');
      }
    }

    let serialized;
    try {
      serialized = JSON.stringify(request.body);
    } catch {
      throw new HttpError(400, 'invalid_json', 'JSON形式が正しくありません。');
    }
    if (typeof serialized !== 'string') {
      throw new HttpError(400, 'invalid_json', 'JSON形式が正しくありません。');
    }
    if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
      throw new HttpError(413, 'payload_too_large', '送信内容が大きすぎます。');
    }
    return request.body;
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw new HttpError(413, 'payload_too_large', '送信内容が大きすぎます。');
    }
    chunks.push(buffer);
  }

  if (totalBytes === 0) {
    throw new HttpError(400, 'empty_body', '送信内容がありません。');
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON形式が正しくありません。');
  }
}

export function assertPlainObject(value, label = '送信内容') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid_payload', `${label}が正しくありません。`);
  }
  return value;
}

export function assertOnlyKeys(value, allowedKeys) {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some(key => !allowed.has(key))) {
    throw new HttpError(400, 'unexpected_field', '許可されていない項目が含まれています。');
  }
}

export function readBoundedString(value, {
  label,
  minLength = 1,
  maxLength,
  trim = true,
  pattern = null,
} = {}) {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'invalid_field', `${label || '項目'}が正しくありません。`);
  }
  const normalized = trim ? value.trim() : value;
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new HttpError(400, 'invalid_field', `${label || '項目'}の長さが正しくありません。`);
  }
  if (pattern && !pattern.test(normalized)) {
    throw new HttpError(400, 'invalid_field', `${label || '項目'}の形式が正しくありません。`);
  }
  return normalized;
}

function applyResponseHeaders(response, cacheControl) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', cacheControl);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Vary', 'Origin');
}

export function sendJson(response, status, payload, {
  cacheControl = 'private, no-store, max-age=0',
  headers = {},
} = {}) {
  applyResponseHeaders(response, cacheControl);
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

export function sendApiError(response, error) {
  if (error instanceof HttpError) {
    sendJson(response, error.status, {
      error: {
        code: error.code,
        message: error.message,
      },
    }, { headers: error.headers });
    return;
  }

  // Do not include upstream responses, prompts, tokens, email addresses, or stack traces.
  sendJson(response, 500, {
    error: {
      code: 'internal_error',
      message: '処理を完了できませんでした。時間をおいて再度お試しください。',
    },
  });
}

export async function withApiErrors(response, operation) {
  try {
    await operation();
  } catch (error) {
    sendApiError(response, error);
  }
}
