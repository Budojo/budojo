# Entity — `SupportTicket`

## Purpose

Persisted record of a user submitting the dedicated `/dashboard/support` contact form (#423). The row is the audit trail; the side-effect (a queued `SupportTicketMail` to the support inbox) is what actually opens the support thread.

The form is **separate from in-app feedback** (#311). Feedback is fire-and-forget product feedback / bug reports — no reply expected, no Reply-To set on the email, no row persisted. Support is the "I want an answer back" channel: the email has Reply-To set to the user, the inbox owner can hit Reply directly, and the response lands in the user's mailbox without any further routing.

## Why a row, not just an email

The feedback feature deliberately stores nothing — it's a low-stakes drop-the-message-in-the-inbox surface. Support is different in two ways:

- **Paper trail.** A user filing a ticket has expressed they need help; we want to be able to answer "did this user actually contact us about X?" without rummaging through email search. The row is the canonical answer.
- **Best-effort mail.** Because the row is the load-bearing artefact, the email queue insert is wrapped in a `try/catch + report()` (mirroring `RegisterUserAction::execute()`'s welcome-mail dispatch). A queue blip does NOT 500 the request and the row still lands.

## Schema — `support_tickets`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `user_id` | bigint unsigned | FK `users.id`, **nullable**, null on delete | The author. Nullable to keep the schema forward-compatible with the planned logged-out fallback path (a public `mailto:` link in the marketing footer would not have a user); the current PR only wires the authenticated form |
| `subject` | string(100) | not null | User-supplied — 3..100 chars, validated at the FormRequest |
| `category` | string(32) | not null | One of `account` / `billing` / `bug` / `other` (the `SupportTicketCategory` PHP enum). String column rather than `enum(...)` so a future fifth case can land without an `ALTER TABLE` |
| `body` | text | not null | User-supplied — 10..5000 chars, validated at the FormRequest |
| `created_at` | timestamp | not null, default `CURRENT_TIMESTAMP` | Submission time |

**No `updated_at` column.** Tickets are immutable from the user's perspective — there is no edit endpoint. The model sets `const UPDATED_AT = null` so Eloquent does not try to write a column the schema doesn't have.

## Relations

- `belongsTo(User::class)` — exposed as `$ticket->user`. Returns `null` when `user_id` is null (the planned logged-out path).

## Indexes

- `PRIMARY KEY(id)`
- `INDEX(user_id)` — eventual "tickets I submitted" view
- `INDEX(created_at)` — chronological browsing in the eventual ops dashboard

## Categories — `SupportTicketCategory`

The four cases reflect the most common reasons a user reaches out. Backed string enum, lower-case backing values cross the API boundary verbatim (the Angular client mirrors them as a typed union).

| Case | Backing value | Typical scope |
|---|---|---|
| `Account` | `account` | Login issues, profile changes, deletion / GDPR questions |
| `Billing` | `billing` | Pricing, invoicing, payment-method questions (placeholder until Budojo has a paid tier) |
| `Bug` | `bug` | Something is broken and the user expects a fix or a workaround |
| `Other` | `other` | Anything that doesn't fit — feature requests with a question, partnership, accessibility |

## Business rules

- **Throttle 5 req/min per user.** Same shape as `/feedback` (#311) — a script can't blast the support inbox.
- **Best-effort mail dispatch.** The action wraps `Mail::queue(...)` in `try/catch` + `report()` so the persisted row survives a queue insert failure. Mirrors `RegisterUserAction`.
- **Reply-To = user.** The `SupportTicketMail` envelope sets Reply-To to the authenticated user's email + name. The From: address stays at `MAIL_FROM_ADDRESS` so DKIM / SPF align with the Resend sender domain.
- **Subject prefix carries the category.** The email subject is `"[Budojo support · <category>] <user subject>"` so the inbox owner can filter / route at a glance without opening the body.
- **No academy scoping.** A pre-setup user (no academy yet) can still file a ticket. The form is help-the-user-first; the support response is human, not query-scoped.

## Related endpoints

- `POST /api/v1/support` — file a ticket. Returns 202 with `{ data: { id, created_at } }`.

## Out of scope (future / TODO)

These were explicitly cut from #423 to keep the surface small:

- **Status / threads / attachments.** Full ticketing (open / in-progress / resolved, two-way conversation, file uploads). The schema is intentionally append-only today; a follow-up adds a `status` column + a sibling `support_messages` table.
- **Live chat.** Out of scope.
- **Logged-out fallback.** The public footer's `mailto:` link is the placeholder for now; a future PR can wire the form for unauthenticated users (the `user_id` nullable column already accommodates this).
- **User-facing "my tickets" page.** No GET endpoint today — the user has the email thread, that's enough until the surface justifies a UI.
