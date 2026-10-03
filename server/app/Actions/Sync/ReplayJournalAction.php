<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Enums\UserRole;
use App\Models\Academy;
use App\Models\User;
use App\Support\Sync\Journal\JournalRecorder;
use App\Support\Sync\Journal\JournalUploads;
use App\Support\Sync\Journal\ResolvedFields;
use App\Support\Sync\Replay\IdMap;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Contracts\Routing\UrlRoutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Routing\Route;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route as Routes;

/**
 * The rebase (#2031 step 3, PRD § 5.2): this device's kept writes, replayed
 * on the database another device published, **through the same routes,
 * FormRequests and Actions** that made them, in the order they were made.
 *
 * Each entry ends in one state, recorded in `sync_entries` in the same
 * transaction as what it did, so a replay that dies halfway picks up where it
 * stopped and never applies anything twice:
 * - **skipped:** this database dealt with it already. Its ids still go into
 *   the map, so a later entry that names a row it created finds it;
 * - **applied;**
 * - **already:** what it would do is already true, exactly: a presence marked
 *   on both devices, the same field set to the same value;
 * - **conflict:** the rules refuse it here, or a field it changes was changed
 *   here since it was written, or its row is gone, or it fails. Written to
 *   `sync_conflicts` with both sides, for the owner (PRD § 6.4), and never
 *   dropped. **A replay never stops on an entry:** the shell runs it before
 *   the app serves, so one that did would stop every start.
 *
 * Every entry dealt with here is kept in this database's journal again,
 * through the id map, so the device pushes it with its next version.
 */
final class ReplayJournalAction
{
    /** Fields a form sends together, each required with the others: kept or left out as one. */
    public const array GROUPS = [['phone_country_code', 'phone_national_number']];

    /**
     * Rows the API names by what they are, never by id: a lesson is its class
     * on a day (`PUT /lessons/notes`, `/lessons/topics`). Made on each device,
     * one lesson has two ids, and its id is never the way to find it here.
     */
    public const array NATURAL = [
        'lessons' => ['academy_class_id' => 'academy_class_id', 'held_on' => 'held_on'],
    ];

    /** A form's nested object, and the row it is: its table, and the morph that names its owner. */
    public const array NESTED = ['address' => ['table' => 'addresses', 'morph' => 'addressable']];
    /** Columns an entry's `before` carries that say nothing about its meaning. */
    private const array CLOCK = ['created_at', 'updated_at'];

    /** Request fields that replace a row's set of related rows whole (`SetReplaced`): a lesson's topics, by the table they are in. */
    private const array SETS = ['topic_ids' => 'syllabus_topics'];

    public function __construct(
        private readonly JournalRecorder $recorder,
        private readonly JournalUploads $uploads,
    ) {
    }

    /**
     * @param  list<array{id: string, at: string, method: string, route: string, params: array<string, int|string>, body: array<string, mixed>|null, created: array<string, list<int|string>>, before: array<string, array<string, array<string, mixed>>>|null}>  $entries  this device's kept entries, oldest first
     * @return array<string, string> entry id => skipped | applied | already | conflict
     */
    public function execute(string $device, array $entries): array
    {
        $owner = User::query()->where('role', UserRole::Owner->value)->orderBy('id')->first();
        if ($owner === null) {
            throw new \RuntimeException('no owner to replay the journal as');
        }

        $map = new IdMap();
        $outcomes = [];
        foreach ($entries as $entry) {
            $dealt = DB::table('sync_entries')->where('id', $entry['id'])->first();
            if ($dealt !== null) {
                $map->learn($entry['created'], self::decode((string) $dealt->created));
                $outcomes[$entry['id']] = 'skipped';

                continue;
            }
            $outcomes[$entry['id']] = DB::transaction(fn (): string => $this->replay($device, $entry, $map, $owner));
        }

        return $outcomes;
    }

    /** @return array<string, class-string<Model>> parameter => the model the route binds to it, in the route's order */
    public static function paramModels(Route $route): array
    {
        $models = [];
        foreach ($route->signatureParameters(['subClass' => UrlRoutable::class]) as $parameter) {
            $type = $parameter->getType();
            $class = $type instanceof \ReflectionNamedType ? $type->getName() : null;
            if ($class !== null && is_subclass_of($class, Model::class)) {
                $models[$parameter->getName()] = $class;
            }
        }

        return $models;
    }

    /**
     * A nested object as a form sent it, against its row here: the same when
     * both are absent, or every field it sends that the row has agrees.
     *
     * @param  array<string, mixed>|null  $row
     */
    public static function sameNested(mixed $sent, ?array $row): bool
    {
        if (! \is_array($sent) || $row === null) {
            return ! \is_array($sent) && $row === null;
        }
        foreach ($sent as $field => $value) {
            if (! \is_array($value) && \array_key_exists($field, $row) && ! self::same($row[$field], $value)) {
                return false;
            }
        }

        return true;
    }

    /**
     * The row a write is about. A route that binds models names it by its
     * last (`/athletes/{athlete}/promotions/{promotion}`). One that binds
     * none: `PATCH /academy` names the owner's academy by the session;
     * another way (`PUT /lessons/notes`, by date and class; the academy's
     * logo), it is the one row the write changed, when it changed one.
     *
     * @param  array<string, int|string>  $params
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @return array{table: string, id: string, class: class-string<Model>|null}|null
     */
    public static function ownRow(Route $route, array $params, ?array $before, User $owner): ?array
    {
        $models = self::paramModels($route);
        if ($models !== []) {
            $param = (string) array_key_last($models);
            $class = $models[$param];

            return ['table' => new $class()->getTable(), 'id' => (string) ($params[$param] ?? ''), 'class' => $class];
        }
        if ($route->getName() === 'academy.update') {
            $academy = $owner->activeAcademyId();

            return $academy === null ? null : ['table' => 'academies', 'id' => (string) $academy, 'class' => Academy::class];
        }
        $rows = [];
        foreach ($before ?? [] as $table => $byId) {
            foreach (array_keys($byId) as $id) {
                $rows[] = ['table' => (string) $table, 'id' => (string) $id, 'class' => null];
            }
        }

        return \count($rows) === 1 ? $rows[0] : null;
    }

    public static function same(mixed $a, mixed $b): bool
    {
        if ($a === null || $b === null) {
            return $a === $b;
        }
        $a = self::text($a);
        $b = self::text($b);
        if ($a === $b) {
            return true;
        }
        // A day against the moment an answer or a row gives it (`2026-10-01`
        // and `2026-10-01T00:00:00+00:00`, `2026-10-01 00:00:00`): the same day.
        foreach ([[$a, $b], [$b, $a]] as [$day, $moment]) {
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $day) === 1 && (str_starts_with($moment, $day . 'T') || str_starts_with($moment, $day . ' '))) {
                return true;
            }
        }

        return false;
    }

    /**
     * A form that refused the body the replay trimmed (`keepTheirs`) gets it
     * whole: the fields left out as the other device's, at this database's
     * values. A form may require them on every save, as a closure's dates
     * (#2113), or judge a field it was sent against one left out
     * (`after_or_equal:starts_on`). Sent at the values here, they keep the
     * other device's change, and whatever the form answers then stands.
     *
     * @param  array<string, mixed>  $left
     * @return array<string, mixed> the fields to send again, none when the answer stands
     */
    public static function refill(int $status, array $left): array
    {
        return $status === 422 ? $left : [];
    }

    /**
     * This database's value, in the shape the entry sent its own: a day as a
     * day (a row holds `2026-12-27 00:00:00` where a form takes
     * `2026-12-27`), a number as a number, a flag as a flag.
     */
    public static function asSent(mixed $here, mixed $sent): mixed
    {
        if ($here === null) {
            return null;
        }
        if (\is_bool($sent)) {
            return (bool) $here;
        }
        if (\is_int($sent) && is_numeric($here)) {
            return (int) $here;
        }
        if (\is_float($sent) && is_numeric($here)) {
            return (float) $here;
        }
        if (\is_string($sent) && \is_string($here) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $sent) === 1 && preg_match('/^(\d{4}-\d{2}-\d{2})[T ]/', $here, $day) === 1) {
            return $day[1];
        }

        return $here;
    }

    /**
     * @param  array{id: string, at: string, method: string, route: string, params: array<string, int|string>, body: array<string, mixed>|null, created: array<string, list<int|string>>, before: array<string, array<string, array<string, mixed>>>|null}  $entry
     */
    private function replay(string $device, array $entry, IdMap $map, User $owner): string
    {
        $route = Routes::getRoutes()->getByName($entry['route']);
        if (! $route instanceof Route) {
            // A route this version of Budojo no longer has: the owner decides.
            $map->learn($entry['created'], []);

            return $this->record($device, $entry, $entry['params'], $entry['body'], $entry['before'], 'conflict', [], [
                'reason' => 'unknown-route',
            ]);
        }
        $tables = self::paramTables($route);
        $params = $map->params($entry['params'], $tables);
        $body = $map->body($entry['body']);
        $before = $map->before($entry['before']);
        // A lesson is found here by its class and day, whatever id it has
        // on either device, and never lost.
        $natural = self::naturalRows($body);
        $before = self::byNature($before, $natural);

        // It names a row an earlier entry made where it was written and that
        // has none here: sent on, it would reach whatever row has that id.
        $lost = array_values(array_filter(
            $map->lostIn(),
            static fn (array $hit): bool => ! \array_key_exists($hit['table'], $natural),
        ));
        if ($lost !== []) {
            $map->learn($entry['created'], []);

            return $this->record($device, $entry, $params, $body, $before, 'conflict', [], [
                'reason' => 'gone',
                'lost' => $lost,
            ]);
        }

        $own = self::ownRow($route, $params, $before, $owner);
        $targets = self::targets($before, $params, $tables, $own);
        $seen = $this->compare($entry['method'], $targets, $body)
            ?? self::nestedChanged($before, $body);
        $probe = null;
        if ($seen !== null && $seen['outcome'] === 'probe') {
            $probe = $seen['conflict'];
            $seen = null;
        }
        $left = [];
        if ($seen === null) {
            $kept = self::keepTheirs($entry['method'], $own, $before, $body, $entry['created']);
            $body = $kept['body'];
            $seen = $kept['seen'];
            $left = $kept['left'];
        }
        if ($seen !== null) {
            $map->learn($entry['created'], []);

            return $this->record($device, $entry, $params, $body, $before, $seen['outcome'], [], $seen['conflict']);
        }

        // A savepoint around the write: what a write that does not apply did
        // is undone before its conflict is recorded.
        DB::beginTransaction();

        try {
            [$status, $answer, $created, $touched] = $this->dispatch($route, $entry['method'], $params, $body, $owner, $entry['at']);
            // Refused trimmed: sent again whole, with the other device's
            // values (a refusal writes nothing).
            $refill = self::refill($status, $left);
            if ($refill !== []) {
                $body = [...($body ?? []), ...$refill];
                [$status, $answer, $created, $touched] = $this->dispatch($route, $entry['method'], $params, $body, $owner, $entry['at']);
            }
            $judged = self::judge($entry, $status, $answer, $created, $touched, $before, $targets, $body, $probe);
        } catch (\Throwable $e) {
            // A route that takes other parameters now, say: never a replay
            // that throws, which would stop every start of the app.
            DB::rollBack();
            $map->learn($entry['created'], []);

            return $this->record($device, $entry, $params, $body, $before, 'conflict', [], [
                'reason' => 'failed',
                'message' => $e->getMessage(),
            ]);
        }
        if ($judged['outcome'] === 'conflict' || ($judged['undo'] ?? false)) {
            DB::rollBack();
            $created = [];
        } else {
            DB::commit();
        }
        $map->learn($entry['created'], $judged['outcome'] === 'applied' ? $created : []);

        return $this->record($device, $entry, $params, $body, $before, $judged['outcome'], $judged['outcome'] === 'applied' ? $created : [], $judged['conflict']);
    }

    /**
     * What a dispatched write comes to.
     *
     * @param  array{id: string, at: string, method: string, route: string, params: array<string, int|string>, body: array<string, mixed>|null, created: array<string, list<int|string>>, before: array<string, array<string, array<string, mixed>>>|null}  $entry
     * @param  array<string, list<int|string>>  $created
     * @param  array<string, array<string, array<string, mixed>>>|null  $touched  what the replay's own write saw before, by table and id
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, array<string, array<string, mixed>>>|null  $targets
     * @param  array<string, mixed>|null  $body
     * @param  array<string, mixed>|null  $probe  a field of its target that moved here, when the entry names none it changes
     * @return array{outcome: string, conflict: array<string, mixed>|null, undo?: bool}
     */
    private static function judge(array $entry, int $status, mixed $answer, array $created, ?array $touched, ?array $before, ?array $targets, ?array $body, ?array $probe): array
    {
        if ($status >= 200 && $status < 300 && $probe !== null) {
            // Its replay changed a target that moved here: the other device's
            // change would be undone. It changed none: true already.
            foreach ($targets ?? [] as $table => $rows) {
                foreach (array_keys($rows) as $id) {
                    if (isset($touched[$table][$id])) {
                        return ['outcome' => 'conflict', 'conflict' => $probe];
                    }
                }
            }

            return ['outcome' => 'already', 'conflict' => null];
        }
        if ($status >= 200 && $status < 300) {
            $set = self::setReplaced($entry, $before, $touched, $body);
            if ($set !== null) {
                return $set;
            }
            if ($entry['method'] === 'DELETE' && $targets === null) {
                // A delete that names its row another way than by a model
                // (a month's payment, by year and month) deleted a row here:
                // it must be the one it deleted there. One that names its row
                // (an athlete) is compared on it; what it took along (his
                // documents) is derived again.
                $moved = self::deletedOtherwise($before, $touched);
                if ($moved !== null) {
                    return ['outcome' => 'conflict', 'conflict' => ['reason' => 'changed', ...$moved]];
                }
            }
            $found = $created === [] && $entry['created'] !== [];
            if ($found || ResolvedFields::of($entry['route']) !== []) {
                // It made rows where it was written and none here: the
                // Action found them here already (`createOrFirst`). Already
                // true only if exactly what it would have made. And money is
                // never left to chance (`ResolvedFields`): for a payment "the
                // same month" is not enough (PRD § 5.2), so the row it found
                // or made must match every field the entry sets.
                $differs = self::differs($body, $answer);
                if ($differs !== null) {
                    return ['outcome' => 'conflict', 'conflict' => ['reason' => 'differs', ...$differs]];
                }
            }

            return ['outcome' => $found ? 'already' : 'applied', 'conflict' => null];
        }
        if ($entry['method'] === 'DELETE' && $status === 404 && ! self::anyStillThere($before)) {
            // Deleted here too: what the delete wants is true.
            return ['outcome' => 'already', 'conflict' => null];
        }

        // The rules refuse it here, or its row is gone. Anything else, a
        // server error first, is the owner's too: the shell replays before
        // the app serves, so a replay that stopped on it would stop every
        // start of the app.
        return ['outcome' => 'conflict', 'conflict' => [
            'reason' => match ($status) {
                404 => 'gone',
                403, 409, 422 => 'refused',
                default => 'failed',
            },
            'status' => $status,
            'message' => \is_array($answer) ? ($answer['message'] ?? null) : null,
            'errors' => \is_array($answer) ? ($answer['errors'] ?? null) : null,
        ]];
    }

    /**
     * A set the replay replaced here (a lesson's topics, #2102), against the
     * one the entry replaced there, or none when it made the lesson. Counted
     * only of the related rows this database still has (a topic removed from
     * the programme here leaves both sides alike):
     * - **already the entry's:** true already;
     * - **the entry changed nothing** (it saved the set it saw): what is here
     *   stays, undone in the savepoint;
     * - **as the entry saw it:** the other device left it alone, the entry's
     *   set applies;
     * - **anything else:** both devices tagged the lesson; the owner chooses.
     *
     * Null when the replay replaced no set, or when the entry recorded none
     * and made no lesson: written before sets were recorded, it applies as
     * it always did.
     *
     * @param  array{id: string, at: string, method: string, route: string, params: array<string, int|string>, body: array<string, mixed>|null, created: array<string, list<int|string>>, before: array<string, array<string, array<string, mixed>>>|null}  $entry
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, array<string, array<string, mixed>>>|null  $touched
     * @param  array<string, mixed>|null  $body
     * @return array{outcome: string, conflict: array<string, mixed>|null, undo?: bool}|null
     */
    private static function setReplaced(array $entry, ?array $before, ?array $touched, ?array $body): ?array
    {
        foreach ($touched ?? [] as $table => $rows) {
            foreach ($rows as $id => $fields) {
                foreach (self::SETS as $field => $related) {
                    if (! \array_key_exists($field, $fields) || ! \is_array($body) || ! \array_key_exists($field, $body)) {
                        continue;
                    }
                    $recorded = $before[$table][$id][$field] ?? null;
                    if ($recorded === null && ($entry['created'][$table] ?? []) === []) {
                        return null;
                    }
                    $here = self::alive($related, $fields[$field]);
                    $mine = self::alive($related, $body[$field]);
                    $saw = self::alive($related, $recorded ?? []);
                    if ($here === $mine) {
                        return ['outcome' => 'already', 'conflict' => null];
                    }
                    if ($saw === $mine) {
                        return ['outcome' => 'already', 'conflict' => null, 'undo' => true];
                    }
                    if ($here !== $saw) {
                        return ['outcome' => 'conflict', 'conflict' => [
                            'reason' => 'changed',
                            'table' => $table,
                            'id' => (string) $id,
                            'field' => $field,
                            'saw' => $saw,
                            'here' => $here,
                        ]];
                    }

                    return ['outcome' => 'applied', 'conflict' => null];
                }
            }
        }

        return null;
    }

    /**
     * A set of ids, sorted, each once, of the rows this database still has.
     *
     * @return list<int>
     */
    private static function alive(string $table, mixed $ids): array
    {
        $set = self::setOf($ids);
        if ($set === []) {
            return [];
        }
        $here = DB::table($table)->whereIn('id', $set)->whereNull('deleted_at')->pluck('id')
            ->map(static fn (mixed $id): int => is_numeric($id) ? (int) $id : 0)
            ->all();

        return array_values(array_intersect($set, $here));
    }

    /**
     * The rows here the body names by what they are (`NATURAL`), by table:
     * the id of the lesson on that class and day, or null when there is none.
     *
     * @param  array<string, mixed>|null  $body
     * @return array<string, string|null>
     */
    private static function naturalRows(?array $body): array
    {
        $rows = [];
        foreach (self::NATURAL as $table => $key) {
            $where = [];
            foreach ($key as $field => $column) {
                $value = $body[$field] ?? null;
                if (! \is_int($value) && ! \is_string($value)) {
                    continue 2;
                }
                $where[$column] = $value;
            }
            $query = DB::table($table);
            foreach ($where as $column => $value) {
                $query->where($column, 'like', \is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1 ? "{$value}%" : $value);
            }
            $id = $query->value('id');
            $rows[$table] = \is_int($id) || \is_string($id) ? (string) $id : null;
        }

        return $rows;
    }

    /**
     * `before` with each row of a natural table under the id it has here,
     * or without it when this database has no such row yet.
     *
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, string|null>  $natural
     * @return array<string, array<string, array<string, mixed>>>|null
     */
    private static function byNature(?array $before, array $natural): ?array
    {
        if ($before === null) {
            return null;
        }
        foreach ($natural as $table => $id) {
            if (! isset($before[$table])) {
                continue;
            }
            $rows = array_values($before[$table]);
            unset($before[$table]);
            if ($id !== null && \count($rows) === 1) {
                $before[$table][$id] = $rows[0];
            }
        }

        return $before === [] ? null : $before;
    }

    /** @return list<int> a set of ids, sorted, each once */
    private static function setOf(mixed $ids): array
    {
        $set = array_values(array_unique(array_map(
            static fn (mixed $id): int => is_numeric($id) ? (int) $id : 0,
            \is_array($ids) ? $ids : [],
        )));
        sort($set);

        return $set;
    }

    /**
     * The rows a delete deleted where it was written against the ones its
     * replay deleted here: the first that differs in a field, or in number.
     * Null when they agree.
     *
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, array<string, array<string, mixed>>>|null  $touched
     * @return array<string, mixed>|null
     */
    private static function deletedOtherwise(?array $before, ?array $touched): ?array
    {
        foreach ($before ?? [] as $table => $rows) {
            // Deleted rows only, recorded whole: a row an Action updated on
            // the way (a carnet's count) is derived again, never compared.
            $whole = static fn (array $row): bool => \array_key_exists('id', $row);
            $there = array_values(array_filter($rows, $whole));
            $here = array_values(array_filter($touched[$table] ?? [], $whole));
            if ($there === []) {
                continue;
            }
            if (\count($there) !== \count($here)) {
                return ['table' => $table, 'rows' => \count($there), 'here' => \count($here)];
            }
            foreach ($there as $i => $saw) {
                foreach ($saw as $field => $value) {
                    if ($field === 'deleted_at' || ! self::comparable((string) $field) || ! \array_key_exists($field, $here[$i])) {
                        continue;
                    }
                    if (! self::sameColumn((string) $field, $here[$i][$field], $value)) {
                        return ['table' => $table, 'field' => (string) $field, 'saw' => $value, 'here' => $here[$i][$field]];
                    }
                }
            }
        }

        return null;
    }

    /**
     * Whether a row a delete saw is still here, not deleted.
     *
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     */
    private static function anyStillThere(?array $before): bool
    {
        foreach ($before ?? [] as $table => $rows) {
            foreach (array_keys($rows) as $id) {
                $row = DB::table($table)->where('id', $id)->first();
                if ($row !== null && (((array) $row)['deleted_at'] ?? null) === null) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * An update sends its whole form (`PUT /athletes/{athlete}`, every
     * field), but it changed only what its `before` recorded: every other
     * field it sends as it saw it. **Where this database holds something else
     * there, the other device changed it,** and that change stays: the field
     * is left out of the replayed body. Two changes to different fields of
     * one athlete are not a conflict, and both apply (PRD § 6.4).
     * - **Fields a form sends together** (a phone number's two halves) are
     *   left out together, and changed on both sides they are a conflict.
     * - **A nested object** (the address) is left out whole when the entry
     *   did not change it and the row here holds another, or none.
     * - **What it leaves out comes back as `left`,** with this database's
     *   values: a form may require it on every save (`refill`, #2113).
     *
     * @param  array{table: string, id: string, class: class-string<Model>|null}|null  $own
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, mixed>|null  $body
     * @param  array<string, list<int|string>>  $created  what the entry made where it was written
     * @return array{body: array<string, mixed>|null, seen: array{outcome: string, conflict: array<string, mixed>|null}|null, left: array<string, mixed>}
     */
    private static function keepTheirs(string $method, ?array $own, ?array $before, ?array $body, array $created): array
    {
        if (($method !== 'PUT' && $method !== 'PATCH') || $body === null || $own === null) {
            return ['body' => $body, 'seen' => null, 'left' => []];
        }
        $row = DB::table($own['table'])->where('id', $own['id'])->first();
        if ($row === null) {
            return ['body' => $body, 'seen' => null, 'left' => []];
        }
        $now = (array) $row;
        $changed = $before[$own['table']][$own['id']] ?? [];
        $theirs = [];
        foreach ($body as $field => $sent) {
            if (isset(self::NESTED[$field]) || \is_array($sent) || \array_key_exists($field, $changed) || ! \array_key_exists($field, $now)) {
                continue;
            }
            if (! self::same($now[$field], $sent)) {
                $theirs[] = (string) $field;
            }
        }
        foreach (self::GROUPS as $group) {
            $moved = array_values(array_intersect($group, $theirs));
            if ($moved === []) {
                continue;
            }
            if (array_intersect($group, array_keys($changed)) !== []) {
                return ['body' => $body, 'seen' => ['outcome' => 'conflict', 'conflict' => [
                    'reason' => 'changed',
                    'table' => $own['table'],
                    'id' => $own['id'],
                    'field' => $moved[0],
                    'saw' => $body[$moved[0]],
                    'here' => $now[$moved[0]],
                ]], 'left' => []];
            }
            $theirs = [...$theirs, ...array_intersect($group, array_keys($body))];
        }
        $left = [];
        foreach (array_unique($theirs) as $field) {
            $left[$field] = self::asSent($now[$field] ?? null, $body[$field]);
            unset($body[$field]);
        }
        foreach (self::NESTED as $key => $nested) {
            if (! \array_key_exists($key, $body) || $own['class'] === null) {
                continue;
            }
            $row = DB::table($nested['table'])
                ->where("{$nested['morph']}_type", $own['class'])
                ->where("{$nested['morph']}_id", $own['id'])
                ->first();
            $here = $row === null ? null : (array) $row;
            // What it changed of the row here; null when it changed none of it, or there is none.
            $changedThere = $here === null ? null : ($before[$nested['table']][(string) $here['id']] ?? null);
            if (($created[$nested['table']] ?? []) !== []) {
                // It added one where there was none: one added here too,
                // and another, is the same thing changed on both sides.
                if ($here !== null && ! self::sameNested($body[$key], $here)) {
                    return ['body' => $body, 'seen' => ['outcome' => 'conflict', 'conflict' => [
                        'reason' => 'changed',
                        'table' => $nested['table'],
                        'id' => (string) $here['id'],
                        'field' => $key,
                    ]], 'left' => []];
                }

                continue;
            }
            if ($changedThere === null) {
                if (($before[$nested['table']] ?? []) === [] && ! self::sameNested($body[$key], $here)) {
                    // Carried along as it saw it, changed here: it stays.
                    unset($body[$key]);
                }

                continue;
            }
            // It changed some of its fields: the others it carried along take
            // what this database holds, as the form's own fields do. They are
            // required together, so they are sent, never left out.
            if (\is_array($body[$key])) {
                foreach ($body[$key] as $field => $sent) {
                    if (! \is_array($sent) && ! \array_key_exists($field, $changedThere) && \array_key_exists($field, $here) && ! self::same($here[$field], $sent)) {
                        $body[$key][$field] = $here[$field];
                    }
                }
            }
        }

        return ['body' => $body, 'seen' => null, 'left' => $left];
    }

    /**
     * A nested object the entry changed (the address), against the row here:
     * a field it changed that moved here too, or the row gone here when the
     * entry did not mean to clear it, is a conflict.
     *
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, mixed>|null  $body
     * @return array{outcome: string, conflict: array<string, mixed>|null}|null
     */
    private static function nestedChanged(?array $before, ?array $body): ?array
    {
        foreach (self::NESTED as $key => $nested) {
            $sent = \is_array($body) && \is_array($body[$key] ?? null) ? $body[$key] : null;
            foreach ($before[$nested['table']] ?? [] as $id => $saw) {
                $row = DB::table($nested['table'])->where('id', $id)->first();
                if ($row === null) {
                    if ($sent === null) {
                        // Cleared on both sides.
                        continue;
                    }

                    return ['outcome' => 'conflict', 'conflict' => ['reason' => 'gone', 'table' => $nested['table'], 'id' => (string) $id]];
                }
                $now = (array) $row;
                // Its owner, by the morph: an id the map does not rewrite.
                $owner = ["{$nested['morph']}_id", "{$nested['morph']}_type"];
                foreach ($saw as $field => $value) {
                    if ($field === 'id' || \in_array($field, [...self::CLOCK, ...$owner], true) || ! \array_key_exists($field, $now) || self::same($now[$field], $value)) {
                        continue;
                    }
                    if ($sent !== null && \array_key_exists($field, $sent) && self::same($now[$field], $sent[$field])) {
                        continue;
                    }

                    return ['outcome' => 'conflict', 'conflict' => [
                        'reason' => 'changed',
                        'table' => $nested['table'],
                        'id' => (string) $id,
                        'field' => (string) $field,
                        'saw' => $value,
                        'here' => $now[$field],
                    ]];
                }
            }
        }

        return null;
    }

    /**
     * What an update or a delete saw of **its target**, the rows its route
     * names, against what this database holds now. Never the rows its Action
     * touched on the way (a carnet's count, a lesson's attendance): those are
     * derived again by the replay, and two check-ins on one carnet are not a
     * conflict. Null when it can be replayed.
     *
     * **An update is about the fields its body sets by name;** the others
     * moved with them (a name's search form) and are derived again. One that
     * sets none of them by name (a photo: `photo` sets `photo_path` and
     * `photo_sha256`), or has no body, is about every field it changed: it is
     * replayed when they are as it saw them. When one moved, it cannot say
     * what it would make them, so the answer is a probe: the replay runs in
     * its savepoint, and `judge()` finds it already true when it changed no
     * target, a conflict when it changed one. A delete of the row itself is
     * a conflict at once.
     *
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, mixed>|null  $body
     * @return array{outcome: string, conflict: array<string, mixed>|null}|null
     */
    private function compare(string $method, ?array $before, ?array $body): ?array
    {
        if ($before === null) {
            return null;
        }
        $byName = $method !== 'DELETE' && \is_array($body) && self::namesAny($before, $body);
        $allThere = true;
        $allAsWanted = true;
        // Already true only from a field it did compare: a set (`topic_ids`)
        // is no column, and is told by the replay (`setReplaced`).
        $compared = false;
        $probe = null;
        foreach ($before as $table => $rows) {
            foreach ($rows as $id => $fields) {
                $row = DB::table($table)->where('id', $id)->first();
                $now = $row === null ? null : (array) $row;
                // A row deleted here since the entry saw it, softly too.
                if ($now === null || (($now['deleted_at'] ?? null) !== null && ($fields['deleted_at'] ?? null) === null)) {
                    $allThere = false;

                    continue;
                }
                // A delete of the row itself recorded it whole; a delete of
                // something on it (a photo) recorded the fields it changed.
                $deletes = $method === 'DELETE' && \array_key_exists('id', $fields);
                foreach ($fields as $field => $saw) {
                    if (! self::comparable((string) $field) || ! \array_key_exists($field, $now)) {
                        continue;
                    }
                    if ($byName && ! \array_key_exists($field, $body)) {
                        continue;
                    }
                    $compared = true;
                    if (self::sameColumn((string) $field, $now[$field], $saw)) {
                        $allAsWanted = false;

                        continue;
                    }
                    // Changed here since: unless it is already what the entry sets.
                    if ($byName && self::same($now[$field], $body[$field])) {
                        continue;
                    }
                    $moved = ['reason' => 'changed', 'table' => $table, 'id' => $id, 'field' => $field, 'saw' => $saw, 'here' => $now[$field]];
                    if ($byName || $deletes) {
                        return ['outcome' => 'conflict', 'conflict' => $moved];
                    }
                    // A write that names none of the fields it changes (a
                    // photo removed) cannot say what it would make them. Its
                    // replay tells: if it changes nothing here, it was true
                    // already; if it changes what moved, a conflict.
                    $probe ??= $moved;
                }
            }
        }
        if (! $allThere) {
            // Deleted here too: what the delete wants is true. An update has
            // nothing left to change.
            return $method === 'DELETE'
                ? ['outcome' => 'already', 'conflict' => null]
                : ['outcome' => 'conflict', 'conflict' => ['reason' => 'gone']];
        }
        if ($probe !== null) {
            return ['outcome' => 'probe', 'conflict' => $probe];
        }

        return $byName && $compared && $allAsWanted ? ['outcome' => 'already', 'conflict' => null] : null;
    }

    /** Whether a column is compared at all: never the clock, nor the row's own id, which differs between devices. */
    private static function comparable(string $field): bool
    {
        return ! \in_array($field, self::CLOCK, true) && $field !== 'id';
    }

    /**
     * A column here against what the entry saw. A reference the id map does
     * not rewrite (a check-in's `lesson_id`, its lesson made on each device)
     * holds another id on each device for the same row, so two ids agree.
     * One against none does not: the row joined a lesson, or left it. The
     * references a write names are in `IdMap::FIELDS`, rewritten, and
     * compared as they are.
     */
    private static function sameColumn(string $field, mixed $here, mixed $saw): bool
    {
        if (str_ends_with($field, '_id') && ! \array_key_exists($field, IdMap::FIELDS) && $here !== null && $saw !== null) {
            return true;
        }

        return self::same($here, $saw);
    }

    /**
     * Whether the body sets any field `before` recorded, by its name.
     *
     * @param  array<string, array<string, array<string, mixed>>>  $before
     * @param  array<string, mixed>  $body
     */
    private static function namesAny(array $before, array $body): bool
    {
        foreach ($before as $rows) {
            foreach ($rows as $fields) {
                foreach (array_keys($fields) as $field) {
                    if (! \in_array($field, self::CLOCK, true) && \array_key_exists($field, $body)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * The request, as the owner, through the whole stack: the routes'
     * FormRequests, policies and Actions decide, as they did on the device
     * that wrote it. The journal middleware stays out (the replay records the
     * entry itself), and so do the rate limits: the write was taken once.
     *
     * @param  array<string, int|string>  $params
     * @param  array<string, mixed>|null  $body
     * @return array{0: int, 1: mixed, 2: array<string, list<int|string>>, 3: array<string, array<string, array<string, mixed>>>|null}
     */
    private function dispatch(Route $route, string $method, array $params, ?array $body, User $owner, string $at): array
    {
        // A kept upload is decrypted into a temporary file for the request:
        // a medical certificate in the clear, removed whatever happens.
        $temps = [];

        try {
            return $this->dispatchWith($route, $method, $params, $body, $owner, $at, $temps);
        } finally {
            foreach ($temps as $temp) {
                if (file_exists($temp)) {
                    unlink($temp);
                }
            }
        }
    }

    /**
     * @param  array<string, int|string>  $params
     * @param  array<string, mixed>|null  $body
     * @param  list<string>  $temps  the temporary files made, for `dispatch` to remove
     * @return array{0: int, 1: mixed, 2: array<string, list<int|string>>, 3: array<string, array<string, array<string, mixed>>>|null}
     */
    private function dispatchWith(Route $route, string $method, array $params, ?array $body, User $owner, string $at, array &$temps): array
    {
        $uri = route((string) $route->getName(), $params, false);
        $files = [];
        $data = $this->unpackFiles($body ?? [], $files, $temps);
        $server = ['HTTP_ACCEPT' => 'application/json'];
        if ($files === []) {
            $request = Request::create($uri, $method, [], [], [], $server + ['CONTENT_TYPE' => 'application/json'], (string) json_encode($data, JSON_THROW_ON_ERROR));
        } else {
            // A form with files goes as a POST, the method spoofed as the app's own forms do.
            $request = Request::create($uri, 'POST', [...$data, ...($method === 'POST' ? [] : ['_method' => $method])], [], $files, $server);
        }

        $device = config('budojo.sync.device');
        $previousRequest = app()->bound('request') ? app('request') : null;
        $previousUser = Auth::guard('sanctum')->user();
        Auth::guard('sanctum')->setUser($owner);
        app()->instance(ThrottleRequests::class, new class () {
            public function handle(Request $request, \Closure $next): mixed
            {
                return $next($request);
            }
        });
        config()->set('budojo.sync.device', null);
        // The clock of the moment it was written: a payment marked on the
        // 3rd without a date is paid on the 3rd, whenever it is replayed, and
        // "not after today" is the day it was made.
        $previousNow = Carbon::getTestNow();
        $previousImmutableNow = CarbonImmutable::getTestNow();
        $then = CarbonImmutable::parse($at);
        Carbon::setTestNow($then);
        CarbonImmutable::setTestNow($then);
        $this->recorder->arm();

        try {
            $response = app(Kernel::class)->handle($request);
        } finally {
            $this->recorder->disarm();
            Carbon::setTestNow($previousNow);
            CarbonImmutable::setTestNow($previousImmutableNow);
            config()->set('budojo.sync.device', $device);
            app()->forgetInstance(ThrottleRequests::class);
            if ($previousRequest !== null) {
                app()->instance('request', $previousRequest);
            }
            if ($previousUser !== null) {
                Auth::guard('sanctum')->setUser($previousUser);
            } else {
                // Nobody was signed in before: the guards start afresh.
                app('auth')->forgetGuards();
            }
        }

        $content = $response->getContent();

        return [
            $response->getStatusCode(),
            \is_string($content) ? json_decode($content, true) : null,
            $this->recorder->createdIds(),
            $this->recorder->before(),
        ];
    }

    /**
     * The body with its kept uploads made files again (`JournalBody`).
     *
     * @param  array<string, mixed>  $body
     * @param  array<string, mixed>  $files
     * @param  list<string>  $temps  each temporary file, recorded as soon as it exists
     * @return array<string, mixed>
     */
    private function unpackFiles(array $body, array &$files, array &$temps): array
    {
        $data = [];
        foreach ($body as $key => $value) {
            $file = \is_array($value) ? ($value['$file'] ?? null) : null;
            if (\is_array($file) && \is_string($file['sha256'] ?? null)) {
                $bytes = $this->uploads->read($file['sha256']);
                if ($bytes === null) {
                    throw new \RuntimeException("the upload {$file['sha256']} a journal entry names is not kept");
                }
                $path = tempnam(sys_get_temp_dir(), 'budojo-replay-');
                if ($path !== false) {
                    $temps[] = $path;
                }
                if ($path === false || file_put_contents($path, $bytes) === false) {
                    throw new \RuntimeException('no temporary file for a replayed upload');
                }
                $name = \is_string($file['name'] ?? null) ? $file['name'] : 'upload';
                $files[$key] = new UploadedFile($path, $name, \is_string($file['type'] ?? null) ? $file['type'] : null, null, true);

                continue;
            }
            $data[$key] = $value;
        }

        return $data;
    }

    /**
     * @param  array<string, int|string>  $params
     * @param  array<string, mixed>|null  $body
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, list<int|string>>  $created
     * @param  array<string, mixed>|null  $conflict
     * @param  array{id: string, at: string, method: string, route: string, params: array<string, int|string>, body: array<string, mixed>|null, created: array<string, list<int|string>>, before: array<string, array<string, array<string, mixed>>>|null}  $entry
     */
    private function record(string $device, array $entry, array $params, ?array $body, ?array $before, string $outcome, array $created, ?array $conflict): string
    {
        $createdJson = self::json($created === [] ? new \stdClass() : $created);
        DB::table('sync_entries')->insert([
            'id' => $entry['id'],
            'device' => $device,
            'outcome' => $outcome,
            'created' => $createdJson,
        ]);
        // Kept again, in this database's ids, for the next version to carry.
        DB::table('sync_journal')->insert([
            'id' => $entry['id'],
            'device' => $device,
            'at' => $entry['at'],
            'method' => $entry['method'],
            'route' => $entry['route'],
            'params' => self::json($params === [] ? new \stdClass() : $params),
            'body' => $body === null ? null : self::json($body),
            'created' => $createdJson,
            'before' => $before === null ? null : self::json($before),
        ]);
        if ($conflict !== null) {
            DB::table('sync_conflicts')->insert([
                'entry_id' => $entry['id'],
                'device' => $device,
                'route' => $entry['route'],
                'reason' => self::text($conflict['reason'] ?? 'refused'),
                'detail' => self::json($conflict),
                // `created` as the device that wrote it made them: which tables a
                // retry must add to (an address the entry added), never ids here.
                'entry' => self::json(['method' => $entry['method'], 'params' => $params, 'body' => $body, 'before' => $before, 'created' => $entry['created'] === [] ? new \stdClass() : $entry['created']]),
            ]);
        }

        return $outcome;
    }

    /**
     * The first field the entry sets that the row the Action answered with
     * holds otherwise; null when they agree, or when the answer is not one row.
     *
     * @param  array<string, mixed>|null  $body
     * @return array{field: string, mine: mixed, here: mixed}|null
     */
    private static function differs(?array $body, mixed $answer): ?array
    {
        $row = \is_array($answer) && \is_array($answer['data'] ?? null) && ! array_is_list($answer['data']) ? $answer['data'] : null;
        if ($row === null || $body === null) {
            return null;
        }
        foreach ($body as $field => $mine) {
            if (\array_key_exists($field, $row) && ! \is_array($mine) && ! self::same($row[$field], $mine)) {
                return ['field' => (string) $field, 'mine' => $mine, 'here' => $row[$field]];
            }
        }

        return null;
    }

    /**
     * The rows of `before` the route names through its parameters, and the row an update is about.
     *
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, int|string>  $params
     * @param  array<string, string>  $tables
     * @param  array{table: string, id: string, class: class-string<Model>|null}|null  $own  the row an update is about (`ownRow`)
     * @return array<string, array<string, array<string, mixed>>>|null
     */
    private static function targets(?array $before, array $params, array $tables, ?array $own): ?array
    {
        if ($before === null) {
            return null;
        }
        $targets = [];
        foreach ($tables as $param => $table) {
            $id = (string) ($params[$param] ?? '');
            if (isset($before[$table][$id])) {
                $targets[$table][$id] = $before[$table][$id];
            }
        }
        if ($own !== null && isset($before[$own['table']][$own['id']])) {
            $targets[$own['table']][$own['id']] = $before[$own['table']][$own['id']];
        }

        return $targets === [] ? null : $targets;
    }

    /** @return array<string, string> parameter => the table of the model the route binds to it */
    private static function paramTables(Route $route): array
    {
        return array_map(static fn (string $class): string => new $class()->getTable(), self::paramModels($route));
    }

    /** A value as the database holds it, for comparing: a flag as 0 or 1, anything else as text. */
    private static function text(mixed $value): string
    {
        return match (true) {
            \is_bool($value) => $value ? '1' : '0',
            \is_scalar($value) => (string) $value,
            default => (string) json_encode($value),
        };
    }

    /** @return array<string, list<int|string>> */
    private static function decode(string $json): array
    {
        $value = json_decode($json, true);
        if (! \is_array($value)) {
            return [];
        }
        $created = [];
        foreach ($value as $table => $ids) {
            if (\is_array($ids)) {
                $created[(string) $table] = array_values(array_filter($ids, static fn (mixed $id): bool => \is_int($id) || \is_string($id)));
            }
        }

        return $created;
    }

    private static function json(mixed $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
