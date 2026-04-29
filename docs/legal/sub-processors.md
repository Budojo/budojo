# Sub-processors (#225)

Last updated: 2026-04-29

Per GDPR Art. 28 and our DPA template (#220), every third party that
processes personal data on Budojo's behalf must be disclosed publicly so
academy customers can audit the chain. This document is the canonical
list.

## What "sub-processor" means here

A **sub-processor** is any third party that, on Budojo's instruction,
stores, transmits, or otherwise processes personal data of Budojo
academy customers and their athletes. Examples: hosting providers,
CDNs, mail-delivery vendors, error-tracking services.

A vendor that touches **only Budojo's own corporate data** (e.g. our
GitHub source code, our internal billing, a Slack workspace where we
discuss the company) is **not** a sub-processor under this definition —
academy customer data never reaches them.

## Current sub-processors

| # | Provider | Role | Region | Personal data touched | Sub-processor DPA |
|---|---|---|---|---|---|
| 1 | **Cloudflare, Inc.** | DNS, edge proxy / CDN, TLS termination, WAF for `budojo.it`, `www.budojo.it`, `api.budojo.it`. Also hosts the SPA build via Cloudflare Pages. | Global edge (data lives in EU edges by default + transit through global PoPs) | Request metadata (IPs, headers), TLS handshake; the SPA bundle itself. NO database access. | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) |
| 2 | **DigitalOcean, LLC** | VM (droplet) hosting the Laravel API + MySQL + local document storage in Frankfurt. | EU (`fra1` region) | All academy + athlete records (DB), uploaded documents (disk), application logs. | [DigitalOcean DPA](https://www.digitalocean.com/legal/data-processing-agreement) |
| 3 | **Laravel Forge (Tighten Co.)** | Provisioning + deploy automation for the DigitalOcean droplet. Forge connects via SSH to push deploys; it does NOT proxy customer traffic. | US-managed control plane; the droplet (where data lives) stays in DigitalOcean EU. | Server-level metadata (deploy logs, env-var contents Forge needs to render). The Laravel `.env` includes the DB password and APP_KEY but NOT customer data. | [Forge / Tighten DPA](https://tighten.com/legal/dpa) |

## Planned sub-processors (not yet active)

These will be activated as the corresponding feature ships. Each
addition is preceded by a customer notification (see "Change process"
below) and an audit re-read of this list.

| Provider | Role | Activates with |
|---|---|---|
| **Email delivery vendor** (TBD — choice between Postmark, Resend, Mailgun EU) | Transactional emails (verification, M5 notifications, deletion confirmations). | M5 notifications (#218 / planned); the choice is locked when we add the first non-verification email. EU vendors preferred to avoid SCC overhead. |
| **Sentry** (or comparable error tracker) | Browser + server error capture, source-mapped stack traces. | When we adopt error tracking (open question per the cookie audit #221). |
| **Stripe Inc.** | Payment processing for the Budojo SaaS subscription itself (NOT the academy ↔ athlete payment ledger, which lives in our DB). | When we monetise (post-launch). |

## Change process

Adding, replacing, or removing a sub-processor follows this flow:

1. Update this file in a PR. Body must explain the change + the data
   categories the new vendor touches.
2. Email every active academy customer at least **30 days before**
   the new vendor goes live, citing the updated list (link to this
   page) and the date.
3. Customers may object in writing within those 30 days. A blocking
   objection means we either drop the change or terminate the
   customer's contract pro-rata.
4. After the 30-day window with no blocking objections, the new
   vendor goes live and this list is final.

Removing a sub-processor (e.g. switching email vendor) follows the
same process — the new vendor is a planned add, the old one drops
off the list once the cut-over is complete.

## Auditing this list against the codebase

A future engineer (or auditor) can verify this list is accurate by
grep:

```bash
# Hosting and infra
grep -rn "Cloudflare\|DigitalOcean\|Forge" docs/infra/

# SPA-side third parties (analytics, tracking, embeds)
grep -rE "google-analytics|sentry|stripe|mailgun|postmark" client/src/ client/package.json

# Server-side third parties (composer deps + .env)
grep -rE "sentry|stripe|mailgun|postmark|sendgrid" server/composer.json
```

Anything that turns up there but is missing from THIS file is a
sub-processor we forgot to disclose — which is a privacy incident.

## Related

- DPA template — `docs/legal/dpa-template.md` (#220)
- Cookie audit — `docs/legal/cookie-audit.md` (#221)
- Production deployment runbook — `docs/infra/production-deployment.md`
