<?php

declare(strict_types=1);

use App\Http\Controllers\Twa\AssetLinksController;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;

Route::get('/', fn () => view('welcome'));

/*
|--------------------------------------------------------------------------
| Android Trusted Web Activity (TWA) — Digital Asset Links
|--------------------------------------------------------------------------
|
| Chrome fetches this file when launching the TWA shell (M9 milestone)
| to verify the web origin is owned by the Android app's package +
| signing key. Successful verification enables fullscreen mode (no
| URL bar). Missing / wrong record falls back to a non-fullscreen TWA
| (still functional). See `app/Http/Controllers/Twa/AssetLinksController`
| for the full rationale.
|
| Session + cookie middleware is excluded for this route. With
| SESSION_DRIVER=database (the production default per .env.example),
| the StartSession middleware would create a row in the `sessions`
| table on every anonymous Chrome hit — potentially thousands of
| rows over time as Chrome re-validates. Asset-Links is a static
| public document by design; sessions and CSRF have nothing to add.
| Copilot review on PR #519 caught this.
|
*/
Route::get('/.well-known/assetlinks.json', AssetLinksController::class)
    ->withoutMiddleware([
        EncryptCookies::class,
        AddQueuedCookiesToResponse::class,
        StartSession::class,
        ShareErrorsFromSession::class,
        PreventRequestForgery::class,
    ])
    ->name('twa.assetlinks');
