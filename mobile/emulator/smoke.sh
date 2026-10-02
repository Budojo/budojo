#!/usr/bin/env bash
# Opens the APK on the booted emulator, the way the owner would, and keeps a
# photo of every screen it reaches (#2079). The first start unpacks the
# server and runs the migrations, under ARM translation: minutes, not seconds.
#
#   smoke.sh <apk> <folder for the photos>
#
# Each step waits for words the screen must show (Android's accessibility
# tree carries the WebView's text), photographs it, then taps on. A screen
# that never comes is photographed too, with the app's log, and fails the run.
set -uo pipefail

APK="$1"
SHOTS="$2"
ADB="$ANDROID_HOME/platform-tools/adb"
PACKAGE=it.budojo.mobile
mkdir -p "$SHOTS"

shot() { "$ADB" exec-out screencap -p > "$SHOTS/$1.png"; }

screen_xml() {
  "$ADB" shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
  "$ADB" exec-out cat /sdcard/ui.xml
}

# Waits up to $2 seconds for a node whose text or description holds $1.
wait_for() {
  local deadline=$((SECONDS + $2))
  while [ $SECONDS -lt $deadline ]; do
    if screen_xml | grep -q -- "$1"; then
      return 0
    fi
    sleep 3
  done
  return 1
}

# Taps the middle of the first node whose text or description is $1.
tap() {
  local bounds
  bounds=$(screen_xml | tr '>' '\n' | grep -E "(text|content-desc)=\"$1\"" | head -1 | grep -o 'bounds="[^"]*"' | head -1)
  if [ -z "$bounds" ]; then
    echo "::error::nothing to tap called «$1»"
    return 1
  fi
  read -r x1 y1 x2 y2 < <(echo "$bounds" | grep -oE '[0-9]+' | tr '\n' ' ')
  "$ADB" shell input tap $(((x1 + x2) / 2)) $(((y1 + y2) / 2))
}

fail() {
  echo "::error::$1"
  shot "zz-failed"
  screen_xml > "$SHOTS/zz-failed-screen.xml"
  "$ADB" logcat -d > "$SHOTS/logcat.txt" 2>&1
  exit 1
}

"$ADB" install -r "$APK" || fail "the APK did not install"
"$ADB" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 > /dev/null
sleep 10
shot "00-starting"

if ! wait_for "Sign in with Google" 600; then
  if screen_xml | grep -q "did not start"; then
    fail "Budojo did not start: the screen says why (zz-failed.png)"
  fi
  fail "the door never showed «Sign in with Google»"
fi
shot "01-door"

tap "Continue without Google" || fail "no «Continue without Google» on the door"
wait_for "Open your academy account" 120 || fail "«Continue without Google» did not reach the sign-up"
shot "02-sign-up"

echo "the door and the sign-up showed on the emulator; photos in $SHOTS"
