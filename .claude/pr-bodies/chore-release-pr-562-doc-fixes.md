## What

Address Copilot review on the v2.5.0 release PR (#562). Same shape as #543 / #552 / etc. — a small chore PR into `develop` that fixes the comments, then the release PR can land cleanly.

## Why

Copilot flagged four real issues across the 4 features in the v2.5.0 train:

1. **`stripTokenFromUrl()` lands on a 404-trap URL.** `/account/deletion-cancel` (no token) wasn't a defined route, so a refresh after consume hit the wildcard 404 instead of re-rendering the confirmation state.
2. **`NotificationPreferences::isEnabled` mis-treats corrupt data.** `'false'` (string), `0` (int), arrays, etc. all evaluated to "disabled", but the docblock claims any non-true value should be treated as default-enabled.
3. **Extra DB lookup on the high-volume failed-login path.** `LoginController` did its own `User::query()->where('email')` after `LoginUserAction` had already queried by email — doubling queries on every wrong-password attempt.
4. **No rate limit on the public `/me/deletion-request/cancel/{token}` endpoint.** Even with a 64-char high-entropy token, a script hammering random tokens would still spam the DB.

## How

### 1. Cancel-page route 404 trap

- New token-less route `account/deletion-cancel` registered alongside `account/deletion-cancel/:token`. Both load the same component.
- Component now treats a missing `:token` param as the `no-longer-pending` state instead of `error` — factually correct after a successful consume + URL strip + refresh, and avoids the 404 wildcard. Spec assertion updated.

### 2. `isEnabled` opt-out semantics

```diff
-return $value === null || $value === true;
+return $value !== false;
```

Now opts the user out ONLY when the stored value is the boolean `false`. Any other unexpected value (`'false'`, `0`, an array, …) is treated as "default enabled" so corrupt JSON can't accidentally silence notifications.

### 3. LoginUserAction → LoginResult value object

- New `App\Actions\Auth\LoginResult` carrying `?User $user` (auth outcome) AND `?int $matchedUserId` (the user id whose email was queried, regardless of password outcome).
- `LoginUserAction::execute` now returns `LoginResult` instead of `?User`. The single email lookup is reused for both auth AND audit attribution.
- `LoginController` reads `$result->matchedUserId` for the audit row and `$result->user` for the session token. The previous `User::query()->where('email')->first()?->id` fallback is gone — failed-login path now does ONE DB query, not two.

### 4. Rate limit on cancel-by-token

```diff
 Route::post('/me/deletion-request/cancel/{token}', [\App\Http\Controllers\User\AccountDeletionController::class, 'cancelByToken'])
-    ->where('token', '[A-Za-z0-9]{64}');
+    ->where('token', '[A-Za-z0-9]{64}')
+    ->middleware('throttle:10,1');
```

10 req/min/IP. Mirrors the `/athlete-invite/{token}/accept` throttle (5/min); we sit a notch higher to absorb a legitimate user's dev-tools refresh loop.

## References

- #562 — release PR
- #543 / #552 — same-shape doc-fix branches for prior releases (v2.3.2 / v2.4.0)

## Test plan

- [x] PHPStan clean
- [x] PEST scope green (204 specs, 677 assertions)
- [x] Vitest 751 specs green
- [x] Lint + Prettier clean
