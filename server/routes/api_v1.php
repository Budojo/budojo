<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1 Routes
|--------------------------------------------------------------------------
| All routes here are automatically prefixed /api/v1 and protected by the
| Sanctum stateful middleware (see bootstrap/app.php).
*/

// Public routes
Route::get('/health', fn () => response()->json(['status' => 'ok']));

// Authenticated routes
Route::middleware('auth:sanctum')->group(function (): void {
    //
});
