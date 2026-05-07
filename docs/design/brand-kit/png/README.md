# PNG exports — Budojo logos

Rasterized from `budojo-logos/` SVG sources.

## Folder layout

```
exports/png/
├── glyph-{dark|light|accent}/        Square symbol only
├── wordmark-{dark|light|accent}/     "Budojo" + glyph lockup
└── app-icon-{accent|dark|light|maskable}/  Tile icons (no padding)
```

## Naming convention

```
{logo-name}_{size}_{background}.png
```

- **Square logos** (`glyph-*`, `app-icon-*`): size = pixel side (`64`, `128`, `256`, `512`, `1024`)
- **Wordmarks**: size = pixel **height** prefixed with `h` (`h64`, `h128`, `h256`, `h512`); width is auto-derived from the source aspect ratio
- **Background**: `transparent`, `white`, or `black`

Examples:
- `glyph-dark_512_transparent.png` — 512×512 dark glyph, no background
- `wordmark-light_h128_black.png` — wordmark, 128 px tall, on a black tile
- `app-icon-accent_1024_transparent.png` — full-size app tile, no extra background

## Padding

- **Glyph** PNGs ship with **12% padding** on each side so the mark breathes in its tile
- **App icon** PNGs are **edge-to-edge** (the source SVG already has integral padding — adding more would shrink the visible mark)
- **Wordmark** PNGs are also edge-to-edge — the SVG already includes its lockup spacing

## Picking the right asset

| Where | Use |
|---|---|
| Favicon | `glyph-dark_64_transparent.png` (or `glyph-light` on dark UIs) |
| Loading splash, dark UI | `wordmark-light_h256_transparent.png` |
| Slide deck title page | `wordmark-accent_h512_white.png` |
| Marketing tile, app store screenshot | `app-icon-accent_1024_transparent.png` |
| iOS home screen / PWA install | `app-icon-maskable_512_transparent.png` |
| Email signature | `wordmark-dark_h64_white.png` |

## Regenerating

The export is reproducible from the SVG sources — re-run the rasterization script if you change the source vectors.
