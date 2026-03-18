import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.FIRESTORE_API_KEY;

if (!apiKey) {
  throw new Error('FIRESTORE_API_KEY is required.');
}

const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve('supabase', 'generated-user-core-migration.sql');

const baseUrl =
  'https://firestore.googleapis.com/v1/projects/kategu-sys-v15/databases/(default)/documents';

async function fetchDocument(docPath) {
  const url = `${baseUrl}/${docPath}?key=${apiKey}`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch ${docPath}: ${response.status} ${text}`);
  }
  return response.json();
}

async function fetchCollection(collectionPath, pageSize = 200) {
  const url = `${baseUrl}/${collectionPath}?key=${apiKey}&pageSize=${pageSize}`;
  const response = await fetch(url);
  if (response.status === 404) return [];
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch ${collectionPath}: ${response.status} ${text}`);
  }
  const json = await response.json();
  return json.documents || [];
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map((item) => decodeValue(item));
  }
  if ('mapValue' in value) {
    const out = {};
    const fields = value.mapValue.fields || {};
    for (const [key, fieldValue] of Object.entries(fields)) {
      out[key] = decodeValue(fieldValue);
    }
    return out;
  }
  return null;
}

function decodeFields(fields = {}) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = decodeValue(value);
  }
  return out;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'null';
  const input = String(value);
  const needsUnicodeEscape = /[^\u0020-\u007e]/.test(input) || input.includes('\\');
  if (!needsUnicodeEscape) {
    return `'${input.replace(/'/g, "''")}'`;
  }

  const escaped = Array.from(input).map((char) => {
    if (char === '\'') return '\'\'';
    if (char === '\\') return '\\005C';
    const codePoint = char.codePointAt(0);
    if (codePoint >= 0x20 && codePoint <= 0x7e) return char;
    if (codePoint <= 0xffff) return `\\${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
    return `\\+${codePoint.toString(16).toUpperCase().padStart(6, '0')}`;
  }).join('');

  return `U&'${escaped}'`;
}

function sqlBool(value) {
  return value ? 'true' : 'false';
}

function sqlInt(value, fallback = 0) {
  const normalized = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return String(Math.trunc(normalized));
}

function sqlTimestamp(value) {
  if (!value) return 'timezone(\'utc\', now())';
  return `${sqlString(value)}::timestamptz`;
}

function sqlTextArray(values) {
  const arr = Array.isArray(values) ? values : [];
  if (!arr.length) return 'ARRAY[]::text[]';
  return `ARRAY[${arr.map((item) => sqlString(item)).join(', ')}]::text[]`;
}

function buildAccountUpsert(account) {
  return `insert into public.user_accounts (username, created_at, updated_at, last_login_at)
values (${sqlString(account.username)}, ${sqlTimestamp(account.createdAt)}, ${sqlTimestamp(account.updatedAt)}, ${sqlTimestamp(account.lastLoginAt)})
on conflict (username) do update
set created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    last_login_at = excluded.last_login_at;`;
}

function buildPreferencesUpsert(row) {
  return `insert into public.user_preferences (
  username, theme, font_size, fav_only, favorites, collapsed_sections, collapse_seeded,
  hidden_cards, mission_banner_hidden, last_viewed_suggestions_at, created_at, updated_at
)
values (
  ${sqlString(row.username)},
  ${sqlString(row.theme || 'dark')},
  ${sqlString(row.fontSize || 'font-md')},
  ${sqlBool(Boolean(row.favOnly))},
  ${sqlTextArray(row.favorites)},
  ${sqlTextArray(row.collapsedSections)},
  ${sqlBool(Boolean(row.collapseSeeded))},
  ${sqlTextArray(row.hiddenCards)},
  ${sqlBool(row.missionBannerHidden !== false)},
  ${row.lastViewedSuggestionsAt ? sqlTimestamp(row.lastViewedSuggestionsAt) : 'null'},
  ${sqlTimestamp(row.createdAt)},
  ${sqlTimestamp(row.updatedAt)}
)
on conflict (username) do update
set theme = excluded.theme,
    font_size = excluded.font_size,
    fav_only = excluded.fav_only,
    favorites = excluded.favorites,
    collapsed_sections = excluded.collapsed_sections,
    collapse_seeded = excluded.collapse_seeded,
    hidden_cards = excluded.hidden_cards,
    mission_banner_hidden = excluded.mission_banner_hidden,
    last_viewed_suggestions_at = excluded.last_viewed_suggestions_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildProfileUpsert(row) {
  return `insert into public.user_profiles (
  username, real_name, department, role_type, email, phone, signature_template, created_at, updated_at
)
values (
  ${sqlString(row.username)},
  ${sqlString(row.realName || row.name || '')},
  ${sqlString(row.department || '')},
  ${sqlString(row.roleType || 'member')},
  ${sqlString(row.email || '')},
  ${sqlString(row.phone || '')},
  ${sqlString(row.signatureTemplate || '')},
  ${sqlTimestamp(row.createdAt)},
  ${sqlTimestamp(row.updatedAt)}
)
on conflict (username) do update
set real_name = excluded.real_name,
    department = excluded.department,
    role_type = excluded.role_type,
    email = excluded.email,
    phone = excluded.phone,
    signature_template = excluded.signature_template,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildLockPinUpsert(row) {
  return `insert into public.user_lock_pins (
  username, enabled, hash, auto_lock_minutes, created_at, updated_at
)
values (
  ${sqlString(row.username)},
  ${sqlBool(Boolean(row.enabled))},
  ${row.hash ? sqlString(row.hash) : 'null'},
  ${sqlInt(row.autoLockMinutes, 5)},
  ${sqlTimestamp(row.createdAt)},
  ${sqlTimestamp(row.updatedAt)}
)
on conflict (username) do update
set enabled = excluded.enabled,
    hash = excluded.hash,
    auto_lock_minutes = excluded.auto_lock_minutes,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

const userDocs = await fetchCollection('users_list');
const statements = [];
const summary = {
  users: userDocs.length,
  preferences: 0,
  profiles: 0,
  lockPins: 0,
};

for (const userDoc of userDocs) {
  const username = userDoc.name.split('/').pop();
  const userListFields = decodeFields(userDoc.fields || {});
  const createdAt = userListFields.createdAt || userDoc.createTime || null;
  const updatedAt = userDoc.updateTime || createdAt;
  const lastLoginAt = userListFields.lastLogin || createdAt;

  statements.push(buildAccountUpsert({
    username,
    createdAt,
    updatedAt,
    lastLoginAt,
  }));

  const encodedUsername = encodeURIComponent(username);

  const preferencesDoc = await fetchDocument(`users/${encodedUsername}/data/preferences`);
  if (preferencesDoc?.fields) {
    const prefs = decodeFields(preferencesDoc.fields);
    statements.push(buildPreferencesUpsert({
      username,
      ...prefs,
      createdAt: preferencesDoc.createTime || createdAt,
      updatedAt: prefs.updatedAt || preferencesDoc.updateTime || updatedAt,
    }));
    summary.preferences += 1;
  }

  const profileDoc = await fetchDocument(`users/${encodedUsername}/data/email_profile`);
  if (profileDoc?.fields) {
    const profile = decodeFields(profileDoc.fields);
    statements.push(buildProfileUpsert({
      username,
      ...profile,
      createdAt: profileDoc.createTime || createdAt,
      updatedAt: profile.updatedAt || profileDoc.updateTime || updatedAt,
    }));
    summary.profiles += 1;
  }

  const lockPinDoc = await fetchDocument(`users/${encodedUsername}/data/lock_pin`);
  if (lockPinDoc?.fields) {
    const lockPin = decodeFields(lockPinDoc.fields);
    statements.push(buildLockPinUpsert({
      username,
      ...lockPin,
      createdAt: lockPinDoc.createTime || createdAt,
      updatedAt: lockPinDoc.updateTime || updatedAt,
    }));
    summary.lockPins += 1;
  }
}

const sql = [
  '-- Generated from Firestore user core documents.',
  '-- Source: users_list + users/{name}/data/preferences|email_profile|lock_pin',
  'begin;',
  ...statements,
  'commit;',
  '',
].join('\n\n');

await fs.writeFile(outputPath, sql, 'utf8');

console.log(JSON.stringify({
  outputPath,
  ...summary,
}, null, 2));
