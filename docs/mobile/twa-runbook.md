# TWA Android — first APK runbook (M9)

End-to-end procedure for generating the first signed Budojo APK via the Trusted Web Activity (TWA) wrapper. Goal: a sideloadable APK on your laptop, then a Play Store internal-testing track.

This runbook is the **executable companion** to milestone M9's issues — each section maps to one or more `/Budojo/budojo/issues` ticket. Steps that need interactive input (passwords, signing keys, Play Console UI) are marked **(manual)**; everything else is shell-friendly.

> **Why TWA**: zero rewrite. The existing PWA loads inside a Chrome Custom Tab, the user sees a fullscreen Android app with no URL bar, the codebase stays single. Capacitor (M10) opens up iOS + native plugins later — TWA is the cheapest first rung.

---

## Prerequisites — install once

| Tool | Why | Install |
|------|-----|---------|
| **JDK 17** | Bubblewrap + Gradle build the Android shell | `brew install openjdk@17` (macOS) or `sudo apt install openjdk-17-jdk` (Linux) |
| **Android SDK + cmdline-tools** | Bubblewrap shells out to `apksigner`, `bundletool`, etc. | Easiest path is Android Studio (https://developer.android.com/studio) — installs the SDK + emulator. Or `brew install --cask android-commandlinetools` for a leaner install. |
| **Node 22+** | Bubblewrap CLI is npm-based | already installed via the project's `engines.node` |
| **Bubblewrap CLI** | The TWA scaffold + build wrapper | `npm install -g @bubblewrap/cli` |

Verify:

```bash
bubblewrap doctor
```

Should report **all green** before continuing. Common gotchas:

- `JAVA_HOME` not exported: add `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` to your shell rc.
- Android SDK not detected: set `ANDROID_HOME` to the SDK root (where `platform-tools/` lives).

---

## Step 1 — Generate the signing keystore (issue #502)

**(manual — keep the passwords in a password manager, NOT in this repo)**

The keystore signs every release of the app, FOREVER. Losing it means we can't update the app — only re-publish as a new app. Treat it like a production database password.

```bash
keytool -genkeypair \
  -alias budojo-release \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -keystore ~/secure/budojo-release.keystore
```

`keytool` prompts for:

- **Keystore password** — store in 1Password / Bitwarden under "Budojo Android signing"
- **Alias password** — same as keystore password is fine for a one-app keystore
- **Distinguished name** — `CN=Budojo, OU=Mobile, O=Budojo, L=Torino, ST=Piemonte, C=IT` is sensible. Doesn't need to be precise; doesn't change once set.

**Backup the keystore.** Two copies, separate locations, encrypted:

- Primary: 1Password file attachment.
- Secondary: encrypted USB drive in a drawer.

**Extract the SHA-256 fingerprint** (needed for the static `assetlinks.json` file):

```bash
keytool -list -v \
  -keystore ~/secure/budojo-release.keystore \
  -alias budojo-release | grep "SHA256:" | head -1
```

Output looks like `SHA256: AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99`.

Copy the fingerprint value (everything after `SHA256: `) into the static **`client/public/.well-known/assetlinks.json`** in this repo:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "it.budojo.app",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"
      ]
    }
  }
]
```

Open a PR with the change, squash-merge to `develop`, and the standard release pipeline ships it to **Cloudflare Pages** — the SPA origin serves the file directly at `/.well-known/assetlinks.json`. No backend route, no env var, no container restart (#522 retired the Laravel-routed implementation in v2.3.1 because session/CSRF middleware was breaking the unauthenticated Digital Asset Links fetch).

Verify by curl after the deploy completes:

```bash
curl -i https://app.budojo.it/.well-known/assetlinks.json
```

Should return `200 application/json` with the canonical statement above. If a fingerprint is missing, edit the JSON file and re-ship — that's the entire workflow.

---

## Step 2 — Initialize the Bubblewrap project (issue #504)

**(non-interactive after the prompt round)**

From the repo root:

```bash
mkdir -p mobile-android
cd mobile-android
bubblewrap init --manifest=https://app.budojo.it/manifest.webmanifest
```

Bubblewrap reads the live manifest, prompts for a few values:

- **Domain** — confirm `app.budojo.it` (or whatever the prod host is)
- **Application ID (package name)** — `it.budojo.app` — MUST match the `package_name` in `client/public/.well-known/assetlinks.json`
- **App name** — `Budojo`
- **Display mode** — pick `standalone` (matches manifest)
- **Orientation** — pick `portrait` (matches manifest)
- **Status bar / nav bar colors** — accept defaults (reads from manifest's `theme_color` / `background_color`)
- **Start URL** — confirm `/dashboard/athletes`
- **Icon URL** — confirm the PWA's 512px icon
- **Splash color** — accept default
- **Use Chrome OS / WearOS / Tablet support** — `n` for all (mobile-first scope)
- **Signing key** — point at `~/secure/budojo-release.keystore` from Step 1, alias `budojo-release`

After init, Bubblewrap creates:

```
mobile-android/
├── twa-manifest.json   # the canonical config — commit this
├── app/
│   ├── build.gradle
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── res/   # auto-generated icons + splash
├── build.gradle
├── settings.gradle
└── gradle/         # gradle wrapper
```

Add a `.gitignore` to keep the keystore out and the gradle cache out:

```bash
cat > mobile-android/.gitignore <<'EOF'
# Build outputs
app/build/
build/
.gradle/

# Signing — these stay in the user's secrets, not in the repo
*.keystore
*.jks
android.keystore
keystore.properties
EOF
```

Commit `twa-manifest.json` + `.gitignore` + the generated Android project skeleton; everything else gets generated on demand.

---

## Step 3 — Build the signed APK (issue #505)

```bash
cd mobile-android
bubblewrap build --mode=release --skipPwaValidation
```

`--mode=release` produces the signed release-build artefacts — issue #505 acceptance criterion (the debug-mode `.apk` Bubblewrap defaults to without this flag is signed with the dev debug keystore and Play Store would reject it). `--skipPwaValidation` skips the manifest fetch (we already validated in Step 2). Bubblewrap shells out to Gradle, prompts for the keystore + alias passwords, produces:

```
mobile-android/app/build/outputs/apk/release/app-release.apk
mobile-android/app/build/outputs/bundle/release/app-release.aab
```

The `.aab` (Android App Bundle) is what Play Store wants. The `.apk` is what you sideload for local testing.

Verify the signature:

```bash
$ANDROID_HOME/build-tools/$(ls $ANDROID_HOME/build-tools | sort -V | tail -1)/apksigner verify \
  --verbose \
  app/build/outputs/apk/release/app-release.apk
```

Should report:
- `Verifies` (no errors)
- `Verified using v1 / v2 / v3` schemes
- No unknown warnings

---

## Step 4 — Sideload to a physical Android (issue #506)

**(manual — needs a device + USB cable + Developer Mode enabled)**

On the device:

1. Settings → About phone → tap "Build number" 7 times to unlock Developer Mode.
2. Settings → System → Developer options → enable "USB debugging".
3. Plug the device into the laptop. The device shows a "Trust this computer?" prompt — accept.

On the laptop:

```bash
adb devices
# Should list the connected device.

adb install mobile-android/app/build/outputs/apk/release/app-release.apk
```

Launch the installed app from the launcher. Should open fullscreen (no URL bar). If the URL bar IS visible:

```bash
adb logcat | grep -i "digital_asset"
```

Will show why asset-links failed. Common causes:

- The fingerprint in `client/public/.well-known/assetlinks.json` doesn't match the keystore's fingerprint (typo, wrong alias, or the JSON change wasn't deployed yet — Cloudflare Pages takes a minute or two after merge).
- The package name in `mobile-android/twa-manifest.json` doesn't match the `package_name` in `assetlinks.json`.

Run the **golden-path manual smoke**:

| Step | Expected |
|------|----------|
| Splash → login form | Splash uses brand glyph, no jank |
| Login with admin account | Lands on `/dashboard/athletes` |
| Tap an athlete | Detail loads, Edit tab is leftmost |
| Tap Edit pencil on an athlete row | Form opens inline |
| Cancel back | Returns to detail without losing scroll |
| Sign out | Returns to login |
| Switch app, back to Budojo | State preserved, no full reload |

Bug findings → file as separate issues, NOT inline in this runbook.

---

## Step 5 — Play Console internal testing (issues #508, #509, #510, #511)

After the manual smoke is clean, the rest is Play Console UI work:

1. Create the Google Play Console developer account if not already there (one-time €25 fee, identity verification can take 24–48h).
2. Inside the console, "Create app" → name "Budojo", default locale `en-IT`, type "App" (not "Game"), pricing "Free" (paid-vs-free is the pricing question, not a category — Play asks both). The **app category** (Productivity / Sports / Business) is set later in the listing-copy step.
3. Set the package name to **exactly** `it.budojo.app` (cannot be changed later — must equal the `package_name` in `client/public/.well-known/assetlinks.json` and the `applicationId` in the Bubblewrap project).
4. Enroll in **Play App Signing**. Google generates a production signing key; we keep our keystore as the upload key. Two fingerprints exist now — append the SECOND one to the `sha256_cert_fingerprints` array in `client/public/.well-known/assetlinks.json`:

   ```json
   "sha256_cert_fingerprints": [
     "<upload-key-fingerprint>",
     "<play-managed-key-fingerprint>"
   ]
   ```

   Open a PR with the JSON change, squash-merge to `develop`, and Cloudflare Pages picks up the new fingerprint on the next deploy.

5. Upload `app-release.aab` to the **Internal testing** track.
6. Add tester emails (your Google account + 3-10 trusted gym owners). Send the opt-in link.
7. Fill the listing copy + screenshots from issue #509 (skip the production track until that work is done — Play allows internal testing without the full listing).
8. After 3-5 days of internal feedback, promote to Production track with **staged rollout**: 1% on day 0, 10% on day 3, 100% on day 7 (issue #511).

---

## Operating principles

- **Never check the keystore into git.** It's in `mobile-android/.gitignore`. Verify with `git status` before every commit in `mobile-android/`.
- **Edits to `client/public/.well-known/assetlinks.json` ship through the standard PR pipeline.** The file is committed to the repo and served as a static asset by Cloudflare Pages — no backend route, no env var, no container restart. After the develop deploy completes, verify by curling `https://app.budojo.it/.well-known/assetlinks.json` and checking the new fingerprint is present. (#522 retired the env-driven Laravel route in v2.3.1 because session/CSRF middleware was breaking the unauthenticated Digital Asset Links fetch — keep this file static, never re-introduce a backend route for it.)
- **Update `mobile-android/twa-manifest.json` then re-run `bubblewrap update`** when the PWA manifest changes (e.g. a new `start_url`, new icons, new shortcuts). Don't hand-edit the generated Gradle files; re-run instead.
- **Version-bump the Android shell separately from the web app version.** `twa-manifest.json` has `appVersionCode` (integer, monotonic) + `appVersionName` (string, follows the web `vX.Y.Z`). Bump both on every Play Store upload.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| URL bar visible after install | Asset-links didn't validate | Check `/.well-known/assetlinks.json` returns the correct fingerprint; check `adb logcat` for the verification error |
| `bubblewrap doctor` complains JDK | Wrong JDK version | Set `JAVA_HOME` to JDK 17 — newer versions cause Gradle plugin mismatches |
| Build fails with "package not found" | Android SDK not detected | Set `ANDROID_HOME` and add `$ANDROID_HOME/cmdline-tools/latest/bin` to `PATH` |
| Play Store rejects upload | Signing scheme mismatch | Re-run `apksigner verify --verbose` locally; the most common issue is missing v2 signature on older builds |
| Splash flashes white before brand glyph | Missing `theme_color` in manifest | Already set — should not happen on Budojo |

## References

- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli)
- [TWA Quick Start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start/)
- [Digital Asset Links spec](https://developers.google.com/digital-asset-links/v1/getting-started)
- [Play Console developer help](https://support.google.com/googleplay/android-developer/)
- M9 milestone: https://github.com/Budojo/budojo/milestone/8
