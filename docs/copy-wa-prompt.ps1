# copy-wa-prompt.ps1 — Copia un prompt WA al portapapeles (Windows).
#
# Uso (desde la raíz del repo):
#   .\docs\copy-wa-prompt.ps1 M0
#   .\docs\copy-wa-prompt.ps1 M5
#   .\docs\copy-wa-prompt.ps1 list
#
param(
    [Parameter(Position = 0)]
    [string]$Id = "list"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Sh = Join-Path $ScriptDir "run-wa-features-prompts.sh"

function Find-Bash {
    $candidates = @(
        (Get-Command bash -ErrorAction SilentlyContinue)?.Source
        "C:\Program Files\Git\bin\bash.exe"
        "C:\Program Files (x86)\Git\bin\bash.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }
    return $candidates | Select-Object -First 1
}

$Bash = Find-Bash
if (-not $Bash) {
    Write-Error "bash no encontrado. Instala Git for Windows o usa Git Bash."
    exit 1
}

if ($Id -eq "list") {
    & $Bash $Sh
    exit 0
}

# stderr del script son cabeceras; stdout = prompt para Cursor
$prompt = & $Bash $Sh $Id 2>$null
if (-not $prompt) {
    Write-Error "Prompt vacío o ID inválido: $Id"
    & $Bash $Sh
    exit 1
}

Set-Clipboard -Value $prompt
Write-Host "OK — Copiado al portapapeles: $Id"
Write-Host "Pega en Cursor → Agent (modelo según tabla) → Enter"
