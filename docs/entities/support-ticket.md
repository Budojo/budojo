# Entity — `SupportTicket`

## Purpose

Persisted record of a user submitting the dedicated `/dashboard/support` contact form (#423). The row is the audit trail; the side-effect (a queued `SupportTicketMail` to the support inbox) is what actually opens the support thread.

The form is the **single contact channel** in the SPA. Post-v1.17.0 the legacy `/dashboard/feedback` page (#311) was retired and its responsibilities folded into support: the screenshot upload, the auto-attached app-version + User-Agent, and a new `feedback` category for messages where the user is sharing input rather than expecting a reply. The Reply-To header is still set to the user on every category, so the support inbox can hit Reply at any time.

## Why a row, not just an email

- **Paper trail.** A user filing a ticket has expressed they need help; we want to be able to answer "did this user actually contact us about X?" without rummaging through email search. The row is the canonical answer.
- **Best-effort mail.** Because the row is the load-bearing artefact, the email queue insert is wrapped in a `try/catch + report()` (mirroring `RegisterUserAction::execute()`'s welcome-mail dispatch). A queue blip does NOT 500 the request and the row still lands.

## Schema — `support_tickets`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `user_id` | bigint unsigned | FK `users.id`, **nullable**, null on delete | The author. Nullable to keep the schema forward-compatible with the planned logged-out fallback path (a public `mailto:` link in the marketing footer would not have a user); the current PR only wires the authenticated form |
| `subject` | string(100) | not null | User-supplied — 3..100 chars, validated at the FormRequest |
| `category` | string(32) | not null | One of `account` / `billing` / `bug` / `feedback` / `other` (the `SupportTicketCategory` PHP enum). String column rather than `enum(...)` so a future sixth case can land without an `ALTER TABLE` |
| `body` | text | not null | User-supplied — 10..5000 chars, validated at the FormRequest |
| `app_version` | string(32) | nullable | SPA build tag at submission time (read from the `X-Budojo-Version` request header). Auto-attached, never asked from the user. Null on legacy rows from before the post-v1.17 consolidation, and on tickets filed via clients that don't set the header |
| `user_agent` | string(512) | nullable | Browser User-Agent verbatim, truncated to 512 chars. Same auto-attach contract as `app_version` |
| `created_at` | timestamp | not null, default `CURRENT_TIMESTAMP` | Submission time |

**No `updated_at` column.** Tickets are immutable from the user's perspective — there is no edit endpoint. The model sets `const UPDATED_AT = null` so Eloquent does not try to write a column the schema doesn't have.

## Relations

- `belongsTo(User::class)` — exposed as `$ticket->user`. Returns `null` when `user_id` is null (the planned logged-out path).

## Indexes

- `PRIMARY KEY(id)`
- `INDEX(user_id)` — eventual "tickets I submitted" view
- `INDEX(created_at)` — chronological browsing in the eventual ops dashboard

## Categories — `SupportTicketCategory`

The five cases reflect the most common reasons a user reaches out. Backed string enum, lower-case backing values cross the API boundary verbatim (the Angular client mirrors them as a typed union).

| Case | Backing value | Typical scope |
|---|---|---|
| `Account` | `account` | Login issues, profile changes, deletion / GDPR questions |
| `Billing` | `billing` | Pricing, invoicing, payment-method questions (placeholder until Budojo has a paid tier) |
| `Bug` | `bug` | Something is broken and the user expects a fix or a workaround |
| `Feedback` | `feedback` | "I'm telling you something" — feature requests, ideas, observations. Reply-To still set so a follow-up is possible |
| `Other` | `other` | Anything that doesn't fit |

## Optional screenshot attachment

The form accepts a single optional image upload (PNG / JPEG / WEBP, max 5 MB). The bytes are **read inline at request time** and carried on the queued `SupportTicketMail` as an `Attachment::fromData(...)` payload — the queue serialiser captures them inside `jobs.payload`, so the worker still has the screenshot when it sends the email. The image is **never persisted to disk** as its own server-side artefact; once the email leaves the queue, only the database row remains. An earlier draft of this page described the upload riding by reference to its request-temp path and being "discarded with the request lifecycle"; that shape was unreliable (the request's tmp dir is unlinked before the queue worker runs) and was replaced with the inline-bytes design in PR #446.

## Business rules

- **Throttle 5 req/min per user.** A script can't blast the support inbox.
- **Best-effort mail dispatch.** The action wraps `Mail::queue(...)` in `try/catch` + `report()` so the persisted row survives a queue insert failure. Mirrors `RegisterUserAction`.
- **Reply-To = user.** The `SupportTicketMail` envelope sets Reply-To to the authenticated user's email + name. The From: address stays at `MAIL_FROM_ADDRESS` so DKIM / SPF align with the Resend sender domain.
- **Subject prefix carries the category.** The email subject is `"[Budojo support · <category>] <user subject>"` so the inbox owner can filter / route at a glance without opening the body.
- **No academy scoping.** A pre-setup user (no academy yet) can still file a ticket. The form is help-the-user-first; the support response is human, not query-scoped.
- **Auto-attached client context.** `app_version` (from `X-Budojo-Version`) and `user_agent` (from the standard header) are persisted on the row AND surfaced in the support email. Never asked from the user. The Mailable substitutes `"unknown"` when either is missing so the email never renders a literal blank line.

## Related endpoints

- `POST /api/v1/support` — file a ticket (multipart). Returns 202 with `{ data: { id, created_at } }`.

## Out of scope (future / TODO)

These were explicitly cut from #423 to keep the surface small:

- **Status / threads / multiple attachments.** Full ticketing (open / in-progress / resolved, two-way conversation, multi-file uploads). The schema is intentionally append-only today; a follow-up adds a `status` column + a sibling `support_messages` table.
- **Live chat.** Out of scope.
- **Logged-out fallback.** The public footer's `mailto:` link is the placeholder for now; a future PR can wire the form for unauthenticated users (the `user_id` nullable column already accommodates this).
- **User-facing "my tickets" page.** No GET endpoint today — the user has the email thread, that's enough until the surface justifies a UI.
