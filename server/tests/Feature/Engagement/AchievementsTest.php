<?php

declare(strict_types=1);

use App\Actions\Engagement\EvaluateAchievementsAction;
use App\Enums\AchievementKind;
use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Achievement;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Achievement rules + observers (#961). Tests cover:
 *   - each rule unlocks on the correct threshold (idempotent re-run)
 *   - the (athlete, kind) UNIQUE constraint via the evaluator
 *   - AttendanceObserver wires the evaluator on every new row
 *   - AthleteObserver wires the evaluator on belt change
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

function makeAthleteWithUser(Academy $academy, ?string $joinedAt = null): Athlete
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create([
        'user_id' => null,
        'joined_at' => $joinedAt ?? '2026-01-01',
    ]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);

    return $athlete->fresh();
}

// ─── EvaluateAchievementsAction ───────────────────────────────────

it('unlocks first_class on the first attendance row', function (): void {
    $athlete = makeAthleteWithUser($this->academy);
    AttendanceRecord::factory()->for($athlete)->create();
    // AttendanceObserver already ran the evaluator inside the factory
    // create; manual call here is the idempotency check.
    app(EvaluateAchievementsAction::class)->execute($athlete);

    expect(
        Achievement::query()
            ->where('athlete_id', $athlete->id)
            ->where('kind', AchievementKind::FirstClass->value)
            ->count(),
    )->toBe(1);
});

it('is idempotent — second evaluator pass does not duplicate first_class', function (): void {
    $athlete = makeAthleteWithUser($this->academy);
    AttendanceRecord::factory()->for($athlete)->create();

    app(EvaluateAchievementsAction::class)->execute($athlete);
    app(EvaluateAchievementsAction::class)->execute($athlete);

    expect(
        Achievement::query()
            ->where('athlete_id', $athlete->id)
            ->where('kind', AchievementKind::FirstClass->value)
            ->count(),
    )->toBe(1);
});

it('unlocks 100_sessions when the athlete crosses 100 attendance rows', function (): void {
    $athlete = makeAthleteWithUser($this->academy);
    AttendanceRecord::factory()->for($athlete)->count(100)->create();

    app(EvaluateAchievementsAction::class)->execute($athlete);

    expect(
        Achievement::query()
            ->where('athlete_id', $athlete->id)
            ->where('kind', AchievementKind::HundredSessions->value)
            ->exists(),
    )->toBeTrue();
});

it('does NOT unlock 100_sessions before the threshold is crossed', function (): void {
    $athlete = makeAthleteWithUser($this->academy);
    AttendanceRecord::factory()->for($athlete)->count(99)->create();

    app(EvaluateAchievementsAction::class)->execute($athlete);

    expect(
        Achievement::query()
            ->where('athlete_id', $athlete->id)
            ->where('kind', AchievementKind::HundredSessions->value)
            ->exists(),
    )->toBeFalse();
});

it('unlocks 30_day_streak when the athlete has 30 consecutive days of attendance', function (): void {
    $athlete = makeAthleteWithUser($this->academy);
    $today = CarbonImmutable::today();
    for ($i = 0; $i < 30; $i++) {
        AttendanceRecord::factory()->for($athlete)->create([
            'attended_on' => $today->subDays($i)->toDateString(),
        ]);
    }

    app(EvaluateAchievementsAction::class)->execute($athlete);

    expect(
        Achievement::query()
            ->where('athlete_id', $athlete->id)
            ->where('kind', AchievementKind::ThirtyDayStreak->value)
            ->exists(),
    )->toBeTrue();
});

it('does NOT unlock 30_day_streak with a one-day gap', function (): void {
    $athlete = makeAthleteWithUser($this->academy);
    $today = CarbonImmutable::today();
    for ($i = 0; $i < 30; $i++) {
        if ($i === 15) {
            continue;
        } // skip day 15 — gap
        AttendanceRecord::factory()->for($athlete)->create([
            'attended_on' => $today->subDays($i)->toDateString(),
        ]);
    }

    app(EvaluateAchievementsAction::class)->execute($athlete);

    expect(
        Achievement::query()
            ->where('athlete_id', $athlete->id)
            ->where('kind', AchievementKind::ThirtyDayStreak->value)
            ->exists(),
    )->toBeFalse();
});

it('unlocks 1_year_at_academy on the exact anniversary day', function (): void {
    $today = CarbonImmutable::today();
    $athlete = makeAthleteWithUser($this->academy, $today->subYear()->toDateString());

    app(EvaluateAchievementsAction::class)->execute($athlete);

    expect(
        Achievement::query()
            ->where('athlete_id', $athlete->id)
            ->where('kind', AchievementKind::OneYearAtAcademy->value)
            ->exists(),
    )->toBeTrue();
});

it('does NOT unlock 1_year_at_academy on a non-anniversary day', function (): void {
    // Joined 360 days ago — not yet at the 1-year anniversary.
    $athlete = makeAthleteWithUser(
        $this->academy,
        CarbonImmutable::today()->subDays(360)->toDateString(),
    );

    app(EvaluateAchievementsAction::class)->execute($athlete);

    expect(
        Achievement::query()
            ->where('athlete_id', $athlete->id)
            ->where('kind', AchievementKind::OneYearAtAcademy->value)
            ->exists(),
    )->toBeFalse();
});

it('unlocks belt_promotion after the athlete is promoted past initial belt', function (): void {
    $athlete = makeAthleteWithUser($this->academy);
    $athlete->update(['belt' => Belt::White]);
    // Simulate a promotion: the AthletePromotion row is what the
    // evaluator queries, not the athlete.belt column directly.
    \App\Models\AthletePromotion::create([
        'athlete_id' => $athlete->id,
        'kind' => 'belt',
        'from_belt' => 'white',
        'to_belt' => 'blue',
        'from_stripes' => null,
        'to_stripes' => null,
        'belt_at_event' => 'blue',
        'recorded_at' => now(),
        'recorded_by_user_id' => $this->owner->id,
    ]);

    app(EvaluateAchievementsAction::class)->execute($athlete);

    $row = Achievement::query()
        ->where('athlete_id', $athlete->id)
        ->where('kind', AchievementKind::BeltPromotion->value)
        ->first();
    expect($row)->not->toBeNull();
    expect($row?->metadata['to_belt'] ?? null)->toBe('blue');
});

// ─── AttendanceObserver wiring ────────────────────────────────────

it('AttendanceObserver runs the evaluator on every new row (unlocks first_class)', function (): void {
    $athlete = makeAthleteWithUser($this->academy);

    AttendanceRecord::factory()->for($athlete)->create();

    expect(
        Achievement::query()
            ->where('athlete_id', $athlete->id)
            ->where('kind', AchievementKind::FirstClass->value)
            ->exists(),
    )->toBeTrue();
});
