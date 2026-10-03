<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Enums\UserRole;
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
    /** Columns an entry's `before` carries that say nothing about its meaning. */
    private const array CLOCK = ['created_at', 'updated_at'];

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

        // It names a row an earlier entry made where it was written and that
        // has none here: sent on, it would reach whatever row has that id.
        $lost = $map->lostIn();
        if ($lost !== []) {
            $map->learn($entry['created'], []);

            return $this->record($device, $entry, $params, $body, $before, 'conflict', [], [
                'reason' => 'gone',
                'lost' => $lost,
            ]);
        }

        $targets = self::targets($before, $params, $tables);
        $seen = $this->compare($entry['method'], $targets, $body);
        if ($seen !== null) {
            $map->learn($entry['created'], []);

            return $this->record($device, $entry, $params, $body, $before, $seen['outcome'], [], $seen['conflict']);
        }
        $body = self::keepTheirs($entry['method'], $params, $tables, $before, $body);

        // A savepoint around the write: what a write that does not apply did
        // is undone before its conflict is recorded.
        DB::beginTransaction();

        try {
            [$status, $answer, $created, $touched] = $this->dispatch($route, $entry['method'], $params, $body, $owner, $entry['at']);
            $judged = self::judge($entry, $status, $answer, $created, $touched, $before, $targets, $body);
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
        if ($judged['outcome'] === 'conflict') {
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
     * @return array{outcome: string, conflict: array<string, mixed>|null}
     */
    private static function judge(array $entry, int $status, mixed $answer, array $created, ?array $touched, ?array $before, ?array $targets, ?array $body): array
    {
        if ($status >= 200 && $status < 300) {
            if ($entry['method'] === 'DELETE') {
                // A delete that names its row another way than by a model
                // (a month's payment, by year and month) deleted a row here:
                // it must be the one it deleted there.
                $moved = self::deletedOtherwise($before, $targets, $touched);
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
     * The rows a delete deleted where it was written, beyond its targets,
     * against the ones its replay deleted here: the first that differs in a
     * field, or in number. Null when they agree.
     *
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, array<string, array<string, mixed>>>|null  $targets
     * @param  array<string, array<string, array<string, mixed>>>|null  $touched
     * @return array<string, mixed>|null
     */
    private static function deletedOtherwise(?array $before, ?array $targets, ?array $touched): ?array
    {
        foreach ($before ?? [] as $table => $rows) {
            // Deleted rows only, recorded whole: a row an Action updated on
            // the way (a carnet's count) is derived again, never compared.
            $whole = static fn (array $row): bool => \array_key_exists('id', $row);
            $there = array_values(array_filter(array_diff_key($rows, $targets[$table] ?? []), $whole));
            $here = array_values(array_filter(array_diff_key($touched[$table] ?? [], $targets[$table] ?? []), $whole));
            if ($there === []) {
                continue;
            }
            if (\count($there) !== \count($here)) {
                return ['table' => $table, 'rows' => \count($there), 'here' => \count($here)];
            }
            foreach ($there as $i => $saw) {
                foreach ($saw as $field => $value) {
                    if ($field === 'id' || $field === 'deleted_at' || \in_array($field, self::CLOCK, true) || ! \array_key_exists($field, $here[$i])) {
                        continue;
                    }
                    if (! self::same($here[$i][$field], $value)) {
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
     *
     * @param  array<string, int|string>  $params
     * @param  array<string, string>  $tables
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, mixed>|null  $body
     * @return array<string, mixed>|null
     */
    private static function keepTheirs(string $method, array $params, array $tables, ?array $before, ?array $body): ?array
    {
        if (($method !== 'PUT' && $method !== 'PATCH') || $body === null || $tables === []) {
            return $body;
        }
        // The route's own row: its last model, as in `/athletes/{athlete}/promotions/{promotion}`.
        $param = array_key_last($tables);
        $table = $tables[$param];
        $id = (string) ($params[$param] ?? '');
        $row = DB::table($table)->where('id', $id)->first();
        if ($row === null) {
            return $body;
        }
        $now = (array) $row;
        $changed = $before[$table][$id] ?? [];
        foreach ($body as $field => $sent) {
            if (\is_array($sent) || \array_key_exists($field, $changed) || ! \array_key_exists($field, $now)) {
                continue;
            }
            if (! self::same($now[$field], $sent)) {
                unset($body[$field]);
            }
        }

        return $body;
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
     * replayed when they are as it saw them, and a conflict when one moved.
     * It is never "already true", which only a field set by name can tell.
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
        foreach ($before as $table => $rows) {
            foreach ($rows as $id => $fields) {
                $row = DB::table($table)->where('id', $id)->first();
                $now = $row === null ? null : (array) $row;
                // A row deleted here since the entry saw it, softly too.
                if ($now === null || (($now['deleted_at'] ?? null) !== null && ($fields['deleted_at'] ?? null) === null)) {
                    $allThere = false;

                    continue;
                }
                foreach ($fields as $field => $saw) {
                    if (\in_array($field, self::CLOCK, true) || ! \array_key_exists($field, $now)) {
                        continue;
                    }
                    if ($byName && ! \array_key_exists($field, $body)) {
                        continue;
                    }
                    if (self::same($now[$field], $saw)) {
                        $allAsWanted = false;

                        continue;
                    }
                    // Changed here since: unless it is already what the entry sets.
                    if ($byName && self::same($now[$field], $body[$field])) {
                        continue;
                    }

                    return ['outcome' => 'conflict', 'conflict' => [
                        'reason' => 'changed',
                        'table' => $table,
                        'id' => $id,
                        'field' => $field,
                        'saw' => $saw,
                        'here' => $now[$field],
                    ]];
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

        return $byName && $allAsWanted ? ['outcome' => 'already', 'conflict' => null] : null;
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
        $uri = route((string) $route->getName(), $params, false);
        $files = [];
        $data = $this->unpackFiles($body ?? [], $files);
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
     * @return array<string, mixed>
     */
    private function unpackFiles(array $body, array &$files): array
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
                'entry' => self::json(['method' => $entry['method'], 'params' => $params, 'body' => $body, 'before' => $before]),
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
     * The rows of `before` the route names through its parameters.
     *
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @param  array<string, int|string>  $params
     * @param  array<string, string>  $tables
     * @return array<string, array<string, array<string, mixed>>>|null
     */
    private static function targets(?array $before, array $params, array $tables): ?array
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

        return $targets === [] ? null : $targets;
    }

    /** @return array<string, string> parameter => the table of the model the route binds to it */
    private static function paramTables(Route $route): array
    {
        $tables = [];
        foreach ($route->signatureParameters(['subClass' => UrlRoutable::class]) as $parameter) {
            $type = $parameter->getType();
            $class = $type instanceof \ReflectionNamedType ? $type->getName() : null;
            if ($class !== null && is_subclass_of($class, Model::class)) {
                $tables[$parameter->getName()] = new $class()->getTable();
            }
        }

        return $tables;
    }

    private static function same(mixed $a, mixed $b): bool
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
