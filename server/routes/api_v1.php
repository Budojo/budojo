<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

// Public routes
Route::get('/health', fn () => response()->json(['status' => 'ok']));
Route::post('/auth/register', \App\Http\Controllers\Auth\RegisterController::class);
Route::post('/auth/login', \App\Http\Controllers\Auth\LoginController::class);

// Authenticated routes
Route::middleware('auth:sanctum')->group(function (): void {
    //
});
