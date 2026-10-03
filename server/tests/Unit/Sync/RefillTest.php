<?php

declare(strict_types=1);

use App\Actions\Sync\ReplayJournalAction;

/**
 * A form that requires a field on every save (#2113): what the replay left
 * out as the other device's goes again, at this database's value, only when
 * the form refused for want of exactly that.
 */
describe('refill', function (): void {
    $left = ['starts_on' => '2026-12-23', 'ends_on' => '2026-12-27'];

    it('sends again the fields the form refused for want of', function () use ($left): void {
        $answer = ['message' => 'The ends on field is required.', 'errors' => ['ends_on' => ['The ends on field is required.']]];

        expect(ReplayJournalAction::refill(422, $answer, $left))->toBe(['ends_on' => '2026-12-27']);
    });

    it('lets a refusal for anything else stand', function () use ($left): void {
        $answer = ['errors' => ['ends_on' => ['required'], 'label' => ['The label may not be greater than 80 characters.']]];

        expect(ReplayJournalAction::refill(422, $answer, $left))->toBe([]);
    });

    it('sends nothing again for a write that went through, or was refused otherwise', function () use ($left): void {
        expect(ReplayJournalAction::refill(200, ['data' => []], $left))->toBe([])
            ->and(ReplayJournalAction::refill(403, ['message' => 'Forbidden'], $left))->toBe([])
            ->and(ReplayJournalAction::refill(422, ['errors' => ['ends_on' => ['required']]], []))->toBe([]);
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
