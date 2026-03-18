import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.FIRESTORE_API_KEY;

if (!apiKey) {
  throw new Error('FIRESTORE_API_KEY is required.');
}

const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve('supabase', 'generated-user-contacts-migration.sql');

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

async function fetchCollection(collectionPath, pageSize = 500) {
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
    return (value.arrayValue.values || []).map(item => decodeValue(item));
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

function normalizeTimestamp(value, fallback = null) {
  const target = value ?? fallback;
  if (target === null || target === undefined || target === '') return null;
  if (typeof target === 'number' && Number.isFinite(target)) {
    if (target > 1_000_000_000_000) return new Date(target).toISOString();
    if (target > 1_000_000_000) return new Date(target * 1000).toISOString();
  }
  return String(target);
}

function sqlTimestamp(value, fallback = null) {
  const normalized = normalizeTimestamp(value, fallback);
  if (!normalized) return 'timezone(\'utc\', now())';
  return `${sqlString(normalized)}::timestamptz`;
}

function buildEmailContactUpsert(row) {
  return `insert into public.user_email_contacts (
  username, contact_id, company_name, person_name, created_at, updated_at
)
values (
  ${sqlString(row.username)},
  ${sqlString(row.contactId)},
  ${sqlString(row.companyName || '')},
  ${sqlString(row.personName || '')},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (username, contact_id) do update
set company_name = excluded.company_name,
    person_name = excluded.person_name,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildDriveLinkUpsert(row) {
  return `insert into public.user_drive_links (
  username, url, created_at, updated_at
)
values (
  ${sqlString(row.username)},
  ${sqlString(row.url || '')},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (username) do update
set url = excluded.url,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildDriveContactUpsert(row) {
  return `insert into public.user_drive_contacts (
  username, contact_username, url, saved_at, updated_at
)
values (
  ${sqlString(row.username)},
  ${sqlString(row.contactUsername)},
  ${sqlString(row.url || '')},
  ${sqlTimestamp(row.savedAt, row.updatedAt || row.updateTime || row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (username, contact_username) do update
set url = excluded.url,
    saved_at = excluded.saved_at,
    updated_at = excluded.updated_at;`;
}

const userDocs = await fetchCollection('users_list', 200);
const statements = [];
const summary = {
  users: userDocs.length,
  emailContacts: 0,
  driveLinks: 0,
  driveContacts: 0,
};

for (const userDoc of userDocs) {
  const username = userDoc.name.split('/').pop();
  const encodedUsername = encodeURIComponent(username);

  const emailContactDocs = await fetchCollection(`users/${encodedUsername}/email_contacts`, 500);
  for (const contactDoc of emailContactDocs) {
    const contactFields = decodeFields(contactDoc.fields || {});
    statements.push(buildEmailContactUpsert({
      username,
      contactId: contactDoc.name.split('/').pop(),
      ...contactFields,
      createTime: contactDoc.createTime,
      updateTime: contactDoc.updateTime,
      updatedAt: contactFields.updatedAt || contactDoc.updateTime || contactDoc.createTime,
    }));
    summary.emailContacts += 1;
  }

  const driveLinkDoc = await fetchDocument(`users/${encodedUsername}/data/drive_link`);
  if (driveLinkDoc?.fields) {
    const driveLinkFields = decodeFields(driveLinkDoc.fields);
    if (driveLinkFields.url) {
      statements.push(buildDriveLinkUpsert({
        username,
        ...driveLinkFields,
        createTime: driveLinkDoc.createTime,
        updateTime: driveLinkDoc.updateTime,
        createdAt: driveLinkFields.createdAt || driveLinkDoc.createTime,
        updatedAt: driveLinkFields.updatedAt || driveLinkDoc.updateTime || driveLinkDoc.createTime,
      }));
      summary.driveLinks += 1;
    }
  }

  const driveContactsDoc = await fetchDocument(`users/${encodedUsername}/data/drive_contacts`);
  if (driveContactsDoc?.fields) {
    const driveContactsFields = decodeFields(driveContactsDoc.fields);
    const contacts = driveContactsFields.contacts || {};
    for (const [contactUsername, contactData] of Object.entries(contacts)) {
      statements.push(buildDriveContactUpsert({
        username,
        contactUsername,
        url: contactData?.url || '',
        savedAt: contactData?.savedAt ?? null,
        updatedAt: driveContactsFields.updatedAt || driveContactsDoc.updateTime || driveContactsDoc.createTime,
        createTime: driveContactsDoc.createTime,
        updateTime: driveContactsDoc.updateTime,
      }));
      summary.driveContacts += 1;
    }
  }
}

const sql = [
  '-- Generated from Firestore user contact/link documents.',
  '-- Source: email_contacts + drive_link + drive_contacts',
  '',
  'begin;',
  '',
  ...statements,
  '',
  'commit;',
  '',
].join('\n');

await fs.writeFile(outputPath, sql, 'utf8');

console.log(`Wrote ${outputPath}`);
console.log(JSON.stringify(summary, null, 2));
