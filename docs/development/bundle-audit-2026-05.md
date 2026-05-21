# Initial Angular chunk audit — 2026-05-21

Reference baseline for #877. Re-run with `docker exec budojo_client sh -c 'cd /app && npm run build'` and compare against this snapshot whenever the initial bundle warning fires.

## Build snapshot

**Initial total: 1.00 MB raw / 234 kB transfer (gzipped)** — 502 kB over the 500 kB raw-size warning budget. The 1.25 MB error budget set by v2.22.1 is still respected (~250 kB headroom).

Top initial chunks (raw size):

| Chunk | Size | Probable content |
|-------|------|------------------|
| `main-*.js` | 314 kB | Angular root component + bootstrap + `app.config.ts` providers (router, interceptors, MessageService, providePrimeNG, provideTranslateService, provideServiceWorker, bundled i18n JSONs) |
| `chunk-FQYFVZ37.js` | 183 kB | Angular core/runtime + RxJS subset |
| `chunk-NOYL2UUK.js` | 97 kB | PrimeNG shared runtime (theme tokens, base directives) |
| `chunk-55675SIY.js` | 65 kB | Other shared vendors (ngx-translate, primeflex) |
| `chunk-VZDSGT3N.js` | 59 kB | Likely `@primeuix/themes/material` preset |
| `styles-*.css` | 45 kB / 7 kB transfer | Global styles + Inter font face + PrimeNG @layer |

The "main" chunk is dominated by:
- `app.config.ts` providers (the import of `Material` preset + the bundled EN+IT translation JSONs are ~24 kB and ~25 kB after the trimming in #273).
- The dashboard shell (`features/dashboard/dashboard.component`) — pulls in the topbar (search palette, notification bell), the sidebar, the swipe-to-close gesture handlers.

## What's already lazy (good news)

All 61 feature routes use `loadComponent` — every page-level component lives in its own chunk. The dashboard shell does NOT pull in any feature-page module eagerly.

Notable per-feature lazy chunks:

| Feature chunk | Raw | Notes |
|---------------|-----|-------|
| `documents-list-component` | 69 kB | PrimeNG Table + Multiselect + File upload heavy |
| `my-feed-component` | 57 kB | Composer + reaction chip + comments thread |
| `dashboard-component` | 35 kB | The shell itself (loaded after auth) — search palette + notification bell |
| `athlete-detail-component` | 31 kB | Tabs + child route outlets |
| `athlete-form-component` | 30 kB | Reactive form + multi-select + datepicker |
| Others (≤ 30 kB each) | — | 85 more lazy chunks total |

## Heavy lazy chunks worth a closer look

A handful of lazy chunks stand out for their size relative to a single feature flow:

| Chunk | Size | Owner | Action |
|-------|------|-------|--------|
| `chunk-DCUYF7YS.js` | **1.71 MB raw / 694 kB transfer** | **zxcvbn-ts password strength meter** (used by register / reset / change-password) | **Already partly mitigated** — only loads on those three flows. Further win: lazy-import zxcvbn-ts *inside* the meter component on first keystroke, so a user landing on the register page sees the input immediately and the library loads in the background. See #877 follow-up. |
| `chunk-3U6JS4OQ.js` | 208 kB | Likely `chart.js` + `primeng/chart` (stats pages + the new `<app-attendance-summary-chart>` from #894) | Acceptable for stats / attendance — only loads on those routes. No action. |

## Quick win shipped in this PR

**`profile-two-factor.component`** — switched the `import * as QRCode from 'qrcode'` static import to a dynamic `import('qrcode')` inside the enrolment handler.

Effects:
- Removes the build-time `qrcode is not ESM — optimization bailout` warning (legitimate; the lib is CommonJS).
- The qrcode chunk now loads on the user's *first* "Enable 2FA" click, not on every profile-page mount.
- Users who never enable 2FA never download the lib.

## Open follow-ups

1. **zxcvbn-ts in-component lazy** — `password-strength-meter.component` currently imports the library at module top. A dynamic import on first non-empty input would shrink the register / reset-password / change-password chunks dramatically (a 1.7 MB lazy chunk becomes a deferred ~100 kB hit instead).
2. **Search palette defer** — `SearchPaletteComponent` is mounted unconditionally on the owner dashboard shell. Currently impractical to `@defer` because the Cmd+K listener lives inside the component's `ngOnInit`. A possible refactor: hoist the keyboard listener into a `KeyboardShortcutsService` that creates the palette component dynamically on first hit.
3. **Notification bell badge eager / panel deferred** — the badge count needs to render with the shell, but the dropdown panel (which pulls in PrimeNG `OverlayPanel` etc.) could be `@defer (on interaction(bellButton))`.
4. **Per-component SCSS budget warnings** — `profile.scss` (5 kB), `landing.scss` (6 kB), `dashboard.scss` (6 kB), `athletes-list.scss` (8 kB) — all exceed the per-component 4 kB warning budget. Most are legitimate (the dashboard shell is intrinsically big), but a quick deduplication of the design-token blocks across `landing` and `profile` could trim ~2 kB each.

## How to repeat this audit

```bash
docker exec budojo_client sh -c 'cd /app && npm run build' \
  | awk '/^Initial chunk files|^Lazy chunk files|^Application bundle/{flag=1} flag' \
  > /tmp/bundle-snapshot.txt
```

Cross-reference top-N chunks against the table above. Any new entry larger than the matching baseline is a regression worth investigating.
