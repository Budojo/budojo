<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Http\Controllers\Controller;
use App\Http\Resources\DocumentResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Athlete-portal documents read-only list (M7 PR-D slice 5).
 *
 * `GET /api/v1/me/documents` — returns the auth athlete's documents
 * (ID, medical cert, insurance) in descending-created-at order, 50
 * per page. Soft-deleted rows are excluded — the athlete-self
 * surface is read-only and doesn't need the owner-side `?trashed=1`
 * tombstone view.
 *
 * Owners and orphan athlete-role users → 404 with the same
 * `No athlete profile found.` envelope used by the other `/me/*`
 * endpoints.
 *
 * **V1 is read-only** — athletes can SEE what's on file but cannot
 * upload from this surface. Owner-managed uploads (the existing
 * `/athletes/{id}/documents` endpoint) remain the only entry point.
 * Athlete-side upload is a deliberate V2 question (involves identity
 * verification, content scanning, document-replace policy).
 */
class MyDocumentsController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $athlete = $user->athlete;
        if ($athlete === null) {
            return response()->json(['message' => 'No athlete profile found.'], 404);
        }

        $documents = $athlete->documents()
            ->orderBy('created_at', 'desc')
            ->paginate(50);

        return DocumentResource::collection($documents);
    }
}
