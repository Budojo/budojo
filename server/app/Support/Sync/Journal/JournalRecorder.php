<?php

declare(strict_types=1);

namespace App\Support\Sync\Journal;

use Illuminate\Database\Eloquent\Model;

/**
 * What one journaled write did to the database (#2031): the rows it
 * created, by table, and the values the rows it changed or deleted held
 * before, by table and id. Fed by the Eloquent events, and only while a
 * journaled request is running.
 *
 * Writes made with the query builder rather than a model are not seen. The
 * replay runs the same Actions, so it makes them again; only the id map and
 * the conflict check need what is recorded here, and those are about a
 * write's **target**: the athlete edited, the payment undone. The journaled
 * Actions that write with queries do so for what follows from the target,
 * which the replay derives again: the children of a programme topic,
 * attendance adopted by a lesson, the training days read off the timetable,
 * carnet entries. A lesson's topics are a pivot's `sync()`, which fires no
 * model event: the Action announces the set it replaced (`SetReplaced`), and
 * it is recorded as a field of the lesson's `before` (#2102). A target written with a query would be a
 * hole in `before`: the payment undo and the address's clear were two, and
 * both delete one model at a time since #2031.
 */
final class JournalRecorder
{
    /** The sync's own tables, and the session tokens, are not academy data. */
    private const array IGNORED = ['sync_entries', 'sync_journal', 'personal_access_tokens'];

    private bool $armed = false;

    /** @var array<string, list<int|string>> */
    private array $created = [];

    /** @var array<string, array<string, array<string, mixed>>> */
    private array $before = [];

    public function arm(): void
    {
        $this->armed = true;
        $this->created = [];
        $this->before = [];
    }

    public function disarm(): void
    {
        $this->armed = false;
    }

    public function created(Model $model): void
    {
        $key = $model->getKey();
        if ($this->watches($model) && (\is_int($key) || \is_string($key))) {
            $this->created[$model->getTable()][] = $key;
        }
    }

    /** The original values of the fields about to change. */
    public function updating(Model $model): void
    {
        if (! $this->watches($model)) {
            return;
        }
        $id = self::id($model);
        $fields = array_diff(array_keys($model->getDirty()), [$model->getUpdatedAtColumn()]);
        foreach ($fields as $field) {
            $this->before[$model->getTable()][$id][$field] ??= $model->getRawOriginal($field);
        }
    }

    /**
     * The set a write replaced through a pivot (`SetReplaced`), as a field of
     * the row's `before`, named as the request names it: `topic_ids`.
     *
     * @param  list<int>  $ids
     */
    public function replaced(Model $model, string $field, array $ids): void
    {
        if ($this->watches($model)) {
            $this->before[$model->getTable()][self::id($model)][$field] ??= $ids;
        }
    }

    /** Every value the row held. */
    public function deleting(Model $model): void
    {
        if ($this->watches($model)) {
            /** @var array<string, mixed> $original */
            $original = $model->getRawOriginal();
            $this->before[$model->getTable()][self::id($model)] = $original;
        }
    }

    /** @return array<string, list<int|string>> */
    public function createdIds(): array
    {
        return $this->created;
    }

    /** @return array<string, array<string, array<string, mixed>>>|null */
    public function before(): ?array
    {
        return $this->before === [] ? null : $this->before;
    }

    private static function id(Model $model): string
    {
        $key = $model->getKey();

        return \is_int($key) || \is_string($key) ? (string) $key : '';
    }

    private function watches(Model $model): bool
    {
        return $this->armed && ! \in_array($model->getTable(), self::IGNORED, true);
    }
}
