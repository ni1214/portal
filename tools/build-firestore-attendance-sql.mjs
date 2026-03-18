import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.FIRESTORE_API_KEY;

if (!apiKey) {
  throw new Error('FIRESTORE_API_KEY is required.');
}

const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve('supabase', 'generated-attendance-migration.sql');

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
  let pageToken = '';
  const documents = [];

  while (true) {
    const tokenPart = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const url = `${baseUrl}/${collectionPath}?key=${apiKey}&pageSize=${pageSize}${tokenPart}`;
    const response = await fetch(url);
    if (response.status === 404) return documents;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch ${collectionPath}: ${response.status} ${text}`);
    }

    const json = await response.json();
    documents.push(...(json.documents || []));
    pageToken = json.nextPageToken || '';
    if (!pageToken) return documents;
  }
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

function sqlNullableText(value) {
  return value === null || value === undefined || value === '' ? 'null' : sqlString(value);
}

function sqlJson(value) {
  const json = JSON.stringify(value ?? {});
  return `${sqlString(json)}::jsonb`;
}

function sqlTextArray(values) {
  const arr = Array.isArray(values) ? values : [];
  if (!arr.length) return 'ARRAY[]::text[]';
  return `ARRAY[${arr.map(item => sqlString(item)).join(', ')}]::text[]`;
}

function sanitizeWorkSiteHours(src) {
  if (!src || typeof src !== 'object') return {};
  return Object.fromEntries(
    Object.entries(src)
      .filter(([siteId, hours]) => siteId && Number.isFinite(Number(hours)) && Number(hours) > 0)
      .map(([siteId, hours]) => [siteId, Number(hours)])
  );
}

function sanitizeProjectKeys(src) {
  if (!Array.isArray(src)) return [];
  return [...new Set(src.map(value => String(value || '').trim()).filter(Boolean))];
}

function buildAttendanceSiteUpsert(row) {
  return `insert into public.attendance_sites (
  id, code, name, sort_order, active, updated_by, created_at, updated_at
)
values (
  ${sqlString(row.id)},
  ${sqlString(row.code || '')},
  ${sqlString(row.name || '')},
  ${Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : 0},
  ${row.active === false ? 'false' : 'true'},
  ${sqlString(row.updatedBy || '')},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (id) do update
set code = excluded.code,
    name = excluded.name,
    sort_order = excluded.sort_order,
    active = excluded.active,
    updated_by = excluded.updated_by,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildAttendanceEntryUpsert(row) {
  return `insert into public.attendance_entries (
  username, entry_date, type, hayade, zangyo, note, work_site_hours, project_keys, year_month, created_at, updated_at
)
values (
  ${sqlString(row.username)},
  ${sqlString(row.entryDate)}::date,
  ${sqlNullableText(row.type)},
  ${sqlNullableText(row.hayade)},
  ${sqlNullableText(row.zangyo)},
  ${sqlNullableText(row.note)},
  ${sqlJson(sanitizeWorkSiteHours(row.workSiteHours))},
  ${sqlTextArray(sanitizeProjectKeys(row.projectKeys))},
  ${sqlString(row.yearMonth || row.entryDate.slice(0, 7))},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (username, entry_date) do update
set type = excluded.type,
    hayade = excluded.hayade,
    zangyo = excluded.zangyo,
    note = excluded.note,
    work_site_hours = excluded.work_site_hours,
    project_keys = excluded.project_keys,
    year_month = excluded.year_month,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

const statements = [];
const summary = {
  users: 0,
  attendanceSites: 0,
  attendanceEntries: 0,
};

const attendanceSiteDocs = await fetchCollection('attendance_sites', 1000);
attendanceSiteDocs.sort((a, b) => {
  const aFields = decodeFields(a.fields || {});
  const bFields = decodeFields(b.fields || {});
  return (Number(aFields.sortOrder) || 0) - (Number(bFields.sortOrder) || 0);
});

for (const siteDoc of attendanceSiteDocs) {
  const siteFields = decodeFields(siteDoc.fields || {});
  statements.push(buildAttendanceSiteUpsert({
    id: siteDoc.name.split('/').pop(),
    ...siteFields,
    createTime: siteDoc.createTime,
    updateTime: siteDoc.updateTime,
  }));
  summary.attendanceSites += 1;
}

const userDocs = await fetchCollection('users_list', 200);
summary.users = userDocs.length;

for (const userDoc of userDocs) {
  const username = userDoc.name.split('/').pop();
  const encodedUsername = encodeURIComponent(username);
  const attendanceDocs = await fetchCollection(`users/${encodedUsername}/attendance`, 500);

  attendanceDocs.sort((a, b) => a.name.localeCompare(b.name));

  for (const attendanceDoc of attendanceDocs) {
    const attendanceFields = decodeFields(attendanceDoc.fields || {});
    statements.push(buildAttendanceEntryUpsert({
      username,
      entryDate: attendanceDoc.name.split('/').pop(),
      ...attendanceFields,
      createTime: attendanceDoc.createTime,
      updateTime: attendanceDoc.updateTime,
    }));
    summary.attendanceEntries += 1;
  }
}

const sql = [
  '-- Generated from Firestore attendance documents.',
  '-- Source: attendance_sites + users/{name}/attendance',
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
