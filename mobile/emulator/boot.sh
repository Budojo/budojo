#!/usr/bin/env bash
# Boots an Android emulator shaped like a common phone (#2079): Android 14
# with Google APIs, a 1080x2340 screen at 450 dpi, as a Galaxy A-class phone
# has. The owner asked that each APK meet a real Android before it meets them.
#
# Needs KVM (the runner's udev rule) and ANDROID_HOME. The image is x86_64:
# its ARM translation runs the APK's arm64 libphp.so, as an x86 PC cannot run
# an arm64 image.
set -euo pipefail

IMAGE="system-images;android-34;google_apis;x86_64"
AVD=galaxy-a
# Said outright: avdmanager and the emulator otherwise disagree on where the
# device lives (~/.android/avd or ~/.config/.android/avd, by tool version).
export ANDROID_AVD_HOME="$HOME/.android/avd"
mkdir -p "$ANDROID_AVD_HOME"
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"

yes | "$SDKMANAGER" --licenses > /dev/null || true
"$SDKMANAGER" --install "$IMAGE" emulator platform-tools > /dev/null
echo no | "$AVDMANAGER" create avd --force -n "$AVD" -k "$IMAGE" > /dev/null
cat >> "$ANDROID_AVD_HOME/$AVD.avd/config.ini" <<INI
hw.lcd.width=1080
hw.lcd.height=2340
hw.lcd.density=450
hw.ramSize=4096
hw.cpu.ncore=4
hw.keyboard=yes
disk.dataPartition.size=6G
INI

nohup "$ANDROID_HOME/emulator/emulator" -avd "$AVD" -no-window -no-audio -no-boot-anim \
  -no-snapshot -gpu swiftshader_indirect > "$RUNNER_TEMP/emulator.log" 2>&1 &

ADB="$ANDROID_HOME/platform-tools/adb"
timeout 300 "$ADB" wait-for-device
for _ in $(seq 1 120); do
  if [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
    "$ADB" shell settings put global window_animation_scale 0
    "$ADB" shell settings put global transition_animation_scale 0
    "$ADB" shell settings put global animator_duration_scale 0
    echo "booted: $("$ADB" shell getprop ro.build.version.release | tr -d '\r'), $("$ADB" shell wm size | tr -d '\r')"
    exit 0
  fi
  sleep 5
done
echo "::error::the emulator did not finish booting"
tail -50 "$RUNNER_TEMP/emulator.log"
exit 1
