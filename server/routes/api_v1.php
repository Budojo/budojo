<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

// Public routes
Route::get('/health', fn () => response()->json(['status' => 'ok']));
Route::post('/auth/register', \App\Http\Controllers\Auth\RegisterController::class);
Route::post('/auth/login', \App\Http\Controllers\Auth\LoginController::class);

// Authenticated routes
Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/academy', [\App\Http\Controllers\Academy\AcademyController::class, 'store']);
    Route::get('/academy', [\App\Http\Controllers\Academy\AcademyController::class, 'show']);

    Route::apiResource('athletes', \App\Http\Controllers\Athlete\AthleteController::class)
        ->only(['index', 'store', 'show', 'update', 'destroy']);

    // Documents — nested under athlete for creation and per-athlete listing
    Route::get('/athletes/{athlete}/documents', [\App\Http\Controllers\Athlete\AthleteDocumentController::class, 'index']);
    Route::post('/athletes/{athlete}/documents', [\App\Http\Controllers\Athlete\AthleteDocumentController::class, 'store']);

    // Documents — flat routes for operations that target a single document.
    // `/expiring` must come before `/{document}` routes or Laravel tries to
    // bind the literal "expiring" as a document id.
    Route::get('/documents/expiring', [\App\Http\Controllers\Document\DocumentController::class, 'expiring']);
    Route::get('/documents/{document}/download', [\App\Http\Controllers\Document\DocumentController::class, 'download']);
    Route::put('/documents/{document}', [\App\Http\Controllers\Document\DocumentController::class, 'update']);
    Route::delete('/documents/{document}', [\App\Http\Controllers\Document\DocumentController::class, 'destroy']);
});
