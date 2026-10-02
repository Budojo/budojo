<?php

declare(strict_types=1);

namespace App\Support\Sync\Journal;

use App\Support\DocumentEncryption;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * The uploads the journal keeps for a replay to send again (#2031), on the
 * private disk by their content: `sync/journal/<sha256>`.
 *
 * **Encrypted at rest, like a medical certificate** (`UploadDocumentAction`,
 * #224): with the document key configured, as every local device has it,
 * the bytes are kept as `<sha256>.enc` under `DocumentEncryption`. A journal
 * never becomes the plaintext copy the upload itself refused to write.
 *
 * Kept only for a write that succeeded, and swept as soon as no kept entry
 * names them: by `DELETE /sync/journal` and by the reconcile after a swap.
 */
final class JournalUploads
{
    public const string FOLDER = 'sync/journal';

    public function keep(string $sha256, string $bytes): void
    {
        $disk = Storage::disk('local');
        $encryption = self::encryption();
        $path = self::path($sha256, $encryption !== null);
        if ($disk->exists($path)) {
            return;
        }
        $stored = $encryption === null ? $bytes : $encryption->encrypt($bytes);
        if (! $disk->put($path, $stored)) {
            throw new \RuntimeException('could not keep an upload for the journal');
        }
    }

    /** The upload's bytes, decrypted; null when none is kept. */
    public function read(string $sha256): ?string
    {
        $disk = Storage::disk('local');
        $encrypted = self::path($sha256, true);
        if ($disk->exists($encrypted)) {
            $encryption = self::encryption() ?? throw new \RuntimeException('a kept upload is encrypted, and the document key is not configured');

            return $encryption->decrypt((string) $disk->get($encrypted));
        }
        $plain = self::path($sha256, false);

        return $disk->exists($plain) ? (string) $disk->get($plain) : null;
    }

    /** Deletes every kept upload no entry in `sync_journal` names. */
    public function sweep(): int
    {
        $named = [];
        foreach (DB::table('sync_journal')->pluck('body') as $body) {
            foreach (JournalBody::files(\is_string($body) ? json_decode($body, true) : null) as $sha256) {
                $named[$sha256] = true;
            }
        }
        $disk = Storage::disk('local');
        $deleted = 0;
        foreach ($disk->files(self::FOLDER) as $path) {
            if (! isset($named[basename($path, '.enc')])) {
                $disk->delete($path);
                $deleted++;
            }
        }

        return $deleted;
    }

    private static function path(string $sha256, bool $encrypted): string
    {
        return self::FOLDER . "/{$sha256}" . ($encrypted ? '.enc' : '');
    }

    private static function encryption(): ?DocumentEncryption
    {
        $key = config('documents.encryption_key');

        return \is_string($key) && $key !== '' ? new DocumentEncryption($key) : null;
    }
}
