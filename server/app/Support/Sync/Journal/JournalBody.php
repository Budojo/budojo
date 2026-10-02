<?php

declare(strict_types=1);

namespace App\Support\Sync\Journal;

use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;

/**
 * A journaled request's body (#2031). An uploaded file cannot sit in JSON,
 * and a replay must upload it again: the body names it by its content,
 * `{ "$file": { "sha256": …, "name": "p.png", "type": "image/png" } }`, and
 * `JournalUploads` keeps its bytes. Nothing is kept until the write has
 * succeeded: a refused upload leaves nothing on disk.
 */
final class JournalBody
{
    /**
     * @param  array<string, mixed>|null  $value
     * @param  array<string, string>  $uploads  sha256 => bytes, to keep once the write succeeded
     */
    private function __construct(
        public readonly ?array $value,
        private readonly array $uploads,
    ) {
    }

    public static function from(Request $request): self
    {
        $uploads = [];
        $body = self::describe($request->all(), $uploads);
        if (! \is_array($body) || $body === []) {
            return new self(null, $uploads);
        }
        $keyed = [];
        foreach ($body as $key => $value) {
            $keyed[(string) $key] = $value;
        }

        return new self($keyed, $uploads);
    }

    public function keepUploads(JournalUploads $store): void
    {
        foreach ($this->uploads as $sha256 => $bytes) {
            $store->keep($sha256, $bytes);
        }
    }

    /** @return list<string> the contents a body names */
    public static function files(mixed $body): array
    {
        if (! \is_array($body)) {
            return [];
        }
        $file = $body['$file'] ?? null;
        if (\is_array($file) && \is_string($file['sha256'] ?? null)) {
            return [$file['sha256']];
        }

        return array_merge([], ...array_map(self::files(...), array_values($body)));
    }

    /** @param array<string, string> $uploads */
    private static function describe(mixed $value, array &$uploads): mixed
    {
        if ($value instanceof UploadedFile) {
            $bytes = $value->get();
            if (! \is_string($bytes)) {
                throw new \RuntimeException('could not read an uploaded file to journal it');
            }
            $sha256 = hash('sha256', $bytes);
            $uploads[$sha256] = $bytes;

            return ['$file' => ['sha256' => $sha256, 'name' => $value->getClientOriginalName(), 'type' => (string) $value->getClientMimeType()]];
        }
        if (\is_array($value)) {
            $described = [];
            foreach ($value as $key => $item) {
                $described[$key] = self::describe($item, $uploads);
            }

            return $described;
        }

        return $value;
    }
}
