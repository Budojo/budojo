## What

M9 PR-A2 — the belt-promotion observer (#608). Extends `AthleteObserver` with an `updated()` hook that auto-creates a `belt_promotion` community post when the athlete's `belt` column changes, scoped to the athlete's academy and attributed to the authenticated user.

Lands ahead of M7 because the observer doesn't depend on athlete-side login — it fires off the existing owner-driven `PATCH /api/v1/athletes/:id` belt change. The data accumulates server-side so by the time M7 + M9 PR-B (feed read API + SPA) land, real academies already have populated celebration posts to show.

### Added behaviour

`AthleteObserver::updated(Athlete $athlete)`:

1. Returns early if the athlete didn't actually change `belt`.
2. Returns early if `Auth::id()` is `null` (console seeder / queue worker context — no user to attribute).
3. Else inserts a `CommunityPost` with `type = belt_promotion`, `visibility = academy`, payload `{ athlete_id, old_belt, new_belt, promoted_at }`, attributed to `Auth::id()`.

### Why inline in the observer (vs an Action)

The community-post creation is a single insert with no side-effects beyond it. Pulling it into a dedicated Action would be ceremony today. **When PR-F lands push-notification fan-out** (gated behind per-user opt-in for `community_belt_celebration`), that's the right time to extract a `CreateBeltPromotionPostAction` so the queue dispatch + opt-in check live next to the create. Until then the observer is the right home.

## Test coverage

6 PEST feature tests / 22 assertions in `tests/Feature/Community/BeltPromotionObserverTest.php`:

- Promoting an athlete (auth as owner) creates exactly 1 `community_posts` row with the correct payload.
- Two consecutive promotions create 2 posts with the right `old_belt → new_belt` chain.
- Updating a non-belt field (first_name, stripes) creates 0 posts.
- Initial athlete creation creates 0 posts (it's the `created` event, observer hook is on `updated`).
- Belt change with NO authenticated user (e.g. seeder) creates 0 posts.
- Cross-academy edge case: post is scoped to the athlete's academy, NOT the auth user's owned academy.

Combined with PR-A's 15 schema tests, the Community/ folder is now at 21 tests / 68 assertions.

## Out of scope

- Feed read API (`GET /api/v1/community/feed`) → stays on #602 (PR-B), post-M7.
- Owner soft-delete endpoint → stays on #602, post-M7.
- SPA `/dashboard/me/feed` page → stays on #602, post-M7.
- Push notifications → PR-F (#606), post all the above.

## Test plan

- [x] `vendor/bin/php-cs-fixer fix` — clean
- [x] `vendor/bin/phpstan analyse --memory-limit=1G` — `[OK] No errors`
- [x] `vendor/bin/pest tests/Feature/Community/` — 21 tests, 68 assertions, all green
- [ ] CI green (phpstan + cs-fixer + pest --parallel + the Angular/OpenAPI/Worker jobs)

## References

- Umbrella: #600 (M9 community layer)
- This sub-issue: #608 (M9 PR-A2 — belt-promotion observer)
- The remaining PR-B surface (API + SPA, post-M7): #602
- PRD: `docs/specs/m9-community.md`
- M7 PRD (the dependency for everything else in M9): #445

Closes #608.
