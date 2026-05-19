# Marketing assets — Play Store + future stores

Source of truth for everything that ends up on a public app-store listing or marketing surface OUTSIDE the SPA itself. This folder is **not** loaded by Angular — it's pure handoff material for the Play Console (and future Apple App Store) listings.

## Inventory

| File | Purpose | Source / regen |
|---|---|---|
| `play-store-descriptions.md` | Title + short + full description, IT and EN. Copy-paste into Play Console at listing time. | Hand-written; bump when feature set changes materially |
| `feature-graphic.svg` | EN feature graphic source (1024×500) | Hand-authored SVG |
| `feature-graphic-it.svg` | IT feature graphic source | Hand-authored SVG |
| `feature-graphic.png` | EN PNG render for Play Console upload | `magick -density 200 -background none feature-graphic.svg -resize 1024x500 feature-graphic.png` |
| `feature-graphic-it.png` | IT PNG render for Play Console upload | Same command on `-it.svg` |
| `twa-keys.md` | SHA-256 fingerprint registry (upload key, App Signing key, deprecated) + backup checklist | Hand-edited; update after every Bubblewrap key event |
| `twa-manifest.json` | TWA project config — package name, theme, splash, signing-key alias. The "ricetta" for rebuilding the Android wrapper from scratch | Sync from `<workspace>/budojo-twa/twa-manifest.json` after every Bubblewrap update; sanitise `signingKey.path` to `./android.keystore` (relative) |

## Regenerating PNGs

```bash
cd docs/marketing
magick -density 200 -background none feature-graphic.svg    -resize 1024x500 feature-graphic.png
magick -density 200 -background none feature-graphic-it.svg -resize 1024x500 feature-graphic-it.png
```

Requires ImageMagick 7+ (Fedora: `sudo dnf install ImageMagick`). The `-density 200` keeps the strokes crisp without exploding the PNG size.

## Play Console upload checklist (per release)

When uploading a new AAB to the Play Console:

1. **Listing copy** — drop the title / short / full from `play-store-descriptions.md` into Play Console → Main store listing → IT and EN tabs.
2. **App icon** — 512×512 PNG. Re-use `client/public/icons/icon-512.png` (the same icon the PWA installs from).
3. **Feature graphic** — 1024×500 PNG. Upload `feature-graphic.png` (English default locale); if the store offers a per-locale slot, upload `feature-graphic-it.png` for IT.
4. **Screenshots** — regenerate via the Cypress capture spec (#690):
   ```bash
   docker compose up -d client      # if not already running
   cd client && npm run play-store:screenshots
   ```
   Output: 15 PNGs at `docs/marketing/screenshots/play-store/{phone,tablet-7,tablet-10}/` (5 hero screens × 3 viewports) — exactly the Play Console slot dimensions (phone 1080×2400, tablet-7 1080×1440, tablet-10 1600×2560). All deterministic; re-running without an SPA layout change produces zero git diff. Hero screen list + viewport rationale: `client/cypress/marketing/play-store-screenshots.cy.ts`.
5. **Privacy policy URL** — `https://budojo.it/privacy/it` (IT listing) / `https://budojo.it/privacy` (EN listing).
6. **Category** — Sports (primary), Productivity (fallback).
7. **Data safety form** — answers in `play-store-descriptions.md` § "Privacy + data safety".
8. **Content rating questionnaire** — answers in same file § "Content rating".

## Rebuilding the TWA project from scratch

After this repo is cloned to a fresh machine (e.g. new dev box, recovering after a disk loss), the Bubblewrap project directory does not exist locally — only `twa-manifest.json` and the SHA registry live in the repo. To rebuild, set two shell variables for the paths, then run the procedure:

```bash
# Set these for your machine:
WORKSPACE="$HOME/PhpstormProjects"            # parent dir for both repos
BUDOJO_REPO="$WORKSPACE/budojo"               # this repo's clone
TWA_DIR="$WORKSPACE/budojo-twa"               # sibling for the TWA build artefacts

# 1. Restore the upload keystore from the secret manager (1Password attachment)
#    and save it as $TWA_DIR/android.keystore — the manifest in this repo
#    references it as a relative path './android.keystore'.

mkdir -p "$TWA_DIR" && cd "$TWA_DIR"
cp "$BUDOJO_REPO/docs/marketing/twa-manifest.json" .
# restore android.keystore here from 1Password attachment

# 2. Regenerate the Android project from the manifest.
bubblewrap update

# 3. Build the AAB + APK.
bubblewrap build
# prompts for keystore + alias passwords (also in 1Password)
```

> **Why a sibling directory and not `<repo>/mobile-android/`** (the older convention floated in [`docs/mobile/twa-runbook.md`](../mobile/twa-runbook.md)): keeping Bubblewrap's project tree OUTSIDE this repo means the generated Android sources, build outputs (~100MB), and the keystore can't accidentally land in a commit. The runbook predates this convention; treat the marketing-folder workflow as current.

When `twa-manifest.json` changes (most commonly: `appVersionCode` + `appVersionName` bump for a new release), edit the **repo copy** (`docs/marketing/twa-manifest.json`) first, then copy it back into `$TWA_DIR` and re-run `bubblewrap update` + `bubblewrap build`. This keeps the version-controlled config as the source of truth.

### Android 13+ POST_NOTIFICATIONS — keep Bubblewrap fresh (#845)

Starting with Android 13 (API 33), notifications require a **runtime** `POST_NOTIFICATIONS` permission in addition to Chrome's per-site "Allow notifications" toggle. The TWA wrapper is the entity that must request it; without that prompt, the user grants notifications inside Chrome but the OS still blocks delivery to the wrapper — `pushManager.subscribe()` either rejects or returns a subscription the OS will never surface, so the SPA's subscribe call silently never persists a row in `push_subscriptions` server-side.

The fix is **NOT a manifest change** — `"enableNotifications": true` already enables notification delegation (the field is the delegation flag, despite the name). The fix is to **always build with a recent Bubblewrap CLI**: Bubblewrap from `1.10.0` onward adds `<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>` to the generated `AndroidManifest.xml` and triggers the runtime prompt at first launch. Older Bubblewraps (the ones around when this repo's first APK was built — `appVersionCode: 2`) don't, and the resulting APK is stuck.

**Rule of thumb** before every TWA rebuild:

```bash
npm install -g @bubblewrap/cli@latest
bubblewrap --version          # check it's ≥ 1.10
cd "$TWA_DIR"
cp "$BUDOJO_REPO/docs/marketing/twa-manifest.json" .
bubblewrap update
bubblewrap build              # signs with the same upload key — keystore + alias must match
```

Then bump `appVersionCode` in `twa-manifest.json` (this repo) so Play Console accepts the upgrade. The user has to **uninstall and reinstall** the APK side-loaded for testing — Play Store upgrades preserve the prior permission state, which is what we want for end-users, but for a side-loaded test on the same package id you may need a clean install to see the runtime prompt re-trigger.

If you've done the rebuild + reinstall and the user STILL doesn't see notifications:

1. Settings → Apps → Budojo → Notifications — the per-app toggle MUST be ON. Granting via Chrome's web prompt only sets the per-site permission; Android's per-app permission is separate post-13.
2. `ssh budojo-prod 'cd /home/forge/api.budojo.it/current/server && php artisan tinker --execute="echo App\\Models\\User::find(<id>)->pushSubscriptions()->count();"'` — must be ≥ 1 after the user taps "Abilita notifiche" in the SPA. If still 0, the subscribe is still failing client-side; check Chrome devtools' `Application → Push Messaging` on a desktop install of the SPA to compare.
3. `tail -n 200 storage/logs/laravel.log | grep "TestPushNotification dispatch threw"` on prod — when the subscription IS persisted but delivery fails, this is where the VAPID / endpoint diagnostics land.

## Not in this folder

- **App icons** (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`) — they're in `client/public/icons/` because the PWA needs them at runtime. Don't duplicate; reference from there.
- **Digital Asset Links** — `client/public/.well-known/assetlinks.json` is also in the SPA tree because Cloudflare Pages must serve it at `https://budojo.it/.well-known/assetlinks.json` for the TWA to drop the browser chrome.
- **TWA build artefacts** (`*.aab`, `*.apk`, the `.keystore`) — these live OUTSIDE this repo, in a local Bubblewrap project directory. Convention used by the active workflow: a sibling directory at `$WORKSPACE/budojo-twa/`. The keystore is irreplaceable; back it up to a secret manager BEFORE the first AAB upload to Play Console. See [`twa-keys.md`](./twa-keys.md) § Backup checklist.
