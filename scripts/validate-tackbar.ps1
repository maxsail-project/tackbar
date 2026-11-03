# Manual TackBar Linux validation. Requires GitHub CLI ('gh') authenticated locally.
# Usage: .\validate-tackbar.ps1 frontend|backend|both [-Wait]
# No repository changes, Git operations, releases, or deployments.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('frontend', 'backend', 'both')]
    [string] $Target,
    [switch] $Wait
)

$ErrorActionPreference = 'Stop'
$repo = 'maxsail-project/tackbar'
$workflows = @{
    frontend = 'validate-frontend-linux.yml'
    backend  = 'validate-backend-linux.yml'
}

function Invoke-Gh {
    param([string[]] $Arguments)
    $output = & gh @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "GitHub CLI command failed (exit $LASTEXITCODE): gh $($Arguments -join ' ')"
    }
    return $output
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) is not installed or not on PATH."
}

# Authentication is checked without printing tokens or the keyring contents.
$account = (Invoke-Gh -Arguments @('api', 'user', '--jq', '.login') | Out-String).Trim()
Write-Host "GitHub account: $account"

# Resolve the remote branch, not the local working tree.
$expectedSha = (Invoke-Gh -Arguments @('api', "repos/$repo/branches/main", '--jq', '.commit.sha') | Out-String).Trim()
if ($expectedSha -notmatch '^[a-fA-F0-9]{40}$') {
    throw "Could not resolve an unambiguous remote main SHA."
}
Write-Host "Expected remote main SHA: $expectedSha"

$selected = if ($Target -eq 'both') { @('backend', 'frontend') } else { @($Target) }
$failed = $false

foreach ($which in $selected) {
    $workflow = $workflows[$which]
    Write-Host "`nPreparing $which validation: $workflow"

    # Establish a baseline of run IDs before dispatch, so a prior run cannot
    # accidentally be reported as the newly triggered one.
    $queryArgs = @('run', 'list', '-R', $repo, '-w', $workflow,
                   '-b', 'main', '-e', 'workflow_dispatch', '-L', '50',
                   '--json', 'databaseId,headSha,url,status,conclusion')
    $prior = @(Invoke-Gh -Arguments $queryArgs | ConvertFrom-Json)
    $priorIds = @($prior | ForEach-Object { [string] $_.databaseId })

    # Exactly one dispatch per selected workflow: never retry automatically.
    Invoke-Gh -Arguments @('workflow', 'run', $workflow, '--ref', 'main', '-R', $repo) | Out-Host

    $newRun = $null
    for ($attempt = 1; $attempt -le 12; $attempt++) {
        Start-Sleep -Seconds 2
        $current = @(Invoke-Gh -Arguments $queryArgs | ConvertFrom-Json)
        $new = @($current | Where-Object { $priorIds -notcontains [string] $_.databaseId })
        if ($new.Count -gt 1) {
            throw "More than one new $workflow run appeared. Cannot attribute a run safely. Inspect GitHub Actions manually."
        }
        if ($new.Count -eq 1) {
            $newRun = $new[0]
            break
        }
    }

    if ($null -eq $newRun) {
        Write-Warning "Dispatch requested but no new run could be identified. Check https://github.com/$repo/actions/workflows/$workflow"
        $failed = $true
        continue
    }

    Write-Host "Run: $($newRun.url)"
    Write-Host "Executed SHA: $($newRun.headSha)"
    if ($newRun.headSha -ne $expectedSha) {
        Write-Warning "Run SHA does not match the remote main SHA captured before dispatch. Do not treat it as validation of the expected commit."
        $failed = $true
        continue
    }

    if ($Wait) {
        # The command returns a nonzero exit status if the workflow failed.
        & gh run watch ([string] $newRun.databaseId) --exit-status -R $repo
        $watchExit = $LASTEXITCODE
    }

    $details = Invoke-Gh -Arguments @('run', 'view', ([string] $newRun.databaseId), '-R', $repo,
                            '--json', 'status,conclusion,headSha,url') | ConvertFrom-Json
    Write-Host "Status: $($details.status); Conclusion: $($details.conclusion)"
    Write-Host "JUnit and test counts: open the GitHub Actions Summary and Artifacts on $($details.url)"
    if ($Wait -and ($watchExit -ne 0 -or $details.conclusion -ne 'success')) {
        $failed = $true
    }
}

if ($failed) { exit 1 }
