<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Enums\GradeCount;
use App\Support\Import\StripesText;
use App\Support\MartialArt\Grade;

$bjjBlue = new Grade(Belt::Blue, 4);
$judoBlack = new Grade(Belt::Black, 4, GradeCount::Dan, 1);
$poom = new Grade(Belt::BlackAndRed, 3, GradeCount::Poom, 1);
$judoGreen = new Grade(Belt::Green, 0);
$karateBrown = new Grade(Belt::Brown, 3);

it('reads an empty cell as no stripes', function () use ($judoBlack): void {
    expect(StripesText::parse('  ', $judoBlack)->stripes)->toBe(0)
        ->and(StripesText::parse('', $judoBlack)->refusal)->toBeNull();
});

it('takes the dan off its offset', function (string $cell, int $stored) use ($judoBlack): void {
    $reading = StripesText::parse($cell, $judoBlack);

    expect($reading->stripes)->toBe($stored)->and($reading->refusal)->toBeNull();
})->with([
    'plain' => ['1', 0],
    'degree sign' => ['3°', 2],
    'with the word' => ['5° dan', 4],
    'upper case, no sign' => ['2 DAN', 1],
    'ordinal indicator, as a Mac writes it' => ['3º dan', 2],
    'the column\'s own word' => ['3° grado', 2],
]);

it('takes poom off its offset too', function () use ($poom): void {
    expect(StripesText::parse('4', $poom)->stripes)->toBe(3)
        ->and(StripesText::parse('5', $poom)->refusal)->toBe('The black and red belt goes from 1° poom to 4° poom.');
});

it('leaves stripes as counted, for the validator to cap in the form\'s own words', function () use ($bjjBlue, $judoGreen): void {
    expect(StripesText::parse('2', $bjjBlue)->stripes)->toBe(2)
        ->and(StripesText::parse('5', $bjjBlue)->stripes)->toBe(5)
        ->and(StripesText::parse('5', $bjjBlue)->refusal)->toBeNull()
        ->and(StripesText::parse('1', $judoGreen)->stripes)->toBe(1);
});

it('counts tacche on a belt that carries them, in any of their words', function (string $cell) use ($karateBrown): void {
    expect(StripesText::parse($cell, $karateBrown)->stripes)->toBe(2)
        ->and(StripesText::parse($cell, $karateBrown)->refusal)->toBeNull();
})->with(['2 tacche', '2 strisce', '2 gradi']);

it('refuses a kyu: it names the belt, not a count on it', function () use ($karateBrown): void {
    // "2 kyu" on a brown belt was stored as two tacche and marked ok.
    expect(StripesText::parse('2 kyu', $karateBrown)->refusal)->toContain('kyu');
});

it('refuses a unit the grade does not count', function (string $cell, Grade $grade, string $unit): void {
    expect(StripesText::parse($cell, $grade)->refusal)->toContain("counts {$unit}");
})->with([
    'a dan on a stripe belt' => ['2 dan', $karateBrown, 'stripes'],
    'tacche on a black belt' => ['2 tacche', $judoBlack, 'dan'],
    'a dan on a poom' => ['2 dan', $poom, 'poom'],
]);

it('refuses what is not a number, naming it', function (string $cell) use ($judoBlack): void {
    expect(StripesText::parse($cell, $judoBlack)->refusal)->toContain("\"{$cell}\"");
})->with(['tre', 'III', '3-4', 'dan', '3 cinture']);

it('takes the number as written when the belt is not on the ladder', function (): void {
    // The belt's own error explains the row; a second one here would be noise.
    expect(StripesText::parse('3', null)->stripes)->toBe(3)
        ->and(StripesText::parse('3', null)->refusal)->toBeNull();
});
