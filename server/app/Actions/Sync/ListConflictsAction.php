<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Enums\BillingPeriod;
use App\Models\Athlete;
use App\Support\MonthlyFee;
use App\Support\Sync\Journal\JournalBody;
use Carbon\CarbonImmutable;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route as Routes;
use Illuminate\Support\Facades\Schema;

/**
 * The writes a rebase set aside that wait for the owner (#2031, PRD § 6.4),
 * oldest first, with what the page needs to ask about each:
 * - **`subject`:** the athlete the write is about, by name, and how many
 *   others it names, read from the rows its route names here;
 * - **`retry`:** the requests that make the set-aside write true here, in
 *   this database's ids, for «Tieni la mia», or null when there are none.
 *
 * **A retry carries what the set-aside write changed** (`whatItChanged`),
 * never the whole form it was sent with: the other device's changes to the
 * rest stay. A month paid otherwise is undone first, then paid as the entry
 * paid it.
 *
 * **No retry when nothing would make it true:**
 * - its row is gone here, or it names a row that has none here;
 * - the rules here refused it: sent again, they would again;
 * - an upload, whose bytes are on the device that made it;
 * - a payment whose amount the fee here works out otherwise (no request
 *   sets an amount);
 * - a route this Budojo no longer has, or one its parameters no longer fit.
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
                $route = Routes::getRoutes()->getByName((string) $row->route);
                $route = $route instanceof Route ? $route : null;
                $reason = (string) $row->reason;
                $lost = \is_array($detail['lost'] ?? null) && $detail['lost'] !== [];

                return [
                    'id' => (string) $row->entry_id,
                    'device' => (string) $row->device,
                    'route' => (string) $row->route,
                    'reason' => $reason,
                    'detail' => (object) $detail,
                    'entry' => (object) $entry,
                    'recorded_at' => CarbonImmutable::parse((string) $row->recorded_at, 'UTC')->toIso8601String(),
                    'subject' => $route === null || $lost ? null : self::subject($route, $entry),
                    'retry' => $route === null || $lost ? null : self::retry($route, $reason, $detail, $entry),
                ];
            })
            ->all());
    }

    /**
     * The athlete a write is about: the row a route parameter names here when
     * it is an athlete or has one (a document, a check-in), else the body's.
     *
     * @param  array<string, mixed>  $entry
     * @return array{athlete: array{id: int, name: string}, others: int}|null
     */
    private static function subject(Route $route, array $entry): ?array
    {
        $params = \is_array($entry['params'] ?? null) ? $entry['params'] : [];
        $body = \is_array($entry['body'] ?? null) ? $entry['body'] : [];
        $ids = [];
        foreach (ReplayJournalAction::paramModels($route) as $param => $class) {
            $value = $params[$param] ?? null;
            if (! is_numeric($value)) {
                continue;
            }
            $table = new $class()->getTable();
            if ($table === 'athletes') {
                $ids[] = (int) $value;
            } elseif (Schema::hasColumn($table, 'athlete_id')) {
                $ids[] = DB::table($table)->where('id', (int) $value)->value('athlete_id');
            }
        }
        $ids = [...$ids, $body['athlete_id'] ?? null, ...(\is_array($body['athlete_ids'] ?? null) ? $body['athlete_ids'] : [])];
        $ids = array_values(array_unique(array_map('intval', array_filter($ids, 'is_numeric'))));
        if ($ids === []) {
            return null;
        }
        $athlete = DB::table('athletes')->where('id', $ids[0])->first(['id', 'first_name', 'last_name']);

        return $athlete === null ? null : [
            'athlete' => ['id' => (int) $athlete->id, 'name' => trim("{$athlete->first_name} {$athlete->last_name}")],
            'others' => \count($ids) - 1,
        ];
    }

    /**
     * @param  array<string, mixed>  $detail
     * @param  array<string, mixed>  $entry
     * @return list<array{method: string, url: string, body: mixed}>|null
     */
    private static function retry(Route $route, string $reason, array $detail, array $entry): ?array
    {
        $name = (string) $route->getName();
        $method = \is_string($entry['method'] ?? null) ? $entry['method'] : null;
        $params = [];
        foreach (\is_array($entry['params'] ?? null) ? $entry['params'] : [] as $param => $value) {
            if (\is_int($value) || \is_string($value)) {
                $params[(string) $param] = $value;
            }
        }
        $body = $entry['body'] ?? null;
        if ($method === null || \in_array($reason, ['gone', 'refused', 'unknown-route'], true) || JournalBody::files($body) !== []) {
            return null;
        }

        try {
            $url = route($name, $params, false);
            if ($name === 'athletes.payments.store' && $reason === 'differs') {
                return self::payAgain($params, \is_array($body) ? $body : [], $url);
            }

            return [['method' => $method, 'url' => $url, 'body' => self::whatItChanged($entry, $body)]];
        } catch (\Throwable) {
            // Parameters the route no longer takes: the page offers no retry.
            return null;
        }
    }

    /**
     * What the set-aside write changed, out of the whole form it was sent
     * with: the fields its `before` records on the rows it changed, the
     * fields required with them, a lesson's class and day. Every other field
     * stays out, so the other device's changes to the rest of the form stay.
     * **The nested address** goes as the entry left it: whole when it added
     * one, `null` when it cleared one, its own changes over what is here when
     * it changed one, and not at all when it never touched it. A write whose
     * `before` records nothing (a photo removed) goes as it was.
     *
     * @param  array<string, mixed>  $entry
     */
    private static function whatItChanged(array $entry, mixed $body): mixed
    {
        $before = \is_array($entry['before'] ?? null) ? $entry['before'] : [];
        $created = \is_array($entry['created'] ?? null) ? $entry['created'] : [];
        if (! \is_array($body) || $before === []) {
            return $body;
        }
        $nestedTables = array_column(ReplayJournalAction::NESTED, 'table');
        $changed = [];
        foreach ($before as $table => $rows) {
            if (\in_array($table, $nestedTables, true) || ! \is_array($rows)) {
                continue;
            }
            foreach ($rows as $row) {
                $changed = [...$changed, ...(\is_array($row) ? array_keys($row) : [])];
            }
            $changed = [...$changed, ...array_keys(ReplayJournalAction::NATURAL[$table] ?? [])];
        }
        foreach (ReplayJournalAction::GROUPS as $group) {
            if (array_intersect($group, $changed) !== []) {
                $changed = [...$changed, ...$group];
            }
        }
        $sent = array_intersect_key($body, array_flip($changed));
        foreach (ReplayJournalAction::NESTED as $key => $nested) {
            if (! \array_key_exists($key, $body)) {
                continue;
            }
            $rows = \is_array($before[$nested['table']] ?? null) ? $before[$nested['table']] : [];
            if (($created[$nested['table']] ?? []) !== [] || ($rows !== [] && ! \is_array($body[$key]))) {
                // Added, or cleared: as the entry sent it.
                $sent[$key] = $body[$key];
            } elseif ($rows !== [] && \is_array($body[$key])) {
                $id = (string) array_key_first($rows);
                $mine = \is_array($rows[$id]) ? array_keys($rows[$id]) : [];
                $here = (array) (DB::table($nested['table'])->where('id', $id)->first() ?? []);
                $merged = [];
                foreach ($body[$key] as $name => $value) {
                    $merged[$name] = \in_array($name, $mine, true) || ! \array_key_exists($name, $here) ? $value : $here[$name];
                }
                $sent[$key] = $merged;
            }
        }

        return $sent === [] ? $body : $sent;
    }

    /**
     * A month paid otherwise: undone, then paid as the entry paid it, when
     * the fee here makes the same amount.
     *
     * @param  array<string, int|string>  $params
     * @param  array<string, mixed>  $body
     * @return list<array{method: string, url: string, body: mixed}>|null
     */
    private static function payAgain(array $params, array $body, string $url): ?array
    {
        $year = $body['year'] ?? null;
        $month = $body['month'] ?? null;
        $athlete = Athlete::query()->find($params['athlete'] ?? null);
        if (! is_numeric($year) || ! is_numeric($month) || ! $athlete instanceof Athlete) {
            return null;
        }
        $fee = MonthlyFee::forAthlete($athlete);
        $period = BillingPeriod::tryFrom(is_numeric($body['period_months'] ?? null) ? (int) $body['period_months'] : $athlete->billing_period_months);
        $amount = $body['amount_cents'] ?? null;
        if (is_numeric($amount) && ($fee === null || $period === null || $fee * $period->value !== (int) $amount)) {
            return null;
        }
        $undo = route('athletes.payments.destroy', [...$params, 'year' => (int) $year, 'month' => (int) $month], false);

        return [['method' => 'DELETE', 'url' => $undo, 'body' => null], ['method' => 'POST', 'url' => $url, 'body' => $body]];
    }

    /** @return array<string, mixed> */
    private static function decode(mixed $json): array
    {
        $value = \is_string($json) ? json_decode($json, true) : null;

        return \is_array($value) ? $value : [];
    }
}
