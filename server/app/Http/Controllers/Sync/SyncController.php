<?php

declare(strict_types=1);

namespace App\Http\Controllers\Sync;

use App\Actions\Sync\ExportDatabaseAction;
use App\Actions\Sync\StageDatabaseAction;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The database side of the sync (#2030, PRD § 5.2). The app packs and seals
 * versions itself (`client/src/app/core/sync`, #2029); the server hands it the
 * database and takes one back.
 *
 * - `GET /api/v1/sync/export`: a snapshot of the database, with its schema in
 *   `X-Budojo-Schema`.
 * - `PUT /api/v1/sync/stage`: another device's database, checked and put
 *   beside the live one for the shell to swap in at its next start.
 */
class SyncController extends Controller
{
    public function export(ExportDatabaseAction $export): StreamedResponse
    {
        $snapshot = $export->execute();

        return response()->streamDownload(
            function () use ($snapshot): void {
                try {
                    readfile($snapshot->path);
                } finally {
                    @unlink($snapshot->path);
                }
            },
            'budojo.sqlite',
            ['Content-Type' => 'application/octet-stream', 'X-Budojo-Schema' => $snapshot->schema],
        );
    }

    public function stage(Request $request, StageDatabaseAction $stage): Response
    {
        $body = $request->getContent(true);
        if (! \is_resource($body)) {
            throw new \RuntimeException('could not read the incoming database');
        }
        $stage->execute($body);

        return response()->noContent();
    }
}
