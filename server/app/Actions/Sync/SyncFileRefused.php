<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use Illuminate\Http\JsonResponse;

/** Why a file from another device was not written (#2030 part 2). */
final class SyncFileRefused extends \RuntimeException
{
    private function __construct(
        public readonly string $reason,
        private readonly int $status,
        string $message,
    ) {
        parent::__construct($message);
    }

    /** No row of this database names the content: nothing here wants it. */
    public static function unknown(string $sha256): self
    {
        return new self('unknown', 404, "No file of this academy holds the content {$sha256}.");
    }

    /** The database names the content, but this device does not hold it. */
    public static function missing(string $sha256): self
    {
        return new self('missing', 404, "This device does not hold the content {$sha256}.");
    }

    /** The bytes are not the content named. */
    public static function mismatch(string $sha256): self
    {
        return new self('mismatch', 422, "The file is not the content {$sha256}.");
    }

    public function render(): JsonResponse
    {
        return response()->json(['code' => $this->reason, 'message' => $this->getMessage()], $this->status);
    }
}
