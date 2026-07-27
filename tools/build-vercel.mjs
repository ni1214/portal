import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(projectRoot, 'dist');
const checkOnly = process.argv.includes('--check');
const previewBuild = `${process.env.VERCEL_ENV || ''}`.trim().toLowerCase() === 'preview';

const staticFiles = [
  'index.html',
  'style.css',
  'script.js',
  'favicon.svg',
  'site.webmanifest',
];
const staticDirectories = ['modules', 'assets'];
const publicDirectoryExtensions = new Map([
  ['modules', new Set(['.js'])],
  ['assets', new Set(['.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp'])],
]);
const apiEntries = [
  'api/ai.mjs',
  'api/weather.mjs',
  'api/order-email.mjs',
  'api/order-email-reconcile.mjs',
];
const fontawesomeWebfonts = [
  'fa-brands-400.ttf',
  'fa-brands-400.woff2',
  'fa-regular-400.ttf',
  'fa-regular-400.woff2',
  'fa-solid-900.ttf',
  'fa-solid-900.woff2',
  'fa-v4compatibility.ttf',
  'fa-v4compatibility.woff2',
];
const vendorAssets = [
  {
    source: 'node_modules/@fortawesome/fontawesome-free/css/all.min.css',
    target: 'vendor/fontawesome-6.7.2/css/all.min.css',
  },
  ...fontawesomeWebfonts.map(name => ({
    source: `node_modules/@fortawesome/fontawesome-free/webfonts/${name}`,
    target: `vendor/fontawesome-6.7.2/webfonts/${name}`,
  })),
  {
    source: 'node_modules/@fortawesome/fontawesome-free/LICENSE.txt',
    target: 'vendor/fontawesome-6.7.2/LICENSE.txt',
  },
  {
    source: 'node_modules/material-symbols/rounded.css',
    target: 'vendor/material-symbols-0.45.8/rounded.css',
  },
  {
    source: 'node_modules/material-symbols/material-symbols-rounded.woff2',
    target: 'vendor/material-symbols-0.45.8/material-symbols-rounded.woff2',
  },
  {
    source: 'node_modules/material-symbols/LICENSE',
    target: 'vendor/material-symbols-0.45.8/LICENSE',
  },
];
const generatedVendorPaths = [
  'vendor/security-bootstrap.js',
  'vendor/supabase.js',
  'vendor/xlsx.js',
];
const forbiddenPublicBasenames = new Set([
  '.env',
  'agents.md',
  'claude.md',
  'home_setup.md',
  'gas-order-script.js',
  'package-lock.json',
  'package.json',
  'vercel.json',
]);
const forbiddenPublicExtensions = new Set([
  '.bak',
  '.crt',
  '.env',
  '.key',
  '.log',
  '.map',
  '.md',
  '.pem',
  '.pfx',
  '.p12',
  '.sql',
  '.tmp',
]);
const forbiddenPublicContent = [
  {
    label: 'source map directive',
    pattern: /(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=/i,
  },
  {
    label: 'SQL schema or privilege statement',
    pattern: /^\s*(?:create|alter|grant|revoke)\s+(?:table|policy|function|role|on\s+function)\b/im,
  },
  {
    label: 'internal project instructions',
    pattern: /(?:Portal プロジェクト\s*[—-]\s*Codex 引き継ぎ|Claude Code 役割の Codex 対応表)/i,
  },
  {
    label: 'private key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    label: 'Google API key',
    pattern: /AIza[0-9A-Za-z_-]{30,}/,
  },
  {
    label: 'GitHub access token',
    pattern: /gh[pousr]_[0-9A-Za-z]{20,}/,
  },
  {
    label: 'AWS access key',
    pattern: /AKIA[0-9A-Z]{16}/,
  },
  {
    label: 'Slack access token',
    pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/,
  },
  {
    label: 'JWT-like credential',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    label: 'server-only environment variable',
    pattern: /\b(?:SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|OPENWEATHER_API_KEY|GAS_ORDER_TOKEN)\b/,
  },
  {
    label: 'Google Apps Script deployment endpoint',
    pattern: /https:\/\/script\.google\.com\/macros\/s\/[0-9A-Za-z_-]{20,}\/exec/i,
  },
  {
    label: 'assigned weather credential',
    pattern: /\b(?:WEATHER_API_KEY|OPENWEATHER_API_KEY)\b\s*[:=]\s*["'][0-9a-f]{20,}["']/i,
  },
];

export const PREVIEW_NOTICE_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="referrer" content="no-referrer">
  <title>プレビュー停止中</title>
</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f8f9fa;color:#202124;font-family:Arial,'Noto Sans JP',sans-serif">
  <main style="box-sizing:border-box;width:min(92vw,520px);padding:40px;border:1px solid #dadce0;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(60,64,67,.12)">
    <h1 style="margin:0 0 16px;font-size:28px;line-height:1.35">プレビュー停止中</h1>
    <p>本番データを保護するため、この環境ではポータルを起動しません。</p>
    <p>動作確認は管理された本番環境で行ってください。</p>
  </main>
</body>
</html>
`;

function toPosixPath(pathname) {
  return `${pathname || ''}`.replaceAll('\\', '/');
}

function assertSafeDistPath() {
  if (dirname(distDir) !== projectRoot || basename(distDir) !== 'dist') {
    throw new Error(`Unsafe dist directory: ${distDir}`);
  }
}

async function assertSourceExists(pathname, expectedType) {
  const absolute = resolve(projectRoot, pathname);
  const info = await stat(absolute);
  if (expectedType === 'file' && !info.isFile()) {
    throw new Error(`${pathname} must be a file.`);
  }
  if (expectedType === 'directory' && !info.isDirectory()) {
    throw new Error(`${pathname} must be a directory.`);
  }
}

async function walkFiles(absoluteRoot, displayRoot) {
  const files = [];

  async function visit(absoluteDirectory, relativeDirectory = '') {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = toPosixPath(join(relativeDirectory, entry.name));
      const absolutePath = join(absoluteDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed in ${displayRoot}: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      } else {
        throw new Error(`Unsupported filesystem entry in ${displayRoot}: ${relativePath}`);
      }
    }
  }

  await visit(absoluteRoot);
  return files.sort();
}

export function assertAllowedPublicDirectoryFile(directory, relativePath) {
  const allowedExtensions = publicDirectoryExtensions.get(directory);
  if (!allowedExtensions) {
    throw new Error(`Unknown public directory: ${directory}`);
  }

  const normalized = toPosixPath(relativePath).replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (
    !normalized
    || segments.some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))
  ) {
    throw new Error(`Unsafe public path: ${directory}/${normalized}`);
  }

  const filename = basename(normalized).toLowerCase();
  const extension = extname(filename).toLowerCase();
  if (
    forbiddenPublicBasenames.has(filename)
    || /^\.env(?:\.|$)/i.test(filename)
    || forbiddenPublicExtensions.has(extension)
    || !allowedExtensions.has(extension)
  ) {
    throw new Error(`Forbidden public file: ${directory}/${normalized}`);
  }
  return `${directory}/${normalized}`;
}

export function assertNoForbiddenPublicContent(pathname, content) {
  const text = Buffer.isBuffer(content)
    ? content.toString('utf8')
    : `${content ?? ''}`;
  for (const { label, pattern } of forbiddenPublicContent) {
    if (pattern.test(text)) {
      throw new Error(`Forbidden ${label} in deployment artifact: ${pathname}`);
    }
  }

  if (/\.svg$/i.test(pathname)) {
    const activeSvgPattern = /<(?:script|iframe|object|embed)\b|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:javascript:|data:text\/html)/i;
    if (activeSvgPattern.test(text)) {
      throw new Error(`Active content is not allowed in public SVG: ${pathname}`);
    }
  }
}

export function assertPreviewNoticeSafe(html) {
  const text = `${html ?? ''}`;
  const networkOrExecutionPattern = /(?:https?:|wss?:|stun:|turn:|<\s*(?:script|style|link|img|iframe|video|audio|source|object|embed|form)\b|\b(?:src|href|action)\s*=|\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|http-equiv\s*=\s*["']?refresh)/i;
  if (networkOrExecutionPattern.test(text)) {
    throw new Error('Preview notice must not contain network or executable content.');
  }
  if (!/<h1\b[^>]*>プレビュー停止中<\/h1>/i.test(text)) {
    throw new Error('Preview notice heading is missing.');
  }
}

async function collectPublicDirectoryFiles() {
  const files = [];
  for (const directory of staticDirectories) {
    const absoluteDirectory = resolve(projectRoot, directory);
    const relativeFiles = await walkFiles(absoluteDirectory, directory);
    for (const relativePath of relativeFiles) {
      const publicPath = assertAllowedPublicDirectoryFile(directory, relativePath);
      const source = resolve(projectRoot, publicPath);
      assertNoForbiddenPublicContent(publicPath, await readFile(source));
      files.push({ source: publicPath, target: publicPath });
    }
  }
  return files;
}

async function validateProjectFiles() {
  await Promise.all(staticFiles.map(pathname => assertSourceExists(pathname, 'file')));
  await Promise.all(staticDirectories.map(pathname => assertSourceExists(pathname, 'directory')));
  await Promise.all(apiEntries.map(pathname => assertSourceExists(pathname, 'file')));
  await assertSourceExists('security-bootstrap.js', 'file');
  await Promise.all(vendorAssets.map(asset => assertSourceExists(asset.source, 'file')));

  for (const pathname of ['package.json', 'vercel.json', 'site.webmanifest']) {
    JSON.parse(await readFile(resolve(projectRoot, pathname), 'utf8'));
  }

  const vercelConfig = JSON.parse(await readFile(resolve(projectRoot, 'vercel.json'), 'utf8'));
  if (vercelConfig.outputDirectory !== 'dist') {
    throw new Error('vercel.json must publish only the dist directory.');
  }

  for (const pathname of [...staticFiles, 'security-bootstrap.js']) {
    assertNoForbiddenPublicContent(pathname, await readFile(resolve(projectRoot, pathname)));
  }
  return collectPublicDirectoryFiles();
}

async function validateServerBundles() {
  await esbuild({
    absWorkingDir: projectRoot,
    entryPoints: apiEntries,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    outdir: resolve(projectRoot, '.vercel-bundle-check'),
    write: false,
    logLevel: 'warning',
  });
}

async function buildVendorBundles({ write }) {
  const common = {
    absWorkingDir: projectRoot,
    bundle: true,
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    platform: 'browser',
    target: ['es2022'],
    write,
    logLevel: 'warning',
  };

  const results = await Promise.all([
    esbuild({
      ...common,
      stdin: {
        contents: "export { createClient } from '@supabase/supabase-js';",
        resolveDir: projectRoot,
        sourcefile: 'vendor-supabase-entry.js',
        loader: 'js',
      },
      format: 'esm',
      outfile: resolve(distDir, 'vendor', 'supabase.js'),
    }),
    esbuild({
      ...common,
      stdin: {
        contents: "import * as XLSX from 'xlsx'; globalThis.XLSX = XLSX;",
        resolveDir: projectRoot,
        sourcefile: 'vendor-xlsx-entry.js',
        loader: 'js',
      },
      format: 'iife',
      outfile: resolve(distDir, 'vendor', 'xlsx.js'),
    }),
    esbuild({
      ...common,
      entryPoints: ['security-bootstrap.js'],
      format: 'iife',
      outfile: resolve(distDir, 'vendor', 'security-bootstrap.js'),
    }),
  ]);

  if (!write) {
    for (const result of results) {
      for (const outputFile of result.outputFiles || []) {
        const pathname = toPosixPath(relative(distDir, outputFile.path));
        assertNoForbiddenPublicContent(pathname, outputFile.contents);
      }
    }
  }
}

async function copyVendorAssets() {
  await Promise.all(vendorAssets.map(async ({ source, target }) => {
    const destination = resolve(distDir, target);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(projectRoot, source), destination);
  }));
}

async function copyStaticAllowlist(publicDirectoryFiles) {
  await Promise.all(staticFiles.map(async (pathname) => {
    const destination = resolve(distDir, pathname);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(projectRoot, pathname), destination);
  }));
  await Promise.all(publicDirectoryFiles.map(async ({ source, target }) => {
    const destination = resolve(distDir, target);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(projectRoot, source), destination);
  }));
}

function getExpectedDistPaths(publicDirectoryFiles) {
  return new Set([
    ...staticFiles,
    ...publicDirectoryFiles.map(file => file.target),
    ...vendorAssets.map(asset => asset.target),
    ...generatedVendorPaths,
  ]);
}

async function validateDistAllowlist(publicDirectoryFiles, { preview = false } = {}) {
  const distFiles = await walkFiles(distDir, 'dist');
  const expectedPaths = preview
    ? new Set(['index.html'])
    : getExpectedDistPaths(publicDirectoryFiles);
  const actualPaths = new Set(distFiles);
  const unexpected = distFiles.filter(pathname => !expectedPaths.has(pathname));
  const missing = [...expectedPaths].filter(pathname => !actualPaths.has(pathname));
  if (unexpected.length || missing.length) {
    throw new Error(
      `Deployment allowlist mismatch (unexpected: ${unexpected.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}).`,
    );
  }

  for (const pathname of distFiles) {
    const extension = extname(pathname).toLowerCase();
    const filename = basename(pathname).toLowerCase();
    if (
      forbiddenPublicExtensions.has(extension)
      || forbiddenPublicBasenames.has(filename)
      || /^\.env(?:\.|$)/i.test(filename)
    ) {
      throw new Error(`Forbidden deployment artifact: ${pathname}`);
    }
    const content = await readFile(resolve(distDir, pathname));
    assertNoForbiddenPublicContent(pathname, content);
  }

  if (preview) {
    assertPreviewNoticeSafe(await readFile(resolve(distDir, 'index.html'), 'utf8'));
  }

  const relativeDist = relative(projectRoot, distDir);
  console.log(
    preview
      ? `Verified network-free preview stop page in ${relativeDist || 'dist'}.`
      : `Verified recursive deployment allowlist in ${relativeDist || 'dist'}.`,
  );
}

async function writePreviewNotice() {
  assertPreviewNoticeSafe(PREVIEW_NOTICE_HTML);
  assertSafeDistPath();
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await writeFile(resolve(distDir, 'index.html'), PREVIEW_NOTICE_HTML, 'utf8');
}

export async function runBuild() {
  const publicDirectoryFiles = await validateProjectFiles();
  await validateServerBundles();

  if (checkOnly) {
    await buildVendorBundles({ write: false });
    assertPreviewNoticeSafe(PREVIEW_NOTICE_HTML);
    console.log('Vercel source, recursive public allowlist, and server bundle checks passed.');
    return;
  }

  if (previewBuild) {
    await writePreviewNotice();
    await validateDistAllowlist(publicDirectoryFiles, { preview: true });
    return;
  }

  assertSafeDistPath();
  await rm(distDir, { recursive: true, force: true });
  await mkdir(resolve(distDir, 'vendor'), { recursive: true });
  await copyStaticAllowlist(publicDirectoryFiles);
  await buildVendorBundles({ write: true });
  await copyVendorAssets();
  await validateDistAllowlist(publicDirectoryFiles);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await runBuild();
}
