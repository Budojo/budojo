<?php

declare(strict_types=1);

use App\Actions\Stats\AthleteAgeBandsAction;

it('buckets every IBJJF division at its boundary ages', function (int $age, string $expectedCode): void {
    expect(AthleteAgeBandsAction::bandCodeFor($age))->toBe($expectedCode);
})->with([
    [4,  'mighty_mite'],
    [6,  'mighty_mite'],
    [7,  'pee_wee'],
    [9,  'pee_wee'],
    [10, 'junior'],
    [12, 'junior'],
    [13, 'teen'],
    [15, 'teen'],
    [16, 'juvenile'],
    [17, 'juvenile'],
    [18, 'adult'],
    [29, 'adult'],
    [30, 'master_1'],
    [35, 'master_1'],
    [36, 'master_2'],
    [40, 'master_2'],
    [41, 'master_3'],
    [45, 'master_3'],
    [46, 'master_4'],
    [50, 'master_4'],
    [51, 'master_5'],
    [55, 'master_5'],
    [56, 'master_6'],
    [60, 'master_6'],
    [61, 'master_7'],
    [99, 'master_7'],
]);

it('returns null for ages below 4 (younger than the youngest IBJJF division)', function (): void {
    expect(AthleteAgeBandsAction::bandCodeFor(0))->toBeNull();
    expect(AthleteAgeBandsAction::bandCodeFor(3))->toBeNull();
});
