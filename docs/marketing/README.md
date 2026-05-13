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
4. **Screenshots** — capture 2-8 phone screenshots from a real device or Chrome DevTools (9:16, min 320px short side). Recommended flow: dashboard → athletes list → athlete detail → community feed → attendance. Save under `docs/marketing/screenshots/{en,it}/` once captured.
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

## Not in this folder

- **App icons** (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`) — they're in `client/public/icons/` because the PWA needs them at runtime. Don't duplicate; reference from there.
- **Digital Asset Links** — `client/public/.well-known/assetlinks.json` is also in the SPA tree because Cloudflare Pages must serve it at `https://budojo.it/.well-known/assetlinks.json` for the TWA to drop the browser chrome.
- **TWA build artefacts** (`*.aab`, `*.apk`, the `.keystore`) — these live OUTSIDE this repo, in a local Bubblewrap project directory. Convention used by the active workflow: a sibling directory at `$WORKSPACE/budojo-twa/`. The keystore is irreplaceable; back it up to a secret manager BEFORE the first AAB upload to Play Console. See [`twa-keys.md`](./twa-keys.md) § Backup checklist.
