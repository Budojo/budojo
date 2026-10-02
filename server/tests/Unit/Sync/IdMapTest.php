<?php

declare(strict_types=1);

use App\Support\Sync\Replay\IdMap;

/**
 * The ids a replay gave the rows a journal created (#2031): every later entry
 * that names them is rewritten before it is replayed.
 */
describe('IdMap', function (): void {
    it('rewrites a route parameter through the table its model is in', function (): void {
        $map = new IdMap();
        $map->learn(['athletes' => [57]], ['athletes' => [103]]);

        expect($map->params(['athlete' => 57, 'payment' => 57], ['athlete' => 'athletes', 'payment' => 'athlete_payments']))
            ->toBe(['athlete' => 103, 'payment' => 57]);
    });

    it('rewrites the body fields that name rows, a list of them too, and leaves the rest', function (): void {
        $map = new IdMap();
        $map->learn(['athletes' => [57, 58], 'academy_classes' => [4]], ['athletes' => [103, 104], 'academy_classes' => [9]]);

        expect($map->body(['athlete_ids' => [57, 58, 12], 'academy_class_id' => 4, 'date' => '2026-10-02', 'amount' => 57]))
            ->toBe(['athlete_ids' => [103, 104, 12], 'academy_class_id' => 9, 'date' => '2026-10-02', 'amount' => 57]);
    });

    it('keeps the ids it learned for an entry already dealt with, so later entries still find them', function (): void {
        $map = new IdMap();
        $map->learn(['athletes' => [57], 'athlete_promotions' => [12]], ['athletes' => [103], 'athlete_promotions' => [40]]);

        expect($map->id('athlete_promotions', 12))->toBe(40)
            ->and($map->id('athletes', 1))->toBe(1);
    });

    it('rewrites what an update saw before: the row’s id and the fields that name rows', function (): void {
        $map = new IdMap();
        $map->learn(['athletes' => [57], 'academy_fee_tiers' => [2]], ['athletes' => [103], 'academy_fee_tiers' => [5]]);

        expect($map->before(['athletes' => ['57' => ['first_name' => 'Luca', 'fee_tier_id' => 2]]]))
            ->toBe(['athletes' => ['103' => ['first_name' => 'Luca', 'fee_tier_id' => 5]]]);
    });

    it('names a table for every id field the journaled requests accept', function (): void {
        $fields = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(app_path('Http/Requests'))) as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }
            preg_match_all("/'([a-z_]+_ids?)(?:\\.\\*)?'\\s*=>\\s*\\[/", (string) file_get_contents($file->getPathname()), $found);
            foreach ($found[1] as $field) {
                $fields[$field] = true;
            }
        }
        // The id fields of requests no journaled write uses: a filter, an
        // audit query, the active academy switch.
        $notJournaled = ['subject_id', 'actor_user_id', 'academy_id'];

        $missing = array_diff(array_keys($fields), array_keys(IdMap::FIELDS), $notJournaled);

        expect(array_values($missing))->toBe([]);
    });
});
