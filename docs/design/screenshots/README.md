# Design inventory — screenshot library

Every page of the SPA, at three viewport widths (mobile 390 / tablet 768 /
desktop 1280), captured by one command. It exists so "what does a list page
look like in Budojo?" is answered by scrolling a folder rather than by
guessing, and so a design review has something to review.

**162 screenshots, 54 pages.** The spec is
[`client/cypress/inventory/design-inventory.cy.ts`](../../../client/cypress/inventory/design-inventory.cy.ts).

## Where the output goes — and why it is not in git

Regenerating writes to **`client/cypress/screenshots/design-inventory.cy.ts/`**,
which is gitignored. Open the folder; the files are named
`{slug}__{viewport}.png`, so they sort into groups on their own.

They are deliberately not committed. The library was originally meant to be —
`docs/design/screenshots/` is this folder, and the runner aimed at it — but
that never actually worked (the config override was silently ignored, which
is why this folder held nothing but this README for a long time), and on
reflection it should not:

- One full set is **26 MB** against a **15 MB** repository, and git keeps
  every version of every PNG forever. Three regenerations would quadruple the
  clone.
- A pull request with 150 changed binary files is not something anyone
  reviews. The visual check that catches real problems is the one in
  [`visual-verification.md`](../../development/visual-verification.md) —
  a person looking at the page they changed, before pushing.

The inventory is for **looking at**, freshly generated, when you are about to
design something or audit what exists.

## How to regenerate

Prerequisites: Docker running, and the dev client up (`docker compose up -d client`).

```bash
cd client
npm run design:inventory      # ~3 minutes, 162 screenshots
```

The run is deterministic: time is frozen, every endpoint is stubbed, and the
cookie banner is pre-dismissed. Re-running without a code change produces the
same images.

## Playbook when adding a page

1. Pick tokens and patterns from [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md).
2. Build the screen from existing patterns.
3. Add one `captureAtAllViewports(route, slug, readySelector)` line — or
   `publicPage(...)` for a signed-out surface, `portalPage(...)` for one
   inside `/dashboard/me`.
4. Regenerate and look at all three widths.

**Pick a `readySelector` that depends on DATA**, not on static chrome. A
header button exists before the list resolves, and a screenshot taken then is
a picture of a loading state — which, in an inventory, reads as a design
fault. The harness additionally waits out anything matching
`[data-cy$="-skeleton"]`, `[data-cy$="-loading"]`, `.p-skeleton`, `.pi-spin`
and `.p-progressspinner`, which is why the app's naming convention for those
is worth keeping.

## What the inventory cannot capture

**`/dashboard/backup`.** Its data comes from the Electron preload bridge, not
over HTTP, so in a browser the page sits in a permanent loading state.
Capturing it needs the packaged app — or the desktop audit below, which fakes
the bridge.

## The desktop audit — the same idea for the product Budojo is now

[`client/cypress/inventory/desktop-audit.cy.ts`](../../../client/cypress/inventory/desktop-audit.cy.ts)
(#1614) shoots every screen the shipped desktop app can show, at the two
widths the Electron window can have (1280×860 and 960×600), in Italian, on
the desktop runtime profile, with the Electron bridge faked — so the title
bar, the update banner and the backup page render as they do in the real
shell. Where the inventory shoots a page as it opens, the audit also shoots
what is inside it: the dialogs, the confirm popups, a row after it was acted
on, the empty and error states.

```bash
cd client
npm run design:audit                       # ~9 minutes, ~360 frames
npm run design:audit -- 22-athlete         # one area, by slug prefix
npm run design:audit -- 22-athlete,40-stats   # several
```

Output goes to `client/cypress/screenshots/desktop-audit.cy.ts/`, two frames
per screen and width: `{slug}__{width}.png` is the viewport as the owner sees
it, `{slug}__{width}__full.png` the whole page unrolled when it scrolls.

Two things the pictures cannot show are written beside them:

- **`_console/{slug}__{width}.json`** — every `console.error`, uncaught error
  and unhandled rejection raised while the screen was up, and any loading
  state that never resolved — `[]` when clean. Every file reading `[]` is the
  pass condition; the audit's first run found a computed that threw on an empty
  date field this way.
- **`_env.json`** — which prefixes were in force when the folder was last
  written.

The review it produced is [`docs/design/ux-audit-v2.61.md`](../ux-audit-v2.61.md).
