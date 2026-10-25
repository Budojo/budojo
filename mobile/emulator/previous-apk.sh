#!/usr/bin/env bash
# The APK of the newest stable release that carries one, other than the tag
# being built: the version the owner's phone runs before this one (#2134).
# smoke.sh installs it first and updates over it, so an update that loses the
# phone's keys fails here, not on the owner's phone.
#
#   previous-apk.sh <folder> [tag being built]
#
# Prints the APK's path, or nothing when no release has one yet.
set -euo pipefail

DIR="$1"
BUILDING="${2:-}"
mkdir -p "$DIR"
for tag in $(gh release list --exclude-pre-releases --limit 5 --json tagName --jq '.[].tagName'); do
  [ "$tag" = "$BUILDING" ] && continue
  if gh release download "$tag" --pattern 'Budojo-Android-*.apk' --dir "$DIR" --clobber 2> /dev/null; then
    ls "$DIR"/Budojo-Android-*.apk | head -1
    exit 0
  fi
done
