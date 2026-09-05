$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$requiredFailed = $false
function Report($state, $text, $required = $false) { Write-Host ("{0,-7} {1}" -f $state, $text); if ($required -and $state -eq 'FAIL') { $script:requiredFailed = $true } }
Report 'PASS' 'repository path exists' (Test-Path $repo)
if (-not $env:TACKBAR_DATA_DIR -or [string]::IsNullOrWhiteSpace($env:TACKBAR_DATA_DIR)) { Report 'FAIL' 'TACKBAR_DATA_DIR is missing or blank' $true } else {
  $dataRoot = [IO.Path]::GetFullPath($env:TACKBAR_DATA_DIR); $repoRoot = $repo.TrimEnd('\') + '\'
  Report ($(if ($dataRoot.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {'FAIL'} else {'PASS'})) 'private runtime root outside repository' $true
}
Report ($(if ($env:TACKBAR_ADMIN_KEY -and $env:TACKBAR_ADMIN_KEY.Trim()) {'PASS'} else {'FAIL'})) 'Admin key configured' $true
Report ($(if (Test-Path (Join-Path $repo 'backend\secrets\credentials.json')) {'PASS'} else {'FAIL'})) 'Gmail credentials present' $true
Report ($(if (Test-Path (Join-Path $repo 'backend\token.json')) {'PASS'} else {'WARNING'})) 'Gmail token present (authorize before Review mailbox now)' $false
Report ($(if (Get-Command python -ErrorAction SilentlyContinue) {'PASS'} else {'FAIL'})) 'Python available' $true
Report ($(if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {'PASS'} else {'FAIL'})) 'Node/npm available' $true
try { Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; Report 'PASS' 'backend health' } catch { Report 'FAIL' 'backend health unreachable' $true }
try { Invoke-WebRequest -Uri 'http://localhost:5173/admin' -UseBasicParsing -TimeoutSec 3 | Out-Null; Report 'PASS' 'frontend Admin reachable' } catch { Report 'WARNING' 'frontend Admin unreachable' }
if ($requiredFailed) { exit 1 }
