## What

Closes #330 + #331. Replaces the cold redirect to `/auth/login` at the root with a public marketing page — standard SaaS pattern (Linear / Tally / Cal.com / Plausible as references), founder-voice copy, mobile-first composition, EN + IT in lock-step from day one.

## Why

Hitting `/` cold today drops a first-time visitor straight into a login form with zero context. There's no public surface that explains what Budojo is, who it's for, or what it does. A prospect arriving from a Google search or a shared link sees a login screen and bounces.

The competitive standard for SaaS products targeting prosumer / SMB customers is: public marketing page at `/`, login one click away in the header, sign-up one click away as the primary CTA. This PR closes that gap.

## How

### New surface

- **`client/src/app/features/landing/`** — new standalone OnPush component. Hero (punch line + supporting paragraph + primary CTA), pain section (4 audience-specific bullets), feature grid (6 cards: roster / documents / attendance / payments / pwa / feedback), trust block (3 honest claims, no fake social proof), 3-step how-it-works, MVP-honest pricing tile, discrete footer.

### Routing change (#331's whole scope)

- **`client/src/app/core/guards/public.guard.ts`** — inverse of `authGuard`. Authenticated visitors hitting `/` get bounced to `/dashboard/athletes`; the marketing page is for prospects only.
- **`client/src/app/app.routes.ts`** — replaces `{ path: '', redirectTo: 'auth/login', pathMatch: 'full' }` with the LandingComponent guarded by `publicGuard`. The `/auth/login` and `/auth/register` routes are unchanged; they're just no longer the front door.

### Copy

- **`client/public/assets/i18n/{en,it}.json`** — full `landing.*` keyset, both languages first-class. Italian translated by hand (not machine), founder-voice tone preserved.

### Voice + composition

The issue body (#330) was the brief I worked from. Concretely applied:

- Founder-first, conversational, slightly self-deprecating. No enterprise-speak ("solutions", "leverage", "stakeholders").
- Specific over abstract — "your athletes" not "your users", "the mat" not "your facility".
- Pain section names the exact daily reality (lost notebook, expired med certs, the parent who keeps forgetting to pay, clipboard older than half the students). The instructor reads it and feels "yes, this is me".
- Features as benefits ("Your roster, sorted") with the technical feature in parens-style language inside the body.
- Trust without fake social proof. Three claims that the BJJ / small-academy audience genuinely cares about (built-by-an-instructor, GDPR-first, native Italian).
- Hero visual is a placeholder (soft surface tile with the brand glyph) until we capture real product screenshots — explicitly honest about MVP-phase, no stock mockups.

### Visual register

Same Apple-minimal canon as the dashboard. Same tokens (`var(--p-*)`, `var(--budojo-*)`). Same iconography (`pi pi-*`). Mobile-first; desktop layouts layer in at 768px / 1024px.

## Tests

- **Vitest LandingComponent** (8 cases): hero copy, nav links + sign-up + lang toggle, 4 pain points, 6 features, 3 trust + 3 how-steps, pricing copy, footer links, language switch flips en ↔ it.
- **Vitest publicGuard** (2 cases): pass-through for unauth, redirect to `/dashboard/athletes` for auth.
- **Cypress E2E** (`landing.cy.ts`, 6 cases): cold visit lands on the page, header / hero CTAs route to `/auth/login` + `/auth/register`, footer Privacy + Sub-processors links wired, language toggle flips EN ↔ IT and the hero headline copy reflects the change.

420 vitest specs pass total (+10 from the new specs); prettier + lint + spectral all clean.

## Out of scope (per the issue body)

- **Real product screenshots in the hero** — placeholder until we capture them; same dimensions so a PNG drops in cleanly.
- **Pricing tiers + checkout** — single MVP tile; defer real pricing to its own issue.
- **Blog / changelog index** — `/dashboard/whats-new` covers users; an external blog is a separate marketing decision.
- **Social login (Google / Apple) and magic-link login** — out of scope per #331.

## Reference UIs studied (cadence + composition, not copy)

- **[Linear](https://linear.app/)** — hero+screenshot composition, Apple-minimal restraint.
- **[Tally](https://tally.so/)** — founder-voice / honesty register.
- **[Cal.com](https://cal.com/)** — open-source / EU-grown trust signals.
- **[Plausible](https://plausible.io/)** — GDPR-as-a-feature angle.

## References

- Closes #330 (landing page)
- Closes #331 (login repositioning)
- Pairs with: existing `/privacy` and `/sub-processors` public routes (already outside the dashboard shell)
