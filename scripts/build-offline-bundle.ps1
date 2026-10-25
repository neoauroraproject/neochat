# Build an offline NeoChat deployment bundle (saved Docker images + compose + env template).
# PowerShell equivalent of scripts/build-offline-bundle.sh
#
# Usage:
#   .\scripts\build-offline-bundle.ps1 [-OutputDir deploy\offline]

param(
    [string]$OutputDir = "deploy\offline"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd")
$BundleName = "neochat-offline-$Stamp"
$Work = Join-Path $OutputDir $BundleName
$Archive = Join-Path $OutputDir "$BundleName.tar.gz"
$EnvFile = Join-Path $Root ".env.example"
$ComposeFile = Join-Path $Root "deploy\docker-compose.yml"

Write-Host "[offline] building application images …"
docker compose -f $ComposeFile --env-file $EnvFile build api web admin

Write-Host "[offline] pulling infrastructure images …"
$InfraImages = @(
    "postgres:16-alpine",
    "redis:7-alpine",
    "minio/minio:latest",
    "minio/mc:latest",
    "livekit/livekit-server:latest",
    "nginx:1.27-alpine",
    "caddy:2.8-alpine"
)
foreach ($img in $InfraImages) { docker pull $img }

$BuiltImages = docker compose -f $ComposeFile --env-file $EnvFile config --images 2>$null
$AllImages = ($InfraImages + ($BuiltImages -split "`n" | Where-Object { $_ -match 'neochat|api|web|admin' })) | Sort-Object -Unique

if (Test-Path $Work) { Remove-Item -Recurse -Force $Work }
New-Item -ItemType Directory -Force -Path (Join-Path $Work "images") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Work "deploy") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Work "scripts") | Out-Null

Write-Host "[offline] saving $($AllImages.Count) images …"
$ImageTar = Join-Path $Work "images\neochat-images.tar"
docker save @($AllImages) -o $ImageTar
# Optional: compress with gzip if available
if (Get-Command gzip -ErrorAction SilentlyContinue) {
    gzip -f $ImageTar
} else {
    Write-Host "[offline] gzip not found; leaving uncompressed images tar"
}

Copy-Item $ComposeFile (Join-Path $Work "deploy\docker-compose.yml")
Copy-Item (Join-Path $Root "deploy\docker-compose.tls.yml") (Join-Path $Work "deploy\docker-compose.tls.yml")
Copy-Item -Recurse (Join-Path $Root "deploy\nginx") (Join-Path $Work "deploy\nginx")
Copy-Item -Recurse (Join-Path $Root "deploy\caddy") (Join-Path $Work "deploy\caddy")
Copy-Item -Recurse (Join-Path $Root "deploy\livekit") (Join-Path $Work "deploy\livekit")
Copy-Item $EnvFile (Join-Path $Work ".env.example")
Copy-Item (Join-Path $Root "scripts\backup.sh") (Join-Path $Work "scripts\backup.sh")
Copy-Item (Join-Path $Root "scripts\restore.sh") (Join-Path $Work "scripts\restore.sh")
$LockFile = Join-Path $Root "package-lock.json"
if (Test-Path $LockFile) { Copy-Item $LockFile (Join-Path $Work "SBOM-package-lock.json") }

@'
NeoChat offline bundle (Windows build)
======================================

1. Load images:
     docker load -i images\neochat-images.tar.gz
   (If gzip-wrapped, decompress first or use WSL/bash script.)

2. Configure:
     copy .env.example .env

3. Start:
     docker compose -f deploy\docker-compose.yml --env-file .env up -d

See README-OFFLINE.txt in the bash bundle for full Stage-1/Stage-2 notes.
'@ | Set-Content -Path (Join-Path $Work "README-OFFLINE.txt") -Encoding UTF8

Get-ChildItem -Path $Work -Recurse -File |
    Where-Object { $_.Name -ne "SHA256SUMS" } |
    ForEach-Object {
        $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
        "$hash  $($_.FullName.Substring($Work.Length + 1).Replace('\','/'))"
    } | Set-Content -Path (Join-Path $Work "SHA256SUMS") -Encoding ASCII

if (Test-Path $Archive) { Remove-Item -Force $Archive }
tar -czf $Archive -C $OutputDir $BundleName

Write-Host "[offline] bundle ready: $Archive"
