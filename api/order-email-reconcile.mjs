import {
  assertMethod,
  assertOnlyKeys,
  assertPlainObject,
  assertRequestOrigin,
  readBoundedString,
  readJsonBody,
  sendJson,
  withApiErrors,
} from '../server/http.mjs';
import {
  assertOrderEmailDeliveryAllowed,
  reconcileClaimedOrderEmail,
} from '../server/order-email.mjs';
import {
  authenticateSupabaseRequest,
  consumePortalRateLimit,
} from '../server/supabase.mjs';

export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  return withApiErrors(response, async () => {
    assertMethod(request, 'POST');
    assertRequestOrigin(request);
    assertOrderEmailDeliveryAllowed();
    const { user } = await authenticateSupabaseRequest(request);
    const body = assertPlainObject(await readJsonBody(request, { maxBytes: 2048 }));
    assertOnlyKeys(body, ['orderId', 'attemptId', 'resolution']);
    const identifierOptions = {
      maxLength: 128,
      pattern: /^[A-Za-z0-9._:-]+$/,
    };
    const orderId = readBoundedString(body.orderId, {
      ...identifierOptions,
      label: '発注ID',
    });
    const attemptId = readBoundedString(body.attemptId, {
      ...identifierOptions,
      label: '送信試行ID',
    });
    const resolution = readBoundedString(body.resolution, {
      label: '確認結果',
      maxLength: 16,
      pattern: /^(?:sent|not_sent)$/,
    });
    await consumePortalRateLimit(user.id, user.email, 'order-email-reconcile', {
      limit: 20,
      windowSeconds: 3600,
    });
    const result = await reconcileClaimedOrderEmail(
      user,
      orderId,
      attemptId,
      resolution,
    );
    sendJson(response, 200, { ok: true, ...result });
  });
}
