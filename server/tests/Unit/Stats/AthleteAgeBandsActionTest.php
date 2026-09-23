<?php

declare(strict_types=1);

use App\Actions\Stats\AthleteAgeBandsAction;
use App\Enums\MartialArt;
use App\Support\MartialArt\MartialArtProfile;

function divisionsOf(MartialArt $art): array
{
    return MartialArtProfile::for($art)->ageDivisions();
}

it('buckets every IBJJF division at its boundary ages', function (int $age, string $expectedCode): void {
    expect(AthleteAgeBandsAction::bandCodeFor($age, divisionsOf(MartialArt::Bjj)))->toBe($expectedCode);
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
    expect(AthleteAgeBandsAction::bandCodeFor(0, divisionsOf(MartialArt::Bjj)))->toBeNull();
    expect(AthleteAgeBandsAction::bandCodeFor(3, divisionsOf(MartialArt::Bjj)))->toBeNull();
});

it('buckets FIJLKAM judo classes at their boundaries (#1807)', function (int $age, ?string $expected): void {
    expect(AthleteAgeBandsAction::bandCodeFor($age, divisionsOf(MartialArt::Judo)))->toBe($expected);
})->with([
    [2, null], [3, 'bambini_a'], [5, 'bambini_a'], [6, 'bambini_b'], [7, 'bambini_b'],
    [8, 'fanciulli'], [9, 'fanciulli'], [10, 'ragazzi'], [11, 'ragazzi'],
    // Esordienti A is a single year in judo, unlike karate's Esordienti.
    [12, 'esordienti_a'], [13, 'esordienti_b'], [14, 'esordienti_b'],
    [15, 'cadetti'], [17, 'cadetti'], [18, 'juniores'], [20, 'juniores'],
    [21, 'seniores'], [35, 'seniores'], [36, 'master'], [80, 'master'],
]);

it('buckets FIJLKAM karate classes at their boundaries (#1807)', function (int $age, ?string $expected): void {
    expect(AthleteAgeBandsAction::bandCodeFor($age, divisionsOf(MartialArt::Karate)))->toBe($expected);
})->with([
    [2, null], [3, 'bambini_a'], [11, 'ragazzi'], [12, 'esordienti'], [13, 'esordienti'],
    [14, 'cadetti'], [15, 'cadetti'], [16, 'juniores'], [17, 'juniores'],
    [18, 'seniores'], [35, 'seniores'], [36, 'master_a'], [43, 'master_a'], [44, 'master_b'],
    [50, 'master_b'], [51, 'master_c'], [58, 'master_c'], [59, 'master_d'], [65, 'master_d'],
    [66, 'master_e'], [90, 'master_e'],
]);

it('buckets World Taekwondo divisions at their boundaries (#1807)', function (int $age, ?string $expected): void {
    expect(AthleteAgeBandsAction::bandCodeFor($age, divisionsOf(MartialArt::Taekwondo)))->toBe($expected);
})->with([
    [4, null], [5, 'under_12'], [11, 'under_12'], [12, 'cadet'], [14, 'cadet'], [15, 'junior'], [17, 'junior'],
    [18, 'under_30'], [30, 'under_30'], [31, 'under_40'], [40, 'under_40'], [41, 'under_50'],
    [51, 'under_60'], [61, 'under_65'], [65, 'under_65'], [66, 'over_65'],
]);
