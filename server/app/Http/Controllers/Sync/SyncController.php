<?php

declare(strict_types=1);

namespace App\Http\Controllers\Sync;

use App\Actions\Sync\ExportDatabaseAction;
use App\Actions\Sync\ReadHoldsAction;
use App\Actions\Sync\StageDatabaseAction;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

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
    public function export(ExportDatabaseAction $export): BinaryFileResponse
    {
        $snapshot = $export->execute();

        // The snapshot is the whole academy: it must not outlive the request.
        // Sending deletes it, a HEAD request and a download the client drops
        // halfway included (Symfony ignores the abort and deletes in a
        // `finally`). The end of the request deletes it too, should anything
        // fail between here and the send.
        register_shutdown_function(static fn () => @unlink($snapshot->path));

        return response()
            ->download($snapshot->path, 'budojo.sqlite', [
                'Content-Type' => 'application/octet-stream',
                'X-Budojo-Schema' => $snapshot->schema,
            ])
            ->deleteFileAfterSend();
    }

    public function stage(Request $request, StageDatabaseAction $stage, ReadHoldsAction $holds): Response
    {
        $body = $request->getContent(true);
        if (! \is_resource($body)) {
            throw new \RuntimeException('could not read the incoming database');
        }
        // `?rebase=1`: this device has writes to carry onto it (#2031 step 3).
        // `?homecoming=1`: it brings the other device's work on this academy,
        // and the owner is told what arrived (#2039); never a whole academy.
        $stage->execute($body, $request->boolean('rebase'), $request->boolean('homecoming') ? $holds->execute() : null);

        return response()->noContent();
    }
}
