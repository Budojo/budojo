# Budojo — Apple HIG Override for PrimeNG Material

A drop-in override layer for the `@primeuix/themes/material` preset that delivers an Apple HIG / iOS 17+ minimal aesthetic. **Override, don't replace.** You keep PrimeNG components, Angular templates, MD3 motion baseline, and the 8dp grid canon. This layer restyles surfaces, type, radii, elevation, and a handful of component atoms.

---

## 1. Token inventories

### 1.1 Color

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--p-primary-color` | `#5b6cff` | `#7b8bff` | CTA, focus ring, active nav |
| `--p-primary-contrast-color` | `#ffffff` | `#0a0a0b` | Text on primary |
| `--p-primary-hover-color` | `#4554ed` | `#9aa3ff` | Primary hover |
| `--p-primary-active-color` | `#3644c7` | `#b4bbff` | Primary pressed |
| `--p-surface-0` | `#ffffff` | `#1c1c1e` | Top surface |
| `--p-surface-50` | `#fafafa` | `#151517` | App background |
| `--p-surface-100` | `#f5f5f7` | `#1c1c1e` | Chips, subtle fills |
| `--p-surface-200` | `#ebebef` | `#2c2c2e` | Resting rows, rails |
| `--p-surface-300` | `#dcdce0` | `#3a3a3c` | Hairline dividers |
| `--p-surface-400` | `#c4c4c9` | `#48484a` | Disabled glyphs |
| `--p-surface-500` | `#8e8e93` | `#8e8e93` | Secondary text |
| `--p-surface-600` | `#636366` | `#aeaeb2` | Tertiary text |
| `--p-surface-700` | `#3a3a3c` | `#c7c7cc` | High-emphasis |
| `--p-surface-800` | `#1c1c1e` | `#e5e5ea` | Display |
| `--p-surface-900` | `#0a0a0b` | `#f2f2f7` | Ink |
| `--p-content-background` | `#ffffff` | `#1c1c1e` | Card/content bg |
| `--p-text-color` | `#0a0a0b` | `#f2f2f7` | Primary text |
| `--p-text-muted-color` | `#8e8e93` | `#aeaeb2` | Secondary text |
| `--p-mask-background` | `rgba(10,10,11,.32)` | `rgba(0,0,0,.52)` | Modal scrim |
| `--budojo-success` | `#34c759` | same | iOS system green |
| `--budojo-warning` | `#ff9f0a` | same | iOS system orange |
| `--budojo-danger` | `#ff3b30` | same | iOS system red |
| `--budojo-info` | `#0a84ff` | same | iOS system blue |

Belt colors remain domain constants in `client/src/app/domain/ibjjf.ts` — don't move them into theme vars.

### 1.2 Typography (iOS HIG scale)

| Token | Spec | Used for |
|---|---|---|
| `--type-display` | 700 34/40 | Route headers (Athletes, Attendance) |
| `--type-title-1` | 700 28/34 | Modal titles |
| `--type-title-2` | 600 22/28 | Section headers |
| `--type-title-3` | 600 20/25 | Card titles, dialog titles |
| `--type-headline` | 600 17/22 | List-cell primary |
| `--type-body` | 400 17/22 | Body text, inputs |
| `--type-callout` | 400 16/21 | Buttons |
| `--type-subhead` | 400 15/20 | List-cell supporting text |
| `--type-footnote` | 400 13/18 | Status, helper |
| `--type-caption-1` | 400 12/16 | Field labels |
| `--type-caption-2` | 400 11/13 | Dense metadata |

`letter-spacing`: `-0.024em` display, `-0.018em` titles, `-0.003em` body. Emulates SF Pro optical sizing on the Inter fallback.

### 1.3 Spacing (8dp canon — unchanged)

| Token | Px | Use |
|---|---|---|
| `--space-1` | 4 | Hairline gaps only |
| `--space-2` | 8 | Icon ↔ label |
| `--space-3` | 12 | Dense row inner |
| `--space-4` | 16 | **Base** — card padding |
| `--space-5` | 24 | Section gutter |
| `--space-6` | 32 | Vertical rhythm |
| `--space-8` | 48 | Touch target floor (canon) |

### 1.4 Radius

| Token | Px | Use |
|---|---|---|
| `--p-border-radius-xs` | 4 | Tag, chip |
| `--p-border-radius-sm` | 8 | Input inner affordances |
| `--p-border-radius-md` | **12** | **Cards, buttons (brief)** |
| `--p-border-radius-lg` | **16** | **Dialogs (brief)** |
| `--p-border-radius-xl` | **24** | **Bottom sheets (brief)** |
| `--p-border-radius-full` | 9999 | Tags, toggles, avatars |

### 1.5 Elevation (2 levels max)

| Token | Use |
|---|---|
| `--shadow-none` | Default — hairline border instead |
| `--shadow-surface` | `inset 0 0 0 1px border` — cards, inputs |
| `--budojo-elevation-floating` | `0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.12)` — dialogs, menus, toasts |
| `--budojo-elevation-sheet` | Upward-biased for bottom sheets |

Third shadow ramp is forbidden. If you reach for it, use a hairline border.

### 1.6 Motion

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 160ms | Press/opacity |
| `--motion-base` | 240ms | Panel/dialog |
| `--motion-slow` | 360ms | Sheet slide-up |
| `--budojo-motion-decelerate` | `cubic-bezier(0.22, 1, 0.36, 1)` | **Default** — iOS exit |
| `--budojo-motion-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | MD3 compat |
| `--budojo-motion-spring` | `cubic-bezier(0.34, 1.2, 0.64, 1)` | Gentle, **no overshoot past 1.2** |

No bounce, no elastic. PWAs in standalone mode read bounce as "this app is broken."

---

## 2. `client/src/styles/budojo-theme.scss`

```scss
// budojo-theme.scss
// Override layer for @primeuix/themes/material. Imported once from styles.scss
// via `@use "./styles/budojo-theme";`. Does NOT replace the preset —
// PrimeNG registers its vars first; we override on :root / .dark.

@use "@fontsource/inter/400.css";
@use "@fontsource/inter/500.css";
@use "@fontsource/inter/600.css";
@use "@fontsource/inter/700.css";

:root {
  // ---- Primary (single accent — near-monochrome policy) ----
  --p-primary-color:         #5b6cff;
  --p-primary-contrast-color:#ffffff;
  --p-primary-hover-color:   #4554ed;
  --p-primary-active-color:  #3644c7;
  --p-primary-50:  #eef1ff;
  --p-primary-100: #dde2ff;
  --p-primary-200: #bfc6ff;
  --p-primary-300: #9aa3ff;
  --p-primary-400: #7783ff;
  --p-primary-500: #5b6cff;
  --p-primary-600: #4554ed;
  --p-primary-700: #3644c7;
  --p-primary-800: #2a348f;
  --p-primary-900: #1c2366;

  // ---- Surfaces (iOS system grays) ----
  --p-surface-0:   #ffffff;
  --p-surface-50:  #fafafa;
  --p-surface-100: #f5f5f7;
  --p-surface-200: #ebebef;
  --p-surface-300: #dcdce0;
  --p-surface-400: #c4c4c9;
  --p-surface-500: #8e8e93;
  --p-surface-600: #636366;
  --p-surface-700: #3a3a3c;
  --p-surface-800: #1c1c1e;
  --p-surface-900: #0a0a0b;
  --p-surface-950: #000000;

  // ---- Content / text ----
  --p-content-background:        var(--p-surface-0);
  --p-content-hover-background:  var(--p-surface-100);
  --p-content-border-color:      var(--p-surface-300);
  --p-content-color:             var(--p-surface-900);
  --p-text-color:                var(--p-surface-900);
  --p-text-hover-color:          var(--p-surface-900);
  --p-text-muted-color:          var(--p-surface-500);
  --p-text-hover-muted-color:    var(--p-surface-700);

  // ---- Overlay / mask ----
  --p-mask-background: rgba(10, 10, 11, 0.32);
  --p-mask-color:      #ffffff;

  // ---- Form field (filled iOS pill) ----
  --p-form-field-background:              var(--p-surface-100);
  --p-form-field-disabled-background:     var(--p-surface-100);
  --p-form-field-filled-background:       var(--p-surface-100);
  --p-form-field-filled-hover-background: var(--p-surface-200);
  --p-form-field-filled-focus-background: var(--p-surface-0);
  --p-form-field-border-color:            transparent;
  --p-form-field-hover-border-color:      transparent;
  --p-form-field-focus-border-color:      var(--p-primary-color);
  --p-form-field-invalid-border-color:    #ff3b30;
  --p-form-field-color:                   var(--p-surface-900);
  --p-form-field-placeholder-color:       var(--p-surface-500);
  --p-form-field-padding-x:               14px;
  --p-form-field-padding-y:               12px;
  --p-form-field-border-radius:           12px;
  --p-form-field-focus-ring-width:        0;     // we use border, not ring
  --p-form-field-focus-ring-shadow:       none;
  --p-form-field-transition-duration:     160ms;

  // ---- Radius ramp ----
  --p-border-radius-xs:   4px;
  --p-border-radius-sm:   8px;
  --p-border-radius-md:  12px;
  --p-border-radius-lg:  16px;
  --p-border-radius-xl:  24px;

  // ---- Budojo-only semantic tokens (PrimeNG doesn't cover these) ----
  --budojo-elevation-floating:
    0 1px 2px rgba(10,10,11,0.06),
    0 8px 24px rgba(10,10,11,0.12);
  --budojo-elevation-sheet:
    0 -1px 0 var(--p-surface-200),
    0 -24px 48px rgba(10,10,11,0.18);
  --budojo-motion-decelerate: cubic-bezier(0.22, 1, 0.36, 1);
  --budojo-motion-standard:   cubic-bezier(0.4, 0.0, 0.2, 1);
  --budojo-motion-spring:     cubic-bezier(0.34, 1.2, 0.64, 1);
  --budojo-motion-fast: 160ms;
  --budojo-motion-base: 240ms;
  --budojo-motion-slow: 360ms;
  --budojo-hairline: 1px;
  --budojo-tap-target: 48px;
  --budojo-success: #34c759;
  --budojo-warning: #ff9f0a;
  --budojo-danger:  #ff3b30;
  --budojo-info:    #0a84ff;

  // ---- Typography ----
  --p-font-family:
    "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text",
    "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

// ---- Dark ----
.dark {
  --p-primary-color: #7b8bff;
  --p-primary-contrast-color: #0a0a0b;
  --p-primary-hover-color: #9aa3ff;
  --p-primary-active-color: #b4bbff;

  --p-surface-0:   #1c1c1e;
  --p-surface-50:  #151517;
  --p-surface-100: #1c1c1e;
  --p-surface-200: #2c2c2e;
  --p-surface-300: #3a3a3c;
  --p-surface-400: #48484a;
  --p-surface-500: #8e8e93;
  --p-surface-600: #aeaeb2;
  --p-surface-700: #c7c7cc;
  --p-surface-800: #e5e5ea;
  --p-surface-900: #f2f2f7;

  --p-content-background:       #1c1c1e;
  --p-content-hover-background: #2c2c2e;
  --p-content-border-color:     rgba(255,255,255,0.14);
  --p-text-color:               #f2f2f7;
  --p-text-muted-color:         #aeaeb2;

  --p-mask-background: rgba(0,0,0,0.52);

  --p-form-field-background:              #2c2c2e;
  --p-form-field-filled-background:       #2c2c2e;
  --p-form-field-filled-hover-background: #3a3a3c;
  --p-form-field-filled-focus-background: #1c1c1e;
  --p-form-field-color:                   #f2f2f7;

  --budojo-elevation-floating:
    0 1px 2px rgba(0,0,0,0.4),
    0 8px 24px rgba(0,0,0,0.5);
}

// ---- Global resets ----
html, body {
  font-family: var(--p-font-family);
  font-feature-settings: "cv11", "ss01", "ss03"; // Inter → SF-ish
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  background: var(--p-surface-50);
  color: var(--p-text-color);
}

// PWA: full dynamic viewport, safe-area aware scaffold
.app-shell {
  min-height: 100dvh;
  padding-top:    env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left:   env(safe-area-inset-left);
  padding-right:  env(safe-area-inset-right);
}

// Hairline dividers replace heavy borders everywhere
.p-divider,
.p-menu .p-menu-separator,
.p-datatable .p-datatable-tbody > tr > td {
  border-color: var(--p-surface-300) !important;
  border-width: var(--budojo-hairline);
}

// Kill the MD3 ripple globally — iOS doesn't ripple
.p-ripple { overflow: hidden; }
.p-ink    { display: none !important; }

// Focus ring — 2px accent outline, no glow
:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
  border-radius: inherit;
}
```

Import once:

```scss
// client/src/styles.scss
@use "primeicons/primeicons.css";
@use "./styles/budojo-theme";   // ← this override layer
```

---

## 3. Component specs

Each spec: **what** (1–2 sentences of visual intent), **override keys**, **optional snippet**. No structure changes. All overrides use canonical PrimeNG CSS var names — verified against `@primeuix/themes/material` source.

### p-button
Flat, filled, 12px radius. Primary = accent fill. Secondary = surface-100 fill + ink text. Ghost (`text` severity) = accent text, no bg. No elevation, ever. Press = opacity 0.88, no shrink.

```
--p-button-primary-background: var(--p-primary-color);
--p-button-primary-hover-background: var(--p-primary-hover-color);
--p-button-primary-active-background: var(--p-primary-active-color);
--p-button-secondary-background: var(--p-surface-100);
--p-button-secondary-color: var(--p-text-color);
--p-button-text-primary-color: var(--p-primary-color);
--p-button-border-radius: 12px;
--p-button-padding-y: 12px;
--p-button-padding-x: 18px;
--p-button-font-weight: 600;
--p-button-transition-duration: 160ms;
--p-button-raised-shadow: none;   // kill MD elevation
```

```scss
.p-button { box-shadow: none !important; min-height: 44px; }
.p-button:active { opacity: .88; transform: none; } // explicit "no shrink"
```

### p-dialog
Centered on desktop; **mobile viewport → full-width bottom sheet with 24px top radius.** Uses our floating shadow, hairline header divider, no backdrop blur.

```
--p-dialog-background: var(--p-content-background);
--p-dialog-border-color: transparent;
--p-dialog-border-radius: 16px;
--p-dialog-shadow: var(--budojo-elevation-floating);
--p-dialog-header-padding: 20px 20px 12px;
--p-dialog-content-padding: 0 20px 20px;
--p-dialog-title-font-size: 20px;
--p-dialog-title-font-weight: 600;
```

```scss
// Mobile: promote p-dialog to bottom sheet
@media (max-width: 599px) {
  .p-dialog.p-dialog-modal {
    position: fixed; inset: auto 0 0 0;
    width: 100% !important; max-width: 100% !important;
    margin: 0; border-radius: 24px 24px 0 0;
    animation: budojo-sheet-up var(--budojo-motion-slow) var(--budojo-motion-decelerate);
  }
  .p-dialog.p-dialog-modal::before {
    content: ""; display:block; width:36px; height:5px;
    border-radius: 9999px; background: var(--p-surface-300);
    margin: 8px auto 4px;
  }
}
@keyframes budojo-sheet-up { from { transform: translateY(100%);} to { transform: none; } }
```

### p-table (DataTable)
Grouped-list feel: no vertical borders, hairline horizontal dividers, row hover = surface-100, 56px row height.

```
--p-datatable-header-cell-background: var(--p-surface-50);
--p-datatable-header-cell-color: var(--p-text-muted-color);
--p-datatable-header-cell-font-weight: 600;
--p-datatable-header-cell-font-size: 13px;
--p-datatable-header-cell-padding: 10px 16px;
--p-datatable-body-cell-padding: 14px 16px;
--p-datatable-body-cell-border-color: var(--p-surface-300);
--p-datatable-row-hover-background: var(--p-surface-100);
--p-datatable-row-selected-background: var(--p-primary-50);
--p-datatable-row-selected-color: var(--p-text-color);
```

```scss
.p-datatable .p-datatable-tbody > tr > td {
  border-left: none; border-right: none;
  border-bottom-width: 1px;
}
```

### p-datepicker
Inline calendar: rounded 12px, today = accent ring, selected = accent fill pill, weekday header muted. **Mobile** (≤599px): render as sheet via containing `p-dialog`, not floating overlay.

```
--p-datepicker-panel-background: var(--p-content-background);
--p-datepicker-panel-border-radius: 16px;
--p-datepicker-panel-shadow: var(--budojo-elevation-floating);
--p-datepicker-date-color: var(--p-text-color);
--p-datepicker-date-hover-background: var(--p-surface-100);
--p-datepicker-date-selected-background: var(--p-primary-color);
--p-datepicker-date-selected-color: var(--p-primary-contrast-color);
--p-datepicker-date-today-color: var(--p-primary-color);
--p-datepicker-date-border-radius: 9999px;
--p-datepicker-header-padding: 12px 16px;
```

### p-select (Dropdown)
Filled pill matching inputs; trigger chevron is surface-500; overlay uses floating shadow.

```
--p-select-background: var(--p-form-field-background);
--p-select-border-color: transparent;
--p-select-focus-border-color: var(--p-primary-color);
--p-select-color: var(--p-text-color);
--p-select-padding-x: 14px;
--p-select-padding-y: 12px;
--p-select-border-radius: 12px;
--p-select-overlay-background: var(--p-content-background);
--p-select-overlay-border-color: transparent;
--p-select-overlay-shadow: var(--budojo-elevation-floating);
--p-select-option-selected-background: var(--p-primary-50);
--p-select-option-selected-color: var(--p-primary-color);
--p-select-option-padding: 12px 14px;
```

### p-menu
Inline or overlay list; on mobile, prefer replacing with `<p-popover>` used as an action sheet — but if keeping menu, use floating shadow and 12px radius.

```
--p-menu-background: var(--p-content-background);
--p-menu-border-color: transparent;
--p-menu-border-radius: 12px;
--p-menu-shadow: var(--budojo-elevation-floating);
--p-menu-item-padding: 12px 14px;
--p-menu-item-color: var(--p-text-color);
--p-menu-item-focus-background: var(--p-surface-100);
--p-menu-separator-border-color: var(--p-surface-300);
```

### p-tag
Capsule, 12px font, 3px vertical padding. Severity mapping aligns to semantic tokens (success/warn/danger/info). No gradients.

```
--p-tag-padding: 3px 10px;
--p-tag-font-size: 12px;
--p-tag-font-weight: 600;
--p-tag-border-radius: 9999px;
--p-tag-success-background: #e7f7ea;  --p-tag-success-color: #188038;
--p-tag-warn-background:    #fff3e0;  --p-tag-warn-color:    #b45309;
--p-tag-danger-background:  #ffe5e3;  --p-tag-danger-color:  #b42318;
--p-tag-info-background:    #e1efff;  --p-tag-info-color:    #0a67d9;
--p-tag-secondary-background: var(--p-surface-100); --p-tag-secondary-color: #3a3a3c;
```

### p-toast
Bottom-center on mobile (above safe-area + tab bar), top-right on desktop. Floating shadow, 12px radius, no colored left-border accent.

```
--p-toast-width: min(92vw, 420px);
--p-toast-background: var(--p-content-background);
--p-toast-color: var(--p-text-color);
--p-toast-border-color: transparent;
--p-toast-border-radius: 12px;
--p-toast-shadow: var(--budojo-elevation-floating);
--p-toast-summary-font-weight: 600;
--p-toast-detail-color: var(--p-text-muted-color);
```

```scss
@media (max-width: 599px) {
  .p-toast.p-toast-bottom-center {
    bottom: calc(env(safe-area-inset-bottom) + 16px);
  }
}
```

### p-skeleton
Subtle — surface-100 base, surface-200 shimmer, capped 800ms cycle. No gradient.

```
--p-skeleton-background: var(--p-surface-100);
--p-skeleton-animation-background: var(--p-surface-200);
--p-skeleton-border-radius: 8px;
```

```scss
.p-skeleton::after { animation-duration: 800ms; animation-timing-function: var(--budojo-motion-standard); }
```

### p-fileupload
Replace the default chrome. On mobile use `mode="basic"` inside a bottom sheet with a single `Choose` row and a file-summary line; on desktop the advanced mode is fine but restyle:

```
--p-fileupload-background: var(--p-content-background);
--p-fileupload-border-color: var(--p-surface-300);
--p-fileupload-border-radius: 12px;
--p-fileupload-header-padding: 12px 14px;
--p-fileupload-content-padding: 14px;
--p-fileupload-row-background: var(--p-surface-50);
```

### p-message (inline)
No colored left-border tab — we use a left icon in accent/semantic color + soft semantic bg. 12px radius.

```
--p-message-border-width: 0;
--p-message-border-radius: 12px;
--p-message-padding: 12px 14px;
--p-message-success-background: #e7f7ea; --p-message-success-color: #188038;
--p-message-warn-background:    #fff3e0; --p-message-warn-color:    #b45309;
--p-message-error-background:   #ffe5e3; --p-message-error-color:   #b42318;
--p-message-info-background:    #e1efff; --p-message-info-color:    #0a67d9;
```

### p-confirmpopup
On mobile, prefer a bottom sheet with a destructive-styled primary action; on desktop keep as popover with floating shadow.

```
--p-confirmpopup-background: var(--p-content-background);
--p-confirmpopup-border-radius: 12px;
--p-confirmpopup-shadow: var(--budojo-elevation-floating);
--p-confirmpopup-padding: 16px;
--p-confirmpopup-footer-gap: 8px;
```

### p-toggleswitch
Full-pill iOS switch. Off = surface-300, on = success-green (NOT accent — accent is reserved for CTAs; iOS uses green for state).

```
--p-toggleswitch-width: 48px;
--p-toggleswitch-height: 28px;
--p-toggleswitch-border-radius: 9999px;
--p-toggleswitch-background: var(--p-surface-300);
--p-toggleswitch-hover-background: var(--p-surface-400);
--p-toggleswitch-checked-background: var(--budojo-success);
--p-toggleswitch-checked-hover-background: #2fb350;
--p-toggleswitch-handle-background: #ffffff;
--p-toggleswitch-handle-shadow: 0 1px 3px rgba(0,0,0,.2);
--p-toggleswitch-transition-duration: 200ms;
```

### p-textarea
Matches `p-inputtext` tokens (filled pill), but 16px radius, `min-height: 96px`, line-height 1.4.

```
--p-textarea-background: var(--p-form-field-background);
--p-textarea-border-color: transparent;
--p-textarea-focus-border-color: var(--p-primary-color);
--p-textarea-padding: 12px 14px;
--p-textarea-border-radius: 16px;
--p-textarea-color: var(--p-text-color);
```

---

## 4. Mobile mockups (390 × 844)

### 4.1 `/auth/login`

```
╭─────────────────────────── 390×844 ────────────────────────╮
│ 9:41                                            ●○○   100%│   ← status bar
│                                                            │
│                                                            │
│                       ┌────────┐                           │
│                       │   B    │   ← 64×64 app icon        │
│                       └────────┘                           │
│                                                            │
│                       Budojo                               │   34pt Display
│           Sign in to your academy                          │   17pt subhead, muted
│                                                            │
│                                                            │
│  ╭──────────────────────────────────────────────────────╮  │
│  │ Email                                                │  │   13pt caption label
│  │ coach@budojo.app                          [filled]   │  │   12px radius pill
│  ╰──────────────────────────────────────────────────────╯  │
│                                                            │
│  ╭──────────────────────────────────────────────────────╮  │
│  │ Password                                             │  │
│  │ ••••••••••                                [filled]   │  │
│  ╰──────────────────────────────────────────────────────╯  │
│                                                            │
│                                                            │
│  ╭──────────────────────────────────────────────────────╮  │
│  │                   Sign in                            │  │   Primary · 48h · 12r
│  ╰──────────────────────────────────────────────────────╯  │
│                                                            │
│                   Forgot password?                         │   ghost text, accent
│                                                            │
│                                                            │
│                                                            │
│                                                            │
│  ─────────────── Safe area bottom ───────────────          │
╰────────────────────────────────────────────────────────────╯
```

### 4.2 `/dashboard/athletes`

```
╭─────────────────────────── 390×844 ────────────────────────╮
│ 9:41                                            ●○○   100%│
│ ┌────────────────────────────────────────────────────────┐ │
│ │   Athletes                                  [＋]       │ │   34pt Display + icon btn
│ └────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 🔍 Search athletes                                     │ │   filled pill
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌──────────────────────────────────────────────────┐ [›]  │
│ │ ⚠  9 documents need attention                    │      │   M3.4 widget
│ │    Expired or expiring within 30 days            │      │   warning-soft bg
│ └──────────────────────────────────────────────────┘      │
│                                                            │
│  [All]  [White]  [Blue]  [Purple]  [Brown]  [Black]        │   chips · accent = active
│                                                            │
│  ─────────────────  28 active  ─────────────────           │   13pt caption header
│  ╭────────────────────────────────────────────────────╮    │
│  │ ⚫ MS    Marco Silva                      (exp) › │    │
│  │        Blue · 3 stripes                           │    │
│  │───────────────────────────── hairline ────────────│    │
│  │ 🟣 GA    Giulia Arrighi                 (expn) › │    │
│  │        Purple · 2 stripes                         │    │
│  │─────────────────────────────────────────────────  │    │
│  │ ⚫ TK    Tadeu Kawaguchi                 (valid)› │    │
│  │        Black · Coach                              │    │
│  │─────────────────────────────────────────────────  │    │
│  │ ⚪ LP    Luca Pellegrini                 (miss) › │    │
│  │        White · 4 stripes                          │    │
│  ╰────────────────────────────────────────────────────╯    │
│                                                            │
│ ═════════════════════════════════════════════════════════  │
│ [ 👤 Athletes ] [ 📅 Attendance ] [ ⚙ Settings ]           │   tab bar · safe-area
╰────────────────────────────────────────────────────────────╯
```

### 4.3 `/dashboard/athletes/:id/documents`

```
╭─────────────────────────── 390×844 ────────────────────────╮
│ 9:41                                            ●○○   100%│
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ‹ Athletes      Marco Silva                 [⋯]        │ │   large-title collapsed
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│        ┌────┐                                              │
│        │ MS │   Marco Silva                                │   Title 1 + avatar 56
│        └────┘   Blue · 3 stripes · Joined Mar 2024         │
│                                                            │
│  ┌──────────────┬──────────────┬──────────────┐           │   segmented control
│  │   Profile    │  Documents ✓ │  Attendance  │           │   selected = ink fill
│  └──────────────┴──────────────┴──────────────┘           │
│                                                            │
│  EXPIRING SOON                                             │   eyebrow · 11pt caps
│  ╭──────────────────────────────────────────────────────╮  │
│  │ 📄 Medical certificate        (expires in 12d)     › │  │
│  │    PDF · 312 KB · uploaded 11 Jan                    │  │
│  ╰──────────────────────────────────────────────────────╯  │
│                                                            │
│  ALL DOCUMENTS                                             │
│  ╭──────────────────────────────────────────────────────╮  │
│  │ 🪪 ID / Passport               (valid)              │  │
│  │    JPG · 1.2 MB · uploaded 02 Mar                  › │  │
│  │────────────────────────── hairline ──────────────────│  │
│  │ 📄 Insurance policy            (valid)              │  │
│  │    PDF · 88 KB · uploaded 05 Mar                   › │  │
│  │────────────────────────── hairline ──────────────────│  │
│  │ 📄 Belt promotion (Blue)       (no expiry)          │  │
│  │    JPG · 740 KB · uploaded 22 Feb                  › │  │
│  ╰──────────────────────────────────────────────────────╯  │
│                                                            │
│  ╭──────────────────────────────────────────────────────╮  │
│  │              ＋ Upload document                       │  │   primary · full width
│  ╰──────────────────────────────────────────────────────╯  │
╰────────────────────────────────────────────────────────────╯
```

### 4.4 Upload-document dialog (mobile sheet ↔ desktop dialog)

**Mobile (≤599 px, bottom sheet)**
```
╭─────────────────────────── 390×844 ────────────────────────╮
│                                                            │
│   (dim 32% · scrim over athletes list underneath)          │
│                                                            │
│                                                            │
│                                                            │
│ ╭──────────────────────────────────────────────────────╮   │
│ │                 ▬▬▬▬▬                                │   │ ← 36×5 grab handle
│ │                                                      │   │
│ │  Upload document                                     │   │   Title 3, 20pt
│ │  PDF, JPEG or PNG · max 10 MB                        │   │   footnote muted
│ │                                                      │   │
│ │  Type                                                │   │   caption label
│ │  ┌─────────────────────────────────────────────┐ ▾   │   │   p-select, filled
│ │  │ Medical certificate                         │     │   │
│ │  └─────────────────────────────────────────────┘     │   │
│ │                                                      │   │
│ │  Expires                                             │   │
│ │  ┌─────────────────────────────────────────────┐     │   │
│ │  │ 2027-01-15                           📅     │     │   │
│ │  └─────────────────────────────────────────────┘     │   │
│ │                                                      │   │
│ │  ┌──────────────────────────────────────────────┐    │   │   choose-file row
│ │  │ 📎  Choose file…                         ›   │    │   │   surface-100 bg
│ │  └──────────────────────────────────────────────┘    │   │
│ │                                                      │   │
│ │  [ Cancel ]                    [  Upload  ]          │   │   ghost / primary
│ ╰──────────────────────────────────────────────────────╯   │
│   24px top radius · floating shadow · slides up 360ms     │
│   decelerate · drag-handle dismisses                       │
╰────────────────────────────────────────────────────────────╯
```

**Desktop (centered `p-dialog`, 16px radius, floating shadow, 480 w)** — same content, no grab handle, Cancel/Upload in a right-aligned footer.

### 4.5 `/dashboard/attendance` (M4, target aesthetic)

```
╭─────────────────────────── 390×844 ────────────────────────╮
│ 9:41                                            ●○○   100%│
│ ┌────────────────────────────────────────────────────────┐ │
│ │   Attendance                                [Today]   │ │   display title + jump btn
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│   ‹    Tue  ·  16 Apr 2026                             ›   │   day swipe header
│  ┌─ M ─ T ─ W ─ T ─ F ─ S ─ S ─┐                           │
│  │ 14 │ 15 │●16 │ 17 │ 18 │19 │20 │                        │   weekday strip
│  └────┴────┴────┴────┴────┴───┴───┘                        │   selected = accent pill
│                                                            │
│  ╭──────────────────────────────────────────────────────╮  │
│  │ 18:30 — Adults Gi            12/20  (●●●●●●●●●●●○)   │  │   Title 3 + progress
│  │ ─────────────────────────────────────────────────────│  │
│  │ ✓ Marco Silva           Blue · 3                    │  │   checked = accent fill
│  │ ✓ Giulia Arrighi        Purple · 2                  │  │
│  │ ○ Tadeu Kawaguchi       Black · Coach               │  │   unchecked circle
│  │ ○ Luca Pellegrini       White · 4                   │  │
│  │   … 24 more                                 Show › │  │
│  ╰──────────────────────────────────────────────────────╯  │
│                                                            │
│  ╭──────────────────────────────────────────────────────╮  │
│  │ 20:00 — No-Gi            0/12   (not started)        │  │
│  │ ─────────────────────────────────────────────────────│  │
│  │              ＋ Start class session                   │  │   primary full-width
│  ╰──────────────────────────────────────────────────────╯  │
│                                                            │
│  DAY SUMMARY                                               │   eyebrow
│  Total: 12 check-ins across 1 session                      │   subhead muted
│                                                            │
│ ═════════════════════════════════════════════════════════  │
│ [ 👤 Athletes ] [ 📅 Attendance ] [ ⚙ Settings ]           │
╰────────────────────────────────────────────────────────────╯
```

Check-in mechanic: tap anywhere on the row toggles the circle → filled accent check. 200ms tick, no haptic on mobile web (PWA limitation, noted in `.claude/gotchas.md`).

---

## 5. Implementation notes

### 5.1 Override gotchas (PrimeNG 21, `@primeuix/themes/material`)
- **Override order matters.** `:root` in `budojo-theme.scss` must be imported AFTER Angular's own global sheet and AFTER the material preset gets loaded by the preset API. With `@use` in `styles.scss`, Angular CLI concatenates in order — put the theme import at the bottom of `styles.scss`.
- **Never rename `--p-primary-*` shades.** If you drop `--p-primary-300` / `-400`, PrimeNG's hover/focus ring falls back to `#000` in `p-chip`, `p-progressbar`, and the `p-datepicker` today-outline. Keep the full 50–900 ramp even if light mode only uses 4 of them.
- **`--p-form-field-focus-ring-*` set to 0/none** removes MD3's ring. Don't also zero out `--p-form-field-focus-border-color` — the focused-border is how we show focus now.
- **Don't override `--p-ripple-*`** hoping to kill the ripple. The preset still emits `.p-ink`. Hide it with `.p-ink { display: none !important; }` as shown. (Documented in `.claude/gotchas.md` — noted when I first read the repo.)
- **`p-dialog` `[modal]="true"` breaks the mobile-sheet promotion** if `appendTo="body"` is not set — the dialog inherits container positioning. Always `appendTo="body"` when promoting to a sheet.
- **`p-datatable` row hover bleeds into dark mode** if you leave `--p-datatable-row-hover-background` as a hex. Use the surface token so `.dark` cascades.
- **PrimeIcons vs SF Symbols:** PrimeIcons stays as the production icon set (you already ship it). In this design system I've noted where specific PrimeIcons (`pi pi-user`, `pi pi-calendar`, `pi pi-upload`) map; **don't substitute SF Symbols into prod** — they're fontless via CSS and won't render in Firefox/Android.

### 5.2 Patterns to steer AWAY from
- **Never use the accent color for disabled states.** Disabled = `--p-surface-400` text on `--p-surface-100` bg. Dimmed accent reads as "busy/loading" in iOS vocabulary — confusing next to real spinners.
- **No colored left-border accent cards.** (It's a generic SaaS trope; kills the monochrome direction.) Use a small leading icon in the accent/semantic color and a soft semantic bg — see `p-message` spec.
- **No gradients on surfaces.** Hairline border or flat fill. Gradients belong only in placeholder/empty illustrations, and even there keep them 2-stop monochrome.
- **No bounce in motion.** `--budojo-motion-spring` is capped at 1.2 peak. Don't raise it. Standalone PWAs amplify bounce — it looks buggy.
- **No shrink/scale press feedback.** iOS uses opacity + color. Transform on press is an Android convention.
- **Don't add a third elevation tier.** If something needs more depth than `floating`, it's the wrong container — promote to a sheet or a route.
- **Don't animate `height`.** Use `max-height` + `overflow:hidden` or FLIP. Height transitions jank on iOS Safari in standalone mode.
- **Don't blur backgrounds.** `backdrop-filter` is expensive on older iPhones in standalone PWA. Use the 32% black scrim instead.

### 5.3 PWA specifics
- **`100dvh`, not `100vh`.** iOS Safari's standalone toolbar makes `100vh` overflow by the status-bar height. `.app-shell` uses `100dvh` already.
- **Safe-area insets.** Every fixed/stuck element — tab bar, toast, bottom sheet footer — must honor `env(safe-area-inset-bottom)`. The SCSS snippet shows the toast offset; replicate for your bottom nav.
- **Virtual keyboard resize.** On iOS 17+ standalone, `resize` fires when the keyboard opens. Don't fight it — let the content shift. If a sheet footer needs to stay above the keyboard, bind it with `position: sticky; bottom: 0` rather than `position: fixed`.
- **Pull-to-refresh.** Disable with `overscroll-behavior-y: contain` on the scroll container when you have in-app refresh; keep it on when you don't (iOS users expect it).
- **Status-bar style.** In `manifest.webmanifest` use `"theme_color": "#ffffff"` light / `"#000000"` dark; in `index.html` set `<meta name="apple-mobile-web-app-status-bar-style" content="default">` so iOS blends the status bar into the header — matches the Apple-minimal look.
- **Viewport meta:** include `viewport-fit=cover` so safe-area insets report correctly:
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- **Touch target floor:** canon is ≥48 CSS px. For supplementary controls (toolbar chevrons, close x) 44 is allowed but wrap them in a 48-dp hit region with `padding`, don't shrink the target.
