<?php

declare(strict_types=1);

use App\Actions\Promotion\GetAthleteProgressionAction;
use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;

/**
 * #1772 — how long an athlete has held their belt, and how many sessions
 * since their last stripe: the two numbers read before deciding whether
 * someone is due.
 */
beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;

    // The athlete's record begins long before the rows under test, so its
    // opening belt row (#1771) is never the latest one.
    $this->travelTo(CarbonImmutable::parse('2024-01-01 10:00'));
    $this->athlete = Athlete::factory()->for($this->academy)->create(['belt' => Belt::Blue, 'stripes' => 1]);
    $this->travelTo(CarbonImmutable::parse('2026-05-15 12:00'));
});

function progressionPromotion(Athlete $athlete, string $kind, string $at, int $userId): void
{
    AthletePromotion::factory()->create([
        'athlete_id' => $athlete->id,
        'kind' => $kind,
        'from_belt' => $kind === 'belt' ? Belt::White : null,
        'to_belt' => $kind === 'belt' ? Belt::Blue : null,
        'from_stripes' => 0,
        'to_stripes' => $kind === 'stripe' ? 1 : 0,
        'belt_at_event' => Belt::Blue,
        'recorded_at' => $at,
        'recorded_by_user_id' => $userId,
    ]);
}

function progressionDays(Athlete $athlete, array $days): void
{
    foreach ($days as $day) {
        AttendanceRecord::factory()->for($athlete)->on($day)->create();
    }
}

it('measures the belt and the last stripe from their latest rows, in days and sessions', function (): void {
    // An earlier belt with its own stripe: the latest rows win, not the first.
    progressionPromotion($this->athlete, 'belt', '2024-06-01 00:00:00', $this->owner->id);
    progressionPromotion($this->athlete, 'stripe', '2024-09-01 00:00:00', $this->owner->id);
    progressionPromotion($this->athlete, 'belt', '2025-03-01 18:42:00', $this->owner->id);
    progressionPromotion($this->athlete, 'stripe', '2026-01-10 00:00:00', $this->owner->id);
    // Before the belt, between belt and stripe, on the stripe day, after it.
    progressionDays($this->athlete, ['2025-02-20', '2025-03-01', '2025-06-01', '2026-01-10', '2026-03-03', '2026-05-14']);

    $p = app(GetAthleteProgressionAction::class)->execute($this->athlete);

    expect($p['belt_since'])->toBe('2025-03-01')
        ->and($p['days_at_belt'])->toBe(440)
        ->and($p['months_at_belt'])->toBe(14)
        // The belt day's own session counts: `recorded_at` carries 18:42.
        ->and($p['sessions_at_belt'])->toBe(5)
        ->and($p['stripe_since'])->toBe('2026-01-10')
        ->and($p['days_since_stripe'])->toBe(125)
        ->and($p['sessions_since_stripe'])->toBe(3);
});

it('says there is no stripe on this belt when the only stripe predates it', function (): void {
    progressionPromotion($this->athlete, 'stripe', '2024-11-02 00:00:00', $this->owner->id);
    progressionPromotion($this->athlete, 'belt', '2025-03-01 00:00:00', $this->owner->id);

    $p = app(GetAthleteProgressionAction::class)->execute($this->athlete);

    expect($p['belt_since'])->toBe('2025-03-01')
        ->and($p['stripe_since'])->toBeNull()
        ->and($p['days_since_stripe'])->toBeNull()
        ->and($p['sessions_since_stripe'])->toBeNull();
});

it('counts a day once, and never a corrected-away presence', function (): void {
    progressionPromotion($this->athlete, 'belt', '2026-05-01 00:00:00', $this->owner->id);
    progressionDays($this->athlete, ['2026-05-04']);
    AttendanceRecord::factory()->for($this->athlete)->on('2026-05-06')->create()->delete();

    $p = app(GetAthleteProgressionAction::class)->execute($this->athlete);

    expect($p['sessions_at_belt'])->toBe(1);
});

it('reads the opening belt row when no promotion was ever recorded', function (): void {
    // What CreateAthleteAction writes for a new or imported athlete (#1771).
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => null,
        'to_belt' => Belt::Blue,
        'from_stripes' => null,
        'to_stripes' => null,
        'belt_at_event' => Belt::Blue,
        'recorded_at' => '2024-01-01 10:00:00',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $p = app(GetAthleteProgressionAction::class)->execute($this->athlete);

    expect($p['belt_since'])->toBe('2024-01-01')
        ->and($p['months_at_belt'])->toBe(28)
        ->and($p['stripe_since'])->toBeNull();
});

it('does not fall back to the joining date when there is no belt row', function (): void {
    $p = app(GetAthleteProgressionAction::class)->execute($this->athlete);

    expect($p['belt_since'])->toBeNull()
        ->and($p['days_at_belt'])->toBeNull()
        ->and($p['months_at_belt'])->toBeNull()
        ->and($p['sessions_at_belt'])->toBeNull()
        ->and($p['stripe_since'])->toBeNull();
});

it('returns the progression beside the timeline, leaving the pagination meta alone', function (): void {
    progressionPromotion($this->athlete, 'belt', '2025-03-01 00:00:00', $this->owner->id);
    AthletePromotion::factory()->count(24)->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'stripe',
        'from_stripes' => 0,
        'to_stripes' => 1,
        'belt_at_event' => Belt::White,
        'recorded_at' => '2024-06-01 00:00:00',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $response = $this->actingAs($this->owner)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/promotions?page=2")
        ->assertOk();

    expect($response->json('meta.current_page'))->toBe(2)
        ->and($response->json('meta.last_page'))->toBe(2)
        ->and($response->json('progression.belt_since'))->toBe('2025-03-01')
        ->and($response->json('progression.stripe_since'))->toBeNull();
});
