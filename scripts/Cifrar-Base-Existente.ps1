param([Parameter(Mandatory=$true)][string]$SourceHtml)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$steRoot = Split-Path -Parent $PSScriptRoot
$steDir = Join-Path $steRoot '.private\migration'
if (Test-Path -LiteralPath $steDir) { throw 'La carpeta de migración ya existe. No se reemplazará su clave.' }
New-Item -ItemType Directory -Path $steDir -Force | Out-Null
$steBytes = New-Object byte[] 32
$steAuditBytes = New-Object byte[] 32
$steRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$steRng.GetBytes($steBytes)
$steRng.GetBytes($steAuditBytes)
$steKeyJson = @{active='v1'; keys=@{v1=[Convert]::ToBase64String($steBytes)}} | ConvertTo-Json -Compress
$steAudit = [Convert]::ToBase64String($steAuditBytes)
$steScope = [Security.Cryptography.DataProtectionScope]::CurrentUser
[IO.File]::WriteAllBytes((Join-Path $steDir 'key.dpapi'), [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($steKeyJson), $null, $steScope))
[IO.File]::WriteAllBytes((Join-Path $steDir 'audit.dpapi'), [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($steAudit), $null, $steScope))
try {
    $env:STE_DATA_KEYS = $steKeyJson
    node (Join-Path $PSScriptRoot 'encrypt-existing.cjs') $SourceHtml
    if ($LASTEXITCODE -ne 0) { throw 'No se completó el cifrado. Conserve los originales y revise el error.' }
} finally {
    Remove-Item Env:\STE_DATA_KEYS -ErrorAction SilentlyContinue
    [Array]::Clear($steBytes, 0, $steBytes.Length)
    [Array]::Clear($steAuditBytes, 0, $steAuditBytes.Length)
    $steKeyJson = $null
    $steAudit = $null
    $steRng.Dispose()
}
