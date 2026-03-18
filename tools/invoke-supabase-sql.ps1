param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$Sql,
  [string]$SqlFile,
  [switch]$Raw
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
  throw 'SUPABASE_PROJECT_REF is required.'
}

if ([string]::IsNullOrWhiteSpace($AccessToken)) {
  throw 'SUPABASE_ACCESS_TOKEN is required.'
}

if ([string]::IsNullOrWhiteSpace($Sql) -and [string]::IsNullOrWhiteSpace($SqlFile)) {
  throw 'Sql or SqlFile is required.'
}

if (-not [string]::IsNullOrWhiteSpace($SqlFile)) {
  if (-not (Test-Path $SqlFile)) {
    throw "SQL file not found: $SqlFile"
  }
  $resolvedPath = (Resolve-Path $SqlFile).Path
  $Sql = [System.IO.File]::ReadAllText($resolvedPath, [System.Text.UTF8Encoding]::new($false))
}

$headers = @{
  Authorization = "Bearer $AccessToken"
  'Content-Type' = 'application/json'
}

$body = @{ query = $Sql } | ConvertTo-Json -Compress -Depth 8
$uri = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
$response = Invoke-RestMethod -Uri $uri -Headers $headers -Method Post -Body $body

if ($Raw) {
  $response | ConvertTo-Json -Depth 100
  exit 0
}

if ($null -eq $response) {
  Write-Output 'OK'
  exit 0
}

if ($response.PSObject.Properties.Name -contains 'value') {
  $value = $response.value
  if ($value -is [System.Array] -and $value.Count -gt 0) {
    $value | Format-Table -AutoSize
  } elseif ($value -is [System.Array]) {
    Write-Output 'OK (0 rows)'
  } else {
    $value | Format-List
  }
  exit 0
}

$response | ConvertTo-Json -Depth 100
