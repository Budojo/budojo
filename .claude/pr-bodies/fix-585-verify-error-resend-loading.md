## What

One-line template fix in `verify-error.component.html`: binds the already-tracked `sending` signal to the resend button's `[loading]` prop.

```diff
   @if (canResend) {
     <p-button
       type="button"
       severity="primary"
       [label]="'auth.verifyError.resendCta' | translate"
+      [loading]="sending()"
       (onClick)="resend()"
       data-cy="verify-error-resend"
     />
   } @else { … }
```

Closes #585.

## Why

The component already tracked the in-flight state via a `sending` signal (toggled in `resend()`), and used it as a re-entrancy guard inside the click handler — but the binding to the BUTTON's loading prop was missing. Net effect pre-fix: user clicks "Resend verification email", sees no visible feedback for the duration of the HTTP request, then either gets redirected (success) or a toast (error).

Violates two design-canon rules from `client/CLAUDE.md`:

- **Norman § Feedback** — "Every user action must produce feedback within **300ms**. A submit button shows `loading` (spinner) immediately on click."
- **Don't Make Me Think** — if the click looks like it did nothing, the user clicks again. The TS-side guard already catches the double-fire silently, but visible feedback is the right fix.

`p-button[loading]` shows a spinner + disables click — covers feedback AND the re-entrancy concern from the template side, so the TS guard becomes belt-and-braces rather than the sole defence.

## Out of scope

- Adding a Vitest spec for `verify-error` (currently has none — separate issue).
- Same audit on other components — quick `[loading]` grep didn't turn up obviously analogous offenders, but a broader sweep is its own ticket.

## Test plan

- [x] `prettier --write` — clean
- [x] `npm run lint` — `All files pass linting.`
- [x] `npm test -- --watch=false` — 94 spec files, 794 tests pass (no changes to spec count — fix is template-only)
- [ ] CI green
- [ ] No URL changes / no Cypress impact (verify-error isn't in any Cypress spec today)

### Post-merge smoke (manual)

- Trigger an expired-link verification redirect (or visit `/auth/verify-error` while logged in), click "Resend verification email", confirm the button shows the PrimeNG spinner for the full duration of the request and the second click is blocked while in-flight.

## Provenance

Spotted during PR #582 (`<app-verify-page>` extract) and filed separately for scope hygiene. The diagnostic comes from the same `/graphify`-surfaced refactor pass.
