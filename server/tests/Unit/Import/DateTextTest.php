<?php

declare(strict_types=1);

use App\Support\Import\DateText;

/**
 * Reading a date out of a spreadsheet cell (#1346).
 *
 * An Italian academy's file says `15/03/2019`. `strtotime` reads that as
 * *March 15th* only by accident of the separator — with `03/04/2019` PHP's
 * own heuristics pick the American reading and silently move someone's
 * birthday from 3 April to 4 March. So the day-first rule is explicit here,
 * and the genuinely ambiguous case is settled by **showing** the parsed date
 * in the preview rather than by guessing harder.
 */

it('reads the italian order, which is what the file will say', function (): void {
    expect(DateText::parse('15/03/2019')?->toDateString())->toBe('2019-03-15');
});

it('settles the ambiguous case day-first, and stays consistent about it', function (): void {
    // 03/04/2019 is 3 April in every European sheet and 4 March in an
    // American one. There is no way to tell from the cell — so the rule is
    // fixed, written down, and the preview shows the result before anything
    // is written.
    expect(DateText::parse('03/04/2019')?->toDateString())->toBe('2019-04-03');
});

it('accepts the separators people actually use', function (string $text): void {
    expect(DateText::parse($text)?->toDateString())->toBe('2019-03-15');
})->with(['15/03/2019', '15-03-2019', '15.03.2019', '15 03 2019']);

it('accepts the iso form, so an export can be re-imported', function (string $text): void {
    expect(DateText::parse($text)?->toDateString())->toBe('2019-03-15');
})->with(['2019-03-15', '2019/03/15']);

it('accepts a two-digit year the way a spreadsheet means it', function (): void {
    // Excel's own pivot: 00-68 are 2000s, 69-99 are 1900s. Matching it means
    // a file that looked right in Excel looks right here.
    expect(DateText::parse('15/03/19')?->toDateString())->toBe('2019-03-15')
        ->and(DateText::parse('15/03/85')?->toDateString())->toBe('1985-03-15');
});

it('tolerates a time riding along, which an export often adds', function (): void {
    expect(DateText::parse('15/03/2019 00:00:00')?->toDateString())->toBe('2019-03-15');
});

it('refuses a date that does not exist rather than rolling it over', function (string $text): void {
    // PHP would happily turn 31/02 into 3 March. A birthday that moves is
    // worse than a row that comes back with a reason.
    expect(DateText::parse($text))->toBeNull();
})->with(['31/02/2019', '32/01/2019', '15/13/2019', '00/03/2019']);

it('refuses what it cannot read instead of guessing', function (?string $text): void {
    expect(DateText::parse($text))->toBeNull();
})->with([null, '', '   ', 'domani', '15/03', '2019', 'n/a', '-']);
