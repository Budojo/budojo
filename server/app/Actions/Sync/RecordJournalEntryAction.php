<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\Journal\JournalIds;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * One write of this device into its journal, and into the record of what the
 * database has dealt with (#2031). Called inside the write's transaction, so
 * the row and the entry that made it commit together or not at all.
 */
final class RecordJournalEntryAction
{
    /**
     * @param  array<string, int|string>  $params
     * @param  array<string, mixed>|null  $body
     * @param  array<string, list<int|string>>  $created
     * @param  array<string, mixed>|null  $before
     */
    public function execute(
        string $device,
        string $method,
        string $route,
        array $params,
        ?array $body,
        array $created,
        ?array $before,
    ): string {
        $id = JournalIds::next($device);
        $createdJson = self::json($created === [] ? new \stdClass() : $created);

        DB::table('sync_entries')->insert([
            'id' => $id,
            'device' => $device,
            'outcome' => 'own',
            'created' => $createdJson,
        ]);
        DB::table('sync_journal')->insert([
            'id' => $id,
            'device' => $device,
            'at' => Carbon::now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            'method' => $method,
            'route' => $route,
            'params' => self::json($params === [] ? new \stdClass() : $params),
            'body' => $body === null ? null : self::json($body),
            'created' => $createdJson,
            'before' => $before === null ? null : self::json($before),
        ]);

        return $id;
    }

    private static function json(mixed $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
