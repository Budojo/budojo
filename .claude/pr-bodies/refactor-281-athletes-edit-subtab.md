## What

Closes #281. Two intertwined UX moves on the athletes screens:

- **Athletes list** — drop the redundant folder icon. The athlete name becomes the canonical tap target into the detail (low-chrome link with hover underline). Pencil + trash kept inline for the fast paths.
- **Athlete detail** — the Edit form moves INSIDE the tab strip, alongside Documents / Attendance / Payments. Header (name, belt, status, contacts) stays visible while editing.

## Why

Three problems the issue called out (and the screenshot showed):

1. **Folder icon was redundant** — it routed into the detail's default tab (Documents), exactly what a row tap does in well-designed list UIs. Three icon hints + a clickable row read as too much (Krug § "self-evident UI").
2. **Edit lived outside the athlete's home** — going from Documents → Edit was "leave page → load form → save → bounce back" instead of "switch tab → save in place". Norman § affordance: the editor belongs in the page about the thing it edits.
3. **Hick's Law** — one fewer top-level decision in the route tree (no more sibling `/athletes/:id/edit`); one fewer per-row icon to scan.

## How

### Athletes list

- Removed the `<p-button icon="pi pi-folder">` cell from the actions column. `goToDocuments()` handler dropped (was its only caller).
- Athlete name (`<span class="athlete-name__text">`) becomes a `routerLink="/dashboard/athletes/:id"` element. Styled as a link by intent — `color: inherit` at rest, `color: var(--p-primary-color); text-decoration: underline` on hover / focus. Same low-chrome row-link pattern the academy detail page uses for phone/website chips.
- Empty-message `colspan` tightened from `hasMonthlyFee() ? 7 : 6` (which was always one off — the visible-column count was 5/4) to `5 : 4` matching the actual column shape post-folder-removal.

### Athlete detail

- New `<p-tab value="edit" routerLink="edit">` in the tab strip with `pi-pencil` icon + label "Edit".
- `AthleteDetailComponent.tabFromUrl` now returns `'edit'` when the URL ends in `/edit`, completing the tab-indicator wiring.

### Routes (`app.routes.ts`)

- `/athletes/:id/edit` was a SIBLING route to `/athletes/:id`. Moved to be a CHILD of the detail (alongside `documents`, `attendance`, `payments`).
- `/athletes/:id/edit` URL still resolves — same path as before, just inside the parent's `<router-outlet />` now. **Existing inbound links keep working** (deep-link from the list pencil, manual URL share, browser back-button).
- `paramsInheritanceStrategy: 'always'` added to `provideRouter` so the child routes inherit `:id` from the parent. Without it, `AthleteFormComponent`'s `route.paramMap.get('id')` would return null on the child route — forcing every child to read `route.parent?.paramMap` instead.

### Cypress

`athlete-documents.cy.ts` had a spec called "navigates to documents from folder icon" using `[data-cy="documents-btn"]`. Repurposed to "navigates to the athlete detail (default tab: documents) from the list name link" using `[data-cy="athlete-name-link"]`. Same intent, new selector.

## Tests

- Vitest: 380 pass (component + form + tab specs; +1 for the cancel-from-edit case added on the Copilot-driven fix).
- Cypress: existing folder-icon spec rewired to the name-link selector. No new specs added.

### Form navigation (post Copilot review, 590aac8)

`AthleteFormComponent.submit()` and `cancel()` used to bounce to `/dashboard/athletes` (the LIST), which contradicted the new "stay in the athlete's home" UX. Fixed:

- **Submit on update** (`id !== null`) — navigate to `/dashboard/athletes/:id`. Default child route is Documents, so the user lands on the same tab strip they came from.
- **Submit on create** (`id === null`) — take the new id from the POST response and navigate to `/dashboard/athletes/<new-id>`.
- **Cancel from `/athletes/:id/edit`** — return to `/dashboard/athletes/:id`.
- **Cancel from `/athletes/new`** — still `/dashboard/athletes` (the list — no parent detail to return to).

Two new specs cover both cancel paths; the two existing submit specs were retargeted to the new destinations. Vitest count moved 379 → 380.

## Out of scope

- Inline cell editing on the list. Different feature.
- Athlete creation flow at `/athletes/new`. Stays as a top-level sibling — that flow has no parent athlete to nest under.

## Test plan

- [x] `npx prettier --write` — clean.
- [x] `npm run lint` — clean.
- [x] `npm test -- --watch=false` — 379 pass.
- [ ] Cypress green in CI.
- [ ] Manual smoke: load `/dashboard/athletes`, click an athlete's name → land on `/dashboard/athletes/:id/documents`. Click pencil on another row → land on `/dashboard/athletes/:id/edit` with the Edit tab active and the athlete header still visible.
- [ ] Browser back from Edit tab → back to athletes list (router history honored).
- [ ] Mobile: athlete name still readable (link styling subtle, hover state works on touch).

## References

- Closes #281.
- Adjacent: #260 / #259 (payments features the row already adopted).
