import { optionalEnv, parseHttpsUrl, requiredEnv } from './env.mjs';
import { HttpError } from './http.mjs';
import { callSupabaseServiceRpc } from './supabase.mjs';

const GAS_TIMEOUT_MS = 20_000;
const MAX_ITEMS = 100;

export function assertOrderEmailDeliveryAllowed() {
  if (optionalEnv('VERCEL_ENV').toLowerCase() === 'preview') {
    throw new HttpError(
      403,
      'preview_operation_not_allowed',
      'プレビュー環境から発注メールは送信できません。',
    );
  }
}

function asPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(502, 'invalid_order_data', `${label}を確認できませんでした。`);
  }
  return value;
}

function cleanSingleLine(value, maxLength, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength) || fallback;
}

function cleanBodyText(value, maxLength, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.replace(/\u0000/g, '').trim().slice(0, maxLength) || fallback;
}

function readEmail(value, label) {
  const email = cleanSingleLine(value, 254);
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) {
    throw new HttpError(422, 'invalid_order_recipient', `${label}が正しくありません。`);
  }
  return email;
}

function normalizeItems(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ITEMS) {
    throw new HttpError(422, 'invalid_order_items', '発注明細を確認できませんでした。');
  }
  return value.map((rawItem) => {
    const item = asPlainObject(rawItem, '発注明細');
    const quantity = Number(item.qty);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
      throw new HttpError(422, 'invalid_order_items', '発注明細の数量が正しくありません。');
    }
    const category = cleanSingleLine(item.category || item.name, 80, '鋼材');
    const spec = cleanSingleLine(item.spec, 100, '規格なし');
    return {
      category,
      spec,
      finish: cleanSingleLine(item.finish, 40),
      length: cleanSingleLine(item.length, 40),
      unit: cleanSingleLine(item.unit, 12, '本'),
      quantity,
    };
  });
}

function formatOrderedAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new HttpError(502, 'invalid_order_data', '発注日時を確認できませんでした。');
  }
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function normalizeClaimedOrder(value) {
  const order = asPlainObject(value, '発注内容');
  const orderType = order.order_type === 'site' ? 'site' : 'factory';
  return {
    id: cleanSingleLine(order.id, 128),
    supplierName: cleanSingleLine(order.supplier_name, 200, '発注先'),
    supplierEmail: readEmail(order.supplier_email, '発注先メールアドレス'),
    orderType,
    siteName: cleanSingleLine(order.site_name, 200),
    projectKey: cleanSingleLine(order.project_key, 100),
    items: normalizeItems(order.items),
    orderedBy: cleanSingleLine(order.ordered_by, 100, 'ポータル利用者'),
    note: cleanBodyText(order.note, 2000, 'なし'),
    orderedAt: formatOrderedAt(order.ordered_at),
  };
}

function composeOrderEmail(order) {
  const companyName = cleanSingleLine(requiredEnv('ORDER_COMPANY_NAME'), 200);
  const departmentName = cleanSingleLine(requiredEnv('ORDER_DEPARTMENT_NAME'), 200);
  const contactName = cleanSingleLine(requiredEnv('ORDER_CONTACT_NAME'), 100);
  const replyTo = readEmail(requiredEnv('ORDER_REPLY_TO'), '返信先メールアドレス');
  if (!companyName || !departmentName || !contactName) {
    throw new HttpError(500, 'server_misconfigured', 'メール送信設定を確認できませんでした。');
  }

  const typeLabel = order.orderType === 'site' ? '現場名発注' : '工場在庫';
  const projectSuffix = order.projectKey ? ` / ${order.projectKey}` : '';
  const subject = `【鋼材発注・${typeLabel}】${order.orderedAt.split(' ')[0]}${projectSuffix} - ${companyName} ${departmentName} [${order.id}]`
    .slice(0, 200);
  const itemLines = order.items.map((item, index) => {
    const number = String(index + 1).padStart(2, ' ');
    const finish = item.finish ? `　${item.finish}` : '';
    const length = item.length ? `　L=${item.length}` : '';
    return `${number}    ${item.category}　${item.spec}${finish}${length}      ${item.quantity}${item.unit}`;
  }).join('\n');
  const siteLine = order.orderType === 'site' && order.siteName ? `現場名　：${order.siteName}\n` : '';
  const projectLine = order.projectKey ? `物件No　：${order.projectKey}\n` : '';

  const body = `${order.supplierName}\nご担当者様\n\nいつもお世話になっております。\n${companyName} ${departmentName}の${contactName}です。\n\n以下の通り、鋼材の発注をお願いいたします。\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n発注ID　：${order.id}\n発注日時：${order.orderedAt}\n発注担当：${order.orderedBy}\n発注区分：${typeLabel}\n${siteLine}${projectLine}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n【発注明細】\nNo.  品名・規格                    数量\n────────────────────────────────────────\n${itemLines}\n────────────────────────────────────────\n\n【備考】\n${order.note}\n\nどうぞよろしくお願いいたします。\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${companyName}\n${departmentName}　${contactName}\nE-mail：${replyTo}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  if (body.length > 80_000) {
    throw new HttpError(422, 'order_email_too_large', '発注メールの内容が大きすぎます。');
  }
  return { to: order.supplierEmail, subject, body, replyTo };
}

function getGasUrl() {
  const url = parseHttpsUrl(requiredEnv('GAS_ORDER_URL'), 'GAS_ORDER_URL');
  if (url.hostname !== 'script.google.com' || !url.pathname.startsWith('/macros/s/')) {
    throw new HttpError(500, 'server_misconfigured', 'メール送信先の設定を確認できませんでした。');
  }
  return url;
}

async function requestGas(payload) {
  const token = requiredEnv('GAS_ORDER_TOKEN');
  if (token.length < 32) {
    throw new HttpError(500, 'server_misconfigured', 'メール送信設定を確認できませんでした。');
  }
  const gasUrl = getGasUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GAS_TIMEOUT_MS);
  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, ...payload }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error('email-provider-http-error');
    }
    const raw = await response.text();
    if (raw.length > 4096) {
      throw new Error('email-provider-response-too-large');
    }
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      throw new Error('email-provider-invalid-json');
    }
    if (
      result?.orderId !== payload.orderId
      || result?.attemptId !== payload.attemptId
    ) {
      throw new Error('email-provider-attempt-mismatch');
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function postToGas(payload) {
  try {
    const result = await requestGas(payload);
    if (
      result?.success === true
      && (result.status === 'sent' || result.status === 'already_sent')
    ) {
      return result;
    }
    if (result?.status === 'rejected_before_send') {
      throw new HttpError(
        502,
        'email_provider_rejected',
        'メール送信サービスで処理を開始できませんでした。',
      );
    }
    throw new Error('email-provider-delivery-unknown');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Once fetch begins, a timeout or malformed response cannot prove that
    // Gmail rejected the message. Treat every such outcome as unknown and
    // never make the order automatically sendable again.
    throw new HttpError(
      409,
      'email_delivery_unconfirmed',
      '送信結果を確認中です。二重送信を防ぐため、自動再送は停止しています。',
    );
  }
}

async function reconcileGasOrderState(orderId, attemptId, resolution) {
  let result;
  try {
    result = await requestGas({
      action: 'reconcile',
      orderId,
      attemptId,
      resolution,
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      'email_reconciliation_provider_failed',
      'メール送信サービスの状態を確認できませんでした。時間をおいて再実行してください。',
    );
  }

  const acceptedStatuses = resolution === 'sent'
    ? new Set(['sent_confirmed', 'already_sent'])
    : new Set(['retry_allowed', 'already_retry_allowed']);
  if (result?.success === true && acceptedStatuses.has(result.status)) return;
  if (result?.status === 'provider_already_sent') {
    throw new HttpError(
      409,
      'email_already_sent_at_provider',
      'メール送信サービスでは送信済みです。Gmailを確認し「送信済みに確定」を選んでください。',
    );
  }
  throw new HttpError(
    409,
    'email_reconciliation_conflict',
    '送信試行の状態が更新されています。履歴を再読み込みして確認してください。',
  );
}

async function finishClaim(user, orderId, attemptId, success) {
  const result = await callSupabaseServiceRpc('finish_order_email_send', {
    p_user_id: user.id,
    p_user_email: user.email,
    p_order_id: orderId,
    p_attempt_id: attemptId,
    p_success: success,
  });
  if (result !== true) {
    throw new HttpError(503, 'email_state_update_failed', 'メール送信状態を更新できませんでした。');
  }
}

export async function sendClaimedOrderEmail(user, orderId) {
  assertOrderEmailDeliveryAllowed();
  const claim = await callSupabaseServiceRpc('claim_order_email_send', {
    p_user_id: user.id,
    p_user_email: user.email,
    p_order_id: orderId,
  });
  const claimResult = asPlainObject(claim, 'メール送信状態');
  if (claimResult.claimed !== true) {
    if (claimResult.status === 'already_sent') return { alreadySent: true };
    if (claimResult.status === 'sending') {
      throw new HttpError(
        409,
        'email_delivery_unconfirmed',
        'この発注メールは送信処理中、または送信結果の確認待ちです。二重送信を防ぐため自動再送しません。',
      );
    }
    if (claimResult.status === 'not_found') {
      throw new HttpError(404, 'order_not_found', '発注内容が見つかりません。');
    }
    throw new HttpError(409, 'order_not_sendable', 'この発注メールは現在送信できません。');
  }

  const attemptId = cleanSingleLine(claimResult.attempt_id, 128);
  if (!attemptId) {
    throw new HttpError(502, 'invalid_order_claim', 'メール送信状態を確認できませんでした。');
  }
  try {
    const order = normalizeClaimedOrder(claimResult.order);
    if (!order.id || order.id !== orderId) {
      throw new HttpError(502, 'invalid_order_claim', '発注内容を確認できませんでした。');
    }
    const message = composeOrderEmail(order);
    await postToGas({ orderId, attemptId, ...message });
  } catch (error) {
    if (error?.code !== 'email_delivery_unconfirmed') {
      try {
        await finishClaim(user, orderId, attemptId, false);
      } catch {
        // A failed state update leaves "sending", which is intentionally
        // non-retryable until an administrator verifies the mailbox.
      }
    }
    throw error;
  }
  try {
    await finishClaim(user, orderId, attemptId, true);
  } catch {
    throw new HttpError(
      409,
      'email_delivery_unconfirmed',
      'メール送信後の状態を確定できませんでした。二重送信を防ぐため、自動再送は停止しています。',
    );
  }
  return { alreadySent: false };
}

export async function reconcileClaimedOrderEmail(
  user,
  orderId,
  attemptId,
  resolution,
) {
  assertOrderEmailDeliveryAllowed();
  const authorized = await callSupabaseServiceRpc(
    'authorize_order_email_resolution',
    {
      p_user_id: user.id,
      p_user_email: user.email,
      p_order_id: orderId,
      p_attempt_id: attemptId,
      p_resolution: resolution,
    },
  );
  if (authorized !== true) {
    throw new HttpError(
      409,
      'email_reconciliation_conflict',
      '送信状態が更新されています。履歴を再読み込みして確認してください。',
    );
  }

  await reconcileGasOrderState(orderId, attemptId, resolution);

  const result = await callSupabaseServiceRpc('resolve_order_email_send', {
    p_user_id: user.id,
    p_user_email: user.email,
    p_order_id: orderId,
    p_attempt_id: attemptId,
    p_resolution: resolution,
  });
  if (result !== true) {
    // GAS reconciliation is idempotent. A retry can safely complete the DB
    // transition if this request lost the response or Supabase was temporary
    // unavailable after the provider state had already been reconciled.
    throw new HttpError(
      409,
      'email_reconciliation_conflict',
      '送信状態が更新されています。履歴を再読み込みして確認してください。',
    );
  }
  return {
    resolution,
    retryAllowed: resolution === 'not_sent',
  };
}
