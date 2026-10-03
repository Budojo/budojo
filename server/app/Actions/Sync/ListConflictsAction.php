<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Enums\BillingPeriod;
use App\Models\Athlete;
use App\Models\User;
use App\Support\AthleteIdentity;
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
 * **A retry sends the form less what the other device changed and the
 * entry did not** (`form`): the other device's changes to the rest stay. A month paid otherwise is undone first, then paid as the entry
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
    /**
     * The requests that keep the set-aside write for one conflict that still
     * waits, or null: what `retry` lists for it (`KeepMineAction`).
     *
     * @return list<array{method: string, url: string, body: mixed, fill?: array<string, mixed>}>|null
     */
    public function retryOf(string $entryId, User $owner): ?array
    {
        $row = DB::table('sync_conflicts')->where('entry_id', $entryId)->whereNull('decided_at')->first();
        if ($row === null) {
            return null;
        }

        return self::retryForRow($row, $owner);
    }

    /** @return list<array<string, mixed>> */
    public function execute(User $owner): array
    {
        return array_values(DB::table('sync_conflicts')->whereNull('decided_at')->orderBy('recorded_at')->orderBy('entry_id')->get()
            ->map(fn (\stdClass $row): array => self::describe($row, $owner))
            ->all());
    }

    /** @return array<string, mixed> one conflict, as `execute` lists it */
    private static function describe(\stdClass $row, User $owner): array
    {
        $entry = self::decode($row->entry);
        $detail = self::decode($row->detail);
        $route = self::routeOf($row, $detail);

        return [
            'id' => (string) $row->entry_id,
            'device' => (string) $row->device,
            'route' => (string) $row->route,
            'reason' => (string) $row->reason,
            'detail' => (object) $detail,
            'entry' => (object) $entry,
            'recorded_at' => CarbonImmutable::parse((string) $row->recorded_at, 'UTC')->toIso8601String(),
            'subject' => $route === null ? null : self::subject($route, $entry),
            'retry' => self::retryForRow($row, $owner),
        ];
    }

    /** @return list<array{method: string, url: string, body: mixed, fill?: array<string, mixed>}>|null */
    private static function retryForRow(\stdClass $row, User $owner): ?array
    {
        $detail = self::decode($row->detail);
        $route = self::routeOf($row, $detail);

        return $route === null ? null : self::retry($route, (string) $row->reason, $detail, self::decode($row->entry), $owner);
    }

    /**
     * The route a conflict names, or null when this Budojo has none by that
     * name, or the conflict names rows that have none here (lost ids): its
     * parameters are then no ids of this database.
     *
     * @param  array<string, mixed>  $detail
     */
    private static function routeOf(\stdClass $row, array $detail): ?Route
    {
        $route = Routes::getRoutes()->getByName((string) $row->route);
        $lost = \is_array($detail['lost'] ?? null) && $detail['lost'] !== [];

        return $route instanceof Route && ! $lost ? $route : null;
    }

    /**
     * The athlete a write is about: the row a route parameter names here when
     * it is an athlete or has one (a document, a check-in), else the body's.
     *
     * @param  array<string, mixed>  $entry
     * @return array{athlete: array<string, mixed>, others: int}|null
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
        $athlete = Athlete::query()->with('user')->find($ids[0]);

        return $athlete === null ? null : [
            // As every list of people shows one (`AthleteIdentity`), with the belt.
            'athlete' => [...AthleteIdentity::of($athlete), 'name' => trim("{$athlete->first_name} {$athlete->last_name}")],
            'others' => \count($ids) - 1,
        ];
    }

    /**
     * @param  array<string, mixed>  $detail
     * @param  array<string, mixed>  $entry
     * @return list<array{method: string, url: string, body: mixed, fill?: array<string, mixed>}>|null
     */
    private static function retry(Route $route, string $reason, array $detail, array $entry, User $owner): ?array
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

            $form = self::form($route, $params, $entry, $detail, $body, $owner);

            return [['method' => $method, 'url' => $url, ...$form]];
        } catch (\Throwable) {
            // Parameters the route no longer takes: the page offers no retry.
            return null;
        }
    }

    /**
     * The form to send again for «Tieni la mia»: the one the set-aside write
     * was sent with, **less what the other device changed and it did not**,
     * judged against this database now, as the replay judges a form
     * (`ReplayJournalAction::keepTheirs`). A field the entry changed goes
     * with its value; one that still holds here what it sent goes too, so a
     * form that requires it on every save is whole, except a list that is a
     * column here (an academy's training days), which goes only when the
     * entry changed it; one the other device
     * changed meanwhile stays out, and keeps its change. Fields required
     * together go together, and a lesson's class and day always.
     *
     * **The nested address** goes as the entry left it: whole when it added
     * one, `null` when it cleared one, its own changes over what is here when
     * it changed one, and left out when it never touched it and it moved here.
     *
     * **What it leaves out comes back as `fill`,** with this database's
     * values: sent only when the form refuses the trimmed body, as one that
     * requires a closure's dates does (`ReplayJournalAction::refill`, #2113).
     *
     * Only a form (`PUT`, `PATCH`) is trimmed; any other write goes as it was.
     *
     * @param  array<string, int|string>  $params
     * @param  array<string, mixed>  $entry
     * @param  array<string, mixed>  $detail
     * @return array{body: mixed, fill?: array<string, mixed>}
     */
    private static function form(Route $route, array $params, array $entry, array $detail, mixed $body, User $owner): array
    {
        $method = $entry['method'] ?? null;
        if (! \is_array($body) || ($method !== 'PUT' && $method !== 'PATCH')) {
            return ['body' => $body];
        }
        /** @var array<string, array<string, array<string, mixed>>> $before */
        $before = \is_array($entry['before'] ?? null) ? $entry['before'] : [];
        $created = \is_array($entry['created'] ?? null) ? $entry['created'] : null;
        $own = ReplayJournalAction::ownRow($route, $params, $before === [] ? null : $before, $owner);
        $here = $own === null ? [] : (array) (DB::table($own['table'])->where('id', $own['id'])->first() ?? []);
        $nestedTables = array_column(ReplayJournalAction::NESTED, 'table');
        $changed = [];
        foreach ($before as $table => $rows) {
            if (! \in_array($table, $nestedTables, true)) {
                foreach ($rows as $row) {
                    $changed = [...$changed, ...array_keys($row)];
                }
            }
        }

        $sent = [];
        foreach ($body as $field => $value) {
            if (isset(ReplayJournalAction::NESTED[$field])) {
                continue;
            }
            if (\is_array($value)) {
                // A list that is a column here (an academy's training days)
                // goes only when the entry changed it: the request may derive
                // it otherwise, and the same days can still be refused. One
                // that is no column (a lesson's `topic_ids`) is the write.
                if (! \array_key_exists($field, $here) || \in_array($field, $changed, true)) {
                    $sent[$field] = $value;
                }

                continue;
            }
            $moved = \array_key_exists($field, $here) && ! ReplayJournalAction::same($here[$field], $value);
            if (\in_array($field, $changed, true) || ! $moved) {
                $sent[$field] = $value;
            }
        }
        foreach (ReplayJournalAction::GROUPS as $group) {
            $inBody = array_intersect($group, array_keys($body));
            if (array_intersect($group, $changed) !== []) {
                $sent = [...$sent, ...array_intersect_key($body, array_flip($inBody))];
            } elseif (array_diff($inBody, array_keys($sent)) !== []) {
                $sent = array_diff_key($sent, array_flip($group));
            }
        }
        if ($own !== null) {
            $sent = [...$sent, ...array_intersect_key($body, ReplayJournalAction::NATURAL[$own['table']] ?? [])];
        }

        foreach (ReplayJournalAction::NESTED as $key => $nested) {
            if (! \array_key_exists($key, $body)) {
                continue;
            }
            $rows = $before[$nested['table']] ?? [];
            // Recorded before conflicts kept `created`: an address the entry
            // added is the one conflict that names the address itself.
            $added = $created === null ? ($detail['field'] ?? null) === $key : ($created[$nested['table']] ?? []) !== [];
            if ($added || ($rows !== [] && ! \is_array($body[$key]))) {
                $sent[$key] = $body[$key];

                continue;
            }
            $row = $own === null ? null : DB::table($nested['table'])
                ->where("{$nested['morph']}_type", $own['class'] ?? '')
                ->where("{$nested['morph']}_id", $own['id'])
                ->first();
            $row = $row === null ? null : (array) $row;
            if ($rows !== []) {
                // Changed: as an array, since a cleared one went above.
                $mine = array_keys((array) reset($rows));
                $merged = [];
                foreach ($body[$key] as $name => $value) {
                    $merged[$name] = \in_array($name, $mine, true) || $row === null || ! \array_key_exists($name, $row) ? $value : $row[$name];
                }
                $sent[$key] = $merged;
            } elseif (ReplayJournalAction::sameNested($body[$key], $row)) {
                $sent[$key] = $body[$key];
            }
        }

        $fill = [];
        foreach (array_diff_key($body, $sent, ReplayJournalAction::NESTED) as $field => $value) {
            if (! \is_array($value) && \array_key_exists($field, $here)) {
                $fill[$field] = ReplayJournalAction::asSent($here[$field], $value);
            }
        }

        return $fill === [] ? ['body' => $sent] : ['body' => $sent, 'fill' => $fill];
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
