<?php

declare(strict_types=1);

namespace App\Support\Sync;

use Illuminate\Support\Facades\Storage;

/** A file a row of the database names: where it lives, and the content it should hold (#2030). */
final readonly class NamedFile
{
    public function __construct(
        public string $sha256,
        public string $disk,
        public string $path,
    ) {
    }

    /** True when this device holds the expected content at that path, not merely a file there. */
    public function isPresent(): bool
    {
        return ContentHash::of($this->disk, $this->path) === $this->sha256;
    }

    public function absolutePath(): string
    {
        return Storage::disk($this->disk)->path($this->path);
    }
}
