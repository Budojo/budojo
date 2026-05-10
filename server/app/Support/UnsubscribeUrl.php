<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\URL;

/**
 * Builds the one-click unsubscribe URL embedded in non-transactional
 * Mailables (#417). Every digest / reminder email carries:
 *
 *   - A footer link `Unsubscribe from {category}` rendered inside
 *     the Markdown body.
 *   - A `List-Unsubscribe` header pointing at the same URL so
 *     Gmail / Yahoo's bulk-sender unsubscribe button hits it
 *     directly without rendering the body.
 *
 * The URL is **signed** via Laravel's `URL::signedRoute` — the
 * signature is the auth (no session, no token-table round-trip),
 * and the middleware on the public route validates it
 * server-side. Expired / tampered signatures land on a 410 from
 * the controller.
 *
 * **Why a 30-day expiry**: long enough that a user reading an old
 * email a couple of weeks late can still click; short enough that
 * a leaked URL doesn't sit live forever. Mirrors the
 * `pending_deletions` grace window we already use elsewhere.
 */
final class UnsubscribeUrl
{
    /**
     * One month in seconds. Public so a future operator can dump
     * the value (e.g. when triaging a "my old email link doesn't
     * work" support ticket).
     */
    public const int EXPIRY_SECONDS = 60 * 60 * 24 * 30;

    public static function for(User $user, string $category): string
    {
        return URL::temporarySignedRoute(
            'unsubscribe',
            now()->addSeconds(self::EXPIRY_SECONDS),
            [
                'userId' => $user->id,
                'category' => $category,
            ],
        );
    }
}
