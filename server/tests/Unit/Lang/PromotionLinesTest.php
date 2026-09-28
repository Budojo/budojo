<?php

declare(strict_types=1);

use Illuminate\Support\Arr;

/**
 * The promotion history's own messages (#1991) say the same thing in every
 * language the app speaks: the same keys, the same placeholders, and the
 * same number of plural forms.
 *
 * @return array<string, mixed>
 */
function promotionLines(string $locale): array
{
    /** @var array<string, mixed> $lines */
    $lines = require __DIR__ . "/../../../lang/{$locale}/promotions.php";

    return Arr::dot($lines);
}

/** @return list<string> */
function placeholdersOf(string $line): array
{
    preg_match_all('/:([a-z_]+)/', $line, $matches);
    $names = array_values(array_unique($matches[1]));
    sort($names);

    return $names;
}

it('has the same lines in Italian as in English', function (): void {
    expect(array_keys(promotionLines('it')))->toBe(array_keys(promotionLines('en')));
});

it('fills the same placeholders, with as many plural forms, in both', function (): void {
    $it = promotionLines('it');

    foreach (promotionLines('en') as $key => $line) {
        $en = (string) $line;
        $translated = (string) $it[$key];

        expect(placeholdersOf($translated))->toBe(placeholdersOf($en), $key)
            ->and(substr_count($translated, '|'))->toBe(substr_count($en, '|'), $key);
    }
});
