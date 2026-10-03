<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\Homecoming;
use Illuminate\Support\Facades\DB;

/**
 * The homecoming as the card on Oggi tells it (#2039): the rows the other
 * device's work created, **counted as they are now**. A presence recorded
 * and then removed, in the same pull or a later one, is no presence; a
 * payment corrected is told at its amount now.
 *
 * - presences by the lesson they were recorded into, the busiest first;
 * - payments, with their total;
 * - new athletes still in the roster;
 * - promotions given: a belt over another, or a stripe added. A timeline's
 *   opening row and the stripe reset beside a belt are none.
 *
 * @phpstan-import-type Arrived from Homecoming
 */
final class ShowHomecomingAction
{
    /** The rows counted by name, by the table the journal names them under. */
    public const array COUNTED = ['attendance_records', 'athlete_payments', 'athletes', 'athlete_promotions'];

    /**
     * @return array{device: string, at: string, through: string, attendance: list<array{lesson: string|null, count: int}>, payments: array{count: int, amount_cents: int}, athletes: int, promotions: int, other: int}|null
     */
    public function execute(): ?array
    {
        $arrived = Homecoming::read();
        if ($arrived === null) {
            return null;
        }
        $created = $arrived['created'];

        return [
            'device' => $arrived['device'],
            'at' => $arrived['at'],
            'through' => $arrived['through'],
            'attendance' => self::presences($created['attendance_records'] ?? []),
            'payments' => self::payments($created['athlete_payments'] ?? []),
            'athletes' => DB::table('athletes')->whereIn('id', $created['athletes'] ?? [])->whereNull('deleted_at')->count(),
            'promotions' => self::promotions($created['athlete_promotions'] ?? []),
            'other' => $arrived['other'],
        ];
    }

    /**
     * The promotions given among `$ids`: a belt over another, or a stripe
     * added. A timeline's opening row, the stripe reset beside a belt, and a
     * stripe taken away are none.
     *
     * @param  list<int>  $ids
     * @return list<int>
     */
    public static function given(array $ids): array
    {
        /** @var list<int> */
        return DB::table('athlete_promotions')->whereIn('id', $ids)
            ->where(static fn ($query) => $query
                ->where(static fn ($belt) => $belt->where('kind', 'belt')->whereNotNull('from_belt'))
                ->orWhere(static fn ($stripe) => $stripe->where('kind', 'stripe')->whereColumn('to_stripes', '>', 'from_stripes')))
            ->pluck('id')
            ->map(static fn (mixed $id): int => is_numeric($id) ? (int) $id : 0)
            ->values()
            ->all();
    }

    /**
     * @param  list<int>  $ids
     * @return list<array{lesson: string|null, count: int}>
     */
    private static function presences(array $ids): array
    {
        /** @var list<array{lesson: string|null, count: int}> */
        return DB::table('attendance_records')
            ->leftJoin('lessons', 'lessons.id', '=', 'attendance_records.lesson_id')
            ->whereIn('attendance_records.id', $ids)
            ->whereNull('attendance_records.deleted_at')
            ->groupBy('lessons.name')
            ->selectRaw('lessons.name as lesson, count(*) as count')
            ->orderByDesc('count')
            ->orderBy('lesson')
            ->get()
            ->map(static fn (\stdClass $row): array => ['lesson' => $row->lesson === null ? null : (string) $row->lesson, 'count' => (int) $row->count])
            ->values()
            ->all();
    }

    /**
     * @param  list<int>  $ids
     * @return array{count: int, amount_cents: int}
     */
    private static function payments(array $ids): array
    {
        $row = DB::table('athlete_payments')->whereIn('id', $ids)
            ->selectRaw('count(*) as count, coalesce(sum(amount_cents), 0) as amount_cents')
            ->first();

        return ['count' => (int) ($row->count ?? 0), 'amount_cents' => (int) ($row->amount_cents ?? 0)];
    }

    /** @param  list<int>  $ids */
    private static function promotions(array $ids): int
    {
        return \count(self::given($ids));
    }
}
