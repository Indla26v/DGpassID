param([string]$ConnectionString = $env:TEST_DATABASE_URL)
$ErrorActionPreference = 'Stop'
if (-not $ConnectionString) { throw 'Set TEST_DATABASE_URL to a local PostgreSQL maintenance database, with CREATE DATABASE permission.' }
$taskRoot = Split-Path $PSScriptRoot -Parent
$previousConnection = $env:TEST_DATABASE_URL
try {
    $env:TEST_DATABASE_URL = $ConnectionString
    dotnet test (Join-Path $taskRoot 'tests/DgpPass.Tests/DgpPass.Tests.csproj') --logger 'console;verbosity=minimal'
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
} finally { $env:TEST_DATABASE_URL = $previousConnection }
