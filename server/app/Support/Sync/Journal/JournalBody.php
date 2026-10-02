<?php

declare(strict_types=1);

namespace App\Support\Sync\Journal;

use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * A journaled request's body (#2031). An uploaded file cannot sit in JSON,
 * and a replay must upload it again: so its bytes are kept on this device by
 * their content (`sync/journal/<sha256>` on the private disk) until the
 * entry is cleared, and the body names them:
 * `{ "$file": { "sha256": …, "name": "p.png", "type": "image/png" } }`.
 */
final class JournalBody
{
    public const string FOLDER = 'sync/journal';

    /** @return array<string, mixed>|null */
    public static function from(Request $request): ?array
    {
        $body = self::keep($request->all());
        if (! \is_array($body) || $body === []) {
            return null;
        }
        $keyed = [];
        foreach ($body as $key => $value) {
            $keyed[(string) $key] = $value;
        }

        return $keyed;
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

    private static function keep(mixed $value): mixed
    {
        if ($value instanceof UploadedFile) {
            return ['$file' => self::store($value)];
        }
        if (\is_array($value)) {
            return array_map(self::keep(...), $value);
        }

        return $value;
    }

    /** @return array{sha256: string, name: string, type: string} */
    private static function store(UploadedFile $file): array
    {
        $bytes = $file->get();
        if (! \is_string($bytes)) {
            throw new \RuntimeException('could not read an uploaded file to journal it');
        }
        $sha256 = hash('sha256', $bytes);
        $disk = Storage::disk('local');
        $path = self::FOLDER . "/{$sha256}";
        if (! $disk->exists($path) && ! $disk->put($path, $bytes)) {
            throw new \RuntimeException('could not keep an uploaded file for the journal');
        }

        return ['sha256' => $sha256, 'name' => $file->getClientOriginalName(), 'type' => (string) $file->getClientMimeType()];
    }
}
