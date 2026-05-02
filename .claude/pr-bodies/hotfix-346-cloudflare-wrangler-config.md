## What

Adds `wrangler.jsonc` at the repo root so the Cloudflare deploy step on `main` can locate the Angular SPA bundle and ship to production.

## Why

After the repo migrated from `m-bonanno/budojo` to `Budojo/budojo`, the existing Cloudflare Pages project lost its Git source. The legacy "Pages" Git-source flow is no longer surfaced in the Cloudflare dashboard — the only path forward is the new "Workers + Static Assets" deploy flow, which requires a `wrangler.jsonc` (or `wrangler.toml`) at the repo root.

Without it, the build succeeds but the deploy step fails with:

```
✘ [ERROR] Could not detect a directory containing static files (e.g. html, css and js) for the project
Failed: error occurred while running deploy command
```

Production is currently broken — hence `hotfix/*` from `main`.

## How

Add `wrangler.jsonc` at repo root with:

- `name: "budojo"` — matches the Cloudflare project name configured in the dashboard
- `compatibility_date: "2026-05-02"` — pins the Workers runtime to today
- `assets.directory: "./client/dist/client/browser"` — path (from repo root) to the Angular Application-builder output. The Angular project is named `client` (per `angular.json`) and uses `@angular/build:application`, which always emits a `browser/` subdirectory
- `assets.not_found_handling: "single-page-application"` — serves `index.html` on any non-asset route so Angular Router deep links don't 404 on hard refresh

## Out of scope

- No Worker code (`main: ...`) — this is SPA-only for now; can be added later if we need server-side logic
- No change to the Angular build output path (kept default)
- No backport to `develop` in this PR — handled by the standard post-release sweep workflow once the release tag publishes

## References

- Closes #346
- Related Cloudflare known issue (about deletion, which is what triggered the migration path): https://developers.cloudflare.com/pages/platform/known-issues/#delete-a-project-with-a-high-amount-of-deployments

## Test plan

- [ ] CI green on the PR
- [ ] On merge to `main`, semantic-release publishes a stable tag and the Cloudflare deploy succeeds (no "Could not detect a directory" error in the deploy log)
- [ ] Production URL serves the SPA at `/`
- [ ] Hard refresh on a deep route (e.g. `/dashboard/athletes`) serves the SPA, not 404
- [ ] Post-release sweep PR (`main` → `develop`) opens automatically and brings `wrangler.jsonc` into `develop`
