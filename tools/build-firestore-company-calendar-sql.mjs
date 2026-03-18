import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.FIRESTORE_API_KEY;

if (!apiKey) {
  throw new Error('FIRESTORE_API_KEY is required.');
}

const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve('supabase', 'generated-company-calendar-migration.sql');

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

function sqlTextArray(values) {
  const arr = Array.isArray(values)
    ? values.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  if (!arr.length) return 'ARRAY[]::text[]';
  return `ARRAY[${arr.map(item => sqlString(item)).join(', ')}]::text[]`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value ?? {}))}::jsonb`;
}

function sanitizeHolidayRanges(src) {
  if (!Array.isArray(src)) return [];
  return src
    .map((range) => ({
      start: String(range?.start || ''),
      end: String(range?.end || ''),
      label: String(range?.label || ''),
    }))
    .filter((range) => range.start && range.end);
}

function sanitizeEvents(src) {
  if (!Array.isArray(src)) return [];
  return src
    .map((event) => ({
      date: String(event?.date || ''),
      label: String(event?.label || ''),
      color: String(event?.color || ''),
    }))
    .filter((event) => event.date && event.label);
}

function sanitizeDays(src) {
  if (!src || typeof src !== 'object') return {};
  const out = {};
  for (const [day, users] of Object.entries(src)) {
    if (!day || !users || typeof users !== 'object') continue;
    const dayKey = String(day).padStart(2, '0');
    const userMap = {};
    for (const [username, type] of Object.entries(users)) {
      const normalizedUser = String(username || '').trim();
      const normalizedType = String(type || '').trim();
      if (!normalizedUser || !normalizedType) continue;
      userMap[normalizedUser] = normalizedType;
    }
    if (Object.keys(userMap).length) out[dayKey] = userMap;
  }
  return out;
}

function buildCompanyCalendarUpsert(row) {
  return `insert into public.company_calendar_settings (
  id, work_saturdays, planned_leave_saturdays, holiday_ranges, events, created_at, updated_at
)
values (
  ${sqlString(row.id)},
  ${sqlTextArray(row.workSaturdays)},
  ${sqlTextArray(row.plannedLeaveSaturdays)},
  ${sqlJson(sanitizeHolidayRanges(row.holidayRanges))},
  ${sqlJson(sanitizeEvents(row.events))},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (id) do update
set work_saturdays = excluded.work_saturdays,
    planned_leave_saturdays = excluded.planned_leave_saturdays,
    holiday_ranges = excluded.holiday_ranges,
    events = excluded.events,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildPublicAttendanceUpsert(row) {
  return `insert into public.public_attendance_months (
  year_month, days, created_at, updated_at
)
values (
  ${sqlString(row.yearMonth)},
  ${sqlJson(sanitizeDays(row.days))},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (year_month) do update
set days = excluded.days,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

const statements = [];
const summary = {
  companyCalendarSettings: 0,
  publicAttendanceMonths: 0,
};

const companyDoc = await fetchDocument('company_calendar/config');
if (companyDoc) {
  const fields = decodeFields(companyDoc.fields || {});
  statements.push(buildCompanyCalendarUpsert({
    id: companyDoc.name.split('/').pop(),
    ...fields,
    createTime: companyDoc.createTime,
    updateTime: companyDoc.updateTime,
  }));
  summary.companyCalendarSettings += 1;
}

const publicAttendanceDocs = await fetchCollection('public_attendance', 500);
publicAttendanceDocs.sort((a, b) => a.name.localeCompare(b.name));

for (const attendanceDoc of publicAttendanceDocs) {
  const fields = decodeFields(attendanceDoc.fields || {});
  statements.push(buildPublicAttendanceUpsert({
    yearMonth: attendanceDoc.name.split('/').pop(),
    days: fields,
    createTime: attendanceDoc.createTime,
    updateTime: attendanceDoc.updateTime,
  }));
  summary.publicAttendanceMonths += 1;
}

const sql = [
  '-- Generated from Firestore company calendar documents.',
  '-- Source: company_calendar/config + public_attendance/{YYYY-MM}',
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
