# Builds the NeoChat single binary for every supported platform into .\release.
# Requires Node 20+ and Go 1.24+ on the build machine only — the output binary needs nothing.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$version = if ($env:VERSION) { $env:VERSION } else { '1.0.0' }

Write-Host '==> building web client'
Push-Location client
npm ci --no-audit --no-fund; if ($LASTEXITCODE) { exit 1 }
npm run build; if ($LASTEXITCODE) { exit 1 }
Pop-Location

New-Item -ItemType Directory -Force release | Out-Null
$env:CGO_ENABLED = '0'
$env:GOTOOLCHAIN = 'local'
foreach ($t in 'linux/amd64', 'linux/arm64', 'windows/amd64', 'darwin/arm64', 'darwin/amd64') {
  $os, $arch = $t.Split('/')
  $out = "release/neochat-$os-$arch"
  if ($os -eq 'windows') { $out += '.exe' }
  Write-Host "==> $out"
  $env:GOOS = $os; $env:GOARCH = $arch
  Push-Location server
  go build -trimpath -ldflags "-s -w -X main.version=$version" -o "../$out" .
  if ($LASTEXITCODE) { exit 1 }
  Pop-Location
}
Remove-Item Env:GOOS, Env:GOARCH
Get-ChildItem release
