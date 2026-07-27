import { generateAiText, isAiFeature } from '../server/ai.mjs';
import {
  assertMethod,
  assertOnlyKeys,
  assertPlainObject,
  assertRequestOrigin,
  HttpError,
  readBoundedString,
  readJsonBody,
  sendJson,
  withApiErrors,
} from '../server/http.mjs';
import { authenticateSupabaseRequest, consumePortalRateLimit } from '../server/supabase.mjs';

export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  return withApiErrors(response, async () => {
    assertMethod(request, 'POST');
    assertRequestOrigin(request);
    const { user } = await authenticateSupabaseRequest(request);
    // 16,000 Japanese characters can exceed 48 KiB in UTF-8.
    const body = assertPlainObject(await readJsonBody(request, { maxBytes: 65_536 }));
    assertOnlyKeys(body, ['feature', 'prompt']);
    const feature = readBoundedString(body.feature, {
      label: 'AI機能',
      maxLength: 32,
      pattern: /^[a-z-]+$/,
    });
    if (!isAiFeature(feature)) {
      throw new HttpError(400, 'invalid_feature', 'AI機能の指定が正しくありません。');
    }
    const prompt = readBoundedString(body.prompt, {
      label: 'AIへ送る内容',
      maxLength: 16_000,
    });

    await consumePortalRateLimit(user.id, user.email, `ai:${feature}`, {
      limit: 20,
      windowSeconds: 3600,
    });
    const text = await generateAiText(feature, prompt);
    sendJson(response, 200, { text });
  });
}
