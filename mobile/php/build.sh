#!/bin/sh
# Builds a static PHP for Android (arm64) from source (#2044).
#
# Runs inside `alpine` on an arm64 host (CI: .github/workflows/mobile-apk.yml):
# Alpine is musl, and static-php-cli links a fully static binary there, which
# Android can execute because it needs no loader and no libc of its own.
#
# Usage: build.sh <output-dir>
set -eu

OUT="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$HERE/recipe.env"

apk add --no-cache bash curl tar xz >/dev/null

WORK="$(mktemp -d)"
cd "$WORK"
curl -fsSL -o spc.tar.gz \
  "https://github.com/crazywhalecc/static-php-cli/releases/download/${SPC_VERSION}/spc-linux-aarch64.tar.gz"
echo "${SPC_SHA256}  spc.tar.gz" | sha256sum -c -
tar xzf spc.tar.gz

./spc doctor --auto-fix
./spc download --with-php="${PHP_VERSION}" --for-extensions="${PHP_EXTENSIONS}"
./spc build "${PHP_EXTENSIONS}" --build-cli

mkdir -p "$OUT"
cp buildroot/bin/php "$OUT/php"
"$OUT/php" -v
"$OUT/php" -m
file "$OUT/php" 2>/dev/null || true
