#!/usr/bin/env bash
# The APK of the newest stable release older than the commit being built: the
# version the owner's phone runs before this one (#2134). smoke.sh installs it
# first and updates over it, so an update that loses the phone's keys fails
# here, not on the owner's phone.
#
#   previous-apk.sh <folder>
#
# Run in the checkout of the commit being built. Prints the APK's path, or
# nothing when no older release carries one. A lookup or a download that fails
# fails the script: an update check skipped in silence would pass.
#
# Older means a lower versionCode, which is the commit's time (mobile-apk.yml):
# rebuilding an old tag must not pick a newer release, which Android refuses
# to install under it.
set -euo pipefail

DIR="$1"
mkdir -p "$DIR"
building=$(( $(git log -1 --format=%ct) / 60 ))
# Each answer in a variable first: set -e stops at a failed assignment, never
# at a failure inside a for's list or a pipe.
tags=$(gh release list --exclude-pre-releases --limit 10 --json tagName --jq '.[].tagName')
for tag in $tags; do
  committed=$(gh api "repos/$GH_REPO/commits/$tag" --jq '.commit.committer.date')
  [ $(( $(date -d "$committed" +%s) / 60 )) -lt "$building" ] || continue
  assets=$(gh release view "$tag" --json assets --jq '.assets[].name')
  apk=$(printf '%s\n' "$assets" | grep -m1 -E '^Budojo-Android-.*\.apk$' || true)
  [ -n "$apk" ] || continue
  gh release download "$tag" --pattern "$apk" --dir "$DIR" --clobber
  echo "$DIR/$apk"
  exit 0
done
