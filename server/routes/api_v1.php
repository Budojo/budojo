<?php

declare(strict_types=1);

use App\Http\Controllers\Stats\StatsController;
use Illuminate\Support\Facades\Route;

// Public routes
Route::get('/health', fn () => response()->json(['status' => 'ok']));
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

// Authenticated routes
Route::middleware('auth:sanctum')->group(function (): void {
    // Currently authenticated user. Used by the SPA on bootstrap to hydrate
    // the user state (incl. `email_verified_at`) after a page reload.
    Route::get('/auth/me', \App\Http\Controllers\Auth\MeController::class);

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

    // Avatar — multipart upload + delete (#411). Mirrors the
    // /academy/logo precedent: server-side resize to 256x256, replace
    // unlinks the previous file, the response is the full UserResource
    // so the SPA can swap its cached envelope without re-fetching /me.
    Route::post('/me/avatar', [\App\Http\Controllers\User\AvatarController::class, 'upload']);
    Route::delete('/me/avatar', [\App\Http\Controllers\User\AvatarController::class, 'delete']);

    // Resend verification email — auth required, rate-limited via
    // `email-verification-resend` (one request per minute per user;
    // see AppServiceProvider::boot()).
    Route::post('/email/verification-notification', [\App\Http\Controllers\Auth\EmailVerificationController::class, 'resend'])
        ->middleware('throttle:email-verification-resend');


    Route::post('/academy', [\App\Http\Controllers\Academy\AcademyController::class, 'store']);
    Route::get('/academy', [\App\Http\Controllers\Academy\AcademyController::class, 'show']);
    Route::patch('/academy', [\App\Http\Controllers\Academy\AcademyController::class, 'update']);
    Route::post('/academy/logo', [\App\Http\Controllers\Academy\AcademyController::class, 'uploadLogo']);
    Route::delete('/academy/logo', [\App\Http\Controllers\Academy\AcademyController::class, 'deleteLogo']);

    // Athlete reads — open to unverified users so they can browse.
    Route::apiResource('athletes', \App\Http\Controllers\Athlete\AthleteController::class)
        ->only(['index', 'show']);

    // Athlete writes — gated on `verified.api`. Unverified users get a JSON
    // 403 with `message: 'verification_required'` (see
    // EnsureEmailIsVerifiedForApi). The SPA's auth interceptor keys on that
    // string to bounce the user to /dashboard/profile.
    Route::middleware('verified.api')->group(function (): void {
        Route::apiResource('athletes', \App\Http\Controllers\Athlete\AthleteController::class)
            ->only(['store', 'update', 'destroy']);
    });

    // Documents — read access stays open (browsing + downloading); writes are
    // gated. Listing per-athlete is a read; uploading is a write.
    Route::get('/athletes/{athlete}/documents', [\App\Http\Controllers\Athlete\AthleteDocumentController::class, 'index']);
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
    Route::get('/athletes/{athlete}/attendance', [\App\Http\Controllers\Attendance\AttendanceController::class, 'athleteHistory']);

    // In-app feedback (#311). Authenticated user → email to product owner.
    // Throttled lightly (5 req/min per user) so a script can't blast the
    // owner's inbox; the shape lets a frustrated user fire several reports
    // in quick succession but stops abuse.
    Route::post('/feedback', [\App\Http\Controllers\Feedback\FeedbackController::class, 'store'])
        ->middleware('throttle:5,1');

    // Support contact form (#423). Authenticated user → persists a
    // ticket row + queues an email to the support inbox with Reply-To
    // set to the user. Same throttle shape as feedback above (5/min)
    // so a script can't flood the support inbox.
    Route::post('/support', [\App\Http\Controllers\Support\SupportTicketController::class, 'store'])
        ->middleware('throttle:5,1');

    // Stats — server-side aggregations for the /dashboard/stats charts.
    // Grouped under /stats so T3 (payments) and T4 (age bands) can extend
    // this block without touching other route sections.
    Route::prefix('stats')->group(function (): void {
        Route::get('attendance/daily', [StatsController::class, 'attendanceDaily']);
        Route::get('payments/monthly', [StatsController::class, 'paymentsMonthly']);
        Route::get('athletes/age-bands', [StatsController::class, 'ageBands']);
    });
});
