# Entity — `License`

## Purpose

A `License` is one activation key this desktop instance has accepted (#1290).

Budojo Desktop runs on the owner's own machine with no server of ours to call, so activation has to work **offline**. A key carries its own claims and an Ed25519 signature; the app ships only the public half, which cannot mint anything. Verification is a local signature check — no network, no licence server, no phone-home.

The table is deliberately tiny: it records **what was pasted and when**. Everything a key claims (licensee, expiry) lives inside the signed payload and is re-read on every use.

## Wire format

One line, safe to paste into an e-mail:

```
BUDOJO-1-<base64url(payload json)>.<base64url(signature)>
```

The payload is readable on purpose — support can decode a key a customer sends back and see what it claims without a tool. Readability costs nothing: the signature, not obscurity, is what makes a key valid.

| Claim | Type | Required | Meaning |
|---|---|---|---|
| `v` | int | yes | Payload version. Only `1` is accepted. |
| `name` | string | yes | Who the licence is issued to. Shown back in the app. |
| `issued` | `YYYY-MM-DD` | yes | Issue date. Informational. |
| `expires` | `YYYY-MM-DD` | no | Last day the key is valid. Absent = perpetual. |

A key whose `expires` cannot be parsed is **rejected**, not treated as perpetual — otherwise a typo would mint a free licence.

## Schema — `licenses`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | Internal identifier |
| `key` | text | not null | The activation key exactly as pasted. |
| `activated_at` | timestamp | not null | When **this instance** accepted it. Not the key's `issued` claim — that is something the key says about itself; this is our own record of the event. |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |

### Why no `expires_at` / `licensee` columns

They would be a second source of truth. The claims live inside the signed payload, so re-verifying on read is both cheap and the only way they cannot drift from what was actually signed — a cached column is one `UPDATE` away from granting a licence nobody issued.

### Why rows accumulate

A renewal is a **new row**, not an overwrite. The most recently activated row is the licence in force (ties broken by `id`), and the history is the only record of what was activated when.

## Tenant isolation

None — and none is possible. A licence belongs to the **instance**, not to an academy or a user. A desktop instance is one person's machine.

## States

`App\Enums\LicenseStatus` — resolved by `App\Support\LicenseState`, which is pure and unit-tested:

| Status | When | Writes |
|---|---|---|
| `trial` | No key activated and the account is younger than 14 days | allowed |
| `active` | A key verifies and has not expired | allowed |
| `expired` | The trial elapsed, or the activated key's `expires` has passed | **refused** |

## Business rules

- **The trial runs from the first account, not from first launch.** Reinstalling the app, or pointing it at a fresh data directory, must not hand out another free fortnight. `LicenseState::TRIAL_DAYS = 14`.
- **Countdowns round up.** With eleven hours left, the honest answer to "how many days?" is one, not zero.
- **An already-expired key is refused at activation** (`license_key_expired`), rather than stored. Accepting one would replace a working licence with a dead one and lock the owner out with their own paperwork.
- **A key signed by any other keypair is refused** (`license_key_invalid`). Every failure — malformed, tampered, wrong signer, unknown version — collapses to the same code: telling a would-be forger *which* check failed is free help.
- **Reads are never blocked.** Locking an owner out of their own athletes would punish them for a billing state, and the data is on their machine. Only writes stop.
- **Backups and reminders keep running.** The scheduler is untouched by licence state: certificate-expiry reminders keep firing and backups keep being taken on a lapsed instance. The licence buys the ability to keep putting more *in* — never the safety of what is already there.
- **A build with no public key enforces nothing.** It cannot tell a genuine key from a forged one, so it does not pretend to. Refusing every customer's writes because a build-time variable was missing is the one failure worse than not charging them.

## Enforcement

`App\Http\Middleware\EnforceLicense` is applied to the whole API group, so a route added later is gated **by default**. Writes (`POST` / `PUT` / `PATCH` / `DELETE`) answer **402** with `{"message": "license_required"}` once the state is `expired`.

Greying a button out is presentation — anyone who opens devtools can click it anyway — so the API is where "you cannot do this yet" has to be true.

What stays writable is an explicit list in `config/budojo.license.exempt`, each entry a decision someone made on purpose:

| Exempt | Why |
|---|---|
| `api/v1/auth/*` | You cannot paste a key from a login screen you are locked out of. |
| `api/v1/license` | Activation itself — the way out of the blocked state. |
| `api/v1/me/password`, `.../sessions*`, `.../two-factor*` | Security hygiene is never held hostage to a billing state. |
| `api/v1/me/deletion-request*` | The right to erasure is not a paid feature. |
| `api/v1/support`, `api/v1/me/notifications/*` | Reaching a human when you are stuck, and dismissing the notification that told you that you are. |

## Runtime scope

Gated by the `licensing` capability (`App\Enums\Capability::Licensing`), which the **desktop profile has and the web profile does not** — the first capability in that direction. A hosted deployment is licensed by whoever runs it: there is nobody there to paste a key and no trial to expire, so `/api/v1/license` answers 404 there rather than advertising a surface that does not apply.

## Key management

The signing keypair is generated by the maintainer and **never** lives in this repository:

```bash
node .claude/scripts/license-key.mjs keygen
# PUBLIC  → BUDOJO_LICENSE_PUBLIC_KEY (safe to commit / ship)
# PRIVATE → password manager, nowhere else

BUDOJO_LICENSE_SECRET=<private> node .claude/scripts/license-key.mjs mint "Academy name" --expires 2027-08-16
```

### The accepted trade-off

A key cannot be revoked remotely, and a shared key works on another machine. That is the price of never running a licence server, and for a single-instructor product it is the right side of the trade.

## Relations

None. The row stands alone by design — a licence is a fact about the installation, not about anything inside it.
