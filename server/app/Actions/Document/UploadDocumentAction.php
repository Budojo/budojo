<?php

declare(strict_types=1);

namespace App\Actions\Document;

use App\Enums\DocumentType;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

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
     */
    public function execute(
        Athlete $athlete,
        DocumentType $type,
        UploadedFile $file,
        ?string $issuedAt = null,
        ?string $expiresAt = null,
        ?string $notes = null,
    ): Document {
        $path = $file->store('documents', 'local');

        if ($path === false) {
            throw new \RuntimeException('Failed to store uploaded document.');
        }

        try {
            return $athlete->documents()->create([
                'type' => $type,
                'file_path' => $path,
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType() ?: 'application/octet-stream',
                'size_bytes' => $file->getSize() ?: 0,
                'issued_at' => $issuedAt,
                'expires_at' => $expiresAt,
                'notes' => $notes,
            ]);
        } catch (\Throwable $e) {
            // DB insert failed: wipe the orphan file and re-throw so the
            // caller (FormRequest/controller) surfaces the error as-is.
            Storage::disk('local')->delete($path);

            throw $e;
        }
    }
}
