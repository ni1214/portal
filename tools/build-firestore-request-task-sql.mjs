import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.FIRESTORE_API_KEY;

if (!apiKey) {
  throw new Error('FIRESTORE_API_KEY is required.');
}

const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve('supabase', 'generated-request-task-migration.sql');

const baseUrl =
  'https://firestore.googleapis.com/v1/projects/kategu-sys-v15/databases/(default)/documents';

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

function sqlTimestamp(value, fallback = null, allowNull = false) {
  const normalized = normalizeTimestamp(value, fallback);
  if (!normalized) return allowNull ? 'null' : 'timezone(\'utc\', now())';
  return `${sqlString(normalized)}::timestamptz`;
}

function sqlNullableText(value) {
  return value === null || value === undefined ? 'null' : sqlString(value);
}

function sqlTextArray(values) {
  const arr = Array.isArray(values) ? values.map(item => String(item || '').trim()).filter(Boolean) : [];
  if (!arr.length) return 'ARRAY[]::text[]';
  return `ARRAY[${arr.map(item => sqlString(item)).join(', ')}]::text[]`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value ?? {}))}::jsonb`;
}

function buildRequestUpsert(row) {
  return `insert into public.cross_dept_requests (
  id, title, project_key, to_dept, from_dept, content, proposal, remarks,
  status, created_by, status_note, status_updated_by, archived, notify_creator,
  linked_task_id, linked_task_status, linked_task_assigned_to, linked_task_linked_by,
  linked_task_linked_at, linked_task_closed_at, created_at, updated_at
)
values (
  ${sqlString(row.id)},
  ${sqlString(row.title || '')},
  ${sqlString(row.projectKey || '')},
  ${sqlString(row.toDept || '')},
  ${sqlString(row.fromDept || '')},
  ${sqlString(row.content || '')},
  ${sqlString(row.proposal || '')},
  ${sqlString(row.remarks || '')},
  ${sqlString(row.status || 'submitted')},
  ${sqlString(row.createdBy || '')},
  ${sqlString(row.statusNote || '')},
  ${sqlString(row.statusUpdatedBy || '')},
  ${row.archived ? 'true' : 'false'},
  ${row.notifyCreator ? 'true' : 'false'},
  ${sqlNullableText(row.linkedTaskId)},
  ${sqlNullableText(row.linkedTaskStatus)},
  ${sqlNullableText(row.linkedTaskAssignedTo)},
  ${sqlNullableText(row.linkedTaskLinkedBy)},
  ${sqlTimestamp(row.linkedTaskLinkedAt, null, true)},
  ${sqlTimestamp(row.linkedTaskClosedAt, null, true)},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (id) do update
set title = excluded.title,
    project_key = excluded.project_key,
    to_dept = excluded.to_dept,
    from_dept = excluded.from_dept,
    content = excluded.content,
    proposal = excluded.proposal,
    remarks = excluded.remarks,
    status = excluded.status,
    created_by = excluded.created_by,
    status_note = excluded.status_note,
    status_updated_by = excluded.status_updated_by,
    archived = excluded.archived,
    notify_creator = excluded.notify_creator,
    linked_task_id = excluded.linked_task_id,
    linked_task_status = excluded.linked_task_status,
    linked_task_assigned_to = excluded.linked_task_assigned_to,
    linked_task_linked_by = excluded.linked_task_linked_by,
    linked_task_linked_at = excluded.linked_task_linked_at,
    linked_task_closed_at = excluded.linked_task_closed_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildTaskUpsert(row) {
  return `insert into public.assigned_tasks (
  id, title, description, assigned_by, assigned_to, status, due_date, project_key,
  source_type, source_request_id, source_request_from_dept, source_request_to_dept,
  notified_done, shared_with, shared_responses, accepted_at, done_at, created_at, updated_at
)
values (
  ${sqlString(row.id)},
  ${sqlString(row.title || '')},
  ${sqlString(row.description || '')},
  ${sqlString(row.assignedBy || '')},
  ${sqlString(row.assignedTo || '')},
  ${sqlString(row.status || 'pending')},
  ${sqlString(row.dueDate || '')},
  ${sqlString(row.projectKey || '')},
  ${sqlString(row.sourceType || 'manual')},
  ${sqlNullableText(row.sourceRequestId)},
  ${sqlNullableText(row.sourceRequestFromDept)},
  ${sqlNullableText(row.sourceRequestToDept)},
  ${row.notifiedDone ? 'true' : 'false'},
  ${sqlTextArray(row.sharedWith)},
  ${sqlJson(row.sharedResponses)},
  ${sqlTimestamp(row.acceptedAt, null, true)},
  ${sqlTimestamp(row.doneAt, null, true)},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    assigned_by = excluded.assigned_by,
    assigned_to = excluded.assigned_to,
    status = excluded.status,
    due_date = excluded.due_date,
    project_key = excluded.project_key,
    source_type = excluded.source_type,
    source_request_id = excluded.source_request_id,
    source_request_from_dept = excluded.source_request_from_dept,
    source_request_to_dept = excluded.source_request_to_dept,
    notified_done = excluded.notified_done,
    shared_with = excluded.shared_with,
    shared_responses = excluded.shared_responses,
    accepted_at = excluded.accepted_at,
    done_at = excluded.done_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

const requestDocs = await fetchCollection('cross_dept_requests', 500);
const taskDocs = await fetchCollection('assigned_tasks', 500);

requestDocs.sort((a, b) => a.name.localeCompare(b.name));
taskDocs.sort((a, b) => a.name.localeCompare(b.name));

const statements = [];
const summary = {
  crossDeptRequests: requestDocs.length,
  assignedTasks: taskDocs.length,
};

for (const doc of requestDocs) {
  const fields = decodeFields(doc.fields || {});
  statements.push(buildRequestUpsert({
    id: doc.name.split('/').pop(),
    ...fields,
    createTime: doc.createTime,
    updateTime: doc.updateTime,
  }));
}

for (const doc of taskDocs) {
  const fields = decodeFields(doc.fields || {});
  statements.push(buildTaskUpsert({
    id: doc.name.split('/').pop(),
    ...fields,
    createTime: doc.createTime,
    updateTime: doc.updateTime,
  }));
}

const sql = [
  '-- Generated from Firestore request/task documents.',
  '-- Source: cross_dept_requests + assigned_tasks',
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
