<?php

declare(strict_types=1);

namespace App\Actions\Document;

use App\Models\Document;
use Illuminate\Support\Facades\Storage;

class DeleteDocumentAction
{
    /**
     * Soft-delete the document row AND remove its file from the `local` disk.
     * Missing files are tolerated — a missing file on disk does not prevent the
     * DB row from being soft-deleted. This matches the GDPR-friendly policy:
     * the source of truth is the DB, the file is best-effort cleanup.
     */
    public function execute(Document $document): void
    {
        Storage::disk('local')->delete($document->file_path);
        $document->delete();
    }
}
