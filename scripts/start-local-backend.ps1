$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backend = Join-Path $repo 'backend'

if (-not $env:TACKBAR_DATA_DIR -or [string]::IsNullOrWhiteSpace($env:TACKBAR_DATA_DIR)) { throw 'TACKBAR_DATA_DIR must point to private runtime data.' }
$dataRoot = [IO.Path]::GetFullPath($env:TACKBAR_DATA_DIR)
$repoRoot = $repo.TrimEnd('\') + '\'
if ($dataRoot.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'TACKBAR_DATA_DIR must resolve outside the TackBar repository.' }
if (-not $env:TACKBAR_ADMIN_KEY -or [string]::IsNullOrWhiteSpace($env:TACKBAR_ADMIN_KEY)) { throw 'TACKBAR_ADMIN_KEY must be configured.' }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python was not found in PATH.' }
if (-not (Test-Path (Join-Path $backend 'app\main.py'))) { throw "Backend app not found: $backend" }
if (-not (Test-Path $dataRoot)) { New-Item -ItemType Directory -Path $dataRoot | Out-Null }
Write-Host "Backend path: $backend"
Write-Host "Private data root: $dataRoot"
Write-Host 'Admin configured: yes'
Write-Host 'Backend URL: http://127.0.0.1:8000'
Push-Location $backend
try { python -m uvicorn app.main:app --reload } finally { Pop-Location }
