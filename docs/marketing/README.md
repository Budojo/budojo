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

## Not in this folder

- **App icons** (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`) — they're in `client/public/icons/` because the PWA needs them at runtime. Don't duplicate; reference from there.
- **Digital Asset Links** — `client/public/.well-known/assetlinks.json` is also in the SPA tree because Cloudflare Pages must serve it at `https://budojo.it/.well-known/assetlinks.json` for the TWA to drop the browser chrome.
- **TWA build artefacts** (`*.aab`, `*.apk`, the `.keystore`) — these live OUTSIDE the repo, under `~/PhpstormProjects/budojo-twa/`. The keystore is irreplaceable; back it up to a password manager BEFORE the first AAB upload to Play Console.
