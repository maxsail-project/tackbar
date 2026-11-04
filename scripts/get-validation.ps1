#Requires -Version 5.1
<#
.SYNOPSIS
  Resume los workflows de validacion de TackBar para un commit.
  Si el HEAD de main no tiene runs asociados, lo informa como NOT RUN.
.EXAMPLE
  .\get-validation.ps1
.EXAMPLE
  .\get-validation.ps1 -Sha a57971f
.EXAMPLE
  .\get-validation.ps1 -Sha a57971f -AsJson
.NOTES
  Requiere GitHub CLI (gh) autenticado y permiso de lectura de GitHub Actions.
  No lanza tests ni modifica GitHub. Consulta el HEAD remoto de main por defecto.
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [AllowEmptyString()]
    [string]$Sha = '',
    [string]$Repo = 'maxsail-project/tackbar',
    [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-GhJson {
    param([string[]]$Arguments)
    $output = & gh @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "gh $($Arguments -join ' ') fallo: $($output -join ' ')" }
    return ($output -join "`n" | ConvertFrom-Json)
}

function Get-TestCounts {
    param([string]$Log, [string]$Kind)
    # Los logs de gh pueden incluir prefijos, colores ANSI y retornos de carro.
    $clean = $Log -replace '\x1B\[[0-9;]*[A-Za-z]', ''
    $clean = $clean -replace '\r', "`n"
    $lines = $clean -split '\n'
    if ($Kind -eq 'frontend') {
        # Vitest: "Tests  957 passed | 2 skipped (959)".
        # En diferentes versiones puede llevar espacios, barras o separadores.
        $matches = @($lines | Where-Object { $_ -match '\bTests\s*:?\s*\d+\s+passed\b' })
        if ($matches.Count -eq 0) { return $null }
        $matchLine = [string]$matches[-1]
        $passedMatch = [regex]::Match($matchLine, '\bTests\s*:?\s*(\d+)\s+passed\b')
        if (-not $passedMatch.Success) { return $null }
        $failedMatch = [regex]::Match($matchLine, '\b(\d+)\s+failed\b')
        $skippedMatch = [regex]::Match($matchLine, '\b(\d+)\s+skipped\b')
        return [pscustomobject]@{
            Passed  = [int]$passedMatch.Groups[1].Value
            Failed  = $(if ($failedMatch.Success) { [int]$failedMatch.Groups[1].Value } else { 0 })
            Skipped = $(if ($skippedMatch.Success) { [int]$skippedMatch.Groups[1].Value } else { 0 })
        }
    }
    # pytest: resumen final "1149 passed, 1 skipped in 97.20s".
    $matchLine = $lines | Where-Object {
        $_ -match '\b\d+\s+(passed|failed|errors?)\b' -and $_ -match '\bin\s+[\d.]+s\b'
    } | Select-Object -Last 1
    if (-not $matchLine) { return $null }
    $counts = @{ passed = 0; failed = 0; skipped = 0; error = 0; errors = 0 }
    foreach ($m in [regex]::Matches($matchLine, '\b(\d+)\s+(passed|failed|skipped|errors?)\b')) {
        $counts[$m.Groups[2].Value] = [int]$m.Groups[1].Value
    }
    return [pscustomobject]@{
        Passed  = $counts.passed
        Failed  = $counts.failed + $counts.error + $counts.errors
        Skipped = $counts.skipped
    }
}

function Get-JobLog {
    param([string]$Repo, [string]$RunId, [string]$JobId)
    # Intentar primero el endpoint oficial del log del job; evita depender
    # del formato y paginacion de "gh run view --log".
    $log = & gh api --allow-escape-sequences "repos/$Repo/actions/jobs/$JobId/logs" 2>&1
    if ($LASTEXITCODE -eq 0 -and $log) { return ($log -join "`n") }
    $log = & gh run view $RunId --repo $Repo --job $JobId --log 2>&1
    if ($LASTEXITCODE -eq 0 -and $log) { return ($log -join "`n") }
    return $null
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'No se encuentra GitHub CLI (gh). Instala gh y ejecuta gh auth login.'
}

try {
    if ([string]::IsNullOrWhiteSpace($Sha)) {
        $branch = Invoke-GhJson -Arguments @('api', "repos/$Repo/branches/main")
        $Sha = [string]$branch.commit.sha
        $source = 'HEAD remoto de main'
    } else {
        # Resolver SHA abreviado y comprobar que existe en el repositorio.
        $commit = Invoke-GhJson -Arguments @('api', "repos/$Repo/commits/$Sha")
        $Sha = [string]$commit.sha
        $source = 'SHA solicitado'
    }

    $api = Invoke-GhJson -Arguments @('api', "repos/$Repo/actions/runs?head_sha=$Sha&per_page=100")
    $definitions = @(
        @{ Kind = 'frontend'; Name = 'Validate Frontend (Linux)' },
        @{ Kind = 'backend';  Name = 'Validate Backend (Linux)' }
    )
    $results = @()
    foreach ($definition in $definitions) {
        $run = @($api.workflow_runs | Where-Object {
            $_.name -eq $definition.Name -and $_.head_sha -eq $Sha
        } | Sort-Object created_at -Descending | Select-Object -First 1)

        if ($run.Count -eq 0) {
            $results += [pscustomobject]@{
                Workflow = $definition.Name; Status = 'NOT RUN'; RunId = $null
                URL = $null; Passed = $null; Failed = $null; Skipped = $null
                Typecheck = $null; Build = $null; Note = 'Sin ejecucion para este SHA'
            }
            continue
        }
        $r = $run[0]
        $jobsResponse = Invoke-GhJson -Arguments @('api', "repos/$Repo/actions/runs/$($r.id)/jobs?per_page=100")
        $jobs = @($jobsResponse.jobs)
        $steps = @($jobs | ForEach-Object { $_.steps })
        $typecheck = $null
        $build = $null
        if ($definition.Kind -eq 'frontend') {
            $typecheck = ($steps | Where-Object name -eq 'Typecheck frontend' | Select-Object -Last 1).conclusion
            $build = ($steps | Where-Object name -eq 'Build production frontend' | Select-Object -Last 1).conclusion
        }

        $counts = $null
        $note = ''
        if ($r.status -eq 'completed') {
            $testJob = $jobs | Where-Object { $_.name -match '(Frontend tests|Full backend regression)' } | Select-Object -First 1
            if (-not $testJob) { $testJob = $jobs | Select-Object -First 1 }
            if ($testJob) {
                $jobLog = Get-JobLog -Repo $Repo -RunId ([string]$r.id) -JobId ([string]$testJob.id)
                if ($null -ne $jobLog) {
                    $counts = Get-TestCounts -Log $jobLog -Kind $definition.Kind
                    if (-not $counts) {
                        $note = 'No se encontro resumen de tests en el log del job (consultar enlace del workflow)'
                    }
                } else {
                    $note = 'No se pudo leer el log del job'
                }
            }
        } else {
            $note = 'Ejecucion no terminada'
        }

        $results += [pscustomobject]@{
            Workflow = $definition.Name
            Status = $(if ($r.status -eq 'completed') { [string]$r.conclusion } else { [string]$r.status })
            RunId = $r.id
            URL = [string]$r.html_url
            Passed = $(if ($counts) { $counts.Passed } else { $null })
            Failed = $(if ($counts) { $counts.Failed } else { $null })
            Skipped = $(if ($counts) { $counts.Skipped } else { $null })
            Typecheck = $typecheck
            Build = $build
            Note = $note
        }
    }

    if ($AsJson) {
        [pscustomobject]@{ Repository = $Repo; SHA = $Sha; Source = $source; Results = $results } |
            ConvertTo-Json -Depth 5
    } else {
        Write-Host "Repositorio: $Repo"
        Write-Host "Commit:      $Sha ($source)"
        Write-Host ''
        $results | Select-Object Workflow, Status, Passed, Failed, Skipped, Typecheck, Build |
            Format-Table -AutoSize | Out-Host
        foreach ($item in $results) {
            if ($item.URL) { Write-Host "$($item.Workflow): $($item.URL)" }
            if ($item.Note) { Write-Warning "$($item.Workflow): $($item.Note)" }
        }
        $withCounts = @($results | Where-Object { $null -ne $_.Passed })
        if ($withCounts.Count -eq 2) {
            $sumPassed = ($withCounts | Measure-Object -Property Passed -Sum).Sum
            $sumFailed = ($withCounts | Measure-Object -Property Failed -Sum).Sum
            $sumSkipped = ($withCounts | Measure-Object -Property Skipped -Sum).Sum
            Write-Host "`nTOTAL: $sumPassed passed | $sumFailed failed | $sumSkipped skipped"
        } else {
            Write-Host "`nTOTAL: incompleto (faltan recuentos de algun workflow)"
        }
    }
} catch {
    Write-Error $_
    exit 1
}
