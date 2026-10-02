<?php

declare(strict_types=1);

namespace App\Support\Sync\Replay;

/**
 * The ids a replay gave the rows a journal created (#2031, `docs/sync/
 * protocol.md` § A journal entry): an athlete created as 57 on the phone can
 * become 103 on the PC's database. Every later entry that names 57 is
 * rewritten to 103 before it is replayed, and so is the kept entry itself, so
 * a second replay starts from the ids this database has.
 *
 * Ids are per table. A route parameter names its table through the model the
 * route binds; a body field through `FIELDS`, which `IdMapTest` pins against
 * every id field the journaled requests accept.
 */
final class IdMap
{
    /** Body fields, and row columns in `before`, that name a row: the table it is in. */
    public const array FIELDS = [
        'academy_class_id' => 'academy_classes',
        'athlete_id' => 'athletes',
        'athlete_ids' => 'athletes',
        'fee_tier_id' => 'academy_fee_tiers',
        'parent_id' => 'syllabus_topics',
        'syllabus_topic_id' => 'syllabus_topics',
        'topic_ids' => 'syllabus_topics',
    ];

    /** @var array<string, array<string, int|string>> table => id on the device that wrote => id here */
    private array $ids = [];

    /**
     * What an entry created where it was written, against what it created
     * here: the same tables, in the same order.
     *
     * @param  array<string, list<int|string>>  $there
     * @param  array<string, list<int|string>>  $here
     */
    public function learn(array $there, array $here): void
    {
        foreach ($there as $table => $ids) {
            foreach ($ids as $i => $old) {
                $new = $here[$table][$i] ?? null;
                if ($new !== null) {
                    $this->ids[$table][(string) $old] = $new;
                }
            }
        }
    }

    public function id(string $table, int|string $id): int|string
    {
        return $this->ids[$table][(string) $id] ?? $id;
    }

    /**
     * @param  array<string, int|string>  $params
     * @param  array<string, string>  $tables  parameter => the table its model is in
     * @return array<string, int|string>
     */
    public function params(array $params, array $tables): array
    {
        $mapped = [];
        foreach ($params as $name => $value) {
            $table = $tables[$name] ?? null;
            $mapped[$name] = $table === null ? $value : $this->id($table, $value);
        }

        return $mapped;
    }

    /**
     * @param  array<array-key, mixed>|null  $body
     * @return array<string, mixed>|null
     */
    public function body(?array $body): ?array
    {
        if ($body === null) {
            return null;
        }
        $mapped = [];
        foreach ($body as $field => $value) {
            $mapped[(string) $field] = $this->value((string) $field, $value);
        }

        return $mapped;
    }

    /**
     * What an update or a delete saw before, by table and id: the ids, and
     * the fields among them that name rows.
     *
     * @param  array<string, array<string, array<string, mixed>>>|null  $before
     * @return array<string, array<string, array<string, mixed>>>|null
     */
    public function before(?array $before): ?array
    {
        if ($before === null) {
            return null;
        }
        $mapped = [];
        foreach ($before as $table => $rows) {
            foreach ($rows as $id => $fields) {
                $mapped[$table][(string) $this->id($table, $id)] = $this->body($fields) ?? [];
            }
        }

        return $mapped;
    }

    private function value(string $field, mixed $value): mixed
    {
        $table = self::FIELDS[$field] ?? null;
        if ($table !== null) {
            if (\is_int($value) || (\is_string($value) && ctype_digit($value))) {
                return $this->id($table, $value);
            }
            if (\is_array($value)) {
                return array_map(fn (mixed $id): mixed => \is_int($id) || (\is_string($id) && ctype_digit($id)) ? $this->id($table, $id) : $id, $value);
            }

            return $value;
        }
        // A nested object (a `$file`, a list of rows): its own fields are mapped the same way.
        if (\is_array($value) && ! array_is_list($value)) {
            return $this->body($value);
        }
        if (\is_array($value)) {
            return array_map(fn (mixed $item): mixed => \is_array($item) && ! array_is_list($item) ? $this->body($item) : $item, $value);
        }

        return $value;
    }
}
