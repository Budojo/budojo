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

# Android lets an app call accept4 but not accept: android-accept4.php turns
# PHP's two accept() calls into accept4() before configure.
./spc build "${PHP_EXTENSIONS}" --build-cli --no-strip --with-added-patch="$HERE/android-accept4.php"

# Prove the patch is in the source that was compiled: a PHP whose server still
# calls accept() dies on a phone at the first connection.
grep -q 'accept4(server->server_sock' source/php-src/sapi/cli/php_cli_server.c \
  || { echo "the accept4 patch is not in php_cli_server.c" >&2; exit 1; }
grep -q 'accept4(srvsock' source/php-src/main/network.c \
  || { echo "the accept4 patch is not in network.c" >&2; exit 1; }
# For the record: what the binary links. musl's accept may still come in with a
# library that never calls it at run time.
nm buildroot/bin/php 2>/dev/null | grep -E ' (accept|accept4)$' || echo "(no accept symbols listed)"
strip buildroot/bin/php

mkdir -p "$OUT"
cp buildroot/bin/php "$OUT/php"
"$OUT/php" -v
"$OUT/php" -m
file "$OUT/php" 2>/dev/null || true
