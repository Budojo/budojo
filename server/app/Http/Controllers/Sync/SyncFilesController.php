<?php

declare(strict_types=1);

namespace App\Http\Controllers\Sync;

use App\Actions\Sync\FindSyncFileAction;
use App\Actions\Sync\ListNamedContentsAction;
use App\Actions\Sync\ListSyncFilesAction;
use App\Actions\Sync\ReceiveSyncFileAction;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * The files side of the sync (#2030 part 2, PRD § 5.2). The app seals and
 * moves them (`client/src/app/core/sync/files.ts`); the server says which
 * contents its database names, hands out the ones it holds, and takes the
 * ones it lacks.
 *
 * - `GET /api/v1/sync/files`: each content once, its size, and whether it is here.
 * - `GET /api/v1/sync/files/{sha256}`: its bytes.
 * - `PUT /api/v1/sync/files/{sha256}`: another device's bytes for it.
 * - `POST /api/v1/sync/files/named`: the contents a version's database names,
 *   for the app to delete from the folder what no kept version names (#2118).
 */
class SyncFilesController extends Controller
{
    public function index(ListSyncFilesAction $list): JsonResponse
    {
        return response()->json(['data' => $list->execute()]);
    }

    public function show(string $sha256, FindSyncFileAction $find): BinaryFileResponse
    {
        return response()->file($find->execute($sha256)->absolutePath(), [
            'Content-Type' => 'application/octet-stream',
        ]);
    }

    public function store(Request $request, string $sha256, ReceiveSyncFileAction $receive): Response
    {
        $receive->execute($sha256, $request->getContent());

        return response()->noContent();
    }

    public function named(Request $request, ListNamedContentsAction $list): JsonResponse
    {
        $body = $request->getContent(true);
        if (! \is_resource($body)) {
            throw new \RuntimeException('could not read the incoming database');
        }

        return response()->json(['data' => $list->execute($body)]);
    }
}
