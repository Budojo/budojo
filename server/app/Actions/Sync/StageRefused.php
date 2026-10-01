<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use Illuminate\Http\JsonResponse;

/**
 * Why a database was not staged, for the app to say in the owner's words: the
 * same two codes a restore uses (`desktop/src/backup.ts`, `RestoreRefusal`).
 * `newer` means update Budojo first; `unreadable` means the file is not a
 * Budojo database, or is damaged.
 */
final class StageRefused extends \RuntimeException
{
    private function __construct(
        public readonly string $reason,
        string $message,
    ) {
        parent::__construct($message);
    }

    public static function unreadable(string $message): self
    {
        return new self('unreadable', $message);
    }

    public static function newer(string $schema): self
    {
        return new self('newer', "The database is from a newer Budojo (schema {$schema}). Update Budojo first.");
    }

    public function render(): JsonResponse
    {
        return response()->json(['code' => $this->reason, 'message' => $this->getMessage()], 422);
    }
}
