# mobile/ — the mat app's Android shell

The phone app of M12 ([PRD](../docs/specs/m12-mat-app.md), epic #2026). **The screens are not here.** They are the client's second Angular application, `client/projects/mat`, which shares the desktop SPA's theme, translations and components. This folder is only the Capacitor shell that packages that build as an Android APK.

## Layout

| Path | What |
|---|---|
| `capacitor.config.json` | App id **`it.budojo.mobile`** (permanent: it can never change once a phone has it), name, and `webDir` pointing at `../client/dist/mat/browser` |
| `android/` | The Gradle project Capacitor generated. Committed, as Capacitor intends; `cap sync` copies the web build into it (the copy is gitignored). |
| `package.json` | Capacitor and its CLI, nothing else |

## Building

```bash
# 1. the web build, in the client container (or `npm ci` + `npx ng build mat` in client/)
docker exec budojo_client sh -c "cd /app && npx ng build mat"
# 2. into the Android project, on the host
cd mobile && npm ci && npx cap sync android
# 3. the APK needs the Android SDK and the release key, so it is built in CI:
#    .github/workflows/mobile-apk.yml, the "📱 Android APK" job, uploads it as an artifact.
```

The dev machine has no Android SDK. The APK is built in CI, where the runner has one.

## PHP on the phone (#2044, spike)

The phone runs Budojo's own server, as the desktop does with `php.exe`:
- **`php/recipe.env` + `php/build.sh`:** a static PHP 8.4 for arm64, built from source by static-php-cli inside Alpine on CI's arm64 runner. It is cached under the recipe's hash. The extensions mirror the desktop's.
- **The binary travels as `jniLibs/arm64-v8a/libphp.so`,** because the native library directory is the one place Android lets an app execute a file. `useLegacyPackaging` extracts it there.
- **`php/bundle-server.sh`** packs the server with its production vendor, as `release.yml` does, into the APK's assets. For the spike it adds a seeded demo academy and its throwaway login.
- **`PhpServerPlugin.java`** unpacks the bundle, runs the migrations, starts `php -S 127.0.0.1:<port>` with the framework's router, and times each step. Cleartext is allowed to `127.0.0.1` only (`network_security_config.xml`).

## Rules

- **Only the release key signs.** `android/app/build.gradle` reads it from `BUDOJO_ANDROID_KEYSTORE` / `BUDOJO_ANDROID_KEYSTORE_PASSWORD` (alias `budojo`, PKCS12), and CI checks the certificate's SHA-256 before uploading. There is no debug-key fallback on purpose: an APK signed with another key never installs over the app, and uninstalling loses the changes a phone has not sent yet. The owner holds the other copy of the key.
- **`versionCode` only grows.** It comes from `-PbudojoVersionCode`: the run number for a spike build today, the release's semver from #2040.
- **No Android backup** (`allowBackup="false"`). The app will hold the sync key and a snapshot of the roster (PRD § 6.7); a new phone pairs again instead.
- **Test on a real phone.** The unit tests live with the screens in `client/projects/mat` (`npx ng test mat`). What only a phone can prove (install, update over, storage that survives both) is checked on one, with the count in the PR, as M11 did for the desktop.
