# mobile/ — Budojo's Android shell

The phone app of M12 ([PRD](../docs/specs/m12-mat-app.md), epic #2026). **The screens are not here.** The phone runs Budojo itself (#2034): the client's SPA in its `mobile` build configuration, against Budojo's own server, which this shell runs on the phone. This folder is only the Capacitor shell that packages them as an Android APK.

## Layout

| Path | What |
|---|---|
| `capacitor.config.json` | App id **`it.budojo.mobile`** (permanent: it can never change once a phone has it), name, and `webDir` pointing at `../client/dist/client/browser`. **`allowMixedContent` is on** because the page (`https://localhost`) shows images, athletes' photos and avatars, straight from the server on `http://127.0.0.1`; cleartext is still allowed to that address only. |
| `android/` | The Gradle project Capacitor generated. Committed, as Capacitor intends; `cap sync` copies the web build into it (the copy is gitignored). |
| `android/app/src/main/res/` | The launcher icon and the launch screen draw the brand kit's glyph (`docs/design/brand-kit/`) as vectors: white on the accent for the adaptive and themed icon, the accent on the brand surface for the launch screen. The `mipmap-*/ic_launcher*.png` are only for Android 7, rendered from `icon-square-accent.svg`. |
| `package.json` | Capacitor and its CLI, nothing else |

## Building

```bash
# 1. the web build, in the client container (or `npm ci` + the same command in client/)
docker exec budojo_client sh -c "cd /app && npm run build -- --configuration mobile"
# 2. into the Android project, on the host
cd mobile && npm ci && npx cap sync android
# 3. the APK needs the Android SDK and the release key, so it is built in CI:
#    .github/workflows/mobile-apk.yml, the "📱 Android APK" job, uploads it as an artifact.
```

The dev machine has no Android SDK. The APK is built in CI, where the runner has one.

## PHP on the phone (#2044, #2034)

The phone runs Budojo's own server, as the desktop does with `php.exe`:
- **`php/recipe.env` + `php/build.sh`:** a static PHP 8.4 for arm64, built from source by static-php-cli inside Alpine on CI's arm64 runner. It is cached under the recipe's hash. The extensions mirror the desktop's.
- **The binary travels as `jniLibs/arm64-v8a/libphp.so`,** because the native library directory is the one place Android lets an app execute a file. `useLegacyPackaging` extracts it there.
- **`php/bundle-server.sh`** packs the server with its production vendor, as `release.yml` does, into the APK's assets, with a `bundle.json` naming the bundle. No database and no key travel in the APK.
- **`PhpServerPlugin.java`** is the phone's php-supervisor. Its `start()`:
  - unpacks the bundle when the APK carries a new one;
  - swaps in a database the sync staged (`<db>.staged`, #2030), dropping the old `-wal` and `-shm`;
  - makes the phone's `APP_KEY` and document key on its first start (`secrets.json` in the app's private files, never backed up);
  - runs the migrations, and `budojo:sync-reconcile` after a swap;
  - starts `php -S 127.0.0.1:<port>` with the framework's router, `BUDOJO_RUNTIME=mobile`.
- **The page starts it before Angular boots** (`client/src/app/core/mobile/phone-server.ts`) and shows any failure in full on the screen, the only log anyone can send from a phone.
- **Android kills an app's child processes in the background** (the phantom process killer, Android 12+). The plugin restarts the server when the app comes back to the foreground, on the same port when it is free. A request that finds nobody listening starts it again and is repeated once, at the server's new address if it moved.
- **The app's requests reach its server through Capacitor's native HTTP** (`CapacitorHttp`), which needs no CORS. Its non-GET answers read as text unless they are JSON (see Drive below), which every API answer to a non-GET is. A binary request body, the sync's `PUT /sync/stage`, is proven on a phone by #2046 before the phone relies on it.

### What the phone taught (#2044), and must not be undone

Three things a PHP that runs on Linux does and Android refuses. Each one was found on a real phone, and each is now fixed where the build can check it. **Do not remove any of them because a desktop or Docker test still passes: none of those tests are Android.**
1. **An app executes files only from its native library directory (W^X).** The binary ships as `libphp.so` with `useLegacyPackaging`. Moving it to assets, or to modern packaging, gives *Permission denied* at exec.
2. **OPcache's shared-memory lock is refused** (*Cannot create lock - Permission denied (13)*). OPcache runs `file_cache_only` in the plugin's `php.ini`, with a fallback to no cache that `start()`'s answer reports (`opcache: off`).
3. **The seccomp policy kills a process that calls `accept`,** and allows only `accept4`: exit 159, SIGSYS, at the server's first connection. `php/android-accept4.php` patches PHP's two `accept()` calls to `accept4(…, SOCK_CLOEXEC)`. **The flag is required:** musl's `accept4` with flags 0 falls back to `accept`. `build.sh` greps the patched source, and CI serves a page from every build under a Docker seccomp policy that kills on `accept`. A new PHP version that moves those calls fails the patch script loudly, which is the point.

**This shell is ours on purpose.** #2051 compared it with NativePHP for Mobile and kept it (PRD § 5.1):
- NativePHP's fingerprint and notification plugins are paid;
- its PHP binary is prebuilt in a repository that is not public;
- it keeps Laravel alive between requests, which this server was never audited for.

Calling PHP in-process from this shell is the way out if Android ever stops the server process in a way CI cannot reproduce.

## Google Drive on the phone (#2028)

**`DriveAuthPlugin.java`** wraps Google's `AuthorizationClient` (`play-services-auth`), scope `drive.file`, and only hands out access tokens:
- **`authorize({ interactive: false })` never shows anything.** It rejects with `NEEDS_CONSENT` when Google wants the owner's consent; the page then offers the button that calls it with `true`.
- **Nothing is stored by the app.** Google Play services keeps the grant, and `clearToken` drops a cached token that Drive refused with 401.
- **Google recognises the app by package name and signing certificate.** No client id is in the app, so an APK signed with another key gets `DEVELOPER_ERROR` (10). That is one more reason the release key is the only key.
- **It needs Google Play services,** and `status()` reports whether they are there.

**The Drive calls are made by the page** (`client/src/app/core/sync/drive-remote.ts`), through the WebView's own `fetch`, which Capacitor keeps as `window.CapacitorWebFetch`. **The trade-off, settled in #2029:**
- The WebView's `fetch` is one path for every call, with the browser's semantics. It depends on googleapis.com allowing the WebView's origin (CORS), which Google's APIs do.
- The patched `fetch` takes two paths. A GET goes through Capacitor's local proxy, which hands the bytes back as they came. Any other method goes through native HTTP, whose answer reads as text unless it is JSON (`HttpRequestHandler.readData`), so a binary answer to a POST would arrive damaged.

## Rules

- **Only the release key signs.** `android/app/build.gradle` reads it from `BUDOJO_ANDROID_KEYSTORE` / `BUDOJO_ANDROID_KEYSTORE_PASSWORD` (alias `budojo`, PKCS12), and CI checks the certificate's SHA-256 before uploading. There is no debug-key fallback on purpose: an APK signed with another key never installs over the app, and uninstalling loses the changes a phone has not sent yet. The owner holds the other copy of the key.
- **`versionCode` only grows.** It comes from `-PbudojoVersionCode`: the run number for a CI build today, the release's semver from #2040.
- **No Android backup** (`allowBackup="false"`). The app will hold the sync key and a snapshot of the roster (PRD § 6.7); a new phone pairs again instead.
- **Test on a real phone.** The unit tests live with the screens, in the client's suite. What only a phone can prove (install, update over, storage that survives both, the server coming back after Android killed it) is checked on one, with the count in the PR, as M11 did for the desktop.
