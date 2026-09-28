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

# Android lets an app call accept4 but not accept (android_shims.c). Every
# accept in PHP is wrapped at link time so it goes out as accept4.
#
# The flags reach the CLI's link through configure's LDFLAGS: static-php-cli
# passes SPC_EXTRA_PHP_VARS to configure, and sets the make-time
# EXTRA_LDFLAGS_PROGRAM itself. Its own LDFLAGS is only -L<buildroot>/lib, which
# is kept.
gcc -O2 -c -o "$WORK/android_shims.o" "$HERE/android_shims.c"
export SPC_EXTRA_PHP_VARS="LDFLAGS='-L$WORK/buildroot/lib -Wl,--wrap=accept $WORK/android_shims.o'"

./spc build "${PHP_EXTENSIONS}" --build-cli --no-strip

# Prove the wrap took, before stripping the symbols that show it. A binary that
# still links musl's accept dies on a phone at the first connection.
nm buildroot/bin/php | grep -q ' T __wrap_accept$' || { echo "__wrap_accept is not linked" >&2; exit 1; }
if nm buildroot/bin/php | grep -qE ' [TW] accept$'; then
  echo "musl's accept is still linked: the phone would kill PHP with SIGSYS" >&2
  exit 1
fi
strip buildroot/bin/php

mkdir -p "$OUT"
cp buildroot/bin/php "$OUT/php"
"$OUT/php" -v
"$OUT/php" -m
file "$OUT/php" 2>/dev/null || true
