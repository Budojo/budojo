# Budojo — one front door for the commands we actually run.
#
# This file is an INDEX, not a second implementation. Every target delegates to
# the script or tool that already owns the behaviour (`.claude/scripts/*.sh`,
# npm, docker compose). Nothing here reimplements a gate, a container name or a
# flag — two sources of truth is how a helper drifts from the thing it wraps.
# If a target needs real logic, it belongs in a script under `.claude/scripts/`
# and the target calls it.
#
# `make` alone prints the list.
#
# Windows shell resolution — measured, not assumed:
#   * `SHELL := bash` is IGNORED by Make on Windows. It silently falls back to
#     cmd.exe, where grep/sed/test do not exist, and every target dies with
#     "'grep' is not recognized".
#   * A bare `bash.exe` resolves to **WSL** when make is invoked from
#     PowerShell — a different machine as far as docker, npm and Windows paths
#     are concerned. Silently running the gates over there would be worse than
#     failing.
# Deriving the shell from `git --exec-path` lands on Git Bash from both
# PowerShell and Git Bash, without hardcoding an install location. Verified
# from both shells.

#
# Elsewhere (Linux, macOS) make defaults SHELL to `/bin/sh`, and `.SHELLFLAGS`
# below passes the bash-only `-o pipefail`. On Fedora that happens to work
# because /bin/sh is a symlink to bash; on Debian/Ubuntu — including the
# ubuntu-latest CI runners — /bin/sh is dash and every target dies with
# "Illegal option -o pipefail". Measured, not assumed. Pin bash explicitly.

ifeq ($(OS),Windows_NT)
GIT_EXEC := $(shell git --exec-path)
ifeq ($(GIT_EXEC),)
$(error Could not locate Git Bash via 'git --exec-path'. Install Git for Windows, or run make from a Git Bash prompt.)
endif
SHELL := $(GIT_EXEC)/../../../bin/bash.exe
else
SHELL := /bin/bash
endif

.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

SCRIPTS := ./.claude/scripts
API     := budojo_api
CLIENT  := budojo_client

.PHONY: help setup up down restart logs seed db mail \
        test test-server test-client test-desktop quick audit \
        desktop desktop-build desktop-package fetch-php \
        gotchas board check-readme

## ---------------------------------------------------------------- setup ----

help: ## Show this list
	@echo ""
	@echo "  Budojo - make targets"
	@echo ""
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Release is a slash command, not a target: /release"
	@echo ""

setup: ## Install the root dev tooling and wire the git hooks (run once per clone)
	npm ci
	@echo ""
	@echo "hooks wired at: $$(git config core.hooksPath || echo '(NOT SET - something went wrong)')"

## ------------------------------------------------------------ dev env ----

up: ## Start the dev environment (API, SPA, Mailpit)
	docker compose up -d
	@echo ""
	@echo "  SPA      http://localhost:4200"
	@echo "  API      http://localhost:8000/api/v1"
	@echo "  Mailpit  http://localhost:8025"

down: ## Stop the dev environment (keeps your data)
	docker compose down

restart: ## Restart the dev environment
	docker compose restart

logs: ## Tail the API + client logs
	docker compose logs -f --tail=80 api client

seed: ## Seed the dev database with test data
	docker exec $(API) php artisan db:seed

db: ## Open a sqlite shell on the dev database
	docker exec -it $(API) sqlite3 /var/www/api/database/sqlite/budojo.sqlite

mail: ## Open Mailpit in the browser
	@if command -v xdg-open >/dev/null; then xdg-open http://localhost:8025; else start http://localhost:8025; fi

## -------------------------------------------------------------- gates ----

test: test-server test-client test-desktop ## Run every pre-push gate

test-server: ## PHP gates: cs-fixer + phpstan + pest
	$(SCRIPTS)/test-server.sh

test-client: ## Angular gates: prettier + eslint + vitest
	$(SCRIPTS)/test-client.sh

test-desktop: ## Desktop gates: tsc + vitest
	$(SCRIPTS)/test-desktop.sh

quick: ## Same gates, skipping the --write formatters (re-runs mid-session)
	$(SCRIPTS)/test-server.sh quick
	$(SCRIPTS)/test-client.sh quick
	$(SCRIPTS)/test-desktop.sh

audit: ## Security advisories across client, server and desktop (production deps)
	@echo "-- client --"
	@docker exec $(CLIENT) sh -c 'cd /app && npm audit --omit=dev' || true
	@echo "-- server --"
	@docker exec $(API) sh -c 'cd /var/www/api && composer audit --no-dev' || true
	@echo "-- desktop --"
	@cd desktop && npm audit --omit=dev || true

## ------------------------------------------------------------ desktop ----

desktop: ## Run the desktop app against the dev SPA (ng serve must be up)
	cd desktop && npm run dev

desktop-build: ## Compile the main process + preload
	cd desktop && npm run build

desktop-package: ## Build the Windows installers into desktop/release (Windows only)
	cd desktop && npm run dist
	@echo ""
	@echo "  Built into desktop/release (version 0.0.0 - CI injects the real one at release time)."
	@echo "  Test it WITHOUT touching your real data:"
	@echo ""
	@echo '      "desktop/release/win-unpacked/Budojo.exe" --user-data-dir="C:/temp/budojo-test"'
	@echo ""
	@echo "  Without that flag it shares %APPDATA%\\Budojo with the installed app."

fetch-php: ## Download + verify the pinned PHP runtime (Windows only)
	cd desktop && npm run fetch:php

## --------------------------------------------------------------- misc ----

gotchas: ## Print the gotchas routing table (read before every push)
	@sed -n '1,25p' .claude/gotchas.md

check-readme: ## Verify the README's command tables list exactly these targets
	@diff <(grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | cut -d: -f1 | sort) \
	      <(grep -oE '^\| `make [a-zA-Z_-]+`' README.md | sed 's/.*make //; s/`//' | sort) \
	  && echo "README is in sync with the Makefile" \
	  || { echo ""; echo "README and Makefile disagree (left = Makefile, right = README) - fix README.md"; exit 1; }

board: ## Set a board status, e.g. make board N=1234 S=in-progress
	@test -n "$(N)" -a -n "$(S)" || { echo "usage: make board N=<issue-or-pr> S=<todo|in-progress|done>"; exit 2; }
	$(SCRIPTS)/board-set.sh $(N) $(S)
