<?php

declare(strict_types=1);

use App\Support\CarnetCode;

it('generates a four-character code', function (): void {
    expect(new CarnetCode()->generate())->toHaveLength(4);
});

it('draws only from the unambiguous alphabet', function (): void {
    $generator = new CarnetCode();

    foreach (range(1, 200) as $ignored) {
        expect($generator->generate())->toMatch('/^[' . CarnetCode::ALPHABET . ']{4}$/');
    }
});

it('excludes the glyph pairs that get misread on a handwritten card', function (): void {
    expect(CarnetCode::ALPHABET)
        ->not->toContain('0')
        ->not->toContain('O')
        ->not->toContain('1')
        ->not->toContain('I')
        ->not->toContain('L');
});

it('draws a different code each time', function (): void {
    $generator = new CarnetCode();
    $codes = array_map(static fn (): string => $generator->generate(), range(1, 50));

    // Not a randomness proof — a guard against a constant or seeded-once
    // generator. The threshold leaves room for a genuine collision so the
    // test can't flake: 50 draws from ~923k codes.
    expect(count(array_unique($codes)))->toBeGreaterThan(45);
});
