<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Actions\User\ExportUserDataAction;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GDPR Art. 20 — data portability. Returns the authenticated user's full
 * dataset as either JSON (default) or a ZIP that bundles the JSON plus
 * the binary documents (medical certificates, IDs, etc.) under a
 * predictable folder layout.
 *
 * Throttled at the route layer to one call per minute per user — the
 * ZIP variant in particular is expensive on disk + bandwidth, and a
 * tight cap protects against accidental loops in client retry logic.
 */
class ExportController extends Controller
{
    public function __construct(
        private readonly ExportUserDataAction $export,
    ) {
    }

    public function __invoke(Request $request): JsonResponse|StreamedResponse|Response
    {
        /** @var User $user */
        $user = $request->user();

        $payload = $this->export->execute($user);
        $stamp = now()->format('Y-m-d-His');
        $baseFilename = \sprintf('budojo-export-user-%d-%s', $user->id, $stamp);

        if ($request->query('format') === 'zip') {
            return $this->buildZipResponse($payload, $baseFilename);
        }

        return response()
            ->json($payload)
            ->header('Content-Disposition', 'attachment; filename="' . $baseFilename . '.json"');
    }

    /**
     * Builds the ZIP on a temp file, streams it, then cleans up. We do
     * NOT keep the archive in memory — a coach-of-coaches academy with
     * a few hundred athletes and full medical certs can push the JSON +
     * binaries past PHP's memory_limit. The temp file is unlinked at
     * stream-end and on every error path; the OS also evicts it on
     * reboot since it lives under `sys_get_temp_dir()`.
     *
     * @param  array{version: string, exported_at: string, data: array<string, mixed>}  $payload
     */
    private function buildZipResponse(array $payload, string $baseFilename): StreamedResponse|Response
    {
        // tempnam() already creates a real file at the returned path —
        // we open the ZIP in place rather than appending a `.zip`
        // suffix, which would leave the original empty tempfile behind.
        $tmp = tempnam(sys_get_temp_dir(), 'budojo-export-');
        if ($tmp === false) {
            return response('Could not allocate export archive.', 500);
        }

        $zip = new \ZipArchive();
        if ($zip->open($tmp, \ZipArchive::OVERWRITE) !== true) {
            @unlink($tmp);

            return response('Could not create export archive.', 500);
        }

        try {
            $jsonBytes = json_encode(
                $payload,
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
            );
        } catch (\JsonException $_) {
            $zip->close();
            @unlink($tmp);

            return response('Could not encode export payload.', 500);
        }

        $zip->addFromString('data.json', $jsonBytes);

        // Bundle the document binaries under documents/athlete-{id}/.
        // We pull from the SAME payload the JSON sees so the file tree
        // and JSON metadata never disagree. The PHPDoc array-shape lets
        // PHPStan see real ints behind the `id` keys instead of `mixed`,
        // which the previous loose-array typing wouldn't carry through.
        /** @var list<array{id: int, documents: list<array{id: int, storage_path: string, original_name: string}>}> $athletes */
        $athletes = $payload['data']['athletes'] ?? [];
        foreach ($athletes as $athlete) {
            foreach ($athlete['documents'] as $doc) {
                $storagePath = $doc['storage_path'];
                if (! Storage::disk('local')->exists($storagePath)) {
                    continue;
                }
                $entryName = \sprintf(
                    'documents/athlete-%d/%d-%s',
                    $athlete['id'],
                    $doc['id'],
                    $this->safeFileName($doc['original_name'], $doc['id']),
                );
                $zip->addFile(Storage::disk('local')->path($storagePath), $entryName);
            }
        }

        $zip->close();

        return response()->streamDownload(
            function () use ($tmp): void {
                $stream = fopen($tmp, 'rb');
                if ($stream !== false) {
                    fpassthru($stream);
                    fclose($stream);
                }
                @unlink($tmp);
            },
            $baseFilename . '.zip',
            ['Content-Type' => 'application/zip'],
        );
    }

    /**
     * Sanitises a user-supplied filename so it cannot break out of the
     * ZIP entry's directory (Zip Slip CVE-2018-1002200) or carry path
     * separators / control characters that confuse extractors.
     *
     * The original is the upload-time client-supplied name, surfaced
     * verbatim in the JSON metadata for traceability — but inside the
     * ZIP entry path we MUST use the basename only, with traversal and
     * separator characters stripped. Falls back to `document-{id}` if
     * sanitisation drops everything.
     */
    private function safeFileName(string $original, int $documentId): string
    {
        // basename() strips any directory component including traversal
        // attempts like "../../etc/passwd", giving us the leaf name.
        $base = basename($original);
        // Drop control characters + any residual separators / null bytes.
        $clean = (string) preg_replace('/[\\\\\/\x00-\x1F\x7F]/', '', $base);
        $clean = trim($clean, ' .');

        return $clean !== '' ? $clean : "document-{$documentId}";
    }
}
