<?php

declare(strict_types=1);

use App\Support\OperatorDay;
use Carbon\CarbonImmutable;
use Symfony\Component\Finder\Finder;

afterEach(function (): void {
    CarbonImmutable::setTestNow();
});

it('is the operator\'s calendar day, stored the way the app stores a date', function (): void {
    config(['budojo.operator_timezone' => 'Europe/Rome']);
    CarbonImmutable::setTestNow('2026-10-10 22:30:00');

    $today = OperatorDay::today();

    // 00:30 on the 11th in Rome — and midnight UTC of the 11th, not
    // 22:00 UTC of the 10th, so it compares and stores like every other date.
    expect($today->toDateString())->toBe('2026-10-11')
        ->and($today->toDateTimeString())->toBe('2026-10-11 00:00:00')
        ->and($today->getTimezone()->getName())->toBe(config('app.timezone'));
});

it('is still yesterday until the operator\'s midnight', function (): void {
    config(['budojo.operator_timezone' => 'Europe/Rome']);
    // 23:59:59 in Rome (CEST, UTC+2).
    CarbonImmutable::setTestNow('2026-10-10 21:59:59');

    expect(OperatorDay::today()->toDateString())->toBe('2026-10-10');
});

it('follows winter time', function (): void {
    config(['budojo.operator_timezone' => 'Europe/Rome']);
    // 00:30 on 1 January in Rome (CET, UTC+1).
    CarbonImmutable::setTestNow('2026-12-31 23:30:00');

    expect(OperatorDay::today()->toDateString())->toBe('2027-01-01');
});

it('reads the operator\'s timezone from config, one place', function (): void {
    config(['budojo.operator_timezone' => 'America/New_York']);
    CarbonImmutable::setTestNow('2026-10-11 02:00:00');

    expect(OperatorDay::timezone())->toBe('America/New_York')
        ->and(OperatorDay::today()->toDateString())->toBe('2026-10-10');
});

it('leaves no hard-coded operator timezone outside config', function (): void {
    // A literal anywhere else is a second answer to "what day is it for the
    // owner", which is how #1963 happened.
    $offenders = [];
    $files = Finder::create()->files()->name('*.php')->in([base_path('app'), base_path('routes')]);
    foreach ($files as $file) {
        if (preg_match('/[\'"]Europe\/Rome[\'"]/', $file->getContents()) === 1) {
            $offenders[] = $file->getRelativePathname();
        }
    }

    expect($offenders)->toBe([]);
});
