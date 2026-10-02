<?php

declare(strict_types=1);

namespace App\Support\Backup;

/**
 * What the door names an academy by before anything is replaced (#2079, PRD
 * § 5.4): its name, its active athletes, and how many hold each belt, the
 * shape of a version manifest's `academy` (`docs/sync/protocol.md`). Read the
 * same way from a backup's database and from this device's own, so the owner
 * compares like with like.
 */
final class AcademySummary
{
    /** @return array{name: string, athletes: int, belts: array<string, int>}|null null when the database holds no academy */
    public static function of(\PDO $pdo): ?array
    {
        $name = self::column($pdo, 'select name from academies order by id limit 1');
        if (! \is_string($name)) {
            return null;
        }
        $statement = $pdo->query(
            "select belt, count(*) from athletes where status = 'active' and deleted_at is null group by belt order by count(*) desc, belt",
        );
        /** @var array<string, int|string> $rows */
        $rows = $statement === false ? [] : $statement->fetchAll(\PDO::FETCH_KEY_PAIR);
        $belts = array_map(intval(...), $rows);

        return ['name' => $name, 'athletes' => array_sum($belts), 'belts' => $belts];
    }

    private static function column(\PDO $pdo, string $sql): mixed
    {
        $statement = $pdo->query($sql);

        return $statement === false ? null : $statement->fetchColumn();
    }
}
