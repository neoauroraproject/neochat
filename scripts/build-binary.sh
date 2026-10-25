#!/usr/bin/env sh
# Builds the NeoChat single binary for every supported platform into ./release.
# Requires Node 20+ and Go 1.24+ on the build machine only — the output binary needs nothing.
set -eu
cd "$(dirname "$0")/.."
VERSION="${VERSION:-1.0.0}"

echo "==> building web client"
(cd client && npm ci --no-audit --no-fund && npm run build)

mkdir -p release
for target in linux/amd64 linux/arm64 windows/amd64 darwin/arm64 darwin/amd64; do
  os="${target%/*}"; arch="${target#*/}"
  out="release/neochat-${os}-${arch}"
  [ "$os" = windows ] && out="$out.exe"
  echo "==> $out"
  (cd server && CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" GOTOOLCHAIN=local \
    go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o "../$out" .)
done
echo "done: $(ls release)"
