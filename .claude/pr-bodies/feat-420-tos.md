> ⚠️ Placeholder ToS copy — needs legal review before merging.
>
> The text on `/terms` and `/terms/it` is a structural scaffold drafted
> to unblock the registration gate. The technical facts (service
> description, account responsibility, suspension grounds, governing
> law, 30-day grace deletion) reflect what the production system
> actually does — but every paragraph requires lawyer review and sign-off
> before this page can be relied upon as a binding contract. Both pages
> ship with a visible "Placeholder copy — pending legal review" banner.

## What

Adds a public Terms of Service page + a registration-time acceptance gate.

- **Public page** at `/terms` (EN canonical) and `/terms/it` (Italian
  translation), mirroring the `/privacy{,/it}` shape introduced in #291.
- **Registration gate**: the `/auth/register` form gains a second
  `p-checkbox` ("I accept the Terms of Service") next to the existing
  privacy gate. Submit stays disabled until both are ticked, and the
  server independently enforces the rule with Laravel's `accepted`
  validator. On success the server stamps `users.terms_accepted_at = now()`.
- **Footer entry-points**: the landing page footer and every auth-page
  foot-link row (`/auth/{login,register,forgot-password,reset-password}`)
  now expose the `/terms` link alongside Privacy + Sub-processors.

Closes #420

## Why

Privacy (`/privacy`) and sub-processors (`/sub-processors`) pages already
exist as bilingual SPA routes; there was no Terms-of-Service surface.
A ToS is required to enforce acceptable-use rules, limit liability, and
is expected by every B2B prospect reviewing the product before signing
up. The gate also gives us a durable, per-user timestamp of consent —
which is the load-bearing audit trail when the legally-reviewed text
eventually replaces the placeholder.

## How

### Server (Laravel)

- `2026_05_05_100000_add_terms_accepted_at_to_users_table.php` — nullable
  `timestamp` after `email_verified_at`. Kept nullable so pre-#420
  accounts and any future system-only user creation path stay valid;
  the gate is enforced at the FormRequest layer, not as a NOT-NULL DB
  constraint.
- `User` model — column added to `#[Fillable]`, cast as `'datetime'`,
  property docblock updated.
- `RegisterRequest::rules()` — `'terms_accepted' => ['required', 'accepted']`.
  Laravel's `accepted` rule rejects falsy values, missing field, and
  non-truthy strings; matches the SPA's `Validators.requiredTrue`.
- `RegisterUserAction::execute()` — writes `terms_accepted_at => now()`
  inside the same `User::create(...)` array. Computed inside the Action
  so a future CLI/system caller still produces a fully-populated row.
- PEST feature tests:
  - `it('records the terms-of-service acceptance timestamp on the user row')`
  - `it('fails registration when terms_accepted is missing')`
  - `it('fails registration when terms_accepted is false')`
  - existing register / email-verification / welcome-mail tests gain
    `terms_accepted: true` where they POST a valid payload.

### Client (Angular + PrimeNG)

- `client/src/app/features/terms/` mirrors the `privacy-policy/` shape:
  - `terms.component.{ts,html,scss,spec.ts}` — EN at `/terms`.
  - `it/terms-it.component.{ts,html,scss,spec.ts}` — Italian at `/terms/it`.
  - SCSS files reuse the shared `_legal-page` partial; both pages carry
    a placeholder banner identical in shape to the privacy draft banner.
  - Routes wired in `app.routes.ts` next to the existing `/privacy{,/it}`
    block.
- `RegisterComponent`:
  - Adds `terms_accepted: [false, Validators.requiredTrue]` to the form group.
  - Sends `terms_accepted: true` through the `AuthService.register()`
    payload — pinned literal so the wire format stays a strict boolean.
  - HTML adds a second `p-checkbox` + label with three translation keys
    (Before / LinkText / After) so the Italian translation can reorder
    around the embedded `<a routerLink="/terms" target="_blank">`.
- `AuthService.RegisterPayload` gains the typed `terms_accepted: true` field.
- Vitest spec on the register component covers requiredTrue semantics,
  blocked-submit on each missing checkbox independently, payload
  contains the field, and the link's `target="_blank"` + `rel="noopener"`.
- Cypress:
  - New `terms.cy.ts` — public pages: title, placeholder banner,
    version stamp, language toggle, back-home CTA, mobile overflow guard.
  - `auth.cy.ts` — successful-register path now ticks both gates and
    asserts `terms_accepted: true` is in the request body; new
    "blocks submit when terms is missing" + "the terms link points to
    /terms" cases.
  - `landing.cy.ts` — footer assertion gains the `/terms` link.
- `LandingComponent` footer + `RegisterComponent`/`LoginComponent`/
  `ForgotPasswordComponent`/`ResetPasswordComponent` foot-link rows
  gain a discreet `/terms` link.

### i18n (EN + IT in lock-step)

New keys added in both `client/public/assets/i18n/en.json` and
`client/public/assets/i18n/it.json`:

- `auth.shared.terms` ("Terms" / "Termini")
- `auth.register.termsAcceptBefore`, `termsAcceptLinkText`,
  `termsAcceptAfter`, `termsRequired`
- `landing.footer.terms`

The `i18n-keys.spec.ts` parity check stays green.

### OpenAPI + entity docs

- `docs/api/v1.yaml` — `RegisterRequest` gains `terms_accepted: boolean`
  in `required` and `properties`; `/auth/register` description calls
  out the gate behaviour.
- `docs/entities/user.md` — schema row for `terms_accepted_at` + a
  Business-rule paragraph linking the SPA gate to the FormRequest rule
  to the column.
- `docs/legal/terms-of-service.md` — new file. Placeholder markdown
  scaffold so the three-artefact lock-step rule (markdown ↔ EN
  component ↔ IT component) is honoured from day one.

## Out of scope

- **Versioned ToS with re-acceptance.** Today the timestamp is recorded
  once at signup. When counsel publishes the reviewed text, the version
  bump is just a copy edit; if/when we need to *force* existing users
  to re-tick a checkbox the schema will grow a `terms_version_accepted`
  column and a UI gate. Explicitly out of scope here per the issue.
- **Per-jurisdiction T&Cs.** One global text for now.
- **Back-fill `terms_accepted_at` for pre-#420 users.** They stay
  `NULL`; legal will decide whether to grandfather them in or push a
  re-acceptance flow.

## References

- Issue #420
- Pattern reference: #219 (privacy gate), #291 (EN-canonical /privacy
  with `/privacy/it` translation lock-step), #225 (sub-processors page).

## Test plan

- [x] PEST unit + feature tests pass locally — written but not executed
      in this worktree (Docker stack mounts the main repo). CI is the gate.
- [x] Vitest unit tests written for terms components + register form.
- [x] Cypress E2E specs added: `terms.cy.ts` (public pages), `auth.cy.ts`
      (gate flow), `landing.cy.ts` (footer link).
- [x] OpenAPI spec updated; Spectral lint job in CI is the gate.
- [x] `docs/entities/user.md` + `docs/legal/terms-of-service.md` added.
- [x] i18n key parity (`i18n-keys.spec.ts`) verified locally — both
      files have identical leaf-paths and no empty stubs.
- [ ] Manual smoke after CI passes: visit `/terms` + `/terms/it`,
      tick the new gate on `/auth/register`, confirm the API call
      carries `terms_accepted: true`.
- [ ] Legal review of placeholder copy on `/terms` + `/terms/it` +
      `docs/legal/terms-of-service.md` — blocking for this PR's
      "ready to merge" flip.
