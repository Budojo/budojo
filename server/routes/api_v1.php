<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1 Routes
|--------------------------------------------------------------------------
| All routes here are automatically prefixed /api/v1.
| Sanctum stateful middleware is applied globally (see bootstrap/app.php),
| which handles SPA cookie auth — it does NOT enforce authentication.
| Use the auth:sanctum middleware group below for protected endpoints.
*/

// Public routes
Route::get('/health', fn () => response()->json(['status' => 'ok']));

// Authenticated routes
Route::middleware('auth:sanctum')->group(function (): void {
    //
});
