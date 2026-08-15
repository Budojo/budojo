<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Fails the boot of a desktop instance whose drivers cannot work on a desktop
 * (#1220, M11 #1218).
 *
 * The expensive mistake this prevents is `QUEUE_CONNECTION=database`. The
 * hosted stack runs a worker; the Electron shell does not. A queued job would
 * be written to the jobs table and sit there forever — so a medical
 * certificate expiry reminder is never delivered, with no exception, no log
 * line and no visible symptom. The alert simply never arrives, which is the
 * one failure in this product with consequences outside the software.
 *
 * Cache and session are milder: both would otherwise contend for the SQLite
 * write lock that user data needs.
 *
 * Deliberately a hard failure rather than a warning. A desktop app has no
 * operator watching logs; if it does not stop, nobody finds out.
 */
final class DesktopDriverGuard
{
    public static function assert(): void
    {
        if (! Runtime::isDesktop()) {
            return;
        }

        /** @var array<string, string> $expectations */
        $expectations = config('budojo.desktop_drivers', []);

        foreach ($expectations as $key => $expected) {
            $actual = config($key);

            if ($actual === $expected) {
                continue;
            }

            throw new \RuntimeException(\sprintf(
                'Desktop runtime misconfigured: %s expected %s, got %s. '
                . 'See config/budojo.php for why this driver is required.',
                $key,
                var_export($expected, true),
                var_export($actual, true),
            ));
        }
    }
}
