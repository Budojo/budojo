#!/usr/bin/env bash
# Opens the APK on the booted emulator, the way the owner would, and keeps a
# photo of every screen it reaches (#2079): the lock (#2159), the door, the
# sign-up. The first start unpacks the server and runs the migrations, under
# ARM translation: minutes, not seconds.
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

# Taps the middle of the first node whose text or description is $1. A
# button's text can lead with its icon's glyph and a space («\uE96A Unlock»),
# so anything but a letter or a digit may come first.
tap() {
  local bounds
  bounds=$(screen_xml | tr '>' '\n' | grep -E "(text|content-desc)=\"[^[:alnum:]\"]*$1\"" | head -1 | grep -o 'bounds="[^"]*"' | head -1)
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

# The fingerprint lock (#2159) asks on opening. This phone gets a PIN, as the
# owner's has one, and no fingerprint: the prompt is then the PIN alone. The
# screen stays on, or the PIN would lock the phone itself during the long
# first start.
PIN=2159
"$ADB" shell svc power stayon true
"$ADB" shell locksettings set-pin "$PIN" > /dev/null || fail "the phone's PIN could not be set"

"$ADB" install -r "$APK" || fail "the APK did not install"
"$ADB" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 > /dev/null
sleep 10
shot "00-starting"

if ! wait_for "Unlock Budojo" 600; then
  if screen_xml | grep -q "did not start"; then
    fail "Budojo did not start: the screen says why (zz-failed.png)"
  fi
  fail "the lock never asked «Unlock Budojo» on opening"
fi
# Android may keep a PIN screen out of screenshots: this photo can be black.
shot "01-lock-prompt"

# Closed without the PIN, the app stays covered, with a way to ask again.
# Android 14's PIN screen took no notice of one Back on this emulator (#2159):
# Back goes again only while the prompt is still up, never to the app itself.
for _ in 1 2 3; do
  screen_xml | grep -q "Unlock Budojo" || break
  "$ADB" shell input keyevent KEYCODE_BACK
  sleep 5
done
if wait_for "Budojo is locked" 30; then
  shot "02-locked"
  tap "Unlock" || fail "no «Unlock» on the lock's cover"
  wait_for "Unlock Budojo" 30 || fail "«Unlock» did not ask again"
else
  # The cover and its button are Cypress's to prove (app-lock.cy.ts); what only
  # a phone proves is that its own PIN opens Budojo.
  echo "::warning::Back did not close Android's PIN screen: the cover was not photographed"
fi
"$ADB" shell input text "$PIN"
"$ADB" shell input keyevent KEYCODE_ENTER

wait_for "Sign in with Google" 120 || fail "the PIN did not open the door"
shot "03-door"

tap "Continue without Google" || fail "no «Continue without Google» on the door"
wait_for "Open your academy account" 120 || fail "«Continue without Google» did not reach the sign-up"
shot "04-sign-up"

echo "the lock, the door and the sign-up showed on the emulator; photos in $SHOTS"
