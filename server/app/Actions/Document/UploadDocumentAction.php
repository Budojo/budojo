<?php

declare(strict_types=1);

namespace App\Actions\Document;

use App\Enums\DocumentType;
use App\Models\Athlete;
use App\Models\Document;
use App\Support\DocumentEncryption;
use Illuminate\Http\UploadedFile;
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
     * **Encryption at rest (#224)** — when `$type === MedicalCertificate`
     * the bytes are AES-256-GCM encrypted via `DocumentEncryption` before
     * landing on disk; no plaintext is persisted. Other document types
     * stay plaintext (not special-category data under GDPR Art. 9).
     * Caller-side this is transparent — the row's `is_encrypted` flag
     * tells the download path how to read it back.
     */
    public function execute(
        Athlete $athlete,
        DocumentType $type,
        UploadedFile $file,
        ?string $issuedAt = null,
        ?string $expiresAt = null,
        ?string $notes = null,
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
            Storage::disk('local')->put($path, $ciphertext);
        } else {
            $stored = $file->store('documents', 'local');
            if ($stored === false) {
                throw new \RuntimeException('Failed to store uploaded document.');
            }
            $path = $stored;
        }

        try {
            return $athlete->documents()->create([
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
        } catch (\Throwable $e) {
            // DB insert failed: wipe the orphan file and re-throw so the
            // caller (FormRequest/controller) surfaces the error as-is.
            Storage::disk('local')->delete($path);

            throw $e;
        }
    }
}
