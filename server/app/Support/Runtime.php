<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\RuntimeProfile;

/**
 * Reads the active runtime profile from config, once, in one place.
 *
 * An unrecognised value resolves to Web rather than throwing. Web is the
 * conservative answer: it hides no features and assumes nothing about the
 * host, so a typo in an env file degrades to "behave like the website"
 * instead of either crashing the app on boot or — worse — silently unlocking
 * desktop-only behaviour on a public server.
 */
final class Runtime
{
    public static function profile(): RuntimeProfile
    {
        $configured = config('budojo.runtime');

        if (! \is_string($configured)) {
            return RuntimeProfile::Web;
        }

        return RuntimeProfile::tryFrom($configured) ?? RuntimeProfile::Web;
    }

    public static function isDesktop(): bool
    {
        return self::profile() === RuntimeProfile::Desktop;
    }

    public static function isWeb(): bool
    {
        return self::profile() === RuntimeProfile::Web;
    }
}
