## What

Deletes `client/public/_redirects` so the Cloudflare Workers + Static Assets validator stops rejecting our deploys.

## Why

After #347 landed `wrangler.jsonc`, the build progressed past the missing-config error and successfully uploaded all 147 SPA assets — but the very last step (creating the Worker version) failed:

```
✘ [ERROR] A request to the Cloudflare API (/accounts/.../workers/scripts/budojo/versions) failed.

  Invalid _redirects configuration:
  Line 2: Infinite loop detected in this rule. This would cause a redirect to
  strip `.html` or `/index` and end up triggering this rule again. [code: 10021]
```

(https://developers.cloudflare.com/workers/observability/errors/#validation-errors-10021)

`client/public/_redirects` carried two rules from the legacy Pages era:

```
/api/*    https://api.budojo.it/api/:splat    308
/*        /index.html                          200
```

- **Line 2** was the classic SPA fallback. Workers + Static Assets does this natively via `assets.not_found_handling: "single-page-application"` in `wrangler.jsonc`. Having both triggers the validator's loop detection.
- **Line 1** is dead code: production SPA hits `https://api.budojo.it` directly (`environment.prod.ts:22`), so `https://budojo.it/api/*` is never requested by the app.

Confirmed via the CF API after #347 merged: `has_assets: false`, `last_deployed_from: "dash_template"` — the Worker is still serving the placeholder.

Production is still down, hence another `hotfix/*` from `main`.

## How

Delete `client/public/_redirects`. No source-side replacement needed — `not_found_handling: "single-page-application"` already handles the SPA fallback at the runtime layer.

## Out of scope

- Reintroducing the API proxy: not needed, the SPA addresses the API by absolute URL
- Switching back to legacy Pages: that flow is no longer surfaced by Cloudflare for new connections
- Fixing the `hotfix:` ↔ semantic-release commit-analyzer mismatch from #347: separate follow-up

## References

- Closes #348
- Follows up on #347 (which fixed the missing `wrangler.jsonc` but unmasked this validation error)

## Test plan

- [ ] CI green on the PR
- [ ] On merge, Cloudflare build & deploy both succeed (no error 10021)
- [ ] CF API: `has_assets: true` on `/workers/services/budojo`
- [ ] `https://budojo.it/` serves the Angular SPA, not `Hello world`
- [ ] Hard refresh on `/dashboard/athletes` serves the SPA, not 404
