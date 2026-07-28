import { access, readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];

async function exists(pathname) {
  try {
    await access(resolve(root, pathname));
    return true;
  } catch {
    return false;
  }
}

async function read(pathname) {
  return readFile(resolve(root, pathname), 'utf8');
}

async function walk(pathname) {
  const base = resolve(root, pathname);
  const entries = await readdir(base, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(base, entry.name);
    if (entry.isDirectory()) files.push(...await walk(relative(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message);
}

function forbidMatch(text, pattern, message) {
  if (pattern.test(text)) failures.push(message);
}

function normalizeSql(text) {
  return text
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeSqlType(type) {
  return type
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^pg_catalog\./, '');
}

function sliceNormalizedFunction(normalizedSql, functionName) {
  const marker = `create or replace function ${functionName}`;
  const start = normalizedSql.indexOf(marker);
  if (start < 0) return '';
  const next = normalizedSql.indexOf('create or replace function ', start + marker.length);
  return normalizedSql.slice(start, next < 0 ? normalizedSql.length : next);
}

function parseFunctionParameterTypes(parameters) {
  if (!parameters.trim()) return [];
  return parameters.split(',').map(parameter => {
    const withoutDefault = parameter.replace(/\s+default\s+[\s\S]*$/i, '').trim();
    const match = withoutDefault.match(
      /^(?:(?:in|out|inout|variadic)\s+)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+(.+)$/i,
    );
    return normalizeSqlType(match ? match[1] : withoutDefault);
  });
}

function parseFunctionDefinitions(sql) {
  const definitions = new Map();
  const pattern = /create\s+or\s+replace\s+function\s+([a-z0-9_".]+)\s*\(([\s\S]*?)\)\s*returns\b/gi;
  for (const match of sql.matchAll(pattern)) {
    const name = match[1].replaceAll('"', '').toLowerCase();
    const signatures = definitions.get(name) || [];
    signatures.push(parseFunctionParameterTypes(match[2]));
    definitions.set(name, signatures);
  }
  return definitions;
}

function parseFunctionAcls(normalizedSql) {
  const acls = [];
  const pattern = /^(grant|revoke)\s+(all(?:\s+privileges)?|execute)\s+on\s+function\s+([a-z0-9_".]+)\s*\(([^)]*)\)\s+(to|from)\s+(.+)$/i;
  for (const statement of normalizedSql.split(';').map(value => value.trim())) {
    const match = statement.match(pattern);
    if (!match) continue;
    acls.push({
      action: match[1].toLowerCase(),
      privilege: match[2].toLowerCase().replace(/\s+privileges$/, ''),
      name: match[3].replaceAll('"', '').toLowerCase(),
      types: match[4].split(',').map(normalizeSqlType).filter(Boolean),
      direction: match[5].toLowerCase(),
      roles: match[6].split(',').map(role => role.trim().replaceAll('"', '')).filter(Boolean),
    });
  }
  return acls;
}

function sameValues(actual, expected) {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function sameSet(actual, expected) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return actual.length === expected.length
    && actualSet.size === expectedSet.size
    && [...actualSet].every(value => expectedSet.has(value));
}

function formatFunctionSignature(name, types) {
  return `${name}(${types.join(', ')})`;
}

function requireExactFunctionSignature(definitions, name, types) {
  const actual = definitions.get(name) || [];
  if (actual.length !== 1 || !sameValues(actual[0], types)) {
    failures.push(
      `Security migration must define exactly ${formatFunctionSignature(name, types)}.`,
    );
  }
}

function requireExactFunctionAcl(
  acls,
  {
    name,
    types,
    revokePrivilege,
    revokeRoles,
    grantPrivilege,
    grantRoles,
  },
) {
  const signature = formatFunctionSignature(name, types);
  const matching = acls.filter(acl => acl.name === name && sameValues(acl.types, types));
  const revoke = matching.find(acl => (
    acl.action === 'revoke'
    && acl.direction === 'from'
    && acl.privilege === revokePrivilege
    && sameSet(acl.roles, revokeRoles)
  ));
  if (!revoke) {
    failures.push(
      `${signature} must revoke ${revokePrivilege} from ${revokeRoles.join(', ')}.`,
    );
  }

  if (grantPrivilege && grantRoles) {
    const grant = matching.find(acl => (
      acl.action === 'grant'
      && acl.direction === 'to'
      && acl.privilege === grantPrivilege
      && sameSet(acl.roles, grantRoles)
    ));
    if (!grant) {
      failures.push(
        `${signature} must grant ${grantPrivilege} only to ${grantRoles.join(', ')}.`,
      );
    }

    const unexpectedGrant = matching.find(acl => (
      acl.action === 'grant'
      && ['all', 'execute'].includes(acl.privilege)
      && acl.roles.some(role => !grantRoles.includes(role))
    ));
    if (unexpectedGrant) {
      failures.push(
        `${signature} grants execution to an unexpected role: ${unexpectedGrant.roles.join(', ')}.`,
      );
    }
  }
}

const clientFiles = [
  resolve(root, 'script.js'),
  resolve(root, 'index.html'),
  ...await walk('modules'),
].filter(pathname => /\.(?:js|html)$/i.test(pathname));
const clientSource = (await Promise.all(clientFiles.map(pathname => readFile(pathname, 'utf8')))).join('\n');

forbidMatch(clientSource, /generativelanguage\.googleapis\.com/i, 'Gemini must not be called directly from browser code.');
forbidMatch(clientSource, /api\.openweathermap\.org/i, 'OpenWeather must not be called directly from browser code.');
forbidMatch(clientSource, /api\.open-meteo\.com/i, 'Open-Meteo must not be called directly from browser code.');
forbidMatch(clientSource, /WEATHER_API_KEY\s*=/, 'A weather API key remains in browser code.');
forbidMatch(clientSource, /Authorization\s*:\s*`Bearer\s+\$\{state\.supabaseApiKey\}`/, 'Supabase requests still authenticate as anon after login.');
forbidMatch(clientSource, /https:\/\/(?:cdn\.jsdelivr\.net|esm\.sh)\/@supabase\/supabase-js/i, 'Supabase Auth still loads executable code from a runtime CDN.');
forbidMatch(clientSource, /https:\/\/cdn\.sheetjs\.com\/xlsx/i, 'XLSX still loads executable code from a runtime CDN.');
forbidMatch(clientSource, /\b(?:gemini_api_key|gas_order_url)\b/i, 'A server-only configuration field remains in browser code.');
forbidMatch(clientSource, /AIza[0-9A-Za-z_-]{20,}/, 'A Google API key-like value remains in browser code.');
forbidMatch(
  clientSource,
  /SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY/i,
  'A server-only Supabase key name leaked into browser code.',
);

const serverSource = (await Promise.all((await walk('server')).map(pathname => readFile(pathname, 'utf8')))).join('\n');
const supabaseServer = await read('server/supabase.mjs');
const weatherServer = await read('server/weather.mjs');
requireMatch(serverSource, /SUPABASE_SECRET_KEY/, 'Server RPCs must use the server-only Supabase secret key.');
forbidMatch(serverSource, /SUPABASE_SERVICE_ROLE_KEY/, 'Server code still uses the legacy Supabase service-role key.');
requireMatch(serverSource, /apikey:\s*secretKey/, 'Server RPCs must send the Supabase secret key in the apikey header.');
forbidMatch(
  serverSource,
  /Authorization:\s*`Bearer\s+\$\{secretKey\}`/,
  'Supabase secret keys must not be sent as bearer tokens.',
);
requireMatch(serverSource, /callSupabaseServiceRpc/, 'Privileged Supabase RPC helper is missing.');
forbidMatch(serverSource, /export\s+(?:async\s+)?function\s+callSupabaseRpc\b/, 'A public-JWT RPC helper remains available.');
requireMatch(serverSource, /VERCEL_URL/, 'Preview origin must derive from Vercel system metadata.');
forbidMatch(serverSource, /headers?(?:\?\.)?\[['"]host['"]\]|getRequestHeader\([^)]*['"]host['"]/, 'Request Host must not be trusted for origin validation.');
requireMatch(
  weatherServer,
  /https:\/\/api\.open-meteo\.com\/v1\/forecast/,
  'Weather must use the server-side Open-Meteo Forecast API.',
);
forbidMatch(
  weatherServer,
  /\b(?:OPENWEATHER_API_KEY|WEATHER_API_KEY|appid)\b/i,
  'Weather server must not require or send a provider API key.',
);
forbidMatch(
  supabaseServer,
  /@framex\\\.co\\\.jp/i,
  'Server authentication must use the registered-account allowlist, not an email-domain regex.',
);
requireMatch(
  supabaseServer,
  /if\s*\(\s*!email\s*\|\|\s*!jwtEmail[\s\S]{0,180}?throw\s+invalidSessionError\(\)/,
  'Server authentication must reject empty verified-user or JWT emails.',
);
requireMatch(supabaseServer, /provider\s*!==\s*['"]google['"]/, 'Server authentication must strictly require app_metadata.provider=google.');
requireMatch(
  supabaseServer,
  /Array\.isArray\(jwtPayload\.amr\)[\s\S]{0,400}?method[\s\S]{0,160}?['"]oauth['"]/,
  'Server authentication must require an OAuth AMR method.',
);
forbidMatch(supabaseServer, /app_metadata\?\.providers|providers\.includes\(['"]google['"]\)/, 'Server authentication must not fall back to app_metadata.providers.');

const googleAuthClient = await read('modules/google-auth.js');
forbidMatch(
  googleAuthClient,
  /\bhd\s*:/,
  'Google OAuth must not use a hosted-domain hint as an authorization boundary.',
);

const apiSecurityFlows = [
  ['api/ai.mjs', 'await generateAiText('],
  ['api/weather.mjs', 'await fetchNormalizedWeather('],
  ['api/order-email.mjs', 'await sendClaimedOrderEmail('],
  ['api/order-email-reconcile.mjs', 'await reconcileClaimedOrderEmail('],
];
const actualApiFiles = (await walk('api'))
  .filter(pathname => /\.mjs$/i.test(pathname))
  .map(pathname => relative(root, pathname).replaceAll('\\', '/'));
if (!sameSet(actualApiFiles, apiSecurityFlows.map(([pathname]) => pathname))) {
  failures.push('Every Vercel API must declare an authentication/member-gate security flow.');
}
for (const [pathname, secretOperation] of apiSecurityFlows) {
  const source = await read(pathname);
  const authenticationIndex = source.indexOf('await authenticateSupabaseRequest(');
  const memberGateIndex = source.indexOf('await consumePortalRateLimit(');
  const secretOperationIndex = source.indexOf(secretOperation);
  if (
    authenticationIndex < 0
    || memberGateIndex <= authenticationIndex
    || secretOperationIndex <= memberGateIndex
  ) {
    failures.push(
      `${pathname} must authenticate and pass the registered-member gate before secret processing.`,
    );
  }
}

const indexHtml = await read('index.html');
forbidMatch(indexHtml, /https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)/i, 'Runtime font or icon CDN remains in index.html.');
requireMatch(indexHtml, /vendor\/security-bootstrap\.js/, 'The DOM security bootstrap is not loaded.');
if (indexHtml.indexOf('vendor/security-bootstrap.js') > indexHtml.indexOf('modules/theme-init.js')) {
  failures.push('The DOM security bootstrap must load before application scripts.');
}
const inlineScripts = [...indexHtml.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1].trim())
  .filter(Boolean);
if (inlineScripts.length) failures.push(`index.html contains ${inlineScripts.length} executable inline script(s).`);

const supabaseClient = await read('modules/supabase.js');
requireMatch(supabaseClient, /googleAuthSession\?\.\s*access_token|googleAuthSession\s*&&\s*state\.googleAuthSession\.access_token/, 'Supabase REST does not use the Google session access token.');
requireMatch(supabaseClient, /callRpc\(['"]sync_request_task_link['"]/, 'Request/task link updates must use the guarded RPC.');
requireMatch(supabaseClient, /callRpc\(['"]delete_request_task_entity['"]/, 'Request/task deletion must use the atomic guarded RPC.');
forbidMatch(supabaseClient, /payload\.linked_task_/i, 'Browser code must not PATCH linked_task fields directly.');
requireMatch(supabaseClient, /callRpc\(['"]admin_reset_lock_pin['"]/, 'Administrator PIN resets must use the guarded RPC.');
forbidMatch(supabaseClient, /callRpc\(['"]resolve_order_email_send['"]/, 'The browser must not reconcile order email state without the provider.');
forbidMatch(supabaseClient, /payload\.acknowledged_by/i, 'Notice editing must not overwrite acknowledgement history.');
forbidMatch(supabaseClient, /payload\.email_(?:sent|sent_at|send_status)/i, 'Browser code must not PATCH server-owned order email state.');
forbidMatch(
  supabaseClient,
  /requestSupabase\(\s*`assigned_tasks\?id=eq\.\$\{[^}]+\}`\s*,\s*\{[\s\S]{0,180}?method:\s*['"]DELETE['"]/i,
  'Browser code must not DELETE assigned tasks directly.',
);
forbidMatch(
  supabaseClient,
  /requestSupabase\(\s*`cross_dept_requests\?id=eq\.\$\{[^}]+\}`\s*,\s*\{[\s\S]{0,180}?method:\s*['"]DELETE['"]/i,
  'Browser code must not DELETE cross-department requests directly.',
);

const secureApiClient = await read('modules/secure-api.js');
requireMatch(
  secureApiClient,
  /['"]\/api\/order-email-reconcile['"]/,
  'Ambiguous order email states must be reconciled through a Vercel Function.',
);
const orderServer = await read('server/order-email.mjs');
const orderEmailApi = await read('api/order-email.mjs');
requireMatch(
  orderEmailApi,
  /await consumePortalRateLimit\([\s\S]{0,500}?readOrderEmailConfiguration\(\)[\s\S]{0,300}?await sendClaimedOrderEmail\([^)]*emailConfig/,
  'Order email configuration must be validated after the member gate and before claiming an order.',
);
requireMatch(
  orderServer,
  /callSupabaseServiceRpc\(\s*['"]authorize_order_email_resolution['"][\s\S]{0,1200}?await reconcileGasOrderState\([\s\S]{0,1200}?callSupabaseServiceRpc\(\s*['"]resolve_order_email_send['"]/,
  'Order reconciliation must authorize first, then update GAS, then finalize Supabase.',
);
requireMatch(
  orderServer,
  /callSupabaseServiceRpc\(['"]resolve_order_email_send['"]/,
  'Order reconciliation must complete through the service-role database RPC.',
);
const gasOrderScript = await read('gas-order-script.js');
requireMatch(gasOrderScript, /already_retry_allowed/, 'GAS reconciliation must be idempotent.');
requireMatch(gasOrderScript, /provider_already_sent/, 'GAS must refuse to clear a sent order.');

const vercelConfig = JSON.parse(await read('vercel.json'));
if (vercelConfig.outputDirectory !== 'dist') failures.push('Vercel outputDirectory must be dist.');
const serializedHeaders = JSON.stringify(vercelConfig.headers || []);
for (const header of [
  'Content-Security-Policy',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Strict-Transport-Security',
]) {
  if (!serializedHeaders.includes(header)) failures.push(`Missing security header: ${header}`);
}
requireMatch(serializedHeaders, /frame-ancestors 'none'/, 'CSP must prevent framing.');
requireMatch(serializedHeaders, /object-src 'none'/, 'CSP must disable plugins.');
requireMatch(serializedHeaders, /require-trusted-types-for 'script'/, 'CSP must enforce Trusted Types for script sinks.');
requireMatch(serializedHeaders, /trusted-types default portal-print dompurify/, 'CSP must restrict Trusted Types policy names.');
requireMatch(serializedHeaders, /style-src-elem 'self'/, 'CSP must block injected inline style elements.');
requireMatch(serializedHeaders, /style-src-attr 'unsafe-inline'/, 'CSP must retain required inline style attributes.');

const migrationFiles = (await walk('supabase/migrations')).filter(pathname => /harden_portal_rls\.sql$/i.test(pathname));
if (migrationFiles.length !== 1) {
  failures.push('Expected exactly one harden_portal_rls migration.');
} else {
  const migration = await readFile(migrationFiles[0], 'utf8');
  const normalizedMigration = normalizeSql(migration);
  const migrationStatements = normalizedMigration
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
  const functionDefinitions = parseFunctionDefinitions(migration);
  const functionAcls = parseFunctionAcls(normalizedMigration);

  const privateServiceHelpers = [
    ['private.username_for_user_id', ['uuid', 'text']],
    ['private.is_admin_user', ['uuid', 'text']],
  ];
  const serviceRoleRpcs = [
    ['public.consume_portal_rate_limit', ['uuid', 'text', 'text', 'integer', 'integer']],
    ['public.claim_order_email_send', ['uuid', 'text', 'text']],
    ['public.finish_order_email_send', ['uuid', 'text', 'text', 'text', 'boolean']],
    ['public.authorize_order_email_resolution', ['uuid', 'text', 'text', 'text', 'text']],
    ['public.resolve_order_email_send', ['uuid', 'text', 'text', 'text', 'text']],
  ];
  const authenticatedRpcs = [
    ['public.claim_portal_account', ['text', 'text']],
    ['public.deactivate_portal_account', ['text']],
    ['public.admin_reset_lock_pin', ['text']],
    ['public.acknowledge_notice', ['text']],
    ['public.sync_request_task_link', ['text', 'text', 'text']],
    ['public.delete_request_task_entity', ['text', 'text']],
    ['public.set_public_attendance', ['text', 'text', 'text']],
    ['public.list_trouble_reports', ['text', 'text', 'text']],
    ['public.list_attendance_work_summary', ['text[]']],
    ['public.ensure_dm_room', ['text', 'text']],
    ['public.create_group_room', ['text', 'text', 'text[]']],
    ['public.leave_chat_room', ['text']],
    ['public.prune_oldest_chat_message', ['text']],
    ['public.append_p2p_candidate', ['text', 'text', 'text']],
  ];

  for (const [name, types] of [
    ...privateServiceHelpers,
    ...serviceRoleRpcs,
    ...authenticatedRpcs,
  ]) {
    requireExactFunctionSignature(functionDefinitions, name, types);
  }

  for (const [name, types] of privateServiceHelpers) {
    requireExactFunctionAcl(functionAcls, {
      name,
      types,
      revokePrivilege: 'all',
      revokeRoles: ['public', 'anon', 'authenticated'],
    });
  }
  for (const [name, types] of serviceRoleRpcs) {
    requireExactFunctionAcl(functionAcls, {
      name,
      types,
      revokePrivilege: 'execute',
      revokeRoles: ['public', 'anon', 'authenticated'],
      grantPrivilege: 'execute',
      grantRoles: ['service_role'],
    });
  }
  for (const [name, types] of authenticatedRpcs) {
    requireExactFunctionAcl(functionAcls, {
      name,
      types,
      revokePrivilege: 'execute',
      revokeRoles: ['public', 'anon', 'authenticated'],
      grantPrivilege: 'execute',
      grantRoles: ['authenticated'],
    });
  }

  forbidMatch(
    normalizedMigration,
    /\busing\s*\(\s*true\s*\)/,
    'Security migration must not contain a permissive USING (true) policy.',
  );
  forbidMatch(
    normalizedMigration,
    /\bwith\s+check\s*\(\s*true\s*\)/,
    'Security migration must not contain a permissive WITH CHECK (true) policy.',
  );
  requireMatch(
    normalizedMigration,
    /create\s+trigger\s+trg_guard_linked_request_delete[\s\S]*before\s+delete\s+on\s+public\.cross_dept_requests[\s\S]*private\.guard_linked_request_task_delete\s*\(\s*\)/,
    'Linked cross-department requests must reject direct DELETE operations.',
  );
  requireMatch(
    normalizedMigration,
    /create\s+trigger\s+trg_guard_linked_task_delete[\s\S]*before\s+delete\s+on\s+public\.assigned_tasks[\s\S]*private\.guard_linked_request_task_delete\s*\(\s*\)/,
    'Linked assigned tasks must reject direct DELETE operations.',
  );

  const sharedSelectTables = [
    'public_categories',
    'public_cards',
    'notices',
    'notice_reactions',
    'attendance_sites',
    'order_suppliers',
    'order_items',
    'company_calendar_settings',
    'public_attendance_months',
    'cross_dept_requests',
    'assigned_tasks',
    'trouble_reports',
    'orders',
    'chat_rooms',
    'drive_shares',
    'p2p_signals',
  ];
  for (const table of sharedSelectTables) {
    const selectPolicies = migrationStatements.filter(statement => (
      new RegExp(
        `^create\\s+policy\\s+(?:\"[^\"]+\"|[a-z0-9_]+)\\s+on\\s+public\\.${table}\\s+for\\s+select\\s+to\\s+authenticated\\b`,
      ).test(statement)
    ));
    if (!selectPolicies.length) {
      failures.push(`Security migration is missing an authenticated SELECT policy for public.${table}.`);
      continue;
    }
    if (selectPolicies.some(policy => !policy.includes('private.current_username'))) {
      failures.push(`Every shared SELECT policy for public.${table} must require current_username().`);
    }
  }

  requireMatch(
    normalizedMigration,
    /auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'provider'[\s\S]*'google'/,
    'Supabase authorization must require the Google app_metadata provider.',
  );
  forbidMatch(
    normalizedMigration,
    /auth\.jwt\(\)\s*->\s*'app_metadata'\s*->\s*'providers'/,
    'Supabase authorization must not fall back to app_metadata.providers.',
  );
  requireMatch(
    normalizedMigration,
    /auth\.jwt\(\)\s*->\s*'amr'[\s\S]*->>\s*'method'[\s\S]*=\s*'oauth'/,
    'Supabase authorization must require an OAuth AMR method.',
  );
  forbidMatch(
    normalizedMigration,
    /@framex\\\.co\\\.jp/,
    'Supabase authorization must use registered account identity, not a company-domain regex.',
  );
  const currentUsernameSource = sliceNormalizedFunction(
    normalizedMigration,
    'private.current_username',
  );
  requireMatch(
    currentUsernameSource,
    /account\.google_auth_id\s*=\s*\(select auth\.uid\(\)\)::text/,
    'Browser authorization must match the registered account UID to auth.uid().',
  );
  requireMatch(
    currentUsernameSource,
    /account\.google_email[\s\S]{0,220}?=[\s\S]{0,220}?auth\.jwt\(\)\s*->>\s*'email'/,
    'Browser authorization must match the registered account email to the JWT email.',
  );
  requireMatch(
    currentUsernameSource,
    /account\.is_active/,
    'Browser authorization must require an active registered account.',
  );

  const usernameForUserIdSource = sliceNormalizedFunction(
    normalizedMigration,
    'private.username_for_user_id',
  );
  requireMatch(
    usernameForUserIdSource,
    /account\.google_auth_id\s*=\s*p_user_id::text/,
    'Service RPC authorization must match the registered account UID.',
  );
  requireMatch(
    usernameForUserIdSource,
    /account\.google_email[\s\S]{0,220}?=[\s\S]{0,220}?p_user_email/,
    'Service RPC authorization must match the registered account email.',
  );
  requireMatch(
    usernameForUserIdSource,
    /account\.is_active/,
    'Service RPC authorization must require an active registered account.',
  );
  const rateLimitStart = normalizedMigration.indexOf(
    'create or replace function public.consume_portal_rate_limit',
  );
  const rateLimitEnd = normalizedMigration.indexOf(
    'create or replace function public.claim_order_email_send',
  );
  const rateLimitSource = (
    rateLimitStart >= 0 && rateLimitEnd > rateLimitStart
      ? normalizedMigration.slice(rateLimitStart, rateLimitEnd)
      : ''
  );
  requireMatch(
    rateLimitSource,
    /'order-email-reconcile'/,
    'The registered-member rate-limit RPC must support order-email-reconcile.',
  );
  forbidMatch(
    normalizedMigration,
    /auth\.jwt\(\)\s*->\s*'user_metadata'/,
    'Supabase authorization must not trust mutable user_metadata.',
  );
  requireMatch(
    normalizedMigration,
    /create or replace function private\.sync_chat_room_last_message\(\)[\s\S]*create trigger trg_sync_chat_room_last_message after insert on public\.chat_messages/,
    'Chat room previews must be derived by the database after message insertion.',
  );
  const ensureDmStart = normalizedMigration.indexOf(
    'create or replace function public.ensure_dm_room',
  );
  const createGroupStart = normalizedMigration.indexOf(
    'create or replace function public.create_group_room',
  );
  const ensureDmSource = (
    ensureDmStart >= 0 && createGroupStart > ensureDmStart
      ? normalizedMigration.slice(ensureDmStart, createGroupStart)
      : ''
  );
  requireMatch(
    ensureDmSource,
    /room\.members <@ excluded\.members and room\.members @> excluded\.members and cardinality\(room\.members\) = cardinality\(excluded\.members\)/,
    'An existing DM id must remain bound to the exact original participant pair.',
  );
  const leaveChatStart = normalizedMigration.indexOf(
    'create or replace function public.leave_chat_room',
  );
  const pruneChatStart = normalizedMigration.indexOf(
    'create or replace function public.prune_oldest_chat_message',
  );
  const leaveChatSource = (
    leaveChatStart >= 0 && pruneChatStart > leaveChatStart
      ? normalizedMigration.slice(leaveChatStart, pruneChatStart)
      : ''
  );
  requireMatch(
    leaveChatSource,
    /if v_room_type = 'dm' or v_member_count <= 1 then delete from public\.chat_rooms/,
    'Leaving a DM must delete the room so its message history cascades away.',
  );
  forbidMatch(
    normalizedMigration,
    /update public\.user_accounts[\s\S]{0,500}\bis_admin\b[\s\S]{0,500}\bsuggestion_box_viewers\b/,
    'Suggestion-box viewer membership must never promote a Portal administrator.',
  );
  const orderClaimStart = normalizedMigration.indexOf(
    'create or replace function public.claim_order_email_send',
  );
  const orderFinishStart = normalizedMigration.indexOf(
    'create or replace function public.finish_order_email_send',
  );
  const orderClaimSource = (
    orderClaimStart >= 0 && orderFinishStart > orderClaimStart
      ? normalizedMigration.slice(orderClaimStart, orderFinishStart)
      : ''
  );
  requireMatch(
    orderClaimSource,
    /email_send_status in \('pending', 'failed'\)/,
    'Order email claims must be limited to explicit pending or failed states.',
  );
  forbidMatch(
    orderClaimSource,
    /started_at\s*(?:<|<=)|interval\s+'[^']*minute/,
    'An ambiguous stale sending order must never be reclaimed automatically.',
  );

  const grantStatements = migrationStatements.filter(statement => statement.startsWith('grant '));
  for (const statement of grantStatements) {
    const onIndex = statement.indexOf(' on ');
    const toIndex = statement.lastIndexOf(' to ');
    if (onIndex < 0 || toIndex <= onIndex) continue;
    const privileges = statement.slice('grant '.length, onIndex);
    const objects = statement.slice(onIndex + ' on '.length, toIndex);

    if (
      objects.includes('public.user_accounts')
      && /\b(?:insert|delete)\b/.test(privileges)
    ) {
      failures.push('Browser roles must never receive INSERT or DELETE on public.user_accounts.');
    }
    if (objects.includes('public.notices') && /\bupdate\b/.test(privileges)) {
      const columnGrant = privileges.match(/\bupdate\s*\(([^)]*)\)/);
      if (!columnGrant) {
        failures.push('public.notices UPDATE must use an explicit safe column allowlist.');
      } else if (/\backnowledged_by\b/.test(columnGrant[1])) {
        failures.push('Browser roles must not directly update public.notices.acknowledged_by.');
      }
    }
    if (objects.includes('public.chat_rooms') && /\bupdate\b/.test(privileges)) {
      failures.push('Browser roles must not directly update derived public.chat_rooms preview fields.');
    }
  }

  const chatAndDrivePolicies = migrationStatements.filter(statement => (
    /^create\s+policy\b/.test(statement)
    && /\bon\s+public\.(?:chat_rooms|chat_messages|drive_shares)\b/.test(statement)
  ));
  if (chatAndDrivePolicies.some(policy => policy.includes('private.is_admin'))) {
    failures.push('Chat and Drive policies must not contain an administrator bypass.');
  }

  const triggerFunctions = [
    ...migration.matchAll(
      /create\s+or\s+replace\s+function\s+(private\.[a-z0-9_"]+)\s*\(\s*\)\s*returns\s+trigger/gi,
    ),
  ].map(match => match[1].replaceAll('"', '').toLowerCase());
  if (!triggerFunctions.length) {
    failures.push('Security migration does not define any guarded trigger functions.');
  }
  for (const name of triggerFunctions) {
    requireExactFunctionAcl(functionAcls, {
      name,
      types: [],
      revokePrivilege: 'all',
      revokeRoles: ['public', 'anon', 'authenticated'],
    });
  }
  requireExactFunctionAcl(functionAcls, {
    name: 'public.set_updated_at',
    types: [],
    revokePrivilege: 'execute',
    revokeRoles: ['public', 'anon', 'authenticated'],
  });

  const managedTables = [
    'assigned_tasks',
    'attendance_entries',
    'attendance_sites',
    'chat_messages',
    'chat_rooms',
    'company_calendar_settings',
    'cross_dept_requests',
    'drive_shares',
    'notice_reactions',
    'notices',
    'order_items',
    'order_suppliers',
    'orders',
    'p2p_signals',
    'portal_config',
    'private_cards',
    'private_sections',
    'public_attendance_months',
    'public_cards',
    'public_categories',
    'request_comments',
    'suggestion_box',
    'task_comments',
    'trouble_reports',
    'user_accounts',
    'user_chat_reads',
    'user_drive_contacts',
    'user_drive_links',
    'user_email_contacts',
    'user_lock_pins',
    'user_notice_reads',
    'user_preferences',
    'user_profiles',
    'user_section_orders',
    'user_todos',
  ];
  const managedTableBlocks = [
    ...normalizedMigration.matchAll(
      /managed_tables\s+constant\s+text\[\]\s*:=\s*array\s*\[([\s\S]*?)\]/g,
    ),
  ];
  if (managedTableBlocks.length !== 2) {
    failures.push('Security migration must declare the 35 managed RLS tables in both hardening loops.');
  }
  for (const block of managedTableBlocks) {
    const actual = [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
    if (!sameSet(actual, managedTables)) {
      const missing = managedTables.filter(table => !actual.includes(table));
      const unexpected = actual.filter(table => !managedTables.includes(table));
      failures.push(
        `Managed RLS table set is incorrect (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}).`,
      );
    }
  }
  requireMatch(
    normalizedMigration,
    /alter table public\.%i enable row level security/,
    'Managed tables must enable row level security.',
  );
  requireMatch(
    normalizedMigration,
    /alter table public\.%i force row level security/,
    'Managed tables must force row level security.',
  );
}

if (await exists('.git')) {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  for (const pathname of tracked) {
    if (/^\.env(?:\.|$)/.test(pathname) && pathname !== '.env.example') {
      failures.push(`Tracked environment file: ${pathname}`);
    }
  }
} else {
  // Vercel source uploads intentionally omit .git. In that environment,
  // prove that no real root-level environment file reached the build.
  const uploadedRootEntries = await readdir(root, { withFileTypes: true });
  for (const entry of uploadedRootEntries) {
    if (
      entry.isFile()
      && /^\.env(?:\.|$)/.test(entry.name)
      && entry.name !== '.env.example'
    ) {
      failures.push(`Uploaded environment file: ${entry.name}`);
    }
  }
}

if (await exists('dist')) {
  for (const forbidden of ['AGENTS.md', 'CLAUDE.md', 'HOME_SETUP.md', 'gas-order-script.js', 'docs', 'supabase', 'tools']) {
    if (await exists(`dist/${forbidden}`)) failures.push(`Forbidden deployment artifact: dist/${forbidden}`);
  }
  const distSource = (await Promise.all((await walk('dist')).filter(pathname => /\.(?:js|html|css|json)$/i.test(pathname)).map(pathname => readFile(pathname, 'utf8')))).join('\n');
  forbidMatch(
    distSource,
    /SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY/,
    'A server-only Supabase key name leaked into dist.',
  );
}

if (failures.length) {
  for (const failure of failures) console.error(`SECURITY CHECK FAILED: ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Security invariants verified.');
}
