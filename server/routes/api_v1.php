<?php

declare(strict_types=1);

use App\Http\Controllers\Stats\StatsController;
use Illuminate\Support\Facades\Route;

// Public routes
Route::get('/health', fn () => response()->json(['status' => 'ok']));

// Runtime profile + capability list (#1229). Public: the SPA reads it before
// login, because the register / landing pages already differ by runtime.
Route::get('/runtime', \App\Http\Controllers\Runtime\RuntimeController::class);
Route::post('/auth/register', \App\Http\Controllers\Auth\RegisterController::class);

// Login is rate-limited to 5 attempts / minute / IP via Laravel's standard
// throttle middleware (#414). Without a limiter the password field is
// brute-forceable at network speed against any known email — the controller
// returns 401 in O(ms) and there is no inherent backoff. The cap is loose
// enough that an honest user fat-fingering their password 3-4 times still
// gets through, but a script grinding passwords hits 429 quickly. Keyed on
// IP (Laravel's default for unnamed throttle) — keeping the key strategy
// idiomatic avoids the email-keyed trade-off where an attacker can lock
// out a known account by spamming its email from a botnet.
Route::post('/auth/login', \App\Http\Controllers\Auth\LoginController::class)
    ->middleware('throttle:5,1');

// Password reset (M5 PR-A). Both endpoints are public — a logged-out
// user is the whole point of the flow.
//
// `/forgot-password` is rate-limited via the `password-reset-request`
// named limiter (6 / minute / IP — see AppServiceProvider::boot()) so
// a script can't spray the mail vendor at our expense. The endpoint
// always returns 202 regardless of whether the email matches a
// registered user (no enumeration leak).
//
// `/reset-password` does not need its own limiter — the `password_reset_tokens`
// row is consumed on first success and Laravel's default token
// expiry (60 minutes) caps replay attempts. A flood of bad tokens
// just produces 422s without state mutation.
Route::post('/auth/forgot-password', [\App\Http\Controllers\Auth\PasswordResetController::class, 'request'])
    ->middleware('throttle:password-reset-request');
Route::post('/auth/reset-password', [\App\Http\Controllers\Auth\PasswordResetController::class, 'reset']);

// One-click unsubscribe (#417). Public on purpose — the signed URL
// IS the auth (validated by the `signed` middleware). Two entry
// points:
//   - GET `/unsubscribe/{userId}/{category}` is the human click on
//     the email footer link; flips the preference off and redirects
//     to the SPA `/unsubscribed` confirmation page.
//   - POST `/unsubscribe/{userId}/{category}` is the RFC 8058
//     `List-Unsubscribe-Post` one-click that Gmail / Yahoo bulk-
//     sender rules require for senders over 5k/day; same effect,
//     responds 200 with an empty body.
// Expired / tampered signatures get a 403 from the framework's
// signed middleware before reaching the controller.
Route::get('/unsubscribe/{userId}/{category}', [\App\Http\Controllers\Auth\UnsubscribeController::class, 'get'])
    ->where('userId', '[0-9]+')
    ->middleware('signed')
    ->name('unsubscribe');
Route::post('/unsubscribe/{userId}/{category}', [\App\Http\Controllers\Auth\UnsubscribeController::class, 'post'])
    ->where('userId', '[0-9]+')
    ->middleware('signed');

// Email verification — signed-link callback. Public on purpose: the signed
// URL is the auth (the user clicks from their inbox, often on a different
// device than the one they registered on). The hash check inside the
// controller catches email-changed-after-signature drift. The `id` is
// constrained to digits so a non-numeric path (e.g. `/email/verify/foo/...`)
// 404s before reaching the controller — avoids passing a bogus route param
// down to `User::find()`.
Route::get('/email/verify/{id}/{hash}', [\App\Http\Controllers\Auth\EmailVerificationController::class, 'verify'])
    ->where('id', '[0-9]+')
    ->where('hash', '[a-f0-9]{40}')
    ->middleware('signed')
    ->name('verification.verify');

// Athlete invitation accept flow (#445, M7 PR-C). Public on purpose:
// the raw token in the URL is the auth. The token format is
// 64 url-safe random chars; we constrain the route to that pattern
// so a malformed value 404s before the controller is hit.
//
// `/preview` is rate-limited gently — a stranger probing the
// endpoint with random tokens learns nothing (all unknown / non-
// pending tokens 404), but we cap the firehose anyway.
//
// `/accept` is rate-limited to 5 req/min/IP because a bad-actor
// flood of accept attempts on guessed tokens would otherwise
// brute-force the bearer-credential search space.
Route::get('/athlete-invite/{token}/preview', [\App\Http\Controllers\Auth\AthleteInvitationAcceptController::class, 'preview'])
    ->where('token', '[A-Za-z0-9]{64}')
    ->middleware(['capability:athlete_accounts', 'throttle:30,1']);
Route::post('/athlete-invite/{token}/accept', [\App\Http\Controllers\Auth\AthleteInvitationAcceptController::class, 'accept'])
    ->where('token', '[A-Za-z0-9]{64}')
    ->middleware(['capability:athlete_accounts', 'throttle:5,1']);

// Email-change verification (#476) — public endpoint, the click in
// the verification mail IS the auth. The 64-char token format is
// constrained at the route layer so a malformed value 404s before
// reaching the controller. The controller catches the action's
// `EmailChangeTokenInvalidException` and renders 410 Gone with a
// stable string body — same shape on unknown / consumed / expired
// tokens (no signal leak between the three).
Route::post('/email-change/{token}/verify', [\App\Http\Controllers\Auth\EmailVerificationController::class, 'verifyChange'])
    ->where('token', '[A-Za-z0-9]{64}');

// Account-deletion cancel by token (#545) — public endpoint, the click
// on the "Cancel deletion" CTA in the request-confirmation email IS
// the auth. The 64-char token comes from the `pending_deletions`
// table and is invalidated by a successful cancel (the row is
// deleted), so a second click on the same link resolves to
// `cancelled: false` — the SPA renders a single "deletion is no
// longer pending" page either way; we don't leak whether the link
// was used vs invalid. The token shape is `Str::random(64)` →
// alphanumeric with the same regex as the email-change + invite
// tokens, constrained at the route layer so a malformed link 404s
// before the action is called.
Route::post('/me/deletion-request/cancel/{token}', [\App\Http\Controllers\User\AccountDeletionController::class, 'cancelByToken'])
    ->where('token', '[A-Za-z0-9]{64}')
    // Rate-limited at 10 req/min/IP. The 64-char token is high-entropy
    // enough that guessing inside the 30-day grace window is
    // computationally implausible — but a script hammering random
    // tokens would still spam the DB lookup. Mirrors the
    // /athlete-invite/{token}/accept throttle (5/min); we sit a notch
    // higher to absorb a legitimate user's dev-tools refresh loop.
    ->middleware('throttle:10,1');

// Authenticated routes
Route::middleware('auth:sanctum')->group(function (): void {
    // Currently authenticated user. Used by the SPA on bootstrap to hydrate
    // the user state (incl. `email_verified_at`) after a page reload.
    Route::get('/auth/me', \App\Http\Controllers\Auth\MeController::class);
    // Revokes the token that made the request (#1227). Sign-out used to be
    // client-side only, leaving the row valid until found under Active sessions.
    Route::post('/auth/logout', \App\Http\Controllers\Auth\LogoutController::class);

    // Licence status and activation (#1290). Desktop only — a hosted
    // deployment is licensed by whoever runs it, so `capability:licensing`
    // answers 404 there rather than advertising a surface that does not apply.
    //
    // Both are exempt from `EnforceLicense` (see config/budojo.license.exempt):
    // activating has to work precisely when everything else has stopped.
    // Activation is rate-limited because the endpoint verifies a signature on
    // whatever it is handed.
    Route::middleware('capability:licensing')->group(function (): void {
        Route::get('/license', [\App\Http\Controllers\License\LicenseController::class, 'show']);
        Route::post('/license', [\App\Http\Controllers\License\LicenseController::class, 'store'])
            ->middleware(['role:owner', 'throttle:10,1']);
    });

    // Self-edit on the authenticated user's profile (#463). Currently
    // scoped to `name` only — the email-change flow has its own
    // dedicated POST /me/email-change endpoint immediately below
    // because it needs a pending-email-changes schema + signed-link
    // verification + banner UX.
    Route::patch('/me', [\App\Http\Controllers\User\ProfileController::class, 'update']);

    // Email-change-with-verification (#476). The owner / athlete user
    // requests an email change here; the live `users.email` is NOT
    // mutated — only a `pending_email_changes` row is created and a
    // verification mail goes to the new address (audit notification
    // to the old address). The actual change applies on the public
    // `POST /email-change/{token}/verify` click. DELETE drops an
    // outstanding pending row so the user can revert without waiting
    // out the 24h expiry.
    //
    // Throttle 5/hour PER USER — see `email-change-request` limiter
    // in `AppServiceProvider::boot()`.
    Route::post('/me/email-change', [\App\Http\Controllers\User\EmailChangeController::class, 'requestChange'])
        ->middleware('throttle:email-change-request');
    Route::delete('/me/email-change', [\App\Http\Controllers\User\EmailChangeController::class, 'cancel']);

    // In-app password change (#409). Throttled to 5 requests per minute
    // (Laravel's default IP-based key) — same shape as `/auth/login` and
    // `/me/deletion-request`, defeats brute-force on the current-password
    // re-auth gate while leaving an honest user with several retries to
    // recover from a typo. The current Sanctum token used for this
    // request is preserved; every other token on the user is revoked
    // inside the Action (defence-in-depth without yanking the active tab).
    Route::post('/me/password', \App\Http\Controllers\Auth\ChangePasswordController::class)
        ->middleware('throttle:5,1');

    // GDPR Art. 20 (data portability) — export every byte we hold about
    // the user. JSON by default; `?format=zip` returns the JSON plus
    // bundled document binaries. Throttled to 1 req/min per user (#222)
    // because the ZIP variant is heavy on disk + bandwidth.
    Route::get('/me/export', \App\Http\Controllers\User\ExportController::class)
        ->middleware('throttle:1,1');

    // Athlete-portal read onto the caller's academy (#618, M7 PR-D
    // slice 2). Role-agnostic — owners read their owned academy,
    // athletes read the academy on their linked athlete row.
    Route::get('/me/academy', [\App\Http\Controllers\Me\MyAcademyController::class, 'show']);

    // Athlete-portal attendance history (M7 PR-D slice 3). Returns
    // the authenticated athlete's attendance records in the optional
    // `[from, to]` window. Owners hit a 404 (they're not students;
    // the owner-side `/athletes/{id}/attendance` is the right surface
    // for any athlete's history).
    Route::get('/me/attendance', [\App\Http\Controllers\Me\MyAttendanceController::class, 'index']);
    // Self-mark today's presence — athlete self-service that spares
    // the instructor the manual roll-call (#960). DELETE reverts the
    // athlete's own self-mark; instructor-marked rows stay (only the
    // instructor can revert their own marks).
    Route::post('/me/attendance/today', [\App\Http\Controllers\Me\MyAttendanceController::class, 'markToday']);
    Route::delete('/me/attendance/today', [\App\Http\Controllers\Me\MyAttendanceController::class, 'unmarkToday']);
    // "Chi viene stasera?" peer preview (#958). Surfaces same-academy
    // athletes whose attendance row exists for today, capped at 8 and
    // opt-out-respected. The Athlete relation hook is the gate (404
    // for owner-only users without a linked athlete row).
    Route::get('/me/attendance/today/peers', [\App\Http\Controllers\Me\MyAttendanceController::class, 'peers']);
    // Monthly mat-hours leaderboard (#962). Top 5 athletes by session
    // count for the academy + month. Available to owners (active
    // academy scope) AND athletes (linked-row scope). Anonymises
    // opted-out users via the action layer.
    Route::get('/attendance/leaderboard', [\App\Http\Controllers\Attendance\LeaderboardController::class, 'show']);
    // Athlete-portal weekly recap (#960). `?week=YYYY-MM-DD` is the
    // Monday-of-week start date; controller validates the format AND
    // the day-of-week constraint (must be Monday).
    Route::get('/me/recap', [\App\Http\Controllers\Me\MyRecapController::class, 'show']);

    // Athlete-portal monthly payment history (M7 PR-D slice 4).
    // Returns the auth athlete's payment rows for the given
    // calendar year (defaults to current). Owners 404 — they don't
    // have a personal payment ledger.
    Route::get('/me/payments', [\App\Http\Controllers\Me\MyPaymentsController::class, 'index']);

    // Athlete-portal documents (M7 PR-D slice 5). Read-only — owners
    // remain the only upload entry point in V1 (athlete-side upload
    // policy is a V2 question). 50/page, descending-created-at.
    // Owners and orphan users 404.
    Route::get('/me/documents', [\App\Http\Controllers\Me\MyDocumentsController::class, 'index']);

    // GDPR Art. 17 (right-to-erasure) — request hard-deletion of the
    // account and all academy + athlete data tied to it (#223). POST
    // enters a 30-day grace window; DELETE cancels during that window.
    // After the window elapses, the hourly Artisan command
    // `budojo:purge-expired-pending-deletions` (scheduled in
    // `routes/console.php`) hard-deletes the user via PurgeAccountAction.
    // Lightly throttled to defeat brute-force on the password re-auth gate.
    Route::post('/me/deletion-request', [\App\Http\Controllers\User\AccountDeletionController::class, 'store'])
        ->middleware('throttle:5,1');
    Route::delete('/me/deletion-request', [\App\Http\Controllers\User\AccountDeletionController::class, 'destroy']);

    // Two-factor authentication (#412). TOTP enrolment + backup
    // codes + disable-with-password. The login flow at
    // `/auth/login` consults `users.two_factor_confirmed_at` and
    // demands a `two_factor_code` body param (TOTP or backup) before
    // issuing a session token when 2FA is active.
    //
    // All mutative endpoints are throttled at `5,1` (5 requests per
    // minute) — same shape as `/me/deletion-request` above — to
    // close the brute-force window on the 6-digit TOTP code (#1006).
    // Without it, an authenticated attacker could probe 10^6 codes
    // against `/me/two-factor/confirm` inside the 30s TOTP rotation,
    // OR against `DELETE /me/two-factor` to wipe the second factor
    // by trying common passwords. The throttle is keyed on
    // `user_id` (Laravel default for authenticated requests), so
    // all of a user's Sanctum tokens / devices share one 5/min
    // budget — an attacker can't sidestep the cap by minting
    // fresh tokens.
    Route::get('/me/two-factor', [\App\Http\Controllers\User\TwoFactorController::class, 'show']);
    Route::post('/me/two-factor/enrol', [\App\Http\Controllers\User\TwoFactorController::class, 'enrol'])
        ->middleware('throttle:5,1');
    Route::post('/me/two-factor/confirm', [\App\Http\Controllers\User\TwoFactorController::class, 'confirm'])
        ->middleware('throttle:5,1');
    Route::post('/me/two-factor/recovery-codes/regenerate', [\App\Http\Controllers\User\TwoFactorController::class, 'regenerateRecoveryCodes'])
        ->middleware('throttle:5,1');
    Route::delete('/me/two-factor', [\App\Http\Controllers\User\TwoFactorController::class, 'destroy'])
        ->middleware('throttle:5,1');

    // Active sessions list with per-token revoke (#413). Surfaces every
    // Sanctum personal-access-token tied to the user; backs the
    // "Active sessions" panel on /dashboard/profile + the
    // "logout everywhere except here" CTA. Each row carries an
    // `is_current` flag so the SPA can stamp the "this session" pill
    // on the token authenticating THIS request.
    // Email-notification preferences (#416). Per-category opt-out
    // for the digest / reminder emails (medical-cert expiry, unpaid
    // athletes monthly digest). Transactional emails (welcome,
    // password-reset, email-verification, account-deletion-*) are
    // NOT toggleable.
    Route::get('/me/notification-preferences', [\App\Http\Controllers\User\NotificationPreferencesController::class, 'show']);
    Route::patch('/me/notification-preferences', [\App\Http\Controllers\User\NotificationPreferencesController::class, 'update']);

    // In-app notification inbox (#418). Bell-icon dropdown on the
    // dashboard topbar; per-user state in the standard Laravel
    // `notifications` table. The inbox SURFACE ships here. Wiring
    // the existing reminder Actions (medical-cert expiry digest,
    // unpaid-athletes monthly digest) to ALSO write database
    // notifications alongside their email is a separate, focused
    // follow-up — touching M5 critical-path code is deliberately
    // out of scope for this PR. The table is empty in production
    // until that follow-up lands.
    Route::get('/me/notifications', [\App\Http\Controllers\User\NotificationInboxController::class, 'index']);
    Route::post('/me/notifications/{id}/read', [\App\Http\Controllers\User\NotificationInboxController::class, 'markAsRead'])
        ->where('id', '[A-Za-z0-9\-]{36}');
    Route::post('/me/notifications/read-all', [\App\Http\Controllers\User\NotificationInboxController::class, 'markAllAsRead']);

    // First-run onboarding state (#424). The SPA reads `show` once on
    // dashboard mount to decide whether to render the guided tour /
    // "Getting started" checklist; `complete-step` is fired per
    // ticked checklist item, `dismiss` permanently retires the tour.
    Route::get('/me/onboarding', [\App\Http\Controllers\User\OnboardingController::class, 'show']);
    Route::post('/me/onboarding/steps', [\App\Http\Controllers\User\OnboardingController::class, 'completeStep']);
    Route::post('/me/onboarding/dismiss', [\App\Http\Controllers\User\OnboardingController::class, 'dismiss']);

    // Login history audit log (#430). Surfaces the last 50 login
    // attempts (success + failure) on the authenticated user so a
    // compromise probe is self-serve. Pairs with the live
    // /me/sessions list — sessions covers ACTIVE tokens, history
    // covers PAST attempts, including ones that no longer have a
    // live token.
    Route::get('/me/login-history', [\App\Http\Controllers\User\LoginHistoryController::class, 'index']);

    Route::get('/me/sessions', [\App\Http\Controllers\User\SessionController::class, 'index']);
    Route::delete('/me/sessions/{id}', [\App\Http\Controllers\User\SessionController::class, 'destroy'])
        ->where('id', '[0-9]+');
    Route::delete('/me/sessions', [\App\Http\Controllers\User\SessionController::class, 'destroyOthers']);

    // Active academy switching (#427 / #718). GET returns the
    // currently-selected academy + the user's role + the capabilities
    // list (so the SPA's *budojoCan directive doesn't need a separate
    // round-trip on switch). 204 when the user has no active
    // membership yet. PATCH switches to the academy_id in the body;
    // FormRequest validates the user has an active membership there.
    Route::get('/me/active-academy', [\App\Http\Controllers\Me\ActiveAcademyController::class, 'show']);
    Route::patch('/me/active-academy', [\App\Http\Controllers\Me\ActiveAcademyController::class, 'update']);

    // Owner-as-athlete self-enroll / self-leave (#748). Adds the caller
    // to the roster of their active academy as an athlete with
    // `is_self = true`, or soft-removes them. Both endpoints are
    // idempotent. Excluded from the regular athlete-delete flow by
    // a guard in `AthleteController::destroy` — the only way to leave
    // is this DELETE.
    Route::post('/me/athlete', [\App\Http\Controllers\Me\MyAthleteController::class, 'store']);
    Route::delete('/me/athlete', [\App\Http\Controllers\Me\MyAthleteController::class, 'destroy']);
    // Read-only "am I self-enrolled?" lookup (#761). Backs the SPA's
    // owner-as-athlete toggle initial state — replaces the previous
    // first-page-scan over `/athletes` which silently mis-detected
    // `enrolled: false` on rosters > 20 (Copilot review on #754).
    Route::get('/me/athlete/state', [\App\Http\Controllers\Me\MyAthleteController::class, 'state']);

    // Public-profile by handle (#862, M9 social-profile epic slice A).
    // Role-agnostic — both owners and athletes can read same-academy peer
    // profiles. The Action enforces the three gates (handle resolution,
    // profile_is_public, same-academy) all collapsing to 404 so the surface
    // doesn't leak existence of users behind any of them. The handle pattern
    // mirrors HandleFormat (#479): lowercase alphanumeric + dot + underscore,
    // 3-30 chars, must start with a letter. A malformed value 404s at the
    // route layer before reaching the controller.
    Route::get('/users/{handle}/profile', [\App\Http\Controllers\User\PublicProfileController::class, 'show'])
        ->where('handle', '[a-z][a-z0-9._]{2,29}')
        ->middleware('capability:community');

    // Web Push subscriptions (#419). One row per device the user has
    // explicitly granted push permission on. The SPA POSTs the
    // PushSubscription envelope from `PushManager.subscribe()`;
    // server-side fanout uses minishlink/web-push to send pushes to
    // every row tied to a target user.
    // Absent on a runtime with no browser push service (#1229) — 404, not 503.
    Route::middleware('capability:web_push')->group(function (): void {
        Route::get('/me/push-subscriptions', [\App\Http\Controllers\User\PushSubscriptionController::class, 'index']);
        Route::post('/me/push-subscriptions', [\App\Http\Controllers\User\PushSubscriptionController::class, 'store'])
            ->middleware('throttle:30,1');
        // Per-user cap on the self-triggered test push (#1011) — without
        // it, a script could spam the vendor fanout at our expense.
        Route::post('/me/push-subscriptions/test', [\App\Http\Controllers\User\PushSubscriptionController::class, 'test'])
            ->middleware('throttle:5,1');
        Route::delete('/me/push-subscriptions/{id}', [\App\Http\Controllers\User\PushSubscriptionController::class, 'destroy'])
            ->where('id', '[0-9]+');
    });

    // API tokens (#431). Long-lived, user-named, abilities-scoped
    // Sanctum tokens for integrations (export scripts, automation
    // hooks). Same `personal_access_tokens` table as session tokens
    // — distinguished by the `kind` column. Plaintext returned ONCE
    // on creation.
    Route::get('/me/api-tokens', [\App\Http\Controllers\User\ApiTokenController::class, 'index']);
    // Token mint cap (#1011) — without it an authenticated session
    // could mint an unbounded number of long-lived tokens (each row
    // a permanent credential until revoked). 10/min is generous for
    // a human integrator wiring up 2-3 scripts in one sitting.
    Route::post('/me/api-tokens', [\App\Http\Controllers\User\ApiTokenController::class, 'store'])
        ->middleware('throttle:10,1');
    Route::delete('/me/api-tokens/{id}', [\App\Http\Controllers\User\ApiTokenController::class, 'destroy'])
        ->where('id', '[0-9]+');

    // Avatar — multipart upload + delete (#411). Mirrors the
    // /academy/logo precedent: stores the original bytes (no
    // server-side resize — the API container ships GD without JPEG
    // / WebP encoders; the SPA renders inside a circular CSS frame).
    // Same-extension replace overwrites in place; different-extension
    // replace unlinks the previous file. The response is the full
    // UserResource so the SPA can swap its cached envelope without
    // re-fetching /me.
    // Throttle on POST (#1011): multipart upload is the storage-
    // flood vector — a tight 10/min cap protects the public disk
    // from a buggy client retry loop. DELETE stays unthrottled (it
    // only frees space; no spam risk).
    Route::post('/me/avatar', [\App\Http\Controllers\User\AvatarController::class, 'upload'])
        ->middleware('throttle:10,1');
    Route::delete('/me/avatar', [\App\Http\Controllers\User\AvatarController::class, 'delete']);

    // Resend verification email — auth required, rate-limited via
    // `email-verification-resend` (one request per minute per user;
    // see AppServiceProvider::boot()).
    Route::post('/email/verification-notification', [\App\Http\Controllers\Auth\EmailVerificationController::class, 'resend'])
        ->middleware('throttle:email-verification-resend');


    // ──────────────────────────────────────────────────────────────────────
    // Owner-only routes (#774, M7 PR-F).
    //
    // Everything inside this block returns 403 `role_required` to an
    // athlete-role caller — these surfaces manage the academy roster,
    // its attendance, payments, documents, and aggregated stats. The
    // athlete-side reads of "the caller's own data" live under /me/*
    // above and stay role-agnostic.
    //
    // The owner-only `/community/events` create endpoint is NOT in
    // this block — its FormRequest authorize() already enforces
    // isOwner() + academy linkage as part of the M9 community flow.
    // ──────────────────────────────────────────────────────────────────────
    Route::middleware('role:owner')->group(function (): void {
        Route::post('/academy', [\App\Http\Controllers\Academy\AcademyController::class, 'store']);
        Route::get('/academy', [\App\Http\Controllers\Academy\AcademyController::class, 'show']);
        Route::patch('/academy', [\App\Http\Controllers\Academy\AcademyController::class, 'update']);
        Route::post('/academy/logo', [\App\Http\Controllers\Academy\AcademyController::class, 'uploadLogo']);
        Route::delete('/academy/logo', [\App\Http\Controllers\Academy\AcademyController::class, 'deleteLogo']);

        // Schedule history (#1094). POST schedules a future
        // training_days change effective on a calendar date (`> today`,
        // single pending invariant enforced server-side). DELETE
        // cancels a pending future row by id; past rows are immutable
        // and the controller returns 422 if the caller targets one.
        // Reads of the history are folded into the `GET /academy`
        // resource (`current_schedule`, `next_schedule`, `schedules`),
        // there's no dedicated index endpoint.
        Route::post('/academy/schedules', [\App\Http\Controllers\Academy\AcademyScheduleController::class, 'store']);
        Route::delete('/academy/schedules/{schedule}', [\App\Http\Controllers\Academy\AcademyScheduleController::class, 'destroy']);

        // Owner reads — no email-verification gate; owners can browse the roster before verifying their email.
        Route::apiResource('athletes', \App\Http\Controllers\Athlete\AthleteController::class)
            ->only(['index', 'show']);

        // Athlete writes — gated on `verified.api`. Unverified users get a JSON
        // 403 with `message: 'verification_required'` (see
        // EnsureEmailIsVerifiedForApi). The SPA's auth interceptor keys on that
        // string to bounce the user to /dashboard/profile.
        Route::middleware('verified.api')->group(function (): void {
            Route::apiResource('athletes', \App\Http\Controllers\Athlete\AthleteController::class)
                ->only(['store', 'update', 'destroy']);

            // Athlete restore (#700). Brings a soft-deleted athlete back into
            // the active roster. `->withTrashed()` lets the route-model binding
            // resolve a soft-deleted id; without it the binding would 404
            // before the controller could even check ownership.
            Route::post('/athletes/{athlete}/restore', [\App\Http\Controllers\Athlete\AthleteController::class, 'restore'])
                ->withTrashed();

            // Athlete invitations — owner-side (#445, M7 PR-B). The owner of
            // an academy invites a roster athlete to log into the SPA. The
            // FormRequest's authorize() carries both the role:owner check
            // and the academy-ownership check; the action handles
            // re-use-pending-row + anti-squatting + best-effort mail.
            // Throttled lightly — the action already de-dupes pending rows
            // so two clicks bump last_sent_at instead of spawning two
            // tokens, but we still cap to defeat scripted spamming of the
            // mail vendor.
            // Athlete accounts are a runtime capability (#1229): a desktop
            // with one user and no mail transport has nobody to invite.
            Route::middleware('capability:athlete_accounts')->group(function (): void {
                Route::post('/athletes/{athlete}/invite', [\App\Http\Controllers\Athlete\AthleteInvitationController::class, 'store'])
                    ->middleware('throttle:5,1');
                Route::post('/athletes/{athlete}/invite/resend', [\App\Http\Controllers\Athlete\AthleteInvitationController::class, 'resend'])
                    ->middleware('throttle:5,1');
                Route::delete('/athletes/{athlete}/invitations/{invitation}', [\App\Http\Controllers\Athlete\AthleteInvitationController::class, 'destroy']);
            });

            // Athlete email change (#476). State-aware on the action side:
            //
            // - state A (no invitation, no `user_id`) → the action mutates
            //   `athletes.email` directly; no mail.
            // - state B (pending invitation, no `user_id`) → the action
            //   revokes the live invitation, swaps `athletes.email`, sends
            //   a fresh invite to the new address.
            // - state C (`user_id` is set) → the action delegates to the
            //   pending-then-verify flow used by `/me/email-change`.
            //
            // Throttle 5/hour PER OWNER user — same `email-change-request`
            // limiter as `/me/email-change`. The pair shares a budget on
            // purpose: an owner mass-changing emails on athletes should
            // hit the same ceiling as the same owner spamming their own
            // address change, since the mail-vendor cost class is the same.
            Route::post('/athletes/{athlete}/email', [\App\Http\Controllers\Athlete\AthleteEmailController::class, 'update'])
                ->middleware('throttle:email-change-request');
        });

        // Documents — read access stays open (browsing + downloading); writes are
        // gated. Listing per-athlete is a read; uploading is a write.
        Route::get('/athletes/{athlete}/documents', [\App\Http\Controllers\Athlete\AthleteDocumentController::class, 'index']);
        // Promotion history — owner reads belt + stripe events for a
        // specific athlete (post-v2.9.0). Same academy-scope gate as
        // documents; lives in the controller's first line.
        Route::get('/athletes/{athlete}/promotions', [\App\Http\Controllers\Athlete\AthletePromotionController::class, 'index']);
        // Documents — flat routes for operations that target a single document.
        // `/expiring` must come before `/{document}` routes or Laravel tries to
        // bind the literal "expiring" as a document id.
        Route::get('/documents/expiring', [\App\Http\Controllers\Document\DocumentController::class, 'expiring']);
        // Download allows binding soft-deleted rows so the controller can return
        // 410 Gone (tombstone) instead of the generic 404. See PRD P0.7b.
        Route::get('/documents/{document}/download', [\App\Http\Controllers\Document\DocumentController::class, 'download'])
            ->withTrashed();

        // Document writes — gated on `verified.api`.
        Route::middleware('verified.api')->group(function (): void {
            Route::post('/athletes/{athlete}/documents', [\App\Http\Controllers\Athlete\AthleteDocumentController::class, 'store']);
            Route::put('/documents/{document}', [\App\Http\Controllers\Document\DocumentController::class, 'update']);
            Route::delete('/documents/{document}', [\App\Http\Controllers\Document\DocumentController::class, 'destroy']);
        });

        // Payments — M5 (#104). Nested under athlete; the academy's monthly fee
        // is set via PATCH /academy. `paid_current_month` lives on the athlete
        // resource so the list page can render the badge without an extra hop.
        Route::get('/athletes/{athlete}/payments', [\App\Http\Controllers\Athlete\AthletePaymentController::class, 'index']);
        Route::post('/athletes/{athlete}/payments', [\App\Http\Controllers\Athlete\AthletePaymentController::class, 'store']);
        Route::delete('/athletes/{athlete}/payments/{year}/{month}', [\App\Http\Controllers\Athlete\AthletePaymentController::class, 'destroy'])
            ->whereNumber(['year', 'month']);

        // Attendance — M4. `/attendance/summary` must come BEFORE `/attendance/{id}`
        // or Laravel binds "summary" as an attendance-record id and returns 404.
        Route::get('/attendance/summary', [\App\Http\Controllers\Attendance\AttendanceController::class, 'summary']);
        Route::get('/attendance', [\App\Http\Controllers\Attendance\AttendanceController::class, 'index']);
        Route::post('/attendance', [\App\Http\Controllers\Attendance\AttendanceController::class, 'store']);
        Route::delete('/attendance/{attendance}', [\App\Http\Controllers\Attendance\AttendanceController::class, 'destroy']);
        // Per-athlete attendance summary (#893). Must come BEFORE the more
        // general /athletes/{athlete}/attendance route or "summary" would
        // bind as a record id.
        Route::get('/athletes/{athlete}/attendance/summary', [\App\Http\Controllers\Attendance\AttendanceController::class, 'athleteSummary']);
        Route::get('/athletes/{athlete}/attendance', [\App\Http\Controllers\Attendance\AttendanceController::class, 'athleteHistory']);
    });

    // Support contact form (#423 + post-v1.17 consolidation that
    // retired the legacy /dashboard/feedback page). Authenticated user
    // → persists a ticket row + queues an email to the support inbox
    // with Reply-To set to the user. The optional screenshot attachment
    // and the auto-attached app version + User-Agent inherit from the
    // legacy feedback flow. Throttled to 5 req/min per user so a script
    // can't flood the support inbox.
    Route::post('/support', [\App\Http\Controllers\Support\SupportTicketController::class, 'store'])
        ->middleware('throttle:5,1');

    // Owner-only search + stats (#774). The Cmd/Ctrl-K palette and the
    // /dashboard/stats charts both surface academy-wide PII (athlete
    // names + counts by belt + payment totals); athletes have no business
    // there, so the role gate is enforced server-side too.
    Route::middleware('role:owner')->group(function (): void {
        // Global search (#426) — backs the Cmd/Ctrl-K command palette in
        // the SPA. Single invokable controller; academy-scoped; capped at
        // 20 rows (no pagination envelope — palette is a quick-jump, not
        // a list page). V1 indexes only athletes by name; future V2
        // expansion (academy, payments) lands here without a SPA URL bump.
        Route::get('/search', \App\Http\Controllers\Search\SearchController::class);

        // Stats — server-side aggregations for the /dashboard/stats charts.
        // Grouped under /stats so T3 (payments) and T4 (age bands) can extend
        // this block without touching other route sections.
        Route::prefix('stats')->group(function (): void {
            Route::get('attendance/daily', [StatsController::class, 'attendanceDaily']);
            Route::get('payments/monthly', [StatsController::class, 'paymentsMonthly']);
            Route::get('athletes/age-bands', [StatsController::class, 'ageBands']);
        });

        // Audit log (#429). Owner-only paginated read; writes are observer-driven.
        Route::get('/audit-entries', [\App\Http\Controllers\Audit\AuditEntriesController::class, 'index']);
    });

    // Community (M9). Owners + athletes share the same /api/v1/community
    // namespace — tenant isolation is per-Action (feed) or per-FormRequest
    // gate (e.g. DeleteCommunityPostRequest on `DELETE posts/{post}`,
    // ToggleReactionRequest on `POST posts/{post}/reactions`). Each
    // method is scoped on the comment line that introduces it.
    // The whole social surface is a runtime capability (#1229): a single-user
    // desktop has a feed with an audience of one. 404 on the desktop profile.
    Route::prefix('community')->middleware('capability:community')->group(function (): void {
        // PR-B server (#612): athletes + owners read the same paginated
        // feed; DELETE is owner-only via the FormRequest authorize() gate.
        Route::get('feed', [\App\Http\Controllers\Community\CommunityFeedController::class, 'index']);
        Route::delete('posts/{post}', [\App\Http\Controllers\Community\CommunityFeedController::class, 'destroy']);

        // PR-C server (#603): toggle the caller's emoji reaction on a
        // post. Same-emoji toggles off; different emoji swaps in place.
        // Rate-limited at 60 / minute / user via the `community-react`
        // named limiter (see AppServiceProvider) — PRD acceptance
        // criterion + Copilot review on PR #616.
        Route::post(
            'posts/{post}/reactions',
            [\App\Http\Controllers\Community\CommunityReactionsController::class, 'toggle'],
        )->middleware('throttle:community-react');

        // Post-v2.9.0 (#655): list every reaction on a post with the
        // reactor's identity flair. The SPA opens a bottom-sheet /
        // dialog on tap of the count next to the 👏 / 🙏 buttons.
        // Same academy-scope gate; paginated 20/page. Throttled at
        // 60/min/user via the same `community-react` limiter as the
        // toggle endpoint — the sheet's "Load more" can fire several
        // reads in quick succession on a big post (Copilot review on
        // #655).
        Route::get(
            'posts/{post}/reactions',
            [\App\Http\Controllers\Community\CommunityPostReactionsListController::class, 'index'],
        )->middleware('throttle:community-react');

        // PR-D server (#604): 1-level comments under a post.
        //   GET    /posts/{post}/comments — list (paginated, 50/page)
        //   POST   /posts/{post}/comments — create (500-char body cap)
        //   DELETE /comments/{comment}    — soft-delete (author OR
        //                                    post's academy owner)
        // Create is rate-limited at 30/min/user via the
        // `community-comment-create` named limiter.
        Route::get(
            'posts/{post}/comments',
            [\App\Http\Controllers\Community\CommunityCommentsController::class, 'index'],
        );
        Route::post(
            'posts/{post}/comments',
            [\App\Http\Controllers\Community\CommunityCommentsController::class, 'store'],
        )->middleware('throttle:community-comment-create');
        Route::delete(
            'comments/{comment}',
            [\App\Http\Controllers\Community\CommunityCommentsController::class, 'destroy'],
        );

        // PR-E server (#605): RSVP toggle on event-type posts.
        // Same-response toggles off, different-response swaps in
        // place. Only `type=event` posts accept RSVPs (FormRequest
        // gate). Rate-limited at 30/min/user via `community-rsvp`.
        Route::post(
            'posts/{post}/rsvp',
            [\App\Http\Controllers\Community\CommunityRsvpController::class, 'toggle'],
        )->middleware('throttle:community-rsvp');

        // Owner-facing event creation. Unblocks PR-F slice 2's
        // community_event_new notification trigger and adds genuine
        // V1 value — until this lands, events came only from the
        // factory in tests. Authorize gate requires isOwner() + a
        // linked academy.
        Route::post(
            'events',
            [\App\Http\Controllers\Community\CommunityEventsController::class, 'store'],
        );

        // Athlete- or owner-shared external technique video (#1154). The
        // server resolves the preview (allowlisted provider: Instagram /
        // YouTube / TikTok) and stores a shared_video post. Throttled —
        // each create makes an outbound oEmbed / OG fetch.
        Route::post(
            'videos',
            [\App\Http\Controllers\Community\CommunitySharedVideosController::class, 'store'],
        )->middleware('throttle:20,1');
    });
});
