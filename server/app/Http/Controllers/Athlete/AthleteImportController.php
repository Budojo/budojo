<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Athlete\ImportAthletesAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Athlete\ImportAthletesRequest;
use App\Models\Academy;
use App\Support\Import\AthleteColumnMap;
use App\Support\Import\AthleteCsv;
use Illuminate\Http\JsonResponse;

/**
 * Import a roster from a CSV (#1346).
 *
 * Two calls, same endpoint. The first sends the file alone and gets back the
 * columns found, the mapping guessed, and what every row *would* do. The
 * second sends the file again with `validate_only=false` — and, if the guess
 * needed correcting, the mapping to use instead.
 *
 * Uploading twice rather than holding the file server-side between steps: a
 * local-first desktop app has no session store worth parking a file in, and a
 * second upload of a 60-row CSV over a loopback socket costs nothing measurable
 * against a stateful temp file that has to be cleaned up, expired and secured.
 */
class AthleteImportController extends Controller
{
    /** Without these there is nothing to import; every row would fail identically. */
    private const REQUIRED = ['first_name', 'last_name', 'belt'];

    public function __invoke(ImportAthletesRequest $request, ImportAthletesAction $import): JsonResponse
    {
        $academy = $request->user()?->activeAcademy();
        if (! $academy instanceof Academy) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $csv = AthleteCsv::read((string) file_get_contents($request->file('file')->getRealPath()));

        if ($csv->header === []) {
            return response()->json(['message' => 'The file has no header row.'], 422);
        }

        if (\count($csv->rows) > ImportAthletesAction::MAX_ROWS) {
            return response()->json([
                'message' => 'The file has more rows than one import can take.',
                'max_rows' => ImportAthletesAction::MAX_ROWS,
            ], 422);
        }

        // The caller's mapping wins where it speaks, and the guess fills the
        // rest — so correcting one wrong column does not mean re-stating the
        // four the server got right.
        $mapping = $request->suppliedMapping() + AthleteColumnMap::guess($csv->header);

        $missing = array_values(array_diff(self::REQUIRED, array_keys($mapping)));
        if ($missing !== []) {
            // Answered before validating a single row, because the alternative
            // is sixty identical "belt is required" errors that say nothing
            // about the actual problem: a column nobody matched.
            return response()->json([
                'message' => 'Some required columns are not mapped.',
                'missing' => $missing,
                'columns' => $csv->header,
                'mapping' => $mapping,
            ], 422);
        }

        $report = $import->execute($academy, $csv, $mapping, $request->isDryRun());

        return response()->json([
            'data' => [
                'dry_run' => $request->isDryRun(),
                'delimiter' => $csv->delimiter,
                'columns' => $csv->header,
                'mapping' => $mapping,
                'fields' => AthleteColumnMap::FIELDS,
                ...$report,
            ],
        ], 200);
    }
}
