<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Actions\Sync\RecordJournalEntryAction;
use App\Enums\Capability;
use App\Support\Capabilities;
use App\Support\Sync\Journal\JournalBody;
use App\Support\Sync\Journal\JournalRecorder;
use App\Support\Sync\Journal\JournalRoutes;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Records the academy's writes into the journal, on a paired device (#2031,
 * `docs/sync/protocol.md` § A journal entry). The write and its entry share
 * one transaction: a row never exists without the entry that made it, nor an
 * entry without its row. Only a successful write is recorded; the
 * transaction commits either way, so a failed write behaves as it always has.
 */
final class RecordJournalEntry
{
    private const array WRITES = ['POST', 'PUT', 'PATCH', 'DELETE'];

    public function __construct(
        private readonly JournalRecorder $recorder,
        private readonly RecordJournalEntryAction $record,
    ) {
    }

    public function handle(Request $request, \Closure $next): Response
    {
        $device = config('budojo.sync.device');
        $route = $request->route();
        $name = $route instanceof Route ? $route->getName() : null;
        if (
            ! \is_string($device) || $device === '' || ! $route instanceof Route
            || ! \in_array($request->method(), self::WRITES, true)
            || ! Capabilities::has(Capability::Sync) || ! JournalRoutes::journals($name)
        ) {
            return $next($request);
        }

        $body = JournalBody::from($request);
        $this->recorder->arm();
        DB::beginTransaction();

        try {
            $response = $next($request);
            if ($response->isSuccessful()) {
                $this->record->execute(
                    $device,
                    $request->method(),
                    (string) $name,
                    self::params($route),
                    $body,
                    $this->recorder->createdIds(),
                    $this->recorder->before(),
                );
            }
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();

            throw $e;
        } finally {
            $this->recorder->disarm();
        }

        return $response;
    }

    /** @return array<string, int|string> the route's parameters as the URL gave them, numbers as numbers */
    private static function params(Route $route): array
    {
        $params = [];
        foreach ($route->originalParameters() as $key => $value) {
            $params[(string) $key] = \is_string($value) && ctype_digit($value) ? (int) $value : (string) $value;
        }

        return $params;
    }
}
