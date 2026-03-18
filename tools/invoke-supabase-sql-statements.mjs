import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const sqlFileArg = args.find(arg => !arg.startsWith('--'));
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const batchSize = Math.max(1, Number(batchSizeArg?.split('=')[1] || 25));

if (!sqlFileArg) {
  throw new Error('Usage: node tools/invoke-supabase-sql-statements.mjs <sql-file> [--batch-size=25]');
}

if (!projectRef) {
  throw new Error('SUPABASE_PROJECT_REF is required.');
}

if (!accessToken) {
  throw new Error('SUPABASE_ACCESS_TOKEN is required.');
}

const sqlPath = path.resolve(sqlFileArg);
const sql = await fs.readFile(sqlPath, 'utf8');
const normalizedSql = sql
  .split(/\r?\n/)
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');

const rawStatements = normalizedSql
  .split(/;\s*\r?\n/)
  .map(statement => statement.trim())
  .filter(Boolean);

const statements = rawStatements
  .filter(statement => !/^begin$/i.test(statement) && !/^commit$/i.test(statement))
  .map(statement => `${statement};`);

const batches = [];
for (let index = 0; index < statements.length; index += batchSize) {
  batches.push(statements.slice(index, index + batchSize));
}

const results = [];

for (let index = 0; index < batches.length; index += 1) {
  const query = batches[index].join('\n');
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ query }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Batch ${index + 1} failed (${response.status}): ${text}`);
  }

  results.push({ index: index + 1, ok: true, statements: batches[index].length });
}

console.log(JSON.stringify({
  file: sqlPath,
  totalStatements: statements.length,
  batchSize,
  totalBatches: batches.length,
  successBatches: results.length,
}, null, 2));
