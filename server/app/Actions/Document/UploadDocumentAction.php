<?php

declare(strict_types=1);

namespace App\Actions\Document;

use App\Enums\DocumentType;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\User;
use App\Notifications\OwnerAthleteDocUploadedNotification;
use App\Support\DocumentEncryption;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class UploadDocumentAction
{
    /**
     * Persist the uploaded file to the private `local` disk AND create the
     * matching Document row. If the DB insert fails for any reason the stored
     * file is cleaned up so we never leave orphan files under
     * `storage/app/private/documents/`.
     *
     * MIME type is read via the server-side fileinfo (`$file->getMimeType()`),
     * not the client-advertised `Content-Type`, to prevent spoofing the value
     * we later echo in the download `Content-Type` header.
     *
     * **The owner is an athlete or the academy itself (#1743).** One Action,
     * because this is one operation — store the bytes, record the row — and
     * the half that must never be duplicated is the encryption contract: a
     * second upload path is a second chance to write special-category data
     * in plaintext. The union is the whole branch; everything below it is
     * identical for both.
     *
     * **Encryption at rest (#224)** — when `$type === MedicalCertificate`
     * the bytes are AES-256-GCM encrypted via `DocumentEncryption` before
     * landing on disk; no plaintext is persisted. Other document types
     * stay plaintext (not special-category data under GDPR Art. 9).
     * Caller-side this is transparent — the row's `is_encrypted` flag
     * tells the download path how to read it back.
     */
    public function execute(
        Athlete|Academy $owner,
        DocumentType $type,
        UploadedFile $file,
        ?string $issuedAt = null,
        ?string $expiresAt = null,
        ?string $notes = null,
        ?User $uploader = null,
    ): Document {
        $configKey = config('documents.encryption_key');
        $shouldEncrypt = $type === DocumentType::MedicalCertificate
            && \is_string($configKey)
            && $configKey !== '';

        if ($shouldEncrypt) {
            // Encrypt the bytes in memory then write the ciphertext
            // directly. We can't $file->store() first and re-write —
            // that would leave plaintext on disk between the two
            // operations, violating the "no plaintext ever persists"
            // contract from the issue.
            $plaintext = $file->get();
            if (! \is_string($plaintext)) {
                throw new \RuntimeException('Failed to read uploaded document bytes.');
            }
            $encryption = new DocumentEncryption();
            $ciphertext = $encryption->encrypt($plaintext);
            $path = 'documents/' . Str::random(40) . '.enc';
            // `put` returns false on disk-write failure. Without
            // checking we'd create a DB row pointing at a missing /
            // partial file — the download path would 404 and the
            // user has no signal that something went wrong on
            // upload. Throw so the controller surfaces a 500 instead.
            $written = Storage::disk('local')->put($path, $ciphertext);
            if ($written !== true) {
                throw new \RuntimeException('Failed to store encrypted document.');
            }
        } else {
            $stored = $file->store('documents', 'local');
            if ($stored === false) {
                throw new \RuntimeException('Failed to store uploaded document.');
            }
            $path = $stored;
        }

        try {
            // `documents()` exists on both, so the row lands with exactly one
            // of `athlete_id` / `academy_id` set without this Action naming
            // either column — the relation is the invariant.
            $document = $owner->documents()->create([
                'type' => $type,
                'file_path' => $path,
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType() ?: 'application/octet-stream',
                'size_bytes' => $file->getSize() ?: 0,
                'is_encrypted' => $shouldEncrypt,
                'issued_at' => $issuedAt,
                'expires_at' => $expiresAt,
                'notes' => $notes,
            ]);

            // Athlete-side only: the push tells the owner that somebody
            // uploaded a document for one of their athletes. The owner
            // uploading the academy's own liability policy does not need
            // telling that they did it.
            if ($owner instanceof Athlete) {
                $this->maybeNotifyOwner($document, $owner, $uploader);
            }

            return $document;
        } catch (\Throwable $e) {
            // DB insert failed: wipe the orphan file and re-throw so the
            // caller (FormRequest/controller) surfaces the error as-is.
            Storage::disk('local')->delete($path);

            throw $e;
        }
    }

    /**
     * Owner-side push when an athlete (or any non-owner user) uploads
     * a document (#729 C1). Skipped today when the caller doesn't pass
     * an `$uploader` — that branch is the legacy owner-side upload
     * path where the owner is BOTH uploader and recipient (self-ping
     * not desired). Once the athlete self-upload feature lands, the
     * controller will pass `$request->user()` and the dispatch fires.
     */
    private function maybeNotifyOwner(Document $document, Athlete $athlete, ?User $uploader): void
    {
        if ($uploader === null) {
            return;
        }
        $owner = $athlete->academy?->owner;
        if ($owner === null || $owner->id === $uploader->id) {
            return;
        }
        if (! NotificationPreferences::isEnabled($owner, NotificationCategory::OWNER_ATHLETE_DOC_UPLOADED)) {
            return;
        }

        try {
            $owner->notify(new OwnerAthleteDocUploadedNotification($document));
        } catch (\Throwable $e) {
            Log::warning('owner_athlete_doc_uploaded notification failed', [
                'document_id' => $document->id,
                'athlete_id' => $athlete->id,
                'owner_id' => $owner->id,
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
