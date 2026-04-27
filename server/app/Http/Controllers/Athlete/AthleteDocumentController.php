<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Document\UploadDocumentAction;
use App\Enums\DocumentType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Document\UploadDocumentRequest;
use App\Http\Resources\DocumentResource;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AthleteDocumentController extends Controller
{
    public function __construct(private readonly UploadDocumentAction $uploadAction)
    {
    }

    public function index(Request $request, Athlete $athlete): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->academy === null || $athlete->academy_id !== $user->academy->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // ?trashed=1 opts in to the tombstone view: soft-deleted rows appear
        // in the list alongside the active ones so the UI can render them
        // behind a "Show cancelled" toggle. See PRD P0.7b for the contract.
        $query = $request->boolean('trashed')
            ? $athlete->documents()->withTrashed()
            : $athlete->documents();

        $documents = $query
            ->orderBy('created_at', 'desc')
            ->paginate(50);

        return DocumentResource::collection($documents);
    }

    public function store(UploadDocumentRequest $request, Athlete $athlete): JsonResponse
    {
        $file = $request->file('file');
        if (! $file instanceof \Illuminate\Http\UploadedFile) {
            return response()->json(['message' => 'File missing.'], 422);
        }

        $document = $this->uploadAction->execute(
            athlete: $athlete,
            type: DocumentType::from($request->string('type')->toString()),
            file: $file,
            issuedAt: $request->filled('issued_at') ? $request->string('issued_at')->toString() : null,
            expiresAt: $request->filled('expires_at') ? $request->string('expires_at')->toString() : null,
            notes: $request->filled('notes') ? $request->string('notes')->toString() : null,
        );

        return response()->json(['data' => new DocumentResource($document)], 201);
    }
}
