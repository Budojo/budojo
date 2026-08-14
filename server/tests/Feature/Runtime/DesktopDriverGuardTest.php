<?php

declare(strict_types=1);

use App\Support\DesktopDriverGuard;

/**
 * The desktop profile forbids drivers that need a process nobody is running
 * (#1220). The one that matters is the queue: on "database" a queued job is
 * written to a table and never picked up, because the desktop app has no
 * worker. A medical-certificate expiry reminder would then be silently never
 * delivered — no error, no log line, just an alert that never arrives.
 *
 * Failing loudly at boot is the only way that gets noticed.
 */
it('passes when the desktop drivers are correct', function (): void {
    config()->set('budojo.runtime', 'desktop');
    config()->set('queue.default', 'sync');
    config()->set('cache.default', 'file');
    config()->set('session.driver', 'file');

    DesktopDriverGuard::assert();
})->throwsNoExceptions();

it('rejects a queue driver that needs a worker', function (): void {
    config()->set('budojo.runtime', 'desktop');
    config()->set('queue.default', 'database');
    config()->set('cache.default', 'file');
    config()->set('session.driver', 'file');

    expect(fn () => DesktopDriverGuard::assert())
        ->toThrow(RuntimeException::class, 'queue.default');
});

it('names the expected value in the failure message', function (): void {
    config()->set('budojo.runtime', 'desktop');
    config()->set('queue.default', 'sync');
    config()->set('cache.default', 'redis');
    config()->set('session.driver', 'file');

    // The message has to be actionable on its own: whoever sees it is looking
    // at a crashed desktop app, not at this test.
    expect(fn () => DesktopDriverGuard::assert())
        ->toThrow(RuntimeException::class, "expected 'file', got 'redis'");
});

it('is a no-op on the web profile', function (): void {
    config()->set('budojo.runtime', 'web');
    config()->set('queue.default', 'database');
    config()->set('cache.default', 'database');
    config()->set('session.driver', 'database');

    DesktopDriverGuard::assert();
})->throwsNoExceptions();
