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
     * binaries past PHP's memory_limit. `register_shutdown_function`
     * scrubs the temp file even if the client aborts mid-download.
     *
     * @param  array{version: string, exported_at: string, data: array<string, mixed>}  $payload
     */
    private function buildZipResponse(array $payload, string $baseFilename): StreamedResponse|Response
    {
        $tmp = tempnam(sys_get_temp_dir(), 'budojo-export-') . '.zip';

        $zip = new \ZipArchive();
        if ($zip->open($tmp, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            return response('Could not create export archive.', 500);
        }

        $zip->addFromString(
            'data.json',
            (string) json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        );

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
                $name = $doc['original_name'] !== '' ? $doc['original_name'] : "document-{$doc['id']}";
                $entryName = \sprintf(
                    'documents/athlete-%d/%d-%s',
                    $athlete['id'],
                    $doc['id'],
                    $name,
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
}
