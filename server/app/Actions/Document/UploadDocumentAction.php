<?php

declare(strict_types=1);

namespace App\Actions\Document;

use App\Enums\DocumentType;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Http\UploadedFile;

class UploadDocumentAction
{
    public function execute(
        Athlete $athlete,
        DocumentType $type,
        UploadedFile $file,
        ?string $issuedAt = null,
        ?string $expiresAt = null,
        ?string $notes = null,
    ): Document {
        // `local` is the private disk — file is NOT reachable from the web root
        // (see docs/entities/document.md for the full privacy story).
        $path = $file->store('documents', 'local');

        if ($path === false) {
            throw new \RuntimeException('Failed to store uploaded document.');
        }

        return $athlete->documents()->create([
            'type' => $type,
            'file_path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getClientMimeType() !== ''
                ? $file->getClientMimeType()
                : $file->getMimeType(),
            'size_bytes' => $file->getSize() ?: 0,
            'issued_at' => $issuedAt,
            'expires_at' => $expiresAt,
            'notes' => $notes,
        ]);
    }
}
