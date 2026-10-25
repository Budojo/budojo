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
  - swaps in a database the sync staged (`<db>.staged`, #2030), or a backup the door brought back with its files (`storage/app.staged`, #2079). `StagedSwap.java` does it, in plain `java.io` so a desktop JDK can put it through every state a start that died halfway leaves:
    - the live database steps aside as `<db>.previous` **with its `-wal`**, which can hold writes the main file does not have yet: it is the copy to go back to. A rebase sets this device's own writes aside at the stage instead, as `<db>.rebase` (#2031);
    - staged files come in only beside a staged database, which commits a stage; files staged alone are an interrupted restore's, and are deleted;
  - makes the phone's `APP_KEY` and document key on its first start (`secrets.json`, sealed by the Keystore as `secrets.json.sealed`, never backed up: see below);
  - runs the migrations, and `budojo:sync-reconcile` after a swap. A `<db>.reconcile` file, written before the rename, keeps it pending until it succeeds, so a start that dies halfway never skips it. A fast-forward and a restore both stage a database today. After a rebase the reconcile replays first: the server's command replays `<db>.rebase`, then sweeps (`docs/sync/protocol.md` § Rebase);
  - starts `php -S 127.0.0.1:<port>` with the framework's router, `BUDOJO_RUNTIME=mobile`;
  - hands PHP and the page a **shell secret**, made at each launch and never written (`BUDOJO_SHELL_SECRET`, in every start's answer). Only the page that holds it opens the owner's session and brings a backup in (`/api/v1/device`, #2079): every other app on the phone reaches `127.0.0.1` too.
- **`restart()`** stops the server and starts it again, so a backup the door just staged is swapped in now (#2079).
- **`adoptKeys()`** takes the academy's two app keys the PC put with the Google account (#2033) into `secrets.json`, keeping the phone's own pair as `secrets.previous.json`, both sealed. They take effect at the next start. The door calls it for the phone's copy of the gym on Drive, never for a gym of the phone's own.
- **The page starts it before Angular boots** (`client/src/app/core/mobile/phone-server.ts`) and shows any failure in full on the screen, the only log anyone can send from a phone.
- **Android kills an app's child processes in the background** (the phantom process killer, Android 12+). Three things bring it back, in `phone-server.ts` and the plugin:
  - **Back in the foreground,** the plugin restarts the server, on the same port when it is free, and the page holds its requests, writes included, until it answers.
  - **Every request goes to the server's current address,** because services keep the one they were built with.
  - **A request that finds nobody listening** starts the server again. A read is then repeated once. A write is not, because no answer cannot tell "never got it" from "saved it and died": it fails with its own error, and the next tap finds the server running.
  - The interceptor sits last in the chain, after the error handling, so a retry that works never shows the offline page.
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

## The keys at rest (#2134)

**`secrets.json`, `secrets.previous.json` and `sync.json` live only sealed,** as `<name>.sealed`:
- **`KeystoreSealer.java`** seals with AES-256-GCM under a key the Android Keystore makes and keeps (`budojo-keys`). The key never enters the app's memory or files. It lives in the phone's secure hardware (the TEE) on nearly every phone, and in the system's keystore process on one without it, the emulator among them. Either way, a copy of the app's files opens nothing. A sealed file is a version byte, the IV, then the ciphertext with its tag. The file's name is bound in, so one sealed file cannot stand in for another.
- **No fingerprint on that key:** the server starts before the page and its lock (#2159), and Android would invalidate a fingerprint-bound key whenever a finger is enrolled.
- **The key is made only while nothing is sealed yet.** A Keystore lookup that fails says nothing of whether the key is there, and generating `budojo-keys` again would replace it, with every file sealed under it. `getKey` throws on such a failure (Android 12+), where `getEntry` answers null.
- **`SealedStore.java`** holds the file states, in plain `java.io` so a desktop JDK can put it through every one, as `StagedSwap` is:
  - an install from before #2134 is migrated at its first read: sealed, read back, and only then is the plain file deleted;
  - a sealed file is written as `.sealed.part` and renamed into place;
  - a plain `.part` the writer before #2134 left is deleted, never taken as keys: the only keys a staged file can hold alone are the academy's, which are on the Google account;
  - **a sealed file that does not open is never replaced nor deleted.** The read fails, the server does not start, and the screen says so. New keys over it would leave the academy's documents unreadable for good, and a Keystore that is only slow to wake must not cost them. Taking the keys back from the Google account in that case is #2162.
- **The emulator job checks it** (`previous-apk.sh`, `smoke.sh`):
  - it installs the newest release older than the build, and gives it a plain `secrets.previous.json` and `sync.json`, as the owner's phone has;
  - it updates over that release, and compares the keys the server runs with before and after, read from its environment as root. It also checks all three files are sealed and that the device id came from the sealed `sync.json`;
  - it installs the APK alone on an empty phone;
  - every pass fails on a key file left in plain text, `.part` included.

## Google Drive on the phone (#2028)

**`DriveAuthPlugin.java`** wraps Google's `AuthorizationClient` (`play-services-auth`), scopes `drive.file` and `drive.appdata` (the academy's keys, #2033), and only hands out access tokens:
- **`authorize({ interactive: false })` never shows anything.** It rejects with `NEEDS_CONSENT` when Google wants the owner's consent; the page then offers the button that calls it with `true`.
- **Nothing is stored by the app.** Google Play services keeps the grant, and `clearToken` drops a cached token that Drive refused with 401.
- **Google recognises the app by package name and signing certificate.** No client id is in the app, so an APK signed with another key gets `DEVELOPER_ERROR` (10). That is one more reason the release key is the only key.
- **It needs Google Play services,** and `status()` reports whether they are there.

**The Drive calls are made by the page** (`client/src/app/core/sync/drive-remote.ts`), through the WebView's own `fetch`, which Capacitor keeps as `window.CapacitorWebFetch`. **The trade-off, settled in #2029:**
- The WebView's `fetch` is one path for every call, with the browser's semantics. It depends on googleapis.com allowing the WebView's origin (CORS), which Google's APIs do.
- The patched `fetch` takes two paths. A GET goes through Capacitor's local proxy, which hands the bytes back as they came. Any other method goes through native HTTP, whose answer reads as text unless it is JSON (`HttpRequestHandler.readData`), so a binary answer to a POST would arrive damaged.

## The fingerprint lock (#2159)

**`AppLockPlugin.java`** shows Android's own biometric prompt (AndroidX `biometric`, free and open source; the ready-made plugins are paid):
- **`unlock({ title })` answers once the prompt is closed, whichever way,** and never rejects on a refusal: `{ unlocked, secure, code?, message? }`. `code` is BiometricPrompt's, and `message` is Android's own words, in the phone's language.
- **Asked in the background, it refuses with `code: 5`** instead of asking: biometric 1.1.0 drops a prompt asked once the activity's state is saved, and the call would never answer.
- **The phone's PIN, pattern or password is the fallback inside the same prompt** (`BIOMETRIC_WEAK | DEVICE_CREDENTIAL`). A phone with no fingerprint gets the screen lock alone.
- **A phone with no screen lock has nothing to check against:** the answer is `unlocked` at once, with `secure: false`.
- **`state()` keeps the facts the rule needs where the page cannot lose or bend them:** `unlocked` since this screen opened, `away`, the longest time in the background since then, and `closed`, a prompt the owner closed without leaving the app.
  - Both outlive a reload of the page; a sync pull reloads it.
  - `away` is `SystemClock.elapsedRealtime()`, counted from `onStop` to `onStart`. Setting the phone's clock back does not move it, and it keeps counting while the phone sleeps.
  - An unlock sets `away` back to 0. Before Android 11 the PIN is its own screen, and the time spent on it is not time away.
  - `closed` is set by a prompt closed (codes 10, 13) with the app on the screen, and cleared by leaving it (`onStop`), by a new prompt, or by an unlock. Since Android 10 a prompt that goes away with the app answers 10 as well; with the activity's state saved, that one is not the owner's.
- **When to ask is the page's rule** (`client/src/app/core/mobile/app-lock.service.ts`):
  - it checks on opening and on every return, and never asks while the app is in the background;
  - five minutes away locks it;
  - after a prompt the owner closed, the cover and its «Sblocca» wait until they press it or leave the app.

  While locked, `app-lock` covers everything. The rest is hidden to a screen reader too, but kept: a form half filled survives it.
- **It guards the screen, not the files.** The keys at rest are #2134. Android's recent-apps preview still shows the last screen: hiding it (`FLAG_SECURE`) would also stop every screenshot, the owner's and the emulator's.
- **The emulator job checks it:** it sets a PIN, closes the prompt with Back (twice: the first only hides the keyboard) and photographs the cover, enters the PIN and reaches the door. Android keeps its PIN screen out of screenshots, so that photo comes out empty.

## Rules

- **Only the release key signs.** `android/app/build.gradle` reads it from `BUDOJO_ANDROID_KEYSTORE` / `BUDOJO_ANDROID_KEYSTORE_PASSWORD` (alias `budojo`, PKCS12), and CI checks the certificate's SHA-256 before uploading. There is no debug-key fallback on purpose: an APK signed with another key never installs over the app, and uninstalling loses the changes a phone has not sent yet. The owner holds the other copy of the key.
- **`versionCode` only grows.** It comes from `-PbudojoVersionCode`: **the built commit's time, in minutes since 1 January 2026** (#2040). One order for every APK, a PR's test build, a beta and a release, so any newer build installs over any older one; a code from the semver would have put a release above every test APK built after it, and Android refuses a lower code. The version *name* is the tag's (`2.78.0`), or `0.0.<run>` for a test build.
- **Every release carries the APK** (#2040): `release.yml` calls `mobile-apk.yml` with the tag on every beta and every stable, and attaches `Budojo-Android-X.Y.Z.apk` once it has opened on the emulator. `installer_tag` rebuilds one for an existing tag.
- **No Android backup and no transfer to a new phone.** `allowBackup="false"` covers Android up to 11. On 12+ it does not stop the device-to-device transfer, so `res/xml/data_extraction_rules.xml` excludes everything from both. The app holds this phone's keys (`secrets.json`), its database and the sync key (`sync.json`), the keys sealed by the Keystore (#2134); a new phone pairs again instead.
- **Every APK meets an Android emulator first** (#2079): the `📱 On an Android emulator` job (`mobile/emulator/`) installs it on Android 14 with a Galaxy A-class screen, opens it, and keeps a photo of each screen it reaches. Look at them before an APK goes to the owner. It cannot sign in to Google: no account is on it. The emulator does not run on the dev PC (it segfaults under KVM there), so CI is where it runs.
- **Test on a real phone.** The unit tests live with the screens, in the client's suite. What only a phone can prove (install, update over, storage that survives both, the server coming back after Android killed it) is checked on one, with the count in the PR, as M11 did for the desktop.
