<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\Journal\JournalBody;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route as Routes;

/**
 * The writes a rebase set aside that wait for the owner (#2031, PRD § 6.4),
 * oldest first, with what the page needs to ask about each:
 * - **`subject`:** the athlete the write is about, by name, when it is about
 *   one;
 * - **`retry`:** the requests that make the set-aside write true here, in this
 *   database's ids, for «Tieni la mia», or null when there are none.
 *
 * **When there is no `retry`:**
 * - a write whose row is gone here;
 * - an upload (its bytes are on the device that made it);
 * - a payment whose amount the fee here works out otherwise (no request sets
 *   an amount);
 * - a route this Budojo no longer has.
 *
 * A month paid otherwise is undone first, then paid as the entry paid it.
 */
final class ListConflictsAction
{
    /** @return list<array<string, mixed>> */
    public function execute(): array
    {
        return array_values(DB::table('sync_conflicts')->whereNull('decided_at')->orderBy('recorded_at')->orderBy('entry_id')->get()
            ->map(function (object $row): array {
                $entry = self::decode($row->entry);
                $detail = self::decode($row->detail);
                $route = (string) $row->route;
                $reason = (string) $row->reason;

                return [
                    'id' => (string) $row->entry_id,
                    'device' => (string) $row->device,
                    'route' => $route,
                    'reason' => $reason,
                    'detail' => (object) $detail,
                    'entry' => (object) $entry,
                    'recorded_at' => (string) $row->recorded_at,
                    'subject' => self::subject($entry),
                    'retry' => self::retry($route, $reason, $detail, $entry),
                ];
            })
            ->all());
    }

    /**
     * @param  array<string, mixed>  $entry
     * @return array{athlete: array{id: int, name: string}}|null
     */
    private static function subject(array $entry): ?array
    {
        $params = \is_array($entry['params'] ?? null) ? $entry['params'] : [];
        $body = \is_array($entry['body'] ?? null) ? $entry['body'] : [];
        $ids = \is_array($body['athlete_ids'] ?? null) ? $body['athlete_ids'] : [];
        $id = $params['athlete'] ?? $body['athlete_id'] ?? ($ids[0] ?? null);
        if (! is_numeric($id)) {
            return null;
        }
        $athlete = DB::table('athletes')->where('id', (int) $id)->first(['id', 'first_name', 'last_name']);

        return $athlete === null ? null : ['athlete' => [
            'id' => (int) $athlete->id,
            'name' => trim("{$athlete->first_name} {$athlete->last_name}"),
        ]];
    }

    /**
     * @param  array<string, mixed>  $detail
     * @param  array<string, mixed>  $entry
     * @return list<array{method: string, url: string, body: mixed}>|null
     */
    private static function retry(string $name, string $reason, array $detail, array $entry): ?array
    {
        $route = Routes::getRoutes()->getByName($name);
        $method = \is_string($entry['method'] ?? null) ? $entry['method'] : null;
        $params = \is_array($entry['params'] ?? null) ? $entry['params'] : [];
        $body = $entry['body'] ?? null;
        if (! $route instanceof Route || $method === null || $reason === 'gone' || JournalBody::files($body) !== []) {
            return null;
        }
        $write = ['method' => $method, 'url' => route($name, $params, false), 'body' => $body];
        if ($name === 'athletes.payments.store' && $reason === 'differs') {
            $month = \is_array($body) ? [$body['year'] ?? null, $body['month'] ?? null] : [null, null];
            if (($detail['field'] ?? null) === 'amount_cents' || ! is_numeric($month[0]) || ! is_numeric($month[1])) {
                return null;
            }
            $undo = route('athletes.payments.destroy', [...$params, 'year' => (int) $month[0], 'month' => (int) $month[1]], false);

            return [['method' => 'DELETE', 'url' => $undo, 'body' => null], $write];
        }

        return [$write];
    }

    /** @return array<string, mixed> */
    private static function decode(mixed $json): array
    {
        $value = \is_string($json) ? json_decode($json, true) : null;

        return \is_array($value) ? $value : [];
    }
}
