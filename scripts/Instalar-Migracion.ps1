param([switch]$Apply)
$ErrorActionPreference = 'Stop'
if (-not $Apply) { throw 'Este script escribe secretos y datos cifrados en ste2026-app. Ejecútelo con -Apply solo al realizar la actualización.' }
Add-Type -AssemblyName System.Security
$steRoot = Split-Path -Parent $PSScriptRoot
$steDir = Join-Path $steRoot '.private\migration'
$steScope = [Security.Cryptography.DataProtectionScope]::CurrentUser
function Read-SteProtected([string]$Name) {
    return [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $steDir $Name)), $null, $steScope))
}
function Set-SteSecretOnce([string]$Name, [string]$Value) {
    # Captura stdout: nunca imprime valores. Un secreto distinto no se reemplaza.
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $steExisting = & gcloud secrets versions access latest --secret=$Name --project=ste2026-app 2>$null
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $oldEap
    if ($exitCode -eq 0) {
        if (($steExisting -join "`n").Trim() -ne $Value.Trim()) { throw "El secreto $Name ya existe con otro valor. No se modificó." }
        Write-Host "Secreto $Name ya instalado y coincidente."
    } else {
        $Value | & gcloud secrets create $Name --data-file=- --replication-policy=automatic --project=ste2026-app
        if ($LASTEXITCODE -ne 0) { throw "No se pudo crear $Name. No se intentará reemplazarlo." }
    }
    $steExisting = $null
}
$steKeyJson = Read-SteProtected 'key.dpapi'
$steAudit = Read-SteProtected 'audit.dpapi'
try {
    Set-SteSecretOnce 'STE_DATA_KEYS' $steKeyJson
    Set-SteSecretOnce 'STE_AUDIT_KEY' $steAudit
    $env:STE_DATA_KEYS = $steKeyJson
    $env:STE_PRIVATE_BUCKET = 'ste2026-app-ste-private'
    node (Join-Path $PSScriptRoot 'install-encrypted-data.cjs') --apply ste2026-app
    if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación de la base cifrada. No publique hasta resolverlo.' }
} finally {
    Remove-Item Env:\STE_DATA_KEYS -ErrorAction SilentlyContinue
    Remove-Item Env:\STE_PRIVATE_BUCKET -ErrorAction SilentlyContinue
    $steKeyJson = $null
    $steAudit = $null
}
