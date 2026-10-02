<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use Illuminate\Support\Facades\DB;

/** This device's kept entries, oldest first, in the protocol's shape (#2031). */
final class ListJournalAction
{
    /** @return array<int, array<string, mixed>> */
    public function execute(string $device): array
    {
        return DB::table('sync_journal')->where('device', $device)->orderBy('id')->get()
            ->map(static fn (object $row): array => [
                'id' => $row->id,
                'device' => $row->device,
                'at' => $row->at,
                'method' => $row->method,
                'route' => $row->route,
                'params' => self::decode($row->params),
                'body' => self::decode($row->body),
                'created' => self::decode($row->created),
                'before' => self::decode($row->before),
            ])
            ->values()
            ->all();
    }

    private static function decode(mixed $json): mixed
    {
        return \is_string($json) ? json_decode($json, false, 512, JSON_THROW_ON_ERROR) : null;
    }
}
