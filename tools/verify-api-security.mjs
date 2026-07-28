import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

Object.assign(process.env, {
  SITE_ORIGIN: 'https://portal.example.com',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  GEMINI_API_KEY: 'gemini-test-key',
  OPENWEATHER_API_KEY: 'rotated-weather-test-key',
  GAS_ORDER_URL: 'https://script.google.com/macros/s/test/exec',
  GAS_ORDER_TOKEN: '0123456789abcdef0123456789abcdef',
  ORDER_COMPANY_NAME: 'Test Company',
  ORDER_DEPARTMENT_NAME: 'Production',
  ORDER_CONTACT_NAME: 'Operator',
  ORDER_REPLY_TO: 'orders@framex.co.jp',
});

// Vercel executes this verifier inside a Preview build where these variables
// are already set. Start normal-path tests from a deterministic environment;
// Preview-specific behavior is enabled explicitly later in this file.
delete process.env.VERCEL_ENV;
delete process.env.VERCEL_URL;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const REGISTERED_EMAIL = 'portal.owner@gmail.com';
const UNREGISTERED_EMAIL = 'another.portal.user@gmail.com';
const RATE_LIMIT_RULES = new Map([
  ['ai:email', { limit: 20, windowSeconds: 3600 }],
  ['weather', { limit: 120, windowSeconds: 3600 }],
  ['order-email', { limit: 20, windowSeconds: 3600 }],
  ['order-email-reconcile', { limit: 20, windowSeconds: 3600 }],
]);
let authEmail = REGISTERED_EMAIL;
let authProvider = 'google';
let authProviders = ['google'];
let authJwtSubject = USER_ID;
let authJwtEmail = authEmail;
let authAmr = ['oauth'];
let rateLimitAllowed = true;
let gasRequest = null;
let gasRequestCount = 0;
let gasMode = 'success';
let gasReconcileMode = 'success';
let orderClaimMode = 'claimed';
let orderAuthorizeMode = 'success';
let orderResolveMode = 'success';
let lastAuthBearerToken = '';
let weatherProviderRequestCount = 0;
const rpcRequests = [];

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function createMockAuthToken() {
  return [
    encodeJwtPart({ alg: 'RS256', typ: 'JWT' }),
    encodeJwtPart({
      sub: authJwtSubject,
      email: authJwtEmail,
      role: 'authenticated',
      amr: authAmr.map(method => ({ method, timestamp: 1_784_764_800 })),
    }),
    'mock-signature',
  ].join('.');
}

function isRegisteredMemberPayload(payload) {
  return payload.p_user_id === USER_ID && payload.p_user_email === REGISTERED_EMAIL;
}

function isExpectedResolutionPayload(payload) {
  return isRegisteredMemberPayload(payload)
    && payload.p_order_id === 'order-123'
    && payload.p_attempt_id === 'attempt-1'
    && ['sent', 'not_sent'].includes(payload.p_resolution);
}

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.endsWith('/auth/v1/user')) {
    assert.equal(options.headers.apikey, process.env.SUPABASE_PUBLISHABLE_KEY);
    assert.match(options.headers.Authorization, /^Bearer\s+\S+$/);
    lastAuthBearerToken = options.headers.Authorization.slice('Bearer '.length);
    return Response.json({
      id: USER_ID,
      email: authEmail,
      app_metadata: { provider: authProvider, providers: authProviders },
    });
  }

  if (url.includes('/rest/v1/rpc/')) {
    assert.equal(options.headers.apikey, process.env.SUPABASE_SECRET_KEY);
    assert.equal(
      Object.keys(options.headers).some(name => name.toLowerCase() === 'authorization'),
      false,
    );
    const payload = JSON.parse(options.body);
    rpcRequests.push({ url, payload });
    if (url.includes('/rpc/consume_portal_rate_limit')) {
      if (!isRegisteredMemberPayload(payload)) {
        return Response.json({ message: 'Active portal member was not found' }, { status: 403 });
      }
      const rule = RATE_LIMIT_RULES.get(payload.p_feature);
      if (!rule) {
        return Response.json({ message: 'Unsupported rate-limit feature' }, { status: 400 });
      }
      assert.equal(payload.p_limit, rule.limit);
      assert.equal(payload.p_window_seconds, rule.windowSeconds);
      return Response.json(rateLimitAllowed);
    }
    if (!isRegisteredMemberPayload(payload)) {
      return Response.json({ message: 'Active portal member was not found' }, { status: 403 });
    }
    if (url.includes('/rpc/claim_order_email_send')) {
      if (payload.p_order_id !== 'order-123') {
        return Response.json({ claimed: false, status: 'not_found' });
      }
      if (orderClaimMode === 'sending') {
        return Response.json({ claimed: false, status: 'sending' });
      }
      return Response.json({
        claimed: true,
        attempt_id: 'attempt-1',
        order: {
          id: 'order-123',
          supplier_name: 'Supplier',
          supplier_email: 'supplier@example.com',
          order_type: 'factory',
          site_name: null,
          project_key: 'P-1',
          items: [{ category: 'Steel', spec: 'L-50', unit: 'pcs', qty: 2 }],
          ordered_by: 'User',
          note: '',
          ordered_at: '2026-07-23T00:00:00Z',
        },
      });
    }
    if (url.includes('/rpc/finish_order_email_send')) {
      return Response.json(
        payload.p_order_id === 'order-123'
        && payload.p_attempt_id === 'attempt-1'
        && typeof payload.p_success === 'boolean',
      );
    }
    if (url.includes('/rpc/authorize_order_email_resolution')) {
      if (orderAuthorizeMode === 'denied') {
        return Response.json({ message: 'denied' }, { status: 403 });
      }
      if (orderAuthorizeMode === 'conflict') return Response.json(false);
      return Response.json(isExpectedResolutionPayload(payload));
    }
    if (url.includes('/rpc/resolve_order_email_send')) {
      if (orderResolveMode === 'denied') {
        return Response.json({ message: 'denied' }, { status: 403 });
      }
      if (orderResolveMode === 'conflict') return Response.json(false);
      return Response.json(isExpectedResolutionPayload(payload));
    }
  }

  if (url.startsWith('https://script.google.com/')) {
    gasRequest = { url, payload: JSON.parse(options.body) };
    gasRequestCount += 1;
    if (gasMode === 'http-error') {
      return new Response('provider error', { status: 500 });
    }
    if (gasRequest.payload.action === 'reconcile') {
      if (gasReconcileMode === 'conflict') {
        return Response.json({
          success: false,
          status: 'reconciliation_conflict',
          orderId: gasRequest.payload.orderId,
          attemptId: gasRequest.payload.attemptId,
        });
      }
      if (gasReconcileMode === 'already-sent') {
        return Response.json({
          success: false,
          status: 'provider_already_sent',
          orderId: gasRequest.payload.orderId,
          attemptId: gasRequest.payload.attemptId,
        });
      }
      return Response.json({
        success: true,
        status: gasRequest.payload.resolution === 'sent'
          ? 'sent_confirmed'
          : 'retry_allowed',
        orderId: gasRequest.payload.orderId,
        attemptId: gasRequest.payload.attemptId,
      });
    }
    return Response.json({
      success: true,
      status: 'sent',
      orderId: gasRequest.payload.orderId,
      attemptId: gasRequest.payload.attemptId,
    });
  }
  if (url.includes('generativelanguage.googleapis.com')) {
    assert.equal(options.headers['x-goog-api-key'], process.env.GEMINI_API_KEY);
    return Response.json({ candidates: [{ content: { parts: [{ text: 'generated' }] } }] });
  }
  if (url.includes('/data/2.5/weather')) {
    weatherProviderRequestCount += 1;
    assert.match(url, /appid=rotated-weather-test-key/);
    return Response.json({
      name: 'Takasaki',
      main: { temp: 30, feels_like: 32, humidity: 55 },
      wind: { speed: 2.5 },
      weather: [{ description: 'clear', icon: '01d' }],
    });
  }
  if (url.includes('/data/2.5/forecast')) {
    weatherProviderRequestCount += 1;
    return Response.json({
      list: Array.from({ length: 9 }, (_, index) => ({
        dt: 1_784_764_800 + index * 10_800,
        main: { temp: 29 + index, humidity: 50 },
        weather: [{ description: 'clear', icon: '01d' }],
      })),
    });
  }
  throw new Error(`Unexpected mocked request: ${url}`);
};

function createRequest(
  method,
  body,
  origin = process.env.SITE_ORIGIN,
  token = createMockAuthToken(),
) {
  return {
    method,
    headers: {
      ...(origin ? { origin } : {}),
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body,
    async *[Symbol.asyncIterator]() {
      throw new Error('A parsed Vercel body must take precedence over the request stream.');
    },
  };
}

function createResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(value = '') { this.body = value; },
  };
}

async function invoke(handler, request) {
  const response = createResponse();
  await handler(request, response);
  return {
    status: response.statusCode,
    headers: response.headers,
    payload: JSON.parse(response.body),
  };
}

const [
  { default: ai },
  { default: weather },
  { default: orderEmail },
  { default: reconcileOrderEmail },
] = await Promise.all([
  import('../api/ai.mjs'),
  import('../api/weather.mjs'),
  import('../api/order-email.mjs'),
  import('../api/order-email-reconcile.mjs'),
]);

const aiResult = await invoke(ai, createRequest('POST', { feature: 'email', prompt: 'test' }));
assert.equal(aiResult.status, 200);
assert.equal(aiResult.payload.text, 'generated');
assert.match(aiResult.headers['Cache-Control'], /no-store/);
assert.equal(lastAuthBearerToken, createMockAuthToken());

const weatherResult = await invoke(weather, createRequest('GET', undefined));
assert.equal(weatherResult.status, 200);
assert.equal(weatherResult.payload.forecast.length, 8);

const orderResult = await invoke(orderEmail, createRequest('POST', { orderId: 'order-123' }));
assert.equal(orderResult.status, 200);
assert.deepEqual(orderResult.payload, { ok: true, alreadySent: false });
assert.equal(gasRequest.payload.to, 'supplier@example.com');
assert.equal(gasRequest.payload.orderId, 'order-123');
assert.equal(gasRequest.payload.token, process.env.GAS_ORDER_TOKEN);
assert.ok(!gasRequest.url.includes(process.env.GAS_ORDER_TOKEN));

for (const request of rpcRequests) {
  assert.equal(request.payload.p_user_id, USER_ID);
  assert.equal(request.payload.p_user_email, REGISTERED_EMAIL);
}
assert.ok(rpcRequests.some(request => request.url.includes('/claim_order_email_send')));
assert.ok(rpcRequests.some(request => request.url.includes('/finish_order_email_send')));

const reconcileResult = await invoke(reconcileOrderEmail, createRequest(
  'POST',
  {
    orderId: 'order-123',
    attemptId: 'attempt-1',
    resolution: 'not_sent',
  },
));
assert.equal(reconcileResult.status, 200);
assert.deepEqual(reconcileResult.payload, {
  ok: true,
  resolution: 'not_sent',
  retryAllowed: true,
});
assert.deepEqual(gasRequest.payload, {
  token: process.env.GAS_ORDER_TOKEN,
  action: 'reconcile',
  orderId: 'order-123',
  attemptId: 'attempt-1',
  resolution: 'not_sent',
});
const resolutionRpc = rpcRequests.findLast(
  request => request.url.includes('/resolve_order_email_send'),
);
assert.deepEqual(resolutionRpc.payload, {
  p_user_id: USER_ID,
  p_user_email: REGISTERED_EMAIL,
  p_order_id: 'order-123',
  p_attempt_id: 'attempt-1',
  p_resolution: 'not_sent',
});
const authorizationRpc = rpcRequests.findLast(
  request => request.url.includes('/authorize_order_email_resolution'),
);
assert.deepEqual(authorizationRpc.payload, resolutionRpc.payload);

const resolutionCountBeforeProviderConflict = rpcRequests.filter(
  request => request.url.includes('/resolve_order_email_send'),
).length;
gasReconcileMode = 'conflict';
const providerConflict = await invoke(reconcileOrderEmail, createRequest(
  'POST',
  {
    orderId: 'order-123',
    attemptId: 'attempt-1',
    resolution: 'not_sent',
  },
));
assert.equal(providerConflict.status, 409);
assert.equal(providerConflict.payload.error.code, 'email_reconciliation_conflict');
assert.equal(
  rpcRequests.filter(request => request.url.includes('/resolve_order_email_send')).length,
  resolutionCountBeforeProviderConflict,
  'Supabase must not be changed when GAS reconciliation fails.',
);

gasReconcileMode = 'already-sent';
const providerAlreadySent = await invoke(reconcileOrderEmail, createRequest(
  'POST',
  {
    orderId: 'order-123',
    attemptId: 'attempt-1',
    resolution: 'not_sent',
  },
));
assert.equal(providerAlreadySent.status, 409);
assert.equal(providerAlreadySent.payload.error.code, 'email_already_sent_at_provider');

gasReconcileMode = 'success';
orderAuthorizeMode = 'denied';
const gasCountBeforeNonAdmin = gasRequestCount;
const nonAdminResolution = await invoke(reconcileOrderEmail, createRequest(
  'POST',
  {
    orderId: 'order-123',
    attemptId: 'attempt-1',
    resolution: 'sent',
  },
));
assert.equal(nonAdminResolution.status, 403);
assert.equal(nonAdminResolution.payload.error.code, 'operation_not_allowed');
assert.equal(
  gasRequestCount,
  gasCountBeforeNonAdmin,
  'A non-administrator must be rejected before GAS is called.',
);
orderAuthorizeMode = 'success';

orderResolveMode = 'conflict';
const gasCountBeforeDatabaseConflict = gasRequestCount;
const databaseConflict = await invoke(reconcileOrderEmail, createRequest(
  'POST',
  {
    orderId: 'order-123',
    attemptId: 'attempt-1',
    resolution: 'sent',
  },
));
assert.equal(databaseConflict.status, 409);
assert.equal(databaseConflict.payload.error.code, 'email_reconciliation_conflict');
assert.equal(gasRequestCount, gasCountBeforeDatabaseConflict + 1);
orderResolveMode = 'success';

const finishCountAfterSuccess = rpcRequests.filter(
  request => request.url.includes('/finish_order_email_send'),
).length;
gasMode = 'http-error';
const ambiguousOrder = await invoke(orderEmail, createRequest(
  'POST',
  { orderId: 'order-123' },
));
assert.equal(ambiguousOrder.status, 409);
assert.equal(ambiguousOrder.payload.error.code, 'email_delivery_unconfirmed');
assert.equal(
  rpcRequests.filter(request => request.url.includes('/finish_order_email_send')).length,
  finishCountAfterSuccess,
);

gasMode = 'success';
orderClaimMode = 'sending';
const sendingOrder = await invoke(orderEmail, createRequest(
  'POST',
  { orderId: 'order-123' },
));
assert.equal(sendingOrder.status, 409);
assert.equal(sendingOrder.payload.error.code, 'email_delivery_unconfirmed');
orderClaimMode = 'claimed';

const validGasToken = process.env.GAS_ORDER_TOKEN;
process.env.GAS_ORDER_TOKEN = 'too-short';
const finishCountBeforeRejected = rpcRequests.filter(
  request => request.url.includes('/finish_order_email_send'),
).length;
const rejectedBeforeDispatch = await invoke(orderEmail, createRequest(
  'POST',
  { orderId: 'order-123' },
));
assert.equal(rejectedBeforeDispatch.status, 500);
assert.equal(rejectedBeforeDispatch.payload.error.code, 'server_misconfigured');
const finishCallsAfterRejected = rpcRequests.filter(
  request => request.url.includes('/finish_order_email_send'),
);
assert.equal(finishCallsAfterRejected.length, finishCountBeforeRejected + 1);
assert.equal(finishCallsAfterRejected.at(-1).payload.p_success, false);
process.env.GAS_ORDER_TOKEN = validGasToken;

const crossOrigin = await invoke(ai, createRequest(
  'POST',
  { feature: 'email', prompt: 'test' },
  'https://evil.example',
));
assert.equal(crossOrigin.status, 403);
assert.equal(crossOrigin.payload.error.code, 'origin_not_allowed');

const weatherRequestsBeforeUnregisteredMember = weatherProviderRequestCount;
authEmail = UNREGISTERED_EMAIL;
authJwtEmail = authEmail;
const outsider = await invoke(weather, createRequest('GET', undefined));
assert.equal(outsider.status, 403);
assert.equal(outsider.payload.error.code, 'operation_not_allowed');
assert.equal(
  weatherProviderRequestCount,
  weatherRequestsBeforeUnregisteredMember,
  'An unregistered Google account must be rejected before OpenWeather is called.',
);
const outsiderMemberRpc = rpcRequests.findLast(
  request => request.url.includes('/consume_portal_rate_limit'),
);
assert.equal(outsiderMemberRpc.payload.p_user_email, UNREGISTERED_EMAIL);
authEmail = REGISTERED_EMAIL;
authJwtEmail = authEmail;

authEmail = '';
authJwtEmail = '';
const missingEmail = await invoke(weather, createRequest('GET', undefined));
assert.equal(missingEmail.status, 401);
assert.equal(missingEmail.payload.error.code, 'invalid_session');
authEmail = REGISTERED_EMAIL;
authJwtEmail = authEmail;

authProvider = 'github';
authProviders = ['github', 'google'];
authAmr = ['oauth'];
const mixedProvider = await invoke(weather, createRequest('GET', undefined));
assert.equal(mixedProvider.status, 403);
assert.equal(mixedProvider.payload.error.code, 'google_account_required');

authProvider = '';
authProviders = ['google'];
const providerListOnly = await invoke(weather, createRequest('GET', undefined));
assert.equal(providerListOnly.status, 403);
assert.equal(providerListOnly.payload.error.code, 'google_account_required');

authProvider = 'google';
authProviders = ['google'];
authAmr = ['password'];
const passwordAmr = await invoke(weather, createRequest('GET', undefined));
assert.equal(passwordAmr.status, 403);
assert.equal(passwordAmr.payload.error.code, 'google_account_required');
authProvider = 'google';
authProviders = ['google'];
authAmr = ['oauth'];

authJwtSubject = '22222222-2222-4222-8222-222222222222';
const subjectMismatch = await invoke(weather, createRequest('GET', undefined));
assert.equal(subjectMismatch.status, 401);
assert.equal(subjectMismatch.payload.error.code, 'invalid_session');
authJwtSubject = USER_ID;

authJwtEmail = 'different.jwt.user@gmail.com';
const emailMismatch = await invoke(weather, createRequest('GET', undefined));
assert.equal(emailMismatch.status, 401);
assert.equal(emailMismatch.payload.error.code, 'invalid_session');
authJwtEmail = authEmail;

const malformedJwt = await invoke(weather, createRequest(
  'GET',
  undefined,
  process.env.SITE_ORIGIN,
  'not-a-jwt',
));
assert.equal(malformedJwt.status, 401);
assert.equal(malformedJwt.payload.error.code, 'invalid_session');

process.env.VERCEL_ENV = 'preview';
process.env.VERCEL_URL = 'portal-git-test-team.vercel.app';
const previewOrigin = 'https://portal-git-test-team.vercel.app';
const previewOrderRpcCount = rpcRequests.length;
const previewOrderGasRequest = gasRequest;
const previewOrder = await invoke(orderEmail, createRequest(
  'POST',
  { orderId: 'order-123' },
  previewOrigin,
));
assert.equal(previewOrder.status, 403);
assert.equal(previewOrder.payload.error.code, 'preview_operation_not_allowed');
assert.equal(rpcRequests.length, previewOrderRpcCount);
assert.equal(gasRequest, previewOrderGasRequest);

const preview = await invoke(weather, createRequest('GET', undefined, previewOrigin));
assert.equal(preview.status, 200);

const previewSupabaseUrl = process.env.SUPABASE_URL;
process.env.SUPABASE_URL = 'https://ydcxgxzeavumvubrqmlq.supabase.co';
const previewProductionSupabase = await invoke(weather, createRequest(
  'GET',
  undefined,
  previewOrigin,
));
assert.equal(previewProductionSupabase.status, 500);
assert.equal(previewProductionSupabase.payload.error.code, 'internal_error');
process.env.SUPABASE_URL = previewSupabaseUrl;

const previewImpostor = await invoke(weather, createRequest('GET', undefined, 'https://portal-git-test-team.vercel.app.evil.example'));
assert.equal(previewImpostor.status, 403);

delete process.env.VERCEL_ENV;
delete process.env.VERCEL_URL;
const noOrigin = await invoke(weather, createRequest('GET', undefined, ''));
assert.equal(noOrigin.status, 200);

rateLimitAllowed = false;
const limited = await invoke(ai, createRequest('POST', { feature: 'email', prompt: 'test' }));
assert.equal(limited.status, 429);
assert.equal(limited.payload.error.code, 'rate_limit_exceeded');

const vercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.match(vercelConfig.buildCommand, /npm run check/);
assert.equal(vercelConfig.functions['api/ai.mjs'].maxDuration, 60);
assert.equal(vercelConfig.functions['api/weather.mjs'].maxDuration, 45);
assert.equal(vercelConfig.functions['api/order-email.mjs'].maxDuration, 60);
assert.equal(vercelConfig.functions['api/order-email-reconcile.mjs'].maxDuration, 45);
for (const [pathname, functionConfig] of Object.entries(vercelConfig.functions)) {
  assert.ok(
    Number(functionConfig.maxDuration) <= 60,
    `${pathname} exceeds the Vercel Hobby legacy duration limit.`,
  );
}

console.log('API authentication, origin, secret-key, rate-limit, and secret-boundary checks passed.');
