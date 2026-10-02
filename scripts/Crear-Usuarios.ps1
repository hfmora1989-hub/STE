$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Write-Host 'Proyecto: ste2026-app. Se crearán únicamente los cuatro correos de functions/access.json.'
Write-Host 'Ingrese la contraseña inicial acordada. No se guardará en archivos ni se imprimirá.'
$stePassword = Read-Host 'Contraseña inicial' -AsSecureString
$stePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($stePassword)
try {
    $env:STE_INITIAL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($stePointer)
    node scripts/provision-users.cjs --apply ste2026-app
    if ($LASTEXITCODE -ne 0) { throw 'No se completó el aprovisionamiento. Revise el mensaje anterior.' }
} finally {
    Remove-Item Env:\STE_INITIAL_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($stePointer)
    $stePassword.Dispose()
}
