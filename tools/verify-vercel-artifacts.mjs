import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertAllowedPublicDirectoryFile,
  assertNoForbiddenPublicContent,
  assertPreviewNoticeSafe,
} from './build-vercel.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(root, 'dist');
const buildScript = resolve(root, 'tools/build-vercel.mjs');
const vercelIgnore = await readFile(resolve(root, '.vercelignore'), 'utf8');
const ignoredRoots = vercelIgnore
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#') && !line.startsWith('!'));
assert(!ignoredRoots.some(line => /^tools(?:\/|\*|$)/i.test(line)));
assert(!ignoredRoots.some(line => /^supabase(?:\/|\*|$)/i.test(line)));

async function walk(pathname) {
  const entries = await readdir(pathname, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(pathname, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (entry.isFile()) files.push(relative(distDir, child).replaceAll('\\', '/'));
  }
  return files.sort();
}

function runBuild(environment) {
  execFileSync(process.execPath, [buildScript], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

assert.equal(
  assertAllowedPublicDirectoryFile('modules', 'nested/feature.js'),
  'modules/nested/feature.js',
);
assert.equal(
  assertAllowedPublicDirectoryFile('assets', 'icons/portal.svg'),
  'assets/icons/portal.svg',
);
for (const [directory, pathname] of [
  ['modules', 'debug.js.map'],
  ['modules', 'schema.sql'],
  ['modules', '.env'],
  ['assets', 'operations.md'],
  ['assets', 'secret.pem'],
  ['assets', '../outside.png'],
]) {
  assert.throws(
    () => assertAllowedPublicDirectoryFile(directory, pathname),
    /Forbidden public file|Unsafe public path/,
  );
}

const fakeGoogleKey = ['AI', 'za', 'A'.repeat(35)].join('');
assert.throws(
  () => assertNoForbiddenPublicContent('modules/example.js', `const key = "${fakeGoogleKey}";`),
  /Google API key/,
);
assert.throws(
  () => assertNoForbiddenPublicContent('modules/example.js', '//# sourceMappingURL=example.js.map'),
  /source map directive/,
);
assert.throws(
  () => assertNoForbiddenPublicContent('assets/example.svg', '<svg onload="alert(1)"></svg>'),
  /Active content/,
);
assert.throws(
  () => assertPreviewNoticeSafe('<p>停止</p><img src="https://example.com/pixel.png">'),
  /network or executable content/,
);

const originalEnvironment = { ...process.env };
const previewEnvironment = { ...originalEnvironment, VERCEL_ENV: 'preview' };
const normalEnvironment = { ...originalEnvironment };
delete normalEnvironment.VERCEL_ENV;

try {
  runBuild(previewEnvironment);
  assert.deepEqual(await walk(distDir), ['index.html']);
  const previewHtml = await readFile(resolve(distDir, 'index.html'), 'utf8');
  assertPreviewNoticeSafe(previewHtml);
  assert.match(previewHtml, /本番データを保護するため/);
} finally {
  runBuild(normalEnvironment);
}

const normalFiles = await walk(distDir);
assert(normalFiles.includes('index.html'));
assert(normalFiles.includes('script.js'));
assert(normalFiles.includes('modules/supabase.js'));
assert(normalFiles.includes('vendor/security-bootstrap.js'));
assert(!normalFiles.some(pathname => /\.(?:map|sql|md|env)$/i.test(pathname)));

console.log('Preview stop page and recursive deployment artifact checks passed.');
