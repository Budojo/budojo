<?php

declare(strict_types=1);

namespace App\Actions\Engagement;

/**
 * Weekly recap DTO (#960). Plain immutable record consumed by both
 * the SPA recap page (`/dashboard/me/recap/:isoWeek`) and the push
 * notification template. Keeping the shape outside the controller +
 * action lets the notification class read it without circular import.
 *
 * @phpstan-type PartnerRow array{first_name: string, last_name_initial: string}
 */
final class WeeklyRecapResult
{
    /**
     * @param  list<PartnerRow>  $partners
     */
    public function __construct(
        public readonly string $isoWeekStart,
        public readonly int $sessions,
        public readonly float $hours,
        public readonly array $partners,
    ) {
    }
}
