param([switch]$SkipPublish, [string]$CompilerPath, [string]$PublishDirectory, [string]$SetupFileName = 'DgpPass-Setup-x64')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$publishPath = if (-not [string]::IsNullOrWhiteSpace($PublishDirectory)) { [IO.Path]::GetFullPath($PublishDirectory) } else { Join-Path $taskRoot 'artifacts/win-x64' }
if (-not $SkipPublish) {
    & (Join-Path $PSScriptRoot 'Publish-Windows.ps1') -SkipWebBuild -OutputDirectory $publishPath
}
if (-not $CompilerPath) {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs/Inno Setup 6/ISCC.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6/ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 6/ISCC.exe')
    )
    $CompilerPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $CompilerPath) { throw 'Install Inno Setup 6 or supply -CompilerPath.' }
$buildRoot = Join-Path $taskRoot 'artifacts/installer-build'
New-Item -ItemType Directory -Force $buildRoot | Out-Null
$defaultsPath = Join-Path $buildRoot 'connection-defaults.json'
$bootstrapper = Join-Path $buildRoot 'MicrosoftEdgeWebview2Setup.exe'
if (-not (Test-Path -LiteralPath $bootstrapper)) {
    Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper
}
$signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'WebView2 bootstrapper signature verification failed.' }
try {
    # Read the supplied deployment secret, or decrypt the existing profile only for packaging.
    $pooledUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL_POOLED')
    if ([string]::IsNullOrWhiteSpace($pooledUrl)) { $pooledUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL') }
    if ([string]::IsNullOrWhiteSpace($pooledUrl)) {
        try { Add-Type -AssemblyName System.Security.Cryptography.ProtectedData -ErrorAction Stop } catch { Add-Type -AssemblyName System.Security }
        $profilePath = Join-Path $env:LOCALAPPDATA 'DgpPass/connection.dat'
        $profileBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($profilePath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $profile = [Text.Encoding]::UTF8.GetString($profileBytes) | ConvertFrom-Json
        $pooledUrl = $profile.DatabaseUrl
    }
    if ([string]::IsNullOrWhiteSpace($pooledUrl)) { throw 'Configure the Neon connection before building this preconfigured installer.' }
    @{ Mode='local'; DatabaseUrl=$pooledUrl; ServerUrl=''; NeedsAdminSetup=$false } | ConvertTo-Json | Set-Content -LiteralPath $defaultsPath -Encoding utf8
    $publishPath = if ($PublishDirectory) { [IO.Path]::GetFullPath($PublishDirectory) } else { Join-Path $taskRoot 'artifacts/win-x64' }
    & $CompilerPath "/DPublishDir=$publishPath" "/DDefaultsFile=$defaultsPath" "/DWebViewBootstrapper=$bootstrapper" "/DSetupFileName=$SetupFileName" (Join-Path $taskRoot 'installer/DgpPass.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
    $installerPath = Join-Path $taskRoot "artifacts/installer/$SetupFileName.exe"
    $hash = Get-FileHash -LiteralPath $installerPath -Algorithm SHA256
    "$($hash.Hash)  $SetupFileName.exe" | Set-Content -LiteralPath (Join-Path $taskRoot "artifacts/installer/$SetupFileName.sha256.txt")
    Write-Output "Installer created: $installerPath"
} finally {
    # Do not leave the unpacked deployment secret in the build staging directory.
    if (Test-Path -LiteralPath $defaultsPath) { Remove-Item -LiteralPath $defaultsPath }
}
