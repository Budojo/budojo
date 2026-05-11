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
use App\Support\DocumentEncryption;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\Response;
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

    public function download(Request $request, Document $document): BinaryFileResponse|Response|StreamedResponse|JsonResponse
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

        // Encrypted (#224 — medical certs only): read ciphertext from
        // disk, decrypt fully in memory, return the plaintext as the
        // response body with the original Content-Type. We never write
        // the plaintext back to disk; the response body IS the only
        // plaintext copy that exists, and it leaves with the HTTP
        // response. Not a true StreamedResponse — the full decrypted
        // payload is buffered (medical certs are capped at 10 MB so
        // this is bounded). Streaming the decrypt would require a
        // CTR-mode-friendly cipher; GCM verifies the auth tag only
        // after consuming the full ciphertext, so a streaming variant
        // would surface tag-mismatch errors mid-response — strictly
        // worse than the buffered shape.
        if ($document->is_encrypted) {
            $blob = Storage::disk('local')->get($document->file_path);
            if (! \is_string($blob)) {
                return response()->json(['message' => 'File not found.'], 404);
            }

            try {
                $plaintext = new DocumentEncryption()->decrypt($blob);
            } catch (\Throwable $e) {
                report($e);

                return response()->json(['message' => 'Failed to decrypt document.'], 500);
            }
            // `original_name` is user-controlled — Symfony's
            // HeaderUtils::makeDisposition handles the RFC 6266
            // serialisation including the UTF-8 filename* parameter
            // and quotes/CRLF escaping. Rolling our own with
            // addslashes was a header-injection foot-gun.
            $disposition = HeaderUtils::makeDisposition(
                HeaderUtils::DISPOSITION_ATTACHMENT,
                $document->original_name,
                self::sanitizeAsciiFilename($document->original_name),
            );

            return response($plaintext, 200, [
                'Content-Type' => $document->mime_type,
                'Content-Disposition' => $disposition,
                'Content-Length' => (string) \strlen($plaintext),
            ]);
        }

        return Storage::disk('local')->download(
            $document->file_path,
            $document->original_name,
            ['Content-Type' => $document->mime_type],
        );
    }

    public function update(UpdateDocumentRequest $request, Document $document): JsonResponse
    {
        // Ownership is enforced by UpdateDocumentRequest::authorize() — a
        // failed check short-circuits with 403 before this method runs.
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

    /**
     * ASCII fallback used as the legacy `filename=` parameter on
     * Content-Disposition. RFC 6266 specifies the modern `filename*`
     * carries the UTF-8 value; older user agents that ignore it fall
     * back to this. Strip every non-ASCII char and replace any
     * quote / control / line-break with `_` so the fallback can't
     * inject headers regardless of upstream validation.
     */
    private static function sanitizeAsciiFilename(string $name): string
    {
        $ascii = (string) preg_replace('/[^\x20-\x7E]/', '', $name);
        $ascii = (string) preg_replace('/["\\\\\r\n]/', '_', $ascii);

        return $ascii === '' ? 'document' : $ascii;
    }
}
