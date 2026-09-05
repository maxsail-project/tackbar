$ErrorActionPreference = 'Stop'
$frontend = (Resolve-Path (Join-Path $PSScriptRoot '..\frontend')).Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js was not found in PATH.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm.cmd was not found in PATH.' }
if (-not (Test-Path (Join-Path $frontend 'package.json'))) { throw "Frontend package.json not found: $frontend" }
Write-Host "Frontend path: $frontend"
Write-Host 'Admin URL: http://localhost:5173/admin'
Push-Location $frontend
try { npm.cmd run dev } finally { Pop-Location }
