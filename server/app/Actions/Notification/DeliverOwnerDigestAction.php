<?php

declare(strict_types=1);

namespace App\Actions\Notification;

use App\Enums\Capability;
use App\Models\User;
use App\Support\Capabilities;
use Illuminate\Contracts\Mail\Mailable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Mail;

/**
 * Delivers an owner digest the way the runtime can (#1225, M11 #1218).
 *
 * The two owner digests — expiring certificates, unpaid athletes — have
 * always been mail, queued for the worker. A desktop with no transport
 * (Capability::Email absent) would log that mail and the owner would never
 * see the one alert with consequences outside the software. There the same
 * digest becomes a `notifications` row: what the bell shows, what the
 * Electron shell turns into a native toast.
 *
 * One place decides, so neither command grows an if-branch and the mail path
 * — its queueing, its tests, its Mail::to mocks — stays byte-for-byte what it
 * was on the hosted profile.
 */
final class DeliverOwnerDigestAction
{
    public function execute(User $owner, Mailable $mail, Notification $inApp): void
    {
        if (Capabilities::has(Capability::Email)) {
            Mail::to($owner)->queue($mail);

            return;
        }

        $owner->notify($inApp);
    }
}
