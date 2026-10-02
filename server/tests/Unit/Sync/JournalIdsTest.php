<?php

declare(strict_types=1);

use App\Support\Sync\Journal\JournalIds;

/** A journal id one above another, in Crockford base 32 (#2031). */
it('adds one to the last digit', function (): void {
    expect(JournalIds::increment('01K6F3Q8Z4M7X2N5P9R1T3V6W8'))->toBe('01K6F3Q8Z4M7X2N5P9R1T3V6W9');
});

it('skips the letters base 32 leaves out', function (): void {
    expect(JournalIds::increment('01K6F3Q8Z4M7X2N5P9R1T3V6WH'))->toBe('01K6F3Q8Z4M7X2N5P9R1T3V6WJ');
});

it('carries past Z', function (): void {
    expect(JournalIds::increment('01K6F3Q8Z4M7X2N5P9R1T3V6ZZ'))->toBe('01K6F3Q8Z4M7X2N5P9R1T3V700');
});

it('orders above the id it started from', function (): void {
    $id = '01K6F3Q8Z4M7X2N5P9R1T3V6ZZ';

    expect(strcmp(JournalIds::increment($id), $id))->toBeGreaterThan(0);
});
