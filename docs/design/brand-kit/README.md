# Budojo — vector logo kit

A consolidation of the brand's locked geometry into clean, standalone SVG variants. **The geometry is locked** — these files are derivatives of `client/public/logo-glyph.svg` and `client/public/wordmark.svg`. Updates must originate upstream; never edit this kit in place.

## Variant matrix

```
budojo-logos/
├── glyph/
│   ├── glyph-dark.svg            stroke #0a0a0b — for light surfaces
│   ├── glyph-light.svg           stroke #ffffff — NEGATIVE for dark surfaces
│   ├── glyph-accent.svg          stroke #5b6cff — brand-accent variant
│   └── glyph-currentColor.svg    stroke="currentColor" — for inline HTML/CSS
├── wordmark/
│   ├── wordmark-dark.svg         glyph stroke + text fill #0a0a0b
│   ├── wordmark-light.svg        glyph stroke + text fill #ffffff (NEGATIVE)
│   └── wordmark-accent.svg       glyph stroke + text fill #5b6cff
├── app-icon/
│   ├── icon-square-dark.svg      64×64, rounded-rect bg #0a0a0b + glyph stroke #5b6cff
│   ├── icon-square-accent.svg    64×64, rounded-rect bg #5b6cff + glyph stroke #ffffff
│   ├── icon-square-light.svg     64×64, rounded-rect bg #f5f5f7 + glyph stroke #0a0a0b
│   └── icon-maskable.svg         192×192 maskable PWA icon (50% safe-zone glyph on solid #5b6cff)
├── favicon/
│   ├── favicon.svg               32×32, dark stroke, bumped widths for small-size crispness
│   └── favicon-light.svg         32×32, white stroke for dark UA themes
└── README.md
```

## Usage

**`glyph-currentColor.svg`** — reach for this whenever the surrounding HTML/CSS already sets `color`. The glyph inherits via `currentColor`, so one file recolors itself across themes, button states, and inverted surfaces. Use the explicit-color variants only when the consuming surface is a static asset (email, image-only embed) or when the tooling can't apply CSS.

**Wordmark vs glyph alone.** Use the wordmark when "Budojo" needs to be readable as a brand — splash screens, marketing, signed-out auth pages, document headers. Use the glyph alone when the surrounding context already names the product — installed PWA tile, in-app top bar next to the page title, favicon, loading state inside the dashboard.

**Maskable icon.** Used **only** as the PWA install icon — referenced from `manifest.webmanifest` with `"purpose": "maskable"`. Every other icon use (app store, marketing, README badge, in-app empty state) is `icon-square-{dark|accent|light}.svg`. The maskable variant has a hard solid background and oversize safe-zone padding because Android adaptive icons crop aggressively; using it elsewhere wastes pixels.

## Brand colors (locked)

| Token         | Hex       | Used for                          |
|---------------|-----------|-----------------------------------|
| Ink dark      | `#0a0a0b` | Default ink on light backgrounds  |
| Surface light | `#f5f5f7` | Light-mode app surface            |
| Accent indigo | `#5b6cff` | Primary brand accent              |
| Pure white    | `#ffffff` | Negative ink on dark backgrounds  |

## Source-of-truth note

The geometry is locked. Updates must originate upstream in `client/public/logo-glyph.svg` and `client/public/wordmark.svg`, never by editing this kit in place. If you need a new variant, regenerate the kit — don't hand-edit one file and let the rest drift.
