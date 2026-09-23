<?php

declare(strict_types=1);

use App\Actions\Syllabus\SeedSyllabusAction;
use App\Enums\MartialArt;
use App\Enums\TrainingMode;
use App\Support\MartialArt\MartialArtProfile;

/**
 * Training modes (#1803): one vocabulary, a pair per art, one rule for what a
 * mode admits.
 */

it('lets a mode admit itself and the middle, and lets the middle admit everything', function (): void {
    expect(TrainingMode::Kata->admittedTopicModes())->toBe(['kata', 'both'])
        ->and(TrainingMode::NeWaza->admittedTopicModes())->toBe(['ne-waza', 'both'])
        ->and(TrainingMode::Gi->admittedTopicModes())->toBe(['gi', 'both'])
        ->and(TrainingMode::Both->admittedTopicModes())->toBeNull()
        ->and(TrainingMode::Other->admittedTopicModes())->toBeNull();
});

it('keeps the wire values the BJJ kinds were stored with', function (): void {
    // Every row written before #1803 carries one of these; a renamed value
    // would orphan all of them.
    expect([TrainingMode::Gi->value, TrainingMode::NoGi->value, TrainingMode::Both->value, TrainingMode::Other->value])
        ->toBe(['gi', 'nogi', 'both', 'other']);
});

it('gives every art its own pair, gi and no-gi still BJJ', function (MartialArt $art, array $pair): void {
    $profile = MartialArtProfile::for($art);

    expect($profile->trainingModes())->toBe($pair)
        ->and($profile->topicModes())->toBe([...$pair, TrainingMode::Both])
        ->and($profile->classModes())->toBe([...$pair, TrainingMode::Both, TrainingMode::Other]);
})->with([
    'bjj' => [MartialArt::Bjj, [TrainingMode::Gi, TrainingMode::NoGi]],
    'judo' => [MartialArt::Judo, [TrainingMode::TachiWaza, TrainingMode::NeWaza]],
    'karate' => [MartialArt::Karate, [TrainingMode::Kata, TrainingMode::Kumite]],
    'taekwondo' => [MartialArt::Taekwondo, [TrainingMode::Poomsae, TrainingMode::Kyorugi]],
]);

it('uses every mode in exactly one art, so no two arts share a pair', function (): void {
    $used = [];
    foreach (MartialArt::cases() as $art) {
        foreach (MartialArtProfile::for($art)->trainingModes() as $mode) {
            $used[] = $mode;
        }
    }

    $expected = array_values(array_filter(
        TrainingMode::cases(),
        static fn (TrainingMode $mode): bool => $mode !== TrainingMode::Both && $mode !== TrainingMode::Other,
    ));

    expect($used)->toEqualCanonicalizing($expected)
        ->and(count($used))->toBe(count(array_unique(array_map(static fn (TrainingMode $m): string => $m->value, $used))));
});

it('refuses a programme that uses a mode its art does not have', function (): void {
    $file = tempnam(sys_get_temp_dir(), 'programme');
    file_put_contents((string) $file, json_encode([
        ['name' => 'Closed guard', 'kind' => 'both', 'techniques' => [['name' => 'Saifa', 'kind' => 'kata']]],
    ]));

    try {
        expect(fn () => SeedSyllabusAction::positions((string) $file, MartialArt::Bjj))
            ->toThrow(RuntimeException::class, 'The bjj programme uses a training mode its martial art does not have.');

        // The same file is fine for the art the mode belongs to.
        expect(SeedSyllabusAction::positions((string) $file, MartialArt::Karate)[0]['techniques'][0]['kind'])
            ->toBe(TrainingMode::Kata);
    } finally {
        @unlink((string) $file);
    }
});
