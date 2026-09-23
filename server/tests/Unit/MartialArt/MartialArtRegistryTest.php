<?php

declare(strict_types=1);

use App\Actions\Syllabus\SeedSyllabusAction;
use App\Enums\Belt;
use App\Enums\GradeCount;
use App\Enums\MartialArt;
use App\Support\MartialArt\Grade;
use App\Support\MartialArt\MartialArtProfile;
use App\Support\MartialArt\RankLadder;

/**
 * The registry files (#1800) are data the whole app ranks, validates and seeds
 * from. They are read through MartialArtProfile — the same code the app uses —
 * so a typo fails here, not on somebody's roster.
 */

it('has a registry for every martial art, and every one parses', function (MartialArt $art): void {
    $profile = MartialArtProfile::for($art);

    expect($profile->art)->toBe($art)
        ->and($profile->ladder()->grades())->not->toBe([])
        ->and(count($profile->ladder()->grades()))->toBeLessThanOrEqual(RankLadder::MAX_GRADES);
})->with(MartialArt::cases());

it('counts dan and poom from a stated first grade, and nothing else from anything but zero', function (MartialArt $art): void {
    foreach (MartialArtProfile::for($art)->ladder()->grades() as $grade) {
        if ($grade->count === GradeCount::Stripe) {
            expect($grade->first)->toBe(0, "{$art->value} {$grade->belt->value}");
        } else {
            expect($grade->first)->toBeGreaterThan(0, "{$art->value} {$grade->belt->value}")
                ->and($grade->maxStripes)->toBeGreaterThan(0);
        }
    }
})->with(MartialArt::cases());

it('keeps the BJJ ladder exactly what Belt::rank() and Belt::maxStripes() were', function (): void {
    // The regression pin for the whole refactor: every existing install is
    // BJJ, and its sort order and stripe caps must not move by one place.
    $ladder = MartialArtProfile::for(MartialArt::Bjj)->ladder();

    $historical = [
        'grey' => [1, 4], 'yellow' => [2, 4], 'orange' => [3, 4], 'green' => [4, 4],
        'white' => [5, 4], 'blue' => [6, 4], 'purple' => [7, 4], 'brown' => [8, 4], 'black' => [9, 6],
        'red-and-black' => [10, 4], 'red-and-white' => [11, 4], 'red' => [12, 4],
    ];

    expect(array_map(static fn (Belt $b): string => $b->value, $ladder->belts()))->toBe(array_keys($historical));
    foreach ($historical as $value => [$rank, $cap]) {
        $belt = Belt::from($value);
        expect($ladder->rankOf($belt))->toBe($rank, $value)
            ->and($ladder->maxStripes($belt))->toBe($cap, $value);
    }
    foreach ($ladder->grades() as $grade) {
        expect($grade->count)->toBe(GradeCount::Stripe);
    }
});

it('follows the FIJLKAM ladder for judo and karate: six kyu, then black, red-and-white, red', function (MartialArt $art): void {
    $solid = array_values(array_filter(
        MartialArtProfile::for($art)->ladder()->grades(),
        static fn (Grade $g): bool => ! $g->kids,
    ));

    expect(array_map(static fn (Grade $g): string => $g->belt->value, $solid))
        ->toBe(['white', 'yellow', 'orange', 'green', 'blue', 'brown', 'black', 'red-and-white', 'red']);

    [$black, $redWhite, $red] = array_slice($solid, -3);
    expect([$black->count, $black->first, $black->maxStripes])->toBe([GradeCount::Dan, 1, 4])        // 1st-5th dan
        ->and([$redWhite->count, $redWhite->first, $redWhite->maxStripes])->toBe([GradeCount::Dan, 6, 2]) // 6th-8th
        ->and([$red->count, $red->first, $red->maxStripes])->toBe([GradeCount::Dan, 9, 1]);            // 9th-10th
})->with([MartialArt::Judo, MartialArt::Karate]);

it('lets karate mark up to three tacche on a coloured belt, and judo none', function (): void {
    $karate = MartialArtProfile::for(MartialArt::Karate)->ladder();
    $judo = MartialArtProfile::for(MartialArt::Judo)->ladder();

    expect($karate->maxStripes(Belt::Green))->toBe(3)
        ->and($karate->maxStripes(Belt::YellowAndOrange))->toBe(3)
        ->and($judo->maxStripes(Belt::Green))->toBe(0)
        ->and($judo->maxStripes(Belt::YellowAndOrange))->toBe(0);
});

it('ranks the taekwondo poom below the black belt', function (): void {
    $ladder = MartialArtProfile::for(MartialArt::Taekwondo)->ladder();

    expect($ladder->rankOf(Belt::BlackAndRed))->toBeLessThan($ladder->rankOf(Belt::Black))
        ->and($ladder->rankOf(Belt::Red))->toBeLessThan($ladder->rankOf(Belt::RedAndBlack))
        ->and($ladder->has(Belt::Purple))->toBeFalse();
});

it('starts every adult on white, never on a kids-only rung', function (MartialArt $art): void {
    expect(MartialArtProfile::for($art)->ladder()->startingBelt())->toBe(Belt::White);
})->with(MartialArt::cases());

it('lists programmes whose files exist and parse, with keys unique across every art', function (): void {
    $keys = [];
    foreach (MartialArt::cases() as $art) {
        $profile = MartialArtProfile::for($art);
        foreach ($profile->programmes() as $key) {
            $keys[] = $key;
            $file = $profile->programmeFile($key);
            expect($file)->not->toBeNull()
                ->and(is_file((string) $file))->toBeTrue("{$art->value}: {$key}")
                ->and(SeedSyllabusAction::positions((string) $file, $art))->not->toBe([]);
        }
    }

    expect($keys)->toBe(array_values(array_unique($keys)))
        ->and(MartialArtProfile::for(MartialArt::Bjj)->programmes())->toBe(['bjj'])
        // Empty until each art's programme ships (#1804-#1806, #1810): the
        // page offers no button and the endpoint answers 404 until then.
        ->and(MartialArtProfile::for(MartialArt::Judo)->programmes())->toBe([]);
});

it('offers no file for a key the art does not list', function (): void {
    expect(MartialArtProfile::for(MartialArt::Bjj)->programmeFile('karate-goju-ryu'))->toBeNull();
});

it('gives every art age divisions that cover every age from the youngest up, once (#1807)', function (MartialArt $art): void {
    $divisions = MartialArtProfile::for($art)->ageDivisions();

    $codes = array_map(fn ($d) => $d->code, $divisions);
    expect($divisions)->not->toBe([])
        ->and(end($divisions)->max)->toBeNull()
        ->and($codes)->toBe(array_values(array_unique($codes)))
        ->and($divisions[0]->min)->toBeGreaterThanOrEqual(0);

    // Contiguous and disjoint: every age from the youngest to 100 falls in
    // exactly one division.
    foreach (range($divisions[0]->min, 100) as $age) {
        $matching = array_filter($divisions, fn ($d) => $d->contains($age));
        expect($matching)->toHaveCount(1, "{$art->value} at {$age}");
    }
})->with(MartialArt::cases());

it('keeps the IBJJF table BJJ always had', function (): void {
    $codes = array_map(fn ($d) => $d->code, MartialArtProfile::for(MartialArt::Bjj)->ageDivisions());

    expect($codes)->toBe([
        'mighty_mite', 'pee_wee', 'junior', 'teen', 'juvenile', 'adult',
        'master_1', 'master_2', 'master_3', 'master_4', 'master_5', 'master_6', 'master_7',
    ]);
});
