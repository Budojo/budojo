<?php

declare(strict_types=1);

namespace App\Http\Controllers\Academy;

use App\Actions\Document\UploadDocumentAction;
use App\Enums\DocumentType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Document\UploadAcademyDocumentRequest;
use App\Http\Resources\DocumentResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The academy's own papers (#1743) — the DAE / BLSD-D certificate, the
 * civil-liability policy, the federation affiliation, the lease.
 *
 * The shape of `AthleteDocumentController`, with the academy in place of the
 * athlete. There is no route parameter: the subject is the caller's active
 * academy, so there is no cross-tenant id to validate — which is the one thing
 * this controller has that its sibling does not.
 *
 * Update, download and delete are NOT here. `PUT|DELETE /documents/{id}` and
 * `GET /documents/{id}/download` are already flat and already scope through
 * `Document::owningAcademyId()`, which answers for both kinds of owner.
 */
class AcademyDocumentController extends Controller
{
    public function __construct(private readonly UploadDocumentAction $uploadAction)
    {
    }

    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        if ($academy === null) {
            return response()->json(['message' => 'No academy found.'], 403);
        }

        // Same tombstone contract as the per-athlete list (PRD P0.7b):
        // `?trashed=1` includes soft-deleted rows so the UI can render them
        // behind a "Show cancelled" toggle.
        $query = $request->boolean('trashed')
            ? $academy->documents()->withTrashed()
            : $academy->documents();

        $documents = $query
            ->orderBy('created_at', 'desc')
            ->paginate(50);

        return DocumentResource::collection($documents);
    }

    public function store(UploadAcademyDocumentRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        if ($academy === null) {
            return response()->json(['message' => 'No academy found.'], 403);
        }

        $file = $request->file('file');
        if (! $file instanceof \Illuminate\Http\UploadedFile) {
            return response()->json(['message' => 'File missing.'], 422);
        }

        $document = $this->uploadAction->execute(
            owner: $academy,
            type: DocumentType::from($request->string('type')->toString()),
            file: $file,
            issuedAt: $request->filled('issued_at') ? $request->string('issued_at')->toString() : null,
            expiresAt: $request->filled('expires_at') ? $request->string('expires_at')->toString() : null,
            notes: $request->filled('notes') ? $request->string('notes')->toString() : null,
        );

        return response()->json(['data' => new DocumentResource($document)], 201);
    }
}
