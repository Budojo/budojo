<?php

declare(strict_types=1);

namespace App\Http\Controllers\Document;

use App\Actions\Document\DeleteDocumentAction;
use App\Actions\Document\GetExpiringDocumentsAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Document\UpdateDocumentRequest;
use App\Http\Resources\DocumentResource;
use App\Models\Document;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentController extends Controller
{
    /**
     * Max look-ahead window the dashboard endpoint accepts. A year out is
     * enough for every real use case of the "expiring soon" widget; capping
     * it prevents a caller from pulling the entire academy history by
     * passing an absurd `days` value.
     */
    private const int MAX_EXPIRING_DAYS = 365;

    public function __construct(
        private readonly DeleteDocumentAction $deleteAction,
        private readonly GetExpiringDocumentsAction $expiringAction,
    ) {
    }

    public function expiring(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->academy === null) {
            return response()->json(['message' => 'No academy found.'], 403);
        }

        $daysParam = $request->input('days', 30);
        $days = is_numeric($daysParam) ? (int) $daysParam : 30;
        $days = max(1, min($days, self::MAX_EXPIRING_DAYS));

        $documents = $this->expiringAction->execute($user->academy, $days);

        return DocumentResource::collection($documents);
    }

    public function download(Request $request, Document $document): StreamedResponse|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $this->userOwns($user, $document)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // Tombstone: soft-deleted documents are visible in the list (via
        // ?trashed=1) but the file has been wiped — 410 Gone is the correct
        // status for a resource that once existed and is permanently gone.
        if ($document->trashed()) {
            return response()->json(
                ['message' => 'This document has been cancelled and is no longer available.'],
                410,
            );
        }

        if (! Storage::disk('local')->exists($document->file_path)) {
            return response()->json(['message' => 'File not found.'], 404);
        }

        return Storage::disk('local')->download(
            $document->file_path,
            $document->original_name,
            ['Content-Type' => $document->mime_type],
        );
    }

    public function update(UpdateDocumentRequest $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $this->userOwns($user, $document)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $document->update($request->validated());

        return response()->json(['data' => new DocumentResource($document->fresh())]);
    }

    public function destroy(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $this->userOwns($user, $document)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $this->deleteAction->execute($document);

        return response()->json(null, 204);
    }

    /**
     * A document belongs to the authenticated user iff the authenticated user
     * owns an academy and the document's athlete belongs to that academy.
     */
    private function userOwns(User $user, Document $document): bool
    {
        return $user->academy !== null
            && $document->athlete !== null
            && $document->athlete->academy_id === $user->academy->id;
    }
}
