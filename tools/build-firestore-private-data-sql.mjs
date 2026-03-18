import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.FIRESTORE_API_KEY;

if (!apiKey) {
  throw new Error('FIRESTORE_API_KEY is required.');
}

const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve('supabase', 'generated-private-data-migration.sql');

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

function sqlBool(value) {
  return value ? 'true' : 'false';
}

function sqlInt(value, fallback = 0) {
  const normalized = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return String(Math.trunc(normalized));
}

function sqlTimestamp(value, fallback = null) {
  const target = value || fallback;
  if (!target) return 'timezone(\'utc\', now())';
  return `${sqlString(target)}::timestamptz`;
}

function sqlDate(value) {
  if (!value) return 'null';
  return `${sqlString(value)}::date`;
}

function sqlTextArray(values) {
  const arr = Array.isArray(values) ? values : [];
  if (!arr.length) return 'ARRAY[]::text[]';
  return `ARRAY[${arr.map(item => sqlString(item)).join(', ')}]::text[]`;
}

function buildSectionOrderUpsert(row) {
  return `insert into public.user_section_orders (
  username, order_ids, created_at, updated_at
)
values (
  ${sqlString(row.username)},
  ${sqlTextArray(row.order || [])},
  ${sqlTimestamp(row.createdAt)},
  ${sqlTimestamp(row.updatedAt)}
)
on conflict (username) do update
set order_ids = excluded.order_ids,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildReadNoticeInsert(row) {
  return `insert into public.user_notice_reads (username, notice_id, read_at)
select ${sqlString(row.username)}, ${sqlString(row.noticeId)}, ${sqlTimestamp(row.readAt, row.createdAt)}
where exists (
  select 1
  from public.notices
  where id = ${sqlString(row.noticeId)}
)
on conflict (username, notice_id) do update
set read_at = excluded.read_at;`;
}

function buildPrivateSectionUpsert(row) {
  return `insert into public.private_sections (
  id, username, label, icon, color_index, order_index, created_at, updated_at
)
values (
  ${sqlString(row.id)},
  ${sqlString(row.username)},
  ${sqlString(row.label || '')},
  ${sqlString(row.icon || 'fa-solid fa-star')},
  ${sqlInt(row.colorIndex, 1)},
  ${sqlInt(row.order, 0)},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (id) do update
set username = excluded.username,
    label = excluded.label,
    icon = excluded.icon,
    color_index = excluded.color_index,
    order_index = excluded.order_index,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildPrivateCardUpsert(row) {
  return `insert into public.private_cards (
  id, username, label, icon, url, section_id, parent_id, order_index, created_at, updated_at
)
values (
  ${sqlString(row.id)},
  ${sqlString(row.username)},
  ${sqlString(row.label || '')},
  ${sqlString(row.icon || 'fa-solid fa-link')},
  ${sqlString(row.url || '#')},
  ${sqlString(row.sectionId || '')},
  ${row.parentId ? sqlString(row.parentId) : 'null'},
  ${sqlInt(row.order, 0)},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (id) do update
set username = excluded.username,
    label = excluded.label,
    icon = excluded.icon,
    url = excluded.url,
    section_id = excluded.section_id,
    parent_id = excluded.parent_id,
    order_index = excluded.order_index,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildTodoUpsert(row) {
  return `insert into public.user_todos (
  id, username, text, done, due_date, created_at, updated_at
)
values (
  ${sqlString(row.id)},
  ${sqlString(row.username)},
  ${sqlString(row.text || '')},
  ${sqlBool(Boolean(row.done))},
  ${sqlDate(row.dueDate)},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (id) do update
set username = excluded.username,
    text = excluded.text,
    done = excluded.done,
    due_date = excluded.due_date,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function sortPrivateCards(rows) {
  const pending = [...rows];
  const sorted = [];
  const resolved = new Set();

  while (pending.length) {
    let progressed = false;

    for (let i = 0; i < pending.length; i += 1) {
      const row = pending[i];
      if (!row.parentId || resolved.has(row.parentId)) {
        sorted.push(row);
        resolved.add(row.id);
        pending.splice(i, 1);
        progressed = true;
        i -= 1;
      }
    }

    if (!progressed) {
      pending.sort((a, b) => (a.order || 0) - (b.order || 0));
      sorted.push(...pending);
      break;
    }
  }

  return sorted;
}

const userDocs = await fetchCollection('users_list', 200);
const statements = [];
const summary = {
  users: userDocs.length,
  sectionOrders: 0,
  readNotices: 0,
  privateSections: 0,
  privateCards: 0,
  todos: 0,
};

for (const userDoc of userDocs) {
  const username = userDoc.name.split('/').pop();
  const encodedUsername = encodeURIComponent(username);

  const sectionOrderDoc = await fetchDocument(`users/${encodedUsername}/data/section_order`);
  if (sectionOrderDoc?.fields) {
    const orderFields = decodeFields(sectionOrderDoc.fields);
    statements.push(buildSectionOrderUpsert({
      username,
      ...orderFields,
      createdAt: sectionOrderDoc.createTime,
      updatedAt: orderFields.updatedAt || sectionOrderDoc.updateTime || sectionOrderDoc.createTime,
    }));
    summary.sectionOrders += 1;
  }

  const readNoticeDocs = await fetchCollection(`users/${encodedUsername}/read_notices`, 500);
  for (const noticeDoc of readNoticeDocs) {
    const noticeFields = decodeFields(noticeDoc.fields || {});
    statements.push(buildReadNoticeInsert({
      username,
      noticeId: noticeDoc.name.split('/').pop(),
      readAt: noticeFields.readAt || noticeDoc.updateTime || noticeDoc.createTime,
      createdAt: noticeDoc.createTime,
    }));
    summary.readNotices += 1;
  }

  const privateSectionDocs = await fetchCollection(`users/${encodedUsername}/private_sections`, 500);
  for (const sectionDoc of privateSectionDocs) {
    const sectionFields = decodeFields(sectionDoc.fields || {});
    statements.push(buildPrivateSectionUpsert({
      id: sectionDoc.name.split('/').pop(),
      username,
      ...sectionFields,
      createTime: sectionDoc.createTime,
      updateTime: sectionDoc.updateTime,
    }));
    summary.privateSections += 1;
  }

  const privateCardDocs = await fetchCollection(`users/${encodedUsername}/private_cards`, 500);
  const privateCardRows = privateCardDocs.map((cardDoc) => ({
    id: cardDoc.name.split('/').pop(),
    username,
    ...decodeFields(cardDoc.fields || {}),
    createTime: cardDoc.createTime,
    updateTime: cardDoc.updateTime,
  }));
  for (const privateCardRow of sortPrivateCards(privateCardRows)) {
    statements.push(buildPrivateCardUpsert(privateCardRow));
    summary.privateCards += 1;
  }

  const todoDocs = await fetchCollection(`users/${encodedUsername}/todos`, 500);
  for (const todoDoc of todoDocs) {
    const todoFields = decodeFields(todoDoc.fields || {});
    statements.push(buildTodoUpsert({
      id: todoDoc.name.split('/').pop(),
      username,
      ...todoFields,
      createTime: todoDoc.createTime,
      updateTime: todoDoc.updateTime,
    }));
    summary.todos += 1;
  }
}

const sql = [
  '-- Generated from Firestore private user data documents.',
  '-- Source: section_order + read_notices + private_sections + private_cards + todos',
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
