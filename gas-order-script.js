// Google Apps Script - 鋼材発注メール送信
// デプロイ前に「プロジェクトの設定 > スクリプト プロパティ」へ
// PORTAL_ORDER_TOKEN を登録し、Vercel の GAS_ORDER_TOKEN と同じ値にする。
// Web アプリは Vercel Function からだけ呼び出し、URL をブラウザへ配布しない。

const SENDER_NAME = '日建フレメックス株式会社 生産管理課';
const MAX_REQUEST_CHARS = 100000;

function doPost(e) {
  var orderId = '';
  var attemptId = '';
  var action = 'send';
  var markedSending = false;
  try {
    const raw = e && e.postData && typeof e.postData.contents === 'string'
      ? e.postData.contents
      : '';
    if (!raw || raw.length > MAX_REQUEST_CHARS) {
      return buildOrderResponse(false, 'rejected_before_send', orderId, attemptId);
    }

    const data = JSON.parse(raw);
    action = data && data.action === 'reconcile' ? 'reconcile' : 'send';
    const allowedKeys = action === 'reconcile'
      ? ['token', 'action', 'orderId', 'attemptId', 'resolution']
      : ['token', 'orderId', 'attemptId', 'to', 'subject', 'body', 'replyTo'];
    if (!isPlainObject(data) || Object.keys(data).some(function (key) {
      return allowedKeys.indexOf(key) === -1;
    })) return buildOrderResponse(false, 'rejected_before_send', orderId, attemptId);

    orderId = readIdentifier(data.orderId);
    attemptId = readIdentifier(data.attemptId);

    const expectedToken = PropertiesService.getScriptProperties().getProperty('PORTAL_ORDER_TOKEN') || '';
    if (!secureEquals(data.token, expectedToken) || expectedToken.length < 32) {
      return buildOrderResponse(false, 'rejected_before_send', orderId, attemptId);
    }

    if (action === 'reconcile') {
      const resolution = data.resolution === 'sent'
        ? 'sent'
        : (data.resolution === 'not_sent' ? 'not_sent' : '');
      if (!orderId || !attemptId || !resolution) {
        return buildOrderResponse(false, 'reconciliation_conflict', orderId, attemptId);
      }
      return reconcileOrderState(orderId, attemptId, resolution);
    }

    const to = readText(data.to, 3, 254);
    const subject = readText(data.subject, 1, 200);
    const body = readText(data.body, 1, 80000);
    const replyTo = readText(data.replyTo, 3, 254);
    if (!isSingleEmail(to) || !isSingleEmail(replyTo) || !orderId || !attemptId) {
      return buildOrderResponse(false, 'rejected_before_send', orderId, attemptId);
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const state = readOrderState(orderId);
      if (state.status === 'sent') {
        return buildOrderResponse(true, 'already_sent', orderId, attemptId);
      }
      if (state.status === 'sending') {
        return buildOrderResponse(false, 'unknown', orderId, attemptId);
      }

      rememberOrderState(orderId, 'SENDING', attemptId);
      markedSending = true;
      GmailApp.sendEmail(to, subject, body, {
        name: SENDER_NAME,
        replyTo: replyTo,
      });
      rememberOrderState(orderId, 'SENT', attemptId);
    } finally {
      lock.releaseLock();
    }
    return buildOrderResponse(true, 'sent', orderId, attemptId);
  } catch (error) {
    // Do not expose tokens, recipients, message bodies, or provider errors.
    return buildOrderResponse(
      false,
      action === 'reconcile'
        ? 'reconciliation_failed'
        : (markedSending ? 'unknown' : 'rejected_before_send'),
      orderId,
      attemptId
    );
  }
}

function doGet() {
  return buildResponse({ status: 'ok' });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readText(value, minLength, maxLength) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return normalized.length >= minLength && normalized.length <= maxLength ? normalized : '';
}

function isSingleEmail(value) {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
}

function readIdentifier(value) {
  if (typeof value !== 'string' || value.length > 128) return '';
  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : '';
}

function processedOrderKey(orderId) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, orderId, Utilities.Charset.UTF_8);
  const hex = digest.map(function (byte) {
    return (byte + 256).toString(16).slice(-2);
  }).join('');
  return 'SENT_' + hex;
}

function readOrderState(orderId) {
  const value = PropertiesService.getScriptProperties().getProperty(processedOrderKey(orderId)) || '';
  if (!value) return { status: 'none' };
  try {
    const parsed = JSON.parse(value);
    if (
      isPlainObject(parsed)
      && ['sending', 'sent', 'retry_allowed'].indexOf(parsed.status) !== -1
    ) {
      return {
        status: parsed.status,
        attemptId: readIdentifier(parsed.attemptId),
      };
    }
  } catch (error) {
    // Continue with the legacy state format used by the previous deployment.
  }
  if (value.indexOf('SENDING:') === 0) {
    return readLegacyOrderState(value, 'SENDING', 'sending');
  }
  if (value.indexOf('SENT:') === 0) {
    return readLegacyOrderState(value, 'SENT', 'sent');
  }
  if (value.indexOf('RETRY_ALLOWED:') === 0) {
    return readLegacyOrderState(value, 'RETRY_ALLOWED', 'retry_allowed');
  }
  // Values written by the previous deployment represent completed sends.
  return { status: 'sent' };
}

function readLegacyOrderState(value, storedStatus, status) {
  const prefix = storedStatus + ':';
  const timestampAndAttempt = value.slice(prefix.length);
  const attemptId = timestampAndAttempt.length > 25
    && timestampAndAttempt.charAt(24) === ':'
    ? readIdentifier(timestampAndAttempt.slice(25))
    : '';
  return { status: status, attemptId: attemptId };
}

function rememberOrderState(orderId, status, attemptId) {
  PropertiesService.getScriptProperties().setProperty(
    processedOrderKey(orderId),
    JSON.stringify({
      status: String(status || '').toLowerCase(),
      updatedAt: new Date().toISOString(),
      attemptId: attemptId,
    })
  );
}

function reconcileOrderState(orderId, attemptId, resolution) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const state = readOrderState(orderId);
    if (state.status === 'sent') {
      return buildOrderResponse(
        resolution === 'sent',
        resolution === 'sent' ? 'already_sent' : 'provider_already_sent',
        orderId,
        attemptId
      );
    }
    if (state.attemptId !== attemptId) {
      return buildOrderResponse(false, 'reconciliation_conflict', orderId, attemptId);
    }
    if (resolution === 'sent' && state.status === 'sending') {
      rememberOrderState(orderId, 'SENT', attemptId);
      return buildOrderResponse(true, 'sent_confirmed', orderId, attemptId);
    }
    if (resolution === 'not_sent' && state.status === 'retry_allowed') {
      return buildOrderResponse(true, 'already_retry_allowed', orderId, attemptId);
    }
    if (resolution === 'not_sent' && state.status === 'sending') {
      rememberOrderState(orderId, 'RETRY_ALLOWED', attemptId);
      return buildOrderResponse(true, 'retry_allowed', orderId, attemptId);
    }
    return buildOrderResponse(false, 'reconciliation_conflict', orderId, attemptId);
  } finally {
    lock.releaseLock();
  }
}

function secureEquals(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index % Math.max(1, left.length)) || 0)
      ^ (right.charCodeAt(index % Math.max(1, right.length)) || 0);
  }
  return mismatch === 0;
}

function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildOrderResponse(success, status, orderId, attemptId) {
  return buildResponse({
    success: success === true,
    status: status,
    orderId: orderId || '',
    attemptId: attemptId || '',
  });
}
