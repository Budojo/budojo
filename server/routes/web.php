<?php

declare(strict_types=1);

use App\Http\Controllers\Twa\AssetLinksController;
use Illuminate\Support\Facades\Route;

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
*/
Route::get('/.well-known/assetlinks.json', AssetLinksController::class)
    ->name('twa.assetlinks');
