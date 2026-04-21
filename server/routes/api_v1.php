<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

// Public routes
Route::get('/health', fn () => response()->json(['status' => 'ok']));

// Authenticated routes
Route::middleware('auth:sanctum')->group(function (): void {
    //
});
