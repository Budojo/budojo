#!/usr/bin/env bash
# Opens the APK on the booted emulator, the way the owner would, and keeps a
# photo of every screen it reaches (#2079): the lock (#2159), the door, the
# sign-up. The first start unpacks the server and runs the migrations, under
# ARM translation: minutes, not seconds.
#
#   smoke.sh <apk> <folder for the photos> [the previous release's apk]
#
# Given the previous release, it installs that first and updates over it, as
# the owner's phone does, and checks the server keeps the same keys across the
# update, sealed by the Keystore (#2134). Then it installs the APK alone, on
# an empty phone, and checks the keys it makes are sealed from the start.
#
# Each step waits for words the screen must show (Android's accessibility
# tree carries the WebView's text), photographs it, then taps on. A screen
# that never comes is photographed too, with the app's log, and fails the run.
set -uo pipefail

APK="$1"
SHOTS="$2"
PREVIOUS="${3:-}"
ADB="$ANDROID_HOME/platform-tools/adb"
PACKAGE=it.budojo.mobile
FILES="/data/data/$PACKAGE/files"
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

# The keys the running server was started with, as a short hash: never the
# keys themselves in a log. Read from its environment, as root.
server_env() {
  local pid
  pid=$("$ADB" shell ps -A -o PID,ARGS | grep libphp.so | grep -- '-S 127.0.0.1' | grep -v -- ' -t ' | awk '{print $1}' | head -1)
  [ -n "$pid" ] || return 1
  "$ADB" shell cat "/proc/$pid/environ" | tr '\0' '\n'
}

server_keys() {
  local keys
  keys=$(server_env | grep -E '^(APP_KEY|DOCUMENT_ENCRYPTION_KEY)=.' | sort)
  # Both, or no answer: the hash of nothing would match itself across the update.
  [ "$(printf '%s\n' "$keys" | grep -c .)" = 2 ] || return 1
  printf '%s' "$keys" | sha256sum | cut -c1-16
}

app_files() { "$ADB" shell ls "$FILES" | tr -d '\r'; }

# A key file in plain text, as a release before #2134 kept it, owned as the
# app owns its own: its user, mode and SELinux label, copied from secrets.json.
plain_key_file() {
  local ref="$FILES/secrets.json" file="$FILES/$1"
  printf '%s' "$2" | "$ADB" shell "cat > $file"
  "$ADB" shell "chown \$(stat -c %u:%g $ref) $file && chmod \$(stat -c %a $ref) $file && chcon \$(ls -Z $ref | cut -d' ' -f1) $file"
}

# No key file left in plain text, nor a plain one a write staged (.part).
no_plain_keys() {
  if grep -qxE '(secrets|secrets\.previous|sync)\.json(\.part)?' "$1"; then
    fail "a key file is still in plain text: $(grep -xE '(secrets|secrets\.previous|sync)\.json(\.part)?' "$1" | tr '\n' ' ')"
  fi
}

launch() { "$ADB" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 > /dev/null; }

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

# Root, to read the app's private files and its server's environment: the
# emulator's Google APIs image allows it, as no owner's phone does.
"$ADB" root > /dev/null
"$ADB" wait-for-device

if [ -n "$PREVIOUS" ]; then
  "$ADB" install "$PREVIOUS" || fail "the previous release's APK did not install"
  launch
  # A release from before the lock (#2159) opens on the door; a later one on its prompt.
  wait_for "Sign in with Google\|Unlock Budojo" 600 || fail "the previous release never opened"
  shot "00-previous"
  BEFORE=$(server_keys) || fail "the previous release runs no server"
  # The owner's phone also holds the pair it made before adopting the
  # academy's, and its place in the sync: both in plain text until #2134.
  PREVIOUS_KEYS=$("$ADB" shell cat "$FILES/secrets.json" | tr -d '\r')
  plain_key_file secrets.previous.json "$PREVIOUS_KEYS" || fail "could not place secrets.previous.json"
  plain_key_file sync.json '{"v":1,"device":"phoneci01","folder":"0123456789abcdef0123456789abcdef","syncKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}' \
    || fail "could not place sync.json"
  app_files > "$SHOTS/files-previous.txt"
fi

"$ADB" install -r "$APK" || fail "the APK did not install"
launch
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

# The keys are sealed by the Keystore (#2134): none is left in plain text, and
# an update keeps the ones the phone had.
app_files > "$SHOTS/files.txt"
grep -qx 'secrets.json.sealed' "$SHOTS/files.txt" || fail "no sealed keys in the app's files"
no_plain_keys "$SHOTS/files.txt"
if [ -n "$PREVIOUS" ]; then
  for sealed in secrets.previous.json.sealed sync.json.sealed; do
    grep -qx "$sealed" "$SHOTS/files.txt" || fail "the update did not seal ${sealed%.sealed}"
  done
  AFTER=$(server_keys) || fail "no server runs after the update"
  [ "$BEFORE" = "$AFTER" ] || fail "the update changed the phone's keys ($BEFORE, then $AFTER)"
  # The sealed sync.json opened: the server journals under its device id.
  server_env | grep -qx 'BUDOJO_DEVICE_ID=phoneci01' || fail "the server did not get its device id from the sealed sync.json"
  echo "the update kept the phone's keys ($AFTER) and its place in the sync, all three sealed"
fi

tap "Continue without Google" || fail "no «Continue without Google» on the door"
wait_for "Open your academy account" 120 || fail "«Continue without Google» did not reach the sign-up"
shot "04-sign-up"

# A fresh install, on an empty phone: nothing to migrate, and the keys it
# makes are sealed from the start (#2134).
"$ADB" uninstall "$PACKAGE" > /dev/null || fail "the app did not uninstall"
"$ADB" install "$APK" || fail "the APK did not install on an empty phone"
launch
wait_for "Unlock Budojo" 600 || fail "a fresh install never asked «Unlock Budojo»"
"$ADB" shell input text "$PIN"
"$ADB" shell input keyevent KEYCODE_ENTER
wait_for "Sign in with Google" 120 || fail "the PIN did not open a fresh install's door"
shot "05-fresh-door"
app_files > "$SHOTS/files-fresh.txt"
grep -qx 'secrets.json.sealed' "$SHOTS/files-fresh.txt" || fail "a fresh install did not seal its keys"
no_plain_keys "$SHOTS/files-fresh.txt"

echo "the lock, the door and the sign-up showed on the emulator, updated and fresh; photos in $SHOTS"
