# Developing Budojo on Linux

Linux is the **development base** ([#1299](https://github.com/Budojo/budojo/issues/1299)). Everything in this repo was written on Windows first, so this file records what is different — and, just as usefully, what turned out not to be.

Verified on **Fedora 44** (kernel 7.1, SELinux enforcing, Docker 29.7 rootful, Compose v5.4, Node 22). Other distros differ only where noted.

## Prerequisites

| | |
|---|---|
| Docker Engine + Compose v2 | `docker compose version` |
| Node 22+ / npm | for the root tooling and `desktop/` |
| GNU make, git, curl, jq | `make --version` |

Your user must be in the `docker` group (`id -nG \| grep docker`), or every `docker` call needs sudo. Log out and back in after `usermod -aG docker $USER` — group membership is only picked up at login.

You do **not** need PHP or Composer on the host. The API container installs and runs both.

## The one-time setup

Identical to the Windows sequence, which is the point:

```bash
git clone https://github.com/Budojo/budojo.git
cd budojo
make setup          # npm ci at the root — installs husky/commitlint AND wires the git hooks
make up             # builds the images, boots API + SPA + Mailpit
make seed           # optional: admin@example.it / password, one academy, 40 athletes
cd desktop && npm ci && cd ..   # desktop gates run on the host, not in Docker
```

First `make up` takes a few minutes: the API image compiles PHP extensions, then the entrypoint runs `composer install` and the client container runs `npm install`. Later boots are seconds.

Verify:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/api/v1/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4200                 # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8025                 # 200 (Mailpit)
```

## File ownership — the difference that actually bites

This is the single behavioural change between the two platforms, and it is worth understanding rather than working around.

On Windows, `./server` and `./client` reach the container through Docker Desktop's 9p/virtiofs share. That share **fabricates ownership** and silently discards `chown(2)`. On Linux a bind mount is the host's real filesystem: the container shares your inodes and your uid namespace. Every file it creates lands on the host owned by whoever created it, and a `chown` inside the container really re-owns your file.

Uncorrected, a single `make up` + `make test` left **15,238 files** under `server/` unwritable by the developer — `vendor/`, everything PEST materialises under `storage/framework/`, and `server/.env`, which is the one file the whole app is configured by.

The repo handles this in three places, so on a normal single-user box you should never see it:

- `docker/api/Dockerfile` and `docker/client/Dockerfile` remap their service user (`www-data`, `node`) to uid/gid **1000** at build time.
- `docker/api/entrypoint.sh` hands `vendor/`, `.env`, `storage/` and `bootstrap/cache` back to that user on every boot.
- `.claude/scripts/test-server.sh` runs the PHP gates with `docker exec -u www-data`, so PEST's scratch files are yours too.

**If your uid is not 1000** (`id -u`), build with it:

```bash
HOST_UID=$(id -u) HOST_GID=$(id -g) docker compose build
```

Compose reads those through `${HOST_UID:-1000}` in `docker-compose.yml`. They are **build** args — nothing is injected into the container's environment, so the `env_file` trap documented at the top of `docker-compose.yml` does not apply here.

### If you already have root-owned files

From a checkout that predates the fix, or after running a container as root by hand. You do not need sudo:

```bash
docker run --rm -v "$(pwd)":/w -w /w alpine:3 chown -R "$(id -u):$(id -g)" server client
find server client ! -uid "$(id -u)" | wc -l    # expect 0
```

## SELinux

Fedora, RHEL and openSUSE ship SELinux enforcing, and the usual advice is that Docker bind mounts need a `:z` / `:Z` label. **Not here**, and the reason is worth recording so nobody adds the labels speculatively:

```bash
$ docker info | grep -A3 'Security Options'
 Security Options:
  seccomp
   Profile: builtin
  cgroupns
```

No `selinux` entry — the daemon was not built or started with SELinux integration, so it does not confine containers by type and does not relabel mounts. Probed directly: a container bind-mounting `./server` both reads and writes it with no label.

`docker-compose.yml` therefore carries **no `:z` suffixes**. If you ever enable SELinux support in `/etc/docker/daemon.json`, both bind mounts start failing with permission-denied and the labels become necessary — check `docker info` first when diagnosing a sudden EACCES.

## Running the gates

Unchanged. Server and client run inside their containers; desktop runs on the host because `desktop/node_modules` carries platform binaries.

```bash
make test           # all three
make test-server    # cs-fixer + phpstan + pest      (in budojo_api, as www-data)
make test-client    # prettier + eslint + vitest      (in budojo_client)
make test-desktop   # tsc --noEmit + vitest           (on the host)
```

All three are green on Linux — 1240 PEST, 1501 client Vitest, 114 desktop Vitest.

## Cypress

The `budojo_client` container is Alpine and cannot launch Cypress's glibc Electron, so E2E goes through the `cypress/included` image. On Linux add `--user` or every screenshot and video lands root-owned in your working tree:

```bash
cd client
docker run --rm --network host \
  --user "$(id -u):$(id -g)" \
  -v "$(pwd)":/e2e -w /e2e \
  cypress/included:15.15.0 \
  --spec 'cypress/e2e/academy.cy.ts' --config video=false --browser electron
```

The image ships `/root` and `/root/.cache/Cypress` mode 0777, so an unprivileged user still reaches the Cypress binary. `--network host` genuinely works on Linux, which is what lets the container reach `ng serve` on `localhost:4200`.

**Stop the API before running existing specs.** The specs mock every call they use and assume nothing else answers — which is what CI gives them, since `proxy.conf.json` targets `http://api:80`, a name that does not resolve on a GitHub runner. Locally that name *does* resolve, so an unmocked background poll (`GET /api/v1/me/notifications`) gets a real `401`, the auth interceptor redirects to `/auth/login`, and everything after it fails. Measured on `academy.cy.ts`:

| | Passing | Failing |
|---|---|---|
| API container running | 4 | 6 |
| `docker compose stop api` | **10** | **0** |

```bash
docker compose stop api && <run cypress> ; docker compose start api
```

Full recipe and the screenshot workflow: [`visual-verification.md`](./visual-verification.md).

## Desktop app

`make desktop-build` (tsc) and `make test-desktop` work on Linux today. Electron itself runs fine — no missing shared libraries on a Workstation install, and XWayland covers the Wayland session.

**Running or packaging the app does not work yet.** `make desktop`, `make fetch-php` and `make desktop-package` are Windows-only: the bundled PHP runtime is a `php-*-Win32-*.zip`, `resolveDesktopPaths` hardcodes `php.exe`, and the backup zip goes through PowerShell. Porting that is [#1300](https://github.com/Budojo/budojo/issues/1300).

## Known cosmetics

- `make` pins `SHELL := /bin/bash` outside Windows. Without it Debian/Ubuntu's dash rejects the bash-only `-o pipefail` in `.SHELLFLAGS` and every target dies; Fedora only worked because its `/bin/sh` is bash.
- `ng serve` runs with `--poll 500`, a Docker-Desktop-on-Windows workaround for inotify events not crossing the share. On Linux inotify works natively and the poll is wasted CPU — harmless, not yet removed.

## See also

- [`git-flow.md`](./git-flow.md) — branch model and commit format
- [`visual-verification.md`](./visual-verification.md) — the in-browser smoke rule
- [`.claude/gotchas.md`](../../.claude/gotchas.md) § Dev environment — the pre-push checklist
