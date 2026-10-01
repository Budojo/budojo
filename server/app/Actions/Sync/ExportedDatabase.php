<?php

declare(strict_types=1);

namespace App\Actions\Sync;

/** A snapshot on disk, which the caller sends and then deletes, and its schema. */
final readonly class ExportedDatabase
{
    public function __construct(
        public string $path,
        public string $schema,
    ) {
    }
}
