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
  readOrderEmailConfiguration,
  sendClaimedOrderEmail,
} from '../server/order-email.mjs';
import { authenticateSupabaseRequest, consumePortalRateLimit } from '../server/supabase.mjs';

export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  return withApiErrors(response, async () => {
    assertMethod(request, 'POST');
    assertRequestOrigin(request);
    assertOrderEmailDeliveryAllowed();
    const { user } = await authenticateSupabaseRequest(request);
    const body = assertPlainObject(await readJsonBody(request, { maxBytes: 1024 }));
    assertOnlyKeys(body, ['orderId']);
    const orderId = readBoundedString(body.orderId, {
      label: '発注ID',
      maxLength: 128,
      pattern: /^[A-Za-z0-9._:-]+$/,
    });
    await consumePortalRateLimit(user.id, user.email, 'order-email', {
      limit: 20,
      windowSeconds: 3600,
    });
    const emailConfig = readOrderEmailConfiguration();
    const result = await sendClaimedOrderEmail(user, orderId, emailConfig);
    sendJson(response, 200, { ok: true, ...result });
  });
}
