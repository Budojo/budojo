# patterns.dev audit — current state + roadmap (#1091)

Static audit of the client against [patterns.dev](https://www.patterns.dev/) categories. Scoped to **CSR Angular 21** — React-only and SSR-only patterns are excluded by design.

This document is the source of truth for which patterns we've adopted, which are gaps, and the priority order for new adoption PRs. **Every new adoption from patterns.dev cites this audit + a measurable target** (Lighthouse delta, bundle bytes, TBT). No cargo-cult.

## Snapshot

Method: static grep of the codebase + reading of `app.config.ts`, `app.routes.ts`, `ngsw-config.json`, `index.html`. **Not a Lighthouse run** — that's a separate follow-up that needs the running app.

| Pattern (patterns.dev) | Current state | Gap | Priority |
|---|---|---|---|
| Lazy route loading | ✅ 64 `loadComponent` entries in `app.routes.ts` | — | — |
| Code splitting | ✅ Angular CLI automatic per lazy chunk | — | — |
| Tree shaking | ✅ Angular CLI automatic (production build) | — | — |
| Skeleton screens | ✅ 115 `p-skeleton` / `SkeletonModule` refs | — | — |
| Service Worker caching | ✅ ngsw configured (`ngsw-config.json` + `provideServiceWorker`) | Asset-group strategies could be refined | LOW |
| Container/Presentational | ✅ Smart vs dumb component split (e.g. feature components vs `shared/components/*`) | — | — |
| Provider | ✅ Angular DI everywhere (`inject()` + `providedIn: 'root'`) | — | — |
| Mediator / Observer | ✅ RxJS `Subject` + signals for cross-component state | — | — |
| **Native image lazy loading** | ✅ **3 of ~15 real `<img>` tags** carry `loading="lazy"` where it has effect (UserAvatar + academy-detail logo + my-academy academy-logo). The remaining tags either ARE the LCP candidate on their page (auth-page logos, dashboard topbar/sidebar logos, public-profile avatar — eager by design), are already explicitly tuned (landing hero with `fetchpriority="high"`), or render a `data:` URL where `loading="lazy"` is a mechanical no-op (profile two-factor QR — bytes are already inline, no network fetch to defer; **#1093 reviewer**). The initial "1 of 25" count in #1092 was a raw grep that included `.ts` doc-comment mentions and didn't distinguish LCP / data-URL / below-the-fold | None — the surface is closed | — |
| **`<link rel=preload / prefetch / preconnect>`** | ❌ **None in `client/src/index.html`** | No critical-chunk preload, no CDN preconnect | **MED** |
| **Intersection Observer** | ❌ **0 refs** in `client/src` | No systematic in-viewport gating (feed reactions, lazy image fallback, infinite-scroll trigger) | MED |
| Dynamic imports (app-level) | Partial — used for lazy routes only; the only large lib that needs it (zxcvbn) was already lazy per `perf/lazy-zxcvbn-password-meter` | Other big libs to audit (charts, etc.) | LOW |
| Web Workers (browser) | ❌ 0 refs (only the **Service** Worker via `provideServiceWorker`) | Chart heavy math (heatmap, monthly-summary) runs on the main thread | LOW (no measured bottleneck) |
| HOC / Render Props / Hooks | **N/A** — React idioms; the Angular analogues are `<ng-content>`, structural directives, signals (`signal()` / `effect()` / `computed()`) — already canonical | — | — |
| SSR / SSG / ISR / Islands / Progressive Hydration | **N/A** — CSR by design (mobile-first → TWA → native app on store) | — | — |

## Roadmap (priority order)

Each item is a **separate PR with a measurable target**.

### 1. ~~HIGH — Native lazy-load sweep~~ **DONE**

Shipped across #1092 + the follow-up: the 3 below-the-fold tags now carry `loading="lazy"` where it has effect; the rest stay eager because they ARE the LCP on their pages, are already explicitly tuned, or render a `data:` URL (no network fetch — `loading="lazy"` would be a mechanical no-op, see the table above). Nothing more to do here — re-open only if a new `<img>` ships without an explicit choice.

### 2. MED — Preload / preconnect hints in `index.html`

- **Pattern**: [Resource hints](https://www.patterns.dev/vanilla/preload), [Preconnect](https://www.patterns.dev/vanilla/preconnect).
- **Scope**: `<link rel="preconnect">` for the API host and any CDN (Cloudflare). `<link rel="prefetch">` for the most-likely post-login chunk (the dashboard shell).
- **Measured target**: Lighthouse "Preconnect to required origins" + LCP improvement on first navigation after login.
- **Effort**: small. Needs care not to over-fetch on slow connections (mobile-first).

### 3. MED — IntersectionObserver where it pays

- **Pattern**: [Intersection Observer](https://www.patterns.dev/vanilla/intersection-observer).
- **Candidates**:
  - **Feed infinite scroll trigger** (current paging uses prev/next buttons — could complement, not replace, with auto-load near the bottom).
  - **Reaction count refresh gate** — only re-fetch reactions for cards in viewport rather than all loaded posts.
- **Measured target**: reduced network chatter on long feeds + smoother scroll.
- **Effort**: medium. Likely needs a tiny `inViewport` directive in `shared/`.

### 4. LOW — Web Workers for chart math

- **Pattern**: [Web Workers](https://www.patterns.dev/vanilla/web-workers).
- **Candidate**: the attendance-heatmap component + monthly-summary aggregation, IF the main thread blocks measurably during chart rendering.
- **Measured target**: TBT reduction on stats pages with > 50 athletes.
- **Effort**: medium. Worth doing only AFTER a Lighthouse profile flags the main-thread block — currently speculative.

### 5. LOW — Service Worker cache fine-tuning

- **Pattern**: [Workbox runtime caching strategies](https://www.patterns.dev/vanilla/workbox-cache).
- **Scope**: revisit `ngsw-config.json` asset groups — split static-immutable (hashed assets) from prefetch (above-the-fold) from lazy (everything else). Possibly add a `data-group` for short-TTL API responses on slow connections.
- **Measured target**: faster repeat-visit boot on cold cache + offline robustness.
- **Effort**: small but high-risk if mis-tuned (stale-cache user-visible bugs); needs a Lighthouse PWA audit + a service-worker integration test.

## Follow-ups before any of the above ship

1. **Lighthouse baseline**: capture mobile + desktop scores against the prod build on representative routes (auth, feed, athletes-list, stats). Without a baseline we can't claim "improved by X" on any of the items above.
2. **Bundle analyzer**: run `ng build --stats-json` + open the bundle visualizer to see if any large unused dependency hides in the lazy chunks.

These two are pure-discovery work — they become a single PR with attached screenshots + tables, then unlock the roadmap.
