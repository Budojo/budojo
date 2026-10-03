<?php

declare(strict_types=1);

use App\Actions\Sync\ReplayJournalAction;

/**
 * A form that requires a field on every save (#2113): what the replay left
 * out as the other device's goes again, at this database's value, when the
 * form refused the trimmed body; its second answer stands.
 */
describe('refill', function (): void {
    $left = ['starts_on' => '2026-12-23', 'ends_on' => '2026-12-27'];

    it('sends the form whole again when it refused the trimmed body: what was left out, at its values here', function () use ($left): void {
        expect(ReplayJournalAction::refill(422, $left))->toBe($left);
    });

    it('sends nothing again for a write that went through, was refused otherwise, or left nothing out', function () use ($left): void {
        expect(ReplayJournalAction::refill(200, $left))->toBe([])
            ->and(ReplayJournalAction::refill(403, $left))->toBe([])
            ->and(ReplayJournalAction::refill(422, []))->toBe([]);
    });
});

describe('asSent', function (): void {
    it('gives this database\'s value in the shape the entry sent its own', function (): void {
        expect(ReplayJournalAction::asSent('2026-12-27 00:00:00', '2026-12-26'))->toBe('2026-12-27')
            ->and(ReplayJournalAction::asSent('2026-12-27T00:00:00+00:00', '2026-12-26'))->toBe('2026-12-27')
            ->and(ReplayJournalAction::asSent('2026-12-27', '2026-12-26'))->toBe('2026-12-27')
            ->and(ReplayJournalAction::asSent('3', 2))->toBe(3)
            ->and(ReplayJournalAction::asSent('0', true))->toBeFalse()
            ->and(ReplayJournalAction::asSent('12.5', 1.0))->toBe(12.5)
            ->and(ReplayJournalAction::asSent('Natale', 'Vacanze'))->toBe('Natale')
            ->and(ReplayJournalAction::asSent(null, 'Vacanze'))->toBeNull();
    });
});
