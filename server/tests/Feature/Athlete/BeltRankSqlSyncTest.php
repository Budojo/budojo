<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Http\Controllers\Athlete\AthleteController;

it('keeps the AthleteController belt-rank SQL in sync with Belt::rank()', function (): void {
    $reflection = new ReflectionClass(AthleteController::class);
    $sourcePath = $reflection->getFileName();
    expect($sourcePath)->toBeString();

    $source = file_get_contents($sourcePath);
    expect($source)->toBeString();

    foreach (Belt::cases() as $belt) {
        $clause = sprintf("WHEN '%s' THEN %d", $belt->value, $belt->rank());
        expect(str_contains($source, $clause))->toBeTrue(
            "AthleteController::applyBeltSort() must encode {$belt->value} as rank {$belt->rank()} ('{$clause}')",
        );
    }
});
