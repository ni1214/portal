import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.FIRESTORE_API_KEY;

if (!apiKey) {
  throw new Error('FIRESTORE_API_KEY is required.');
}

const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve('supabase', 'generated-orders-migration.sql');

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
  return value === null || value === undefined || value === '' ? 'null' : sqlString(value);
}

function sqlTextArray(values) {
  const arr = Array.isArray(values)
    ? values.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  if (!arr.length) return 'ARRAY[]::text[]';
  return `ARRAY[${arr.map(item => sqlString(item)).join(', ')}]::text[]`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value ?? []))}::jsonb`;
}

function sanitizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sanitizeOrderItemLines(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    category: String(item?.category || ''),
    finish: String(item?.finish || ''),
    itemId: String(item?.itemId || ''),
    length: String(item?.length || ''),
    name: String(item?.name || ''),
    qty: sanitizeNumber(item?.qty, 0),
    spec: String(item?.spec || ''),
    unit: String(item?.unit || ''),
  }));
}

function buildSupplierUpsert(row) {
  return `insert into public.order_suppliers (
  id, name, email, tel, address, active, created_at, updated_at
)
values (
  ${sqlString(row.id)},
  ${sqlString(row.name || '')},
  ${sqlString(row.email || '')},
  ${sqlString(row.tel || '')},
  ${sqlString(row.address || '')},
  ${row.active === false ? 'false' : 'true'},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (id) do update
set name = excluded.name,
    email = excluded.email,
    tel = excluded.tel,
    address = excluded.address,
    active = excluded.active,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildOrderItemUpsert(row) {
  return `insert into public.order_items (
  id, supplier_id, item_category, name, spec, unit, default_qty, order_type,
  material_type, available_lengths, sort_order, active, created_at, updated_at
)
values (
  ${sqlString(row.id)},
  ${sqlNullableText(row.supplierId)},
  ${sqlString(row.itemCategory || '')},
  ${sqlString(row.name || '')},
  ${sqlString(row.spec || '')},
  ${sqlString(row.unit || '')},
  ${sanitizeNumber(row.defaultQty, 1)},
  ${sqlString(row.orderType || 'both')},
  ${sqlString(row.materialType || 'steel')},
  ${sqlTextArray(row.availableLengths)},
  ${Math.trunc(sanitizeNumber(row.sortOrder, 0))},
  ${row.active === false ? 'false' : 'true'},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (id) do update
set supplier_id = excluded.supplier_id,
    item_category = excluded.item_category,
    name = excluded.name,
    spec = excluded.spec,
    unit = excluded.unit,
    default_qty = excluded.default_qty,
    order_type = excluded.order_type,
    material_type = excluded.material_type,
    available_lengths = excluded.available_lengths,
    sort_order = excluded.sort_order,
    active = excluded.active,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

function buildOrderUpsert(row) {
  return `insert into public.orders (
  id, supplier_id, supplier_name, supplier_email, order_type, site_name, project_key,
  items, ordered_by, note, ordered_at, email_sent, email_sent_at, deleted_at, deleted_by,
  created_at, updated_at
)
values (
  ${sqlString(row.id)},
  ${sqlNullableText(row.supplierId)},
  ${sqlString(row.supplierName || '')},
  ${sqlString(row.supplierEmail || '')},
  ${sqlString(row.orderType || 'factory')},
  ${sqlNullableText(row.siteName)},
  ${sqlString(row.projectKey || '')},
  ${sqlJson(sanitizeOrderItemLines(row.items))},
  ${sqlString(row.orderedBy || '')},
  ${sqlString(row.note || '')},
  ${sqlTimestamp(row.orderedAt, row.createTime)},
  ${row.emailSent ? 'true' : 'false'},
  ${sqlTimestamp(row.emailSentAt, null, true)},
  ${sqlTimestamp(row.deletedAt, null, true)},
  ${sqlNullableText(row.deletedBy)},
  ${sqlTimestamp(row.createdAt, row.createTime)},
  ${sqlTimestamp(row.updatedAt, row.updateTime || row.createTime)}
)
on conflict (id) do update
set supplier_id = excluded.supplier_id,
    supplier_name = excluded.supplier_name,
    supplier_email = excluded.supplier_email,
    order_type = excluded.order_type,
    site_name = excluded.site_name,
    project_key = excluded.project_key,
    items = excluded.items,
    ordered_by = excluded.ordered_by,
    note = excluded.note,
    ordered_at = excluded.ordered_at,
    email_sent = excluded.email_sent,
    email_sent_at = excluded.email_sent_at,
    deleted_at = excluded.deleted_at,
    deleted_by = excluded.deleted_by,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;`;
}

const supplierDocs = await fetchCollection('order_suppliers', 500);
const itemDocs = await fetchCollection('order_items', 1000);
const orderDocs = await fetchCollection('orders', 500);

supplierDocs.sort((a, b) => a.name.localeCompare(b.name));
itemDocs.sort((a, b) => a.name.localeCompare(b.name));
orderDocs.sort((a, b) => a.name.localeCompare(b.name));

const statements = [];
const summary = {
  orderSuppliers: supplierDocs.length,
  orderItems: itemDocs.length,
  orders: orderDocs.length,
};

for (const supplierDoc of supplierDocs) {
  const fields = decodeFields(supplierDoc.fields || {});
  statements.push(buildSupplierUpsert({
    id: supplierDoc.name.split('/').pop(),
    ...fields,
    createTime: supplierDoc.createTime,
    updateTime: supplierDoc.updateTime,
  }));
}

for (const itemDoc of itemDocs) {
  const fields = decodeFields(itemDoc.fields || {});
  statements.push(buildOrderItemUpsert({
    id: itemDoc.name.split('/').pop(),
    ...fields,
    createTime: itemDoc.createTime,
    updateTime: itemDoc.updateTime,
  }));
}

for (const orderDoc of orderDocs) {
  const fields = decodeFields(orderDoc.fields || {});
  statements.push(buildOrderUpsert({
    id: orderDoc.name.split('/').pop(),
    ...fields,
    createTime: orderDoc.createTime,
    updateTime: orderDoc.updateTime,
  }));
}

const sql = [
  '-- Generated from Firestore order documents.',
  '-- Source: order_suppliers + order_items + orders',
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
