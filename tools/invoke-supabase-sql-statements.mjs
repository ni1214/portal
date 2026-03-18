import fs from 'node:fs/promises';
import path from 'node:path';

const sqlFileArg = process.argv[2];
const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!sqlFileArg) {
  throw new Error('Usage: node tools/invoke-supabase-sql-statements.mjs <sql-file>');
}

if (!projectRef) {
  throw new Error('SUPABASE_PROJECT_REF is required.');
}

if (!accessToken) {
  throw new Error('SUPABASE_ACCESS_TOKEN is required.');
}

const sqlPath = path.resolve(sqlFileArg);
const sql = await fs.readFile(sqlPath, 'utf8');
const rawStatements = sql
  .split(/;\s*\r?\n/)
  .map(statement => statement.trim())
  .filter(Boolean);

const statements = rawStatements
  .filter(statement => !/^begin$/i.test(statement) && !/^commit$/i.test(statement))
  .map(statement => `${statement};`);

const results = [];

for (let index = 0; index < statements.length; index += 1) {
  const statement = statements[index];
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ query: statement }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Statement ${index + 1} failed (${response.status}): ${text}`);
  }

  results.push({ index: index + 1, ok: true });
}

console.log(JSON.stringify({
  file: sqlPath,
  total: statements.length,
  success: results.length,
}, null, 2));
