param([switch]$SkipWebBuild, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
Push-Location $taskRoot
try {
    if (-not $SkipWebBuild) {
        Push-Location (Join-Path $taskRoot 'web')
        try {
            npm ci
            if ($LASTEXITCODE -ne 0) { throw 'Interface dependency installation failed.' }
            npm run build
            if ($LASTEXITCODE -ne 0) { throw 'Interface build failed.' }
        } finally { Pop-Location }
    }
    $publishPath = if (-not [string]::IsNullOrWhiteSpace($OutputDirectory)) { [IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $taskRoot 'artifacts/win-x64' }
    $pooledUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL_POOLED')
    if ([string]::IsNullOrWhiteSpace($pooledUrl)) { $pooledUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL') }
    if ([string]::IsNullOrWhiteSpace($pooledUrl)) {
        try { Add-Type -AssemblyName System.Security.Cryptography.ProtectedData -ErrorAction Stop } catch { Add-Type -AssemblyName System.Security }
        $profilePath = Join-Path $env:LOCALAPPDATA 'DgpPass/connection.dat'
        if (Test-Path -LiteralPath $profilePath) {
            $profileBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($profilePath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
            $pooledUrl = ([Text.Encoding]::UTF8.GetString($profileBytes) | ConvertFrom-Json).DatabaseUrl
        }
    }
    if ([string]::IsNullOrWhiteSpace($pooledUrl)) { throw 'A Neon pooled connection is required to publish the preconfigured Windows release.' }
    $buildRoot = Join-Path $taskRoot 'artifacts/publish-build'
    New-Item -ItemType Directory -Force $buildRoot | Out-Null
    $defaultsPath = Join-Path $buildRoot 'neon-defaults.json'
    try {
        @{ Mode='local'; DatabaseUrl=$pooledUrl; ServerUrl=''; NeedsAdminSetup=$false } | ConvertTo-Json | Set-Content -LiteralPath $defaultsPath -Encoding utf8
        dotnet publish src/DgpPass.Desktop/DgpPass.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false "-p:EmbeddedNeonDefaultsPath=$defaultsPath" -o $publishPath
        if ($LASTEXITCODE -ne 0) { throw 'Windows executable publish failed.' }
        Copy-Item -LiteralPath $defaultsPath -Destination (Join-Path $publishPath 'connection.default.json') -Force
    } finally {
        if (Test-Path -LiteralPath $defaultsPath) { Remove-Item -LiteralPath $defaultsPath }
    }
    if ($LASTEXITCODE -ne 0) { throw 'Windows executable publish failed.' }
    Copy-Item -LiteralPath (Join-Path $taskRoot 'START-HERE.txt') -Destination (Join-Path $publishPath 'START-HERE.txt')
    $archivePath = Join-Path $taskRoot 'artifacts/DgpPass-Windows-x64.zip'
    Compress-Archive -Path (Join-Path $publishPath '*') -DestinationPath $archivePath -Force
    $hash = Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
    "$($hash.Hash)  DgpPass-Windows-x64.zip" | Set-Content -LiteralPath (Join-Path $taskRoot 'artifacts/SHA256SUMS.txt')
    Write-Host "Executable: $publishPath\DgpPass.exe"
    Write-Host "Portable package: $archivePath"
} finally { Pop-Location }
