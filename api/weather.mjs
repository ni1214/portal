import {
  assertMethod,
  assertNoRequestBody,
  assertRequestOrigin,
  sendJson,
  withApiErrors,
} from '../server/http.mjs';
import { authenticateSupabaseRequest, consumePortalRateLimit } from '../server/supabase.mjs';
import { fetchNormalizedWeather } from '../server/weather.mjs';

export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  return withApiErrors(response, async () => {
    assertMethod(request, 'GET');
    assertRequestOrigin(request);
    assertNoRequestBody(request);
    const { user } = await authenticateSupabaseRequest(request);
    await consumePortalRateLimit(user.id, user.email, 'weather', {
      limit: 120,
      windowSeconds: 3600,
    });
    const weather = await fetchNormalizedWeather();
    sendJson(response, 200, weather);
  });
}
