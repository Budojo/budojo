<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

// Public routes
Route::get('/health', fn () => response()->json(['status' => 'ok']));
Route::post('/auth/register', \App\Http\Controllers\Auth\RegisterController::class);
Route::post('/auth/login', \App\Http\Controllers\Auth\LoginController::class);

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
});
