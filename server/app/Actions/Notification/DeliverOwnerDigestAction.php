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

        $stale = $this->staleBy($inApp, $owner);

        $owner->notify($inApp);

        if ($stale !== []) {
            $owner->notifications()->whereIn('id', $stale)->update(['archived_at' => now()]);
        }
    }

    /**
     * The inbox rows this digest makes stale (#1914), collected before it is
     * sent so the new row is never among them. Archived, not deleted.
     *
     * Only the unpaid digest, and only for its month or an earlier one: it
     * restates who has not paid, so last week's list is not today's. The
     * certificate and document digests do not restate anything — each lists
     * only what crossed a threshold that day — so a newer one says nothing
     * about the older, and hiding it would hide an alert still true.
     *
     * @return list<string>
     */
    private function staleBy(Notification $inApp, User $owner): array
    {
        $data = method_exists($inApp, 'toDatabase') ? $inApp->toDatabase($owner) : null;
        if (! \is_array($data) || ($data['kind'] ?? null) !== 'unpaid_athletes_digest') {
            return [];
        }
        $year = $data['year'] ?? null;
        $month = $data['month'] ?? null;
        if (! \is_int($year) || ! \is_int($month)) {
            return [];
        }

        /** @var list<string> $ids */
        $ids = $owner->notifications()
            ->whereNull('archived_at')
            ->where('data->kind', 'unpaid_athletes_digest')
            ->where(static fn ($q) => $q
                ->where('data->year', '<', $year)
                ->orWhere(static fn ($same) => $same->where('data->year', $year)->where('data->month', '<=', $month)))
            ->pluck('id')
            ->all();

        return $ids;
    }
}
