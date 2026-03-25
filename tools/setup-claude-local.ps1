param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$claudeDir = Join-Path $root '.claude'
$serverPath = Join-Path $claudeDir 'server.js'
$launchPath = Join-Path $claudeDir 'launch.json'
$settingsPath = Join-Path $claudeDir 'settings.local.json'

New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null

$serverJs = @'
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mime = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  png: 'image/png',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(root, relPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }

    const ext = path.extname(filePath).slice(1).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain; charset=utf-8' });
    res.end(data);
  });
}).listen(8080, () => {
  console.log(`Server running on port 8080 from ${root}`);
});
'@

$launch = [ordered]@{
  version = '0.0.1'
  configurations = @(
    [ordered]@{
      name = 'portal-dev'
      runtimeExecutable = 'node'
      runtimeArgs = @($serverPath)
      port = 8080
    }
  )
}

$settings = [ordered]@{
  permissions = [ordered]@{
    allow = @(
      'Bash(*)',
      'mcp__Claude_Preview__preview_start',
      'mcp__Claude_Preview__preview_stop',
      'mcp__Claude_Preview__preview_screenshot',
      'mcp__Claude_Preview__preview_snapshot',
      'mcp__Claude_Preview__preview_click',
      'mcp__Claude_Preview__preview_eval',
      'mcp__Claude_Preview__preview_resize',
      'mcp__Claude_Preview__preview_fill',
      'mcp__Claude_Preview__preview_inspect',
      'mcp__Claude_Preview__preview_console_logs',
      'mcp__Claude_Preview__preview_logs',
      'mcp__Claude_Preview__preview_network',
      'mcp__Claude_Preview__preview_list'
    )
    additionalDirectories = @(
      $root,
      $claudeDir
    )
  }
}

function Write-TextFile {
  param(
    [string]$Path,
    [string]$Content
  )

  if (-not $Force -and (Test-Path $Path)) {
    $existing = Get-Content -Path $Path -Raw
    if ($existing -eq $Content) { return }
  }

  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

Write-TextFile -Path $serverPath -Content $serverJs
Write-TextFile -Path $launchPath -Content (($launch | ConvertTo-Json -Depth 6))
Write-TextFile -Path $settingsPath -Content (($settings | ConvertTo-Json -Depth 6))

Write-Host "Created or updated:"
Write-Host "  $serverPath"
Write-Host "  $launchPath"
Write-Host "  $settingsPath"
Write-Host ""
Write-Host "Next step: open the repo in Codex/Claude Code and run the portal-dev configuration."
