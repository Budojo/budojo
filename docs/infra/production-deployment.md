# Production deployment

Single source of truth for how Budojo runs in production. Updated when any
piece of the stack changes — registrar, DNS, server, certificate, env var,
deploy script.

## Live URLs

| Component | URL | Hosted on |
|-----------|-----|-----------|
| Angular SPA | https://budojo.it | Cloudflare Pages |
| Angular SPA (www alias) | https://www.budojo.it | Cloudflare Pages |
| Laravel API | https://api.budojo.it | DigitalOcean droplet (Forge-managed) |
| API health probe | https://api.budojo.it/api/v1/health | (returns `{"status":"ok"}`) |
| GitHub repo | https://github.com/m-bonanno/budojo | — |
| Cloudflare Pages dashboard | dash.cloudflare.com → Pages → `budojo` | — |
| Forge dashboard | forge.laravel.com → server `budojo-prod` → site `api.budojo.it` | — |

## Architecture at a glance

```
                       ┌──────────────────────┐
   Browser →           │   Cloudflare edge    │
                       │   (DNS authority,    │
                       │    proxy, CDN)       │
                       └────────────┬─────────┘
                                    │
                  ┌─────────────────┴───────────────┐
                  │                                 │
                  ▼ (apex / www, proxied)           ▼ (api., DNS-only)
        ┌─────────────────────┐         ┌─────────────────────────┐
        │  Cloudflare Pages   │         │  DigitalOcean droplet   │
        │  project: budojo    │         │  budojo-prod (Frankfurt)│
        │                     │         │  Ubuntu 24.04 + nginx + │
        │  Angular 21 build   │         │  PHP-FPM 8.4 + MySQL 8.4│
        │  /api/* proxy →     │ ────►   │  Forge-managed          │
        │  api.budojo.it      │         │                         │
        └─────────────────────┘         └─────────────────────────┘
```

Domain `budojo.it` is registered at **Netsons** (registrar). Authoritative
DNS is delegated to **Cloudflare** (nameservers `*.ns.cloudflare.com`). The
Netsons hosting/cPanel records that came with the original zone import
(`46.252.152.35`, `cpanel.budojo.it` CNAME chain, autoconfig/autodiscover)
are inert leftovers — clean up when convenient.

## DNS records (Cloudflare)

| Type | Name | Content | Proxy | Why |
|------|------|---------|-------|-----|
| (managed) | `budojo.it` | Cloudflare Pages project | 🟠 proxied | apex points to Pages via Cloudflare's CNAME flattening |
| (managed) | `www.budojo.it` | Cloudflare Pages project | 🟠 proxied | www alias |
| `A` | `api` | `161.35.20.25` (droplet IP) | ⚪ DNS only | grey cloud is **mandatory** for Forge's Let's Encrypt http-01 validation — see Gotchas |

Anything else still in the zone (`mail`, `cpanel`, `*` wildcard, the cpanel
CNAME chain) is a Netsons leftover and can be removed.

## Server (Forge + DigitalOcean droplet)

### Droplet

- **Provider**: DigitalOcean
- **Region**: Frankfurt
- **Plan**: Hobby (currently the cheapest tier that fits the API + DB on one
  box; revisit when traffic justifies a managed DB)
- **Public IP**: `161.35.20.25`
- **Private IP**: `10.114.0.2`
- **OS**: Ubuntu 24.04
- **Stack**: nginx + PHP-FPM 8.4 + MySQL 8.4 (all on the same box)

### Forge site `api.budojo.it`

- **Project type**: Laravel
- **Repository**: `m-bonanno/budojo` on GitHub
- **Branch**: `main` (pushed via `Push to deploy = ON` — every merge to main
  triggers a deploy)
- **Root directory**: `/server` ← **critical**, this is a monorepo
- **Web directory**: `/public` (relative to root, resolves to
  `current/server/public`)
- **PHP version**: 8.4
- **Website isolation**: OFF (single-tenant droplet, simpler permissions)
- **Zero-downtime deployments**: ON (release-based via `$CREATE_RELEASE` /
  `$ACTIVATE_RELEASE` macros)
- **Deployment retention**: 4 (keeps the last 4 release dirs for rollback)
- **Shared paths**: `storage` → `storage` (persistent across releases)

### Deploy script

```bash
$CREATE_RELEASE()

# Monorepo: the Laravel app lives in /server, not at the repo root.
cd $FORGE_RELEASE_DIRECTORY/server

# Forge "Linking environment file" + "Linking storage directories" both run
# at the release-dir root (releases/<id>/.env, releases/<id>/storage). Mirror
# them into /server where artisan looks for them.
if [ -e $FORGE_RELEASE_DIRECTORY/.env ] && [ ! -e .env ]; then
    ln -sfn $FORGE_RELEASE_DIRECTORY/.env .env
fi
if [ -e $FORGE_RELEASE_DIRECTORY/storage ] && [ ! -L storage ]; then
    rm -rf storage
    ln -sfn $FORGE_RELEASE_DIRECTORY/storage storage
fi

$FORGE_COMPOSER install --no-dev --no-interaction --prefer-dist --optimize-autoloader
$FORGE_PHP artisan optimize           # caches config + routes + views + events in one go
$FORGE_PHP artisan storage:link       # public storage symlink
$FORGE_PHP artisan migrate --force    # idempotent; runs new migrations only

$ACTIVATE_RELEASE()                   # atomic symlink swap (current/ → releases/<id>/)
$RESTART_QUEUES()                     # no-op until M5+ adds queue workers
```

### TLS

- **Provider**: Let's Encrypt (via Forge's automatic integration)
- **Algorithm**: ECDSA secp384r1
- **Renewal**: automatic, every ~60 days
- **HTTP→HTTPS redirect**: handled by an explicit `server { listen 80; ... return 301 ... }` block in the nginx vhost (Forge doesn't add this for monorepo subdir setups, manual edit). See Gotchas.

### Production env vars (on Forge → site → Environment)

Critical ones — full list mirrors `server/.env.example` with prod values:

| Key | Value | Notes |
|-----|-------|-------|
| `APP_ENV` | `production` | |
| `APP_DEBUG` | `false` | never `true` in prod |
| `APP_KEY` | `base64:...` | generated via `php artisan key:generate --force`; **rotating it invalidates all existing tokens and encrypted data** |
| `APP_URL` | `https://api.budojo.it` | |
| `DB_HOST` | `127.0.0.1` | local MySQL |
| `DB_DATABASE` | `budojo` | |
| `DB_USERNAME` | `forge` | |
| `DB_PASSWORD` | (Forge-managed) | reset from Forge → Database Users if lost |
| `CORS_ALLOWED_ORIGINS` | `https://budojo.it,https://www.budojo.it` | comma-separated, parsed by `App\Support\CorsAllowlist` (PR #134) |
| `LOG_CHANNEL` | `daily` | rotates logs |
| `LOG_LEVEL` | `info` | crank to `debug` only when actively investigating |

## Client (Cloudflare Pages)

### Project

- **Name**: `budojo` (Cloudflare Pages project)
- **Production branch**: `main` (matches Forge — same source-of-truth branch)
- **Preview branches**: every other branch + every PR head gets an
  auto-generated `<branch|hash>.budojo.pages.dev` preview URL

### Build configuration

- **Root directory**: `/client` (Cloudflare Pages's equivalent of Forge's
  monorepo subdirectory setting)
- **Build command**: `npm run build`
- **Build output**: `client/dist/client/browser` (the Angular builder
  default)
- **Framework preset**: Angular (auto-detected)

### Custom domains

- `budojo.it` (apex) — added via Pages → Settings → Custom domains
- `www.budojo.it` — added via Pages → Settings → Custom domains
- Cloudflare auto-manages the DNS records and SSL certs for both

### `_redirects` rules (`client/public/_redirects`)

```
/api/*    https://api.budojo.it/api/:splat    200
/*        /index.html                          200
```

- **First rule**: server-side proxy (`200` status = rewrite, not redirect).
  Browser sees same-origin calls to `budojo.it/api/...`; Cloudflare's edge
  fetches `api.budojo.it/api/...` and returns the response. Bypasses CORS
  entirely from the SPA's perspective. Added in PR #136.
- **Second rule**: SPA fallback. Any unknown path returns `index.html` so
  the Angular Router can resolve client-side routes (`/auth/login`,
  `/dashboard/athletes/{id}`, etc.) on direct navigation/refresh.

The Angular builder's `assets` glob in `client/angular.json` already copies
`client/public/**/*` into the build output, so `_redirects` lands at the
right place for Pages to pick up automatically.

## Release flow

```
feature branch (feat/* | fix/* | chore/*)
       │
       │ PR
       ▼
   develop ────────────────► semantic-release → tag vX.Y.Z-beta.N + GitHub pre-release
       │
       │ PR (merge commit, no squash)
       ▼
    main ───────────────────► semantic-release → tag vX.Y.Z + GitHub release
       │
       ├──► Forge auto-deploy (push hook on main)
       │       1. CREATE_RELEASE → releases/<id>/
       │       2. composer install + artisan optimize + migrate --force
       │       3. ACTIVATE_RELEASE → atomic symlink swap
       │       4. nginx graceful reload
       │
       └──► Cloudflare Pages auto-deploy (GitHub integration)
               1. clone repo, cd into client/
               2. npm install
               3. npm run build → dist/client/browser/
               4. push to edge network globally
```

End-to-end: a merge to `main` is live on production in ~90 seconds (Forge
deploy + Pages build run in parallel).

## Operations runbook

### Access the droplet via SSH

```bash
ssh -i ~/.ssh/budojo_forge forge@161.35.20.25
```

The SSH key (`~/.ssh/budojo_forge.pub`) is registered on Forge → Server →
SSH Keys, which propagates to the droplet's `~/.ssh/authorized_keys`.

### Connect to the production database (TablePlus + SSH tunnel)

The MySQL port (`3306`) is bound to `127.0.0.1` on the droplet — no remote
access, no firewall opening needed. Connect via SSH tunnel:

| TablePlus field | Value |
|-----------------|-------|
| Host | `127.0.0.1` (loopback, on the droplet's perspective) |
| Port | `3306` |
| User | `forge` |
| Password | (from Forge → Database Users) |
| Database | `budojo` |
| SSL mode | `PREFERRED`, cert fields **empty** — see Gotchas |
| Over SSH | ON |
| SSH Server | `161.35.20.25:22` |
| SSH User | `forge` |
| SSH Key | path to `~/.ssh/budojo_forge` |

### View application logs

- Forge dashboard → site `api.budojo.it` → **Logs** tab → tails
  `storage/logs/laravel.log`
- Or via SSH:
  ```bash
  tail -f ~/api.budojo.it/current/server/storage/logs/laravel-$(date +%Y-%m-%d).log
  ```

### View nginx access / error logs

```bash
sudo tail -f /var/log/nginx/api.budojo.it-access.log
sudo tail -f /var/log/nginx/api.budojo.it-error.log
```

### Force-redeploy

- Forge dashboard → site → **Deployments** → "Deploy" button
- Or trigger via the deploy hook URL from CI:
  ```
  curl -X POST https://forge.laravel.com/servers/<server-id>/sites/<site-id>/deploy/http?token=<token>
  ```
  (only needed if `Push to deploy` is off, currently it's on)

### Rotate `APP_KEY`

⚠️ Invalidates all existing Sanctum tokens and any encrypted columns. Only
do this if you suspect the key is compromised.

```bash
ssh forge@161.35.20.25
cd ~/api.budojo.it/current/server
php artisan key:generate --show     # shows the new key without writing
# then edit Forge → Environment, paste the new key, save
```

### Add a new prod env var

1. Forge → site → Environment → edit
2. Save → Forge auto-reloads PHP-FPM
3. **Important**: if the var is read at config load time (e.g. via `env()`
   inside a `config/*.php` file), `php artisan optimize` on the next deploy
   will re-cache the config. Until then the new value is read each request
   (slower but correct). To force the cache refresh immediately, click
   "Deploy" on Forge.

## Costs

Approximate monthly recurring:

| Item | Cost | Notes |
|------|------|-------|
| DigitalOcean droplet | ~$24/mo | Hobby tier, 2 vCPU / 2 GB RAM (revisit when traffic justifies a managed DB or larger box) |
| Laravel Forge | ~$12/mo | Hobby plan, 1 server cap |
| Cloudflare Pages | $0 | Free tier covers everything we use (unlimited requests, 500 deploys/month) |
| Cloudflare DNS + CDN | $0 | Free tier |
| Netsons (`budojo.it`) | ~€10/yr | renewed annually |

Total recurring: **~$36/month + €10/year**. No surprises in the contract —
all on usage-friendly tiers.

## Gotchas (chronological, learned during go-live on 2026-04-28)

These complement `.claude/gotchas.md` — they're prod-deploy-specific and
worth carrying forward:

1. **Forge "Root directory" setting is honored by nginx but NOT by the
   default deploy script.** `$FORGE_RELEASE_DIRECTORY` resolves to the
   release dir without the subdirectory adjustment. For a monorepo project
   you must add `cd $FORGE_RELEASE_DIRECTORY/server` (or whatever the
   subdir is) explicitly in the script.

2. **`.env` and `storage` symlinks land at the release dir root.** Forge's
   "Linking environment file" + "Linking storage directories" steps run
   before the deploy script and mirror to `releases/<id>/.env` and
   `releases/<id>/storage`. With Root=`/server`, Laravel looks for these in
   `releases/<id>/server/.env` and `releases/<id>/server/storage`. The
   deploy script needs idempotent `ln -sfn` lines to mirror them into the
   subdirectory. See the deploy script above.

3. **Cloudflare proxy (orange cloud) blocks Let's Encrypt http-01 validation.**
   When activating the LE cert via Forge for `api.budojo.it`, the record
   must be **DNS only (grey cloud)** — LE's challenge GET to
   `http://api.budojo.it/.well-known/acme-challenge/...` must reach the
   droplet directly, not Cloudflare. Switch back to orange (with Cloudflare
   Origin Certificate on Forge + SSL/TLS mode = Full strict) only if you
   want CF caching/WAF — not worth it for a JSON API where every response
   is authenticated and uncacheable.

4. **Forge does not auto-add the HTTP→HTTPS redirect when the Root
   directory changes.** After switching Root to `/server` mid-setup, the
   `server { listen 80; ... return 301 ... }` block disappears from the
   vhost and HTTP requests get "Empty reply from server". Add the block
   manually via Forge → Network → Edit Files → nginx config. The "DO NOT
   REMOVE!" warnings refer to existing `include` directives — adding new
   blocks between them is safe; if Forge ever regenerates the vhost (e.g.
   on SSL re-issue), re-apply.

5. **`fruitcake/php-cors` shortcut on single-origin allowlists.** When
   `cors.allowed_origins` has exactly one entry and no patterns, the
   middleware emits `Access-Control-Allow-Origin: <that origin>` on every
   response regardless of the request `Origin`. The browser still blocks
   mismatched origins, but the server-side allowlist branch is untestable
   in that mode. Production therefore uses 2+ origins
   (`https://budojo.it,https://www.budojo.it`) and the unit tests in
   `CorsTest.php` mirror that.

6. **Laravel `Authenticate` middleware crashes on non-JSON unauthenticated
   requests.** It tries to redirect to `route('login')` which doesn't
   exist in our API-only app, raising `RouteNotFoundException` → HTTP 500.
   The Angular client always sends `Accept: application/json` so it's never
   hit, but curl probes without that header see the 500. Filed as
   follow-up; fix is `redirectGuestsTo(fn () => null)` in
   `bootstrap/app.php`.

7. **MySQL 8 `caching_sha2_password` rejects unencrypted client auth even
   over an SSH tunnel.** TablePlus needs `SSL mode = PREFERRED` (with cert
   fields **empty**) so MySQL's auto-generated self-signed cert satisfies
   the secure-transport check. `DISABLED` fails with "Authentication
   requires secure connection". The TLS layer is redundant inside the SSH
   tunnel but harmless.

8. **Cloudflare Pages does not run a backend.** Relative `/api/*` calls
   from the SPA fall through to the SPA fallback rule (`/* /index.html
   200`) which only serves GET HTML — non-GET methods return 405. Either
   point Angular services at the absolute API URL OR add a Pages rewrite
   rule. We chose the rewrite (PR #136) because it leaves the services
   unchanged and bypasses CORS for SPA traffic.

9. **GitHub auto-close-issue from PR's `Closes #N` is unreliable** in this
   repo (observed across #125, #129, #127, #128, #133). After merging,
   manually close the linked issue with a `Closed by #<PR> (merged in
   <sha>).` comment. The project board "Done" transition also needs a
   manual nudge — see the GitHub Project Board section in
   [`CLAUDE.md`](../../CLAUDE.md) for the project + status-field IDs.

10. **`gh` token scope must include `project`** to add items to the project
    board and update field values via GraphQL. Default `gh auth login` only
    grants `repo, workflow, read:org, gist`. Either run `gh auth refresh
    -s project` (interactive device flow) or generate a classic PAT with
    the `project` scope and inject via `gh auth login --with-token`. Per-
    device tokens — refreshing on Windows does not propagate to the Linux
    session and vice versa.

## What this doc deliberately does NOT cover

- **Backups** — currently zero strategy. Filed as future ops work; needs a
  decision between DO managed DB (with built-in backups), `mysqldump` cron
  on the droplet to a separate disk/object store, or full droplet
  snapshots. Pick one before any meaningful traffic / customer data.
- **Monitoring / alerting** — Forge has basic CPU / memory / disk metrics,
  Cloudflare has Pages analytics. No paging, no alerts. Acceptable while
  there are zero paying users; revisit before launch.
- **Disaster recovery** — droplet snapshots are not configured. Manual
  rebuild from scratch is documented above (Forge config + env vars + a
  fresh git clone). No RPO/RTO targets defined yet.
- **Secret rotation policy** — `APP_KEY` rotation is a one-off operation,
  not a scheduled task. DB password rotation is unscheduled. Pick a
  cadence before SOC-2 / ISO conversations.
